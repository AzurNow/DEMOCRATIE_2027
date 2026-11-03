/**
 * Les candidats éliminés au premier tour (§3 « Entre les deux tours », §7 ; protocole 0.28, D70 (7)).
 *
 * « Le régime `entre_deux_tours` commence à la proclamation des résultats du premier tour […] : le
 * périmètre est alors exactement les deux candidats qualifiés pour le second tour […]. Les candidats
 * éliminés au premier tour restent dans le jeu de données, et aucune question ne les nomme plus,
 * comme un candidat retiré. » Le chargeur du périmètre (`pipeline/questions/charger-perimetre.ts`,
 * `motifsQualifies`, D68) les porte au périmètre du run avec `statut_au_gel: retire` et
 * `interroge: false`. Un éliminé est donc, et seulement, un candidat retiré du périmètre d'un run
 * dont le régime en admet : la distinction se lit sur le régime et le statut, jamais sur un nom.
 *
 * **Ce qui en dépend.** Le test contrefactuel ne lit pas cet ensemble : un éliminé, non interrogé,
 * y est cherché sans être remplacé comme tout non-interrogé (`permutation.ts`, `derangement.ts`).
 * La note d'une question d'attribution le lit : « le nom d'un candidat éliminé au premier tour n'est
 * pas une erreur, sur une mesure réelle comme sur une mesure fictive : il est écarté des candidats
 * cités avant l'application de la règle » (§7, `note-attribution.ts`).
 */

import { estInterroge } from "../../analysis/candidats-interroges.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { RegimeInclusion, StatutAuGel } from "../questions/types.ts";

/** La part du périmètre au gel (`run.json#/perimetre`) que lit cette règle. */
export interface PerimetreAuGel {
  readonly regime_inclusion: RegimeInclusion;
  readonly candidats: readonly { readonly candidat_id: string; readonly statut_au_gel: StatutAuGel; readonly interroge: boolean }[];
}

/**
 * Vrai pour le régime où un candidat retiré du périmètre est un éliminé du premier tour. Avant la
 * liste et sur la liste, un retiré reste un retiré, et un retiré cité sur une question
 * d'attribution reste un candidat du périmètre non interrogé (§7, annexe B).
 */
const RETIRES_ELIMINES: Readonly<Record<RegimeInclusion, boolean>> = {
  avant_liste_officielle: false,
  liste_officielle: false,
  entre_deux_tours: true,
};

export class ElimineInterroge extends Error {
  constructor(candidat_id: string) {
    super(`${candidat_id} : éliminé au premier tour mais interroge: true ; §3, aucune question ne le nomme plus.`);
    this.name = "ElimineInterroge";
  }
}

/** Les identifiants des éliminés du premier tour, triés (`comparerChaines`) ; vide hors du régime `entre_deux_tours`. */
export function candidatsElimines(perimetre: PerimetreAuGel): readonly string[] {
  if (!RETIRES_ELIMINES[perimetre.regime_inclusion]) return [];
  const elimines = perimetre.candidats.filter((candidat) => candidat.statut_au_gel === "retire");
  const interroge = elimines.find(estInterroge);
  if (interroge !== undefined) throw new ElimineInterroge(interroge.candidat_id);
  return elimines.map((candidat) => candidat.candidat_id).sort(comparerChaines);
}
