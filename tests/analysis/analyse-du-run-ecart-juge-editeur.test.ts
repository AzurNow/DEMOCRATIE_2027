/**
 * §7, « Conflit d'intérêts » (protocole 0.31, D73 (7)) : `pnpm analyze` calcule l'écart de chaque juge
 * sur l'outil de son propre éditeur à partir de la liste déclarée au gel et publiée dans
 * `run.json#/juges[]/outils_de_son_editeur`, jamais d'un paramètre de l'appelant ni d'une déduction.
 *
 * Cas limites : liste déclarée vide (écart publié absent, jamais 0) ; champ absent d'un run gelé
 * avant la 0.31 (section sans objet avec son motif, jamais une liste vide implicite) ; juge retiré
 * (ses notations sont écartées de tout le run, §7 : la comparaison de deux juges n'existe plus).
 */

import { describe, expect, it } from "vitest";
import { analyserRun, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { exactitude } from "../../analysis/metriques.ts";
import type { Reponse, Taux } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { renvoiDefaillant } from "../notation/fabriques.ts";
import { avecNotesDeJuges, entreesDuRunAnalysable, SPEC_APPLICATION, SPEC_REFERENCE, type JugeDuRunAnalysable } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 40, permutations: 40 };

/** juge-1 indulgent sur outil-alpha (exacte partout), conforme au verdict ailleurs ; juge-2 conforme au verdict. */
function indulgentSurAlpha(juges: readonly JugeDuRunAnalysable[]): EntreesDuRun {
  return avecNotesDeJuges(entreesDuRunAnalysable(SPEC_REFERENCE), juges, (retenue, outil_id, juge_id) =>
    juge_id === "juge-1" && outil_id === "outil-alpha" ? "exacte" : retenue,
  );
}

function section(entrees: EntreesDuRun): Record<string, unknown> {
  const document = valider<Record<string, unknown>>("metriques", analyserRun(entrees, PARAMETRES, null), "metriques.json de test");
  return document["ecart_juge_editeur"] as Record<string, unknown>;
}

describe("D73 (7) : écart juge-éditeur lu de la liste déclarée dans run.json", () => {
  it("liste déclarée : l'écart du juge sur l'outil de son éditeur est calculé, sous la clé <juge>:propre-editeur", () => {
    const entrees = indulgentSurAlpha([
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
      { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
    ]);
    const document = analyserRun(entrees, PARAMETRES, null) as { ecart_juge_editeur: Record<string, unknown>; graines: { cle: string[] }[] };
    const ecart = document.ecart_juge_editeur as {
      statut: string;
      par_juge: { juge_id: string; outils_de_son_editeur: string[]; difference: number | null; motif_absence: string | null; intervalle: { cle: string[] } | null }[];
      juges_sans_outil_de_leur_editeur: string[];
    };
    expect(ecart.statut).toBe("calcule");
    expect(ecart.par_juge.map((j) => [j.juge_id, j.outils_de_son_editeur, j.motif_absence])).toEqual([["juge-1", ["outil-alpha"], null]]);
    // juge-1 est plus indulgent que juge-2 sur outil-alpha seulement : la différence est strictement positive.
    expect(ecart.par_juge[0]?.difference).toBeGreaterThan(0);
    expect(ecart.par_juge[0]?.intervalle?.cle).toEqual(["bootstrap", "exactitude", "global", "juge-1:propre-editeur"]);
    expect(document.graines.map((g) => g.cle.join("/"))).toContain("bootstrap/exactitude/global/juge-1:propre-editeur");
    expect(() => valider("metriques", document, "metriques.json de test")).not.toThrow();
  });

  it("liste déclarée vide pour les deux juges : aucun écart publié, chaque juge nommé sans outil de son éditeur, jamais 0", () => {
    const ecart = section(indulgentSurAlpha([
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: [] },
      { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
    ]));
    expect(ecart).toMatchObject({ statut: "calcule", par_juge: [], juges_sans_outil_de_leur_editeur: ["juge-1", "juge-2"] });
    expect(JSON.stringify(ecart)).not.toContain("difference");
  });

  it("liste vide pour un seul juge : il est nommé sans outil de son éditeur, sans chiffre ; l'autre est calculé", () => {
    const ecart = section(indulgentSurAlpha([
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
      { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
    ])) as { par_juge: { juge_id: string }[]; juges_sans_outil_de_leur_editeur: string[] };
    expect(ecart.par_juge.map((j) => j.juge_id)).toEqual(["juge-1"]);
    expect(ecart.juges_sans_outil_de_leur_editeur).toEqual(["juge-2"]);
  });

  it("champ absent de run.json (run gelé avant la 0.31) : section sans objet, motif outils_de_son_editeur_non_declares, jamais une liste vide implicite", () => {
    const ecart = section(indulgentSurAlpha([
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
      { juge_id: "juge-2", retire: false },
    ]));
    expect(ecart).toEqual({ statut: "sans_objet", motif: "outils_de_son_editeur_non_declares" });
  });

  it("champ absent des deux juges : même motif", () => {
    const ecart = section(indulgentSurAlpha([
      { juge_id: "juge-1", retire: false },
      { juge_id: "juge-2", retire: false },
    ]));
    expect(ecart).toEqual({ statut: "sans_objet", motif: "outils_de_son_editeur_non_declares" });
  });

  it("juge retiré (§7 : ses notations sont écartées de tout le run) : section sans objet, motif juge_retire", () => {
    const ecart = section(indulgentSurAlpha([
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
      { juge_id: "juge-2", retire: true, outils_de_son_editeur: [] },
    ]));
    expect(ecart).toEqual({ statut: "sans_objet", motif: "juge_retire" });
  });

  it("le run de référence, sans notes de juge ni liste déclarée, reste analysable : motif visible", () => {
    const ecart = section(entreesDuRunAnalysable(SPEC_REFERENCE));
    expect(ecart).toEqual({ statut: "sans_objet", motif: "outils_de_son_editeur_non_declares" });
  });
});

/* ------------------------------------------------------------------ D75 (26) : population */

const DECLARES: readonly JugeDuRunAnalysable[] = [
  { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
  { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
];

interface EcartSurOutilJson {
  readonly outil_id: string;
  readonly exactitude_autre_juge: Taux;
}

/** Les écarts par outil de juge-1, publiés. */
function ecartsDeJuge1(entrees: EntreesDuRun): readonly EcartSurOutilJson[] {
  const ecart = section(entrees) as { par_juge: { juge_id: string; ecarts: EcartSurOutilJson[] }[] };
  const juge1 = ecart.par_juge.find((j) => j.juge_id === "juge-1");
  if (juge1 === undefined) throw new Error("juge-1 absent de la section");
  return juge1.ecarts;
}

/**
 * L'exactitude attendue de juge-2 (conforme au verdict) sur les réponses obtenues du canal API de
 * `outil_id` qui passent `garder` : la même fonction que le calcul, sur les verdicts.
 */
function exactitudeAttendue(entrees: EntreesDuRun, outil_id: string, garder: (r: Reponse) => boolean): Taux {
  const reponses = new Set(entrees.reponses.filter((r) => r.canal === "api" && r.statut_reponse === "obtenue" && r.outil_id === outil_id && garder(r)).map((r) => r.id));
  return exactitude(entrees.verdicts.filter((v) => reponses.has(v.objet_note.id)).map((v) => ({ categorie: v.categorie_retenue })));
}

function ecartDe(ecarts: readonly EcartSurOutilJson[], outil_id: string): EcartSurOutilJson {
  const trouve = ecarts.find((e) => e.outil_id === outil_id);
  if (trouve === undefined) throw new Error(`${outil_id} absent des écarts`);
  return trouve;
}

describe("D75 (26) : population de l'écart juge-éditeur (§7, 0.33) — canal API, modes confondus, couples incomplets compris", () => {
  it("D75 (26) les réponses du canal application sont exclues : ni comptées, ni nommées", () => {
    const base = entreesDuRunAnalysable(SPEC_APPLICATION);
    const application = base.reponses.filter((r) => r.canal === "application").map((r) => r.id);
    expect(application.length).toBeGreaterThan(0);
    // avecNotesDeJuges ne note que le canal API : une saisie de l'application lue ici serait nommée sans note de juge.
    const entrees = avecNotesDeJuges(base, DECLARES, (retenue) => retenue);
    const ecart = section(entrees) as { reponses_sans_note_de_juge: string[]; reponses_renvoyees: unknown[] };
    expect(ecart.reponses_sans_note_de_juge).toEqual([]);
    expect(ecart.reponses_renvoyees).toEqual([]);
    for (const id of application) expect(JSON.stringify(ecart)).not.toContain(id);
    expect(ecartDe(ecartsDeJuge1(entrees), "outil-alpha").exactitude_autre_juge).toEqual(exactitudeAttendue(entrees, "outil-alpha", () => true));
  });

  it("D75 (26) les deux modes sont lus ensemble : l'exactitude d'outil-alpha porte sur ses deux modes", () => {
    const entrees = avecNotesDeJuges(entreesDuRunAnalysable(SPEC_REFERENCE), DECLARES, (retenue) => retenue);
    const deuxModes = exactitudeAttendue(entrees, "outil-alpha", () => true);
    const unMode = exactitudeAttendue(entrees, "outil-alpha", (r) => r.mode === "web_desactivee");
    expect(deuxModes.denominateur).toBeGreaterThan(unMode.denominateur);
    expect(ecartDe(ecartsDeJuge1(entrees), "outil-alpha").exactitude_autre_juge).toEqual(deuxModes);
  });

  it("D75 (26) un couple marqué run incomplet reste dans la population : outil-gamma / web_activee compte", () => {
    const entrees = avecNotesDeJuges(entreesDuRunAnalysable(SPEC_REFERENCE), DECLARES, (retenue) => retenue);
    const document = analyserRun(entrees, PARAMETRES, null) as { taux: { couples_incomplets: { outil_id: string; mode: string }[] } };
    expect(document.taux.couples_incomplets).toContainEqual({ outil_id: "outil-gamma", mode: "web_activee" });
    const incomplet = exactitudeAttendue(entrees, "outil-gamma", (r) => r.mode === "web_activee");
    expect(incomplet.denominateur).toBeGreaterThan(0);
    expect(ecartDe(ecartsDeJuge1(entrees), "outil-gamma").exactitude_autre_juge).toEqual(exactitudeAttendue(entrees, "outil-gamma", () => true));
  });

  it("D75 (26) un juge retiré : l'écart est sans objet, motif juge_retire, quel que soit le juge retiré", () => {
    for (const retire of ["juge-1", "juge-2"]) {
      const juges = DECLARES.map((j) => ({ ...j, retire: j.juge_id === retire }));
      expect(section(avecNotesDeJuges(entreesDuRunAnalysable(SPEC_REFERENCE), juges, (retenue) => retenue))).toEqual({ statut: "sans_objet", motif: "juge_retire" });
    }
  });

  it("D75 (25) une réponse renvoyée par un seul juge, lue par pnpm analyze dans les renvois du run : hors du calcul, nommée, document conforme", () => {
    const entrees = avecNotesDeJuges(entreesDuRunAnalysable(SPEC_REFERENCE), DECLARES, (retenue) => retenue);
    const cible = entrees.reponses.find((r) => r.canal === "api" && r.statut_reponse === "obtenue" && r.outil_id === "outil-beta");
    if (cible === undefined) throw new Error("aucune réponse d'outil-beta");
    const avec: EntreesDuRun = {
      ...entrees,
      notations: entrees.notations.filter((n) => !(n.objet_note.id === cible.id && n.notateur.id === "juge-2")),
      renvois: [renvoiDefaillant("juge-2", { objet_note: { type: "reponse", id: cible.id }, run_id: entrees.run.id })],
    };
    const ecart = section(avec) as { reponses_renvoyees: unknown[] };
    expect(ecart.reponses_renvoyees).toEqual([{ reponse_id: cible.id, renvois: [{ juge_id: "juge-2", motif: "sortie_illisible" }] }]);
    const sans = exactitudeAttendue(entrees, "outil-beta", (r) => r.id !== cible.id);
    expect(ecartDe(ecartsDeJuge1(avec), "outil-beta").exactitude_autre_juge).toEqual(sans);
  });
});
