/**
 * Les nombres de réponses d'un run (§5 « Tailles », protocole 0.24, D59 (17)) : « le nombre de
 * réponses prévues par le plan d'interrogation est inscrit au gel, et celui des réponses obtenues
 * l'est après l'interrogation » (`run.json#/reponses`).
 *
 * - **Prévues** : les requêtes du plan d'interrogation (`pipeline/interrogation/plan.ts:planifier`),
 *   la règle que suit l'interrogation, jamais une copie : chaque assistant inclus, chaque mode
 *   déclaré, chaque question tirée, chaque formulation, chaque échantillon.
 * - **Obtenues** : les réponses API de contexte run au statut `obtenue`, refus de l'API compris (§6 :
 *   « un refus opposé par l'API elle-même est une réponse obtenue »). Chacune est rapprochée de sa
 *   requête du plan (`analysis/seuils.ts`, `ReponseHorsPlan` sinon) : une manquante, hors fenêtre ou
 *   après échecs, est prévue et non obtenue. Tant qu'une requête du plan n'a aucune réponse écrite
 *   (jamais tentée, ou en attente de l'opérateur, §6), l'interrogation n'est pas terminée et aucun
 *   nombre n'est rendu (`InterrogationNonTerminee`) : une réponse en attente peut encore devenir
 *   obtenue.
 *
 * Comptes de fonctionnement, pas une métrique du §8. `inscrireReponsesObtenues` est pure, comme les
 * transitions de `statut.ts` : l'écriture est à l'appelant. Un nombre inscrit n'est jamais réécrit.
 */

import { reponsesApiDuRun, requetesSansReponse, type RequeteDuPlan } from "../../analysis/seuils.ts";
import type { Reponse } from "../../analysis/types.ts";
import type { EchantillonsParQuestion } from "../../analysis/types-run.ts";
import { planifier, type QuestionAInterroger } from "../interrogation/plan.ts";
import type { OutilDeRun } from "../questions/charger-perimetre.ts";

/** `schema/run.schema.json#/properties/reponses`. */
export interface ReponsesDuRun {
  /** D75 (14) : inscrit au gel avec `prevues`, recopié tel quel à l'inscription des obtenues. */
  readonly echantillons_par_question: EchantillonsParQuestion;
  readonly prevues: number;
  readonly obtenues?: number;
}

export class InterrogationNonTerminee extends Error {
  constructor(sans_reponse: number) {
    super(
      `${sans_reponse} requête(s) du plan d'interrogation sans réponse écrite (jamais tentée(s), ou en attente de l'opérateur, §6) : ` +
        `l'interrogation n'est pas terminée, le nombre de réponses obtenues n'est pas inscrit (§5, D59 (17)).`,
    );
    this.name = "InterrogationNonTerminee";
  }
}

export class ReponsesObtenuesRefusees extends Error {
  constructor(detail: string) {
    super(`Réponses obtenues non inscrites (§5, D59 (17)) : ${detail} Rien n'est écrit.`);
    this.name = "ReponsesObtenuesRefusees";
  }
}

/**
 * Nombre de requêtes du plan d'interrogation : ce que `pnpm geler` inscrit dans `run.json#/reponses/prevues`,
 * pour le nombre d'échantillons `echantillons` qu'il inscrit à côté (D75 (14)).
 */
export function reponsesPrevues(outils: readonly OutilDeRun[], questions_tirees: readonly QuestionAInterroger[], echantillons: EchantillonsParQuestion): number {
  return [...planifier(outils, questions_tirees, echantillons).values()].reduce((total, file) => total + file.length, 0);
}

/** Nombre de réponses obtenues d'une interrogation terminée, rapprochées du plan. */
export function reponsesObtenues(reponses: readonly Reponse[], plan: readonly RequeteDuPlan[]): number {
  const sans = requetesSansReponse(reponses, plan);
  if (sans.length > 0) throw new InterrogationNonTerminee(sans.length);
  return reponsesApiDuRun(reponses).filter((r) => r.statut_reponse === "obtenue").length;
}

export interface RunAvecReponses {
  readonly reponses: ReponsesDuRun;
}

export type IssueInscriptionObtenues<T> = { readonly issue: "inscrite"; readonly run: T } | { readonly issue: "deja_inscrite" };

/**
 * Inscrit `obtenues` à côté des prévues. Déjà inscrit au même nombre : `deja_inscrite`, rien n'est
 * réécrit ; à un autre nombre : refus. Plus d'obtenues que de prévues : refus (le rapprochement du
 * plan l'exclut déjà ; un run.json qui le contredirait n'est pas complété en silence).
 */
export function inscrireReponsesObtenues<T extends RunAvecReponses>(run: T, obtenues: number): IssueInscriptionObtenues<T> {
  const { prevues } = run.reponses;
  if (obtenues > prevues) throw new ReponsesObtenuesRefusees(`${obtenues} réponse(s) obtenue(s) pour ${prevues} prévue(s) au gel.`);
  const deja = run.reponses.obtenues;
  if (deja === obtenues) return { issue: "deja_inscrite" };
  if (deja !== undefined) throw new ReponsesObtenuesRefusees(`run.json porte déjà ${deja} réponse(s) obtenue(s), et non ${obtenues} ; un nombre inscrit n'est jamais réécrit.`);
  return { issue: "inscrite", run: { ...run, reponses: { ...run.reponses, obtenues } } };
}
