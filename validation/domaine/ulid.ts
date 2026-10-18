/**
 * ULID — identifiant opaque de 26 caractères en base 32 de Crockford (`schema/commun`).
 *
 * Opaque par décision : un identifiant qui encoderait le candidat ou le thème deviendrait
 * mensonger dès qu'une validation corrige le thème, ce que la grille du §4 demande
 * explicitement de vérifier.
 *
 * Écrit ici plutôt qu'emprunté : quarante lignes contre une dépendance de plus dans un projet
 * dont la crédibilité repose sur la surface d'audit.
 */

import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MOTIF = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Le motif d'un ULID, exporté pour les frontières qui valident un champ par expression régulière. */
export const MOTIF_ULID = MOTIF;

/** 48 bits d'horodatage en millisecondes, puis 80 bits d'aléa. */
export function ulid(maintenant: number = Date.now()): string {
  return encoderTemps(maintenant) + encoderOctets(randomBytes(10));
}

/**
 * Un ULID dont les 80 bits de la partie aléatoire sont donnés, et non tirés : l'identifiant d'un run,
 * dérivé de la balise du gel (décision D45 (1), `pipeline/gel/balise.ts:identifiantDuRun`).
 */
export function ulidDe(millisecondes: number, octets: Uint8Array): string {
  if (octets.length !== 10) throw new Error(`La partie aléatoire d'un ULID compte 10 octets, pas ${octets.length}.`);
  return encoderTemps(millisecondes) + encoderOctets(octets);
}

function encoderTemps(millisecondes: number): string {
  if (!Number.isInteger(millisecondes) || millisecondes < 0 || millisecondes > 2 ** 48 - 1) {
    throw new Error(`Horodatage hors des 48 bits d'un ULID : ${millisecondes}`);
  }
  let reste = BigInt(millisecondes);
  const caracteres: string[] = [];
  for (let position = 0; position < 10; position += 1) {
    caracteres.push(ALPHABET[Number(reste % 32n)] as string);
    reste /= 32n;
  }
  return caracteres.reverse().join("");
}

function encoderOctets(octets: Uint8Array): string {
  let valeur = 0n;
  for (const octet of octets) valeur = (valeur << 8n) | BigInt(octet);
  const caracteres: string[] = [];
  for (let position = 0; position < 16; position += 1) {
    caracteres.push(ALPHABET[Number(valeur % 32n)] as string);
    valeur /= 32n;
  }
  return caracteres.reverse().join("");
}

export function estUlid(valeur: string): boolean {
  return MOTIF.test(valeur);
}
