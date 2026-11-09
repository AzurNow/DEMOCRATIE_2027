/**
 * `pnpm notation:controle <repertoire_run>` — le contrôle croisé n° 18 (§7 ; D13) sur un run
 * enregistré.
 *
 *   pnpm notation:controle runs/2026-12-01
 *
 * Lit `run.json`, les réponses du volume (`volume/reponses/`, dont les réponses obtenues de contexte
 * `run` forment la population de l'échantillon humain), les notations individuelles
 * (`volume/notations/`, avec les réponses contrefactuelles, validées au passage) et les verdicts
 * (`verdicts/`), chaque fichier validé contre son schéma (`analysis/lecture-run.ts`), avec le
 * contrefactuel d'outil inscrit s'il l'est (`run.json#/contrefactuel_outils`, D90), puis lance
 * `pipeline/notation/controle-croise.ts:controleCroise` et imprime chaque violation.
 *
 * Codes de sortie : 0, aucune violation ; 1, au moins une violation ; 2, le run n'a pas pu être lu
 * ou contrôlé (répertoire illisible, volume non reconstitué, fichier non conforme, run incohérent),
 * ou la commande est mal appelée. Un bogue (`TypeError`…) n'est pas un refus : il remonte avec sa
 * pile (`refus-attendu.ts`, revue du 2026-11-09, constat 10). Rien n'est écrit.
 */

import { reponsesObtenuesDuRun } from "../analysis/population-notation.ts";
import type { Reponse } from "../analysis/types.ts";
import { lireNotationsDuRun, lireReponses, lireRunJson, lireVerdicts, runDeNotationDe } from "../analysis/lecture-run.ts";
import { controleCroise, type EntreeControleCroise, type Violation } from "../pipeline/notation/controle-croise.ts";
import { contrefactuelOutilsDuRun } from "../pipeline/notation/controle-croise-outils.ts";
import { analyserArguments } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm notation:controle <repertoire_run>";

/** Un seul argument positionnel, le répertoire du run ; aucune option n'est reconnue. */
function repertoireDemande(bruts: readonly string[]): string {
  analyserArguments(bruts, []);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return repertoire;
}

type ReponseLue = Reponse & { readonly normalise?: { readonly refus_api: boolean; readonly texte: string } };

/** Une réponse obtenue porte toujours sa projection (`reponse.schema.json`) : son absence est une erreur, jamais un « non ». */
function projectionDe(reponse: ReponseLue): NonNullable<ReponseLue["normalise"]> {
  if (reponse.normalise === undefined) throw new Error(`réponse obtenue ${reponse.id} sans projection normalisée.`);
  return reponse.normalise;
}

function estUnRefus(reponse: ReponseLue): boolean {
  return projectionDe(reponse).refus_api;
}

function lireEntree(repertoire_run: string): EntreeControleCroise {
  const run = lireRunJson(repertoire_run);
  // `lireReponses` valide chaque réponse contre son schéma, qui exige `normalise` d'une réponse obtenue.
  const reponses = lireReponses<ReponseLue>(repertoire_run, run.id);
  const { notations, reponses_contrefactuelles } = lireNotationsDuRun(repertoire_run, run.id);
  const obtenues = reponsesObtenuesDuRun(reponses);
  return {
    run: runDeNotationDe(run),
    reponses_obtenues: obtenues.map((r) => r.id),
    refus_api: obtenues.filter(estUnRefus).map((r) => r.id),
    textes: new Map(obtenues.map((r) => [r.id, projectionDe(r).texte])),
    notations,
    verdicts: lireVerdicts(repertoire_run, run.id),
    contrefactuel_outils: contrefactuelOutilsDuRun(run, reponses_contrefactuelles),
  };
}

function ligne(violation: Violation): string {
  const verdict = violation.verdict_id === undefined ? "run" : `verdict ${violation.verdict_id}`;
  return `  ${violation.code} — ${verdict} : ${violation.detail}\n`;
}

/** Un refus attendu est rendu pour le code 2 ; un bogue (`TypeError`…) remonte avec sa pile (`refus-attendu.ts`). */
function controler(bruts: readonly string[]): readonly Violation[] | Error {
  try {
    const repertoire = repertoireDemande(bruts);
    return controleCroise(lireEntree(repertoire));
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    return erreur;
  }
}

function principal(): void {
  const resultat = controler(process.argv.slice(2));
  if (resultat instanceof Error) {
    process.stderr.write(`Contrôle croisé (n° 18) non exécuté — ${resultat.name} :\n  ${resultat.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (resultat.length === 0) {
    process.stdout.write("Contrôle croisé (n° 18) : aucune violation.\n");
    return;
  }
  process.stderr.write(`Contrôle croisé (n° 18) : ${resultat.length} violation(s).\n`);
  for (const violation of resultat) process.stderr.write(ligne(violation));
  process.exitCode = 1;
}

principal();
