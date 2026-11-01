/**
 * Rapport de `pnpm proprete` : les signaux de tous les fichiers suivis, comptés par zone
 * (production, tests) et détaillés pour la production. Déterministe : aucun horodatage, ordre par
 * fichier puis par ligne, pour que deux rapports se comparent par un simple diff.
 */
import { comparerChaines } from "../ordre-chaines.ts";
import { signauxPython } from "./python.ts";
import { GENRES, SEUIL_FICHIER_LIGNES, TITRES, type Genre, type Signal } from "./signaux.ts";
import { signauxTypeScript } from "./typescript.ts";

export interface FichierSource {
  readonly chemin: string;
  readonly contenu: string;
}

type Lecteur = (fichier: string, contenu: string) => Signal[];

const LECTEURS: ReadonlyMap<string, Lecteur> = new Map([
  [".ts", signauxTypeScript],
  [".py", signauxPython],
]);

function extension(chemin: string): string {
  const point = chemin.lastIndexOf(".");
  return point < 0 ? "" : chemin.slice(point);
}

export function estAnalysable(chemin: string): boolean {
  return LECTEURS.has(extension(chemin));
}

/** Nombre de lignes ; le saut de ligne final ne compte pas pour une ligne de plus. */
export function nombreDeLignes(contenu: string): number {
  if (contenu === "") return 0;
  const lignes = contenu.split("\n").length;
  return contenu.endsWith("\n") ? lignes - 1 : lignes;
}

function fichierLong(source: FichierSource): Signal[] {
  const lignes = nombreDeLignes(source.contenu);
  if (lignes <= SEUIL_FICHIER_LIGNES) return [];
  return [{ genre: "fichier-long", fichier: source.chemin, ligne: 1, detail: `${lignes} lignes` }];
}

export function signauxDe(source: FichierSource): Signal[] {
  const lecteur = LECTEURS.get(extension(source.chemin));
  if (lecteur === undefined) return [];
  return [...fichierLong(source), ...lecteur(source.chemin, source.contenu)];
}

export function estUnTest(chemin: string): boolean {
  return chemin.startsWith("tests/");
}

function ordre(a: Signal, b: Signal): number {
  if (a.fichier !== b.fichier) return comparerChaines(a.fichier, b.fichier);
  return a.ligne - b.ligne;
}

function tableauDesComptes(signaux: readonly Signal[]): string[] {
  const compte = (genre: Genre, tests: boolean): number =>
    signaux.filter((signal) => signal.genre === genre && estUnTest(signal.fichier) === tests).length;
  return [
    "| Signal | Production | Tests |",
    "| --- | ---: | ---: |",
    ...GENRES.map((genre) => `| ${TITRES[genre]} | ${compte(genre, false)} | ${compte(genre, true)} |`),
  ];
}

const LONGUEUR_DETAIL = 90;

/** Le détail tient sur une ligne : espaces regroupés, coupé au-delà de LONGUEUR_DETAIL. */
export function detailSurUneLigne(detail: string): string {
  const compact = detail.replace(/\s+/gu, " ").trim();
  return compact.length <= LONGUEUR_DETAIL ? compact : `${compact.slice(0, LONGUEUR_DETAIL - 1)}…`;
}

function section(genre: Genre, signaux: readonly Signal[]): string[] {
  const retenus = signaux.filter((signal) => signal.genre === genre);
  if (retenus.length === 0) return [];
  const lignes = retenus.map((s) => `- \`${s.fichier}:${s.ligne}\` — ${detailSurUneLigne(s.detail)}`);
  return ["", `## ${TITRES[genre]}`, "", ...lignes];
}

/** `detaillerTests` : détailler aussi les signaux des tests, que le rapport ne fait que compter. */
export function rapport(sources: readonly FichierSource[], detaillerTests: boolean): string {
  const signaux = sources.flatMap(signauxDe).sort(ordre);
  const detailles = detaillerTests ? signaux : signaux.filter((signal) => !estUnTest(signal.fichier));
  return [
    "# Signaux de propreté",
    "",
    `Produit par \`pnpm proprete\` sur ${sources.length} fichiers. Un signal est un endroit à relire, pas un`,
    "défaut : la compétence `revue-de-code` dit comment le trier.",
    "",
    ...tableauDesComptes(signaux),
    ...GENRES.flatMap((genre) => section(genre, detailles)),
    "",
  ].join("\n");
}
