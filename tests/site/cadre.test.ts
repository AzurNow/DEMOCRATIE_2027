/**
 * Gardes du cadre commun de la page (en-tête, navigation, pied, paliers, mouvement), lues sur
 * site/dist/index.html (produit par `pnpm build:site` ; absent, les tests ÉCHOUENT). Le CSS est inline
 * dans le HTML construit : on lit les blocs <style>.
 */
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lireSiteConstruit } from "../../outils/site-gardes.ts";

const DIST = join(resolve(import.meta.dirname, "../.."), "site/dist");
const html = (): string => lireSiteConstruit(DIST).html;
const LIBELLES_NAV = ["Parcours", "Questions", "Limites", "Contester", "FAQ"];
const SCRIPTS_ADMIS = 2; // ThemeInitial (tête) et BasculeTheme : les seuls JavaScript de la page

/**
 * La feuille globale de la page (celle qui porte les jetons : jetons, base, mise en page, mouvement,
 * fil, décors), espaces normalisés. Les styles propres aux composants et aux sections ne sont pas lus ici.
 */
function css(): string {
  const blocs = [...html().matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? "");
  const globale = blocs.find((b) => b.includes("--decalage-ancre"));
  expect(globale, "feuille globale introuvable dans le HTML construit").toBeDefined();
  return (globale ?? "").replace(/\s+/g, " ");
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
  it("a un en-tête avec une navigation étiquetée et ses cinq libellés", () => {
    const page = html();
    expect(page).toMatch(/<header class="entete"/);
    expect(page).toMatch(/<nav[^>]*aria-label="Sections de la page"/);
    for (const libelle of LIBELLES_NAV) {
      expect(page, libelle).toMatch(new RegExp(`class="entete__lien"[^>]*>${libelle}<`));
    }
  });

  it("garde le lien d'évitement et un pied avec retour en haut", () => {
    const page = html();
    expect(page).toMatch(/class="lien-evitement"[^>]*href="#contenu"/);
    expect(page).toMatch(/<footer class="pied"[\s\S]*href="#accroche"[\s\S]*<\/footer>/);
    expect(page).toMatch(/class="haut-de-page"[^>]*href="#accroche"/);
  });

  it("n'ajoute aucun script : ThemeInitial et BasculeTheme seulement", () => {
    expect(html().match(/<script\b/g)).toHaveLength(SCRIPTS_ADMIS);
  });
});

describe("cadre commun : paliers et cibles tactiles", () => {
  it("déclare les paliers tablette (40 rem) et bureau (64 rem)", () => {
    const feuille = css();
    expect(feuille).toMatch(/(min-width:\s*|width>=)(40rem|640px)/);
    expect(feuille).toMatch(/(min-width:\s*|width>=)(64rem|1024px)/);
  });

  it("donne une taille de 44 px aux cibles de l'en-tête", () => {
    expect(css()).toMatch(/--cible-tactile:\s*2\.75rem/);
    expect(css()).toMatch(/\.entete__lien\s*\{[^}]*min-height:\s*var\(--cible-tactile\)/);
  });

  it("décale les cibles d'ancre sous l'en-tête collant", () => {
    expect(css()).toMatch(/\[id\]\s*\{[^}]*scroll-margin-top:\s*var\(--decalage-ancre\)/);
  });
});

describe("cadre commun : le mouvement est une faveur", () => {
  it("ne déclare aucune transition ni animation hors prefers-reduced-motion: no-preference", () => {
    const hors = sansMouvementAutorise(css());
    const mouvements = [...hors.matchAll(/(?<![-\w])(transition|animation)(-[a-z]+)?\s*:\s*([^;}]*)/g)]
      .filter((m) => !/^(none|0s|auto)\b/.test((m[3] ?? "").replace(/\s*!important/, "").trim()))
      .map((m) => m[0]);
    expect(mouvements).toEqual([]);
  });

  it("n'active le défilement doux que sous no-preference", () => {
    const hors = sansMouvementAutorise(css());
    expect(css()).toMatch(/scroll-behavior:\s*smooth/);
    expect(hors).not.toMatch(/scroll-behavior:\s*smooth/);
  });

  it("garde le retour en haut sous @supports animation-timeline, masqué sinon", () => {
    const feuille = css();
    expect(feuille).toMatch(/\.haut-de-page\s*\{\s*display:\s*none/);
    expect(feuille).toMatch(/@supports \(animation-timeline:\s*view\(\)\)/);
  });

  it("réserve les effets de survol aux appareils qui survolent", () => {
    expect(css()).toMatch(/@media \(hover:\s*hover\)/);
  });
});
