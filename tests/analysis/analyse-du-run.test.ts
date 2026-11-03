/**
 * `analysis/analyse-du-run.ts` (sous-lot A de `pnpm analyze`, docs/DETTE.md 2026-11-02 n° 1) : un seul
 * partage de la population, porté par le contexte du run, vu à l'identique par le calcul principal,
 * les quatre recalculs de robustesse, l'asymétrie et les hypothèses (§8 : « Chaque recalcul garde le
 * partage des couples outil × mode et des candidats du calcul principal »).
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { analyserRun, validerEtEcrire } from "../../analysis/analyse-du-run.ts";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 40, permutations: 40 };

type Json = Record<string, unknown>;
interface CoupleJson { readonly outil_id: string; readonly mode: string }
interface TauxPublieJson { readonly metrique: string; readonly strate: string; readonly taux: { numerateur: number; denominateur: number; valeur?: number }; readonly motif_absence: string | null; readonly intervalle: { intervalle: { bas: number; haut: number; nombre_grappes: number } | null; raison_sans_intervalle: string | null }; readonly taux_degenere: string | null }
interface TauxDuCoupleJson { readonly couple: CoupleJson; readonly taux: readonly TauxPublieJson[] }

const DOCUMENT = analyserRun(entreesDuRunAnalysable(SPEC_REFERENCE), PARAMETRES, null) as Json;

function section(chemin: readonly string[]): Json {
  let courant: unknown = DOCUMENT;
  for (const cle of chemin) courant = (courant as Json)[cle];
  return courant as Json;
}

const cle = (c: CoupleJson): string => `${c.outil_id}/${c.mode}`;
const tauxPrincipaux = (): readonly TauxDuCoupleJson[] => section(["taux"])["couples"] as TauxDuCoupleJson[];
const recalculs = (): readonly { recalcul: string; couples: readonly TauxDuCoupleJson[] }[] =>
  section(["robustesse", "taux"])["recalculs"] as { recalcul: string; couples: TauxDuCoupleJson[] }[];

function taux(couples: readonly TauxDuCoupleJson[], couple: string, metrique: string, strate = "global"): TauxPublieJson {
  const trouve = couples.find((c) => cle(c.couple) === couple)?.taux.find((t) => t.metrique === metrique && t.strate === strate);
  if (trouve === undefined) throw new Error(`taux ${couple} ${metrique} ${strate} absent`);
  return trouve;
}

const COMPARES = ["outil-alpha/web_activee", "outil-alpha/web_desactivee", "outil-beta/web_desactivee", "outil-gamma/web_desactivee"];
const INCOMPLET = "outil-gamma/web_activee";

describe("analyserRun : document conforme", () => {
  it("le document est conforme à schema/metriques.schema.json", () => {
    expect(() => valider("metriques", DOCUMENT, "document de test")).not.toThrow();
  });
});

describe("population identique de bout en bout", () => {
  it("le calcul principal, les quatre recalculs, l'asymétrie et H1 voient les mêmes couples, candidats et strates", () => {
    const population = section(["population"]);
    const compares = (population["couples_compares"] as CoupleJson[]).map(cle).sort();
    expect(compares).toEqual(COMPARES);
    const strates = population["strates"] as { candidats: string[]; themes: string[]; gabarits: string[]; registres: string[] };
    const strateAttendue = [
      "global",
      ...strates.candidats.map((c) => `candidat:${c}`),
      ...strates.themes.map((t) => `theme:${t}`),
      ...strates.gabarits.map((g) => `gabarit:${g}`),
      ...strates.registres.map((r) => `registre:${r}`),
    ];
    const vues = [tauxPrincipaux(), ...recalculs().map((r) => r.couples)];
    expect(recalculs().map((r) => r.recalcul)).toEqual(["echantillon_humain", "items_contestes", "formulations_orientees", "reponses_tronquees"]);
    for (const couples of vues) {
      expect(couples.map((c) => cle(c.couple)).sort()).toEqual(COMPARES);
      for (const c of couples) expect([...new Set(c.taux.map((t) => t.strate))]).toEqual(strateAttendue);
    }
    const asymetrie = section(["asymetrie"])["couples"] as { couple: CoupleJson }[];
    expect(asymetrie.map((a) => cle(a.couple)).sort()).toEqual(COMPARES);
    const h1 = section(["hypotheses", "H1"])["outils"] as { couples: { cle: string; etat: string }[] }[];
    expect(h1.flatMap((o) => o.couples.filter((c) => c.etat !== "incomplet").map((c) => c.cle)).sort()).toEqual(COMPARES);
    expect(population["candidats_compares"]).toEqual(["candidat-a", "candidat-b"]);
    expect(strates.candidats).toEqual(["candidat-a", "candidat-b"]);
  });

  it("un recalcul qui vide une strate la garde, publiée absente (strate_vide), sans réappliquer de seuil", () => {
    const sansOrientees = recalculs().find((r) => r.recalcul === "formulations_orientees");
    const t = taux(sansOrientees?.couples ?? [], "outil-alpha/web_activee", "exactitude", "registre:oriente");
    expect(t.taux.denominateur).toBe(0);
    expect(t.motif_absence).toBe("strate_vide");
  });
});

describe("run incomplet", () => {
  it("le couple est absent des taux, des conditions, de la famille de Holm et des recalculs, et H1 le marque", () => {
    expect((section(["population"])["couples_incomplets"] as CoupleJson[]).map(cle)).toEqual([INCOMPLET]);
    expect(tauxPrincipaux().map((c) => cle(c.couple))).not.toContain(INCOMPLET);
    for (const r of recalculs()) expect(r.couples.map((c) => cle(c.couple))).not.toContain(INCOMPLET);
    const asymetrie = section(["asymetrie"]);
    expect((asymetrie["couples"] as { couple: CoupleJson }[]).map((a) => cle(a.couple))).not.toContain(INCOMPLET);
    expect(asymetrie["couples_incomplets"]).toEqual([INCOMPLET]);
    const strates = section(["conditions"])["strates"] as { modes: { comparaisons: { cle: string }[]; paires_exclues: { cle: string; couples_incomplets: string[] }[] } }[];
    for (const s of strates) {
      expect(s.modes.comparaisons.map((c) => c.cle)).not.toContain("outil-gamma:web_activee-web_desactivee");
    }
    expect(strates[0]?.modes.paires_exclues).toEqual([{ cle: "outil-gamma:web_activee-web_desactivee", couples_incomplets: [INCOMPLET] }]);
    const gamma = (section(["hypotheses", "H1"])["outils"] as { outil_id: string; couples: { cle: string; etat: string }[] }[]).find((o) => o.outil_id === "outil-gamma");
    expect(gamma?.couples).toContainEqual({ cle: INCOMPLET, etat: "incomplet", borne_inferieure: null, borne_strictement_positive: false });
    const h2 = (section(["hypotheses", "H2"])["outils"] as { outil_id: string; verdict: string; global: { statut: string } }[]).find((o) => o.outil_id === "outil-gamma");
    expect(h2).toMatchObject({ verdict: "sans_objet", global: { statut: "exclue" } });
  });

  it("la variabilité entre échantillons (§8, D70 (12)) est publiée pour chaque couple comparé, et pour eux seuls", () => {
    const variabilite = section(["variabilite_echantillons"]);
    expect(variabilite["statut"]).toBe("calcule");
    const couples = variabilite["couples"] as { couple: CoupleJson; paires_prevues: number; paires_comparables: number; paires_ecartees: Record<string, number> }[];
    expect(couples.map((v) => cle(v.couple))).toEqual(COMPARES);
    // Le run en mémoire interroge deux échantillons par question (§6) et note les deux à l'identique :
    // toute paire dont les deux échantillons sont obtenus est comparable et concordante, accord 1.
    for (const v of couples) {
      expect(v.paires_comparables).toBeGreaterThan(0);
      expect(v).toMatchObject({ accord: 1, paires_concordantes: v.paires_comparables });
    }
    // Une paire par question × formulation, au plan : douze items (sous le seuil compris), trois formulations.
    expect(couples.map((v) => v.paires_prevues)).toEqual([36, 36, 36, 36]);
    // outil-alpha / web_desactivee : la réponse manquante de estManquanteAlpha manque aux deux échantillons.
    const alpha = couples.find((v) => cle(v.couple) === "outil-alpha/web_desactivee");
    expect(alpha).toMatchObject({ paires_comparables: 35, paires_ecartees: { aucun_echantillon_obtenu: 1, un_seul_echantillon_obtenu: 0 } });
  });
});

describe("couple sans objet", () => {
  it("un outil à un seul mode est publié sans objet pour H2, sans comparaison de modes", () => {
    const h2 = (section(["hypotheses", "H2"])["outils"] as { outil_id: string; verdict: string; global: { statut: string }; moins_de_60_jours: { statut: string } }[]).find(
      (o) => o.outil_id === "outil-beta",
    );
    expect(h2).toEqual({ outil_id: "outil-beta", verdict: "sans_objet", global: { statut: "absente" }, moins_de_60_jours: { statut: "absente" } });
    expect(section(["hypotheses", "H5"])).toEqual({ statut: "sans_objet", motif: "premier_run_absent" });
  });
});

describe("candidat sous seuil", () => {
  it("n'a de strate dans aucun calcul, principal ou recalcul, et il est rapporté à part", () => {
    expect(section(["population"])["candidats_rapportes_a_part"]).toEqual(["candidat-bas"]);
    for (const couples of [tauxPrincipaux(), ...recalculs().map((r) => r.couples)]) {
      for (const c of couples) expect(c.taux.map((t) => t.strate)).not.toContain("candidat:candidat-bas");
    }
    const tests = (section(["asymetrie"])["couples"] as { test: { statut: string; candidats_rapportes_a_part?: string[]; candidats?: { candidat_id: string }[] } }[]).map((c) => c.test);
    expect(tests.map((t) => t.statut)).toEqual(["calcule", "calcule", "calcule", "calcule"]);
    for (const test of tests) {
      expect(test.candidats_rapportes_a_part).toEqual(["candidat-bas"]);
      expect(test.candidats?.map((c) => c.candidat_id)).toEqual(["candidat-a", "candidat-b"]);
    }
  });
});

describe("réponse manquante", () => {
  it("sort de tous les dénominateurs ; elle est comptée dans les entrées", () => {
    // outil-alpha / web_desactivee : 12 items × 3 formulations × 2 échantillons = 72 requêtes, une
    // requête manquante à ses deux échantillons.
    expect(taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "non_reponse").taux.denominateur).toBe(70);
    expect(taux(tauxPrincipaux(), "outil-alpha/web_activee", "non_reponse").taux.denominateur).toBe(72);
    expect(section(["entrees"])).toMatchObject({ reponses_lues: 360, reponses_manquantes: 50, reponses_obtenues: 310 });
  });
});

describe("zéro observé", () => {
  it("0/n donne un taux de 0 avec son intervalle ; 0/0 donne un taux absent avec son motif", () => {
    const fabrication = taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "fabrication");
    expect(fabrication.taux).toEqual({ numerateur: 0, denominateur: 12, valeur: 0 });
    expect(fabrication.motif_absence).toBeNull();
    expect(fabrication.intervalle.intervalle).toMatchObject({ bas: 0, haut: 0 });
    const obsolescence = taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "obsolescence");
    expect(obsolescence.taux).toEqual({ numerateur: 0, denominateur: 0 });
    expect(obsolescence.motif_absence).toBe("denominateur_nul");
    expect(obsolescence.intervalle).toMatchObject({ intervalle: null, raison_sans_intervalle: "aucun_reechantillon_defini" });
  });

  it("publie la mention du taux dégénéré à côté de l'intervalle, avec son nombre de grappes (§8, 0.27 et 0.28)", () => {
    // « aucun événement observé sur n grappes » : fabrication 0/12 ; « aucun non-événement observé
    // sur n grappes » : candidat-a, jamais inexact. 0/0 n'a pas de mention, il a son motif d'absence.
    const fabrication = taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "fabrication");
    expect(fabrication.taux_degenere).toBe("aucun_evenement");
    expect(fabrication.intervalle.intervalle?.nombre_grappes).toBeGreaterThan(1);
    const candidatA = taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "exactitude", "candidat:candidat-a");
    expect(candidatA.taux.numerateur).toBe(candidatA.taux.denominateur);
    expect(candidatA.taux_degenere).toBe("aucun_non_evenement");
    expect(candidatA.intervalle.intervalle).toMatchObject({ bas: 1, haut: 1, nombre_grappes: 5 });
    expect(taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "obsolescence").taux_degenere).toBeNull();
    expect(taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "exactitude").taux_degenere).toBeNull();
    // L'exactitude de chaque candidat du test d'asymétrie porte la même mention.
    const asymetrie = section(["asymetrie"])["couples"] as { couple: CoupleJson; test: { candidats: { candidat_id: string; taux_degenere: string | null }[] } }[];
    const alpha = asymetrie.find((c) => cle(c.couple) === "outil-alpha/web_desactivee");
    expect(alpha?.test.candidats).toEqual([
      expect.objectContaining({ candidat_id: "candidat-a", taux_degenere: "aucun_non_evenement" }),
      expect.objectContaining({ candidat_id: "candidat-b", taux_degenere: null }),
    ]);
  });
});

describe("graines", () => {
  it("chaque clé publiée figure une fois dans graines, triée ; les recalculs n'en ajoutent aucune", () => {
    const graines = DOCUMENT["graines"] as { cle: string[]; graine: string }[];
    const cles = graines.map((g) => g.cle.join("\0"));
    expect(new Set(cles).size).toBe(cles.length);
    expect([...cles].sort()).toEqual(cles);
    const fabrication = taux(tauxPrincipaux(), "outil-alpha/web_desactivee", "fabrication");
    expect(cles).toContain(["bootstrap", "outil-alpha", "web_desactivee", "fabrication", "global"].join("\0"));
    expect(fabrication.intervalle).toMatchObject({ cle: ["bootstrap", "outil-alpha", "web_desactivee", "fabrication", "global"] });
    expect(cles).toContain(["permutation", "outil-alpha", "web_desactivee"].join("\0"));
    expect(cles).toContain(["bootstrap", "exactitude", "recents:60j", "outil-alpha:web_activee-web_desactivee"].join("\0"));
  });
});

describe("validerEtEcrire : schéma invalide en sortie", () => {
  const repertoire = mkdtempSync(join(tmpdir(), "banc-metriques-schema-"));
  afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

  it("un document non conforme est refusé avant toute écriture", () => {
    const chemin = join(repertoire, "metriques", "metriques.json");
    const { graines: _graines, ...sansGraines } = DOCUMENT;
    expect(() => validerEtEcrire(chemin, sansGraines)).toThrow(ErreurSchema);
    expect(existsSync(chemin)).toBe(false);
    expect(existsSync(join(repertoire, "metriques"))).toBe(false);
  });
});
