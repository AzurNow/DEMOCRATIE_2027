/**
 * Gardes des sections hors parcours (Accroche, Questions, Limites, Préenregistrement, Contester,
 * Faq), lues sur site/dist/index.html : concepts d'abord, détails dans des <details> natifs,
 * aucun JavaScript ajouté. Un dist absent fait échouer les tests, jamais les sauter.
 */
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lirePageConstruite } from "../../outils/site-gardes.ts";

const DIST = join(resolve(import.meta.dirname, "../.."), "site/dist");
const html = (): string => lirePageConstruite(DIST, "index.html");

/** Contenu de la section d'identifiant `id`, jusqu'à la section suivante ou la fin de <main>. */
function section(page: string, id: string): string {
  const debut = page.indexOf(`id="${id}"`);
  expect(debut, `section #${id} absente`).toBeGreaterThan(-1);
  const fin = page.slice(debut + 1).search(/<section[\s>][^>]*class="section |<\/main>/);
  return fin === -1 ? page.slice(debut) : page.slice(debut, debut + 1 + fin);
}

const texte = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("Accroche : En bref", () => {
  it("présente trois ou quatre idées-forces courtes", () => {
    const bloc = section(html(), "accroche");
    const idees = [...bloc.matchAll(/<li class="enbref__idee"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => texte(m[1] ?? ""));
    expect(idees.length).toBeGreaterThanOrEqual(3);
    expect(idees.length).toBeLessThanOrEqual(4);
    for (const idee of idees) expect(idee.length).toBeLessThanOrEqual(120);
  });

  it("garde le h1 et la phrase chapô", () => {
    const bloc = section(html(), "accroche");
    expect(bloc).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    expect(bloc).toContain("section__chapo");
  });

  it("garde « Ce que le projet n'est pas » en trois pastilles repliables", () => {
    const bloc = section(html(), "accroche");
    expect(bloc.match(/<li class="pastille"/g) ?? []).toHaveLength(3);
    for (const m of bloc.matchAll(/<li class="pastille"[^>]*>([\s\S]*?)<\/li>/g)) {
      expect(m[1]).toMatch(/<details[\s>]/);
    }
  });
});

describe("Questions : cartes", () => {
  const cartes = () => [...section(html(), "questions").matchAll(/<li class="carte"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1] ?? "");

  it("porte neuf cartes", () => {
    expect(cartes()).toHaveLength(9);
  });

  it("montre la question de chaque carte hors de tout <details>", () => {
    for (const carte of cartes()) {
      const avantDetails = carte.split(/<details[\s>]/)[0] ?? "";
      expect(avantDetails).toMatch(/<h3 class="carte__titre"[^>]*>[^<]{10,}<\/h3>/);
    }
  });

  it("range la métrique de chaque carte dans un <details>", () => {
    for (const carte of cartes()) {
      const details = /<details[\s>][\s\S]*<\/details>/.exec(carte)?.[0] ?? "";
      expect(details).toContain("carte__metrique");
      expect(carte.split(/<details[\s>]/)[0]).not.toContain("carte__metrique");
    }
  });
});

describe("sections hors parcours : structure", () => {
  it("n'ajoute aucun <script> aux sections", () => {
    const page = html();
    for (const id of ["accroche", "questions", "limites", "preenregistrement", "contester", "faq"]) {
      expect(section(page, id)).not.toMatch(/<script[\s>]/);
    }
  });

  it("donne à chaque <details> un <summary> non vide", () => {
    const page = html();
    const details = [...page.matchAll(/<details[\s>][\s\S]*?<\/details>/g)].map((m) => m[0]);
    expect(details.length).toBeGreaterThan(0);
    for (const d of details) {
      const resume = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(d);
      expect(resume, "details sans summary").not.toBeNull();
      expect(texte(resume?.[1] ?? "").length).toBeGreaterThan(0);
    }
  });

  it("garde la FAQ en details/summary", () => {
    const faq = section(html(), "faq");
    expect(faq.match(/<details[\s>]/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("ne cache l'information à aucun lecteur : pas d'attribut hidden sur le contenu des sections", () => {
    const page = html();
    for (const id of ["limites", "preenregistrement", "contester"]) {
      expect(section(page, id)).not.toMatch(/\shidden[\s>=]/);
    }
  });

  it("présente la procédure de contestation en six étapes numérotées", () => {
    const bloc = section(html(), "contester");
    expect(bloc.match(/<li class="contestation__etape"/g) ?? []).toHaveLength(6);
  });
});
