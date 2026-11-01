/**
 * D54 (4), protocole 0.20, §5 « Formulations » : « Un état sans objet n'en affirme aucune, comme une
 * question d'attribution. » Sur un item O dont l'état ANTÉRIEUR est « sans_objet », la formulation
 * orientée ne porte aucune position (la reformulation demande `AUCUNE`) : ce n'est pas une prémisse
 * non notée, et ni la barrière du gel ni le tirage ne doivent s'arrêter dessus. Une position affirmée
 * sur un tel item est, à l'inverse, hors de l'ensemble des prémisses : refus nommé.
 *
 * Les questions dont la réponse attendue n'est pas définie au gel (état « sans_objet » en vigueur sur
 * Q-FER ou Q-ORI ; Q-NEG n'est pas engendrée sur un item O, annexe B) sortent par la règle
 * d'exclusion comptée du §5 (« Tirage »), jamais par une exception.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { violations } from "../../pipeline/gel/barriere.ts";
import type { EntreesBarriere } from "../../pipeline/gel/barriere.ts";
import { premisseFausseSurItemFOuO } from "../../pipeline/questions/invariants.ts";
import {
  PremisseHorsEnsemble,
  PremisseNonNotee,
  premisseFausseAuGel,
} from "../../pipeline/questions/reponse-attendue.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import { AUCUNE, positionAffirmeeDemandee } from "../../pipeline/reformulation/position-affirmee.ts";
import type { CodeGabarit, Item, Mesure, Position, Question } from "../../pipeline/questions/types.ts";
import {
  candidat,
  completer,
  graine,
  itemO,
  itemP,
  mesure,
  perimetre,
  question as fabriquerQuestion,
  run,
} from "./fabriques.ts";

const MESURE = mesure({ cle: "sans-objet-reelle", libelle: "péage urbain des sans-objet" });
const PERIMETRE = perimetre(["demo-alpha"]);
const INTERROGES = [candidat({ candidat_id: "demo-alpha" })];

/** Item O : « sans_objet » jusqu'au 2026-11-03 (exclu), « pour » ensuite. */
const O_SANS_OBJET_PUIS_POUR = itemO({
  cle: "sans-objet-o",
  candidat_id: "demo-alpha",
  mesure: MESURE,
  position: "sans_objet",
  position_posterieure: "pour",
  date_changement: "2026-11-03",
});

const AVANT = "2026-11-02T12:00:00+01:00";
const PILE = "2026-11-03T00:00:00Z";
const APRES = "2026-12-01T06:00:00+01:00";

/** Les questions engendrées sur l'item, chaque formulation orientée affirmant `affirmee` (ou rien). */
function questionsSur(item: Item, mesures: readonly Mesure[], affirmee?: Position): readonly Question[] {
  return engendrer([item], mesures, PERIMETRE).map((engendree) => {
    const complete = completer(engendree);
    if (affirmee === undefined || complete.candidat_id === undefined) return complete;
    return fabriquerQuestion({
      id: complete.id,
      gabarit: complete.gabarit,
      items: complete.items,
      grappe_id: complete.grappe_id,
      texte_neutre: engendree.texte_neutre,
      position_affirmee: affirmee,
      candidat_id: complete.candidat_id,
    });
  });
}

function seule(questions: readonly Question[], gabarit: CodeGabarit): Question {
  const trouvee = questions.find((q) => q.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Aucune question ${gabarit} engendrée.`);
  return trouvee;
}

/** Le tirage complet, puis la barrière du gel sur ce tirage : les deux étapes du scénario du défaut. */
function tirerPuisBarriere(item: Item, questions: readonly Question[], date_gel: string) {
  const resultat = tirer({
    questions,
    items: [item],
    mesures: [MESURE],
    run: run(INTERROGES, date_gel),
    graine: graine(),
    parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
  });
  const entrees: EntreesBarriere = {
    repertoire_items: "inutilise",
    repertoire_mesures: "inutilise",
    tirage: resultat.tirage,
    questions,
    items: [item],
    mesures: [MESURE],
    run: { ...run(INTERROGES, date_gel), versions: {} },
  };
  return { tirage: resultat.tirage, violations: violations(entrees) };
}

const QUESTIONS_MUETTES = questionsSur(O_SANS_OBJET_PUIS_POUR, [MESURE]);

describe("D54 (4) : item O dont l'état antérieur est « sans_objet », formulation orientée sans position", () => {
  it("l'item engendre Q-FER, Q-ORI et Q-ACT (annexe B : ni Q-NEG ni Q-ATT sur un item O)", () => {
    expect(QUESTIONS_MUETTES.map((q) => q.gabarit).sort()).toEqual(["Q-ACT", "Q-FER", "Q-ORI"]);
  });

  it("la reformulation demande bien AUCUNE pour les gabarits qui nomment le candidat", () => {
    for (const gabarit of ["Q-FER", "Q-ORI", "Q-ACT"] as const) {
      expect(positionAffirmeeDemandee(gabarit, O_SANS_OBJET_PUIS_POUR)).toBe(AUCUNE);
    }
  });

  it("prémisse non fausse, avant, à et après date_changement, pour chaque question engendrée", () => {
    for (const question of QUESTIONS_MUETTES) {
      for (const gel of [AVANT, PILE, APRES]) {
        expect(premisseFausseAuGel(question, [O_SANS_OBJET_PUIS_POUR], gel)).toBe(false);
      }
    }
  });

  it("l'invariant de prémisse, indépendant de la date, ne signale aucune violation", () => {
    expect(premisseFausseSurItemFOuO(QUESTIONS_MUETTES, [O_SANS_OBJET_PUIS_POUR])).toEqual([]);
  });

  it("gel après date_changement (en vigueur : « pour ») : tirage et barrière passent, tout est tirable", () => {
    const { tirage, violations: liste } = tirerPuisBarriere(O_SANS_OBJET_PUIS_POUR, QUESTIONS_MUETTES, APRES);
    expect(liste).toEqual([]);
    expect(tirage.exclusions).toEqual([]);
    const tirees = new Map(tirage.entrees.map((entree) => [entree.gabarit, entree]));
    expect([...tirees.keys()].sort()).toEqual(QUESTIONS_MUETTES.map((q) => q.gabarit).sort());
    for (const entree of tirage.entrees) expect(entree.premisse_fausse).toBe(false);
    expect(tirees.get("Q-FER")?.reponse_attendue.nature).toBe("oui");
    expect(tirees.get("Q-ORI")?.reponse_attendue.nature).toBe("oui");
    expect(tirees.get("Q-ACT")?.reponse_attendue.nature).toBe("changement_de_position");
  });

  it("gel exactement à date_changement : changement acquis, même issue qu'après", () => {
    const { tirage, violations: liste } = tirerPuisBarriere(O_SANS_OBJET_PUIS_POUR, QUESTIONS_MUETTES, PILE);
    expect(liste).toEqual([]);
    expect(tirage.exclusions).toEqual([]);
    expect(tirage.entrees.find((entree) => entree.gabarit === "Q-ACT")?.reponse_attendue.nature).toBe("changement_de_position");
    for (const entree of tirage.entrees) expect(entree.premisse_fausse).toBe(false);
  });

  it("gel avant date_changement (en vigueur : « sans_objet ») : Q-FER et Q-ORI exclues et comptées à part, sans exception", () => {
    const { tirage, violations: liste } = tirerPuisBarriere(O_SANS_OBJET_PUIS_POUR, QUESTIONS_MUETTES, AVANT);
    expect(liste).toEqual([]);
    const exclues = new Map(tirage.exclusions.map((exclusion) => [exclusion.gabarit, exclusion.motif]));
    expect(exclues.get("Q-FER")).toBe("reponse_attendue_indecidable");
    expect(exclues.get("Q-ORI")).toBe("reponse_attendue_indecidable");
    expect([...exclues.keys()].sort()).toEqual(["Q-FER", "Q-ORI"]);
    // Q-ACT a une réponse attendue définie par les dates : elle reste tirable, prémisse non fausse.
    const act = tirage.entrees.find((entree) => entree.gabarit === "Q-ACT");
    expect(act?.reponse_attendue.nature).toBe("position_anterieure");
    expect(act?.premisse_fausse).toBe(false);
    expect(tirage.entrees.map((entree) => entree.gabarit)).toEqual(["Q-ACT"]);
  });

  it("une position affirmée sur cet item est refusée, en nommant la question, au gel comme à la barrière", () => {
    const affirmantes = questionsSur(O_SANS_OBJET_PUIS_POUR, [MESURE], "pour");
    const ori = seule(affirmantes, "Q-ORI");
    for (const gel of [AVANT, PILE, APRES]) {
      expect(() => premisseFausseAuGel(ori, [O_SANS_OBJET_PUIS_POUR], gel)).toThrow(PremisseHorsEnsemble);
      expect(() => premisseFausseAuGel(ori, [O_SANS_OBJET_PUIS_POUR], gel)).toThrow(ori.id);
    }
    expect(() => premisseFausseAuGel(ori, [O_SANS_OBJET_PUIS_POUR], APRES)).toThrow(/sans objet/);
    const signalees = premisseFausseSurItemFOuO(affirmantes, [O_SANS_OBJET_PUIS_POUR]).map((violation) => violation.objet);
    expect(signalees).toContain(ori.id);
    expect(signalees).toContain(seule(affirmantes, "Q-ACT").id);
  });
});

describe("non-régression : la règle du §5 exige toujours une position quand l'état antérieur en porte une", () => {
  const O_POUR_PUIS_SANS_OBJET = itemO({
    cle: "pour-puis-sans-objet",
    candidat_id: "demo-alpha",
    mesure: MESURE,
    position: "pour",
    position_posterieure: "sans_objet",
  });

  it("item O antérieur « pour », orientée sans position : PremisseNonNotee, même si l'état postérieur est sans objet", () => {
    const muette = seule(questionsSur(O_POUR_PUIS_SANS_OBJET, [MESURE]), "Q-ACT");
    for (const gel of [AVANT, APRES]) {
      expect(() => premisseFausseAuGel(muette, [O_POUR_PUIS_SANS_OBJET], gel)).toThrow(PremisseNonNotee);
    }
  });

  it("item P « sans_objet », orientée sans position : passe, prémisse non fausse", () => {
    const P = itemP({ cle: "p-sans-objet", candidat_id: "demo-alpha", mesure: MESURE, position: "sans_objet" });
    const questions = questionsSur(P, [MESURE]);
    for (const question of questions) expect(premisseFausseAuGel(question, [P], APRES)).toBe(false);
    expect(premisseFausseSurItemFOuO(questions, [P])).toEqual([]);
  });
});
