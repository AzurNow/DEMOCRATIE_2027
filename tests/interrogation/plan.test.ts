/**
 * Cas limites 6 (ordre) et 13 (outil sans mode web) du brief : le plan d'interrogation.
 */

import { describe, expect, it } from "vitest";
import { OutilNonInterrogeable, planifier, type QuestionAInterroger } from "../../pipeline/interrogation/plan.ts";
import type { OutilDeRun } from "../../pipeline/questions/charger-perimetre.ts";

const PREUVE = {
  url: "https://classement-stores.invalid/fr",
  date_publication: "2026-11-26",
  sha256: "2".repeat(64),
  archive_url: "https://archive.invalid/stores",
};

function assistant(outil_id: string, modes: OutilDeRun["modes"], alias = "A01"): OutilDeRun {
  return {
    outil_id,
    libelle: `Libellé de ${outil_id}`,
    editeur: `Éditeur de ${outil_id}`,
    famille: "assistant",
    inclus: true,
    modele_demande: "modele-simule",
    ...(modes === undefined ? {} : { modes }),
    mode_de_tete: "web_desactivee",
    alias_aveugle: alias,
    preuve_inclusion: PREUVE,
  };
}

/** Questions et formulations volontairement données dans le désordre. */
const QUESTIONS: readonly QuestionAInterroger[] = [
  {
    id: "q_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    formulations: [
      { id: "3ZZZZZZZZZZZZZZZZZZZZZZZZZ", texte: "b3" },
      { id: "1ZZZZZZZZZZZZZZZZZZZZZZZZZ", texte: "b1" },
      { id: "2ZZZZZZZZZZZZZZZZZZZZZZZZZ", texte: "b2" },
    ],
  },
  {
    id: "q_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    formulations: [
      { id: "6ZZZZZZZZZZZZZZZZZZZZZZZZZ", texte: "a6" },
      { id: "4ZZZZZZZZZZZZZZZZZZZZZZZZZ", texte: "a4" },
      { id: "5ZZZZZZZZZZZZZZZZZZZZZZZZZ", texte: "a5" },
    ],
  },
];

function cle(r: { question_id: string; mode: string; formulation_id: string }): string {
  return `${r.question_id.slice(2, 3)}/${r.mode}/${r.formulation_id.slice(0, 1)}`;
}

describe("cas 6 : ordre du plan", () => {
  const file = planifier([assistant("outil-alpha", ["web_activee", "web_desactivee"])], QUESTIONS, 2).get("outil-alpha");

  it("planifie 2 questions × 2 modes × 3 formulations × 2 échantillons", () => {
    expect(file).toHaveLength(24);
  });

  it("tous les échantillons 1 partent avant tous les échantillons 2", () => {
    expect(file?.map((r) => r.echantillon)).toEqual([...Array(12).fill(1), ...Array(12).fill(2)]);
  });

  it("dans un tour, tri croissant par chaîne sur (question_id, mode, formulation_id)", () => {
    const attendu = [
      "a/web_activee/4", "a/web_activee/5", "a/web_activee/6",
      "a/web_desactivee/4", "a/web_desactivee/5", "a/web_desactivee/6",
      "b/web_activee/1", "b/web_activee/2", "b/web_activee/3",
      "b/web_desactivee/1", "b/web_desactivee/2", "b/web_desactivee/3",
    ];
    expect(file?.slice(0, 12).map(cle)).toEqual(attendu);
    expect(file?.slice(12).map(cle)).toEqual(attendu);
  });

  it("le texte envoyé est celui de la formulation", () => {
    expect(file?.[0]?.texte).toBe("a4");
  });

  it("chaque outil a sa propre file, avec son alias", () => {
    const deux = planifier(
      [assistant("outil-alpha", ["web_desactivee"], "A01"), assistant("outil-beta", ["web_desactivee"], "B02")],
      QUESTIONS,
      2,
    );
    expect([...deux.keys()]).toEqual(["outil-alpha", "outil-beta"]);
    expect(deux.get("outil-beta")?.every((r) => r.outil_id === "outil-beta" && r.alias_aveugle === "B02")).toBe(true);
  });
});

describe("cas 13 : un outil sans mode web dans le périmètre", () => {
  it("n'a que web_desactivee au plan", () => {
    const file = planifier([assistant("outil-beta", ["web_desactivee"])], QUESTIONS, 2).get("outil-beta");
    expect(new Set(file?.map((r) => r.mode))).toEqual(new Set(["web_desactivee"]));
    expect(file).toHaveLength(12);
  });
});

describe("D75 (14) : le nombre d'échantillons est celui que le gel a inscrit", () => {
  it("planifier avec 1 échantillon inscrit au gel : planifie 1, pas 2 (levier 2 → 1 du §12)", () => {
    const file = planifier([assistant("outil-alpha", ["web_activee", "web_desactivee"])], QUESTIONS, 1).get("outil-alpha");
    expect(file).toHaveLength(12);
    expect(new Set(file?.map((r) => r.echantillon))).toEqual(new Set([1]));
  });

  it("avec 2 inscrits : deux tours, numérotés 1 et 2", () => {
    const file = planifier([assistant("outil-alpha", ["web_desactivee"])], QUESTIONS, 2).get("outil-alpha");
    expect(new Set(file?.map((r) => r.echantillon))).toEqual(new Set([1, 2]));
  });
});

describe("outils hors du plan", () => {
  it("ni un comparateur ni un assistant exclu ne sont interrogés", () => {
    const plan = planifier(
      [
        { outil_id: "comparateur-gamma", libelle: "Comparateur Gamma", editeur: "Éditeur Gamma", famille: "comparateur", inclus: true },
        { outil_id: "outil-delta", libelle: "Outil Delta", editeur: "Éditeur Delta", famille: "assistant", inclus: false, motif_exclusion: "exclu" },
      ],
      QUESTIONS,
      2,
    );
    expect(plan.size).toBe(0);
  });

  it("un assistant inclus sans alias aveugle ni modes lève, sans valeur par défaut", () => {
    const { alias_aveugle: _alias, ...sansAlias } = assistant("outil-alpha", undefined);
    expect(() => planifier([sansAlias], QUESTIONS, 2)).toThrow(OutilNonInterrogeable);
    expect(() => planifier([sansAlias], QUESTIONS, 2)).toThrow(/modes, alias_aveugle/);
  });

  it("une question présente deux fois lève", () => {
    expect(() => planifier([assistant("outil-alpha", ["web_desactivee"])], [...QUESTIONS.slice(0, 1), ...QUESTIONS.slice(0, 1)], 2)).toThrow(
      /deux fois/,
    );
  });
});
