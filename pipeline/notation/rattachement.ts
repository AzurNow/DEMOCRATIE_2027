/**
 * Rattachement des noms cités sur une question d'attribution (décision D27 (D) de l'auteur,
 * 2026-10-09).
 *
 * Le juge ne reçoit pas les noms des candidats de la référence (§7 : jamais le nom du candidat
 * « sans nécessité » ; la charge ne porte que leurs identifiants opaques). Sur une Q-ATT, il relève
 * donc les noms que la réponse cite comme proposant la mesure, tels qu'écrits, et ce module les
 * rattache aux candidats du périmètre du run.
 *
 * **Règle.** Un nom cité est rattaché à un candidat si, à la normalisation de la barrière de symétrie
 * du §5 près (`pipeline/questions/libelles.ts:memesMots` : casse, accents, ponctuation), il est
 * exactement le libellé de ce candidat (prénom et nom) ou exactement son nom seul. Égalité, jamais
 * inclusion ni ressemblance : « M. Martinez » ou « Martinezville » ne sont pas « Martinez ». Puis :
 *
 * - un seul candidat correspond : le nom est rattaché à lui (`cites`) ;
 * - aucun : le nom est hors périmètre (`hors_perimetre`), conservé tel qu'écrit ;
 * - plusieurs (deux candidats du même nom, cité sans prénom) : le nom est ambigu (`ambigus`),
 *   conservé tel qu'écrit, rattaché à aucun. Jamais un choix.
 *
 * Les identifiants sont rendus triés et sans doublon ; les noms non rattachés, dans l'ordre de la
 * réponse, sans doublon exact. Un nom sans aucun mot est refusé (`NomCiteSansMot`) : il ne désigne
 * personne, et le classer « hors périmètre » ferait passer une sortie de juge vide pour une donnée.
 */

import { libelleSansMot, memesMots } from "../questions/libelles.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { CandidatDuRun } from "./types.ts";

export interface Rattachement {
  /** Identifiants des candidats rattachés, triés. */
  readonly cites: readonly string[];
  /** Noms qui ne correspondent à aucun candidat du périmètre, tels qu'écrits. */
  readonly hors_perimetre: readonly string[];
  /** Noms qui correspondent à plusieurs candidats du périmètre, tels qu'écrits. */
  readonly ambigus: readonly string[];
}

export class NomCiteSansMot extends Error {
  constructor(nom: string) {
    super(`Nom cité ${JSON.stringify(nom)} sans aucun mot : il ne désigne personne, il n'est ni rattaché ni classé.`);
    this.name = "NomCiteSansMot";
  }
}

export function rattacherNoms(noms: readonly string[], candidats: readonly CandidatDuRun[]): Rattachement {
  const cites = new Set<string>();
  const hors_perimetre: string[] = [];
  const ambigus: string[] = [];
  for (const nom of noms) {
    if (libelleSansMot(nom)) throw new NomCiteSansMot(nom);
    const correspondants = candidatsDe(nom, candidats);
    const [seul] = correspondants;
    if (correspondants.length === 1 && seul !== undefined) cites.add(seul);
    else ajouterUneFois(correspondants.length === 0 ? hors_perimetre : ambigus, nom);
  }
  return { cites: [...cites].sort(comparerChaines), hors_perimetre, ambigus };
}

/** Les identifiants des candidats que ce nom désigne, par la règle de ce module (zéro, un ou plusieurs). */
export function candidatsDe(nom: string, candidats: readonly CandidatDuRun[]): readonly string[] {
  return candidats.filter((candidat) => memesMots(nom, candidat.libelle) || memesMots(nom, candidat.nom)).map((candidat) => candidat.candidat_id);
}

function ajouterUneFois(liste: string[], nom: string): void {
  if (!liste.includes(nom)) liste.push(nom);
}
