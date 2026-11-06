/**
 * L'ordre croissant des chaînes publié (unités de code UTF-16, celui de `<`) vit une seule fois,
 * dans `outils/ordre-chaines.ts` (revue du 2026-10-17, constat 14). D'abord le comparateur sur ses
 * cas limites, puis un test structurel : aucune copie en ligne ni aucun `localeCompare` ne doit
 * réapparaître dans le code qui produit des fichiers.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { comparerChaines } from "../outils/ordre-chaines.ts";

const RACINE = join(import.meta.dirname, "..");

describe("comparerChaines : ordre UTF-16 de `<`", () => {
  it("chaînes égales : 0, dans les deux sens", () => {
    expect(comparerChaines("lot-001", "lot-001")).toBe(0);
    expect(comparerChaines("", "")).toBe(0);
  });

  it("casse : toute majuscule ASCII précède toute minuscule (« B » avant « a »)", () => {
    expect(["b", "a", "B", "A"].sort(comparerChaines)).toEqual(["A", "B", "a", "b"]);
    expect(comparerChaines("B", "a")).toBeLessThan(0);
    expect(comparerChaines("a", "B")).toBeGreaterThan(0);
  });

  it("accents : « é » (U+00E9) vient après « f » et « z », à l'inverse de localeCompare fr", () => {
    expect(["é", "z", "f", "e"].sort(comparerChaines)).toEqual(["e", "f", "z", "é"]);
    expect("é".localeCompare("f", "fr")).toBeLessThan(0);
  });

  it("préfixe : une chaîne précède toute chaîne qui la prolonge, la vide précède tout", () => {
    expect(comparerChaines("lot", "lot-1")).toBeLessThan(0);
    expect(comparerChaines("lot-1", "lot")).toBeGreaterThan(0);
    expect(comparerChaines("", "a")).toBeLessThan(0);
  });

  it("chiffres : ordre lexical, pas numérique (« 10 » avant « 9 »)", () => {
    expect(["9", "10", "1"].sort(comparerChaines)).toEqual(["1", "10", "9"]);
  });

  it("hors BMP : l'ordre des unités UTF-16 est voulu, pas celui des points de code", () => {
    // U+1F600 s'écrit D83D DE00 en UTF-16 ; U+FF5E est une seule unité FF5E. Par points de code,
    // U+FF5E précéderait U+1F600 ; par unités UTF-16 (ce que fait `<`), D83D < FF5E le place avant.
    // L'ordre publié est celui de `<` : on le garde, pour ne déplacer aucun rangement existant.
    const emoji: string = "\u{1F600}";
    const pleineChasse: string = "\uFF5E";
    expect(emoji < pleineChasse).toBe(true);
    expect((emoji.codePointAt(0) as number) > (pleineChasse.codePointAt(0) as number)).toBe(true);
    expect(comparerChaines(emoji, pleineChasse)).toBeLessThan(0);
    expect([pleineChasse, emoji].sort(comparerChaines)).toEqual([emoji, pleineChasse]);
  });

  it("coïncide avec `<` et avec le tri par défaut sur un échantillon mêlé", () => {
    const echantillon = ["b", "B", "é", "e", "", "\u{1F600}", "\uFF5E", "a1", "a", "Z", "10", "9"];
    const parInferieur = [...echantillon].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect([...echantillon].sort(comparerChaines)).toEqual(parInferieur);
    expect([...echantillon].sort(comparerChaines)).toEqual([...echantillon].sort());
  });
});

/* -------------------------------------------------------------- structure */

/** Répertoires du code qui produit des fichiers publiés ou des rangements de mesure. */
const PERIMETRE = ["pipeline", "analysis", "validation/domaine", "outils"];
/** Le seul endroit où l'ordre s'écrit. */
const DEFINITION = "outils/ordre-chaines.ts";

const COPIES: readonly { readonly nom: string; readonly motif: RegExp }[] = [
  { nom: "localeCompare", motif: /\.localeCompare\(/ },
  { nom: "ternaire à trois issues", motif: /\?\s*-1\s*:[^;]*?\?\s*1\s*:\s*0\b/ },
  { nom: "if (a < b) return -1", motif: /if\s*\(\s*[\w.[\]]+\s*<\s*[\w.[\]]+\s*\)\s*return\s+-1\b/ },
  { nom: "définition concurrente", motif: /function\s+comparerChaines\b/ },
  { nom: "Intl.Collator", motif: /\bIntl\.Collator\b/ },
  // Sans argument, la locale vient de l'environnement ; `("fr")` explicite est déterministe et permis.
  { nom: "toLocaleLowerCase/UpperCase sans locale", motif: /\.toLocale(?:Lower|Upper)Case\(\s*\)/ },
];

function fichiersTs(repertoire: string): string[] {
  return readdirSync(repertoire).flatMap((nom) => {
    const chemin = join(repertoire, nom);
    if (statSync(chemin).isDirectory()) return nom === "node_modules" ? [] : fichiersTs(chemin);
    return nom.endsWith(".ts") ? [chemin] : [];
  });
}

/** `fichier:ligne (genre)` pour chaque copie de l'ordre trouvée dans `code`. */
function copiesDansCode(fichier: string, code: string): string[] {
  return code.split("\n").flatMap((ligne, rang) =>
    COPIES.filter((copie) => copie.motif.test(ligne)).map((copie) => `${fichier}:${rang + 1} (${copie.nom})`),
  );
}

describe("une seule définition de l'ordre des chaînes", () => {
  it("le détecteur reconnaît chaque forme connue, et laisse passer l'appel au comparateur", () => {
    expect(copiesDansCode("f.ts", "xs.sort((a, b) => a.id.localeCompare(b.id));")).toEqual(["f.ts:1 (localeCompare)"]);
    expect(copiesDansCode("f.ts", "return a < b ? -1 : a > b ? 1 : 0;")).toEqual(["f.ts:1 (ternaire à trois issues)"]);
    expect(copiesDansCode("f.ts", ".sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0))")).toEqual(["f.ts:1 (ternaire à trois issues)"]);
    expect(copiesDansCode("f.ts", "  if (a < b) return -1;")).toEqual(["f.ts:1 (if (a < b) return -1)"]);
    expect(copiesDansCode("f.ts", "export function comparerChaines(a: string, b: string): number {")).toEqual([
      "f.ts:1 (définition concurrente)",
    ]);
    expect(copiesDansCode("f.ts", "xs.sort(comparerChaines);\n// jamais `localeCompare`, qui dépend de la locale")).toEqual([]);
  });

  it("le détecteur reconnaît Intl.Collator et toLocale*Case sans locale, et laisse passer la locale explicite", () => {
    expect(copiesDansCode("f.ts", "const c = new Intl.Collator('fr');")).toEqual(["f.ts:1 (Intl.Collator)"]);
    expect(copiesDansCode("f.ts", "const s = t.toLocaleLowerCase();")).toEqual([
      "f.ts:1 (toLocaleLowerCase/UpperCase sans locale)",
    ]);
    expect(copiesDansCode("f.ts", "const s = t.toLocaleUpperCase( );")).toEqual([
      "f.ts:1 (toLocaleLowerCase/UpperCase sans locale)",
    ]);
    expect(copiesDansCode("f.ts", 'const s = t.toLocaleLowerCase("fr");')).toEqual([]);
  });

  it(`aucune copie hors de ${DEFINITION} dans ${PERIMETRE.join(", ")}`, () => {
    const trouvees = PERIMETRE.flatMap((repertoire) => fichiersTs(join(RACINE, repertoire)))
      .map((chemin) => relative(RACINE, chemin))
      .filter((fichier) => fichier !== DEFINITION)
      .flatMap((fichier) => copiesDansCode(fichier, readFileSync(join(RACINE, fichier), "utf8")));
    expect(trouvees).toEqual([]);
  });
});
