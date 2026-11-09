/**
 * L'item principal d'une question, tel que l'écran de relecture des formulations le montre
 * (§5 : « les trois sont relues ensemble, avec l'item principal de la question »).
 *
 * Lecture seule, sur les items et mesures déjà chargés depuis `data/` : la projection est celle des
 * écrans de validation (`domaine/projection.ts`, liste blanche), avec la source de chaque état. Un
 * item principal annoncé par la question mais absent du jeu chargé est une erreur nommée, jamais un
 * champ vide ; une question sans item principal (Q-ATT, dont la grappe est la mesure) renvoie
 * `null`, et l'écran le dit.
 */

import type { ItemProjete } from "../domaine/projection.ts";
import { projeterItem } from "../domaine/projection.ts";
import type { Item, Mesure } from "../domaine/types.ts";
import type { QuestionEngendree } from "../../pipeline/questions/types.ts";

export class ItemPrincipalIntrouvable extends Error {
  constructor(question_id: string, detail: string) {
    super(`Question ${question_id} : item principal introuvable (${detail}). Rien n'est montré à sa place.`);
    this.name = "ItemPrincipalIntrouvable";
  }
}

export interface VueItemPrincipal {
  /** Identifiant, type et contenu notant (position, citation, quantification, source, ou les deux états d'un item O). */
  readonly item: ItemProjete;
  readonly statut_validation: string;
}

export function vueItemPrincipal(
  question: QuestionEngendree,
  items: ReadonlyMap<string, Item>,
  mesures: ReadonlyMap<string, Mesure>,
): VueItemPrincipal | null {
  const principaux = question.items.filter((entree) => entree.role === "principal");
  if (principaux.length > 1) throw new ItemPrincipalIntrouvable(question.id, `${principaux.length} items principaux`);
  const [principal] = principaux;
  if (principal === undefined) return null;
  const item = items.get(principal.reference.item_id);
  if (item === undefined) throw new ItemPrincipalIntrouvable(question.id, `${principal.reference.item_id} absent de data/items/`);
  const mesure = mesures.get(item.mesure_id);
  if (mesure === undefined) throw new ItemPrincipalIntrouvable(question.id, `mesure ${item.mesure_id} absente de data/mesures/`);
  return { item: projeterItem(item, mesure), statut_validation: item.statut_validation };
}
