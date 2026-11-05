/**
 * Le plan d'interrogation d'un run : une file de requêtes par outil (décision de l'auteur du
 * 2026-10-02, point 3).
 *
 * - Sont interrogés les assistants inclus du périmètre ; un comparateur est lu, pas interrogé (§6).
 * - Pour chacun, chaque mode qu'il déclare dans `perimetre.outils[].modes` — un outil sans mode
 *   web n'a que `web_desactivee` —, chaque question, chaque formulation, `echantillons` fois (§2,
 *   §6) : le nombre inscrit au gel dans `run.json#/reponses/echantillons_par_question` (D75 (14)),
 *   que l'appelant passe, jamais reconstruit ici ; sous le levier 2 → 1 du §12, un seul tour.
 * - Ordre : tous les échantillons 1 avant tous les échantillons 2 (un tour par échantillon) ;
 *   dans un tour, tri croissant par chaîne sur (question_id, mode, formulation_id). Aucune graine.
 *
 * Un assistant inclus sans modèle demandé, sans mode ou sans alias aveugle lève : le compléter
 * serait décider à la place du périmètre.
 */

import type { OutilDeRun } from "../questions/charger-perimetre.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { EchantillonsParQuestion } from "./conditions.ts";
import type { Mode, RequetePlanifiee } from "./types.ts";

/** Ce que le plan lit d'une question : son identifiant et le texte de ses formulations. */
export interface QuestionAInterroger {
  readonly id: string;
  readonly formulations: readonly { readonly id: string; readonly texte: string }[];
}

export type PlanInterrogation = ReadonlyMap<string, readonly RequetePlanifiee[]>;

export class OutilNonInterrogeable extends Error {
  constructor(outil_id: string, manques: readonly string[]) {
    super(`${outil_id} : assistant inclus sans ${manques.join(", ")} ; aucune valeur par défaut (§6, §7).`);
    this.name = "OutilNonInterrogeable";
  }
}

interface OutilInterroge {
  readonly outil_id: string;
  readonly alias_aveugle: string;
  readonly modele_demande: string;
  readonly modes: readonly Mode[];
}

function estInterroge(outil: OutilDeRun): boolean {
  return outil.famille === "assistant" && outil.inclus;
}

function manques(outil: OutilDeRun): readonly string[] {
  const champs: readonly (readonly [string, boolean])[] = [
    ["modele_demande", outil.modele_demande === undefined],
    ["modes", outil.modes === undefined || outil.modes.length === 0],
    ["alias_aveugle", outil.alias_aveugle === undefined],
  ];
  return champs.filter(([, manque]) => manque).map(([nom]) => nom);
}

function exigerInterrogeable(outil: OutilDeRun): OutilInterroge {
  const { modele_demande, modes, alias_aveugle } = outil;
  if (modele_demande === undefined || modes === undefined || modes.length === 0 || alias_aveugle === undefined) {
    throw new OutilNonInterrogeable(outil.outil_id, manques(outil));
  }
  return { outil_id: outil.outil_id, alias_aveugle, modele_demande, modes };
}

interface Combinaison {
  readonly question_id: string;
  readonly mode: Mode;
  readonly formulation_id: string;
  readonly texte: string;
}

function comparerCombinaisons(a: Combinaison, b: Combinaison): number {
  return (
    comparerChaines(a.question_id, b.question_id) ||
    comparerChaines(a.mode, b.mode) ||
    comparerChaines(a.formulation_id, b.formulation_id)
  );
}

function combinaisons(questions: readonly QuestionAInterroger[], modes: readonly Mode[]): Combinaison[] {
  return questions
    .flatMap((question) =>
      modes.flatMap((mode) =>
        question.formulations.map((f) => ({ question_id: question.id, mode, formulation_id: f.id, texte: f.texte })),
      ),
    )
    .sort(comparerCombinaisons);
}

function fileDe(outil: OutilInterroge, questions: readonly QuestionAInterroger[], nombre: EchantillonsParQuestion): readonly RequetePlanifiee[] {
  const tour = combinaisons(questions, outil.modes);
  const echantillons = Array.from({ length: nombre }, (_, rang) => rang + 1);
  return echantillons.flatMap((echantillon) =>
    tour.map((c) => ({
      outil_id: outil.outil_id,
      alias_aveugle: outil.alias_aveugle,
      modele_demande: outil.modele_demande,
      mode: c.mode,
      question_id: c.question_id,
      formulation_id: c.formulation_id,
      texte: c.texte,
      echantillon,
    })),
  );
}

function exigerQuestionsUniques(questions: readonly QuestionAInterroger[]): void {
  const vues = new Set<string>();
  for (const question of questions) {
    if (vues.has(question.id)) throw new Error(`Question ${question.id} présente deux fois dans le plan.`);
    vues.add(question.id);
  }
}

export function planifier(
  outils: readonly OutilDeRun[],
  questions: readonly QuestionAInterroger[],
  echantillons: EchantillonsParQuestion,
): PlanInterrogation {
  exigerQuestionsUniques(questions);
  const interroges = outils.filter(estInterroge).map(exigerInterrogeable);
  return new Map(interroges.map((outil) => [outil.outil_id, fileDe(outil, questions, echantillons)]));
}
