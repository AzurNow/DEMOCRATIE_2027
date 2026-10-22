/**
 * Dérangement des candidats du test contrefactuel (§7, D55 (4)). Cas limites 1 et 15 du brief de la
 * PR B du lot notation, et le cas construit de D55 (4) (constat 4 de la conformité du 2026-10-19).
 */

import { describe, expect, it } from "vitest";
import { graineDerivee, graineHexadecimale } from "../../analysis/graines.ts";
import {
  CLE_DERANGEMENT_CANDIDATS,
  correspondancesDe,
  tirerDerangement,
  verifierCandidats,
} from "../../pipeline/notation/derangement.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/graine.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import type { CandidatDuRun } from "../../pipeline/notation/types.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { CANDIDATS_DU_RUN } from "./fabriques.ts";

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

function candidats(n: number): CandidatDuRun[] {
  return Array.from({ length: n }, (_, i) => {
    const rang = String(i).padStart(2, "0");
    return { candidat_id: `cand-${rang}`, libelle: `Prenom${rang} Nom${rang}`, nom: `Nom${rang}` };
  });
}

describe("dérangement des candidats", () => {
  it("n'a aucun point fixe, sur cent graines et des effectifs de 2 à 12", () => {
    for (let valeur = 0; valeur < 100; valeur += 1) {
      for (const n of [2, 3, 5, 12]) {
        const paires = tirerDerangement(candidats(n), candidats(n), graine(valeur)).paires;
        expect(paires).toHaveLength(n);
        for (const paire of paires) expect(paire.image.candidat_id).not.toBe(paire.source.candidat_id);
        // Une permutation : chaque candidat est image exactement une fois.
        expect(new Set(paires.map((p) => p.image.candidat_id)).size).toBe(n);
      }
    }
  });

  it("même graine, même dérangement", () => {
    const a = tirerDerangement(candidats(7), candidats(7), graine(20261202));
    const b = tirerDerangement(candidats(7), candidats(7), graine(20261202));
    expect(correspondancesDe(a)).toEqual(correspondancesDe(b));
  });

  it("l'ordre d'entrée des candidats est indifférent", () => {
    const ranges = candidats(7);
    const inverses = [...ranges].reverse();
    const melanges = [ranges[3], ranges[0], ranges[6], ranges[1], ranges[5], ranges[2], ranges[4]] as CandidatDuRun[];
    const reference = correspondancesDe(tirerDerangement(ranges, ranges, graine(42)));
    expect(correspondancesDe(tirerDerangement(inverses, inverses, graine(42)))).toEqual(reference);
    expect(correspondancesDe(tirerDerangement(melanges, melanges, graine(42)))).toEqual(reference);
  });

  it("une graine qui déclare un autre générateur lève GraineNonConforme", () => {
    expect(() => tirerDerangement(candidats(3), candidats(3), { ...graine(1), algorithme: "mt19937" })).toThrow(GraineNonConforme);
    expect(() => tirerDerangement(candidats(3), candidats(3), { ...graine(1), version: "0.0.0" })).toThrow(GraineNonConforme);
  });

  it("nomme le dérangement, pas le tirage, dans le message de refus (constat 18 de la revue du 2026-10-12)", () => {
    const autre: GraineTirage = { ...graine(1), algorithme: "mt19937" };
    expect(() => tirerDerangement(candidats(3), candidats(3), autre)).toThrow(/Graine du dérangement non conforme/);
  });

  it("un seul candidat interrogé, ou aucun, lève : il n'a aucun dérangement", () => {
    expect(() => tirerDerangement(candidats(1), candidats(1), graine(1))).toThrow(/au moins deux candidats interrogés/);
    expect(() => tirerDerangement([], [], graine(1))).toThrow(/au moins deux candidats interrogés/);
  });

  it("deux candidats : le dérangement est l'échange, quelle que soit la graine", () => {
    for (let valeur = 0; valeur < 20; valeur += 1) {
      expect(correspondancesDe(tirerDerangement(candidats(2), candidats(2), graine(valeur)))).toEqual({ "cand-00": "cand-01", "cand-01": "cand-00" });
    }
  });

  it("la règle publiée se rejoue à la main : rangement par identifiant, mélanges successifs jusqu'au premier sans point fixe", () => {
    const ranges = candidats(5);
    const rng = generateur(graineDerivee(777, CLE_DERANGEMENT_CANDIDATS));
    let images = melanger(ranges, rng);
    while (images.some((c, i) => c.candidat_id === ranges[i]?.candidat_id)) {
      images = melanger(ranges, rng);
    }
    const attendu = Object.fromEntries(ranges.map((c, i) => [c.candidat_id, images[i]?.candidat_id]));
    const inverses = [...ranges].reverse();
    expect(correspondancesDe(tirerDerangement(inverses, inverses, graine(777)))).toEqual(attendu);
  });

  it("valeur de référence figée : le tirage est publié, il ne doit pas bouger", () => {
    expect(CLE_DERANGEMENT_CANDIDATS).toEqual(["contrefactuel", "noms_candidats", "derangement"]);
    // printf '20261202\0contrefactuel\0noms_candidats\0derangement' | shasum -a 256 | cut -c1-16
    expect(graineHexadecimale(20261202, CLE_DERANGEMENT_CANDIDATS)).toBe("c9d33002bc1d79c7");
    expect(correspondancesDe(tirerDerangement(candidats(5), candidats(5), graine(20261202)))).toEqual(VALEUR_FIGEE);
  });

  it("les candidats du run de test donnent un dérangement des trois", () => {
    const paires = tirerDerangement(CANDIDATS_DU_RUN, CANDIDATS_DU_RUN, graine(20261202)).paires;
    expect(paires.map((p) => p.source.candidat_id)).toEqual(["demo-alpha", "demo-beta", "demo-gamma"]);
  });

  it("un périmètre où tous sont interrogés donne exactement le même dérangement qu'un dérangement sur les seuls interrogés (non-régression)", () => {
    const tous = candidats(5);
    expect(correspondancesDe(tirerDerangement(tous, tous, graine(20261202)))).toEqual(VALEUR_FIGEE);
  });

  it("un candidat non interrogé n'a jamais ni source ni image", () => {
    const perimetre = candidats(6);
    const [interroges, non_interroges] = [perimetre.slice(0, 4), perimetre.slice(4)];
    for (let valeur = 0; valeur < 50; valeur += 1) {
      const paires = tirerDerangement(interroges, perimetre, graine(valeur)).paires;
      const ids = new Set(paires.flatMap((p) => [p.source.candidat_id, p.image.candidat_id]));
      for (const candidat of non_interroges) expect(ids.has(candidat.candidat_id)).toBe(false);
      expect(paires).toHaveLength(interroges.length);
    }
  });

  it("moins de deux candidats interrogés au périmètre, même avec d'autres non interrogés, lève", () => {
    const perimetre = candidats(4);
    expect(() => tirerDerangement(perimetre.slice(0, 1), perimetre, graine(1))).toThrow(/au moins deux candidats interrogés/);
  });
});

/** Graine 20261202, cinq candidats `cand-00` à `cand-04` : figé le 2026-10-06. */
const VALEUR_FIGEE: Readonly<Record<string, string>> = {
  "cand-00": "cand-03",
  "cand-01": "cand-00",
  "cand-02": "cand-04",
  "cand-03": "cand-02",
  "cand-04": "cand-01",
};

describe("candidats déclarés", () => {
  const base: CandidatDuRun[] = [
    { candidat_id: "a", libelle: "Alix Martinez", nom: "Martinez" },
    { candidat_id: "b", libelle: "Maxime Le Brun", nom: "Le Brun" },
  ];

  it("deux candidats au même nom seul lèvent", () => {
    const doublon = [...base, { candidat_id: "c", libelle: "Paul Martinez", nom: "Martinez" }];
    expect(() => verifierCandidats(doublon)).toThrow(/« Martinez »/);
    expect(() => tirerDerangement(doublon, doublon, graine(1))).toThrow(/« Martinez »/);
  });

  it("deux candidats au même libellé lèvent", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "Alix Martinez", nom: "Autre" }])).toThrow(/« Alix Martinez »/);
  });

  it("un libellé égal au nom seul d'un autre candidat lève : la forme serait ambiguë", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "Le Brun", nom: "Brun" }])).toThrow(/« Le Brun »/);
  });

  it("un identifiant de candidat en double lève", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "a", libelle: "Paul Autre", nom: "Autre" }])).toThrow(/identifiant/);
  });

  it("un nom vide ou blanc lève", () => {
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "Paul Autre", nom: "  " }])).toThrow(/vide/);
    expect(() => verifierCandidats([...base, { candidat_id: "c", libelle: "", nom: "Autre" }])).toThrow(/vide/);
  });

  it("une forme ambiguë entre un candidat interrogé et un candidat non interrogé lève : l'unicité se vérifie sur tout le périmètre", () => {
    // « b » n'est pas interrogé (il n'est pas dans la liste passée en premier argument), mais sa
    // forme ambiguë avec « a » (nom seul « Brun », déjà libellé d'un autre candidat) doit lever.
    const perimetre = [...base, { candidat_id: "c", libelle: "Le Brun", nom: "Brun" }];
    const interroges = [base[0] as CandidatDuRun, perimetre[2] as CandidatDuRun];
    expect(() => tirerDerangement(interroges, perimetre, graine(1))).toThrow(/« Le Brun »/);
  });
});

/**
 * Cas construit de D55 (4) (constat 4 de la conformité du 2026-10-19, constat 5 de la revue du
 * 2026-10-12) : un périmètre de trois candidats, « a » et « c » interrogés, « b » non interrogé.
 * Graine 2 : sous l'ancien dérangement (tiré sur tout le périmètre), l'image de « c » est « b », un
 * candidat non interrogé. Avant la correction, cela rend le côté permuté d'une Q-ATT qui cite à tort
 * « c » (interrogé) indécidable (« candidat cité au périmètre mais non interrogé »,
 * `note-attribution.ts`), au lieu de rester comparable à l'origine (« en trop », mauvaise
 * attribution) : le test ci-dessous, écrit avant la correction, échouait pour cette raison.
 */
describe("cas construit D55 (4) : l'image d'un candidat interrogé n'est jamais un non-interrogé", () => {
  const A: CandidatDuRun = { candidat_id: "a", libelle: "Alix A", nom: "A" };
  const B: CandidatDuRun = { candidat_id: "b", libelle: "Bela B", nom: "B" };
  const C: CandidatDuRun = { candidat_id: "c", libelle: "Cora C", nom: "C" };
  const PERIMETRE = [A, B, C];
  const INTERROGES = [A, C];
  const GRAINE_DU_CAS = graine(2);

  it("avec le dérangement d'autrefois (tiré sur tout le périmètre), l'image de « c » était « b », non interrogé", () => {
    // Document le défaut tel qu'il se produisait : un dérangement tiré sur tout le périmètre.
    const ancien = tirerDerangement(PERIMETRE, PERIMETRE, GRAINE_DU_CAS);
    expect(correspondancesDe(ancien)["c"]).toBe("b");
  });

  it("corrigé : l'image de « c », candidat interrogé, est elle-même interrogée", () => {
    const corrige = tirerDerangement(INTERROGES, PERIMETRE, GRAINE_DU_CAS);
    const image_c = correspondancesDe(corrige)["c"];
    expect(image_c).toBeDefined();
    expect(INTERROGES.map((cand) => cand.candidat_id)).toContain(image_c);
    expect(image_c).not.toBe("b");
  });

  it("le candidat non interrogé « b » n'a pas d'image : son nom reste en clair dans le texte permuté", () => {
    const corrige = tirerDerangement(INTERROGES, PERIMETRE, GRAINE_DU_CAS);
    expect(correspondancesDe(corrige)["b"]).toBeUndefined();
  });
});
