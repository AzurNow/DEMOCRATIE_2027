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
import { MOTIFS_DU_BILAN, texteContrefactuelInscrit, type BilanNotation } from "../pipeline/notation/bilan-notation.ts";
import { exigerHorsDeRuns } from "../pipeline/gardes-sortie.ts";
import {
  lancerNotationDuGelSimule,
  lancerNotationSimulee,
  lireParametresNotationSimulee,
  type NotationSimuleeFaite,
  type ParametresNotationSimulee,
} from "../pipeline/notation/notation-simulee.ts";
import type { EtatLecturesDuRun } from "../pipeline/notation/verdicts-de-lecture.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const FIXTURES_INTERROGATION = resolve(import.meta.dirname, "../tests/interrogation/fixtures/run-simule");
const FIXTURES_NOTATION = resolve(import.meta.dirname, "../tests/notation/fixtures/notation-dry");

const LIBELLES_MOTIFS: Readonly<Record<(typeof MOTIFS_DU_BILAN)[number], string>> = {
  notation_juge_manquante: "notation de juge manquante",
  desaccord_juges: "désaccord des juges",
  extrait_invalide: "extrait invalide",
  drapeau_grave: "erreur grave à revoir",
  double_notation_humaine_incomplete: "échantillon humain (double notation)",
  arbitrage_echantillon_manquant: "arbitrage de l'échantillon",
  accord_sans_note_commune: "accord partiel des juges",
  attribution_indecidable: "attribution indécidable (renvoi d'un juge)",
  juge_defaillant: "juge défaillant (renvoi d'un juge)",
  test_liens: "en attente du test des liens",
  contrefactuel_en_attente: "test contrefactuel en attente",
  run_invalide: "run invalide (deux juges retirés)",
};

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
  const ecrire = (ligne: string): void => {
    process.stdout.write(`${ligne}\n`);
  };
  ecrire(`Notation simulée (aucun modèle, aucun appel réseau) — ${repertoire_run}`);
  ecrire(`Test contrefactuel : ${bilan.statut_contrefactuel}${contrefactuelInscrit(bilan)}`);
  for (const juge of bilan.juges) {
    const taux = juge.changements_contrefactuel === undefined ? "sans taux" : `${juge.changements_contrefactuel.numerateur}/${juge.changements_contrefactuel.denominateur} changements`;
    ecrire(`  ${juge.juge_id.padEnd(16)} ${juge.retire ? "RETIRÉ" : "retenu"}  ${taux}  notations : run ${juge.notations_run}, contrefactuel ${juge.notations_contrefactuel}`);
  }
  ecrire(`  règle d12-refus-api (D32)  notations : run ${bilan.notations_par_regle}, sans juge`);
  ecrire(`Échantillon humain : ${bilan.taux_echantillon_humain * 100} %`);
  ecrire(`Réponses obtenues : ${bilan.reponses_obtenues} = ${bilan.verdicts} verdict(s) + ${bilan.reponses_en_attente} en attente`);
  for (const [mode, nombre] of Object.entries(bilan.verdicts_par_mode)) ecrire(`  verdict ${mode.padEnd(28)} ${nombre}`);
  ecrire("Attentes par motif (une réponse peut en porter plusieurs) :");
  for (const motif of MOTIFS_DU_BILAN) {
    const nombre = bilan.attentes_par_motif[motif];
    if (nombre !== undefined) ecrire(`  ${LIBELLES_MOTIFS[motif].padEnd(40)} ${nombre}`);
  }
  ecrire(`Réponses contrefactuelles écrites : ${bilan.reponses_contrefactuelles} ; notations humaines lues : ${bilan.notations_humaines}`);
}

/** Étape 5 de la chaîne (D87) : les verdicts de lecture écrits, les lectures qui attendent un humain, ou pourquoi rien n'a été joué. */
function texteLectures(lectures: EtatLecturesDuRun): string {
  if (lectures.statut === "non_jouees") return `Lectures de comparateur : non jouées (${lectures.motif})`;
  const aNoter = lectures.attentes.filter((a) => a.statut === "a_noter").length;
  const aArbitrer = lectures.attentes.length - aNoter;
  return `Lectures de comparateur : ${lectures.verdicts.length} verdict(s) ; ${aNoter} à noter, ${aArbitrer} à arbitrer`;
}

function contrefactuelInscrit(bilan: BilanNotation): string {
  const inscrit = bilan.contrefactuel_inscrit;
  if (inscrit === undefined) return "";
  return texteContrefactuelInscrit(inscrit);
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
