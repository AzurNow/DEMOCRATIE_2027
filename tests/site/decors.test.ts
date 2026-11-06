/**
 * Gardes des décors d'arrière-plan de la page pédagogique (site/src/composants/decors/,
 * site/src/illustrations/decors/, site/src/styles/decors.css). Le HTML se lit dans site/dist/index.html
 * (produit par `pnpm build:site` : absent, les tests ÉCHOUENT, jamais ne sautent), les sources dans
 * l'arbre. Un décor est purement décoratif : caché des technologies d'assistance, sans focus, sans
 * couleur propre, animé seulement quand le navigateur sait le faire et que le visiteur l'accepte.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "../..");
const DIST = join(RACINE, "site/dist");
const STYLES = join(RACINE, "site/src/styles");
const DECORS_SVG = join(RACINE, "site/src/decors");
const SECTIONS_DECOREES = ["accroche", "questions", "limites", "preenregistrement", "contester"] as const;
const SECTIONS_SANS_DECOR = ["parcours", "faq"] as const;
const TAILLE_MAX_TOTALE = 40_000;
const REPLI = /var\(--px-[a-z0-9-]+,\s*#[0-9a-fA-F]{3,8}\)/g;
const FOCALISABLE = /<(a|button|input|select|textarea|summary|iframe|audio|video)\b|\stabindex=|\scontenteditable|\shref=/i;

const page = (): string => readFileSync(join(DIST, "index.html"), "utf8");

/** Contenu de chaque `<div class="decor …">` (balises div équilibrées), balise ouvrante comprise. */
function blocsDecor(html: string): string[] {
  const blocs: string[] = [];
  for (const debut of html.matchAll(/<div class="decor decor--[a-z]+"[^>]*>/g)) {
    let profondeur = 0;
    for (const balise of html.slice(debut.index).matchAll(/<(\/?)div\b/g)) {
      profondeur += balise[1] === "/" ? -1 : 1;
      if (profondeur === 0) {
        blocs.push(html.slice(debut.index, debut.index + balise.index + "</div>".length));
        break;
      }
    }
  }
  return blocs;
}

/** Le corps de la section d'identifiant donné (les sections ne sont pas imbriquées). */
function section(html: string, id: string): string {
  const m = new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`).exec(html);
  if (m === null) throw new Error(`section #${id} absente de la page construite`);
  return m[1] ?? "";
}

function fichiersCss(): { nom: string; css: string }[] {
  return readdirSync(STYLES)
    .filter((f) => f.endsWith(".css"))
    .map((nom) => ({ nom, css: readFileSync(join(STYLES, nom), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));
}

/** Préludes des blocs (at-rules, sélecteurs) qui enveloppent la position `index` du texte. */
function preludesEnglobants(css: string, index: number): string[] {
  const pile: string[] = [];
  let debut = 0;
  for (let i = 0; i < index; i++) {
    const c = css[i];
    if (c === "{") {
      pile.push(css.slice(debut, i).trim());
      debut = i + 1;
    } else if (c === "}") {
      pile.pop();
      debut = i + 1;
    } else if (c === ";") {
      debut = i + 1;
    }
  }
  return pile;
}

/** Positions des déclarations `animation-timeline:` (pas celles d'une condition @supports entre parenthèses). */
function declarationsTimeline(css: string): number[] {
  return [...css.matchAll(/animation-timeline\s*:/g)]
    .filter((m) => /(^|[{};]\s*)$/.test(css.slice(0, m.index)))
    .map((m) => m.index);
}

describe("décors : HTML construit", () => {
  const blocs = (): string[] => blocsDecor(page());

  it("insère exactement un décor par section décorée, et aucun ailleurs", () => {
    const html = page();
    expect(blocsDecor(html)).toHaveLength(SECTIONS_DECOREES.length);
    for (const id of SECTIONS_DECOREES) {
      expect(blocsDecor(section(html, id)), `#${id}`).toHaveLength(1);
    }
  });

  it("n'a aucun décor dans le parcours ni dans la FAQ", () => {
    const html = page();
    for (const id of SECTIONS_SANS_DECOR) {
      expect(section(html, id), `#${id}`).not.toMatch(/class="[^"]*\bdecor\b/);
    }
  });

  it("cache chaque décor aux technologies d'assistance", () => {
    for (const bloc of blocs()) {
      expect(bloc.slice(0, bloc.indexOf(">") + 1)).toContain('aria-hidden="true"');
    }
  });

  it("n'a aucun role=img ni aria-label dans un décor", () => {
    for (const bloc of blocs()) {
      expect(bloc).not.toMatch(/role="img"/);
      expect(bloc).not.toMatch(/aria-label/);
    }
  });

  it("n'a aucun élément focalisable dans un décor", () => {
    for (const bloc of blocs()) {
      expect(bloc).not.toMatch(FOCALISABLE);
    }
  });

  it("ne porte aucun script ni gestionnaire d'événement dans un décor", () => {
    for (const bloc of blocs()) {
      expect(bloc).not.toMatch(/<script\b|\son[a-z]+=/i);
    }
  });
});

describe("décors : feuilles de style", () => {
  it("déclare chaque animation-timeline sous @supports (animation-timeline: …)", () => {
    for (const { nom, css } of fichiersCss()) {
      for (const position of declarationsTimeline(css)) {
        const preludes = preludesEnglobants(css, position);
        expect(
          preludes.some((p) => /^@supports\s*\(\s*animation-timeline\s*:/.test(p)),
          `${nom} : animation-timeline hors @supports (…${css.slice(position, position + 40)}…)`,
        ).toBe(true);
      }
    }
  });

  it("neutralise chaque animation-timeline sous prefers-reduced-motion: reduce", () => {
    for (const { nom, css } of fichiersCss()) {
      if (declarationsTimeline(css).length === 0) continue;
      expect(css, `${nom} : aucun bloc reduce`).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*animation:\s*none/);
    }
  });

  it("n'anime les décors que sous prefers-reduced-motion: no-preference", () => {
    const decors = fichiersCss().find((f) => f.nom === "decors.css");
    expect(decors).toBeDefined();
    const css = decors?.css ?? "";
    expect(declarationsTimeline(css).length).toBeGreaterThan(0);
    for (const position of declarationsTimeline(css)) {
      expect(preludesEnglobants(css, position).some((p) => /prefers-reduced-motion:\s*no-preference/.test(p))).toBe(true);
    }
  });

  it("préfixe par decor- chaque nom d'animation et de classe de decors.css", () => {
    const css = fichiersCss().find((f) => f.nom === "decors.css")?.css ?? "";
    const noms = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] ?? "");
    expect(noms.length).toBeGreaterThan(0);
    expect(noms.filter((n) => !n.startsWith("decor-"))).toEqual([]);
    const classes = [...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1] ?? "");
    const etrangeres = classes.filter((c) => !c.startsWith("decor") && !c.startsWith("section--"));
    expect(etrangeres).toEqual([]);
  });

  it("n'écrit aucune couleur en dur dans decors.css", () => {
    const css = fichiersCss().find((f) => f.nom === "decors.css")?.css ?? "";
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
  });
});

describe("décors : SVG sources", () => {
  const fichiers = readdirSync(DECORS_SVG)
    .filter((f) => f.endsWith(".svg"))
    .map((nom) => ({ nom, svg: readFileSync(join(DECORS_SVG, nom), "utf8") }));

  it("pèsent moins de 40 Ko au total", () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(6);
    const total = readdirSync(DECORS_SVG).reduce((somme, f) => somme + statSync(join(DECORS_SVG, f)).size, 0);
    expect(total).toBeLessThan(TAILLE_MAX_TOTALE);
  });

  it("n'écrivent aucune couleur en dur hors var(--px-…, #…)", () => {
    for (const { nom, svg } of fichiers) {
      const sansRepli = svg.replace(REPLI, "");
      expect(sansRepli, nom).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(sansRepli, nom).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
      expect(sansRepli, nom).not.toMatch(/\s(fill|stroke|style)\s*=/);
    }
  });

  it("préfixent par decor- chaque classe, sélecteur et identifiant", () => {
    for (const { nom, svg } of fichiers) {
      const classes = [...svg.matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => (m[1] ?? "").split(/\s+/).filter(Boolean));
      const selecteurs = [...svg.matchAll(/\.([a-zA-Z_][\w-]*)\{/g)].map((m) => m[1] ?? "");
      const ids = [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? "");
      expect([...classes, ...selecteurs, ...ids].filter((n) => !n.startsWith("decor-")), nom).toEqual([]);
    }
  });

  it("restent des dessins en <rect> entiers, cachés, sans animation ni réseau", () => {
    for (const { nom, svg } of fichiers) {
      const sansXmlns = svg.replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
      expect(svg, nom).toMatch(/shape-rendering="crispEdges"/);
      expect(svg, nom).toMatch(/<svg\b[^>]*aria-hidden="true"/);
      expect(sansXmlns, nom).not.toMatch(/role="img"|<script|animation|https?:|url\(|@import/);
      for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
        for (const a of (m[1] ?? "").matchAll(/\s([\w:-]+)="([^"]*)"/g)) {
          expect(a[2], `${nom} : <rect> ${a[1] ?? ""}`).toMatch(/^\d+$/);
        }
      }
    }
  });
});

describe("décors : atténuation sous le texte", () => {
  const css = (): string => fichiersCss().find((f) => f.nom === "decors.css")?.css ?? "";
  const jetons = (): string => fichiersCss().find((f) => f.nom === "jetons.css")?.css ?? "";

  it("grise et estompe chaque décor par défaut (filter et opacity sur le svg des décors)", () => {
    expect(css()).toMatch(/\.decor svg\s*\{[^}]*filter:\s*grayscale\(var\(--decor-gris\)\)[^}]*opacity:\s*var\(--decor-opacite\)/);
  });

  it("estompe par un masque chaque rail ou colonne de décor, côté texte", () => {
    for (const rail of ["decor-accroche__colonne", "decor-limites__rail", "decor-questions__rail", "decor-preenregistrement__rail", "decor-contester__rail"]) {
      expect(css(), rail).toMatch(new RegExp(`\\.${rail}[^{]*\\{[^}]*mask-image:\\s*linear-gradient`));
    }
  });

  it("écrit les valeurs d'atténuation par des jetons non colorés", () => {
    for (const jeton of ["--decor-gris", "--decor-opacite", "--decor-gris-debut", "--decor-opacite-debut"]) {
      expect(jetons()).toMatch(new RegExp(`${jeton}:\\s*[0-9.]+;`));
    }
  });

  it("ne progresse au défilement que sous @supports et prefers-reduced-motion: no-preference", () => {
    const source = css();
    const i = source.indexOf("animation-name: decor-attenue");
    expect(i).toBeGreaterThan(0);
    const preludes = preludesEnglobants(source, i);
    expect(preludes.some((p) => /^@supports\s*\(\s*animation-timeline\s*:/.test(p))).toBe(true);
    expect(preludes.some((p) => /prefers-reduced-motion:\s*no-preference/.test(p))).toBe(true);
  });

  it("garde l'état atténué statique sous reduced-motion (animation coupée, filtre jamais retiré)", () => {
    const source = css();
    expect(source).toMatch(/prefers-reduced-motion:\s*reduce\)[^{]*\{[\s\S]*animation:\s*none/);
    expect(preludesEnglobants(source, source.indexOf(".decor svg {"))).toEqual([]);
  });

  it("n'emploie backdrop-filter que sous @supports, avec repli (aujourd'hui : aucun)", () => {
    const source = css();
    for (const m of source.matchAll(/backdrop-filter\s*:/g)) {
      expect(preludesEnglobants(source, m.index).some((p) => /^@supports/.test(p))).toBe(true);
    }
  });
});
