/**
 * Construction des charges utiles envoyées au client.
 *
 * Tout ce qui sort du serveur passe par ici, et rien de ce qui sort d'ici ne vient du journal
 * d'un autre annotateur. Même le manifeste de lot est projeté : il porte la liste des deux
 * annotateurs, qui n'apprend rien sur des décisions mais n'a aucune raison d'être à l'écran.
 */

import { applicabiliteDe } from "../domaine/decision.ts";
import {
  CLES_GRILLE,
  LIBELLES_GRILLE,
  LIBELLES_GRILLE_ABSENCE,
  LIBELLES_SPECIFIQUES,
  questionsSpecifiquesDe,
} from "../domaine/grille.ts";
import { gestesPourDecision } from "../domaine/interaction.ts";
import { progression, type EtatAnnotateur } from "../domaine/journal.ts";
import { projeterItem, type ItemProjete } from "../domaine/projection.ts";
import type { CleGrille, Decision, Item, ItemDuLot, Lot, Mesure } from "../domaine/types.ts";
import { emplacements, type CleEmplacement, type TypeAffichage } from "./emplacements.ts";

export interface LotProjete {
  readonly lot_id: string;
  readonly nature: Lot["nature"];
  readonly taille: number;
  readonly date_creation: string;
  readonly reannote: string | null;
}

export function projeterLot(lot: Lot): LotProjete {
  return {
    lot_id: lot.lot_id,
    nature: lot.nature,
    taille: lot.items.length,
    date_creation: lot.date_creation,
    reannote: lot.reannote === undefined ? null : lot.reannote,
  };
}

export interface QuestionAffichee {
  readonly cle: string;
  readonly libelle: string;
  readonly etat: CleEmplacement | null;
}

export interface SourceAffichee {
  readonly cle: CleEmplacement;
  readonly libelle: string;
  readonly type_affichage: TypeAffichage;
  readonly texte: string | null;
  readonly texte_absent_motif: string | null;
  readonly offsets: { readonly debut: number; readonly fin: number } | null;
  readonly transcription: string | null;
}

export interface VueItem {
  readonly item: ItemProjete;
  readonly sources: readonly SourceAffichee[];
  readonly questions: readonly QuestionAffichee[];
  readonly questions_specifiques: readonly QuestionAffichee[];
  readonly gestes: Readonly<Record<Decision, number | "variable">>;
  readonly position: { readonly index: number; readonly total: number };
}

export interface AccesTextes {
  texte(sha256: string | null): string | null;
  transcription(sha256: string): string | null;
}

export function construireVueItem(
  item: Item,
  mesure: Mesure,
  acces: AccesTextes,
  position: { readonly index: number; readonly total: number },
): VueItem {
  return {
    item: projeterItem(item, mesure),
    sources: emplacements(item).map((lieu) => ({
      cle: lieu.cle,
      libelle: lieu.libelle,
      type_affichage: lieu.type_affichage,
      texte: acces.texte(lieu.source.texte_sha256 === undefined ? null : lieu.source.texte_sha256),
      texte_absent_motif: motifTexteAbsent(lieu.source.texte_sha256, acces),
      offsets: offsetsDe(lieu.etat),
      transcription:
        lieu.type_affichage === "media" ? acces.transcription(lieu.source.sha256) : null,
    })),
    questions: questionsAffichees(item),
    questions_specifiques: questionsSpecifiquesDe(item).map((cle) => ({
      cle,
      libelle: LIBELLES_SPECIFIQUES[cle],
      etat: null,
    })),
    gestes: {
      accepter: gestesPourDecision(item, "accepter"),
      corriger: gestesPourDecision(item, "corriger"),
      rejeter: gestesPourDecision(item, "rejeter"),
      non_evaluable: gestesPourDecision(item, "non_evaluable"),
    },
    position,
  };
}

/**
 * Une source sans texte canonique n'est pas affichable : l'écran le dit et refuse de laisser
 * croire que la citation a été vérifiée à l'œil. Voir docs/CONTRATS.md §1.
 */
function motifTexteAbsent(texte_sha256: string | undefined, acces: AccesTextes): string | null {
  if (texte_sha256 === undefined) {
    return "Cette source ne porte pas de texte canonique (source.texte_sha256 absent).";
  }
  if (acces.texte(texte_sha256) === null) {
    return `Le texte canonique ${texte_sha256.slice(0, 12)}… est absent de staging/textes/.`;
  }
  return null;
}

function offsetsDe(etat: { readonly test_verbatim?: { offset_debut?: number; offset_fin?: number } } | null) {
  const debut = etat?.test_verbatim?.offset_debut;
  const fin = etat?.test_verbatim?.offset_fin;
  if (debut === undefined || fin === undefined) return null;
  return { debut, fin };
}

function questionsAffichees(item: Item): readonly QuestionAffichee[] {
  if (item.type === "O") {
    return [...questionsDUnEtat(item, "anterieur"), ...questionsDUnEtat(item, "posterieur")];
  }
  const applicabilite = applicabiliteDe(item);
  return CLES_GRILLE.filter((cle) => applicabilite[cle] === "applicable").map((cle) => ({
    cle,
    libelle: libelle(item, cle),
    etat: null,
  }));
}

function questionsDUnEtat(item: Item, etat: "anterieur" | "posterieur"): readonly QuestionAffichee[] {
  const applicabilite = applicabiliteDe(item, etat);
  return CLES_GRILLE.filter((cle) => applicabilite[cle] === "applicable").map((cle) => ({
    cle,
    libelle: libelle(item, cle),
    etat,
  }));
}

function libelle(item: Item, cle: CleGrille): string {
  if (item.type === "A") {
    const propre = LIBELLES_GRILLE_ABSENCE[cle];
    if (propre !== undefined) return propre;
  }
  return LIBELLES_GRILLE[cle];
}

/* ------------------------------------------------------------ vue d'un lot */

export interface VueLot {
  readonly lot: LotProjete;
  readonly ordre: readonly string[];
  readonly progression: ReturnType<typeof progression>;
  readonly item_courant: string | null;
  readonly accessible: boolean;
  readonly motif_inaccessible: string | null;
}

export function construireVueLot(parametres: {
  readonly lot: Lot;
  readonly ordre: readonly ItemDuLot[];
  readonly etat: EtatAnnotateur;
  readonly item_courant: ItemDuLot | null;
  readonly accessible: boolean;
  readonly motif_inaccessible: string | null;
  /** Items que la contestation vise effectivement (constat 13) : comptés comme retirés. */
  readonly contestes?: ReadonlySet<string>;
}): VueLot {
  return {
    lot: projeterLot(parametres.lot),
    ordre: parametres.ordre.map((entree) => entree.item_id),
    progression: progression(parametres.ordre, parametres.etat, parametres.contestes),
    item_courant: parametres.item_courant === null ? null : parametres.item_courant.item_id,
    accessible: parametres.accessible,
    motif_inaccessible: parametres.motif_inaccessible,
  };
}
