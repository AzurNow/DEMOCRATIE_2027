/**
 * `pnpm mesures` — le registre des corrections de thème, côté auteur.
 *
 * Le thème appartient à la mesure, référent partagé entre candidats : un annotateur ne le
 * corrige pas depuis l'écran, il **demande** sa correction (§4, « Correction de thème »).
 * L'auteur tranche, et sa décision est tracée ici, dans un registre publié en ajout seul.
 *
 * Sans argument, la commande **liste** les demandes restées sans décision, avec leur ancienneté,
 * et n'écrit rien. L'écoulement du temps ne vaut jamais refus : l'âge est là pour que l'auteur
 * tranche, pas pour qu'une demande expire.
 *
 *   pnpm mesures
 *   pnpm mesures --mesure=<id> --theme=<theme> --decision=acceptee --ecrire
 *   pnpm mesures --mesure=<id> --theme=<theme> --decision=refusee --motif="..." --ecrire
 *   pnpm mesures --renvoyer=<id> [--ecrire]
 *   pnpm mesures --relire=<mesure> [--date=AAAA-MM-JJ] [--ecrire]
 *   pnpm mesures --rattacher=<item> --a=<mesure> [--date=AAAA-MM-JJ] [--ecrire]
 *
 * La commande n'écrit jamais dans `data/`. Accepter une demande ne modifie pas la mesure : c'est
 * une décision, pas une correction. La mesure se corrige en amont, dans le pipeline, et
 * `pnpm promote` refuse de promouvoir tant que les deux ne concordent pas.
 *
 * Une fois la mesure corrigée (nouvelle version), `--renvoyer` renvoie en attente les autres items
 * de la mesure, jugés contre l'ancien thème (protocole 0.13, §4), détaillé dans `renvoi-mesure.ts`.
 *
 * Décision D53 (1) : `--relire` imprime en entier le contenu actuel d'une mesure de
 * `staging/mesures/` (libellé, thème, fictive, formulation canonique, alias, origine fictive,
 * vérification de fictivité ; un champ absent est dit absent) et son empreinte de relecture,
 * puis, avec `--ecrire`, inscrit cette relecture au registre publié en ajout seul
 * `validation/mesures/relectures.json`, sans lequel `pnpm promote` refuse d'écrire la mesure
 * (`sans_relecture`). Elle ne réécrit jamais la mesure : une formulation à reprendre s'édite à la
 * main en staging, avant la relecture. `--rattacher` rattache un item de staging à une autre
 * mesure existante (`rattachement-mesure.ts`), de même caractère fictif que l'item (F ⇔ fictive).
 * Avec `--renvoyer`, ce sont les seules écritures de la commande dans `staging/`.
 *
 * Les quatre modes (`--mesure`, `--renvoyer`, `--relire`, `--rattacher`) s'excluent : en demander
 * deux est refusé avant toute lecture.
 */

import { resolve } from "node:path";
import { ecriturePermise } from "./garde-fous-git.ts";
import { IntrouvableEnStaging, RattachementInacheve, rattacher, trouverEnStaging } from "./rattachement-mesure.ts";
import { estRefusAttendu, renvoyer } from "./renvoi-mesure.ts";
import { EntreeRattachementInvalide, RattachementRefuse } from "../validation/domaine/rattachements-item.ts";
import {
  EntreeRelectureInvalide,
  mesureRelue,
  relectureDe,
  validerEntreeRelecture,
} from "../validation/domaine/relectures-mesure.ts";
import { RegistreRattachementsIllisible } from "../validation/io/rattachements-fichier.ts";
import { RegistreModifieDepuisLecture } from "../validation/io/registre-ajout-seul.ts";
import { ajouterRelecture, cheminRelectures, lireRelectures, RegistreRelecturesIllisible } from "../validation/io/relectures-fichier.ts";
import { ItemStagingModifie } from "../validation/io/staging-renvoi.ts";
import { analyserArguments, drapeau, obligatoire, texte, type Arguments } from "./arguments.ts";
import {
  ancienneteEnJours,
  decisionApplicable,
  validerEntreeRegistre,
  type DecisionCorrectionMesure,
  type RegistreCorrectionsMesure,
  type SensDecisionMesure,
} from "../validation/domaine/corrections-mesure.ts";
import type { EtatAnnotateur } from "../validation/domaine/journal.ts";
import { lotsApresSupersession } from "../validation/domaine/lot.ts";
import type { Correction, Lot, Mesure } from "../validation/domaine/types.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { ajouterAuRegistre, cheminRegistre, lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging, mesureDe, type Staging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

const OPTIONS: readonly string[] = [
  "racine",
  "ecrire",
  "staging",
  "lots",
  "decisions",
  "mesures",
  "data",
  "mesure",
  "renvoyer",
  "theme",
  "date",
  "decision",
  "motif",
  "relire",
  "rattacher",
  "a",
];

interface Options {
  readonly ecrire: boolean;
  /** Dépôt dont l'arbre doit être propre et dont HEAD est inscrit par `--renvoyer --ecrire`. */
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  /** `data/items/`, lu seulement : un item publié n'est pas renvoyé par `--renvoyer`. */
  readonly data: string;
  /** Mesure visée par une décision à enregistrer. Chaîne vide : simple listage. */
  readonly mesure: string;
  /** Mesure dont les items sont à renvoyer en attente. Chaîne vide : pas de renvoi. */
  readonly renvoyer: string;
  /** Mesure de staging dont le contenu actuel est relu. Chaîne vide : pas de relecture. */
  readonly relire: string;
  /** Item de staging à rattacher à la mesure `a`. Chaîne vide : pas de rattachement. */
  readonly rattacher: string;
  /** Mesure cible d'un rattachement ; n'a de sens qu'avec `rattacher`. */
  readonly a: string;
}

function lireOptions(table: Arguments): Options {
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return {
    ecrire: drapeau(table, "ecrire"),
    racine,
    staging: texte(table, "staging", resolve(racine, "staging")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    decisions: texte(table, "decisions", resolve(racine, "validation/decisions")),
    mesures: texte(table, "mesures", resolve(racine, "validation/mesures")),
    data: texte(table, "data", resolve(racine, "data/items")),
    mesure: texte(table, "mesure", ""),
    renvoyer: texte(table, "renvoyer", ""),
    relire: texte(table, "relire", ""),
    rattacher: texte(table, "rattacher", ""),
    a: texte(table, "a", ""),
  };
}

/* ------------------------------------------------------------------- modes exclusifs */

class ArgumentsIncompatibles extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentsIncompatibles";
  }
}

const MODES = ["mesure", "renvoyer", "relire", "rattacher"] as const;

/** Un seul mode par appel ; `--a` sans `--rattacher` n'est jamais ignoré. Contrôlé avant toute lecture. */
function verifierModeUnique(options: Options): void {
  const demandes = MODES.filter((mode) => options[mode].length > 0);
  if (demandes.length > 1) {
    throw new ArgumentsIncompatibles(
      `Options incompatibles : ${demandes.map((mode) => `--${mode}`).join(" et ")}. Une seule opération par appel ; rien n'est lu ni écrit.`,
    );
  }
  if (options.a.length > 0 && options.rattacher.length === 0) {
    throw new ArgumentsIncompatibles("--a n'a de sens qu'avec --rattacher=<item> ; rien n'est lu ni écrit.");
  }
}

function dateDuJour(table: Arguments): string {
  return texte(table, "date", instantLocal(new Date()).slice(0, 10));
}

/* ------------------------------------------------- demandes restées sans décision */

interface Demande {
  readonly item_id: string;
  readonly lot_id: string;
  readonly mesure: Mesure;
  readonly correction: Correction;
  readonly depuis: string;
  readonly anciennete_jours: number;
}

function demandesSansDecision(options: Options, instant: string): readonly Demande[] {
  const staging = chargerStaging(options.staging);
  const registre = lireRegistre(options.mesures);
  const demandes: Demande[] = [];
  for (const effectif of lotsApresSupersession(lireLots(options.lots))) {
    const etats = etatsDuLot(options.decisions, effectif.lot);
    for (const reference of effectif.items) {
      demandes.push(...demandesDeItem(effectif.lot, reference.item_id, { staging, registre, etats, instant }));
    }
  }
  return demandes;
}

interface Sources {
  readonly staging: Staging;
  readonly registre: RegistreCorrectionsMesure;
  readonly etats: ReadonlyMap<string, EtatAnnotateur>;
  readonly instant: string;
}

function demandesDeItem(lot: Lot, item_id: string, sources: Sources): readonly Demande[] {
  const item = sources.staging.items.get(item_id);
  if (item === undefined) return [];
  const mesure = mesureDe(sources.staging, item);
  const demandes: Demande[] = [];

  for (const etat of sources.etats.values()) {
    const decision = etat.decisions.get(item_id);
    if (decision === undefined) continue;
    for (const correction of decision.corrections) {
      if (correction.cible !== "mesure") continue;
      if (decisionApplicable(sources.registre, correction, mesure).verdict !== "absente") continue;
      demandes.push({
        item_id,
        lot_id: lot.lot_id,
        mesure,
        correction,
        depuis: decision.horodatage,
        anciennete_jours: ancienneteEnJours(decision.horodatage, sources.instant),
      });
    }
  }
  return demandes;
}

function imprimerDemandes(demandes: readonly Demande[]): void {
  process.stdout.write(`Demandes de correction sans décision au registre : ${demandes.length}\n`);
  for (const demande of [...demandes].sort((a, b) => b.anciennete_jours - a.anciennete_jours)) {
    process.stdout.write(
      `  ${demande.mesure.id}  ${demande.correction.chemin} : ` +
        `${demande.mesure.theme} → ${String(demande.correction.nouvelle_valeur)}\n` +
        `    item ${demande.item_id}  [${demande.lot_id}]  ${demande.anciennete_jours} jour(s), ` +
        `depuis le ${demande.depuis}\n`,
    );
  }
  process.stdout.write(
    "\nL'écoulement du temps ne vaut jamais refus (§4) : une demande attend une décision,\n" +
      "elle n'expire pas.\n",
  );
}

/* ------------------------------------------------------ enregistrer une décision */

function construireDecision(table: Arguments, options: Options): DecisionCorrectionMesure {
  const staging = chargerStaging(options.staging);
  const mesure = staging.mesures.get(options.mesure);
  if (mesure === undefined) {
    throw new Error(
      `Mesure ${options.mesure} introuvable dans ${options.staging}. Une décision se prend ` +
        `contre une mesure existante, dont la version est enregistrée avec elle.`,
    );
  }
  return validerEntreeRegistre(
    {
      mesure_id: mesure.id,
      mesure_version: mesure.version,
      theme_demande: obligatoire(table, "theme", "c'est le thème demandé qui est tranché."),
      decision: sensDemande(table),
      date: dateDuJour(table),
      ...motifEventuel(table),
    },
    "arguments de la commande",
  );
}

function sensDemande(table: Arguments): SensDecisionMesure {
  const valeur = obligatoire(table, "decision", "« acceptee » ou « refusee », jamais implicite.");
  if (valeur !== "acceptee" && valeur !== "refusee") {
    throw new Error(`--decision vaut « acceptee » ou « refusee » : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

function motifEventuel(table: Arguments): { readonly motif?: string } {
  const motif = texte(table, "motif", "");
  return motif.length === 0 ? {} : { motif };
}

function enregistrer(table: Arguments, options: Options): void {
  const decision = construireDecision(table, options);
  const etat = decision.decision === "acceptee" ? "acceptée" : "refusée";
  process.stdout.write(
    `Mesure ${decision.mesure_id} (version ${decision.mesure_version})\n` +
      `  thème demandé : ${decision.theme_demande}\n` +
      `  décision : ${etat} le ${decision.date}\n` +
      `  motif : ${decision.motif === undefined ? "—" : decision.motif}\n`,
  );

  if (!options.ecrire) {
    process.stdout.write(
      `\nSimulation : rien n'a été écrit dans ${cheminRegistre(options.mesures)}.\n` +
        "Ajouter --ecrire pour ajouter cette décision au registre.\n",
    );
    return;
  }
  const registre = ajouterAuRegistre(options.mesures, decision);
  process.stdout.write(
    `\nDécision ajoutée : le registre compte ${registre.length} entrée(s).\n` +
      "Une acceptation ne modifie pas la mesure : corriger la mesure en amont, sans quoi\n" +
      "`pnpm promote` s'arrêtera sur une acceptation sans mesure modifiée (§4).\n",
  );
}

/* ------------------------------------------------------- relire une mesure (D53 (1)) */

/**
 * Imprime en entier ce que l'auteur atteste avoir relu, puis, avec `--ecrire`, l'inscrit au
 * registre. La mesure n'est jamais réécrite ; l'empreinte est recalculée depuis son contenu
 * (`relectureDe`), jamais recopiée de son champ `empreinte`.
 */
function relire(table: Arguments, options: Options): void {
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const staging = chargerStaging(options.staging);
  const mesure = trouverEnStaging(staging.mesures, "Mesure", options.relire, staging);
  const relecture = validerEntreeRelecture(relectureDe(mesure, dateDuJour(table)), "arguments de la commande");
  // Lu avant tout, y compris en simulation : un registre corrompu arrête la commande.
  const registre = lireRelectures(options.mesures);
  process.stdout.write(`${contenuRelu(mesure)}  empreinte du contenu relu : ${relecture.empreinte}\n`);

  const chemin = cheminRelectures(options.mesures);
  if (mesureRelue(registre, mesure)) {
    process.stdout.write(`\nCe contenu exact est déjà relu au registre ${chemin} : aucune entrée ajoutée.\n`);
    return;
  }
  if (!options.ecrire) {
    process.stdout.write(
      `\nSimulation : rien n'a été écrit dans ${chemin}.\n` +
        "Ajouter --ecrire pour attester avoir relu ce texte en entier et l'inscrire au registre.\n",
    );
    return;
  }
  const relu = ajouterRelecture(options.mesures, relecture);
  process.stdout.write(
    `\nRelecture ajoutée le ${relecture.date} : le registre compte ${relu.length} entrée(s).\n` +
      "Toute modification ultérieure du libellé, du thème, de fictive, de la formulation, des alias,\n" +
      "de l'origine fictive ou de la vérification de fictivité (ajout ou retrait compris) change\n" +
      "l'empreinte : `pnpm promote` refusera à nouveau la mesure jusqu'à une nouvelle relecture.\n",
  );
}

/**
 * Tout ce que la relecture atteste (§4, protocole 0.17), un champ par ligne. Un champ absent est
 * dit absent, jamais omis ; une liste d'alias vide est dite vide, jamais confondue avec l'absence.
 */
function contenuRelu(mesure: Mesure): string {
  return (
    `Mesure ${mesure.id}, version ${mesure.version}\n` +
    `  libellé : ${mesure.libelle}\n` +
    `  thème : ${mesure.theme}\n` +
    `  fictive : ${String(mesure.fictive)}\n` +
    `  formulation canonique : ${mesure.formulation_canonique}\n` +
    aliasRelus(mesure.alias) +
    `  origine fictive : ${mesure.origine_fictive === undefined ? "absente" : mesure.origine_fictive}\n` +
    verificationRelue(mesure.verification_fictivite)
  );
}

function aliasRelus(alias: Mesure["alias"]): string {
  if (alias === undefined) return "  alias : absent\n";
  if (alias.length === 0) return "  alias : liste vide\n";
  return `  alias :\n${alias.map((variante) => `    - ${variante}\n`).join("")}`;
}

function verificationRelue(verification: Mesure["verification_fictivite"]): string {
  if (verification === undefined) return "  vérification de fictivité : absente\n";
  return (
    "  vérification de fictivité :\n" +
    `    date : ${verification.date}\n` +
    `    corpus vérifiés : ${verification.corpus_verifies.join(", ")}\n` +
    `    opérateur : ${verification.operateur}\n` +
    `    résultat : ${verification.resultat}\n`
  );
}

/* ---------------------------------------------------------------------- aiguillage */

function principal(): void {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const options = lireOptions(table);
  verifierModeUnique(options);
  if (options.renvoyer.length > 0) {
    renvoyer({ ...options, mesure_id: options.renvoyer });
    return;
  }
  if (options.relire.length > 0) {
    relire(table, options);
    return;
  }
  if (options.rattacher.length > 0) {
    const cible = obligatoire(table, "a", "la mesure cible du rattachement n'est jamais implicite.");
    rattacher({ ...options, item_id: options.rattacher, mesure_id: cible, date: dateDuJour(table) });
    return;
  }
  if (options.mesure.length > 0) {
    enregistrer(table, options);
    return;
  }
  imprimerDemandes(demandesSansDecision(options, instantLocal(new Date())));
}

/** Les refus des modes `--relire` et `--rattacher` : nommés, sans pile d'appels. */
const REFUS_NOMMES: readonly (abstract new (...arguments_: never[]) => Error)[] = [
  ArgumentsIncompatibles,
  IntrouvableEnStaging,
  RattachementRefuse,
  RattachementInacheve,
  EntreeRelectureInvalide,
  EntreeRattachementInvalide,
  RegistreRelecturesIllisible,
  RegistreRattachementsIllisible,
  RegistreModifieDepuisLecture,
  ItemStagingModifie,
];

function refusNomme(erreur: unknown): boolean {
  return estRefusAttendu(erreur) || REFUS_NOMMES.some((classe) => erreur instanceof classe);
}

try {
  principal();
} catch (erreur) {
  if (!refusNomme(erreur)) throw erreur;
  process.stderr.write(`\n${(erreur as Error).message}\n`);
  process.exitCode = 1;
}
