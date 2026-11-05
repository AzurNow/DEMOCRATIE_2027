/**
 * Gardes du site statique (plan de la page pédagogique) : lisent site/dist/, produit par
 * `pnpm build:site`. Absent, le site fait ÉCHOUER les tests, jamais les sauter.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appelsReseau,
  lireSiteConstruit,
  nomsDuPerimetre,
  nomsPresents,
  renvoisSansSection,
  ressourcesExternes,
  scriptsExternes,
  sectionsDuProtocole,
  texteDePage,
} from "../../outils/site-gardes.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const DIST = join(RACINE, "site/dist");
const GITHUB = "https://github.com/AzurNow/DEMOCRATIE_2027";

describe("le site construit", () => {
  // Lecture dans le test : un dist absent fait échouer chaque garde avec « lancer pnpm build:site ».
  const site = () => lireSiteConstruit(DIST);
  const perimetre = readFileSync(join(RACINE, "config/perimetre.yaml"), "utf8");
  const protocole = readFileSync(join(RACINE, "docs/PROTOCOLE.md"), "utf8");

  it("ne charge aucune ressource externe", () => {
    expect(ressourcesExternes(site().html)).toEqual([]);
  });

  it("n'a aucun script externe", () => {
    expect(scriptsExternes(site().html)).toEqual([]);
  });

  it("n'appelle aucun réseau depuis le HTML ni les JS produits", () => {
    const { html, scripts } = site();
    expect([html, ...scripts].flatMap(appelsReseau)).toEqual([]);
  });

  it("ne nomme aucun candidat ni outil du périmètre (fichier lu)", () => {
    expect(perimetre.length).toBeGreaterThan(0);
    expect(nomsPresents(texteDePage(site().html), nomsDuPerimetre(perimetre))).toEqual([]);
  });

  it("ne renvoie qu'à des sections qui existent dans le protocole", () => {
    const sections = sectionsDuProtocole(protocole);
    expect(sections.length).toBeGreaterThanOrEqual(13);
    expect(renvoisSansSection(texteDePage(site().html), sections)).toEqual([]);
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
    expect(lireSiteConstruit(dossier)).toEqual({ html: "<p>a</p>", scripts: ["let a = 1;"] });
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
