/**
 * Protocole 0.13, §5 : la répartition par thème se juge « sur le jeu complet des questions
 * engendrées au gel, publié avec le run ; un jeu incomplet est refusé » (dette du 2026-09-27,
 * point 1).
 *
 * Avant la 0.13, `verifierSymetrie` cherchait les questions tirables du candidat en retard parmi
 * les questions qu'on lui passait : avec les seules questions tirées, aucun candidat n'avait de
 * réserve, et un tirage fautif (constat n° 23) passait `ecart_tolere` en silence.
 *
 * La référence de complétude est l'union de trois ensembles :
 * - les questions citées par `tirage.entrees[]` ;
 * - les questions citées par `tirage.exclusions[]` ;
 * - les questions que l'engendrement produit sur les items passés (les items au gel), qui
 *   concernent le run : question d'attribution, ou question qui nomme un candidat interrogé — la
 *   règle même par laquelle le tirage choisit les questions qu'il examine (`concerneLeRun`).
 *
 * Une question passée hors de cette référence est tolérée : elle ne peut qu'ajouter des questions
 * tirables, donc rendre la barrière plus sévère, jamais la verdir.
 */

import { describe, expect, it } from "vitest";
import { JeuDeQuestionsIncomplet, questionsExigees, TirageDUnAutreRun } from "../../pipeline/questions/completude.ts";
import { engendrer, identitesEngendrees } from "../../pipeline/questions/engendrement.ts";
import { conditionDeSymetrie, verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import { entreesPour } from "../../pipeline/questions/entrees-tirage.ts";
import type { CodeGabarit, Item, Mesure, Question, Theme, Tirage } from "../../pipeline/questions/types.ts";
import {
  candidat,
  completer,
  completerSur,
  graine,
  identifiant,
  itemA,
  itemF,
  itemO,
  itemP,
  mesure,
  perimetre,
  question,
  quotas,
  run,
} from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const FISC: Theme = "fiscalite_pouvoir_achat";
const RETR: Theme = "retraites";
const CANDIDATS = ["demo-alpha", "demo-beta"];
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

const MESURES: readonly Mesure[] = [
  mesure({ cle: "jc-fisc-0", theme: FISC }),
  mesure({ cle: "jc-fisc-1", theme: FISC }),
  mesure({ cle: "jc-retr-0", theme: RETR }),
  mesure({ cle: "jc-retr-1", theme: RETR }),
];
const [FISC_0, FISC_1, RETR_0, RETR_1] = MESURES as [Mesure, Mesure, Mesure, Mesure];

/** Le jeu du constat n° 23 : alpha, deux items fiscalité et un retraites ; beta, deux et deux. */
const ITEMS: readonly Item[] = [
  itemP({ cle: "jc-alpha-f0", candidat_id: "demo-alpha", mesure: FISC_0 }),
  itemP({ cle: "jc-alpha-f1", candidat_id: "demo-alpha", mesure: FISC_1 }),
  itemP({ cle: "jc-alpha-r0", candidat_id: "demo-alpha", mesure: RETR_0 }),
  itemP({ cle: "jc-beta-f0", candidat_id: "demo-beta", mesure: FISC_0 }),
  itemP({ cle: "jc-beta-f1", candidat_id: "demo-beta", mesure: FISC_1 }),
  itemP({ cle: "jc-beta-r0", candidat_id: "demo-beta", mesure: RETR_0 }),
  itemP({ cle: "jc-beta-r1", candidat_id: "demo-beta", mesure: RETR_1 }),
];

const QUESTIONS: readonly Question[] = engendrer(ITEMS, MESURES, perimetre(CANDIDATS)).map(completer);

function q(cle: string, gabarit: CodeGabarit): Question {
  const item_id = identifiant(`item:${cle}`);
  const trouvee = QUESTIONS.find((question) => question.grappe_id === item_id && question.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour ${cle}.`);
  return trouvee;
}

/** Tirage fautif du constat n° 23 : beta reçoit une Q-DIR fiscalité contre deux pour alpha. */
const TIREES: readonly Question[] = [
  q("jc-alpha-f0", "Q-DIR"),
  q("jc-alpha-f1", "Q-DIR"),
  q("jc-alpha-r0", "Q-DIR"),
  q("jc-beta-f0", "Q-DIR"),
  q("jc-beta-r0", "Q-DIR"),
  q("jc-beta-r1", "Q-DIR"),
];

function tirageDe(questions: readonly Question[], surcharge: Partial<Tirage> = {}): Tirage {
  return {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    parametres: quotas(),
    entrees: entreesPour(questions, ITEMS, MESURES, RUN),
    exclusions: [],
    contestes_au_gel: [],
    bilan_reprise: [],
    compensations: [],
    ...surcharge,
  };
}

function refus(appel: () => unknown): JeuDeQuestionsIncomplet {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof JeuDeQuestionsIncomplet) return erreur;
    throw erreur;
  }
  throw new Error("JeuDeQuestionsIncomplet attendu, aucune erreur levée.");
}

describe("protocole 0.13, §5 : un jeu de questions incomplet est refusé", () => {
  it("refuse, par une erreur nommée, le jeu réduit aux questions tirées (le cas de la dette)", () => {
    const erreur = refus(() => verifierSymetrie(tirageDe(TIREES), TIREES, ITEMS, MESURES, RUN));
    expect(erreur.name).toBe("JeuDeQuestionsIncomplet");
    // Toutes les questions engendrées et non tirées sont nommées, et elles seules.
    const attendues = QUESTIONS.map((question) => question.id)
      .filter((id) => !TIREES.some((tiree) => tiree.id === id))
      .sort();
    expect(erreur.manquantes).toEqual(attendues);
    expect(erreur.message).toContain(q("jc-beta-f1", "Q-DIR").id);
    expect(erreur.message).toMatch(/jeu complet/);
  });

  it("refuse un jeu auquel manque une seule question engendrée", () => {
    const retiree = q("jc-beta-f1", "Q-FER");
    const jeu = QUESTIONS.filter((question) => question.id !== retiree.id);
    expect(refus(() => verifierSymetrie(tirageDe(TIREES), jeu, ITEMS, MESURES, RUN)).manquantes).toEqual([retiree.id]);
  });

  it("refuse un jeu auquel manque la question d'attribution d'une mesure", () => {
    const attribution = QUESTIONS.find((question) => question.gabarit === "Q-ATT" && question.grappe_id === RETR_1.id);
    expect(attribution).toBeDefined();
    const jeu = QUESTIONS.filter((question) => question !== attribution);
    expect(refus(() => verifierSymetrie(tirageDe(TIREES), jeu, ITEMS, MESURES, RUN)).manquantes).toEqual([
      attribution?.id,
    ]);
  });

  it("refuse un jeu auquel manque une question citée par tirage.exclusions", () => {
    const exclue = q("jc-beta-f1", "Q-NEG");
    const jeu = QUESTIONS.filter((question) => question.id !== exclue.id);
    const tirage = tirageDe(TIREES, {
      exclusions: [
        { question_id: exclue.id, candidat_id: "demo-beta", theme: FISC, gabarit: "Q-NEG", motif: "hors_validite", detail: "test" },
      ],
    });
    // Sans les items de beta, l'engendrement ne réclame plus cette question : seule l'exclusion la cite.
    const sansBeta = ITEMS.filter((item) => item.candidat_id !== "demo-beta");
    const erreur = refus(() => verifierSymetrie({ ...tirage, entrees: tirageDe(TIREES.slice(0, 3)).entrees }, jeu, sansBeta, MESURES, RUN));
    expect(erreur.manquantes).toContain(exclue.id);
  });

  it("questionsExigees contient les questions tirées, même sans aucun item pour les engendrer", () => {
    // Dans verifierSymetrie, une entrée absente du jeu est déjà refusée plus tôt (« introuvable ») ;
    // la référence la porte quand même, pour qui l'appelle seule.
    expect(questionsExigees(tirageDe(TIREES), [], RUN)).toEqual(TIREES.map((question) => question.id).sort());
  });

  it("ne réclame pas les questions d'un candidat non interrogé, que le tirage n'examine pas", () => {
    const nonInterroge = run(
      [candidat({ candidat_id: "demo-alpha" }), candidat({ candidat_id: "demo-beta", interroge: false })],
      GEL,
    );
    const alpha = TIREES.filter((question) => question.candidat_id === "demo-alpha");
    const jeu = QUESTIONS.filter((question) => question.candidat_id !== "demo-beta");
    const tirage = { ...tirageDe(alpha), entrees: entreesPour(alpha, ITEMS, MESURES, nonInterroge) };
    expect(() => verifierSymetrie(tirage, jeu, ITEMS, MESURES, nonInterroge)).not.toThrow();
  });
});

describe("protocole 0.13, §5 : sur le jeu complet, le verdict ne change pas", () => {
  it("le tirage fautif du constat n° 23 reste rouge", () => {
    const condition = conditionDeSymetrie(
      verifierSymetrie(tirageDe(TIREES), QUESTIONS, ITEMS, MESURES, RUN),
      "repartition_themes",
    );
    expect(condition?.statut).toBe("rouge");
    expect(condition?.commentaire).toContain("demo-beta");
  });

  it("une répartition identique reste verte", () => {
    const egal = [q("jc-alpha-f0", "Q-DIR"), q("jc-alpha-r0", "Q-DIR"), q("jc-beta-f0", "Q-DIR"), q("jc-beta-r0", "Q-DIR")];
    // Le jeu réduit à ces quatre questions, lui, est refusé : le vert ne se juge que sur le jeu complet.
    expect(() => verifierSymetrie(tirageDe(egal), egal, ITEMS, MESURES, RUN)).toThrow(JeuDeQuestionsIncomplet);
    const condition = conditionDeSymetrie(verifierSymetrie(tirageDe(egal), QUESTIONS, ITEMS, MESURES, RUN), "repartition_themes");
    expect(condition?.statut).toBe("vert");
  });

  it("un tirage réel, sur le jeu complet, passe la barrière sans refus", () => {
    const { tirage } = tirer({ questions: QUESTIONS, items: ITEMS, mesures: MESURES, run: RUN, graine: graine(), parametres: quotas() });
    expect(() => verifierSymetrie(tirage, QUESTIONS, ITEMS, MESURES, RUN)).not.toThrow();
  });
});

describe("protocole 0.13, §5 : une question hors du tirage et de l'engendrement est tolérée", () => {
  const EGAL = [q("jc-alpha-f0", "Q-DIR"), q("jc-alpha-r0", "Q-DIR"), q("jc-beta-f0", "Q-DIR"), q("jc-beta-r0", "Q-DIR")];

  it("sur un tirage sans écart, elle ne change aucune condition", () => {
    const etrangere = question({
      id: "q_etrangere_hors_engendrement_0000",
      gabarit: "Q-DIR",
      candidat_id: "demo-beta",
      items: [
        {
          reference: { item_id: identifiant("item:inconnu"), item_version: 1, item_empreinte: "0".repeat(64) },
          role: "principal",
        },
      ],
      grappe_id: identifiant("item:inconnu"),
      texte_neutre: "Question étrangère au jeu engendré.",
    });
    const avant = verifierSymetrie(tirageDe(EGAL), QUESTIONS, ITEMS, MESURES, RUN);
    expect(verifierSymetrie(tirageDe(EGAL), [...QUESTIONS, etrangere], ITEMS, MESURES, RUN)).toEqual(avant);
  });

  it("une question tirable en surplus ne peut que rendre la barrière plus sévère, jamais la verdir", () => {
    // Sans l'item jc-beta-f1, le retard de beta en fiscalité est imposé par ses items : toléré.
    const sansBetaF1 = ITEMS.filter((item) => item.id !== identifiant("item:jc-beta-f1"));
    const jeu = engendrer(sansBetaF1, MESURES, perimetre(CANDIDATS)).map(completer);
    const tirage = { ...tirageDe(TIREES), entrees: entreesPour(TIREES, sansBetaF1, MESURES, RUN) };
    const avant = conditionDeSymetrie(verifierSymetrie(tirage, jeu, sansBetaF1, MESURES, RUN), "repartition_themes");
    expect(avant?.statut).toBe("ecart_tolere");
    // Un doublon de la Q-DIR fiscalité de beta, sous un autre identifiant : hors référence, mais tirable.
    const doublon = { ...q("jc-beta-f0", "Q-DIR"), id: "q_doublon_hors_engendrement_00000" };
    const apres = conditionDeSymetrie(verifierSymetrie(tirage, [...jeu, doublon], sansBetaF1, MESURES, RUN), "repartition_themes");
    expect(apres?.statut).toBe("rouge");
  });
});

describe("identitesEngendrees : la même règle que engendrer, sans le texte", () => {
  it("rend exactement les identifiants de engendrer, sur un jeu mêlant P, A, O et F", () => {
    const fictive = mesure({ cle: "jc-fic", theme: FISC, fictive: true });
    const absente = mesure({ cle: "jc-abs", theme: RETR });
    const varies = [
      ...ITEMS,
      itemA({ cle: "jc-alpha-a", candidat_id: "demo-alpha", mesure: absente }),
      itemF({ cle: "jc-beta-f", candidat_id: "demo-beta", mesure: fictive }),
      itemO({ cle: "jc-alpha-o", candidat_id: "demo-alpha", mesure: RETR_1, position: "pour", position_posterieure: "contre", date_changement: "2026-10-01" }),
      itemP({ cle: "jc-beta-cond", candidat_id: "demo-beta", mesure: absente, position: "conditionnel" }),
      itemP({ cle: "jc-beta-cont", candidat_id: "demo-beta", mesure: FISC_0, statut_contestation: "contestee" }),
      itemP({ cle: "jc-beta-att", candidat_id: "demo-beta", mesure: FISC_1, statut_validation: "en_attente" }),
    ];
    const referentiel = [...MESURES, fictive, absente];
    const parEngendrer = engendrer(varies, referentiel, perimetre(CANDIDATS))
      .map(completerSur(varies))
      .map((engendree) => ({ id: engendree.id, ...(engendree.candidat_id === undefined ? {} : { candidat_id: engendree.candidat_id }) }));
    const cle = (entree: { readonly id: string }) => entree.id;
    expect([...identitesEngendrees(varies)].sort((a, b) => cle(a).localeCompare(cle(b)))).toEqual(
      [...parEngendrer].sort((a, b) => cle(a).localeCompare(cle(b))),
    );
  });
});

/**
 * Conformité du 2026-09-29, n° 9 : la barrière juge les décisions du panel à la date du tirage, la
 * tirabilité et la complétude à celle du run. Un tirage d'un autre run, ou recopié avec une autre date
 * de gel, est refusé avant tout verdict.
 */
describe("n° 9 : le tirage doit être celui du run", () => {
  it("refuse un tirage dont la date de gel diffère de celle du run", () => {
    // Le même instant écrit autrement est déjà une autre date : le tirage recopie celle du run.
    const tirage = tirageDe(TIREES, { date_gel: "2026-12-01T05:00:00Z" });
    expect(() => verifierSymetrie(tirage, QUESTIONS, ITEMS, MESURES, RUN)).toThrow(TirageDUnAutreRun);
    expect(() => verifierSymetrie(tirage, QUESTIONS, ITEMS, MESURES, RUN)).toThrow(
      `date_gel 2026-12-01T05:00:00Z contre ${GEL}`,
    );
  });

  it("refuse un tirage d'un autre run, en nommant les deux identifiants", () => {
    const autre = identifiant("run:autre");
    const tirage = tirageDe(TIREES, { run_id: autre });
    expect(() => verifierSymetrie(tirage, QUESTIONS, ITEMS, MESURES, RUN)).toThrow(`run_id ${autre} contre ${RUN.id}`);
  });

  it("refuse avant de juger la complétude : un jeu incomplet d'un autre run est refusé comme tirage étranger", () => {
    const tirage = tirageDe(TIREES, { run_id: identifiant("run:autre") });
    expect(() => verifierSymetrie(tirage, TIREES, ITEMS, MESURES, RUN)).toThrow(TirageDUnAutreRun);
  });
});
