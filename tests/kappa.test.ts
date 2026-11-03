/**
 * Kappa de Cohen — cas vérifiés à la main.
 *
 * Chaque cas porte son arithmétique en commentaire. Un test de calcul dont on ne peut pas
 * refaire le calcul de tête ne prouve rien : il fige ce que le code fait, pas ce qu'il doit
 * faire. Notation utilisée : A = somme de la diagonale, B = somme des produits marginaux,
 * κ = (A·n − B) / (n² − B).
 */

import { describe, expect, it } from "vitest";
import {
  accordSuffisant,
  alerteReannotation,
  CATEGORIES_KAPPA,
  categorieDe,
  comptesKappaPublie,
  kappaCohen,
  kappaPublie,
  kappaQuestion,
} from "../validation/domaine/kappa.ts";
import type { Decision } from "../validation/domaine/types.ts";

/** Fabrique n paires identiques, pour écrire une matrice de confusion en clair. */
function paires(cellules: readonly (readonly [Decision, Decision, number])[]) {
  const liste: { a: Decision; b: Decision }[] = [];
  for (const [a, b, effectif] of cellules) {
    for (let i = 0; i < effectif; i += 1) liste.push({ a, b });
  }
  return liste;
}

describe("catégories du kappa publié", () => {
  it("fond accepter et corriger en « retenu », sépare rejeté et non évaluable", () => {
    expect(categorieDe("accepter")).toBe("retenu");
    expect(categorieDe("corriger")).toBe("retenu");
    expect(categorieDe("rejeter")).toBe("rejete");
    expect(categorieDe("non_evaluable")).toBe("non_evaluable");
  });

  it("fixe trois catégories a priori, dans un ordre stable", () => {
    expect(CATEGORIES_KAPPA).toEqual(["retenu", "rejete", "non_evaluable"]);
  });
});

describe("kappa de Cohen, cas calculés à la main", () => {
  it("κ = 0,4 sur un 2×2 : n=50, A=35, B=1250", () => {
    // retenu/retenu 20 · retenu/rejeté 5 · rejeté/retenu 10 · rejeté/rejeté 15
    // A = 20+15 = 35 → p₀ = 35/50 = 0,70
    // marges : (25,25) et (30,20) → B = 25·30 + 25·20 = 1250 → pₑ = 1250/2500 = 0,50
    // κ = (35·50 − 1250) / (2500 − 1250) = 500/1250 = 0,4
    const resultat = kappaPublie(
      paires([
        ["accepter", "accepter", 20],
        ["accepter", "rejeter", 5],
        ["rejeter", "accepter", 10],
        ["rejeter", "rejeter", 15],
      ]),
    );
    expect(resultat.kappa).toBe(0.4);
    expect(resultat.accord_observe).toBe(0.7);
    expect(resultat.accord_attendu).toBe(0.5);
    expect(resultat.n).toBe(50);
    expect(resultat.motif_indefini).toBeNull();
  });

  it("la troisième catégorie inutilisée ne déforme pas le résultat", () => {
    // Même matrice que ci-dessus : les marges de « non évaluable » valent 0, leur produit aussi.
    const avec = kappaPublie(
      paires([
        ["accepter", "accepter", 20],
        ["accepter", "rejeter", 5],
        ["rejeter", "accepter", 10],
        ["rejeter", "rejeter", 15],
      ]),
    );
    const sans = kappaCohen(
      paires([
        ["accepter", "accepter", 20],
        ["accepter", "rejeter", 5],
        ["rejeter", "accepter", 10],
        ["rejeter", "rejeter", 15],
      ]).map((p) => ({ a: categorieDe(p.a), b: categorieDe(p.b) })),
      ["retenu", "rejete"],
    );
    expect(avec.kappa).toBe(sans.kappa);
  });

  it("κ = 0,80 exactement : la frontière du §4 ne déclenche pas l'alerte", () => {
    // 23/2/3/22 → A = 45 → p₀ = 0,90 ; marges (25,25) et (26,24)
    // B = 25·26 + 25·24 = 1250 → pₑ = 0,50 ; κ = (45·50 − 1250)/1250 = 1000/1250 = 0,8
    const lot = paires([
      ["accepter", "accepter", 23],
      ["accepter", "rejeter", 2],
      ["rejeter", "accepter", 3],
      ["rejeter", "rejeter", 22],
    ]);
    const resultat = kappaPublie(lot);
    expect(resultat.kappa).toBe(0.8);
    expect(alerteReannotation(comptesKappaPublie(lot))).toBe(false);
  });

  it("κ juste sous 0,80 déclenche l'alerte", () => {
    // 23/2/4/21 → A = 44 → p₀ = 0,88 ; marges (25,25) et (27,23)
    // B = 25·27 + 25·23 = 1250 ; κ = (44·50 − 1250)/1250 = 950/1250 = 0,76
    const lot = paires([
      ["accepter", "accepter", 23],
      ["accepter", "rejeter", 2],
      ["rejeter", "accepter", 4],
      ["rejeter", "rejeter", 21],
    ]);
    const resultat = kappaPublie(lot);
    expect(resultat.kappa).toBe(0.76);
    expect(alerteReannotation(comptesKappaPublie(lot))).toBe(true);
  });

  it("κ = −1 en désaccord total", () => {
    // 0/25/25/0 → A = 0 ; marges (25,25) et (25,25) → B = 1250
    // κ = (0 − 1250)/(2500 − 1250) = −1
    const lot = paires([
      ["accepter", "rejeter", 25],
      ["rejeter", "accepter", 25],
    ]);
    const resultat = kappaPublie(lot);
    expect(resultat.kappa).toBe(-1);
    expect(alerteReannotation(comptesKappaPublie(lot))).toBe(true);
  });

  it("κ sur trois catégories réellement utilisées : 284/434", () => {
    // lignes = annotateur A, colonnes = annotateur B, n = 30
    //   retenu       [18, 2, 1] → 21
    //   rejeté       [ 1, 4, 0] →  5
    //   non évaluable[ 1, 0, 3] →  4
    //   colonnes : 20, 6, 4
    // A = 18+4+3 = 25 ; B = 21·20 + 5·6 + 4·4 = 420+30+16 = 466
    // κ = (25·30 − 466) / (900 − 466) = 284/434
    const resultat = kappaPublie(
      paires([
        ["accepter", "corriger", 18],
        ["accepter", "rejeter", 2],
        ["accepter", "non_evaluable", 1],
        ["rejeter", "accepter", 1],
        ["rejeter", "rejeter", 4],
        ["non_evaluable", "accepter", 1],
        ["non_evaluable", "non_evaluable", 3],
      ]),
    );
    expect(resultat.kappa).toBe(284 / 434);
    expect(resultat.accord_observe).toBe(25 / 30);
    expect(resultat.accord_attendu).toBe(466 / 900);
    expect(resultat.n).toBe(30);
  });
});

describe("kappa indéfini", () => {
  it("unanimité des deux annotateurs : null, et surtout pas 1", () => {
    // A = 50 → p₀ = 1 ; marges (50,50) → B = 2500 → pₑ = 1 ; dénominateur nul.
    const resultat = kappaPublie(paires([["accepter", "accepter", 50]]));
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("accord_attendu_maximal");
    expect(resultat.accord_observe).toBe(1);
    expect(resultat.accord_attendu).toBe(1);
    expect(resultat.n).toBe(50);
  });

  it("ne déclenche jamais de réannotation : un accord parfait n'est pas un désaccord", () => {
    expect(alerteReannotation(comptesKappaPublie(paires([["accepter", "accepter", 50]])))).toBe(false);
  });

  it("aucun item commun : null, avec son propre motif, et pas d'accord observé inventé", () => {
    const resultat = kappaPublie([]);
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("aucun_item_commun");
    expect(resultat.accord_observe).toBeNull();
    expect(resultat.accord_attendu).toBeNull();
    expect(resultat.n).toBe(0);
  });

  it("unanimité sur « non évaluable » aussi : la dégénérescence ne dépend pas de la catégorie", () => {
    const resultat = kappaPublie(paires([["non_evaluable", "non_evaluable", 12]]));
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("accord_attendu_maximal");
  });
});

describe("kappa par question de la grille", () => {
  it("écarte les paires dont une réponse est sans objet, sans les compter comme désaccord", () => {
    // 8 paires utilisables : 3 oui/oui, 1 oui/non, 1 non/oui, 3 non/non
    // A = 6 → p₀ = 0,75 ; marges (4,4) et (4,4) → B = 16+16 = 32 → pₑ = 32/64 = 0,5
    // κ = (6·8 − 32)/(64 − 32) = 16/32 = 0,5
    const resultat = kappaQuestion([
      { a: true, b: true },
      { a: true, b: true },
      { a: true, b: true },
      { a: true, b: false },
      { a: false, b: true },
      { a: false, b: false },
      { a: false, b: false },
      { a: false, b: false },
      { a: null, b: false },
      { a: true, b: null },
      { a: null, b: null },
    ]);
    expect(resultat.n).toBe(8);
    expect(resultat.kappa).toBe(0.5);
  });

  it("ne renvoie aucun kappa quand la question est sans objet pour tout le lot", () => {
    const resultat = kappaQuestion([
      { a: null, b: null },
      { a: null, b: null },
    ]);
    expect(resultat.kappa).toBeNull();
    expect(resultat.motif_indefini).toBe("aucun_item_commun");
    expect(resultat.n).toBe(0);
  });
});

/**
 * §4 (0.27, D65) : « L'accord d'un lot est suffisant quand son kappa est supérieur ou égal à 0,80,
 * ou quand son accord observé est supérieur ou égal à 0,96 avec au plus deux désaccords sur les
 * 50 items ». Un désaccord est une paire hors de la diagonale : n − A.
 */
describe("accord suffisant d'un lot (§4, D65)", () => {
  function accord(cellules: readonly (readonly [Decision, Decision, number])[]) {
    const lot = paires(cellules);
    return { kappa: kappaPublie(lot), comptes: comptesKappaPublie(lot), suffisant: accordSuffisant(comptesKappaPublie(lot)) };
  }

  it("κ = 0,80 exactement : suffisant", () => {
    // Même matrice que plus haut : A = 45, B = 1250, κ = 1000/1250 = 0,8 ; 5 désaccords.
    const { kappa, suffisant } = accord([
      ["accepter", "accepter", 23],
      ["accepter", "rejeter", 2],
      ["rejeter", "accepter", 3],
      ["rejeter", "rejeter", 22],
    ]);
    expect(kappa.kappa).toBe(0.8);
    expect(suffisant).toBe(true);
  });

  it("κ ≈ 0,799 et accord observé 0,94 : non suffisant", () => {
    // retenu/retenu 40, retenu/rejeté 1, rejeté/retenu 1, rejeté/rejeté 7, non évaluable/rejeté 1.
    // Lignes (41, 8, 1), colonnes (41, 9, 0) → B = 41·41 + 8·9 + 0 = 1753 ; A = 47 → p₀ = 0,94.
    // κ = (47·50 − 1753)/(2500 − 1753) = 597/747 ≈ 0,7992 ; 3 désaccords.
    const { kappa, comptes, suffisant } = accord([
      ["accepter", "accepter", 40],
      ["accepter", "rejeter", 1],
      ["rejeter", "accepter", 1],
      ["rejeter", "rejeter", 7],
      ["non_evaluable", "rejeter", 1],
    ]);
    expect(kappa.kappa).toBe(597 / 747);
    expect(kappa.accord_observe).toBe(0.94);
    expect(comptes.n - comptes.accords).toBe(3);
    expect(suffisant).toBe(false);
    expect(alerteReannotation(comptes)).toBe(true);
  });

  it("κ = 0 avec 49 accords sur 50 : suffisant par l'accord observé", () => {
    // Lignes (50, 0), colonnes (49, 1) → B = 50·49 = 2450 ; A = 49 ; κ = (2450 − 2450)/50 = 0.
    const { kappa, comptes, suffisant } = accord([
      ["accepter", "accepter", 49],
      ["accepter", "rejeter", 1],
    ]);
    expect(kappa.kappa).toBe(0);
    expect(kappa.accord_observe).toBe(0.98);
    expect(suffisant).toBe(true);
    expect(alerteReannotation(comptes)).toBe(false);
  });

  it("marges 46/3/1 avec deux désaccords : κ ≈ 0,73, accord observé 0,96, suffisant", () => {
    // retenu/retenu 45, retenu/rejeté 1, rejeté/retenu 1, rejeté/rejeté 2, non évaluable 1.
    // Lignes et colonnes (46, 3, 1) → B = 2116 + 9 + 1 = 2126 ; A = 48.
    // κ = (2400 − 2126)/(2500 − 2126) = 274/374 ≈ 0,733.
    const { kappa, comptes, suffisant } = accord([
      ["accepter", "accepter", 45],
      ["accepter", "rejeter", 1],
      ["rejeter", "accepter", 1],
      ["rejeter", "rejeter", 2],
      ["non_evaluable", "non_evaluable", 1],
    ]);
    expect(kappa.kappa).toBe(274 / 374);
    expect(kappa.accord_observe).toBe(0.96);
    expect(comptes.n - comptes.accords).toBe(2);
    expect(suffisant).toBe(true);
  });

  it("trois désaccords sur 50 (accord observé 0,94) et κ faible : non suffisant", () => {
    // Lignes (50, 0), colonnes (47, 3) → B = 2350 ; A = 47 ; κ = 0.
    const { kappa, suffisant } = accord([
      ["accepter", "accepter", 47],
      ["accepter", "rejeter", 3],
    ]);
    expect(kappa.kappa).toBe(0);
    expect(kappa.accord_observe).toBe(0.94);
    expect(suffisant).toBe(false);
  });

  it("frontière de l'accord observé : exactement 0,96 avec deux désaccords, suffisant", () => {
    // Lignes (50, 0), colonnes (48, 2) → B = 2400 ; A = 48 ; κ = 0 ; p₀ = 48/50 = 0,96.
    const { kappa, suffisant } = accord([
      ["accepter", "accepter", 48],
      ["accepter", "rejeter", 2],
    ]);
    expect(kappa.kappa).toBe(0);
    expect(kappa.accord_observe).toBe(0.96);
    expect(suffisant).toBe(true);
  });

  it("deux désaccords sur 49 (une contestation retirée) : 47/49 < 0,96, non suffisant", () => {
    // L'effectif est celui du kappa publié (n, contestations déduites) : deux désaccords ne
    // suffisent pas seuls, l'accord observé doit aussi atteindre 0,96.
    const { kappa, suffisant } = accord([
      ["accepter", "accepter", 47],
      ["accepter", "rejeter", 2],
    ]);
    expect(kappa.accord_observe).toBe(47 / 49);
    expect(suffisant).toBe(false);
  });

  it("un seul désaccord sur 20 : accord observé 0,95, non suffisant", () => {
    // Sur un effectif plus petit que 50, « au plus deux désaccords » ne dispense pas du 0,96.
    const { suffisant } = accord([
      ["accepter", "accepter", 19],
      ["accepter", "rejeter", 1],
    ]);
    expect(suffisant).toBe(false);
  });

  it("kappa indéfini par accord attendu maximal : suffisant (accord observé 1, aucun désaccord), sans alerte", () => {
    // Le kappa n'est pas défini, mais l'accord observé l'est : la seconde branche du §4 s'applique
    // telle qu'écrite. L'absence d'alerte est celle d'avant D65 (« un kappa indéfini ne déclenche
    // pas de réannotation »).
    const { kappa, comptes, suffisant } = accord([["accepter", "accepter", 50]]);
    expect(kappa.kappa).toBeNull();
    expect(kappa.motif_indefini).toBe("accord_attendu_maximal");
    expect(suffisant).toBe(true);
    expect(alerteReannotation(comptes)).toBe(false);
  });

  it("kappa indéfini faute d'item commun : accord non décidable (null), sans alerte", () => {
    // Ni kappa ni accord observé : rien n'est observé, l'accord n'est ni suffisant ni insuffisant.
    const comptes = comptesKappaPublie([]);
    expect(accordSuffisant(comptes)).toBeNull();
    expect(alerteReannotation(comptes)).toBe(false);
  });
});

describe("garde-fous", () => {
  it("lève sur une catégorie hors du jeu fixé a priori, au lieu de l'ignorer", () => {
    expect(() => kappaCohen([{ a: "retenu", b: "inconnue" as "retenu" }], CATEGORIES_KAPPA)).toThrow(
      /hors du jeu fixé a priori/,
    );
  });
});
