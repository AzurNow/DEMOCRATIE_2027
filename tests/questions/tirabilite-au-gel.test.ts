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
      // D64 : aucun item en vigueur au gel, aucune référence ; tout candidat interrogé cité y est sans référence.
      candidats_references: [],
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

/*
 * §5.60 et §5.61 (protocole 0.27, D67 ; conformité du 2026-11-03, constat n° 3) : « Deux items d'un
 * même candidat sur la même mesure, tous deux en vigueur au gel, dont les positions diffèrent, sans
 * qu'une source postérieure ait retiré l'une d'elles, ne disent pas laquelle fait foi : les deux items
 * sont exclus du tirage et comptés à part dans le rapport du run, la mesure n'engendre aucune question
 * d'attribution tant qu'ils le sont, et l'auteur les conteste dès le gel. » Avant ce lot, la Q-ATT de
 * la mesure levait `PositionsContradictoires` et arrêtait tout le tirage.
 */
describe("§5.60 : deux positions en vigueur incompatibles d'un même candidat sur une mesure", () => {
  const INCOMPAT_CANDIDATS = ["demo-alpha", "demo-beta"];
  const INCOMPAT_RUN = run(INCOMPAT_CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

  const M_CONFLIT = mesure({ cle: "pi-conflit", theme: "sante" });
  const M_RESOLU = mesure({ cle: "pi-resolu", theme: "retraites" });
  const M_TROIS = mesure({ cle: "pi-trois", theme: "fiscalite_pouvoir_achat" });
  const M_PO = mesure({ cle: "pi-po", theme: "education" });
  const M_SAUVE = mesure({ cle: "pi-sauve", theme: "retraites" });
  const MESURES_PI = [M_CONFLIT, M_RESOLU, M_TROIS, M_PO, M_SAUVE];

  /** Alpha porte « pour » et « contre » sur M_CONFLIT ; beta y porte un item valide. */
  const A_POUR = itemP({ cle: "pi-a-pour", candidat_id: "demo-alpha", mesure: M_CONFLIT, position: "pour" });
  const A_CONTRE = itemP({ cle: "pi-a-contre", candidat_id: "demo-alpha", mesure: M_CONFLIT, position: "contre" });
  const B_POUR = itemP({ cle: "pi-b-pour", candidat_id: "demo-beta", mesure: M_CONFLIT, position: "pour" });
  /** Sur M_RESOLU, l'item « contre » d'alpha est obsolète exactement à l'instant du gel. */
  const R_POUR = itemP({ cle: "pi-r-pour", candidat_id: "demo-alpha", mesure: M_RESOLU, position: "pour" });
  const R_CONTRE_FINI = itemP({
    cle: "pi-r-contre",
    candidat_id: "demo-alpha",
    mesure: M_RESOLU,
    position: "contre",
    valide_au: "2026-12-01",
  });
  /** Trois items de beta sur M_TROIS : deux « pour », un « contre ». */
  const T_POUR_1 = itemP({ cle: "pi-t-pour-1", candidat_id: "demo-beta", mesure: M_TROIS, position: "pour" });
  const T_POUR_2 = itemP({ cle: "pi-t-pour-2", candidat_id: "demo-beta", mesure: M_TROIS, position: "pour" });
  const T_CONTRE = itemP({ cle: "pi-t-contre", candidat_id: "demo-beta", mesure: M_TROIS, position: "contre" });
  /** Un item P « pour » et un item O dont l'état en vigueur au gel est « contre ». */
  const PO_P = itemP({ cle: "pi-po-p", candidat_id: "demo-beta", mesure: M_PO, position: "pour" });
  const PO_O = itemO({
    cle: "pi-po-o",
    candidat_id: "demo-beta",
    mesure: M_PO,
    position: "pour",
    position_posterieure: "contre",
    date_changement: "2026-10-01",
  });
  /** Un item d'alpha sur une autre mesure, sans conflit : intact. */
  const SAUVE = itemP({ cle: "pi-sauve", candidat_id: "demo-alpha", mesure: M_SAUVE, position: "pour" });

  const ITEMS_PI = [A_POUR, A_CONTRE, B_POUR, R_POUR, R_CONTRE_FINI, T_POUR_1, T_POUR_2, T_CONTRE, PO_P, PO_O, SAUVE];
  const QUESTIONS_PI: readonly Question[] = engendrer(ITEMS_PI, MESURES_PI, perimetre(INCOMPAT_CANDIDATS)).map(
    completerSur(ITEMS_PI),
  );

  function tirerPi(valeur = 20261201, questions: readonly Question[] = QUESTIONS_PI, items: readonly Item[] = ITEMS_PI) {
    return tirer({
      questions,
      items,
      mesures: MESURES_PI,
      run: INCOMPAT_RUN,
      graine: graine(valeur),
      parametres: { questions_par_strate: 10, questions_attribution_par_theme: 10 },
    });
  }

  function questionsSur(item: Item, questions: readonly Question[] = QUESTIONS_PI): readonly Question[] {
    return questions.filter(
      (question) =>
        question.candidat_id !== undefined &&
        question.items.some((entree) => entree.role === "principal" && entree.reference.item_id === item.id),
    );
  }

  function attributionDe(mesure_id: string): Question {
    const ids = new Set(ITEMS_PI.filter((item) => item.mesure_id === mesure_id).map((item) => item.id));
    const trouvee = QUESTIONS_PI.find(
      (question) => question.gabarit === "Q-ATT" && question.items.some((entree) => ids.has(entree.reference.item_id)),
    );
    if (trouvee === undefined) throw new Error(`Aucune Q-ATT sur ${mesure_id}.`);
    return trouvee;
  }

  function idsTires(): readonly string[] {
    return tirerPi().tirage.entrees.map((entree) => entree.question_id);
  }

  function motifPi(question: Question): string | undefined {
    return tirerPi().tirage.exclusions.find((exclusion) => exclusion.question_id === question.id)?.motif;
  }

  it("le tirage aboutit au lieu de lever PositionsContradictoires", () => {
    expect(() => tirerPi()).not.toThrow();
  });

  it("deux items P incompatibles du même candidat : toutes leurs questions exclues, motif positions_incompatibles", () => {
    for (const item of [A_POUR, A_CONTRE]) {
      const questions = questionsSur(item);
      expect(questions.length).toBeGreaterThan(0);
      for (const question of questions) {
        expect(motifPi(question)).toBe("positions_incompatibles");
        expect(idsTires()).not.toContain(question.id);
      }
    }
  });

  it("la Q-ATT de la mesure est exclue même si un autre candidat y porte un item valide, dont les questions restent tirées", () => {
    const attribution = attributionDe(M_CONFLIT.id);
    const exclusion = tirerPi().tirage.exclusions.find((une) => une.question_id === attribution.id);
    expect(exclusion).toMatchObject({ gabarit: "Q-ATT", theme: "sante", motif: "positions_incompatibles" });
    expect(exclusion?.candidat_id).toBeUndefined();
    expect(exclusion?.detail).toContain(A_POUR.id);
    expect(exclusion?.detail).toContain(A_CONTRE.id);
    const questionsBeta = questionsSur(B_POUR);
    expect(questionsBeta.length).toBeGreaterThan(0);
    for (const question of questionsBeta) expect(idsTires()).toContain(question.id);
  });

  it("un seul des deux en vigueur (l'autre obsolète exactement à l'instant du gel) : pas d'exclusion pour incompatibilité", () => {
    for (const question of questionsSur(R_POUR)) expect(motifPi(question)).toBeUndefined();
    for (const question of questionsSur(R_CONTRE_FINI)) expect(motifPi(question)).toBe("hors_validite");
    const attribution = attributionDe(M_RESOLU.id);
    const entree = tirerPi().tirage.entrees.find((une) => une.question_id === attribution.id);
    expect(entree?.reponse_attendue).toMatchObject({ nature: "liste_candidats", candidats_attendus: ["demo-alpha"] });
  });

  it("trois items dont deux de même position : les trois sont exclus, aucun ne dit quelle position fait foi", () => {
    for (const item of [T_POUR_1, T_POUR_2, T_CONTRE]) {
      for (const question of questionsSur(item)) expect(motifPi(question)).toBe("positions_incompatibles");
    }
    expect(motifPi(attributionDe(M_TROIS.id))).toBe("positions_incompatibles");
  });

  it("un item P « pour » et un item O en vigueur à l'état « contre » sont incompatibles", () => {
    for (const item of [PO_P, PO_O]) {
      for (const question of questionsSur(item)) expect(motifPi(question)).toBe("positions_incompatibles");
    }
  });

  it("un item du même candidat sur une autre mesure reste tirable", () => {
    for (const question of questionsSur(SAUVE)) {
      expect(motifPi(question)).toBeUndefined();
      expect(idsTires()).toContain(question.id);
    }
  });

  it("les exclusions sont comptées dans le tirage, identiques quelle que soit la graine, et conformes au schéma", () => {
    const motifs = tirerPi(1).tirage.exclusions.filter((exclusion) => exclusion.motif === "positions_incompatibles");
    const parItem = [A_POUR, A_CONTRE, T_POUR_1, T_POUR_2, T_CONTRE, PO_P, PO_O].flatMap((item) => questionsSur(item));
    // Les questions propres des items en conflit, plus les trois Q-ATT de M_CONFLIT, M_TROIS et M_PO.
    expect(motifs).toHaveLength(parItem.length + 3);
    expect(tirerPi(20270101).tirage.exclusions).toEqual(tirerPi(1).tirage.exclusions);
    const publie = JSON.parse(JSON.stringify(tirerPi().tirage)) as unknown;
    expect(() => valider("tirage", publie, "tirage avec positions_incompatibles")).not.toThrow();
  });

  it("le rapport du tirage liste les items à contester, par candidat et par mesure", () => {
    const attendu = [
      { candidat_id: "demo-alpha", mesure_id: M_CONFLIT.id, item_ids: [A_POUR.id, A_CONTRE.id].sort() },
      { candidat_id: "demo-beta", mesure_id: M_TROIS.id, item_ids: [T_POUR_1.id, T_POUR_2.id, T_CONTRE.id].sort() },
      { candidat_id: "demo-beta", mesure_id: M_PO.id, item_ids: [PO_P.id, PO_O.id].sort() },
    ];
    const cle = (conflit: { candidat_id: string; mesure_id: string }) => `${conflit.candidat_id}|${conflit.mesure_id}`;
    const conflits = tirerPi().rapport.positions_incompatibles;
    const lu = conflits.map((conflit) => ({
      candidat_id: conflit.candidat_id,
      mesure_id: conflit.mesure_id,
      item_ids: conflit.items.map((entree) => entree.item_id),
    }));
    expect(lu).toEqual([...attendu].sort((a, b) => (cle(a) < cle(b) ? -1 : 1)));
    const po = conflits.find((conflit) => conflit.mesure_id === M_PO.id);
    expect(po?.items.find((entree) => entree.item_id === PO_O.id)?.position).toBe("contre");
    expect(po?.items.find((entree) => entree.item_id === PO_P.id)?.position).toBe("pour");
  });

  it("questionsTirables et le tirage appliquent la même règle", () => {
    const tirables = questionsTirables(QUESTIONS_PI, ITEMS_PI, MESURES_PI, INCOMPAT_RUN).map((question) => question.id);
    expect([...tirables].sort()).toEqual([...idsTires()].sort());
  });

  it("aucun conflit : rien à contester, exclusions inchangées (non-régression)", () => {
    const sansConflit = [B_POUR, R_POUR, R_CONTRE_FINI, SAUVE];
    const questions = engendrer(sansConflit, MESURES_PI, perimetre(INCOMPAT_CANDIDATS)).map(completerSur(sansConflit));
    const resultat = tirerPi(20261201, questions, sansConflit);
    expect(resultat.rapport.positions_incompatibles).toEqual([]);
    expect(resultat.tirage.exclusions.map((exclusion) => exclusion.motif)).toEqual(
      questionsSur(R_CONTRE_FINI, questions).map(() => "hors_validite"),
    );
  });
});
