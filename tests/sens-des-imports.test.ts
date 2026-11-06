/**
 * Sens des imports, fermeture transitive (docs/DETTE.md, 2026-11-05 soir, point 3). La règle ESLint
 * de `eslint.config.js` interdit à `analysis/` d'importer `pipeline/` en direct ; elle ne voit pas
 * un module de `outils/` ou de `validation/` qui, importé par `analysis/`, importe `pipeline/`.
 * Ce test suit les imports relatifs de chaque module de `analysis/` et nomme la chaîne complète
 * dès qu'un module de `pipeline/` est atteint. Analyse textuelle, sans dépendance.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = join(import.meta.dirname, "..");

/** Fichier (chemin relatif à la racine, séparateur `/`) → spécificateurs bruts qu'il importe. */
type TableImports = ReadonlyMap<string, readonly string[]>;

const FORMES_STATIQUES = /\b(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g;
const FORME_EFFET = /\bimport\s*["']([^"']+)["']/g;
const FORME_DYNAMIQUE = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function sansCommentaires(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

/** Spécificateurs littéraux : `import`, `import type`, `export … from`, `import "x"`, `import("x")`. */
function specificateursDe(code: string): string[] {
  const nu = sansCommentaires(code);
  return [FORMES_STATIQUES, FORME_EFFET, FORME_DYNAMIQUE].flatMap((motif) =>
    [...nu.matchAll(motif)].map((m) => m[1] as string),
  );
}

/** Fichier de la table que vise `specificateur` depuis `depuis` ; `undefined` pour un paquet ou un fichier hors table. */
function resoudre(table: TableImports, depuis: string, specificateur: string): string | undefined {
  if (!specificateur.startsWith(".")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(depuis), specificateur));
  return [base, `${base}.ts`, `${base}/index.ts`].find((candidat) => table.has(candidat));
}

const estPipeline = (fichier: string): boolean => fichier.startsWith("pipeline/");

/** Plus courte chaîne `depart → … → pipeline/…`, ou `null` si aucun module de `pipeline/` n'est atteint. */
function chaineVersPipeline(table: TableImports, depart: string): string[] | null {
  const parent = new Map<string, string | null>([[depart, null]]);
  const file: string[] = [depart];
  for (let i = 0; i < file.length; i++) {
    const courant = file[i] as string;
    if (estPipeline(courant)) return remonter(parent, courant);
    for (const spec of table.get(courant) ?? []) {
      const cible = resoudre(table, courant, spec);
      if (cible === undefined || parent.has(cible)) continue;
      parent.set(cible, courant);
      file.push(cible);
    }
  }
  return null;
}

function remonter(parent: ReadonlyMap<string, string | null>, bout: string): string[] {
  const chaine: string[] = [];
  for (let n: string | null | undefined = bout; n !== null && n !== undefined; n = parent.get(n)) chaine.unshift(n);
  return chaine;
}

/* ------------------------------------------------------------ fabriqué */

const table = (entrees: Record<string, string[]>): TableImports => new Map(Object.entries(entrees));

describe("chaineVersPipeline sur une table fabriquée", () => {
  it("chaîne directe : analysis → pipeline", () => {
    const t = table({ "analysis/a.ts": ["../pipeline/z.ts"], "pipeline/z.ts": [] });
    expect(chaineVersPipeline(t, "analysis/a.ts")).toEqual(["analysis/a.ts", "pipeline/z.ts"]);
  });

  it("chaîne à deux sauts : analysis → outils → pipeline", () => {
    const t = table({
      "analysis/a.ts": ["../outils/y.ts"],
      "outils/y.ts": ["../pipeline/z.ts"],
      "pipeline/z.ts": [],
    });
    expect(chaineVersPipeline(t, "analysis/a.ts")).toEqual(["analysis/a.ts", "outils/y.ts", "pipeline/z.ts"]);
  });

  it("cycle sans pipeline : ne boucle pas, renvoie null", () => {
    const t = table({ "analysis/a.ts": ["./b.ts"], "analysis/b.ts": ["./a.ts", "./b.ts"] });
    expect(chaineVersPipeline(t, "analysis/a.ts")).toBeNull();
  });

  it("cycle qui finit par atteindre pipeline : chaîne trouvée", () => {
    const t = table({
      "analysis/a.ts": ["./b.ts"],
      "analysis/b.ts": ["./a.ts", "../pipeline/z.ts"],
      "pipeline/z.ts": [],
    });
    expect(chaineVersPipeline(t, "analysis/a.ts")).toEqual(["analysis/a.ts", "analysis/b.ts", "pipeline/z.ts"]);
  });

  it("paquet node_modules et module node: ignorés", () => {
    const t = table({ "analysis/a.ts": ["vitest", "node:fs", "@scope/pipeline/x"] });
    expect(chaineVersPipeline(t, "analysis/a.ts")).toBeNull();
  });

  it("résolution de `./x` vers x.ts et vers x/index.ts", () => {
    const t = table({
      "analysis/a.ts": ["./x", "./dossier"],
      "analysis/x.ts": [],
      "analysis/dossier/index.ts": ["../../pipeline/z.ts"],
      "pipeline/z.ts": [],
    });
    expect(resoudre(t, "analysis/a.ts", "./x")).toBe("analysis/x.ts");
    expect(resoudre(t, "analysis/a.ts", "./dossier")).toBe("analysis/dossier/index.ts");
    expect(chaineVersPipeline(t, "analysis/a.ts")).toEqual([
      "analysis/a.ts",
      "analysis/dossier/index.ts",
      "pipeline/z.ts",
    ]);
  });

  it("spécificateur relatif vers un fichier absent de la table : ignoré", () => {
    expect(resoudre(table({ "analysis/a.ts": [] }), "analysis/a.ts", "./absent.ts")).toBeUndefined();
  });
});

describe("specificateursDe : formes d'import reconnues", () => {
  it("import statique, import type, réexportation, effet de bord et import() littéral", () => {
    const code = [
      'import { a } from "../outils/a.ts";',
      'import type { T } from "../pipeline/t.ts";',
      'export { b } from "./b.ts";',
      'export * from "./c.ts";',
      'import "./effet.ts";',
      'const m = await import("./dyn.ts");',
      "import {",
      "  multi,",
      '} from "./multi.ts";',
    ].join("\n");
    expect(specificateursDe(code).sort()).toEqual(
      ["../outils/a.ts", "../pipeline/t.ts", "./b.ts", "./c.ts", "./dyn.ts", "./effet.ts", "./multi.ts"].sort(),
    );
  });

  it("un import en commentaire n'en est pas un", () => {
    const code = '// import { x } from "../pipeline/x.ts";\n/* import("../pipeline/y.ts") */\nconst u = 1;';
    expect(specificateursDe(code)).toEqual([]);
  });

  it("une réexportation de type est suivie comme les autres", () => {
    const t = table({ "analysis/a.ts": specificateursDe('export type { T } from "../pipeline/t.ts";'), "pipeline/t.ts": [] });
    expect(chaineVersPipeline(t, "analysis/a.ts")).toEqual(["analysis/a.ts", "pipeline/t.ts"]);
  });
});

/* ---------------------------------------------------------------- dépôt */

const REPERTOIRES = ["analysis", "pipeline", "outils", "validation"];
const IGNORES = new Set(["node_modules", "dist", ".astro"]);

function fichiersTs(repertoire: string): string[] {
  return readdirSync(repertoire).flatMap((nom) => {
    const chemin = join(repertoire, nom);
    if (statSync(chemin).isDirectory()) return IGNORES.has(nom) ? [] : fichiersTs(chemin);
    return nom.endsWith(".ts") && !nom.endsWith(".d.ts") ? [chemin] : [];
  });
}

function tableDuDepot(): TableImports {
  const entrees = REPERTOIRES.flatMap((r) => fichiersTs(join(RACINE, r))).map((chemin): [string, string[]] => [
    relative(RACINE, chemin).split(sep).join("/"),
    specificateursDe(readFileSync(chemin, "utf8")),
  ]);
  return new Map(entrees);
}

describe("analysis/ n'atteint jamais pipeline/, même par transitivité", () => {
  it("aucune chaîne d'imports ne mène d'un module de analysis/ à un module de pipeline/", () => {
    const depot = tableDuDepot();
    const departs = [...depot.keys()].filter((f) => f.startsWith("analysis/") && !f.endsWith(".test.ts"));
    expect(departs.length).toBeGreaterThan(0);
    const chaines = departs.flatMap((d) => {
      const chaine = chaineVersPipeline(depot, d);
      return chaine === null ? [] : [chaine.join(" → ")];
    });
    expect(chaines).toEqual([]);
  });
});
