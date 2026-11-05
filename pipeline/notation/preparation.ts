/**
 * Ce qui est noté pour une réponse obtenue : la question posée, les items de référence et ce que
 * le tirage a résolu au gel. Écrit une seule fois (constat 21, revue du 2026-10-12), pour la
 * notation automatique (`notation-simulee.ts`, puis `chaine.ts`) et pour la notation humaine
 * (`notation-humaine/serveur/chargement.ts`) : l'humain voit la même question que le juge (D18).
 *
 * **Items des seuls candidats interrogés (§7, protocole 0.21, D56 (1)).** « Le juge ne reçoit que
 * les items des candidats interrogés au run : comme pour la liste attendue d'une question
 * d'attribution, l'item d'un candidat non interrogé ne lui est pas transmis. » Une référence dont le
 * `candidat_id` n'est pas interrogé (`run.perimetre.candidats[].interroge`, la même source que la
 * table d'alias et le dérangement) est écartée, pour toute question : la règle ne retire rien quand
 * tous les candidats des items sont interrogés. L'item principal n'est jamais écarté : une question
 * n'est tirée que pour un interrogé, et un principal d'un non-interrogé est une incohérence du gel,
 * refusée (`ItemPrincipalNonInterroge`). `CandidatSansAlias` (`analysis/alias-candidats.ts`) reste la garde
 * de la charge, en aval.
 *
 * Un item épinglé que les items lus ne portent pas est refusé, qu'il soit écarté ensuite ou non :
 * la lecture du gel doit être complète avant le filtre.
 */

import type { ReponseObtenue } from "../interrogation/types.ts";
import { interrogesDe } from "../questions/tirabilite.ts";
import type { Question } from "../questions/types.ts";
import type { Item } from "../../validation/domaine/types.ts";
import type { ReponseANoter } from "./chaine.ts";
import type { ReferenceSoumise, ResoluAuGel } from "./charge-juge.ts";

/** Ce que le gel du run fixe pour toutes les réponses : lu une fois, validé à la frontière par l'appelant. */
export interface GelDeNotation {
  readonly questions: ReadonlyMap<string, Question>;
  /** Les items épinglés par les questions, par identifiant. */
  readonly items: ReadonlyMap<string, Item>;
  /** `tirage.entrees[]` par question (`charge-juge.ts:resolusAuGel`). */
  readonly resolus: ReadonlyMap<string, ResoluAuGel>;
  /** Les candidats interrogés au run (`interrogesDuRun`). */
  readonly interroges: ReadonlySet<string>;
}

export class ReponseImpreparable extends Error {
  constructor(reponse_id: string, detail: string) {
    super(`Réponse ${reponse_id} : ${detail}`);
    this.name = "ReponseImpreparable";
  }
}

export class ItemPrincipalNonInterroge extends Error {
  constructor(reponse_id: string, question_id: string, item_id: string, candidat_id: string) {
    super(
      `Réponse ${reponse_id} : l'item principal ${item_id} de la question ${question_id} est celui du candidat ${candidat_id}, non interrogé au run ; une question n'est tirée que pour un interrogé (§7, incohérence du gel).`,
    );
    this.name = "ItemPrincipalNonInterroge";
  }
}

/**
 * `run.perimetre.candidats[].interroge` : la même définition que l'alias et le dérangement, et que le
 * tirage, qui refuse déjà un item principal d'un non-interrogé (`tirabilite.ts:interrogesDe`).
 */
export function interrogesDuRun(run: { readonly perimetre: { readonly candidats: readonly { readonly candidat_id: string; readonly interroge: boolean }[] } }): ReadonlySet<string> {
  return interrogesDe(run);
}

export function preparerANoter(reponse: ReponseObtenue, gel: GelDeNotation): ReponseANoter {
  const question = gel.questions.get(reponse.question_id);
  if (question === undefined) throw new ReponseImpreparable(reponse.id, `la question ${reponse.question_id} est absente de questions.json.`);
  const formulation = question.formulations.find((f) => f.id === reponse.formulation_id);
  if (formulation === undefined) throw new ReponseImpreparable(reponse.id, `la formulation ${reponse.formulation_id} est absente de la question ${question.id}.`);
  const resolu_au_gel = gel.resolus.get(question.id);
  if (resolu_au_gel === undefined) throw new ReponseImpreparable(reponse.id, `la question ${question.id} est absente du tirage du run.`);
  return {
    reponse,
    question: { gabarit: question.gabarit, registre: formulation.registre, texte: formulation.texte },
    references: referencesDesInterroges(reponse.id, question, gel),
    resolu_au_gel,
  };
}

function referencesDesInterroges(reponse_id: string, question: Question, gel: GelDeNotation): readonly ReferenceSoumise[] {
  const references = question.items.map(({ reference, role }): ReferenceSoumise => {
    const item = gel.items.get(reference.item_id);
    if (item === undefined) throw new ReponseImpreparable(reponse_id, `la question ${question.id} épingle l'item ${reference.item_id}, absent des items lus au gel.`);
    return { item, role };
  });
  for (const { item, role } of references) {
    if (role === "principal" && !gel.interroges.has(item.candidat_id)) throw new ItemPrincipalNonInterroge(reponse_id, question.id, item.id, item.candidat_id);
  }
  return references.filter(({ item }) => gel.interroges.has(item.candidat_id));
}
