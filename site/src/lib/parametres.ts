/**
 * Paramètres du protocole affichés par la page pédagogique.
 *
 * Aucun chiffre du protocole n'est recopié à la main dans les sections : chacun vient d'ici. Trois
 * provenances :
 *
 * - une constante de `analysis/` : importée, formatée à la construction (Astro statique, rien au
 *   runtime) ; un amendement qui change la constante change la page ;
 * - une constante de `pipeline/` : écrite ici, car l'importer entraînerait dans le paquet de
 *   construction des modules qui lisent leurs fichiers par chemin relatif (`gabarits-1.0.0.json`),
 *   introuvables une fois le code empaqueté. `tests/site/parametres.test.ts` importe la constante
 *   et échoue si la valeur écrite ici s'en écarte ;
 * - aucune constante : `PARAMETRES_SANS_CONSTANTE`, avec la phrase de `docs/PROTOCOLE.md` qui
 *   porte la valeur ; le même test échoue si le protocole ne la contient plus.
 */
import { REECHANTILLONNAGES_PRODUCTION } from "../../../analysis/bootstrap.ts";
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
 * Valeurs affichées. Les deux dernières lues dans `analysis/` ; les autres recoupées avec leur
 * constante de `pipeline/` par `tests/site/parametres.test.ts` (constante entre parenthèses).
 */
export const PARAMETRES = {
  /** §7, `TAUX_ECHANTILLON_SANS_RETRAIT` : part des réponses notées par des humains. */
  echantillonHumain: "10 %",
  /** §7, `TAUX_ECHANTILLON_APRES_RETRAIT` : part notée par des humains après le retrait d'un juge. */
  echantillonApresRetrait: "25 %",
  /** §7, `SEUIL_RETRAIT` : taux de changement du test contrefactuel au-delà duquel un juge est retiré. */
  seuilRetraitJuge: "3 %",
  /** §7, `TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL` : réponses renotées par le test contrefactuel. */
  sousEnsembleContrefactuel: "200",
  /** §7, `TAILLE_JEU_OR` : réponses du jeu d'or doublement notées par des humains. */
  jeuOr: "300",
  /** §5, `PART_MINIMALE_ITEMS_A_F` : part minimale des questions d'absence ou fictives. */
  partAbsenceEtFictif: "20 %",
  /** §5, `PART_REPRISE` : part des questions reprises d'un run au suivant. */
  partReprise: "80 %",
  /** §5, complément de `PART_REPRISE` : part des questions neuves. */
  partNeuve: "20 %",
  /** §4, `SEUIL_COUVERTURE_ITEMS_P` : items P vérifiés sous lesquels un candidat est rapporté à part. */
  couvertureMinimale: "10",
  /** §6, `DUREE_FENETRE_MS` : durée de la fenêtre d'interrogation, en heures. */
  fenetreHeures: "48",
  /** §8, `analysis/bootstrap.ts` : rééchantillonnages du bootstrap de production. */
  reechantillonnages: entier(REECHANTILLONNAGES_PRODUCTION),
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
 * Valeurs qu'aucune constante ne porte (délais de la procédure de contestation, niveau de
 * confiance, rang de la liste des magasins) : la page les affiche, un test les recoupe avec le
 * protocole. La citation est courte et exacte, copiée de `docs/PROTOCOLE.md`.
 */
export const PARAMETRES_SANS_CONSTANTE = {
  delaiPanelJours: { affiche: "14", citation: "Le panel (section 10) statue sous 14 jours" },
  longueurContestation: { affiche: "1 000", citation: "dans la limite de 1 000 caractères" },
  accuseReceptionHeures: { affiche: "24", citation: "accusé automatique sous 24 h" },
  niveauConfiance: { affiche: "95", citation: "intervalle de confiance à 95 %" },
  rangMagasins: { affiche: "50", citation: "50 premières applications gratuites" },
} as const satisfies Record<string, ParametreSansConstante>;
