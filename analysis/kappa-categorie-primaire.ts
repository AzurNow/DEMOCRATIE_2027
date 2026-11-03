/**
 * Les règles communes aux kappas de la notation (§7) : kappa sur la catégorie primaire, note humaine
 * retenue, kappa de la paire de juges. Une règle, un endroit (CLAUDE.md) : le kappa de l'échantillon
 * (`pipeline/go-no-go/kappa-echantillon.ts`), celui du jeu d'or (`analysis/kappa-jeu-or.ts`) et celui
 * des deux humains de l'échantillon (`analysis/accord-humains.ts`) passent tous par ici.
 *
 * - **Noyau.** Le kappa de Cohen non pondéré est celui du §4 (`validation/domaine/kappa.ts:kappaCohen`),
 *   jamais un second : catégories fixées a priori, cas indéfini décidé en entiers.
 * - **Kappa indéfini** (§7, « publié absent avec son motif, jamais comme une valeur, comme au §4 ») :
 *   `accord_attendu_maximal` quand le dénominateur est nul, `aucune_reponse_comparable` quand aucune
 *   paire n'est comparable (D24 (2)). Jamais 0, jamais 1.
 * - **Note humaine retenue** (§7, « celle des deux humains quand ils s'accordent, sinon celle d'un
 *   troisième humain ») : « s'accorder » est `note-lue.ts:notationsConcordent`, seule égalité du dépôt.
 * - **Kappa de la paire** (§7, protocole 0.23, D58) : « le plus faible des kappas des deux juges, de
 *   sorte qu'un juge faible ne se cache jamais derrière l'autre ». Un kappa absent rend la paire absente.
 */

import { kappaCohen, type PaireCategories } from "../validation/domaine/kappa.ts";
import { notationsConcordent } from "./note-lue.ts";
import type { CategorieRetenue, Notation } from "./types.ts";

/** Les trois catégories primaires qu'un juge peut rendre (§7 : « indeterminee » lui est interdite). */
export const CATEGORIES_DE_JUGE = ["exacte", "inexacte", "non_reponse"] as const;
export type CategorieDeJuge = (typeof CATEGORIES_DE_JUGE)[number];

/** Les quatre catégories primaires de la grille (annexe C), celles que peut rendre un humain. */
export const CATEGORIES_PRIMAIRES = ["exacte", "inexacte", "non_reponse", "indeterminee"] as const satisfies readonly CategorieRetenue[];

/** `schema/run.schema.json#/$defs/motif_kappa_echantillon_indefini`. */
export type MotifKappaIndefini = "accord_attendu_maximal" | "aucune_reponse_comparable";

export interface KappaCategorie {
  /** `null` quand le kappa n'est pas défini : `motif_indefini` dit pourquoi. */
  readonly kappa: number | null;
  readonly motif_indefini: MotifKappaIndefini | null;
  /** Nombre de paires comparées. */
  readonly n: number;
}

/**
 * D64 (protocole 0.27, §7) et D70 : « non classée, référence incomplète » ne reçoit pas de catégorie
 * primaire. Une réponse dont une note comparée (référence humaine, juge retenu, l'un des deux humains)
 * est non classée est écartée de tout kappa sur la catégorie primaire — juge-humain, paire de juges,
 * jeu d'or, humain-humain — et comptée à part, comme une indéterminée sous D25. Seule règle du dépôt :
 * chaque kappa l'applique par `ecarterNonClassees`.
 */
export function estNonClassee(categorie: CategorieRetenue): boolean {
  return categorie === "non_classee";
}

/** D64, D70 : sépare les objets d'un kappa de ceux qu'une note non classée en écarte, et les compte. */
export function ecarterNonClassees<O>(
  objets: readonly O[],
  categoriesComparees: (objet: O) => readonly CategorieRetenue[],
): { readonly gardes: readonly O[]; readonly non_classees: number } {
  const gardes = objets.filter((objet) => !categoriesComparees(objet).some(estNonClassee));
  return { gardes, non_classees: objets.length - gardes.length };
}

/**
 * La catégorie d'une note déjà passée par `ecarterNonClassees`. Une non classée ici est une erreur
 * de programmation (le tri de D70 a été sauté), jamais une catégorie comparée.
 */
export function categoriePourKappa<C extends CategorieRetenue>(categorie: C, lieu: string): Exclude<C, "non_classee"> {
  if (categorie === "non_classee") throw new Error(`${lieu} : note non classée parvenue au kappa sans être écartée (D64, D70).`);
  return categorie as Exclude<C, "non_classee">;
}

/** Kappa de Cohen non pondéré sur des catégories fixées a priori, avec le motif de son absence. */
export function kappaCategoriePrimaire<T extends string>(paires: readonly PaireCategories<T>[], categories: readonly T[]): KappaCategorie {
  const resultat = kappaCohen(paires, categories);
  if (resultat.kappa !== null) return { kappa: resultat.kappa, motif_indefini: null, n: resultat.n };
  return { kappa: null, motif_indefini: resultat.n === 0 ? "aucune_reponse_comparable" : "accord_attendu_maximal", n: resultat.n };
}

/**
 * La catégorie de la note humaine retenue d'une réponse doublement notée : celle des deux humains
 * s'ils concordent, sinon celle du troisième. `null` quand ils divergent sans troisième : c'est à
 * l'appelant de lever, avec son contexte ; aucune référence n'est inventée.
 */
export function categorieHumaineRetenue(premiere: Notation, seconde: Notation, troisieme: Notation | null): CategorieRetenue | null {
  if (notationsConcordent(premiere, seconde)) return premiere.categorie;
  return troisieme === null ? null : troisieme.categorie;
}

export interface KappaDeLaPaire {
  readonly kappa: number | null;
  readonly motif_indefini: MotifKappaIndefini | null;
}

/**
 * Le kappa de la paire : le plus faible des kappas des juges retenus. Un juge retiré n'y figure pas
 * (§7 : le kappa « ne porte plus que sur le juge restant »). Dès qu'un kappa est absent, la paire est
 * absente avec le motif du premier kappa absent, dans l'ordre reçu : le kappa de l'autre juge ne le
 * remplace jamais. Sans aucun juge retenu, il n'existe pas de paire : erreur.
 */
export function kappaDeLaPaire(kappas: readonly { readonly juge_id: string; readonly kappa: number | null; readonly motif_indefini: MotifKappaIndefini | null }[]): KappaDeLaPaire {
  if (kappas.length === 0) throw new Error("Kappa de la paire : aucun juge retenu (deux juges retirés : le run est invalide, §7).");
  const absent = kappas.find((k) => k.kappa === null);
  if (absent !== undefined) return { kappa: null, motif_indefini: motifDe(absent) };
  return { kappa: Math.min(...kappas.flatMap((k) => (k.kappa === null ? [] : [k.kappa]))), motif_indefini: null };
}

function motifDe(kappa: { readonly juge_id: string; readonly motif_indefini: MotifKappaIndefini | null }): MotifKappaIndefini {
  if (kappa.motif_indefini === null) throw new Error(`Kappa du juge ${kappa.juge_id} absent sans motif.`);
  return kappa.motif_indefini;
}
