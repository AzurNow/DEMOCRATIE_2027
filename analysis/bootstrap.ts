/**
 * Intervalles de confiance à 95 % par bootstrap en grappes (§8).
 *
 * « Tous les taux sont accompagnés d'un intervalle de confiance à 95 % par bootstrap en grappes,
 * la grappe étant l'item (les formulations et les échantillons d'un même item sont corrélés),
 * 2 000 rééchantillonnages, méthode des percentiles, graine publiée. »
 *
 * Trois choix, tous visibles dans la sortie :
 *
 * 1. **La grappe est lue**, dans `question.grappe_id` reporté sur l'unité, jamais recalculée.
 *    Rééchantillonner réponse par réponse donnerait un intervalle trop étroit : les trois
 *    formulations d'un même item ne sont pas trois observations indépendantes.
 * 2. **Percentile empirique par interpolation linéaire** (dit « type 7 ») : pour m valeurs
 *    triées et une probabilité p, h = (m − 1)·p, et la valeur est v[⌊h⌋] + (h − ⌊h⌋)·(v[⌈h⌉] −
 *    v[⌊h⌋]). Aucun BCa : la correction de biais demanderait un jackknife et un choix de plus,
 *    là où le §8 a préenregistré « méthode des percentiles ».
 * 3. **Un rééchantillon dont la statistique est indéfinie** (dénominateur nul) est compté à part,
 *    jamais remplacé par 0 : `reechantillonnages_indefinis` dit combien l'intervalle ignore.
 *
 * **Statistique numérique (conformité n° 29).** Le cœur rééchantillonne une `StatistiqueNumerique`,
 * `(unites) => number | null` : `null` est la statistique indéfinie du point 3. Un taux y entre par
 * `valeurDuTaux` (valeur absente ⇒ `null`), ce qui ne change ni les grappes, ni le flux aléatoire,
 * ni les quantiles : ses bornes sont exactement celles d'avant. La voie numérique sert l'écart
 * maximal du test d'asymétrie (`permutation.ts`), qui n'est pas un rapport d'effectifs. Le §8 ne
 * dit pas, dans le paragraphe « Incertitude », que l'intervalle de l'écart vient du même bootstrap
 * en grappes que les taux ; c'est écrit au paragraphe « Test d'asymétrie (QR3, H4) » (« Ces deux
 * intervalles viennent du même bootstrap en grappes que les taux »).
 *
 * Le générateur est celui du dépôt (`validation/domaine/alea.ts`, SplitMix64 amorcé par sha256) :
 * la reproductibilité du §9 ne dépend d'aucune version de Node. Il est amorcé par
 * `graineDerivee(options.graine_du_run, ["bootstrap", ...options.cle])` (`graines.ts`, qui écrit la
 * règle complète) : un tiers qui part de `run.graines.bootstrap.valeur` et de la clé publiée avec
 * l'intervalle retrouve les mêmes bornes.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import { generateur, type GenerateurAleatoire } from "../validation/domaine/alea.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { graineDerivee, graineHexadecimale } from "./graines.ts";
import type { Intervalle95, Taux, Ulid } from "./types.ts";

/** §8. Les tests en utilisent beaucoup moins, à graine fixe. */
export const REECHANTILLONNAGES_PRODUCTION = 2000;

export interface OptionsBootstrap {
  readonly reechantillonnages: number;
  /** `run.graines.bootstrap.valeur`, l'entier publié du run. */
  readonly graine_du_run: number;
  /** Clé lisible de la comparaison, sans la famille `bootstrap` que ce module ajoute en tête. */
  readonly cle: readonly string[];
}

/** Famille ajoutée en tête de toute clé de bootstrap (`graines.ts`). */
export const FAMILLE_BOOTSTRAP = "bootstrap";

export type Statistique = (unites: readonly UniteAnalyse[]) => Taux;

/** `null` : statistique indéfinie sur ces unités (§8, écartée des bornes et comptée). */
export type StatistiqueNumerique = (unites: readonly UniteAnalyse[]) => number | null;

/** Pourquoi un intervalle nommé est absent. Jamais un intervalle inventé à la place. */
export type RaisonSansIntervalle = "aucune_grappe" | "aucun_reechantillon_defini";

/**
 * Un intervalle publié avec ce qui le rejoue (§8, « Graines de l'analyse ») : la clé complète,
 * famille en tête, et l'amorce de SplitMix64 en hexadécimal sur seize chiffres (le §8 l'écrit
 * `0xd8bcfbd164a58f33`). `intervalle` est `null` seulement avec sa raison.
 */
export interface IntervalleNomme {
  readonly cle: readonly string[];
  readonly graine: string;
  readonly intervalle: Intervalle95 | null;
  readonly raison_sans_intervalle: RaisonSansIntervalle | null;
}

/** §8 : une différence est « établie » ou « non établie ». Le rapport n'a pas d'autre mot. */
export type Qualificatif = "etablie" | "non_etablie";

/**
 * §8 (0.27, 0.28) : un taux dont aucune grappe n'observe l'événement (`aucun_evenement`, intervalle
 * [0 ; 0], mention « aucun événement observé sur n grappes ») ou le non-événement
 * (`aucun_non_evenement`, intervalle [1 ; 1], mention « aucun non-événement observé sur n
 * grappes »), n étant le `nombre_grappes` de son intervalle.
 */
export type TauxDegenere = "aucun_evenement" | "aucun_non_evenement";

/**
 * Pourquoi une différence n'a pas de qualificatif, dans l'ordre où la règle les essaie :
 * `difference_indefinie` (l'un des deux taux est absent, dénominateur nul), `sans_intervalle`
 * (aucun rééchantillon défini), `grappe_unique` (§8, 0.9), `taux_degenere` (§8, 0.27 et 0.28 :
 * l'un des deux taux au moins est dégénéré, `tauxDegenere`).
 */
export type MotifSansQualificatif = "difference_indefinie" | "sans_intervalle" | "grappe_unique" | "taux_degenere";

export interface EchantillonBootstrap {
  /** Valeurs des rééchantillons, triées. Sans les indéfinies. */
  readonly valeurs: readonly number[];
  readonly indefinis: number;
  readonly nombre_grappes: number;
}

export interface DifferenceTaux {
  /**
   * §8, « Graines de l'analyse » (conformité 2026-09-29, n° 30) : la clé complète, famille
   * `bootstrap` en tête, et la graine en hexadécimal, publiées avec la différence comme avec un
   * `IntervalleNomme`. Présentes même sans intervalle : elles nomment la comparaison.
   */
  readonly cle: readonly string[];
  readonly graine: string;
  readonly taux_a: Taux;
  readonly taux_b: Taux;
  /** `null` quand l'un des deux taux n'existe pas : une différence sans terme n'existe pas. */
  readonly difference: number | null;
  readonly intervalle: Intervalle95 | null;
  /**
   * `null` sans différence, sans intervalle, sur un intervalle d'une seule grappe (§8, 0.9) ou quand
   * l'un des deux taux est dégénéré (§8, 0.27 et 0.28) : `qualifierDifference`.
   */
  readonly qualificatif: Qualificatif | null;
  /** `null` exactement quand `qualificatif` ne l'est pas : il dit pourquoi la différence n'est pas qualifiée. */
  readonly motif_sans_qualificatif: MotifSansQualificatif | null;
}

/**
 * Rang des grappes (décision de l'auteur du 2026-10-02, conformité n° 19, texte en 0.15) : par
 * `grappe_id` croissant, comparaison de chaînes JavaScript (`<`, unités de code UTF-16), jamais
 * `localeCompare`, qui dépend de la locale de la machine. L'indice tiré par `tirerAvecRemise`
 * désigne la grappe de ce rang : deux archives aux mêmes réponses dans un autre ordre donnent les
 * mêmes bornes. Partagé avec la permutation (`permutation.ts:grappesEtiquetees`).
 */
export function comparerGrappes(a: Ulid, b: Ulid): number {
  return comparerChaines(a, b);
}

/** Les unités par grappe, clés rangées par `comparerGrappes` (conformité n° 19). */
export function grapper(unites: readonly UniteAnalyse[]): Map<Ulid, UniteAnalyse[]> {
  const grappes = new Map<Ulid, UniteAnalyse[]>();
  for (const unite of unites) {
    const existante = grappes.get(unite.grappe_id);
    if (existante === undefined) grappes.set(unite.grappe_id, [unite]);
    else existante.push(unite);
  }
  return new Map([...grappes].sort(([a], [b]) => comparerGrappes(a, b)));
}

export function percentile(valeursTriees: readonly number[], p: number): number {
  if (valeursTriees.length === 0) {
    throw new Error("Percentile d'une liste vide : aucune borne à publier.");
  }
  if (p < 0 || p > 1) throw new Error(`Probabilité hors de [0, 1] : ${p}`);
  const h = (valeursTriees.length - 1) * p;
  const bas = Math.floor(h);
  const valeurBasse = valeursTriees[bas] as number;
  const valeurHaute = valeursTriees[Math.ceil(h)] as number;
  return valeurBasse + (h - bas) * (valeurHaute - valeurBasse);
}

/** Un taux vu comme statistique numérique : sa valeur, ou `null` quand son dénominateur est nul. */
export function valeurDuTaux(statistique: Statistique): StatistiqueNumerique {
  return (unites) => valeurDe(statistique(unites));
}

export function reechantillonner(
  unites: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  return reechantillonnerStatistique(unites, valeurDuTaux(statistique), options);
}

export function reechantillonnerStatistique(
  unites: readonly UniteAnalyse[],
  statistique: StatistiqueNumerique,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  const grappes = [...grapper(unites).values()];
  return echantillonner(grappes.length, (indices) => statistique(rassembler(grappes, indices)), options);
}

/**
 * Différence appariée par grappe : les deux bras sont recalculés sur les MÊMES grappes tirées,
 * sinon la corrélation entre les deux mesures d'un même item serait perdue et l'intervalle de la
 * différence, trop large.
 *
 * Les grappes tirées sont la réunion de celles des deux bras, rangée par `grappe_id`
 * (`comparerGrappes`) — et non plus « celles du bras A, puis celles du seul bras B » (décision de
 * l'auteur du 2026-10-02, conformité n° 19, texte en 0.15). Les effets de condition et la tendance
 * apparient avant d'appeler (`appariement.ts:apparier`) : la réunion y est l'intersection. La
 * robustesse n'apparie pas : une grappe d'un seul bras y est tirée et ne compte que dans ce bras.
 */
export function reechantillonnerDifference(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  const grappesA = grapper(unitesA);
  const grappesB = grapper(unitesB);
  const cles = [...new Set([...grappesA.keys(), ...grappesB.keys()])].sort(comparerGrappes);
  return echantillonner(
    cles.length,
    (indices) => {
      const cellesTirees = indices.map((i) => cles[i] as Ulid);
      return ecart(
        statistique(rassemblerParCle(grappesA, cellesTirees)),
        statistique(rassemblerParCle(grappesB, cellesTirees)),
      );
    },
    options,
  );
}

export function intervalleBootstrap(
  unites: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): Intervalle95 | null {
  return intervalleStatistique(unites, valeurDuTaux(statistique), options);
}

export function intervalleStatistique(
  unites: readonly UniteAnalyse[],
  statistique: StatistiqueNumerique,
  options: OptionsBootstrap,
): Intervalle95 | null {
  return intervalleDepuis(reechantillonnerStatistique(unites, statistique, options), options.reechantillonnages);
}

/** L'intervalle, sa clé complète et sa graine ; absent seulement avec sa raison. */
export function intervalleNomme(
  unites: readonly UniteAnalyse[],
  statistique: StatistiqueNumerique,
  options: OptionsBootstrap,
): IntervalleNomme {
  const cle = [FAMILLE_BOOTSTRAP, ...options.cle];
  const graine = graineHexadecimale(options.graine_du_run, cle);
  const echantillon = reechantillonnerStatistique(unites, statistique, options);
  const intervalle = intervalleDepuis(echantillon, options.reechantillonnages);
  return { cle, graine, intervalle, raison_sans_intervalle: raisonSansIntervalle(echantillon, intervalle) };
}

function raisonSansIntervalle(
  echantillon: EchantillonBootstrap,
  intervalle: Intervalle95 | null,
): RaisonSansIntervalle | null {
  if (intervalle !== null) return null;
  return echantillon.nombre_grappes === 0 ? "aucune_grappe" : "aucun_reechantillon_defini";
}

export function intervalleDepuis(
  echantillon: EchantillonBootstrap,
  reechantillonnages: number,
): Intervalle95 | null {
  if (echantillon.nombre_grappes === 0 || echantillon.valeurs.length === 0) return null;
  return {
    bas: percentile(echantillon.valeurs, 0.025),
    haut: percentile(echantillon.valeurs, 0.975),
    nombre_grappes: echantillon.nombre_grappes,
    reechantillonnages,
    reechantillonnages_indefinis: echantillon.indefinis,
    degenere: echantillon.nombre_grappes === 1 ? "grappe_unique" : null,
  };
}

export function differenceAppariee(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  statistique: Statistique,
  options: OptionsBootstrap,
): DifferenceTaux {
  const cle = [FAMILLE_BOOTSTRAP, ...options.cle];
  const graine = graineHexadecimale(options.graine_du_run, cle);
  const taux_a = statistique(unitesA);
  const taux_b = statistique(unitesB);
  const difference = ecart(taux_a, taux_b);
  if (difference === null) {
    return { cle, graine, taux_a, taux_b, difference: null, intervalle: null, qualificatif: null, motif_sans_qualificatif: "difference_indefinie" };
  }
  const echantillon = reechantillonnerDifference(unitesA, unitesB, statistique, options);
  const intervalle = intervalleDepuis(echantillon, options.reechantillonnages);
  return { cle, graine, taux_a, taux_b, difference, intervalle, ...qualifierDifference(taux_a, taux_b, intervalle) };
}

/**
 * §8 (0.27, 0.28) : la seule règle qui décide qu'un taux est dégénéré. Elle lit les effectifs
 * observés, jamais les bornes de l'intervalle : un numérateur nul dit qu'aucune unité, donc aucune
 * grappe, n'observe l'événement ; un numérateur égal au dénominateur, qu'aucune n'observe le
 * non-événement. Un taux de dénominateur nul n'est pas dégénéré : il est absent (`valeur`
 * manquante), et la différence qui en dépend l'est aussi.
 */
export function tauxDegenere(t: Taux): TauxDegenere | null {
  if (t.denominateur === 0) return null;
  if (t.numerateur === 0) return "aucun_evenement";
  return t.numerateur === t.denominateur ? "aucun_non_evenement" : null;
}

/**
 * Le qualificatif d'une différence définie et, quand il manque, pourquoi. §8 : « Dans les deux cas,
 * une différence qui dépend d'un tel taux n'est qualifiée ni d'« établie » ni de « non établie ». »
 * Un taux dégénéré dans l'un des deux bras suffit.
 */
export function qualifierDifference(
  taux_a: Taux,
  taux_b: Taux,
  intervalle: Intervalle95 | null,
): Pick<DifferenceTaux, "qualificatif" | "motif_sans_qualificatif"> {
  const motif = motifSansQualificatif(taux_a, taux_b, intervalle);
  return { qualificatif: motif === null ? qualifier(intervalle) : null, motif_sans_qualificatif: motif };
}

function motifSansQualificatif(taux_a: Taux, taux_b: Taux, intervalle: Intervalle95 | null): MotifSansQualificatif | null {
  if (intervalle === null) return "sans_intervalle";
  if (intervalle.degenere === "grappe_unique") return "grappe_unique";
  if (tauxDegenere(taux_a) !== null || tauxDegenere(taux_b) !== null) return "taux_degenere";
  return null;
}

/**
 * §8 : « établie » seulement si l'intervalle exclut zéro. Aucun autre mot n'est publiable.
 *
 * §8 (0.9) : « Un intervalle calculé sur une seule grappe est dégénéré : la différence
 * correspondante n'est qualifiée ni d'« établie » ni de « non établie », elle est publiée avec la
 * mention « une seule grappe ». » Le qualificatif est alors `null`, mais l'intervalle, lui, est
 * rendu tel quel : c'est son `degenere: "grappe_unique"` qui porte la mention, et qui distingue ce
 * cas d'une différence sans intervalle du tout (`intervalle: null`).
 *
 * Ne lit que l'intervalle : la règle des taux dégénérés (§8, 0.27 et 0.28) a besoin des deux taux,
 * et vit dans `qualifierDifference`, qui appelle celle-ci en dernier.
 */
export function qualifier(intervalle: Intervalle95 | null): Qualificatif | null {
  if (intervalle === null || intervalle.degenere === "grappe_unique") return null;
  return intervalle.bas > 0 || intervalle.haut < 0 ? "etablie" : "non_etablie";
}

function echantillonner(
  nombreGrappes: number,
  valeurPour: (indices: readonly number[]) => number | null,
  options: OptionsBootstrap,
): EchantillonBootstrap {
  verifierOptions(options);
  const rng = generateur(graineDerivee(options.graine_du_run, [FAMILLE_BOOTSTRAP, ...options.cle]));
  const valeurs: number[] = [];
  let indefinis = 0;
  for (let b = 0; b < options.reechantillonnages; b += 1) {
    const valeur = nombreGrappes === 0 ? null : valeurPour(tirerAvecRemise(nombreGrappes, rng));
    if (valeur === null) indefinis += 1;
    else valeurs.push(valeur);
  }
  valeurs.sort((x, y) => x - y);
  return { valeurs, indefinis, nombre_grappes: nombreGrappes };
}

function verifierOptions(options: OptionsBootstrap): void {
  if (!Number.isInteger(options.reechantillonnages) || options.reechantillonnages < 1) {
    throw new Error(`Nombre de rééchantillonnages invalide : ${options.reechantillonnages}`);
  }
}

function tirerAvecRemise(nombreGrappes: number, rng: GenerateurAleatoire): number[] {
  const indices: number[] = [];
  for (let i = 0; i < nombreGrappes; i += 1) indices.push(rng.entier(nombreGrappes));
  return indices;
}

function rassembler(grappes: readonly (readonly UniteAnalyse[])[], indices: readonly number[]): UniteAnalyse[] {
  const unites: UniteAnalyse[] = [];
  for (const i of indices) unites.push(...(grappes[i] as readonly UniteAnalyse[]));
  return unites;
}

function rassemblerParCle(
  grappes: ReadonlyMap<Ulid, readonly UniteAnalyse[]>,
  cles: readonly Ulid[],
): UniteAnalyse[] {
  const unites: UniteAnalyse[] = [];
  for (const cle of cles) {
    const membres = grappes.get(cle);
    if (membres !== undefined) unites.push(...membres);
  }
  return unites;
}

/** Différence de deux taux, absente dès que l'un des deux l'est. */
function ecart(a: Taux, b: Taux): number | null {
  if (a.valeur === undefined || b.valeur === undefined) return null;
  return a.valeur - b.valeur;
}

function valeurDe(t: Taux): number | null {
  return t.valeur === undefined ? null : t.valeur;
}
