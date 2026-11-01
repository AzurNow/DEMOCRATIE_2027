/**
 * `pnpm interrogation:stocker` — l'opérateur stocke les réponses en attente d'un run depuis leurs
 * octets gardés, une fois la cause corrigée (§6, 0.21 ; `pipeline/interrogation/stocker.ts`).
 *
 *   pnpm interrogation:stocker --run=<répertoire> [--requete=<clé>]
 *
 * `--run` : le répertoire d'un run gelé (`pnpm geler --sortie`), interrogé par `pnpm run:dry --run`,
 * relu et vérifié comme par celui-ci (`run-gele.ts`), jamais sous `runs/`. Seul run interrogeable
 * aujourd'hui, il l'a été par l'éditeur simulé : les adaptateurs sont ceux des profils simulés
 * (`tests/interrogation/fixtures/run-gele/profils-simules.json`), comme pour `pnpm run:dry --run`.
 * Chaque réception gardée nomme l'adaptateur qui a reçu ses octets (`normalisation`) : des octets
 * reçus par un autre adaptateur, celui d'un éditeur réel par exemple, sont refusés
 * (`adaptateur_different`), jamais classés par l'éditeur simulé.
 * `--requete` : la clé d'une seule requête, l'empreinte qui nomme son journal et ses octets gardés
 * sous `volume/tentatives/` (`<clé>.jsonl`, `<clé>.<n>.octets`) ; absente, toutes celles du plan.
 *
 * Chaque requête en attente passe par le chemin de stockage du run : réponse obtenue écrite à
 * l'instant de réception d'origine, ou, si l'adaptateur la classe en échec (503, quota…), échec
 * inscrit au journal comme au chemin normal — la relance ordinaire (`pnpm run:dry --run`) la reprend
 * alors. Rien n'est envoyé, `run.json` n'est pas réécrit, octets et réceptions gardés ne sont jamais
 * modifiés (règle 7).
 *
 * Codes de sortie :
 * - 0 : chaque requête en attente est stockée ou conclue en échec, ou il n'y avait rien à faire ;
 * - 2 : une requête au moins reste en attente (refus nommé, avec sa cause : sans octets, sans
 *   métadonnées de réception, adaptateur différent, réception incohérente, stockage encore
 *   impossible), ou la commande
 *   est refusée (option inconnue, requête inconnue, run refusé) sans rien écrire.
 */

import { resolve } from "node:path";
import { messageStockage } from "../pipeline/interrogation/operateur.ts";
import { stockerRunGeleSimule, type ResultatStockageGeleSimule } from "../pipeline/interrogation/run-simule.ts";
import { CODE_STOCKAGE_REFUSE, codeSortieStockage } from "../pipeline/interrogation/stocker.ts";
import { analyserArguments } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const PROFILS_RUN_GELE = resolve(import.meta.dirname, "../tests/interrogation/fixtures/run-gele/profils-simules.json");
const USAGE = "usage : pnpm interrogation:stocker --run=<répertoire> [--requete=<clé>]";

class ArgumentsStockageRefuses extends Error {
  constructor(message: string) {
    super(`${message} ${USAGE}`);
    this.name = "ArgumentsStockageRefuses";
  }
}

interface Demande {
  readonly repertoire: string;
  readonly requete?: string;
}

/** `--<nom>=<valeur>` non vide ; posée seule (`--<nom>`) ou vide, elle est refusée. */
function valeur(bruts: readonly string[], table: ReadonlyMap<string, string>, nom: string): string | undefined {
  if (bruts.includes(`--${nom}`)) throw new ArgumentsStockageRefuses(`--${nom} attend une valeur (--${nom}=<valeur>).`);
  const lue = table.get(nom);
  if (lue !== undefined && lue.length === 0) throw new ArgumentsStockageRefuses(`--${nom} attend une valeur.`);
  return lue;
}

function demande(bruts: readonly string[]): Demande {
  const table = analyserArguments(bruts, ["run", "requete"]);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  if (positionnels.length > 0) throw new ArgumentsStockageRefuses(`arguments inattendus : ${positionnels.join(", ")}.`);
  const run = valeur(bruts, table, "run");
  if (run === undefined) throw new ArgumentsStockageRefuses("--run est obligatoire.");
  const requete = valeur(bruts, table, "requete");
  return requete === undefined ? { repertoire: resolve(run) } : { repertoire: resolve(run), requete };
}

function imprimer(resultat: ResultatStockageGeleSimule): void {
  const { stockage } = resultat;
  process.stdout.write(`Stockage par l'opérateur (§6) — run ${resultat.run_id}, ${resultat.disposition.run}\n`);
  for (const issue of stockage.issues) process.stdout.write(`  ${messageStockage(issue)}\n`);
  process.stdout.write(
    `Requêtes : ${stockage.issues.length} en attente traitées, ${stockage.deja_ecrites} déjà écrites, ` +
      `${stockage.sans_attente} sans réponse en attente.\n`,
  );
  if (stockage.issues.length === 0) process.stdout.write("Rien à faire.\n");
}

function principal(): void {
  try {
    const { repertoire, requete } = demande(process.argv.slice(2));
    const options = requete === undefined ? { repertoire, profils: PROFILS_RUN_GELE } : { repertoire, profils: PROFILS_RUN_GELE, requete };
    const resultat = stockerRunGeleSimule(options);
    imprimer(resultat);
    process.exitCode = codeSortieStockage(resultat.stockage);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Stockage refusé — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = CODE_STOCKAGE_REFUSE;
  }
}

principal();
