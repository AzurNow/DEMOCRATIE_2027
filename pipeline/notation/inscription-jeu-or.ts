/**
 * L'inscription du kappa juge-humain du jeu d'or et du kappa de la paire de juges dans `run.json`
 * (§7 « Calibration et fiabilité publiée » ; D89, D93, D75 (27), D73 (8)) : `pnpm kappa:jeu-or` sans
 * la ligne de commande.
 *
 * **Rien n'est calculé ici.** Le kappa de chaque juge retenu, son motif quand il est indéfini, les
 * comptes qui le fondent, et le kappa de la paire ou son motif viennent d'un seul appel à
 * `analysis/kappa-jeu-or.ts:inscriptionsJeuOr`, qui applique les règles du §7 (D13, D32, D58,
 * D59 (20), D64, D70, D93) ; ce module lit les fichiers du run, assemble les réponses du jeu d'or,
 * fusionne et écrit. Les champs écrits sont ceux de
 * `analysis/champs-posterieurs-au-gel.ts:CHAMPS_DU_JEU_D_OR` (trois par juge retenu, deux à la racine,
 * dont un seul présent), et eux seuls ; tout le reste de `run.json` est recopié tel quel.
 *
 * **Ce qui est lu.** `run.json`, `volume/reponses/` (les réponses obtenues de contexte `run`, la
 * population du tirage), `volume/notations/` et `volume/renvois/` (avec `reponses-contrefactuelles/`,
 * validées au passage), chaque fichier validé contre son schéma (`analysis/lecture-run.ts`). Le jeu
 * d'or est rejoué par `echantillons.ts:tirerJeuOr` sur la graine de l'échantillon humain, comme
 * l'écran de notation humaine le tire (`notation-humaine/serveur/chargement.ts`). Pour chaque réponse
 * du jeu d'or : ses notations `calibration_jeu_or`, la notation `arbitrage_jeu_or` du troisième humain
 * s'il a noté (D93), les notations de chaque juge déclaré (celles d'un juge retiré sont écartées par
 * `inscriptionsJeuOr`, D13), la notation par règle d'un refus de l'API (D32) et les renvois de juge
 * (D59 (20)), tous de contexte `run`.
 *
 * **Troisième humain** (D93). Quand les deux calibrations divergent
 * (`analysis/kappa-jeu-or.ts:calibrationsDivergent`), la file humaine ouvre une tâche
 * `arbitrage_jeu_or` ; sa notation est transmise comme `troisieme`, et sa note est la référence du
 * kappa. Tant qu'elle manque, `inscriptionsJeuOr` lève `ArbitrageJeuOrEnAttente`, qui nomme les
 * réponses en attente.
 *
 * **Refus avant toute écriture** :
 * - `InscriptionJeuOrRefusee` : un run qui n'est pas le pilote (le jeu d'or n'est tiré que de ses
 *   réponses, §7) ; un statut autre que `en_cours` ; une invalidation inscrite (D51 (2)) ; un test
 *   contrefactuel non inscrit (le retrait d'un juge, qui l'écarte du kappa, D13, n'est pas encore
 *   connu) ; `metriques/metriques.json` déjà écrit (les champs sont dans l'empreinte
 *   `entrees.run_json_sha256`, §9 : écrits après l'analyse, ils la démentiraient) ; une notation de
 *   calibration ou d'arbitrage du jeu d'or hors du jeu d'or rejoué ; deux notations par règle, ou deux
 *   arbitrages du jeu d'or, sur une même réponse.
 * - `CalibrationJeuOrIncomplete` : une réponse du jeu d'or qui n'a pas encore ses deux notations
 *   `calibration_jeu_or`. Le compte des réponses incomplètes est donné.
 * - `ArbitrageJeuOrEnAttente` (levée par `analysis/kappa-jeu-or.ts`) : deux calibrations qui
 *   divergent sans arbitrage rendu ; les réponses sont nommées.
 * - `JeuOrIncoherent` (levée par `analysis/kappa-jeu-or.ts`) : toute incohérence des notations, dont
 *   un arbitrage là où les deux calibrations s'accordent.
 * - `KappaJeuOrDejaInscrit` : un champ du jeu d'or déjà présent dans `run.json` (d'un juge ou de la
 *   racine) que la fusion recalculée modifierait ou retirerait. Les champs en cause sont nommés.
 *
 * **Une seule fois, comme le test contrefactuel et le go/no-go.** Un `run.json` dont la fusion
 * recalculée est identique (forme canonique) n'est pas réécrit : `deja_inscrite`. Un champ déjà
 * présent n'est jamais modifié ni retiré : refus, jamais d'écrasement silencieux. Un run déjà inscrit
 * par la version de D89, qui n'écrivait pas le kappa de la paire, porte les champs de ses juges
 * retenus sans la paire : si ces champs sont identiques au recalcul, la paire est ajoutée et rien
 * d'autre ne change (`completee`) ; s'ils diffèrent, `KappaJeuOrDejaInscrit`.
 *
 * **Juge retiré** (§7, D13 : « Les notations déjà rendues par le juge retiré sont écartées de tout
 * le run, y compris de l'accord juges-humains et du kappa des juges publiés avec lui ») :
 * `inscriptionsJeuOr` ne lui rend aucune inscription ; ses champs ne sont ni écrits ni retirés, et le
 * kappa de la paire est celui du juge restant (`kappaDeLaPaire`).
 *
 * L'écriture est validée contre `schema/run.schema.json`, puis faite par un temporaire synchronisé et
 * renommé (`pipeline/run/ecriture.ts`, suffixe `kappa-jeu-or`). Un run simulé (`simule: true`, D80)
 * est traité comme un autre : il vit déjà hors de `runs/`, où son gel l'a écrit.
 */

import { existsSync, readFileSync } from "node:fs";
import { cheminMetriques } from "../../analysis/analyse-du-run.ts";
import { CHAMPS_DU_JEU_D_OR } from "../../analysis/champs-posterieurs-au-gel.ts";
import { estDuRun } from "../../analysis/filtre.ts";
import {
  inscriptionsJeuOr,
  MOTIF_ARBITRAGE_JEU_OR,
  MOTIF_CALIBRATION_JEU_OR,
  type InscriptionJeuOr,
  type InscriptionPaire,
  type ReponseDuJeuOr,
} from "../../analysis/kappa-jeu-or.ts";
import { dispositionRunNote, lireNotationsDuRun, lireReponses, lireRunJson, type RunLu } from "../../analysis/lecture-run.ts";
import type { NotationIndividuelle, RenvoiHumain } from "../../analysis/types-notation.ts";
import { STATUT_EN_COURS, TYPE_PILOTE } from "../../analysis/types-run.ts";
import type { Ulid } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { ecrireParRenommageSiInchange, type EcritureTemporaire } from "../run/ecriture.ts";
import { tirerJeuOr, type JeuOr } from "./echantillons.ts";
import { estNotationParRegle } from "./regle-refus.ts";

const SUFFIXE_TEMPORAIRE = "kappa-jeu-or";
const MOTIFS_DU_JEU_D_OR: ReadonlySet<string> = new Set([MOTIF_CALIBRATION_JEU_OR, MOTIF_ARBITRAGE_JEU_OR]);

export class InscriptionJeuOrRefusee extends Error {
  constructor(run_id: string, detail: string) {
    super(`Run ${run_id} : ${detail} Le kappa du jeu d'or n'est pas inscrit ; rien n'est écrit.`);
    this.name = "InscriptionJeuOrRefusee";
  }
}

export class CalibrationJeuOrIncomplete extends Error {
  constructor(run_id: string, incompletes: readonly Ulid[], taille: number) {
    super(
      `Run ${run_id} : ${incompletes.length} réponse(s) du jeu d'or sur ${taille} n'ont pas leurs deux notations humaines ` +
        `calibration_jeu_or (première : ${String(incompletes[0])}). Le kappa juge-humain se calcule sur le jeu d'or entier, ` +
        `doublement noté (§7) ; rien n'est écrit.`,
    );
    this.name = "CalibrationJeuOrIncomplete";
  }
}

export class KappaJeuOrDejaInscrit extends Error {
  constructor(chemin: string, champs: readonly string[]) {
    super(
      `${chemin} porte déjà un kappa du jeu d'or différent de celui que le jeu d'or recalcule (${champs.join(", ")}) : ` +
        `rien n'est réécrit (règle 7).`,
    );
    this.name = "KappaJeuOrDejaInscrit";
  }
}

export interface ResultatInscriptionJeuOr {
  /** `completee` : un run inscrit sans kappa de la paire reçoit la paire, ses autres champs inchangés. */
  readonly issue: "inscrite" | "completee" | "deja_inscrite";
  readonly run_id: string;
  readonly jeu_or: JeuOr;
  /** Une par juge retenu, dans l'ordre de `run.json#/juges`. */
  readonly inscriptions: readonly InscriptionJeuOr[];
  /** Le kappa de la paire ou son motif, inscrit à la racine de `run.json`. */
  readonly paire: InscriptionPaire;
}

type Objet = Readonly<Record<string, unknown>>;

/** `ecriture` : point d'injection des tests d'interruption, jamais fourni par un appelant de production. */
export function inscrireJeuOr(repertoire_run: string, ecriture?: EcritureTemporaire): ResultatInscriptionJeuOr {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const texte_lu = readFileSync(chemin, "utf8");
  const run = lireRunJson(repertoire_run);
  exigerInscriptible(repertoire_run, run);
  const obtenues = lireReponses(repertoire_run, run.id).filter((r) => estDuRun(r) && r.statut_reponse === "obtenue");
  const jeu_or = tirerJeuOr(obtenues.map((r) => r.id), run.graines.echantillon_humain);
  const { notations, renvois } = lireNotationsDuRun(repertoire_run, run.id);
  const reponses = reponsesDuJeuOr(run.id, jeu_or.reponse_ids, notations, renvois);
  const { juges: inscriptions, paire } = inscriptionsJeuOr(run.juges, reponses);
  const actuel = JSON.parse(texte_lu) as Objet;
  const fusionne = fusionner(run.id, actuel, inscriptions, paire);
  const resultat = { run_id: run.id, jeu_or, inscriptions, paire };
  if (canoniser(fusionne) === canoniser(actuel)) return { issue: "deja_inscrite", ...resultat };
  const modifies = champsModifies(actuel, fusionne);
  if (modifies.length > 0) throw new KappaJeuOrDejaInscrit(chemin, modifies);
  const issue = porteDejaLeJeuDOr(actuel, inscriptions) ? "completee" : "inscrite";
  const valide = valider<unknown>("run", fusionne, `${chemin} après inscription du kappa du jeu d'or`);
  ecrireParRenommageSiInchange(chemin, valide, SUFFIXE_TEMPORAIRE, texte_lu, ecriture);
  return { issue, ...resultat };
}

/* ------------------------------------------------------------------ préalables */

function exigerInscriptible(repertoire_run: string, run: RunLu): void {
  const motif = motifDeRefus(repertoire_run, run);
  if (motif !== null) throw new InscriptionJeuOrRefusee(run.id, motif);
}

function motifDeRefus(repertoire_run: string, run: RunLu): string | null {
  if (run.type_run !== TYPE_PILOTE) return `run ${run.type_run}, pas le run pilote : le jeu d'or n'est tiré que des réponses du pilote (§7).`;
  if (run.statut !== STATUT_EN_COURS) return `statut ${run.statut} ; le kappa du jeu d'or s'inscrit sur un run en_cours, interrogé et pas encore publié.`;
  if (run.invalidation !== undefined) return `il porte une invalidation (« ${run.invalidation.motif} », D51 (2)).`;
  if (run.contrefactuel_candidats === undefined) {
    return "le test contrefactuel n'est pas inscrit : le retrait d'un juge, qui écarte ses notations du kappa (§7, D13), n'est pas encore connu.";
  }
  if (existsSync(cheminMetriques(repertoire_run))) {
    return "metriques/metriques.json est déjà écrit : le kappa du jeu d'or entre dans l'empreinte du run (§9), il s'inscrit avant pnpm analyze.";
  }
  return null;
}

/* ------------------------------------------------------------------ assemblage */

interface SurReponse {
  readonly contexte: string;
  readonly objet_note: { readonly type: string; readonly id: Ulid };
}

/** Les objets de contexte `run` portés par chaque réponse du jeu d'or ; ceux d'autres réponses ne sont pas retenus. */
function parReponse<T extends SurReponse>(jeu: readonly Ulid[], objets: readonly T[]): ReadonlyMap<Ulid, readonly T[]> {
  const index = new Map<Ulid, T[]>(jeu.map((id) => [id, []]));
  for (const objet of objets) {
    if (objet.contexte === "run" && objet.objet_note.type === "reponse") index.get(objet.objet_note.id)?.push(objet);
  }
  return index;
}

function de<T>(index: ReadonlyMap<Ulid, readonly T[]>, id: Ulid): readonly T[] {
  const objets = index.get(id);
  if (objets === undefined) throw new Error(`réponse ${id} absente de l'index du jeu d'or (invariant).`);
  return objets;
}

function reponsesDuJeuOr(run_id: string, jeu: readonly Ulid[], notations: readonly NotationIndividuelle[], renvois: readonly RenvoiHumain[]): readonly ReponseDuJeuOr[] {
  exigerJeuOrDansLeJeu(run_id, jeu, notations);
  const notationsPar = parReponse(jeu, notations);
  const renvoisPar = parReponse(jeu, renvois);
  const reponses = jeu.map((id) => reponseDuJeuOr(run_id, id, de(notationsPar, id), de(renvoisPar, id)));
  const incompletes = reponses.filter((r) => r.calibration.length < 2).map((r) => r.reponse_id);
  if (incompletes.length > 0) throw new CalibrationJeuOrIncomplete(run_id, incompletes, jeu.length);
  return reponses;
}

/** Une notation de calibration ou d'arbitrage du jeu d'or hors du jeu d'or rejoué : un autre tirage, ou un jeu d'or mal servi. */
function exigerJeuOrDansLeJeu(run_id: string, jeu: readonly Ulid[], notations: readonly NotationIndividuelle[]): void {
  const dans = new Set(jeu);
  const hors = notations.find((n) => n.motif_notation !== undefined && MOTIFS_DU_JEU_D_OR.has(n.motif_notation) && !dans.has(n.objet_note.id));
  if (hors !== undefined) {
    throw new InscriptionJeuOrRefusee(run_id, `la notation ${String(hors.motif_notation)} ${hors.id} porte sur ${hors.objet_note.id}, hors du jeu d'or rejoué (§7).`);
  }
}

function reponseDuJeuOr(run_id: string, id: Ulid, notations: readonly NotationIndividuelle[], renvois: readonly RenvoiHumain[]): ReponseDuJeuOr {
  const regles = notations.filter(estNotationParRegle);
  const arbitrages = notations.filter((n) => n.motif_notation === MOTIF_ARBITRAGE_JEU_OR);
  const [regle] = regles;
  const [arbitrage] = arbitrages;
  if (regles.length > 1) throw new InscriptionJeuOrRefusee(run_id, `réponse ${id} du jeu d'or : ${regles.length} notations par règle au lieu d'une au plus (D32).`);
  if (arbitrages.length > 1) throw new InscriptionJeuOrRefusee(run_id, `réponse ${id} du jeu d'or : ${arbitrages.length} arbitrages du jeu d'or au lieu d'un au plus (D93).`);
  return {
    reponse_id: id,
    calibration: notations.filter((n) => n.motif_notation === MOTIF_CALIBRATION_JEU_OR),
    troisieme: arbitrage === undefined ? null : arbitrage,
    juges: notations.filter((n) => n.notateur.type === "juge"),
    refus_api: regle === undefined ? null : regle,
    renvois,
  };
}

/* ------------------------------------------------------------------ fusion */

const CHAMPS = CHAMPS_DU_JEU_D_OR;

function sans(objet: Objet, champs: readonly string[]): Objet {
  return Object.fromEntries(Object.entries(objet).filter(([cle]) => !champs.includes(cle)));
}

function jugesDe(run: Objet): readonly Objet[] {
  // `lireRunJson` a validé ce run.json, dont le schéma exige le tableau `juges`.
  return run["juges"] as readonly Objet[];
}

/** La paire remplace les deux champs de la racine ; chaque juge retenu, ses trois champs. */
function fusionner(run_id: string, actuel: Objet, inscriptions: readonly InscriptionJeuOr[], paire: InscriptionPaire): Objet {
  return { ...sans(actuel, CHAMPS.racine), ...paire, juges: jugesDe(actuel).map((juge) => jugeFusionne(run_id, juge, inscriptions)) };
}

/** Un juge retenu reçoit son inscription à la place des trois champs ; un juge retiré est recopié tel quel (D13). */
function jugeFusionne(run_id: string, juge: Objet, inscriptions: readonly InscriptionJeuOr[]): Objet {
  const inscription = inscriptions.find((i) => i.juge_id === juge["juge_id"]);
  if (inscription === undefined) {
    if (juge["retire"] !== true) throw new InscriptionJeuOrRefusee(run_id, `le juge retenu ${String(juge["juge_id"])} n'a pas de kappa recalculé (invariant).`);
    return juge;
  }
  const { juge_id: _juge_id, ...champs } = inscription;
  return { ...sans(juge, CHAMPS.juges), ...champs };
}

/** Les champs du jeu d'or présents avant la fusion qu'elle modifierait ou retirerait : jamais d'écrasement. */
function champsModifies(avant: Objet, apres: Objet): readonly string[] {
  const juges_apres = jugesDe(apres);
  const parJuge = jugesDe(avant).flatMap((juge, rang) => {
    const fusionne = juges_apres[rang];
    if (fusionne === undefined) throw new Error(`juge au rang ${rang} absent de la fusion (invariant).`);
    return modifies(`juges[${String(juge["juge_id"])}]`, juge, fusionne, CHAMPS.juges);
  });
  return [...modifies("racine", avant, apres, CHAMPS.racine), ...parJuge];
}

function modifies(lieu: string, avant: Objet, apres: Objet, champs: readonly string[]): readonly string[] {
  const change = (champ: string): boolean => apres[champ] === undefined || canoniser(avant[champ]) !== canoniser(apres[champ]);
  return champs.filter((champ) => avant[champ] !== undefined && change(champ)).map((champ) => `${lieu}.${champ}`);
}

/** La racine ou un juge retenu porte déjà un champ du jeu d'or (un juge retiré garde les siens, D13). */
function porteDejaLeJeuDOr(actuel: Objet, inscriptions: readonly InscriptionJeuOr[]): boolean {
  const retenus = new Set(inscriptions.map((i) => i.juge_id));
  const surLaRacine = CHAMPS.racine.some((champ) => actuel[champ] !== undefined);
  return surLaRacine || jugesDe(actuel).some((juge) => retenus.has(String(juge["juge_id"])) && CHAMPS.juges.some((champ) => juge[champ] !== undefined));
}
