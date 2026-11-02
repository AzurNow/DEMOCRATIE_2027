/**
 * Règles de décision des hypothèses préenregistrées H1, H2 et H4 (§2, protocole 0.24, D59 (2)
 * à (4) ; protocole 0.25, D60 : outils « sans objet » de H1 et de H2, sens de lecture de H2).
 *
 * Ce module ne calcule aucune métrique : il lit des résultats déjà produits ailleurs dans
 * `analysis/` (intervalles du taux de fabrication, comparaisons de modes de `conditions.ts`,
 * famille de Holm de `permutation.ts`) et leur applique la règle écrite au §2. Chaque décision
 * rend aussi ce qu'elle a lu, pour qu'un lecteur la refasse à la main.
 *
 * H3 et H5 ne sont pas ici : D59 ne leur a pas écrit de règle de décision.
 */

import type { DifferenceTaux } from "./bootstrap.ts";
import { cleComparaisonModes, type ComparaisonCondition, type PaireExclue } from "./conditions.ts";
import type { FamilleAsymetrie } from "./permutation.ts";
import { cleCouple, type PartageCouples } from "./seuils.ts";
import type { CoupleOutilMode, IdentifiantCourt, Intervalle95, Taux, Ulid } from "./types.ts";

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
export type VerdictH1 = "confirmee" | "infirmee" | "sans_objet";

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
  return decides.every((d) => d.verdict === "vraie") ? "confirmee" : "infirmee";
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

/** Ce que `pairesParMode` puis `comparerConditions` rendent pour une strate. */
export interface ComparaisonsDeModes {
  readonly comparaisons: readonly ComparaisonCondition[];
  readonly paires_exclues: readonly PaireExclue[];
}

/**
 * La différence de modes d'un outil telle que publiée (§8, 0.25) : web activée moins web
 * désactivée, dans l'ordre de sa clé, comme `conditions.ts` la calcule (bras a = web activée).
 * Elle est lue telle quelle, ni recalculée ni retournée.
 */
export type DifferenceModesH2 =
  | {
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
      `H2 : la différence ${cle} vaut ${difference} mais son intervalle établi est [${intervalle.bas}, ${intervalle.haut}] : ` +
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

function differencePubliee(comparaison: ComparaisonCondition): DifferenceModesH2 {
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
  return difference.qualificatif === "etablie" && difference.difference > 0 ? "confirmee" : "non_confirmee";
}

/* ------------------------------------------------------------------ H4 */

/** §2 (0.24) : « valeur p corrigée strictement inférieure à 0,05 ». */
export const SEUIL_H4 = 0.05;

export type VerdictH4 = "confirmee" | "infirmee" | "indecidable";

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
  return sousLeSeuil > 0 ? "confirmee" : "infirmee";
}
