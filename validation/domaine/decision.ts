/**
 * Construction et contrôle d'une entrée de décision.
 *
 * Tout passe par ici avant d'atteindre le journal. Une décision incomplète est refusée, avec
 * la liste de ce qui manque : elle n'est jamais complétée par une valeur plausible. C'est la
 * même exigence que pour les données du pipeline — une donnée absente reste absente.
 */

import { empreinteDe } from "./empreinte.ts";
import {
  applicabiliteGrille,
  controlerGrille,
  controlerSpecifiques,
  type ManquementGrille,
} from "./grille.ts";
import type {
  Correction,
  Decision,
  EntreeAnnulation,
  EntreeDecision,
  EntreeRetrait,
  EtatObsolescence,
  Grille,
  Item,
  MotifRejet,
  NatureLot,
  QuestionsSpecifiques,
} from "./types.ts";
import { sourcesDuContenu } from "./ecoute-t2.ts";

export const VERSION_JOURNAL = 1;

/** Ce que le client soumet. Rien d'autre : ni identité, ni horodatage, ni version d'item. */
export interface SoumissionDecision {
  readonly item_id: string;
  readonly decision: Decision;
  readonly motif_rejet?: MotifRejet;
  readonly reponses_grille?: Grille;
  readonly reponses_par_etat?: Readonly<Record<EtatObsolescence, Grille>>;
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly corrections?: readonly Correction[];
  readonly commentaire?: string | null;
  readonly duree_affichage_ms: number;
  readonly duree_active_ms: number;
}

/** Ce que le serveur sait, et que le client ne fournit jamais. */
export interface ContexteDecision {
  readonly annotateur_id: string;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  readonly item: Item;
  readonly visite: number;
  readonly horodatage: string;
  readonly identifiant: string;
}

export interface DecisionRefusee {
  readonly ok: false;
  readonly manquements: readonly ManquementGrille[];
}

export interface DecisionAcceptee {
  readonly ok: true;
  readonly entree: EntreeDecision;
}

export function construireDecision(
  soumission: SoumissionDecision,
  contexte: ContexteDecision,
): DecisionAcceptee | DecisionRefusee {
  const manquements = [
    ...controlerFormeDesReponses(soumission, contexte.item),
    ...controlerSpecifiques(contexte.item,soumission.questions_specifiques ?? {}),
    ...controlerCorrections(soumission),
    ...controlerMotifRejet(soumission, contexte.item),
    ...controlerDurees(soumission),
  ];
  if (manquements.length > 0) return { ok: false, manquements };

  return { ok: true, entree: assembler(soumission, contexte) };
}

/** Les items O portent une grille par état ; les trois autres types, une grille unique. */
function controlerFormeDesReponses(
  soumission: SoumissionDecision,
  item: Item,
): readonly ManquementGrille[] {
  if (item.type === "O") return controlerGrillesParEtat(soumission, item);
  if (soumission.reponses_par_etat !== undefined) {
    return [{ cle: "reponses_par_etat", probleme: "repondue_alors_que_sans_objet" }];
  }
  if (soumission.reponses_grille === undefined) {
    return [{ cle: "reponses_grille", probleme: "sans_reponse" }];
  }
  return controlerGrille(soumission.reponses_grille, applicabiliteDe(item));
}

function controlerGrillesParEtat(
  soumission: SoumissionDecision,
  item: Item,
): readonly ManquementGrille[] {
  if (soumission.reponses_grille !== undefined) {
    return [{ cle: "reponses_grille", probleme: "repondue_alors_que_sans_objet" }];
  }
  const parEtat = soumission.reponses_par_etat;
  if (parEtat === undefined) {
    return [{ cle: "reponses_par_etat", probleme: "sans_reponse" }];
  }
  return [
    ...prefixer("anterieur", controlerGrille(parEtat.anterieur, applicabiliteDe(item, "anterieur"))),
    ...prefixer("posterieur", controlerGrille(parEtat.posterieur, applicabiliteDe(item, "posterieur"))),
  ];
}

function prefixer(
  prefixe: string,
  manquements: readonly ManquementGrille[],
): readonly ManquementGrille[] {
  return manquements.map((manquement) => ({ ...manquement, cle: `${prefixe}.${manquement.cle}` }));
}

/** L'applicabilité dépend du type d'item et de la présence d'une quantification à juger. */
export function applicabiliteDe(item: Item, etat?: EtatObsolescence) {
  return applicabiliteGrille(item.type, {
    quantifie: porteUneQuantification(item, etat),
    ...(etat === undefined ? {} : { etat }),
  });
}

function porteUneQuantification(item: Item, etat?: EtatObsolescence): boolean {
  if (item.type === "O") {
    const bloc = item.obsolescence;
    if (bloc === undefined) return false;
    const vise = etat === "anterieur" ? bloc.etat_anterieur : bloc.etat_posterieur;
    return vise.quantification !== undefined;
  }
  return item.assertion?.quantification !== undefined;
}

function controlerCorrections(soumission: SoumissionDecision): readonly ManquementGrille[] {
  const corrections = soumission.corrections ?? [];
  if (soumission.decision === "corriger" && corrections.length === 0) {
    return [{ cle: "corrections", probleme: "sans_reponse" }];
  }
  if (soumission.decision !== "corriger" && corrections.length > 0) {
    return [{ cle: "corrections", probleme: "repondue_alors_que_sans_objet" }];
  }
  return [];
}

/**
 * §4 (protocole 0.24, D59 (9)) : le motif « texte extrait erroné » qualifie un rejet, et seulement un
 * rejet. Il est sans objet sur un item sans source de contenu (item F) : aucun texte n'y a été
 * extrait. Sa valeur est contrôlée par le schéma de la ligne de journal.
 */
function controlerMotifRejet(soumission: SoumissionDecision, item: Item): readonly ManquementGrille[] {
  if (soumission.motif_rejet === undefined) return [];
  const sansObjet = soumission.decision !== "rejeter" || sourcesDuContenu(item).length === 0;
  return sansObjet ? [{ cle: "motif_rejet", probleme: "repondue_alors_que_sans_objet" }] : [];
}

function controlerDurees(soumission: SoumissionDecision): readonly ManquementGrille[] {
  const { duree_affichage_ms, duree_active_ms } = soumission;
  const valides =
    Number.isInteger(duree_affichage_ms) &&
    Number.isInteger(duree_active_ms) &&
    duree_affichage_ms >= 0 &&
    duree_active_ms >= 0 &&
    duree_active_ms <= duree_affichage_ms;
  return valides ? [] : [{ cle: "durees", probleme: "sans_reponse" }];
}

function assembler(soumission: SoumissionDecision, contexte: ContexteDecision): EntreeDecision {
  const socle = {
    id: contexte.identifiant,
    journal_version: VERSION_JOURNAL,
    type_entree: "decision" as const,
    annotateur_id: contexte.annotateur_id,
    lot_id: contexte.lot_id,
    lot_nature: contexte.lot_nature,
    item_id: contexte.item.id,
    item_version: contexte.item.version,
    item_empreinte: contexte.item.empreinte,
    item_type: contexte.item.type,
    decision: soumission.decision,
    ...(soumission.motif_rejet === undefined ? {} : { motif_rejet: soumission.motif_rejet }),
    ...(soumission.reponses_grille === undefined ? {} : { reponses_grille: soumission.reponses_grille }),
    ...(soumission.reponses_par_etat === undefined
      ? {}
      : { reponses_par_etat: soumission.reponses_par_etat }),
    ...(soumission.questions_specifiques === undefined
      ? {}
      : { questions_specifiques: soumission.questions_specifiques }),
    corrections: soumission.corrections ?? [],
    commentaire: soumission.commentaire === undefined ? null : soumission.commentaire,
    horodatage: contexte.horodatage,
    duree_affichage_ms: soumission.duree_affichage_ms,
    duree_active_ms: soumission.duree_active_ms,
    visite: contexte.visite,
  };
  return { ...socle, empreinte_ligne: empreinteDe(socle) };
}

/* ------------------------------------------- annulation et retrait d'item */

export function construireAnnulation(parametres: {
  readonly identifiant: string;
  readonly annotateur_id: string;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  readonly item_id: string;
  readonly annule: string;
  readonly horodatage: string;
  readonly commentaire?: string | null;
}): EntreeAnnulation {
  const socle = {
    id: parametres.identifiant,
    journal_version: VERSION_JOURNAL,
    type_entree: "annulation" as const,
    annotateur_id: parametres.annotateur_id,
    lot_id: parametres.lot_id,
    lot_nature: parametres.lot_nature,
    item_id: parametres.item_id,
    annule: parametres.annule,
    horodatage: parametres.horodatage,
    commentaire: parametres.commentaire === undefined ? null : parametres.commentaire,
  };
  return { ...socle, empreinte_ligne: empreinteDe(socle) };
}

export function construireRetrait(parametres: {
  readonly identifiant: string;
  readonly annotateur_id: string;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  readonly item_id: string;
  readonly motif: string;
  readonly horodatage: string;
}): EntreeRetrait {
  const socle = {
    id: parametres.identifiant,
    journal_version: VERSION_JOURNAL,
    type_entree: "retrait_item" as const,
    annotateur_id: parametres.annotateur_id,
    lot_id: parametres.lot_id,
    lot_nature: parametres.lot_nature,
    item_id: parametres.item_id,
    motif: parametres.motif,
    horodatage: parametres.horodatage,
    commentaire: null,
  };
  return { ...socle, empreinte_ligne: empreinteDe(socle) };
}

/** Recalcule l'empreinte d'une entrée relue et la compare à celle qu'elle porte. */
export function empreinteCoherente(entree: { readonly empreinte_ligne: string }): boolean {
  const { empreinte_ligne, ...socle } = entree as Record<string, unknown> & {
    empreinte_ligne: string;
  };
  return empreinteDe(socle) === empreinte_ligne;
}
