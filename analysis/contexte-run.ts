/**
 * `contexte == "run"`, « la seule barrière » entre les réponses permutées du test contrefactuel (§7)
 * et un chiffre publié (schema/README.md), écrite une fois.
 *
 * Elle vivait dans `filtre.ts`, qui la réexporte pour ses appelants. Elle en sort pour que
 * `population-notation.ts` la lise et que `filtre.ts` lise à son tour la population, sans cycle
 * d'import entre les deux.
 */

import type { ContexteMesure } from "./types.ts";

export function estDuRun(objet: { readonly contexte: ContexteMesure }): boolean {
  return objet.contexte === "run";
}

export function filtrerContexteRun<T extends { readonly contexte: ContexteMesure }>(
  objets: readonly T[],
): T[] {
  return objets.filter(estDuRun);
}
