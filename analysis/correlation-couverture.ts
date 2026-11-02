/**
 * Corrélation exploratoire entre le taux d'erreur par candidat et sa couverture (§2, protocole 0.24,
 * D59 (5)).
 *
 * « Elle est calculée pour chaque couple outil × mode comparé : c'est le coefficient de rang de
 * Spearman entre le taux d'erreur de chaque candidat, un moins son exactitude, et le nombre de ses
 * items P vérifiés, compté comme pour le seuil de couverture (section 4) ; les candidats sous ce
 * seuil n'y entrent pas. Elle est publiée sans intervalle, avec l'étiquette « exploratoire ». Sous
 * trois candidats, elle n'est pas calculée, et le motif est publié. »
 *
 * Lectures, toutes visibles dans la sortie :
 *
 * - **L'exactitude d'un candidat** est celle de `metriques.ts:exactitudeParCandidat`, sur le partage
 *   du seuil de couverture lu au gel (`seuils.ts:candidatsComparables`) : la métrique ne vit pas ici.
 *   Le taux d'erreur est rendu comme un `Taux` exact (inexactes / classées), égal à un moins
 *   l'exactitude ; les ex æquo se décident sur l'égalité des fractions, jamais sur des flottants.
 * - **Le nombre d'items P vérifiés** est `items_p_verifies`, compté au gel et stocké (§4) : lu,
 *   jamais recompté.
 * - **Un candidat comparé sans réponse classée** dans le couple n'a pas de taux d'erreur : il ne peut
 *   pas être classé, n'entre pas dans le coefficient, et est nommé dans `candidats_sans_exactitude`.
 *   Le seuil de trois candidats se compte après ce retrait.
 * - **Ex æquo** : rangs moyens, et le coefficient est la corrélation de Pearson des rangs (définition
 *   usuelle de Spearman avec ex æquo ; la formule en Σd² n'est exacte que sans ex æquo).
 * - **Un classement constant** (tous les candidats au même taux d'erreur, ou au même nombre d'items)
 *   rend le coefficient indéfini (division par zéro) : il est absent, avec le motif
 *   `rangs_constants`, jamais 0.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import { exigerDuCouple, unitesParCoupleCompare } from "./couples-compares.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { exactitudeParCandidat } from "./metriques.ts";
import type { PartageCandidats, PartageCouples } from "./seuils.ts";
import { taux, type CandidatAuGel, type CoupleOutilMode, type IdentifiantCourt, type Mode, type Taux } from "./types.ts";

/** §2 : « Sous trois candidats, elle n'est pas calculée ». */
export const CANDIDATS_MINIMUM_CORRELATION = 3;

export type MotifSansCorrelation = "moins_de_trois_candidats" | "rangs_constants";

export interface PointCorrelation {
  readonly candidat_id: IdentifiantCourt;
  /** Inexactes / classées : un moins l'exactitude du candidat, en effectifs exacts. */
  readonly taux_erreur: Taux;
  readonly items_p_verifies: number;
}

export interface CorrelationCouverture {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
  readonly exploratoire: true;
  /** Candidats comparés qui entrent dans le coefficient, triés par identifiant. */
  readonly points: readonly PointCorrelation[];
  /** Candidats comparés présents sans aucune réponse classée : sans taux d'erreur, hors coefficient. */
  readonly candidats_sans_exactitude: readonly IdentifiantCourt[];
  /** Absent (`null`) seulement avec son motif. Jamais d'intervalle (§2). */
  readonly coefficient: number | null;
  readonly motif_absence: MotifSansCorrelation | null;
}

export interface CorrelationsDuRun {
  readonly compares: readonly CorrelationCouverture[];
  /** §8 : couples « run incomplet », sans aucune statistique. */
  readonly couples_incomplets: readonly CoupleOutilMode[];
}

/** Une corrélation par couple comparé du partage, triée par couple ; aucune pour un couple incomplet. */
export function correlationsParCouple(
  unites: readonly UniteAnalyse[],
  couples: PartageCouples,
  partage: PartageCandidats,
  candidats: readonly CandidatAuGel[],
): CorrelationsDuRun {
  return {
    compares: unitesParCoupleCompare(unites, couples).map((g) => correlationCouverture(g.unites, g.couple, partage, candidats)),
    couples_incomplets: couples.incomplets,
  };
}

export function correlationCouverture(
  unitesDuCouple: readonly UniteAnalyse[],
  couple: CoupleOutilMode,
  partage: PartageCandidats,
  candidats: readonly CandidatAuGel[],
): CorrelationCouverture {
  exigerDuCouple(unitesDuCouple, couple);
  const { points, candidats_sans_exactitude } = pointsDuCouple(unitesDuCouple, partage, candidats);
  const { coefficient, motif_absence } = coefficientDesPoints(points);
  return { ...couple, exploratoire: true, points, candidats_sans_exactitude, coefficient, motif_absence };
}

function pointsDuCouple(
  unites: readonly UniteAnalyse[],
  partage: PartageCandidats,
  candidats: readonly CandidatAuGel[],
): { points: PointCorrelation[]; candidats_sans_exactitude: IdentifiantCourt[] } {
  const points: PointCorrelation[] = [];
  const candidats_sans_exactitude: IdentifiantCourt[] = [];
  const tries = [...exactitudeParCandidat(unites, partage).compares].sort(([a], [b]) => comparerChaines(a, b));
  for (const [candidat_id, exact] of tries) {
    if (exact.denominateur === 0) candidats_sans_exactitude.push(candidat_id);
    else points.push({ candidat_id, taux_erreur: tauxErreur(exact), items_p_verifies: itemsPVerifies(candidats, candidat_id) });
  }
  return { points, candidats_sans_exactitude };
}

function tauxErreur(exact: Taux): Taux {
  return taux(exact.denominateur - exact.numerateur, exact.denominateur);
}

function itemsPVerifies(candidats: readonly CandidatAuGel[], candidat_id: IdentifiantCourt): number {
  const trouve = candidats.find((c) => c.candidat_id === candidat_id);
  if (trouve === undefined) {
    throw new Error(`Candidat ${candidat_id} comparé mais absent du périmètre du run : son nombre d'items P vérifiés n'est pas lu (§4).`);
  }
  return trouve.items_p_verifies;
}

function coefficientDesPoints(points: readonly PointCorrelation[]): Pick<CorrelationCouverture, "coefficient" | "motif_absence"> {
  if (points.length < CANDIDATS_MINIMUM_CORRELATION) return { coefficient: null, motif_absence: "moins_de_trois_candidats" };
  const rangsErreur = rangsMoyens(points.map((p) => p.taux_erreur), comparerFractions);
  const rangsItems = rangsMoyens(points.map((p) => p.items_p_verifies), (a, b) => a - b);
  const coefficient = coefficientDeSpearman(rangsErreur, rangsItems);
  return coefficient === null ? { coefficient, motif_absence: "rangs_constants" } : { coefficient, motif_absence: null };
}

/** Comparaison exacte de deux taux définis, par produit en croix des effectifs entiers. */
function comparerFractions(a: Taux, b: Taux): number {
  return a.numerateur * b.denominateur - b.numerateur * a.denominateur;
}

/**
 * Rang de chaque valeur, de 1 à n, dans l'ordre d'entrée ; des valeurs égales pour `comparer`
 * reçoivent la moyenne des rangs qu'elles occupent.
 */
export function rangsMoyens<T>(valeurs: readonly T[], comparer: (a: T, b: T) => number): number[] {
  const ordre = valeurs.map((valeur, indice) => ({ valeur, indice })).sort((a, b) => comparer(a.valeur, b.valeur));
  const rangs = new Array<number>(valeurs.length);
  let debut = 0;
  while (debut < ordre.length) {
    let fin = debut;
    while (fin + 1 < ordre.length && comparer((ordre[fin + 1] as { valeur: T }).valeur, (ordre[debut] as { valeur: T }).valeur) === 0) fin += 1;
    const rangMoyen = (debut + fin) / 2 + 1;
    for (let k = debut; k <= fin; k += 1) rangs[(ordre[k] as { indice: number }).indice] = rangMoyen;
    debut = fin + 1;
  }
  return rangs;
}

/** Corrélation de Pearson de deux suites de rangs ; `null` quand l'une est constante. */
export function coefficientDeSpearman(rangsA: readonly number[], rangsB: readonly number[]): number | null {
  if (rangsA.length !== rangsB.length) throw new Error(`Suites de rangs de longueurs différentes : ${rangsA.length} et ${rangsB.length}.`);
  const moyenneA = moyenne(rangsA);
  const moyenneB = moyenne(rangsB);
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  rangsA.forEach((a, i) => {
    const b = rangsB[i] as number;
    covariance += (a - moyenneA) * (b - moyenneB);
    varianceA += (a - moyenneA) ** 2;
    varianceB += (b - moyenneB) ** 2;
  });
  if (varianceA === 0 || varianceB === 0) return null;
  return covariance / Math.sqrt(varianceA * varianceB);
}

function moyenne(valeurs: readonly number[]): number {
  return valeurs.reduce((somme, v) => somme + v, 0) / valeurs.length;
}
