/**
 * Un registre JSON en ajout seul, générique, paramétré par un schéma et un validateur de domaine
 * (revue du 2026-10-17, constat 11) : la pose sur disque des trois registres de mesures
 * (corrections de thème, relectures, rattachements) était recopiée trois fois.
 *
 * Deux propriétés, communes aux trois registres :
 *
 * 1. **Ajout seul, écriture atomique.** `ajouterAuRegistreGenerique` relit les entrées
 *    existantes, les revalide, ajoute la nouvelle en fin et pose le tout par un fichier
 *    temporaire puis un renommage (`poserRegistreAjoutSeul`). La pose est refusée si le fichier a
 *    changé depuis sa lecture (`RegistreModifieDepuisLecture`) : un arrêt entre les deux étapes
 *    ne tronque jamais le fichier, et deux écritures concurrentes ne se perdent pas en silence.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un JSON illisible, un registre qui n'est
 *    pas un tableau, ou une entrée non conforme arrêtent l'opération ; l'erreur à lever est
 *    fournie par l'appelant (`DefinitionRegistre.creerIllisible`), qui garde ainsi son propre
 *    type d'erreur nommée.
 *
 * Un fichier **absent** est un registre vide, pas une erreur.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { valider } from "../../outils/schemas/valider.ts";

export class RegistreModifieDepuisLecture extends Error {
  constructor(chemin: string) {
    super(`${chemin} a changé depuis sa lecture. Rien n'est écrit : relancer la commande, qui relira l'état courant.`);
    this.name = "RegistreModifieDepuisLecture";
  }
}

/** Le texte du registre, ou `null` s'il n'existe pas encore : une absence dite, jamais comblée. */
export function texteDuRegistre(chemin: string): string | null {
  return existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
}

/**
 * Pose `registre` à la place du fichier, s'il porte toujours le texte `lu` (`null` : absent).
 * Atomique : temporaire dans le même répertoire, contrôle au dernier moment, puis renommage.
 */
export function poserRegistreAjoutSeul(chemin: string, lu: string | null, registre: readonly unknown[]): void {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registre, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    if (texteDuRegistre(chemin) !== lu) throw new RegistreModifieDepuisLecture(chemin);
    renameSync(tmp, chemin);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/* ------------------------------------------------- registre générique, schéma + validateur */

export interface DefinitionRegistre<T> {
  readonly schema: NomSchema;
  /** Frontière d'exécution du domaine (messages en français), appliquée après le schéma JSON. */
  readonly validerEntree: (valeur: unknown, provenance: string) => T;
  readonly creerIllisible: (chemin: string, detail: string) => Error;
}

function validerContreSchema<T>(valeur: unknown, provenance: string, definition: DefinitionRegistre<T>): T {
  return definition.validerEntree(valider(definition.schema, valeur, provenance), provenance);
}

/** Frontière d'une entrée à ajouter (schéma puis domaine), sans rien lire ni écrire. */
export function validerEntreeRegistreGenerique<T>(
  valeur: unknown,
  provenance: string,
  definition: DefinitionRegistre<T>,
): T {
  return validerContreSchema(valeur, provenance, definition);
}

function tenterJson<T>(texte: string, chemin: string, definition: DefinitionRegistre<T>): unknown {
  try {
    return JSON.parse(texte);
  } catch (erreur) {
    throw definition.creerIllisible(chemin, erreur instanceof Error ? erreur.message : String(erreur));
  }
}

function entreesDe<T>(texte: string, chemin: string, definition: DefinitionRegistre<T>): readonly T[] {
  const valeur = tenterJson(texte, chemin, definition);
  if (!Array.isArray(valeur)) throw definition.creerIllisible(chemin, "Le registre est un tableau JSON.");
  return valeur.map((entree, index) => validerContreSchema<T>(entree, `${chemin}, entrée ${index + 1}`, definition));
}

export function lireRegistreGenerique<T>(chemin: string, definition: DefinitionRegistre<T>): readonly T[] {
  const texte = texteDuRegistre(chemin);
  return texte === null ? [] : entreesDe(texte, chemin, definition);
}

/**
 * Ajoute une entrée en fin de registre ; le crée s'il est absent. Les entrées antérieures sont
 * relues, validées et réécrites telles quelles, dans leur ordre : la réécriture n'est qu'un ajout.
 * Rend le registre relu après la pose.
 */
export function ajouterAuRegistreGenerique<T>(
  chemin: string,
  entree: T,
  definition: DefinitionRegistre<T>,
): readonly T[] {
  const validee = validerContreSchema<T>(entree, `entrée à enregistrer dans ${chemin}`, definition);
  const lu = texteDuRegistre(chemin);
  const registre = [...(lu === null ? [] : entreesDe(lu, chemin, definition)), validee];
  poserRegistreAjoutSeul(chemin, lu, registre);
  const relu = lireRegistreGenerique(chemin, definition);
  if (relu.length !== registre.length) {
    throw definition.creerIllisible(chemin, `Relu après écriture : ${relu.length} entrée(s), ${registre.length} attendue(s).`);
  }
  return relu;
}
