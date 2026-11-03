/**
 * Calcul et publication des diagnostics de tous les lots, logique de `pnpm diagnostics`.
 *
 * Le kappa vient de `diagnostiquerLot`, appelé exactement comme la route `diagnostic` de
 * l'interface l'appelle : mêmes items, mêmes états rejoués, même taille attendue. Un lot que l'un
 * des deux annotateurs n'a pas fini n'est pas publié ; il est seulement signalé « en attente ».
 *
 * `cloturesDesLots` lit, sur les mêmes entrées, l'instant de clôture de chaque lot, que le verdict
 * de J3 (§12, `critere-j3.ts:verdictJ3`) ordonne.
 */

import { diagnostiquerLot } from "../../validation/domaine/analyse-lot.ts";
import { clotureDuLot, type Cloture } from "../../validation/domaine/critere-j3.ts";
import { projeterDiagnostic } from "../../validation/domaine/diagnostic-publie.ts";
import { tailleAttendue } from "../../validation/domaine/lot.ts";
import type { Item, Lot } from "../../validation/domaine/types.ts";
import { chargerItemsEffectifs } from "../../validation/io/items-effectifs.ts";
import { ajouterDiagnostic, type IssueEcriture } from "../../validation/io/diagnostics-fichier.ts";
import { etatsDuLot } from "../../validation/io/lecture-croisee.ts";
import { lireLots } from "../../validation/io/lots-fichier.ts";
import { chargerStaging } from "../../validation/io/staging.ts";

export interface Chemins {
  readonly staging: string;
  /** `data/items/` : un item contesté après sa promotion l'est là, et sort du dénominateur (§4, 0.8). */
  readonly data: string;
  readonly lots: string;
  readonly decisions: string;
  readonly diagnostics: string;
}

export interface CompteRendu {
  readonly lot_id: string;
  readonly issue: IssueEcriture | "en_attente";
}

function publierLot(
  chemins: Chemins,
  items: ReadonlyMap<string, Item>,
  lots: readonly Lot[],
  lot: Lot,
  maintenant: string,
): CompteRendu {
  const diagnostic = diagnostiquerLot({
    lot,
    items,
    etats: etatsDuLot(chemins.decisions, lot),
    taille_attendue: tailleAttendue(lots, lot),
  });
  if (!diagnostic.les_deux_ont_fini) return { lot_id: lot.lot_id, issue: "en_attente" };
  const publie = projeterDiagnostic(diagnostic, lot, lots, maintenant);
  return { lot_id: lot.lot_id, issue: ajouterDiagnostic(chemins.diagnostics, publie) };
}

/** `maintenant` : instant du calcul, avec décalage explicite (`commun#/$defs/instant`). */
export function publierDiagnostics(chemins: Chemins, maintenant: string): readonly CompteRendu[] {
  const items = chargerItemsEffectifs(chargerStaging(chemins.staging).items, chemins.data);
  const lots = lireLots(chemins.lots);
  return lots.map((lot) => publierLot(chemins, items, lots, lot, maintenant));
}

/** La clôture de chaque lot des manifestes (§12), lue sur les journaux (`critere-j3.ts:clotureDuLot`). */
export function cloturesDesLots(chemins: Chemins): ReadonlyMap<string, Cloture> {
  const items = chargerItemsEffectifs(chargerStaging(chemins.staging).items, chemins.data);
  const clotures = new Map<string, Cloture>();
  for (const lot of lireLots(chemins.lots)) {
    clotures.set(lot.lot_id, clotureDuLot({ lot, items, etats: etatsDuLot(chemins.decisions, lot) }));
  }
  return clotures;
}
