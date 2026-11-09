/**
 * Paramètres numériques du protocole partagés entre `pipeline/`, `analysis/` et la page
 * pédagogique du site. Une valeur n'est écrite qu'ici ; module sans effet de bord (aucune lecture
 * de fichier au chargement), donc empaquetable par Astro, ce que `pipeline/questions/` ne permet pas.
 * `tests/site/parametres.test.ts` garde l'affichage, pas la valeur.
 */

import type { TauxEchantillonHumain } from "./types-notation.ts";

/** §7 : « 10 % par défaut » des réponses sont notées par des humains. */
export const TAUX_ECHANTILLON_SANS_RETRAIT = 0.1 as const satisfies TauxEchantillonHumain;

/** §7 : « 25 % après retrait d'un juge pour biais contrefactuel ». */
export const TAUX_ECHANTILLON_APRES_RETRAIT = 0.25 as const satisfies TauxEchantillonHumain;

/** §7 : « au-delà de 3 % », en fraction exacte. */
export const SEUIL_RETRAIT = { numerateur: 3, denominateur: 100 } as const;

/** §7 : « un sous-ensemble de 200 réponses est renoté ». */
export const TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL = 200;

/** §7 : « 300 réponses issues d'un run pilote sont doublement notées par des humains ». */
export const TAILLE_JEU_OR = 300;

/**
 * §7 : « Seuil de publication : kappa de la paire ≥ 0,75 sur la catégorie primaire », en fraction
 * exacte ; 0,75 exactement passe. Distinct du seuil du kappa de l'échantillon humain du §12
 * (`pipeline/go-no-go/kappa-echantillon.ts:SEUIL_KAPPA_ECHANTILLON`) : deux phrases du protocole, qu'un
 * amendement peut séparer. Aussi écrit dans `run.schema.json` (statut `publie` ⇒ `kappa_paire_juges`
 * ≥ 0,75) ; `tests/go-no-go/kappa-paire-jeu-or.test.ts` confronte les deux.
 */
export const SEUIL_KAPPA_PAIRE_JEU_OR = { numerateur: 3, denominateur: 4 } as const;

/** §5 : les items d'absence et fictifs constituent au moins 20 % des questions de chaque run. */
export const PART_MINIMALE_ITEMS_A_F = 0.2;

/** §5 : 80 % des questions sont reprises du run précédent, 20 % sont neuves. */
export const PART_REPRISE = 0.8;

/**
 * §4 : « Un candidat comptant moins de 10 items P vérifiés à la date du run est rapporté à part. »
 * Aussi écrit dans `run.schema.json` (lien `items_p_verifies` ↔ `sous_seuil`), qui revalide
 * l'instantané produit et lèverait si les deux divergeaient.
 */
export const SEUIL_COUVERTURE_ITEMS_P = 10;

/** §6 : « Toutes les requêtes d'un run dans une fenêtre de 48 heures », heures absolues. */
export const DUREE_FENETRE_MS = 48 * 60 * 60 * 1000;
