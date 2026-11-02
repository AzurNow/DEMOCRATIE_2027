/**
 * §5 « Tailles » (protocole 0.24, D59 (17)) : « le nombre de réponses prévues par le plan
 * d'interrogation est inscrit au gel, et celui des réponses obtenues l'est après l'interrogation ».
 * Une réponse manquante (hors fenêtre ou après échecs) est prévue et non obtenue ; un refus de l'API
 * est une réponse obtenue (§6).
 */

import { describe, expect, it } from "vitest";
import { ReponseHorsPlan, type RequeteDuPlan } from "../../analysis/seuils.ts";
import type { Reponse } from "../../analysis/types.ts";
import type { QuestionAInterroger } from "../../pipeline/interrogation/plan.ts";
import type { OutilDeRun } from "../../pipeline/questions/charger-perimetre.ts";
import {
  inscrireReponsesObtenues,
  InterrogationNonTerminee,
  ReponsesObtenuesRefusees,
  reponsesObtenues,
  reponsesPrevues,
} from "../../pipeline/run/reponses.ts";
import { reponseApi } from "../go-no-go/aides.ts";

const PREUVE = {
  url: "https://classement-stores.invalid/fr",
  date_publication: "2026-11-26",
  sha256: "2".repeat(64),
  archive_url: "https://archive.invalid/stores",
};

function assistant(outil_id: string, modes: OutilDeRun["modes"], alias: string): OutilDeRun {
  return { outil_id, famille: "assistant", inclus: true, modele_demande: "modele-simule", ...(modes === undefined ? {} : { modes }), mode_de_tete: "web_desactivee", alias_aveugle: alias, preuve_inclusion: PREUVE };
}

function question(lettre: string): QuestionAInterroger {
  return {
    id: `q_${lettre.repeat(32)}`,
    formulations: ["1", "2", "3"].map((rang) => ({ id: `${rang}${"Z".repeat(25)}`, texte: `${lettre}${rang}` })),
  };
}

function requeteDe(r: Reponse): RequeteDuPlan {
  return { outil_id: r.outil_id, mode: r.mode ?? "web_desactivee", question_id: r.question_id, formulation_id: r.formulation_id, echantillon: r.echantillon };
}

describe("D59 (17) : réponses prévues au gel", () => {
  it("chaque assistant inclus × mode déclaré × question tirée × formulation × échantillon (2)", () => {
    const outils = [assistant("outil-alpha", ["web_activee", "web_desactivee"], "A01"), assistant("outil-beta", ["web_desactivee"], "A02")];
    // (2 modes + 1 mode) × 2 questions × 3 formulations × 2 échantillons = 36.
    expect(reponsesPrevues(outils, [question("a"), question("b")])).toBe(36);
  });

  it("un outil exclu ou un comparateur n'est pas interrogé : aucune réponse prévue pour lui", () => {
    const exclu = { ...assistant("outil-gamma", ["web_desactivee"], "A03"), inclus: false };
    const comparateur: OutilDeRun = { outil_id: "comparateur-delta", famille: "comparateur", inclus: true, preuve_inclusion: PREUVE };
    expect(reponsesPrevues([assistant("outil-alpha", ["web_desactivee"], "A01"), exclu, comparateur], [question("a")])).toBe(6);
  });

  it("aucune question tirée : zéro réponse prévue, inscrit tel quel", () => {
    expect(reponsesPrevues([assistant("outil-alpha", ["web_desactivee"], "A01")], [])).toBe(0);
  });
});

describe("D59 (17) : réponses obtenues après l'interrogation", () => {
  it("un refus de l'API est obtenu ; une manquante hors fenêtre ou après échecs est prévue et non obtenue", () => {
    const obtenue = reponseApi("outil-alpha", "web_desactivee", "obtenue");
    // Projection d'un refus de l'API (`schema/reponse.schema.json`) : obtenue, sans texte ni lien.
    const refus = { ...reponseApi("outil-alpha", "web_desactivee", "obtenue"), normalise: { texte: "", liens: [], troncature: false, refus_api: true } };
    const horsFenetre = reponseApi("outil-alpha", "web_desactivee", "manquante");
    const echecs = reponseApi("outil-alpha", "web_activee", "manquante");
    const reponses = [obtenue, refus, horsFenetre, echecs];
    expect(reponsesObtenues(reponses, reponses.map(requeteDe))).toBe(2);
  });

  it("aucune réponse obtenue (toutes manquantes) : zéro, pas une absence", () => {
    const reponses = [reponseApi("outil-alpha", "web_desactivee", "manquante"), reponseApi("outil-alpha", "web_desactivee", "manquante")];
    expect(reponsesObtenues(reponses, reponses.map(requeteDe))).toBe(0);
  });

  it("une requête du plan sans réponse écrite (jamais tentée, ou en attente de l'opérateur) : l'interrogation n'est pas terminée", () => {
    const ecrite = reponseApi("outil-alpha", "web_desactivee", "obtenue");
    const jamais = requeteDe(reponseApi("outil-alpha", "web_desactivee", "obtenue"));
    expect(() => reponsesObtenues([ecrite], [requeteDe(ecrite), jamais])).toThrow(InterrogationNonTerminee);
  });

  it("une réponse qu'aucune requête du plan n'attend : refus (ReponseHorsPlan), aucun compte rendu", () => {
    const hors = reponseApi("outil-alpha", "web_desactivee", "obtenue");
    expect(() => reponsesObtenues([hors], [])).toThrow(ReponseHorsPlan);
  });

  it("les réponses d'un autre contexte que run ne comptent pas", () => {
    const run = reponseApi("outil-alpha", "web_desactivee", "obtenue");
    const autre: Reponse = { ...reponseApi("outil-alpha", "web_desactivee", "obtenue"), contexte: "contrefactuel_candidat" };
    expect(reponsesObtenues([run, autre], [requeteDe(run)])).toBe(1);
  });
});

describe("D59 (17) : inscription des réponses obtenues dans run.json", () => {
  const RUN = { id: "run", statut: "en_cours", reponses: { prevues: 4 } } as const;

  it("inscrit le nombre à côté des prévues, sans toucher au reste du run", () => {
    expect(inscrireReponsesObtenues(RUN, 3)).toEqual({ issue: "inscrite", run: { id: "run", statut: "en_cours", reponses: { prevues: 4, obtenues: 3 } } });
  });

  it("zéro obtenue sur quatre prévues : inscrit 0", () => {
    expect(inscrireReponsesObtenues(RUN, 0)).toEqual({ issue: "inscrite", run: { ...RUN, reponses: { prevues: 4, obtenues: 0 } } });
  });

  it("plus d'obtenues que de prévues : refus", () => {
    expect(() => inscrireReponsesObtenues(RUN, 5)).toThrow(ReponsesObtenuesRefusees);
  });

  it("déjà inscrit, même nombre : rien n'est réécrit", () => {
    expect(inscrireReponsesObtenues({ ...RUN, reponses: { prevues: 4, obtenues: 3 } }, 3)).toEqual({ issue: "deja_inscrite" });
  });

  it("déjà inscrit, nombre différent : refus, jamais réécrit", () => {
    expect(() => inscrireReponsesObtenues({ ...RUN, reponses: { prevues: 4, obtenues: 3 } }, 2)).toThrow(ReponsesObtenuesRefusees);
  });
});
