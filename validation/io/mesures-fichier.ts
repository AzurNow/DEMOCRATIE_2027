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
 * lecture, et le registre est relu après la pose (`poserRegistreAjoutSeul`, partagée avec les
 * registres des relectures et des rattachements, `relectures-fichier.ts`).
 */

import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import {
  validerEntreeRegistre,
  type DecisionCorrectionMesure,
  type RegistreCorrectionsMesure,
} from "../domaine/corrections-mesure.ts";
import { poserRegistreAjoutSeul, texteDuRegistre } from "./relectures-fichier.ts";

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

export function lireRegistre(repertoire: string): RegistreCorrectionsMesure {
  const chemin = cheminRegistre(repertoire);
  const texte = texteDuRegistre(chemin);
  return texte === null ? [] : entreesDe(texte, chemin);
}

function entreesDe(texte: string, chemin: string): RegistreCorrectionsMesure {
  return analyser(texte, chemin).map((valeur, index) => validerEntree(valeur, `${chemin}, entrée ${index + 1}`));
}

function validerEntree(valeur: unknown, provenance: string): DecisionCorrectionMesure {
  return validerEntreeRegistre(valider("decision-mesure", valeur, provenance), provenance);
}

function analyser(contenu: string, chemin: string): readonly unknown[] {
  const valeur = tenterJson(contenu, chemin);
  if (!Array.isArray(valeur)) throw new RegistreIllisible(chemin, "Le registre est un tableau JSON.");
  return valeur;
}

function tenterJson(contenu: string, chemin: string): unknown {
  try {
    return JSON.parse(contenu);
  } catch (erreur) {
    throw new RegistreIllisible(chemin, erreur instanceof Error ? erreur.message : String(erreur));
  }
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
  const chemin = cheminRegistre(repertoire);
  const validee = validerEntree(entree, `décision à enregistrer dans ${chemin}`);
  const lu = texteDuRegistre(chemin);
  const registre = [...(lu === null ? [] : entreesDe(lu, chemin)), validee];
  poserRegistreAjoutSeul(chemin, lu, registre);
  const relu = lireRegistre(repertoire);
  if (relu.length !== registre.length) {
    throw new RegistreIllisible(chemin, `Relu après écriture : ${relu.length} entrée(s), ${registre.length} attendue(s).`);
  }
  return relu;
}
