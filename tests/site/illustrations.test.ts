/**
 * Garde des huit illustrations pixel art de la page pédagogique (site/src/illustrations/*.svg).
 * Elles sont insérées en ligne dans la page : tout nom de classe ou d'id doit porter le préfixe
 * `ill-<nom>-` pour ne jamais entrer en collision, les couleurs ne viennent que des variables
 * `--px-…` du thème, et rien ne bouge sous « mouvement réduit ». Aucune dépendance : analyse
 * par expressions régulières, suffisante pour des fichiers que nous générons nous-mêmes.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOSSIER = join(import.meta.dirname, "..", "..", "site", "src", "illustrations");
const NOMS = ["accroche", "collecter", "valider", "questionner", "interroger", "noter", "analyser", "publier"] as const;
const TAILLE_MAX = 25_000;
const ELEMENTS_ADMIS = new Set(["svg", "style", "g", "rect", "use", "symbol", "defs"]);
const REPLI = /var\(--px-[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g;

function sansCommentaires(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/g, "");
}

function contenuStyle(svg: string): string {
  return [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "").join("\n");
}

function racine(svg: string): string {
  return /<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
}

function controleRacine(svg: string): string[] {
  const r = racine(svg);
  const erreurs: string[] = [];
  if (!/\sviewBox="0 0 160 120"/.test(r)) erreurs.push('viewBox attendu : "0 0 160 120"');
  if (!/\sshape-rendering="crispEdges"/.test(r)) erreurs.push('shape-rendering="crispEdges" manquant');
  if (!/\saria-hidden="true"/.test(r)) erreurs.push('aria-hidden="true" manquant sur la racine');
  return erreurs;
}

function controleElements(svg: string): string[] {
  const noms = [...sansCommentaires(svg).matchAll(/<\s*([a-zA-Z][\w:-]*)/g)].map((m) => m[1] ?? "");
  return [...new Set(noms)].filter((n) => !ELEMENTS_ADMIS.has(n)).map((n) => `élément non admis : <${n}>`);
}

function controleCouleurs(svg: string): string[] {
  const erreurs: string[] = [];
  const sansRepli = sansCommentaires(svg).replace(REPLI, "");
  if (/\s(fill|stroke|stop-color|style)\s*=/.test(sansRepli)) erreurs.push("couleur ou style en attribut (fill=, stroke=, style=)");
  if (/#[0-9a-fA-F]{3,8}\b/.test(sansRepli.replace(/href="#[^"]*"/g, ""))) erreurs.push("couleur hexadécimale en dur hors d'un repli var(--px-…, #…)");
  if (/\b(rgb|rgba|hsl|hsla)\(/.test(sansRepli)) erreurs.push("couleur fonctionnelle en dur (rgb, hsl)");
  for (const m of contenuStyle(svg).matchAll(/\b(?:fill|stroke)\s*:\s*([^;}]+)/g)) {
    if (!(m[1] ?? "").trim().startsWith("var(--px-")) erreurs.push(`fill/stroke qui ne lit pas une variable --px-… : ${m[1] ?? ""}`);
  }
  return erreurs;
}

function captures(motif: RegExp, texte: string): string[] {
  return [...texte.matchAll(motif)].map((m) => m[1] ?? "");
}

function sansPrefixe(valeurs: string[], prefixe: string, etiquette: string): string[] {
  return valeurs.filter((v) => !v.startsWith(prefixe)).map((v) => `${etiquette} sans préfixe ${prefixe} : ${v}`);
}

function controleNoms(nom: string, svg: string): string[] {
  const prefixe = `ill-${nom}-`;
  const corps = sansCommentaires(svg);
  const style = contenuStyle(svg);
  const classes = captures(/\sclass="([^"]*)"/g, corps).flatMap((v) => v.split(/\s+/).filter(Boolean));
  const selecteurs = captures(/\.([a-zA-Z_][\w-]*)/g, style.replace(/@keyframes\s+[\w-]+/g, ""));
  return [
    ...sansPrefixe(classes, prefixe, "classe"),
    ...sansPrefixe(captures(/\sid="([^"]*)"/g, corps), prefixe, "id"),
    ...sansPrefixe(selecteurs, prefixe, "sélecteur CSS"),
    ...sansPrefixe(captures(/@keyframes\s+([\w-]+)/g, style), prefixe, "@keyframes"),
  ];
}

function controleReseau(nom: string, svg: string): string[] {
  const erreurs: string[] = [];
  const sansXmlns = sansCommentaires(svg).replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
  if (/https?:|\/\//.test(sansXmlns)) erreurs.push("URL externe");
  if (/url\(|@import/.test(sansXmlns)) erreurs.push("url() ou @import");
  for (const m of sansXmlns.matchAll(/\s(?:xlink:)?href="([^"]*)"/g)) {
    if (!(m[1] ?? "").startsWith(`#ill-${nom}-`)) erreurs.push(`href hors #ill-${nom}- : ${m[1] ?? ""}`);
  }
  return erreurs;
}

function controleMouvement(svg: string): string[] {
  const style = contenuStyle(svg);
  const anime = /\banimation(?:-name)?\s*:/.test(style);
  if (anime && !/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(style)) return ["animation déclarée sans bloc prefers-reduced-motion: reduce"];
  return [];
}

function controleCoordonnees(svg: string): string[] {
  const erreurs: string[] = [];
  for (const m of sansCommentaires(svg).matchAll(/<rect\b([^>]*)>/g)) {
    for (const a of (m[1] ?? "").matchAll(/\s([\w:-]+)="([^"]*)"/g)) {
      if (!/^\d+$/.test(a[2] ?? "")) erreurs.push(`<rect> ${a[1] ?? ""}="${a[2] ?? ""}" n'est pas un entier`);
    }
  }
  return erreurs;
}

function controleTaille(svg: string): string[] {
  const octets = Buffer.byteLength(svg);
  return octets < TAILLE_MAX ? [] : [`${octets} octets : au moins ${TAILLE_MAX}`];
}

function controler(nom: string, svg: string): string[] {
  return [
    ...controleRacine(svg),
    ...controleElements(svg),
    ...controleCouleurs(svg),
    ...controleNoms(nom, svg),
    ...controleReseau(nom, svg),
    ...controleMouvement(svg),
    ...controleCoordonnees(svg),
    ...controleTaille(svg),
  ];
}

const SVG_VALIDE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" shape-rendering="crispEdges" aria-hidden="true">
<style>
.ill-t-encre{fill:var(--px-encre,#1f2233)}
.ill-t-clig{animation:ill-t-k 1s steps(1,end) infinite}
@keyframes ill-t-k{0%{opacity:1}50%{opacity:0}}
@media (prefers-reduced-motion: reduce){.ill-t-clig{animation:none}}
</style>
<g class="ill-t-encre"><rect x="1" y="2" width="3" height="4"/></g>
<g class="ill-t-clig"><use href="#ill-t-m" x="3"/></g>
</svg>`;

describe("illustrations : le contrôle lui-même", () => {
  it("accepte un SVG conforme", () => {
    expect(controler("t", SVG_VALIDE)).toEqual([]);
  });

  it("refuse un fill en attribut avec une couleur en dur (fill=\"#fff\")", () => {
    const erreurs = controler("t", SVG_VALIDE.replace('<rect x="1"', '<rect fill="#fff" x="1"'));
    expect(erreurs.some((e) => e.includes("fill="))).toBe(true);
    expect(erreurs.some((e) => e.includes("hexadécimale"))).toBe(true);
  });

  it("refuse une couleur hexadécimale hors d'un repli var(--px-…, #…)", () => {
    const erreurs = controler("t", SVG_VALIDE.replace("fill:var(--px-encre,#1f2233)", "fill:#1f2233"));
    expect(erreurs.length).toBeGreaterThan(0);
  });

  it("refuse une classe sans préfixe ill-<nom>-", () => {
    const erreurs = controler("t", SVG_VALIDE.replace('<g class="ill-t-encre">', '<g class="encre">'));
    expect(erreurs).toContain("classe sans préfixe ill-t- : encre");
  });

  it("refuse un sélecteur CSS, un id et des @keyframes sans préfixe", () => {
    const erreurs = controler("t", SVG_VALIDE.replace(".ill-t-encre{", ".encre{").replace("@keyframes ill-t-k", "@keyframes k").replace("<use ", '<use id="u" '));
    expect(erreurs.some((e) => e.startsWith("sélecteur CSS sans préfixe"))).toBe(true);
    expect(erreurs.some((e) => e.startsWith("@keyframes sans préfixe"))).toBe(true);
    expect(erreurs.some((e) => e.startsWith("id sans préfixe"))).toBe(true);
  });

  it("refuse une animation sans bloc prefers-reduced-motion", () => {
    const erreurs = controler("t", SVG_VALIDE.replace(/@media[^\n]*\n/, ""));
    expect(erreurs).toContain("animation déclarée sans bloc prefers-reduced-motion: reduce");
  });

  it("refuse une URL externe, un href hors #ill-<nom>- et un élément non admis", () => {
    expect(controler("t", SVG_VALIDE.replace("<g class", '<a href="https://exemple.org"/><g class')).some((e) => e.includes("URL externe"))).toBe(true);
    expect(controler("t", SVG_VALIDE.replace('href="#ill-t-m"', 'href="#autre"')).some((e) => e.startsWith("href hors"))).toBe(true);
    expect(controler("t", SVG_VALIDE.replace("<g class", '<text>mot</text><image/><g class')).filter((e) => e.startsWith("élément non admis"))).toHaveLength(2);
  });

  it("refuse un viewBox différent, un aria-hidden manquant et une coordonnée non entière", () => {
    expect(controler("t", SVG_VALIDE.replace("0 0 160 120", "0 0 100 100"))[0]).toContain("viewBox");
    expect(controler("t", SVG_VALIDE.replace(' aria-hidden="true"', "")).some((e) => e.includes("aria-hidden"))).toBe(true);
    expect(controler("t", SVG_VALIDE.replace('x="1"', 'x="1.5"')).some((e) => e.includes("n'est pas un entier"))).toBe(true);
  });

  it("refuse un fichier de 25 000 octets ou plus", () => {
    const gros = SVG_VALIDE.replace("</svg>", `<!-- ${"x".repeat(TAILLE_MAX)} -->\n</svg>`);
    expect(controleTaille(gros)).toHaveLength(1);
  });
});

describe("illustrations : les huit fichiers de site/src/illustrations", () => {
  it("existent, et aucun autre fichier ne les accompagne", () => {
    expect(readdirSync(DOSSIER).sort()).toEqual(NOMS.map((n) => `${n}.svg`).sort());
  });

  for (const nom of NOMS) {
    it(`${nom}.svg respecte le contrat (viewBox, éléments, couleurs, préfixes, mouvement, taille)`, () => {
      const chemin = join(DOSSIER, `${nom}.svg`);
      expect(statSync(chemin).size).toBeLessThan(TAILLE_MAX);
      expect(controler(nom, readFileSync(chemin, "utf8"))).toEqual([]);
    });
  }
});
