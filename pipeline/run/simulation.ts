/**
 * Ce qu'un run simulé exige à la lecture (décision D80). Un gel de `pnpm geler --simule`
 * (`pipeline/gel/gel-simule.ts`) porte `simule: true` dans son `run.json` ; aucun gel réel ne le
 * porte. Deux règles, et ce module est leur seul lieu :
 *
 * 1. **Une commande simulée ne lit qu'un run simulé.** `pnpm notation:dry --run` note avec des juges
 *    et un fournisseur d'existences simulés : sur un vrai gel, elle écrirait des notations et des
 *    verdicts simulés dans un run réel, où rien ne les distinguerait plus des vrais (`GelNonSimule`).
 * 2. **Les items d'un run simulé se désignent toujours.** Ils vivent dans le dépôt simulé que le gel
 *    simulé a posé (`<sortie>/depot-simule/`), jamais dans celui du projet. Sans `--depot-des-items`,
 *    la commande refuse (`ItemsDuRunSimuleNonDesignes`) au lieu de chercher des items ailleurs ; avec,
 *    le dépôt désigné passe les trois contrôles de D75 (13)
 *    (`contestations-posterieures.ts:repertoireDesItemsDesigne`) : run hors de tout dépôt Git, racine
 *    d'un dépôt, commit des données du gel dans son historique.
 */

import { lireRunJson, type RunLu } from "../../analysis/lecture-run.ts";
import { repertoireDesItemsDesigne } from "./contestations-posterieures.ts";

/** Une commande du mode simulé est lancée sur un run réel : rien n'est lu au-delà de `run.json`, rien n'est écrit. */
export class GelNonSimule extends Error {
  constructor(repertoire_run: string, commande: string) {
    super(
      `${repertoire_run} : run.json ne porte pas simule: true, ce n'est pas un gel de pnpm geler --simule. ${commande} n'accepte ` +
        `qu'un run simulé : ses juges et ses existences de liens sont simulés, et leurs écritures ne doivent jamais entrer dans un run réel (D80). Rien n'est écrit.`,
    );
    this.name = "GelNonSimule";
  }
}

/** Un run simulé sans `--depot-des-items` : ses items ne se cherchent nulle part ailleurs. */
export class ItemsDuRunSimuleNonDesignes extends Error {
  constructor(repertoire_run: string) {
    super(
      `${repertoire_run} est un run simulé (run.json porte simule: true) : ses items se lisent dans le dépôt simulé que ` +
        `pnpm geler --simule a posé à côté de lui, à désigner par --depot-des-items=<sortie>/depot-simule, jamais dans le ` +
        `dépôt du projet ni ailleurs (D80, D75 (13)). Rien n'est lu au-delà de run.json, rien n'est écrit.`,
    );
    this.name = "ItemsDuRunSimuleNonDesignes";
  }
}

export function estRunSimule(run: Pick<RunLu, "simule">): boolean {
  return run.simule === true;
}

/** `run.json` du répertoire, validé, s'il est simulé ; sinon `GelNonSimule`. */
export function exigerGelSimule(repertoire_run: string, commande: string): RunLu {
  const run = lireRunJson(repertoire_run);
  if (!estRunSimule(run)) throw new GelNonSimule(repertoire_run, commande);
  return run;
}

/** Lève `ItemsDuRunSimuleNonDesignes` si le run est simulé et qu'aucun dépôt des items n'est désigné. */
export function exigerItemsDesignesSiSimule(repertoire_run: string, depot_designe: string | null): void {
  if (depot_designe === null && estRunSimule(lireRunJson(repertoire_run))) throw new ItemsDuRunSimuleNonDesignes(repertoire_run);
}

/**
 * Le `data/items` du dépôt simulé désigné pour le run simulé de `repertoire_run` : `GelNonSimule`
 * sur un run réel, `ItemsDuRunSimuleNonDesignes` sans dépôt, puis les refus de D75 (13).
 */
export function repertoireDesItemsDuRunSimule(repertoire_run: string, depot_designe: string | null, commande: string): { readonly run: RunLu; readonly items: string } {
  const run = exigerGelSimule(repertoire_run, commande);
  if (depot_designe === null) throw new ItemsDuRunSimuleNonDesignes(repertoire_run);
  return { run, items: repertoireDesItemsDesigne(depot_designe, repertoire_run, run.versions.donnees_commit) };
}
