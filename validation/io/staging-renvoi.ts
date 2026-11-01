/**
 * La seule écriture de l'outillage de validation dans `staging/` : la réécriture d'un item en attente,
 * après une correction de thème acceptée (protocole 0.13, §4 ; `domaine/renvoi-mesure.ts`) ou un
 * rattachement à une autre mesure (décision D53 (1) ; `domaine/rattachements-item.ts`).
 *
 * `staging/` est l'endroit où vit l'item en attente, et c'est donc là qu'il retourne : les items
 * publiés ne sont jamais touchés (règle 3 de `CLAUDE.md`, contrôlée par `tests/ecriture-data.test.ts`). L'écriture est gardée comme celle de
 * `data-items.ts` : l'item sur disque doit être celui qui a été lu (même version, même empreinte,
 * même épinglage de mesure), l'item écrit est confronté à `item.schema.json`, et la pose est
 * atomique (temporaire puis renommage).
 */

import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonDe, valider } from "../../outils/schemas/valider.ts";
import type { Item } from "../domaine/types.ts";

export class ItemStagingModifie extends Error {
  constructor(chemin: string) {
    super(`${chemin} a changé depuis sa lecture. Rien n'est écrit : relancer la commande, qui relira l'état courant.`);
    this.name = "ItemStagingModifie";
  }
}

function cheminStaging(racine_staging: string, item_id: string): string {
  return join(racine_staging, "items", `${item_id}.json`);
}

function memeEtat(lu: Item, avant: Item): boolean {
  return lu.version === avant.version && lu.empreinte === avant.empreinte && lu.mesure_version === avant.mesure_version;
}

function verifierInchange(chemin: string, avant: Item): void {
  const lu = valider<Item>("item", jsonDe(readFileSync(chemin, "utf8"), chemin), chemin);
  if (!memeEtat(lu, avant)) throw new ItemStagingModifie(chemin);
}

/** Remplace `avant` par `apres` dans `staging/items/`, si le fichier porte toujours `avant`. */
export function reecrireItemStaging(racine_staging: string, avant: Item, apres: Item): void {
  if (apres.id !== avant.id) throw new Error(`Réécriture de ${avant.id} par un autre item (${apres.id}).`);
  const chemin = cheminStaging(racine_staging, avant.id);
  valider("item", apres, `item à réécrire dans ${chemin}`);

  const tmp = join(racine_staging, "items", `.${avant.id}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(apres, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    // Vérifié au dernier moment, juste avant la pose : la fenêtre entre lecture et renommage reste minimale.
    verifierInchange(chemin, avant);
    renameSync(tmp, chemin);
  } finally {
    rmSync(tmp, { force: true });
  }
}
