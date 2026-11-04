/**
 * `pnpm contestations-posterieures` — inscrit dans `run.json#/contestations_posterieures` de chaque
 * run gelé non invalide les contestations que ne porte pas le commit des données de son gel (§8,
 * recalcul (b) ; D72 (1), D73 (2) et (4)).
 *
 *   pnpm contestations-posterieures [--data=data/items] [--runs=runs] [--ecrire]
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
 * Règles (`pipeline/run/contestations-posterieures.ts`) : ajout seul, une entrée par contestation,
 * aucune entrée réécrite ; une entrée présente qui diffère de l'item arrête tout sans rien écrire.
 * Ensuite, `pnpm recalcul-b <run>` publie le recalcul (b) daté.
 *
 * Simulation par défaut ; `--ecrire` exige un arbre Git propre (les items lus sont ceux du commit
 * courant) ; rien n'est commité. N'écrit jamais dans `data/`.
 *
 * Codes de sortie : 0, ajouts écrits, simulés ou rien à ajouter ; 1, arbre sale ou refus.
 */

import { relative, resolve } from "node:path";
import { synchroniserContestationsPosterieures, type AjoutAuRun } from "../pipeline/run/contestations-posterieures.ts";
import { lireItemsData } from "../validation/io/data-items.ts";
import { analyserArguments, drapeau, texte } from "./arguments.ts";
import { commandeGit, ecriturePermise } from "./garde-fous-git.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

interface Options {
  readonly ecrire: boolean;
  readonly racine: string;
  readonly data: string;
  readonly runs: string;
}

function lireOptions(): Options {
  const table = analyserArguments(process.argv.slice(2), ["racine", "data", "runs", "ecrire"]);
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return {
    ecrire: drapeau(table, "ecrire"),
    racine,
    data: texte(table, "data", resolve(racine, "data/items")),
    runs: texte(table, "runs", resolve(racine, "runs")),
  };
}

function decrire(ajout: AjoutAuRun): string {
  const lignes = ajout.ajoutees.map((c) => `    + contestation ${c.contestation_id}, item ${c.item_id}, reçue le ${c.date_reception}`);
  return `Run ${ajout.run_id} — ${ajout.repertoire}\n${lignes.join("\n")}\n`;
}

function principal(): void {
  const options = lireOptions();
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const ajouts = synchroniserContestationsPosterieures(options.runs, options.data, lireItemsData(options.data).values(), options.ecrire);
  if (ajouts.length === 0) {
    process.stdout.write("Aucune contestation postérieure à ajouter : rien n'est écrit.\n");
    return;
  }
  process.stdout.write(ajouts.map(decrire).join(""));
  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire.\n");
    return;
  }
  const chemins = ajouts.map((ajout) => relative(options.racine, resolve(ajout.repertoire, "run.json")));
  const nombre = ajouts.reduce((total, ajout) => total + ajout.ajoutees.length, 0);
  process.stdout.write(
    `\nContestations postérieures inscrites : ${nombre} ajout(s) dans ${ajouts.length} run(s). Puis : pnpm recalcul-b <run>.\n\n` +
      commandeGit(chemins, "runs: contestations postérieures", ajouts.map((ajout) => `${ajout.run_id} : ${ajout.ajoutees.length} ajout(s)`)),
  );
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`Contestations postérieures non inscrites — ${erreur.name} :\n  ${erreur.message}\nRien n'est écrit.\n`);
  process.exitCode = 1;
}
