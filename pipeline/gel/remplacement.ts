/**
 * Le pointeur arrière d'une réexécution (décision D51 (3), §6 : « si un incident technique invalide
 * un run, le run entier est réexécuté et les deux runs sont publiés, le premier marqué invalide avec
 * la raison »).
 *
 * Un run de `type_run` `reexecution` porte `run_remplace_id`, l'identifiant du run qu'il remplace ;
 * aucun autre type ne le porte (`run.schema.json`). `pnpm geler --remplace=<id>` l'écrit, après
 * avoir vérifié que `runs/` du dépôt contient un run de cet `id` qui porte une `invalidation`. Le
 * run invalidé n'est jamais réécrit par le gel : seule la réexécution porte le lien.
 *
 * Refus nommés (`RemplacementRefuse`), tous avant le moindre appel réseau, rien n'étant écrit :
 *   - `remplace_sans_reexecution` : `--remplace` pour un autre type que `reexecution` ;
 *   - `reexecution_sans_remplace` : une `reexecution` sans `--remplace` ;
 *   - `run_remplace_introuvable` : aucun run de `runs/` ne porte cet `id` ;
 *   - `run_remplace_ambigu` : plusieurs runs de `runs/` portent cet `id` ;
 *   - `run_remplace_sans_invalidation` : le run trouvé ne porte pas d'invalidation.
 *
 * Partie pure : `exigerRemplacementDeclare` et `runRemplace`. Partie lue, mince : `lireRemplacement`,
 * qui lit `runs/` comme le choix du précédent (`precedent.ts:lireRunsDuDepot`, un run illisible y
 * est un refus `PrecedentRefuse`).
 */

import { join } from "node:path";
import { lireRunsDuDepot } from "./precedent.ts";
import type { RunDeRuns } from "./precedent.ts";
import { TYPE_REEXECUTION } from "../run/types.ts";

export type MotifRemplacement =
  | "remplace_sans_reexecution"
  | "reexecution_sans_remplace"
  | "run_remplace_introuvable"
  | "run_remplace_ambigu"
  | "run_remplace_sans_invalidation";

export class RemplacementRefuse extends Error {
  readonly motif: MotifRemplacement;

  constructor(motif: MotifRemplacement, detail: string) {
    super(`Réexécution refusée (${motif}, décision D51 (3), §6) : ${detail} Rien n'est écrit.`);
    this.name = "RemplacementRefuse";
    this.motif = motif;
  }
}

/** `--remplace` et `--type-run=reexecution` vont ensemble, ou pas du tout. */
export function exigerRemplacementDeclare(type_run: string, remplace: string | undefined): void {
  const est_reexecution = type_run === TYPE_REEXECUTION;
  if (est_reexecution && remplace === undefined) {
    throw new RemplacementRefuse("reexecution_sans_remplace", "une réexécution déclare le run invalidé qu'elle remplace : --remplace=<id> est obligatoire.");
  }
  if (!est_reexecution && remplace !== undefined) {
    throw new RemplacementRefuse("remplace_sans_reexecution", `--remplace n'est admis qu'avec --type-run=${TYPE_REEXECUTION} (reçu : ${type_run}).`);
  }
}

/** Le run de `runs/` qui porte cet `id`, invalidé ; sinon un refus nommé. */
export function runRemplace(runs: readonly RunDeRuns[], id: string): RunDeRuns {
  const trouves = runs.filter((run) => run.id === id);
  const [trouve, second] = trouves;
  if (trouve === undefined) throw new RemplacementRefuse("run_remplace_introuvable", `aucun run de runs/ ne porte l'id ${id}.`);
  if (second !== undefined) {
    throw new RemplacementRefuse("run_remplace_ambigu", `runs/${trouve.repertoire} et runs/${second.repertoire} portent tous deux l'id ${id}.`);
  }
  if (trouve.invalidation === undefined) {
    throw new RemplacementRefuse(
      "run_remplace_sans_invalidation",
      `runs/${trouve.repertoire} (id ${id}) ne porte pas d'invalidation ; pnpm run:invalider l'enregistre d'abord.`,
    );
  }
  return trouve;
}

/**
 * L'`id` à inscrire dans `run_remplace_id`, vérifié sous `runs/` de `racine`, ou `undefined` pour un
 * type de run autre que `reexecution`. Lit `runs/` seulement pour une réexécution.
 */
export function lireRemplacement(racine: string, type_run: string, remplace: string | undefined): string | undefined {
  exigerRemplacementDeclare(type_run, remplace);
  if (remplace === undefined) return undefined;
  return runRemplace(lireRunsDuDepot(join(racine, "runs")), remplace).id;
}
