/**
 * Constat n° 35 de la conformité du 2026-09-24, protocole 0.9 (§5) : « Une question est reprise si
 * elle porte le même identifiant et les mêmes empreintes de texte qu'au run précédent ; une
 * question dont un texte a changé compte comme neuve. Par candidat, et pour les questions
 * d'attribution par l'ensemble des thèmes, le nombre de reprises visé est 80 % du nombre de
 * questions tirées, arrondi à l'entier inférieur ; une strate où les questions neuves manquent est
 * complétée par des reprises, et le dépassement qui en résulte est rapporté avec le run. »
 *
 * La définition de « même question » vit une fois, dans `pipeline/questions/signature.ts` : le
 * tirage (reprise, §5) et la tendance (questions communes, §8) doivent y répondre pareil.
 */

import { describe, expect, it } from "vitest";
import { questionsCommunes } from "../../analysis/tendance.ts";
import type { Question as QuestionAnalyse } from "../../analysis/types.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { PART_REPRISE, tirer } from "../../pipeline/questions/tirage.ts";
import { tiragePrecedentDe } from "../../pipeline/questions/entrees-tirage.ts";
import type { Question } from "../../pipeline/questions/types.ts";
import { candidat, graine, jeu, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const RUN_PRECEDENT = "44CX8VSV75Q6ZAHDEJ8VA81YQE";

/* ---------------------------------------------- même identifiant, texte changé */

const UN = jeu({ candidats: ["demo-alpha"], themes: ["fiscalite_pouvoir_achat"], mesures_par_theme: 1 });
const RUN_UN = run([candidat({ candidat_id: "demo-alpha" })], GEL);
const Q_DIR = UN.questions.find((question) => question.gabarit === "Q-DIR") as Question;

/** La même question, dont seule la formulation familière a changé de texte. */
function familiereChangee(question: Question): Question {
  return {
    ...question,
    formulations: question.formulations.map((formulation) =>
      formulation.registre === "familier"
        ? { ...formulation, texte: `${formulation.texte} (corrigée)`, empreinte_texte: sha256(`${formulation.texte} (corrigée)`) }
        : formulation,
    ),
  };
}

function repriseDe(courante: Question, precedente: Question): boolean {
  const questions = UN.questions.map((question) => (question.id === courante.id ? courante : question));
  const resultat = tirer({
    questions,
    items: UN.items,
    mesures: UN.mesures,
    run: RUN_UN,
    graine: graine(),
    parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
    tirage_precedent: tiragePrecedentDe(RUN_PRECEDENT, [precedente]),
  });
  const entree = resultat.tirage.entrees.find((candidate) => candidate.question_id === courante.id);
  if (entree === undefined) throw new Error("La question n'a pas été tirée.");
  return entree.reprise;
}

/** La tendance lit les questions au format de l'analyse, dont la question du pipeline est un cas. */
function commune(courante: Question, precedente: Question): boolean {
  const avant: QuestionAnalyse = precedente;
  const apres: QuestionAnalyse = courante;
  return questionsCommunes([avant], [apres]).has(courante.id);
}

describe("n° 35 : une question reprise a le même identifiant et les mêmes textes", () => {
  it("même identifiant, formulation familière seule changée : neuve pour le tirage", () => {
    expect(repriseDe(familiereChangee(Q_DIR), Q_DIR)).toBe(false);
  });

  it("même identifiant, mêmes trois textes : reprise pour le tirage", () => {
    expect(repriseDe(Q_DIR, Q_DIR)).toBe(true);
  });

  it("la tendance et le tirage donnent la même réponse sur ces deux cas", () => {
    const changee = familiereChangee(Q_DIR);
    expect(commune(changee, Q_DIR)).toBe(false);
    expect(commune(Q_DIR, Q_DIR)).toBe(true);
    expect(commune(changee, Q_DIR)).toBe(repriseDe(changee, Q_DIR));
    expect(commune(Q_DIR, Q_DIR)).toBe(repriseDe(Q_DIR, Q_DIR));
  });

  it("une question neuve ne porte ni run d'origine ni empreinte précédente", () => {
    const changee = familiereChangee(Q_DIR);
    const resultat = tirer({
      questions: UN.questions.map((question) => (question.id === changee.id ? changee : question)),
      items: UN.items,
      mesures: UN.mesures,
      run: RUN_UN,
      graine: graine(),
      parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
      tirage_precedent: tiragePrecedentDe(RUN_PRECEDENT, [Q_DIR]),
    });
    const entree = resultat.tirage.entrees.find((candidate) => candidate.question_id === changee.id);
    expect(entree?.run_origine_id).toBeUndefined();
    expect(entree?.empreinte_texte_precedente).toBeUndefined();
  });
});

/* ------------------------------------------------ budget des questions d'attribution */

describe("n° 35 : budget de reprise des Q-ATT sur l'ensemble des thèmes", () => {
  /*
   * Deux thèmes, 16 mesures chacun, donc 16 Q-ATT par thème (une par mesure, n° 39), dont 8
   * reprenables. Quota d'attribution 7 : cible 7 par thème, 14 au total. Budget du groupe :
   * ⌊0,8 × 14⌋ = 11. Un budget par thème donnerait ⌊0,8 × 7⌋ × 2 = 10.
   */
  it("deux thèmes à cible 7 chacun : 11 reprises (budget du groupe), pas 10", () => {
    const deux = jeu({
      candidats: ["demo-alpha"],
      themes: ["fiscalite_pouvoir_achat", "retraites"],
      mesures_par_theme: 16,
    });
    const attributions = deux.questions.filter((question) => question.candidat_id === undefined);
    expect(attributions).toHaveLength(32);
    const anciennes = deux.mesures
      .filter((_, rang) => rang % 16 < 8)
      .flatMap((referent) => attributions.filter((question) => question.grappe_id === referent.id));
    expect(anciennes).toHaveLength(16);

    const resultat = tirer({
      questions: deux.questions,
      items: deux.items,
      mesures: deux.mesures,
      run: RUN_UN,
      graine: graine(),
      parametres: { questions_par_strate: 1, questions_attribution_par_theme: 7 },
      tirage_precedent: tiragePrecedentDe(RUN_PRECEDENT, anciennes),
    });
    const tirees = resultat.tirage.entrees.filter((entree) => entree.candidat_id === undefined);
    expect(tirees).toHaveLength(14);
    expect(Math.floor(PART_REPRISE * 14)).toBe(11);
    expect(tirees.filter((entree) => entree.reprise)).toHaveLength(11);
    expect(resultat.tirage.bilan_reprise).toContainEqual({ cible: 14, budget_reprise: 11, reprises: 11, depassement: 0 });
  });
});

/* ------------------------------------------------------------- dépassement publié */

describe("n° 35 : le dépassement du budget est inscrit dans le tirage publié", () => {
  it("strate sans question neuve : complétée par des reprises, dépassement rapporté", () => {
    const resultat = tirer({
      questions: UN.questions,
      items: UN.items,
      mesures: UN.mesures,
      run: RUN_UN,
      graine: graine(),
      parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
      // Toutes les questions étaient au run précédent : aucune neuve disponible.
      tirage_precedent: tiragePrecedentDe(RUN_PRECEDENT, UN.questions),
    });
    // Trois gabarits nommant le candidat sur un item P : cible 3, budget ⌊2,4⌋ = 2, 3 reprises.
    expect(resultat.tirage.bilan_reprise).toContainEqual({
      candidat_id: "demo-alpha",
      cible: 3,
      budget_reprise: 2,
      reprises: 3,
      depassement: 1,
    });
    // La Q-ATT seule : cible 1, budget 0, 1 reprise.
    expect(resultat.tirage.bilan_reprise).toContainEqual({ cible: 1, budget_reprise: 0, reprises: 1, depassement: 1 });
  });

  it("sans run précédent : aucun budget, aucune reprise, aucun dépassement", () => {
    const resultat = tirer({
      questions: UN.questions,
      items: UN.items,
      mesures: UN.mesures,
      run: RUN_UN,
      graine: graine(),
      parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
    });
    for (const bilan of resultat.tirage.bilan_reprise) {
      expect(bilan.reprises).toBe(0);
      expect(bilan.depassement).toBe(0);
    }
  });
});
