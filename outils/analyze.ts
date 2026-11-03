/**
 * `pnpm analyze <repertoire_run> --items=<data/items>` — les analyses préenregistrées du §8 sur un
 * run noté, sur un seul partage de la population (`analysis/analyse-du-run.ts`, sous-lot A).
 *
 *   pnpm analyze runs/2026-12-01 --items=data/items
 *
 * Lit le run comme `analysis/lecture-run.ts:lireRun` (chaque fichier validé), ses notations
 * individuelles et son plan d'interrogation ; écrit `runs/<date>/metriques/metriques.json`, validé
 * contre `schema/metriques.schema.json` avant toute écriture. Ne publie rien, n'écrit rien d'autre.
 * Le fichier n'est jamais réécrit : absent, il est écrit ; identique à l'octet près, rien n'est fait,
 * et la commande le dit ; différent, la commande refuse (`MetriquesDivergentes`).
 *
 * Codes de sortie : 0, le fichier est écrit ou déjà là à l'identique ; 2, la commande est mal
 * appelée, un fichier du run est illisible ou non conforme, le document n'est pas conforme à son
 * schéma, ou `metriques.json` existe et diffère. Dans ces cas, rien n'est écrit.
 */

import { analyserEtEcrire, PARAMETRES_PRODUCTION } from "../analysis/analyse-du-run.ts";
import { requetesDuPlanDuRun } from "../pipeline/interrogation/plan-du-run.ts";
import { echantillonHumainDuRun } from "../pipeline/notation/echantillons.ts";
import { analyserArguments, obligatoire } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm analyze <repertoire_run> --items=<data/items>";

function demande(bruts: readonly string[]): { readonly repertoire: string; readonly items: string } {
  const table = analyserArguments(bruts, ["items"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return { repertoire, items: obligatoire(table, "items", `les items épinglés se lisent au commit du gel. ${USAGE}`) };
}

const LIBELLE_ISSUE = { ecrit: "écrit", inchange: "inchangé (déjà identique au recalcul)" } as const;

function principal(): void {
  try {
    const { repertoire, items } = demande(process.argv.slice(2));
    const resultat = analyserEtEcrire(repertoire, { items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun }, PARAMETRES_PRODUCTION);
    process.stdout.write(`Analyses du §8 — ${repertoire}\n${resultat.chemin} : ${LIBELLE_ISSUE[resultat.issue]}\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Analyse non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
