/**
 * Entrées publiées d'un tirage, et reprise d'une question depuis le run précédent (§5, protocole
 * 0.9).
 *
 * **La reprise.** Une question est reprise si elle a le même identifiant et les mêmes empreintes
 * de texte qu'au run précédent (`signature.ts`, seule définition, partagée avec la tendance du
 * §8). Par candidat, et pour les questions d'attribution sur l'ensemble des thèmes, le budget est
 * `⌊0,8 × questions tirées⌋`, compensations comprises. Il se consomme strate par strate, dans
 * l'ordre mélangé par la graine ; une strate sans assez de questions neuves est complétée par des
 * reprises hors budget, et le dépassement est inscrit dans `tirage.bilan_reprise`
 * (`tirage.ts:tirerGroupe`, `tirerParmi`).
 *
 * **Les entrées publiées.** Chaque entrée fige, au gel, les items que `itemsGardesAuGel` garde
 * (`tirabilite.ts`), la réponse attendue et la prémisse. Pour un item arbitré, la dernière
 * décision du panel est figée avec sa date : la symétrie du tirage publié se juge sur elle, et non
 * sur l'état des items au moment où l'on revérifie.
 */

import { decisionPanelAuGel } from "./contestation.ts";
import { premisseFausseAuGel, reponseAttendue } from "./reponse-attendue.ts";
import { signatureQuestion } from "./signature.ts";
import { indexer, interrogesDe, itemDe, itemsGardesAuGel, themeDeQuestion } from "./tirabilite.ts";
import type { GelDuRun, Index } from "./tirabilite.ts";
import type { EntreeTirage, Item, ItemAuGel, Mesure, Question, Tirage } from "./types.ts";
import { estStatutValidation } from "./types.ts";

/** Ce que le run précédent dit d'une question : sa signature (§5, 0.9) et son empreinte neutre. */
export interface QuestionPrecedente {
  readonly signature: string;
  /** Recopiée dans `empreinte_texte_precedente` d'une entrée reprise. */
  readonly empreinte_neutre: string;
}

/**
 * Ce qu'il faut savoir du run précédent pour décider d'une reprise : son identifiant, et chaque
 * question tirée alors, telle qu'elle était (signature des trois textes). Une question dont un
 * texte a changé depuis n'est pas reprise.
 */
export interface TiragePrecedent {
  readonly run_id: string;
  readonly questions: ReadonlyMap<string, QuestionPrecedente>;
}

export function empreinteNeutre(question: Question): string {
  const neutre = question.formulations.find((formulation) => formulation.registre === "neutre");
  if (neutre === undefined) {
    throw new Error(`La question ${question.id} ne porte aucune formulation neutre.`);
  }
  return neutre.empreinte_texte;
}

/** La question telle que le run précédent l'a posée, si elle est reprise (§5, protocole 0.9). */
export function precedenteSiReprise(
  question: Question,
  precedent: TiragePrecedent | undefined,
): QuestionPrecedente | undefined {
  const avant = precedent?.questions.get(question.id);
  if (avant === undefined || avant.signature !== signatureQuestion(question)) return undefined;
  return avant;
}

/**
 * Frontière de sortie : le statut écrit dans le tirage appartient à l'énumération du schéma. Pour
 * un item arbitré, la dernière décision du panel est figée avec sa date : la symétrie du tirage
 * publié se juge sur elle, et non sur l'état des items au moment où l'on revérifie.
 */
function itemAuGel(entree: Question["items"][number], index: Index, date_gel: string): ItemAuGel {
  const item = itemDe(entree.reference.item_id, index.items);
  if (!estStatutValidation(item.statut_validation)) {
    throw new Error(
      `Statut de validation « ${item.statut_validation} » de l'item ${item.id} hors de ` +
        `l'énumération du schéma.`,
    );
  }
  const socle = {
    reference: entree.reference,
    role: entree.role,
    statut_validation_au_gel: item.statut_validation,
    statut_contestation_au_gel: item.statut_contestation,
  };
  if (item.statut_contestation !== "arbitree") return socle;
  return { ...socle, decision_panel_au_gel: decisionPanelAuGel(item, date_gel) };
}

export function entreeDe(
  question: Question,
  index: Index,
  run: GelDuRun,
  precedent: TiragePrecedent | undefined,
): EntreeTirage {
  const items = [...index.items.values()];
  // Les items que le gel garde (`itemsGardesAuGel`) : ceux-là seuls sont figés et définissent la liste.
  const gardes = itemsGardesAuGel(question, index.items, interrogesDe(run));
  const socle = {
    question_id: question.id,
    theme: themeDeQuestion(question, index),
    gabarit: question.gabarit,
    grappe_id: question.grappe_id,
    items_au_gel: gardes.map((entree) => itemAuGel(entree, index, run.date_gel)),
    reponse_attendue: reponseAttendue({ gabarit: question.gabarit, items: gardes }, items, run.date_gel, run.perimetre.candidats),
    premisse_fausse: premisseFausseAuGel(question, items, run.date_gel),
    ...(question.candidat_id === undefined ? {} : { candidat_id: question.candidat_id }),
  };

  const avant = precedenteSiReprise(question, precedent);
  if (precedent === undefined || avant === undefined) return { ...socle, reprise: false };
  return {
    ...socle,
    reprise: true,
    run_origine_id: precedent.run_id,
    empreinte_texte_precedente: avant.empreinte_neutre,
  };
}

/**
 * Utilitaire public : construit les entrées d'un ensemble de questions déjà choisi, au gel du run
 * (sa date et son périmètre : une seule source pour les deux).
 */
export function entreesPour(
  questions: readonly Question[],
  items: readonly Item[],
  mesures: readonly Mesure[],
  run: GelDuRun,
  precedent?: TiragePrecedent,
): readonly EntreeTirage[] {
  const index = indexer(items, mesures);
  return questions.map((question) => entreeDe(question, index, run, precedent));
}

/** Le run précédent, à partir des questions qu'il a tirées, telles qu'elles étaient alors. */
export function tiragePrecedentDe(run_id: string, questions: readonly Question[]): TiragePrecedent {
  return {
    run_id,
    questions: new Map(
      questions.map((question) => [
        question.id,
        { signature: signatureQuestion(question), empreinte_neutre: empreinteNeutre(question) },
      ]),
    ),
  };
}

/** Reconstruit l'entrée du run suivant à partir d'un tirage publié et de ses questions. */
export function tiragePrecedentDepuis(
  tirage: Tirage,
  questions: readonly Question[],
): TiragePrecedent {
  const parId = new Map(questions.map((question) => [question.id, question]));
  const tirees = tirage.entrees.map((entree) => {
    const question = parId.get(entree.question_id);
    if (question === undefined) {
      throw new Error(`Question ${entree.question_id} du tirage ${tirage.run_id} introuvable.`);
    }
    return question;
  });
  return tiragePrecedentDe(tirage.run_id, tirees);
}
