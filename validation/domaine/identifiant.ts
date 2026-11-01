/**
 * Garde commune à tout champ qui nomme un fichier par son identifiant (`lot_id`, `item_id`) :
 * aucun séparateur de chemin, aucune remontée de répertoire, jamais un chemin absolu. Même
 * principe que la garde de `chemin_octets` dans `pipeline/interrogation/journal.ts`, appliqué
 * ici aux identifiants reçus du corps d'une requête POST **et** aux paramètres de route d'un GET,
 * avant toute lecture de fichier (revue du 2026-10-12, constat 12 : `lot_id ?? ""` laissait
 * passer `../…` jusqu'à `lireLot`, puis `decoderParametres` y laissait passer `..%2F…`).
 */

import { isAbsolute } from "node:path";

/**
 * `identifiant_court` de `schema/commun.schema.json` (celui de `lot.schema.json#/properties/lot_id`) :
 * `tests/lecture-requetes.test.ts` compare ce motif à celui du schéma, il n'a pas de seconde vie.
 */
export const MOTIF_IDENTIFIANT_COURT = /^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$/;

/** Un `item_id` est opaque dans le manifeste (ULID en majuscules en pratique) : alphanumérique, `_`, `-`, 64 au plus. */
export const MOTIF_IDENTIFIANT_OPAQUE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function erreurDeChemin(valeur: string, nom: string): string | null {
  if (isAbsolute(valeur) || valeur.includes("/") || valeur.includes("\\") || valeur.includes("..")) {
    return `${nom} : identifiant invalide (ni séparateur de chemin, ni remontée de répertoire, ni chemin absolu)`;
  }
  return null;
}

function erreurDeFormat(valeur: unknown, nom: string, motif: RegExp, attendu: string): string | null {
  if (typeof valeur !== "string" || valeur.length === 0) {
    return `${nom} : une chaîne non vide est attendue`;
  }
  const chemin = erreurDeChemin(valeur, nom);
  if (chemin !== null) return chemin;
  return motif.test(valeur) ? null : `${nom} : identifiant invalide (${attendu})`;
}

/** `null` si `valeur` est un `lot_id` sûr (format `identifiant_court`) ; sinon le message à renvoyer au client. */
export function erreurIdentifiantLot(valeur: unknown, nom: string): string | null {
  return erreurDeFormat(valeur, nom, MOTIF_IDENTIFIANT_COURT, "minuscules, chiffres, _ et -, 64 caractères au plus");
}

/** `null` si `valeur` est un identifiant opaque sûr (`item_id`) ; sinon le message à renvoyer au client. */
export function erreurIdentifiant(valeur: unknown, nom: string): string | null {
  return erreurDeFormat(valeur, nom, MOTIF_IDENTIFIANT_OPAQUE, "lettres, chiffres, _ et -, 64 caractères au plus");
}
