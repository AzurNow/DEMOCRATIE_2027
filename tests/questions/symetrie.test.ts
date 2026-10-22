/**
 * Garanties de symétrie du §5, « testées en intégration continue » : le pipeline refuse de
 * lancer un run si l'une des conditions échoue.
 *
 * Chaque cas limite casse un seul axe à la fois, à partir d'un tirage parfaitement symétrique.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { ArbitrageSansDecision } from "../../pipeline/questions/tirage.ts";
import { entreesPour } from "../../pipeline/questions/entrees-tirage.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import type {
  CodeCondition,
  CodeGabarit,
  EntreeTirage,
  Item,
  ItemAuGel,
  Question,
  Symetrie,
  Tirage,
} from "../../pipeline/questions/types.ts";
import {
  arbitre,
  candidat,
  completer,
  contestation,
  graine,
  itemA,
  itemF,
  itemP,
  mesure,
  perimetre,
  question,
  quotas,
  run,
} from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta"];
const PERIMETRE = perimetre(CANDIDATS);

const MESURE_P1 = mesure({ cle: "p1", theme: "fiscalite_pouvoir_achat", libelle: "tarif de base" });
const MESURE_P2 = mesure({ cle: "p2", theme: "retraites", libelle: "durée de cotisation" });
const MESURE_A = mesure({ cle: "abs", theme: "fiscalite_pouvoir_achat", libelle: "taxe sur les fibres" });
/*
 * Une mesure fictive par candidat : depuis le protocole 0.9 (§5, constat n° 39), la Q-ATT d'une
 * mesure est unique et son item F principal ; deux items F sur une même mesure fictive sont refusés
 * (`AttributionFictiveAmbigue`, question ouverte du rapport du 2026-09-25).
 */
const MESURES_F: Readonly<Record<string, ReturnType<typeof mesure>>> = Object.fromEntries(
  CANDIDATS.map((candidat_id) => [
    candidat_id,
    mesure({ cle: `fic-${candidat_id}`, theme: "fiscalite_pouvoir_achat", libelle: "prime aux marcheurs", fictive: true }),
  ]),
);
const MESURES = [MESURE_P1, MESURE_P2, MESURE_A, ...Object.values(MESURES_F)];

const ITEMS: readonly Item[] = CANDIDATS.flatMap((candidat_id) => [
  itemP({ cle: `${candidat_id}-p1`, candidat_id, mesure: MESURE_P1 }),
  itemP({ cle: `${candidat_id}-p2`, candidat_id, mesure: MESURE_P2 }),
  itemA({ cle: `${candidat_id}-a`, candidat_id, mesure: MESURE_A }),
  itemF({ cle: `${candidat_id}-f`, candidat_id, mesure: MESURES_F[candidat_id] as ReturnType<typeof mesure> }),
]);

const QUESTIONS: readonly Question[] = engendrer(ITEMS, MESURES, PERIMETRE).map(completer);
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

/**
 * La question du gabarit sur l'item. Depuis le protocole 0.9 (§5, constat n° 39), la Q-ATT est
 * celle de la mesure de l'item (grappe = mesure), partagée par tous les items de la mesure.
 */
function choisir(item: Item, gabarit: CodeGabarit): Question {
  const trouvee = QUESTIONS.find(
    (candidate) =>
      candidate.gabarit === gabarit &&
      (candidate.grappe_id === item.id || (candidate.candidat_id === undefined && candidate.grappe_id === item.mesure_id)),
  );
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour l'item ${item.id}.`);
  return trouvee;
}

function itemsDe(candidat_id: string): Readonly<Record<"p1" | "p2" | "a" | "f", Item>> {
  const siens = ITEMS.filter((item) => item.candidat_id === candidat_id);
  const positions = siens.filter((item) => item.type === "P");
  const unique = (type: Item["type"]): Item => {
    const trouve = siens.find((item) => item.type === type);
    if (trouve === undefined) throw new Error(`Item ${type} absent pour ${candidat_id}.`);
    return trouve;
  };
  return {
    p1: positions[0] as Item,
    p2: positions[1] as Item,
    a: unique("A"),
    f: unique("F"),
  };
}

/** Six questions par candidat : trois Q-DIR, deux Q-FER, une Q-ORI. */
function questionsSymetriques(candidat_id: string): readonly Question[] {
  const jeu = itemsDe(candidat_id);
  return [
    choisir(jeu.p1, "Q-DIR"),
    choisir(jeu.p1, "Q-FER"),
    choisir(jeu.p2, "Q-DIR"),
    choisir(jeu.p2, "Q-FER"),
    choisir(jeu.a, "Q-DIR"),
    choisir(jeu.f, "Q-ORI"),
  ];
}

function tirageDe(questions: readonly Question[], items: readonly Item[] = ITEMS): Tirage {
  return {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    // Conformité n° 59 : un tirage porte ses quotas. Modifié ouvertement (décision de l'auteur du
    // 2026-10-01, condition quota_par_strate_respecte) : ces tirages écrits à la main mettent jusqu'à
    // deux Q-DIR fiscalité par candidat (items P1 et A) ; leur quota le dit, au lieu de celui d'une
    // question par strate des fabriques, qu'ils n'ont jamais respecté.
    parametres: { ...quotas(), questions_par_strate: 2 },
    entrees: entreesPour(questions, items, MESURES, RUN),
    exclusions: [],
    contestes_au_gel: [],
    bilan_reprise: [],
    compensations: [],
  };
}

function conditionDe(symetrie: Symetrie, code: CodeCondition) {
  const trouvee = symetrie.conditions.find((condition) => condition.code === code);
  if (trouvee === undefined) throw new Error(`Condition ${code} absente du rapport de symétrie.`);
  return trouvee;
}

const SYMETRIQUES: readonly Question[] = [
  ...questionsSymetriques("demo-alpha"),
  ...questionsSymetriques("demo-beta"),
  choisir(itemsDe("demo-alpha").p1, "Q-ATT"),
];

function verifier(questions: readonly Question[], items: readonly Item[] = ITEMS): Symetrie {
  return verifierSymetrie(tirageDe(questions, items), QUESTIONS, items, MESURES, RUN);
}

describe("tirage parfaitement symétrique", () => {
  it("rend les sept conditions vertes et un statut global vert", () => {
    const symetrie = verifier(SYMETRIQUES);
    expect(symetrie.conditions).toHaveLength(7);
    for (const condition of symetrie.conditions) expect(condition.statut).toBe("vert");
    expect(symetrie.statut_global).toBe("vert");
  });

  it("compte la part des items A et F au-dessus du seuil du §5", () => {
    const condition = conditionDe(verifier(SYMETRIQUES), "part_items_a_f_minimale");
    expect(condition.seuil).toBe(0.2);
    expect(condition.mesure).toBeCloseTo(4 / 13, 10);
  });
});

describe("nombre de questions par candidat", () => {
  it("passe au rouge dès qu'un candidat porte une question de plus sur un gabarit", () => {
    const enPlus = [...SYMETRIQUES, choisir(itemsDe("demo-alpha").a, "Q-FER")];
    const symetrie = verifier(enPlus);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("rouge");
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").mesure).toBe(1);
  });

  it("rend le statut global rouge, le rouge l'emportant sur un écart toléré", () => {
    // Une question de plus se pose forcément sur un thème : l'écart de thèmes suit. Constat n° 23 :
    // il n'est toléré que si les items de beta ne permettaient pas d'égaler alpha. Avant la
    // correction, l'item A de beta restait tirable et l'écart passait pour toléré ; il est ici
    // contesté, donc non tirable, et l'écart reste toléré pour la bonne raison. La contestation
    // rend aussi rouge la condition sur les items contestés : le statut global n'en est que plus rouge.
    const betaA = itemsDe("demo-beta").a;
    const items = ITEMS.map((item) => (item.id === betaA.id ? { ...item, statut_contestation: "contestee" as const } : item));
    const enPlus = [...SYMETRIQUES, choisir(itemsDe("demo-alpha").a, "Q-FER")];
    const symetrie = verifier(enPlus, items);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("rouge");
    expect(conditionDe(symetrie, "repartition_themes").statut).toBe("ecart_tolere");
    expect(symetrie.statut_global).toBe("rouge");
  });

  it("ignore les questions d'attribution, qui ne sont attribuables à aucun candidat", () => {
    const attributions = [
      ...SYMETRIQUES,
      choisir(itemsDe("demo-alpha").p2, "Q-ATT"),
      choisir(itemsDe("demo-beta").p1, "Q-ATT"),
      choisir(itemsDe("demo-beta").p2, "Q-ATT"),
    ];
    const symetrie = verifier(attributions);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("vert");
  });
});

/**
 * §5 : « même répartition des gabarits et des formulations par candidat, à une question près ».
 * Le nombre total de questions par candidat reste égal : seule la répartition entre gabarits
 * bouge, sur les mêmes items, donc sur les mêmes thèmes.
 */
describe("répartition des gabarits et des formulations", () => {
  /** Les questions symétriques d'alpha, dont les Q-DIR des items désignés deviennent des Q-NEG. */
  function alphaAvecNegatives(cles: readonly ("p1" | "p2")[]): readonly Question[] {
    const jeu = itemsDe("demo-alpha");
    const remplacees = new Set(cles.map((cle) => choisir(jeu[cle], "Q-DIR").id));
    return [
      ...questionsSymetriques("demo-alpha").filter((q) => !remplacees.has(q.id)),
      ...cles.map((cle) => choisir(jeu[cle], "Q-NEG")),
      ...questionsSymetriques("demo-beta"),
      choisir(jeu.p1, "Q-ATT"),
    ];
  }

  it("reste verte à un écart d'une question sur un gabarit", () => {
    // alpha : 2 Q-DIR, 1 Q-NEG ; beta : 3 Q-DIR, 0 Q-NEG. Écart d'une question sur deux gabarits.
    const symetrie = verifier(alphaAvecNegatives(["p1"]));
    const condition = conditionDe(symetrie, "repartition_gabarits_formulations");
    expect(condition.statut).toBe("vert");
    expect(condition.mesure).toBe(1);
    expect(condition.seuil).toBe(1);
    expect(symetrie.statut_global).toBe("vert");
  });

  it("passe au rouge à un écart de deux questions sur un gabarit, à nombre total égal", () => {
    // alpha : 1 Q-DIR, 2 Q-NEG ; beta : 3 Q-DIR, 0 Q-NEG. Six questions chacun.
    const symetrie = verifier(alphaAvecNegatives(["p1", "p2"]));
    const condition = conditionDe(symetrie, "repartition_gabarits_formulations");
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("vert");
    expect(conditionDe(symetrie, "repartition_themes").statut).toBe("vert");
    expect(condition.statut).toBe("rouge");
    expect(condition.mesure).toBe(2);
    expect(symetrie.statut_global).toBe("rouge");
  });
});

describe("répartition par thème", () => {
  /*
   * Constat n° 23 : ce cas affirmait « ne passe jamais au rouge ». Or beta y porte un item P tirable
   * sur les retraites (p2), dont les questions auraient égalé alpha : c'est exactement le tirage
   * fautif que le §5 refuse (« quand les items le permettent »). L'assertion passe donc de
   * `ecart_tolere` à `rouge` ; l'écart reste imprimé, par candidat. Le cas toléré est couvert par
   * `repartition-themes.test.ts`.
   */
  it("passe au rouge quand les items du candidat en retard permettaient l'égalité, et imprime l'écart", () => {
    const jeuBeta = itemsDe("demo-beta");
    const deplacees = [
      ...questionsSymetriques("demo-alpha"),
      choisir(jeuBeta.p1, "Q-DIR"),
      choisir(jeuBeta.p1, "Q-FER"),
      choisir(jeuBeta.p1, "Q-NEG"),
      choisir(jeuBeta.a, "Q-DIR"),
      choisir(jeuBeta.a, "Q-FER"),
      choisir(jeuBeta.f, "Q-ORI"),
    ];
    const condition = conditionDe(verifier(deplacees), "repartition_themes");
    expect(condition.statut).toBe("rouge");
    expect(condition.mesure).toBe(2);
    expect(condition.detail_par_candidat?.map((detail) => detail.candidat_id).sort()).toEqual(
      [...CANDIDATS].sort(),
    );
    expect(condition.commentaire).toContain("demo-beta");
    expect(condition.commentaire).toContain("retraites");
    expect(verifier(deplacees).statut_global).toBe("rouge");
  });
});

describe("items contestés ou en attente", () => {
  it("passe au rouge à la première occurrence et nomme l'item", () => {
    const cible = itemsDe("demo-alpha").p1;
    const items = ITEMS.map((item) =>
      item.id === cible.id ? { ...item, statut_contestation: "contestee" as const } : item,
    );
    const condition = conditionDe(
      verifier(SYMETRIQUES, items),
      "aucun_item_conteste_ou_en_attente",
    );
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain(cible.id);
  });

  it("passe au rouge pour un item resté en attente de validation", () => {
    const cible = itemsDe("demo-beta").p2;
    const items = ITEMS.map((item) =>
      item.id === cible.id ? { ...item, statut_validation: "en_attente" } : item,
    );
    expect(
      conditionDe(verifier(SYMETRIQUES, items), "aucun_item_conteste_ou_en_attente").statut,
    ).toBe("rouge");
  });
});

/**
 * §5 : « aucun item contesté ou en attente dans le tirage ». Un item arbitré puis maintenu ou
 * corrigé n'est ni l'un ni l'autre (annexe E, point 6) : il est admis au gel si, sur l'item, la
 * dernière décision du panel le réintègre. Le tirage est construit directement par
 * `entreesPour`, donc sans le filtre de `tirer` : c'est le contrôle de symétrie seul qui juge.
 */
describe("items sortis de l'arbitrage du panel", () => {
  const DATE = "2026-10-05T10:00:00+02:00";
  const cible = itemsDe("demo-alpha").p1;

  function avecArbitrage(contestations: readonly unknown[]): readonly Item[] {
    return ITEMS.map((item) => (item.id === cible.id ? arbitre(item, contestations) : item));
  }

  function conditionArbitrage(items: readonly Item[]) {
    return conditionDe(verifier(SYMETRIQUES, items), "aucun_item_conteste_ou_en_attente");
  }

  it("(a) admet un item arbitré maintenu : condition et statut global verts", () => {
    const items = avecArbitrage([contestation("sa", "maintien", DATE)]);
    const symetrie = verifier(SYMETRIQUES, items);
    expect(tirageDe(SYMETRIQUES, items).entrees.some((entree) => entree.grappe_id === cible.id)).toBe(
      true,
    );
    expect(conditionDe(symetrie, "aucun_item_conteste_ou_en_attente").statut).toBe("vert");
    expect(symetrie.statut_global).toBe("vert");
  });

  it("(b) admet un item arbitré corrigé : condition et statut global verts", () => {
    const symetrie = verifier(SYMETRIQUES, avecArbitrage([contestation("sb", "correction", DATE)]));
    expect(conditionDe(symetrie, "aucun_item_conteste_ou_en_attente").statut).toBe("vert");
    expect(symetrie.statut_global).toBe("vert");
  });

  it("(c) passe au rouge pour un item arbitré avec retrait présent au tirage, et le nomme", () => {
    const condition = conditionArbitrage(avecArbitrage([contestation("sc", "retrait", DATE)]));
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain(cible.id);
    expect(condition.commentaire).toContain("retrait");
  });

  it("(d) passe au rouge pour un item arbitré non évaluable présent au tirage", () => {
    const condition = conditionArbitrage(
      avecArbitrage([contestation("sd", "non_evaluabilite", DATE)]),
    );
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain(cible.id);
  });

  it("(e) refuse de noter un item arbitré sans décision du panel par une erreur nommée", () => {
    expect(() => verifier(SYMETRIQUES, avecArbitrage([]))).toThrow(ArbitrageSansDecision);
  });

  it("(f) passe au rouge pour un item contesté, même porteur d'un maintien antérieur", () => {
    const items = ITEMS.map((item) =>
      item.id === cible.id
        ? {
            ...item,
            statut_contestation: "contestee" as const,
            contestations: [contestation("sf", "maintien", DATE)],
          }
        : item,
    );
    expect(conditionArbitrage(items).statut).toBe("rouge");
  });

  it("passe au rouge pour un item arbitré maintenu dont la validation n'est pas acquise", () => {
    const items = ITEMS.map((item) =>
      item.id === cible.id
        ? { ...arbitre(item, [contestation("sg", "maintien", DATE)]), statut_validation: "en_attente" }
        : item,
    );
    expect(conditionArbitrage(items).statut).toBe("rouge");
  });

  it("seule la dernière décision compte : maintien puis retrait passe au rouge", () => {
    const items = avecArbitrage([
      contestation("sh2", "retrait", "2026-10-20T10:00:00+02:00"),
      contestation("sh1", "maintien", DATE),
    ]);
    expect(conditionArbitrage(items).statut).toBe("rouge");
  });

});

/**
 * La décision du panel est figée dans `items_au_gel` : la symétrie d'un tirage publié se juge sur
 * ce qu'il porte, jamais sur l'état courant des items. `tirage.schema.json` : « une contestation
 * reçue pendant la fenêtre ne rend pas rétroactivement le tirage fautif ».
 */
describe("décision du panel figée au gel", () => {
  const DATE = "2026-10-05T10:00:00+02:00";
  const APRES_GEL = "2026-12-10T10:00:00+01:00";
  const cible = itemsDe("demo-alpha").p1;

  function avec(transformer: (item: Item) => Item): readonly Item[] {
    return ITEMS.map((item) => (item.id === cible.id ? transformer(item) : item));
  }

  const MAINTENU = avec((item) => arbitre(item, [contestation("g1", "maintien", DATE)]));
  const TIRAGE_MAINTENU = tirageDe(SYMETRIQUES, MAINTENU);

  function conditionSur(tirage: Tirage, items: readonly Item[]) {
    return conditionDe(
      verifierSymetrie(tirage, QUESTIONS, items, MESURES, RUN),
      "aucun_item_conteste_ou_en_attente",
    );
  }

  /** Le tirage, avec l'entrée de l'item cible réécrite : pour les tirages que `entreesPour` refuse de produire. */
  function tirageAvecCible(reecrire: (item: ItemAuGel) => ItemAuGel): Tirage {
    return {
      ...TIRAGE_MAINTENU,
      entrees: TIRAGE_MAINTENU.entrees.map((entree) => ({
        ...entree,
        items_au_gel: entree.items_au_gel.map((item) =>
          item.reference.item_id === cible.id ? reecrire(item) : item,
        ),
      })),
    };
  }

  it("reste vert quand l'item a été retiré par le panel après le gel", () => {
    const retire = avec((item) =>
      arbitre(item, [
        contestation("g1", "maintien", DATE),
        contestation("g2", "retrait", APRES_GEL),
      ]),
    );
    expect(conditionSur(TIRAGE_MAINTENU, retire).statut).toBe("vert");
  });

  it("reste vert quand l'item a reçu après le gel une contestation encore sans décision", () => {
    const reconteste = avec((item) => ({
      ...item,
      statut_contestation: "contestee" as const,
      contestations: [contestation("g1", "maintien", DATE)],
    }));
    expect(conditionSur(TIRAGE_MAINTENU, reconteste).statut).toBe("vert");
  });

  it("passe au rouge pour un item arbitré au gel sans décision figée, et le dit", () => {
    const tirage = tirageAvecCible(({ decision_panel_au_gel: _retiree, ...reste }) => reste);
    const condition = conditionSur(tirage, MAINTENU);
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain(cible.id);
    expect(condition.commentaire).toContain("sans décision du panel figée");
  });

  it("passe au rouge pour une décision figée datée après le gel", () => {
    const tirage = tirageAvecCible((item) => ({
      ...item,
      decision_panel_au_gel: { decision: "maintien", date: APRES_GEL },
    }));
    const condition = conditionSur(tirage, MAINTENU);
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain("postérieure au gel");
  });

  it("passe au rouge pour une décision figée sur un item non arbitré", () => {
    const tirage = tirageAvecCible((item) => ({ ...item, statut_contestation_au_gel: "aucune" }));
    const condition = conditionSur(tirage, MAINTENU);
    expect(condition.statut).toBe("rouge");
    expect(condition.commentaire).toContain("non arbitré");
  });

  it("passe au rouge pour une décision figée de retrait", () => {
    const tirage = tirageAvecCible((item) => ({
      ...item,
      decision_panel_au_gel: { decision: "retrait", date: DATE },
    }));
    expect(conditionSur(tirage, MAINTENU).statut).toBe("rouge");
  });
});

describe("noms de candidats dans les questions d'attribution", () => {
  it("passe au rouge quand un libellé de candidat figure dans le texte d'une Q-ATT", () => {
    const fuite = question({
      id: "q_" + "f".repeat(32),
      gabarit: "Q-ATT",
      items: choisir(itemsDe("demo-alpha").p1, "Q-ATT").items,
      grappe_id: MESURE_P1.id,
      texte_neutre: "Quels candidats, dont Candidat demo-alpha, proposent le tarif de base ?",
    });
    const tirage = tirageDe([...SYMETRIQUES, fuite]);
    const symetrie = verifierSymetrie(tirage, [...QUESTIONS, fuite], ITEMS, MESURES, RUN);
    expect(conditionDe(symetrie, "aucun_nom_candidat_dans_q_att").statut).toBe("rouge");
    // Une seule condition rouge suffit, toutes les autres étant vertes.
    const autres = symetrie.conditions.filter(
      (condition) => condition.code !== "aucun_nom_candidat_dans_q_att",
    );
    for (const condition of autres) expect(condition.statut).toBe("vert");
    expect(symetrie.statut_global).toBe("rouge");
  });

  /*
   * Depuis le protocole 0.6, le nom seul est cherché : un mot de la mesure ÉGAL au nom de famille
   * serait une fuite (`noms-candidats.test.ts`). Un morceau de mot, lui, n'en est pas une : le nom
   * « Alphand » n'est pas trouvé dans « prime alpha ».
   */
  it("reste vert quand le libellé de la mesure contient seulement un morceau d'un nom", () => {
    const mesureAmbigue = mesure({
      cle: "prime-alpha",
      theme: "fiscalite_pouvoir_achat",
      libelle: "prime alpha",
      formulation_canonique: "verser une prime alpha aux ménages",
    });
    const item = itemP({ cle: "ambigu", candidat_id: "demo-alpha", mesure: mesureAmbigue });
    const items = [...ITEMS, item];
    const nommes = run(
      [
        candidat({ candidat_id: "demo-alpha", libelle: "Camille Alphand", nom: "Alphand" }),
        candidat({ candidat_id: "demo-beta" }),
      ],
      GEL,
    );
    const engendrees = engendrer(items, [...MESURES, mesureAmbigue], nommes.perimetre.candidats).map(completer);
    const attribution = engendrees.find(
      (candidate) => candidate.grappe_id === mesureAmbigue.id && candidate.gabarit === "Q-ATT",
    ) as Question;
    const tirage: Tirage = {
      run_id: RUN.id,
      date_gel: GEL,
      graine_tirage: graine(),
      // Conformité n° 59 : un tirage porte ses quotas.
      parametres: quotas(),
      entrees: entreesPour([...SYMETRIQUES, attribution], items, [...MESURES, mesureAmbigue], nommes),
      exclusions: [],
      contestes_au_gel: [],
      bilan_reprise: [],
      compensations: [],
    };
    const symetrie = verifierSymetrie(tirage, [...QUESTIONS, ...engendrees], items, [...MESURES, mesureAmbigue], nommes);
    expect(conditionDe(symetrie, "aucun_nom_candidat_dans_q_att").statut).toBe("vert");
  });
});

describe("part minimale des items A et F", () => {
  function pool(nombreP: number, nombreAF: number): readonly Question[] {
    const directes = CANDIDATS.flatMap((candidat_id) => {
      const jeu = itemsDe(candidat_id);
      return [
        choisir(jeu.p1, "Q-DIR"),
        choisir(jeu.p1, "Q-FER"),
        choisir(jeu.p1, "Q-NEG"),
        choisir(jeu.p1, "Q-ATT"),
        choisir(jeu.p2, "Q-DIR"),
        choisir(jeu.p2, "Q-FER"),
        choisir(jeu.p2, "Q-NEG"),
        choisir(jeu.p2, "Q-ATT"),
      ];
    });
    const absencesEtFictifs = CANDIDATS.flatMap((candidat_id) => {
      const jeu = itemsDe(candidat_id);
      return [choisir(jeu.a, "Q-DIR"), choisir(jeu.a, "Q-FER"), choisir(jeu.f, "Q-ORI"), choisir(jeu.f, "Q-ATT")];
    });
    return [...directes.slice(0, nombreP), ...absencesEtFictifs.slice(0, nombreAF)];
  }

  it("reste verte à exactement 20 %", () => {
    const condition = conditionDe(verifier(pool(16, 4)), "part_items_a_f_minimale");
    expect(condition.mesure).toBe(0.2);
    expect(condition.statut).toBe("vert");
  });

  it("passe au rouge juste sous 20 %", () => {
    const condition = conditionDe(verifier(pool(13, 3)), "part_items_a_f_minimale");
    expect(condition.mesure).toBeLessThan(0.2);
    expect(condition.statut).toBe("rouge");
  });

  // Conformité n° 60 : sur un tirage vide, la part valait 0/0, lue comme atteinte ; les six
  // conditions étaient vertes et seul tirage.schema.json (entrees minItems 1) arrêtait le run.
  it("refuse un tirage vide : condition rouge, part non définie, statut global rouge", () => {
    const symetrie = verifier([]);
    const condition = conditionDe(symetrie, "part_items_a_f_minimale");
    expect(condition.statut).toBe("rouge");
    expect(condition).not.toHaveProperty("mesure");
    expect(condition.commentaire).toMatch(/tirage vide/);
    expect(symetrie.statut_global).toBe("rouge");
  });
});

describe("candidats traités à part", () => {
  it("exclut de la comparaison un candidat sous le seuil de couverture", () => {
    const perimetre = run(
      [
        candidat({ candidat_id: "demo-alpha" }),
        candidat({ candidat_id: "demo-beta", items_p_verifies: 8 }),
      ],
      GEL,
    );
    const desequilibre = [
      ...questionsSymetriques("demo-alpha"),
      choisir(itemsDe("demo-beta").p1, "Q-DIR"),
      choisir(itemsDe("demo-alpha").p1, "Q-ATT"),
    ];
    const symetrie = verifierSymetrie(tirageDe(desequilibre), QUESTIONS, ITEMS, MESURES, perimetre);
    expect(conditionDe(symetrie, "nombre_questions_par_candidat").statut).toBe("vert");
  });
});

describe("entrées du tirage sans question correspondante", () => {
  it("refuse de noter la symétrie d'un tirage dont une question est introuvable", () => {
    const orpheline: EntreeTirage = {
      ...(entreesPour([choisir(itemsDe("demo-alpha").p1, "Q-ATT")], ITEMS, MESURES, RUN)[0] as EntreeTirage),
      question_id: "q_" + "0".repeat(32),
    };
    const tirage: Tirage = {
      run_id: RUN.id,
      date_gel: GEL,
      graine_tirage: graine(),
      // Conformité n° 59 : un tirage porte ses quotas.
      parametres: quotas(),
      entrees: [orpheline],
      exclusions: [],
      contestes_au_gel: [],
      bilan_reprise: [],
      compensations: [],
    };
    expect(() => verifierSymetrie(tirage, QUESTIONS, ITEMS, MESURES, RUN)).toThrow(/introuvable/i);
  });
});
