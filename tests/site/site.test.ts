/**
 * Gardes du site statique (plan de la page pédagogique) : lisent site/dist/, produit par
 * `pnpm build:site`, page par page. Absent, le site fait ÉCHOUER les tests, jamais les sauter.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appelsReseau,
  CleDuPerimetreAbsente,
  lirePageConstruite,
  lireSiteConstruit,
  nomsDuPerimetre,
  nomsPresents,
  PageNonConstruite,
  renvoisDuTexte,
  renvoisSansSection,
  ressourcesExternes,
  scriptsExternes,
  sectionsDuProtocole,
  texteDePage,
} from "../../outils/site-gardes.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const DIST = join(RACINE, "site/dist");
const GITHUB = "https://github.com/AzurNow/DEMOCRATIE_2027";
/** Pages du site, triées par chemin : une page ajoutée ou perdue doit se voir ici. */
const PAGES_ATTENDUES = ["exemple/index.html", "index.html"];

describe("le site construit", () => {
  // Lecture dans le test : un dist absent fait échouer chaque garde avec « lancer pnpm build:site ».
  const site = () => lireSiteConstruit(DIST);
  const perimetre = readFileSync(join(RACINE, "config/perimetre.yaml"), "utf8");
  const protocole = readFileSync(join(RACINE, "docs/PROTOCOLE.md"), "utf8");

  it("construit exactement les pages attendues : l'accueil et la page exemple", () => {
    expect(site().pages.map((p) => p.chemin)).toEqual(PAGES_ATTENDUES);
  });

  it("ne charge aucune ressource externe, sur aucune page", () => {
    for (const { chemin, html } of site().pages) expect(ressourcesExternes(html), chemin).toEqual([]);
  });

  it("n'a aucun script externe, sur aucune page", () => {
    for (const { chemin, html } of site().pages) expect(scriptsExternes(html), chemin).toEqual([]);
  });

  it("n'appelle aucun réseau depuis le HTML ni les JS produits", () => {
    const { pages, scripts } = site();
    for (const { chemin, html } of pages) expect(appelsReseau(html), chemin).toEqual([]);
    expect(scripts.flatMap(appelsReseau)).toEqual([]);
  });

  it("ne nomme aucun candidat ni outil du périmètre (fichier lu), sur aucune page", () => {
    expect(perimetre.length).toBeGreaterThan(0);
    const noms = nomsDuPerimetre(perimetre);
    for (const { chemin, html } of site().pages) expect(nomsPresents(texteDePage(html), noms), chemin).toEqual([]);
  });

  it("ne renvoie qu'à des sections qui existent dans le protocole, sur chaque page", () => {
    const sections = sectionsDuProtocole(protocole);
    expect(sections.length).toBeGreaterThanOrEqual(13);
    for (const { chemin, html } of site().pages) {
      const texte = texteDePage(html);
      expect(renvoisDuTexte(texte).length, `${chemin} : aucun renvoi au protocole`).toBeGreaterThan(0);
      expect(renvoisSansSection(texte, sections), chemin).toEqual([]);
    }
  });
});

describe("lireSiteConstruit", () => {
  it("échoue explicitement quand dist est absent", () => {
    const vide = mkdtempSync(join(tmpdir(), "banc-site-"));
    expect(() => lireSiteConstruit(join(vide, "dist"))).toThrow(/pnpm build:site/);
  });

  it("lit le HTML et les JS d'un dossier construit, sous-dossiers compris", () => {
    const dossier = mkdtempSync(join(tmpdir(), "banc-site-"));
    mkdirSync(join(dossier, "_astro"));
    writeFileSync(join(dossier, "index.html"), "<p>a</p>");
    writeFileSync(join(dossier, "_astro", "x.js"), "let a = 1;");
    expect(lireSiteConstruit(dossier)).toEqual({
      html: "<p>a</p>",
      pages: [{ chemin: "index.html", html: "<p>a</p>" }],
      scripts: ["let a = 1;"],
    });
  });

  it("rend chaque page à part, chemin en « / », triée par chemin", () => {
    const dossier = mkdtempSync(join(tmpdir(), "banc-site-"));
    mkdirSync(join(dossier, "exemple"));
    writeFileSync(join(dossier, "index.html"), "<p>accueil</p>");
    writeFileSync(join(dossier, "exemple", "index.html"), "<p>exemple</p>");
    const { pages, html } = lireSiteConstruit(dossier);
    expect(pages).toEqual([
      { chemin: "exemple/index.html", html: "<p>exemple</p>" },
      { chemin: "index.html", html: "<p>accueil</p>" },
    ]);
    expect(html).toBe("<p>exemple</p>\n<p>accueil</p>");
  });
});

describe("lirePageConstruite", () => {
  it("lit une seule page, l'accueil par défaut", () => {
    const dossier = mkdtempSync(join(tmpdir(), "banc-site-"));
    mkdirSync(join(dossier, "exemple"));
    writeFileSync(join(dossier, "index.html"), "<p>accueil</p>");
    writeFileSync(join(dossier, "exemple", "index.html"), "<p>exemple</p>");
    expect(lirePageConstruite(dossier)).toBe("<p>accueil</p>");
    expect(lirePageConstruite(dossier, "exemple/index.html")).toBe("<p>exemple</p>");
  });

  it("échoue en nommant les pages présentes quand la page demandée manque", () => {
    const dossier = mkdtempSync(join(tmpdir(), "banc-site-"));
    writeFileSync(join(dossier, "index.html"), "<p>a</p>");
    expect(() => lirePageConstruite(dossier, "exemple/index.html")).toThrow(PageNonConstruite);
    expect(() => lirePageConstruite(dossier, "exemple/index.html")).toThrow(/pages présentes : index\.html/);
  });

  it("échoue comme lireSiteConstruit quand dist est absent", () => {
    const vide = mkdtempSync(join(tmpdir(), "banc-site-"));
    expect(() => lirePageConstruite(join(vide, "dist"))).toThrow(/pnpm build:site/);
  });
});

describe("ressourcesExternes", () => {
  it("admet un lien <a> vers le dépôt, sous-chemin compris", () => {
    const html = `<a href="${GITHUB}">d</a><a href="${GITHUB}/blob/main/docs/PROTOCOLE.md#x">p</a>`;
    expect(ressourcesExternes(html)).toEqual([]);
  });

  it("refuse un <img src> https même vers le dépôt", () => {
    expect(ressourcesExternes(`<img src="${GITHUB}/a.png">`)).toEqual([`${GITHUB}/a.png`]);
  });

  it("refuse un <img src> externe quelconque", () => {
    expect(ressourcesExternes('<img src="https://exemple.org/a.png">')).toEqual(["https://exemple.org/a.png"]);
  });

  it("refuse un lien <a> vers un autre site et un faux préfixe du dépôt", () => {
    expect(ressourcesExternes('<a href="https://exemple.org/">x</a>')).toHaveLength(1);
    expect(ressourcesExternes(`<a href="${GITHUB}-faux/x">x</a>`)).toHaveLength(1);
  });

  it("refuse une URL protocol-relative", () => {
    expect(ressourcesExternes('<script src="//cdn.exemple.org/a.js"></script>')).toEqual(["//cdn.exemple.org/a.js"]);
  });

  it("refuse un <link href> externe (feuille de style, police)", () => {
    expect(ressourcesExternes('<link rel="stylesheet" href="https://fonts.exemple.org/css">')).toHaveLength(1);
  });

  it("refuse url() et @import externes dans le CSS", () => {
    const css = "<style>a{background:url(https://x.org/a.png)} @import 'https://y.org/s.css';</style>";
    expect(ressourcesExternes(css)).toHaveLength(2);
    expect(ressourcesExternes('<style>@import url("//z.org/s.css");</style>')).toHaveLength(1);
  });

  it("refuse chaque candidat externe d'un srcset", () => {
    expect(ressourcesExternes('<img srcset="/a.png 1x, https://x.org/b.png 2x">')).toEqual(["https://x.org/b.png"]);
  });

  it("laisse passer les ressources locales et les ancres", () => {
    const html = '<img src="/a.png"><a href="#x">x</a><style>a{background:url(/b.png)}</style>';
    expect(ressourcesExternes(html)).toEqual([]);
  });
});

describe("scriptsExternes et appelsReseau", () => {
  it("distingue un script externe d'un script local", () => {
    const html = '<script src="https://x.org/a.js"></script><script src="/_astro/a.js"></script>';
    expect(scriptsExternes(html)).toEqual(["https://x.org/a.js"]);
  });

  it("attrape fetch, XMLHttpRequest et sendBeacon", () => {
    expect(appelsReseau("fetch('/a'); new XMLHttpRequest(); navigator.sendBeacon('/b')")).toHaveLength(3);
  });

  it("attrape new WebSocket, avec ou sans espaces", () => {
    expect(appelsReseau("const s = new WebSocket('wss://x.org'); new   WebSocket(u)")).toHaveLength(2);
  });

  it("attrape new EventSource", () => {
    expect(appelsReseau("const flux = new EventSource('/evenements')")).toHaveLength(1);
  });

  it("attrape un import() dynamique d'une adresse http, https ou sans protocole", () => {
    expect(appelsReseau("import(\"https://x.org/a.js\"); import('http://x.org/b.js'); import( `//x.org/c.js`)")).toHaveLength(3);
  });

  it("laisse passer un import() dynamique local", () => {
    expect(appelsReseau("import('./a.js'); import(`/_astro/b.js`); import(chemin)")).toEqual([]);
  });

  it("attrape navigator.sendBeacon et sendBeacon seul", () => {
    expect(appelsReseau("navigator . sendBeacon('/a'); const { sendBeacon } = navigator; sendBeacon('/b')")).toHaveLength(2);
  });

  it("ne confond pas un autre identifiant avec fetch", () => {
    expect(appelsReseau("prefetch(); const refetchez = 1; localStorage.getItem('x')")).toEqual([]);
  });
});

describe("noms du périmètre", () => {
  const EXEMPLE = `
candidats:
  - candidat_id: jeanne-durand
    libelle: "Jeanne Durand"
    nom: "Durand"
outils:
  - outil_id: assistant-exemple
    libelle: "Assistant Éxemple"
    editeur: "Société Fictive"
    alias: ["AE"]
`;

  it("extrait libellés, noms, alias, éditeurs et identifiants", () => {
    expect(nomsDuPerimetre(EXEMPLE)).toEqual(
      expect.arrayContaining(["jeanne durand", "durand", "assistant exemple", "societe fictive", "ae"]),
    );
  });

  it("attrape un nom malgré la casse et les accents", () => {
    const noms = nomsDuPerimetre(EXEMPLE);
    expect(nomsPresents("<p>Avec ASSISTANT EXEMPLE et la société fictive.</p>", noms)).toEqual([
      "assistant exemple",
      "societe fictive",
    ]);
  });

  it("ne confond pas un nom avec un fragment de mot", () => {
    expect(nomsPresents("des durandes et un aeroport", nomsDuPerimetre(EXEMPLE))).toEqual([]);
  });

  it("lit sans erreur un périmètre aux listes vides", () => {
    expect(nomsDuPerimetre("candidats: []\noutils: []\n")).toEqual([]);
  });

  it("refuse un périmètre sans la clé candidats", () => {
    expect(() => nomsDuPerimetre("outils: []\n")).toThrow(CleDuPerimetreAbsente);
    expect(() => nomsDuPerimetre("outils: []\n")).toThrow(/« candidats » est absente/);
  });

  it("refuse un périmètre sans la clé outils", () => {
    expect(() => nomsDuPerimetre("candidats: []\n")).toThrow(/« outils » est absente/);
  });

  it("refuse une clé mal orthographiée, qui rendrait zéro nom", () => {
    const faute = EXEMPLE.replace("candidats:", "candidat:");
    expect(() => nomsDuPerimetre(faute)).toThrow(/« candidats » est absente/);
  });

  it("refuse une clé qui n'est pas une liste", () => {
    expect(() => nomsDuPerimetre("candidats: ~\noutils: []\n")).toThrow(CleDuPerimetreAbsente);
  });

  it("refuse un document qui n'est pas une table", () => {
    expect(() => nomsDuPerimetre("- a\n- b\n")).toThrow(/périmètre illisible/);
  });
});

describe("renvois au protocole", () => {
  const SECTIONS = sectionsDuProtocole("# P\n\n## 1. Statut\n\n## 2. Objet\n\n### 2.1 Sous\n\n## 13. Annexes\n");

  it("extrait les numéros de section", () => {
    expect(SECTIONS).toEqual(["1", "2", "13"]);
  });

  it("admet un renvoi existant, y compris dans une entité HTML", () => {
    expect(renvoisSansSection(texteDePage("<a>&sect;13</a> et <b>§ 2</b>"), SECTIONS)).toEqual([]);
  });

  it("refuse §99", () => {
    expect(renvoisSansSection(texteDePage("<p>voir §99 et §1</p>"), SECTIONS)).toEqual(["99"]);
  });
});
