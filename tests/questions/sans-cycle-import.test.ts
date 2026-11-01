/**
 * Lot 8c, constat 15 (relecture du 12/10) : le découpage de `tirage.ts` en `tirabilite.ts`,
 * `entrees-tirage.ts` et `graine.ts` a cassé un cycle d'import, mais rien ne le garantissait. Ce
 * test remplace le script jetable `scratch/verifier-cycles.mjs` : il refait le même parcours en
 * profondeur sur les imports relatifs (y compris `import type`) de tout le dépôt, et n'affirme
 * rien que sur les cycles qui traversent `pipeline/questions/`. Les trois cycles déjà présents
 * ailleurs (notation/charge-juge.ts, validation/serveur/routes.ts) sont hors périmètre.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "../..");
const DOSSIERS_IGNORES = new Set(["node_modules", ".git", "scratch", "archives", "modeles"]);
/**
 * Lot 10 (d) : toutes les formes qui chargent un module relatif — `import … from "./x.ts"`,
 * `import type … from`, `export … from`, l'import pour effet `import "./x.ts"` et l'import dynamique
 * `import("./x.ts")`. L'ancienne expression ne lisait que `from "…"` et manquait les deux dernières.
 */
const RE_IMPORT_RELATIF = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g;

type Etat = "en_cours" | "fini";

function fichiersTypescript(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    const info = statSync(chemin);
    if (info.isDirectory()) fichiersTypescript(chemin, acc);
    else if (extname(nom) === ".ts") acc.push(chemin);
  }
  return acc;
}

/** Les chemins relatifs que charge un texte TypeScript, dans l'ordre d'apparition. */
function specifiersRelatifs(texte: string): string[] {
  return [...texte.matchAll(RE_IMPORT_RELATIF)].map((correspondance) => correspondance[1] as string);
}

function importsRelatifsDe(chemin: string, fichiers: readonly string[]): string[] {
  const texte = readFileSync(chemin, "utf8");
  return specifiersRelatifs(texte)
    .map((specifier) => resolve(dirname(chemin), specifier))
    .filter((cible) => fichiers.includes(cible));
}

function construireGraphe(fichiers: readonly string[]): Map<string, string[]> {
  return new Map(fichiers.map((fichier) => [fichier, importsRelatifsDe(fichier, fichiers)]));
}

function chercherCyclesDepuis(
  noeud: string,
  graphe: ReadonlyMap<string, readonly string[]>,
  etat: Map<string, Etat>,
  pile: string[],
  cycles: string[][],
): void {
  etat.set(noeud, "en_cours");
  pile.push(noeud);
  for (const voisin of graphe.get(noeud) ?? []) {
    if (etat.get(voisin) === "en_cours") {
      const debut = pile.indexOf(voisin);
      cycles.push([...pile.slice(debut), voisin]);
    } else if (etat.get(voisin) !== "fini") {
      chercherCyclesDepuis(voisin, graphe, etat, pile, cycles);
    }
  }
  pile.pop();
  etat.set(noeud, "fini");
}

function tousLesCycles(graphe: ReadonlyMap<string, readonly string[]>): string[][] {
  const etat = new Map<string, Etat>();
  const pile: string[] = [];
  const cycles: string[][] = [];
  for (const noeud of graphe.keys()) {
    if (!etat.has(noeud)) chercherCyclesDepuis(noeud, graphe, etat, pile, cycles);
  }
  return cycles;
}

function traversePipelineQuestions(cycle: readonly string[]): boolean {
  return cycle.some((chemin) => relative(RACINE, chemin).startsWith("pipeline/questions/"));
}

function decrireCycle(cycle: readonly string[]): string {
  return cycle.map((chemin) => relative(RACINE, chemin)).join(" -> ");
}

describe("l'expression d'import relatif voit chaque forme (Lot 10 (d), test du test)", () => {
  it.each([
    ["import nommé", `import { a } from "./nomme.ts";`, "./nomme.ts"],
    ["import type", `import type { A } from '../type.ts';`, "../type.ts"],
    ["import sur plusieurs lignes", `import {\n  a,\n  b,\n} from "./lignes.ts";`, "./lignes.ts"],
    ["import pour effet", `import "./effet.ts";`, "./effet.ts"],
    ["import dynamique", `const m = await import("./dynamique.ts");`, "./dynamique.ts"],
    ["import dynamique espacé", `import ( '../espace.ts' )`, "../espace.ts"],
    ["réexport nommé", `export { a } from "./reexport.ts";`, "./reexport.ts"],
    ["réexport global", `export * from "./tout.ts";`, "./tout.ts"],
    ["réexport de type", `export type { A } from "./reexport-type.ts";`, "./reexport-type.ts"],
  ])("%s", (_forme, texte, attendu) => {
    expect(specifiersRelatifs(texte)).toEqual([attendu]);
  });

  it("ignore les imports de paquets et de modules node, qui ne sont pas relatifs", () => {
    expect(specifiersRelatifs(`import { x } from "vitest";\nimport "node:fs";\nawait import("zod");`)).toEqual([]);
  });

  it("voit toutes les formes d'un même fichier, dans l'ordre", () => {
    const texte = `import "./a.ts";\nexport * from "./b.ts";\nimport("./c.ts");\nimport { d } from "./d.ts";`;
    expect(specifiersRelatifs(texte)).toEqual(["./a.ts", "./b.ts", "./c.ts", "./d.ts"]);
  });
});

describe("absence de cycle d'import", () => {
  it("aucun cycle d'import ne passe par pipeline/questions/", () => {
    const fichiers = fichiersTypescript(RACINE);
    const graphe = construireGraphe(fichiers);
    const cyclesTrouves = tousLesCycles(graphe).filter(traversePipelineQuestions);

    const description = cyclesTrouves.map(decrireCycle).join("\n");
    expect(cyclesTrouves, `cycle(s) d'import détecté(s) via pipeline/questions/ :\n${description}`).toEqual([]);
  });
});
