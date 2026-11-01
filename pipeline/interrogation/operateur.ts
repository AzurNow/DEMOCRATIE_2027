/**
 * Ce qu'une commande d'interrogation dit de ses requêtes en attente de l'opérateur (§6, D55 (5)) :
 * le message qui les nomme, et le code de sortie qui le signale. Une réponse reçue que le banc n'a
 * pas pu stocker n'est jamais renvoyée ; la commande le dit, elle ne la relance pas d'elle-même.
 */

import { TENTATIVES_MAX } from "./conditions.ts";
import type { EnAttenteOperateur } from "./executer.ts";
import { cleDeRequete, type IssueStockage } from "./stocker.ts";
import type { CleRequete } from "./types.ts";

/** `pnpm run:dry` : code de sortie documenté dans son en-tête. */
export const CODE_RECUE_NON_STOCKEE = 4;

/** Résolu en chemin complet par `executer.ts:enAttente` ; `null` si la garde a elle-même échoué. */
function messageOctets(chemin_octets: string | null): string {
  return chemin_octets === null ? "aucun (la garde des octets a elle-même échoué)" : chemin_octets;
}

export function messageAttenteOperateur(item: EnAttenteOperateur): string {
  const { requete } = item;
  return (
    `En attente de l'opérateur (§6, D55 (5)) : outil ${requete.outil_id}, question ${requete.question_id}, ` +
    `mode ${requete.mode}, formulation ${requete.formulation_id}, échantillon ${requete.echantillon} — ` +
    `réponse reçue à la tentative ${item.numero} mais non stockée (${item.cause}). ` +
    `Octets gardés : ${messageOctets(item.chemin_octets)}. Cette requête n'est pas renvoyée ; elle attend une intervention manuelle.`
  );
}

function nommer(requete: CleRequete): string {
  return (
    `outil ${requete.outil_id}, question ${requete.question_id}, mode ${requete.mode}, ` +
    `formulation ${requete.formulation_id}, échantillon ${requete.echantillon} (clé ${cleDeRequete(requete)})`
  );
}

/** `pnpm interrogation:stocker` (§6, 0.21) : ce que l'opérateur a fait d'une requête en attente. */
export function messageStockage(issue: IssueStockage): string {
  const tete = `${nommer(issue.requete)}, tentative ${issue.numero}`;
  switch (issue.genre) {
    case "stockee":
      return `Stockée : ${tete} — réponse obtenue écrite depuis ses octets gardés, à l'instant de réception d'origine.`;
    case "echec_conclu":
      return (
        `Échec conclu : ${tete} — classée en échec par l'adaptateur (${issue.erreur.message}), comptée comme au chemin normal ` +
        `(${issue.tentatives} tentative(s) sur ${TENTATIVES_MAX}). La relance ordinaire la reprend.`
      );
    case "refusee":
      return `Refusée (${issue.motif}) : ${tete} — ${issue.cause}. Rien n'est écrit ; la requête reste en attente de l'opérateur.`;
  }
}
