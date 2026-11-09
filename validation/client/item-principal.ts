/**
 * L'item principal d'une question, côté écran de relecture des formulations (§5) : identifiant, type,
 * contenu notant (position, citation, quantification, source ; les deux états d'un item O ; le
 * corpus d'un item A) et statut. La paraphrase n'est pas montrée : elle est hors du contenu notant (§4).
 *
 * Pur, sans DOM (testable depuis `tests/`, comme `cases-formulations.ts`) : le rendu est dans
 * `formulations.ts`, qui pose chaque valeur par `textContent`, donc rien n'est interprété comme du HTML.
 */

import type { EtatProjete, ItemPrincipalFormulations, ItemProjete } from "./types.ts";

export interface LigneItem {
  readonly libelle: string;
  readonly valeur: string;
  readonly citation?: true;
}

function lignesEtat(prefixe: string, etat: EtatProjete): LigneItem[] {
  const lignes: LigneItem[] = [
    { libelle: `${prefixe}Position`, valeur: etat.position },
    { libelle: `${prefixe}Citation`, valeur: etat.citation_verbatim, citation: true },
  ];
  if (etat.quantification !== null) lignes.push({ libelle: `${prefixe}Quantification`, valeur: JSON.stringify(etat.quantification) });
  lignes.push(
    { libelle: `${prefixe}Source`, valeur: `${etat.source.tier} · ${etat.source.date_source} · ${etat.source.url}` },
    { libelle: `${prefixe}Archive`, valeur: `${etat.source.archive_url} · SHA-256 ${etat.source.sha256}` },
  );
  return lignes;
}

function lignesContenu(item: ItemProjete): LigneItem[] {
  if (item.assertion !== null) return lignesEtat("", item.assertion);
  if (item.obsolescence !== null) {
    return [
      { libelle: "Date du changement", valeur: item.obsolescence.date_changement },
      ...lignesEtat("État antérieur — ", item.obsolescence.etat_anterieur),
      ...lignesEtat("État postérieur — ", item.obsolescence.etat_posterieur),
    ];
  }
  if (item.absence !== null) {
    return [
      { libelle: "Examen mené le", valeur: item.absence.date_examen },
      { libelle: "Corpus examiné", valeur: item.absence.corpus_examine.map((entree) => `${entree.tier} ${entree.url}`).join(" ; ") },
    ];
  }
  return [{ libelle: "Mesure fictive", valeur: item.mesure.formulation_canonique }];
}

export function lignesItemPrincipal(vue: ItemPrincipalFormulations): LigneItem[] {
  const { item } = vue;
  return [
    { libelle: "Identifiant", valeur: item.id },
    { libelle: "Type", valeur: item.type },
    { libelle: "Statut de validation", valeur: vue.statut_validation },
    { libelle: "Validité", valeur: `du ${item.valide_du} au ${item.valide_au ?? "(sans fin)"}` },
    ...lignesContenu(item),
  ];
}

/** Une question d'attribution n'a pas d'item principal (§5) : l'écran le dit au lieu de rester muet. */
export const SANS_ITEM_PRINCIPAL = "Question d'attribution : elle n'a pas d'item principal (sa grappe est la mesure).";

