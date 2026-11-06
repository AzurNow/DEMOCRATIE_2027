/**
 * Gardes de la page « exemple » (site/src/pages/exemple.astro, /exemple/) : un cas inventé suivi
 * sur les sept étapes du parcours, en scènes animées par le défilement, en CSS seul.
 *
 * Ce que la page doit tenir (docs/PLAN-PAGE-PEDAGOGIQUE.md, « Ce que la page n'a pas le droit de
 * faire ») : la mention « Exemple fictif » sur chaque bloc d'exemple, aucun chiffre de mesure, aucun
 * script ajouté, aucun mouvement hors de « mouvement : sans préférence » et de la prise en charge
 * des animations liées au défilement, une lecture complète sans tout cela.
 * Lu sur site/dist/exemple/index.html (construit par le `globalSetup` de `construire-site.ts`) et
 * sur les sources. Un dist absent fait échouer les tests, jamais les sauter.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lirePageConstruite } from "../../outils/site-gardes.ts";
import { estAccueil, estExemple, lienAccueil, lienExemple, racineDuSite } from "../../site/src/lib/liens.ts";
import { PARAMETRES, PARAMETRES_SANS_CONSTANTE } from "../../site/src/lib/parametres.ts";
import { COULEURS_PIXEL, dessinDeGrille, dessinDuSprite, SPRITES, type NomSprite } from "../../site/src/lib/pixels.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const DIST = join(RACINE, "site/dist");
const ETAPES = ["collecter", "valider", "questionner", "interroger", "noter", "analyser", "publier"] as const;
const SECTIONS_DU_PROTOCOLE = ["4", "4", "5", "6", "7", "8", "9"];

const exemple = (): string => lirePageConstruite(DIST, "exemple/index.html");
const accueil = (): string => lirePageConstruite(DIST, "index.html");

/** Le contenu de <main>, sans les SVG (dessins pixel : leurs attributs portent des nombres de coordonnées). */
function principal(page: string): string {
  const m = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(page);
  if (m === null) throw new Error("<main> absent de la page construite");
  return (m[1] ?? "").replace(/<svg[\s\S]*?<\/svg>/g, "");
}

/** Chaque `<li class="ex-etape" id="…">` avec son contenu, dans l'ordre du document. */
function etapes(fragment: string): Array<{ id: string; contenu: string }> {
  return [...fragment.matchAll(/<li class="ex-etape" id="([^"]+)">([\s\S]*?)(?=<li class="ex-etape" id="|<\/ol>\s*<\/section>)/g)].map((m) => ({
    id: m[1] ?? "",
    contenu: m[2] ?? "",
  }));
}

/** Contenu de chaque bloc `<div class="exemple-fictif…">…</div>` (aucune div imbriquée dedans). */
function exemples(fragment: string): string[] {
  return [...fragment.matchAll(/<div class="exemple-fictif[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? "");
}

/** Le texte tel qu'il s'affiche : les balises en ligne ne séparent pas les mots, les autres oui. */
function texteAffiche(fragment: string): string {
  return fragment
    .replace(/<\/?(strong|em|a|abbr|mark)\b[^>]*>/g, "")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Le CSS source de la page, sans commentaires. */
const CSS = readFileSync(join(RACINE, "site/src/styles/exemple.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Préludes des blocs (at-rules et sélecteurs) qui enveloppent la position `indice` du CSS. */
function preludes(indice: number): string[] {
  const pile: string[] = [];
  let debut = 0;
  for (let i = 0; i < indice; i++) {
    const c = CSS[i];
    if (c === "{") {
      pile.push(CSS.slice(debut, i).trim());
      debut = i + 1;
    } else if (c === "}" || c === ";") {
      if (c === "}") pile.pop();
      debut = i + 1;
    }
  }
  return pile;
}

const SOUS_SUPPORTS = (p: string): boolean => /^@supports\s*\(animation-timeline:\s*view\(\)\)/.test(p);
const SOUS_SANS_PREFERENCE = (p: string): boolean => /^@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(p);

describe("page exemple : construite et reliée", () => {
  it("existe dans le site construit, avec un titre et un seul h1", () => {
    const page = exemple();
    expect(page).toMatch(/<title>[^<]+<\/title>/);
    expect(page.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it("est annoncée depuis la section parcours de l'accueil, après la vue d'ensemble", () => {
    const page = accueil();
    const parcours = /<section\b[^>]*\bid="parcours"[^>]*>([\s\S]*?)<\/section>/.exec(page)?.[1] ?? "";
    const lien = /<a class="parcours__lien-exemple" href="\/exemple\/">([^<]+)<\/a>/.exec(parcours);
    expect(lien?.[1]).toBe("Suivre un exemple complet, animé");
    expect(parcours.indexOf("parcours__lien-exemple")).toBeGreaterThan(parcours.indexOf('class="vue-ensemble"'));
    expect(parcours.indexOf("parcours__lien-exemple")).toBeLessThan(parcours.indexOf('<li class="etape"'));
  });

  it("est dans la navigation de l'en-tête de l'accueil", () => {
    expect(accueil()).toMatch(/<nav[^>]*class="entete__nav"[^>]*>[\s\S]*?href="\/exemple\/"[\s\S]*?<\/nav>/);
  });

  it("renvoie au parcours de l'accueil, ancre comprise", () => {
    expect(principal(exemple())).toContain('href="/#parcours"');
  });
});

describe("page exemple : sept étapes, un cas inventé", () => {
  const liste = () => etapes(principal(exemple()));

  it("présente les sept étapes du parcours, dans l'ordre, avec leurs ancres", () => {
    expect(liste().map((e) => e.id)).toEqual(ETAPES.map((n) => `etape-${n}`));
  });

  it("donne à chaque étape son numéro et un titre h2", () => {
    liste().forEach(({ id, contenu }, i) => {
      expect(contenu, id).toMatch(new RegExp(`<p class="ex-etape__numero">Étape ${i + 1} sur 7</p>`));
      expect(contenu, id).toMatch(/<h2 class="ex-etape__titre">[^<]{10,}<\/h2>/);
    });
  });

  it("renvoie chaque étape à la section du protocole qui la fixe", () => {
    liste().forEach(({ id, contenu }, i) => {
      const renvoi = /<p class="renvoi">Protocole, <a class="renvoi__lien" href="[^"]+">§(\d+)<\/a><\/p>/.exec(contenu);
      expect(renvoi?.[1], id).toBe(SECTIONS_DU_PROTOCOLE[i]);
    });
  });

  it("donne à chaque étape une seule scène, marquée « Exemple fictif » une fois, avant le récit", () => {
    for (const { id, contenu } of liste()) {
      const scenes = exemples(contenu);
      expect(scenes, id).toHaveLength(1);
      expect(scenes[0]?.match(/Exemple fictif/gi) ?? [], id).toHaveLength(1);
      expect(contenu.indexOf("exemple-fictif"), id).toBeLessThan(contenu.indexOf("ex-etape__texte"));
    }
  });

  it("porte la mention « Exemple fictif » en tête de page, avant la première étape", () => {
    const corps = principal(exemple());
    const premier = exemples(corps)[0] ?? "";
    expect(premier).toMatch(/Exemple fictif/);
    expect(corps.indexOf('class="exemple-fictif')).toBeLessThan(corps.indexOf('<li class="ex-etape"'));
    expect(exemples(corps)).toHaveLength(ETAPES.length + 1);
  });

  it("n'imbrique aucune div dans un bloc d'exemple (lu jusqu'à son premier </div>)", () => {
    const corps = principal(exemple());
    for (const debut of corps.matchAll(/<div class="exemple-fictif[^"]*"[^>]*>/g)) {
      const reste = corps.slice(debut.index + debut[0].length);
      expect(reste.slice(0, reste.indexOf("</div>"))).not.toMatch(/<div\b/);
    }
  });

  it("suit le même cas sur les sept scènes", () => {
    for (const { id, contenu } of liste()) {
      expect(exemples(contenu).join(" "), id).toMatch(/Candidat[ \u00a0]A|Outil[ \u00a0]X|Mesure[ \u00a0]M/);
    }
  });

  it("ne nomme que des acteurs fictifs : Candidat A ou B, Outil X ou Y", () => {
    const texte = texteAffiche(principal(exemple()));
    const candidats = new Set([...texte.matchAll(/Candidat[ \u00a0]+(\p{Lu}\w*)/gu)].map((m) => m[1]));
    const outils = new Set([...texte.matchAll(/Outil[ \u00a0]+(\p{Lu}\w*)/gu)].map((m) => m[1]));
    expect([...candidats].sort()).toEqual(["A", "B"]);
    expect([...outils].sort()).toEqual(["X", "Y"]);
  });
});

describe("page exemple : aucun chiffre de mesure", () => {
  it("n'écrit aucun chiffre suivi de « % » dans les blocs d'exemple", () => {
    const blocs = exemples(principal(exemple()));
    expect(blocs.length).toBeGreaterThanOrEqual(8);
    for (const bloc of blocs) expect(texteAffiche(bloc)).not.toMatch(/\d[\s  ]*%/);
  });

  it("n'écrit aucun nombre dans les blocs d'exemple, ni dans leurs textes de remplacement", () => {
    const page = exemple().replace(/<svg\b([^>]*)>[\s\S]*?<\/svg>/g, "<svg$1></svg>");
    for (const bloc of exemples(principal(page))) expect(texteAffiche(bloc)).not.toMatch(/\d/);
    for (const bloc of exemples(/<main\b[\s\S]*<\/main>/.exec(page)?.[0] ?? "")) {
      for (const m of bloc.matchAll(/aria-label="([^"]*)"/g)) expect(m[1]).not.toMatch(/\d/);
    }
  });

  it("n'écrit hors des blocs que des numéros d'étape et des paramètres du protocole", () => {
    const hors = principal(exemple()).replace(/<div class="exemple-fictif[^"]*"[^>]*>[\s\S]*?<\/div>/g, "");
    const nombres = [...texteAffiche(hors).replace(/§\s*\d+/g, "").matchAll(/\d[\d\s ]*/g)].map((m) => m[0].replace(/\s/g, ""));
    const admis = new Set(["1", "2", "3", "4", "5", "6", "7", PARAMETRES.fenetreHeures, PARAMETRES_SANS_CONSTANTE.niveauConfiance.affiche]);
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.filter((n) => !admis.has(n))).toEqual([]);
  });

  it("ne gradue aucune barre : les fourchettes sont dessinées sans valeur", () => {
    const corps = principal(exemple());
    const barres = [...corps.matchAll(/<span class="ex-(?:barre__piste|axe)"[^>]*>([\s\S]*?)<\/span><\/span>/g)].map((m) => m[1] ?? "");
    expect(barres.length).toBeGreaterThanOrEqual(4);
    for (const barre of barres) expect(texteAffiche(barre)).not.toMatch(/\d/);
  });
});

describe("page exemple : texte", () => {
  const texte = (): string => texteAffiche(principal(exemple()));

  it("ne colle aucun mot à un nombre ni après une virgule ou un point (espace perdu à un saut de ligne de la source)", () => {
    const t = texte();
    const colles = [...t.matchAll(/\p{L}\d|\d\p{L}|\p{L}[,.]\p{Lu}|\p{Ll},\p{L}/gu)].map((m) => t.slice(Math.max(0, m.index - 12), m.index + 12));
    expect(colles).toEqual([]);
  });

  it("ne coupe jamais une ligne de la source entre du texte et une balise en ligne ou une expression (Astro y perd l'espace)", () => {
    const source = readFileSync(join(RACINE, "site/src/pages/exemple.astro"), "utf8").split(/^---$/m)[2] ?? "";
    expect(source.length).toBeGreaterThan(1000);
    const fins = [...source.matchAll(/<\/(?:strong|em|a|mark|abbr)>\n[ \t]*[\p{L}\p{N}«]/gu)].map((m) => m[0]);
    const debuts = [...source.matchAll(/[\p{L}\p{N},;:»][ \t]*\n[ \t]*(?:<(?:strong|em|a|mark|abbr)\b|\{)/gu)].map((m) => m[0]);
    expect([...fins, ...debuts]).toEqual([]);
  });

  it("met une espace insécable avant : ; ? ! % » et après «", () => {
    const t = texte();
    const fautes = [...t.matchAll(/ [:;?!%»]|« /g)].map((m) => t.slice(Math.max(0, m.index - 16), m.index + 4));
    expect(fautes).toEqual([]);
  });

  it("n'a aucun script dans la page construite hors des deux du cadre, ni dans ses sources", () => {
    expect(principal(exemple())).not.toMatch(/<script\b/i);
    for (const fichier of ["pages/exemple.astro", "composants/EtapeExemple.astro", "composants/Pixel.astro"]) {
      expect(readFileSync(join(RACINE, "site/src", fichier), "utf8"), fichier).not.toMatch(/<script\b/i);
    }
  });
});

describe("exemple.css : mouvement, couleurs, cibles", () => {
  it("est importée par la page", () => {
    expect(readFileSync(join(RACINE, "site/src/pages/exemple.astro"), "utf8")).toMatch(/import "\.\.\/styles\/exemple\.css";/);
  });

  it("déclare chaque timeline sous @supports (animation-timeline: view()) et sous prefers-reduced-motion: no-preference", () => {
    const positions = [...CSS.matchAll(/(?<!\()(?:animation-timeline|view-timeline-name|view-timeline|scroll-timeline-name|timeline-scope)\s*:/g)].map((m) => m.index);
    expect(positions.length).toBeGreaterThanOrEqual(3);
    for (const position of positions) {
      const englobants = preludes(position);
      const extrait = CSS.slice(position, position + 50);
      expect(englobants.some(SOUS_SUPPORTS), `hors @supports : ${extrait}`).toBe(true);
      expect(englobants.some(SOUS_SANS_PREFERENCE), `hors no-preference : ${extrait}`).toBe(true);
    }
  });

  it("ne déclare animation, transition ni @keyframes que sous prefers-reduced-motion: no-preference", () => {
    const hors = [...CSS.matchAll(/(?:^|[{;\s])((?:animation|transition)(?:-[a-z]+)?\s*:\s*[^;}]*|@keyframes\s+[\w-]+)/g)].filter((m) => {
      const valeur = (m[1] ?? "").split(":")[1]?.trim() ?? "";
      return !preludes(m.index).some(SOUS_SANS_PREFERENCE) && valeur !== "none";
    });
    expect(hors.map((m) => m[1])).toEqual([]);
  });

  it("garde, dans le CSS construit, la timeline hors du raccourci animation (sinon le navigateur refuse la déclaration)", () => {
    const styles = [...exemple().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "").join("\n");
    const raccourcis = [...styles.matchAll(/(?<![-\w])animation\s*:\s*([^;}]*)/g)].map((m) => m[1] ?? "");
    expect(raccourcis.some((v) => /ex-paraitre/.test(v)), "raccourci de .ex-anime absent du CSS construit").toBe(true);
    // Seuls les raccourcis de cette page (animations « ex-… ») : mouvement.css a le même défaut, hors de ce lot.
    expect(raccourcis.filter((v) => /\bex-/.test(v) && /view\(|scroll\(|--ex-etape/.test(v))).toEqual([]);
    expect(styles).toMatch(/animation-timeline\s*:\s*view\(\)/);
    expect(styles).toMatch(/animation-timeline\s*:\s*--ex-etape/);
    expect(styles).toMatch(/view-timeline-name\s*:\s*--ex-etape/);
  });

  it("neutralise les animations sous prefers-reduced-motion: reduce", () => {
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.ex-anime\s*\{\s*animation:\s*none;/);
  });

  it("ne décrit dans ses @keyframes que le départ : l'arrivée est le style ordinaire, visible sans animation", () => {
    const images = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n {4}\}/g)];
    expect(images.length).toBeGreaterThanOrEqual(6);
    for (const [, nom, corps] of images) {
      expect(nom, nom).toMatch(/^ex-/);
      expect(corps, nom).not.toMatch(/(^|\s)(to|100%)\s*\{/);
    }
  });

  it("n'écrit aucune couleur en dur", () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
  });

  it("donne à chaque classe de couleur pixel sa variable --px- du thème", () => {
    for (const couleur of Object.values(COULEURS_PIXEL)) {
      expect(CSS, couleur).toMatch(new RegExp(`\\.ex-px-${couleur}\\s*\\{\\s*fill:\\s*var\\(--px-${couleur}\\);`));
    }
  });

  it("donne au lien de retour une cible tactile d'au moins 44 px", () => {
    expect(CSS).toMatch(/\.ex-tete__retour a\s*\{[^}]*min-height:\s*var\(--cible-tactile\)/);
  });

  it("rend la scène collante seulement à partir de 40 rem", () => {
    const position = CSS.search(/position:\s*sticky/);
    expect(position).toBeGreaterThan(0);
    expect(preludes(position).some((p) => /^@media\s*\(min-width:\s*40rem\)/.test(p))).toBe(true);
  });
});

describe("dessins pixel (site/src/lib/pixels.ts)", () => {
  it("fusionne une suite de pixels de même couleur en un rectangle et laisse « . » transparent", () => {
    expect(dessinDeGrille(["ee.1", "..ee"])).toEqual({
      largeur: 4,
      hauteur: 2,
      rectangles: [
        { x: 0, y: 0, largeur: 2, couleur: "encre" },
        { x: 3, y: 0, largeur: 1, couleur: "accent-1" },
        { x: 2, y: 1, largeur: 2, couleur: "encre" },
      ],
    });
  });

  it("refuse un caractère sans couleur, en nommant sa place", () => {
    expect(() => dessinDeGrille(["e#"])).toThrow(/Pixel inconnu « # » ligne 1, colonne 2/);
  });

  it("refuse des lignes de longueurs différentes", () => {
    expect(() => dessinDeGrille(["eee", "ee"])).toThrow(/ligne 2 a 2 pixels, la première 3/);
  });

  it("refuse un dessin vide", () => {
    expect(() => dessinDeGrille([])).toThrow(/vide/);
    expect(() => dessinDeGrille([""])).toThrow(/vide/);
  });

  it("convertit chaque dessin de la page sans erreur, en rectangles entiers dans son cadre", () => {
    for (const nom of Object.keys(SPRITES) as NomSprite[]) {
      const dessin = dessinDuSprite(nom);
      expect(dessin.rectangles.length, nom).toBeGreaterThan(0);
      for (const r of dessin.rectangles) {
        expect(Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.largeur), nom).toBe(true);
        expect(r.x + r.largeur, nom).toBeLessThanOrEqual(dessin.largeur);
      }
    }
  });

  it("ne met dans le HTML construit que des dessins sans couleur en dur, cachés ou nommés", () => {
    const dessins = [...exemple().matchAll(/<svg class="ex-pixel[^"]*"[^>]*>[\s\S]*?<\/svg>/g)].map((m) => m[0]);
    expect(dessins.length).toBeGreaterThan(10);
    for (const svg of dessins) {
      expect(svg).toMatch(/shape-rendering="crispEdges"/);
      expect(svg).not.toMatch(/\s(fill|stroke|style)\s*=|#[0-9a-fA-F]{3,8}\b/);
      expect(svg).toMatch(/aria-hidden="true"|role="img"[^>]*aria-label="[^"]+"/);
    }
  });
});

describe("liens entre pages (site/src/lib/liens.ts)", () => {
  it("termine toujours la racine par « / »", () => {
    expect(racineDuSite("/")).toBe("/");
    expect(racineDuSite("/banc")).toBe("/banc/");
  });

  it("reconnaît l'accueil et la page exemple, sous la base", () => {
    expect(estAccueil("/", "/")).toBe(true);
    expect(estAccueil("/index.html", "/")).toBe(true);
    expect(estAccueil("/exemple/", "/")).toBe(false);
    expect(estExemple("/exemple/", "/")).toBe(true);
    expect(estExemple("/exemple", "/")).toBe(true);
    expect(estExemple("/banc/exemple/", "/banc/")).toBe(true);
    expect(estExemple("/", "/")).toBe(false);
  });

  it("garde une ancre dans la page sur l'accueil, la préfixe par la racine ailleurs", () => {
    expect(lienAccueil("parcours", "/", "/")).toBe("#parcours");
    expect(lienAccueil("parcours", "/exemple/", "/")).toBe("/#parcours");
    expect(lienAccueil("faq", "/banc/exemple/", "/banc")).toBe("/banc/#faq");
  });

  it("mène à la page exemple sous la base", () => {
    expect(lienExemple("/")).toBe("/exemple/");
    expect(lienExemple("/banc")).toBe("/banc/exemple/");
  });
});
