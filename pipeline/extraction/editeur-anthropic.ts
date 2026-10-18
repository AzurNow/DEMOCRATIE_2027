/**
 * L'adaptateur de l'API Messages d'Anthropic, pour l'extracteur Claude Sonnet 5.5 (décision D52 (1) :
 * appel en `fetch`, sans SDK ni dépendance ; identifiant exact épinglé par l'auteur dans
 * `config/extraction.json`).
 *
 * Requête : `POST https://api.anthropic.com/v1/messages`, en-têtes `x-api-key: <clé>`,
 * `anthropic-version: 2023-06-01`, `content-type: application/json`. Corps `{model, max_tokens,
 * messages: [{role: "user", content: <prompt rendu>}], output_config: {effort}}`. Le prompt est le
 * seul message, sans `system`.
 *
 * Ce qui n'est **jamais** envoyé, et pourquoi :
 * - `temperature`, `top_p`, `top_k` : sur ce modèle, une valeur autre que celle par défaut est
 *   refusée en 400 ; il n'y a pas de graine.
 * - `thinking` : le mode adaptatif s'applique par défaut, et `{type: "disabled"}` est refusé en 400.
 * - `fallbacks`, et tout en-tête `anthropic-beta` : un repli côté serveur ferait répondre un autre
 *   modèle sous le même appel, alors que l'identifiant du modèle est la donnée mesurée (D52). Un
 *   appel qui n'aboutit pas sur le modèle demandé doit échouer, pas changer de modèle en silence.
 * `delai_abandon_ms` borne l'attente de l'appel côté appelant et n'est jamais envoyé.
 *
 * Réponse : `content` est une liste de blocs typés. Elle peut commencer par des blocs `thinking` au
 * texte vide : ils restent dans le corps brut et sont ignorés ici. Le texte du modèle est le champ
 * `text` de **l'unique** bloc `type: "text"` ; aucun bloc texte, ou plusieurs, ne donne pas de
 * texte : rien n'est choisi, rien n'est concaténé. `stop_reason` doit valoir `end_turn` ; toute
 * autre valeur (`max_tokens` : sortie coupée ; `refusal` : refus, avec `stop_details` ;
 * `pause_turn` ; absente) ne donne pas de texte, et la raison nomme la valeur reçue. Le corps reste
 * tel quel dans tous les cas (règle 7).
 *
 * Forme vérifiée le 2026-10-16 sur la documentation de l'éditeur (brief de la PR 2 du lot extraction).
 */

import { estObjetJson, type Contenu, type RequeteHttp } from "../interrogation/editeur.ts";
import type { ObjetJson } from "../interrogation/types.ts";
import { modeleDuCorps, type AdaptateurExtraction, type LectureTexteModele } from "./editeur.ts";

export const ENDPOINT_ANTHROPIC = "https://api.anthropic.com/v1/messages";
export const VERSION_API_ANTHROPIC = "2023-06-01";

/** Valeurs admises de `output_config.effort`. */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export interface ReglagesAnthropic {
  /** Identifiant exact du modèle épinglé. */
  readonly modele: string;
  readonly max_tokens: number;
  readonly effort: Effort;
  /** Délai au-delà duquel un appel sans réponse est abandonné ; jamais envoyé. */
  readonly delai_abandon_ms: number;
}

const ARRET_ATTENDU = "end_turn";
const TYPE_TEXTE = "text";

/** Ce que dit une valeur de `stop_reason` connue ; une valeur inconnue est nommée sans glose. */
const GLOSES_ARRET: Readonly<Record<string, string>> = {
  max_tokens: "sortie coupée par max_tokens",
  refusal: "refus du modèle",
  pause_turn: "tour suspendu par le serveur",
};

function illisible(raison: string): LectureTexteModele {
  return { lisible: false, raison };
}

function nature(valeur: unknown): string {
  if (valeur === undefined) return "absent";
  return valeur === null ? "null" : typeof valeur;
}

function raisonDArret(corps: ObjetJson): string {
  const valeur = corps["stop_reason"];
  const glose = typeof valeur === "string" && Object.hasOwn(GLOSES_ARRET, valeur) ? ` (${GLOSES_ARRET[valeur]})` : "";
  const details = Object.hasOwn(corps, "stop_details") ? ` ; stop_details : ${JSON.stringify(corps["stop_details"])}` : "";
  return `corps.stop_reason vaut ${JSON.stringify(valeur)}, attendu "${ARRET_ATTENDU}"${glose}${details}.`;
}

/** `null` si la sortie s'est terminée normalement ; sinon la lecture illisible qui dit pourquoi. */
function arret(corps: ObjetJson): LectureTexteModele | null {
  if (!Object.hasOwn(corps, "stop_reason")) return illisible("corps.stop_reason absent : la fin de la sortie n'est pas attestée.");
  return corps["stop_reason"] === ARRET_ATTENDU ? null : illisible(raisonDArret(corps));
}

function rangsDesBlocsTexte(blocs: readonly unknown[]): readonly number[] {
  return blocs.flatMap((bloc, rang) => (estObjetJson(bloc) && bloc["type"] === TYPE_TEXTE ? [rang] : []));
}

function texteDuBlocUnique(corps: ObjetJson): LectureTexteModele {
  if (!Object.hasOwn(corps, "content")) return illisible("corps.content absent.");
  const blocs = corps["content"];
  if (!Array.isArray(blocs)) return illisible(`corps.content n'est pas une liste (${nature(blocs)}).`);
  const liste = blocs as readonly unknown[];
  const rangs = rangsDesBlocsTexte(liste);
  const [rang] = rangs;
  if (rang === undefined) return illisible(`corps.content ne contient aucun bloc de type "${TYPE_TEXTE}" (${liste.length} bloc(s)).`);
  if (rangs.length > 1) {
    return illisible(`corps.content contient ${rangs.length} blocs de type "${TYPE_TEXTE}" : aucun n'est choisi, aucun n'est concaténé.`);
  }
  const texte = (liste[rang] as ObjetJson)["text"];
  if (typeof texte !== "string") return illisible(`corps.content[${rang}].text n'est pas un texte (${nature(texte)}).`);
  return { lisible: true, texte };
}

/** L'enveloppe de l'API Messages : `stop_reason` = `end_turn`, puis l'unique bloc `text`. */
export function texteDesMessages(contenu: Contenu): LectureTexteModele {
  if (contenu.forme === "texte") return illisible("réponse 2xx dont le corps n'est pas un objet JSON.");
  return arret(contenu.brut) ?? texteDuBlocUnique(contenu.brut);
}

export function adaptateurAnthropic(reglages: ReglagesAnthropic, cle_api: string): AdaptateurExtraction {
  if (cle_api.length === 0) throw new Error("Clé d'API Anthropic vide : aucun appel n'est construit.");
  return {
    modele: reglages.modele,
    construireRequete: (prompt: string): RequeteHttp => ({
      endpoint: ENDPOINT_ANTHROPIC,
      entetes: { "x-api-key": cle_api, "anthropic-version": VERSION_API_ANTHROPIC, "content-type": "application/json" },
      corps: {
        model: reglages.modele,
        max_tokens: reglages.max_tokens,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: reglages.effort },
      },
    }),
    texteDuModele: texteDesMessages,
    modeleServiPar: modeleDuCorps,
  };
}
