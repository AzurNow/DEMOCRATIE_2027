/**
 * `pnpm run:dry` — un run d'interrogation complet en mode simulé : aucun appel réseau, aucun SDK.
 *
 *   pnpm run:dry                    fixtures, écrit dans un répertoire temporaire neuf
 *   pnpm run:dry --sortie=<chemin>  fixtures, écrit sous <chemin> (relancer sur le même chemin reprend le run)
 *   pnpm run:dry --run=<répertoire> interroge le run gelé par `pnpm geler --sortie` (lot gel, PR 4)
 *
 * `--run` : périmètre, fenêtre, identifiant et questions tirées sont lus du gel, `tirage.json` et
 * `questions.json` vérifiés sur les empreintes que `run.json` déclare ; `statut: en_cours` est écrit
 * dans `run.json` avant la première tentative (D51 (1)), et un run déjà `en_cours` reprend sans le
 * réécrire. Seuls la clé d'API fictive et les profils de l'éditeur simulé viennent d'une fixture
 * (`tests/interrogation/fixtures/run-gele/profils-simules.json`). Réponses et tentatives sous
 * `<répertoire>/volume/`. `--run` et `--sortie` ensemble sont refusés ; toute autre option aussi
 * (`arguments.ts:analyserArguments`, constat 19 de la revue du 2026-10-17).
 *
 * Jamais dans `runs/`, ni par défaut ni sur demande : un run simulé n'est pas un run, et `--sortie`
 * ou `--run` sous `runs/` est refusé (`gardes-sortie.ts:exigerHorsDeRuns`) avant toute lecture ou
 * écriture. Chaque réponse est validée contre `schema/reponse.schema.json` au moment de son
 * écriture ; le bilan imprimé est relu du disque.
 *
 * Code de sortie :
 * - 0 : le run est allé au bout ; les requêtes écrites (obtenues ou manquantes) sont toutes
 *   écrites, et aucune ne porte de réponse reçue mais non stockée ;
 * - 4 : au moins une requête porte une réponse reçue que le banc n'a pas pu stocker (§6, D55 (5)) ;
 *   le reste du run s'est terminé normalement, le bilan est imprimé, et chaque requête concernée
 *   est nommée avec la tentative, la cause et le fichier d'octets gardé. Elle n'est jamais
 *   renvoyée : la question attend l'opérateur.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { LigneBilan } from "../pipeline/interrogation/bilan.ts";
import { CODE_RECUE_NON_STOCKEE, messageAttenteOperateur } from "../pipeline/interrogation/operateur.ts";
import { lancerRunGeleSimule, lancerRunSimule, type ResultatRunSimule } from "../pipeline/interrogation/run-simule.ts";
import { exigerHorsDeRuns } from "../pipeline/gardes-sortie.ts";
import { analyserArguments, type Arguments } from "./arguments.ts";

const FIXTURES = resolve(import.meta.dirname, "../tests/interrogation/fixtures/run-simule");
const PROFILS_RUN_GELE = resolve(import.meta.dirname, "../tests/interrogation/fixtures/run-gele/profils-simules.json");
const OPTIONS: readonly string[] = ["run", "sortie"];

class ArgumentsRunDryRefuses extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentsRunDryRefuses";
  }
}

/** `--<nom>=<valeur>` ; `undefined` si l'option est absente, refus si sa valeur l'est ou si elle est posée sans valeur (`--<nom>` seul). */
function cheminOption(bruts: readonly string[], table: Arguments, nom: string): string | undefined {
  if (bruts.includes(`--${nom}`)) throw new ArgumentsRunDryRefuses(`--${nom} attend un chemin (--${nom}=<chemin>).`);
  const valeur = table.get(nom);
  if (valeur === undefined) return undefined;
  if (valeur.length === 0) throw new ArgumentsRunDryRefuses(`--${nom} attend un chemin.`);
  return resolve(valeur);
}

/** `--sortie` sous `runs/` refusée ; absente, un répertoire temporaire neuf. */
function sortieDemandee(sortie: string | undefined): string {
  if (sortie === undefined) return mkdtempSync(join(tmpdir(), "banc-run-dry-"));
  exigerHorsDeRuns(sortie);
  return sortie;
}

function pourcentage(ligne: LigneBilan): string {
  const { valeur } = ligne.part_manquantes;
  return valeur === undefined ? "indéfini" : `${(valeur * 100).toFixed(1)} %`;
}

function imprimerLigne(ligne: LigneBilan): void {
  const incomplet = ligne.run_incomplet ? "  RUN INCOMPLET (§8, > 20 %)" : "";
  process.stdout.write(
    `  ${ligne.outil_id.padEnd(14)} ${ligne.mode.padEnd(15)} obtenues ${String(ligne.obtenues).padStart(3)}` +
      ` (dont refus API ${String(ligne.refus_api).padStart(2)})` +
      `  manquantes : échecs ${String(ligne.manquantes_echecs).padStart(2)}, hors fenêtre ${String(ligne.manquantes_hors_fenetre).padStart(2)}` +
      `  taux de manquantes ${ligne.part_manquantes.numerateur}/${ligne.part_manquantes.denominateur} = ${pourcentage(ligne)}${incomplet}\n`,
  );
}

function imprimerBilan(resultat: ResultatRunSimule, statut: string): void {
  process.stdout.write(`Run simulé (aucun appel réseau) — ${resultat.disposition.run}\n`);
  if (statut.length > 0) process.stdout.write(`${statut}\n`);
  process.stdout.write(
    `Requêtes : ${resultat.execution.ecrites} écrites, ${resultat.execution.deja_ecrites} déjà écrites (reprise).\n`,
  );
  process.stdout.write("Bilan par outil × mode :\n");
  resultat.bilan.forEach(imprimerLigne);
}

/** Imprime chaque requête en attente de l'opérateur ; vrai si le run en porte au moins une. */
function imprimerAttenteOperateur(resultat: ResultatRunSimule): boolean {
  const { en_attente_operateur } = resultat.execution;
  for (const item of en_attente_operateur) process.stdout.write(`${messageAttenteOperateur(item)}\n`);
  return en_attente_operateur.length > 0;
}

function finirRun(resultat: ResultatRunSimule, statut: string): void {
  imprimerBilan(resultat, statut);
  if (imprimerAttenteOperateur(resultat)) process.exitCode = CODE_RECUE_NON_STOCKEE;
}

const STATUT_DU_DEMARRAGE = {
  demarre: "run.json : statut planifie ⇒ en_cours, écrit avant la première tentative (D51 (1)).",
  reprend: "run.json : déjà en_cours, reprise sans nouvelle transition ni réécriture.",
} as const;

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const table = analyserArguments(argv, OPTIONS);
  const run = cheminOption(argv, table, "run");
  const sortie = cheminOption(argv, table, "sortie");
  if (run !== undefined && sortie !== undefined) {
    throw new ArgumentsRunDryRefuses("--run et --sortie s'excluent : un run gelé s'interroge dans son propre répertoire.");
  }
  if (run === undefined) {
    finirRun(await lancerRunSimule({ sortie: sortieDemandee(sortie), fixtures: FIXTURES }), "");
    return;
  }
  const resultat = await lancerRunGeleSimule({ repertoire: run, profils: PROFILS_RUN_GELE });
  finirRun(resultat, STATUT_DU_DEMARRAGE[resultat.demarrage]);
}

await principal();
