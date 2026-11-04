/**
 * L'inscription du nombre de réponses obtenues dans `run.json`, au début de la notation (§5
 * « Tailles », protocole 0.27) : « le nombre de réponses prévues par le plan d'interrogation est
 * inscrit au gel, et celui des réponses obtenues l'est au début de la notation, qui exige qu'aucune
 * réponse n'attende l'opérateur (section 6). Ces nombres ne portent que sur le canal API : les
 * saisies du sous-échantillon de l'application (section 6) n'y entrent pas. »
 *
 * Aucune règle n'est recopiée : le compte est `pipeline/run/reponses.ts:reponsesObtenues` (canal API,
 * contexte run, statut obtenue, refus de l'API compris, rapprochées du plan reconstruit par
 * `pipeline/interrogation/plan-du-run.ts`), l'inscription `inscrireReponsesObtenues` (pure, jamais
 * réécrite). Ce module ne fait que lire et écrire : la fusion est validée contre
 * `schema/run.schema.json`, puis écrite par un temporaire renommé (`pipeline/run/ecriture.ts`).
 *
 * L'appelant (`chaine.ts`) a déjà vérifié qu'aucune réponse n'attend l'opérateur. Une requête du plan
 * sans réponse écrite lève `InterrogationNonTerminee` avant toute écriture : la notation ne commence
 * pas sur une interrogation inachevée. Déjà inscrit au même nombre : `deja_inscrite`, rien n'est
 * écrit ; à un autre nombre : `ReponsesObtenuesRefusees`, rien n'est écrit.
 */

import { readFileSync } from "node:fs";
import { dispositionRunNote, lireReponses, lireRunJson } from "../../analysis/lecture-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { requetesDuPlanDuRun } from "../interrogation/plan-du-run.ts";
import { ecrireParRenommage } from "../run/ecriture.ts";
import { inscrireReponsesObtenues, reponsesObtenues, type RunAvecReponses } from "../run/reponses.ts";

export type IssueReponsesObtenues = { readonly issue: "inscrite" | "deja_inscrite"; readonly obtenues: number };

/** Compte, puis inscrit une fois, les réponses obtenues du run dans `run.json#/reponses/obtenues`. */
export function inscrireReponsesObtenuesDuRun(repertoire_run: string): IssueReponsesObtenues {
  const run = lireRunJson(repertoire_run);
  const obtenues = reponsesObtenues(lireReponses(repertoire_run, run.id), requetesDuPlanDuRun(repertoire_run, run));
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const actuel = JSON.parse(readFileSync(chemin, "utf8")) as RunAvecReponses;
  const issue = inscrireReponsesObtenues(actuel, obtenues);
  if (issue.issue === "deja_inscrite") return { issue: "deja_inscrite", obtenues };
  valider("run", issue.run, `${chemin} après inscription des réponses obtenues`);
  ecrireParRenommage(chemin, issue.run, "reponses-obtenues");
  return { issue: "inscrite", obtenues };
}
