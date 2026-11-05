/**
 * Gardes du « fil du parcours » (site/src/composants/Fil*.astro, site/src/lib/fil.ts,
 * site/src/styles/fil.css) : décor pur, masqué des technologies d'assistance, sept stations dans
 * l'ordre des étapes, mouvement seulement sous @supports et hors « mouvement réduit », couleurs
 * seulement par les variables du thème. Lu sur site/dist/index.html (produit par `pnpm build:site`)
 * et sur les sources CSS. Un dist absent fait échouer les tests, jamais les sauter.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ETATS_FIL } from "../../site/src/lib/fil.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const DOSSIER_CSS = join(RACINE, "site/src/styles");
const html = (): string => readFileSync(join(RACINE, "site/dist/index.html"), "utf8");

const ETAPES = ["collecter", "valider", "questionner", "interroger", "noter", "analyser", "publier"] as const;
const TAILLE_MAX_SYMBOLES = 30_000;

/** Les fichiers CSS sources de la page, avec leur contenu. */
function feuilles(): Array<{ nom: string; css: string }> {
  return readdirSync(DOSSIER_CSS)
    .filter((n) => n.endsWith(".css"))
    .map((nom) => ({ nom, css: readFileSync(join(DOSSIER_CSS, nom), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));
}

/** Préludes des at-rules (`@media …`, `@supports …`) qui enveloppent la position `indice`. */
function atRulesEnglobantes(css: string, indice: number): string[] {
  const pile: string[] = [];
  let debut = 0;
  for (let i = 0; i < indice; i += 1) {
    const c = css[i];
    if (c === "{") {
      pile.push(css.slice(debut, i).trim());
      debut = i + 1;
    } else if (c === "}" || c === ";") {
      if (c === "}") pile.pop();
      debut = i + 1;
    }
  }
  return pile.filter((p) => p.startsWith("@"));
}

/** Chaque `<li class="etape" id="etape-…">` avec son contenu, dans l'ordre du document. */
function etapes(page: string): Array<{ id: string; contenu: string }> {
  return [...page.matchAll(/<li class="etape" id="(etape-[a-z]+)">([\s\S]*?)(?=<li class="etape" id="|<\/ol>)/g)].map((m) => ({
    id: m[1] ?? "",
    contenu: m[2] ?? "",
  }));
}

function balisesOuvrantes(page: string, classe: string): string[] {
  return [...page.matchAll(new RegExp(`<[a-z]+[^>]*class="${classe}[ "][^>]*>`, "g"))].map((m) => m[0]);
}

describe("fil du parcours : décor masqué et sans rôle", () => {
  it("masque chaque racine du fil avec aria-hidden=\"true\"", () => {
    const page = html();
    for (const classe of ["fil-station", "fil-voie", "fil-symboles"]) {
      const balises = balisesOuvrantes(page, classe);
      expect(balises.length, classe).toBeGreaterThan(0);
      for (const balise of balises) {
        expect(balise, classe).toMatch(/aria-hidden="true"/);
        expect(balise, classe).not.toMatch(/role=/);
      }
    }
  });

  it("n'est contenu dans aucun role=\"img\"", () => {
    for (const m of html().matchAll(/<[^>]*role="img"[^>]*>([\s\S]*?)<\/div>/g)) {
      expect(m[1] ?? "").not.toMatch(/class="[^"]*\bfil-/);
    }
  });
});

describe("fil du parcours : sept stations dans l'ordre des étapes", () => {
  it("place une station par étape, en tête de chaque étape, numérotée dans l'ordre", () => {
    const liste = etapes(html());
    expect(liste.map((e) => e.id)).toEqual(ETAPES.map((n) => `etape-${n}`));
    liste.forEach((etape, i) => {
      const stations = [...etape.contenu.matchAll(/class="fil-station"[^>]*data-fil-station="(\d+)"/g)];
      expect(stations, etape.id).toHaveLength(1);
      expect(stations[0]?.[1], etape.id).toBe(String(i + 1));
      expect(etape.contenu.trimStart().startsWith('<div class="fil-station"'), `${etape.id} : station en tête`).toBe(true);
    });
  });

  it("n'écrit dans la page que sept étiquettes courtes, sans chiffre", () => {
    const etiquettes = [...html().matchAll(/<span class="fil-etiquette">([^<]*)<\/span>/g)].map((m) => m[1] ?? "");
    expect(etiquettes).toHaveLength(7);
    for (const e of etiquettes) {
      expect(e.length, e).toBeGreaterThan(0);
      expect(e.length, e).toBeLessThanOrEqual(24);
      expect(e, e).not.toMatch(/\d/);
    }
  });

  it("définit les sept pictogrammes et l'objet mobile avec un état par étape", () => {
    const page = html();
    for (let n = 1; n <= 7; n += 1) {
      expect(page, `symbole ${n}`).toContain(`<symbol id="fil-etat-${n}"`);
      expect(page, `état mobile ${n}`).toContain(`data-fil-etat="${n}"`);
    }
  });
});

describe("fil du parcours : états (site/src/lib/fil.ts)", () => {
  it("décrit sept états dans l'ordre des étapes, chacun avec son dessin et son étiquette", () => {
    expect(ETATS_FIL.map((e) => e.nom)).toEqual([...ETAPES]);
    expect(ETATS_FIL.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const e of ETATS_FIL) {
      expect(e.svg, e.nom).toMatch(/^<g class="fil-/);
      expect(e.etiquette.length, e.nom).toBeGreaterThan(0);
    }
  });

  it("donne à chaque état un dessin différent", () => {
    expect(new Set(ETATS_FIL.map((e) => e.svg)).size).toBe(7);
  });
});

describe("fil du parcours : mouvement", () => {
  const avecTimeline = feuilles().flatMap(({ nom, css }) =>
    [...css.matchAll(/(?<!\()animation-timeline\s*:|view-timeline\s*:|timeline-scope\s*:/g)].map((m) => ({ nom, css, indice: m.index, motif: m[0] })),
  );

  it("trouve les déclarations de timeline du fil", () => {
    expect(avecTimeline.some((t) => t.nom === "fil.css")).toBe(true);
  });

  it.each(avecTimeline.map((t, i) => [`${t.nom} #${i} ${t.motif}`, t] as const))("%s : sous @supports et sous « mouvement : sans préférence »", (_nom, t) => {
    const englobantes = atRulesEnglobantes(t.css, t.indice);
    expect(englobantes.some((r) => /^@supports\s*\(animation-timeline:\s*view\(\)\)/.test(r))).toBe(true);
    expect(englobantes.some((r) => /^@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(r))).toBe(true);
  });

  it("neutralise l'objet mobile sous prefers-reduced-motion: reduce", () => {
    const fil = feuilles().find((f) => f.nom === "fil.css")?.css ?? "";
    const bloc = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(fil)?.[1] ?? "";
    expect(bloc).toMatch(/\.fil-voie\s*\{\s*display:\s*none/);
    const mouvement = feuilles().find((f) => f.nom === "mouvement.css")?.css ?? "";
    expect(mouvement).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none\s*!important/);
  });

  it("cache l'objet mobile par défaut (sans prise en charge, il n'existe pas)", () => {
    const fil = feuilles().find((f) => f.nom === "fil.css")?.css ?? "";
    expect(fil.indexOf("@supports")).toBeGreaterThan(0);
    expect(fil.slice(0, fil.indexOf("@supports"))).toMatch(/\.fil-voie\s*\{\s*display:\s*none/);
  });

  it("n'utilise aucun JavaScript pour le fil", () => {
    const fil = readFileSync(join(RACINE, "site/src/composants/FilParcours.astro"), "utf8");
    expect(fil).not.toMatch(/<script/);
  });
});

describe("fil du parcours : couleurs et poids", () => {
  /** Les SVG du fil : définitions des symboles et pictogrammes des stations. */
  function svgDuFil(page: string): string[] {
    const definitions = /<svg class="fil-symboles"[\s\S]*?<\/svg>/.exec(page)?.[0] ?? "";
    const icones = [...page.matchAll(/<svg class="fil-icone"[\s\S]*?<\/svg>/g)].map((m) => m[0]);
    const mobiles = [...page.matchAll(/<span class="fil-etat__interieur">([\s\S]*?)<\/span>/g)].map((m) => m[1] ?? "");
    return [definitions, ...icones, ...mobiles];
  }

  it("ne met aucune couleur en dur dans les SVG du fil", () => {
    const svgs = svgDuFil(html());
    expect(svgs.length).toBeGreaterThan(8);
    for (const svg of svgs) {
      expect(svg).not.toMatch(/\s(fill|stroke|stop-color|style)\s*=/);
      expect(svg.replace(/href="#[^"]*"/g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    }
  });

  it("préfixe toutes les classes et tous les ids du SVG du fil par fil-", () => {
    for (const svg of svgDuFil(html())) {
      for (const m of svg.matchAll(/\sclass="([^"]*)"/g)) {
        for (const classe of (m[1] ?? "").split(/\s+/).filter(Boolean)) expect(classe).toMatch(/^fil-/);
      }
      for (const m of svg.matchAll(/\sid="([^"]*)"/g)) expect(m[1]).toMatch(/^fil-/);
    }
  });

  it("n'emploie que des rect entiers, groupés par couleur", () => {
    const definitions = /<svg class="fil-symboles"[\s\S]*?<\/svg>/.exec(html())?.[0] ?? "";
    const rects = [...definitions.matchAll(/<rect ([^>]*)\/>/g)].map((m) => m[1] ?? "");
    expect(rects.length).toBeGreaterThan(50);
    for (const attributs of rects) expect(attributs).toMatch(/^x="\d+" y="\d+" width="\d+" height="\d+"$/);
    expect(definitions).not.toMatch(/<(path|circle|polygon|image|text|filter)\b/);
  });

  it("lie les couleurs de fil.css aux seules variables du thème", () => {
    const fil = feuilles().find((f) => f.nom === "fil.css")?.css ?? "";
    expect(fil).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(fil).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    expect(fil).toMatch(/\.fil-e\s*\{\s*fill:\s*var\(--px-encre\)/);
  });

  it(`pèse moins de ${TAILLE_MAX_SYMBOLES} octets pour les définitions des pictogrammes`, () => {
    const definitions = /<svg class="fil-symboles"[\s\S]*?<\/svg>/.exec(html())?.[0] ?? "";
    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.length).toBeLessThan(TAILLE_MAX_SYMBOLES);
  });

  it("garde l'étiquette lisible : couleur --texte-doux", () => {
    const fil = feuilles().find((f) => f.nom === "fil.css")?.css ?? "";
    expect(fil).toMatch(/\.fil-etiquette\s*\{[^}]*color:\s*var\(--texte-doux\)/);
  });
});
