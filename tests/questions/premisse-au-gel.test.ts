/**
 * Constat n° 37 de la conformité du 2026-09-24, tranché par la révision 0.11 du protocole (§5) :
 * « Sur un item O, la vérité de la prémisse dépend de la date : le relecteur note sur la
 * formulation la position que sa prémisse affirme, et, à l'instant de gel, la prémisse est fausse
 * si cette position diffère de la position en vigueur. »
 *
 * Avant la 0.11, `premisse_fausse` était figé sur la formulation : la même question reprise de part
 * et d'autre d'un changement de position gardait la même valeur, et le dénominateur de la
 * confirmation de prémisse (§8) comptait une formulation à tort. La valeur se résout désormais au
 * gel, dans le tirage, comme la réponse attendue.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import {
  PremisseHorsEnsemble,
  PremisseNonNotee,
  premisseFausseAuGel,
} from "../../pipeline/questions/reponse-attendue.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import { entreesPour } from "../../pipeline/questions/entrees-tirage.ts";
import type { CodeGabarit, Item, Mesure, Position, Question } from "../../pipeline/questions/types.ts";
import {
  candidat,
  completer,
  graine,
  itemA,
  itemF,
  itemO,
  itemP,
  mesure,
  perimetre,
  question as fabriquerQuestion,
  run,
} from "./fabriques.ts";

const MESURE = mesure({ cle: "premisse-reelle", libelle: "tarif réduit de premisse" });
const FICTIVE = mesure({ cle: "premisse-fictive", libelle: "prime aux marcheurs", fictive: true });
const PERIMETRE = perimetre(["demo-alpha"]);
const INTERROGES = [candidat({ candidat_id: "demo-alpha" })];

/** Item O : « pour » jusqu'au 2026-11-03 (exclu), « contre » ensuite (état posterieur). */
const O_POUR_PUIS_CONTRE = itemO({ cle: "premisse-o", candidat_id: "demo-alpha", mesure: MESURE, date_changement: "2026-11-03" });
const F = itemF({ cle: "premisse-f", candidat_id: "demo-alpha", mesure: FICTIVE });

const AVANT = "2026-11-02T12:00:00+01:00";
const APRES = "2026-12-01T06:00:00+01:00";

/** La question du gabarit sur l'item, sa formulation orientée affirmant `affirmee` (ou rien). */
function questionSur(item: Item, mesures: readonly Mesure[], gabarit: CodeGabarit, affirmee?: Position): Question {
  const engendree = engendrer([item], mesures, PERIMETRE).find((q) => q.gabarit === gabarit);
  if (engendree === undefined) throw new Error(`Aucune question ${gabarit} engendrée.`);
  const complete = completer(engendree);
  if (affirmee === undefined) return complete;
  return fabriquerQuestion({
    id: complete.id,
    gabarit: complete.gabarit,
    items: complete.items,
    grappe_id: complete.grappe_id,
    texte_neutre: engendree.texte_neutre,
    position_affirmee: affirmee,
    ...(complete.candidat_id === undefined ? {} : { candidat_id: complete.candidat_id }),
  });
}

const Q_ORI_ANCIENNE = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ORI", "pour");

describe("n° 37 : Q-ORI sur un item O dont la prémisse affirme l'ancienne position", () => {
  it("prémisse vraie avant le changement", () => {
    expect(premisseFausseAuGel(Q_ORI_ANCIENNE, [O_POUR_PUIS_CONTRE], AVANT)).toBe(false);
  });

  it("prémisse fausse après le changement", () => {
    expect(premisseFausseAuGel(Q_ORI_ANCIENNE, [O_POUR_PUIS_CONTRE], APRES)).toBe(true);
  });

  it("gel exactement à date_changement (minuit UTC) : changement acquis, prémisse fausse", () => {
    expect(premisseFausseAuGel(Q_ORI_ANCIENNE, [O_POUR_PUIS_CONTRE], "2026-11-03T00:00:00Z")).toBe(true);
  });

  it("une seconde avant minuit UTC, écrite dans un autre fuseau : prémisse encore vraie", () => {
    expect(premisseFausseAuGel(Q_ORI_ANCIENNE, [O_POUR_PUIS_CONTRE], "2026-11-03T00:59:59+01:00")).toBe(false);
  });

  it("une prémisse qui affirme la nouvelle position suit le chemin inverse", () => {
    const nouvelle = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ORI", "contre");
    expect(premisseFausseAuGel(nouvelle, [O_POUR_PUIS_CONTRE], AVANT)).toBe(true);
    expect(premisseFausseAuGel(nouvelle, [O_POUR_PUIS_CONTRE], APRES)).toBe(false);
  });

  it("vaut pour toute question orientée sur un item O, Q-FER comprise", () => {
    const fermee = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-FER", "pour");
    expect(premisseFausseAuGel(fermee, [O_POUR_PUIS_CONTRE], AVANT)).toBe(false);
    expect(premisseFausseAuGel(fermee, [O_POUR_PUIS_CONTRE], APRES)).toBe(true);
  });

  it("refuse, en nommant la question, une formulation orientée sur un item O sans position affirmée", () => {
    const muette = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ORI");
    expect(() => premisseFausseAuGel(muette, [O_POUR_PUIS_CONTRE], APRES)).toThrow(PremisseNonNotee);
    expect(() => premisseFausseAuGel(muette, [O_POUR_PUIS_CONTRE], APRES)).toThrow(muette.id);
  });
});

describe("n° 37 : item F, prémisse fausse par construction", () => {
  const Q_ORI_F = questionSur(F, [FICTIVE], "Q-ORI");

  it("toujours fausse, quelle que soit la date du gel", () => {
    for (const gel of [AVANT, "2026-11-03T00:00:00Z", APRES]) {
      expect(premisseFausseAuGel(Q_ORI_F, [F], gel)).toBe(true);
    }
  });

  it("toujours fausse, même si le relecteur a noté une position affirmée", () => {
    expect(premisseFausseAuGel(questionSur(F, [FICTIVE], "Q-ORI", "pour"), [F], APRES)).toBe(true);
  });
});

/**
 * Décision de l'auteur du 2026-10-17 sur D42 (3) : « sur une question d'attribution, elle n'affirme
 * aucune position » (§5) vaut aussi pour une mesure fictive. Sa formulation orientée ne porte pas de
 * prémisse et sort du dénominateur de la confirmation de prémisse (§8).
 */
describe("question d'attribution sur une mesure fictive : aucune prémisse", () => {
  const Q_ATT_F = questionSur(F, [FICTIVE], "Q-ATT");

  it("jamais fausse, quelle que soit la date du gel", () => {
    for (const gel of [AVANT, "2026-11-03T00:00:00Z", APRES]) {
      expect(premisseFausseAuGel(Q_ATT_F, [F], gel)).toBe(false);
    }
  });

  it("refuse, en nommant la question, une formulation orientée qui affirme une position", () => {
    const affirmante = questionSur(F, [FICTIVE], "Q-ATT", "pour");
    expect(() => premisseFausseAuGel(affirmante, [F], APRES)).toThrow(PremisseHorsEnsemble);
    expect(() => premisseFausseAuGel(affirmante, [F], APRES)).toThrow(/question d'attribution/);
  });
});

describe("n° 37 : hors des items F et O, la prémisse n'est jamais fausse", () => {
  const P_POUR = itemP({ cle: "premisse-p", candidat_id: "demo-alpha", mesure: MESURE, position: "pour" });
  const A = itemA({ cle: "premisse-a", candidat_id: "demo-alpha", mesure: MESURE });

  it("item P sans position affirmée : vraie par construction", () => {
    expect(premisseFausseAuGel(questionSur(P_POUR, [MESURE], "Q-FER"), [P_POUR], APRES)).toBe(false);
  });

  it("item P dont la prémisse affirme sa position : vraie", () => {
    expect(premisseFausseAuGel(questionSur(P_POUR, [MESURE], "Q-FER", "pour"), [P_POUR], APRES)).toBe(false);
  });

  it("item P dont la prémisse affirme une autre position : refus nommé (interdit à l'engendrement)", () => {
    const fausse = questionSur(P_POUR, [MESURE], "Q-FER", "contre");
    expect(() => premisseFausseAuGel(fausse, [P_POUR], APRES)).toThrow(PremisseHorsEnsemble);
    expect(() => premisseFausseAuGel(fausse, [P_POUR], APRES)).toThrow(fausse.id);
  });

  it("item A portant une position affirmée : refus nommé", () => {
    const fausse = questionSur(A, [MESURE], "Q-FER", "pour");
    expect(() => premisseFausseAuGel(fausse, [A], APRES)).toThrow(PremisseHorsEnsemble);
  });

  it("item A sans position affirmée : pas de prémisse fausse", () => {
    expect(premisseFausseAuGel(questionSur(A, [MESURE], "Q-FER"), [A], APRES)).toBe(false);
  });

  it("question d'attribution sans item principal : pas de prémisse fausse, refus si une position est affirmée", () => {
    const sans = questionSur(P_POUR, [MESURE], "Q-ATT");
    expect(premisseFausseAuGel(sans, [P_POUR], APRES)).toBe(false);
    const affirmee = questionSur(P_POUR, [MESURE], "Q-ATT", "pour");
    expect(() => premisseFausseAuGel(affirmee, [P_POUR], APRES)).toThrow(PremisseHorsEnsemble);
  });
});

describe("n° 37 : la valeur vit dans le tirage, résolue au gel", () => {
  it("même question reprise sur deux runs de part et d'autre du changement : deux valeurs au tirage", () => {
    const avant = entreesPour([Q_ORI_ANCIENNE], [O_POUR_PUIS_CONTRE], [MESURE], run(INTERROGES, AVANT));
    const apres = entreesPour([Q_ORI_ANCIENNE], [O_POUR_PUIS_CONTRE], [MESURE], run(INTERROGES, APRES));
    expect(avant[0]?.premisse_fausse).toBe(false);
    expect(apres[0]?.premisse_fausse).toBe(true);
    // La réponse attendue suit le même instant : « oui » avant, « non, avec correction » après.
    expect(avant[0]?.reponse_attendue.nature).toBe("oui");
    expect(apres[0]?.reponse_attendue.nature).toBe("non_avec_correction");
  });

  it("chaque entrée tirée porte la valeur résolue, fausse sur un item F", () => {
    const q = questionSur(F, [FICTIVE], "Q-ORI");
    const [entree] = entreesPour([q], [F], [FICTIVE], run(INTERROGES, APRES));
    expect(entree?.premisse_fausse).toBe(true);
  });

  it("refuse avant tout tirage une question sur un item O sans position affirmée, quelle que soit la graine", () => {
    // Deux items O sur deux mesures du même thème : la strate thème × Q-ORI en porte deux, le quota
    // en tire une. Selon la graine, la question muette serait tirée ou non ; le refus, lui, ne
    // dépend d'aucune graine (§5, protocole 0.9 : la tirabilité se décide avant la graine).
    const AUTRE = mesure({ cle: "premisse-reelle-2", libelle: "tarif réduit de premisse bis" });
    const O_BIS = itemO({ cle: "premisse-o-bis", candidat_id: "demo-alpha", mesure: AUTRE, date_changement: "2026-11-03" });
    const muette = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ORI");
    const notees = [
      ...engendrer([O_POUR_PUIS_CONTRE], [MESURE], PERIMETRE).filter((q) => q.gabarit !== "Q-ORI" && q.gabarit !== "Q-ATT"),
      ...engendrer([O_BIS], [AUTRE], PERIMETRE).filter((q) => q.gabarit !== "Q-ATT"),
    ].map((q) => (q.grappe_id === O_BIS.id ? questionSur(O_BIS, [AUTRE], q.gabarit, "pour") : questionSur(O_POUR_PUIS_CONTRE, [MESURE], q.gabarit, "pour")));
    for (const valeur of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(() =>
        tirer({
          questions: [...notees, muette],
          items: [O_POUR_PUIS_CONTRE, O_BIS],
          mesures: [MESURE, AUTRE],
          run: run(INTERROGES, APRES),
          graine: graine(valeur),
          parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
        }),
      ).toThrow(PremisseNonNotee);
    }
  });
});

/**
 * Constat n° 7 de la conformité du 2026-09-29 (§5, protocole 0.11 et 0.13) : « Une question sur le
 * changement de position suit la même règle : sa prémisse suppose une position actuelle, que le
 * relecteur note. » Un filtre de gabarit qui exempterait Q-ACT sortirait ces formulations du
 * dénominateur de la confirmation de prémisse (§8) : ces tests le feraient tomber.
 */
describe("n° 7 : Q-ACT sur un item O suit la règle de la prémisse", () => {
  const Q_ACT_ANCIENNE = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ACT", "pour");

  it("l'item O engendre bien une Q-ACT", () => {
    expect(Q_ACT_ANCIENNE.gabarit).toBe("Q-ACT");
  });

  it("prémisse affirmant l'ancienne position : vraie avant le changement, fausse après", () => {
    expect(premisseFausseAuGel(Q_ACT_ANCIENNE, [O_POUR_PUIS_CONTRE], AVANT)).toBe(false);
    expect(premisseFausseAuGel(Q_ACT_ANCIENNE, [O_POUR_PUIS_CONTRE], APRES)).toBe(true);
  });

  it("gel exactement à date_changement (minuit UTC) : changement acquis, prémisse fausse", () => {
    expect(premisseFausseAuGel(Q_ACT_ANCIENNE, [O_POUR_PUIS_CONTRE], "2026-11-03T00:00:00Z")).toBe(true);
  });

  it("prémisse affirmant la nouvelle position : fausse avant le changement, vraie après", () => {
    const nouvelle = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ACT", "contre");
    expect(premisseFausseAuGel(nouvelle, [O_POUR_PUIS_CONTRE], AVANT)).toBe(true);
    expect(premisseFausseAuGel(nouvelle, [O_POUR_PUIS_CONTRE], APRES)).toBe(false);
  });

  it("refuse, en nommant la question, une Q-ACT sans position affirmée", () => {
    const muette = questionSur(O_POUR_PUIS_CONTRE, [MESURE], "Q-ACT");
    expect(() => premisseFausseAuGel(muette, [O_POUR_PUIS_CONTRE], AVANT)).toThrow(PremisseNonNotee);
    expect(() => premisseFausseAuGel(muette, [O_POUR_PUIS_CONTRE], AVANT)).toThrow(muette.id);
  });

  it("la valeur résolue entre au tirage : la Q-ACT compte au dénominateur après le changement", () => {
    const avant = entreesPour([Q_ACT_ANCIENNE], [O_POUR_PUIS_CONTRE], [MESURE], run(INTERROGES, AVANT));
    const apres = entreesPour([Q_ACT_ANCIENNE], [O_POUR_PUIS_CONTRE], [MESURE], run(INTERROGES, APRES));
    expect(avant[0]?.premisse_fausse).toBe(false);
    expect(apres[0]?.premisse_fausse).toBe(true);
  });
});
