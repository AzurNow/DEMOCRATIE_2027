/**
 * §2 (protocole 0.24, D59 (5)) : corrélation exploratoire entre le taux d'erreur par candidat et le
 * nombre de ses items P vérifiés. « Elle est calculée pour chaque couple outil × mode comparé :
 * c'est le coefficient de rang de Spearman entre le taux d'erreur de chaque candidat, un moins son
 * exactitude, et le nombre de ses items P vérifiés, compté comme pour le seuil de couverture
 * (section 4) ; les candidats sous ce seuil n'y entrent pas. Elle est publiée sans intervalle, avec
 * l'étiquette « exploratoire ». Sous trois candidats, elle n'est pas calculée, et le motif est publié. »
 */

import { describe, expect, it } from "vitest";
import {
  coefficientDeSpearman,
  correlationCouverture,
  correlationsParCouple,
  rangsMoyens,
} from "../../analysis/correlation-couverture.ts";
import { candidatsComparables } from "../../analysis/seuils.ts";
import type { CandidatAuGel, CoupleOutilMode } from "../../analysis/types.ts";
import { candidat, itemsPAuGel, run, unites } from "./fabriques.ts";

const COUPLE: CoupleOutilMode = { outil_id: "outil-alpha", mode: "web_desactivee" };

function candidatAvec(candidat_id: string, items: number, sous_seuil = false): CandidatAuGel {
  return candidat({ candidat_id, items_p_verifies: items, items_p_au_gel: itemsPAuGel(candidat_id, items), sous_seuil });
}

/** `exactes` réponses exactes et `inexactes` inexactes du candidat, dans le couple. */
function reponses(candidat_id: string, exactes: number, inexactes: number) {
  return [
    ...unites(exactes, { candidat_id, categorie: "exacte" }),
    ...unites(inexactes, { candidat_id, categorie: "inexacte" }),
  ];
}

function calculer(candidats: readonly CandidatAuGel[], jeu: Parameters<typeof correlationCouverture>[0]) {
  const perimetre = run({ perimetre: { candidats, outils: [] } });
  return correlationCouverture(jeu, COUPLE, candidatsComparables(perimetre), perimetre.perimetre.candidats);
}

describe("rangsMoyens", () => {
  it("donne leurs rangs, de 1 à n, à des valeurs distinctes", () => {
    expect(rangsMoyens([30, 10, 20], (a, b) => a - b)).toEqual([3, 1, 2]);
  });

  it("donne aux ex æquo la moyenne des rangs qu'ils occupent", () => {
    expect(rangsMoyens([5, 5, 2, 9, 9, 9], (a, b) => a - b)).toEqual([2.5, 2.5, 1, 5, 5, 5]);
  });
});

describe("coefficientDeSpearman", () => {
  it("vaut −1 sur deux classements exactement inverses", () => {
    expect(coefficientDeSpearman([1, 2, 3], [3, 2, 1])).toBe(-1);
  });

  it("est la corrélation de Pearson des rangs moyens quand il y a des ex æquo", () => {
    // Rangs (2,5 ; 2,5 ; 1) contre (1 ; 2 ; 3) : covariance −1,5, variances 1,5 et 2.
    expect(coefficientDeSpearman([2.5, 2.5, 1], [1, 2, 3])).toBeCloseTo(-1.5 / Math.sqrt(3), 12);
  });

  it("est absent (null) quand un des deux classements est constant", () => {
    expect(coefficientDeSpearman([2, 2, 2], [1, 2, 3])).toBeNull();
  });
});

describe("correlationCouverture", () => {
  it("rend −1 quand le candidat le plus couvert est le moins en erreur, avec l'étiquette exploratoire", () => {
    const resultat = calculer(
      [candidatAvec("c1", 30), candidatAvec("c2", 20), candidatAvec("c3", 10)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...reponses("c3", 5, 5)],
    );
    expect(resultat.exploratoire).toBe(true);
    expect(resultat.coefficient).toBe(-1);
    expect(resultat.motif_absence).toBeNull();
    expect(resultat.points.map((p) => [p.candidat_id, p.taux_erreur.numerateur, p.taux_erreur.denominateur, p.items_p_verifies])).toEqual([
      ["c1", 1, 10, 30],
      ["c2", 2, 10, 20],
      ["c3", 5, 10, 10],
    ]);
  });

  it("est calculée avec exactement trois candidats comparés", () => {
    const resultat = calculer(
      [candidatAvec("c1", 10), candidatAvec("c2", 20), candidatAvec("c3", 30)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...reponses("c3", 5, 5)],
    );
    expect(resultat.coefficient).toBe(1);
  });

  it("n'est pas calculée avec deux candidats comparés, et publie son motif", () => {
    const resultat = calculer([candidatAvec("c1", 30), candidatAvec("c2", 20)], [...reponses("c1", 9, 1), ...reponses("c2", 8, 2)]);
    expect(resultat.coefficient).toBeNull();
    expect(resultat.motif_absence).toBe("moins_de_trois_candidats");
    expect(resultat.points).toHaveLength(2);
  });

  it("traite les ex æquo de taux d'erreur par rangs moyens, sur l'égalité exacte des fractions", () => {
    // c1 : 1/2, c2 : 2/4 — même taux d'erreur ; c3 : 1/5.
    const resultat = calculer(
      [candidatAvec("c1", 10), candidatAvec("c2", 20), candidatAvec("c3", 30)],
      [...reponses("c1", 1, 1), ...reponses("c2", 2, 2), ...reponses("c3", 4, 1)],
    );
    expect(resultat.coefficient).toBeCloseTo(-1.5 / Math.sqrt(3), 12);
  });

  it("n'y fait pas entrer un candidat sous le seuil de couverture, qui ne compte pas pour les trois", () => {
    const resultat = calculer(
      [candidatAvec("c1", 30), candidatAvec("c2", 20), candidatAvec("c3", 5, true)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...reponses("c3", 5, 5)],
    );
    expect(resultat.points.map((p) => p.candidat_id)).toEqual(["c1", "c2"]);
    expect(resultat.motif_absence).toBe("moins_de_trois_candidats");
  });

  it("n'est pas calculée sur trois candidats dont un sans exactitude définie : exclu avant le compte (0.25)", () => {
    const resultat = calculer(
      [candidatAvec("c1", 30), candidatAvec("c2", 20), candidatAvec("c3", 10)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...unites(2, { candidat_id: "c3", categorie: "indeterminee" })],
    );
    expect(resultat.points).toHaveLength(2);
    expect(resultat.coefficient).toBeNull();
    expect(resultat.motif_absence).toBe("moins_de_trois_candidats");
  });

  it("donne leur rang moyen aux ex aequo de nombre d'items P vérifiés (0.25)", () => {
    // Items : c1 20, c2 20, c3 30 → rangs 1,5 ; 1,5 ; 3. Erreurs 1/10, 2/10, 5/10 → rangs 1 ; 2 ; 3.
    const resultat = calculer(
      [candidatAvec("c1", 20), candidatAvec("c2", 20), candidatAvec("c3", 30)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...reponses("c3", 5, 5)],
    );
    expect(resultat.coefficient).toBeCloseTo(coefficientDeSpearman([1, 2, 3], [1.5, 1.5, 3]) as number, 12);
    expect(resultat.coefficient).toBeCloseTo(1.5 / Math.sqrt(3), 12);
  });

  it("nomme à part un candidat comparé sans réponse classée, qui n'a pas de taux d'erreur", () => {
    const resultat = calculer(
      [candidatAvec("c1", 30), candidatAvec("c2", 20), candidatAvec("c3", 10)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...unites(3, { candidat_id: "c3", categorie: "indeterminee" })],
    );
    expect(resultat.candidats_sans_exactitude).toEqual(["c3"]);
    expect(resultat.points.map((p) => p.candidat_id)).toEqual(["c1", "c2"]);
    expect(resultat.coefficient).toBeNull();
    expect(resultat.motif_absence).toBe("moins_de_trois_candidats");
  });

  it("est absente avec son motif quand tous les candidats ont le même nombre d'items P vérifiés", () => {
    const resultat = calculer(
      [candidatAvec("c1", 20), candidatAvec("c2", 20), candidatAvec("c3", 20)],
      [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...reponses("c3", 5, 5)],
    );
    expect(resultat.coefficient).toBeNull();
    expect(resultat.motif_absence).toBe("rangs_constants");
  });

  it("lève sur une unité d'un autre couple", () => {
    expect(() =>
      calculer([candidatAvec("c1", 30)], unites(1, { candidat_id: "c1", outil_id: "outil-beta" })),
    ).toThrow(/outil-beta/);
  });
});

describe("correlationsParCouple", () => {
  it("rend une corrélation par couple comparé, et aucune pour un couple incomplet", () => {
    const perimetre = run({ perimetre: { candidats: [candidatAvec("c1", 30), candidatAvec("c2", 20), candidatAvec("c3", 10)], outils: [] } });
    const jeu = [...reponses("c1", 9, 1), ...reponses("c2", 8, 2), ...reponses("c3", 5, 5)];
    const incomplet = { outil_id: "outil-beta", mode: "web_activee" as const };
    const resultat = correlationsParCouple(
      [...jeu, ...unites(2, { outil_id: "outil-beta", mode: "web_activee", candidat_id: "c1" })],
      { compares: [COUPLE], incomplets: [incomplet] },
      candidatsComparables(perimetre),
      perimetre.perimetre.candidats,
    );
    expect(resultat.compares.map((c) => [c.outil_id, c.mode, c.coefficient])).toEqual([["outil-alpha", "web_desactivee", -1]]);
    expect(resultat.couples_incomplets).toEqual([incomplet]);
  });
});
