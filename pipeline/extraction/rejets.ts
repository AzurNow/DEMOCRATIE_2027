/**
 * Journal des rejets d'une extraction : tout ce qui a été écarté, avec sa portée, son modèle, son
 * index dans la sortie brute et son motif. Rien n'est écarté en silence.
 *
 * Quatre portées :
 *
 * | Portée | Ce qui est écarté | Motifs |
 * | --- | --- | --- |
 * | `sortie` | la sortie entière d'un modèle, jamais réparée | `lecture_illisible`, `modele_different`, `bloc_de_code`, `json_invalide`, `cle_dupliquee`, `non_conforme` |
 * | `item` | un item d'une sortie conforme, avant l'appariement | `candidat_different`, `saut_de_page`, `citation_vide`, `introuvable`, `citation_ambigue`, `citation_sans_page_unique` |
 * | `depot` | un item retenu qu'un item de staging ne peut pas porter | `etat_o_sans_etat_anterieur` |
 * | `source` | la source entière : rien n'est déposé | `extraction_double_incomplete` |
 *
 * `lecture_illisible` : la réponse ne donne aucun texte du modèle (statut hors 2xx, sortie coupée,
 * refus, enveloppe inattendue) ; `detail` porte la raison reçue, telle quelle. `modele_different` :
 * le `model` que l'enveloppe dit avoir servi n'est pas celui que l'item inscrit comme épinglé
 * (constat 17 de la revue du 2026-10-17, D54 (7)) ; la réponse est gardée telle quelle (règle 7),
 * mais refusée comme une sortie illisible, puisqu'elle ne peut pas être celle du modèle mesuré. Les
 * quatre autres motifs de portée `sortie` sont ceux de `lecture-sortie.ts:lireSortie`, qui ne lit
 * que du texte et ne peut donc produire ni `lecture_illisible` ni `modele_different`.
 *
 * L'index est le rang de l'item dans la sortie brute, telle que reçue : il suit donc, par
 * construction, l'ordre que le modèle a choisi.
 *
 * Ce journal est une valeur rendue par le cœur ; son écriture dans `staging/` et son contrat de
 * fichier relèvent de la PR qui branchera les entrées-sorties.
 */

import type { MotifRejetCitation } from "./localisation.ts";
import type { MotifRejetSortie } from "./lecture-sortie.ts";
import type { Accord } from "./types.ts";

/** Motifs de portée `sortie` : ceux de `lireSortie`, plus l'absence de texte lisible et le modèle différent, décidés en amont. */
export type MotifRejetSortieEntiere = MotifRejetSortie | "lecture_illisible" | "modele_different";

export type MotifRejetItem = "candidat_different" | MotifRejetCitation;

export interface RejetSortie {
  readonly portee: "sortie";
  readonly modele: string;
  readonly motif: MotifRejetSortieEntiere;
  readonly detail: string;
}

export interface RejetItem {
  readonly portee: "item";
  readonly modele: string;
  readonly index: number;
  readonly motif: MotifRejetItem;
  readonly detail: string;
}

export interface RejetDepot {
  readonly portee: "depot";
  readonly modele: string;
  readonly index: number;
  readonly motif: "etat_o_sans_etat_anterieur";
  readonly accord: Accord;
  readonly detail: string;
}

export interface RejetSource {
  readonly portee: "source";
  readonly motif: "extraction_double_incomplete";
  readonly detail: string;
}

export type Rejet = RejetSortie | RejetItem | RejetDepot | RejetSource;
