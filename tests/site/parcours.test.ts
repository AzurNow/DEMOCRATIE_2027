/**
 * Gardes de la section « Le parcours d'une question » (site/src/sections/Parcours.astro,
 * composants Etape.astro et VueEnsemble.astro, styles/parcours.css) : sept étapes lisibles en trois
 * niveaux (l'essentiel, le cas suivi, le détail replié), une vue d'ensemble qui renvoie à chacune,
 * aucun chiffre de mesure dans les exemples, aucun script, mouvement et survol sous leurs conditions.
 * Lu sur site/dist/index.html (construit par le `globalSetup` de `construire-site.ts`) et sur les
 * sources. Un dist absent fait échouer les tests (`SiteNonConstruit`), jamais les sauter.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lirePageConstruite } from "../../outils/site-gardes.ts";
import { ETAPES_PARCOURS } from "../../site/src/lib/etapes.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const DIST = join(RACINE, "site/dist");
const IDS = ["collecter", "valider", "questionner", "interroger", "noter", "analyser", "publier"].map((n) => `etape-${n}`);

const html = (): string => lirePageConstruite(DIST, "index.html");

/** Le corps de la section #parcours, sans les SVG (illustrations et fil). */
function sectionParcours(page: string): string {
  const m = /<section\b[^>]*\bid="parcours"[^>]*>([\s\S]*?)<\/section>/.exec(page);
  if (m === null) throw new Error("section #parcours absente de la page construite");
  return (m[1] ?? "").replace(/<svg[\s\S]*?<\/svg>/g, "");
}

/** Chaque `<li class="etape" id="etape-…">` avec son contenu, dans l'ordre du document. */
function etapes(section: string): Array<{ id: string; contenu: string }> {
  return [...section.matchAll(/<li class="etape" id="(etape-[a-z]+)">([\s\S]*?)(?=<li class="etape" id="|<\/ol>)/g)].map((m) => ({
    id: m[1] ?? "",
    contenu: m[2] ?? "",
  }));
}

/** Les `<details>` d'un fragment : attributs, texte du `<summary>` (espaces, insécables compris, ramenés à une espace simple), contenu replié. */
function details(fragment: string): Array<{ attributs: string; resume: string; contenu: string }> {
  return [...fragment.matchAll(/<details([^>]*)>\s*<summary[^>]*>([^<]*)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({
    attributs: m[1] ?? "",
    resume: (m[2] ?? "").replace(/\s+/g, " ").trim(),
    contenu: m[3] ?? "",
  }));
}

/** Contenu de chaque encart `<div class="exemple-fictif…">…</div>` (aucune div imbriquée dedans). */
function exemples(fragment: string): string[] {
  return [...fragment.matchAll(/<div class="exemple-fictif[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? "");
}

/** Le texte tel qu'il s'affiche : les balises en ligne ne séparent pas les mots, les autres oui. */
function texteAffiche(fragment: string): string {
  return fragment
    .replace(/<\/?(strong|em|a|abbr)\b[^>]*>/g, "")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&#39;/g, "'");
}

describe("parcours : sept étapes en trois niveaux de lecture", () => {
  const liste = () => etapes(sectionParcours(html()));

  it("présente les sept étapes, dans l'ordre", () => {
    expect(liste().map((e) => e.id)).toEqual(IDS);
  });

  it("donne à chaque étape une phrase-clé non vide", () => {
    for (const { id, contenu } of liste()) {
      const cle = /<p class="etape__cle">([^<]+)<\/p>/.exec(contenu)?.[1]?.trim() ?? "";
      expect(cle.length, id).toBeGreaterThan(20);
    }
  });

  it("donne à chaque étape de deux à quatre points-clés, chacun avec un mot en gras", () => {
    for (const { id, contenu } of liste()) {
      const bloc = /<ul class="etape__points">([\s\S]*?)<\/ul>/.exec(contenu)?.[1] ?? "";
      const points = [...bloc.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1] ?? "");
      expect(points.length, id).toBeGreaterThanOrEqual(2);
      expect(points.length, id).toBeLessThanOrEqual(4);
      for (const point of points) expect(point, id).toMatch(/<strong>[^<]+<\/strong>/);
    }
  });

  it("donne à chaque étape un seul encart d'exemple, marqué « Exemple fictif » une fois, hors des details", () => {
    for (const { id, contenu } of liste()) {
      const hors = contenu.replace(/<details[\s\S]*?<\/details>/g, "");
      const encarts = exemples(hors);
      expect(encarts, id).toHaveLength(1);
      expect(encarts[0]?.match(/Exemple fictif/gi) ?? [], id).toHaveLength(1);
      expect(exemples(contenu), `${id} : exemple dans un details`).toHaveLength(1);
    }
  });

  it("suit le même cas fictif sur les sept étapes", () => {
    const encarts = liste().map((e) => exemples(e.contenu).join(" "));
    for (const [i, encart] of encarts.entries()) {
      expect(encart, IDS[i]).toMatch(/Candidat A|Outil X|Mesure M/);
    }
  });

  it("replie le détail et le pourquoi dans deux details fermés, « En savoir plus » puis « Pourquoi cette étape ? »", () => {
    for (const { id, contenu } of liste()) {
      const blocs = details(contenu);
      expect(blocs.map((d) => d.resume), id).toEqual(["En savoir plus", "Pourquoi cette étape ?"]);
      for (const bloc of blocs) {
        expect(bloc.attributs, `${id} : details ouvert par défaut`).not.toMatch(/\bopen\b/);
        expect(texteAffiche(bloc.contenu).trim().length, `${id} : details vide`).toBeGreaterThan(40);
      }
    }
  });

  it("garde le renvoi au protocole visible, hors des details", () => {
    for (const { id, contenu } of liste()) {
      const hors = contenu.replace(/<details[\s\S]*?<\/details>/g, "");
      expect(hors, id).toMatch(/<p class="renvoi">Protocole, <a class="renvoi__lien" href="[^"]+">§\d+<\/a><\/p>/);
    }
  });
});

describe("parcours : vue d'ensemble", () => {
  it("nomme sept étapes, autant que la liste partagée", () => {
    expect(ETAPES_PARCOURS.map((e) => `etape-${e.nom}`)).toEqual(IDS);
  });

  it("place, avant les étapes, sept liens vers les sept étapes, dans l'ordre", () => {
    const section = sectionParcours(html());
    const nav = /<nav class="vue-ensemble"[^>]*aria-label="[^"]+"[^>]*>([\s\S]*?)<\/nav>/.exec(section);
    expect(nav).not.toBeNull();
    const liens = [...(nav?.[1] ?? "").matchAll(/<a class="vue-ensemble__lien" href="#([^"]+)"/g)].map((m) => m[1]);
    expect(liens).toEqual(IDS);
    expect(section.indexOf('class="vue-ensemble"')).toBeLessThan(section.indexOf('<li class="etape"'));
  });

  it("vise des ids présents dans la page", () => {
    const page = html();
    for (const id of IDS) expect(page, id).toContain(`<li class="etape" id="${id}">`);
  });
});

describe("parcours : ce que la section ne fait pas", () => {
  it("n'écrit aucun chiffre suivi de « % » dans les encarts d'exemple", () => {
    const encarts = exemples(sectionParcours(html()));
    expect(encarts).toHaveLength(7);
    for (const encart of encarts) expect(texteAffiche(encart)).not.toMatch(/\d[\s  ]*%/);
  });

  it("n'écrit aucun nombre dans les encarts d'exemple", () => {
    for (const encart of exemples(sectionParcours(html()))) expect(texteAffiche(encart)).not.toMatch(/\d/);
  });

  it("n'a aucun script dans la section construite ni dans ses sources", () => {
    expect(sectionParcours(html())).not.toMatch(/<script\b/i);
    for (const fichier of ["sections/Parcours.astro", "composants/Etape.astro", "composants/VueEnsemble.astro"]) {
      expect(readFileSync(join(RACINE, "site/src", fichier), "utf8"), fichier).not.toMatch(/<script\b/i);
    }
  });

  it("ne colle aucun mot à un nombre ni après une virgule (espace perdu à un saut de ligne de la source)", () => {
    const texte = texteAffiche(sectionParcours(html()));
    const colles = [...texte.matchAll(/\p{L}\d|\d\p{L}|\p{L},\p{L}/gu)].map((m) => texte.slice(Math.max(0, m.index - 12), m.index + 12));
    expect(colles).toEqual([]);
  });
});

describe("parcours.css : couleurs, mouvement et survol", () => {
  const css = readFileSync(join(RACINE, "site/src/styles/parcours.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  /** Préludes des blocs (at-rules et sélecteurs) qui enveloppent la position `indice`. */
  function preludes(indice: number): string[] {
    const pile: string[] = [];
    let debut = 0;
    for (let i = 0; i < indice; i++) {
      const c = css[i];
      if (c === "{") {
        pile.push(css.slice(debut, i).trim());
        debut = i + 1;
      } else if (c === "}" || c === ";") {
        if (c === "}") pile.pop();
        debut = i + 1;
      }
    }
    return pile;
  }

  it("est importée par la section", () => {
    expect(readFileSync(join(RACINE, "site/src/sections/Parcours.astro"), "utf8")).toMatch(/import "\.\.\/styles\/parcours\.css";/);
  });

  it("n'écrit aucune couleur en dur", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/);
  });

  it("ne déclare transition, animation ni transform que sous prefers-reduced-motion: no-preference", () => {
    const positions = [...css.matchAll(/(?:^|[{;\s])(transition|animation|transform)\s*:/g)].map((m) => m.index);
    expect(positions.length).toBeGreaterThan(0);
    for (const position of positions) {
      const englobants = preludes(position);
      expect(
        englobants.some((p) => /^@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(p)),
        `…${css.slice(position, position + 50)}…`,
      ).toBe(true);
    }
  });

  it("n'applique un effet de survol que sous hover: hover", () => {
    const positions = [...css.matchAll(/:hover/g)].map((m) => m.index);
    expect(positions.length).toBeGreaterThan(0);
    for (const position of positions) {
      expect(
        preludes(position).some((p) => /^@media\s*\(hover:\s*hover\)/.test(p)),
        `…${css.slice(Math.max(0, position - 40), position + 10)}…`,
      ).toBe(true);
    }
  });

  it("donne au moins 2,75 rem de haut aux pastilles et aux résumés dépliables", () => {
    for (const selecteur of [".vue-ensemble__lien", ".parcours .etape__bascule"]) {
      const bloc = new RegExp(`(?:^|\\})\\s*${selecteur.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(bloc, selecteur).toMatch(/min-height:\s*2\.75rem/);
    }
  });
});
