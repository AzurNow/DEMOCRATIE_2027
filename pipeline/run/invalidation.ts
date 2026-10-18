/**
 * `pnpm run:invalider` sans la ligne de commande (décision D51 (2), §6) : lit `run.json`, pose
 * l'invalidation par la transition pure (`statut.ts:invalider`), valide le run contre son schéma et
 * l'écrit par renommage (`ecriture.ts`). Le statut n'est pas touché : `invalide` s'écrit avec le
 * dépôt (§12), dans une étape de publication ultérieure.
 *
 * Rien n'est écrit si la transition est refusée, ni si l'invalidation est déjà là à l'identique
 * (`deja_inscrite`, règle 7). La date est l'instant `maintenant_ms`, écrit à l'heure de Paris.
 */

import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { instantParis } from "../interrogation/heure-paris.ts";
import { ecrireParRenommage } from "./ecriture.ts";
import { invalider } from "./statut.ts";

export interface ResultatInvalidation {
  readonly issue: "inscrite" | "deja_inscrite";
  readonly run_id: string;
  readonly statut: string;
  readonly date: string;
}

export function invaliderRun(repertoire_run: string, motif: string, maintenant_ms: number): ResultatInvalidation {
  const run = lireRunJson(repertoire_run);
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const date = instantParis(maintenant_ms);
  const issue = invalider(run, motif, date);
  // D54 (5) : déjà inscrite ⇒ la date rendue est celle déjà inscrite, jamais celle de cet appel.
  if (issue.issue === "deja_inscrite") return { issue: issue.issue, run_id: run.id, statut: run.statut, date: issue.date };
  ecrireParRenommage(chemin, valider<unknown>("run", issue.run, `${chemin} après invalidation`), "invalidation");
  return { issue: issue.issue, run_id: run.id, statut: run.statut, date };
}
