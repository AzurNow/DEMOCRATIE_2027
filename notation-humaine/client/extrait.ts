/**
 * D33 : sur un refus de l'API, l'extrait justificatif n'est pas demandé. Un refus n'a ni texte ni
 * lien, et sur un item A ou F aucune citation n'est à recopier ; le serveur pose le marqueur
 * `sur_refus_api` d'après la réponse (jamais d'après la saisie), et le schéma exempte alors de
 * l'annexe C. Annexe C (protocole 0.27) : il en va de même d'une réponse au texte vide, qui n'a rien
 * à citer ; le serveur pose alors `sur_texte_vide`. « Vide » est la chaîne vide exacte, comme dans
 * `pipeline/notation/extrait.ts:reponseAuTexteVide`, qui fait foi : ce client autonome n'importe rien
 * du dépôt, et `tests/notation-humaine/extrait-refus.test.ts` aligne les deux. Partout ailleurs,
 * l'extrait reste demandé pour toute note autre qu'exacte.
 */

import type { Vue } from "./types.ts";

export function extraitDemande(vue: Pick<Vue, "reponse">): boolean {
  return !vue.reponse.refus_api && vue.reponse.texte !== "";
}
