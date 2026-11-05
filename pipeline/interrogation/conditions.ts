/**
 * Les conditions figées de l'interrogation (§6), en un seul endroit.
 *
 * Toutes fixes, sans aléa : un délai tiré au hasard rendrait l'ordre des tentatives entre outils
 * irreproductible, et donnerait à un outil plus de temps qu'à un autre sans que rien ne le dise.
 * Les délais et le plafond de tentatives viennent de la décision de l'auteur du 2026-10-02 (texte
 * du §6 à écrire en protocole 0.16) ; la fenêtre, la longueur maximale et le nombre d'échantillons
 * viennent du tableau du §6.
 */

/** §6 : « Une requête est tentée au plus trois fois au total. » */
export const TENTATIVES_MAX = 3;

/**
 * Attente avant la tentative de rang 2, puis de rang 3, comptée depuis la fin de la tentative
 * précédente. « Avec délai croissant » (§6) : 30 s, puis 120 s.
 */
export const ATTENTES_AVANT_RELANCE_MS: readonly [number, number] = [30_000, 120_000];

/** Une tentative sans réponse au bout de 180 s est abandonnée, erreur de type « timeout ». */
export const DELAI_TENTATIVE_MS = 180_000;

/** §6 : la fenêtre est « ouverte le mardi à 6 h, heure de Paris » (`FUSEAU_DU_RUN`, `analysis/heure-paris.ts`). */
export const JOUR_OUVERTURE_FENETRE = "Tue";
export const HEURE_OUVERTURE_FENETRE = 6;

/** §6 : « Longueur maximale : 2 048 tokens de sortie. » */
export const TOKENS_SORTIE_MAX = 2048;

/**
 * `run.schema.json#/properties/reponses/properties/echantillons_par_question` : 2 au §6, 1 sous le
 * levier préenregistré du §12 (« nombre d'échantillons par question (2 → 1) »).
 */
export type EchantillonsParQuestion = 1 | 2;

/**
 * §6 : « Échantillons : 2 par question et par mode », pour chaque formulation (§2). Lu au gel seul
 * (`pipeline/gel/assemblage.ts`), qui l'inscrit dans `run.json#/reponses/echantillons_par_question`
 * (D75 (14)) ; un run gelé est ensuite planifié sur ce qu'il porte, jamais sur cette constante.
 */
export const ECHANTILLONS: EchantillonsParQuestion = 2;

/** L'attente avant la tentative `numero` (2 ou 3). Tout autre rang est une erreur de programme. */
export function attenteAvantTentative(numero: number): number {
  const attente = ATTENTES_AVANT_RELANCE_MS[numero - 2];
  if (attente === undefined) throw new Error(`Aucune attente définie avant la tentative ${numero} (§6 : 2 ou 3).`);
  return attente;
}
