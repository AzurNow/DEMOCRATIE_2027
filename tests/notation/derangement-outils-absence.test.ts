/**
 * Contrefactuel d'outil publié absent avec son motif (§7, protocole 0.31, D73 (15)) : « Quand deux
 * outils du dérangement ont le même éditeur, le test contrefactuel d'outil est publié absent, avec
 * ce motif, sans bloquer le run », et le dérangement « n'est pas défini sous deux outils ». Protocole
 * 0.33, D75 (6) : « il en va de même quand un comparateur du périmètre a le même éditeur qu'un outil
 * du dérangement ».
 */

import { describe, expect, it } from "vitest";
import type { ContrefactuelOutilsAbsent } from "../../pipeline/notation/contrefactuel-outils.ts";
import {
  absenceFauteDOutils,
  correspondancesOutils,
  derangementOutilsOuAbsence,
  outilsDuContrefactuel,
  outilsDuDerangement,
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
    const issue = derangementOutilsOuAbsence([ALPHA, ALPHA_PRO], [ALPHA, ALPHA_PRO], graine(1), []);
    expect(issue).toEqual({
      statut: "indefini",
      motif: "outils_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "alpha-pro"] }],
    });
  });

  it("trois outils dont deux du même éditeur : pas de dérangement partiel (§7 : « deux outils du dérangement »), absent", () => {
    const issue = derangementOutilsOuAbsence([ALPHA, BETA, ALPHA_PRO], [ALPHA, BETA, ALPHA_PRO], graine(5), []);
    expect(issue).toEqual({
      statut: "indefini",
      motif: "outils_du_meme_editeur",
      outils: 3,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "alpha-pro"] }],
    });
  });

  it("plusieurs éditeurs partagés : tous publiés, triés par éditeur puis identifiant", () => {
    const issue = derangementOutilsOuAbsence([GAMMA_MINI, ALPHA_PRO, BETA, GAMMA, ALPHA], [ALPHA, ALPHA_PRO, BETA, GAMMA, GAMMA_MINI], graine(5), []);
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
    const premiere = derangementOutilsOuAbsence(permutes, permutes, graine(11), []);
    expect(derangementOutilsOuAbsence(permutes, permutes, graine(11), [])).toEqual(premiere);
    expect(derangementOutilsOuAbsence([...permutes].reverse(), permutes, graine(12), [])).toEqual(premiere);
  });

  it("l'éditeur se compare à casse exacte, comme les formes : « société alpha » est un autre éditeur", () => {
    const autre = { ...ALPHA_PRO, editeur: "société alpha" };
    expect(derangementOutilsOuAbsence([ALPHA, autre], [ALPHA, autre], graine(1), [])).toMatchObject({ statut: "tire" });
  });
});

describe("un seul outil au dérangement : motif distinct", () => {
  it("un outil : absent, motif moins_de_deux_outils, aucun éditeur partagé", () => {
    expect(derangementOutilsOuAbsence([ALPHA], [ALPHA, BETA], graine(1), [])).toEqual({
      statut: "indefini",
      motif: "moins_de_deux_outils",
      outils: 1,
      editeurs_partages: [],
    });
  });

  it("aucun outil : même motif, effectif nul", () => {
    expect(derangementOutilsOuAbsence([], [ALPHA], graine(1), [])).toMatchObject({ motif: "moins_de_deux_outils", outils: 0 });
  });

  it("la forme rendue est celle que contrefactuel-outils.ts publie comme absence", () => {
    const issue = derangementOutilsOuAbsence([ALPHA], [ALPHA], graine(1), []);
    const absent: ContrefactuelOutilsAbsent | null = issue.statut === "indefini" ? issue : null;
    expect(absent?.motif).toBe("moins_de_deux_outils");
  });
});

describe("éditeurs tous distincts : le dérangement est celui de tirerDerangementOutils", () => {
  it.each([1, 2, 77, 2026])("graine %i : mêmes correspondances", (valeur) => {
    const permutes = [ALPHA, BETA, GAMMA];
    const issue = derangementOutilsOuAbsence(permutes, permutes, graine(valeur), []);
    if (issue.statut !== "tire") throw new Error(`dérangement attendu, reçu ${issue.motif}`);
    expect(issue.derangement).toEqual(tirerDerangementOutils(permutes, permutes, graine(valeur)));
    expect(Object.keys(correspondancesOutils(issue.derangement))).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("les incohérences restent des refus nommés, même quand le test serait absent", () => {
  it("graine non conforme : refus, avant toute décision d'absence", () => {
    const pcg = { ...graine(1), algorithme: "pcg64" } as unknown as GraineTirage;
    expect(() => derangementOutilsOuAbsence([ALPHA, ALPHA_PRO], [ALPHA, ALPHA_PRO], pcg, [])).toThrow(GraineNonConforme);
    expect(() => derangementOutilsOuAbsence([ALPHA], [ALPHA], pcg, [])).toThrow(GraineNonConforme);
  });

  it("outil permuté hors périmètre, identifiant en double, éditeur blanc : refus nommé", () => {
    expect(() => derangementOutilsOuAbsence([ALPHA, ALPHA_PRO], [ALPHA], graine(1), [])).toThrow(/alpha-pro/);
    expect(() => derangementOutilsOuAbsence([ALPHA], [ALPHA, { ...BETA, outil_id: "alpha" }], graine(1), [])).toThrow(FormesOutilsAmbigues);
    const blanc = { ...BETA, editeur: " " };
    expect(() => derangementOutilsOuAbsence([blanc, { ...GAMMA, editeur: " " }], [blanc, { ...GAMMA, editeur: " " }], graine(1), [])).toThrow(FormesOutilsAmbigues);
  });

  it("un outil hors dérangement qui n'est pas un comparateur et partage l'éditeur d'un outil permuté : le §7 n'en dit rien, refus nommé inchangé", () => {
    const assistant_exclu = { ...GAMMA, outil_id: "assistant-exclu", editeur: ALPHA.editeur };
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, assistant_exclu], graine(1), [])).toThrow(FormesOutilsAmbigues);
  });

  it("comparateur hors périmètre, en double ou au dérangement : refus nommé", () => {
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA], graine(1), ["inconnu"])).toThrow(/inconnu/);
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, GAMMA], graine(1), ["gamma", "gamma"])).toThrow(/double/);
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA], graine(1), ["beta"])).toThrow(/beta/);
  });
});

/** Un comparateur du périmètre, hors dérangement, du même éditeur qu'ALPHA. */
const COMPARATEUR_ALPHA: OutilNomme = { outil_id: "comparateur-alpha", libelle: "Compare Alpha", editeur: "Société Alpha" };
/** Un second comparateur du même éditeur qu'ALPHA. */
const COMPARATEUR_ALPHA_BIS: OutilNomme = { outil_id: "comparateur-alpha-bis", libelle: "Boussole Alpha", editeur: "Société Alpha" };

describe("D75 (6) : un comparateur du même éditeur qu'un outil du dérangement rend le test absent (§7, protocole 0.33)", () => {
  it("D75 (6) cas 3 : comparateur du même éditeur que l'outil permuté : absent, motif comparateur_du_meme_editeur, plus d'exception", () => {
    const perimetre = [ALPHA, BETA, COMPARATEUR_ALPHA];
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], perimetre, graine(1), ["comparateur-alpha"])).not.toThrow();
    expect(derangementOutilsOuAbsence([ALPHA, BETA], perimetre, graine(1), ["comparateur-alpha"])).toEqual({
      statut: "indefini",
      motif: "comparateur_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "comparateur-alpha"] }],
    });
  });

  it("D75 (6) cas 4 : un outil permuté et deux comparateurs du même éditeur : absent, les trois outils publiés sous l'éditeur", () => {
    const perimetre = [ALPHA, BETA, COMPARATEUR_ALPHA, COMPARATEUR_ALPHA_BIS];
    expect(derangementOutilsOuAbsence([ALPHA, BETA], perimetre, graine(1), ["comparateur-alpha-bis", "comparateur-alpha"])).toEqual({
      statut: "indefini",
      motif: "comparateur_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "comparateur-alpha", "comparateur-alpha-bis"] }],
    });
  });

  it("D75 (6) : un comparateur d'un autre éditeur ne change rien, le dérangement est tiré", () => {
    const comparateur = { outil_id: "comparateur-delta", libelle: "Delta Compare", editeur: "Delta Corp" };
    const issue = derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, comparateur], graine(3), ["comparateur-delta"]);
    expect(issue).toEqual({ statut: "tire", derangement: tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA, comparateur], graine(3)) });
  });

  it("D75 (6) : deux outils du dérangement du même éditeur l'emportent, le comparateur qui le partage est publié avec eux", () => {
    const perimetre = [ALPHA, ALPHA_PRO, BETA, COMPARATEUR_ALPHA];
    expect(derangementOutilsOuAbsence([ALPHA, ALPHA_PRO, BETA], perimetre, graine(1), ["comparateur-alpha"])).toEqual({
      statut: "indefini",
      motif: "outils_du_meme_editeur",
      outils: 3,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["alpha", "alpha-pro", "comparateur-alpha"] }],
    });
  });

  it("D75 (6) : moins de deux outils l'emporte sur le comparateur du même éditeur", () => {
    expect(derangementOutilsOuAbsence([ALPHA], [ALPHA, COMPARATEUR_ALPHA], graine(1), ["comparateur-alpha"])).toEqual({
      statut: "indefini",
      motif: "moins_de_deux_outils",
      outils: 1,
      editeurs_partages: [],
    });
  });

  it("D75 (6) : l'éditeur du comparateur se compare à casse exacte", () => {
    const comparateur = { ...COMPARATEUR_ALPHA, editeur: "société alpha" };
    expect(derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, comparateur], graine(1), ["comparateur-alpha"])).toMatchObject({ statut: "tire" });
  });

  it("D75 (6) : deux comparateurs du même éditeur, sans outil du dérangement qui le porte : le §7 n'en dit rien, refus nommé inchangé", () => {
    const comparateur = { ...COMPARATEUR_ALPHA_BIS, editeur: "Éditeur Commun" };
    const autre = { ...COMPARATEUR_ALPHA, editeur: "Éditeur Commun" };
    expect(() => derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, comparateur, autre], graine(1), ["comparateur-alpha", "comparateur-alpha-bis"])).toThrow(FormesOutilsAmbigues);
  });
});

describe("outils du dérangement : les assistants inclus du périmètre (§7)", () => {
  it("D75 (7) : un comparateur et un assistant exclu n'y entrent pas ; l'ordre du périmètre est gardé", () => {
    const outils = [
      { outil_id: "b", famille: "assistant", inclus: true },
      { outil_id: "c", famille: "comparateur", inclus: true },
      { outil_id: "x", famille: "assistant", inclus: false },
      { outil_id: "a", famille: "assistant", inclus: true },
    ] as const;
    expect(outilsDuDerangement(outils)).toEqual(["b", "a"]);
  });

  it("D75 (7) : sous deux outils, absence moins_de_deux_outils ; à deux, rien n'est encore décidé", () => {
    expect(absenceFauteDOutils(0)).toEqual({ statut: "indefini", motif: "moins_de_deux_outils", outils: 0, editeurs_partages: [] });
    expect(absenceFauteDOutils(1)).toEqual({ statut: "indefini", motif: "moins_de_deux_outils", outils: 1, editeurs_partages: [] });
    expect(absenceFauteDOutils(2)).toBeNull();
  });
});

describe("D84 : les entrées du contrefactuel d'outil, lues de l'instantané du gel (§7)", () => {
  it("permutés : les assistants inclus ; périmètre : tous les outils, libellé et éditeur du gel ; comparateurs : ceux du périmètre", () => {
    const outils = [
      { outil_id: "b", libelle: "Outil B", editeur: "Éditeur B", famille: "assistant", inclus: true },
      { outil_id: "c", libelle: "Comparateur C", editeur: "Éditeur C", famille: "comparateur", inclus: true },
      { outil_id: "x", libelle: "Outil X", editeur: "Éditeur X", famille: "assistant", inclus: false },
      { outil_id: "d", libelle: "Comparateur D", editeur: "Éditeur D", famille: "comparateur", inclus: false },
      { outil_id: "a", libelle: "Outil A", editeur: "Éditeur A", famille: "assistant", inclus: true },
    ] as const;
    expect(outilsDuContrefactuel(outils)).toEqual({
      permutes: [
        { outil_id: "b", libelle: "Outil B", editeur: "Éditeur B" },
        { outil_id: "a", libelle: "Outil A", editeur: "Éditeur A" },
      ],
      perimetre: outils.map(({ outil_id, libelle, editeur }) => ({ outil_id, libelle, editeur })),
      comparateurs: ["c", "d"],
    });
  });
});
