/**
 * L'adaptateur d'un juge appelé par l'API de chat de Mistral (§7 ; décision D26 (3) : Mistral Large,
 * version épinglée au gel). Le modèle appelé est `run.json#/juges[].modele`, jamais une valeur du code.
 *
 * Requête, enveloppe et `model` servi : ceux de l'extraction, réutilisés tels quels
 * (`pipeline/extraction/editeur-mistral.ts:adaptateurMistralExtraction`, qui reprend la requête de
 * la reformulation) : `POST https://api.mistral.ai/v1/chat/completions`, en-tête `Authorization:
 * Bearer`, corps `{model, messages: [{role: "user", content: <prompt rendu>}], temperature,
 * max_tokens, random_seed}`. Le prompt rendu est le seul message. Le texte est
 * `choices[0].message.content`, une chaîne, et `choices[0].finish_reason` doit valoir `stop` : une
 * sortie coupée (`length`) ou toute autre fin est illisible, donc `sortie_illisible`.
 *
 * **Refus et charge trop longue.** L'API de chat de Mistral ne documente ni signal de refus de
 * modération dans son enveloppe, ni statut propre à une charge trop longue (forme vérifiée le
 * 2026-10-15 pour la reformulation). Aucun n'est donc reconnu : un refus rédigé par le modèle n'est
 * pas l'objet JSON attendu, il est `sortie_illisible` ; une charge refusée pour sa longueur revient
 * en statut d'erreur, classé `erreur_api_persistante` avec le message de l'API en détail. Rien n'est
 * deviné du texte (question ouverte du lot).
 */

import { adaptateurMistralExtraction, type ReglagesMistral } from "../extraction/editeur-mistral.ts";
import type { AdaptateurJuge } from "./appel-juge.ts";

/** Les réglages d'un juge Mistral : ceux de l'extracteur Mistral, le modèle venant du run. */
export type ReglagesJugeMistral = Omit<ReglagesMistral, "modele">;

export function adaptateurJugeMistral(modele: string, reglages: ReglagesJugeMistral, cle_api: string): AdaptateurJuge {
  return {
    ...adaptateurMistralExtraction({ ...reglages, modele }, cle_api),
    estRefus: () => false,
    statuts_contexte_depasse: [],
  };
}
