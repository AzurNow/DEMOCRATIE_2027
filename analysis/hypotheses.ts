/**
 * Règles de décision des hypothèses préenregistrées H1 à H5 (§2, protocole 0.24, D59 (2) à (4) ;
 * protocole 0.25, D60 : outils « sans objet » de H1 et de H2, sens de lecture de H2 ; protocole
 * 0.27, D63 : règles de H3 et de H5 ; D67 : une hypothèse non confirmée n'est jamais dite
 * « infirmée », son verdict est `non_confirmee` ; décision D70 de la session principale : H5 d'un
 * outil à deux modes).
 *
 * Ce module ne calcule aucune métrique : il lit des résultats déjà produits ailleurs dans
 * `analysis/` (intervalles du taux de fabrication, comparaisons de modes et de formulations de
 * `conditions.ts`, famille de Holm de `permutation.ts`, tendance de `tendance.ts`) et leur applique
 * la règle écrite au §2. Chaque décision rend aussi ce qu'elle a lu, pour qu'un lecteur la refasse
 * à la main.
 */

import type { DifferenceTaux } from "./bootstrap.ts";
import { cleComparaisonH3, cleComparaisonModes, type ComparaisonCondition, type PaireExclue } from "./conditions.ts";
import type { FamilleAsymetrie } from "./permutation.ts";
import { cleCouple, type PartageCouples } from "./seuils.ts";
import type { CoupleExcluDeLaTendance, TendanceDuRun, TendanceOutilEtMode } from "./tendance.ts";
import type { CoupleOutilMode, IdentifiantCourt, Intervalle95, Taux, Ulid } from "./types.ts";

/**
 * Verdict d'une hypothèse, d'un outil ou d'un couple. §2 (0.27, D67) : « une hypothèse non
 * confirmée n'est jamais dite « infirmée », l'absence de confirmation pouvant tenir au manque de
 * puissance ».
 */
export type VerdictHypothese = "confirmee" | "non_confirmee" | "sans_objet";

/** Une hypothèse décidée sur aucun outil serait vraie par vacuité : refusée. */
export class OutilsAbsents extends Error {
  constructor(hypothese: string) {
    super(`${hypothese} : aucun outil déclaré, la règle de décision du §2 ne s'applique à rien.`);
    this.name = "OutilsAbsents";
  }
}

function verifierOutils(outils: readonly IdentifiantCourt[], hypothese: string): void {
  if (outils.length === 0) throw new OutilsAbsents(hypothese);
  if (new Set(outils).size !== outils.length) throw new Error(`${hypothese} : outil déclaré deux fois.`);
}

/* ------------------------------------------------------------------ H1 */

/**
 * Le taux de fabrication d'un couple comparé, strate `global`, et son intervalle à 95 % (§8),
 * tels que calculés ailleurs. `intervalle` est `null` quand le bootstrap n'en a pas produit.
 */
export interface FabricationDuCouple {
  readonly couple: CoupleOutilMode;
  readonly fabrication: Taux;
  readonly intervalle: Intervalle95 | null;
}

/**
 * Un couple « comparé » au sens du §2 : « ni sans objet ni marqués « run incomplet » ». Un couple
 * sans aucune réponse classée aux items A et F (dénominateur nul) est tenu pour sans objet.
 */
export type EtatCoupleH1 = "compare" | "sans_objet" | "incomplet";

export interface CoupleH1 {
  readonly cle: string;
  readonly etat: EtatCoupleH1;
  /** `null` hors d'un couple comparé, ou sur un couple comparé sans intervalle. */
  readonly borne_inferieure: number | null;
  readonly borne_strictement_positive: boolean;
}

export type VerdictH1Outil = "vraie" | "fausse" | "sans_objet";

export interface DecisionH1Outil {
  readonly outil_id: IdentifiantCourt;
  readonly verdict: VerdictH1Outil;
  /** Tous les couples de l'outil dans le partage, comparés ou non, dans l'ordre du partage. */
  readonly couples: readonly CoupleH1[];
}

/**
 * §2 (0.25) : « confirmée quand elle est vraie pour tous les outils qui ont au moins un couple
 * comparé » ; « sans objet » quand aucun outil n'a de couple comparé.
 */
export type VerdictH1 = VerdictHypothese;

export interface DecisionH1 {
  readonly verdict: VerdictH1;
  readonly outils: readonly DecisionH1Outil[];
}

/** Les fabrications fournies ne couvrent pas exactement les couples comparés du partage. */
export class FabricationsIncoherentes extends Error {
  constructor(detail: string) {
    super(`H1 : ${detail}`);
    this.name = "FabricationsIncoherentes";
  }
}

/**
 * §2 (0.25) : « H1 est vraie pour un outil quand l'un au moins de ses couples outil × mode
 * comparés […] a une borne inférieure strictement supérieure à 0 ; un outil qui n'a aucun couple
 * comparé est publié « sans objet » pour H1. H1 est confirmée quand elle est vraie pour tous les
 * outils qui ont au moins un couple comparé ; un outil « sans objet » n'entre pas dans ce verdict,
 * et quand aucun outil n'a de couple comparé, H1 est publiée « sans objet ». »
 *
 * `outils` : les assistants inclus du run, dans l'ordre de publication. `fabrications` : une entrée
 * par couple comparé du partage, et aucune autre.
 */
export function decisionH1(
  outils: readonly IdentifiantCourt[],
  couples: PartageCouples,
  fabrications: readonly FabricationDuCouple[],
): DecisionH1 {
  verifierOutils(outils, "H1");
  const parCle = indexerFabrications(fabrications, couples);
  verifierOutilsDuPartage(couples, outils);
  const decisions = outils.map((outil_id) => decisionH1Outil(outil_id, couples, parCle));
  return { verdict: verdictH1(decisions), outils: decisions };
}

function verdictH1(decisions: readonly DecisionH1Outil[]): VerdictH1 {
  const decides = decisions.filter((d) => d.verdict !== "sans_objet");
  if (decides.length === 0) return "sans_objet";
  return decides.every((d) => d.verdict === "vraie") ? "confirmee" : "non_confirmee";
}

function indexerFabrications(
  fabrications: readonly FabricationDuCouple[],
  couples: PartageCouples,
): Map<string, FabricationDuCouple> {
  const compares = new Set(couples.compares.map(cleCouple));
  const parCle = new Map<string, FabricationDuCouple>();
  for (const fabrication of fabrications) {
    const cle = cleCouple(fabrication.couple);
    if (!compares.has(cle)) throw new FabricationsIncoherentes(`fabrication fournie pour ${cle}, qui n'est pas un couple comparé.`);
    if (parCle.has(cle)) throw new FabricationsIncoherentes(`fabrication du couple ${cle} fournie deux fois.`);
    parCle.set(cle, fabrication);
  }
  const manquants = [...compares].filter((cle) => !parCle.has(cle));
  if (manquants.length > 0) throw new FabricationsIncoherentes(`couples comparés sans fabrication : ${manquants.join(", ")}.`);
  return parCle;
}

function verifierOutilsDuPartage(couples: PartageCouples, outils: readonly IdentifiantCourt[]): void {
  const declares = new Set(outils);
  for (const couple of [...couples.compares, ...couples.incomplets]) {
    if (!declares.has(couple.outil_id)) {
      throw new FabricationsIncoherentes(`couple ${cleCouple(couple)} d'un outil non déclaré.`);
    }
  }
}

function decisionH1Outil(
  outil_id: IdentifiantCourt,
  couples: PartageCouples,
  parCle: ReadonlyMap<string, FabricationDuCouple>,
): DecisionH1Outil {
  const lus = [
    ...couples.compares.filter((c) => c.outil_id === outil_id).map((c) => coupleCompareH1(parCle.get(cleCouple(c)) as FabricationDuCouple)),
    ...couples.incomplets.filter((c) => c.outil_id === outil_id).map((c) => coupleNonCompare(cleCouple(c), "incomplet")),
  ];
  return { outil_id, verdict: verdictH1Outil(lus), couples: lus };
}

function coupleCompareH1(fabrication: FabricationDuCouple): CoupleH1 {
  const cle = cleCouple(fabrication.couple);
  if (fabrication.fabrication.denominateur === 0) return coupleNonCompare(cle, "sans_objet");
  const borne = fabrication.intervalle === null ? null : fabrication.intervalle.bas;
  return { cle, etat: "compare", borne_inferieure: borne, borne_strictement_positive: borne !== null && borne > 0 };
}

function coupleNonCompare(cle: string, etat: "sans_objet" | "incomplet"): CoupleH1 {
  return { cle, etat, borne_inferieure: null, borne_strictement_positive: false };
}

function verdictH1Outil(couples: readonly CoupleH1[]): VerdictH1Outil {
  if (!couples.some((c) => c.etat === "compare")) return "sans_objet";
  return couples.some((c) => c.borne_strictement_positive) ? "vraie" : "fausse";
}

/* ------------------------------------------------------------------ H2 */

/** Ce que `pairesParMode` (ou `pairesDeH3`) puis `comparerConditions` rendent pour une strate. */
export interface ComparaisonsDeConditions {
  readonly comparaisons: readonly ComparaisonCondition[];
  readonly paires_exclues: readonly PaireExclue[];
}

export type ComparaisonsDeModes = ComparaisonsDeConditions;

/**
 * Une différence appariée de `conditions.ts` telle que publiée, dans l'ordre de sa clé (bras a
 * moins bras b) : lue telle quelle, ni recalculée ni retournée.
 */
export interface DifferenceComparee {
  readonly statut: "comparee";
  /** La clé de bootstrap de la comparaison, telle que publiée : elle nomme le sens a − b. */
  readonly cle: readonly string[];
  readonly graine: string;
  readonly difference: number | null;
  readonly intervalle: Intervalle95 | null;
  readonly qualificatif: DifferenceTaux["qualificatif"];
  readonly grappes_appariees: number;
  readonly grappes_exclues: readonly Ulid[];
}

/**
 * La règle commune de H2, H3 et H5 : « établie (section 8) et positive ». Une différence sans
 * qualificatif (une seule grappe, aucun intervalle) n'est pas établie.
 */
function estEtablieEtPositive(difference: { readonly difference: number | null; readonly qualificatif: DifferenceTaux["qualificatif"] }): boolean {
  return difference.qualificatif === "etablie" && difference.difference !== null && difference.difference > 0;
}

/**
 * La différence de modes d'un outil telle que publiée (§8, 0.25) : web activée moins web
 * désactivée, dans l'ordre de sa clé, comme `conditions.ts` la calcule (bras a = web activée).
 */
export type DifferenceModesH2 =
  | DifferenceComparee
  /** §8 : un mode « run incomplet » exclut la comparaison. */
  | { readonly statut: "exclue"; readonly couples_incomplets: readonly string[] }
  /** L'outil n'a pas de réponses dans les deux modes : aucune paire n'a été formée. */
  | { readonly statut: "absente" };

/**
 * §2 (0.25) : « sans objet » quand les deux modes ne sont pas comparés. `non_confirmee` n'est pas
 * un mot du §2 : c'est l'absence de confirmation d'une différence comparée, jamais une infirmation.
 */
export type VerdictH2Outil = "confirmee" | "non_confirmee" | "sans_objet";

export interface DecisionH2Outil {
  readonly outil_id: IdentifiantCourt;
  /** Lu sur la strate `global` seule. */
  readonly verdict: VerdictH2Outil;
  readonly global: DifferenceModesH2;
  /** Résultat secondaire : publié, jamais lu par la décision. */
  readonly moins_de_60_jours: DifferenceModesH2;
}

export class ComparaisonsDeModesIncoherentes extends Error {
  constructor(detail: string) {
    super(`H2 : ${detail}`);
    this.name = "ComparaisonsDeModesIncoherentes";
  }
}

/** Une différence qualifiée d'établie dont le signe contredit son propre intervalle. */
export class SigneDifferenceIncoherent extends Error {
  constructor(cle: string, difference: number, intervalle: Intervalle95) {
    super(
      `La différence ${cle} vaut ${difference} mais son intervalle établi est [${intervalle.bas}, ${intervalle.haut}] : ` +
        "le signe de la différence n'est pas décidable.",
    );
    this.name = "SigneDifferenceIncoherent";
  }
}

/**
 * §2 (0.25) : « H2 est confirmée pour un outil quand la différence de son exactitude, strate
 * `global`, web désactivée moins web activée, est établie (section 8) et négative. Un outil dont
 * les deux modes ne sont pas comparés, parce que l'un est sans objet ou que l'un de ses couples
 * est marqué « run incomplet » (section 8), est publié « sans objet » pour H2. H2 n'a pas de
 * verdict global : elle est publiée outil par outil. La même différence, restreinte aux questions
 * dont l'item principal date de moins de 60 jours, est publiée comme résultat secondaire. »
 *
 * §8 (0.25) : « La différence des modes est publiée web activée moins web désactivée, dans l'ordre
 * de sa clé ; H2, écrite dans l'autre sens (section 2), en lit l'opposé : elle est confirmée pour
 * un outil quand cette différence publiée est établie et positive. »
 *
 * « Sans objet » se lit sur le statut de `global` : `exclue` (un couple « run incomplet »),
 * `absente` (un mode sans aucune réponse), ou `comparee` sans différence (un mode sans réponse
 * classée sur les items appariés : son exactitude n'est pas définie, comme le couple sans
 * dénominateur tenu pour sans objet par H1). Aucun verdict global n'est rendu.
 */
export function decisionH2(
  outils: readonly IdentifiantCourt[],
  global: ComparaisonsDeModes,
  moins_de_60_jours: ComparaisonsDeModes,
): DecisionH2Outil[] {
  verifierOutils(outils, "H2");
  const parOutilGlobal = indexerModes(global, outils);
  const parOutilRecent = indexerModes(moins_de_60_jours, outils);
  return outils.map((outil_id) => {
    const differenceGlobale = differenceDe(parOutilGlobal, outil_id);
    return {
      outil_id,
      verdict: verdictH2Outil(differenceGlobale),
      global: differenceGlobale,
      moins_de_60_jours: differenceDe(parOutilRecent, outil_id),
    };
  });
}

/** Un outil sans paire formée est rendu « absente », nommément : ni comparé, ni exclu. */
function differenceDe(parOutil: ReadonlyMap<IdentifiantCourt, DifferenceModesH2>, outil_id: IdentifiantCourt): DifferenceModesH2 {
  const difference = parOutil.get(outil_id);
  if (difference === undefined) return { statut: "absente" };
  return difference;
}

function indexerModes(entree: ComparaisonsDeModes, outils: readonly IdentifiantCourt[]): Map<IdentifiantCourt, DifferenceModesH2> {
  const parOutil = new Map<IdentifiantCourt, DifferenceModesH2>();
  const ranger = (cle: string, difference: DifferenceModesH2): void => {
    const outil_id = outilDeLaCle(cle, outils);
    if (parOutil.has(outil_id)) throw new ComparaisonsDeModesIncoherentes(`deux comparaisons de modes pour l'outil ${outil_id}.`);
    parOutil.set(outil_id, difference);
  };
  for (const comparaison of entree.comparaisons) ranger(comparaison.cle, differencePubliee(comparaison));
  for (const exclue of entree.paires_exclues) ranger(exclue.cle, { statut: "exclue", couples_incomplets: exclue.couples_incomplets });
  return parOutil;
}

function outilDeLaCle(cle: string, outils: readonly IdentifiantCourt[]): IdentifiantCourt {
  const outil_id = outils.find((o) => cle === cleComparaisonModes(o));
  if (outil_id === undefined) {
    throw new ComparaisonsDeModesIncoherentes(`clé « ${cle} » : ni une comparaison de modes, ni celle d'un outil déclaré.`);
  }
  return outil_id;
}

function differencePubliee(comparaison: ComparaisonCondition): DifferenceComparee {
  const { difference } = comparaison;
  verifierSigne(comparaison.cle, difference.difference, difference.intervalle, difference.qualificatif);
  return {
    statut: "comparee",
    cle: difference.cle,
    graine: difference.graine,
    difference: difference.difference,
    intervalle: difference.intervalle,
    qualificatif: difference.qualificatif,
    grappes_appariees: comparaison.grappes_appariees,
    grappes_exclues: comparaison.grappes_exclues,
  };
}

/**
 * Une différence établie a un intervalle entièrement d'un côté de zéro ; sa valeur doit être du
 * même côté. Sinon « positive » dépendrait de ce qu'on lit, la valeur ou l'intervalle : refusé.
 */
function verifierSigne(
  cle: string,
  difference: number | null,
  intervalle: Intervalle95 | null,
  qualificatif: DifferenceTaux["qualificatif"],
): void {
  if (qualificatif !== "etablie" || difference === null || intervalle === null) return;
  const coherent = intervalle.haut < 0 ? difference < 0 : difference > 0;
  if (!coherent) throw new SigneDifferenceIncoherent(cle, difference, intervalle);
}

/** Une seule grappe (qualificatif `null`) ou une différence non établie : `non_confirmee`. */
function verdictH2Outil(difference: DifferenceModesH2): VerdictH2Outil {
  if (difference.statut !== "comparee" || difference.difference === null) return "sans_objet";
  return estEtablieEtPositive(difference) ? "confirmee" : "non_confirmee";
}

/* ------------------------------------------------------------------ H3 */

/**
 * La strate de la clé de graine de la différence de H3 (§8, « Graines de l'analyse »). Le §8 ne
 * nomme pas de strate pour une restriction au type de l'item principal : ce composant est choisi
 * ici, sur le modèle `<dimension>:<valeur>` des autres strates, pour que la différence de H3
 * (`bootstrap / exactitude / type_item:F+O / <outil>:<mode>:neutre-oriente`) ait sa propre graine,
 * distincte de la paire neutre − orientée sur tous les items (`… / global / …`).
 */
export const STRATE_H3 = "type_item:F+O";

/** Pourquoi un couple est « sans objet » pour H3. */
export type MotifSansObjetH3 =
  /** §2 : « marqué run incomplet (section 8) ». */
  | "couple_incomplet"
  /** Couple comparé sans réponse à une question F ou O dans le registre neutre ou l'orienté. */
  | "paire_absente"
  /** La paire est formée, mais l'un des registres n'a aucune réponse classée : pas d'exactitude. */
  | "exactitude_indefinie";

export interface CoupleH3 {
  readonly cle: string;
  readonly verdict: VerdictHypothese;
  /** `null` hors d'un verdict « sans objet ». */
  readonly motif: MotifSansObjetH3 | null;
  /** Neutre moins orientée, telle que publiée ; `null` sans paire comparée. */
  readonly difference: DifferenceComparee | null;
}

export class ComparaisonsH3Incoherentes extends Error {
  constructor(detail: string) {
    super(`H3 : ${detail}`);
    this.name = "ComparaisonsH3Incoherentes";
  }
}

/**
 * §2 (0.27, D63) : « H3 est confirmée pour un couple outil × mode comparé quand la différence
 * appariée de son exactitude, formulation neutre moins formulation orientée, restreinte aux
 * questions dont l'item principal est un item F ou O, est établie (section 8) et positive. Un
 * couple qui n'est pas comparé, c'est-à-dire sans objet ou marqué « run incomplet » (section 8),
 * est publié « sans objet » pour H3. H3 n'a pas de verdict global : elle est publiée couple par
 * couple. »
 *
 * `comparaisons` : ce que `pairesDeH3` puis `comparerConditions` rendent. Une ligne par couple du
 * partage, comparés puis incomplets, dans l'ordre du partage. Une différence ni établie ni non
 * établie (une seule grappe, ou la règle du zéro observé du §8 quand elle rend un qualificatif
 * nul) n'est pas établie : le couple est `non_confirmee`.
 */
export function decisionH3(couples: PartageCouples, comparaisons: ComparaisonsDeConditions): CoupleH3[] {
  const parCle = indexerH3(comparaisons, couples);
  return [
    ...couples.compares.map((couple) => coupleCompareH3(cleCouple(couple), parCle.get(cleComparaisonH3(couple)))),
    ...couples.incomplets.map((couple): CoupleH3 => ({ cle: cleCouple(couple), verdict: "sans_objet", motif: "couple_incomplet", difference: null })),
  ];
}

function indexerH3(entree: ComparaisonsDeConditions, couples: PartageCouples): Map<string, ComparaisonCondition> {
  const compares = new Set(couples.compares.map(cleComparaisonH3));
  const incomplets = new Set(couples.incomplets.map(cleComparaisonH3));
  const parCle = new Map<string, ComparaisonCondition>();
  for (const comparaison of entree.comparaisons) {
    if (!compares.has(comparaison.cle)) throw new ComparaisonsH3Incoherentes(`comparaison « ${comparaison.cle} » hors des couples comparés.`);
    if (parCle.has(comparaison.cle)) throw new ComparaisonsH3Incoherentes(`comparaison « ${comparaison.cle} » fournie deux fois.`);
    parCle.set(comparaison.cle, comparaison);
  }
  for (const exclue of entree.paires_exclues) {
    if (!incomplets.has(exclue.cle)) throw new ComparaisonsH3Incoherentes(`paire exclue « ${exclue.cle} » hors des couples incomplets.`);
  }
  return parCle;
}

function coupleCompareH3(cle: string, comparaison: ComparaisonCondition | undefined): CoupleH3 {
  if (comparaison === undefined) return { cle, verdict: "sans_objet", motif: "paire_absente", difference: null };
  const difference = differencePubliee(comparaison);
  if (difference.difference === null) return { cle, verdict: "sans_objet", motif: "exactitude_indefinie", difference };
  return { cle, verdict: estEtablieEtPositive(difference) ? "confirmee" : "non_confirmee", motif: null, difference };
}

/* ------------------------------------------------------------------ H5 */

/** La tendance d'un couple telle que publiée : dernier run moins premier (`tendance.ts`). */
export interface TendancePubliee {
  readonly cle: readonly string[];
  readonly graine: string;
  readonly difference: number | null;
  readonly intervalle: Intervalle95 | null;
  readonly qualificatif: DifferenceTaux["qualificatif"];
  readonly questions_communes: number;
  readonly questions_exclues: readonly string[];
}

/** Pourquoi un couple est « sans objet » pour H5. */
export type MotifSansObjetH5 =
  /** §8 : « marqué run incomplet au premier ou au dernier run », il sort de la comparaison. */
  | "couple_exclu_de_la_tendance"
  /** Le couple n'a pas de différence : présent à un seul run, ou sans réponse classée commune. */
  | "tendance_indefinie";

export interface CoupleH5 {
  readonly cle: string;
  readonly verdict: VerdictHypothese;
  readonly motif: MotifSansObjetH5 | null;
  readonly tendance: TendancePubliee | null;
  /** Le run où le couple est incomplet (§8 : « rapporté avec le run où il est incomplet »). */
  readonly exclusion: { readonly incomplet_au_premier: boolean; readonly incomplet_au_dernier: boolean } | null;
}

export interface DecisionH5Outil {
  readonly outil_id: IdentifiantCourt;
  readonly verdict: VerdictHypothese;
  readonly couples: readonly CoupleH5[];
}

export interface DecisionH5 {
  /** §8 : les questions sorties de la comparaison parce qu'un de leurs textes a changé. */
  readonly questions_texte_change: number;
  readonly outils: readonly DecisionH5Outil[];
}

export class TendanceIncoherente extends Error {
  constructor(detail: string) {
    super(`H5 : ${detail}`);
    this.name = "TendanceIncoherente";
  }
}

/**
 * §2 (0.27, D63) : « H5 est confirmée pour un outil quand la tendance de son exactitude (section 8)
 * est établie et positive. Un couple outil × mode qui sort de la comparaison de tendance (section
 * 8) est publié « sans objet » pour H5. »
 *
 * D70 (décision de la session principale, que le §2 ne dit pas) : pour un outil à deux modes
 * comparés, H5 est confirmée pour l'outil seulement quand la tendance est établie et positive pour
 * **chacun** de ses couples comparés dans la tendance ; au moins un couple comparé sans que tous
 * soient confirmés, l'outil est « non confirmée » ; aucun couple comparé, il est « sans objet ».
 * Le résultat de chaque couple est publié.
 *
 * `outils` : les assistants inclus du dernier run. Une ligne de tendance d'un autre outil lève :
 * le §2 ne dit pas ce que devient un outil sorti du périmètre entre les deux runs.
 */
export function decisionH5(outils: readonly IdentifiantCourt[], tendance: TendanceDuRun): DecisionH5 {
  verifierOutils(outils, "H5");
  verifierOutilsDeLaTendance(tendance, outils);
  return {
    questions_texte_change: tendance.questions_texte_change,
    outils: outils.map((outil_id) => decisionH5Outil(outil_id, tendance)),
  };
}

function verifierOutilsDeLaTendance(tendance: TendanceDuRun, outils: readonly IdentifiantCourt[]): void {
  const declares = new Set(outils);
  for (const couple of [...tendance.par_outil_et_mode, ...tendance.couples_exclus]) {
    if (!declares.has(couple.outil_id)) throw new TendanceIncoherente(`couple ${cleCouple(couple)} d'un outil que le dernier run ne déclare pas.`);
  }
}

function decisionH5Outil(outil_id: IdentifiantCourt, tendance: TendanceDuRun): DecisionH5Outil {
  const couples = [
    ...tendance.par_outil_et_mode.filter((l) => l.outil_id === outil_id).map(coupleCompareH5),
    ...tendance.couples_exclus.filter((c) => c.outil_id === outil_id).map(coupleExcluH5),
  ];
  return { outil_id, verdict: verdictH5Outil(couples), couples };
}

function coupleCompareH5(ligne: TendanceOutilEtMode): CoupleH5 {
  const { difference } = ligne;
  verifierSigne(difference.cle.join(" / "), difference.difference, difference.intervalle, difference.qualificatif);
  const tendance: TendancePubliee = {
    cle: difference.cle,
    graine: difference.graine,
    difference: difference.difference,
    intervalle: difference.intervalle,
    qualificatif: difference.qualificatif,
    questions_communes: ligne.questions_communes,
    questions_exclues: ligne.questions_exclues,
  };
  const cle = cleCouple(ligne);
  if (difference.difference === null) return { cle, verdict: "sans_objet", motif: "tendance_indefinie", tendance, exclusion: null };
  return { cle, verdict: estEtablieEtPositive(difference) ? "confirmee" : "non_confirmee", motif: null, tendance, exclusion: null };
}

function coupleExcluH5(couple: CoupleExcluDeLaTendance): CoupleH5 {
  return {
    cle: cleCouple(couple),
    verdict: "sans_objet",
    motif: "couple_exclu_de_la_tendance",
    tendance: null,
    exclusion: { incomplet_au_premier: couple.incomplet_au_premier, incomplet_au_dernier: couple.incomplet_au_dernier },
  };
}

/** D70 : confirmée seulement si chaque couple comparé l'est ; sans objet sans couple comparé. */
function verdictH5Outil(couples: readonly CoupleH5[]): VerdictHypothese {
  const compares = couples.filter((c) => c.verdict !== "sans_objet");
  if (compares.length === 0) return "sans_objet";
  return compares.every((c) => c.verdict === "confirmee") ? "confirmee" : "non_confirmee";
}

/* ------------------------------------------------------------------ H4 */

/** §2 (0.24) : « valeur p corrigée strictement inférieure à 0,05 ». */
export const SEUIL_H4 = 0.05;

export type VerdictH4 = "confirmee" | "non_confirmee" | "indecidable";

export interface DecisionH4 {
  readonly verdict: VerdictH4;
  readonly seuil: number;
  /** Clés `cleCouple` des couples dont la valeur p corrigée est strictement sous le seuil. */
  readonly couples_sous_le_seuil: readonly string[];
  /** Taille de la famille de Holm : les couples qui ont un test. */
  readonly couples_testes: number;
}

/**
 * §2 (0.24) : « H4 est confirmée quand au moins un couple outil × mode a une valeur p corrigée
 * strictement inférieure à 0,05. Quand aucun couple n'a de test, H4 est publiée « indécidable »,
 * jamais infirmée. » La famille vient de `permutation.ts:corrigerFamilleAsymetrie`, seule à
 * appliquer Holm (`holm.ts`).
 */
export function decisionH4(famille: FamilleAsymetrie): DecisionH4 {
  const couples_testes = famille.corrigees.length;
  const couples_sous_le_seuil = famille.corrigees.filter((p) => p.corrigee < SEUIL_H4).map((p) => p.cle);
  return { verdict: verdictH4(couples_testes, couples_sous_le_seuil.length), seuil: SEUIL_H4, couples_sous_le_seuil, couples_testes };
}

function verdictH4(testes: number, sousLeSeuil: number): VerdictH4 {
  if (testes === 0) return "indecidable";
  return sousLeSeuil > 0 ? "confirmee" : "non_confirmee";
}
