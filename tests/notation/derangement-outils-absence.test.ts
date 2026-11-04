/**
 * Contrefactuel d'outil publié absent avec son motif (§7, protocole 0.31, D73 (15)) : « Quand deux
 * outils du dérangement ont le même éditeur, le test contrefactuel d'outil est publié absent, avec
 * ce motif, sans bloquer le run », et le dérangement « n'est pas défini sous deux outils ».
 */

import { describe, expect, it } from "vitest";
import type { ContrefactuelOutilsAbsent } from "../../pipeline/notation/contrefactuel-outils.ts";
import {
  correspondancesOutils,
  derangementOutilsOuAbsence,
  FormesOutilsAmbigues,
  tirerDerangementOutils,
  type OutilNomme,
} from "../../pipeline/notation/derangement-outils.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/graine.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";

const ALPHA: OutilNomme = { outil_id: "alpha", libelle: "Alphabot", editeur: "Société Alpha" };
const BETA: OutilNomme = { outil_id: "beta", libelle: "Le Chat", editeur: "Bêta IA" };
const GAMMA: OutilNomme = { outil_id: "gamma", libelle: "Gammachat", editeur: "Gamma Labs" };
/** Même éditeur qu'ALPHA. */
const ALPHA_PRO: OutilNomme = { outil_id: "alpha-pro", libelle: "Alphabot Pro", editeur: "Société Alpha" };
/** Même éditeur que GAMMA. */
const GAMMA_MINI: OutilNomme = { outil_id: "gamma-mini", libelle: "Gammachat Mini", editeur: "Gamma Labs" };

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

describe("deux outils du même éditeur : test absent avec son motif, sans erreur bloquante", () => {
  it("deux outils au dérangement, même éditeur : absent, motif outils_du_meme_editeur, aucune exception", () => {
    const issue = derangementOutilsOuAbsence([ALPHA, ALPHA_PRO], [ALPHA, ALPHA_PRO], graine(1));
    expect(issue).toEqual({
      statut: "indefini",
      motif: "outils_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "alpha-pro"] }],
    });
  });

  it("trois outils dont deux du même éditeur : pas de dérangement partiel (§7 : « deux outils du dérangement »), absent", () => {
    const issue = derangementOutilsOuAbsence([ALPHA, BETA, ALPHA_PRO], [ALPHA, BETA, ALPHA_PRO], graine(5));
    expect(issue).toEqual({
      statut: "indefini",
      motif: "outils_du_meme_editeur",
      outils: 3,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "alpha-pro"] }],
    });
  });

  it("plusieurs éditeurs partagés : tous publiés, triés par éditeur puis identifiant", () => {
    const issue = derangementOutilsOuAbsence([GAMMA_MINI, ALPHA_PRO, BETA, GAMMA, ALPHA], [ALPHA, ALPHA_PRO, BETA, GAMMA, GAMMA_MINI], graine(5));
    expect(issue).toMatchObject({
      motif: "outils_du_meme_editeur",
      editeurs_partages: [
        { editeur: "Gamma Labs", outil_ids: ["gamma", "gamma-mini"] },
        { editeur: "Société Alpha", outil_ids: ["alpha", "alpha-pro"] },
      ],
    });
  });

  it("motif déterministe : même graine, même sortie ; ni la graine ni l'ordre des outils ne le changent", () => {
    const permutes = [ALPHA, BETA, ALPHA_PRO];
    const premiere = derangementOutilsOuAbsence(permutes, permutes, graine(11));
    expect(derangementOutilsOuAbsence(permutes, permutes, graine(11))).toEqual(premiere);
    expect(derangementOutilsOuAbsence([...permutes].reverse(), permutes, graine(12))).toEqual(premiere);
  });

  it("l'éditeur se compare à casse exacte, comme les formes : « société alpha » est un autre éditeur", () => {
    const autre = { ...ALPHA_PRO, editeur: "société alpha" };
    expect(derangementOutilsOuAbsence([ALPHA, autre], [ALPHA, autre], graine(1))).toMatchObject({ statut: "tire" });
  });
});

describe("un seul outil au dérangement : motif distinct", () => {
  it("un outil : absent, motif moins_de_deux_outils, aucun éditeur partagé", () => {
    expect(derangementOutilsOuAbsence([ALPHA], [ALPHA, BETA], graine(1))).toEqual({
      statut: "indefini",
      motif: "moins_de_deux_outils",
      outils: 1,
      editeurs_partages: [],
    });
  });

  it("aucun outil : même motif, effectif nul", () => {
    expect(derangementOutilsOuAbsence([], [ALPHA], graine(1))).toMatchObject({ motif: "moins_de_deux_outils", outils: 0 });
  });

  it("la forme rendue est celle que contrefactuel-outils.ts publie comme absence", () => {
    const issue = derangementOutilsOuAbsence([ALPHA], [ALPHA], graine(1));
    const absent: ContrefactuelOutilsAbsent | null = issue.statut === "indefini" ? issue : null;
    expect(absent?.motif).toBe("moins_de_deux_outils");
  });
});

describe("éditeurs tous distincts : le dérangement est celui de tirerDerangementOutils", () => {
  it.each([1, 2, 77, 2026])("graine %i : mêmes correspondances", (valeur) => {
    const permutes = [ALPHA, BETA, GAMMA];
    const issue = derangementOutilsOuAbsence(permutes, permutes, graine(valeur));
    if (issue.statut !== "tire") throw new Error(`dérangement attendu, reçu ${issue.motif}`);
    expect(issue.derangement).toEqual(tirerDerangementOutils(permutes, permutes, graine(valeur)));
    expect(Object.keys(correspondancesOutils(issue.derangement))).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("les incohérences restent des refus nommés, même quand le test serait absent", () => {
  it("graine non conforme : refus, avant toute décision d'absence", () => {
    const pcg = { ...graine(1), algorithme: "pcg64" } as unknown as GraineTirage;
    expect(() => derangementOutilsOuAbsence([ALPHA, ALPHA_PRO], [ALPHA, ALPHA_PRO], pcg)).toThrow(GraineNonConforme);
    expect(() => derangementOutilsOuAbsence([ALPHA], [ALPHA], pcg)).toThrow(GraineNonConforme);
  });

  it("outil permuté hors périmètre, identifiant en double, éditeur blanc : refus nommé", () => {
    expect(() => derangementOutilsOuAbsence([ALPHA, ALPHA_PRO], [ALPHA], graine(1))).toThrow(/alpha-pro/);
    expect(() => derangementOutilsOuAbsence([ALPHA], [ALPHA, { ...BETA, outil_id: "alpha" }], graine(1))).toThrow(FormesOutilsAmbigues);
    const blanc = { ...BETA, editeur: " " };
    expect(() => derangementOutilsOuAbsence([blanc, { ...GAMMA, editeur: " " }], [blanc, { ...GAMMA, editeur: " " }], graine(1))).toThrow(FormesOutilsAmbigues);
  });

  it("un outil hors dérangement qui partage l'éditeur d'un outil permuté : le §7 n'en dit rien, refus nommé inchangé", () => {
    const comparateur = { ...GAMMA, outil_id: "comparateur", editeur: ALPHA.editeur };
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, comparateur], graine(1))).toThrow(FormesOutilsAmbigues);
  });
});
