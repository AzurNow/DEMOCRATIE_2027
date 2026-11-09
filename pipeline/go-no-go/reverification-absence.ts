/**
 * `runs/<date>/reverification-absence.json` sur disque (`schema/reverification-absence.schema.json`) :
 * écrit par `pnpm reverifier-absence` (`outils/reverifier-absence.ts`), lu par `pnpm go-no-go` pour
 * la case 2 de l'annexe F (`checklist.ts:constatItemsAbsenceReverifies`). La logique vit dans
 * `validation/domaine/reverification-absence.ts`.
 *
 * Validé à la lecture comme à l'écriture : contre le schéma, puis l'unicité des `item_id`, que JSON
 * Schema ne sait pas dire. Deux lectures :
 *
 * - `lireReverificationAbsence` (go-no-go) rend un fichier absent ou non conforme comme tel, pour que
 *   la case le dise ; jamais « fait » par défaut ;
 * - `lireReverificationExistante` (la commande) lève sur un fichier non conforme : on n'écrit pas
 *   par-dessus un fichier qu'on ne sait pas lire.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ErreurSchema, JsonIllisible, jsonDe, valider } from "../../outils/schemas/valider.ts";
import type { FichierReverification } from "../../validation/domaine/reverification-absence.ts";
import { ecrireParRenommage } from "../run/ecriture.ts";

const NOM_FICHIER = "reverification-absence.json";
const SUFFIXE_TEMPORAIRE = "reverification-absence";

export function cheminReverificationAbsence(repertoire_run: string): string {
  return join(repertoire_run, NOM_FICHIER);
}

export class ReverificationEnDouble extends Error {
  constructor(chemin: string, item_ids: readonly string[]) {
    super(`${chemin} : item(s) présent(s) deux fois : ${item_ids.join(", ")}.`);
    this.name = "ReverificationEnDouble";
  }
}

function exigerSansDoublon(fichier: FichierReverification, chemin: string): FichierReverification {
  const vus = new Set<string>();
  const doublons = new Set<string>();
  for (const { reference } of fichier.items) {
    if (vus.has(reference.item_id)) doublons.add(reference.item_id);
    vus.add(reference.item_id);
  }
  if (doublons.size > 0) throw new ReverificationEnDouble(chemin, [...doublons]);
  return fichier;
}

function lireConforme(chemin: string): FichierReverification {
  const fichier = valider<FichierReverification>("reverification-absence", jsonDe(readFileSync(chemin, "utf8"), chemin), chemin);
  return exigerSansDoublon(fichier, chemin);
}

/** Le fichier déjà écrit, ou `null` s'il n'existe pas encore. Non conforme : lève. */
export function lireReverificationExistante(repertoire_run: string): FichierReverification | null {
  const chemin = cheminReverificationAbsence(repertoire_run);
  return existsSync(chemin) ? lireConforme(chemin) : null;
}

export type LectureReverification =
  | { readonly statut: "absent" }
  | { readonly statut: "non_conforme"; readonly detail: string }
  | { readonly statut: "lu"; readonly fichier: FichierReverification };

function estUnDefautDuFichier(erreur: unknown): erreur is Error {
  return erreur instanceof JsonIllisible || erreur instanceof ErreurSchema || erreur instanceof ReverificationEnDouble;
}

/** Pour la checklist : un fichier absent ou non conforme est un état nommé, pas une erreur qui arrête le go/no-go. */
export function lireReverificationAbsence(repertoire_run: string): LectureReverification {
  const chemin = cheminReverificationAbsence(repertoire_run);
  if (!existsSync(chemin)) return { statut: "absent" };
  try {
    return { statut: "lu", fichier: lireConforme(chemin) };
  } catch (erreur) {
    if (!estUnDefautDuFichier(erreur)) throw erreur;
    return { statut: "non_conforme", detail: erreur.message };
  }
}

/** Valide puis écrit par renommage (temporaire `<fichier>.reverification-absence`). */
export function ecrireReverificationAbsence(repertoire_run: string, fichier: FichierReverification): void {
  const chemin = cheminReverificationAbsence(repertoire_run);
  const conforme = valider<FichierReverification>("reverification-absence", fichier, `${chemin} avant écriture`);
  ecrireParRenommage(chemin, exigerSansDoublon(conforme, chemin), SUFFIXE_TEMPORAIRE);
}
