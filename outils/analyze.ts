/**
 * `pnpm analyze <repertoire_run> --items=<data/items> [--premier=<repertoire_run>]` — les analyses
 * préenregistrées du §8 sur un run noté, sur un seul partage de la population
 * (`analysis/analyse-du-run.ts`).
 *
 *   pnpm analyze runs/2026-12-01 --items=data/items
 *   pnpm analyze runs/2027-03-01 --items=data/items --premier=runs/2026-12-01
 *
 * Lit le run comme `analysis/lecture-run.ts:lireRun` (chaque fichier validé), ses notations
 * individuelles et son plan d'interrogation ; écrit `runs/<date>/metriques/metriques.json`, validé
 * contre `schema/metriques.schema.json` avant toute écriture. Ne publie rien, n'écrit rien d'autre.
 * Le fichier n'est jamais réécrit : absent, il est écrit ; identique à l'octet près, rien n'est fait,
 * et la commande le dit ; différent, la commande refuse (`MetriquesDivergentes`).
 *
 * `--premier` désigne le premier run de la tendance (§8, QR7, H5), lu et validé de la même façon,
 * avec son propre partage. Sans lui, H5 est publiée « sans objet » (`premier_run_absent`).
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

const USAGE = "usage : pnpm analyze <repertoire_run> --items=<data/items> [--premier=<repertoire_run>]";

interface Demande {
  readonly repertoire: string;
  readonly items: string;
  /** `null` : aucun premier run demandé, H5 sans objet. */
  readonly premier: string | null;
}

function demande(bruts: readonly string[]): Demande {
  const table = analyserArguments(bruts, ["items", "premier"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  const premier = table.get("premier");
  if (premier === "true" || premier === "") throw new Error(`--premier attend un répertoire de run. ${USAGE}`);
  return {
    repertoire,
    items: obligatoire(table, "items", `les items épinglés se lisent au commit du gel. ${USAGE}`),
    premier: premier === undefined ? null : premier,
  };
}

const LIBELLE_ISSUE = { ecrit: "écrit", inchange: "inchangé (déjà identique au recalcul)" } as const;

function principal(): void {
  try {
    const { repertoire, items, premier } = demande(process.argv.slice(2));
    const options = { items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun };
    const resultat = analyserEtEcrire(repertoire, options, PARAMETRES_PRODUCTION, premier);
    process.stdout.write(`Analyses du §8 — ${repertoire}\n${resultat.chemin} : ${LIBELLE_ISSUE[resultat.issue]}\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Analyse non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
