/**
 * Règles de décision des hypothèses préenregistrées H1, H2 et H4 (§2, protocole 0.24, D59 (2) à (4) ;
 * protocole 0.25, D60 : outils « sans objet » de H1 et de H2, H2 lue sur la différence publiée).
 */

import { describe, expect, it } from "vitest";
import type { DifferenceTaux } from "../../analysis/bootstrap.ts";
import { comparerConditions, pairesParMode, type ComparaisonCondition } from "../../analysis/conditions.ts";
import {
  decisionH1,
  decisionH2,
  decisionH4,
  FabricationsIncoherentes,
  ComparaisonsDeModesIncoherentes,
  OutilsAbsents,
  SEUIL_H4,
  SigneDifferenceIncoherent,
  type FabricationDuCouple,
} from "../../analysis/hypotheses.ts";
import { exactitude } from "../../analysis/metriques.ts";
import type { FamilleAsymetrie } from "../../analysis/permutation.ts";
import { taux, type Intervalle95, type Mode } from "../../analysis/types.ts";
import { tousCompares, ulid, unite } from "./fabriques.ts";

function intervalle(bas: number, haut: number, partiel: Partial<Intervalle95> = {}): Intervalle95 {
  return {
    bas,
    haut,
    nombre_grappes: 12,
    reechantillonnages: 2000,
    reechantillonnages_indefinis: 0,
    degenere: null,
    ...partiel,
  };
}

/* ------------------------------------------------------------------ H1 */

function fabrication(
  outil_id: string,
  mode: Mode,
  borne: Intervalle95 | null,
  effectifs: readonly [number, number] = [3, 20],
): FabricationDuCouple {
  return { couple: { outil_id, mode }, fabrication: taux(effectifs[0], effectifs[1]), intervalle: borne };
}

describe("H1 : borne inférieure strictement positive sur un couple comparé", () => {
  it("est vraie pour un outil dont un seul des deux couples a une borne inférieure > 0", () => {
    const decision = decisionH1(
      ["outil-alpha"],
      {
        compares: [
          { outil_id: "outil-alpha", mode: "web_activee" },
          { outil_id: "outil-alpha", mode: "web_desactivee" },
        ],
        incomplets: [],
      },
      [
        fabrication("outil-alpha", "web_activee", intervalle(0, 0.2)),
        fabrication("outil-alpha", "web_desactivee", intervalle(0.01, 0.3)),
      ],
    );
    expect(decision.outils[0]?.verdict).toBe("vraie");
    expect(decision.verdict).toBe("confirmee");
  });

  it("est fausse quand la borne inférieure touche exactement 0", () => {
    const decision = decisionH1(
      ["outil-alpha"],
      { compares: [{ outil_id: "outil-alpha", mode: "web_activee" }], incomplets: [] },
      [fabrication("outil-alpha", "web_activee", intervalle(0, 0.2))],
    );
    expect(decision.outils[0]?.verdict).toBe("fausse");
    expect(decision.outils[0]?.couples[0]).toEqual({
      cle: "outil-alpha/web_activee",
      etat: "compare",
      borne_inferieure: 0,
      borne_strictement_positive: false,
    });
    expect(decision.verdict).toBe("non_confirmee");
  });

  it("publie « sans objet » un outil sans aucun couple comparé (tous incomplets)", () => {
    const decision = decisionH1(
      ["outil-alpha"],
      {
        compares: [],
        incomplets: [
          { outil_id: "outil-alpha", mode: "web_activee" },
          { outil_id: "outil-alpha", mode: "web_desactivee" },
        ],
      },
      [],
    );
    expect(decision.outils[0]?.verdict).toBe("sans_objet");
    expect(decision.outils[0]?.couples.map((c) => c.etat)).toEqual(["incomplet", "incomplet"]);
  });

  it("ne lit pas la borne d'un couple incomplet, même si un intervalle lui est fourni", () => {
    expect(() =>
      decisionH1(
        ["outil-alpha"],
        { compares: [], incomplets: [{ outil_id: "outil-alpha", mode: "web_activee" }] },
        [fabrication("outil-alpha", "web_activee", intervalle(0.1, 0.3))],
      ),
    ).toThrow(FabricationsIncoherentes);
  });

  it("tient pour sans objet un couple sans réponse aux items A et F (dénominateur nul)", () => {
    const decision = decisionH1(
      ["outil-alpha"],
      { compares: [{ outil_id: "outil-alpha", mode: "web_activee" }], incomplets: [] },
      [fabrication("outil-alpha", "web_activee", null, [0, 0])],
    );
    expect(decision.outils[0]?.verdict).toBe("sans_objet");
    expect(decision.outils[0]?.couples[0]?.etat).toBe("sans_objet");
  });

  it("publie « sans objet » un outil déclaré qui n'a aucun couple dans le partage", () => {
    const decision = decisionH1(
      ["outil-alpha", "outil-beta"],
      { compares: [{ outil_id: "outil-alpha", mode: "web_activee" }], incomplets: [] },
      [fabrication("outil-alpha", "web_activee", intervalle(0.05, 0.2))],
    );
    expect(decision.outils.map((o) => o.verdict)).toEqual(["vraie", "sans_objet"]);
  });

  it("est confirmée avec un outil sans objet et un outil vrai : l'outil sans objet n'entre pas dans le verdict", () => {
    const decision = decisionH1(
      ["outil-alpha", "outil-beta"],
      {
        compares: [{ outil_id: "outil-alpha", mode: "web_activee" }],
        incomplets: [{ outil_id: "outil-beta", mode: "web_activee" }],
      },
      [fabrication("outil-alpha", "web_activee", intervalle(0.05, 0.2))],
    );
    expect(decision.outils.map((o) => o.verdict)).toEqual(["vraie", "sans_objet"]);
    expect(decision.verdict).toBe("confirmee");
  });

  it("n'est pas confirmée quand un outil est faux, même à côté d'un outil sans objet", () => {
    const decision = decisionH1(
      ["outil-alpha", "outil-beta", "outil-gamma"],
      {
        compares: [
          { outil_id: "outil-alpha", mode: "web_activee" },
          { outil_id: "outil-beta", mode: "web_activee" },
        ],
        incomplets: [],
      },
      [
        fabrication("outil-alpha", "web_activee", intervalle(0.05, 0.2)),
        fabrication("outil-beta", "web_activee", intervalle(0, 0.2)),
      ],
    );
    expect(decision.outils.map((o) => o.verdict)).toEqual(["vraie", "fausse", "sans_objet"]);
    expect(decision.verdict).toBe("non_confirmee");
  });

  it("est publiée « sans objet » quand aucun outil n'a de couple comparé", () => {
    const decision = decisionH1(
      ["outil-alpha", "outil-beta"],
      {
        compares: [{ outil_id: "outil-alpha", mode: "web_activee" }],
        incomplets: [{ outil_id: "outil-beta", mode: "web_desactivee" }],
      },
      // Le seul couple comparé n'a aucune réponse aux items A et F : sans objet.
      [fabrication("outil-alpha", "web_activee", null, [0, 0])],
    );
    expect(decision.outils.map((o) => o.verdict)).toEqual(["sans_objet", "sans_objet"]);
    expect(decision.verdict).toBe("sans_objet");
  });

  it("n'est confirmée que si elle est vraie pour tous les outils", () => {
    const decision = decisionH1(
      ["outil-alpha", "outil-beta"],
      {
        compares: [
          { outil_id: "outil-alpha", mode: "web_activee" },
          { outil_id: "outil-beta", mode: "web_activee" },
        ],
        incomplets: [],
      },
      [
        fabrication("outil-alpha", "web_activee", intervalle(0.05, 0.2)),
        fabrication("outil-beta", "web_activee", intervalle(-0.01, 0.2)),
      ],
    );
    expect(decision.outils.map((o) => o.verdict)).toEqual(["vraie", "fausse"]);
    expect(decision.verdict).toBe("non_confirmee");
  });

  it("garde visible un couple comparé sans intervalle : borne absente, non comptée", () => {
    const decision = decisionH1(
      ["outil-alpha"],
      { compares: [{ outil_id: "outil-alpha", mode: "web_activee" }], incomplets: [] },
      [fabrication("outil-alpha", "web_activee", null)],
    );
    expect(decision.outils[0]?.couples[0]).toEqual({
      cle: "outil-alpha/web_activee",
      etat: "compare",
      borne_inferieure: null,
      borne_strictement_positive: false,
    });
    expect(decision.outils[0]?.verdict).toBe("fausse");
  });

  it("refuse un couple comparé sans fabrication fournie", () => {
    expect(() =>
      decisionH1(["outil-alpha"], { compares: [{ outil_id: "outil-alpha", mode: "web_activee" }], incomplets: [] }, []),
    ).toThrow(FabricationsIncoherentes);
  });

  it("refuse une fabrication fournie deux fois", () => {
    const f = fabrication("outil-alpha", "web_activee", intervalle(0.1, 0.2));
    expect(() =>
      decisionH1(["outil-alpha"], { compares: [{ outil_id: "outil-alpha", mode: "web_activee" }], incomplets: [] }, [f, f]),
    ).toThrow(FabricationsIncoherentes);
  });

  it("refuse un couple du partage dont l'outil n'est pas déclaré", () => {
    expect(() =>
      decisionH1(
        ["outil-alpha"],
        { compares: [{ outil_id: "outil-gamma", mode: "web_activee" }], incomplets: [] },
        [fabrication("outil-gamma", "web_activee", intervalle(0.1, 0.2))],
      ),
    ).toThrow(FabricationsIncoherentes);
  });

  it("refuse une liste d'outils vide : une hypothèse sur aucun outil n'est pas décidée", () => {
    expect(() => decisionH1([], { compares: [], incomplets: [] }, [])).toThrow(OutilsAbsents);
  });
});

/* ------------------------------------------------------------------ H2 */

const CLE_MODES = "web_activee-web_desactivee";

/**
 * Une comparaison de modes telle que `pairesParMode` + `comparerConditions` la rendent : bras a =
 * web activée, bras b = web désactivée, différence a − b. Les valeurs sont données dans ce sens.
 */
function comparaisonModes(
  outil_id: string,
  activeeMoinsDesactivee: number | null,
  borne: Intervalle95 | null,
  qualificatif: DifferenceTaux["qualificatif"],
): ComparaisonCondition {
  return {
    cle: `${outil_id}:${CLE_MODES}`,
    difference: {
      cle: ["bootstrap", "exactitude", "global", `${outil_id}:${CLE_MODES}`],
      graine: "0x0000000000000000",
      taux_a: taux(8, 10),
      taux_b: taux(5, 10),
      difference: activeeMoinsDesactivee,
      intervalle: borne,
      qualificatif,
    },
    grappes_appariees: 10,
    grappes_exclues: [],
  };
}

const VIDE = { comparaisons: [], paires_exclues: [] };

describe("H2 : différence publiée web activée − web désactivée, strate global, établie et positive", () => {
  it("est confirmée quand l'exactitude baisse sans web et que l'intervalle exclut 0", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      { comparaisons: [comparaisonModes("outil-alpha", 0.3, intervalle(0.1, 0.5), "etablie")], paires_exclues: [] },
      VIDE,
    );
    expect(decision?.verdict).toBe("confirmee");
    // Lue telle que publiée (§8, 0.25) : activée − désactivée, intervalle non retourné.
    expect(decision?.global).toMatchObject({ statut: "comparee", difference: 0.3 });
    if (decision?.global.statut !== "comparee") throw new Error("comparaison attendue");
    expect(decision.global.intervalle).toMatchObject({ bas: 0.1, haut: 0.5 });
    expect(decision.global.cle).toEqual(["bootstrap", "exactitude", "global", `outil-alpha:${CLE_MODES}`]);
  });

  it("n'est pas confirmée quand la différence publiée est établie mais négative", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      { comparaisons: [comparaisonModes("outil-alpha", -0.3, intervalle(-0.5, -0.1), "etablie")], paires_exclues: [] },
      VIDE,
    );
    expect(decision?.verdict).toBe("non_confirmee");
    expect(decision?.global).toMatchObject({ statut: "comparee", difference: -0.3, qualificatif: "etablie" });
  });

  it("n'est pas confirmée quand l'intervalle touche 0 (non établie)", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      { comparaisons: [comparaisonModes("outil-alpha", 0.2, intervalle(0, 0.4), "non_etablie")], paires_exclues: [] },
      VIDE,
    );
    expect(decision?.verdict).toBe("non_confirmee");
  });

  it("n'est pas confirmée sur une seule grappe (ni établie ni non établie)", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      {
        comparaisons: [comparaisonModes("outil-alpha", 0.3, intervalle(0.3, 0.3, { nombre_grappes: 1, degenere: "grappe_unique" }), null)],
        paires_exclues: [],
      },
      VIDE,
    );
    // Ni établie ni non établie : ni confirmée, ni sans objet (les deux modes sont comparés).
    expect(decision?.verdict).toBe("non_confirmee");
    expect(decision?.global).toMatchObject({ statut: "comparee", qualificatif: null });
  });

  it("publie « sans objet » un outil dont un mode n'a aucune réponse classée (différence indéfinie)", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      { comparaisons: [comparaisonModes("outil-alpha", null, null, null)], paires_exclues: [] },
      VIDE,
    );
    expect(decision?.verdict).toBe("sans_objet");
    expect(decision?.global).toMatchObject({ statut: "comparee", difference: null, intervalle: null });
  });

  it("publie « sans objet » un outil dont un couple est marqué run incomplet, la paire exclue rendue telle quelle", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      {
        comparaisons: [],
        paires_exclues: [{ cle: `outil-alpha:${CLE_MODES}`, couples_incomplets: ["outil-alpha/web_activee"] }],
      },
      VIDE,
    );
    expect(decision?.verdict).toBe("sans_objet");
    expect(decision?.global).toEqual({ statut: "exclue", couples_incomplets: ["outil-alpha/web_activee"] });
  });

  it("publie « sans objet » un outil qui n'interroge qu'un mode (comparaison absente)", () => {
    const [decision] = decisionH2(["outil-alpha"], VIDE, VIDE);
    expect(decision?.verdict).toBe("sans_objet");
    expect(decision?.global).toEqual({ statut: "absente" });
  });

  it("rend un verdict par outil et aucun verdict global", () => {
    const decisions = decisionH2(
      ["outil-alpha", "outil-beta"],
      { comparaisons: [comparaisonModes("outil-alpha", 0.3, intervalle(0.1, 0.5), "etablie")], paires_exclues: [] },
      VIDE,
    );
    expect(Array.isArray(decisions)).toBe(true);
    expect(decisions.map((d) => [d.outil_id, d.verdict])).toEqual([
      ["outil-alpha", "confirmee"],
      ["outil-beta", "sans_objet"],
    ]);
  });

  it("publie la strate de moins de 60 jours en secondaire, sans qu'elle décide", () => {
    const [decision] = decisionH2(
      ["outil-alpha"],
      { comparaisons: [comparaisonModes("outil-alpha", 0.1, intervalle(-0.1, 0.3), "non_etablie")], paires_exclues: [] },
      { comparaisons: [comparaisonModes("outil-alpha", 0.4, intervalle(0.2, 0.6), "etablie")], paires_exclues: [] },
    );
    expect(decision?.verdict).toBe("non_confirmee");
    expect(decision?.moins_de_60_jours).toMatchObject({ statut: "comparee", difference: 0.4, qualificatif: "etablie" });
  });

  it("refuse une différence établie dont le signe contredit son intervalle", () => {
    expect(() =>
      decisionH2(
        ["outil-alpha"],
        { comparaisons: [comparaisonModes("outil-alpha", -0.1, intervalle(0.1, 0.5), "etablie")], paires_exclues: [] },
        VIDE,
      ),
    ).toThrow(SigneDifferenceIncoherent);
  });

  it("refuse une comparaison d'un outil non déclaré, ou d'une clé qui n'est pas celle des modes", () => {
    expect(() =>
      decisionH2(["outil-alpha"], { comparaisons: [comparaisonModes("outil-beta", 0.1, intervalle(0.1, 0.2), "etablie")], paires_exclues: [] }, VIDE),
    ).toThrow(ComparaisonsDeModesIncoherentes);
    const mauvaiseCle = { ...comparaisonModes("outil-alpha", 0.1, intervalle(0.1, 0.2), "etablie"), cle: "outil-alpha:neutre-oriente" };
    expect(() => decisionH2(["outil-alpha"], { comparaisons: [mauvaiseCle], paires_exclues: [] }, VIDE)).toThrow(
      ComparaisonsDeModesIncoherentes,
    );
  });

  it("refuse un outil à la fois comparé et exclu", () => {
    expect(() =>
      decisionH2(
        ["outil-alpha"],
        {
          comparaisons: [comparaisonModes("outil-alpha", 0.3, intervalle(0.1, 0.5), "etablie")],
          paires_exclues: [{ cle: `outil-alpha:${CLE_MODES}`, couples_incomplets: ["outil-alpha/web_activee"] }],
        },
        VIDE,
      ),
    ).toThrow(ComparaisonsDeModesIncoherentes);
  });

  it("refuse une liste d'outils vide", () => {
    expect(() => decisionH2([], VIDE, VIDE)).toThrow(OutilsAbsents);
  });

  it("lit le sens réel de pairesParMode : exactitude plus basse sans web ⇒ confirmée", () => {
    // Douze items, tous exacts en web activée, tous inexacts en web désactivée.
    const unites = Array.from({ length: 12 }, (_, i) => {
      const item = ulid(`item-h2-${i}`);
      const commun = { grappe_id: item, item_principal_id: item, item_ids: [item] };
      return [
        unite({ ...commun, verdict_id: ulid(`v-a-${i}`), mode: "web_activee", categorie: "exacte" }),
        unite({ ...commun, verdict_id: ulid(`v-d-${i}`), mode: "web_desactivee", categorie: "inexacte" }),
      ];
    }).flat();
    const { paires, paires_exclues } = pairesParMode(unites, tousCompares(unites));
    const comparaisons = comparerConditions(paires, exactitude, {
      reechantillonnages: 200,
      graine_du_run: 20261201,
      cle: ["exactitude", "global"],
    });
    const [decision] = decisionH2(["outil-alpha"], { comparaisons, paires_exclues }, VIDE);
    // Publiée activée − désactivée : 1 − 0 = 1, positive et établie.
    expect(decision?.global).toMatchObject({ statut: "comparee", difference: 1 });
    expect(decision?.verdict).toBe("confirmee");
  });
});

/* ------------------------------------------------------------------ H4 */

function famille(corrigees: readonly [string, number][], couples_sans_test: string[] = []): FamilleAsymetrie {
  return {
    corrigees: corrigees.map(([cle, corrigee]) => ({ cle, valeur: corrigee, corrigee })),
    couples_incomplets: [],
    couples_sans_test,
  };
}

describe("H4 : valeur p corrigée strictement inférieure à 0,05", () => {
  it("fixe le seuil à 0,05", () => {
    expect(SEUIL_H4).toBe(0.05);
  });

  it("est confirmée quand un couple a une valeur p corrigée sous 0,05", () => {
    const decision = decisionH4(famille([["outil-alpha/web_activee", 0.2], ["outil-alpha/web_desactivee", 0.049]]));
    expect(decision.verdict).toBe("confirmee");
    expect(decision.couples_sous_le_seuil).toEqual(["outil-alpha/web_desactivee"]);
  });

  it("n'est pas confirmée quand la valeur p corrigée vaut exactement 0,05 (inégalité stricte)", () => {
    const decision = decisionH4(famille([["outil-alpha/web_activee", 0.05]]));
    expect(decision.verdict).toBe("non_confirmee");
    expect(decision.couples_sous_le_seuil).toEqual([]);
  });

  it("lit la valeur corrigée, pas la brute : 0,025 corrigée par Holm sur deux couples vaut 0,05", () => {
    const decision = decisionH4({
      corrigees: [
        { cle: "outil-alpha/web_activee", valeur: 0.025, corrigee: 0.05 },
        { cle: "outil-alpha/web_desactivee", valeur: 0.5, corrigee: 0.5 },
      ],
      couples_incomplets: [],
      couples_sans_test: [],
    });
    expect(decision.verdict).toBe("non_confirmee");
  });

  it("est indécidable quand aucun couple n'a de test, jamais infirmée", () => {
    const decision = decisionH4(famille([], ["outil-alpha/web_activee"]));
    expect(decision.verdict).toBe("indecidable");
    expect(decision.couples_testes).toBe(0);
  });

  it("est indécidable sur une famille entièrement vide (tous les couples incomplets)", () => {
    const decision = decisionH4({ corrigees: [], couples_incomplets: ["outil-alpha/web_activee"], couples_sans_test: [] });
    expect(decision.verdict).toBe("indecidable");
  });
});
