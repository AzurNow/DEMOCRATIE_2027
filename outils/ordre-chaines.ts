/**
 * L'ordre croissant des chaînes publié : comparaison par unités de code UTF-16, celle de `<` en
 * JavaScript (et du `.sort()` sans comparateur), jamais `localeCompare`, qui dépend de la locale de
 * la machine. C'est l'ordre de tout rangement qui part dans un fichier (§7 table des alias, §8 rang
 * des grappes, tirages, empreintes, feuille de route). Hors BMP, il diffère de l'ordre des points
 * de code (U+1F600 précède U+FF5E) : on garde celui de `<`, pour ne déplacer aucun rangement publié.
 *
 * La règle vit ici une seule fois (revue du 2026-10-17, constat 14). Le module est sans dépendance :
 * `analysis/`, `pipeline/`, `validation/` et `outils/` l'importent sans créer d'import
 * `analysis/ → pipeline/`. `tests/ordre-chaines.test.ts` refuse toute copie ailleurs.
 */
export function comparerChaines(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
