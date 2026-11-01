/**
 * Une mesure fictive porte un seul item fictif.
 *
 * §5 (protocole 0.9) : « Une mesure fictive porte un seul item fictif : pour éprouver la même
 * invention chez deux candidats, on déclare deux mesures. » La question d'attribution d'une mesure
 * fictive a son item F pour principal ; deux items F sur la même mesure lui en donneraient deux
 * (`pipeline/questions/engendrement.ts:AttributionFictiveAmbigue`).
 *
 * La règle vit ici une fois. Elle est lue à la promotion vers `data/` (`outils/promote.ts`, qui
 * refuse le second item F vérifié) et par les invariants inter-fichiers de `pnpm symmetry`
 * (`pipeline/questions/invariants.ts`). Seuls les items F vérifiés comptent : un item rejeté ou en
 * attente n'engendre aucune question.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { Item } from "./types.ts";

/** Ce que la règle lit d'un item. */
export type ItemFictifCandidat = Pick<Item, "id" | "type" | "mesure_id" | "statut_validation">;

/** Le second item F vérifié d'une mesure fictive déjà portée : refus nommé, jamais un choix. */
export class ItemFictifEnDouble extends Error {
  readonly mesure_id: string;
  readonly item_ids: readonly string[];

  constructor(mesure_id: string, item_ids: readonly string[]) {
    super(
      `ItemFictifEnDouble : la mesure fictive ${mesure_id} porterait ${item_ids.length} items fictifs vérifiés ` +
        `(${item_ids.join(", ")}). Une mesure fictive porte un seul item fictif (§5, protocole 0.9) : ` +
        `déclarer une mesure par item.`,
    );
    this.name = "ItemFictifEnDouble";
    this.mesure_id = mesure_id;
    this.item_ids = item_ids;
  }
}

function estFictifVerifie(item: ItemFictifCandidat): boolean {
  return item.type === "F" && item.statut_validation === "verifie";
}

/**
 * Les mesures portées par plus d'un item F vérifié, avec leurs items triés. Un même identifiant vu
 * deux fois (le même item des deux côtés d'une promotion) ne compte qu'une fois. Ordre des mesures
 * trié : le rapport ne dépend pas de l'ordre des fichiers.
 */
export function fictifsEnDouble(items: readonly ItemFictifCandidat[]): ReadonlyMap<string, readonly string[]> {
  const parMesure = new Map<string, Set<string>>();
  for (const item of items.filter(estFictifVerifie)) {
    const groupe = parMesure.get(item.mesure_id);
    if (groupe === undefined) parMesure.set(item.mesure_id, new Set([item.id]));
    else groupe.add(item.id);
  }
  return new Map(
    [...parMesure.entries()]
      .filter(([, ids]) => ids.size > 1)
      .sort(([a], [b]) => comparerChaines(a, b))
      .map(([mesure_id, ids]) => [mesure_id, [...ids].sort()]),
  );
}

/**
 * Garde de la promotion : les items à promouvoir, ajoutés à ceux déjà dans `data/`, ne font porter
 * à aucune mesure fictive un second item F vérifié. Lève `ItemFictifEnDouble` sur la première
 * mesure fautive.
 */
export function verifierFictifUnique(
  aPromouvoir: readonly ItemFictifCandidat[],
  dejaPromus: readonly ItemFictifCandidat[],
): void {
  const [premier] = fictifsEnDouble([...dejaPromus, ...aPromouvoir]);
  if (premier !== undefined) throw new ItemFictifEnDouble(premier[0], premier[1]);
}
