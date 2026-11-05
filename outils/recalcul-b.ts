/**
 * `pnpm recalcul-b <repertoire_run> --items=<data/items>` — le recalcul (b) du §8 mis à jour après une
 * contestation postérieure, publié dans un fichier daté à côté de `metriques.json`, qui n'est jamais
 * réécrit (§8 et §9, protocole 0.28, D70 (13) ; `analysis/recalcul-b.ts`).
 *
 *   pnpm recalcul-b runs/2026-12-01 --items=data/items
 *
 * Lit le run comme `pnpm analyze` (chaque fichier validé), ses contestations postérieures
 * (`run.json#/contestations_posterieures`) et `metriques/metriques.json` ; écrit
 * `runs/<date>/metriques/recalcul-b-<AAAA-MM-JJ>.json`, au jour du calcul (heure de Paris), validé
 * contre `schema/recalcul-b.schema.json` avant toute écriture. Ne publie rien, n'écrit rien d'autre.
 *
 * Codes de sortie : 0, le fichier est écrit ; 2, la commande est mal appelée, un fichier du run est
 * illisible ou non conforme, `metriques.json` est absent, le fichier daté du jour existe déjà, ou les
 * entrées autres que les contestations ont changé depuis `metriques.json`. Dans ces cas, rien n'est
 * écrit.
 */

import { recalculerEtEcrireB } from "../analysis/recalcul-b.ts";
import { dateParis } from "../analysis/heure-paris.ts";
import { requetesDuPlanDuRun } from "../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../pipeline/interrogation/sous-echantillon-application.ts";
import { echantillonHumainDuRun } from "../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../pipeline/notation/lectures-comparateur.ts";
import { analyserArguments, obligatoire } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm recalcul-b <repertoire_run> --items=<data/items>";

interface Demande {
  readonly repertoire: string;
  readonly items: string;
}

function demande(bruts: readonly string[]): Demande {
  const table = analyserArguments(bruts, ["items"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return { repertoire, items: obligatoire(table, "items", `les items épinglés se lisent au commit du gel. ${USAGE}`) };
}

function principal(): void {
  try {
    const { repertoire, items } = demande(process.argv.slice(2));
    const options = { items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun, sous_echantillon_application: questionsDuSousEchantillonDuRun, etats_des_lectures: etatsDesLectures };
    const { chemin, document } = recalculerEtEcrireB(repertoire, options, dateParis(Date.now()));
    const identique = (document as { readonly identique_a_la_reference: boolean }).identique_a_la_reference;
    process.stdout.write(`Recalcul (b) daté — ${repertoire}\n${chemin} : écrit (${identique ? "identique" : "différent"} du (b) de metriques.json)\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Recalcul (b) non exécuté — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
