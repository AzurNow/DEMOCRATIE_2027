/**
 * Test d'asymétrie inter-candidats (§8, QR3/H4) — cas dont la valeur p se calcule à la main.
 *
 * « Les étiquettes de candidat sont permutées entre items 10 000 fois ; la statistique est
 * l'écart maximal absolu entre l'exactitude d'un candidat et l'exactitude moyenne de l'outil. »
 * Valeur p de Monte-Carlo : (1 + nombre de permutations au moins aussi extrêmes) / (1 + B).
 */

import { describe, expect, it } from "vitest";
import { generateur, graineDepuisTexte } from "../../validation/domaine/alea.ts";
import { graineDerivee } from "../../analysis/graines.ts";
import { intervalleBootstrap, percentile } from "../../analysis/bootstrap.ts";
import { exactitude } from "../../analysis/metriques.ts";
import {
  corrigerFamilleAsymetrie,
  ecartMaximal,
  grappesEtiquetees,
  permuterEtiquettes,
  PERMUTATIONS_PRODUCTION,
  testHomogeneiteCandidats,
} from "../../analysis/permutation.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const OPTIONS = { permutations: 200, graine_du_run: 20261201, cle: ["test", "permutation"] };

/**
 * Conformité n° 29 : le test publie aussi l'intervalle de l'écart maximal et celui de l'exactitude
 * de chaque candidat (§8), par le bootstrap en grappes. Il prend donc les options du bootstrap ;
 * les tests écrits avant ce constat les reçoivent, et leurs assertions ne changent pas.
 */
const BOOTSTRAP = { reechantillonnages: 200, graine_du_run: 20261202, cle: ["outil-alpha", "web_activee"] };

/**
 * Conformité n° 30 : le test prend le partage du seuil de couverture (§4, §8). Les tests écrits
 * avant ce constat posent des candidats tous au-dessus du seuil ; ils reçoivent ce partage, et
 * leurs assertions ne changent pas.
 */
const TOUS_COMPARES = {
  compares: ["candidat-a", "candidat-b", "candidat-c", "candidat-d"],
  rapportes_a_part: [],
};

/** `n` items d'un candidat, une réponse chacun, toutes de la même catégorie. */
function items(candidat_id: string, n: number, exacte: boolean, prefixe = candidat_id) {
  const jeu = [];
  for (let i = 0; i < n; i += 1) {
    jeu.push(
      ...grappe(`${prefixe}-item-${i}`, 1, {
        candidat_id,
        categorie: exacte ? "exacte" : "inexacte",
      }),
    );
  }
  return jeu;
}

describe("statistique et valeur p", () => {
  it("rend une valeur p maximale quand deux candidats ont la même exactitude", () => {
    // A : 2 exactes, 2 inexactes. B : 2 exactes, 2 inexactes. Exactitude de l'outil : 4/8 = 0,5.
    // Écart de chaque candidat à la moyenne : 0. Statistique observée : 0.
    // Toute permutation donne une statistique ≥ 0, donc les 200 comptent :
    // p = (1 + 200) / (1 + 200) = 1.
    const jeu = [
      ...items("candidat-a", 2, true, "a-exactes"),
      ...items("candidat-a", 2, false, "a-inexactes"),
      ...items("candidat-b", 2, true, "b-exactes"),
      ...items("candidat-b", 2, false, "b-inexactes"),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat?.statistique_observee).toBe(0);
    expect(resultat?.valeur_p).toBe(1);
    expect(resultat?.exactitude_de_reference).toBe(0.5);
  });

  it("rend une valeur p minimale quand un candidat est à 0 % face à trois candidats à 100 %", () => {
    // 4 candidats × 5 items. D : 5 inexactes. A, B, C : 5 exactes chacun.
    // Exactitude de l'outil : 15/20 = 0,75 — invariante par permutation des étiquettes.
    // Statistique observée : |0 − 0,75| = 0,75, c'est le maximum atteignable : il faut qu'un
    // candidat reçoive les 5 items inexacts, soit 4/C(20,5) = 4/15504 ≈ 0,026 % des permutations.
    // Sur 200 permutations, l'espérance du nombre de cas extrêmes est 0,05 : aucun ne tombe, et
    // p = (1 + 0) / (1 + 200) = 1/201 ≈ 0,00498.
    const jeu = [
      ...items("candidat-a", 5, true),
      ...items("candidat-b", 5, true),
      ...items("candidat-c", 5, true),
      ...items("candidat-d", 5, false),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat?.statistique_observee).toBeCloseTo(0.75, 12);
    expect(resultat?.valeur_p).toBeCloseTo(1 / 201, 12);
    expect(resultat?.candidats.find((c) => c.candidat_id === "candidat-d")?.exactitude).toEqual({
      numerateur: 0,
      denominateur: 5,
      valeur: 0,
    });
    expect(PERMUTATIONS_PRODUCTION).toBe(10000);
  });

  it("prend pour référence l'exactitude globale pondérée, pas la moyenne des candidats, quand leurs effectifs diffèrent", () => {
    // A : 10 classées, 10 exactes (1). B : 30 classées, 1 exacte (1/30).
    // Globale pondérée : 11/40 = 0,275 ⇒ écart maximal |1 − 0,275| = 0,725 (candidat A).
    // Moyenne des candidats : (1 + 1/30)/2 ≈ 0,5167 ⇒ écart maximal ≈ 0,4833. Les deux diffèrent.
    const jeu = [
      ...items("candidat-a", 10, true),
      ...items("candidat-b", 1, true, "b-exactes"),
      ...items("candidat-b", 29, false, "b-inexactes"),
    ];
    const globale = 11 / 40;
    const moyenneDesCandidats = (1 + 1 / 30) / 2;

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat?.exactitude_de_reference).toBe(globale);
    expect(resultat?.statistique_observee).toBeCloseTo(1 - globale, 12);
    expect(resultat?.statistique_observee).not.toBeCloseTo(1 - moyenneDesCandidats, 6);
  });

  it("ne teste rien quand il n'y a pas deux candidats à comparer", () => {
    expect(testHomogeneiteCandidats([], TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toBeNull();
    expect(testHomogeneiteCandidats(items("candidat-a", 3, true), TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toBeNull();
  });
});

describe("statistique de référence du test (§8, 0.32, D74 (5))", () => {
  // « L'exactitude globale de l'outil contre laquelle se lit la statistique […] est publiée comme
  // la statistique de référence du test, sous un nom qui l'en distingue, et sans intervalle : ce
  // n'est pas un taux publié au sens du paragraphe « Incertitude ». »

  it("est publiée sous son nom propre, valeur seule : ni effectifs, ni intervalle, ni graine, ni mention de taux dégénéré", () => {
    const jeu = [...items("candidat-a", 3, true), ...items("candidat-b", 1, false)];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat).not.toBeNull();
    expect(resultat).not.toHaveProperty("exactitude_outil");
    expect(resultat?.exactitude_de_reference).toBe(0.75);
    expect(typeof resultat?.exactitude_de_reference).toBe("number");
  });

  it("vaut 0 exactement quand aucune réponse classée n'est exacte, jamais absente", () => {
    // A : 2 inexactes. B : 3 inexactes. Globale 0/5 = 0 ; chaque candidat à 0, écart 0, p = 1.
    const jeu = [...items("candidat-a", 2, false), ...items("candidat-b", 3, false)];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat?.exactitude_de_reference).toBe(0);
    expect(resultat?.statistique_observee).toBe(0);
    expect(resultat?.valeur_p).toBe(1);
  });

  it("vaut 1 exactement quand toutes les réponses classées sont exactes", () => {
    const jeu = [...items("candidat-a", 2, true), ...items("candidat-b", 3, true)];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat?.exactitude_de_reference).toBe(1);
  });

  it("indéfinie quand l'outil n'a aucune réponse classée : pas de test, donc rien de publié, jamais 0", () => {
    // Deux candidats, des réponses obtenues mais aucune classée (non-réponse, indéterminée) : le
    // dénominateur de la référence est nul. Le test n'a pas d'objet (« test sans objet », §8) ;
    // `analyse-du-run.ts` le publie avec son motif, sans aucune exactitude de référence.
    const jeu = [
      ...grappe("a-non-reponse", 2, { candidat_id: "candidat-a", categorie: "non_reponse" }),
      ...grappe("b-indeterminee", 2, { candidat_id: "candidat-b", categorie: "indeterminee" }),
    ];

    expect(testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toBeNull();
  });
});

describe("candidats sous le seuil de couverture (conformité n° 30, §4 et §8)", () => {
  it("n'entre pas un candidat sous le seuil dans le test d'asymétrie, et le rapporte à part", () => {
    // A : 5 exactes. B : 5 exactes. C (sous le seuil) : 5 inexactes.
    // Avec C, la globale vaudrait 10/15 et l'écart de C |0 − 2/3| : une asymétrie fabriquée par un
    // candidat trop peu couvert pour être mesuré. Sans C : globale 10/10, écart 0, p = 201/201 = 1.
    const jeu = [...items("candidat-a", 5, true), ...items("candidat-b", 5, true), ...items("candidat-c", 5, false)];
    const partage = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: ["candidat-c"] };

    const resultat = testHomogeneiteCandidats(jeu, partage, OPTIONS, BOOTSTRAP);

    expect(resultat?.statistique_observee).toBe(0);
    expect(resultat?.valeur_p).toBe(1);
    expect(resultat?.exactitude_de_reference).toBe(1);
    expect(resultat?.candidats.map((c) => c.candidat_id)).toEqual(["candidat-a", "candidat-b"]);
    expect(resultat?.candidats_rapportes_a_part).toEqual(["candidat-c"]);
  });

  it("ne teste rien quand un seul candidat reste au-dessus du seuil", () => {
    const jeu = [...items("candidat-a", 3, true), ...items("candidat-c", 3, false)];
    const partage = { compares: ["candidat-a"], rapportes_a_part: ["candidat-c"] };

    expect(testHomogeneiteCandidats(jeu, partage, OPTIONS, BOOTSTRAP)).toBeNull();
  });

  it("refuse un candidat des unités absent du partage", () => {
    const jeu = [...items("candidat-a", 2, true), ...items("candidat-x", 2, false)];

    expect(() => testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toThrow(/candidat-x/);
  });
});

describe("intervalles publiés avec le test d'asymétrie (conformité n° 29, §8)", () => {
  // §8 : « Sont publiés la valeur p corrigée, l'écart maximal avec son intervalle, et l'exactitude
  // de chaque candidat avec son intervalle. » Lecture retenue (à écrire en 0.12) : l'intervalle de
  // l'écart vient du même bootstrap en grappes que les taux, grappe = item, l'écart recalculé sur
  // chaque rééchantillon avec `ecartMaximal`.
  /** Échoue bruyamment sur une absence plutôt que de laisser `?.` transformer l'assertion. */
  function present<T>(valeur: T | null | undefined): T {
    if (valeur === null || valeur === undefined) throw new Error("Valeur attendue, absente.");
    return valeur;
  }
  const hex = (cle: readonly string[]) => graineDerivee(BOOTSTRAP.graine_du_run, cle).toString(16).padStart(16, "0");

  /** Trois candidats de vingt items : A 15 exactes, B 8, C 12. Globale 35/60 ; écart max |8/20 − 35/60|. */
  function jeuOrdinaire() {
    return [
      ...items("candidat-a", 15, true, "a-exactes"),
      ...items("candidat-a", 5, false, "a-inexactes"),
      ...items("candidat-b", 8, true, "b-exactes"),
      ...items("candidat-b", 12, false, "b-inexactes"),
      ...items("candidat-c", 12, true, "c-exactes"),
      ...items("candidat-c", 8, false, "c-inexactes"),
    ];
  }

  it("rend l'écart maximal avec son intervalle, qui contient l'écart observé, sa clé et sa graine", () => {
    const resultat = present(testHomogeneiteCandidats(jeuOrdinaire(), TOUS_COMPARES, OPTIONS, BOOTSTRAP));
    const cle = ["bootstrap", "outil-alpha", "web_activee", "ecart_maximal", "global"];
    const observee = resultat.statistique_observee;

    expect(observee).toBeCloseTo(35 / 60 - 8 / 20, 12);
    const nomme = resultat.intervalle_ecart_maximal;
    expect(nomme.cle).toEqual(cle);
    expect(nomme.graine).toBe(hex(cle));
    expect(nomme.raison_sans_intervalle).toBeNull();
    const intervalle = present(nomme.intervalle);
    expect(intervalle.nombre_grappes).toBe(60);
    expect(intervalle.reechantillonnages).toBe(200);
    expect(intervalle.bas).toBeLessThanOrEqual(observee);
    expect(intervalle.haut).toBeGreaterThanOrEqual(observee);
    expect(intervalle.bas).toBeLessThan(intervalle.haut);
  });

  it("donne à chaque candidat d'effectifs très différents un intervalle calculé sur ses seules grappes", () => {
    // A : 30 items, 20 exactes. B : 3 items, 1 exacte. L'intervalle de B porte sur 3 grappes, pas 33.
    const jeu = [
      ...items("candidat-a", 20, true, "a-exactes"),
      ...items("candidat-a", 10, false, "a-inexactes"),
      ...items("candidat-b", 1, true, "b-exactes"),
      ...items("candidat-b", 2, false, "b-inexactes"),
    ];
    const seul = (candidat: string) => jeu.filter((u) => u.candidat_id === candidat);

    const resultat = present(testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP));
    const a = present(resultat.candidats.find((c) => c.candidat_id === "candidat-a"));
    const b = present(resultat.candidats.find((c) => c.candidat_id === "candidat-b"));

    expect(a.exactitude).toEqual({ numerateur: 20, denominateur: 30, valeur: 20 / 30 });
    expect(b.exactitude).toEqual({ numerateur: 1, denominateur: 3, valeur: 1 / 3 });
    const cleA = ["bootstrap", "outil-alpha", "web_activee", "exactitude_candidat", "candidat-a"];
    const cleB = ["bootstrap", "outil-alpha", "web_activee", "exactitude_candidat", "candidat-b"];
    expect(a.intervalle.cle).toEqual(cleA);
    expect(b.intervalle.cle).toEqual(cleB);
    expect(a.intervalle.graine).toBe(hex(cleA));
    expect(present(a.intervalle.intervalle).nombre_grappes).toBe(30);
    expect(present(b.intervalle.intervalle).nombre_grappes).toBe(3);
    // Même bootstrap que tout taux du §8, sur les seules unités du candidat, avec sa clé.
    expect(a.intervalle.intervalle).toEqual(
      intervalleBootstrap(seul("candidat-a"), exactitude, { ...BOOTSTRAP, cle: cleA.slice(1) }),
    );
    expect(b.intervalle.intervalle).toEqual(
      intervalleBootstrap(seul("candidat-b"), exactitude, { ...BOOTSTRAP, cle: cleB.slice(1) }),
    );
  });

  it("rend à part un candidat sous le seuil, sans taux ni intervalle, et le retire du bootstrap de l'écart", () => {
    const jeu = [
      ...items("candidat-a", 4, true, "a-exactes"),
      ...items("candidat-a", 1, false, "a-inexactes"),
      ...items("candidat-b", 2, true, "b-exactes"),
      ...items("candidat-b", 3, false, "b-inexactes"),
      ...items("candidat-c", 7, false),
    ];
    const partage = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: ["candidat-c"] };

    const resultat = testHomogeneiteCandidats(jeu, partage, OPTIONS, BOOTSTRAP);

    expect(resultat?.candidats_rapportes_a_part).toEqual(["candidat-c"]);
    expect(resultat?.candidats.map((c) => c.candidat_id)).toEqual(["candidat-a", "candidat-b"]);
    expect(resultat?.intervalle_ecart_maximal.intervalle?.nombre_grappes).toBe(10);
    expect(JSON.stringify(resultat?.candidats)).not.toContain("candidat-c");
  });

  it("écarte et compte les rééchantillons où l'écart n'est pas défini (candidat sans réponse classée tirée)", () => {
    // A : 5 items (3 exactes). B : 1 item exact. Un rééchantillon qui ne tire pas B n'a pas
    // d'exactitude de B : l'écart maximal, qui porte sur tous les candidats comparés, n'y est pas
    // défini. §8 : écarté du calcul des bornes, et compté. Les grappes sont rangées par grappe_id
    // (conformité n° 19, texte en 0.15) : l'indice de B est son rang dans cet ordre.
    const jeu = [
      ...items("candidat-a", 3, true, "a-exactes"),
      ...items("candidat-a", 2, false, "a-inexactes"),
      ...items("candidat-b", 1, true, "b-exactes"),
    ];
    const ids = [...new Set(jeu.map((u) => u.grappe_id))].sort();
    const grappes = ids.map((id) => jeu.filter((u) => u.grappe_id === id));
    const indiceB = ids.indexOf(ulid("b-exactes-item-0"));
    const cle = ["bootstrap", "outil-alpha", "web_activee", "ecart_maximal", "global"];
    const rng = generateur(graineDerivee(BOOTSTRAP.graine_du_run, cle));
    const valeurs: number[] = [];
    let indefinis = 0;
    for (let b = 0; b < BOOTSTRAP.reechantillonnages; b += 1) {
      const indices = grappes.map(() => rng.entier(grappes.length));
      if (!indices.includes(indiceB)) indefinis += 1;
      else valeurs.push(ecartMaximal(grappesEtiquetees(indices.flatMap((i) => grappes[i] ?? []))));
    }
    valeurs.sort((x, y) => x - y);

    const intervalle = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP)?.intervalle_ecart_maximal
      .intervalle;

    expect(indefinis).toBeGreaterThan(0);
    expect(intervalle?.reechantillonnages_indefinis).toBe(indefinis);
    expect(intervalle?.bas).toBe(percentile(valeurs, 0.025));
    expect(intervalle?.haut).toBe(percentile(valeurs, 0.975));
  });

  it("donne à chaque intervalle du résultat sa propre graine, et les mêmes bornes à entrée égale", () => {
    const premier = testHomogeneiteCandidats(jeuOrdinaire(), TOUS_COMPARES, OPTIONS, BOOTSTRAP);
    const second = testHomogeneiteCandidats(jeuOrdinaire(), TOUS_COMPARES, OPTIONS, BOOTSTRAP);
    const graines = [
      premier?.intervalle_ecart_maximal.graine,
      ...(premier?.candidats ?? []).map((c) => c.intervalle.graine),
    ];

    expect(graines).toHaveLength(4);
    expect(new Set(graines).size).toBe(4);
    expect(second).toEqual(premier);
  });

  it("ne rend aucun intervalle quand le test est sans objet (moins de deux candidats comparés)", () => {
    expect(testHomogeneiteCandidats(items("candidat-a", 5, true), TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toBeNull();
    const partage = { compares: ["candidat-a"], rapportes_a_part: ["candidat-b"] };
    const jeu = [...items("candidat-a", 5, true), ...items("candidat-b", 5, false)];
    expect(testHomogeneiteCandidats(jeu, partage, OPTIONS, BOOTSTRAP)).toBeNull();
  });
});

describe("effectifs par type des items entrés au test (conformité 2026-11-03 n° 9, §8, 0.27)", () => {
  // §8 : « Sont publiés […] et, pour chaque candidat, le nombre de ses items P, A, O et F entrés
  // dans le test, dont la composition pèse sur son exactitude (section 11). » Un item entre au
  // test s'il porte au moins une réponse classée de l'outil dans ce mode (§8, 0.15) ; il compte
  // une fois, quel que soit le nombre de ses réponses.

  /** Un item d'un type donné, `n` réponses de la même catégorie. */
  function itemType(cle: string, candidat_id: string, type: "P" | "A" | "O" | "F", n: number, categorie: "exacte" | "inexacte" | "non_reponse") {
    return grappe(cle, n, { candidat_id, type_item_principal: type, categorie });
  }

  function effectifs(resultat: ReturnType<typeof testHomogeneiteCandidats>, candidat_id: string) {
    const trouve = resultat?.candidats.find((c) => c.candidat_id === candidat_id);
    if (trouve === undefined) throw new Error(`Candidat ${candidat_id} absent du résultat.`);
    return trouve.items_par_type;
  }

  it("compte les items, pas les réponses, et publie 0 pour un type sans item — jamais une clé absente", () => {
    const jeu = [
      ...itemType("a-p1", "candidat-a", "P", 3, "exacte"),
      ...itemType("a-p2", "candidat-a", "P", 2, "inexacte"),
      ...itemType("a-f1", "candidat-a", "F", 4, "exacte"),
      ...itemType("b-a1", "candidat-b", "A", 1, "exacte"),
      ...itemType("b-o1", "candidat-b", "O", 6, "inexacte"),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(effectifs(resultat, "candidat-a")).toEqual({ P: 2, A: 0, O: 0, F: 1 });
    expect(effectifs(resultat, "candidat-b")).toEqual({ P: 0, A: 1, O: 1, F: 0 });
    expect(Object.keys(effectifs(resultat, "candidat-b"))).toEqual(["P", "A", "O", "F"]);
  });

  it("ne compte pas un item sans réponse classée (§8, 0.15), ni une question d'attribution", () => {
    const jeu = [
      ...itemType("a-p1", "candidat-a", "P", 2, "exacte"),
      ...itemType("a-o-muet", "candidat-a", "O", 3, "non_reponse"),
      ...itemType("b-f1", "candidat-b", "F", 1, "inexacte"),
      ...grappe("att", 2, { candidat_id: null, item_principal_id: null, type_item_principal: null, gabarit: "Q-ATT" }),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(effectifs(resultat, "candidat-a")).toEqual({ P: 1, A: 0, O: 0, F: 0 });
    expect(effectifs(resultat, "candidat-b")).toEqual({ P: 0, A: 0, O: 0, F: 1 });
  });

  it("publie quatre zéros pour un candidat comparé dont aucun item n'entre au test", () => {
    const jeu = [
      ...itemType("a-p1", "candidat-a", "P", 1, "exacte"),
      ...itemType("b-p1", "candidat-b", "P", 1, "inexacte"),
      ...itemType("c-muet", "candidat-c", "A", 2, "non_reponse"),
    ];

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);

    expect(resultat?.candidats.map((c) => c.candidat_id)).toEqual(["candidat-a", "candidat-b", "candidat-c"]);
    expect(effectifs(resultat, "candidat-c")).toEqual({ P: 0, A: 0, O: 0, F: 0 });
  });

  it("somme des effectifs de tous les candidats = population du test ; un candidat sous le seuil n'y entre pas", () => {
    const jeu = [
      ...itemType("a-p1", "candidat-a", "P", 2, "exacte"),
      ...itemType("a-a1", "candidat-a", "A", 1, "inexacte"),
      ...itemType("a-o-muet", "candidat-a", "O", 1, "non_reponse"),
      ...itemType("b-o1", "candidat-b", "O", 3, "exacte"),
      ...itemType("b-f1", "candidat-b", "F", 1, "exacte"),
      ...itemType("b-f2", "candidat-b", "F", 2, "inexacte"),
      ...itemType("c-p1", "candidat-c", "P", 5, "inexacte"),
    ];
    const partage = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: ["candidat-c"] };
    const population = grappesEtiquetees(jeu.filter((u) => u.candidat_id !== "candidat-c")).length;

    const resultat = testHomogeneiteCandidats(jeu, partage, OPTIONS, BOOTSTRAP);
    const somme = (resultat?.candidats ?? []).reduce(
      (total, c) => total + c.items_par_type.P + c.items_par_type.A + c.items_par_type.O + c.items_par_type.F,
      0,
    );

    expect(population).toBe(5);
    expect(somme).toBe(population);
    expect(JSON.stringify(resultat?.candidats)).not.toContain("candidat-c");
  });

  it("refuse un item dont les réponses portent deux types différents, ou un item de candidat sans type", () => {
    const melange = [
      ...itemType("a-p1", "candidat-a", "P", 1, "exacte"),
      ...itemType("item-melange", "candidat-a", "P", 1, "exacte"),
      ...itemType("item-melange", "candidat-a", "F", 1, "exacte"),
      ...itemType("b-p1", "candidat-b", "P", 1, "inexacte"),
    ];
    const sansType = [
      ...itemType("a-p1", "candidat-a", "P", 1, "exacte"),
      ...grappe("item-sans-type", 1, { candidat_id: "candidat-b", type_item_principal: null, categorie: "exacte" }),
    ];

    expect(() => testHomogeneiteCandidats(melange, TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toThrow(/type/);
    expect(() => testHomogeneiteCandidats(sansType, TOUS_COMPARES, OPTIONS, BOOTSTRAP)).toThrow(/type/);
  });
});

describe("famille de Holm du test d'asymétrie (conformité n° 82, protocole 0.11)", () => {
  /**
   * Un résultat de test dont seule la valeur p compte ici. Conformité n° 29 : le résultat porte
   * désormais l'intervalle de l'écart maximal ; il est posé absent, la famille de Holm ne le lit pas.
   */
  function resultat(valeur_p: number) {
    return {
      cle: ["permutation", "outil-alpha", "web_activee"],
      graine: "0000000000000000",
      statistique_observee: 0.1,
      valeur_p,
      permutations: 200,
      exactitude_de_reference: 0.5,
      intervalle_ecart_maximal: {
        cle: ["bootstrap", "outil-alpha", "web_activee", "ecart_maximal", "global"],
        graine: "0000000000000000",
        intervalle: null,
        raison_sans_intervalle: "aucune_grappe" as const,
      },
      candidats: [],
      candidats_rapportes_a_part: [],
    };
  }
  const ALPHA_ACT = { outil_id: "outil-alpha", mode: "web_activee" } as const;
  const ALPHA_DES = { outil_id: "outil-alpha", mode: "web_desactivee" } as const;
  const BETA_ACT = { outil_id: "outil-beta", mode: "web_activee" } as const;
  const BETA_DES = { outil_id: "outil-beta", mode: "web_desactivee" } as const;

  it("forme une famille d'une valeur p par couple outil × mode : deux outils × deux modes = quatre", () => {
    // m = 4. Triées : 0,01 · 0,03 · 0,04 · 0,20.
    // 0,01 × 4 = 0,04 ; 0,03 × 3 = 0,09 ; 0,04 × 2 = 0,08 → 0,09 ; 0,20 × 1 = 0,20.
    // Une famille par outil (m = 2) donnerait 0,02 pour alpha/web_activee : la famille compte.
    const famille = corrigerFamilleAsymetrie(
      [
        { couple: ALPHA_ACT, resultat: resultat(0.01) },
        { couple: ALPHA_DES, resultat: resultat(0.04) },
        { couple: BETA_ACT, resultat: resultat(0.03) },
        { couple: BETA_DES, resultat: resultat(0.2) },
      ],
      { compares: [ALPHA_ACT, ALPHA_DES, BETA_ACT, BETA_DES], incomplets: [] },
    );

    expect(famille.corrigees.map((c) => c.cle)).toEqual([
      "outil-alpha/web_activee",
      "outil-alpha/web_desactivee",
      "outil-beta/web_activee",
      "outil-beta/web_desactivee",
    ]);
    expect(famille.corrigees.map((c) => c.corrigee)).toEqual(
      [0.04, 0.09, 0.09, 0.2].map((v) => expect.closeTo(v, 12)),
    );
    expect(famille.couples_incomplets).toEqual([]);
    expect(famille.couples_sans_test).toEqual([]);
  });

  it("sort de la famille un couple marqué run incomplet, et le rapporte à part", () => {
    // beta/web_activee incomplet : m = 3. Triées : 0,01 · 0,04 · 0,20.
    // 0,01 × 3 = 0,03 ; 0,04 × 2 = 0,08 ; 0,20 × 1 = 0,20.
    const famille = corrigerFamilleAsymetrie(
      [
        { couple: ALPHA_ACT, resultat: resultat(0.01) },
        { couple: ALPHA_DES, resultat: resultat(0.04) },
        { couple: BETA_ACT, resultat: resultat(0.03) },
        { couple: BETA_DES, resultat: resultat(0.2) },
      ],
      { compares: [ALPHA_ACT, ALPHA_DES, BETA_DES], incomplets: [BETA_ACT] },
    );

    expect(famille.corrigees.map((c) => c.cle)).toEqual([
      "outil-alpha/web_activee",
      "outil-alpha/web_desactivee",
      "outil-beta/web_desactivee",
    ]);
    expect(famille.corrigees.map((c) => c.corrigee)).toEqual([0.03, 0.08, 0.2].map((v) => expect.closeTo(v, 12)));
    expect(famille.couples_incomplets).toEqual(["outil-beta/web_activee"]);
  });

  it("sort de la famille un couple sans test (moins de deux candidats), et le rapporte à part", () => {
    // alpha/web_desactivee sans test : m = 2. 0,01 × 2 = 0,02 ; 0,03 × 1 = 0,03.
    const famille = corrigerFamilleAsymetrie(
      [
        { couple: ALPHA_ACT, resultat: resultat(0.01) },
        { couple: ALPHA_DES, resultat: null },
        { couple: BETA_ACT, resultat: resultat(0.03) },
      ],
      { compares: [ALPHA_ACT, ALPHA_DES, BETA_ACT], incomplets: [] },
    );

    expect(famille.corrigees.map((c) => [c.cle, c.corrigee])).toEqual([
      ["outil-alpha/web_activee", expect.closeTo(0.02, 12)],
      ["outil-beta/web_activee", expect.closeTo(0.03, 12)],
    ]);
    expect(famille.couples_sans_test).toEqual(["outil-alpha/web_desactivee"]);
  });

  it("refuse une famille incomplète, un couple inconnu ou un couple en double", () => {
    const partage = { compares: [ALPHA_ACT, ALPHA_DES], incomplets: [] };
    // Un couple comparable sans résultat rétrécirait la famille, donc les valeurs corrigées.
    expect(() => corrigerFamilleAsymetrie([{ couple: ALPHA_ACT, resultat: resultat(0.01) }], partage)).toThrow(
      /outil-alpha\/web_desactivee/,
    );
    expect(() =>
      corrigerFamilleAsymetrie(
        [
          { couple: ALPHA_ACT, resultat: resultat(0.01) },
          { couple: ALPHA_DES, resultat: resultat(0.02) },
          { couple: BETA_ACT, resultat: resultat(0.03) },
        ],
        partage,
      ),
    ).toThrow(/outil-beta\/web_activee/);
    expect(() =>
      corrigerFamilleAsymetrie(
        [
          { couple: ALPHA_ACT, resultat: resultat(0.01) },
          { couple: ALPHA_ACT, resultat: resultat(0.02) },
          { couple: ALPHA_DES, resultat: resultat(0.03) },
        ],
        partage,
      ),
    ).toThrow(/double/);
  });
});

describe("contrat de rejeu depuis run.graines.permutation (constat n° 6)", () => {
  it("amorce le générateur par graineDerivee(graine_du_run, [\"permutation\", ...cle]), rien d'autre", () => {
    // Deux candidats, trois items chacun, profils mêlés : la valeur p dépend du flux aléatoire.
    // Un tiers qui rejoue les permutations avec la graine dérivée doit retrouver la même valeur p.
    const jeu = [
      ...items("candidat-a", 2, true, "a-exactes"),
      ...items("candidat-a", 1, false, "a-inexactes"),
      ...items("candidat-b", 1, true, "b-exactes"),
      ...items("candidat-b", 2, false, "b-inexactes"),
    ];
    const options = { permutations: 40, graine_du_run: 5, cle: ["outil-alpha", "web_activee"] };

    const grappes = grappesEtiquetees(jeu);
    const observee = ecartMaximal(grappes);
    const rng = generateur(graineDerivee(5, ["permutation", "outil-alpha", "web_activee"]));
    let extremes = 0;
    for (let i = 0; i < 40; i += 1) {
      if (ecartMaximal(permuterEtiquettes(grappes, rng)) >= observee - 1e-12) extremes += 1;
    }

    expect(testHomogeneiteCandidats(jeu, TOUS_COMPARES, options, BOOTSTRAP)?.valeur_p).toBe((1 + extremes) / 41);
  });

  it("publie avec la valeur p la clé complète et la graine qui la rejouent (conformité n° 30)", () => {
    // §8 : chaque test de permutation a sa graine, « dérivée […] d'une clé lisible publiée avec le
    // résultat ». Sans elles, un tiers ne sait pas de quel flux la valeur p est sortie.
    const jeu = [...items("candidat-a", 3, true), ...items("candidat-b", 3, false)];
    const options = { permutations: 40, graine_du_run: 5, cle: ["outil-alpha", "web_activee"] };

    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, options, BOOTSTRAP);

    expect(resultat?.cle).toEqual(["permutation", "outil-alpha", "web_activee"]);
    expect(resultat?.graine).toBe(
      graineDerivee(5, ["permutation", "outil-alpha", "web_activee"]).toString(16).padStart(16, "0"),
    );
  });
});

describe("permutation des étiquettes", () => {
  it("déplace les étiquettes entre items : toutes les réponses d'un item changent ensemble", () => {
    // Trois items aux profils distincts : a (1 exacte sur 2), b (3 sur 3), c (0 sur 1).
    // Après permutation, chaque item garde SES comptages ; seules les étiquettes bougent.
    const itemA = ulid("item-a");
    const jeu = [
      unite({ grappe_id: itemA, item_principal_id: itemA, candidat_id: "candidat-a", categorie: "exacte" }),
      unite({ grappe_id: itemA, item_principal_id: itemA, candidat_id: "candidat-a", categorie: "inexacte" }),
      ...grappe("item-b", 3, { candidat_id: "candidat-b", categorie: "exacte" }),
      ...grappe("item-c", 1, { candidat_id: "candidat-c", categorie: "inexacte" }),
    ];
    const avant = grappesEtiquetees(jeu);
    expect(avant.map((g) => `${g.exactes}/${g.classees}`).sort()).toEqual(["0/1", "1/2", "3/3"]);

    const apres = permuterEtiquettes(avant, generateur(graineDepuisTexte("graine-16")));

    // Les comptages restent collés à leur item : aucune réponse n'a changé d'item.
    const profil = (g: { grappe_id: string; exactes: number; classees: number }) =>
      `${g.grappe_id}:${g.exactes}/${g.classees}`;
    expect(apres.map(profil).sort()).toEqual(avant.map(profil).sort());
    // Le multi-ensemble d'étiquettes est conservé, et au moins un item a changé de candidat.
    expect(apres.map((g) => g.candidat_id).sort()).toEqual(avant.map((g) => g.candidat_id).sort());
    expect(apres.map((g) => g.candidat_id)).not.toEqual(avant.map((g) => g.candidat_id));
  });

  it("refuse un item dont les réponses portent deux candidats différents", () => {
    const jeu = [
      ...grappe("item-melange", 1, { candidat_id: "candidat-a" }),
      ...grappe("item-melange", 1, { candidat_id: "candidat-b" }),
    ];

    expect(() => grappesEtiquetees(jeu)).toThrow(/candidat/);
  });

  it("écarte les questions sans candidat et les items sans réponse classée", () => {
    const jeu = [
      ...grappe("item-att", 2, { candidat_id: null, gabarit: "Q-ATT" }),
      ...grappe("item-sans-classee", 2, { candidat_id: "candidat-a", categorie: "non_reponse" }),
      ...grappe("item-utile", 1, { candidat_id: "candidat-a", categorie: "exacte" }),
    ];

    const grappes = grappesEtiquetees(jeu);

    expect(grappes).toHaveLength(1);
    expect(ecartMaximal(grappes)).toBe(0);
  });
});

/**
 * Constat n° 14 de la conformité du 2026-09-29 (§8) : k compte les permutations dont la statistique
 * est supérieure ou égale à l'observée, « à 10⁻¹² près ». Les autres jeux de ce fichier donnent des
 * statistiques exactement représentables ; celui-ci donne deux écarts égaux en rationnels que le
 * flottant calcule par deux chemins d'arrondi différents.
 */
describe("tolérance de 10⁻¹² sur la statistique permutée (conformité n° 14, §8)", () => {
  // Candidat A : 1 exacte sur 3 ; candidat B : 4 exactes sur 7 ; exactitude globale 5/10.
  // Observé : |1/3 − 1/2| = 1/6 (B est à 1/14). Toute permutation donne à A 0, 1, 2 ou 3 exactes,
  // soit un écart de 1/2, 1/6, 1/6 ou 1/2 : aucune n'est moins extrême, la valeur p vaut 1.
  const jeu = [
    ...items("candidat-a", 1, true, "a-exactes"),
    ...items("candidat-a", 2, false, "a-inexactes"),
    ...items("candidat-b", 4, true, "b-exactes"),
    ...items("candidat-b", 3, false, "b-inexactes"),
  ];

  it("le jeu porte bien un écart égal à l'observé en rationnels, mais calculé un arrondi plus bas", () => {
    // A à 2 exactes sur 3 : |2/3 − 1/2| = 1/6 en rationnels.
    const observee = ecartMaximal(grappesEtiquetees(jeu));
    const permutee = Math.abs(2 / 3 - 5 / 10);
    expect(permutee).toBeLessThan(observee);
    expect(observee - permutee).toBeLessThan(1e-12);
  });

  it("compte comme au moins aussi extrême une permutation dont la statistique ne diffère de l'observée que d'un arrondi flottant", () => {
    const resultat = testHomogeneiteCandidats(jeu, TOUS_COMPARES, OPTIONS, BOOTSTRAP);
    expect(resultat?.valeur_p).toBe(1);
  });
});
