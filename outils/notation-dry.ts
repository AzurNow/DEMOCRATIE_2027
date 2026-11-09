/**
 * `pnpm notation:dry` — la chaîne de notation du §7 de bout en bout, en mode simulé : aucun modèle,
 * aucun appel réseau (`pipeline/notation/notation-simulee.ts`).
 *
 *   pnpm notation:dry                     interroge (comme run:dry) puis note, dans un répertoire temporaire neuf
 *   pnpm notation:dry --sortie=<chemin>   sous <chemin> ; après `pnpm run:dry --sortie=<chemin>`, note ce run
 *   pnpm notation:dry --run=<répertoire> --depot-des-items=<dépôt simulé>
 *                                         note le run gelé par `pnpm geler --simule` et interrogé par
 *                                         `pnpm run:dry --run`, dans son propre répertoire (D80)
 *
 * `--run` (D80, `notation-simulee.ts:lancerNotationDuGelSimule`) : `run.json`, `questions.json` et
 * `tirage.json` sont ceux du gel, jamais des fixtures ; un run sans `simule: true` est refusé
 * (`GelNonSimule`), et ses items se lisent dans le dépôt simulé désigné par `--depot-des-items`
 * (`<sortie>/depot-simule`), au commit des données du gel ; sans lui, `ItemsDuRunSimuleNonDesignes`.
 * `--run` et `--sortie` s'excluent ; `--depot-des-items` sans `--run` est refusé.
 *
 * Relancer sur la même sortie reprend sans rien réécrire. Une sortie sous `runs/` est refusée, avant
 * toute écriture : un run simulé n'est pas un run. Le bilan imprimé est relu du disque ; les
 * réponses qui attendent un humain sont comptées par motif, jamais résolues.
 *
 * Codes de sortie : 0, la chaîne a tourné ; 2, la commande est mal appelée, la sortie est refusée,
 * ou la chaîne s'est arrêtée sur une erreur nommée.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BilanNotation } from "../pipeline/notation/bilan-notation.ts";
import { exigerHorsDeRuns } from "../pipeline/gardes-sortie.ts";
import {
  lancerNotationDuGelSimule,
  lancerNotationSimulee,
  lireParametresNotationSimulee,
  type NotationSimuleeFaite,
  type ParametresNotationSimulee,
} from "../pipeline/notation/notation-simulee.ts";
import { lignesBilanNotation, texteLectures } from "./notation-bilan.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const FIXTURES_INTERROGATION = resolve(import.meta.dirname, "../tests/interrogation/fixtures/run-simule");
const FIXTURES_NOTATION = resolve(import.meta.dirname, "../tests/notation/fixtures/notation-dry");

/** `--<nom> <chemin>` ou `--<nom>=<chemin>`, résolu ; `undefined` sans l'option ; refus si le chemin manque. */
function cheminOption(argv: readonly string[], nom: string): string | undefined {
  const rang = argv.findIndex((a) => a === `--${nom}` || a.startsWith(`--${nom}=`));
  if (rang === -1) return undefined;
  const argument = argv[rang] as string;
  const valeur = argument === `--${nom}` ? argv[rang + 1] : argument.slice(`--${nom}=`.length);
  if (valeur === undefined || valeur.length === 0 || valeur.startsWith("--")) throw new Error(`--${nom} attend un chemin.`);
  return resolve(valeur);
}

/** `--sortie` ; absente, un répertoire temporaire neuf. Refusée sous runs/. */
function sortieDemandee(sortie: string | undefined): string {
  if (sortie === undefined) return mkdtempSync(join(tmpdir(), "banc-notation-dry-"));
  exigerHorsDeRuns(sortie);
  return sortie;
}

interface Demande {
  readonly sortie: string | undefined;
  /** D80 : le run gelé simulé à noter dans son répertoire ; `undefined` pour le mode des fixtures. */
  readonly run: string | undefined;
  readonly depot_des_items: string | null;
}

function demande(argv: readonly string[]): Demande {
  const run = cheminOption(argv, "run");
  const sortie = cheminOption(argv, "sortie");
  const depot = cheminOption(argv, "depot-des-items");
  if (run !== undefined && sortie !== undefined) throw new Error("--run et --sortie s'excluent : un run gelé se note dans son propre répertoire.");
  if (run === undefined && depot !== undefined) throw new Error("--depot-des-items ne sert qu'avec --run : le mode des fixtures lit ses items dans les fixtures.");
  return { sortie, run, depot_des_items: depot === undefined ? null : depot };
}

async function noter(demandee: Demande, parametres: ParametresNotationSimulee): Promise<NotationSimuleeFaite> {
  if (demandee.run !== undefined) return lancerNotationDuGelSimule({ repertoire_run: demandee.run, depot_des_items: demandee.depot_des_items }, parametres);
  const options = { sortie: sortieDemandee(demandee.sortie), fixtures_interrogation: FIXTURES_INTERROGATION, fixtures_notation: FIXTURES_NOTATION };
  return lancerNotationSimulee(options, parametres);
}

function imprimerBilan(repertoire_run: string, bilan: BilanNotation): void {
  for (const ligne of lignesBilanNotation("Notation simulée (aucun modèle, aucun appel réseau)", repertoire_run, bilan)) process.stdout.write(`${ligne}\n`);
}

async function principal(): Promise<void> {
  try {
    const demandee = demande(process.argv.slice(2));
    const parametres = lireParametresNotationSimulee(join(FIXTURES_NOTATION, "notation-simulee.json"));
    const resultat = await noter(demandee, parametres);
    imprimerBilan(resultat.repertoire_run, resultat.bilan);
    process.stdout.write(`${texteLectures(resultat.resultat.lectures)}\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Notation simulée non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

await principal();
