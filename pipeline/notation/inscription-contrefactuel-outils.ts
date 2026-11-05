/**
 * L'inscription de l'absence du contrefactuel d'outil dans `run.json` (§7 ; D75 (7)) :
 * `publication-contrefactuel-outils.ts` rend le bloc, ce module l'écrit, comme
 * `inscription-contrefactuel.ts` pour le test des candidats.
 *
 * Seul le bloc `contrefactuel_outils` est écrit ; tout autre champ du run est recopié tel quel. Le run
 * fusionné est validé contre `schema/run.schema.json` avant d'être écrit, par un fichier temporaire
 * synchronisé puis renommé : `run.json` n'est jamais à moitié écrit.
 *
 * **Une seule fois.** Un `run.json` qui porte déjà `contrefactuel_outils` n'est jamais réécrit : un
 * bloc identique (forme canonique) est une reprise, et rien n'est écrit ; un bloc différent lève
 * `ContrefactuelOutilsDejaInscrit`, et rien n'est écrit non plus. Le test d'outil ne retire aucun
 * juge et n'invalide jamais le run (§7) : ni `juges`, ni `invalidation`, ni le statut ne sont touchés.
 */

import { readFileSync } from "node:fs";
import { dispositionRunNote } from "../../analysis/lecture-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { ecrireParRenommage } from "../run/ecriture.ts";
import type { IssueInscription } from "./inscription-contrefactuel.ts";
import type { BlocContrefactuelOutils } from "./publication-contrefactuel-outils.ts";

export class ContrefactuelOutilsDejaInscrit extends Error {
  constructor(chemin: string) {
    super(`${chemin} porte déjà un contrefactuel d'outil différent de celui que la notation recalcule : rien n'est réécrit (règle 7).`);
    this.name = "ContrefactuelOutilsDejaInscrit";
  }
}

export function inscrireContrefactuelOutils(repertoire_run: string, bloc: BlocContrefactuelOutils): IssueInscription {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const actuel = JSON.parse(readFileSync(chemin, "utf8")) as Readonly<Record<string, unknown>>;
  const deja = actuel["contrefactuel_outils"];
  if (deja !== undefined) {
    if (canoniser(deja) !== canoniser(bloc)) throw new ContrefactuelOutilsDejaInscrit(chemin);
    return "deja_inscrit";
  }
  const fusionne = { ...actuel, contrefactuel_outils: bloc };
  valider("run", fusionne, `${chemin} après inscription du contrefactuel d'outil`);
  ecrireParRenommage(chemin, fusionne, "inscription-outils");
  return "inscrit";
}
