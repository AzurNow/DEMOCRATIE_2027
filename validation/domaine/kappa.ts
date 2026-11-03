/**
 * Kappa de Cohen non pondéré (§4).
 *
 * Deux décisions de conception qui changent le nombre publié :
 *
 * 1. **Les catégories sont fixées a priori**, jamais déduites de l'échantillon. Déduire les
 *    catégories des valeurs observées fait dépendre l'accord attendu par hasard de ce que les
 *    annotateurs ont fait, donc rend deux lots incomparables.
 * 2. **Le test de dégénérescence est exact.** En posant `p₀ = A/n` et `pₑ = B/n²`, le kappa
 *    vaut `(A·n − B) / (n² − B)` : deux entiers. Le cas indéfini est alors « dénominateur
 *    strictement nul », pas « à peu près nul » — un flottant aurait produit un kappa
 *    astronomique là où il n'en existe aucun.
 */

import type { CategorieKappa, Decision } from "./types.ts";

/** Ordre figé : il fixe l'indexation de la matrice de confusion. */
export const CATEGORIES_KAPPA: readonly CategorieKappa[] = ["retenu", "rejete", "non_evaluable"];

/**
 * §4, lecture retenue : c'est le devenir de l'item qui compte. « accepter » et « corriger »
 * mènent tous deux à un item vérifié ; les distinguer pénaliserait une coquille repérée par un
 * seul des deux annotateurs. « rejeté » et « non évaluable » ne fusionnent pas : l'un dit que
 * l'extraction est fausse, l'autre que le candidat est flou.
 */
export function categorieDe(decision: Decision): CategorieKappa {
  if (decision === "accepter" || decision === "corriger") return "retenu";
  if (decision === "rejeter") return "rejete";
  return "non_evaluable";
}

export type MotifIndefini = "aucun_item_commun" | "accord_attendu_maximal";

export interface ResultatKappa {
  /** `null` quand le kappa n'est pas défini. Jamais 0, jamais 1 : une absence reste absente. */
  readonly kappa: number | null;
  readonly motif_indefini: MotifIndefini | null;
  /** Accord observé. Toujours publié à côté du kappa, y compris quand celui-ci est indéfini. */
  readonly accord_observe: number | null;
  readonly accord_attendu: number | null;
  readonly n: number;
}

export interface PaireCategories<T extends string> {
  readonly a: T;
  readonly b: T;
}

/**
 * Kappa sur un jeu de catégories quelconque, fixé par l'appelant.
 * Toute paire dont une catégorie est hors de `categories` est une erreur de programmation, pas
 * une donnée à ignorer silencieusement : elle lève.
 */
export function kappaCohen<T extends string>(
  paires: readonly PaireCategories<T>[],
  categories: readonly T[],
): ResultatKappa {
  return kappaDepuisComptes(comptesKappa(paires, categories));
}

/** Le kappa publié tiré des trois entiers : seul endroit où il devient un flottant. */
export function kappaDepuisComptes({ n, accords, attendus }: ComptesKappa): ResultatKappa {
  if (n === 0) {
    return { kappa: null, motif_indefini: "aucun_item_commun", accord_observe: null, accord_attendu: null, n: 0 };
  }

  const denominateur = n * n - attendus;
  const accordObserve = accords / n;
  const accordAttendu = attendus / (n * n);

  if (denominateur === 0) {
    return {
      kappa: null,
      motif_indefini: "accord_attendu_maximal",
      accord_observe: accordObserve,
      accord_attendu: accordAttendu,
      n,
    };
  }

  return {
    kappa: (accords * n - attendus) / denominateur,
    motif_indefini: null,
    accord_observe: accordObserve,
    accord_attendu: accordAttendu,
    n,
  };
}

/**
 * Les trois entiers du kappa : `κ = (accords·n − attendus) / (n² − attendus)`. Noyau partagé :
 * `kappaCohen` en tire le kappa publié, et un appelant qui doit comparer le kappa à un seuil
 * rationnel (go/no-go du §12, `pipeline/go-no-go/`) le fait en entiers, sans passer par le flottant.
 * Mêmes catégories fixées a priori, même erreur pour une catégorie hors du jeu.
 */
export interface ComptesKappa {
  readonly n: number;
  /** Somme de la diagonale de la matrice de confusion (A). */
  readonly accords: number;
  /** Somme des produits des marges (B) : l'accord attendu vaut B / n². */
  readonly attendus: number;
}

export function comptesKappa<T extends string>(
  paires: readonly PaireCategories<T>[],
  categories: readonly T[],
): ComptesKappa {
  const matrice = matriceConfusion(paires, categories);
  return { n: paires.length, accords: sommeDiagonale(matrice), attendus: sommeProduitsMarginaux(matrice, categories.length) };
}

function matriceConfusion<T extends string>(
  paires: readonly PaireCategories<T>[],
  categories: readonly T[],
): number[][] {
  const taille = categories.length;
  const matrice: number[][] = Array.from({ length: taille }, () => new Array<number>(taille).fill(0));
  for (const paire of paires) {
    const i = categories.indexOf(paire.a);
    const j = categories.indexOf(paire.b);
    if (i < 0 || j < 0) {
      throw new Error(`Catégorie hors du jeu fixé a priori : ${paire.a} / ${paire.b}`);
    }
    const ligne = matrice[i] as number[];
    ligne[j] = (ligne[j] as number) + 1;
  }
  return matrice;
}

function sommeDiagonale(matrice: readonly (readonly number[])[]): number {
  let total = 0;
  for (let i = 0; i < matrice.length; i += 1) {
    total += (matrice[i] as readonly number[])[i] as number;
  }
  return total;
}

function sommeProduitsMarginaux(matrice: readonly (readonly number[])[], taille: number): number {
  let total = 0;
  for (let i = 0; i < taille; i += 1) {
    let ligne = 0;
    let colonne = 0;
    for (let j = 0; j < taille; j += 1) {
      ligne += (matrice[i] as readonly number[])[j] as number;
      colonne += (matrice[j] as readonly number[])[i] as number;
    }
    total += ligne * colonne;
  }
  return total;
}

/** Les trois entiers du kappa publié : trois catégories dérivées de la décision. */
export function comptesKappaPublie(paires: readonly PaireCategories<Decision>[]): ComptesKappa {
  const categories = paires.map((paire) => ({ a: categorieDe(paire.a), b: categorieDe(paire.b) }));
  return comptesKappa(categories, CATEGORIES_KAPPA);
}

/**
 * Le kappa publié, et le seul critère go/no-go : trois catégories dérivées de la décision.
 */
export function kappaPublie(paires: readonly PaireCategories<Decision>[]): ResultatKappa {
  return kappaDepuisComptes(comptesKappaPublie(paires));
}

const CATEGORIES_BINAIRES: readonly ["oui", "non"] = ["oui", "non"];

/**
 * Kappa par question de la grille, diagnostic secondaire. Calculé uniquement sur les items où
 * les **deux** réponses sont non nulles : un `null` dit « sans objet pour ce type d'item », et
 * le compter comme un désaccord inventerait de la discorde là où il n'y a pas de question.
 */
export function kappaQuestion(
  paires: readonly { readonly a: boolean | null; readonly b: boolean | null }[],
): ResultatKappa {
  const retenues: PaireCategories<"oui" | "non">[] = [];
  for (const paire of paires) {
    if (typeof paire.a !== "boolean" || typeof paire.b !== "boolean") continue;
    retenues.push({ a: paire.a ? "oui" : "non", b: paire.b ? "oui" : "non" });
  }
  return kappaCohen(retenues, CATEGORIES_BINAIRES);
}

/* ------------------------------------------------- accord suffisant d'un lot (§4, D65) */

/** §4 : « kappa supérieur ou égal à 0,80 », en fraction exacte ; 0,80 exactement suffit. */
export const SEUIL_KAPPA_LOT = { numerateur: 4, denominateur: 5 } as const;
/** §4 : « accord observé supérieur ou égal à 0,96 », en fraction exacte. */
export const SEUIL_ACCORD_OBSERVE_LOT = { numerateur: 24, denominateur: 25 } as const;
/** §4 : « avec au plus deux désaccords ». */
export const DESACCORDS_MAX_LOT = 2;

/**
 * §4 (0.27, D65) : l'accord d'un lot est suffisant quand son kappa est ≥ 0,80, ou quand son
 * accord observé est ≥ 0,96 avec au plus deux désaccords. Seule définition du projet : l'alerte de
 * réannotation, le diagnostic publié et la lecture du critère J3 (§12) en dérivent tous.
 *
 * Décidé en entiers sur les comptes du kappa publié, comme le seuil du go/no-go : avec
 * `κ = (A·n − B) / (n² − B)`, `κ ≥ 4/5 ⇔ 5·(A·n − B) ≥ 4·(n² − B)` quand `n² − B > 0` ;
 * `A/n ≥ 24/25 ⇔ 25·A ≥ 24·n` ; un désaccord est une paire hors de la diagonale, `n − A`.
 * L'effectif est `n`, celui du kappa publié, contestations déduites : sur un lot qui n'a pas 50
 * paires, les deux conditions de la seconde branche s'appliquent telles quelles.
 *
 * Kappa indéfini, lecture retenue (sans réinterpréter la règle d'avant D65) :
 * - accord attendu maximal : le kappa est absent, mais l'accord observé existe et vaut 1, sans
 *   désaccord ; la seconde branche s'applique telle qu'écrite, l'accord est suffisant, et aucune
 *   alerte n'est levée, comme avant (« un kappa indéfini ne déclenche pas de réannotation ») ;
 * - aucun item commun : rien n'est observé, l'accord n'est pas décidable, `null`. Ni suffisant
 *   ni insuffisant ; aucune alerte non plus, comme avant.
 */
export function accordSuffisant({ n, accords, attendus }: ComptesKappa): boolean | null {
  if (n === 0) return null;
  return kappaAtteintSeuilLot(n, accords, attendus) || accordObserveSuffit(n, accords);
}

function kappaAtteintSeuilLot(n: number, accords: number, attendus: number): boolean {
  const denominateur = n * n - attendus;
  if (denominateur === 0) return false;
  const { numerateur, denominateur: base } = SEUIL_KAPPA_LOT;
  return base * (accords * n - attendus) >= numerateur * denominateur;
}

function accordObserveSuffit(n: number, accords: number): boolean {
  const { numerateur, denominateur } = SEUIL_ACCORD_OBSERVE_LOT;
  return denominateur * accords >= numerateur * n && n - accords <= DESACCORDS_MAX_LOT;
}

/**
 * Alerte de réannotation : l'accord du lot n'est pas suffisant (§4). Un accord non décidable
 * (aucun item commun) ne la déclenche pas : une absence de mesure n'est pas un désaccord.
 */
export function alerteReannotation(comptes: ComptesKappa): boolean {
  return accordSuffisant(comptes) === false;
}
