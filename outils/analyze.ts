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
 * Codes de sortie : 0, le fichier est écrit ou déjà là à l'identique ; 2, la commande est mal
 * appelée, le run n'est dans aucun dépôt Git ou son dépôt n'a aucun item, un fichier du run est
 * illisible ou non conforme, une contestation postérieure connue n'y est pas inscrite, le document
 * n'est pas conforme à son schéma, ou `metriques.json` existe et diffère. Dans ces cas, rien n'est écrit.
 */

import { analyserEtEcrire, PARAMETRES_PRODUCTION } from "../analysis/analyse-du-run.ts";
import { requetesDuPlanDuRun } from "../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../pipeline/interrogation/sous-echantillon-application.ts";
import { echantillonHumainDuRun } from "../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../pipeline/notation/lectures-comparateur.ts";
import { exigerContestationsInscrites, repertoireDesItemsDuRun } from "../pipeline/run/contestations-posterieures.ts";
import { analyserArguments } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm analyze <repertoire_run> [--premier=<repertoire_run>]";

interface Demande {
  readonly repertoire: string;
  /** `null` : aucun premier run demandé, H5 sans objet. */
  readonly premier: string | null;
}

function demande(bruts: readonly string[]): Demande {
  const table = analyserArguments(bruts, ["premier"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  const premier = table.get("premier");
  if (premier === "true" || premier === "") throw new Error(`--premier attend un répertoire de run. ${USAGE}`);
  return { repertoire, premier: premier === undefined ? null : premier };
}

const LIBELLE_ISSUE = { ecrit: "écrit", inchange: "inchangé (déjà identique au recalcul)" } as const;

function principal(): void {
  try {
    const { repertoire, premier } = demande(process.argv.slice(2));
    exigerContestationsInscrites(repertoire);
    const options = {
      items: repertoireDesItemsDuRun(repertoire),
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
