/**
 * `pnpm interrogation:attente --run=<repertoire_run>` — la garde du §6 (protocole 0.22, D57 (2)) :
 * « ni le test des liens ni la notation (section 7) ne commencent » tant qu'une réponse attend
 * l'opérateur. Fine enveloppe de `pipeline/interrogation/attente-operateur.ts`, appelée par
 * `pnpm liens` (Python) pour ne pas réécrire en Python la lecture du journal de tentatives.
 *
 * Codes de sortie : 0, aucune requête n'attend l'opérateur ; 2, au moins une attend (la liste est
 * sur la sortie d'erreur), `--run` est absent, ou le répertoire, le run ou son plan sont illisibles
 * ou refusés. Rien n'est jamais écrit.
 */

import { existsSync } from "node:fs";
import { exigerAucuneAttenteDuRun } from "../pipeline/interrogation/attente-operateur.ts";
import { analyserArguments } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm interrogation:attente --run=<repertoire_run>";

function repertoireDemande(bruts: readonly string[]): string {
  const run = analyserArguments(bruts, ["run"]).get("run");
  if (run === undefined || run === "true" || run.length === 0) throw new Error(`--run est obligatoire. ${USAGE}`);
  if (!existsSync(run)) throw new Error(`le répertoire du run n'existe pas : ${run}. ${USAGE}`);
  return run;
}

function principal(): void {
  try {
    const repertoire = repertoireDemande(process.argv.slice(2));
    exigerAucuneAttenteDuRun(repertoire, "liens");
    process.stdout.write(`Aucune réponse n'attend l'opérateur — ${repertoire}\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Attente de l'opérateur — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
