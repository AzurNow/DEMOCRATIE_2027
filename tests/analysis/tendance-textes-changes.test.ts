/**
 * §8 (protocole 0.9), tendance : « une question dont un texte a changé sort de la comparaison, et
 * leur nombre est publié ». Le nombre est un chiffre du run (ni par outil, ni par mode) : les
 * questions présentes aux deux runs sous le même identifiant mais dont la signature
 * (`analysis/signature-question.ts`, seule définition) diffère.
 */

import { describe, expect, it } from "vitest";
import { tendanceDuRun } from "../../analysis/tendance.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { questionsAuTexteChange } from "../../analysis/signature-question.ts";
import type { Question } from "../../analysis/types.ts";
import { empreinte, idQuestion, question, tousCompares, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 50, graine_du_run: 20261201, cle: ["test", "tendance-textes"] };

/** Trois formulations ; `familier` permet de changer la seule formulation familière. */
function questionAvec(cle: string, familier = "v1"): Question {
  return question({
    id: idQuestion(cle),
    grappe_id: ulid(cle),
    formulations: [
      { id: ulid(`${cle}-neutre`), registre: "neutre", empreinte_texte: empreinte(`${cle}-neutre`) },
      { id: ulid(`${cle}-familier`), registre: "familier", empreinte_texte: empreinte(`${cle}-familier-${familier}`) },
      {
        id: ulid(`${cle}-oriente`),
        registre: "oriente",
        empreinte_texte: empreinte(`${cle}-oriente`),
        // Protocole 0.11 (n° 37) : la prémisse se résout au gel, dans le tirage, plus sur la question.
      },
    ],
  });
}

const PREMIER = [questionAvec("q1"), questionAvec("q2"), questionAvec("q-disparue")];
const DERNIER = [questionAvec("q1"), questionAvec("q2", "v2"), questionAvec("q-neuve")];

describe("questions sorties de la tendance parce qu'un texte a changé", () => {
  it("une question à formulation familière changée compte 1", () => {
    expect(questionsAuTexteChange(PREMIER, DERNIER)).toEqual([idQuestion("q2")]);
  });

  it("une question absente d'un des deux runs ne compte pas", () => {
    const ids = questionsAuTexteChange(PREMIER, DERNIER);
    expect(ids).not.toContain(idQuestion("q-disparue"));
    expect(ids).not.toContain(idQuestion("q-neuve"));
  });

  it("mêmes textes aux deux runs : zéro", () => {
    expect(questionsAuTexteChange(PREMIER, PREMIER)).toEqual([]);
  });

  it("la sortie de tendance publie le nombre au niveau du run, à côté des lignes par outil et mode", () => {
    const unites = (questions: readonly Question[]) =>
      questions.map((q) => unite({ question_id: q.id, grappe_id: q.grappe_id, reponse_id: ulid(`r-${q.id}`) }));
    const resultat = tendanceDuRun(
      { questions: PREMIER, unites: unites(PREMIER), couples: tousCompares(unites(PREMIER)) },
      { questions: DERNIER, unites: unites(DERNIER), couples: tousCompares(unites(DERNIER)) },
      exactitude,
      OPTIONS,
    );
    expect(resultat.questions_texte_change).toBe(1);
    expect(resultat.par_outil_et_mode).toHaveLength(1);
    expect(resultat.par_outil_et_mode[0]?.questions_communes).toBe(1);
  });
});
