/**
 * Règle 3 de `CLAUDE.md`, rendue vérifiable (lot contestation-notification, V1, étendu à
 * `data/mesures/` par la décision D38) : « aucun script, aucun agent, aucune migration n'écrit dans
 * `data/` directement ». Un seul module écrit dans chaque répertoire protégé, derrière ses contrôles
 * (schéma, ajout seul, empreinte du fichier lu) : `validation/io/data-items.ts` pour `data/items`,
 * `validation/io/data-mesures.ts` pour `data/mesures`, `validation/io/data-formulations.ts` pour
 * `data/formulations` (décision D39). Aucun autre fichier de `outils/`,
 * `pipeline/`, `validation/`, `analysis/` ni `notation-humaine/` ne combine une écriture disque et le chemin d'un
 * répertoire protégé, et un écrivain n'est autorisé que pour le sien. Ajouter un répertoire
 * protégé, c'est ajouter une ligne à `PROTEGES`.
 *
 * Le contrôle est textuel, donc grossier : il attrape l'écriture directe, pas un chemin reconstruit
 * morceau par morceau. C'est un filet, pas une preuve ; la preuve reste la relecture.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "..");
/**
 * Tout le code de production de l'arborescence de `CLAUDE.md` (revue du 2026-10-12, constat 23 :
 * `notation-humaine/` lit `data/items` et n'était pas balayé). `scratch/` et `tests/` sont exclus.
 */
const REPERTOIRES = ["outils", "pipeline", "validation", "analysis", "notation-humaine"];
/** Répertoires de premier niveau qui ne sont pas du code de production, même s'ils contiennent du .ts ou du .py. */
const HORS_PRODUCTION = new Set(["scratch", "tests", "node_modules", "docs", "schema", "config", "prompts", "runs"]);
const IGNORES = new Set(["node_modules", "dist", "__pycache__"]);

interface Protege {
  readonly repertoire: string;
  readonly ecrivain: string;
  readonly chemin: RegExp;
}

/** Répertoire protégé → seul écrivain autorisé. Des données : aucun cas particulier dans le code. */
const PROTEGES: readonly Protege[] = [
  { repertoire: "data/items", ecrivain: "validation/io/data-items.ts", chemin: /data\/items|["']data["']\s*,\s*["']items["']/ },
  { repertoire: "data/mesures", ecrivain: "validation/io/data-mesures.ts", chemin: /data\/mesures|["']data["']\s*,\s*["']mesures["']/ },
  // Décision D39 : seule la relecture des formulations promeut vers data/formulations, par ce module.
  {
    repertoire: "data/formulations",
    ecrivain: "validation/io/data-formulations.ts",
    chemin: /data\/formulations|["']data["']\s*,\s*["']formulations["']/,
  },
];

const ECRITURE_TS =
  /\b(writeFileSync|appendFileSync|renameSync|linkSync|symlinkSync|copyFileSync|cpSync|rmSync|unlinkSync|mkdirSync|createWriteStream|writeFile|appendFile)\s*\(/;
const ECRITURE_PY = /\bopen\([^\n]*,\s*(mode\s*=\s*)?["'][rbt]*[wax+][rwxabt+]*["']|\.write_(text|bytes)\(|\bos\.(replace|rename|remove|unlink)\(|\bshutil\.(copy\w*|move)\(/;

function fichiersSources(repertoire: string): readonly string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(repertoire)) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(repertoire, nom);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersSources(chemin));
    else if (/\.(ts|py)$/.test(nom)) trouves.push(chemin);
  }
  return trouves;
}

/** Les répertoires de premier niveau (hors cachés) qui portent des sources .ts ou .py de production. */
function repertoiresDeCode(racine: string): readonly string[] {
  return readdirSync(racine)
    .filter((nom) => !nom.startsWith(".") && !HORS_PRODUCTION.has(nom) && !IGNORES.has(nom))
    .filter((nom) => statSync(join(racine, nom)).isDirectory())
    .filter((nom) => fichiersSources(join(racine, nom)).length > 0);
}

/** Les fichiers de ces répertoires, relatifs à `racine`, qui écrivent dans un répertoire protégé sans en être l'écrivain. */
function fautifsDans(racine: string, repertoires: readonly string[]) {
  return repertoires
    .flatMap((repertoire) => fichiersSources(join(racine, repertoire)))
    .map((chemin) => relative(racine, chemin))
    .map((chemin) => ({ chemin, ecrits: ecrituresInterdites(chemin, readFileSync(join(racine, chemin), "utf8")) }))
    .filter(({ ecrits }) => ecrits.length > 0);
}

/** Les répertoires protégés que ce contenu écrit (écriture disque et chemin du répertoire). */
export function repertoiresEcrits(chemin: string, contenu: string): readonly string[] {
  const ecriture = chemin.endsWith(".py") ? ECRITURE_PY : ECRITURE_TS;
  if (!ecriture.test(contenu)) return [];
  return PROTEGES.filter((protege) => protege.chemin.test(contenu)).map((protege) => protege.repertoire);
}

export function ecritDansData(chemin: string, contenu: string): boolean {
  return repertoiresEcrits(chemin, contenu).length > 0;
}

/** Les répertoires qu'un fichier écrit sans en être l'écrivain déclaré. */
function ecrituresInterdites(chemin: string, contenu: string): readonly string[] {
  return repertoiresEcrits(chemin, contenu).filter(
    (repertoire) => PROTEGES.find((protege) => protege.repertoire === repertoire)?.ecrivain !== chemin,
  );
}

describe("détecteur", () => {
  it("attrape une écriture directe vers data/items, en TypeScript comme en Python", () => {
    expect(ecritDansData("x.ts", 'writeFileSync(join("data/items", nom), texte)')).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "items"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'open(Path("data/items") / nom, "w")')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/items/x.json").write_text(s)')).toBe(true);
  });

  it("attrape une écriture directe vers data/mesures, en TypeScript comme en Python", () => {
    expect(ecritDansData("x.ts", 'writeFileSync(join("data/mesures", nom), texte)')).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "mesures"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'open(Path("data/mesures") / nom, "w")')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/mesures/x.json").write_text(s)')).toBe(true);
  });

  it("laisse passer une lecture de data/items, et une écriture ailleurs", () => {
    expect(ecritDansData("x.ts", 'readFileSync(join("data/items", nom), "utf8")')).toBe(false);
    expect(ecritDansData("x.ts", 'writeFileSync(join("staging/items", nom), texte)')).toBe(false);
    expect(ecritDansData("x.py", 'open(Path("data/items") / nom, encoding="utf-8")')).toBe(false);
  });

  it("laisse passer une lecture de data/mesures, et une écriture dans staging/mesures", () => {
    expect(ecritDansData("x.ts", 'readFileSync(join("data/mesures", nom), "utf8")')).toBe(false);
    expect(ecritDansData("x.ts", 'writeFileSync(join("staging/mesures", nom), texte)')).toBe(false);
    expect(ecritDansData("x.py", 'open(Path("data/mesures") / nom, encoding="utf-8")')).toBe(false);
  });

  it("cas limite 10 : data/formulations a un seul écrivain déclaré, et toute autre écriture y est attrapée", () => {
    const ecrivains = PROTEGES.filter((protege) => protege.repertoire === "data/formulations").map((protege) => protege.ecrivain);
    expect(ecrivains).toEqual(["validation/io/data-formulations.ts"]);
    const versFormulations = 'writeFileSync(join("data/formulations", nom), texte)';
    expect(ecritDansData("x.ts", versFormulations)).toBe(true);
    expect(ecritDansData("x.ts", 'const d = join(racine, "data", "formulations"); renameSync(a, d)')).toBe(true);
    expect(ecritDansData("x.py", 'Path("data/formulations/q.json").write_text(s)')).toBe(true);
    expect(ecritDansData("x.ts", 'readFileSync(join("data/formulations", nom), "utf8")')).toBe(false);
    expect(ecrituresInterdites("validation/io/data-formulations.ts", versFormulations)).toEqual([]);
    expect(ecrituresInterdites("validation/serveur/formulations.ts", versFormulations)).toEqual(["data/formulations"]);
    expect(ecrituresInterdites("validation/io/data-mesures.ts", versFormulations)).toEqual(["data/formulations"]);
  });

  it("un écrivain n'est autorisé que pour son propre répertoire", () => {
    const [items, mesures] = PROTEGES.map((protege) => protege.ecrivain) as [string, string];
    const versMesures = 'writeFileSync(join("data/mesures", nom), texte)';
    const versItems = 'writeFileSync(join("data/items", nom), texte)';
    expect(ecrituresInterdites(items, versItems)).toEqual([]);
    expect(ecrituresInterdites(mesures, versMesures)).toEqual([]);
    expect(ecrituresInterdites(items, versMesures)).toEqual(["data/mesures"]);
    expect(ecrituresInterdites(mesures, versItems)).toEqual(["data/items"]);
    expect(ecrituresInterdites("outils/x.ts", versItems + versMesures)).toEqual(["data/items", "data/mesures"]);
  });
});

describe("règle 3 : un seul module écrit dans chaque répertoire de data/", () => {
  const fichiers = REPERTOIRES.flatMap((repertoire) => fichiersSources(join(RACINE, repertoire)));

  it("le balayage porte sur des fichiers réels", () => {
    expect(fichiers.length).toBeGreaterThan(50);
    const relatifs = fichiers.map((chemin) => relative(RACINE, chemin));
    for (const { ecrivain } of PROTEGES) expect(relatifs).toContain(ecrivain);
    expect(relatifs.some((chemin) => chemin.startsWith("notation-humaine/"))).toBe(true);
  });

  it("le balayage couvre tout répertoire de code de production (scratch/ et tests/ exclus)", () => {
    expect([...repertoiresDeCode(RACINE)].sort()).toEqual([...REPERTOIRES].sort());
  });

  it.each(PROTEGES)("l'écrivain de $repertoire écrit bien sur disque vers $repertoire", (protege) => {
    const contenu = readFileSync(join(RACINE, protege.ecrivain), "utf8");
    expect(repertoiresEcrits(protege.ecrivain, contenu)).toContain(protege.repertoire);
  });

  it("aucun fichier n'écrit dans un répertoire protégé sans en être l'écrivain", () => {
    expect(fautifsDans(RACINE, REPERTOIRES)).toEqual([]);
  });

  it("cas limite : une écriture vers data/ simulée dans notation-humaine/ est attrapée (test du test)", () => {
    const racine = mkdtempSync(join(tmpdir(), "banc-essai-ecriture-"));
    try {
      mkdirSync(join(racine, "notation-humaine", "serveur"), { recursive: true });
      writeFileSync(
        join(racine, "notation-humaine", "serveur", "simulation.ts"),
        'import { writeFileSync } from "node:fs";\nwriteFileSync(join("data/items", nom), texte);\n',
      );
      expect(fautifsDans(racine, ["notation-humaine"])).toEqual([
        { chemin: "notation-humaine/serveur/simulation.ts", ecrits: ["data/items"] },
      ]);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});
