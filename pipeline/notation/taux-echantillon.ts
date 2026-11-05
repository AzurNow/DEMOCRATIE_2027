/**
 * §7 : « 10 % par défaut, 25 % après retrait d'un juge pour biais contrefactuel ». La règle vit ici,
 * une seule fois : le gel (`pipeline/gel/assemblage.ts`) inscrit le taux sans retrait, aucun juge
 * n'étant retiré au gel ; le test contrefactuel (`contrefactuel.ts`, `publication-contrefactuel.ts`)
 * inscrit le taux du run noté ; le contrôle croisé (`controle-croise.ts`) le revérifie.
 */

import type { TauxEchantillonHumain } from "../../analysis/types-notation.ts";

export const TAUX_ECHANTILLON_SANS_RETRAIT = 0.1 as const satisfies TauxEchantillonHumain;

export const TAUX_ECHANTILLON_APRES_RETRAIT = 0.25 as const satisfies TauxEchantillonHumain;
