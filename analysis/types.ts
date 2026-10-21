/**
 * Types d'entrée des analyses préenregistrées (§8), et les deux types de sortie communs.
 *
 * Ces types sont la projection des schémas de `schema/` sur ce dont la mesure a besoin : les
 * noms de champs et les énumérations en viennent tels quels, jamais renommés ni complétés. Ce
 * qui manque ici manque à l'analyse, et c'est voulu — une réponse porte bien plus de champs que
 * ceux lus par une métrique (même principe que `validation/domaine/types.ts`).
 *
 * Ces types ne valident rien par eux-mêmes : la frontière d'entrée est `lecture-run.ts`, qui valide
 * chaque fichier d'un run contre son schéma (`outils/schemas/valider.ts`) avant de le rendre sous
 * ces types.
 */

export type Ulid = string;
export type IdentifiantCourt = string;
export type Instant = string;
export type EmpreinteSha256 = string;

/**
 * §8, garde-fou structurel : seul `run` alimente les métriques. Les autres contextes existent
 * dans les données (pilote, jeu d'or, réponses permutées du test contrefactuel du §7).
 */
/*
 * Chaque liste fermée ci-dessous recopie un `enum` de `schema/` ; son union est dérivée de la
 * constante, et `tests/enumerations-schemas.test.ts` confronte la constante au schéma.
 */

export const CONTEXTES_MESURE = [
  "run",
  "pilote",
  "jeu_or",
  "contrefactuel_candidat",
  "contrefactuel_outil",
] as const;
export type ContexteMesure = (typeof CONTEXTES_MESURE)[number];

export const TYPES_ITEM = ["P", "A", "O", "F"] as const;
export type TypeItem = (typeof TYPES_ITEM)[number];

export const CODES_GABARIT = ["Q-DIR", "Q-FER", "Q-ATT", "Q-NEG", "Q-ORI", "Q-ACT"] as const;
export type Gabarit = (typeof CODES_GABARIT)[number];

export const REGISTRES = ["neutre", "familier", "oriente"] as const;
export type Registre = (typeof REGISTRES)[number];

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

export const MODES = ["web_activee", "web_desactivee"] as const;
export type Mode = (typeof MODES)[number];

export const CANAUX = ["api", "application"] as const;
export type Canal = (typeof CANAUX)[number];

/**
 * §8 (protocole 0.11) : l'unité du seuil de réponses manquantes et de la famille de Holm du test
 * d'asymétrie. Un couple n'existe que sur le canal API, le seul qui porte un mode (§6).
 */
export interface CoupleOutilMode {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
}

export const CATEGORIES_RETENUES = ["exacte", "inexacte", "non_reponse", "indeterminee"] as const;
export type CategorieRetenue = (typeof CATEGORIES_RETENUES)[number];

/** Ordre figé : il fixe l'ordre de la répartition des drapeaux parmi les inexactes (§8). */
export const DRAPEAUX = [
  "fabrication",
  "mauvaise_attribution",
  "obsolescence",
  "deformation",
  "confirmation_premisse",
] as const;
export type Drapeau = (typeof DRAPEAUX)[number];

export const STATUTS_REPONSE = ["obtenue", "manquante"] as const;
export type StatutReponse = (typeof STATUTS_REPONSE)[number];

export const ROLES_ITEM = ["principal", "attendu_dans_liste", "distracteur", "contexte"] as const;
export type RoleItem = (typeof ROLES_ITEM)[number];

/** Les trois booléens qui portent exactement la métrique « sourçage valide » du §8. */
export interface SourcageRetenu {
  readonly cite: boolean;
  readonly au_moins_un_lien_existant: boolean;
  readonly au_moins_un_lien_soutenant: boolean;
}

export interface ObjetNote {
  readonly type: "reponse" | "lecture_comparateur";
  readonly id: Ulid;
}

export interface Verdict {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly categorie_retenue: CategorieRetenue;
  readonly drapeaux_retenus: readonly Drapeau[];
  /** §11 : présent uniquement avec le drapeau obsolescence. */
  readonly obsolescence_fraiche?: boolean;
  readonly sourcage_retenu: SourcageRetenu;
  readonly dans_echantillon_humain: boolean;
  readonly erreur_grave: boolean;
}

/** schema/notation.schema.json, `motif_notation`. */
export const MOTIFS_NOTATION = [
  "notation_juge",
  "desaccord_juges",
  "echantillon_aleatoire_10",
  "erreur_grave",
  "calibration_jeu_or",
  "contrefactuel",
  "arbitrage_panel",
  "arbitrage_echantillon_10",
  "extrait_invalide",
  "accord_partiel_juges",
  "attribution_indecidable",
  "regle_refus_api",
] as const;
export type MotifNotation = (typeof MOTIFS_NOTATION)[number];

export const TYPES_NOTATEUR = ["juge", "humain", "regle"] as const;
export type TypeNotateur = (typeof TYPES_NOTATEUR)[number];

export const VERDICTS_EXISTENCE = ["existe", "mort", "inaccessible", "non_testable"] as const;
export type VerdictExistence = (typeof VERDICTS_EXISTENCE)[number];

export const VERDICTS_SOUTIEN = ["soutient", "ne_soutient_pas", "indetermine", "non_applicable"] as const;
export type VerdictSoutien = (typeof VERDICTS_SOUTIEN)[number];

export interface LienNote {
  readonly verdict_existence: VerdictExistence;
  readonly verdict_soutien: VerdictSoutien;
}

/**
 * Une notation individuelle (schema/notation.schema.json) : ce que lit le recalcul de robustesse
 * §8(a), qui ne doit jamais passer par la note retenue du verdict.
 */
export interface Notation {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly objet_note: ObjetNote;
  readonly notateur: { readonly type: TypeNotateur; readonly id: IdentifiantCourt };
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  /** §11 : présent uniquement avec le drapeau obsolescence. */
  readonly obsolescence_fraiche?: boolean;
  readonly sourcage: { readonly cite: boolean; readonly liens: readonly LienNote[] };
  /** Obligatoire pour un juge (schéma) ; lu ici pour ne retenir que l'échantillon humain. */
  readonly motif_notation?: MotifNotation;
}

export interface ProjectionNormalisee {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly troncature: boolean;
}

export interface Reponse {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly canal: Canal;
  readonly outil_id: IdentifiantCourt;
  /** §6 : obligatoire pour le canal api, interdit pour le canal application. */
  readonly mode?: Mode;
  readonly question_id: string;
  readonly formulation_id: Ulid;
  readonly echantillon: number;
  readonly statut_reponse: StatutReponse;
  /** Absent sur une réponse manquante : elle n'a rien à montrer. */
  readonly normalise?: ProjectionNormalisee;
}

export interface ReferenceItem {
  readonly item_id: Ulid;
  readonly item_version: number;
  readonly item_empreinte: EmpreinteSha256;
}

export interface ItemDeQuestion {
  readonly reference: ReferenceItem;
  readonly role: RoleItem;
}

export interface Formulation {
  readonly id: Ulid;
  readonly registre: Registre;
  readonly empreinte_texte: EmpreinteSha256;
}

export interface Question {
  readonly id: string;
  readonly gabarit: Gabarit;
  /** Absent pour Q-ATT : §5 interdit de nommer un candidat dans une question d'attribution. */
  readonly candidat_id?: IdentifiantCourt;
  readonly items: readonly ItemDeQuestion[];
  readonly grappe_id: Ulid;
  readonly formulations: readonly Formulation[];
}

export interface Item {
  readonly id: Ulid;
  readonly version: number;
  readonly type: TypeItem;
  readonly candidat_id: IdentifiantCourt;
}

/** Une entrée du tirage : ce que la question valait au gel du run (thème, gabarit, candidat). */
export interface EntreeTirage {
  readonly question_id: string;
  readonly candidat_id?: IdentifiantCourt;
  readonly theme?: Theme;
  readonly gabarit: Gabarit;
  readonly grappe_id?: Ulid;
  /**
   * §5 (protocole 0.11) : la prémisse de la formulation orientée est-elle fausse au gel ? Résolue
   * dans le tirage (`pipeline/questions/reponse-attendue.ts:premisseFausseAuGel`), lue ici telle
   * quelle : dénominateur de la confirmation de prémisse (§8). Obligatoire (tirage.schema.json).
   */
  readonly premisse_fausse: boolean;
}

export interface CandidatAuGel {
  readonly candidat_id: IdentifiantCourt;
  readonly statut_au_gel: "actif" | "nouveau" | "retire";
  readonly items_p_verifies: number;
  /**
   * Les identifiants triés des items P comptés au gel, dont `items_p_verifies` est la longueur.
   * Décision de l'auteur du 2026-10-02 (conformité n° 11, texte à écrire au §8 en 0.15) : ce sont
   * les « items P de référence » des comparateurs pour un candidat interrogé. Lu, jamais recalculé.
   */
  readonly items_p_au_gel: readonly Ulid[];
  /** §4 et §8 : lu, jamais recalculé ici. */
  readonly sous_seuil: boolean;
  readonly interroge: boolean;
}

/** §8 : part des réponses manquantes du canal API pour un couple outil × mode, et son verdict. */
export interface SeuilMode {
  readonly reponses_manquantes_part: number;
  readonly run_incomplet: boolean;
}

/** `run.schema.json#/.../par_mode` : une entrée par mode déclaré d'un assistant inclus. */
export type ParMode = Readonly<Partial<Record<Mode, SeuilMode>>>;

export interface OutilAuGel {
  readonly outil_id: IdentifiantCourt;
  readonly famille: "assistant" | "comparateur";
  readonly inclus: boolean;
  /** §8 : le mode dont vient le chiffre de tête. Lu, jamais décidé par l'analyse. */
  readonly mode_de_tete?: Mode;
  /** §6 : déclaré pour un assistant inclus, un par mode qu'il interroge sur le canal API. */
  readonly modes?: readonly Mode[];
  /**
   * §8, §12, D55 (7) : part de réponses manquantes et verdict « run incomplet » par mode,
   * calculés par `analysis/seuils.ts:parModeDuRun`, jamais un second calcul. Écrit par
   * `pipeline/go-no-go/go-no-go.ts` ; recoupé à la lecture par `analysis/lecture-run.ts:lireRun`.
   */
  readonly par_mode?: ParMode;
}

export interface ContestationPosterieure {
  readonly item_id: Ulid;
  readonly contestation_id: Ulid;
  readonly date_reception: Instant;
}

export interface Run {
  readonly id: Ulid;
  readonly date_gel: Instant;
  readonly perimetre: {
    readonly candidats: readonly CandidatAuGel[];
    readonly outils: readonly OutilAuGel[];
  };
  /** Entrée exacte de l'analyse de robustesse §8(b). Absent = aucune contestation reçue. */
  readonly contestations_posterieures?: readonly ContestationPosterieure[];
}

export interface LectureComparateur {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: ContexteMesure;
  readonly outil_id: IdentifiantCourt;
  readonly reference_item: ReferenceItem;
  /** Première des deux mesures du §6 : couverture, indépendante de l'exactitude. */
  readonly affiche: boolean;
}

/**
 * Un taux publié. `valeur` est **absente** quand le dénominateur est nul — ni `null`, ni `0`,
 * ni `NaN` : un taux sans dénominateur n'existe pas, et le faire exister à 0 publierait un
 * chiffre que personne n'a mesuré.
 */
export interface Taux {
  readonly numerateur: number;
  readonly denominateur: number;
  readonly valeur?: number;
}

/**
 * Seul constructeur de `Taux`. Il refuse les incohérences plutôt que de les arrondir : un
 * numérateur supérieur au dénominateur est un bug de comptage, pas une donnée à publier.
 */
export function taux(numerateur: number, denominateur: number): Taux {
  verifierEffectifs(numerateur, denominateur);
  if (denominateur === 0) return { numerateur, denominateur };
  return { numerateur, denominateur, valeur: numerateur / denominateur };
}

function verifierEffectifs(numerateur: number, denominateur: number): void {
  if (!Number.isInteger(numerateur) || !Number.isInteger(denominateur)) {
    throw new Error(`Effectifs non entiers : ${numerateur}/${denominateur}`);
  }
  if (numerateur < 0 || denominateur < 0) {
    throw new Error(`Effectifs négatifs : ${numerateur}/${denominateur}`);
  }
  if (numerateur > denominateur) {
    throw new Error(`Numérateur supérieur au dénominateur : ${numerateur}/${denominateur}`);
  }
}

export type MotifDegenerescence = "grappe_unique";

/**
 * Intervalle de confiance à 95 % par bootstrap en grappes (§8), méthode des percentiles.
 *
 * `degenere` n'est pas décoratif : sur une grappe unique, tous les rééchantillons sont
 * identiques et l'intervalle se réduit au point estimé. Publié tel quel, il ressemblerait à une
 * mesure d'une précision parfaite.
 */
export interface Intervalle95 {
  readonly bas: number;
  readonly haut: number;
  readonly nombre_grappes: number;
  readonly reechantillonnages: number;
  /** Rééchantillons dont la statistique est indéfinie (dénominateur nul) : exclus du percentile, comptés ici. */
  readonly reechantillonnages_indefinis: number;
  readonly degenere: MotifDegenerescence | null;
}
