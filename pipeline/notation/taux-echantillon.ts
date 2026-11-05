/**
 * §7 : « 10 % par défaut, 25 % après retrait d'un juge pour biais contrefactuel ». La règle vit
 * dans `analysis/parametres-protocole.ts`, une seule fois ; ce module la réexporte aux appelants du
 * gel (`pipeline/gel/assemblage.ts`) et du test contrefactuel (`contrefactuel.ts`,
 * `publication-contrefactuel.ts`, `controle-croise.ts`).
 */

export { TAUX_ECHANTILLON_APRES_RETRAIT, TAUX_ECHANTILLON_SANS_RETRAIT } from "../../analysis/parametres-protocole.ts";
