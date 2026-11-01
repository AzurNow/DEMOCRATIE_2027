/**
 * Aides des tests de la garde « une réponse attend l'opérateur » (§6, protocole 0.22, D57 (2)) :
 * retirer la réponse manquante d'un run simulé et réécrire le journal de sa requête, comme le fait
 * `pnpm interrogation` quand elle reçoit une réponse sans pouvoir la stocker.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lireReponses, lireRunJson } from "../../analysis/lecture-run.ts";
import type { Reponse } from "../../analysis/types.ts";
import { JournalRequete, nomJournal } from "../../pipeline/interrogation/journal.ts";
import type { CleRequete } from "../../pipeline/interrogation/types.ts";

export function premiereManquante(repertoire_run: string): Reponse {
  const reponses = lireReponses(repertoire_run, lireRunJson(repertoire_run).id);
  const manquante = reponses.find((r) => r.contexte === "run" && r.canal === "api" && r.statut_reponse === "manquante");
  if (manquante === undefined) throw new Error("le run simulé n'a aucune réponse manquante");
  return manquante;
}

function cheminReponse(repertoire_run: string, reponse: Reponse): string {
  return join(repertoire_run, "volume", "reponses", `${reponse.id}.json`);
}

/** Retire la réponse du volume et rend ses octets, pour la réécrire comme le ferait l'opérateur. */
export function retirerReponse(repertoire_run: string, reponse: Reponse): Buffer {
  const octets = readFileSync(cheminReponse(repertoire_run, reponse));
  rmSync(cheminReponse(repertoire_run, reponse));
  return octets;
}

/** L'opérateur a stocké la réponse depuis ses octets gardés (§6). */
export function stockerReponse(repertoire_run: string, reponse: Reponse, octets: Buffer): void {
  writeFileSync(cheminReponse(repertoire_run, reponse), octets);
}

function cleDe(reponse: Reponse): CleRequete {
  if (reponse.mode === undefined) throw new Error(`réponse ${reponse.id} sans mode`);
  const { outil_id, question_id, formulation_id, echantillon } = reponse;
  return { outil_id, question_id, mode: reponse.mode, formulation_id, echantillon };
}

/** Le journal de la requête, réécrit à neuf avec une tentative ouverte (numéro 1). */
export function journalNeuf(repertoire_run: string, reponse: Reponse): JournalRequete {
  const repertoire = join(repertoire_run, "volume", "tentatives");
  const cle = cleDe(reponse);
  rmSync(join(repertoire, nomJournal(cle)), { force: true });
  const journal = new JournalRequete(repertoire, cle);
  journal.inscrireDebut(1, "2026-12-01T06:00:00+01:00", cle);
  return journal;
}
