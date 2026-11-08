// Déclaration minimale de `eslint.config.js`, pour que `tests/lint.test.ts` importe la
// configuration réelle au lieu de la recopier (DETTE 2026-09-18, n° 7). Elle ne décrit que
// la forme du tableau exporté ; les valeurs, seuils compris, viennent du fichier JavaScript.
import type { Linter } from "eslint";

declare const configuration: readonly Linter.Config[];
export default configuration;
