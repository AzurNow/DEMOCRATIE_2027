/**
 * Fragilité des différences établies (§8, « Analyses de robustesse préenregistrées », protocole
 * 0.30 ; D69) : `robustesse.ts:fragiliteDesDifferences`, sur des familles fabriquées à la main dont
 * chaque recalcul est posé par le test. Le câblage sur un run (modes, formulations, H3, tendance)
 * est éprouvé de bout en bout par `analyse-du-run-robustesse.test.ts`.
 *
 * « Un résultat est fragile si, dans l'un des quatre recalculs, sa différence n'est plus établie ou
 * ne peut plus être calculée. Le recalcul (c) ne s'applique pas à une différence qui compare le
 * registre orienté lui-même […] ; pour ces différences, le recalcul (c) est publié « sans objet » et
 * ne rend pas le résultat fragile. »
 */

import { describe, expect, it } from "vitest";
import type { DifferenceTaux, MotifSansQualificatif, Qualificatif } from "../../analysis/bootstrap.ts";
import { fragiliteDesDifferences, RECALCULS, restrictions, type FamilleDeDifferences, type Recalcul } from "../../analysis/robustesse.ts";
import { taux } from "../../analysis/types.ts";
import { run } from "./fabriques.ts";

const CLE = ["bootstrap", "exactitude", "global", "outil-x:web_desactivee:neutre-oriente"];

function difference(qualificatif: Qualificatif | null, motif: MotifSansQualificatif | null = null, cle: readonly string[] = CLE): DifferenceTaux {
  const intervalle = { bas: 0.1, haut: 0.4, nombre_grappes: 8, reechantillonnages: 40, reechantillonnages_indefinis: 0, degenere: null };
  return {
    cle,
    graine: "0123456789abcdef",
    taux_a: taux(6, 8),
    taux_b: taux(3, 8),
    difference: 0.375,
    intervalle: qualificatif === "non_etablie" ? { ...intervalle, bas: -0.1 } : intervalle,
    qualificatif,
    motif_sans_qualificatif: qualificatif === null ? motif : null,
  };
}

type Recalculees = Partial<Record<Recalcul, DifferenceTaux>>;

/**
 * Une famille d'une seule comparaison `c1`, établie ou non au principal ; chaque recalcul rend ce
 * que le test pose, et une comparaison absente d'un recalcul ne s'y forme plus. Les appels de
 * `recalculer` sont relevés.
 */
function famille(principal: DifferenceTaux, recalculees: Recalculees, compare_le_registre_oriente = false) {
  const appels: Recalcul[] = [];
  const f: FamilleDeDifferences = {
    famille: "formulations",
    strate: "global",
    principales: [{ comparaison: "c1", difference: principal, compare_le_registre_oriente }],
    recalculer: (recalcul, comparaisons) => {
      appels.push(recalcul);
      expect([...comparaisons]).toEqual(["c1"]);
      const d = recalculees[recalcul];
      return new Map(d === undefined ? [] : [["c1", d]]);
    },
  };
  return { f, appels };
}

const TOUTES_ETABLIES: Recalculees = Object.fromEntries(RECALCULS.map((r) => [r, difference("etablie")]));

describe("fragiliteDesDifferences : quelles différences", () => {
  it("une différence non établie au calcul principal n'est pas un résultat : aucun qualificatif, aucun recalcul", () => {
    for (const principal of [difference("non_etablie"), difference(null, "taux_degenere"), difference(null, "grappe_unique")]) {
      const { f, appels } = famille(principal, TOUTES_ETABLIES);
      expect(fragiliteDesDifferences([f])).toEqual([]);
      expect(appels).toEqual([]);
    }
  });

  it("aucune famille (aucun couple comparé, ou aucune différence) : aucun résultat", () => {
    expect(fragiliteDesDifferences([])).toEqual([]);
  });

  it("RECALCULS suit l'ordre des restrictions, celui des taux recalculés", () => {
    expect(restrictions({ run: run(), notations: [] }).map((r) => r.recalcul)).toEqual([...RECALCULS]);
  });

  it("les recalculs sont faits dans l'ordre (a), (b), (c), (d), et publiés dans cet ordre", () => {
    const { f, appels } = famille(difference("etablie"), TOUTES_ETABLIES);
    const [resultat] = fragiliteDesDifferences([f]);
    expect(appels).toEqual(["echantillon_humain", "items_contestes", "formulations_orientees", "reponses_tronquees"]);
    expect(resultat?.recalculs.map((r) => r.recalcul)).toEqual(appels);
  });
});

describe("fragiliteDesDifferences : fragile ou non", () => {
  it("établie, et établie dans les quatre recalculs : non fragile, sans motif", () => {
    const { f } = famille(difference("etablie"), TOUTES_ETABLIES);
    expect(fragiliteDesDifferences([f])).toEqual([
      {
        famille: "formulations",
        strate: "global",
        comparaison: "c1",
        cle: CLE,
        graine: "0123456789abcdef",
        recalculs: RECALCULS.map((recalcul) => ({ recalcul, statut: "calcule", difference: difference("etablie") })),
        fragile: false,
        motifs_fragilite: [],
      },
    ]);
  });

  it("établie, plus établie en (a) : fragile, motif echantillon_humain, la différence recalculée est publiée", () => {
    const { f } = famille(difference("etablie"), { ...TOUTES_ETABLIES, echantillon_humain: difference("non_etablie") });
    const [resultat] = fragiliteDesDifferences([f]);
    expect(resultat).toMatchObject({ fragile: true, motifs_fragilite: ["echantillon_humain"] });
    expect(resultat?.recalculs[0]).toEqual({ recalcul: "echantillon_humain", statut: "calcule", difference: difference("non_etablie") });
  });

  it("un recalcul sans qualificatif (grappe unique, taux dégénéré, différence indéfinie) rend fragile : il ne confirme rien", () => {
    for (const motif of ["grappe_unique", "taux_degenere", "difference_indefinie", "sans_intervalle"] as const) {
      const { f } = famille(difference("etablie"), { ...TOUTES_ETABLIES, items_contestes: difference(null, motif) });
      expect(fragiliteDesDifferences([f])[0]).toMatchObject({ fragile: true, motifs_fragilite: ["items_contestes"] });
    }
  });

  it("incalculable en (d) (aucune réponse non tronquée : la comparaison ne se forme plus) : fragile, motif reponses_tronquees", () => {
    const { reponses_tronquees: _d, ...sansD } = TOUTES_ETABLIES;
    const { f } = famille(difference("etablie"), sansD);
    const [resultat] = fragiliteDesDifferences([f]);
    expect(resultat).toMatchObject({ fragile: true, motifs_fragilite: ["reponses_tronquees"] });
    expect(resultat?.recalculs[3]).toEqual({ recalcul: "reponses_tronquees", statut: "incalculable", motif: "comparaison_absente" });
  });

  it("plusieurs recalculs défaillants : tous nommés, dans l'ordre du §8", () => {
    const { reponses_tronquees: _d, ...sansD } = TOUTES_ETABLIES;
    const { f } = famille(difference("etablie"), { ...sansD, echantillon_humain: difference("non_etablie") });
    expect(fragiliteDesDifferences([f])[0]?.motifs_fragilite).toEqual(["echantillon_humain", "reponses_tronquees"]);
  });

  it("une différence établie de signe contraire au recalcul reste établie : le §8 ne lit que le qualificatif", () => {
    const inverse = { ...difference("etablie"), difference: -0.375, intervalle: { bas: -0.4, haut: -0.1, nombre_grappes: 8, reechantillonnages: 40, reechantillonnages_indefinis: 0, degenere: null } };
    const { f } = famille(difference("etablie"), { ...TOUTES_ETABLIES, reponses_tronquees: inverse });
    expect(fragiliteDesDifferences([f])[0]).toMatchObject({ fragile: false, motifs_fragilite: [] });
  });
});

describe("recalcul (c) sans objet (§8, D69)", () => {
  it("H3, neutre moins orientée : (c) publié sans objet, sans rendre fragile, même quand (c) n'aurait plus rien à comparer", () => {
    const { formulations_orientees: _c, ...sansC } = TOUTES_ETABLIES;
    const { f } = famille(difference("etablie"), sansC, true);
    const [resultat] = fragiliteDesDifferences([{ ...f, famille: "h3", strate: "type_item:F+O" }]);
    expect(resultat).toMatchObject({ famille: "h3", strate: "type_item:F+O", fragile: false, motifs_fragilite: [] });
    expect(resultat?.recalculs[2]).toEqual({ recalcul: "formulations_orientees", statut: "sans_objet", motif: "registre_oriente_compare" });
  });

  it("une paire de formulations avec l'orientée : (c) sans objet, mais (a) la rend encore fragile", () => {
    const { formulations_orientees: _c, ...sansC } = TOUTES_ETABLIES;
    const { f } = famille(difference("etablie"), { ...sansC, echantillon_humain: difference("non_etablie") }, true);
    const [resultat] = fragiliteDesDifferences([f]);
    expect(resultat).toMatchObject({ fragile: true, motifs_fragilite: ["echantillon_humain"] });
    expect(resultat?.recalculs[2]).toMatchObject({ statut: "sans_objet" });
  });

  it("une différence qui ne compare pas le registre orienté reste soumise à (c) : incalculable en (c), elle est fragile", () => {
    const { formulations_orientees: _c, ...sansC } = TOUTES_ETABLIES;
    const { f } = famille(difference("etablie"), sansC, false);
    expect(fragiliteDesDifferences([f])[0]).toMatchObject({ fragile: true, motifs_fragilite: ["formulations_orientees"] });
  });
});

describe("garde : un recalcul garde la clé du calcul principal", () => {
  it("une différence recalculée sous une autre clé est refusée (graine non reproductible)", () => {
    const autre = difference("etablie", null, ["bootstrap", "exactitude", "global", "autre"]);
    const { f } = famille(difference("etablie"), { ...TOUTES_ETABLIES, items_contestes: autre });
    expect(() => fragiliteDesDifferences([f])).toThrow(/clé/);
  });
});
