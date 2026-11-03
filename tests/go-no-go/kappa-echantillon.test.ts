/**
 * Kappa juges-humains de l'échantillon humain (§7, §12 ; D24 (1) et (2)) et son critère.
 *
 * Les matrices de confusion sont choisies pour tomber sur des fractions exactes : 3/4 (seuil),
 * 50/67 (juste en dessous), 9/10 et 7/10.
 */

import { describe, expect, it } from "vitest";
import { critereKappaJugesHumains } from "../../pipeline/go-no-go/criteres-juges.ts";
import {
  kappasEchantillon,
  NotationDeJugeIntrouvable,
  ReferenceHumaineIndefinie,
  referenceHumaine,
  RefusNoteParUnJuge,
  SEUIL_KAPPA_ECHANTILLON,
} from "../../pipeline/go-no-go/kappa-echantillon.ts";
import { AUCUN_JUGE_RETENU } from "../../pipeline/go-no-go/types.ts";
import { JugeIndetermine } from "../../pipeline/notation/decision.ts";
import type { JugeDuRun } from "../../pipeline/notation/types.ts";
import { comptesKappa, kappaCohen } from "../../validation/domaine/kappa.ts";
import { notationJuge, notationRegle, renvoiJuge } from "../notation/fabriques.ts";
import { ulid } from "../analysis/fabriques.ts";
import { echantillonSynthetique, fois, type LigneEchantillon } from "./aides.ts";

const DEUX_JUGES: readonly JugeDuRun[] = [
  { juge_id: "j1", retire: false },
  { juge_id: "j2", retire: false },
];

/** Matrice juge × humain sur (exacte, inexacte) : a = e/e, b = e/i, c = i/e, d = i/i. */
function matrice(juge: string, a: number, b: number, c: number, d: number): readonly LigneEchantillon[] {
  return [
    ...fois(a, { juges: { [juge]: "exacte" }, humains: ["exacte", "exacte"] }),
    ...fois(b, { juges: { [juge]: "exacte" }, humains: ["inexacte", "inexacte"] }),
    ...fois(c, { juges: { [juge]: "inexacte" }, humains: ["exacte", "exacte"] }),
    ...fois(d, { juges: { [juge]: "inexacte" }, humains: ["inexacte", "inexacte"] }),
  ];
}

function kappaUnJuge(lignes: readonly LigneEchantillon[]) {
  const { echantillon, notations } = echantillonSynthetique(lignes);
  return kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations, renvois: [] }).kappas;
}

describe("noyau partagé du kappa (validation/domaine/kappa.ts)", () => {
  it("comptesKappa rend les entiers dont kappaCohen tire le kappa publié", () => {
    const paires = [
      { a: "x", b: "x" },
      { a: "x", b: "y" },
      { a: "y", b: "y" },
    ] as const;
    const comptes = comptesKappa(paires, ["x", "y"]);
    expect(comptes).toEqual({ n: 3, accords: 2, attendus: 4 });
    expect(kappaCohen(paires, ["x", "y"]).kappa).toBe((2 * 3 - 4) / (9 - 4));
  });
});

describe("kappa de l'échantillon, seuil de 0,75 (§12)", () => {
  it("kappa exactement 0,75 : vert (« ≥ 0,75 »)", () => {
    const [kappa] = kappaUnJuge(matrice("j1", 3, 0, 1, 4));
    expect(kappa?.kappa).toBe(0.75);
    expect(kappa?.atteint_seuil).toBe(true);
    expect(critereKappaJugesHumains(kappaUnJuge(matrice("j1", 3, 0, 1, 4)))).toEqual({ code: "kappa_juges_humains", statut: "vert", valeur: 0.75, seuil: 0.75 });
  });

  it("D65 ne touche pas ce seuil : 0,75 en fraction exacte, et un accord observé de 0,96 avec deux désaccords reste rouge", () => {
    // La seconde branche de l'accord suffisant (§4, D65) vaut pour les lots de validation, jamais
    // pour le kappa juges-humains du §12. Matrice 48/1/1/0 : A = 48, lignes et colonnes (49, 1),
    // B = 49² + 1 = 2402 ; κ = (48·50 − 2402)/(2500 − 2402) = −2/98.
    expect(SEUIL_KAPPA_ECHANTILLON).toEqual({ numerateur: 3, denominateur: 4 });
    const kappas = kappaUnJuge(matrice("j1", 48, 1, 1, 0));
    expect(kappas[0]?.kappa).toBe(-2 / 98);
    expect(kappas[0]?.atteint_seuil).toBe(false);
    expect(critereKappaJugesHumains(kappas)).toEqual({ code: "kappa_juges_humains", statut: "rouge", valeur: -2 / 98, seuil: 0.75 });
  });

  it("kappa juste en dessous de 0,75 (50/67) : rouge", () => {
    const kappas = kappaUnJuge(matrice("j1", 5, 0, 2, 10));
    expect(kappas[0]?.kappa).toBeCloseTo(50 / 67, 12);
    expect(kappas[0]?.atteint_seuil).toBe(false);
    expect(critereKappaJugesHumains(kappas).statut).toBe("rouge");
  });

  it("un juge à 0,9 et l'autre à 0,7 : rouge, valeur 0,7 (le plus petit)", () => {
    // Vingt réponses, dix exactes et dix inexactes selon les humains.
    const lignes: LigneEchantillon[] = [
      ...fois(9, { juges: { j1: "exacte", j2: "exacte" }, humains: ["exacte", "exacte"] }),
      { juges: { j1: "inexacte", j2: "inexacte" }, humains: ["exacte", "exacte"] },
      { juges: { j1: "inexacte", j2: "exacte" }, humains: ["inexacte", "inexacte"] },
      { juges: { j1: "inexacte", j2: "exacte" }, humains: ["inexacte", "inexacte"] },
      ...fois(8, { juges: { j1: "inexacte", j2: "inexacte" }, humains: ["inexacte", "inexacte"] }),
    ];
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const kappas = kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations, renvois: [] }).kappas;
    expect(kappas.map((k) => [k.juge_id, k.kappa])).toEqual([
      ["j1", 0.9],
      ["j2", 0.7],
    ]);
    expect(critereKappaJugesHumains(kappas)).toEqual({ code: "kappa_juges_humains", statut: "rouge", valeur: 0.7, seuil: 0.75 });
  });
});

describe("kappa indéfini (D24 (2)) : rouge, absent avec son motif", () => {
  it("tout l'échantillon dans une seule catégorie : accord attendu maximal", () => {
    const [kappa] = kappaUnJuge(fois(5, { juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }));
    expect(kappa).toMatchObject({ kappa: null, motif_indefini: "accord_attendu_maximal", atteint_seuil: false, n: 5 });
    const critere = critereKappaJugesHumains(kappa === undefined ? [] : [kappa]);
    expect(critere.statut).toBe("rouge");
    expect(critere.valeur).toBe("kappa indéfini pour j1 : accord_attendu_maximal");
  });

  it("échantillon vide : aucune réponse comparable, rouge", () => {
    const kappas = kappasEchantillon({ juges: DEUX_JUGES, echantillon: [], notations: [], renvois: [] }).kappas;
    expect(kappas.map((k) => [k.kappa, k.motif_indefini])).toEqual([
      [null, "aucune_reponse_comparable"],
      [null, "aucune_reponse_comparable"],
    ]);
    expect(critereKappaJugesHumains(kappas).statut).toBe("rouge");
  });
});

describe("note humaine retenue (D24 (1))", () => {
  it("deux humains en désaccord : la note de l'arbitre est la référence", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "inexacte"], arbitre: "non_reponse" }]);
    expect(referenceHumaine(echantillon[0] as string, notations)).toBe("non_reponse");
  });

  it("deux humains d'accord : leur note, un arbitre n'est pas lu", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["inexacte", "inexacte"] }]);
    expect(referenceHumaine(echantillon[0] as string, notations)).toBe("inexacte");
  });

  it("désaccord sans arbitre : erreur visible, aucune référence inventée", () => {
    const lignes: LigneEchantillon[] = [...matrice("j1", 3, 0, 1, 4), { juges: { j1: "exacte" }, humains: ["exacte", "inexacte"] }];
    expect(() => kappaUnJuge(lignes)).toThrow(ReferenceHumaineIndefinie);
    expect(() => kappaUnJuge(lignes)).toThrow(/arbitrage/);
  });

  it("double notation incomplète : erreur visible", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    const sansSeconde = notations.filter((n) => n.notateur.id !== "annotateur-2");
    expect(() => kappasEchantillon({ juges: DEUX_JUGES.slice(0, 1), echantillon, notations: sansSeconde, renvois: [] })).toThrow(/double notation incomplète/);
  });

  it("note humaine retenue « indeterminee » : c'est la référence lue, pas une erreur (D25 (1))", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["indeterminee", "indeterminee"] }]);
    expect(referenceHumaine(echantillon[0] as string, notations)).toBe("indeterminee");
  });

  it("arbitre « indeterminee » après un désaccord : la référence est indéterminée", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "inexacte"], arbitre: "indeterminee" }]);
    expect(referenceHumaine(echantillon[0] as string, notations)).toBe("indeterminee");
  });
});

describe("réponses à note humaine indéterminée (D25 (1)) : écartées du kappa, leur nombre publié", () => {
  it("une indéterminée parmi d'autres : écartée, compte 1, kappa sur le reste", () => {
    // Sans la réponse indéterminée, la matrice (3, 0, 1, 4) donne exactement 0,75. Le juge n'a pas
    // noté la réponse écartée : elle n'est pas lue du tout.
    const lignes: LigneEchantillon[] = [...matrice("j1", 3, 0, 1, 4), { juges: {}, humains: ["indeterminee", "indeterminee"] }];
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const resultat = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations, renvois: [] });
    expect(resultat.indeterminees).toBe(1);
    expect(resultat.kappas[0]).toMatchObject({ kappa: 0.75, n: 8, atteint_seuil: true });
  });

  it("toutes indéterminées : aucune réponse comparable, critère rouge", () => {
    const { echantillon, notations } = echantillonSynthetique(fois(3, { juges: { j1: "exacte" }, humains: ["indeterminee", "indeterminee"] }));
    const resultat = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations, renvois: [] });
    expect(resultat.indeterminees).toBe(3);
    expect(resultat.kappas[0]).toMatchObject({ kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0 });
    expect(critereKappaJugesHumains(resultat.kappas)).toMatchObject({ statut: "rouge", valeur: "kappa indéfini pour j1 : aucune_reponse_comparable" });
  });

  it("aucune indéterminée : compte 0, publié tel quel", () => {
    const { echantillon, notations } = echantillonSynthetique(matrice("j1", 3, 0, 1, 4));
    expect(kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations, renvois: [] }).indeterminees).toBe(0);
  });
});

describe("notations des juges sur l'échantillon", () => {
  it("notation du juge retenu absente sur une réponse de l'échantillon : erreur visible", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    expect(() => kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations, renvois: [] })).toThrow(NotationDeJugeIntrouvable);
  });

  it("un juge qui rend « indeterminee » est rejeté (§7)", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    const indetermine = notationJuge("j2", { objet_note: { type: "reponse", id: echantillon[0] as string }, categorie: "indeterminee" });
    expect(() => kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations: [...notations, indetermine], renvois: [] })).toThrow(JugeIndetermine);
  });
});

describe("juges retirés (D13)", () => {
  it("un juge retiré : ses notations n'entrent nulle part, seul le juge restant compte", () => {
    // j2 (retiré) n'a noté que la moitié de l'échantillon, en désaccord partout : sans effet.
    const lignes = matrice("j1", 3, 0, 1, 4).map((ligne, rang) => (rang % 2 === 0 ? { ...ligne, juges: { ...ligne.juges, j2: "non_reponse" as const } } : ligne));
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const kappas = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }, { juge_id: "j2", retire: true }], echantillon, notations, renvois: [] }).kappas;
    expect(kappas).toHaveLength(1);
    expect(kappas[0]).toMatchObject({ juge_id: "j1", kappa: 0.75 });
    expect(critereKappaJugesHumains(kappas).statut).toBe("vert");
  });

  it("tous les juges retirés : aucun kappa, critère rouge", () => {
    const { echantillon, notations } = echantillonSynthetique(matrice("j1", 3, 0, 1, 4));
    const kappas = kappasEchantillon({ juges: DEUX_JUGES.map((j) => ({ ...j, retire: true })), echantillon, notations, renvois: [] }).kappas;
    expect(kappas).toEqual([]);
    expect(critereKappaJugesHumains(kappas)).toEqual({ code: "kappa_juges_humains", statut: "rouge", valeur: AUCUN_JUGE_RETENU, seuil: 0.75 });
  });
});

/**
 * D32 : un refus de l'API n'a aucune note de juge, seulement la notation par règle. Comme un renvoi
 * (D31 (2) : aucun accord ne se mesure là où le juge n'a rendu aucune note), il est écarté du kappa,
 * ici de chaque juge, et leur nombre est publié une fois pour le run.
 */
describe("refus de l'API dans l'échantillon (D32)", () => {
  const regle = (reponse_id: string) => notationRegle({ id: ulid(`regle-kappa-${reponse_id}`), objet_note: { type: "reponse", id: reponse_id } });

  it("écarté du kappa de chaque juge, compté une fois ; le kappa porte sur le reste", () => {
    const lignes: LigneEchantillon[] = [...matrice("j1", 3, 0, 1, 4).map((l) => ({ ...l, juges: { ...l.juges, j2: "exacte" as const } })), { juges: {}, humains: ["non_reponse", "non_reponse"] }];
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const refus = echantillon[echantillon.length - 1] as string;
    const resultat = kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations: [...notations, regle(refus)], renvois: [] });
    expect(resultat.kappas[0]).toMatchObject({ juge_id: "j1", kappa: 0.75, n: 8, renvois_ecartes: 0 });
    expect(resultat.kappas[1]).toMatchObject({ juge_id: "j2", n: 8, renvois_ecartes: 0 });
    expect(resultat.refus_api).toBe(1);
    expect(resultat.indeterminees).toBe(0);
  });

  it("écarté avant la référence humaine : sa double notation encore absente ne bloque pas le kappa", () => {
    const { echantillon, notations } = echantillonSynthetique(matrice("j1", 3, 0, 1, 4));
    const refus = ulid("reponse-echantillon-refus-sans-humain");
    const resultat = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon: [...echantillon, refus], notations: [...notations, regle(refus)], renvois: [] });
    expect(resultat.kappas[0]).toMatchObject({ kappa: 0.75, n: 8 });
    expect(resultat.refus_api).toBe(1);
  });

  it("tout l'échantillon refusé : aucune_reponse_comparable, critère rouge (D24 (2))", () => {
    const refus = [ulid("refus-kappa-1"), ulid("refus-kappa-2")];
    const resultat = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon: refus, notations: refus.map(regle), renvois: [] });
    expect(resultat.kappas[0]).toMatchObject({ kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0 });
    expect(resultat.refus_api).toBe(2);
    expect(critereKappaJugesHumains(resultat.kappas).statut).toBe("rouge");
  });

  it("un refus noté par règle ET par un juge, ou renvoyé par un juge : incohérent, aucun kappa", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "non_reponse" }, humains: ["non_reponse", "non_reponse"] }]);
    const id = echantillon[0] as string;
    expect(() => kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations: [...notations, regle(id)], renvois: [] })).toThrow(RefusNoteParUnJuge);
    const sansJuge = notations.filter((n) => n.notateur.type !== "juge");
    const renvoi = renvoiJuge("j1", { id: ulid("renvoi-refus"), objet_note: { type: "reponse", id } });
    expect(() => kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations: [...sansJuge, regle(id)], renvois: [renvoi] })).toThrow(RefusNoteParUnJuge);
  });
});

/** D31 (2) : une réponse de l'échantillon renvoyée par un juge est écartée du kappa de CE juge. */
describe("renvois d'attribution dans l'échantillon (D31 (2))", () => {
  const renvoi = (juge_id: string, reponse_id: string) => renvoiJuge(juge_id, { id: ulid(`renvoi-kappa-${juge_id}-${reponse_id}`), objet_note: { type: "reponse", id: reponse_id } });

  it("un renvoi parmi d'autres : écarté de ce juge seulement, compté, kappa sur le reste", () => {
    // La réponse renvoyée par j1 n'a pas de notation de j1 ; j2 l'a notée et la garde.
    const lignes: LigneEchantillon[] = [...matrice("j1", 3, 0, 1, 4).map((l) => ({ ...l, juges: { ...l.juges, j2: "exacte" as const } })), { juges: { j2: "exacte" }, humains: ["exacte", "exacte"] }];
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const renvoyee = echantillon[echantillon.length - 1] as string;
    const resultat = kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations, renvois: [renvoi("j1", renvoyee)] });
    expect(resultat.kappas[0]).toMatchObject({ juge_id: "j1", kappa: 0.75, n: 8, renvois_ecartes: 1 });
    expect(resultat.kappas[1]).toMatchObject({ juge_id: "j2", n: 9, renvois_ecartes: 0 });
    expect(resultat.indeterminees).toBe(0);
  });

  it("tout écarté : aucune_reponse_comparable, critère rouge (D24 (2))", () => {
    const { echantillon, notations } = echantillonSynthetique(fois(2, { juges: {}, humains: ["exacte", "exacte"] }));
    const resultat = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }], echantillon, notations, renvois: echantillon.map((id) => renvoi("j1", id)) });
    expect(resultat.kappas[0]).toMatchObject({ kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0, renvois_ecartes: 2 });
    expect(critereKappaJugesHumains(resultat.kappas).statut).toBe("rouge");
  });

  it("renvoi d'un juge retiré : déjà écarté par D13, compté nulle part", () => {
    const { echantillon, notations } = echantillonSynthetique(matrice("j1", 3, 0, 1, 4));
    const resultat = kappasEchantillon({ juges: [{ juge_id: "j1", retire: false }, { juge_id: "j2", retire: true }], echantillon, notations, renvois: [renvoi("j2", echantillon[0] as string)] });
    expect(resultat.kappas).toHaveLength(1);
    expect(resultat.kappas[0]).toMatchObject({ juge_id: "j1", renvois_ecartes: 0 });
  });

  it("note de juge absente sans renvoi : l'erreur est maintenue ; renvoi et notation du même juge : erreur aussi", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }]);
    expect(() => kappasEchantillon({ juges: DEUX_JUGES, echantillon, notations, renvois: [renvoi("j1", echantillon[0] as string)] })).toThrow(NotationDeJugeIntrouvable);
  });
});

/**
 * D64 (protocole 0.27) et D70 : une réponse dont la note humaine retenue ou la note d'un juge retenu
 * est « non classée, référence incomplète » est écartée du kappa de chaque juge et comptée à part,
 * comme une indéterminée sous D25.
 */
describe("D64, D70 : une réponse non classée est écartée du kappa de l'échantillon, comptée à part", () => {
  const BASE = matrice("j1", 3, 1, 1, 3);
  const UN_JUGE = [{ juge_id: "j1", retire: false }];

  function resultatDe(lignes: readonly LigneEchantillon[], jugeNonClasse = false) {
    const { echantillon, notations } = echantillonSynthetique(lignes);
    const dernier = echantillon[echantillon.length - 1];
    const notees = jugeNonClasse
      ? notations.map((n) => (n.notateur.type === "juge" && n.objet_note.id === dernier ? { ...n, categorie: "non_classee" as const, motif_non_classement: "reference_incomplete" as const } : n))
      : notations;
    return kappasEchantillon({ juges: UN_JUGE, echantillon, notations: notees, renvois: [] });
  }

  it("note humaine retenue non classée : kappa inchangé par rapport à l'échantillon sans elle, compte 1", () => {
    const sans = resultatDe(BASE);
    const avec = resultatDe([...BASE, { juges: { j1: "exacte" }, humains: ["non_classee", "non_classee"] }]);
    expect(avec.kappas).toEqual(sans.kappas);
    expect(avec.non_classees).toBe(1);
    expect(sans.non_classees).toBe(0);
    expect(avec.indeterminees).toBe(0);
  });

  it("note du juge non classée : kappa inchangé par rapport à l'échantillon sans elle, compte 1", () => {
    const sans = resultatDe(BASE);
    const avec = resultatDe([...BASE, { juges: { j1: "exacte" }, humains: ["exacte", "exacte"] }], true);
    expect(avec.kappas).toEqual(sans.kappas);
    expect(avec.non_classees).toBe(1);
  });
});
