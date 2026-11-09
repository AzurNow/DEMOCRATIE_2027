/**
 * Paramètres du protocole affichés par la page pédagogique.
 *
 * Aucun chiffre du protocole n'est recopié à la main dans les sections : chacun vient d'ici. Deux
 * provenances :
 *
 * - une constante de `analysis/` (`parametres-protocole.ts`, `bootstrap.ts`, `seuils.ts`) :
 *   importée, formatée à la construction (Astro statique, rien au runtime) ; un amendement qui
 *   change la constante change la page. Les constantes de `pipeline/` partagées avec la page vivent
 *   dans `analysis/parametres-protocole.ts`, sans lecture de fichier au chargement : `pipeline/questions/`
 *   lit ses fichiers par chemin relatif, introuvables une fois le code empaqueté ;
 * - aucune constante : `PARAMETRES_SANS_CONSTANTE`, avec la phrase de `docs/PROTOCOLE.md` qui
 *   porte la valeur ; le même test échoue si le protocole ne la contient plus.
 */
import { NIVEAU_CONFIANCE_POURCENT, REECHANTILLONNAGES_PRODUCTION } from "../../../analysis/bootstrap.ts";
import {
  DUREE_FENETRE_MS,
  LONGUEUR_MAX_CONTESTATION,
  PART_MINIMALE_ITEMS_A_F,
  PART_REPRISE,
  SEUIL_COUVERTURE_ITEMS_P,
  SEUIL_RETRAIT,
  TAILLE_JEU_OR,
  TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL,
  TAUX_ECHANTILLON_APRES_RETRAIT,
  TAUX_ECHANTILLON_SANS_RETRAIT,
} from "../../../analysis/parametres-protocole.ts";
import { SEUIL_RUN_INCOMPLET } from "../../../analysis/seuils.ts";

const MS_PAR_HEURE = 3_600_000;

/** Un entier lisible : espace entre les milliers (« 2 000 »), comme le texte de la page. */
export function entier(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Une fraction en pourcentage entier (« 10 % »). Refuse une fraction qui n'en donne pas un. */
export function pourcent(fraction: number): string {
  const centiemes = Math.round(fraction * 100);
  if (Math.abs(centiemes / 100 - fraction) > 1e-9) {
    throw new Error(`${fraction} n'est pas un pourcentage entier : la page ne l'afficherait pas tel quel.`);
  }
  return `${entier(centiemes)} %`;
}

/** Une durée en millisecondes en heures entières. Refuse une durée qui n'en est pas une. */
export function heures(ms: number): string {
  if (ms % MS_PAR_HEURE !== 0) throw new Error(`${ms} ms n'est pas un nombre entier d'heures.`);
  return entier(ms / MS_PAR_HEURE);
}

/**
 * Valeurs affichées, toutes lues dans `analysis/` (constante entre parenthèses).
 */
export const PARAMETRES = {
  /** §7, `TAUX_ECHANTILLON_SANS_RETRAIT` : part des réponses notées par des humains. */
  echantillonHumain: pourcent(TAUX_ECHANTILLON_SANS_RETRAIT),
  /** §7, `TAUX_ECHANTILLON_APRES_RETRAIT` : part notée par des humains après le retrait d'un juge. */
  echantillonApresRetrait: pourcent(TAUX_ECHANTILLON_APRES_RETRAIT),
  /** §7, `SEUIL_RETRAIT` : taux de changement du test contrefactuel au-delà duquel un juge est retiré. */
  seuilRetraitJuge: pourcent(SEUIL_RETRAIT.numerateur / SEUIL_RETRAIT.denominateur),
  /** §7, `TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL` : réponses renotées par le test contrefactuel. */
  sousEnsembleContrefactuel: entier(TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL),
  /** §7, `TAILLE_JEU_OR` : réponses du jeu d'or doublement notées par des humains. */
  jeuOr: entier(TAILLE_JEU_OR),
  /** §5, `PART_MINIMALE_ITEMS_A_F` : part minimale des questions d'absence ou fictives. */
  partAbsenceEtFictif: pourcent(PART_MINIMALE_ITEMS_A_F),
  /** §5, `PART_REPRISE` : part des questions reprises d'un run au suivant. */
  partReprise: pourcent(PART_REPRISE),
  /** §5, complément de `PART_REPRISE` : part des questions neuves. */
  partNeuve: pourcent(1 - PART_REPRISE),
  /** §4, `SEUIL_COUVERTURE_ITEMS_P` : items P vérifiés sous lesquels un candidat est rapporté à part. */
  couvertureMinimale: entier(SEUIL_COUVERTURE_ITEMS_P),
  /** §6, `DUREE_FENETRE_MS` : durée de la fenêtre d'interrogation, en heures. */
  fenetreHeures: heures(DUREE_FENETRE_MS),
  /** §8, `analysis/bootstrap.ts` : rééchantillonnages du bootstrap de production. */
  reechantillonnages: entier(REECHANTILLONNAGES_PRODUCTION),
  /** §8, `analysis/bootstrap.ts` : niveau de confiance des intervalles, en pourcentage. */
  niveauConfiance: entier(NIVEAU_CONFIANCE_POURCENT),
  /** §4, `analysis/parametres-protocole.ts` : longueur maximale du texte d'une contestation, en caractères. */
  longueurContestation: entier(LONGUEUR_MAX_CONTESTATION),
  /** §8, `analysis/seuils.ts` : part de réponses manquantes au-delà de laquelle un couple est « run incomplet ». */
  reponsesManquantesMax: pourcent(SEUIL_RUN_INCOMPLET.numerateur / SEUIL_RUN_INCOMPLET.denominateur),
} as const;

export interface ParametreSansConstante {
  /** Ce que la page affiche. */
  readonly affiche: string;
  /** Phrase du protocole qui porte cette valeur, construite avec la valeur affichée. */
  readonly citation: string;
}

/**
 * Valeurs qu'aucune constante ne porte (délais de la procédure de contestation, rang de la liste
 * des magasins) : la page les affiche, un test les recoupe avec le protocole. La citation est
 * courte et exacte, copiée de `docs/PROTOCOLE.md`.
 */
export const PARAMETRES_SANS_CONSTANTE = {
  delaiPanelJours: { affiche: "14", citation: "Le panel (section 10) statue sous 14 jours" },
  accuseReceptionHeures: { affiche: "24", citation: "accusé automatique sous 24 h" },
  rangMagasins: { affiche: "50", citation: "50 premières applications gratuites" },
} as const satisfies Record<string, ParametreSansConstante>;
