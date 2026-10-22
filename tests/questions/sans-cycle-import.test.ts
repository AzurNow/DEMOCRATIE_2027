/**
 * Lot 8c, constat 15 (relecture du 12/10) : le découpage de `tirage.ts` en `tirabilite.ts`,
 * `entrees-tirage.ts` et `graine.ts` a cassé un cycle d'import, mais rien ne le garantissait. Ce
 * test remplace le script jetable `scratch/verifier-cycles.mjs` : il refait le même parcours en
 * profondeur sur les imports relatifs (y compris `import type`) de tout le dépôt, et n'affirme
 * rien que sur les cycles qui traversent `pipeline/questions/`. Les trois cycles déjà présents
 * ailleurs (notation/charge-juge.ts, validation/serveur/routes.ts) sont hors périmètre.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "../..");
const DOSSIERS_IGNORES = new Set(["node_modules", ".git", "scratch", "archives", "modeles"]);
const RE_IMPORT_RELATIF = /from\s+["'](\.\.?\/[^"']+)["']/g;

type Etat = "en_cours" | "fini";

function fichiersTypescript(dossier: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dossier)) {
    if (DOSSIERS_IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    const info = statSync(chemin);
    if (info.isDirectory()) fichiersTypescript(chemin, acc);
    else if (extname(nom) === ".ts") acc.push(chemin);
  }
  return acc;
}

function importsRelatifsDe(chemin: string, fichiers: readonly string[]): string[] {
  const texte = readFileSync(chemin, "utf8");
  const cibles: string[] = [];
  for (const correspondance of texte.matchAll(RE_IMPORT_RELATIF)) {
    const cible = resolve(dirname(chemin), correspondance[1] as string);
    if (fichiers.includes(cible)) cibles.push(cible);
  }
  return cibles;
}

function construireGraphe(fichiers: readonly string[]): Map<string, string[]> {
  return new Map(fichiers.map((fichier) => [fichier, importsRelatifsDe(fichier, fichiers)]));
}

function chercherCyclesDepuis(
  noeud: string,
  graphe: ReadonlyMap<string, readonly string[]>,
  etat: Map<string, Etat>,
  pile: string[],
  cycles: string[][],
): void {
  etat.set(noeud, "en_cours");
  pile.push(noeud);
  for (const voisin of graphe.get(noeud) ?? []) {
    if (etat.get(voisin) === "en_cours") {
      const debut = pile.indexOf(voisin);
      cycles.push([...pile.slice(debut), voisin]);
    } else if (etat.get(voisin) !== "fini") {
      chercherCyclesDepuis(voisin, graphe, etat, pile, cycles);
    }
  }
  pile.pop();
  etat.set(noeud, "fini");
}

function tousLesCycles(graphe: ReadonlyMap<string, readonly string[]>): string[][] {
  const etat = new Map<string, Etat>();
  const pile: string[] = [];
  const cycles: string[][] = [];
  for (const noeud of graphe.keys()) {
    if (!etat.has(noeud)) chercherCyclesDepuis(noeud, graphe, etat, pile, cycles);
  }
  return cycles;
}

function traversePipelineQuestions(cycle: readonly string[]): boolean {
  return cycle.some((chemin) => relative(RACINE, chemin).startsWith("pipeline/questions/"));
}

function decrireCycle(cycle: readonly string[]): string {
  return cycle.map((chemin) => relative(RACINE, chemin)).join(" -> ");
}

describe("absence de cycle d'import", () => {
  it("aucun cycle d'import ne passe par pipeline/questions/", () => {
    const fichiers = fichiersTypescript(RACINE);
    const graphe = construireGraphe(fichiers);
    const cyclesTrouves = tousLesCycles(graphe).filter(traversePipelineQuestions);

    const description = cyclesTrouves.map(decrireCycle).join("\n");
    expect(cyclesTrouves, `cycle(s) d'import détecté(s) via pipeline/questions/ :\n${description}`).toEqual([]);
  });
});
