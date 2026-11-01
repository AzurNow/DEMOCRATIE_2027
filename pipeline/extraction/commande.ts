/**
 * La commande `pnpm extraire`, composée ici et injectable : `outils/extraire.ts` ne fait que lui
 * passer `process.argv`, l'environnement, `fetch`, l'horloge système, le générateur d'ULID et Git.
 *
 *   ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm extraire --plafond=<n> [--source=<cle_source>/<sha256>]
 *   pnpm extraire --simule [--sortie=<chemin>] [--source=<cle_source>/<sha256>]
 *
 * Lit les entrées écrites par `pnpm extraction:entrees` sous `<racine>/staging/entrees-extraction/`
 * et, pour chacune, fait l'extraction double (§4, décision D52) : `executer.ts`.
 *
 * Mode réel : `--plafond` obligatoire, `config/extraction.json` complète, la clé d'API de chaque
 * éditeur configuré dans l'environnement (`VARIABLES_CLES`), et un arbre Git propre hors de
 * `staging/` (le commit courant est inscrit dans chaque item : il doit décrire le code qui extrait) ;
 * sinon refus de partir, avant toute lecture d'entrée et tout appel. Écrit sous
 * `<racine>/staging/`. Les clés ne sont écrites dans aucun fichier et sont masquées dans tout message.
 *
 * Mode simulé : ni clé, ni configuration ; les deux éditeurs simulés (`editeur-simule.ts`), dans
 * l'ordre Anthropic puis Mistral, sans réseau ni délai. Écrit sous `--sortie`, ou dans un
 * répertoire temporaire neuf, jamais sous `staging/`, `data/` ni `runs/` du dépôt
 * (`gardes-sortie.ts`) — un item simulé y serait relu comme un vrai. `--plafond` y est facultatif ;
 * un arbre sale y est admis.
 *
 * `--racine=<chemin>` (tests) : où lire `config/`, `staging/` et l'épinglage des extracteurs de
 * texte en service (`pipeline/collecte/textes/epinglage.json`, D56 (3)). Par défaut, le dépôt. Un
 * épinglage absent ou illisible arrête la commande avant toute source (code 1).
 *
 * Code de sortie :
 * - 0 : chaque source est traitée (extraite ou refusée, D53 (2)) ou l'était déjà ;
 * - 1 : refus de partir ou erreur ;
 * - 2 : allée au bout, mais au moins une source est restée non traitée : incohérence d'entrée nommée,
 *   ou échec de transport (délai compris) ; elle sera reprise au prochain lancement ;
 * - 3 : plafond atteint : un appel nécessaire a été refusé, la commande s'est arrêtée, bilan imprimé.
 */

import { resolve, join } from "node:path";
import { analyserArguments, drapeau, OptionsInconnues, texte } from "../../outils/arguments.ts";
import type { Arguments } from "../../outils/arguments.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import { exigerHorsDesZonesProtegees, SimuleSousZoneProtegee } from "../gardes-sortie.ts";
import { masquer, RefusDePartir } from "../reformulation/commande.ts";
import { transportFetch, type Envoi } from "../reformulation/transport-fetch.ts";
import type { ConfigurationExtraction } from "./configuration.ts";
import {
  ConfigurationEditeursRefusee,
  construireAdaptateurs,
  lireConfigurationEditeurs,
  type ConfigurationEditeurs,
} from "./configuration-editeurs.ts";
import { transportSousDelai } from "./delai.ts";
import { EDITEURS, type EditeurExtraction, type NomEditeur } from "./editeur.ts";
import { editeurSimule, MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL, type Choix } from "./editeur-simule.ts";
import { listerEntrees } from "./entrees.ts";
import { EpinglageEnServiceIllisible, lireEpinglageEnService } from "./epinglage-en-service.ts";
import { executer, type Bilan, type ContexteExtraction } from "./executer.ts";
import { chargerPromptExtraction, VERSION_PROMPT_EXTRACTION, type VariablesExtraction } from "./prompt.ts";

export const OPTIONS_EXTRAIRE: readonly string[] = ["simule", "source", "plafond", "racine", "sortie"];

/** La variable d'environnement de la clé de chaque éditeur : une table, aucun `if` sur un éditeur. */
export const VARIABLES_CLES: Readonly<Record<NomEditeur, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

export interface Dependances {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly envoi: Envoi;
  /** Millisecondes depuis l'époque Unix. */
  readonly maintenant: () => number;
  readonly nouvelUlid: () => string;
  /** L'attente de la minuterie du délai d'abandon : `horlogeSysteme.attendre` en réel. */
  readonly attendre: Horloge["attendre"];
  readonly imprimer: (texte: string) => void;
  /** Un répertoire temporaire neuf, pour la sortie par défaut du mode simulé. */
  readonly temporaire: () => string;
  /** La racine du dépôt : racine par défaut, et `staging/`, `data/`, `runs/` interdits au mode simulé. */
  readonly depot: string;
  /** Le commit HEAD du code qui extrait. */
  readonly commit: () => string;
  /** Vrai si l'arbre Git est propre hors de `staging/` (exigé en mode réel). */
  readonly arbreDuCodePropre: () => boolean;
  /** L'issue simulée de chaque demande, par enveloppe : `choixParEmpreinte` hors des tests. */
  readonly choixSimule: (enveloppe: NomEditeur) => Choix;
}

const REFUS_ATTENDUS = [RefusDePartir, ConfigurationEditeursRefusee, OptionsInconnues, SimuleSousZoneProtegee, EpinglageEnServiceIllisible];

/* ------------------------------------------------------------------- modes */

interface Mode {
  readonly nom: "réel" | "simulé";
  readonly sortie: string;
  readonly plafond: number | null;
  readonly configuration: ConfigurationExtraction;
  readonly editeurs: (texte_prompt: string) => ContexteExtraction["editeurs"];
}

function plafondDe(table: Arguments): number | null {
  const brut = table.get("plafond");
  if (brut === undefined) return null;
  const plafond = Number(brut);
  if (!Number.isSafeInteger(plafond) || plafond < 1) throw new RefusDePartir(`--plafond=${brut} : un entier >= 1 est attendu.`);
  return plafond;
}

function cleDe(env: Dependances["env"]): (editeur: NomEditeur) => string {
  return (editeur) => {
    const cle = env[VARIABLES_CLES[editeur]];
    if (cle === undefined || cle.length === 0) throw new RefusDePartir(`${VARIABLES_CLES[editeur]} absente de l'environnement : aucun appel réel sans clé.`);
    return cle;
  };
}

function editeursReels(configuration: ConfigurationEditeurs, dependances: Dependances): readonly [EditeurExtraction, EditeurExtraction] {
  const [adaptateurA, adaptateurB] = construireAdaptateurs(configuration, cleDe(dependances.env));
  const [extracteurA, extracteurB] = configuration.extracteurs;
  const transport = (delai_ms: number) => transportSousDelai(transportFetch(dependances.envoi), delai_ms, dependances.attendre);
  return [
    { adaptateur: adaptateurA, transport: transport(extracteurA.reglages.delai_abandon_ms) },
    { adaptateur: adaptateurB, transport: transport(extracteurB.reglages.delai_abandon_ms) },
  ];
}

function modeReel(table: Arguments, racine: string, dependances: Dependances): Mode {
  const staging = join(racine, "staging");
  if (table.has("sortie")) throw new RefusDePartir(`--sortie est réservé au mode simulé : le mode réel écrit sous ${staging}.`);
  const plafond = plafondDe(table);
  if (plafond === null) throw new RefusDePartir("--plafond=<n> est obligatoire en mode réel : il borne le nombre d'appels payants.");
  const configuration = lireConfigurationEditeurs(join(racine, "config", "extraction.json"));
  const editeurs = editeursReels(configuration, dependances);
  if (!dependances.arbreDuCodePropre()) {
    throw new RefusDePartir(
      "Arbre Git non propre hors de staging/ : le commit courant est inscrit dans chaque item extrait, et il ne décrirait pas le code qui extrait. Commitez ou remisez, puis relancez.",
    );
  }
  return { nom: "réel", sortie: staging, plafond, configuration: configuration.extraction, editeurs: () => () => editeurs };
}

/** L'ordre simulé : Anthropic puis Mistral, comme `config/extraction.json`. */
const ENVELOPPES_SIMULEES: readonly [NomEditeur, NomEditeur] = [EDITEURS[0], EDITEURS[1]];

function modeSimule(table: Arguments, dependances: Dependances): Mode {
  const demandee = table.get("sortie");
  const sortie = demandee === undefined ? dependances.temporaire() : resolve(demandee);
  exigerHorsDesZonesProtegees(sortie, dependances.depot);
  const [premiere, seconde] = ENVELOPPES_SIMULEES;
  const simule = (texte_prompt: string, enveloppe: NomEditeur, demande: VariablesExtraction): EditeurExtraction =>
    editeurSimule(enveloppe, texte_prompt, [demande], dependances.choixSimule(enveloppe));
  return {
    nom: "simulé",
    sortie,
    plafond: plafondDe(table),
    configuration: { modeles: [MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL], version_prompt: VERSION_PROMPT_EXTRACTION },
    editeurs: (texte_prompt) => (demande) => [simule(texte_prompt, premiere, demande), simule(texte_prompt, seconde, demande)],
  };
}

/* ----------------------------------------------------------------- entrées */

function filtrer(cles: readonly string[], source: string | undefined): readonly string[] {
  if (source === undefined) return cles;
  if (!cles.includes(source)) throw new RefusDePartir(`--source=${source} : aucune entrée d'extraction sous ce nom (lancer pnpm extraction:entrees).`);
  return [source];
}

/* ------------------------------------------------------------------- bilan */

function lignesBilan(mode: Mode, bilan: Bilan): readonly string[] {
  return [
    `Extraction, mode ${mode.nom} — sorties sous ${mode.sortie}`,
    `Sources : ${bilan.sources} ; sautées (journal présent) ${bilan.sautees}`,
    `  extraites : ${bilan.extraites} (${bilan.items} item(s), ${bilan.mesures} mesure(s))`,
    `  refusées (D53 (2)) : ${bilan.refusees}`,
    `  non traitées, incohérence d'entrée : ${bilan.incoherentes}`,
    `  non traitées, échec de transport : ${bilan.echecs_transport}`,
    `Appels faits : ${bilan.appels} (${mode.plafond === null ? "sans plafond" : `plafond ${mode.plafond}`}) ; réponses gardées réutilisées : ${bilan.reutilisees}`,
    ...(bilan.plafond_atteint ? ["Plafond atteint : la commande s'est arrêtée, les sources suivantes n'ont pas été examinées."] : []),
  ];
}

export const CODE_SOURCES_NON_TRAITEES = 2;
export const CODE_PLAFOND_ATTEINT = 3;

function codeDuBilan(bilan: Bilan): number {
  if (bilan.plafond_atteint) return CODE_PLAFOND_ATTEINT;
  return bilan.incoherentes > 0 || bilan.echecs_transport > 0 ? CODE_SOURCES_NON_TRAITEES : 0;
}

/* ---------------------------------------------------------------- commande */

async function derouler(argv: readonly string[], dependances: Dependances, imprimer: (ligne: string) => void): Promise<Bilan> {
  const table = analyserArguments(argv, OPTIONS_EXTRAIRE);
  const racine = resolve(texte(table, "racine", dependances.depot));
  const mode = drapeau(table, "simule") ? modeSimule(table, dependances) : modeReel(table, racine, dependances);
  const staging = join(racine, "staging");
  const epinglage = lireEpinglageEnService(racine);
  const cles = filtrer(listerEntrees(staging), table.get("source"));
  const texte_prompt = chargerPromptExtraction();
  const bilan = await executer(cles, {
    staging,
    epinglage,
    sortie: mode.sortie,
    texte_prompt,
    configuration: mode.configuration,
    editeurs: mode.editeurs(texte_prompt),
    plafond: mode.plafond,
    commit: dependances.commit(),
    maintenant: dependances.maintenant,
    nouvelUlid: dependances.nouvelUlid,
    signaler: imprimer,
  });
  lignesBilan(mode, bilan).forEach(imprimer);
  return bilan;
}

function masquerToutes(ligne: string, env: Dependances["env"]): string {
  return Object.values(VARIABLES_CLES).reduce((texte_masque, variable) => masquer(texte_masque, env[variable]), ligne);
}

function texteErreur(erreur: unknown): string {
  if (!(erreur instanceof Error)) return String(erreur);
  const attendu = REFUS_ATTENDUS.some((classe) => erreur instanceof classe);
  return attendu || erreur.stack === undefined ? erreur.message : erreur.stack;
}

/** Rend le code de sortie de l'en-tête : 0, 1, 2 ou 3. */
export async function commandeExtraire(argv: readonly string[], dependances: Dependances): Promise<number> {
  const imprimer = (ligne: string): void => dependances.imprimer(`${masquerToutes(ligne, dependances.env)}\n`);
  try {
    return codeDuBilan(await derouler(argv, dependances, imprimer));
  } catch (erreur) {
    imprimer(texteErreur(erreur));
    return 1;
  }
}
