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
import { valider } from "../../outils/schemas/valider.ts";
import { avecNotesDeJuges, entreesDuRunAnalysable, SPEC_REFERENCE, type JugeDuRunAnalysable } from "./run-analysable.ts";

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
