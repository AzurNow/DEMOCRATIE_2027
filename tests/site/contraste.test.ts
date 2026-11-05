// Contraste WCAG des deux thèmes de la page pédagogique, calculé sur site/src/styles/jetons.css.
// Fonctions pures, sans dépendance : on lit le CSS comme du texte, on ne l'exécute pas.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Theme = "clair" | "sombre";
type Jetons = Map<string, string>;
type Couple = { texte: string; fond: string; seuil: number };

const CSS = readFileSync(resolve(import.meta.dirname, "../../site/src/styles/jetons.css"), "utf8");

// Sélecteurs du contrat. Le thème clair est la valeur par défaut de `:root`.
const SELECTEURS: Record<Theme, string[]> = {
  clair: [":root", ':root[data-theme="clair"]'],
  sombre: [':root:not([data-theme="clair"])', ':root[data-theme="sombre"]'],
};

const TEXTES = ["texte", "texte-doux", "lien", "accent-1", "accent-2", "accent-3"];
const FONDS = ["fond", "fond-section"];
const AA_TEXTE = 4.5;
const AA_COMPOSANT = 3;

/** Contenu du bloc `{ … }` qui suit `entete` (retrouvé en début de ligne, après indentation). */
function extraireBloc(css: string, entete: string): string {
  const motif = new RegExp(`(^|\\n)[ \\t]*${entete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`);
  const trouve = motif.exec(css);
  if (!trouve) throw new Error(`Bloc CSS introuvable : ${entete}`);
  let profondeur = 1;
  const debut = trouve.index + trouve[0].length;
  for (let i = debut; i < css.length; i++) {
    if (css[i] === "{") profondeur++;
    if (css[i] === "}") profondeur--;
    if (profondeur === 0) return css.slice(debut, i);
  }
  throw new Error(`Bloc CSS non fermé : ${entete}`);
}

function lireJetons(bloc: string): Jetons {
  const jetons: Jetons = new Map();
  for (const m of bloc.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    jetons.set(m[1] as string, (m[2] as string).trim());
  }
  return jetons;
}

/** `#rgb` ou `#rrggbb` ⇒ [r, g, b] en 0–255. Toute autre forme est une erreur, jamais une valeur par défaut. */
function parseCouleur(valeur: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(valeur.trim());
  if (!m) throw new Error(`Couleur illisible (attendu #rgb ou #rrggbb) : ${valeur}`);
  const hex = (m[1] as string).length === 3 ? [...(m[1] as string)].map((c) => c + c).join("") : (m[1] as string);
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canalLineaire(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(valeur: string): number {
  const [r, g, b] = parseCouleur(valeur);
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(g) + 0.0722 * canalLineaire(b);
}

function ratio(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}

function exiger(jetons: Jetons, nom: string, theme: Theme): string {
  const valeur = jetons.get(`--${nom}`);
  if (valeur === undefined) throw new Error(`Jeton --${nom} absent du thème ${theme}`);
  return valeur;
}

function couplesDuTheme(): Couple[] {
  const textes = FONDS.flatMap((fond) => TEXTES.map((texte) => ({ texte, fond, seuil: AA_TEXTE })));
  const composants = FONDS.flatMap((fond) =>
    ["focus", "bordure"].map((texte) => ({ texte, fond, seuil: AA_COMPOSANT })),
  );
  return [...textes, ...composants];
}

function mesurerTheme(jetons: Jetons, theme: Theme): { couple: Couple; valeur: number }[] {
  return couplesDuTheme().map((couple) => ({
    couple,
    valeur: ratio(exiger(jetons, couple.texte, theme), exiger(jetons, couple.fond, theme)),
  }));
}

function jetonsDe(css: string, theme: Theme, indice: number): Jetons {
  return lireJetons(extraireBloc(css, SELECTEURS[theme][indice] as string));
}

describe("calcul du contraste WCAG", () => {
  it("noir sur blanc vaut 21:1, dans un sens comme dans l'autre", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("accepte #rgb court et #rrggbb avec le même résultat", () => {
    expect(parseCouleur("#fa0")).toEqual(parseCouleur("#ffaa00"));
    expect(ratio("#fff", "#000")).toBeCloseTo(ratio("#ffffff", "#000000"), 10);
  });

  it("refuse une couleur qui n'est ni #rgb ni #rrggbb", () => {
    expect(() => parseCouleur("rgb(0,0,0)")).toThrow(/illisible/);
    expect(() => parseCouleur("#12345")).toThrow(/illisible/);
  });

  it("échoue explicitement quand un jeton manque dans un thème", () => {
    const sansTexteDoux = lireJetons("--fond: #fff; --fond-section: #eee; --texte: #000;");
    expect(() => mesurerTheme(sansTexteDoux, "sombre")).toThrow(/--texte-doux absent du thème sombre/);
  });

  it("échoue explicitement quand le bloc d'un sélecteur manque", () => {
    expect(() => extraireBloc(":root { --a: #fff; }", ':root[data-theme="sombre"]')).toThrow(/introuvable/);
  });
});

describe.each(["clair", "sombre"] as const)("jetons.css, thème %s", (theme) => {
  const [premier, second] = [jetonsDe(CSS, theme, 0), jetonsDe(CSS, theme, 1)];

  it("les deux sélecteurs du thème portent les mêmes couleurs", () => {
    const couleurs = (j: Jetons) => new Map([...j].filter(([, valeur]) => valeur.startsWith("#")));
    expect(couleurs(second)).toEqual(couleurs(premier));
    expect(couleurs(premier).size).toBeGreaterThan(0);
  });

  it("définit tous les jetons de couleur du contrat", () => {
    const attendus = [
      "fond", "fond-section", "texte", "texte-doux", "accent-1", "accent-2", "accent-3", "bordure", "lien", "focus",
      "px-ciel", "px-sol", "px-mur", "px-encre", "px-clair", "px-corps", "px-accent-1", "px-accent-2",
      "px-accent-3", "px-papier", "px-ecran",
    ];
    for (const nom of attendus) expect(() => exiger(premier, nom, theme), nom).not.toThrow();
  });

  it.each(couplesDuTheme())("--$texte sur --$fond atteint $seuil:1", ({ texte, fond, seuil }) => {
    const valeur = ratio(exiger(premier, texte, theme), exiger(premier, fond, theme));
    expect(valeur).toBeGreaterThanOrEqual(seuil);
  });
});
