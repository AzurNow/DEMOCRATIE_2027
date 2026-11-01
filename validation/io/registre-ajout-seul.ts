/**
 * Un registre JSON en ajout seul, générique, paramétré par un schéma et un validateur de domaine
 * (revue du 2026-10-17, constat 11) : la pose sur disque des trois registres de mesures
 * (corrections de thème, relectures, rattachements) était recopiée trois fois.
 *
 * Deux propriétés, communes aux trois registres :
 *
 * 1. **Ajout seul, écriture atomique, exclusive.** `ajouterAuRegistreGenerique` pose d'abord un
 *    verrou `<registre>.verrou` (création exclusive, option `wx`), puis relit les entrées
 *    existantes, les revalide, ajoute la nouvelle en fin et pose le tout par un fichier
 *    temporaire puis un renommage (`poserRegistreAjoutSeul`) ; le verrou est retiré à la fin,
 *    succès ou échec. Un verrou déjà présent arrête l'écriture (`RegistreVerrouille`) : deux
 *    écritures concurrentes ne se perdent pas en silence, la seconde est refusée nommément (revue
 *    du 2026-10-17, constat 9). Pas d'attente, pas de vol de verrou : un verrou laissé par un
 *    processus mort se retire à la main, après vérification. La pose reste en outre refusée si le
 *    fichier a changé depuis sa lecture (`RegistreModifieDepuisLecture`), défense en profondeur
 *    contre une écriture qui ne passerait pas par ce module. Un arrêt entre l'écriture du
 *    temporaire et le renommage ne tronque jamais le registre.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un JSON illisible, un registre qui n'est
 *    pas un tableau, ou une entrée non conforme arrêtent l'opération ; l'erreur à lever est
 *    fournie par l'appelant (`DefinitionRegistre.creerIllisible`), qui garde ainsi son propre
 *    type d'erreur nommée.
 *
 * Un fichier **absent** est un registre vide, pas une erreur.
 */

import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { valider } from "../../outils/schemas/valider.ts";

export class RegistreModifieDepuisLecture extends Error {
  constructor(chemin: string) {
    super(`${chemin} a changé depuis sa lecture. Rien n'est écrit : relancer la commande, qui relira l'état courant.`);
    this.name = "RegistreModifieDepuisLecture";
  }
}

export class RegistreVerrouille extends Error {
  constructor(chemin: string, verrou: string) {
    super(
      `${verrou} existe : une autre écriture de ${chemin} est en cours, ou une commande s'est arrêtée ` +
        `sans retirer son verrou. Rien n'est écrit. Si aucune commande n'écrit ce registre (vérifier le ` +
        `processus noté dans le verrou), supprimer ${verrou} à la main, puis relancer.`,
    );
    this.name = "RegistreVerrouille";
  }
}

/** Le fichier verrou d'un registre, à côté de lui. */
export function cheminVerrou(chemin: string): string {
  return `${chemin}.verrou`;
}

function estDejaPresent(erreur: unknown): boolean {
  return erreur instanceof Error && "code" in erreur && erreur.code === "EEXIST";
}

/** Crée le verrou de façon exclusive ; il porte le processus qui le tient, pour qui devra le retirer. */
function poserVerrou(chemin: string): string {
  const verrou = cheminVerrou(chemin);
  mkdirSync(dirname(chemin), { recursive: true });
  let descripteur: number;
  try {
    descripteur = openSync(verrou, "wx");
  } catch (erreur) {
    if (estDejaPresent(erreur)) throw new RegistreVerrouille(chemin, verrou);
    throw erreur;
  }
  try {
    writeSync(descripteur, `pid ${process.pid}, posé le ${new Date().toISOString()}\n`);
  } finally {
    closeSync(descripteur);
  }
  return verrou;
}

/**
 * Exécute `action` sous le verrou exclusif du registre, retiré ensuite quoi qu'il arrive. Seul le
 * verrou posé ici est retiré : un refus ne touche jamais au verrou d'un autre.
 */
function sousVerrou<R>(chemin: string, action: () => R): R {
  const verrou = poserVerrou(chemin);
  try {
    return action();
  } finally {
    rmSync(verrou, { force: true });
  }
}

/** Le texte du registre, ou `null` s'il n'existe pas encore : une absence dite, jamais comblée. */
export function texteDuRegistre(chemin: string): string | null {
  return existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
}

/**
 * Pose `registre` à la place du fichier, s'il porte toujours le texte `lu` (`null` : absent).
 * Atomique : temporaire dans le même répertoire, contrôle au dernier moment, puis renommage.
 * Ne pose pas de verrou : l'exclusion couvre la lecture, elle revient donc à l'appelant
 * (`ajouterAuRegistreGenerique`). Le contrôle de modification seul laisse une fenêtre entre la
 * relecture et le renommage.
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
 * Rend le registre relu après la pose. Lecture, pose et relecture se font sous le verrou du
 * registre (`RegistreVerrouille` s'il est déjà tenu).
 */
export function ajouterAuRegistreGenerique<T>(
  chemin: string,
  entree: T,
  definition: DefinitionRegistre<T>,
): readonly T[] {
  const validee = validerContreSchema<T>(entree, `entrée à enregistrer dans ${chemin}`, definition);
  return sousVerrou(chemin, () => ajouterSousVerrou(chemin, validee, definition));
}

function ajouterSousVerrou<T>(chemin: string, validee: T, definition: DefinitionRegistre<T>): readonly T[] {
  const lu = texteDuRegistre(chemin);
  const registre = [...(lu === null ? [] : entreesDe(lu, chemin, definition)), validee];
  poserRegistreAjoutSeul(chemin, lu, registre);
  const relu = lireRegistreGenerique(chemin, definition);
  if (relu.length !== registre.length) {
    throw definition.creerIllisible(chemin, `Relu après écriture : ${relu.length} entrée(s), ${registre.length} attendue(s).`);
  }
  return relu;
}
