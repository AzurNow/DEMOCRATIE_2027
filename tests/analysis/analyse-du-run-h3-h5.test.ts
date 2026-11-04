/**
 * `pnpm analyze`, sous-lot D : H3 et H5 de bout en bout (§2, 0.27, D63 ; D70), régime d'inclusion
 * publié dans la population (§3, D68) et run à deux candidats `entre_deux_tours` (§3, « Entre les
 * deux tours »), sur des runs en mémoire (`run-analysable.ts`).
 */

import { describe, expect, it } from "vitest";
import { analyserRun, PremierRunInvalide } from "../../analysis/analyse-du-run.ts";
import { STRATE_H3 } from "../../analysis/hypotheses.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE, type ContexteReponse, type SpecRun } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 40, permutations: 40 };

type Json = Record<string, unknown>;

interface CoupleH5Json {
  readonly cle: string;
  readonly verdict: string;
  readonly motif: string | null;
  readonly exclusion: { incomplet_au_premier: boolean; incomplet_au_dernier: boolean } | null;
}
interface OutilH5Json {
  readonly outil_id: string;
  readonly verdict: string;
  readonly motif: string | null;
  readonly couples: readonly CoupleH5Json[];
}
interface CoupleH3Json {
  readonly cle: string;
  readonly verdict: string;
  readonly motif: string | null;
  readonly difference: { cle: string[] } | null;
}

/**
 * Le premier run : mêmes questions que le run de référence, gelé plus tôt. outil-alpha / web_activee
 * y est « run incomplet » (deux réponses sur trois manquent), alors qu'il est comparé au dernier run ;
 * outil-alpha se trompe sur tous les items P, qu'il réussit en partie au dernier run.
 */
const SPEC_PREMIER: SpecRun = {
  ...SPEC_REFERENCE,
  run: { cle: "run-premier", date_gel: "2026-11-20T06:00:00+01:00" },
  categorie: (c: ContexteReponse) => (c.outil_id === "outil-alpha" && c.type === "P" ? "inexacte" : SPEC_REFERENCE.categorie(c)),
  manquante: (c: ContexteReponse) => c.outil_id === "outil-alpha" && c.mode === "web_activee" && c.registre !== "neutre",
};

const DERNIER = entreesDuRunAnalysable(SPEC_REFERENCE);
const PREMIER = entreesDuRunAnalysable(SPEC_PREMIER);
const SANS_PREMIER = analyserRun(DERNIER, PARAMETRES, null) as Json;
const AVEC_PREMIER = analyserRun(DERNIER, PARAMETRES, PREMIER) as Json;

function hypothese(document: Json, nom: string): Json {
  return (document["hypotheses"] as Json)[nom] as Json;
}

function outilH5(document: Json, outil_id: string): OutilH5Json {
  const trouve = (hypothese(document, "H5")["outils"] as OutilH5Json[]).find((o) => o.outil_id === outil_id);
  if (trouve === undefined) throw new Error(`H5 : outil ${outil_id} absent`);
  return trouve;
}

function coupleH5(document: Json, outil_id: string, cle: string): CoupleH5Json {
  const trouve = outilH5(document, outil_id).couples.find((c) => c.cle === cle);
  if (trouve === undefined) throw new Error(`H5 : couple ${cle} absent`);
  return trouve;
}

function coupleH3(document: Json, cle: string): CoupleH3Json {
  const trouve = (hypothese(document, "H3")["couples"] as CoupleH3Json[]).find((c) => c.cle === cle);
  if (trouve === undefined) throw new Error(`H3 : couple ${cle} absent`);
  return trouve;
}

describe("documents conformes", () => {
  it("avec et sans premier run, le document est conforme à schema/metriques.schema.json", () => {
    expect(() => valider("metriques", SANS_PREMIER, "sans premier")).not.toThrow();
    expect(() => valider("metriques", AVEC_PREMIER, "avec premier")).not.toThrow();
  });
});

describe("H3 de bout en bout", () => {
  it("publie une ligne par couple du partage, sans verdict global ; le couple incomplet est sans objet", () => {
    const h3 = hypothese(SANS_PREMIER, "H3");
    expect(h3["statut"]).toBe("calcule");
    expect(h3).not.toHaveProperty("verdict");
    expect((h3["couples"] as CoupleH3Json[]).map((c) => c.cle)).toEqual([
      "outil-alpha/web_desactivee",
      "outil-alpha/web_activee",
      "outil-beta/web_desactivee",
      "outil-gamma/web_desactivee",
      "outil-gamma/web_activee",
    ]);
    expect(coupleH3(SANS_PREMIER, "outil-gamma/web_activee")).toEqual({ cle: "outil-gamma/web_activee", verdict: "sans_objet", motif: "couple_incomplet", difference: null });
  });

  it("une différence nulle sur les items F (tous niés dans les deux registres) n'est pas confirmée", () => {
    expect(coupleH3(SANS_PREMIER, "outil-alpha/web_desactivee")).toMatchObject({ verdict: "non_confirmee", motif: null });
  });

  it("n'est plus confirmée sur un intervalle [1 ; 1] dont les deux taux sont dégénérés (§8, 0.27 et 0.28)", () => {
    // outil-beta nie chaque item F en neutre (exacte, 2/2) et le confirme en orientée (inexacte,
    // 0/2) : différence 1 sur l'intervalle [1 ; 1], deux grappes. Avant la règle, « établie » et H3
    // confirmée ; un taux dont aucune grappe n'observe l'événement, ou le non-événement, ne qualifie
    // aucune différence.
    expect(coupleH3(SANS_PREMIER, "outil-beta/web_desactivee")).toMatchObject({
      verdict: "non_confirmee",
      motif: null,
      difference: {
        difference: 1,
        intervalle: { bas: 1, haut: 1, nombre_grappes: 2, degenere: null },
        qualificatif: null,
        motif_sans_qualificatif: "taux_degenere",
      },
    });
  });

  it(`a sa propre clé de graine, strate ${STRATE_H3}, distincte de la différence des formulations sur tous les items`, () => {
    const cleH3 = ["bootstrap", "exactitude", STRATE_H3, "outil-alpha:web_activee:neutre-oriente"];
    const cleToutes = ["bootstrap", "exactitude", "global", "outil-alpha:web_activee:neutre-oriente"];
    expect(coupleH3(SANS_PREMIER, "outil-alpha/web_activee").difference?.cle).toEqual(cleH3);
    const graines = SANS_PREMIER["graines"] as { cle: string[]; graine: string }[];
    const graineH3 = graines.find((g) => g.cle.join("\0") === cleH3.join("\0"));
    const graineToutes = graines.find((g) => g.cle.join("\0") === cleToutes.join("\0"));
    expect(graineH3).toBeDefined();
    expect(graineToutes).toBeDefined();
    expect(graineH3?.graine).not.toBe(graineToutes?.graine);
  });
});

describe("H5 de bout en bout", () => {
  it("sans --premier : sans objet, motif premier_run_absent", () => {
    expect(hypothese(SANS_PREMIER, "H5")).toEqual({ statut: "sans_objet", motif: "premier_run_absent" });
  });

  it("le premier run est lu avec son propre partage : un couple incomplet au seul premier run sort de la tendance", () => {
    expect(coupleH5(AVEC_PREMIER, "outil-alpha", "outil-alpha/web_activee")).toMatchObject({
      verdict: "sans_objet",
      motif: "couple_exclu_de_la_tendance",
      exclusion: { incomplet_au_premier: true, incomplet_au_dernier: false },
    });
    expect(coupleH5(AVEC_PREMIER, "outil-gamma", "outil-gamma/web_activee")).toMatchObject({
      verdict: "sans_objet",
      exclusion: { incomplet_au_premier: false, incomplet_au_dernier: true },
    });
  });

  it("D70 : l'outil est confirmé par son seul couple comparé, établi et positif", () => {
    expect(coupleH5(AVEC_PREMIER, "outil-alpha", "outil-alpha/web_desactivee")).toMatchObject({ verdict: "confirmee", motif: null, exclusion: null });
    expect(outilH5(AVEC_PREMIER, "outil-alpha").verdict).toBe("confirmee");
  });

  it("publie le premier run lu et le nombre de questions au texte changé", () => {
    const h5 = hypothese(AVEC_PREMIER, "H5");
    expect(h5).toMatchObject({ statut: "calcule", premier_run_id: PREMIER.run.id, questions_texte_change: 0 });
  });

  it("D73 (16) : un assistant du premier run sorti du dernier est rendu sans objet, motif absent_du_dernier_run, sans erreur", () => {
    const sansGamma = entreesDuRunAnalysable({ ...SPEC_REFERENCE, outils: SPEC_REFERENCE.outils.filter((o) => o.outil_id !== "outil-gamma") });
    const document = analyserRun(sansGamma, PARAMETRES, PREMIER) as Json;
    expect(() => valider("metriques", document, "assistant sorti du dernier run")).not.toThrow();
    expect((hypothese(document, "H5")["outils"] as OutilH5Json[]).map((o) => [o.outil_id, o.verdict, o.motif])).toEqual([
      ["outil-alpha", "confirmee", null],
      ["outil-beta", outilH5(AVEC_PREMIER, "outil-beta").verdict, null],
      ["outil-gamma", "sans_objet", "absent_du_dernier_run"],
    ]);
    // Ses couples, présents au seul premier run (où ils sont complets), sont publiés sans différence.
    expect(outilH5(document, "outil-gamma").couples.map((c) => [c.cle, c.verdict, c.motif])).toEqual([
      ["outil-gamma/web_desactivee", "sans_objet", "tendance_indefinie"],
      ["outil-gamma/web_activee", "sans_objet", "tendance_indefinie"],
    ]);
  });

  it("D73 (16) : un assistant entré au dernier run est rendu sans objet, motif absent_du_premier_run", () => {
    const premierSansGamma = entreesDuRunAnalysable({ ...SPEC_PREMIER, outils: SPEC_PREMIER.outils.filter((o) => o.outil_id !== "outil-gamma") });
    const document = analyserRun(DERNIER, PARAMETRES, premierSansGamma) as Json;
    expect(() => valider("metriques", document, "assistant entré au dernier run")).not.toThrow();
    expect(outilH5(document, "outil-gamma")).toMatchObject({ verdict: "sans_objet", motif: "absent_du_premier_run" });
    expect(outilH5(document, "outil-alpha")).toMatchObject({ verdict: "confirmee", motif: null });
  });

  it("refuse un premier run qui est le même run, ou qui n'est pas gelé avant le dernier", () => {
    expect(() => analyserRun(DERNIER, PARAMETRES, DERNIER)).toThrow(PremierRunInvalide);
    const plusTard = entreesDuRunAnalysable({ ...SPEC_PREMIER, run: { cle: "run-plus-tard", date_gel: "2026-12-15T06:00:00+01:00" } });
    expect(() => analyserRun(DERNIER, PARAMETRES, plusTard)).toThrow(PremierRunInvalide);
  });
});

/* ------------------------------------------------------------------ entre les deux tours */

const SPEC_DEUX_TOURS: SpecRun = {
  candidats: [
    { id: "candidat-a", sous_seuil: false, items_p: 4, items_f: 1 },
    { id: "candidat-b", sous_seuil: false, items_p: 4, items_f: 1 },
  ],
  outils: [{ outil_id: "outil-alpha", modes: ["web_desactivee", "web_activee"] }],
  categorie: (c) => (c.candidat_id === "candidat-b" && c.rang % 2 === 1 ? "inexacte" : "exacte"),
  run: { regime_inclusion: "entre_deux_tours" },
};

interface TestJson {
  readonly couple: { outil_id: string; mode: string };
  readonly test: { statut: string; motif?: string; candidats?: { candidat_id: string }[] };
}

describe("entre les deux tours (§3, D68)", () => {
  it("le régime est publié dans la population ; le test d'asymétrie est calculé tel quel sur les deux candidats", () => {
    const document = analyserRun(entreesDuRunAnalysable(SPEC_DEUX_TOURS), PARAMETRES, null) as Json;
    expect(() => valider("metriques", document, "entre deux tours")).not.toThrow();
    const population = document["population"] as Json;
    expect(population["regime_inclusion"]).toBe("entre_deux_tours");
    expect(population["candidats_compares"]).toEqual(["candidat-a", "candidat-b"]);
    const asymetrie = document["asymetrie"] as Json;
    const tests = asymetrie["couples"] as TestJson[];
    expect(tests.map((t) => t.test.statut)).toEqual(["calcule", "calcule"]);
    for (const t of tests) expect(t.test.candidats?.map((c) => c.candidat_id)).toEqual(["candidat-a", "candidat-b"]);
    expect(asymetrie["couples_sans_test"]).toEqual([]);
    expect(hypothese(document, "H4")).toMatchObject({ statut: "calcule", couples_testes: 2 });
  });

  it("un finaliste sous le seuil : rapporté à part, aucun test (« test sans objet »), H4 indécidable", () => {
    const spec: SpecRun = { ...SPEC_DEUX_TOURS, candidats: [SPEC_DEUX_TOURS.candidats[0] as SpecRun["candidats"][number], { id: "candidat-b", sous_seuil: true, items_p: 4, items_f: 1 }] };
    const document = analyserRun(entreesDuRunAnalysable(spec), PARAMETRES, null) as Json;
    expect(() => valider("metriques", document, "finaliste sous le seuil")).not.toThrow();
    const population = document["population"] as Json;
    expect(population).toMatchObject({ regime_inclusion: "entre_deux_tours", candidats_compares: ["candidat-a"], candidats_rapportes_a_part: ["candidat-b"] });
    const asymetrie = document["asymetrie"] as Json;
    expect((asymetrie["couples"] as TestJson[]).map((t) => t.test)).toEqual([
      { statut: "sans_objet", motif: "moins_de_deux_candidats" },
      { statut: "sans_objet", motif: "moins_de_deux_candidats" },
    ]);
    expect([...(asymetrie["couples_sans_test"] as string[])].sort()).toEqual(["outil-alpha/web_activee", "outil-alpha/web_desactivee"]);
    expect(hypothese(document, "H4")).toMatchObject({ verdict: "indecidable", couples_testes: 0 });
  });
});

describe("aucune sortie ne dit « infirmée » (D67)", () => {
  it("ni le document sans premier run, ni celui avec, ni celui de l'entre-deux-tours", () => {
    const deuxTours = analyserRun(entreesDuRunAnalysable(SPEC_DEUX_TOURS), PARAMETRES, null);
    for (const document of [SANS_PREMIER, AVEC_PREMIER, deuxTours]) expect(JSON.stringify(document)).not.toMatch(/infirm/i);
  });
});
