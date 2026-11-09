/**
 * Détection de cycles d'import, partagée par les gardes de `tests/` (docs/DETTE.md, 2026-11-09 n° 4).
 * Parcours en profondeur sur les imports relatifs, `import type` compris : un cycle de types seul
 * est signalé aussi, pour rester aligné sur le test d'origine de `pipeline/questions/`.
 * Analyse textuelle, sans dépendance.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const DOSSIERS_IGNORES = new Set(["node_modules", ".git", "scratch", "archives", "modeles"]);
/**
 * Lot 10 (d) : toutes les formes qui chargent un module relatif — `import … from "./x.ts"`,
 * `import type … from`, `export … from`, l'import pour effet `import "./x.ts"` et l'import dynamique
 * `import("./x.ts")`.
 */
const RE_IMPORT_RELATIF = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g;

type Etat = "en_cours" | "fini";

/** Graphe d'imports : fichier -> fichiers du graphe qu'il importe. */
export type Graphe = ReadonlyMap<string, readonly string[]>;

export function fichiersTypescript(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiersTypescript(chemin, acc);
    else if (extname(nom) === ".ts") acc.push(chemin);
  }
  return acc;
}

/** Les chemins relatifs que charge un texte TypeScript, dans l'ordre d'apparition. */
export function specifiersRelatifs(texte: string): string[] {
  return [...texte.matchAll(RE_IMPORT_RELATIF)].map((correspondance) => correspondance[1] as string);
}

function importsRelatifsDe(chemin: string, fichiers: ReadonlySet<string>): string[] {
  return specifiersRelatifs(readFileSync(chemin, "utf8"))
    .map((specifier) => resolve(dirname(chemin), specifier))
    .filter((cible) => fichiers.has(cible));
}

/** Graphe des imports relatifs entre les fichiers donnés (chemins absolus). */
export function construireGraphe(fichiers: readonly string[]): Graphe {
  const connus = new Set(fichiers);
  return new Map(fichiers.map((fichier) => [fichier, importsRelatifsDe(fichier, connus)]));
}

function chercherCyclesDepuis(
  noeud: string,
  graphe: Graphe,
  etat: Map<string, Etat>,
  pile: string[],
  cycles: string[][],
): void {
  etat.set(noeud, "en_cours");
  pile.push(noeud);
  for (const voisin of graphe.get(noeud) ?? []) {
    if (etat.get(voisin) === "en_cours") {
      cycles.push([...pile.slice(pile.indexOf(voisin)), voisin]);
    } else if (etat.get(voisin) !== "fini") {
      chercherCyclesDepuis(voisin, graphe, etat, pile, cycles);
    }
  }
  pile.pop();
  etat.set(noeud, "fini");
}

/** Chaque cycle rencontré, sous la forme `[a, b, …, a]`. */
export function tousLesCycles(graphe: Graphe): string[][] {
  const etat = new Map<string, Etat>();
  const cycles: string[][] = [];
  for (const noeud of graphe.keys()) {
    if (!etat.has(noeud)) chercherCyclesDepuis(noeud, graphe, etat, [], cycles);
  }
  return cycles;
}

/** Chemin relatif à la racine, séparateur `/` (stable d'un système à l'autre). */
export function cheminRelatif(racine: string, chemin: string): string {
  return relative(racine, chemin).split(sep).join("/");
}

/** Vrai si un fichier du cycle est sous `prefixe` (relatif à la racine, séparateur `/`, ex. `analysis/`). */
export function traverse(racine: string, cycle: readonly string[], prefixe: string): boolean {
  return cycle.some((chemin) => cheminRelatif(racine, chemin).startsWith(prefixe));
}

export function decrireCycle(racine: string, cycle: readonly string[]): string {
  return cycle.map((chemin) => cheminRelatif(racine, chemin)).join(" -> ");
}
