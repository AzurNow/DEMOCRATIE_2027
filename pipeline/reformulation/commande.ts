/**
 * La commande `pnpm reformuler`, composée ici et injectable : `outils/reformuler.ts` ne fait que
 * lui passer `process.argv`, l'environnement, `fetch` et l'horloge système.
 *
 *   pnpm reformuler --plafond=<n> [--question=<id>]                 mode réel (Mistral)
 *   pnpm reformuler --simule [--sortie=<chemin>] [--question=<id>]  mode simulé, sans réseau
 *
 * Mode réel : `MISTRAL_API_KEY` et `--plafond` sont obligatoires, `config/reformulation.json` est
 * complet ; sinon la commande refuse de partir, avant toute lecture de données et tout appel.
 * Écrit seulement sous `<racine>/staging/formulations/`. La clé n'est écrite dans aucun fichier et
 * masquée dans tout message imprimé.
 *
 * Mode simulé : ni clé, ni configuration ; écrit sous `--sortie`, ou dans un répertoire temporaire
 * neuf, jamais sous `staging/`, `data/` ni `runs/` du dépôt (`gardes-sortie.ts`) — une proposition
 * simulée y serait relue comme une vraie. `--plafond` y est facultatif.
 *
 * `--racine=<chemin>` (tests) : la racine où lire `data/`, `config/`, `validation/formulations/`,
 * et, en mode réel, où écrire `staging/formulations/`. Par défaut, le dépôt.
 *
 * Délai : en mode réel, chaque appel est abandonné au-delà de `delai_abandon_ms`
 * (`config/reformulation.json`) et compté échec de transport. Le mode simulé n'a pas de délai.
 *
 * Code de sortie :
 * - 0 : la commande est allée au bout et chaque appel fait a reçu une réponse HTTP 2xx (acceptée ou
 *   rejetée par le contrôle) ;
 * - 1 : refus de partir ou erreur, avant ou pendant les appels ;
 * - 2 : la commande est allée au bout, bilan imprimé en entier, mais au moins un appel a fini en
 *   échec de transport (délai dépassé compris) ou en échec HTTP : des questions restent sans
 *   proposition lisible et seront rappelées au prochain passage ; ou bien une réponse reçue n'a pas
 *   été stockée (octets gardés sous `octets-recus/`), dans ce passage ou un précédent : la question
 *   attend l'opérateur et ne sera pas rappelée (D55 (5)).
 */

import { join, resolve } from "node:path";
import { analyserArguments, drapeau, OptionsInconnues, texte } from "../../outils/arguments.ts";
import type { Arguments } from "../../outils/arguments.ts";
import { exigerHorsDesZonesProtegees, SimuleSousZoneProtegee } from "../gardes-sortie.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import { lireConfiguration, ConfigurationRefusee } from "./configuration.ts";
import type { DemandeReformulation } from "./demande.ts";
import type { EditeurReformulation } from "./editeur.ts";
import { adaptateurMistral } from "./editeur-mistral.ts";
import { choixParEmpreinte, editeurSimule } from "./editeur-simule.ts";
import { dispositionEntrees, EntreeAbsente, lireDonnees, tachesDe } from "./entrees.ts";
import type { Tache } from "./entrees.ts";
import { executer, trier } from "./executer.ts";
import type { Bilan, Triage } from "./executer.ts";
import { chargerPromptReformulation } from "./prompt.ts";
import { FormulationValideeIllisible, JournalRefusIllisible, lireRefus, validee } from "./reprise.ts";
import { transportFetch } from "./transport-fetch.ts";
import type { Envoi } from "./transport-fetch.ts";

export const OPTIONS_REFORMULER: readonly string[] = ["simule", "question", "plafond", "racine", "sortie"];
export const VARIABLE_CLE = "MISTRAL_API_KEY";

export interface Dependances {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly envoi: Envoi;
  readonly maintenant: () => number;
  /** L'attente de la minuterie du délai d'abandon : `horlogeSysteme.attendre` en réel. */
  readonly attendre: Horloge["attendre"];
  readonly imprimer: (texte: string) => void;
  /** Un répertoire temporaire neuf, pour la sortie par défaut du mode simulé. */
  readonly temporaire: () => string;
  /** La racine du dépôt : racine par défaut, et `staging/`, `data/`, `runs/` interdits au mode simulé. */
  readonly depot: string;
}

/** Un refus de partir, dit sans pile d'appels : la commande s'arrête avant tout appel. */
export class RefusDePartir extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusDePartir";
  }
}

const REFUS_ATTENDUS = [
  RefusDePartir,
  EntreeAbsente,
  ConfigurationRefusee,
  OptionsInconnues,
  FormulationValideeIllisible,
  JournalRefusIllisible,
  SimuleSousZoneProtegee,
];

/* ------------------------------------------------------------------- modes */

interface Mode {
  readonly nom: "réel" | "simulé";
  readonly staging: string;
  readonly plafond: number | null;
  /** `null` : aucun délai, mode simulé seulement. */
  readonly delai_abandon_ms: number | null;
  readonly editeur: (texte_prompt: string, demandes: readonly DemandeReformulation[]) => EditeurReformulation;
}

function plafondDe(table: Arguments): number | null {
  const brut = table.get("plafond");
  if (brut === undefined) return null;
  const plafond = Number(brut);
  if (!Number.isSafeInteger(plafond) || plafond < 1) throw new RefusDePartir(`--plafond=${brut} : un entier >= 1 est attendu.`);
  return plafond;
}

function modeReel(table: Arguments, racine: string, dependances: Dependances): Mode {
  if (table.has("sortie")) throw new RefusDePartir(`--sortie est réservé au mode simulé : le mode réel écrit sous ${join(racine, "staging", "formulations")}.`);
  const plafond = plafondDe(table);
  if (plafond === null) throw new RefusDePartir("--plafond=<n> est obligatoire en mode réel : il borne le nombre d'appels payants.");
  const cle = dependances.env[VARIABLE_CLE];
  if (cle === undefined || cle.length === 0) throw new RefusDePartir(`${VARIABLE_CLE} absente de l'environnement : aucun appel réel sans clé.`);
  const configuration = lireConfiguration(join(racine, "config", "reformulation.json"));
  return {
    nom: "réel",
    staging: join(racine, "staging", "formulations"),
    plafond,
    delai_abandon_ms: configuration.delai_abandon_ms,
    editeur: () => ({ adaptateur: adaptateurMistral(configuration, cle), transport: transportFetch(dependances.envoi) }),
  };
}

function modeSimule(table: Arguments, dependances: Dependances): Mode {
  const demandee = table.get("sortie");
  const staging = demandee === undefined ? dependances.temporaire() : resolve(demandee);
  exigerHorsDesZonesProtegees(staging, dependances.depot);
  return {
    nom: "simulé",
    staging,
    plafond: plafondDe(table),
    delai_abandon_ms: null,
    editeur: (texte_prompt, demandes) => editeurSimule(texte_prompt, demandes, choixParEmpreinte),
  };
}

/* ----------------------------------------------------------------- entrées */

function filtrer(taches: readonly Tache[], question: string | undefined): readonly Tache[] {
  if (question === undefined) return taches;
  const visees = taches.filter((tache) => tache.question.id === question);
  if (visees.length === 0) throw new RefusDePartir(`--question=${question} : aucune question engendrée ne porte cet identifiant.`);
  return visees;
}

function trierDepuis(taches: readonly Tache[], racine: string, staging: string): Triage {
  const formulations = join(racine, "data", "formulations");
  const refus = lireRefus(join(racine, "validation", "formulations", "refus.jsonl"));
  return trier(taches, staging, { validee: (question_id) => validee(formulations, question_id), refus });
}

/* ------------------------------------------------------------------- bilan */

function lignesBilan(mode: Mode, total: number, bilan: Bilan): readonly string[] {
  const rejetees = [...bilan.rejetees.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const nombre_rejetees = rejetees.reduce((somme, [, n]) => somme + n, 0);
  const detail = rejetees.map(([motif, n]) => `${motif} ${n}`).join(", ");
  return [
    `Reformulation, mode ${mode.nom} — propositions sous ${mode.staging}`,
    `Questions : ${total} ; sautées, déjà validées ${bilan.sautees_deja_validees}, déjà acceptées ${bilan.sautees_deja_acceptees}`,
    `Appels faits : ${bilan.appels} (${mode.plafond === null ? "sans plafond" : `plafond ${mode.plafond}`})`,
    `  acceptées : ${bilan.acceptees}`,
    `  rejetées : ${nombre_rejetees}${detail.length === 0 ? "" : ` (${detail})`}`,
    `  échecs HTTP : ${bilan.echecs_http}`,
    `  échecs de transport : ${bilan.echecs_transport}`,
    `  reçues et non stockées (octets gardés) : ${bilan.recues_non_stockees}`,
    `Questions non appelées, plafond atteint : ${bilan.non_appelees_plafond}`,
    `Questions non appelées, en attente de l'opérateur (réponse reçue non stockée) : ${bilan.en_attente_operateur}`,
  ];
}

/* ---------------------------------------------------------------- commande */

async function derouler(argv: readonly string[], dependances: Dependances, imprimer: (texte: string) => void): Promise<Bilan> {
  const table = analyserArguments(argv, OPTIONS_REFORMULER);
  const racine = resolve(texte(table, "racine", dependances.depot));
  const mode = drapeau(table, "simule") ? modeSimule(table, dependances) : modeReel(table, racine, dependances);
  const donnees = lireDonnees(dispositionEntrees(racine));
  const taches = filtrer(tachesDe(donnees), table.get("question"));
  const triage = trierDepuis(taches, racine, mode.staging);
  const texte_prompt = chargerPromptReformulation();
  const editeur = mode.editeur(texte_prompt, triage.a_appeler.map((tache) => tache.demande));
  const bilan = await executer(triage, {
    editeur,
    texte_prompt,
    perimetre: donnees.candidats,
    staging: mode.staging,
    plafond: mode.plafond,
    maintenant: dependances.maintenant,
    delai_abandon_ms: mode.delai_abandon_ms,
    attendre: dependances.attendre,
    signaler: imprimer,
  });
  lignesBilan(mode, taches.length, bilan).forEach(imprimer);
  return bilan;
}

/** Bilan complet, mais au moins un appel sans réponse HTTP 2xx, ou une réponse non stockée (voir l'en-tête). */
const CODE_ECHECS_APPEL = 2;

function codeDuBilan(bilan: Bilan): number {
  const echecs = [bilan.echecs_transport, bilan.echecs_http, bilan.recues_non_stockees, bilan.en_attente_operateur];
  return echecs.some((nombre) => nombre > 0) ? CODE_ECHECS_APPEL : 0;
}

/** Retire la clé de tout texte imprimé, quelle que soit son origine. */
export function masquer(texte_brut: string, cle: string | undefined): string {
  if (cle === undefined || cle.length === 0) return texte_brut;
  return texte_brut.replaceAll(cle, "[clé masquée]");
}

function texteErreur(erreur: unknown): string {
  if (!(erreur instanceof Error)) return String(erreur);
  const attendu = REFUS_ATTENDUS.some((classe) => erreur instanceof classe);
  return attendu || erreur.stack === undefined ? erreur.message : erreur.stack;
}

/** Rend le code de sortie de l'en-tête : 0, 1 (refus ou erreur) ou 2 (échecs de transport ou HTTP). */
export async function commandeReformuler(argv: readonly string[], dependances: Dependances): Promise<number> {
  const imprimer = (ligne: string): void => dependances.imprimer(`${masquer(ligne, dependances.env[VARIABLE_CLE])}\n`);
  try {
    return codeDuBilan(await derouler(argv, dependances, imprimer));
  } catch (erreur) {
    imprimer(texteErreur(erreur));
    return 1;
  }
}
