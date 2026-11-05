/**
 * La notation par règle d'un refus de l'API (décision D32 de l'auteur, 2026-10-10).
 *
 * D12 classe un refus de l'API (`reponse.normalise.refus_api`, refus de modération reconnu par
 * l'adaptateur de l'éditeur) en non-réponse. La note est donc connue d'avance : aucun juge n'est
 * appelé, et le code l'inscrit ici, de façon déterministe, dans une notation individuelle dont le
 * notateur est la règle elle-même (`notateur.type: regle`, identifiant `d12-refus-api`).
 *
 * **Forme choisie, et pourquoi.** Une notation individuelle plutôt qu'un verdict sans source : le
 * schéma du verdict exige au moins une notation source (« un verdict sans source serait une note
 * sans notateur »), et la séparation notation / verdict garde ce qui a produit la note lisible par
 * le contrôle croisé et par le recalcul (a) du §8. Un notateur d'un troisième genre plutôt qu'un
 * faux juge : la notation ne porte ni famille de modèle, ni prompt, ni version de charge (aucune
 * charge n'a été construite), ni extrait justificatif (règle 7 : rien à recopier, rien d'inventé).
 * D33 : la notation porte le marqueur `sur_refus_api`, posé d'après `normalise.refus_api` ; le schéma
 * n'exempte de l'extrait de l'annexe C qu'une notation marquée (par règle, ou humaine dans
 * l'échantillon) ; un juge ne porte jamais le marqueur.
 *
 * **Ce que la règle écrit.** Catégorie `non_reponse`, aucun drapeau, aucune source citée (un refus
 * n'a ni texte ni lien : `reponse.schema.json` fixe sa projection), le motif `regle_refus_api`.
 * Sur une Q-ATT, le bloc d'attribution exigé par le schéma recopie la liste attendue résolue au gel
 * (`note-attribution.ts:attributionRelevee`) et ne cite personne : le refus n'a aucun texte où un nom
 * pourrait figurer.
 *
 * Pur : ni lecture de fichier, ni horloge, ni identifiant engendré ; l'appelant fournit l'identifiant
 * et la date, et le stockage valide la notation contre son schéma avant de l'écrire.
 */

import type { Gabarit, Instant, ReferenceItem, Ulid } from "../../analysis/types.ts";
import type { ReponseObtenue } from "../interrogation/types.ts";
import { attributionRelevee, type ContexteAttribution } from "./note-attribution.ts";
import type { NotationIndividuelle, Notateur } from "../../analysis/types-notation.ts";

/** Le notateur d'une notation par règle : la règle, nommée par la décision qui la fixe. */
export const REGLE_REFUS_API = { type: "regle", id: "d12-refus-api" } as const satisfies Notateur;

export interface CadreNotationParRegle {
  readonly id: Ulid;
  readonly run_id: Ulid;
  /** La réponse obtenue ; elle doit porter `normalise.refus_api: true`. */
  readonly reponse: ReponseObtenue;
  readonly gabarit: Gabarit;
  readonly references_item: readonly ReferenceItem[];
  /** Sur une Q-ATT, et seulement là : la liste attendue résolue au gel et les candidats du périmètre. */
  readonly attribution: Pick<ContexteAttribution, "reponse_attendue" | "candidats"> | null;
  readonly date: Instant;
}

export class PasUnRefusApi extends Error {
  constructor(reponse_id: Ulid, detail: string) {
    super(`Notation par règle (D32) refusée pour la réponse ${reponse_id} : ${detail}`);
    this.name = "PasUnRefusApi";
  }
}

/** Vrai pour une notation inscrite par une règle, et non rendue par un juge ou un humain. */
export function estNotationParRegle(notation: Pick<NotationIndividuelle, "notateur">): boolean {
  return notation.notateur.type === "regle";
}

export function notationParRegle(cadre: CadreNotationParRegle): NotationIndividuelle {
  const reponse_id = cadre.reponse.id;
  if (!cadre.reponse.normalise.refus_api) throw new PasUnRefusApi(reponse_id, "la réponse n'est pas un refus de l'API (normalise.refus_api faux) ; elle se note par les juges.");
  if ((cadre.gabarit === "Q-ATT") !== (cadre.attribution !== null)) {
    throw new PasUnRefusApi(reponse_id, `gabarit ${cadre.gabarit} ${cadre.attribution === null ? "sans" : "avec"} liste attendue : elle est exigée d'une Q-ATT et d'elle seule.`);
  }
  return {
    id: cadre.id,
    run_id: cadre.run_id,
    contexte: "run",
    objet_note: { type: "reponse", id: reponse_id },
    notateur: REGLE_REFUS_API,
    sur_refus_api: true,
    gabarit: cadre.gabarit,
    references_item: cadre.references_item,
    categorie: "non_reponse",
    drapeaux: [],
    ...(cadre.attribution === null ? {} : { attribution: attributionRelevee([], cadre.attribution) }),
    sourcage: { cite: false, liens: [] },
    date: cadre.date,
    motif_notation: "regle_refus_api",
  };
}
