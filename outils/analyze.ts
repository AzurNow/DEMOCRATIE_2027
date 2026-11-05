/**
 * `pnpm analyze <repertoire_run> [--premier=<repertoire_run>]` — les analyses préenregistrées du §8
 * sur un run noté, sur un seul partage de la population (`analysis/analyse-du-run.ts`).
 *
 *   pnpm analyze runs/2026-12-01
 *   pnpm analyze runs/2027-03-01 --premier=runs/2026-12-01
 *
 * Les items ne se désignent pas : ils se lisent dans le `data/items` de la racine du dépôt Git qui
 * porte le run (`pipeline/run/contestations-posterieures.ts:repertoireDesItemsDuRun`), le dépôt où se
 * relit son commit des données (`run.json#/versions/donnees_commit`). L'ancienne option `--items`
 * est refusée (`OptionsInconnues`) : un répertoire désigné à la main, vide ou d'un autre dépôt,
 * rendait muet le contrôle des contestations postérieures (DETTE 2026-11-04 n° 1). Un run hors d'un
 * dépôt Git (`DepotDuRunIntrouvable`) ou un dépôt sans item validé (`ItemsDuDepotAbsents`) est refusé.
 *
 *   pnpm analyze <repertoire_run> --depot-des-items=<racine d'un clone>
 *
 * D75 (13) : un run rangé hors de tout dépôt Git (archive Zenodo vérifiée par un tiers) lit ses
 * items dans le `data/items` du clone désigné, à trois conditions
 * (`pipeline/run/contestations-posterieures.ts:repertoireDesItemsDesigne`, `DepotDesItemsRefuse`) :
 * le run n'est dans aucun dépôt Git, le chemin est la racine d'un dépôt, et le commit des données du
 * gel est dans l'historique de son `HEAD`. Un clone sans item reste refusé (`ItemsDuDepotAbsents`).
 * Le premier run de `--premier` lit les items du même répertoire.
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
 * Avant toute lecture du run, la commande refuse (`ContestationsPosterieuresNonInscrites`) un run
 * qui n'inscrit pas toutes les contestations postérieures que portent aujourd'hui les items de son
 * dépôt, lues contre son commit des données (D73 (2) et (4) : le recalcul (b) de `metriques.json`
 * porte les contestations connues à son calcul). Lancer d'abord `pnpm contestations-posterieures --ecrire`.
 *
 * Un run simulé (`run.json` porte `simule: true`, gelé par `pnpm geler --simule`, D80) ne lit ses
 * items que dans le dépôt simulé désigné : sans `--depot-des-items`, refus avant toute autre lecture
 * (`pipeline/run/simulation.ts:ItemsDuRunSimuleNonDesignes`), jamais une recherche ailleurs. Le
 * `metriques.json` écrit est lié à ce `run.json` par `entrees.run_json_sha256`, qui couvre `simule`.
 *
 * Codes de sortie : 0, le fichier est écrit ou déjà là à l'identique ; 2, la commande est mal
 * appelée, le run n'est dans aucun dépôt Git ou son dépôt n'a aucun item, le dépôt désigné est
 * refusé (`DepotDesItemsRefuse`), un fichier du run est illisible ou non conforme, une contestation
 * postérieure connue n'y est pas inscrite, le document n'est pas conforme à son schéma, ou
 * `metriques.json` existe et diffère. Dans ces cas, rien n'est écrit.
 */

import { analyserEtEcrire, PARAMETRES_PRODUCTION } from "../analysis/analyse-du-run.ts";
import { requetesDuPlanDuRun } from "../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../pipeline/interrogation/sous-echantillon-application.ts";
import { echantillonHumainDuRun } from "../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../pipeline/notation/lectures-comparateur.ts";
import { exigerContestationsInscrites, repertoireDesItemsPourLeRun } from "../pipeline/run/contestations-posterieures.ts";
import { exigerItemsDesignesSiSimule } from "../pipeline/run/simulation.ts";
import { analyserArguments, type Arguments } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm analyze <repertoire_run> [--premier=<repertoire_run>] [--depot-des-items=<racine d'un clone>]";

interface Demande {
  readonly repertoire: string;
  /** `null` : aucun premier run demandé, H5 sans objet. */
  readonly premier: string | null;
  /** `null` : les items se déduisent du dépôt du run (D75 (13)). */
  readonly depot: string | null;
}

/** La valeur de `--<cle>`, `null` sans l'option ; une option sans valeur est refusée. */
function chemin(table: Arguments, cle: string, attendu: string): string | null {
  const valeur = table.get(cle);
  if (valeur === "true" || valeur === "") throw new Error(`--${cle} attend ${attendu}. ${USAGE}`);
  return valeur === undefined ? null : valeur;
}

function demande(bruts: readonly string[]): Demande {
  const table = analyserArguments(bruts, ["premier", "depot-des-items"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return { repertoire, premier: chemin(table, "premier", "un répertoire de run"), depot: chemin(table, "depot-des-items", "la racine d'un clone Git du projet") };
}

const LIBELLE_ISSUE = { ecrit: "écrit", inchange: "inchangé (déjà identique au recalcul)" } as const;

function principal(): void {
  try {
    const { repertoire, premier, depot } = demande(process.argv.slice(2));
    exigerItemsDesignesSiSimule(repertoire, depot);
    exigerContestationsInscrites(repertoire, depot);
    const options = {
      items: repertoireDesItemsPourLeRun(repertoire, depot),
      plan_du_run: requetesDuPlanDuRun,
      echantillon_humain: echantillonHumainDuRun,
      sous_echantillon_application: questionsDuSousEchantillonDuRun,
      etats_des_lectures: etatsDesLectures,
    };
    const resultat = analyserEtEcrire(repertoire, options, PARAMETRES_PRODUCTION, premier);
    process.stdout.write(`Analyses du §8 — ${repertoire}\n${resultat.chemin} : ${LIBELLE_ISSUE[resultat.issue]}\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Analyse non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
