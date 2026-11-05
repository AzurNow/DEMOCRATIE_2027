/**
 * Gardes d'accessibilité et de structure de la page pédagogique, lues sur site/dist/index.html
 * (produit par `pnpm build:site`). Un dist absent fait échouer les tests, jamais les sauter.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = join(resolve(import.meta.dirname, "../.."), "site/dist");
const html = (): string => readFileSync(join(DIST, "index.html"), "utf8");

/** Niveaux (1 à 6) des titres, dans l'ordre du document. */
function niveauxDeTitres(page: string): number[] {
  return [...page.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}

/** Contenu de chaque bloc `<div class="exemple-fictif…">…</div>` (sans imbrication de div dans ces blocs). */
function exemplesFictifs(page: string): string[] {
  return [...page.matchAll(/<div class="exemple-fictif[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? "");
}

describe("page pédagogique : structure et accessibilité", () => {
  it("déclare la langue française", () => {
    expect(html()).toMatch(/<html lang="fr"/);
  });

  it("n'a qu'un seul h1", () => {
    expect(niveauxDeTitres(html()).filter((n) => n === 1)).toHaveLength(1);
  });

  it("n'a aucun saut de niveau de titre", () => {
    const niveaux = niveauxDeTitres(html());
    expect(niveaux[0]).toBe(1);
    niveaux.slice(1).forEach((n, i) => {
      const precedent = niveaux[i] ?? 0;
      expect(n, `h${n} après h${precedent}`).toBeLessThanOrEqual(precedent + 1);
    });
  });

  it("donne un aria-label non vide à chaque role=img", () => {
    const balises = [...html().matchAll(/<[^>]*role="img"[^>]*>/g)].map((m) => m[0]);
    expect(balises.length).toBeGreaterThanOrEqual(8);
    for (const balise of balises) {
      expect(balise).toMatch(/aria-label="[^"]+"/);
    }
  });

  it("fait viser à chaque ancre interne un id existant", () => {
    const page = html();
    const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const ancres = [...page.matchAll(/href="#([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(ancres.length).toBeGreaterThan(0);
    for (const ancre of ancres) {
      expect(ids.has(ancre), `#${ancre} sans id`).toBe(true);
    }
  });

  it("a un lien d'évitement vers #contenu et un main avec cet id", () => {
    const page = html();
    expect(page).toMatch(/class="lien-evitement"[^>]*href="#contenu"|href="#contenu"[^>]*class="lien-evitement"/);
    expect(page).toMatch(/<main[^>]*id="contenu"/);
  });

  it("porte la mention « Exemple fictif » exactement une fois par .exemple-fictif", () => {
    const page = html();
    const blocs = exemplesFictifs(page);
    expect(blocs.length).toBeGreaterThan(0);
    for (const bloc of blocs) {
      expect(bloc.match(/Exemple fictif/gi) ?? []).toHaveLength(1);
    }
    // Aucune mention hors d'un exemple : le total des occurrences visibles égale le nombre d'exemples.
    const corps = page.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
    expect(corps.match(/Exemple fictif/gi) ?? []).toHaveLength(blocs.length);
  });

  it("n'a aucun attribut style= inline dans le HTML de la page", () => {
    const corps = html().replace(/<svg[\s\S]*?<\/svg>/g, "");
    expect(corps).not.toMatch(/\sstyle=/);
  });

  it("donne un libellé au bouton de thème et à la navigation", () => {
    const page = html();
    expect(page).toMatch(/<button[^>]*class="bascule-theme"[^>]*>\s*<span[^>]*>[^<]+<\/span>/);
    expect(page).toMatch(/<nav[^>]*aria-label="[^"]+"/);
  });

  it("garde les questions de la FAQ dans des details/summary", () => {
    const page = html();
    const details = page.match(/<details[\s>]/g) ?? [];
    const summaries = page.match(/<summary[\s>]/g) ?? [];
    expect(details.length).toBeGreaterThan(0);
    expect(summaries).toHaveLength(details.length);
  });
});
