/**
 * Types du domaine de la validation humaine.
 *
 * Ils décrivent ce que l'interface manipule, pas l'intégralité de `schema/` : un item porte
 * bien plus de champs que ceux lus ici. Ce qui est absent de ce fichier est absent de
 * l'interface, et c'est voulu — la projection vers le client (projection.ts) est une liste
 * blanche, pas un filtre.
 */

/*
 * Les listes fermées qui recopient un `enum` de `schema/` portent une constante dont l'union est
 * dérivée ; `tests/enumerations-schemas.test.ts` confronte chacune à son schéma.
 */

export const TYPES_ITEM = ["P", "A", "O", "F"] as const;
export type TypeItem = (typeof TYPES_ITEM)[number];

export const DECISIONS = ["accepter", "corriger", "rejeter", "non_evaluable"] as const;
export type Decision = (typeof DECISIONS)[number];

/**
 * Motifs énumérés d'un rejet (§4, protocole 0.24, D59 (9)). « texte_extrait_errone » : le texte
 * canonique de la source est faux (OCR défaillant, transcription erronée) ; c'est ce motif qui
 * renvoie la source à la réextraction (`renvoi-reextraction.ts`). Facultatif : un rejet sans motif
 * énuméré est un rejet ordinaire.
 */
export const MOTIFS_REJET = ["texte_extrait_errone"] as const;
export type MotifRejet = (typeof MOTIFS_REJET)[number];

/**
 * Les trois catégories du kappa publié. Dérivées de la décision : c'est le devenir de l'item
 * qui compte, et distinguer « accepter » de « corriger » pénaliserait une coquille repérée par
 * un seul annotateur. « rejeté » et « non évaluable » ne fusionnent pas : l'un dit que
 * l'extraction est fausse, l'autre que le candidat est flou.
 */
export type CategorieKappa = "retenu" | "rejete" | "non_evaluable";

export const NATURES_LOT = ["entrainement", "reel", "reannotation"] as const;
export type NatureLot = (typeof NATURES_LOT)[number];

export type CleGrille =
  | "citation_fidele"
  | "paraphrase_exacte"
  | "position_univoque"
  | "theme_correct"
  | "quantification_correcte";

export type CleSpecifique =
  | "couverture_theme_verifiee"
  | "corpus_complet"
  | "confirmation_absence"
  | "changement_explicite"
  | "fictivite_verifiee"
  | "plausibilite"
  | "transcription_ecoutee";

/** `null` = sans objet pour ce type d'item. Jamais « non répondu » : voir grille.ts. */
export type Grille = Readonly<Record<CleGrille, boolean | null>>;

export type QuestionsSpecifiques = Readonly<Partial<Record<CleSpecifique, boolean>>>;

export type EtatObsolescence = "anterieur" | "posterieur";

export interface Correction {
  readonly cible: "item" | "mesure";
  readonly chemin: string;
  readonly ancienne_valeur: unknown;
  readonly nouvelle_valeur: unknown;
  readonly offsets?: {
    readonly ancien_debut: number | null;
    readonly ancien_fin: number | null;
    readonly nouveau_debut: number;
    readonly nouveau_fin: number;
  };
}

interface EntreeCommune {
  readonly id: string;
  readonly journal_version: number;
  readonly annotateur_id: string;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  readonly item_id: string;
  readonly horodatage: string;
  readonly commentaire?: string | null;
  readonly empreinte_ligne: string;
}

export interface EntreeDecision extends EntreeCommune {
  readonly type_entree: "decision";
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly item_type: TypeItem;
  readonly decision: Decision;
  /** Sur un « rejeter » seulement, et seulement quand l'annotateur l'a choisi (D59 (9)). */
  readonly motif_rejet?: MotifRejet;
  readonly reponses_grille?: Grille;
  readonly reponses_par_etat?: Readonly<Record<EtatObsolescence, Grille>>;
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly corrections: readonly Correction[];
  readonly duree_affichage_ms: number;
  readonly duree_active_ms: number;
  readonly visite: number;
}

export interface EntreeAnnulation extends EntreeCommune {
  readonly type_entree: "annulation";
  readonly annule: string;
}

export interface EntreeRetrait extends EntreeCommune {
  readonly type_entree: "retrait_item";
  readonly motif: string;
}

export type EntreeJournal = EntreeDecision | EntreeAnnulation | EntreeRetrait;

/* ------------------------------------------------------------------ items */

export interface Source {
  readonly tier: "T1" | "T2" | "T3";
  readonly url: string;
  readonly type_document: string;
  /** Protocole 0.13 (§4, n° 54) : relevé par la collecte, jamais deviné ; une citation d'un PDF porte sa page. */
  readonly format: "pdf" | "html" | "audio" | "video";
  readonly page?: number;
  readonly extrait?: { readonly debut: string; readonly fin: string };
  /** Les deux annotateurs qui ont écouté l'extrait, triés ; écrit par `pnpm promote` seulement (conformité n° 12). */
  readonly transcription_verifiee_par?: readonly string[];
  readonly transcription_verifiee_le?: string;
  readonly sha256: string;
  readonly texte_sha256?: string;
  readonly archive_url: string;
  readonly date_source: string;
  readonly date_collecte: string;
  readonly chemin_local?: string;
  readonly publication: "publique" | "interne";
}

export interface TestVerbatim {
  readonly passe: boolean;
  readonly date: string;
  readonly version_normalisation: string;
  readonly offset_debut?: number;
  readonly offset_fin?: number;
}

export interface EtatPositionnel {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  readonly quantification?: unknown;
  readonly source: Source;
  readonly test_verbatim?: TestVerbatim;
  /** Présent en staging, jamais projeté vers le client : l'annotateur travaille à l'aveugle. */
  readonly extraction?: unknown;
}

/**
 * Une revérification d'item A (`item.schema.json`, `absence.reverifications[]`) : §4, confirmée par
 * un seul annotateur (protocole 0.24, D59 (11)), d'où `confirme_par` au singulier.
 */
export interface Reverification {
  readonly run_id: string;
  readonly date: string;
  readonly resultat: "absence_confirmee" | "position_trouvee";
  readonly confirme_par: string;
}

export interface BlocAbsence {
  readonly source_couverture_theme: Source;
  readonly corpus_examine: readonly {
    readonly url: string;
    readonly sha256: string;
    readonly tier: "T1" | "T2" | "T3";
  }[];
  readonly date_examen: string;
  readonly reverifications: readonly Reverification[];
  readonly confirmation_initiale?: {
    readonly lot_id: string;
    readonly date: string;
    readonly annotateurs: readonly string[];
  };
}

export interface BlocObsolescence {
  readonly date_changement: string;
  /** Seule justification d'une `date_changement` différente de la date de la source postérieure (conformité n° 17). */
  readonly date_changement_motif?: string;
  readonly etat_anterieur: EtatPositionnel;
  readonly etat_posterieur: EtatPositionnel;
  readonly remplace_item_id?: string | null;
}

export interface Item {
  readonly id: string;
  readonly version: number;
  readonly empreinte: string;
  readonly libelle_lisible?: string;
  readonly type: TypeItem;
  readonly candidat_id: string;
  readonly mesure_id: string;
  readonly mesure_version: number;
  readonly statut_validation: string;
  readonly statut_contestation: "aucune" | "contestee" | "arbitree";
  readonly valide_du: string;
  /** Seule justification d'un `valide_du` différent de la date de la source (conformité n° 17). */
  readonly valide_du_motif?: string;
  readonly valide_au: string | null;
  readonly assertion?: EtatPositionnel;
  readonly absence?: BlocAbsence;
  readonly obsolescence?: BlocObsolescence;
  readonly validations?: readonly unknown[];
  /** Posé par `pnpm promote` quand l'item sort d'un arbitrage (§4), jamais autrement. */
  readonly arbitrage?: BlocArbitrage;
  readonly contestations?: readonly unknown[];
  readonly historique?: readonly unknown[];
}

export const ISSUES_ARBITRAGE = ["verifie", "rejete", "non_evaluable"] as const;
export type IssueDecisionArbitrage = (typeof ISSUES_ARBITRAGE)[number];

export const ARBITRES = ["auteur", "panel"] as const;
export type Arbitre = (typeof ARBITRES)[number];

/** Trace, dans l'item publié, de la décision d'arbitrage qui l'a tranché (`item.schema.json`). */
export interface BlocArbitrage {
  readonly decision_id: string;
  readonly date: string;
  readonly arbitre: Arbitre;
  readonly arbitre_seul: boolean;
  readonly motif: string;
  readonly issue: IssueDecisionArbitrage;
  readonly motivation: string;
}

export interface Mesure {
  readonly id: string;
  readonly version: number;
  readonly empreinte: string;
  readonly libelle: string;
  readonly theme: string;
  readonly formulation_canonique: string;
  /** Variantes rencontrées à l'extraction (`mesure.schema.json`). Absent ≠ liste vide. */
  readonly alias?: readonly string[];
  readonly fictive: boolean;
  readonly origine_fictive?: string;
  readonly verification_fictivite?: {
    readonly date: string;
    readonly corpus_verifies: readonly string[];
    readonly operateur: string;
    readonly resultat: string;
  };
}

/* -------------------------------------------------------------------- lots */

export interface ItemDuLot {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly candidat_id: string;
}

export interface Lot {
  readonly lot_id: string;
  readonly nature: NatureLot;
  readonly graine_maitresse: string;
  readonly algorithme_ordre: string;
  readonly date_creation: string;
  readonly annotateurs: readonly string[];
  readonly items: readonly ItemDuLot[];
  /** Lot d'origine, pour une réannotation après séance de calibration (§4). */
  readonly reannote?: string;
  /**
   * Date civile de la séance de calibration, `AAAA-MM-JJ`. Exigée pour un lot de nature
   * `reannotation` : sans elle, le kappa du lot n'est pas interprétable (§4).
   */
  readonly date_calibration?: string;
}
