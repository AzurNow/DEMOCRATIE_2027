/**
 * §8 (protocole 0.28, D70 (12)), « Variabilité entre échantillons » : « L'accord entre les deux
 * échantillons d'une même question, dans une même formulation et un même mode, lu sur la catégorie
 * primaire de leur note retenue, est publié par couple outil × mode, en diagnostic : ce n'est pas une
 * métrique, et il ne reçoit aucun qualificatif. »
 *
 * Chaque cas limite du brief a son test nommé ; les effectifs se calculent sur papier.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PaireDEchantillonsIncoherente,
  variabiliteEntreEchantillons,
  type EntreesVariabilite,
  type VariabiliteDuCouple,
} from "../../analysis/accord-echantillons.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import type { PartageCouples, RequeteDuPlan } from "../../analysis/seuils.ts";
import type { CategorieRetenue, CoupleOutilMode, Reponse } from "../../analysis/types.ts";
import { idQuestion, reponseDe, ulid, unite } from "./fabriques.ts";

const ALPHA_SANS: CoupleOutilMode = { outil_id: "outil-alpha", mode: "web_desactivee" };
const ALPHA_AVEC: CoupleOutilMode = { outil_id: "outil-alpha", mode: "web_activee" };
const BETA_SANS: CoupleOutilMode = { outil_id: "outil-beta", mode: "web_desactivee" };

/** Un échantillon prévu au plan : sa catégorie retenue, ou `manquante` (aucune réponse obtenue). */
interface Echantillon {
  readonly couple?: CoupleOutilMode;
  readonly question: string;
  readonly formulation?: string;
  readonly echantillon: 1 | 2;
  readonly issue: CategorieRetenue | "manquante";
  readonly refus_api?: boolean;
  readonly unite?: Partial<UniteAnalyse>;
}

function requeteDe(e: Echantillon): RequeteDuPlan {
  const couple = e.couple ?? ALPHA_SANS;
  return {
    outil_id: couple.outil_id,
    mode: couple.mode,
    question_id: idQuestion(e.question),
    formulation_id: ulid(`formulation-${e.formulation ?? "neutre"}`),
    echantillon: e.echantillon,
  };
}

function reponseObtenue(requete: RequeteDuPlan, refus_api: boolean): Reponse {
  const base = reponseDe(requete, "obtenue");
  if (!refus_api) return base;
  // Un refus de modération de l'API : réponse obtenue, projection fixée (reponse.schema.json).
  return { ...base, normalise: { texte: "", liens: [], troncature: false, refus_api: true } } as Reponse;
}

function uniteDe(requete: RequeteDuPlan, reponse: Reponse, categorie: CategorieRetenue, partiel: Partial<UniteAnalyse>): UniteAnalyse {
  return unite({
    verdict_id: ulid(`verdict-${reponse.id}`),
    reponse_id: reponse.id,
    outil_id: requete.outil_id,
    mode: requete.mode,
    question_id: requete.question_id,
    echantillon: requete.echantillon,
    categorie,
    ...partiel,
  });
}

/** Le plan, les réponses du run et les unités notées que décrivent les échantillons. */
function entrees(echantillons: readonly Echantillon[], couples: PartageCouples): EntreesVariabilite {
  const plan: RequeteDuPlan[] = [];
  const reponses: Reponse[] = [];
  const unites: UniteAnalyse[] = [];
  for (const e of echantillons) {
    const requete = requeteDe(e);
    plan.push(requete);
    if (e.issue === "manquante") {
      reponses.push(reponseDe(requete, "manquante"));
      continue;
    }
    const reponse = reponseObtenue(requete, e.refus_api ?? false);
    reponses.push(reponse);
    unites.push(uniteDe(requete, reponse, e.issue, e.unite ?? {}));
  }
  return { couples, plan, reponses, unites };
}

const UN_COUPLE: PartageCouples = { compares: [ALPHA_SANS], incomplets: [] };

/** Les deux échantillons d'une question, neutre, couple alpha sans recherche. */
function paire(question: string, premier: Echantillon["issue"], second: Echantillon["issue"], extra: Partial<Echantillon> = {}): Echantillon[] {
  return [
    { question, echantillon: 1, issue: premier, ...extra },
    { question, echantillon: 2, issue: second, ...extra },
  ];
}

const AUCUNE_ECARTEE = { aucun_echantillon_obtenu: 0, un_seul_echantillon_obtenu: 0, non_classee: 0, indeterminee: 0 };

function seul(resultat: readonly VariabiliteDuCouple[]): VariabiliteDuCouple {
  expect(resultat).toHaveLength(1);
  return resultat[0] as VariabiliteDuCouple;
}

describe("§8, variabilité entre échantillons : cas limites", () => {
  it("concordance totale : accord 1", () => {
    const e = entrees([...paire("q1", "exacte", "exacte"), ...paire("q2", "inexacte", "inexacte"), ...paire("q3", "non_reponse", "non_reponse")], UN_COUPLE);
    expect(seul(variabiliteEntreEchantillons(e))).toEqual({
      couple: ALPHA_SANS,
      paires_prevues: 3,
      paires_comparables: 3,
      paires_concordantes: 3,
      accord: 1,
      paires_ecartees: AUCUNE_ECARTEE,
    });
  });

  it("discordance totale : accord 0, publié comme une valeur puisque des paires sont comparables", () => {
    const e = entrees([...paire("q1", "exacte", "inexacte"), ...paire("q2", "non_reponse", "exacte")], UN_COUPLE);
    expect(seul(variabiliteEntreEchantillons(e))).toEqual({
      couple: ALPHA_SANS,
      paires_prevues: 2,
      paires_comparables: 2,
      paires_concordantes: 0,
      accord: 0,
      paires_ecartees: AUCUNE_ECARTEE,
    });
  });

  it("question avec un seul échantillon obtenu : paire écartée (un_seul_echantillon_obtenu), jamais comptée concordante ni discordante", () => {
    const e = entrees([...paire("q1", "exacte", "manquante"), ...paire("q2", "exacte", "exacte")], UN_COUPLE);
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toMatchObject({ paires_prevues: 2, paires_comparables: 1, paires_concordantes: 1, accord: 1 });
    expect(v.paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, un_seul_echantillon_obtenu: 1 });
  });

  it("les deux échantillons manquants : paire écartée (aucun_echantillon_obtenu), comptée sur le plan", () => {
    const e = entrees([...paire("q1", "manquante", "manquante"), ...paire("q2", "exacte", "inexacte")], UN_COUPLE);
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toMatchObject({ paires_prevues: 2, paires_comparables: 1, paires_concordantes: 0, accord: 0 });
    expect(v.paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, aucun_echantillon_obtenu: 1 });
  });

  it("les deux échantillons indéterminés : paire écartée (indeterminee), pas comptée concordante", () => {
    const e = entrees([...paire("q1", "indeterminee", "indeterminee"), ...paire("q2", "exacte", "exacte")], UN_COUPLE);
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toMatchObject({ paires_prevues: 2, paires_comparables: 1, paires_concordantes: 1, accord: 1 });
    expect(v.paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, indeterminee: 1 });
  });

  it("un seul échantillon indéterminé : paire écartée (indeterminee), pas comptée discordante", () => {
    const e = entrees([...paire("q1", "exacte", "indeterminee"), ...paire("q2", "exacte", "exacte")], UN_COUPLE);
    expect(seul(variabiliteEntreEchantillons(e)).paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, indeterminee: 1 });
  });

  it("l'un non classé (référence incomplète, D64) : paire écartée (non_classee), sans catégorie primaire à comparer", () => {
    const e = entrees([...paire("q1", "non_classee", "exacte"), ...paire("q2", "inexacte", "inexacte")], UN_COUPLE);
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toMatchObject({ paires_prevues: 2, paires_comparables: 1, paires_concordantes: 1, accord: 1 });
    expect(v.paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, non_classee: 1 });
  });

  it("l'un non classé, l'autre indéterminé : un seul motif, non_classee, la paire n'est comptée qu'une fois", () => {
    const e = entrees(paire("q1", "non_classee", "indeterminee"), UN_COUPLE);
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v.paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, non_classee: 1 });
    expect(v.paires_prevues).toBe(1);
  });

  it("l'un refus d'API : noté non-réponse par la règle (§7), il entre dans l'accord comme toute non-réponse", () => {
    const concordante = [
      { question: "q1", echantillon: 1, issue: "non_reponse", refus_api: true },
      { question: "q1", echantillon: 2, issue: "non_reponse" },
    ] as const satisfies readonly Echantillon[];
    const discordante = [
      { question: "q2", echantillon: 1, issue: "non_reponse", refus_api: true },
      { question: "q2", echantillon: 2, issue: "exacte" },
    ] as const satisfies readonly Echantillon[];
    const e = entrees([...concordante, ...discordante], UN_COUPLE);
    // La projection d'un refus porte refus_api (reponse.schema.json), que l'analyse ne lit pas.
    expect(e.reponses.filter((r) => (r.normalise as { readonly refus_api?: boolean } | undefined)?.refus_api === true)).toHaveLength(2);
    expect(seul(variabiliteEntreEchantillons(e))).toEqual({
      couple: ALPHA_SANS,
      paires_prevues: 2,
      paires_comparables: 2,
      paires_concordantes: 1,
      accord: 0.5,
      paires_ecartees: AUCUNE_ECARTEE,
    });
  });

  it("aucune paire comparable sur un couple : accord absent avec son motif, ni 0 ni null", () => {
    const e = entrees([...paire("q1", "exacte", "manquante"), ...paire("q2", "indeterminee", "exacte"), ...paire("q3", "non_classee", "non_classee")], UN_COUPLE);
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toEqual({
      couple: ALPHA_SANS,
      paires_prevues: 3,
      paires_comparables: 0,
      paires_concordantes: 0,
      motif_absence: "aucune_paire_comparable",
      paires_ecartees: { aucun_echantillon_obtenu: 0, un_seul_echantillon_obtenu: 1, non_classee: 1, indeterminee: 1 },
    });
    expect("accord" in v).toBe(false);
  });

  it("deux formulations d'une même question ne sont jamais appariées entre elles", () => {
    // Échantillon 1 en neutre et échantillon 2 en familière, tous deux exacts : deux paires
    // incomplètes, aucune paire concordante fabriquée en croisant les formulations.
    const e = entrees(
      [
        { question: "q1", formulation: "neutre", echantillon: 1, issue: "exacte" },
        { question: "q1", formulation: "neutre", echantillon: 2, issue: "manquante" },
        { question: "q1", formulation: "familier", echantillon: 1, issue: "manquante" },
        { question: "q1", formulation: "familier", echantillon: 2, issue: "exacte" },
      ],
      UN_COUPLE,
    );
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toMatchObject({ paires_prevues: 2, paires_comparables: 0, motif_absence: "aucune_paire_comparable" });
    expect(v.paires_ecartees.un_seul_echantillon_obtenu).toBe(2);
  });

  it("deux formulations d'une même question donnent deux paires distinctes", () => {
    const e = entrees([...paire("q1", "exacte", "exacte", { formulation: "neutre" }), ...paire("q1", "exacte", "inexacte", { formulation: "oriente" })], UN_COUPLE);
    expect(seul(variabiliteEntreEchantillons(e))).toMatchObject({ paires_prevues: 2, paires_comparables: 2, paires_concordantes: 1, accord: 0.5 });
  });

  it("deux modes ne sont jamais appariés : chaque couple outil × mode a ses propres paires", () => {
    const couples: PartageCouples = { compares: [ALPHA_AVEC, ALPHA_SANS], incomplets: [] };
    const e = entrees(
      [
        { couple: ALPHA_SANS, question: "q1", echantillon: 1, issue: "exacte" },
        { couple: ALPHA_SANS, question: "q1", echantillon: 2, issue: "manquante" },
        { couple: ALPHA_AVEC, question: "q1", echantillon: 1, issue: "manquante" },
        { couple: ALPHA_AVEC, question: "q1", echantillon: 2, issue: "exacte" },
      ],
      couples,
    );
    const resultat = variabiliteEntreEchantillons(e);
    expect(resultat.map((v) => v.couple)).toEqual([ALPHA_AVEC, ALPHA_SANS]);
    for (const v of resultat) {
      expect(v).toMatchObject({ paires_prevues: 1, paires_comparables: 0, motif_absence: "aucune_paire_comparable" });
      expect(v.paires_ecartees.un_seul_echantillon_obtenu).toBe(1);
    }
  });

  it("question d'attribution (sans candidat ni item principal) : deux échantillons au plan, même règle, non classée comprise", () => {
    const attribution: Partial<UniteAnalyse> = { gabarit: "Q-ATT", candidat_id: null, item_principal_id: null, type_item_principal: null };
    const e = entrees(
      [...paire("q-att-1", "inexacte", "inexacte", { unite: attribution }), ...paire("q-att-2", "exacte", "non_classee", { unite: attribution })],
      UN_COUPLE,
    );
    const v = seul(variabiliteEntreEchantillons(e));
    expect(v).toMatchObject({ paires_prevues: 2, paires_comparables: 1, paires_concordantes: 1, accord: 1 });
    expect(v.paires_ecartees).toEqual({ ...AUCUNE_ECARTEE, non_classee: 1 });
  });

  it("couple exclu par le seuil de non-publication (run incomplet) : absent du diagnostic, ses paires ne sont pas lues", () => {
    const couples: PartageCouples = { compares: [ALPHA_SANS], incomplets: [BETA_SANS] };
    const e = entrees([...paire("q1", "exacte", "exacte"), ...paire("q1", "exacte", "inexacte", { couple: BETA_SANS })], couples);
    const resultat = variabiliteEntreEchantillons(e);
    expect(resultat.map((v) => v.couple)).toEqual([ALPHA_SANS]);
    expect(seul(resultat)).toMatchObject({ paires_prevues: 1, paires_concordantes: 1, accord: 1 });
  });

  it("chaque couple comparé est publié, trié par clé, même un couple sans réponse obtenue", () => {
    const couples: PartageCouples = { compares: [BETA_SANS, ALPHA_SANS], incomplets: [] };
    const e = entrees([...paire("q1", "exacte", "exacte"), ...paire("q1", "manquante", "manquante", { couple: BETA_SANS })], couples);
    const resultat = variabiliteEntreEchantillons(e);
    expect(resultat.map((v) => v.couple)).toEqual([ALPHA_SANS, BETA_SANS]);
    expect(resultat[1]).toMatchObject({ paires_prevues: 1, paires_comparables: 0, motif_absence: "aucune_paire_comparable", paires_ecartees: { ...AUCUNE_ECARTEE, aucun_echantillon_obtenu: 1 } });
  });
});

describe("§8, variabilité entre échantillons : incohérences refusées", () => {
  it("trois échantillons prévus pour une même question, formulation et mode : refus, l'accord est entre deux échantillons", () => {
    const e = entrees(paire("q1", "exacte", "exacte"), UN_COUPLE);
    const troisieme = { ...(e.plan[0] as RequeteDuPlan), echantillon: 3 };
    expect(() => variabiliteEntreEchantillons({ ...e, plan: [...e.plan, troisieme] })).toThrow(PaireDEchantillonsIncoherente);
  });

  it("une paire à un seul échantillon prévu au plan : refus nommé, le §6 prévoit deux échantillons par question (D72 (7))", () => {
    const e = entrees([{ question: "q1", echantillon: 1, issue: "exacte" }, ...paire("q2", "exacte", "exacte")], UN_COUPLE);
    expect(() => variabiliteEntreEchantillons(e)).toThrow(PaireDEchantillonsIncoherente);
    expect(() => variabiliteEntreEchantillons(e)).toThrow(/1 échantillon prévu au plan/);
  });

  it("un même échantillon prévu deux fois au plan : refus", () => {
    const e = entrees(paire("q1", "exacte", "exacte"), UN_COUPLE);
    expect(() => variabiliteEntreEchantillons({ ...e, plan: [...e.plan, e.plan[0] as RequeteDuPlan] })).toThrow(PaireDEchantillonsIncoherente);
  });

  it("deux requêtes au plan pour une paire, toutes deux échantillon 1 : refus, deux échantillons distincts sont exigés", () => {
    const e = entrees([{ question: "q1", echantillon: 1, issue: "exacte" }], UN_COUPLE);
    expect(() => variabiliteEntreEchantillons({ ...e, plan: [...e.plan, e.plan[0] as RequeteDuPlan] })).toThrow(/un même échantillon prévu deux fois/);
  });

  it("une réponse obtenue d'un couple comparé sans unité notée : refus, jamais lue comme manquante", () => {
    const e = entrees(paire("q1", "exacte", "exacte"), UN_COUPLE);
    expect(() => variabiliteEntreEchantillons({ ...e, unites: e.unites.slice(1) })).toThrow(/sans unité notée/);
  });
});

describe("§8, variabilité entre échantillons : l'exemple publié (D72 (7))", () => {
  it("valide-02, régénéré sur le run en mémoire à deux échantillons, publie un accord sur des paires comparables", () => {
    const document = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../schema/exemples/metriques/valide-02-un-couple-compare.json"), "utf8")) as {
      variabilite_echantillons: { statut: string; couples: VariabiliteDuCouple[] };
    };
    expect(document.variabilite_echantillons.statut).toBe("calcule");
    expect(document.variabilite_echantillons.couples).toEqual([
      {
        couple: ALPHA_SANS,
        paires_prevues: 12,
        paires_comparables: 12,
        paires_concordantes: 12,
        paires_ecartees: AUCUNE_ECARTEE,
        accord: 1,
      },
    ]);
  });
});
