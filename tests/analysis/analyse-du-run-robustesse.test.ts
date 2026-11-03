/**
 * `pnpm analyze`, sous-lot B : la robustesse des différences (§8, « Analyses de robustesse
 * préenregistrées », protocole 0.30 ; D69), de bout en bout sur des runs en mémoire
 * (`run-analysable.ts`). La règle elle-même est éprouvée par `robustesse-differences.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { analyserRun } from "../../analysis/analyse-du-run.ts";
import type { CategorieRetenue } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE, type ContexteReponse, type SpecRun } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 40, permutations: 40 };

type Json = Record<string, unknown>;
interface DifferenceJson { readonly cle: readonly string[]; readonly qualificatif: string | null }
interface RecalculJson { readonly recalcul: string; readonly statut: string; readonly motif?: string; readonly difference?: DifferenceJson }
interface ResultatJson {
  readonly famille: string;
  readonly strate: string;
  readonly comparaison: string;
  readonly cle: readonly string[];
  readonly graine: string;
  readonly recalculs: readonly RecalculJson[];
  readonly fragile: boolean;
  readonly motifs_fragilite: readonly string[];
}

/**
 * Deux outils à deux modes. outil-y est bien plus exact web activée que web désactivée, sur
 * assez d'items pour que la différence survive aux quatre recalculs. outil-x se trompe en
 * formulation orientée (H3 et paires avec l'orientée établies) et toutes ses réponses web activée
 * sont tronquées : sans elles, le recalcul (d) n'a plus de bras web activée.
 */
const SPEC_ETABLIES: SpecRun = {
  candidats: [
    { id: "candidat-a", sous_seuil: false, items_p: 8, items_f: 4 },
    { id: "candidat-b", sous_seuil: false, items_p: 8, items_f: 4 },
  ],
  outils: [
    { outil_id: "outil-x", modes: ["web_desactivee", "web_activee"] },
    { outil_id: "outil-y", modes: ["web_desactivee", "web_activee"] },
  ],
  categorie: (c) => (c.outil_id === "outil-y" ? categorieY(c) : categorieX(c)),
  tronquee: (c) => c.outil_id === "outil-x" && c.mode === "web_activee",
};

/** Exacte sur un item de rang multiple de quatre seulement : un quart d'exactes. */
function rarementExacte(c: ContexteReponse): CategorieRetenue {
  return c.rang % 4 === 0 ? "exacte" : "inexacte";
}

/** outil-y : web activée, une inexacte sur huit ; web désactivée, une exacte sur quatre. */
function categorieY(c: ContexteReponse): CategorieRetenue {
  if (c.mode === "web_desactivee") return rarementExacte(c);
  return c.rang % 8 === 7 ? "inexacte" : "exacte";
}

/** outil-x : l'orientée et la web désactivée exactes une fois sur quatre ; la web activée, trois fois sur quatre. */
function categorieX(c: ContexteReponse): CategorieRetenue {
  if (c.registre === "oriente" || c.mode === "web_desactivee") return rarementExacte(c);
  return c.rang % 4 === 3 ? "inexacte" : "exacte";
}

const ENTREES = entreesDuRunAnalysable(SPEC_ETABLIES);
const DOCUMENT = analyserRun(ENTREES, PARAMETRES, null) as Json;

function differences(document: Json): Json {
  return (document["robustesse"] as Json)["differences"] as Json;
}

function resultats(document: Json): readonly ResultatJson[] {
  return differences(document)["resultats"] as ResultatJson[];
}

function resultat(famille: string, strate: string, comparaison: string, document: Json = DOCUMENT): ResultatJson {
  const trouve = resultats(document).find((r) => r.famille === famille && r.strate === strate && r.comparaison === comparaison);
  if (trouve === undefined) throw new Error(`robustesse : ${famille} ${strate} ${comparaison} absent`);
  return trouve;
}

function recalcul(r: ResultatJson, nom: string): RecalculJson {
  const trouve = r.recalculs.find((x) => x.recalcul === nom);
  if (trouve === undefined) throw new Error(`recalcul ${nom} absent de ${r.comparaison}`);
  return trouve;
}

/** Les différences publiées ailleurs dans le document, par clé de graine : conditions, puis H3. */
function differencesPrincipales(document: Json): Map<string, DifferenceJson> {
  const principales = new Map<string, DifferenceJson>();
  const strates = (document["conditions"] as Json)["strates"] as { modes: { comparaisons: { difference: DifferenceJson }[] }; formulations: { comparaisons: { difference: DifferenceJson }[] } }[];
  for (const s of strates) for (const c of [...s.modes.comparaisons, ...s.formulations.comparaisons]) principales.set(c.difference.cle.join("/"), c.difference);
  const h3 = ((document["hypotheses"] as Json)["H3"] as Json)["couples"] as { difference: DifferenceJson | null }[];
  for (const c of h3) if (c.difference !== null) principales.set(c.difference.cle.join("/"), c.difference);
  return principales;
}

describe("robustesse des différences : document conforme", () => {
  it("le document est conforme à schema/metriques.schema.json, section calculée", () => {
    expect(() => valider("metriques", DOCUMENT, "robustesse des différences")).not.toThrow();
    expect(differences(DOCUMENT)).toMatchObject({ statut: "calcule", tendance: { statut: "sans_objet", motif: "premier_run_absent" } });
  });
});

describe("quelles différences reçoivent un qualificatif (§8, D69)", () => {
  it("exactement les différences établies au calcul principal : aucune non établie, aucune oubliée", () => {
    const principales = differencesPrincipales(DOCUMENT);
    const etablies = [...principales].filter(([, d]) => d.qualificatif === "etablie").map(([cle]) => cle);
    expect(etablies.length).toBeGreaterThan(0);
    expect(resultats(DOCUMENT).map((r) => r.cle.join("/")).sort()).toEqual([...etablies].sort());
    // Une différence non établie au principal n'y figure pas : outil-x web désactivée, neutre contre orientée.
    expect(principales.get("bootstrap/exactitude/global/outil-x:web_desactivee:neutre-oriente")?.qualificatif).toBe("non_etablie");
    expect(resultats(DOCUMENT).map((r) => r.comparaison)).not.toContain("outil-x:web_desactivee:neutre-oriente");
  });

  it("les familles sont celles des résultats ; les différences exploratoires n'ont pas de qualificatif", () => {
    const familles = new Set(resultats(DOCUMENT).map((r) => r.famille));
    expect([...familles].sort()).toEqual(["formulations", "h3", "modes"]);
    for (const r of resultats(DOCUMENT)) expect(["modes", "formulations", "h3", "tendance"]).toContain(r.famille);
    // Ni écart API / application, ni écart juge-éditeur, ni Spearman : aucune clé qui les nomme.
    for (const r of resultats(DOCUMENT)) expect(r.cle.join("/")).not.toMatch(/api-application|editeur|spearman/);
  });

  it("chaque recalcul garde la clé et la graine du calcul principal, et n'ajoute aucune graine", () => {
    const graines = new Set((DOCUMENT["graines"] as { cle: string[] }[]).map((g) => g.cle.join("/")));
    for (const r of resultats(DOCUMENT)) {
      expect(graines.has(r.cle.join("/"))).toBe(true);
      for (const x of r.recalculs) if (x.difference !== undefined) expect(x.difference.cle).toEqual(r.cle);
    }
  });
});

describe("fragile ou non", () => {
  it("établie, et établie dans les quatre recalculs : non fragile (outil-y, modes, global)", () => {
    const r = resultat("modes", "global", "outil-y:web_activee-web_desactivee");
    expect(r.recalculs.map((x) => [x.recalcul, x.statut, x.difference?.qualificatif])).toEqual([
      ["echantillon_humain", "calcule", "etablie"],
      ["items_contestes", "calcule", "etablie"],
      ["formulations_orientees", "calcule", "etablie"],
      ["reponses_tronquees", "calcule", "etablie"],
    ]);
    expect(r).toMatchObject({ fragile: false, motifs_fragilite: [] });
  });

  it("incalculable en (d) : toutes les réponses web activée d'outil-x sont tronquées, la comparaison des modes ne se forme plus", () => {
    const r = resultat("modes", "global", "outil-x:web_activee-web_desactivee");
    expect(recalcul(r, "reponses_tronquees")).toEqual({ recalcul: "reponses_tronquees", statut: "incalculable", motif: "comparaison_absente" });
    expect(r).toMatchObject({ fragile: true, motifs_fragilite: ["reponses_tronquees"] });
  });

  it("établie qui ne l'est plus en (a) : la strate de moins de 60 jours d'outil-x, non établie sur l'échantillon humain", () => {
    const r = resultat("modes", "recents:60j", "outil-x:web_activee-web_desactivee");
    expect(recalcul(r, "echantillon_humain")).toMatchObject({ statut: "calcule", difference: { qualificatif: "non_etablie" } });
    expect(r.fragile).toBe(true);
    expect(r.motifs_fragilite[0]).toBe("echantillon_humain");
  });
});

describe("recalcul (c) sans objet (D69)", () => {
  it("H3, neutre moins orientée : (c) sans objet, jamais motif de fragilité", () => {
    const r = resultat("h3", "type_item:F+O", "outil-x:web_activee:neutre-oriente");
    expect(recalcul(r, "formulations_orientees")).toEqual({ recalcul: "formulations_orientees", statut: "sans_objet", motif: "registre_oriente_compare" });
    expect(r.motifs_fragilite).not.toContain("formulations_orientees");
  });

  it("paire de formulations neutre − orientée, et familière − orientée : (c) sans objet", () => {
    for (const comparaison of ["outil-x:web_activee:neutre-oriente", "outil-x:web_activee:familier-oriente"]) {
      const r = resultat("formulations", "global", comparaison);
      expect(recalcul(r, "formulations_orientees")).toMatchObject({ statut: "sans_objet" });
      expect(r.motifs_fragilite).not.toContain("formulations_orientees");
    }
  });

  it("une différence des modes reste soumise à (c), qui y est calculé", () => {
    expect(recalcul(resultat("modes", "global", "outil-y:web_activee-web_desactivee"), "formulations_orientees").statut).toBe("calcule");
  });
});

describe("aucun couple comparé", () => {
  it("la robustesse des différences est sans objet, comme celle des taux", () => {
    // Deux réponses sur trois manquent pour chaque couple : tous « run incomplet » (§8, seuil de 20 %).
    const spec: SpecRun = { ...SPEC_ETABLIES, manquante: (c: ContexteReponse) => c.registre !== "neutre" };
    const document = analyserRun(entreesDuRunAnalysable(spec), PARAMETRES, null) as Json;
    expect(differences(document)).toEqual({ statut: "sans_objet", motif: "aucun_couple_compare" });
    expect((document["robustesse"] as Json)["taux"]).toEqual({ statut: "sans_objet", motif: "aucun_couple_compare" });
    expect(() => valider("metriques", document, "aucun couple comparé")).not.toThrow();
  });
});

describe("tendance (H5)", () => {
  // Le premier run de analyse-du-run-h3-h5.test.ts : outil-alpha s'y trompe sur tous les items P.
  const SPEC_PREMIER: SpecRun = {
    ...SPEC_REFERENCE,
    run: { cle: "run-premier", date_gel: "2026-11-20T06:00:00+01:00" },
    categorie: (c: ContexteReponse) => (c.outil_id === "outil-alpha" && c.type === "P" ? "inexacte" : SPEC_REFERENCE.categorie(c)),
    manquante: (c: ContexteReponse) => c.outil_id === "outil-alpha" && c.mode === "web_activee" && c.registre !== "neutre",
  };
  const PREMIER = entreesDuRunAnalysable(SPEC_PREMIER);
  const AVEC_PREMIER = analyserRun(entreesDuRunAnalysable(SPEC_REFERENCE), PARAMETRES, PREMIER) as Json;

  it("avec un premier run, la tendance est lue ; sa différence établie est qualifiée, recalculée sur chaque run restreint", () => {
    expect(() => valider("metriques", AVEC_PREMIER, "avec premier")).not.toThrow();
    expect(differences(AVEC_PREMIER)["tendance"]).toEqual({ statut: "calcule", premier_run_id: PREMIER.run.id });
    const r = resultat("tendance", "global", "outil-alpha/web_desactivee", AVEC_PREMIER);
    expect(r.cle).toEqual(["bootstrap", "exactitude", "global", "outil-alpha", "web_desactivee"]);
    expect(r.recalculs.map((x) => x.statut)).toEqual(["calcule", "calcule", "calcule", "calcule"]);
    expect(r).toMatchObject({ fragile: false, motifs_fragilite: [] });
  });

  it("la tendance reprise par H5 est celle du calcul principal : même clé, même graine", () => {
    const h5 = ((AVEC_PREMIER["hypotheses"] as Json)["H5"] as Json)["outils"] as { couples: { cle: string; tendance: { cle: string[]; graine: string } | null }[] }[];
    const alpha = h5.flatMap((o) => o.couples).find((c) => c.cle === "outil-alpha/web_desactivee");
    const r = resultat("tendance", "global", "outil-alpha/web_desactivee", AVEC_PREMIER);
    expect(alpha?.tendance).toMatchObject({ cle: r.cle, graine: r.graine });
  });
});

describe("déterminisme", () => {
  it("même run, même graine : même document à l'octet près", () => {
    const deuxieme = analyserRun(entreesDuRunAnalysable(SPEC_ETABLIES), PARAMETRES, null);
    expect(JSON.stringify(deuxieme, null, 2)).toBe(JSON.stringify(DOCUMENT, null, 2));
  });
});
