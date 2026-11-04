/**
 * `pnpm analyze`, sous-lot A : l'assemblage des analyses préenregistrées du §8 sur un run, avec un
 * seul partage de la population, porté par un seul objet (docs/DETTE.md, 2026-11-02, n° 1).
 *
 * Ce module ne définit aucune métrique, aucun seuil ni aucune règle de décision : il appelle les
 * modules d'`analysis/` qui les portent, dans cet ordre, et rien d'autre.
 *
 * 1. `lireEntreesDuRun` lit le run (`lecture-run.ts:lireRun`, qui valide chaque fichier) et ses
 *    notations individuelles (`lireNotationsDuRun`). Le plan d'interrogation et le tirage de
 *    l'échantillon humain sont **injectés** par l'appelant (`outils/analyze.ts`) : `analysis/`
 *    n'importe pas le code d'interrogation ni de notation (flux à sens unique, CLAUDE.md).
 * 2. `assembler` (`filtre.ts`) construit les unités ; seules celles du canal API entrent dans le
 *    partage et dans les sections du §8. Celles du canal application (QR8) n'entrent que dans l'écart
 *    API / application, section exploratoire.
 * 3. `contexteDuRun` calcule **une seule fois** le partage des couples (`seuils.ts:couplesComparables`),
 *    celui des candidats (`candidatsComparables`), les strates (`incertitude.ts:stratesDuCalculPrincipal`),
 *    les modes de tête, la strate de moins de 60 jours (`strate-recente.ts:unitesDeLaStrateRecente`)
 *    et les graines du run. Le résultat est figé (`Object.freeze`, en profondeur) et il est le seul
 *    porteur du partage : chaque section le reçoit, aucune ne le recalcule. §8, robustesse :
 *    « Chaque recalcul garde le partage des couples outil × mode et des candidats du calcul
 *    principal : les seuils de non-publication ne sont pas réappliqués à la population restreinte ».
 * 4. à 8. Les sections : taux, asymétrie (test par couple comparé, puis Holm), conditions (modes et
 *    formulations, strates `global` et `recents:60j`), robustesse (taux recalculés (a) à (d), puis la
 *    fragilité de chaque différence établie des modes, des formulations, de H3 et de la tendance,
 *    reprise des sections déjà calculées et recalculée sur les unités restreintes, D69), hypothèses (H1 à H5, protocole 0.27, D63 ; H5
 *    lit la tendance entre le premier run, lu avec son propre partage, et ce run ; D70 pour un outil
 *    à deux modes), variabilité entre échantillons (diagnostic par couple comparé, §8, D70 (12),
 *    `accord-echantillons.ts`, qui lit aussi le plan d'interrogation), puis les analyses exploratoires
 *    préannoncées, après les comparateurs (couverture et exactitude de chaque comparateur inclus sur
 *    les items P de référence, §8, métriques secondaires ; notes des lectures retenues par la règle de
 *    l'échantillon, injectée), (corrélation de Spearman du §2, `correlation-couverture.ts` ; écart API /
 *    application du §6, `ecart-api-application.ts`), chacune étiquetée « exploratoire », sans
 *    qualificatif de fragilité (§8, robustesse). Chaque section est
 *    `{statut: "calcule", …}` ou `{statut: "sans_objet", motif}` : jamais une section vide qui
 *    passerait pour un résultat. La population publie aussi le régime d'inclusion du run (§3, D68).
 *    Après les comparateurs, l'écart de chaque juge sur l'outil de son propre éditeur (§7, D73 (7),
 *    `sectionEcartJugeEditeur`), sur la liste déclarée au gel et lue dans `run.json#/juges[]`.
 * 9. `collecterGraines` relève chaque couple `{cle, graine}` publié dans le document.
 * 10. `validerEtEcrire` valide le document contre `schema/metriques.schema.json` avant toute écriture,
 *    puis écrit `runs/<date>/metriques/metriques.json` s'il est absent, ne fait rien s'il est
 *    identique à l'octet près, et lève `MetriquesDivergentes` s'il diffère : jamais d'écrasement.
 *
 * Les kappas et le test contrefactuel ne sont pas recopiés : ils vivent dans `run.json`, que
 * l'empreinte de `entrees.run_json_sha256` désigne.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { comparerChaines } from "../outils/ordre-chaines.ts";
import { valider } from "../outils/schemas/valider.ts";
import { canoniser } from "../validation/domaine/empreinte.ts";
import { variabiliteDuRun, type VariabiliteDesEchantillons } from "./accord-echantillons.ts";
import { REECHANTILLONNAGES_PRODUCTION } from "./bootstrap.ts";
import { correlationsParCouple, type CorrelationCouverture } from "./correlation-couverture.ts";
import {
  clesComparantLeRegistreOriente,
  comparerConditions,
  pairesDeH3,
  pairesParFormulation,
  pairesParMode,
  type ComparaisonCondition,
  type PaireCondition,
  type PaireExclue,
  type PairesDeCondition,
} from "./conditions.ts";
import { unitesParCoupleCompare } from "./couples-compares.ts";
import { ecartsApiApplication, type EcartsApiApplication } from "./ecart-api-application.ts";
import { ecartsJugesEditeurs, type EcartsJugesEditeurs, type JugeEtSonEditeur } from "./ecart-juge-editeur.ts";
import { assembler, estDuRun, type EntreesAnalyse, type UniteAnalyse } from "./filtre.ts";
import { decisionH1, decisionH2, decisionH3, decisionH4, decisionH5, STRATE_H3, type FabricationDuCouple } from "./hypotheses.ts";
import {
  STRATE_GLOBALE,
  stratesDuCalculPrincipal,
  tauxPubliesDuComparateur,
  tauxPubliesParCouple,
  type StratesPubliees,
  type TauxDuComparateur,
  type TauxDuRun,
} from "./incertitude.ts";
import {
  dispositionRunNote,
  lireLecturesDuRun,
  lireNotationsDuRun,
  lireRun,
  type EchantillonHumainDuRun,
  type PlanDuRun,
  type RunLu,
} from "./lecture-run.ts";
import { exactitude, lecturesNoteesParComparateur, type LectureNotee } from "./metriques.ts";
import { modelesDuRun, type ModeleDUnOutil } from "./modeles-du-run.ts";
import { corrigerFamilleAsymetrie, PERMUTATIONS_PRODUCTION, testHomogeneiteCandidats, type FamilleAsymetrie, type ResultatCouple } from "./permutation.ts";
import { tauxRecalcules } from "./robustesse-taux.ts";
import { fragiliteDesDifferences, restrictionDe, type FamilleDeDifferences, type FamilleDeResultats, type Recalcul, type SourcesRobustesse } from "./robustesse.ts";
import { itemsPDeReference } from "./reference-comparateurs.ts";
import { candidatsComparables, cleCouple, couplesComparables, type PartageCandidats, type PartageCouples, type RequeteDuPlan } from "./seuils.ts";
import { STRATE_RECENTE, unitesDeLaStrateRecente, type ItemDate } from "./strate-recente.ts";
import { tendanceDuRun, type TendanceDuRun } from "./tendance.ts";
import type { CandidatAuGel, CategorieRetenue, CoupleOutilMode, EntreeTirage, IdentifiantCourt, Item, LectureComparateur, Mode, Notation, Question, Reponse, Run, Ulid } from "./types.ts";
import type { NotationIndividuelle } from "../pipeline/notation/types.ts";
import { CHAMPS_HORS_EMPREINTE_DU_RUN, retirerChamps } from "../pipeline/run/champs-posterieurs-au-gel.ts";

/* ------------------------------------------------------------------ entrées */

/** §3 (0.11 ; 0.27, D68) : « chaque run déclare son régime ». */
export type RegimeInclusion = "avant_liste_officielle" | "liste_officielle" | "entre_deux_tours";

/** La part de `run.json` que l'analyse lit en plus de `Run` (schema/run.schema.json l'exige). */
export interface RunAnalyse extends Run {
  readonly perimetre: Run["perimetre"] & { readonly regime_inclusion: RegimeInclusion };
  readonly versions: { readonly donnees_commit: string };
  readonly tirage: { readonly sha256: string };
  /**
   * Lus pour l'écart juge-éditeur (§7, D73 (7)) et pour retirer de l'empreinte les champs que le
   * go/no-go y écrit.
   */
  readonly juges: readonly JugeLuParAnalyse[];
  readonly graines: { readonly bootstrap: { readonly valeur: number }; readonly permutation: { readonly valeur: number } };
}

/** Un juge de `run.json#/juges[]`, tel que l'analyse le lit. */
export interface JugeLuParAnalyse {
  readonly juge_id: IdentifiantCourt;
  readonly retire: boolean;
  /** §7 (0.31, D73 (7)) : la liste déclarée au gel, vide comprise ; absente d'un run gelé avant. */
  readonly outils_de_son_editeur?: readonly IdentifiantCourt[];
}

/** Tout ce que l'analyse d'un run lit, déjà validé : la sortie de `lireEntreesDuRun`. */
export interface EntreesDuRun extends Omit<EntreesAnalyse, "run" | "items"> {
  readonly run: RunAnalyse;
  /** Les items épinglés, validés contre `item.schema.json` : ils portent `valide_du` (strate de 60 jours). */
  readonly items: readonly (Item & ItemDate)[];
  readonly notations: readonly Notation[];
  readonly plan: readonly RequeteDuPlan[];
  /**
   * §6, QR8 : les questions du sous-échantillon de l'application. `null` exactement quand le run n'a
   * aucune réponse du canal application : le sous-échantillon n'est alors pas calculé.
   */
  readonly questions_sous_echantillon: readonly string[] | null;
  /** §6, QR9 : les lectures des comparateurs du run (`volume/lectures-comparateur/`). */
  readonly lectures: readonly LectureComparateur[];
  /** L'état de chaque lecture affichée du run, par la règle de l'échantillon (`etatsDesLecturesDuRun`). */
  readonly etats_des_lectures: readonly EtatDeLecture[];
}

/** Ce que le calcul du sous-échantillon de l'application lit d'un run : ses fichiers gelés (§6). */
export interface FichiersGelesDuRun {
  readonly run: RunLu;
  readonly entrees_tirage: readonly EntreeTirage[];
  readonly questions: readonly Question[];
}

/**
 * Les questions du sous-échantillon de l'application d'un run lu (§6). Injecté par l'appelant —
 * `pipeline/interrogation/sous-echantillon-application.ts:questionsDuSousEchantillonDuRun` — comme
 * le plan d'interrogation : `analysis/` n'importe pas le code d'interrogation.
 */
export type SousEchantillonDuRun = (fichiers: FichiersGelesDuRun) => readonly string[];

/**
 * L'état d'une lecture affichée (§6) : à noter, à arbitrer, ou retenue avec sa note. Le type de
 * `pipeline/notation/lectures-comparateur.ts:EtatLecture`, réduit à ce que l'analyse lit.
 */
export type EtatDeLecture =
  | { readonly statut: "a_noter" | "a_arbitrer"; readonly lecture_id: Ulid }
  | { readonly statut: "retenue"; readonly lecture_id: Ulid; readonly note: { readonly categorie: CategorieRetenue } };

/**
 * La règle de l'échantillon sur les notations des lectures (§6 : deux humains à l'aveugle, un
 * troisième s'ils divergent ; une notation sans déclaration d'aveuglement refusée, D62). Injectée
 * (`pipeline/notation/lectures-comparateur.ts:etatsDesLectures`) : `analysis/` n'importe pas le code de
 * notation.
 */
export type EtatsDesLectures = (run_id: Ulid, lectures: readonly LectureComparateur[], notations: readonly NotationIndividuelle[]) => readonly EtatDeLecture[];

export interface OptionsLectureAnalyse {
  /** Le répertoire des items validés, lu en Git au commit `run.versions.donnees_commit` (`lireRun`). */
  readonly items: string;
  readonly plan_du_run: PlanDuRun;
  readonly echantillon_humain: EchantillonHumainDuRun;
  /** Appelé seulement si le run a au moins une réponse du canal application. */
  readonly sous_echantillon_application: SousEchantillonDuRun;
  readonly etats_des_lectures: EtatsDesLectures;
}

function aDesReponsesApplication(reponses: readonly Reponse[]): boolean {
  return reponses.some((r) => estDuRun(r) && r.canal === "application");
}

/** Les états des lectures du run, sur ses seules notations de lecture (celles des réponses n'y entrent pas). */
export function etatsDesLecturesDuRun(
  run_id: Ulid,
  lectures: readonly LectureComparateur[],
  notations: readonly NotationIndividuelle[],
  etats_des_lectures: EtatsDesLectures,
): readonly EtatDeLecture[] {
  return etats_des_lectures(run_id, lectures, notations.filter((n) => n.objet_note.type === "lecture_comparateur"));
}

/** 1. Le run lu et validé (`lireRun`), ses notations individuelles, son plan d'interrogation et ses lectures. */
export function lireEntreesDuRun(repertoire_run: string, options: OptionsLectureAnalyse): EntreesDuRun {
  const { entrees } = lireRun(repertoire_run, options);
  // run.schema.json exige versions, tirage et graines.bootstrap / permutation ; lireRun l'a validé.
  const run = entrees.run as RunLu & RunAnalyse;
  const { notations } = lireNotationsDuRun(repertoire_run, run.id);
  const lectures = lireLecturesDuRun(repertoire_run, run);
  return {
    ...entrees,
    run,
    items: entrees.items as readonly (Item & ItemDate)[],
    notations,
    plan: options.plan_du_run(repertoire_run, run),
    questions_sous_echantillon: aDesReponsesApplication(entrees.reponses)
      ? options.sous_echantillon_application({ run, entrees_tirage: entrees.entrees_tirage, questions: entrees.questions })
      : null,
    lectures,
    etats_des_lectures: etatsDesLecturesDuRun(run.id, lectures, notations, options.etats_des_lectures),
  };
}

/* ------------------------------------------------------------------ contexte */

/** Le nombre de tirages : §8 en production (2 000 et 10 000), moins dans les tests. */
export interface ParametresAnalyse {
  readonly reechantillonnages: number;
  readonly permutations: number;
}

export const PARAMETRES_PRODUCTION: ParametresAnalyse = Object.freeze({
  reechantillonnages: REECHANTILLONNAGES_PRODUCTION,
  permutations: PERMUTATIONS_PRODUCTION,
});

export interface ModeDeTete {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
}

/**
 * Le seul porteur du partage de la population. Construit par `contexteDuRun`, figé, et passé tel
 * quel à chaque section : aucune section ne lit `sous_seuil`, ne compte de manquantes ni ne relève
 * de strates.
 */
export interface ContexteDuRun {
  /** Les unités du canal API du run, dans l'ordre d'assemblage. */
  readonly unites: readonly UniteAnalyse[];
  /** §6, QR8 : les unités du canal application, hors du partage ; seul l'écart API / application les lit. */
  readonly unites_application: readonly UniteAnalyse[];
  /** §2, H2 : les unités dont la question entre dans la strate de moins de 60 jours. */
  readonly unites_recentes: readonly UniteAnalyse[];
  /** Les questions du run : la tendance (H5) les compare à celles du premier run (§8). */
  readonly questions: readonly Question[];
  /** §3 (D68) : le régime déclaré au gel, publié avec la population. */
  readonly regime_inclusion: RegimeInclusion;
  readonly couples: PartageCouples;
  readonly candidats: PartageCandidats;
  readonly strates: StratesPubliees;
  readonly modes_de_tete: readonly ModeDeTete[];
  /** Les assistants inclus, dans l'ordre du périmètre : les outils des hypothèses. */
  readonly outils: readonly IdentifiantCourt[];
  /** §8 (0.31, D73 (17)) : le modèle demandé au gel et les identifiants renvoyés, publiés avec la tendance. */
  readonly modeles: readonly ModeleDUnOutil[];
  readonly sources_robustesse: SourcesRobustesse;
  readonly graines: { readonly bootstrap: number; readonly permutation: number };
  readonly parametres: ParametresAnalyse;
}

/** Un assistant inclus sans mode de tête : run.schema.json l'exige, et aucun mode n'est choisi ici. */
export class ModeDeTeteNonDeclare extends Error {
  constructor(outil_id: IdentifiantCourt) {
    super(`Assistant inclus ${outil_id} sans mode_de_tete (§8, run.schema.json) : le mode de tête est lu, jamais choisi.`);
    this.name = "ModeDeTeteNonDeclare";
  }
}

type OutilDuRun = Run["perimetre"]["outils"][number];

function estAssistantInclus(outil: OutilDuRun): boolean {
  return outil.famille === "assistant" && outil.inclus;
}

function modeDeTete(outil: OutilDuRun): ModeDeTete {
  if (outil.mode_de_tete === undefined) throw new ModeDeTeteNonDeclare(outil.outil_id);
  return { outil_id: outil.outil_id, mode: outil.mode_de_tete };
}

function figer<T>(valeur: T): T {
  if (typeof valeur !== "object" || valeur === null || Object.isFrozen(valeur)) return valeur;
  for (const sous of Object.values(valeur)) figer(sous);
  return Object.freeze(valeur);
}

/** 3. Le partage de la population, calculé une fois, figé. */
export function contexteDuRun(entrees: EntreesDuRun, unites: readonly UniteAnalyse[], parametres: ParametresAnalyse): ContexteDuRun {
  const api = unites.filter((u) => u.canal === "api");
  const candidats = candidatsComparables(entrees.run);
  const assistants = entrees.run.perimetre.outils.filter(estAssistantInclus);
  // Le partage est figé en profondeur ; les unités et les sources, qui appartiennent à l'appelant,
  // sont seulement portées par des tableaux figés.
  return Object.freeze({
    unites: Object.freeze(api),
    unites_application: Object.freeze(unites.filter((u) => u.canal === "application")),
    unites_recentes: Object.freeze(unitesDeLaStrateRecente(api, entrees.items, entrees.run.date_gel)),
    questions: Object.freeze([...entrees.questions]),
    regime_inclusion: entrees.run.perimetre.regime_inclusion,
    couples: figer(couplesComparables(entrees.reponses, entrees.plan)),
    candidats: figer(candidats),
    strates: figer(stratesDuCalculPrincipal(api, candidats)),
    modes_de_tete: figer(assistants.map(modeDeTete)),
    outils: figer(assistants.map((outil) => outil.outil_id)),
    modeles: figer(modelesDuRun(entrees.run.perimetre.outils, entrees.reponses)),
    sources_robustesse: Object.freeze({ run: entrees.run, notations: entrees.notations }),
    graines: figer({ bootstrap: entrees.run.graines.bootstrap.valeur, permutation: entrees.run.graines.permutation.valeur }),
    parametres: figer({ ...parametres }),
  });
}

/* ------------------------------------------------------------------ sections */

export type MotifSansObjet =
  | "aucun_comparateur_inclus"
  | "aucun_couple_compare"
  | "moins_de_deux_candidats"
  | "premier_run_absent"
  | "moins_de_trois_candidats"
  | "aucune_reponse_application"
  | "outils_de_son_editeur_non_declares"
  | "juge_retire";

export interface SansObjet {
  readonly statut: "sans_objet";
  readonly motif: MotifSansObjet;
}

export type Section<T> = ({ readonly statut: "calcule" } & T) | SansObjet;

function sansObjet(motif: MotifSansObjet): SansObjet {
  return { statut: "sans_objet", motif };
}

/** Une section par couple comparé n'a pas d'objet quand le partage n'en compte aucun. */
export function surCouplesCompares<T>(contexte: ContexteDuRun, contenu: () => T): Section<T> {
  if (contexte.couples.compares.length === 0) return sansObjet("aucun_couple_compare");
  return { statut: "calcule", ...contenu() };
}

export function optionsBootstrap(contexte: ContexteDuRun): { readonly reechantillonnages: number; readonly graine_du_run: number } {
  return { reechantillonnages: contexte.parametres.reechantillonnages, graine_du_run: contexte.graines.bootstrap };
}

/** 4. Les taux publiés de chaque couple comparé, chacun avec son intervalle. */
export function calculerTaux(contexte: ContexteDuRun): TauxDuRun {
  return tauxPubliesParCouple(contexte.unites, contexte.couples, contexte.strates, contexte.candidats, optionsBootstrap(contexte));
}

export function sectionTaux(contexte: ContexteDuRun, taux: TauxDuRun): Section<{ readonly couples: TauxDuRun["compares"]; readonly couples_incomplets: readonly CoupleOutilMode[] }> {
  return surCouplesCompares(contexte, () => ({ couples: taux.compares, couples_incomplets: taux.couples_incomplets }));
}

export interface AsymetrieCalculee {
  readonly resultats: readonly ResultatCouple[];
  readonly famille: FamilleAsymetrie;
}

/** 5. Le test d'homogénéité de chaque couple comparé, puis la correction de Holm sur leur famille. */
export function calculerAsymetrie(contexte: ContexteDuRun): AsymetrieCalculee {
  const resultats = unitesParCoupleCompare(contexte.unites, contexte.couples).map(({ couple, unites }) => ({
    couple,
    resultat: testHomogeneiteCandidats(
      unites,
      contexte.candidats,
      { permutations: contexte.parametres.permutations, graine_du_run: contexte.graines.permutation, cle: [couple.outil_id, couple.mode] },
      { ...optionsBootstrap(contexte), cle: [couple.outil_id, couple.mode] },
    ),
  }));
  return { resultats, famille: corrigerFamilleAsymetrie(resultats, contexte.couples) };
}

function testPublie(resultat: ResultatCouple, famille: FamilleAsymetrie): object {
  if (resultat.resultat === null) return sansObjet("moins_de_deux_candidats");
  const cle = cleCouple(resultat.couple);
  const corrigee = famille.corrigees.find((p) => p.cle === cle);
  if (corrigee === undefined) throw new Error(`Couple ${cle} testé, mais absent de la famille de Holm : valeur p corrigée indécidable.`);
  return { statut: "calcule", ...resultat.resultat, valeur_p_corrigee: corrigee.corrigee };
}

export function sectionAsymetrie(contexte: ContexteDuRun, asymetrie: AsymetrieCalculee): Section<object> {
  return surCouplesCompares(contexte, () => ({
    couples: asymetrie.resultats.map((r) => ({ couple: r.couple, test: testPublie(r, asymetrie.famille) })),
    couples_incomplets: asymetrie.famille.couples_incomplets,
    couples_sans_test: asymetrie.famille.couples_sans_test,
  }));
}

export interface ComparaisonsDUneFamille {
  readonly comparaisons: readonly ComparaisonCondition[];
  readonly paires_exclues: readonly PaireExclue[];
}

export interface ConditionsDUneStrate {
  readonly strate: string;
  readonly modes: ComparaisonsDUneFamille;
  readonly formulations: ComparaisonsDUneFamille;
}

/** §8, « Graines de l'analyse » : la clé d'une différence est la métrique et la strate, puis la paire. */
const METRIQUE_DES_CONDITIONS = "exactitude";

/** Les paires comparées sous la clé `exactitude / <strate>` : le calcul principal et ses recalculs de robustesse. */
function comparerPaires(contexte: ContexteDuRun, paires: readonly PaireCondition[], strate: string): ComparaisonCondition[] {
  return comparerConditions(paires, exactitude, { ...optionsBootstrap(contexte), cle: [METRIQUE_DES_CONDITIONS, strate] });
}

function comparerFamille(contexte: ContexteDuRun, paires: PairesDeCondition, strate: string): ComparaisonsDUneFamille {
  return { comparaisons: comparerPaires(contexte, paires.paires, strate), paires_exclues: paires.paires_exclues };
}

/** Les strates des effets de condition, dans l'ordre publié, et les unités de chacune. */
const STRATES_DES_CONDITIONS: readonly { readonly strate: string; readonly unites: (contexte: ContexteDuRun) => readonly UniteAnalyse[] }[] = [
  { strate: STRATE_GLOBALE, unites: (contexte) => contexte.unites },
  { strate: STRATE_RECENTE, unites: (contexte) => contexte.unites_recentes },
];

function unitesDeLaStrate(contexte: ContexteDuRun, strate: string): readonly UniteAnalyse[] {
  const trouvee = STRATES_DES_CONDITIONS.find((s) => s.strate === strate);
  if (trouvee === undefined) throw new Error(`Strate ${strate} inconnue des effets de condition.`);
  return trouvee.unites(contexte);
}

/** 6. Modes et formulations, sur la strate `global` puis sur `recents:60j`. */
export function calculerConditions(contexte: ContexteDuRun): readonly ConditionsDUneStrate[] {
  return STRATES_DES_CONDITIONS.map(({ strate, unites }) => ({
    strate,
    modes: comparerFamille(contexte, pairesParMode(unites(contexte), contexte.couples), strate),
    formulations: comparerFamille(contexte, pairesParFormulation(unites(contexte), contexte.couples), strate),
  }));
}

export function sectionConditions(contexte: ContexteDuRun, conditions: readonly ConditionsDUneStrate[]): Section<{ readonly strates: readonly ConditionsDUneStrate[] }> {
  return surCouplesCompares(contexte, () => ({ strates: conditions }));
}

/** Ce que la robustesse des différences reprend du calcul principal, sans le recalculer. */
export interface DifferencesDuPrincipal {
  readonly conditions: readonly ConditionsDUneStrate[];
  readonly h3: ComparaisonsDUneFamille;
  readonly tendance: TendanceCalculee | null;
}

/**
 * Le contexte d'un recalcul de robustesse : les unités restreintes (`robustesse.ts:restrictionDe`),
 * tout le reste — partage des couples et des candidats, strates, graines — celui du calcul principal
 * (§8 : « les seuils de non-publication ne sont pas réappliqués à la population restreinte »).
 */
function contexteRestreint(contexte: ContexteDuRun, recalcul: Recalcul): ContexteDuRun {
  const { restreindre } = restrictionDe(contexte.sources_robustesse, recalcul);
  return { ...contexte, unites: restreindre(contexte.unites), unites_recentes: restreindre(contexte.unites_recentes) };
}

interface DescriptionDeFamille {
  readonly famille: Exclude<FamilleDeResultats, "tendance">;
  readonly strate: string;
  /** Les unités sur lesquelles la famille forme ses paires : celles de sa strate, lues dans un contexte. */
  readonly unites: (contexte: ContexteDuRun) => readonly UniteAnalyse[];
  readonly former: (unites: readonly UniteAnalyse[], couples: PartageCouples) => PairesDeCondition;
  readonly principales: ComparaisonsDUneFamille;
  /** Les clés de paire qui comparent le registre orienté lui-même (§8, D69). */
  readonly orientees: ReadonlySet<string>;
}

/** Une famille d'effets de condition : chaque recalcul reforme les paires sur les unités restreintes et les compare sous la même clé. */
function familleDeConditions(contexte: ContexteDuRun, description: DescriptionDeFamille): FamilleDeDifferences {
  const { famille, strate, unites, former, principales, orientees } = description;
  return {
    famille,
    strate,
    principales: principales.comparaisons.map((c) => ({ comparaison: c.cle, difference: c.difference, compare_le_registre_oriente: orientees.has(c.cle) })),
    recalculer: (recalcul, comparaisons) => {
      const restreint = contexteRestreint(contexte, recalcul);
      const paires = former(unites(restreint), contexte.couples).paires.filter((p) => comparaisons.has(p.cle));
      return new Map(comparerPaires(contexte, paires, strate).map((c) => [c.cle, c.difference]));
    },
  };
}

/** La tendance (H5) : chaque run est restreint avec ses propres sources, et garde son propre partage. */
function familleDeTendance(contexte: ContexteDuRun, calculee: TendanceCalculee): FamilleDeDifferences {
  return {
    famille: "tendance",
    strate: STRATE_GLOBALE,
    principales: calculee.tendance.par_outil_et_mode.map((l) => ({ comparaison: cleCouple(l), difference: l.difference, compare_le_registre_oriente: false })),
    recalculer: (recalcul) => {
      const premier = { ...calculee.premier, contexte: contexteRestreint(calculee.premier.contexte, recalcul) };
      return new Map(calculerTendance(contexteRestreint(contexte, recalcul), premier).par_outil_et_mode.map((l) => [cleCouple(l), l.difference]));
    },
  };
}

/**
 * Les familles de résultats du §8 (D69) : modes et formulations de chaque strate des conditions,
 * la différence de H3, puis la tendance quand l'analyse reçoit un premier run.
 */
function famillesDeResultats(contexte: ContexteDuRun, principal: DifferencesDuPrincipal): FamilleDeDifferences[] {
  const orientees = new Set(contexte.couples.compares.flatMap(clesComparantLeRegistreOriente));
  const aucune = new Set<string>();
  const conditions = principal.conditions.flatMap(({ strate, modes, formulations }) => {
    const unites = (c: ContexteDuRun) => unitesDeLaStrate(c, strate);
    return [
      familleDeConditions(contexte, { famille: "modes", strate, unites, former: pairesParMode, principales: modes, orientees: aucune }),
      familleDeConditions(contexte, { famille: "formulations", strate, unites, former: pairesParFormulation, principales: formulations, orientees }),
    ];
  });
  const h3 = familleDeConditions(contexte, { famille: "h3", strate: STRATE_H3, unites: (c) => c.unites, former: pairesDeH3, principales: principal.h3, orientees });
  const tendance = principal.tendance === null ? [] : [familleDeTendance(contexte, principal.tendance)];
  return [...conditions, h3, ...tendance];
}

function tendanceDeLaRobustesse(tendance: TendanceCalculee | null): object {
  return tendance === null ? sansObjet("premier_run_absent") : { statut: "calcule", premier_run_id: tendance.premier.run_id };
}

/**
 * 7. Les taux recalculés (a) à (d), sur le partage et les strates du calcul principal ; puis la
 * fragilité de chaque différence établie (`robustesse.ts:fragiliteDesDifferences`), reprise des
 * sections déjà calculées. `tendance` dit si la famille de la tendance a pu être lue.
 */
export function sectionRobustesse(contexte: ContexteDuRun, principal: DifferencesDuPrincipal): { readonly taux: Section<object>; readonly differences: Section<object> } {
  return {
    taux: surCouplesCompares(contexte, () => ({
      recalculs: tauxRecalcules(contexte.unites, contexte.sources_robustesse, contexte.couples, contexte.strates, contexte.candidats, optionsBootstrap(contexte)).map(
        ({ recalcul, taux }) => ({ recalcul, couples: taux.compares, couples_incomplets: taux.couples_incomplets }),
      ),
    })),
    differences: surCouplesCompares(contexte, () => ({
      tendance: tendanceDeLaRobustesse(principal.tendance),
      resultats: fragiliteDesDifferences(famillesDeResultats(contexte, principal)),
    })),
  };
}

/**
 * La variabilité entre échantillons (§8, D70 (12)) : un diagnostic par couple comparé, sur le partage
 * du calcul principal. Le plan vient des entrées : il dit quelles paires étaient prévues, et combien
 * d'échantillons par question ; à un seul (§12, « 2 → 1 »), la section est absente avec son motif (D73 (6)).
 */
export function sectionVariabilite(contexte: ContexteDuRun, entrees: EntreesDuRun): SansObjet | VariabiliteDesEchantillons {
  if (contexte.couples.compares.length === 0) return sansObjet("aucun_couple_compare");
  return variabiliteDuRun({ couples: contexte.couples, plan: entrees.plan, reponses: entrees.reponses, unites: contexte.unites });
}

/** Une lecture affichée sans note retenue, ou une note sans lecture affichée du run : rien n'est publié. */
export class LectureNonRetenue extends Error {
  readonly lectures: readonly Ulid[];

  constructor(lectures: readonly Ulid[], detail: string) {
    super(`Lectures de comparateur ${lectures.join(", ")} : ${detail} La couverture et l'exactitude des comparateurs (§8) ne se publient pas sur une notation incomplète.`);
    this.name = "LectureNonRetenue";
    this.lectures = lectures;
  }
}

/**
 * Un verdict de lecture dans `verdicts/` : la note d'une lecture est retenue ici depuis ses notations
 * humaines (§6), et le verdict d'une lecture n'est pas encore défini (mode de résolution, drapeau
 * d'échantillon : `pipeline/notation/lectures-comparateur.ts`). Le lire en plus donnerait deux notes.
 */
export class VerdictDeLectureNonDefini extends Error {
  constructor(verdicts: readonly Ulid[]) {
    super(`Verdicts de lecture de comparateur ${verdicts.join(", ")} : la note d'une lecture se retient depuis ses notations humaines (§6), le verdict d'une lecture n'est pas défini.`);
    this.name = "VerdictDeLectureNonDefini";
  }
}

/** La note retenue de chaque lecture affichée ; une lecture à noter ou à arbitrer lève. */
function notesRetenues(etats: readonly EtatDeLecture[]): ReadonlyMap<Ulid, CategorieRetenue> {
  const enAttente = etats.filter((e) => e.statut !== "retenue").map((e) => `${e.lecture_id} (${e.statut})`);
  if (enAttente.length > 0) throw new LectureNonRetenue(enAttente, "notation à compléter ou à arbitrer.");
  return new Map(etats.flatMap((e) => (e.statut === "retenue" ? [[e.lecture_id, e.note.categorie] as const] : [])));
}

/** Chaque note retenue désigne une lecture affichée des comparateurs inclus : une note de trop n'est pas ignorée. */
function exigerNotesConsommees(notes: ReadonlyMap<Ulid, CategorieRetenue>, groupes: ReadonlyMap<IdentifiantCourt, readonly LectureNotee[]>): void {
  const affichees = new Set([...groupes.values()].flat().filter((l) => l.affiche).map((l) => l.lecture_id));
  const orphelines = [...notes.keys()].filter((id) => !affichees.has(id));
  if (orphelines.length > 0) throw new LectureNonRetenue(orphelines, "note retenue sans lecture affichée d'un comparateur inclus du run.");
}

/**
 * Les comparateurs (§8, métriques secondaires ; QR9) : couverture et exactitude de chaque comparateur
 * inclus, sur les items P de référence du run (`metriques.ts:lecturesNoteesParComparateur`, qui lève
 * si les lectures ne les recouvrent pas exactement), avec leurs intervalles
 * (`incertitude.ts:tauxPubliesDuComparateur`). Indépendante des couples d'assistants comparés. Sans
 * comparateur inclus, elle est « sans objet » (`aucun_comparateur_inclus`) ; une lecture d'un outil
 * qui n'est pas un comparateur inclus lève avant.
 */
export function sectionComparateurs(
  contexte: ContexteDuRun,
  entrees: EntreesDuRun,
): Section<{ readonly items_p_de_reference: number; readonly comparateurs: readonly TauxDuComparateur[] }> {
  const verdictsDeLecture = entrees.verdicts.filter((v) => v.objet_note.type === "lecture_comparateur").map((v) => v.id);
  if (verdictsDeLecture.length > 0) throw new VerdictDeLectureNonDefini(verdictsDeLecture);
  const notes = notesRetenues(entrees.etats_des_lectures);
  const groupes = lecturesNoteesParComparateur(entrees.run, entrees.lectures, notes);
  exigerNotesConsommees(notes, groupes);
  if (groupes.size === 0) return sansObjet("aucun_comparateur_inclus");
  return {
    statut: "calcule",
    items_p_de_reference: itemsPDeReference(entrees.run).size,
    comparateurs: [...groupes].map(([outil_id, lectures]) => tauxPubliesDuComparateur(outil_id, lectures, optionsBootstrap(contexte))),
  };
}

/** Le taux de fabrication, strate `global`, de chaque couple comparé : l'entrée de H1, lue dans la section des taux. */
function fabricationsDe(taux: TauxDuRun): FabricationDuCouple[] {
  return taux.compares.map(({ couple, taux: publies }) => {
    const fabrication = publies.find((t) => t.metrique === "fabrication" && t.strate === STRATE_GLOBALE);
    if (fabrication === undefined) throw new Error(`Couple ${cleCouple(couple)} sans taux de fabrication global : H1 indécidable.`);
    return { couple, fabrication: fabrication.taux, intervalle: fabrication.intervalle.intervalle };
  });
}

function strateDesConditions(conditions: readonly ConditionsDUneStrate[], strate: string): ComparaisonsDUneFamille {
  const trouvee = conditions.find((c) => c.strate === strate);
  if (trouvee === undefined) throw new Error(`Strate ${strate} absente des conditions : H2 indécidable.`);
  return trouvee.modes;
}

/**
 * La différence de H3 (§2, 0.27, D63) : neutre moins orientée, sur les seules questions dont l'item
 * principal est F ou O, par couple comparé. Même calcul que la famille des formulations
 * (`comparerFamille`), sous la clé `exactitude / type_item:F+O / <outil>:<mode>:neutre-oriente`
 * (`hypotheses.ts:STRATE_H3`). Rendue telle quelle pour que la robustesse des différences (sous-lot
 * B, D69 : le recalcul (c) y est « sans objet ») la reprenne sans la recalculer.
 */
export function calculerH3(contexte: ContexteDuRun): ComparaisonsDUneFamille {
  return comparerFamille(contexte, pairesDeH3(contexte.unites, contexte.couples), STRATE_H3);
}

/** Le premier run de la tendance (H5) : ce run lui-même, ou un run gelé après, n'a pas de sens. */
export class PremierRunInvalide extends Error {
  constructor(detail: string) {
    super(`--premier : ${detail} La tendance (§8) compare le premier run au dernier.`);
    this.name = "PremierRunInvalide";
  }
}

/** Le premier run, avec le contexte calculé sur son propre partage (§8, seuil de 20 % de CE run). */
export interface PremierRun {
  readonly run_id: Ulid;
  readonly contexte: ContexteDuRun;
}

function verifierPremier(premier: RunAnalyse, dernier: RunAnalyse): void {
  if (premier.id === dernier.id) throw new PremierRunInvalide(`le premier run ${premier.id} est le run analysé.`);
  if (!(Date.parse(premier.date_gel) < Date.parse(dernier.date_gel))) {
    throw new PremierRunInvalide(`le premier run est gelé le ${premier.date_gel}, pas avant le run analysé (${dernier.date_gel}).`);
  }
}

/**
 * La tendance de l'exactitude (§8, QR7) entre le premier run et ce run, strate `global`. Clé
 * `exactitude / global`, à laquelle `tendance.ts` ajoute l'outil puis le mode (§8 : « pour la
 * tendance, l'outil puis le mode »). Chaque run garde son partage : celui du premier run est le sien.
 */
export function calculerTendance(contexte: ContexteDuRun, premier: PremierRun): TendanceDuRun {
  const etat = (c: ContexteDuRun) => ({ unites: c.unites, questions: c.questions, couples: c.couples });
  return tendanceDuRun(etat(premier.contexte), etat(contexte), exactitude, { ...optionsBootstrap(contexte), cle: [METRIQUE_DES_CONDITIONS, STRATE_GLOBALE] });
}

/** La tendance du calcul principal et le premier run dont elle vient : lue par H5 et par la robustesse. */
export interface TendanceCalculee {
  readonly premier: PremierRun;
  readonly tendance: TendanceDuRun;
}

/** La tendance, calculée une fois ; `null` sans premier run. */
export function tendanceCalculee(contexte: ContexteDuRun, premier: PremierRun | null): TendanceCalculee | null {
  return premier === null ? null : { premier, tendance: calculerTendance(contexte, premier) };
}

function sectionH5(contexte: ContexteDuRun, calculee: TendanceCalculee | null): object {
  if (calculee === null) return sansObjet("premier_run_absent");
  // §2 (0.31, D73 (16)) : chaque assistant inclus au premier ou au dernier run est rendu.
  const outils = { premier: calculee.premier.contexte.outils, dernier: contexte.outils };
  // §8 (0.31, D73 (17)) : modèle demandé et identifiants renvoyés de chaque outil, aux deux runs.
  const modeles = { premier: calculee.premier.contexte.modeles, dernier: contexte.modeles };
  return { statut: "calcule", premier_run_id: calculee.premier.run_id, ...decisionH5(outils, calculee.tendance), modeles };
}

/** 8. Les hypothèses lisent les sections déjà calculées, la différence de H3 et la tendance. */
export function sectionHypotheses(
  contexte: ContexteDuRun,
  calculs: { readonly taux: TauxDuRun; readonly asymetrie: AsymetrieCalculee; readonly conditions: readonly ConditionsDUneStrate[]; readonly h3: ComparaisonsDUneFamille },
  tendance: TendanceCalculee | null,
): Readonly<Record<"H1" | "H2" | "H3" | "H4" | "H5", object>> {
  const { taux, asymetrie, conditions, h3 } = calculs;
  return {
    H1: { statut: "calcule", ...decisionH1(contexte.outils, contexte.couples, fabricationsDe(taux)) },
    H2: {
      statut: "calcule",
      outils: decisionH2(contexte.outils, strateDesConditions(conditions, STRATE_GLOBALE), strateDesConditions(conditions, STRATE_RECENTE)),
    },
    H3: { statut: "calcule", strate: STRATE_H3, couples: decisionH3(contexte.couples, h3) },
    H4: { statut: "calcule", ...decisionH4(asymetrie.famille) },
    H5: sectionH5(contexte, tendance),
  };
}

/* ------------------------------------------------------------------ écart juge-éditeur */

/**
 * Les juges avec la liste déclarée au gel ; `null` dès qu'un juge n'en porte pas (run gelé avant le
 * protocole 0.31) : une liste absente n'est jamais lue comme vide.
 */
function jugesDeclares(juges: readonly JugeLuParAnalyse[]): JugeEtSonEditeur[] | null {
  const declares = juges.flatMap(({ juge_id, outils_de_son_editeur }) => (outils_de_son_editeur === undefined ? [] : [{ juge_id, outils_de_son_editeur }]));
  return declares.length === juges.length ? declares : null;
}

/**
 * §7, « Conflit d'intérêts » (0.31, D73 (7)) : l'écart de chaque juge sur l'outil de son propre
 * éditeur (`ecart-juge-editeur.ts`), sur les réponses du canal API du run, avec la liste des outils de
 * son éditeur lue dans `run.json#/juges[]`, déclarée au gel. Clé `exactitude / global`, à laquelle le
 * module ajoute `<juge>:propre-editeur` (§7, §8). Sans objet, avec son motif :
 * - `juge_retire` : §7, « Les notations déjà rendues par le juge retiré sont écartées de tout le run » ;
 *   l'écart compare les deux juges et n'a plus d'objet ;
 * - `outils_de_son_editeur_non_declares` : un juge sans liste déclarée (run gelé avant la 0.31).
 * Un juge dont la liste déclarée est vide est nommé dans `juges_sans_outil_de_leur_editeur`, sans
 * chiffre.
 */
export function sectionEcartJugeEditeur(contexte: ContexteDuRun, entrees: EntreesDuRun): Section<EcartsJugesEditeurs> {
  if (entrees.run.juges.some((juge) => juge.retire)) return sansObjet("juge_retire");
  const juges = jugesDeclares(entrees.run.juges);
  if (juges === null) return sansObjet("outils_de_son_editeur_non_declares");
  const options = { ...optionsBootstrap(contexte), cle: [METRIQUE_DES_CONDITIONS, STRATE_GLOBALE] };
  return { statut: "calcule", ...ecartsJugesEditeurs(contexte.unites, entrees.notations, juges, options) };
}

/* ------------------------------------------------------------------ exploratoire */

/** §3 (D68) : le régime où la corrélation, « non calculée sous trois candidats », est sans objet. */
const REGIME_A_DEUX_CANDIDATS: RegimeInclusion = "entre_deux_tours";

/**
 * §2 : la corrélation de Spearman couverture / erreur, par couple comparé, sur le partage du calcul
 * principal. §3 : « Dans le régime `entre_deux_tours` […] La corrélation exploratoire de la section 2,
 * qui n'est pas calculée sous trois candidats, est publiée « sans objet » avec ce motif. »
 */
export function sectionCorrelation(
  contexte: ContexteDuRun,
  candidats: readonly CandidatAuGel[],
): Section<{ readonly couples: readonly CorrelationCouverture[]; readonly couples_incomplets: readonly CoupleOutilMode[] }> {
  if (contexte.regime_inclusion === REGIME_A_DEUX_CANDIDATS) return sansObjet("moins_de_trois_candidats");
  return surCouplesCompares(contexte, () => {
    const correlations = correlationsParCouple(contexte.unites, contexte.couples, contexte.candidats, candidats);
    return { couples: correlations.compares, couples_incomplets: correlations.couples_incomplets };
  });
}

/** Des réponses de l'application sans sous-échantillon : l'écart porterait sur des questions devinées. */
export class SousEchantillonAbsent extends Error {
  constructor() {
    super(
      "Réponses du canal application sans sous-échantillon de l'application (§6) : l'écart API / application " +
        "n'est apparié que sur les questions du sous-échantillon, jamais sur des questions devinées.",
    );
    this.name = "SousEchantillonAbsent";
  }
}

/**
 * §6, QR8 : l'écart API / application de chaque outil saisi dans l'application, sur le partage du
 * calcul principal. Un assistant inclus sans aucune réponse de l'application est nommé, sans chiffre.
 */
export function sectionEcartApiApplication(
  contexte: ContexteDuRun,
  questions_sous_echantillon: readonly string[] | null,
): Section<EcartsApiApplication & { readonly outils_sans_reponse_application: readonly IdentifiantCourt[] }> {
  if (contexte.unites_application.length === 0) return sansObjet("aucune_reponse_application");
  if (questions_sous_echantillon === null) throw new SousEchantillonAbsent();
  const ecarts = ecartsApiApplication(
    {
      unites: [...contexte.unites, ...contexte.unites_application],
      outils: contexte.modes_de_tete.map(({ outil_id, mode }) => ({ outil_id, mode_de_tete: mode })),
      couples: contexte.couples,
      questions_sous_echantillon,
    },
    optionsBootstrap(contexte),
  );
  const saisis = new Set(contexte.unites_application.map((u) => u.outil_id));
  return { statut: "calcule", ...ecarts, outils_sans_reponse_application: contexte.outils.filter((outil) => !saisis.has(outil)) };
}

/** Les analyses exploratoires préannoncées (§2, §6) : jamais une métrique primaire du §8. */
export function sectionExploratoire(contexte: ContexteDuRun, entrees: EntreesDuRun): object {
  return {
    correlation_couverture: sectionCorrelation(contexte, entrees.run.perimetre.candidats),
    ecart_api_application: sectionEcartApiApplication(contexte, entrees.questions_sous_echantillon),
  };
}

/* ------------------------------------------------------------------ graines */

export interface GrainePubliee {
  readonly cle: readonly string[];
  readonly graine: string;
}

function estGrainePubliee(valeur: object): valeur is GrainePubliee {
  const { cle, graine } = valeur as Partial<GrainePubliee>;
  return Array.isArray(cle) && cle.every((c) => typeof c === "string") && typeof graine === "string";
}

function releverGraines(valeur: unknown, relevees: Map<string, GrainePubliee>): void {
  if (typeof valeur !== "object" || valeur === null) return;
  if (!Array.isArray(valeur) && estGrainePubliee(valeur)) ranger({ cle: valeur.cle, graine: valeur.graine }, relevees);
  for (const sous of Object.values(valeur)) releverGraines(sous, relevees);
}

function ranger(graine: GrainePubliee, relevees: Map<string, GrainePubliee>): void {
  const cle = graine.cle.join("\0");
  const deja = relevees.get(cle);
  if (deja !== undefined && deja.graine !== graine.graine) {
    throw new Error(`Clé [${graine.cle.join(", ")}] publiée avec deux graines (${deja.graine}, ${graine.graine}) : graine non reproductible.`);
  }
  relevees.set(cle, graine);
}

/**
 * 9. Chaque `{cle, graine}` publié dans le document, une fois par clé, trié par clé. Les recalculs de
 * robustesse gardent la clé du calcul principal (§8) : ils ne rajoutent aucune entrée.
 */
export function collecterGraines(document: object): GrainePubliee[] {
  const relevees = new Map<string, GrainePubliee>();
  releverGraines(document, relevees);
  return [...relevees].sort(([a], [b]) => comparerChaines(a, b)).map(([, graine]) => graine);
}

/* ------------------------------------------------------------------ document */

/**
 * SHA-256 de la forme canonique de `run.json`, sans les champs qu'il reçoit après l'analyse, pour
 * qu'une analyse relancée ensuite reste identique : le statut, la publication et le dépôt (§9), et
 * ce que `pnpm go-no-go` y écrit. La liste vit avec les autres champs écrits après le gel
 * (`pipeline/run/champs-posterieurs-au-gel.ts:CHAMPS_HORS_EMPREINTE_DU_RUN`), une seule fois.
 */
export function empreinteDuRun(run: object): string {
  return createHash("sha256").update(canoniser(retirerChamps(run, CHAMPS_HORS_EMPREINTE_DU_RUN)), "utf8").digest("hex");
}

export function entreesPubliees(entrees: EntreesDuRun): object {
  const duRun = entrees.reponses.filter(estDuRun);
  return {
    run_json_sha256: empreinteDuRun(entrees.run),
    tirage_sha256: entrees.run.tirage.sha256,
    donnees_commit: entrees.run.versions.donnees_commit,
    reponses_lues: entrees.reponses.length,
    reponses_obtenues: duRun.filter((r) => r.statut_reponse === "obtenue").length,
    reponses_manquantes: duRun.filter((r) => r.statut_reponse === "manquante").length,
    verdicts_lus: entrees.verdicts.length,
    notations_lues: entrees.notations.length,
  };
}

export function populationDe(contexte: ContexteDuRun): object {
  return {
    regime_inclusion: contexte.regime_inclusion,
    couples_compares: contexte.couples.compares,
    couples_incomplets: contexte.couples.incomplets,
    candidats_compares: contexte.candidats.compares,
    candidats_rapportes_a_part: contexte.candidats.rapportes_a_part,
    strates: contexte.strates,
    modes_de_tete: contexte.modes_de_tete,
  };
}

/** Le premier run de la tendance, sur son propre partage (§8) ; `null` : pas de `--premier`. */
function premierRunDe(premier: EntreesDuRun | null, dernier: EntreesDuRun, parametres: ParametresAnalyse): PremierRun | null {
  if (premier === null) return null;
  verifierPremier(premier.run, dernier.run);
  return { run_id: premier.run.id, contexte: contexteDuRun(premier, assembler(premier), parametres) };
}

/**
 * 2. à 9. Le document `metriques.json` d'un run, sans rien écrire. `premier` : les entrées du premier
 * run de la tendance (H5), ou `null` quand l'analyse n'en reçoit pas (H5 « sans objet »,
 * `premier_run_absent`).
 */
export function analyserRun(entrees: EntreesDuRun, parametres: ParametresAnalyse, premier: EntreesDuRun | null): object {
  const contexte = contexteDuRun(entrees, assembler(entrees), parametres);
  const taux = calculerTaux(contexte);
  const asymetrie = calculerAsymetrie(contexte);
  const conditions = calculerConditions(contexte);
  const h3 = calculerH3(contexte);
  const tendance = tendanceCalculee(contexte, premierRunDe(premier, entrees, parametres));
  const document = {
    run_id: entrees.run.id,
    entrees: entreesPubliees(entrees),
    parametres: contexte.parametres,
    population: populationDe(contexte),
    taux: sectionTaux(contexte, taux),
    asymetrie: sectionAsymetrie(contexte, asymetrie),
    conditions: sectionConditions(contexte, conditions),
    robustesse: sectionRobustesse(contexte, { conditions, h3, tendance }),
    variabilite_echantillons: sectionVariabilite(contexte, entrees),
    comparateurs: sectionComparateurs(contexte, entrees),
    ecart_juge_editeur: sectionEcartJugeEditeur(contexte, entrees),
    hypotheses: sectionHypotheses(contexte, { taux, asymetrie, conditions, h3 }, tendance),
    exploratoire: sectionExploratoire(contexte, entrees),
  };
  return { ...document, graines: collecterGraines(document) };
}

/* ------------------------------------------------------------------ écriture */

/** `metriques.json` existe et diffère du recalcul : rien n'est écrit, jamais d'écrasement. */
export class MetriquesDivergentes extends Error {
  readonly chemin: string;

  constructor(chemin: string) {
    super(
      `${chemin} existe et diffère de l'analyse recalculée : rien n'est écrit (jamais d'écrasement). Un run analysé ` +
        `ne se réanalyse pas en silence ; comprendre l'écart avant toute autre action.`,
    );
    this.name = "MetriquesDivergentes";
    this.chemin = chemin;
  }
}

export type IssueMetriques = "ecrit" | "inchange";

export function cheminMetriques(repertoire_run: string): string {
  return join(dispositionRunNote(repertoire_run).run, "metriques", "metriques.json");
}

/** 10. Valide le document avant tout, puis l'écrit s'il est absent ; identique, rien ; différent, refus. */
export function validerEtEcrire(chemin: string, document: unknown): IssueMetriques {
  const texte = `${JSON.stringify(valider<object>("metriques", document, `${chemin} avant écriture`), null, 2)}\n`;
  if (existsSync(chemin)) {
    if (readFileSync(chemin, "utf8") === texte) return "inchange";
    throw new MetriquesDivergentes(chemin);
  }
  mkdirSync(join(chemin, ".."), { recursive: true });
  const provisoire = `${chemin}.${process.pid}.provisoire`;
  writeFileSync(provisoire, texte, "utf8");
  renameSync(provisoire, chemin);
  return "ecrit";
}

export interface ResultatAnalyse {
  readonly chemin: string;
  readonly issue: IssueMetriques;
  readonly document: object;
}

/**
 * `pnpm analyze` : lire, analyser, valider, écrire. `repertoire_premier` : le premier run de la
 * tendance (`--premier`), lu et validé comme le run analysé, ou `null`.
 */
export function analyserEtEcrire(
  repertoire_run: string,
  options: OptionsLectureAnalyse,
  parametres: ParametresAnalyse,
  repertoire_premier: string | null,
): ResultatAnalyse {
  const premier = repertoire_premier === null ? null : lireEntreesDuRun(repertoire_premier, options);
  const document = analyserRun(lireEntreesDuRun(repertoire_run, options), parametres, premier);
  const chemin = cheminMetriques(repertoire_run);
  return { chemin, issue: validerEtEcrire(chemin, document), document };
}
