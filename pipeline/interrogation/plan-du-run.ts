/**
 * Le plan d'interrogation d'un run enregistré, reconstruit depuis ses fichiers (§8 et §12,
 * protocole 0.21, D56 (2)) : la part de réponses manquantes se compte « sur les requêtes que prévoit
 * le plan d'interrogation du run pour ce couple — chaque question tirée, dans chaque formulation et
 * chaque échantillon —, et non sur les réponses enregistrées ».
 *
 * Aucune copie de la règle du plan : `pipeline/interrogation/plan.ts:planifier`, celle qu'a suivie
 * l'interrogation, reçoit les outils au gel (`run.json#/perimetre/outils`) et les questions du
 * tirage (`tirage.json#/entrees`, prises avec leurs formulations dans `questions.json`). Les deux
 * fichiers sont lus par `analysis/lecture-run.ts` (empreinte du tirage contre `run.json`, schémas).
 *
 * Le résultat est la liste à plat des requêtes, que `analysis/seuils.ts` reçoit en paramètre
 * (`RequeteDuPlan`) : `analysis/` n'importe pas le code d'interrogation (flux à sens unique).
 */

import { existsSync } from "node:fs";
import { cheminDuTirage, dispositionRunNote, lireQuestions, lireTirage, type RunLu } from "../../analysis/lecture-run.ts";
import { planifier } from "./plan.ts";
import type { RequetePlanifiee } from "./types.ts";
import type { Question } from "../questions/types.ts";

/** Un fichier sans lequel le plan d'interrogation du run ne se reconstruit pas. */
export class PlanNonReconstructible extends Error {
  constructor(chemin: string, raison: string) {
    super(
      `${chemin} : ${raison}. Le plan d'interrogation du run n'est pas reconstructible : la part de réponses ` +
        `manquantes, comptée sur ce plan (§8, §12), n'est pas décidable. Rien n'est écrit.`,
    );
    this.name = "PlanNonReconstructible";
  }
}

function exigerFichier(chemin: string): void {
  if (!existsSync(chemin)) throw new PlanNonReconstructible(chemin, "fichier absent");
}

/** Les questions des entrées du tirage, dans l'ordre du tirage ; une question tirée absente de `questions.json` refuse. */
function questionsTirees(repertoire_run: string, run: RunLu): readonly Question[] {
  const tirage = lireTirage(repertoire_run, run);
  const parId = new Map(lireQuestions<Question>(repertoire_run).map((question) => [question.id, question]));
  return tirage.entrees.map((entree) => {
    const question = parId.get(entree.question_id);
    if (question === undefined) {
      throw new PlanNonReconstructible(dispositionRunNote(repertoire_run).questions, `question tirée ${entree.question_id} absente`);
    }
    return question;
  });
}

/** Chaque requête que le plan d'interrogation du run prévoit, tous outils confondus, dans l'ordre du plan. */
export function requetesDuPlanDuRun(repertoire_run: string, run: RunLu): readonly RequetePlanifiee[] {
  exigerFichier(cheminDuTirage(repertoire_run, run));
  exigerFichier(dispositionRunNote(repertoire_run).questions);
  return [...planifier(run.perimetre.outils, questionsTirees(repertoire_run, run)).values()].flat();
}
