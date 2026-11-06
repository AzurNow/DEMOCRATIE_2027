/**
 * Gardes d'accessibilité et de structure des pages du site, lues sur site/dist/ (produit par
 * `pnpm build:site`, que le `globalSetup` de `construire-site.ts` lance avant les tests).
 * Chaque garde vaut pour CHAQUE page construite (accueil, exemple) ; celles qui ne concernent que
 * l'accueil le disent. Un dist absent fait échouer les tests (`SiteNonConstruit`), jamais les sauter.
 */
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lirePageConstruite, lireSiteConstruit, type PageConstruite } from "../../outils/site-gardes.ts";

const DIST = join(resolve(import.meta.dirname, "../.."), "site/dist");
// `lireSiteConstruit` refuse un dist absent par `SiteNonConstruit` : jamais de lecture qui saute.
const pages = (): PageConstruite[] => {
  const lues = lireSiteConstruit(DIST).pages;
  expect(lues.length, "pages construites").toBeGreaterThanOrEqual(2);
  return lues;
};
const accueil = (): string => lirePageConstruite(DIST, "index.html");

/** Niveaux (1 à 6) des titres, dans l'ordre du document. */
function niveauxDeTitres(page: string): number[] {
  return [...page.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}

/** Contenu de chaque bloc `<div class="exemple-fictif…">…</div>` (sans imbrication de div dans ces blocs). */
function exemplesFictifs(page: string): string[] {
  return [...page.matchAll(/<div class="exemple-fictif[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? "");
}

/** Les identifiants d'une page. */
function ids(page: string): Set<string> {
  return new Set([...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? ""));
}

/** La page construite que sert un chemin du site (« / », « /exemple/ »), ou undefined. */
function pageServie(chemin: string, toutes: readonly PageConstruite[]): PageConstruite | undefined {
  const fichier = `${chemin.replace(/^\//, "").replace(/\/?$/, "/")}index.html`.replace(/^\//, "");
  return toutes.find((p) => p.chemin === fichier);
}

describe("pages du site : structure et accessibilité", () => {
  it("déclare la langue française", () => {
    for (const { chemin, html } of pages()) expect(html, chemin).toMatch(/<html lang="fr"/);
  });

  it("n'a qu'un seul h1 par page", () => {
    for (const { chemin, html } of pages()) {
      expect(niveauxDeTitres(html).filter((n) => n === 1), chemin).toHaveLength(1);
    }
  });

  it("n'a aucun saut de niveau de titre", () => {
    for (const { chemin, html } of pages()) {
      const niveaux = niveauxDeTitres(html);
      expect(niveaux[0], chemin).toBe(1);
      niveaux.slice(1).forEach((n, i) => {
        const precedent = niveaux[i] ?? 0;
        expect(n, `${chemin} : h${n} après h${precedent}`).toBeLessThanOrEqual(precedent + 1);
      });
    }
  });

  it("donne un aria-label non vide à chaque role=img", () => {
    expect([...accueil().matchAll(/<[^>]*role="img"[^>]*>/g)].length, "illustrations de l'accueil").toBeGreaterThanOrEqual(8);
    for (const { chemin, html } of pages()) {
      for (const balise of [...html.matchAll(/<[^>]*role="img"[^>]*>/g)].map((m) => m[0])) {
        expect(balise, chemin).toMatch(/aria-label="[^"]+"/);
      }
    }
  });

  it("fait viser à chaque ancre interne un id existant de la même page", () => {
    for (const { chemin, html } of pages()) {
      const presents = ids(html);
      const ancres = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1] ?? "");
      expect(ancres.length, chemin).toBeGreaterThan(0);
      for (const ancre of ancres) {
        expect(presents.has(ancre), `${chemin} : #${ancre} sans id`).toBe(true);
      }
    }
  });

  it("fait viser à chaque lien vers une autre page du site une page construite, et son ancre un id de cette page", () => {
    const toutes = pages();
    const liens = toutes.flatMap(({ chemin, html }) =>
      [...html.matchAll(/href="(\/(?!\/)[^"#]*)(?:#([^"]*))?"/g)].map((m) => ({ depuis: chemin, cible: m[1] ?? "", ancre: m[2] })),
    );
    expect(liens.length).toBeGreaterThan(0);
    for (const { depuis, cible, ancre } of liens) {
      const page = pageServie(cible, toutes);
      expect(page, `${depuis} : ${cible} ne mène à aucune page construite`).toBeDefined();
      if (ancre !== undefined) expect(ids(page?.html ?? "").has(ancre), `${depuis} : ${cible}#${ancre} sans id`).toBe(true);
    }
  });

  it("a un lien d'évitement vers #contenu et un main avec cet id", () => {
    for (const { chemin, html } of pages()) {
      expect(html, chemin).toMatch(/class="lien-evitement"[^>]*href="#contenu"|href="#contenu"[^>]*class="lien-evitement"/);
      expect(html, chemin).toMatch(/<main[^>]*id="contenu"/);
    }
  });

  it("porte la mention « Exemple fictif » exactement une fois par .exemple-fictif", () => {
    for (const { chemin, html } of pages()) {
      const blocs = exemplesFictifs(html);
      expect(blocs.length, chemin).toBeGreaterThan(0);
      for (const bloc of blocs) {
        expect(bloc.match(/Exemple fictif/gi) ?? [], chemin).toHaveLength(1);
      }
      // Aucune mention hors d'un exemple : le total des occurrences visibles égale le nombre d'exemples.
      const corps = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
      expect(corps.match(/Exemple fictif/gi) ?? [], chemin).toHaveLength(blocs.length);
    }
  });

  it("n'a aucun attribut style= inline dans le HTML de la page", () => {
    for (const { chemin, html } of pages()) {
      expect(html.replace(/<svg[\s\S]*?<\/svg>/g, ""), chemin).not.toMatch(/\sstyle=/);
    }
  });

  it("donne un libellé au bouton de thème et à la navigation", () => {
    for (const { chemin, html } of pages()) {
      expect(html, chemin).toMatch(/<button[^>]*class="bascule-theme"[^>]*>\s*<span[^>]*>[^<]+<\/span>/);
      expect(html, chemin).toMatch(/<nav[^>]*aria-label="[^"]+"/);
    }
  });

  it("garde les questions de la FAQ de l'accueil dans des details/summary", () => {
    const page = accueil();
    const details = page.match(/<details[\s>]/g) ?? [];
    const summaries = page.match(/<summary[\s>]/g) ?? [];
    expect(details.length).toBeGreaterThan(0);
    expect(summaries).toHaveLength(details.length);
  });
});

describe("pageServie", () => {
  const toutes = [
    { chemin: "index.html", html: "" },
    { chemin: "exemple/index.html", html: "" },
  ];

  it("sert l'accueil pour « / » et la page exemple avec ou sans barre finale", () => {
    expect(pageServie("/", toutes)?.chemin).toBe("index.html");
    expect(pageServie("/exemple/", toutes)?.chemin).toBe("exemple/index.html");
    expect(pageServie("/exemple", toutes)?.chemin).toBe("exemple/index.html");
  });

  it("ne sert rien pour un chemin sans page", () => {
    expect(pageServie("/absente/", toutes)).toBeUndefined();
  });
});
