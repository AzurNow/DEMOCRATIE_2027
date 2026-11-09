/**
 * L'adaptateur d'un juge appelé par l'API Messages d'Anthropic (§7 ; décision D26 (3) : Claude
 * Sonnet 5.5, version épinglée au gel). Le modèle appelé est `run.json#/juges[].modele`, jamais une
 * valeur du code.
 *
 * Requête, enveloppe et `model` servi : ceux de l'extraction, réutilisés tels quels
 * (`pipeline/extraction/editeur-anthropic.ts:adaptateurAnthropic`, forme vérifiée le 2026-10-16) :
 * `POST https://api.anthropic.com/v1/messages`, en-têtes `x-api-key`, `anthropic-version`,
 * `content-type` ; corps `{model, max_tokens, messages: [{role: "user", content: <prompt rendu>}],
 * output_config: {effort}}`. Le prompt rendu est le seul message, sans `system`. Rien d'autre n'est
 * envoyé : ni `temperature` (refusée en 400 sur ce modèle), ni `thinking`, ni `fallbacks` — un repli
 * côté serveur ferait noter la réponse par un autre modèle sous l'identité du juge déclaré.
 *
 * Lecture propre à la notation :
 * - **refus** : `stop_reason` vaut `refusal` (refus des classifieurs de sécurité, HTTP 200, avec
 *   `stop_details`) ⇒ `sortie_refusee` ;
 * - **charge trop longue** : statut 413 (`request_too_large`) ⇒ `contexte_depasse`. Une charge qui
 *   dépasse la fenêtre de contexte sans dépasser la taille de requête revient en 400
 *   `invalid_request_error`, que rien ne distingue d'une autre requête invalide sans lire le texte du
 *   message : elle est classée `erreur_api_persistante`, son message en détail (question ouverte du
 *   lot) ;
 * - sortie coupée (`stop_reason` `max_tokens`) et toute autre fin que `end_turn` : texte illisible
 *   (`texteDesMessages`), donc `sortie_illisible`.
 */

import type { Contenu } from "../interrogation/editeur.ts";
import { adaptateurAnthropic, type ReglagesAnthropic } from "../extraction/editeur-anthropic.ts";
import type { AdaptateurJuge } from "./appel-juge.ts";

/** Les réglages d'un juge Anthropic : ceux de l'extracteur Anthropic, le modèle venant du run. */
export type ReglagesJugeAnthropic = Omit<ReglagesAnthropic, "modele">;

export const ARRET_REFUS_ANTHROPIC = "refusal";
export const STATUTS_CONTEXTE_DEPASSE_ANTHROPIC: readonly number[] = [413];

function estRefusAnthropic(contenu: Contenu): boolean {
  return contenu.forme === "objet" && contenu.brut["stop_reason"] === ARRET_REFUS_ANTHROPIC;
}

export function adaptateurJugeAnthropic(modele: string, reglages: ReglagesJugeAnthropic, cle_api: string): AdaptateurJuge {
  return {
    ...adaptateurAnthropic({ ...reglages, modele }, cle_api),
    estRefus: estRefusAnthropic,
    statuts_contexte_depasse: STATUTS_CONTEXTE_DEPASSE_ANTHROPIC,
  };
}
