/**
 * Les analyses exploratoires préannoncées dans `metriques.json` (`analysis/analyse-du-run.ts`,
 * section `exploratoire`) :
 *
 * - §2 : « Analyse exploratoire annoncée : corrélation […] calculée pour chaque couple outil × mode
 *   comparé : c'est le coefficient de rang de Spearman […] ; les candidats sous ce seuil n'y entrent
 *   pas, ni un candidat dont l'exactitude n'est pas définie dans le couple […]. Les ex aequo reçoivent
 *   leur rang moyen. Elle est publiée sans intervalle, avec l'étiquette « exploratoire ». Sous trois
 *   candidats, comptés après ces deux exclusions, elle n'est pas calculée, et le motif est publié. »
 * - §3, « Entre les deux tours » : « La corrélation exploratoire de la section 2, qui n'est pas
 *   calculée sous trois candidats, est publiée « sans objet » avec ce motif. »
 * - §6, QR8 : l'écart API / application, apparié par question sur le sous-échantillon, API dans le
 *   mode de tête, neutre échantillon 1, les deux saisies des testeurs dans la grappe de la question,
 *   graine dérivée de la clé `<outil>:api-application` (§8).
 */

import { describe, expect, it } from "vitest";
import { analyserRun, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { graineHexadecimale } from "../../analysis/graines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { entreesDuRunAnalysable, SPEC_APPLICATION, SPEC_REFERENCE, type SpecRun } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 40, permutations: 20 };

type Json = Record<string, unknown>;

interface CorrelationJson {
  readonly outil_id: string;
  readonly mode: string;
  readonly exploratoire: boolean;
  readonly points: readonly { candidat_id: string; taux_erreur: { numerateur: number; denominateur: number }; items_p_verifies: number }[];
  readonly candidats_sans_exactitude: readonly string[];
  readonly coefficient: number | null;
  readonly motif_absence: string | null;
}

interface DifferenceJson {
  readonly cle: readonly string[];
  readonly graine: string;
  readonly taux_a: { numerateur: number; denominateur: number };
  readonly taux_b: { numerateur: number; denominateur: number };
  readonly difference: number | null;
}

interface EcartJson {
  readonly outil_id: string;
  readonly mode_de_tete: string;
  readonly exploratoire: boolean;
  readonly questions_appariees: number;
  readonly questions_exclues: readonly string[];
  readonly difference: DifferenceJson;
}

function analyser(entrees: EntreesDuRun): Json {
  return valider<Json>("metriques", analyserRun(entrees, PARAMETRES, null), "metriques.json de test");
}

function exploratoire(document: Json): Json {
  return document["exploratoire"] as Json;
}

function correlations(document: Json): readonly CorrelationJson[] {
  const section = exploratoire(document)["correlation_couverture"] as Json;
  expect(section["statut"]).toBe("calcule");
  return section["couples"] as CorrelationJson[];
}

function ecarts(document: Json): Json {
  const section = exploratoire(document)["ecart_api_application"] as Json;
  expect(section["statut"]).toBe("calcule");
  return section;
}

/** Un outil, un mode : la corrélation porte sur un seul couple. */
const UN_OUTIL: SpecRun["outils"] = [{ outil_id: "outil-alpha", modes: ["web_desactivee"] }];

/**
 * Quatre candidats comparés, 10, 20, 30 et 40 items P vérifiés au gel. Taux d'erreur : c1 et c3 à 0
 * (ex aequo, rang moyen 1,5), c4 à 1/2 (rang 3), c2 à 1 (rang 4). Rangs des items : 1, 2, 3, 4.
 * Pearson des rangs (1,5 ; 4 ; 1,5 ; 3) et (1 ; 2 ; 3 ; 4) : covariance 1, variances 4,5 et 5,
 * coefficient 1 / √22,5.
 */
const SPEC_EX_AEQUO: SpecRun = {
  candidats: [
    { id: "c1", sous_seuil: false, items_p: 2, items_f: 0, items_p_verifies: 10 },
    { id: "c2", sous_seuil: false, items_p: 2, items_f: 0, items_p_verifies: 20 },
    { id: "c3", sous_seuil: false, items_p: 2, items_f: 0, items_p_verifies: 30 },
    { id: "c4", sous_seuil: false, items_p: 2, items_f: 0, items_p_verifies: 40 },
    { id: "c-bas", sous_seuil: true, items_p: 2, items_f: 0, items_p_verifies: 3 },
  ],
  outils: UN_OUTIL,
  categorie: (c) => {
    if (c.candidat_id === "c2" || c.candidat_id === "c-bas") return "inexacte";
    if (c.candidat_id === "c4") return c.rang === 0 ? "exacte" : "inexacte";
    return "exacte";
  },
};

describe("corrélation de Spearman couverture / erreur (§2)", () => {
  it("ex aequo : rang moyen, coefficient 1/√22,5, sans intervalle, étiqueté exploratoire ; le candidat sous le seuil n'y entre pas", () => {
    const [couple, ...autres] = correlations(analyser(entreesDuRunAnalysable(SPEC_EX_AEQUO)));
    expect(autres).toEqual([]);
    expect(couple).toMatchObject({ outil_id: "outil-alpha", mode: "web_desactivee", exploratoire: true, motif_absence: null, candidats_sans_exactitude: [] });
    expect(couple?.points.map((p) => [p.candidat_id, p.taux_erreur.numerateur, p.taux_erreur.denominateur, p.items_p_verifies])).toEqual([
      ["c1", 0, 12, 10],
      ["c2", 12, 12, 20],
      ["c3", 0, 12, 30],
      ["c4", 6, 12, 40],
    ]);
    expect(couple?.coefficient).toBeCloseTo(1 / Math.sqrt(22.5), 12);
    expect(Object.keys(couple ?? {})).not.toContain("intervalle");
  });

  it("candidat d'exactitude indéfinie (aucune réponse classée) : exclu et nommé, puis moins de trois candidats, motif publié", () => {
    const spec: SpecRun = {
      ...SPEC_EX_AEQUO,
      candidats: SPEC_EX_AEQUO.candidats.filter((c) => c.id !== "c4"),
      categorie: (c) => (c.candidat_id === "c3" ? "non_reponse" : SPEC_EX_AEQUO.categorie(c)),
    };
    const [couple] = correlations(analyser(entreesDuRunAnalysable(spec)));
    expect(couple?.candidats_sans_exactitude).toEqual(["c3"]);
    expect(couple?.points.map((p) => p.candidat_id)).toEqual(["c1", "c2"]);
    expect(couple?.coefficient).toBeNull();
    expect(couple?.motif_absence).toBe("moins_de_trois_candidats");
  });

  it("moins de trois candidats comparés : chaque couple comparé publie le motif, aucun coefficient", () => {
    const document = analyser(entreesDuRunAnalysable(SPEC_REFERENCE));
    const liste = correlations(document);
    expect(liste.length).toBe(4);
    for (const c of liste) {
      expect(c.coefficient).toBeNull();
      expect(c.motif_absence).toBe("moins_de_trois_candidats");
      expect(c.exploratoire).toBe(true);
    }
    const section = exploratoire(document)["correlation_couverture"] as Json;
    expect(section["couples_incomplets"]).toEqual([{ outil_id: "outil-gamma", mode: "web_activee" }]);
  });

  it("régime entre_deux_tours : la corrélation est sans objet, avec le motif moins_de_trois_candidats (§3)", () => {
    const spec: SpecRun = { ...SPEC_EX_AEQUO, run: { regime_inclusion: "entre_deux_tours" } };
    const section = exploratoire(analyser(entreesDuRunAnalysable(spec)))["correlation_couverture"];
    expect(section).toEqual({ statut: "sans_objet", motif: "moins_de_trois_candidats" });
  });

  it("aucun couple comparé : la corrélation est sans objet (aucun_couple_compare)", () => {
    const spec: SpecRun = { ...SPEC_EX_AEQUO, manquante: (c) => c.registre !== "neutre" };
    const section = exploratoire(analyser(entreesDuRunAnalysable(spec)))["correlation_couverture"];
    expect(section).toEqual({ statut: "sans_objet", motif: "aucun_couple_compare" });
  });
});

/** `SPEC_APPLICATION` (run-analysable.ts) : son commentaire pose les effectifs attendus ici. */
describe("écart API / application (§6, QR8)", () => {
  const document = analyser(entreesDuRunAnalysable(SPEC_APPLICATION));
  const section = ecarts(document);
  const [ecart, ...autres] = section["par_outil"] as EcartJson[];

  it("API dans le mode de tête, neutre échantillon 1, moins l'application ; apparié par question ; étiqueté exploratoire", () => {
    expect(autres).toEqual([]);
    expect(ecart).toMatchObject({ outil_id: "outil-alpha", mode_de_tete: "web_desactivee", exploratoire: true, questions_appariees: 4, questions_exclues: [] });
    // API : quatre questions, une inexacte (candidat-b rang 1) → 3/4.
    expect(ecart?.difference.taux_a).toMatchObject({ numerateur: 3, denominateur: 4 });
    // Application : sept saisies (t2 n'a pas saisi candidat-b rang 1), deux inexactes → 5/7.
    expect(ecart?.difference.taux_b).toMatchObject({ numerateur: 5, denominateur: 7 });
    expect(ecart?.difference.difference).toBeCloseTo(3 / 4 - 5 / 7, 12);
    expect(section["outils_exclus"]).toEqual([]);
  });

  it("question saisie par un seul des deux testeurs : une observation, la question reste appariée", () => {
    expect(ecart?.questions_appariees).toBe(4);
    expect(ecart?.difference.taux_b.denominateur).toBe(7);
  });

  it("outil interrogé par l'API mais sans aucune réponse de l'application : nommé, sans chiffre", () => {
    expect(section["outils_sans_reponse_application"]).toEqual(["outil-beta"]);
  });

  it("graine dérivée de la clé bootstrap / exactitude / global / <outil>:api-application, relevée dans graines[]", () => {
    const cle = ["bootstrap", "exactitude", "global", "outil-alpha:api-application"];
    expect(ecart?.difference.cle).toEqual(cle);
    expect(ecart?.difference.graine).toBe(graineHexadecimale(20261203, cle));
    expect(document["graines"]).toContainEqual({ cle, graine: graineHexadecimale(20261203, cle) });
  });

  it("aucune réponse de l'application dans le run : section sans objet, motif aucune_reponse_application", () => {
    const sansApplication = analyser(entreesDuRunAnalysable(SPEC_REFERENCE));
    expect(exploratoire(sansApplication)["ecart_api_application"]).toEqual({ statut: "sans_objet", motif: "aucune_reponse_application" });
  });

  it("couple de tête « run incomplet » : l'outil est exclu, motif run_incomplet, sans chiffre", () => {
    const spec: SpecRun = { ...SPEC_APPLICATION, manquante: (c) => c.outil_id === "outil-alpha" && c.mode === "web_desactivee" && c.registre !== "neutre" };
    const incomplet = ecarts(analyser(entreesDuRunAnalysable(spec)));
    expect(incomplet["par_outil"]).toEqual([]);
    expect(incomplet["outils_exclus"]).toEqual([{ outil_id: "outil-alpha", mode_de_tete: "web_desactivee", motif: "run_incomplet" }]);
  });

  it("des réponses de l'application sans sous-échantillon lu : refus, jamais un écart sur des questions devinées", () => {
    const entrees = { ...entreesDuRunAnalysable(SPEC_APPLICATION), questions_sous_echantillon: null };
    expect(() => analyserRun(entrees, PARAMETRES, null)).toThrow(/sous-échantillon/);
  });
});

describe("déterminisme à l'octet", () => {
  it("deux analyses du même run, et du même run aux fichiers lus dans l'ordre inverse, donnent la même section exploratoire", () => {
    const entrees = entreesDuRunAnalysable(SPEC_APPLICATION);
    const premier = JSON.stringify(analyserRun(entrees, PARAMETRES, null));
    expect(JSON.stringify(analyserRun(entreesDuRunAnalysable(SPEC_APPLICATION), PARAMETRES, null))).toBe(premier);
    const inverse = { ...entrees, reponses: [...entrees.reponses].reverse(), verdicts: [...entrees.verdicts].reverse() };
    const section = (texte: string) => JSON.stringify((JSON.parse(texte) as Json)["exploratoire"]);
    expect(section(JSON.stringify(analyserRun(inverse, PARAMETRES, null)))).toBe(section(premier));
  });
});
