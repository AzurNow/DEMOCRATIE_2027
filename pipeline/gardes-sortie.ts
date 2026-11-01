/**
 * Les gardes de sortie partagées, qui refusent avant toute écriture :
 *
 * - `exigerHorsDesZonesProtegees` : une sortie simulée (`pnpm reformuler --simule`,
 *   `pnpm extraire --simule`) sous `staging/`, `data/` ou `runs/` du dépôt — une proposition ou un
 *   item simulé y serait relu comme une vraie donnée (règle 3).
 * - `exigerHorsDeRuns` : un simulé de notation ou d'interrogation (run, juge, fournisseur
 *   d'existences) qui écrit ou se branche sous `runs/` du dépôt — un run simulé n'est pas un run
 *   (`runs/README.md`).
 *
 * `cheminReel` (le chemin réel de la plus longue partie existante, suivi du reste tel quel) et
 * `estSous` sont la seule implémentation de la comparaison : un lien symbolique posé hors d'une
 * zone interdite qui y mène est refusé comme le chemin direct.
 *
 * La comparaison ignore la casse et la normalisation Unicode (NFC), quel que soit le disque
 * (constat 6 du 2026-10-17) : sur APFS, `DATA/` est `data/` ; ailleurs, refuser `DATA/` est un
 * sur-refus sans coût, et la règle ne dépend pas du système de fichiers. `realpathSync.native`
 * rend en outre la casse inscrite sur le disque pour la partie existante.
 */

import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

/** `runs/` du dépôt qui porte ce code. */
export const RUNS_DU_DEPOT = resolve(import.meta.dirname, "../runs");

/** Nombre de liens symboliques suivis au plus pour résoudre un chemin, comme `SYMLOOP_MAX` (Linux : 40). */
const SAUTS_MAX = 40;

export class LienEnBoucle extends Error {
  constructor(chemin: string) {
    super(`${chemin} : plus de ${SAUTS_MAX} liens symboliques à suivre, boucle probable ; aucune écriture n'y est tentée.`);
    this.name = "LienEnBoucle";
  }
}

/**
 * Le chemin réel de la plus longue partie existante (casse du disque), suivi du reste tel quel. Un
 * lien symbolique dont la cible n'existe pas encore est suivi aussi : sur un disque sensible à la
 * casse, un lien vers `<dépôt>/DATA` ne mène à rien d'existant, mais une écriture à travers lui
 * créerait `DATA/`, que la comparaison sans casse doit voir.
 */
export function cheminReel(absolu: string, sauts = 0): string {
  if (existsSync(absolu)) return realpathSync.native(absolu);
  if (estLienSymbolique(absolu)) return cheminReel(cibleDuLien(absolu, sauts), sauts + 1);
  const parent = dirname(absolu);
  if (parent === absolu) return absolu;
  return join(cheminReel(parent, sauts), basename(absolu));
}

/** Le système lève ELOOP quand une boucle de liens traverse un répertoire du chemin : refus nommé. */
function estLienSymbolique(chemin: string): boolean {
  try {
    return lstatSync(chemin, { throwIfNoEntry: false })?.isSymbolicLink() === true;
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ELOOP") throw new LienEnBoucle(chemin);
    throw erreur;
  }
}

function cibleDuLien(lien: string, sauts: number): string {
  if (sauts >= SAUTS_MAX) throw new LienEnBoucle(lien);
  return resolve(dirname(lien), readlinkSync(lien));
}

/** La forme comparée d'un chemin : réel, en NFC, en minuscules. */
function cleDeComparaison(chemin: string): string {
  return cheminReel(resolve(chemin)).normalize("NFC").toLowerCase();
}

/**
 * Vrai si `chemin` est `repertoire`, ou en dessous, une fois les liens symboliques résolus, sans
 * égard à la casse ni à la normalisation Unicode.
 */
export function estSous(chemin: string, repertoire: string): boolean {
  const reel = cleDeComparaison(chemin);
  const reference = cleDeComparaison(repertoire);
  return reel === reference || reel.startsWith(`${reference}${sep}`);
}

/* --------------------------------------------------------- hors des zones protégées (règle 3) */

const ZONES_PROTEGEES = ["staging", "data", "runs"] as const;

export class SimuleSousZoneProtegee extends Error {
  constructor(sortie: string, zone: string) {
    super(`${sortie} est sous ${zone} : une sortie simulée n'y est jamais écrite (staging/, data/ et runs/ du dépôt sont protégés, règle 3).`);
    this.name = "SimuleSousZoneProtegee";
  }
}

/** Refuse une sortie simulée sous `staging/`, `data/` ou `runs/` du dépôt ; sert à `pnpm reformuler` et `pnpm extraire`. */
export function exigerHorsDesZonesProtegees(sortie: string, depot: string): void {
  for (const zone of ZONES_PROTEGEES) {
    const protegee = join(depot, zone);
    if (estSous(sortie, protegee)) throw new SimuleSousZoneProtegee(sortie, cheminReel(resolve(protegee)));
  }
}

/* -------------------------------------------------------------------- hors de runs/ (notation) */

export class SimuleSousRuns extends Error {
  constructor(chemin: string) {
    super(`${chemin} est sous ${RUNS_DU_DEPOT} : un simulé (run, juge ou fournisseur d'existences) n'y écrit ni ne s'y branche jamais (un run simulé n'est pas un run).`);
    this.name = "SimuleSousRuns";
  }
}

export function estSousRuns(chemin: string): boolean {
  return estSous(chemin, RUNS_DU_DEPOT);
}

export function exigerHorsDeRuns(chemin: string): void {
  if (estSousRuns(chemin)) throw new SimuleSousRuns(chemin);
}
