/**
 * Constat n° 36 de la conformité du 2026-09-24, protocole 0.9 (§5) : « N'entrent au tirage que les
 * questions dont la réponse attendue est définie à la date de gel : un item dont la période de
 * validité ne contient pas cette date, ou dont la position est « sans objet » pour un gabarit fermé,
 * négatif ou orienté, en est exclu et compté à part dans le rapport du run. »
 *
 * Avant la 0.9, ces questions entraient dans les strates et la réponse attendue levait APRÈS le
 * tirage : le run partait ou non selon la graine. La règle est maintenant évaluée avant tout usage
 * de la graine, en réutilisant `reponseAttendue` (jamais recopiée), et chaque exclusion est inscrite
 * dans le tirage publié avec son motif.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import { questionsTirables } from "../../pipeline/questions/tirabilite.ts";
import type { CodeGabarit, Item, Question } from "../../pipeline/questions/types.ts";
import { candidat, completerSur, graine, itemO, itemP, mesure, perimetre, run } from "./fabriques.ts";
import { valider } from "../../outils/schemas/valider.ts";

/** Minuit UTC du 1er décembre 2026 : la date civile « 2026-12-01 » tombe exactement sur le gel. */
const GEL = "2026-12-01T01:00:00+01:00";
const CANDIDATS = ["demo-alpha"];
const RUN = run([candidat({ candidat_id: "demo-alpha" })], GEL);

const M_OK = mesure({ cle: "tg-ok", theme: "fiscalite_pouvoir_achat" });
const M_FIN = mesure({ cle: "tg-fin", theme: "fiscalite_pouvoir_achat" });
const M_DEBUT = mesure({ cle: "tg-debut", theme: "retraites" });
const M_SANS_OBJET = mesure({ cle: "tg-so", theme: "retraites" });
const M_O = mesure({ cle: "tg-o", theme: "sante" });
const MESURES = [M_OK, M_FIN, M_DEBUT, M_SANS_OBJET, M_O];

const OK = itemP({ cle: "tg-ok", candidat_id: "demo-alpha", mesure: M_OK });
/** `valide_au` = date civile du gel : déjà obsolète (intervalle semi-ouvert). */
const FIN_AU_GEL = itemP({ cle: "tg-fin", candidat_id: "demo-alpha", mesure: M_FIN, valide_au: "2026-12-01" });
/** `valide_du` = date civile du gel : déjà en vigueur. */
const DEBUT_AU_GEL = itemP({ cle: "tg-debut", candidat_id: "demo-alpha", mesure: M_DEBUT, valide_du: "2026-12-01" });
const SANS_OBJET = itemP({ cle: "tg-so", candidat_id: "demo-alpha", mesure: M_SANS_OBJET, position: "sans_objet" });
/** Item O dont l'état en vigueur au gel (postérieur, changement le 2026-10-01) est « sans_objet ». */
const O_SANS_OBJET = itemO({
  cle: "tg-o",
  candidat_id: "demo-alpha",
  mesure: M_O,
  position: "pour",
  position_posterieure: "sans_objet",
  date_changement: "2026-10-01",
});
const ITEMS = [OK, FIN_AU_GEL, DEBUT_AU_GEL, SANS_OBJET, O_SANS_OBJET];
// Protocole 0.11 (constat n° 37) : la formulation orientée d'une question sur un item O porte la
// position affirmée, sans quoi sa prémisse est indécidable au gel et le tirage refuse la question.
const QUESTIONS: readonly Question[] = engendrer(ITEMS, MESURES, perimetre(CANDIDATS)).map(completerSur(ITEMS));

function questionDe(item: Item, gabarit: CodeGabarit): Question {
  const trouvee = QUESTIONS.find(
    (question) =>
      question.gabarit === gabarit && question.items.some((entree) => entree.reference.item_id === item.id),
  );
  if (trouvee === undefined) throw new Error(`Aucune ${gabarit} engendrée sur ${item.id}.`);
  return trouvee;
}

function tirerAvec(valeur: number) {
  return tirer({
    questions: QUESTIONS,
    items: ITEMS,
    mesures: MESURES,
    run: RUN,
    graine: graine(valeur),
    parametres: { questions_par_strate: 10, questions_attribution_par_theme: 10 },
  });
}

function tirees(valeur = 20261201): readonly string[] {
  return tirerAvec(valeur).tirage.entrees.map((entree) => entree.question_id);
}

function motifDe(question: Question): string | undefined {
  return tirerAvec(20261201).tirage.exclusions.find((exclusion) => exclusion.question_id === question.id)
    ?.motif;
}

describe("n° 36 : fenêtre de validité à l'instant du gel", () => {
  it("valide_au = instant du gel : les questions de l'item sont exclues, motif hors_validite", () => {
    for (const gabarit of ["Q-DIR", "Q-FER", "Q-NEG"] as const) {
      const question = questionDe(FIN_AU_GEL, gabarit);
      expect(tirees()).not.toContain(question.id);
      expect(motifDe(question)).toBe("hors_validite");
    }
  });

  it("valide_du = instant du gel : les questions de l'item sont tirables et tirées", () => {
    for (const gabarit of ["Q-DIR", "Q-FER", "Q-NEG"] as const) {
      const question = questionDe(DEBUT_AU_GEL, gabarit);
      expect(tirees()).toContain(question.id);
      expect(motifDe(question)).toBeUndefined();
    }
  });
});

describe("n° 36 : position « sans_objet » en vigueur au gel", () => {
  it.each(["Q-FER", "Q-NEG"] as const)("sur %s (item P) : exclue et comptée, motif reponse_attendue_indecidable", (gabarit) => {
    const question = questionDe(SANS_OBJET, gabarit);
    expect(tirees()).not.toContain(question.id);
    expect(motifDe(question)).toBe("reponse_attendue_indecidable");
  });

  it.each(["Q-FER", "Q-ORI"] as const)("sur %s (item O à l'état « sans_objet ») : exclue et comptée", (gabarit) => {
    const question = questionDe(O_SANS_OBJET, gabarit);
    expect(tirees()).not.toContain(question.id);
    expect(motifDe(question)).toBe("reponse_attendue_indecidable");
  });

  it("sur Q-DIR : tirable, la réponse attendue est la position « sans_objet »", () => {
    const question = questionDe(SANS_OBJET, "Q-DIR");
    const entree = tirerAvec(20261201).tirage.entrees.find((candidate) => candidate.question_id === question.id);
    expect(entree?.reponse_attendue).toMatchObject({ nature: "position", position: "sans_objet" });
    expect(motifDe(question)).toBeUndefined();
  });

  it("sur Q-ACT (item O) : tirable, la réponse attendue ne dépend que des dates", () => {
    const question = questionDe(O_SANS_OBJET, "Q-ACT");
    expect(tirees()).toContain(question.id);
  });

  it("l'exclusion porte la question, son gabarit, son thème, son candidat et le détail de l'erreur", () => {
    const question = questionDe(SANS_OBJET, "Q-FER");
    const exclusion = tirerAvec(20261201).tirage.exclusions.find((e) => e.question_id === question.id);
    expect(exclusion).toMatchObject({
      question_id: question.id,
      gabarit: "Q-FER",
      theme: "retraites",
      candidat_id: "demo-alpha",
      motif: "reponse_attendue_indecidable",
    });
    expect(exclusion?.detail).toMatch(/sans_objet/);
  });

  it("le tirage publié, exclusions et Q-ATT sans principal comprises, est conforme à tirage.schema.json", () => {
    const publie = JSON.parse(JSON.stringify(tirerAvec(20261201).tirage)) as unknown;
    expect(() => valider("tirage", publie, "tirage avec exclusions")).not.toThrow();
  });

  it("compte chaque exclusion une fois, quelle que soit la graine", () => {
    const premier = tirerAvec(1).tirage.exclusions;
    // Trois questions de l'item périmé, deux de l'item P « sans_objet » et sa Q-ATT (liste non
    // définie au gel), deux de l'item O « sans_objet ».
    expect(premier).toHaveLength(8);
    expect(new Set(premier.map((exclusion) => exclusion.question_id)).size).toBe(8);
    expect(tirerAvec(20270101).tirage.exclusions).toEqual(premier);
  });
});

/*
 * Décision de l'auteur du 2026-09-25 (lecture littérale de l'annexe B confirmée) : une Q-ATT dont
 * aucun item n'est en vigueur au gel est tirée, et sa liste attendue est vide — personne ne porte
 * la mesure au gel. Elle n'est pas exclue pour hors validité.
 */
describe("Q-ATT dont aucun item n'est en vigueur au gel", () => {
  it("est tirée, avec une liste attendue vide, et n'est pas comptée parmi les exclusions", () => {
    const attribution = questionDe(FIN_AU_GEL, "Q-ATT");
    expect(attribution.candidat_id).toBeUndefined();
    const resultat = tirerAvec(20261201);
    const entree = resultat.tirage.entrees.find((candidate) => candidate.question_id === attribution.id);
    expect(entree?.reponse_attendue).toEqual({
      nature: "liste_candidats",
      candidats_attendus: [],
      resolution_temporelle: { date_gel: GEL, regle: "semi_ouvert" },
    });
    expect(resultat.tirage.exclusions.map((exclusion) => exclusion.question_id)).not.toContain(attribution.id);
  });
});

describe("n° 36 : la graine ne décide plus du succès du tirage", () => {
  it("deux graines différentes sur le même jeu : les deux tirages réussissent", () => {
    expect(() => tirerAvec(20261201)).not.toThrow();
    expect(() => tirerAvec(20270101)).not.toThrow();
    expect(tirees(20261201).length).toBeGreaterThan(0);
    expect([...tirees(20270101)].sort()).toEqual([...tirees(20261201)].sort());
  });

  it("questionsTirables applique la même règle, avant toute graine", () => {
    const tirables = questionsTirables(QUESTIONS, ITEMS, MESURES, RUN).map((question) => question.id);
    expect(tirables).not.toContain(questionDe(FIN_AU_GEL, "Q-DIR").id);
    expect(tirables).not.toContain(questionDe(SANS_OBJET, "Q-FER").id);
    expect(tirables).toContain(questionDe(SANS_OBJET, "Q-DIR").id);
    expect([...tirables].sort()).toEqual([...tirees()].sort());
  });
});
