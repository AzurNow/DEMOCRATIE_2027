/**
 * Gardes du cadre commun des pages (en-tête, navigation, pied, paliers, mouvement), lues sur chaque
 * page de site/dist/ (produit par `pnpm build:site` ; absent, les tests ÉCHOUENT). Le CSS est inline
 * dans le HTML construit : on lit les blocs <style>.
 */
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lirePageConstruite, lireSiteConstruit, type PageConstruite } from "../../outils/site-gardes.ts";

const DIST = join(resolve(import.meta.dirname, "../.."), "site/dist");
const pages = (): PageConstruite[] => {
  const lues = lireSiteConstruit(DIST).pages;
  expect(lues.length, "pages construites").toBeGreaterThanOrEqual(2);
  return lues;
};
const LIBELLES_NAV = ["Parcours", "Exemple", "Questions", "Limites", "Contester", "FAQ"];
const SCRIPTS_ADMIS = 2; // ThemeInitial (tête) et BasculeTheme : les seuls JavaScript de chaque page

/**
 * La feuille globale d'une page (celle qui porte les jetons : jetons, base, mise en page, mouvement,
 * fil, décors), espaces normalisés. Les styles propres aux composants et aux sections ne sont pas lus ici.
 */
function css(html: string, chemin: string): string {
  const blocs = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "");
  const globale = blocs.find((b) => b.includes("--decalage-ancre"));
  expect(globale, `${chemin} : feuille globale introuvable dans le HTML construit`).toBeDefined();
  return (globale ?? "").replace(/\s+/g, " ");
}

/** La feuille globale de chaque page, avec son chemin. */
function feuilles(): Array<{ chemin: string; feuille: string }> {
  return pages().map(({ chemin, html }) => ({ chemin, feuille: css(html, chemin) }));
}

/** Indice de l'accolade fermante qui équilibre l'accolade ouvrante à `ouvrante`. */
function accoladeFermante(texte: string, ouvrante: number): number {
  let profondeur = 0;
  for (let i = ouvrante; i < texte.length; i++) {
    profondeur += texte[i] === "{" ? 1 : texte[i] === "}" ? -1 : 0;
    if (profondeur === 0) return i;
  }
  return texte.length - 1;
}

/** Retire les blocs `@media (…prefers-reduced-motion: no-preference…) { … }` (accolades équilibrées). */
function sansMouvementAutorise(feuille: string): string {
  let reste = feuille;
  for (;;) {
    const debut = reste.search(/@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*\{/);
    if (debut < 0) return reste;
    const fin = accoladeFermante(reste, reste.indexOf("{", debut));
    reste = reste.slice(0, debut) + reste.slice(fin + 1);
  }
}

describe("cadre commun : en-tête, navigation, pied", () => {
  it("a, sur chaque page, un en-tête avec une navigation étiquetée et ses six libellés", () => {
    for (const { chemin, html } of pages()) {
      expect(html, chemin).toMatch(/<header class="entete"/);
      expect(html, chemin).toMatch(/<nav[^>]*aria-label="Sections de la page"/);
      for (const libelle of LIBELLES_NAV) {
        expect(html, `${chemin} : ${libelle}`).toMatch(new RegExp(`class="entete__lien"[^>]*>${libelle}<`));
      }
    }
  });

  it("garde sur l'accueil des liens d'ancre dans la page, et les préfixe par « / » ailleurs", () => {
    expect(lirePageConstruite(DIST, "index.html")).toMatch(/class="entete__lien" href="#parcours"/);
    expect(lirePageConstruite(DIST, "exemple/index.html")).toMatch(/class="entete__lien" href="\/#parcours"/);
  });

  it("mène le lien « Exemple » à /exemple/, marqué page courante sur cette page seulement", () => {
    const accueil = lirePageConstruite(DIST, "index.html");
    const exemple = lirePageConstruite(DIST, "exemple/index.html");
    expect(accueil).toMatch(/class="entete__lien" href="\/exemple\/">Exemple</);
    expect(accueil).not.toMatch(/aria-current/);
    expect(exemple).toMatch(/class="entete__lien" href="\/exemple\/" aria-current="page">Exemple</);
    expect(exemple.match(/aria-current/g) ?? []).toHaveLength(1);
  });

  it("garde le lien d'évitement et un pied avec retour en haut", () => {
    for (const { chemin, html } of pages()) {
      expect(html, chemin).toMatch(/class="lien-evitement"[^>]*href="#contenu"/);
      expect(html, chemin).toMatch(/<footer class="pied"[\s\S]*href="#accroche"[\s\S]*<\/footer>/);
      expect(html, chemin).toMatch(/class="haut-de-page"[^>]*href="#accroche"/);
    }
  });

  it("n'ajoute aucun script : ThemeInitial et BasculeTheme seulement, sur chaque page", () => {
    for (const { chemin, html } of pages()) expect(html.match(/<script\b/g), chemin).toHaveLength(SCRIPTS_ADMIS);
  });
});

describe("cadre commun : paliers et cibles tactiles", () => {
  it("déclare les paliers tablette (40 rem) et bureau (64 rem)", () => {
    for (const { chemin, feuille } of feuilles()) {
      expect(feuille, chemin).toMatch(/(min-width:\s*|width>=)(40rem|640px)/);
      expect(feuille, chemin).toMatch(/(min-width:\s*|width>=)(64rem|1024px)/);
    }
  });

  it("donne une taille de 44 px aux cibles de l'en-tête", () => {
    for (const { chemin, feuille } of feuilles()) {
      expect(feuille, chemin).toMatch(/--cible-tactile:\s*2\.75rem/);
      expect(feuille, chemin).toMatch(/\.entete__lien\s*\{[^}]*min-height:\s*var\(--cible-tactile\)/);
    }
  });

  it("décale les cibles d'ancre sous l'en-tête collant", () => {
    for (const { chemin, feuille } of feuilles()) {
      expect(feuille, chemin).toMatch(/\[id\]\s*\{[^}]*scroll-margin-top:\s*var\(--decalage-ancre\)/);
    }
  });
});

describe("cadre commun : le mouvement est une faveur", () => {
  it("ne déclare aucune transition ni animation hors prefers-reduced-motion: no-preference", () => {
    for (const { chemin, feuille } of feuilles()) {
      const hors = sansMouvementAutorise(feuille);
      const mouvements = [...hors.matchAll(/(?<![-\w])(transition|animation)(-[a-z]+)?\s*:\s*([^;}]*)/g)]
        .filter((m) => !/^(none|0s|auto)\b/.test((m[3] ?? "").replace(/\s*!important/, "").trim()))
        .map((m) => m[0]);
      expect(mouvements, chemin).toEqual([]);
    }
  });

  it("n'active le défilement doux que sous no-preference", () => {
    for (const { chemin, feuille } of feuilles()) {
      expect(feuille, chemin).toMatch(/scroll-behavior:\s*smooth/);
      expect(sansMouvementAutorise(feuille), chemin).not.toMatch(/scroll-behavior:\s*smooth/);
    }
  });

  it("garde le retour en haut sous @supports animation-timeline, masqué sinon", () => {
    for (const { chemin, feuille } of feuilles()) {
      expect(feuille, chemin).toMatch(/\.haut-de-page\s*\{\s*display:\s*none/);
      expect(feuille, chemin).toMatch(/@supports \(animation-timeline:\s*view\(\)\)/);
    }
  });

  it("réserve les effets de survol aux appareils qui survolent", () => {
    for (const { chemin, feuille } of feuilles()) expect(feuille, chemin).toMatch(/@media \(hover:\s*hover\)/);
  });
});
