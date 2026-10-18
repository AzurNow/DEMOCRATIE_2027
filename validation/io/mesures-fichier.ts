/**
 * Le registre des corrections de thème sur disque : `validation/mesures/decisions.json`.
 *
 * Deux propriétés, sur le modèle du journal des annotateurs :
 *
 * 1. **Ajout seul.** Ce module n'expose aucune fonction de modification ni de suppression. Une
 *    décision écrite reste au registre ; un revirement de l'auteur est une entrée de plus, et
 *    c'est la plus récente qui fait foi (`domaine/corrections-mesure.ts`). Le registre est
 *    publié : l'historique des arbitrages de thème en fait partie.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande. Ignorer une ligne fautive ferait disparaître un arbitrage
 *    sans que personne ne le sache, et un item serait promu ou retenu sans raison traçable.
 *
 * Chaque entrée est confrontée à `decision-mesure.schema.json`, à la lecture comme avant
 * l'écriture, puis à `validerEntreeRegistre`, qui en construit la valeur typée.
 *
 * Un fichier **absent** est en revanche un registre vide, et non une erreur : aucune décision
 * n'a encore été prise. C'est une absence, pas une donnée manquante.
 *
 * L'écriture est atomique (temporaire puis renommage), refusée si le fichier a changé depuis sa
 * lecture, et le registre est relu après la pose : `registre-ajout-seul.ts`, générique, partagé
 * avec les registres des relectures et des rattachements.
 */

import { join } from "node:path";
import {
  validerEntreeRegistre,
  type DecisionCorrectionMesure,
  type RegistreCorrectionsMesure,
} from "../domaine/corrections-mesure.ts";
import { ajouterAuRegistreGenerique, lireRegistreGenerique, type DefinitionRegistre } from "./registre-ajout-seul.ts";

export const NOM_FICHIER_REGISTRE = "decisions.json";

export function cheminRegistre(repertoire: string): string {
  return join(repertoire, NOM_FICHIER_REGISTRE);
}

export class RegistreIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(
      `Registre des corrections de mesure illisible : ${chemin}\n${detail}\n` +
        `Rien n'est réparé automatiquement : ce fichier est la trace publiée des arbitrages de ` +
        `thème, et une entrée perdue serait un item promu ou retenu sans raison connue.`,
    );
    this.name = "RegistreIllisible";
  }
}

const DEFINITION: DefinitionRegistre<DecisionCorrectionMesure> = {
  schema: "decision-mesure",
  validerEntree: validerEntreeRegistre,
  creerIllisible: (chemin, detail) => new RegistreIllisible(chemin, detail),
};

export function lireRegistre(repertoire: string): RegistreCorrectionsMesure {
  return lireRegistreGenerique(cheminRegistre(repertoire), DEFINITION);
}

/**
 * Ajoute une décision en fin de registre ; le crée s'il est absent. Les entrées antérieures sont
 * relues, validées et réécrites telles quelles, dans leur ordre : la réécriture n'est qu'un ajout.
 * Rend le registre relu après la pose.
 */
export function ajouterAuRegistre(
  repertoire: string,
  entree: DecisionCorrectionMesure,
): RegistreCorrectionsMesure {
  return ajouterAuRegistreGenerique(cheminRegistre(repertoire), entree, DEFINITION);
}
