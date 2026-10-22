/**
 * Garde commune à tout champ qui nomme un fichier par son identifiant (`lot_id`, `item_id`) :
 * aucun séparateur de chemin, aucune remontée de répertoire, jamais un chemin absolu. Même
 * principe que la garde de `chemin_octets` dans `pipeline/interrogation/journal.ts`, appliqué
 * ici aux identifiants reçus du corps d'une requête POST, avant toute lecture de fichier (revue
 * du 2026-10-12, constat 12 : `lot_id ?? ""` laissait passer `../…` jusqu'à `lireLot`).
 */

import { isAbsolute } from "node:path";

/** `null` si `valeur` est un identifiant sûr ; sinon le message à renvoyer au client. */
export function erreurIdentifiant(valeur: unknown, nom: string): string | null {
  if (typeof valeur !== "string" || valeur.length === 0) {
    return `${nom} : une chaîne non vide est attendue`;
  }
  if (isAbsolute(valeur) || valeur.includes("/") || valeur.includes("\\") || valeur.includes("..")) {
    return `${nom} : identifiant invalide (ni séparateur de chemin, ni remontée de répertoire, ni chemin absolu)`;
  }
  return null;
}
