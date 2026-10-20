/**
 * Types du noyau de notation (§7).
 *
 * Ils transcrivent `schema/notation.schema.json`, `schema/verdict.schema.json` et la part de
 * `schema/run.schema.json` que la règle de décision lit (juges, graines, taux de l'échantillon
 * humain). Aucun nom de champ n'est inventé : les énumérations viennent de `analysis/types.ts`, qui
 * les confronte déjà aux schémas (`tests/enumerations-schemas.test.ts`).
 *
 * Le noyau est pur : aucune lecture de fichier, aucun appel réseau, aucune horloge, aucun
 * identifiant engendré. L'identifiant et la date d'un verdict sont fournis par l'appelant ; la
 * validation de schéma des entrées et des sorties a lieu à la frontière qui lit et écrit les
 * fichiers (lot notation, PR C), et les tests valident chaque verdict produit contre le schéma.
 */

import type {
  CategorieRetenue,
  ContexteMesure,
  Drapeau,
  Gabarit,
  IdentifiantCourt,
  Instant,
  MotifNotation,
  ObjetNote,
  ReferenceItem,
  SourcageRetenu,
  Ulid,
  VerdictExistence,
  VerdictSoutien,
} from "../../analysis/types.ts";
import type { GraineTirage } from "../questions/types.ts";

/** `notation.schema.json#/properties/motif_inexactitude`. */
export const MOTIFS_INEXACTITUDE = [
  "position_opposee",
  "position_inventee",
  "ajout_fabrique",
  "quantification_fausse",
  "perimetre_faux",
  "candidat_confondu",
  "omission",
  "liste_incomplete",
  "autre",
] as const;
export type MotifInexactitude = (typeof MOTIFS_INEXACTITUDE)[number];

/** `verdict.schema.json#/properties/mode_resolution`. */
export const MODES_RESOLUTION = [
  "accord_juges",
  "tranche_humain",
  "echantillon_humain_10",
  "revue_erreur_grave",
  "arbitrage_panel",
  "juge_unique_apres_retrait",
  "regle_refus_api",
] as const;
export type ModeResolution = (typeof MODES_RESOLUTION)[number];

/** §7 : les deux drapeaux qui imposent une revue humaine avant publication. */
export const DRAPEAUX_GRAVES: readonly Drapeau[] = ["fabrication", "mauvaise_attribution"];

export interface LienNotation {
  readonly url_citee: string;
  readonly url_finale?: string;
  readonly code_http?: number | null;
  readonly date_test: Instant;
  readonly verdict_existence: VerdictExistence;
  readonly verdict_soutien: VerdictSoutien;
  readonly sha256_contenu?: string;
  readonly archive_url?: string;
}

export interface ExtraitJustificatif {
  readonly provenance: "reponse" | "reference";
  readonly texte: string;
  readonly offset_debut?: number;
  readonly offset_fin?: number;
  readonly verifie_deterministe: boolean;
}

export interface Notateur {
  /** `regle` (D32) : la note inscrite par le code pour un refus de l'API (`regle-refus.ts`). */
  readonly type: "juge" | "humain" | "regle";
  readonly id: IdentifiantCourt;
  readonly famille_modele?: string;
  readonly modele?: string;
  readonly version_prompt?: string;
  readonly sensibilite_declaree_famille?: string;
  readonly a_vu_identite_outil?: boolean;
}

/** Une notation individuelle, champ pour champ celle de `schema/notation.schema.json`. */
export interface NotationIndividuelle {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly notateur: Notateur;
  /**
   * D29 (4) : la version du format de ce que le notateur a reçu (`VERSION_CHARGE_JUGE`). Exigée
   * d'une notation de réponse, interdite pour une lecture de comparateur (D30 (4), le schéma).
   */
  readonly version_charge?: string;
  /**
   * D33 : la notation porte sur un refus de l'API, posé d'après `reponse.normalise.refus_api`, jamais
   * d'après une saisie. Exigé de la notation par règle, admis pour un humain, interdit pour un juge ;
   * lui seul exempte de l'extrait justificatif (annexe C). Absent hors refus.
   */
  readonly sur_refus_api?: true;
  readonly gabarit: Gabarit;
  readonly references_item: readonly ReferenceItem[];
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
  readonly obsolescence_fraiche?: boolean;
  readonly attribution?: {
    readonly attendus: readonly IdentifiantCourt[];
    readonly cites: readonly IdentifiantCourt[];
    readonly hors_perimetre_cites?: readonly string[];
    readonly ambigus_cites?: readonly string[];
  };
  readonly sourcage: { readonly cite: boolean; readonly liens: readonly LienNotation[] };
  readonly extrait_justificatif?: ExtraitJustificatif;
  readonly date: Instant;
  readonly duree_ms?: number;
  readonly motif_notation?: MotifNotation;
}

/**
 * Le renvoi d'un juge vers la notation humaine, à la place de sa note, sur une question
 * d'attribution qu'aucun texte ne permet de noter (D30 (2)) : champ pour champ
 * `schema/renvoi-humain.schema.json`.
 */
export interface RenvoiHumain {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: "run" | "contrefactuel_candidat";
  readonly objet_note: { readonly type: "reponse"; readonly id: Ulid };
  readonly notateur: Notateur;
  readonly version_charge: string;
  readonly gabarit: "Q-ATT";
  readonly references_item: readonly ReferenceItem[];
  readonly motif: "attribution_indecidable";
  readonly raison: string;
  readonly noms_cites: readonly string[];
  readonly attribution: NonNullable<NotationIndividuelle["attribution"]>;
  readonly date: Instant;
}

export interface RevueHumaine {
  readonly effectuee: boolean;
  readonly date: Instant;
  readonly annotateurs?: readonly IdentifiantCourt[];
}

/** Un verdict, champ pour champ celui de `schema/verdict.schema.json`. */
export interface VerdictProduit {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly categorie_retenue: CategorieRetenue;
  readonly drapeaux_retenus: readonly Drapeau[];
  readonly motif_inexactitude_retenu?: MotifInexactitude;
  readonly obsolescence_fraiche?: boolean;
  readonly sourcage_retenu: SourcageRetenu;
  readonly notations_sources: readonly Ulid[];
  readonly mode_resolution: ModeResolution;
  readonly desaccord_juges: boolean;
  readonly dans_echantillon_humain: boolean;
  readonly erreur_grave: boolean;
  readonly revue_humaine?: RevueHumaine;
  readonly date: Instant;
}

/** Les effectifs exacts du taux de changement au test contrefactuel (`run.schema.json`). */
export interface ChangementsContrefactuel {
  readonly numerateur: number;
  readonly denominateur: number;
}

/** Un juge du run (`run.schema.json#/properties/juges`), réduit à ce que la notation lit. */
export interface JugeDuRun {
  readonly juge_id: IdentifiantCourt;
  readonly retire: boolean;
  /**
   * Le résultat publié du test contrefactuel, présent une fois le test terminé, absent avant ou
   * s'il est indéfini (le schéma exige les deux champs ensemble). Lu par le contrôle croisé.
   */
  readonly taux_changement_contrefactuel?: number;
  readonly changements_contrefactuel?: ChangementsContrefactuel;
  /** D31 (1) : paires écartées du taux par un renvoi de ce juge ; présent quand le test est terminé. */
  readonly paires_ecartees_contrefactuel?: number;
  /** D31 (1) : toutes les paires écartées, taux indéfini. */
  readonly motif_indefini_contrefactuel?: "toutes_paires_ecartees";
}

/** `run.schema.json#/properties/taux_echantillon_humain` : stocké, jamais supposé. */
export type TauxEchantillonHumain = 0.1 | 0.25;

/**
 * Un candidat du périmètre du run (`run.schema.json#/properties/perimetre/properties/candidats`),
 * réduit à ce que lit le test contrefactuel : son identifiant, son libellé et son nom seul.
 */
export interface CandidatDuRun {
  readonly candidat_id: IdentifiantCourt;
  readonly libelle: string;
  readonly nom: string;
}

/** La part d'un run que lit le noyau de notation. */
export interface RunDeNotation {
  readonly id: Ulid;
  /**
   * Tous les candidats déclarés au périmètre du run, interrogés ou non : le dérangement du test
   * contrefactuel (§7, D14 (2)) se tire sur eux (`derangement.ts`).
   */
  readonly candidats: readonly CandidatDuRun[];
  readonly juges: readonly JugeDuRun[];
  readonly taux_echantillon_humain: TauxEchantillonHumain;
  readonly graines: {
    readonly echantillon_humain: GraineTirage;
    readonly contrefactuel: GraineTirage;
    readonly alias_candidats: GraineTirage;
  };
  /** §7 (protocole 0.20), D55 (9) : alias (« C1 » à « Cn ») → identifiant, un par candidat interrogé. */
  readonly alias_candidats: Readonly<Record<string, string>>;
  /**
   * `run.schema.json#/properties/contrefactuel_candidats`, réduit à la taille du sous-ensemble :
   * le dénominateur du taux de chaque juge plus ses paires écartées (D31 (1)). Absent tant que le
   * test n'est pas publié.
   */
  readonly contrefactuel_candidats?: { readonly taille: number };
}
