/**
 * Dépôts des testeurs de l'application (§6, QR8 ; D59 (12), protocole 0.24) : « Chacun des deux
 * testeurs saisit tout le sous-échantillon. La réponse brute est le texte que copie le bouton de
 * copie de l'application, stocké tel quel ; la capture d'écran en est la preuve, et son empreinte
 * est publiée. »
 */

import { describe, expect, it } from "vitest";
import {
  bilanDesDepots,
  DepotEnDouble,
  DepotHorsSousEchantillon,
  TesteursEnTrop,
  type DepotApplication,
} from "../../pipeline/interrogation/depot-application.ts";
import type { SousEchantillonApplication } from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";

const RUN_ID = "01JDQ7XK2M8N3P4R5S6T7V8W9X";
const Q = ["a", "b", "c", "d", "e"].map((c) => `q_${c.repeat(32)}`);
const F = ["A", "B", "C", "D", "E"].map((c) => `01JDQ7XK2M8N3P4R5S6T7V8W9${c}`);

const SOUS_ECHANTILLON: SousEchantillonApplication = {
  run_id: RUN_ID,
  questions_par_candidat: 5,
  registre: "neutre",
  echantillon: 1,
  testeurs: 2,
  candidats: [
    {
      candidat_id: "cand-a",
      questions: Q.map((question_id, i) => ({ rang: i + 1, question_id, gabarit: "Q-DIR", formulation_id: F[i] as string })),
    },
  ],
};

function depot(question: number, testeur_id: string, partiel: Partial<DepotApplication> = {}): DepotApplication {
  return {
    run_id: RUN_ID,
    outil_id: "outil-alpha",
    question_id: Q[question] as string,
    formulation_id: F[question] as string,
    echantillon: 1,
    testeur_id,
    compte: "aucun",
    horodatage_saisie: "2026-12-02T10:00:00+01:00",
    texte_copie: "Texte copié tel quel, « guillemets » compris.",
    captures: [{ sha256: "0".repeat(64), chemin_local: `captures/${testeur_id}-${question}.png` }],
    ...partiel,
  };
}

function tout(testeur: string): DepotApplication[] {
  return Q.map((_, i) => depot(i, testeur));
}

describe("bilan des dépôts", () => {
  it("deux testeurs sur tout le sous-échantillon : complet", () => {
    const bilan = bilanDesDepots(SOUS_ECHANTILLON, [...tout("testeur-1"), ...tout("testeur-2")], ["outil-alpha"]);

    expect(bilan).toEqual({ run_id: RUN_ID, saisies_attendues: 5, saisies_completes: 5, incompletes: [] });
  });

  it("un seul testeur a rapporté une question : incomplète, le testeur présent nommé", () => {
    const depots = [...tout("testeur-1"), ...tout("testeur-2").filter((d) => d.question_id !== Q[2])];

    const bilan = bilanDesDepots(SOUS_ECHANTILLON, depots, ["outil-alpha"]);

    expect(bilan.saisies_completes).toBe(4);
    expect(bilan.incompletes).toEqual([{ outil_id: "outil-alpha", question_id: Q[2], testeurs: ["testeur-1"] }]);
  });

  it("un outil sans aucun dépôt : toutes ses questions incomplètes, sans testeur", () => {
    const depots = [...tout("testeur-1"), ...tout("testeur-2")];

    const bilan = bilanDesDepots(SOUS_ECHANTILLON, depots, ["outil-alpha", "outil-beta"]);

    expect(bilan.saisies_attendues).toBe(10);
    expect(bilan.incompletes.filter((i) => i.outil_id === "outil-beta")).toHaveLength(5);
    expect(bilan.incompletes.every((i) => i.outil_id !== "outil-beta" || i.testeurs.length === 0)).toBe(true);
  });

  it("garde le texte copié tel quel : le bilan ne lit ni ne modifie le texte", () => {
    const depots = [...tout("testeur-1"), ...tout("testeur-2")];
    const avant = JSON.stringify(depots);

    bilanDesDepots(SOUS_ECHANTILLON, depots, ["outil-alpha"]);

    expect(JSON.stringify(depots)).toBe(avant);
  });
});

describe("refus", () => {
  it("un dépôt hors du sous-échantillon est refusé", () => {
    const intrus = depot(0, "testeur-1", { question_id: `q_${"f".repeat(32)}` });

    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [intrus], ["outil-alpha"])).toThrow(DepotHorsSousEchantillon);
  });

  it("un dépôt sur une autre formulation que la neutre désignée est refusé", () => {
    const intrus = depot(0, "testeur-1", { formulation_id: F[1] as string });

    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [intrus], ["outil-alpha"])).toThrow(DepotHorsSousEchantillon);
  });

  it("un dépôt d'un autre run ou d'un outil non attendu est refusé", () => {
    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [depot(0, "t", { run_id: "01JDQ7XK2M8N3P4R5S6T7V8W9Z" })], ["outil-alpha"])).toThrow(
      DepotHorsSousEchantillon,
    );
    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [depot(0, "t", { outil_id: "outil-gamma" })], ["outil-alpha"])).toThrow(
      DepotHorsSousEchantillon,
    );
  });

  it("deux dépôts du même testeur pour la même question et le même outil sont refusés", () => {
    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [depot(0, "testeur-1"), depot(0, "testeur-1")], ["outil-alpha"])).toThrow(
      DepotEnDouble,
    );
  });

  it("un troisième testeur est refusé : le §6 en prévoit deux", () => {
    const depots = [depot(0, "testeur-1"), depot(0, "testeur-2"), depot(1, "testeur-3")];

    expect(() => bilanDesDepots(SOUS_ECHANTILLON, depots, ["outil-alpha"])).toThrow(TesteursEnTrop);
  });

  it("valide chaque dépôt contre son schéma : un échantillon 2 ou un compte personnel est refusé", () => {
    const echantillon2 = { ...depot(0, "testeur-1"), echantillon: 2 } as unknown as DepotApplication;
    const personnel = { ...depot(0, "testeur-1"), compte: "personnel" } as unknown as DepotApplication;
    const sansCapture = { ...depot(0, "testeur-1"), captures: [] };

    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [echantillon2], ["outil-alpha"])).toThrow(ErreurSchema);
    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [personnel], ["outil-alpha"])).toThrow(ErreurSchema);
    expect(() => bilanDesDepots(SOUS_ECHANTILLON, [sansCapture], ["outil-alpha"])).toThrow(ErreurSchema);
  });
});
