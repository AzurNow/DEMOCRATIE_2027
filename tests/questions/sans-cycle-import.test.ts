/**
 * Lot 8c, constat 15 (relecture du 12/10) : le découpage de `tirage.ts` en `tirabilite.ts`,
 * `entrees-tirage.ts` et `graine.ts` a cassé un cycle d'import, mais rien ne le garantissait. Ce
 * test remplace le script jetable `scratch/verifier-cycles.mjs`. docs/DETTE.md 2026-11-09 n° 4 :
 * la même garde couvre désormais `analysis/` ; la détection vit dans `tests/aides/cycles-import.ts`.
 * Chaque périmètre n'affirme rien que sur les cycles qui le traversent. Les imports de type
 * (`import type`) comptent, comme dans le test d'origine : un cycle de types seul est signalé.
 * Les cycles déjà présents ailleurs (notation/charge-juge.ts, validation/serveur/routes.ts) sont
 * hors périmètre.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  construireGraphe,
  decrireCycle,
  fichiersTypescript,
  specifiersRelatifs,
  tousLesCycles,
  traverse,
} from "../aides/cycles-import.ts";

const RACINE = resolve(import.meta.dirname, "../..");

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

describe("tousLesCycles sur un graphe en mémoire", () => {
  it("cycle direct A -> B -> A", () => {
    const graphe = new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ]);
    expect(tousLesCycles(graphe)).toEqual([["a", "b", "a"]]);
  });

  it("cycle à trois fichiers A -> B -> C -> A", () => {
    const graphe = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
    ]);
    expect(tousLesCycles(graphe)).toEqual([["a", "b", "c", "a"]]);
  });

  it("un fichier qui s'importe lui-même est un cycle", () => {
    expect(tousLesCycles(new Map([["a", ["a"]]]))).toEqual([["a", "a"]]);
  });

  it("un losange sans retour n'est pas un cycle", () => {
    const graphe = new Map([
      ["a", ["b", "c"]],
      ["b", ["d"]],
      ["c", ["d"]],
      ["d", []],
    ]);
    expect(tousLesCycles(graphe)).toEqual([]);
  });
});

describe("construireGraphe + tousLesCycles sur une arborescence temporaire", () => {
  const dossiers: string[] = [];
  afterEach(() => {
    for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true });
  });

  function arborescence(fichiers: Record<string, string>): string {
    const racine = mkdtempSync(join(tmpdir(), "cycles-"));
    dossiers.push(racine);
    for (const [nom, contenu] of Object.entries(fichiers)) {
      mkdirSync(join(racine, nom, ".."), { recursive: true });
      writeFileSync(join(racine, nom), contenu);
    }
    return racine;
  }

  const cyclesDe = (racine: string) => tousLesCycles(construireGraphe(fichiersTypescript(racine)));

  it("trouve un cycle direct entre deux fichiers", () => {
    const racine = arborescence({
      "analysis/a.ts": `import { b } from "./b.ts";\nexport const a = b;`,
      "analysis/b.ts": `import { a } from "./a.ts";\nexport const b = a;`,
    });
    const cycles = cyclesDe(racine);
    expect(cycles.map((c) => decrireCycle(racine, c))).toEqual(["analysis/a.ts -> analysis/b.ts -> analysis/a.ts"]);
    expect(cycles.every((c) => traverse(racine, c, "analysis/"))).toBe(true);
  });

  it("trouve un cycle à trois fichiers", () => {
    const racine = arborescence({
      "analysis/a.ts": `import { b } from "./b.ts";`,
      "analysis/b.ts": `import { c } from "./c.ts";`,
      "analysis/c.ts": `import { a } from "./a.ts";`,
    });
    const cycles = cyclesDe(racine);
    expect(cycles).toHaveLength(1);
    expect(decrireCycle(racine, cycles[0] as string[])).toBe(
      "analysis/a.ts -> analysis/b.ts -> analysis/c.ts -> analysis/a.ts",
    );
  });

  it("un cycle de types seul (`import type`) est signalé, comme dans le test d'origine", () => {
    const racine = arborescence({
      "analysis/a.ts": `import type { B } from "./b.ts";\nexport type A = B;`,
      "analysis/b.ts": `import type { A } from "./a.ts";\nexport type B = A;`,
    });
    expect(cyclesDe(racine)).toHaveLength(1);
  });

  it("un cycle hors du périmètre demandé n'est pas attribué à ce périmètre", () => {
    const racine = arborescence({
      "outils/a.ts": `import "./b.ts";`,
      "outils/b.ts": `import "./a.ts";`,
      "analysis/c.ts": `export const c = 1;`,
    });
    const cycles = cyclesDe(racine);
    expect(cycles).toHaveLength(1);
    expect(cycles.filter((c) => traverse(racine, c, "analysis/"))).toEqual([]);
  });
});

describe.each(["pipeline/questions/", "analysis/"])("absence de cycle d'import, périmètre %s", (perimetre) => {
  it(`aucun cycle d'import ne passe par ${perimetre}`, () => {
    const graphe = construireGraphe(fichiersTypescript(RACINE));
    const cyclesTrouves = tousLesCycles(graphe).filter((cycle) => traverse(RACINE, cycle, perimetre));

    const description = cyclesTrouves.map((cycle) => decrireCycle(RACINE, cycle)).join("\n");
    expect(cyclesTrouves, `cycle(s) d'import détecté(s) via ${perimetre} :\n${description}`).toEqual([]);
  });
});
