/** Formes des réponses de l'API (`notation-humaine/serveur/routes.ts`). Aucune ne porte l'outil, un juge ni un autre annotateur. */

export interface Grille {
  readonly categories: readonly string[];
  readonly drapeaux: readonly string[];
  readonly motifs_inexactitude: readonly string[];
  readonly verdicts_soutien: readonly string[];
  readonly provenances: readonly string[];
}

export interface Session {
  readonly annotateur_id: string;
  readonly run_id: string;
  readonly date_gel: string;
  readonly version_grille: string;
  readonly grille: Grille;
}

export interface FileDeTravail {
  readonly a_noter: readonly { readonly reponse_id: string }[];
  readonly en_attente_test_des_liens: number;
  readonly attend_juge: number;
  readonly sans_motif_admis: number;
}

export interface Existence {
  readonly url_citee: string;
  readonly verdict_existence: string;
  readonly date_test: string;
  readonly url_finale?: string;
  readonly code_http?: number | null;
  readonly sha256_contenu?: string;
  readonly archive_url?: string;
}

export interface Citation {
  readonly url?: string;
  readonly texte?: string;
}

export interface EtatItem {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  readonly quantification?: unknown;
}

export interface ItemSoumis {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly role: string;
  readonly type: string;
  readonly candidat_id: string;
  readonly valide_du: string;
  readonly valide_au: string | null;
  readonly assertion?: EtatItem;
  readonly obsolescence?: { readonly date_changement: string; readonly etat_anterieur: EtatItem; readonly etat_posterieur: EtatItem };
}

/** La réponse attendue résolue au gel (`tirage.schema.json#/$defs/reponse_attendue`, D27 (G)). */
export interface ReponseAttendue {
  readonly nature: string;
  readonly position?: string;
  readonly etat_attendu?: string;
  readonly candidats_attendus?: readonly string[];
  readonly resolution_temporelle: { readonly date_gel: string; readonly date_changement?: string; readonly regle: string };
}

/** Le texte d'une page citée, ou la raison de son absence (D27 (E)). */
export type PageCitee =
  | {
      readonly url_citee: string;
      readonly texte_disponible: true;
      readonly origine: string;
      readonly texte: string;
      readonly texte_sha256: string;
      readonly tronque: boolean;
      readonly longueur_totale: number;
    }
  | { readonly url_citee: string; readonly texte_disponible: false; readonly raison: string };

export interface Vue {
  readonly version_vue: string;
  readonly version_grille: string;
  readonly date_run: string;
  readonly reponse_id: string;
  readonly question: { readonly gabarit: string; readonly registre: string; readonly texte: string; readonly premisse_fausse?: boolean };
  readonly reponse_attendue: ReponseAttendue;
  readonly pages_citees: readonly PageCitee[];
  readonly longueur_max_texte_page: number;
  readonly reponse: {
    readonly texte: string;
    readonly liens: readonly Existence[];
    readonly citations?: readonly Citation[];
    readonly troncature: boolean;
    readonly refus_api: boolean;
  };
  readonly references: readonly ItemSoumis[];
  readonly version_normalisation_verbatim: string;
}

export interface MotifRefus {
  readonly code: string;
  readonly detail: string;
  readonly chemin?: string;
}

export interface Soutien {
  readonly url_citee: string;
  readonly verdict_soutien: string;
}

interface SaisieCommune {
  readonly cite: boolean;
  readonly soutiens: readonly Soutien[];
  readonly extrait?: { readonly texte: string; readonly provenance: string };
}

/** Hors question d'attribution : la grille du §7. */
export interface SaisieOrdinaire extends SaisieCommune {
  readonly categorie: string;
  readonly drapeaux: readonly string[];
  readonly motif_inexactitude?: string;
}

/** Question d'attribution (D29) : les noms cités, tels qu'écrits, et la non-réponse ; la note se calcule. */
export interface SaisieAttribution extends SaisieCommune {
  readonly noms_cites: readonly string[];
  readonly non_reponse: boolean;
  /** D30 (3) : réponse contradictoire, indéterminée ; exclusive de la non-réponse. */
  readonly indeterminee: boolean;
  /** D30 (2) : la note décidée par l'humain, dans les seuls cas indécidables. */
  readonly note_decidee?: { readonly categorie: string; readonly drapeaux: readonly string[]; readonly motif_inexactitude?: string };
}

export type Saisie = SaisieOrdinaire | SaisieAttribution;
