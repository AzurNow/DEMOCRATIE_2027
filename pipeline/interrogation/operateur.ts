/**
 * Ce qu'une commande d'interrogation dit de ses requêtes en attente de l'opérateur (§6, D55 (5)) :
 * le message qui les nomme, et le code de sortie qui le signale. Une réponse reçue que le banc n'a
 * pas pu stocker n'est jamais renvoyée ; la commande le dit, elle ne la relance pas d'elle-même.
 */

import type { EnAttenteOperateur } from "./executer.ts";

/** `pnpm run:dry` : code de sortie documenté dans son en-tête. */
export const CODE_RECUE_NON_STOCKEE = 4;

export function messageAttenteOperateur(item: EnAttenteOperateur): string {
  const { requete } = item;
  return (
    `En attente de l'opérateur (§6, D55 (5)) : outil ${requete.outil_id}, question ${requete.question_id}, ` +
    `mode ${requete.mode}, formulation ${requete.formulation_id}, échantillon ${requete.echantillon} — ` +
    `réponse reçue à la tentative ${item.numero} mais non stockée (${item.cause}). ` +
    `Octets gardés : ${item.chemin_octets}. Cette requête n'est pas renvoyée ; elle attend une intervention manuelle.`
  );
}
