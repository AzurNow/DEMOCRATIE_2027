/**
 * Un dépôt de testeur devient une réponse du canal application (§6, QR8 ; protocole 0.31, D73 (12)).
 *
 * §6 : « La réponse brute est le texte que copie le bouton de copie de l'application, stocké tel
 * quel […]. La réponse notée d'une saisie est ce texte copié ; ses liens sont les adresses http ou
 * https qui figurent dans ce texte ; elle ne porte ni mode ni caractère tronqué, et le recalcul (d)
 * de la section 8, qui exclut les réponses tronquées, ne porte que sur le canal API. »
 *
 * La conversion, et rien d'autre :
 *
 * - le dépôt est validé contre `depot-application` (frontière d'entrée), et une capture masquée
 *   identique à l'origine est refusée (`depot-application.ts:exigerMasquagesReels`) ;
 * - `brut_texte` et `normalise.texte` sont le texte copié, octet pour octet (règle 7) : ni
 *   normalisation Unicode, ni espaces retirées ; un texte vide reste une réponse **obtenue** au
 *   texte vide, jamais une manquante ;
 * - `normalise.liens` : `liens-du-texte.ts:liensDuTexte`, dont la règle est versionnée dans
 *   `normalisation.version` ;
 * - `mode` et `normalise.troncature` sont absents, jamais mis à une valeur par défaut ; le schéma
 *   `reponse` les interdit sur ce canal ;
 * - `normalise.refus_api` est faux : il ne vaut vrai que pour un refus de modération opposé par
 *   l'API (statut HTTP et code d'erreur), et aucune API n'est appelée ici ;
 * - ni `metadonnees`, ni `requete`, ni `brut_octets_sha256` : ce sont des grandeurs d'un appel HTTP
 *   que la saisie n'a pas ; l'instant de la saisie est `saisie_manuelle.horodatage_saisie` ;
 * - `alias_aveugle` n'est pas posé : il est attribué par run et par outil, hors de ce module ;
 * - la réponse est validée contre `reponse` (frontière de sortie).
 *
 * Ce module ne contrôle pas l'appartenance du dépôt au sous-échantillon du run : c'est
 * `depot-application.ts:bilanDesDepots`. L'identifiant de la réponse est donné par l'appelant.
 */

import { valider } from "../../outils/schemas/valider.ts";
import { exigerMasquagesReels, type CaptureDepot, type DepotApplication } from "./depot-application.ts";
import { liensDuTexte, REGLE_LIENS_DU_TEXTE } from "./liens-du-texte.ts";

/** `reponse.normalisation` d'une saisie : la version suit la règle d'extraction des liens. */
export const NORMALISATION_DEPOT = { fonction: "reponse_depuis_depot", version: REGLE_LIENS_DU_TEXTE } as const;

/** `schema/reponse.schema.json`, restreint à ce que produit une saisie. */
export interface ReponseApplication {
  readonly id: string;
  readonly run_id: string;
  readonly contexte: "run";
  readonly canal: "application";
  readonly outil_id: string;
  readonly question_id: string;
  readonly formulation_id: string;
  readonly echantillon: 1;
  readonly statut_reponse: "obtenue";
  readonly brut_texte: string;
  readonly normalise: { readonly texte: string; readonly liens: readonly string[]; readonly refus_api: false };
  readonly normalisation: typeof NORMALISATION_DEPOT;
  readonly saisie_manuelle: {
    readonly testeur_id: string;
    readonly horodatage_saisie: string;
    readonly compte_dedie: boolean;
    readonly captures: readonly CaptureDepot[];
  };
}

export function reponseDepuisDepot(brut: unknown, id: string): ReponseApplication {
  const depot = valider<DepotApplication>("depot-application", brut, "dépôt de l'application");
  exigerMasquagesReels(depot);
  const reponse: ReponseApplication = {
    id,
    run_id: depot.run_id,
    contexte: "run",
    canal: "application",
    outil_id: depot.outil_id,
    question_id: depot.question_id,
    formulation_id: depot.formulation_id,
    echantillon: depot.echantillon,
    statut_reponse: "obtenue",
    brut_texte: depot.texte_copie,
    normalise: { texte: depot.texte_copie, liens: liensDuTexte(depot.texte_copie), refus_api: false },
    normalisation: NORMALISATION_DEPOT,
    saisie_manuelle: {
      testeur_id: depot.testeur_id,
      horodatage_saisie: depot.horodatage_saisie,
      compte_dedie: depot.compte === "dedie",
      captures: depot.captures.map(captureDeLaReponse),
    },
  };
  return valider<ReponseApplication>("reponse", reponse, `réponse ${id} issue du dépôt de ${depot.testeur_id}`);
}

/** Copie champ par champ : l'empreinte masquée n'existe que si la capture a été masquée. */
function captureDeLaReponse(capture: CaptureDepot): CaptureDepot {
  return {
    sha256: capture.sha256,
    ...(capture.sha256_masquee === undefined ? {} : { sha256_masquee: capture.sha256_masquee }),
    chemin_local: capture.chemin_local,
  };
}
