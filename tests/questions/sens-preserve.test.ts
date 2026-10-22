/**
 * Constat n° 58 de la conformité du 2026-09-24 (§5.11) : « Les formulations sont produites par un
 * modèle puis relues par un annotateur qui vérifie qu'elles ne changent pas le sens. » Le schéma
 * admettait une formulation relue avec `sens_preserve: false`, et rien ne la refusait au tirage.
 *
 * Choix retenu : le refus vit dans `tirer`, pas dans le schéma. La relecture qui conclut à un sens
 * changé est un fait du processus, à garder dans le fichier de la question ; ce qui est interdit,
 * c'est d'interroger un outil avec cette formulation. `tirer` lève donc, en nommant la question et
 * la formulation, avant tout usage de la graine — jamais d'exclusion silencieuse.
 */

import { describe, expect, it } from "vitest";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { DemandeTirage } from "../../pipeline/questions/tirage.ts";
import { FormulationAuSensChange } from "../../pipeline/questions/tirabilite.ts";
import type { Question } from "../../pipeline/questions/types.ts";
import { candidat, graine, jeu, run } from "./fabriques.ts";

const JEU = jeu({ candidats: ["demo-alpha", "demo-beta"], themes: ["retraites"], mesures_par_theme: 2 });
const RUN = run([candidat({ candidat_id: "demo-alpha" }), candidat({ candidat_id: "demo-beta" })]);

/** La question de rang `rang`, dont la formulation familière a été relue « sens changé ». */
function avecSensChange(rang: number): { readonly questions: readonly Question[]; readonly visee: Question } {
  const visee = JEU.questions[rang] as Question;
  const alteree: Question = {
    ...visee,
    formulations: visee.formulations.map((formulation) =>
      formulation.registre === "familier"
        ? { ...formulation, relecture: { ...formulation.relecture, sens_preserve: false } }
        : formulation,
    ),
  };
  return { questions: JEU.questions.map((question, i) => (i === rang ? alteree : question)), visee };
}

function demande(questions: readonly Question[], date_gel?: string, valeur?: number): DemandeTirage {
  return {
    questions,
    items: JEU.items,
    mesures: JEU.mesures,
    run: date_gel === undefined ? RUN : { ...RUN, date_gel },
    graine: graine(valeur),
    parametres: { questions_par_strate: 5, questions_attribution_par_theme: 5 },
  };
}

describe("n° 58 : une formulation au sens changé n'est jamais interrogée", () => {
  it("le jeu intact se tire sans erreur", () => {
    expect(tirer(demande(JEU.questions)).tirage.entrees.length).toBeGreaterThan(0);
  });

  it("une formulation sens_preserve: false est refusée au tirage, en nommant la question", () => {
    const { questions, visee } = avecSensChange(0);
    expect(() => tirer(demande(questions))).toThrow(FormulationAuSensChange);
    expect(() => tirer(demande(questions))).toThrow(new RegExp(`${visee.id}.*familier`));
  });

  it("le refus précède tout usage de la graine : aucune graine ne le fait passer", () => {
    const { questions } = avecSensChange(1);
    for (const valeur of [0, 1, 20261201]) {
      expect(() => tirer(demande(questions, undefined, valeur))).toThrow(FormulationAuSensChange);
    }
  });

  it("une question d'attribution au sens changé est refusée elle aussi", () => {
    const rang = JEU.questions.findIndex((question) => question.gabarit === "Q-ATT");
    expect(rang).toBeGreaterThanOrEqual(0);
    const { questions } = avecSensChange(rang);
    expect(() => tirer(demande(questions))).toThrow(FormulationAuSensChange);
  });

  it("une question exclue au gel (hors validité) n'est pas interrogée : aucun refus, elle reste exclue", () => {
    const { questions, visee } = avecSensChange(0);
    expect(visee.gabarit).not.toBe("Q-ATT");
    // Gel antérieur au début de validité des items (2026-09-01) : les questions d'item sont exclues.
    const { tirage } = tirer(demande(questions, "2026-08-01T06:00:00+02:00"));
    expect(tirage.entrees.map((entree) => entree.question_id)).not.toContain(visee.id);
    expect(tirage.exclusions.map((exclusion) => exclusion.question_id)).toContain(visee.id);
  });
});
