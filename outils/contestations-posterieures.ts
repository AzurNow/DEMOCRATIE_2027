/**
 * `pnpm contestations-posterieures` — inscrit dans `run.json#/contestations_posterieures` de chaque
 * run gelé non invalide les contestations que ne porte pas le commit des données de son gel (§8,
 * recalcul (b) ; D72 (1), D73 (2) et (4)).
 *
 *   pnpm contestations-posterieures [<repertoire_runs>] [--ecrire]
 *   pnpm contestations-posterieures [<repertoire_runs>] --depot-des-items=<racine d'un clone>
 *
 * Lancée après le commit d'une contestation (`pnpm contester`), après chaque gel, et toujours avant
 * `pnpm analyze`, qui refuse un run où manque une contestation postérieure connue
 * (`ContestationsPosterieuresNonInscrites`) : elle relit toutes les contestations des items publiés
 * et ajoute à chaque run `planifie`, `en_cours`, `publie` ou `publie_provisoire` celles que
 * `data/items` ne porte pas au commit `run.json#/versions/donnees_commit` (relu en Git, en local),
 * quelle que soit leur date de réception, item hors tirage compris. Un run `invalide` ne reçoit
 * rien. Elle est idempotente : relancée, elle n'ajoute rien de plus. Une commande à part plutôt
 * qu'une étape de `pnpm contester`, parce qu'un run peut être gelé après une contestation sans que
 * son commit des données la porte : la relance après le gel l'y inscrit.
 *
 * `<repertoire_runs>` : le répertoire des runs, `runs/` du projet s'il est omis. Les items ne se
 * désignent pas (D75 (12), DETTE 2026-11-04 n° 1) : ceux de chaque run se lisent dans le
 * `data/items` de la racine du dépôt Git qui le porte (`repertoireDesItemsDuRun`), comme pour
 * `pnpm analyze`. Les anciennes options `--data`, `--racine` et `--runs` sont refusées
 * (`OptionRetiree`), jamais ignorées.
 *
 * `--depot-des-items` (D75 (13)) : pour vérifier des runs rangés hors de tout dépôt Git (archive
 * Zenodo), le `data/items` d'un clone désigné, à trois conditions (`repertoireDesItemsDesigne`) :
 * aucun run n'est dans un dépôt Git, le chemin est la racine d'un dépôt, et le commit des données du
 * gel de chaque run est dans l'historique de son `HEAD`. Ce clone ne fait que simuler : `--ecrire`
 * avec lui est refusé, puisque les contestations s'inscrivent dans le dépôt du run, et s'y commitent.
 *
 * Règles (`pipeline/run/contestations-posterieures.ts`) : ajout seul, une entrée par contestation,
 * aucune entrée réécrite ; une entrée présente qui diffère de l'item arrête tout sans rien écrire.
 * Ensuite, `pnpm recalcul-b <run>` publie le recalcul (b) daté.
 *
 * Simulation par défaut ; `--ecrire` exige un arbre Git propre dans le dépôt des runs (les items lus
 * sont ceux du commit courant) ; rien n'est commité. N'écrit jamais dans `data/`.
 *
 * Codes de sortie : 0, ajouts écrits, simulés ou rien à ajouter ; 1, arbre sale ou refus (dépôt
 * introuvable, items absents, dépôt désigné refusé, divergence…) ; 2, commande mal appelée (option
 * retirée ou inconnue, plus d'un répertoire, `--depot-des-items` sans valeur ou avec `--ecrire`).
 */

import { realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { racineDuDepotDuRun, synchroniserContestationsPosterieures, type AjoutAuRun } from "../pipeline/run/contestations-posterieures.ts";
import { analyserArguments, drapeau, type Arguments } from "./arguments.ts";
import { commandeGit, ecriturePermise } from "./garde-fous-git.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm contestations-posterieures [<repertoire_runs>] [--ecrire | --depot-des-items=<racine d'un clone>]";

const RUNS_DU_PROJET = resolve(import.meta.dirname, "..", "runs");

/** D75 (12) : les options retirées, chacune avec ce qui la remplace. */
const OPTIONS_RETIREES: ReadonlyMap<string, string> = new Map([
  ["data", "les items de chaque run se lisent dans le data/items du dépôt Git qui le porte"],
  ["racine", "la racine est celle du dépôt Git qui porte les runs"],
  ["runs", "le répertoire des runs se donne en argument, sans option"],
]);

/** Une option retirée (D75 (12)) : refusée avec ce qui la remplace, jamais ignorée. */
class OptionRetiree extends Error {
  constructor(retirees: readonly string[]) {
    super(
      `${retirees.map((cle) => `--${cle} n'existe plus (${OPTIONS_RETIREES.get(cle) as string})`).join(" ; ")}. ` +
        `Un répertoire d'items désigné à la main rendait muet le contrôle des contestations postérieures ` +
        `(DETTE 2026-11-04 n° 1). ${USAGE}`,
    );
    this.name = "OptionRetiree";
  }
}

class CommandeMalAppelee extends Error {
  constructor(message: string) {
    super(`${message} ${USAGE}`);
    this.name = "CommandeMalAppelee";
  }
}

/** Les refus d'appel, avant toute lecture : code 2 ; tout autre refus, code 1. */
const REFUS_D_APPEL: ReadonlySet<string> = new Set(["OptionRetiree", "OptionsInconnues", "CommandeMalAppelee"]);

interface Options {
  readonly ecrire: boolean;
  readonly runs: string;
  /** `null` : les items de chaque run se déduisent de son dépôt. */
  readonly depot: string | null;
}

function refuserLesOptionsRetirees(bruts: readonly string[]): void {
  const cles = bruts.filter((argument) => argument.startsWith("--")).map((argument) => argument.slice(2).split("=")[0] as string);
  const retirees = cles.filter((cle) => OPTIONS_RETIREES.has(cle));
  if (retirees.length > 0) throw new OptionRetiree(retirees);
}

function depotDesigne(table: Arguments): string | null {
  const depot = table.get("depot-des-items");
  if (depot === undefined) return null;
  if (depot === "true" || depot === "") throw new CommandeMalAppelee("--depot-des-items attend la racine d'un clone Git du projet.");
  return resolve(depot);
}

function lireOptions(bruts: readonly string[]): Options {
  refuserLesOptionsRetirees(bruts);
  const table = analyserArguments(bruts, ["ecrire", "depot-des-items"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  if (positionnels.length > 1) throw new CommandeMalAppelee("un seul répertoire de runs est attendu.");
  const ecrire = drapeau(table, "ecrire");
  const depot = depotDesigne(table);
  if (ecrire && depot !== null) {
    throw new CommandeMalAppelee("--ecrire et --depot-des-items s'excluent : un run hors de son dépôt se vérifie, ses contestations s'inscrivent et se commitent dans son dépôt.");
  }
  const [runs] = positionnels;
  return { ecrire, runs: runs === undefined ? RUNS_DU_PROJET : resolve(runs), depot };
}

function decrire(ajout: AjoutAuRun): string {
  const lignes = ajout.ajoutees.map((c) => `    + contestation ${c.contestation_id}, item ${c.item_id}, reçue le ${c.date_reception}`);
  return `Run ${ajout.run_id} — ${ajout.repertoire}\n${lignes.join("\n")}\n`;
}

function signer(racine: string, ajouts: readonly AjoutAuRun[]): string {
  const reelle = realpathSync.native(racine);
  const chemins = ajouts.map((ajout) => relative(reelle, realpathSync.native(join(ajout.repertoire, "run.json"))));
  const nombre = ajouts.reduce((total, ajout) => total + ajout.ajoutees.length, 0);
  return (
    `\nContestations postérieures inscrites : ${nombre} ajout(s) dans ${ajouts.length} run(s). Puis : pnpm recalcul-b <run>.\n\n` +
    commandeGit(chemins, "runs: contestations postérieures", ajouts.map((ajout) => `${ajout.run_id} : ${ajout.ajoutees.length} ajout(s)`))
  );
}

function principal(): void {
  const options = lireOptions(process.argv.slice(2));
  const racine = options.ecrire ? racineDuDepotDuRun(options.runs) : null;
  if (racine !== null && !ecriturePermise(racine)) return;
  const ajouts = synchroniserContestationsPosterieures(options.runs, options.depot, options.ecrire);
  if (ajouts.length === 0) {
    process.stdout.write("Aucune contestation postérieure à ajouter : rien n'est écrit.\n");
    return;
  }
  process.stdout.write(ajouts.map(decrire).join(""));
  if (racine === null) {
    const suite = options.depot === null ? "Ajouter --ecrire." : "Ces contestations s'inscrivent dans le dépôt du run, par --ecrire, et s'y commitent.";
    process.stdout.write(`\nSimulation : rien n'a été écrit. ${suite}\n`);
    return;
  }
  process.stdout.write(signer(racine, ajouts));
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`Contestations postérieures non inscrites — ${erreur.name} :\n  ${erreur.message}\nRien n'est écrit.\n`);
  process.exitCode = REFUS_D_APPEL.has(erreur.name) ? 2 : 1;
}
