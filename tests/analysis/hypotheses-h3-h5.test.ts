/**
 * Règles de décision de H3 et de H5 (§2, protocole 0.27, D63 ; « non confirmée », jamais
 * « infirmée », D67) et décision de la session principale D70 (H5 d'un outil à deux modes).
 *
 * H3 : par couple outil × mode comparé, différence appariée de l'exactitude, neutre moins orientée,
 * restreinte aux questions dont l'item principal est F ou O, établie et positive.
 * H5 : par outil, tendance de l'exactitude (dernier run moins premier), établie et positive.
 */

import { describe, expect, it } from "vitest";
import type { DifferenceTaux } from "../../analysis/bootstrap.ts";
import { cleComparaisonH3, comparerConditions, pairesDeH3, type ComparaisonCondition } from "../../analysis/conditions.ts";
import { decisionH3, decisionH5, STRATE_H3, ComparaisonsH3Incoherentes, TendanceIncoherente } from "../../analysis/hypotheses.ts";
import { exactitude } from "../../analysis/metriques.ts";
import type { TendanceDuRun, TendanceOutilEtMode } from "../../analysis/tendance.ts";
import { taux, type Intervalle95, type Mode, type Registre, type TypeItem } from "../../analysis/types.ts";
import { idQuestion, motifFabrique, ulid, unite } from "./fabriques.ts";

function intervalle(bas: number, haut: number): Intervalle95 {
  return { bas, haut, nombre_grappes: 12, reechantillonnages: 2000, reechantillonnages_indefinis: 0, degenere: null };
}

function difference(valeur: number | null, borne: Intervalle95 | null, qualificatif: DifferenceTaux["qualificatif"], cle: readonly string[]): DifferenceTaux {
  return { cle, graine: "0000000000000000", taux_a: taux(8, 10), taux_b: taux(5, 10), difference: valeur, intervalle: borne, qualificatif, motif_sans_qualificatif: motifFabrique(valeur, borne, qualificatif) };
}

/* ------------------------------------------------------------------ H3 */

const ALPHA_ACTIVEE = { outil_id: "outil-alpha", mode: "web_activee" as Mode };
const ALPHA_DESACTIVEE = { outil_id: "outil-alpha", mode: "web_desactivee" as Mode };

/** Une comparaison neutre − orientée telle que `pairesDeH3` + `comparerConditions` la rendent. */
function comparaisonH3(couple: { outil_id: string; mode: Mode }, valeur: number | null, borne: Intervalle95 | null, qualificatif: DifferenceTaux["qualificatif"]): ComparaisonCondition {
  const cle = cleComparaisonH3(couple);
  return { cle, difference: difference(valeur, borne, qualificatif, ["bootstrap", "exactitude", STRATE_H3, cle]), grappes_appariees: 12, grappes_exclues: [] };
}

const UN_COMPARE = { compares: [ALPHA_ACTIVEE], incomplets: [] };

describe("H3 : neutre − orientée sur les items F et O, établie et positive", () => {
  it("est confirmée sur un couple dont la différence est établie et positive", () => {
    const [couple] = decisionH3(UN_COMPARE, { comparaisons: [comparaisonH3(ALPHA_ACTIVEE, 0.3, intervalle(0.1, 0.5), "etablie")], paires_exclues: [] });
    expect(couple).toMatchObject({ cle: "outil-alpha/web_activee", verdict: "confirmee", motif: null, difference: { statut: "comparee", difference: 0.3 } });
  });

  it("n'est pas confirmée quand la différence est établie mais négative", () => {
    const [couple] = decisionH3(UN_COMPARE, { comparaisons: [comparaisonH3(ALPHA_ACTIVEE, -0.3, intervalle(-0.5, -0.1), "etablie")], paires_exclues: [] });
    expect(couple).toMatchObject({ verdict: "non_confirmee", motif: null });
  });

  it("n'est pas confirmée quand la différence n'est pas établie", () => {
    const [couple] = decisionH3(UN_COMPARE, { comparaisons: [comparaisonH3(ALPHA_ACTIVEE, 0.2, intervalle(-0.05, 0.4), "non_etablie")], paires_exclues: [] });
    expect(couple).toMatchObject({ verdict: "non_confirmee", motif: null });
  });

  it("zéro observé : une différence ni établie ni non établie (qualificatif nul, intervalle [0 ; 0]) n'est pas confirmée", () => {
    const [couple] = decisionH3(UN_COMPARE, { comparaisons: [comparaisonH3(ALPHA_ACTIVEE, 0, intervalle(0, 0), null)], paires_exclues: [] });
    expect(couple).toMatchObject({ verdict: "non_confirmee", motif: null, difference: { qualificatif: null, intervalle: { bas: 0, haut: 0 } } });
  });

  it("zéro observé, calculé : aucune réponse exacte dans les deux registres, intervalle [0 ; 0], non confirmée", () => {
    const unites = [0, 1, 2].flatMap((i) =>
      (["neutre", "oriente"] as Registre[]).map((registre) =>
        unite({ ...ALPHA_ACTIVEE, verdict_id: ulid(`v-${i}-${registre}`), grappe_id: ulid(`g-${i}`), type_item_principal: "F", registre, categorie: "inexacte" }),
      ),
    );
    const comparaisons = comparerConditions(pairesDeH3(unites, UN_COMPARE).paires, exactitude, { reechantillonnages: 50, graine_du_run: 1, cle: ["exactitude", STRATE_H3] });
    const [couple] = decisionH3(UN_COMPARE, { comparaisons, paires_exclues: [] });
    expect(couple?.difference).toMatchObject({ difference: 0, intervalle: { bas: 0, haut: 0 } });
    expect(couple?.verdict).toBe("non_confirmee");
  });

  it("est sans objet, motif paire_absente, sur un couple comparé sans question F ou O dans un registre", () => {
    const types: readonly [TypeItem, Registre][] = [
      ["F", "neutre"],
      ["O", "neutre"],
      ["P", "oriente"],
    ];
    const unites = types.map(([type, registre], i) => unite({ ...ALPHA_ACTIVEE, verdict_id: ulid(`v-${i}`), grappe_id: ulid(`g-${i}`), type_item_principal: type, registre }));
    const paires = pairesDeH3(unites, UN_COMPARE);
    expect(paires).toEqual({ paires: [], paires_exclues: [] });
    expect(decisionH3(UN_COMPARE, { comparaisons: [], paires_exclues: [] })).toEqual([{ cle: "outil-alpha/web_activee", verdict: "sans_objet", motif: "paire_absente", difference: null }]);
  });

  it("restreint aux items F et O, et à la seule paire neutre − orientée", () => {
    const unites = (["P", "F", "O", null] as (TypeItem | null)[]).flatMap((type, i) =>
      (["neutre", "familier", "oriente"] as Registre[]).map((registre) =>
        unite({ ...ALPHA_ACTIVEE, verdict_id: ulid(`v-${i}-${registre}`), question_id: idQuestion(`q-${i}`), grappe_id: ulid(`g-${i}`), type_item_principal: type, registre }),
      ),
    );
    const { paires } = pairesDeH3(unites, UN_COMPARE);
    expect(paires.map((p) => p.cle)).toEqual(["outil-alpha:web_activee:neutre-oriente"]);
    expect(new Set([...(paires[0]?.a ?? []), ...(paires[0]?.b ?? [])].map((u) => u.type_item_principal))).toEqual(new Set(["F", "O"]));
  });

  it("est sans objet, motif couple_incomplet, sur un couple marqué run incomplet", () => {
    const partage = { compares: [ALPHA_DESACTIVEE], incomplets: [ALPHA_ACTIVEE] };
    const decision = decisionH3(partage, {
      comparaisons: [comparaisonH3(ALPHA_DESACTIVEE, 0.3, intervalle(0.1, 0.5), "etablie")],
      paires_exclues: [{ cle: cleComparaisonH3(ALPHA_ACTIVEE), couples_incomplets: ["outil-alpha/web_activee"] }],
    });
    expect(decision).toEqual([
      expect.objectContaining({ cle: "outil-alpha/web_desactivee", verdict: "confirmee" }),
      { cle: "outil-alpha/web_activee", verdict: "sans_objet", motif: "couple_incomplet", difference: null },
    ]);
  });

  it("est sans objet, motif exactitude_indefinie, quand un registre n'a aucune réponse classée", () => {
    const [couple] = decisionH3(UN_COMPARE, { comparaisons: [comparaisonH3(ALPHA_ACTIVEE, null, null, null)], paires_exclues: [] });
    expect(couple).toMatchObject({ verdict: "sans_objet", motif: "exactitude_indefinie", difference: { statut: "comparee", difference: null } });
  });

  it("refuse une comparaison qui n'est pas celle d'un couple comparé, ou une paire exclue d'un couple comparé", () => {
    expect(() => decisionH3(UN_COMPARE, { comparaisons: [comparaisonH3(ALPHA_DESACTIVEE, 0.3, intervalle(0.1, 0.5), "etablie")], paires_exclues: [] })).toThrow(ComparaisonsH3Incoherentes);
    expect(() => decisionH3(UN_COMPARE, { comparaisons: [], paires_exclues: [{ cle: cleComparaisonH3(ALPHA_ACTIVEE), couples_incomplets: ["outil-alpha/web_activee"] }] })).toThrow(
      ComparaisonsH3Incoherentes,
    );
    const une = comparaisonH3(ALPHA_ACTIVEE, 0.3, intervalle(0.1, 0.5), "etablie");
    expect(() => decisionH3(UN_COMPARE, { comparaisons: [une, une], paires_exclues: [] })).toThrow(ComparaisonsH3Incoherentes);
  });

  it("ne rend aucun verdict global : une ligne par couple du partage, et rien d'autre", () => {
    const decision = decisionH3({ compares: [ALPHA_ACTIVEE, ALPHA_DESACTIVEE], incomplets: [] }, { comparaisons: [], paires_exclues: [] });
    expect(Array.isArray(decision)).toBe(true);
    expect(decision.map((c) => c.cle)).toEqual(["outil-alpha/web_activee", "outil-alpha/web_desactivee"]);
  });
});

/* ------------------------------------------------------------------ H5 */

function ligne(outil_id: string, mode: Mode, valeur: number | null, borne: Intervalle95 | null, qualificatif: DifferenceTaux["qualificatif"]): TendanceOutilEtMode {
  return {
    outil_id,
    mode,
    questions_communes: 12,
    questions_exclues: [],
    difference: difference(valeur, borne, qualificatif, ["bootstrap", "exactitude", "global", outil_id, mode]),
  };
}

function tendance(par_outil_et_mode: readonly TendanceOutilEtMode[], couples_exclus: TendanceDuRun["couples_exclus"] = []): TendanceDuRun {
  return { questions_texte_change: 1, par_outil_et_mode, couples_exclus };
}

const ETABLIE_POSITIVE = [0.2, intervalle(0.05, 0.35), "etablie"] as const;

describe("H5 : tendance de l'exactitude, dernier − premier, établie et positive (D70 pour deux modes)", () => {
  it("est confirmée pour un outil dont les deux modes comparés sont confirmés", () => {
    const decision = decisionH5(["outil-alpha"], tendance([ligne("outil-alpha", "web_activee", ...ETABLIE_POSITIVE), ligne("outil-alpha", "web_desactivee", ...ETABLIE_POSITIVE)]));
    expect(decision.questions_texte_change).toBe(1);
    expect(decision.outils[0]?.verdict).toBe("confirmee");
    expect(decision.outils[0]?.couples.map((c) => [c.cle, c.verdict])).toEqual([
      ["outil-alpha/web_activee", "confirmee"],
      ["outil-alpha/web_desactivee", "confirmee"],
    ]);
    expect(decision.outils[0]?.couples[0]?.tendance).toMatchObject({ cle: ["bootstrap", "exactitude", "global", "outil-alpha", "web_activee"], questions_communes: 12 });
  });

  it("n'est pas confirmée quand l'un des deux modes n'est pas établi", () => {
    const decision = decisionH5(
      ["outil-alpha"],
      tendance([ligne("outil-alpha", "web_activee", ...ETABLIE_POSITIVE), ligne("outil-alpha", "web_desactivee", 0.1, intervalle(-0.05, 0.25), "non_etablie")]),
    );
    expect(decision.outils[0]?.verdict).toBe("non_confirmee");
    expect(decision.outils[0]?.couples.map((c) => c.verdict)).toEqual(["confirmee", "non_confirmee"]);
  });

  it("n'est pas confirmée sur une tendance établie mais négative", () => {
    const decision = decisionH5(["outil-alpha"], tendance([ligne("outil-alpha", "web_activee", -0.2, intervalle(-0.35, -0.05), "etablie")]));
    expect(decision.outils[0]?.verdict).toBe("non_confirmee");
  });

  it("est sans objet pour un outil sans couple comparé : exclu de la tendance, ou absent", () => {
    const decision = decisionH5(
      ["outil-alpha", "outil-beta"],
      tendance([], [{ outil_id: "outil-alpha", mode: "web_activee", incomplet_au_premier: true, incomplet_au_dernier: false }]),
    );
    expect(decision.outils).toEqual([
      {
        outil_id: "outil-alpha",
        verdict: "sans_objet",
        couples: [
          { cle: "outil-alpha/web_activee", verdict: "sans_objet", motif: "couple_exclu_de_la_tendance", tendance: null, exclusion: { incomplet_au_premier: true, incomplet_au_dernier: false } },
        ],
      },
      { outil_id: "outil-beta", verdict: "sans_objet", couples: [] },
    ]);
  });

  it("D70 : un couple sorti de la tendance n'empêche pas la confirmation par les couples comparés", () => {
    const decision = decisionH5(
      ["outil-alpha"],
      tendance([ligne("outil-alpha", "web_desactivee", ...ETABLIE_POSITIVE)], [{ outil_id: "outil-alpha", mode: "web_activee", incomplet_au_premier: false, incomplet_au_dernier: true }]),
    );
    expect(decision.outils[0]?.verdict).toBe("confirmee");
    expect(decision.outils[0]?.couples.map((c) => [c.cle, c.verdict, c.motif])).toEqual([
      ["outil-alpha/web_desactivee", "confirmee", null],
      ["outil-alpha/web_activee", "sans_objet", "couple_exclu_de_la_tendance"],
    ]);
  });

  it("publie sans objet, motif tendance_indefinie, un couple sans différence (présent à un seul run)", () => {
    const decision = decisionH5(["outil-alpha"], tendance([ligne("outil-alpha", "web_activee", null, null, null)]));
    expect(decision.outils[0]).toMatchObject({ verdict: "sans_objet", couples: [{ verdict: "sans_objet", motif: "tendance_indefinie" }] });
  });

  it("refuse une ligne de tendance d'un outil que le dernier run ne déclare pas", () => {
    expect(() => decisionH5(["outil-alpha"], tendance([ligne("outil-gamma", "web_activee", ...ETABLIE_POSITIVE)]))).toThrow(TendanceIncoherente);
    expect(() =>
      decisionH5(["outil-alpha"], tendance([], [{ outil_id: "outil-gamma", mode: "web_activee", incomplet_au_premier: true, incomplet_au_dernier: true }])),
    ).toThrow(TendanceIncoherente);
  });
});
