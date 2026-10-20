/**
 * Types du lot « questions, tirage, symétrie ».
 *
 * Ils transcrivent `schema/question.schema.json`, `schema/tirage.schema.json` et l'objet
 * `symetrie` de `schema/run.schema.json`. Aucun nom de champ n'est inventé ici : ce qui n'a
 * pas de domicile dans un schéma n'existe pas dans ces types.
 *
 * L'item et la mesure sont importés de `validation/domaine/types.ts` plutôt que redéclarés :
 * deux définitions du même objet divergeraient, et c'est exactement le genre de divergence
 * silencieuse que le projet prétend mesurer chez les autres.
 */

import type {
  BlocObsolescence,
  EtatPositionnel,
  Item,
  Mesure,
  TypeItem,
} from "../../validation/domaine/types.ts";

/*
 * Chaque liste fermée de ce fichier recopie un `enum` de `schema/` ; son union est dérivée de la
 * constante, et `tests/enumerations-schemas.test.ts` confronte la constante au schéma.
 */

export type { BlocObsolescence, EtatPositionnel, Item, Mesure, TypeItem };

/** Les dix thèmes du §3. Une position hors de cette liste n'entre pas dans le tirage. */
export const THEMES = [
  "fiscalite_pouvoir_achat",
  "retraites",
  "travail_emploi",
  "sante",
  "education",
  "securite_justice",
  "immigration",
  "ecologie_energie",
  "institutions_democratie",
  "europe_defense_international",
] as const;

export type Theme = (typeof THEMES)[number];

export function estTheme(valeur: string): valeur is Theme {
  return (THEMES as readonly string[]).includes(valeur);
}

/** Annexe B. */
export const CODES_GABARIT = ["Q-DIR", "Q-FER", "Q-ATT", "Q-NEG", "Q-ORI", "Q-ACT"] as const;
export type CodeGabarit = (typeof CODES_GABARIT)[number];

/** §5 : trois formulations par question, exactement. */
export const REGISTRES = ["neutre", "familier", "oriente"] as const;
export type Registre = (typeof REGISTRES)[number];

export const POSITIONS = ["pour", "contre", "conditionnel", "sans_objet"] as const;
export type Position = (typeof POSITIONS)[number];

export const ROLES_ITEM = ["principal", "attendu_dans_liste", "distracteur", "contexte"] as const;
export type RoleItem = (typeof ROLES_ITEM)[number];

export const STATUTS_VALIDATION = [
  "en_attente",
  "a_confirmer",
  "verifie",
  "rejete",
  "non_evaluable",
  "retire_par_panel",
] as const;

export type StatutValidation = (typeof STATUTS_VALIDATION)[number];

export function estStatutValidation(valeur: string): valeur is StatutValidation {
  return (STATUTS_VALIDATION as readonly string[]).includes(valeur);
}

export const STATUTS_CONTESTATION = ["aucune", "contestee", "arbitree"] as const;
export type StatutContestation = (typeof STATUTS_CONTESTATION)[number];

/**
 * La dernière décision du panel d'un item arbitré, figée au gel dans le tirage : la symétrie d'un
 * tirage publié se juge sur elle, jamais sur l'état courant des items.
 */
export interface DecisionPanelAuGel {
  readonly decision: string;
  /** `contestations[].decision_panel.date`, instant horodaté avec décalage. */
  readonly date: string;
}

export interface ReferenceItem {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
}

export interface ItemDeQuestion {
  readonly reference: ReferenceItem;
  readonly role: RoleItem;
}

/* ------------------------------------------------------------- engendrement */

/**
 * Sortie de l'engendrement : tout ce qu'un gabarit produit mécaniquement, et rien de plus.
 *
 * Ce n'est PAS encore un objet `question` conforme au schéma, qui exige trois formulations.
 * Les formulations familière et orientée sont « produites par un modèle puis relues par un
 * annotateur » (§5) : elles supposent un prompt versionné et un appel d'API, hors de ce lot.
 * Le champ `theme` n'existe pas non plus sur l'objet `question` — il est porté par la mesure —
 * mais le tirage en a besoin comme strate, et le recalculer deux fois le ferait diverger.
 */
export interface QuestionEngendree {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  /** Absent pour Q-ATT : §5 interdit de nommer un candidat dans une question d'attribution. */
  readonly candidat_id?: string;
  readonly items: readonly ItemDeQuestion[];
  /** L'item principal ; la mesure pour une question d'attribution (§5 et §8, protocole 0.9). */
  readonly grappe_id: string;
  readonly theme: Theme;
  readonly texte_neutre: string;
  readonly version_gabarits: string;
}

/* ------------------------------------------------------------------ question */

/** Production de la formulation neutre : la version de la table de gabarits qui l'a écrite (D42 (2)). */
export interface ProductionGabarit {
  readonly gabarits: string;
}

/** Production d'une formulation familière ou orientée : le modèle et la version du prompt (§5, règle 6). */
export interface ProductionModele {
  readonly modele: string;
  readonly version_prompt: string;
}

export interface Formulation {
  readonly id: string;
  readonly registre: Registre;
  readonly texte: string;
  readonly empreinte_texte: string;
  /**
   * §5 (protocole 0.11) : sur la seule formulation orientée, la position que sa prémisse affirme,
   * notée par le relecteur. Exigée sur un item O ; la vérité de la prémisse se résout au gel, dans
   * le tirage (`EntreeTirage.premisse_fausse`), jamais sur la question.
   */
  readonly position_affirmee?: Position;
  /**
   * Décision D42 (2) : `ProductionGabarit` sur la formulation neutre, écrite par le gabarit ;
   * `ProductionModele` sur la familière et l'orientée. Le schéma lie la forme au registre.
   */
  readonly production: ProductionGabarit | ProductionModele;
  readonly relecture: {
    readonly annotateur_id: string;
    readonly date: string;
    readonly sens_preserve: boolean;
    readonly commentaire?: string;
  };
}

/** Objet `question` complet, conforme à `schema/question.schema.json`. */
export interface Question {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly candidat_id?: string;
  readonly items: readonly ItemDeQuestion[];
  readonly grappe_id: string;
  readonly formulations: readonly Formulation[];
  readonly engendree_le: string;
  readonly version_gabarits?: string;
}

/* -------------------------------------------------------------------- tirage */

export const NATURES_REPONSE = [
  "position",
  "absence_de_position",
  "oui",
  "non",
  "liste_candidats",
  "aucun_candidat",
  "changement_de_position",
  "position_anterieure",
  "non_avec_correction",
] as const;
export type NatureReponse = (typeof NATURES_REPONSE)[number];

export interface ResolutionTemporelle {
  readonly date_gel: string;
  readonly date_changement?: string;
  readonly regle: "semi_ouvert";
}

export interface ReponseAttendue {
  readonly nature: NatureReponse;
  readonly position?: Position;
  readonly etat_attendu?: "anterieur" | "posterieur";
  readonly candidats_attendus?: readonly string[];
  readonly resolution_temporelle: ResolutionTemporelle;
}

export interface ItemAuGel {
  readonly reference: ReferenceItem;
  readonly role: RoleItem;
  readonly statut_validation_au_gel: StatutValidation;
  readonly statut_contestation_au_gel: StatutContestation;
  /** Présente si et seulement si `statut_contestation_au_gel` vaut « arbitree ». */
  readonly decision_panel_au_gel?: DecisionPanelAuGel;
}

export interface EntreeTirage {
  readonly question_id: string;
  readonly candidat_id?: string;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
  readonly grappe_id: string;
  readonly items_au_gel: readonly ItemAuGel[];
  readonly reponse_attendue: ReponseAttendue;
  /**
   * §5 (protocole 0.11) : la prémisse de la formulation orientée est-elle fausse à l'instant du
   * gel ? Résolue comme `reponse_attendue` (`premisseFausseAuGel`), une fois, ici.
   */
  readonly premisse_fausse: boolean;
  readonly reprise: boolean;
  readonly run_origine_id?: string;
  readonly empreinte_texte_precedente?: string;
}

export interface GraineTirage {
  readonly valeur: number;
  readonly algorithme: string;
  readonly bibliotheque: string;
  readonly version: string;
}

/**
 * §5 (protocole 0.9) : pourquoi une question n'entre pas au tirage alors que ses items sont
 * vérifiés. `hors_validite` : la fenêtre de validité d'un item ne contient pas l'instant du gel ;
 * `reponse_attendue_indecidable` : la réponse attendue n'est pas définie au gel (« sans objet » sur
 * un gabarit fermé, négatif ou orienté ; liste d'attribution non définie). Décisions de l'auteur du
 * 2026-09-29 (conformité n° 2 et 3) : `attribution_contestee` : l'item vérifié d'un candidat
 * interrogé sur la mesure d'une question d'attribution est contesté au gel ;
 * `mesure_version_depassee` : un item définissant de la question épingle une version de sa mesure qui
 * n'est plus la version courante.
 */
export const MOTIFS_EXCLUSION = [
  "hors_validite",
  "reponse_attendue_indecidable",
  "attribution_contestee",
  "mesure_version_depassee",
] as const;
export type MotifExclusion = (typeof MOTIFS_EXCLUSION)[number];

/** Une question écartée avant le tirage, « comptée à part dans le rapport du run » (§5). */
export interface ExclusionTirage {
  readonly question_id: string;
  readonly candidat_id?: string;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
  readonly motif: MotifExclusion;
  /** Le message de l'erreur de résolution, tel quel. */
  readonly detail: string;
}

/**
 * §5 (protocole 0.9) : par candidat, et pour les questions d'attribution sur l'ensemble des thèmes
 * (`candidat_id` absent), le budget de reprise et son dépassement.
 */
export interface BilanReprise {
  readonly candidat_id?: string;
  /** Questions tirées dans le groupe, compensations comprises. */
  readonly cible: number;
  readonly budget_reprise: number;
  readonly reprises: number;
  /** Reprises au-delà du budget, venues compléter une strate sans question neuve. */
  readonly depassement: number;
}

/** §5 (protocole 0.9) : une question tirée dans un autre thème pour combler une strate déficitaire. */
export interface CompensationTirage {
  readonly candidat_id: string;
  readonly gabarit: CodeGabarit;
  readonly theme_deficitaire: Theme;
  readonly question_id: string;
  readonly theme_origine: Theme;
}

/**
 * §5 : les deux quotas du tirage, sans valeur par défaut. Conformité n° 59 : inscrits dans le tirage
 * publié (`tirage.parametres`), pour que le fichier de tirage suffise à rejouer.
 */
export interface ParametresTirage {
  /** Nombre de questions tirées dans chaque strate candidat × thème × gabarit. */
  readonly questions_par_strate: number;
  /** §5 (protocole 0.9) : nombre de questions d'attribution tirées par thème. */
  readonly questions_attribution_par_theme: number;
}

/**
 * Décision de l'auteur du 2026-09-29, n° 8 : pour un candidat interrogé, les items P vérifiés que
 * leur contestation tient hors du tirage au gel (`couverture.ts:itemsPContestesAuGel`), triés.
 * Vide quand il n'y en a aucun : l'absence est publiée, jamais déduite.
 */
export interface ContestesAuGel {
  readonly candidat_id: string;
  readonly item_ids: readonly string[];
}

export interface Tirage {
  readonly run_id: string;
  readonly date_gel: string;
  readonly graine_tirage: GraineTirage;
  readonly parametres: ParametresTirage;
  readonly entrees: readonly EntreeTirage[];
  readonly exclusions: readonly ExclusionTirage[];
  /** Une entrée par candidat interrogé, triée par `candidat_id` (décision n° 8 du 2026-09-29). */
  readonly contestes_au_gel: readonly ContestesAuGel[];
  readonly bilan_reprise: readonly BilanReprise[];
  readonly compensations: readonly CompensationTirage[];
}

/* ----------------------------------------------------------------------- run */

/** `schema/perimetre.schema.json#/$defs/candidat/properties/statut_au_gel`, recopiée une seule fois ici. */
export const STATUTS_AU_GEL = ["actif", "nouveau", "retire"] as const;
export type StatutAuGel = (typeof STATUTS_AU_GEL)[number];

/**
 * §3 (protocole 0.11) : chaque run déclare son régime d'inclusion.
 * `schema/perimetre.schema.json#/properties/regime_inclusion` et
 * `schema/run.schema.json#/properties/perimetre/properties/regime_inclusion`.
 */
export const REGIMES_INCLUSION = ["avant_liste_officielle", "liste_officielle"] as const;
export type RegimeInclusion = (typeof REGIMES_INCLUSION)[number];

/**
 * Le nom d'un candidat, saisi par l'auteur dans le périmètre du run : `libelle` (prénom et nom tels
 * qu'affichés) remplit `[candidat]` dans les gabarits qui le nomment, et la barrière « aucun nom de
 * candidat dans les Q-ATT » (§5, protocole 0.6) cherche `libelle` ET `nom`. Deux champs saisis,
 * jamais l'un dérivé de l'autre.
 */
export interface CandidatNomme {
  readonly candidat_id: string;
  readonly libelle: string;
  readonly nom: string;
}

export interface CandidatAuGel extends CandidatNomme {
  readonly statut_au_gel: StatutAuGel;
  readonly items_p_verifies: number;
  readonly sous_seuil: boolean;
  readonly interroge: boolean;
}

/** La part du run que ce lot lit. Le run complet porte bien d'autres champs. */
export interface RunAuGel {
  readonly id: string;
  readonly date_gel: string;
  readonly perimetre: { readonly candidats: readonly CandidatAuGel[] };
}

/* ------------------------------------------------------------------ symétrie */

export const CODES_CONDITION = [
  "nombre_questions_par_candidat",
  "repartition_gabarits_formulations",
  "repartition_themes",
  "aucun_item_conteste_ou_en_attente",
  "aucun_nom_candidat_dans_q_att",
  "part_items_a_f_minimale",
  "quota_par_strate_respecte",
] as const;

export type CodeCondition = (typeof CODES_CONDITION)[number];

export const STATUTS_SYMETRIE = ["vert", "ecart_tolere", "rouge"] as const;
export type StatutSymetrie = (typeof STATUTS_SYMETRIE)[number];

export interface DetailCandidat {
  readonly candidat_id: string;
  readonly valeur: number;
}

export interface ConditionSymetrie {
  readonly code: CodeCondition;
  readonly statut: StatutSymetrie;
  readonly mesure?: number;
  readonly seuil?: number;
  readonly detail_par_candidat?: readonly DetailCandidat[];
  readonly commentaire?: string;
}

export interface Symetrie {
  readonly statut_global: StatutSymetrie;
  readonly conditions: readonly ConditionSymetrie[];
}
