/**
 * Chargement d'un run pour l'écran de notation humaine : lu une fois au démarrage, validé à chaque
 * frontière (`analysis/lecture-run.ts`), rien d'écrit sauf les dossiers que crée `DepotNotation.ouvrir`.
 *
 * Ce qui est chargé est immuable pour la durée de la session : le run, les réponses obtenues du
 * contexte `run`, leurs questions et les items épinglés au gel. Les notations, elles, changent
 * pendant la session ; elles se relisent à chaque demande (`contexte.ts`).
 *
 * **Run invalidé (D51 (2)).** `chargerRun` refuse (`RunInvalideRefuse`) un run qui porte une
 * invalidation, par la même règle que la chaîne de notation automatique
 * (`pipeline/notation/chaine.ts:exigerNotable`) : un run invalidé n'est plus noté, humain compris
 * (constat 7, revue du 2026-10-17).
 */

import { existsSync, readFileSync } from "node:fs";
import { dispositionRunNote, lireDossier, lireItemsEpingles, lireRunJson, lireTirage, runDeNotationDe, VolumeAbsent, type RunLu } from "../../analysis/lecture-run.ts";
import { estDuRun } from "../../analysis/filtre.ts";
import { valider } from "../../outils/schemas/valider.ts";
import type { ReponseEcrite, ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { exigerNotable } from "../../pipeline/notation/chaine.ts";
import { citationsDeReference, type TextesDeVerification } from "../../pipeline/notation/extrait.ts";
import { tirerJeuOr, type JeuOr } from "../../pipeline/notation/echantillons.ts";
import { resolusAuGel, type QuestionPosee, type ReferenceSoumise, type ResoluAuGel } from "../../pipeline/notation/charge-juge.ts";
import type { RunDeNotation } from "../../pipeline/notation/types.ts";
import type { PerimetreDeNotation } from "../../pipeline/notation/notation-humaine.ts";
import type { EntreeTirage, Question } from "../../pipeline/questions/types.ts";
import type { Item } from "../../validation/domaine/types.ts";

export class RepertoireDeRunIllisible extends Error {
  constructor(repertoire_run: string) {
    super(`Le répertoire de run ${repertoire_run} est absent ou n'est pas un répertoire de run (run.json introuvable).`);
    this.name = "RepertoireDeRunIllisible";
  }
}

export class RunSansDonnee extends Error {
  constructor(detail: string) {
    super(`Run inutilisable pour la notation humaine : ${detail}`);
    this.name = "RunSansDonnee";
  }
}

/** Tout ce qu'il faut savoir d'une réponse obtenue pour bâtir sa vue et contrôler une notation. */
export interface ReponsePreparee {
  readonly reponse: ReponseObtenue;
  readonly question: QuestionPosee;
  readonly references: readonly ReferenceSoumise[];
  /** `tirage.entrees[]` de la question : réponse attendue et prémisse, que la vue montre (D27, D18). */
  readonly resolu_au_gel: ResoluAuGel;
  /** Les items des références, dans le même ordre. */
  readonly items: readonly Item[];
  readonly textes: TextesDeVerification;
}

export interface DonneesRun {
  readonly repertoire_run: string;
  readonly run: RunLu;
  readonly run_note: RunDeNotation;
  /** Les candidats du périmètre et les interrogés : la note d'une Q-ATT les lit (D29 (1)). */
  readonly perimetre: PerimetreDeNotation;
  /** Le tirage du jeu d'or si, et seulement si, le run est le run pilote. */
  readonly jeu_or: JeuOr | null;
  /** Les réponses obtenues du run, en ordre croissant d'identifiant. */
  readonly reponses: readonly ReponsePreparee[];
}

/** `questions.json` : un tableau de questions complètes, textes des formulations compris. */
function lireQuestions(chemin: string): readonly Question[] {
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!Array.isArray(brut)) throw new RunSansDonnee(`${chemin} n'est pas un tableau de questions.`);
  return brut.map((valeur: unknown, rang) => valider<Question>("question", valeur, `${chemin}, élément ${rang}`));
}

function lireItems(questions: readonly Question[], run: RunLu, repertoire_items: string, chemin_questions: string): ReadonlyMap<string, Item> {
  // Les items lus sont validés contre `schema/item.schema.json` : ce sont les items complets, que
  // le type étroit de l'analyse ne décrit qu'en partie.
  const items = lireItemsEpingles(questions, repertoire_items, run.versions.donnees_commit, chemin_questions) as unknown as readonly Item[];
  return new Map(items.map((item) => [item.id, item]));
}

function referencesDe(question: Question, items: ReadonlyMap<string, Item>): readonly ReferenceSoumise[] {
  return question.items.map(({ reference, role }) => {
    const item = items.get(reference.item_id);
    if (item === undefined) throw new RunSansDonnee(`la question ${question.id} épingle l'item ${reference.item_id}, introuvable au gel.`);
    return { item, role };
  });
}

function preparer(reponse: ReponseObtenue, questions: ReadonlyMap<string, Question>, items: ReadonlyMap<string, Item>, resolus: ReadonlyMap<string, ResoluAuGel>): ReponsePreparee {
  const question = questions.get(reponse.question_id);
  if (question === undefined) throw new RunSansDonnee(`la réponse ${reponse.id} porte sur la question ${reponse.question_id}, absente de questions.json.`);
  const formulation = question.formulations.find((f) => f.id === reponse.formulation_id);
  if (formulation === undefined) throw new RunSansDonnee(`la réponse ${reponse.id} porte sur la formulation ${reponse.formulation_id}, absente de la question ${question.id}.`);
  const resolu_au_gel = resolus.get(question.id);
  if (resolu_au_gel === undefined) throw new RunSansDonnee(`la réponse ${reponse.id} porte sur la question ${question.id}, absente du tirage du run.`);
  const references = referencesDe(question, items);
  const itemsDeLaReponse = references.map((r) => r.item);
  return {
    reponse,
    question: { gabarit: question.gabarit, registre: formulation.registre, texte: formulation.texte },
    references,
    resolu_au_gel,
    items: itemsDeLaReponse,
    textes: { reponse: reponse.normalise.texte, citations_reference: citationsDeReference(itemsDeLaReponse) },
  };
}

function lireReponsesObtenues(repertoire_run: string, run_id: string): readonly ReponseObtenue[] {
  const dossier = dispositionRunNote(repertoire_run).reponses;
  if (!existsSync(dossier)) throw new VolumeAbsent(dossier);
  const obtenues = (r: ReponseEcrite): r is ReponseObtenue => estDuRun(r) && r.statut_reponse === "obtenue";
  return lireDossier<ReponseEcrite>(dossier, "reponse", run_id).filter(obtenues);
}

export function chargerRun(repertoire_run: string, repertoire_items: string): DonneesRun {
  if (!existsSync(dispositionRunNote(repertoire_run).run_json)) throw new RepertoireDeRunIllisible(repertoire_run);
  const run = lireRunJson(repertoire_run);
  exigerNotable(run);
  const chemin_questions = dispositionRunNote(repertoire_run).questions;
  const questions = lireQuestions(chemin_questions);
  const items = lireItems(questions, run, repertoire_items, chemin_questions);
  const parId = new Map(questions.map((q) => [q.id, q]));
  // `lireTirage` a validé tirage.json contre son schéma, qui exige reponse_attendue et premisse_fausse de chaque entrée.
  const resolus = resolusAuGel(lireTirage(repertoire_run, run).entrees as unknown as readonly EntreeTirage[]);
  const reponses = lireReponsesObtenues(repertoire_run, run.id).map((r) => preparer(r, parId, items, resolus));
  const run_note = runDeNotationDe(run);
  return {
    repertoire_run,
    run,
    run_note,
    perimetre: { candidats: run_note.candidats, interroges: run.perimetre.candidats.filter((c) => c.interroge).map((c) => c.candidat_id) },
    jeu_or: run.type_run === "pilote" ? tirerJeuOr(reponses.map((r) => r.reponse.id), run_note.graines.echantillon_humain) : null,
    reponses,
  };
}
