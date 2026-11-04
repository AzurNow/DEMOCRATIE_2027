/**
 * Test de permutation de l'homogénéité des taux d'erreur entre candidats (§8, QR3/H4).
 *
 * « Pour chaque outil et chaque mode, un test de permutation de l'homogénéité des taux d'erreur
 * entre candidats : les étiquettes de candidat sont permutées entre items 10 000 fois […] ; la
 * statistique est l'écart maximal absolu entre l'exactitude d'un candidat et l'exactitude
 * **globale** de l'outil — calculée sur l'ensemble de ses réponses classées aux questions qui
 * nomment un candidat — […] et non comme la moyenne des exactitudes par candidat, qui donnerait le
 * même poids à un candidat de 10 items qu'à un candidat de 30. »
 *
 * Trois points de lecture, tous conséquents :
 *
 * 1. **Les étiquettes sont permutées entre items, pas entre réponses.** Une étiquette voyage avec
 *    l'item entier — ses trois formulations et ses deux échantillons. Permuter par réponse
 *    fabriquerait de l'indépendance qui n'existe pas et rendrait la valeur p trop petite.
 * 2. **L'exactitude globale de l'outil** (exactes / classées sur ses réponses aux questions qui
 *    nomment un candidat comparé — conformité n° 30 ; les questions d'attribution, qui n'en nomment
 *    aucun, sortent du test) est invariante par permutation. La moyenne non pondérée des
 *    exactitudes par candidat, que le §8 écarte, bougerait d'une permutation à l'autre.
 * 3. **L'exactitude d'un candidat garde la définition de `metriques.ts`** : l'agrégat par grappe
 *    est produit par `exactitude()`, et la statistique ne fait qu'en sommer numérateurs et
 *    dénominateurs. La métrique ne vit pas ici une deuxième fois.
 *
 * Le générateur est amorcé par `graineDerivee(options.graine_du_run, ["permutation",
 * ...options.cle])` (`graines.ts`) : la valeur p se rejoue depuis `run.graines.permutation.valeur`.
 *
 * Valeur p de Monte-Carlo : (1 + nombre de permutations au moins aussi extrêmes) / (1 + B). Le
 * « 1 + » compte l'échantillon observé lui-même ; sans lui, une valeur p nulle serait publiable,
 * ce qu'aucun nombre fini de permutations ne justifie.
 *
 * **Intervalles publiés (conformité n° 29).** « Sont publiés la valeur p corrigée, l'écart maximal
 * avec son intervalle, et l'exactitude de chaque candidat avec son intervalle. » (§8) Les deux
 * intervalles viennent du bootstrap en grappes de `bootstrap.ts` (grappe = item), amorcé depuis
 * `run.graines.bootstrap` — règle écrite au §8, paragraphe « Test d'asymétrie (QR3, H4) » : « Ces
 * deux intervalles viennent du même bootstrap en grappes que les taux (paragraphe « Incertitude »),
 * chacun avec sa propre graine dérivée ». Clés, après la clé de l'appelant (outil,
 * mode) : `ecart_maximal` / `global` pour l'écart, `exactitude_candidat` / identifiant du candidat
 * pour chaque exactitude. L'écart est recalculé sur chaque rééchantillon par `ecartMaximal`, sur
 * les grappes des seuls candidats comparés ; il y est **indéfini** dès qu'un candidat du test n'a
 * aucune réponse classée dans le rééchantillon, puisque son exactitude, un des termes du maximum,
 * n'existe pas. Ce rééchantillon est écarté des bornes et compté (§8, règle des taux appliquée
 * telle quelle) — jamais remplacé par le maximum sur les candidats restants, qui mesurerait autre
 * chose que la statistique observée.
 */

import { generateur, melanger, type GenerateurAleatoire } from "../validation/domaine/alea.ts";
import {
  comparerGrappes,
  intervalleNomme,
  tauxDegenere,
  valeurDuTaux,
  type IntervalleNomme,
  type OptionsBootstrap,
  type StatistiqueNumerique,
  type TauxDegenere,
} from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { graineDerivee, graineHexadecimale } from "./graines.ts";
import { corrigerHolm, type ValeurP, type ValeurPCorrigee } from "./holm.ts";
import { exactitude, exactitudeParCandidat } from "./metriques.ts";
import { cleCouple, repartirParCandidat, type PartageCandidats, type PartageCouples } from "./seuils.ts";
import { taux, TYPES_ITEM, type CoupleOutilMode, type IdentifiantCourt, type Taux, type TypeItem, type Ulid } from "./types.ts";

/** §8. Les tests en utilisent beaucoup moins, à graine fixe. */
export const PERMUTATIONS_PRODUCTION = 10000;

/**
 * Tolérance de comparaison des statistiques, en valeur absolue. Deux statistiques égales à
 * l'arithmétique près doivent compter comme « au moins aussi extrême » : sans cette tolérance,
 * le bruit du flottant retirerait des permutations du compte et réduirait la valeur p.
 */
const TOLERANCE = 1e-12;

export interface OptionsPermutation {
  readonly permutations: number;
  /** `run.graines.permutation.valeur`, l'entier publié du run. */
  readonly graine_du_run: number;
  /** Clé lisible du test (outil, mode), sans la famille `permutation` que ce module ajoute en tête. */
  readonly cle: readonly string[];
}

/** Famille ajoutée en tête de toute clé de permutation (`graines.ts`). */
export const FAMILLE_PERMUTATION = "permutation";

/** Un item, son étiquette de candidat, et ses comptages d'exactitude. */
export interface GrappeEtiquetee {
  readonly grappe_id: Ulid;
  readonly candidat_id: IdentifiantCourt;
  readonly exactes: number;
  readonly classees: number;
}

export interface ExactitudeCandidat {
  readonly candidat_id: IdentifiantCourt;
  readonly exactitude: Taux;
  /** Bootstrap en grappes sur les seuls items du candidat (conformité n° 29). */
  readonly intervalle: IntervalleNomme;
  /** §8 (0.27, 0.28) : la mention d'un taux dégénéré, sur `intervalle.intervalle.nombre_grappes` grappes ; `null` sinon. */
  readonly taux_degenere: TauxDegenere | null;
  /**
   * §8 (0.27, conformité 2026-11-03 n° 9) : « pour chaque candidat, le nombre de ses items P, A, O
   * et F entrés dans le test ». Un item compte une fois, s'il entre dans la permutation ; un type
   * sans item vaut 0, jamais une clé absente.
   */
  readonly items_par_type: ItemsParType;
}

/** Effectif d'items par type, les quatre types toujours présents, dans l'ordre de `TYPES_ITEM`. */
export type ItemsParType = Readonly<Record<TypeItem, number>>;

export interface ResultatPermutation {
  /**
   * §8, « Graines de l'analyse » (conformité 2026-09-29, n° 30) : la clé complète du test, famille
   * `permutation` en tête, et l'amorce en hexadécimal, de quoi rejouer la valeur p depuis
   * `run.graines.permutation.valeur`.
   */
  readonly cle: readonly string[];
  readonly graine: string;
  readonly statistique_observee: number;
  readonly valeur_p: number;
  readonly permutations: number;
  readonly exactitude_outil: Taux;
  /** §8 : « l'écart maximal avec son intervalle » (conformité n° 29). */
  readonly intervalle_ecart_maximal: IntervalleNomme;
  readonly candidats: readonly ExactitudeCandidat[];
  /**
   * §4 : candidats sous le seuil de couverture présents dans les unités, rapportés à part avec la
   * mention « couverture insuffisante », sans taux (§8). Leurs items n'entrent ni dans la
   * statistique, ni dans l'exactitude globale de référence, ni dans les permutations.
   */
  readonly candidats_rapportes_a_part: readonly IdentifiantCourt[];
}

/**
 * Agrège les unités par item. Sont écartés, explicitement : les items sans candidat (Q-ATT, que
 * le §5 interdit d'attribuer) et les items dont aucune réponse n'est classée (ni exacte ni
 * inexacte), qui ne portent aucune information d'exactitude.
 *
 * Les items sont rendus rangés par `grappe_id` (`bootstrap.ts:comparerGrappes`), quel que soit
 * l'ordre des réponses : c'est sur cet ordre que Fisher-Yates mélange les étiquettes, du dernier
 * item au premier (décision de l'auteur du 2026-10-02, conformité n° 19, texte en 0.15).
 */
export function grappesEtiquetees(unites: readonly UniteAnalyse[]): GrappeEtiquetee[] {
  const parGrappe = new Map<Ulid, UniteAnalyse[]>();
  for (const unite of unites) {
    if (unite.candidat_id === null) continue;
    const existante = parGrappe.get(unite.grappe_id);
    if (existante === undefined) parGrappe.set(unite.grappe_id, [unite]);
    else existante.push(unite);
  }
  const grappes: GrappeEtiquetee[] = [];
  for (const [grappe_id, membres] of parGrappe) {
    const comptages = exactitude(membres);
    if (comptages.denominateur === 0) continue;
    grappes.push({
      grappe_id,
      candidat_id: candidatUnique(grappe_id, membres),
      exactes: comptages.numerateur,
      classees: comptages.denominateur,
    });
  }
  return grappes.sort((a, b) => comparerGrappes(a.grappe_id, b.grappe_id));
}

function candidatUnique(grappe_id: Ulid, membres: readonly UniteAnalyse[]): IdentifiantCourt {
  const candidats = new Set(membres.map((u) => u.candidat_id));
  if (candidats.size !== 1) {
    throw new Error(`Item ${grappe_id} portant ${candidats.size} candidats différents : étiquette indécidable.`);
  }
  return membres[0]?.candidat_id as IdentifiantCourt;
}

/** Les étiquettes changent d'item ; les comptages d'un item ne bougent jamais. */
export function permuterEtiquettes(
  grappes: readonly GrappeEtiquetee[],
  rng: GenerateurAleatoire,
): GrappeEtiquetee[] {
  const etiquettes = melanger(
    grappes.map((g) => g.candidat_id),
    rng,
  );
  return grappes.map((g, i) => ({ ...g, candidat_id: etiquettes[i] as IdentifiantCourt }));
}

/** Écart maximal absolu entre l'exactitude d'un candidat et l'exactitude globale de l'outil. */
export function ecartMaximal(grappes: readonly GrappeEtiquetee[]): number {
  const parCandidat = new Map<IdentifiantCourt, { exactes: number; classees: number }>();
  let exactes = 0;
  let classees = 0;
  for (const grappe of grappes) {
    const connu = parCandidat.get(grappe.candidat_id);
    const cumul = connu === undefined ? { exactes: 0, classees: 0 } : connu;
    cumul.exactes += grappe.exactes;
    cumul.classees += grappe.classees;
    parCandidat.set(grappe.candidat_id, cumul);
    exactes += grappe.exactes;
    classees += grappe.classees;
  }
  if (classees === 0) {
    throw new Error("Écart maximal sur un jeu sans réponse classée : statistique indéfinie.");
  }
  const globale = exactes / classees;
  let ecart = 0;
  for (const cumul of parCandidat.values()) {
    ecart = Math.max(ecart, Math.abs(cumul.exactes / cumul.classees - globale));
  }
  return ecart;
}

/**
 * `null` quand le test n'a pas d'objet : aucun item exploitable, ou moins de deux candidats
 * comparés — il n'y a alors rien à permuter, et publier une valeur p de 1 laisserait croire
 * qu'un test a eu lieu.
 *
 * Le partage vient de `candidatsComparables(run)` (conformité n° 30) : un candidat sous le seuil
 * de couverture « n'entre pas dans les comparaisons inter-candidats » (§4). Ses items sont retirés
 * avant la formation des grappes ; il est rendu à part dans le résultat, jamais effacé.
 */
export function testHomogeneiteCandidats(
  unites: readonly UniteAnalyse[],
  partage: PartageCandidats,
  options: OptionsPermutation,
  bootstrap: OptionsBootstrap,
): ResultatPermutation | null {
  verifierOptions(options);
  const { comparees } = repartirParCandidat(unites, partage);
  const grappes = grappesEtiquetees(comparees);
  const candidats = new Set(grappes.map((g) => g.candidat_id));
  if (candidats.size < 2) return null;
  const observee = ecartMaximal(grappes);
  const parCandidat = exactitudeParCandidat(unites, partage);
  const effectifs = itemsParTypeDuTest(comparees, grappes, [...parCandidat.compares.keys()]);
  const cle = [FAMILLE_PERMUTATION, ...options.cle];
  return {
    cle,
    graine: graineHexadecimale(options.graine_du_run, cle),
    statistique_observee: observee,
    valeur_p: valeurPDe(grappes, observee, options),
    permutations: options.permutations,
    exactitude_outil: exactitudeDesGrappes(grappes),
    intervalle_ecart_maximal: intervalleNomme(comparees, ecartSurTousLesCandidats(candidats.size), {
      ...bootstrap,
      cle: [...bootstrap.cle, METRIQUE_ECART, STRATE_ECART],
    }),
    candidats: [...parCandidat.compares].map(([candidat_id, t]) => ({
      candidat_id,
      exactitude: t,
      intervalle: intervalleDuCandidat(comparees, candidat_id, bootstrap),
      taux_degenere: tauxDegenere(t),
      items_par_type: effectifsDe(effectifs, candidat_id),
    })),
    candidats_rapportes_a_part: parCandidat.rapportes_a_part,
  };
}

/**
 * §8 (0.27) : par candidat, le nombre de ses items P, A, O et F entrés dans le test. Les items
 * comptés sont les `grappes` de la permutation (`grappesEtiquetees`), et eux seuls : un item sans
 * réponse classée, une question d'attribution ou un candidat sous le seuil n'y sont pas. Chaque
 * candidat de `candidats` reçoit ses quatre effectifs, à 0 quand aucun de ses items n'entre au test.
 *
 * Le type d'un item est lu sur ses unités (`type_item_principal`) : un item de candidat sans type,
 * ou dont les réponses portent deux types, lève — jamais un type choisi parmi plusieurs.
 */
export function itemsParTypeDuTest(
  comparees: readonly UniteAnalyse[],
  grappes: readonly GrappeEtiquetee[],
  candidats: readonly IdentifiantCourt[],
): Map<IdentifiantCourt, ItemsParType> {
  const types = typesDesItems(comparees);
  const comptes = new Map(candidats.map((c) => [c, zeroParType()]));
  for (const grappe of grappes) {
    const compte = comptes.get(grappe.candidat_id);
    if (compte === undefined) {
      throw new Error(`Item ${grappe.grappe_id} du test porté par ${grappe.candidat_id}, hors des candidats comparés.`);
    }
    compte[typeDeLItem(types, grappe.grappe_id)] += 1;
  }
  return comptes;
}

function zeroParType(): Record<TypeItem, number> {
  return Object.fromEntries(TYPES_ITEM.map((t) => [t, 0])) as Record<TypeItem, number>;
}

/** Le type de chaque item de candidat, `null` quand une unité n'en porte pas. */
function typesDesItems(unites: readonly UniteAnalyse[]): Map<Ulid, TypeItem | null> {
  const types = new Map<Ulid, TypeItem | null>();
  for (const unite of unites) {
    if (unite.candidat_id === null) continue;
    const connu = types.get(unite.grappe_id);
    if (connu !== undefined && connu !== unite.type_item_principal) {
      throw new Error(`Item ${unite.grappe_id} portant deux types différents (${connu}, ${unite.type_item_principal}) : effectif par type indécidable.`);
    }
    types.set(unite.grappe_id, unite.type_item_principal);
  }
  return types;
}

function typeDeLItem(types: ReadonlyMap<Ulid, TypeItem | null>, grappe_id: Ulid): TypeItem {
  const type = types.get(grappe_id);
  if (type === undefined || type === null) {
    throw new Error(`Item ${grappe_id} du test sans type d'item : effectif par type indécidable.`);
  }
  return type;
}

function effectifsDe(effectifs: ReadonlyMap<IdentifiantCourt, ItemsParType>, candidat_id: IdentifiantCourt): ItemsParType {
  const trouve = effectifs.get(candidat_id);
  if (trouve === undefined) throw new Error(`Candidat ${candidat_id} sans effectifs par type : incohérence interne du test.`);
  return trouve;
}

/** Composants de clé de graine des intervalles du test (`graines.ts`) : lisibles, stables. */
const METRIQUE_ECART = "ecart_maximal";
const STRATE_ECART = "global";
const METRIQUE_EXACTITUDE_CANDIDAT = "exactitude_candidat";

/**
 * L'écart maximal sur un rééchantillon, indéfini (`null`) quand un des `attendus` candidats du
 * test n'y a aucune réponse classée : son exactitude, terme du maximum, n'existe pas (§8, règle
 * du dénominateur nul). Les unités sont celles des candidats comparés : aucun autre ne peut y
 * apparaître, le compte suffit.
 */
function ecartSurTousLesCandidats(attendus: number): StatistiqueNumerique {
  return (unites) => {
    const grappes = grappesEtiquetees(unites);
    if (new Set(grappes.map((g) => g.candidat_id)).size < attendus) return null;
    return ecartMaximal(grappes);
  };
}

/** L'exactitude de `metriques.ts`, bootstrappée sur les seules grappes du candidat. */
function intervalleDuCandidat(
  comparees: readonly UniteAnalyse[],
  candidat_id: IdentifiantCourt,
  bootstrap: OptionsBootstrap,
): IntervalleNomme {
  return intervalleNomme(
    comparees.filter((u) => u.candidat_id === candidat_id),
    valeurDuTaux(exactitude),
    { ...bootstrap, cle: [...bootstrap.cle, METRIQUE_EXACTITUDE_CANDIDAT, candidat_id] },
  );
}

/** Le test d'un couple outil × mode ; `null` quand il n'a pas eu d'objet. */
export interface ResultatCouple {
  readonly couple: CoupleOutilMode;
  readonly resultat: ResultatPermutation | null;
}

export interface FamilleAsymetrie {
  /** Une entrée par couple testé, clé `cleCouple`, dans l'ordre d'entrée. */
  readonly corrigees: readonly ValeurPCorrigee[];
  /** §8 : couples marqués « run incomplet », exclus des comparaisons, donc de la famille. */
  readonly couples_incomplets: readonly string[];
  /** Couples comparables dont le test n'a pas eu d'objet : aucune valeur p, rien à corriger. */
  readonly couples_sans_test: readonly string[];
}

/**
 * §8 (protocole 0.11) : « Correction de Holm sur la famille de toutes les valeurs p du run, une
 * par couple outil × mode. » La famille est formée ici, une seule fois : les couples incomplets
 * (conformité n° 84) et les tests sans objet n'y entrent pas, et sont rendus à part.
 *
 * Une famille qui perdrait un couple comparable aurait des valeurs corrigées plus petites qu'elle
 * ne doit : un couple comparable sans résultat lève, comme un couple inconnu ou en double.
 */
export function corrigerFamilleAsymetrie(
  resultats: readonly ResultatCouple[],
  couples: PartageCouples,
): FamilleAsymetrie {
  const comparables = new Set(couples.compares.map(cleCouple));
  const incomplets = new Set(couples.incomplets.map(cleCouple));
  verifierCouplesDeLaFamille(resultats, comparables, incomplets);
  const famille: ValeurP[] = [];
  const sans_test: string[] = [];
  for (const { couple, resultat } of resultats) {
    const cle = cleCouple(couple);
    if (incomplets.has(cle)) continue;
    if (resultat === null) sans_test.push(cle);
    else famille.push({ cle, valeur: resultat.valeur_p });
  }
  return { corrigees: corrigerHolm(famille), couples_incomplets: [...incomplets], couples_sans_test: sans_test };
}

function verifierCouplesDeLaFamille(
  resultats: readonly ResultatCouple[],
  comparables: ReadonlySet<string>,
  incomplets: ReadonlySet<string>,
): void {
  const vus = new Set<string>();
  for (const { couple } of resultats) {
    const cle = cleCouple(couple);
    if (vus.has(cle)) throw new Error(`Couple ${cle} en double dans la famille de Holm.`);
    if (!comparables.has(cle) && !incomplets.has(cle)) {
      throw new Error(`Couple ${cle} absent du partage des couples du run : famille de Holm indécidable.`);
    }
    vus.add(cle);
  }
  const manquants = [...comparables].filter((cle) => !vus.has(cle));
  if (manquants.length > 0) {
    throw new Error(`Couples comparables sans résultat de test : ${manquants.join(", ")}. Famille de Holm incomplète.`);
  }
}

function valeurPDe(
  grappes: readonly GrappeEtiquetee[],
  observee: number,
  options: OptionsPermutation,
): number {
  const rng = generateur(graineDerivee(options.graine_du_run, [FAMILLE_PERMUTATION, ...options.cle]));
  let extremes = 0;
  for (let i = 0; i < options.permutations; i += 1) {
    if (ecartMaximal(permuterEtiquettes(grappes, rng)) >= observee - TOLERANCE) extremes += 1;
  }
  return (1 + extremes) / (1 + options.permutations);
}

function exactitudeDesGrappes(grappes: readonly GrappeEtiquetee[]): Taux {
  let exactes = 0;
  let classees = 0;
  for (const grappe of grappes) {
    exactes += grappe.exactes;
    classees += grappe.classees;
  }
  return taux(exactes, classees);
}

function verifierOptions(options: OptionsPermutation): void {
  if (!Number.isInteger(options.permutations) || options.permutations < 1) {
    throw new Error(`Nombre de permutations invalide : ${options.permutations}`);
  }
  // Une graine invalide refuse avant tout calcul, pas seulement quand un tirage a lieu.
  graineDerivee(options.graine_du_run, [FAMILLE_PERMUTATION, ...options.cle]);
}
