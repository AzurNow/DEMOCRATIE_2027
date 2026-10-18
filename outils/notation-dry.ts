/**
 * `pnpm notation:dry` — la chaîne de notation du §7 de bout en bout, en mode simulé : aucun modèle,
 * aucun appel réseau (`pipeline/notation/notation-simulee.ts`).
 *
 *   pnpm notation:dry                     interroge (comme run:dry) puis note, dans un répertoire temporaire neuf
 *   pnpm notation:dry --sortie=<chemin>   sous <chemin> ; après `pnpm run:dry --sortie=<chemin>`, note ce run
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
import { MOTIFS_DU_BILAN, type BilanNotation } from "../pipeline/notation/bilan-notation.ts";
import { exigerHorsDeRuns } from "../pipeline/gardes-sortie.ts";
import { lancerNotationSimulee, lireParametresNotationSimulee } from "../pipeline/notation/notation-simulee.ts";

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
  test_liens: "en attente du test des liens",
  contrefactuel_en_attente: "test contrefactuel en attente",
  run_invalide: "run invalide (deux juges retirés)",
};

/** `--sortie <chemin>` ou `--sortie=<chemin>` ; absent, un répertoire temporaire neuf. Refusée sous runs/. */
function sortieDemandee(argv: readonly string[]): string {
  const rang = argv.findIndex((a) => a === "--sortie" || a.startsWith("--sortie="));
  if (rang === -1) return mkdtempSync(join(tmpdir(), "banc-notation-dry-"));
  const argument = argv[rang] as string;
  const valeur = argument === "--sortie" ? argv[rang + 1] : argument.slice("--sortie=".length);
  if (valeur === undefined || valeur.length === 0 || valeur.startsWith("--")) throw new Error("--sortie attend un chemin.");
  const sortie = resolve(valeur);
  exigerHorsDeRuns(sortie);
  return sortie;
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

function contrefactuelInscrit(bilan: BilanNotation): string {
  const inscrit = bilan.contrefactuel_inscrit;
  if (inscrit === undefined) return "";
  return ` (${inscrit.etat}, ${inscrit.taille} réponse(s) tirée(s) parmi ${inscrit.eligibles} éligible(s)${inscrit.sous_effectif ? ", sous-effectif" : ""})`;
}

async function principal(): Promise<void> {
  try {
    const sortie = sortieDemandee(process.argv.slice(2));
    const parametres = lireParametresNotationSimulee(join(FIXTURES_NOTATION, "notation-simulee.json"));
    const resultat = await lancerNotationSimulee({ sortie, fixtures_interrogation: FIXTURES_INTERROGATION, fixtures_notation: FIXTURES_NOTATION }, parametres);
    imprimerBilan(resultat.repertoire_run, resultat.bilan);
  } catch (erreur) {
    if (!(erreur instanceof Error)) throw erreur;
    process.stderr.write(`Notation simulée non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

await principal();
