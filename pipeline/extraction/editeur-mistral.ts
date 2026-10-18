/**
 * L'adaptateur de l'API de chat de Mistral, pour l'extracteur Mistral Large (décision D52 (1)).
 *
 * Requête : celle de `pipeline/reformulation/editeur-mistral.ts:adaptateurMistral`, réutilisée telle
 * quelle (`model`, `messages`, `temperature`, `max_tokens`, `random_seed` ; clé vide refusée avant
 * toute requête), mais avec les réglages de `config/extraction.json`, jamais ceux de la reformulation.
 *
 * Lecture : `texteDuChat` de la reformulation (`choices[0].message.content`, une chaîne, rien
 * d'autre), plus ce que la reformulation ne vérifie pas : `choices[0].finish_reason` doit valoir
 * `stop`. Toute autre valeur, `length` comprise (sortie coupée par `max_tokens`), ou son absence, ne
 * donne pas de texte, et la raison nomme la valeur reçue. Le corps reste tel quel (règle 7).
 */

import { estObjetJson, type Contenu } from "../interrogation/editeur.ts";
import type { ObjetJson } from "../interrogation/types.ts";
import { adaptateurMistral, texteDuChat } from "../reformulation/editeur-mistral.ts";
import { modeleDuCorps, type AdaptateurExtraction, type LectureTexteModele } from "./editeur.ts";

export interface ReglagesMistral {
  /** Identifiant exact du modèle épinglé. */
  readonly modele: string;
  readonly temperature: number;
  readonly max_tokens: number;
  readonly random_seed: number;
  /** Délai au-delà duquel un appel sans réponse est abandonné ; jamais envoyé. */
  readonly delai_abandon_ms: number;
}

const FIN_ATTENDUE = "stop";

/** Ce que dit une valeur de `finish_reason` connue ; une valeur inconnue est nommée sans glose. */
const GLOSES_FIN: Readonly<Record<string, string>> = {
  length: "sortie coupée par max_tokens",
};

function premierChoix(corps: ObjetJson): ObjetJson | null {
  const choix = corps["choices"];
  const premier: unknown = Array.isArray(choix) ? (choix as readonly unknown[])[0] : undefined;
  return estObjetJson(premier) ? premier : null;
}

/** `null` si la sortie s'est terminée normalement ; sinon la lecture illisible qui dit pourquoi. */
function fin(choix: ObjetJson): LectureTexteModele | null {
  if (!Object.hasOwn(choix, "finish_reason")) {
    return { lisible: false, raison: "corps.choices[0].finish_reason absent : la fin de la sortie n'est pas attestée." };
  }
  const valeur = choix["finish_reason"];
  if (valeur === FIN_ATTENDUE) return null;
  const glose = typeof valeur === "string" && Object.hasOwn(GLOSES_FIN, valeur) ? ` (${GLOSES_FIN[valeur]})` : "";
  return { lisible: false, raison: `corps.choices[0].finish_reason vaut ${JSON.stringify(valeur)}, attendu "${FIN_ATTENDUE}"${glose}.` };
}

/** `texteDuChat`, après avoir exigé `finish_reason` = `stop` quand `choices[0]` existe. */
export function texteDuChatTermine(contenu: Contenu): LectureTexteModele {
  const choix = contenu.forme === "objet" ? premierChoix(contenu.brut) : null;
  const arret = choix === null ? null : fin(choix);
  return arret ?? texteDuChat(contenu);
}

export function adaptateurMistralExtraction(reglages: ReglagesMistral, cle_api: string): AdaptateurExtraction {
  const { modele, construireRequete } = adaptateurMistral(reglages, cle_api);
  return { modele, construireRequete, texteDuModele: texteDuChatTermine, modeleServiPar: modeleDuCorps };
}
