/**
 * Bootstrap en grappes (§8) — la grappe étant l'item.
 *
 * Les cas sont choisis pour que la distribution des rééchantillons se calcule à la main : avec
 * deux grappes homogènes, un tirage de deux grappes avec remise ne peut donner que trois taux.
 * Un intervalle dont on ne sait pas refaire le calcul ne prouve rien.
 */

import { describe, expect, it } from "vitest";
import {
  differenceAppariee,
  intervalleBootstrap,
  intervalleNomme,
  intervalleStatistique,
  percentile,
  qualifierSelonTaux,
  reechantillonner,
  reechantillonnerStatistique,
  REECHANTILLONNAGES_PRODUCTION,
  tauxDegenere,
  valeurDuTaux,
} from "../../analysis/bootstrap.ts";
import { graineDerivee } from "../../analysis/graines.ts";
import { exactitude } from "../../analysis/metriques.ts";
import { taux } from "../../analysis/types.ts";
import { generateur } from "../../validation/domaine/alea.ts";
import { grappe, ulid } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 200, graine_du_run: 20261201, cle: ["test", "bootstrap"] };

/** 10 grappes d'une réponse : 7 exactes, 3 inexactes. Exactitude observée 0,7. */
function dixGrappes() {
  const jeu = [];
  for (let i = 0; i < 7; i += 1) jeu.push(...grappe(`g-exacte-${i}`, 1, { categorie: "exacte" }));
  for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`g-inexacte-${i}`, 1, { categorie: "inexacte" }));
  return jeu;
}

describe("percentiles empiriques", () => {
  it("interpole linéairement quand l'indice ne tombe pas sur un entier", () => {
    // Méthode : h = (m − 1)·p, valeur = v[⌊h⌋] + (h − ⌊h⌋)·(v[⌈h⌉] − v[⌊h⌋]).
    // m = 4, p = 0,025 → h = 3·0,025 = 0,075 → 0 + 0,075·(1 − 0) = 0,075.
    // m = 4, p = 0,975 → h = 3·0,975 = 2,925 → 2 + 0,925·(3 − 2) = 2,925.
    const valeurs = [0, 1, 2, 3];

    expect(percentile(valeurs, 0.025)).toBeCloseTo(0.075, 12);
    expect(percentile(valeurs, 0.975)).toBeCloseTo(2.925, 12);
    // Bornes exactes : un seul élément, ou p aux extrémités.
    expect(percentile([5], 0.025)).toBe(5);
    expect(percentile(valeurs, 0)).toBe(0);
    expect(percentile(valeurs, 1)).toBe(3);
  });

  it("refuse une liste vide plutôt que d'inventer une borne", () => {
    expect(() => percentile([], 0.5)).toThrow(/vide/);
  });
});

describe("reproductibilité", () => {
  it("donne le même intervalle à graine égale, un autre à graine de run différente", () => {
    const jeu = dixGrappes();

    const a = intervalleBootstrap(jeu, exactitude, OPTIONS);
    const b = intervalleBootstrap(jeu, exactitude, OPTIONS);
    const autreRun = { ...OPTIONS, graine_du_run: 20261202 };

    expect(a).toEqual(b);
    // Sur dix grappes, les bornes avancent par pas de 0,1 : deux flux distincts peuvent tomber sur
    // les mêmes bornes. C'est le flux des rééchantillons qui doit changer avec la graine.
    expect(reechantillonner(jeu, exactitude, autreRun).valeurs).not.toEqual(
      reechantillonner(jeu, exactitude, OPTIONS).valeurs,
    );
    expect(a?.reechantillonnages).toBe(200);
    expect(REECHANTILLONNAGES_PRODUCTION).toBe(2000);
  });
});

describe("contrat de rejeu depuis run.graines.bootstrap (constat n° 6)", () => {
  it("amorce le générateur par graineDerivee(graine_du_run, [\"bootstrap\", ...cle]), rien d'autre", () => {
    // Deux grappes homogènes, rangées par grappe_id (conformité n° 19, texte en 0.15) : l'indice
    // d'une grappe est son rang dans cet ordre, quel que soit l'ordre des réponses. Chaque
    // rééchantillon tire deux indices avec remise ; sa valeur est la moyenne des deux taux. Un
    // tiers qui rejoue le générateur avec la graine dérivée doit retrouver la même liste.
    const jeu = [
      ...grappe("g-exacte", 1, { categorie: "exacte" }),
      ...grappe("g-inexacte", 1, { categorie: "inexacte" }),
    ];
    const options = { reechantillonnages: 50, graine_du_run: 20261201, cle: ["outil-alpha", "exactitude"] };
    const indiceExact = [ulid("g-exacte"), ulid("g-inexacte")].sort().indexOf(ulid("g-exacte"));

    const rng = generateur(graineDerivee(20261201, ["bootstrap", "outil-alpha", "exactitude"]));
    const attendues: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const tirees = [rng.entier(2), rng.entier(2)];
      attendues.push(tirees.filter((indice) => indice === indiceExact).length / 2);
    }
    attendues.sort((x, y) => x - y);

    expect(reechantillonner(jeu, exactitude, options).valeurs).toEqual(attendues);
    expect(reechantillonner([...jeu].reverse(), exactitude, options).valeurs).toEqual(attendues);
  });
});

describe("rééchantillonnage en grappes", () => {
  it("tire les réponses d'un même item ensemble, jamais une à une", () => {
    // Deux grappes de 3 réponses : la première toute exacte, la seconde toute inexacte.
    // Par grappe, un rééchantillon ne peut valoir que 1 (deux fois la première), 0 (deux fois la
    // seconde) ou 0,5 (une de chaque) — et les extrêmes arrivent une fois sur quatre chacun,
    // donc l'intervalle à 95 % est [0 ; 1].
    // Par réponse, il faudrait tirer 6 réponses identiques pour atteindre 0 ou 1 : (1/2)⁶ = 1,6 %,
    // sous les 2,5 % du percentile bas — l'intervalle serait strictement à l'intérieur de [0 ; 1].
    const jeu = [
      ...grappe("g-exacte", 3, { categorie: "exacte" }),
      ...grappe("g-inexacte", 3, { categorie: "inexacte" }),
    ];

    const echantillon = reechantillonner(jeu, exactitude, OPTIONS);
    const intervalle = intervalleBootstrap(jeu, exactitude, OPTIONS);

    expect(echantillon.nombre_grappes).toBe(2);
    expect([...new Set(echantillon.valeurs)].sort()).toEqual([0, 0.5, 1]);
    expect(intervalle?.bas).toBe(0);
    expect(intervalle?.haut).toBe(1);
  });

  it("signale la dégénérescence d'un taux calculé sur une seule grappe", () => {
    // Une grappe : tout rééchantillon la retire à l'identique. L'intervalle se réduit au point,
    // ce qui, publié tel quel, ressemblerait à une mesure d'une précision parfaite.
    const jeu = grappe("g-unique", 4, { categorie: "exacte" });

    const intervalle = intervalleBootstrap(jeu, exactitude, OPTIONS);

    expect(intervalle?.degenere).toBe("grappe_unique");
    expect(intervalle?.bas).toBe(1);
    expect(intervalle?.haut).toBe(1);
    expect(intervalle?.nombre_grappes).toBe(1);
  });

  it("ne rend aucun intervalle quand il n'y a aucune grappe", () => {
    expect(intervalleBootstrap([], exactitude, OPTIONS)).toBeNull();
  });
});

describe("différence appariée par grappe", () => {
  it("qualifie « établie » une différence dont l'intervalle exclut zéro, « non établie » sinon", () => {
    // §8 : « une différence est qualifiée d'établie seulement si l'intervalle de confiance de la
    // différence exclut zéro ; sinon elle est non établie ». Le rapport n'a que ces deux mots.
    // Chaque grappe a trois réponses. Bras A : deux exactes, une inexacte (2/3) ; bras B : une
    // exacte, deux inexactes (1/3). Aucun taux n'est 0 ou 1 (§8, 0.27 et 0.28 : un taux dégénéré
    // ne se qualifie pas).
    const grappes = ["g1", "g2", "g3", "g4", "g5"];
    const avec = (g: string, exactes: number) => [
      ...grappe(g, exactes, { categorie: "exacte" }),
      ...grappe(g, 3 - exactes, { categorie: "inexacte" }),
    ];
    const deuxTiers = grappes.flatMap((g) => avec(g, 2));
    const unTiers = grappes.flatMap((g) => avec(g, 1));

    // 2/3 contre 1/3 sur les mêmes grappes : la différence vaut 1/3 dans tout rééchantillon.
    const tranchee = differenceAppariee(deuxTiers, unTiers, exactitude, OPTIONS);
    expect(tranchee.difference).toBeCloseTo(1 / 3, 12);
    expect(tranchee.intervalle?.bas).toBeCloseTo(1 / 3, 12);
    expect(tranchee.qualificatif).toBe("etablie");

    // Deux bras identiques : la différence vaut 0 partout, l'intervalle contient 0.
    const nulle = differenceAppariee(deuxTiers, deuxTiers, exactitude, OPTIONS);
    expect(nulle.difference).toBe(0);
    expect(nulle.qualificatif).toBe("non_etablie");
  });

  it("ne qualifie rien quand l'un des deux taux n'existe pas", () => {
    const observees = grappe("g1", 2, { categorie: "exacte" });
    const nonClassees = grappe("g1", 2, { categorie: "non_reponse" });

    const resultat = differenceAppariee(observees, nonClassees, exactitude, OPTIONS);

    expect(resultat.difference).toBeNull();
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.intervalle).toBeNull();
  });

  it("ne qualifie ni établie ni non établie une différence non nulle sur une seule grappe (§8, 0.9)", () => {
    // §8 (0.9) : « Un intervalle calculé sur une seule grappe est dégénéré : la différence
    // correspondante n'est qualifiée ni d'« établie » ni de « non établie », elle est publiée
    // avec la mention « une seule grappe ». » Exactitude 1 contre 0 sur une grappe : l'intervalle
    // se réduit au point [1 ; 1], qui exclut zéro sans rien mesurer.
    const exacte = grappe("g-unique", 3, { categorie: "exacte" });
    const inexacte = grappe("g-unique", 3, { categorie: "inexacte" });

    const resultat = differenceAppariee(exacte, inexacte, exactitude, OPTIONS);

    expect(resultat.difference).toBe(1);
    expect(resultat.qualificatif).toBeNull();
    // La mention « une seule grappe » reste lisible : l'intervalle existe, il n'est pas absent.
    expect(resultat.intervalle).not.toBeNull();
    expect(resultat.intervalle?.degenere).toBe("grappe_unique");
    expect(resultat.intervalle?.nombre_grappes).toBe(1);
    expect(resultat.intervalle?.bas).toBe(1);
    expect(resultat.intervalle?.haut).toBe(1);
  });

  it("qualifie toujours une différence non nulle dès deux grappes", () => {
    // Même écart qu'au test précédent, sur deux grappes : l'intervalle n'est plus dégénéré et le
    // §8 s'applique sans changement. Chaque bras garde une réponse de l'autre catégorie, pour
    // qu'aucun taux ne soit dégénéré (§8, 0.27 et 0.28) : par grappe, deux exactes et une inexacte
    // contre une exacte et deux inexactes, différence 1/3 dans tout rééchantillon.
    const avec = (g: string, exactes: number) => [
      ...grappe(g, exactes, { categorie: "exacte" }),
      ...grappe(g, 3 - exactes, { categorie: "inexacte" }),
    ];
    const exacte = ["g1", "g2"].flatMap((g) => avec(g, 2));
    const inexacte = ["g1", "g2"].flatMap((g) => avec(g, 1));

    const resultat = differenceAppariee(exacte, inexacte, exactitude, OPTIONS);

    expect(resultat.intervalle?.degenere).toBeNull();
    expect(resultat.intervalle?.nombre_grappes).toBe(2);
    expect(resultat.qualificatif).toBe("etablie");
  });
});

describe("statistique numérique (conformité n° 29)", () => {
  // Le §8 exige l'intervalle de l'écart maximal du test d'asymétrie, qui n'est pas un rapport
  // d'effectifs. Le bootstrap est généralisé à `(unites) => number | null` : mêmes grappes, même
  // graine, mêmes rééchantillonnages, mêmes quantiles. Les taux passent par cette même voie.
  const OPTIONS_FIGEES = {
    reechantillonnages: 2000,
    graine_du_run: 20261201,
    cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
  };

  /** 7 grappes de 2 exactes, 3 grappes d'une inexacte : exactitude 14/17. */
  function jeuFige() {
    const jeu = [];
    for (let i = 0; i < 7; i += 1) jeu.push(...grappe(`g-exacte-${i}`, 2, { categorie: "exacte" }));
    for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`g-inexacte-${i}`, 1, { categorie: "inexacte" }));
    return jeu;
  }

  /** 1 grappe exacte, 1 grappe de 2 inexactes, 3 grappes de non-réponse : des rééchantillons sans classée. */
  function jeuCreux() {
    const jeu = [...grappe("c-exacte", 1, { categorie: "exacte" }), ...grappe("c-inexacte", 2, { categorie: "inexacte" })];
    for (let i = 0; i < 3; i += 1) jeu.push(...grappe(`c-nr-${i}`, 1, { categorie: "non_reponse" }));
    return jeu;
  }

  it("garde exactement les bornes d'un intervalle de taux figé avant le changement", () => {
    // Bornes relevées sur le code d'avant le constat n° 29 (`intervalleBootstrap` typé Taux),
    // 2 000 rééchantillonnages, graine 20261201. Elles ne doivent pas bouger d'un bit, ni par
    // l'ancienne entrée, ni par la voie numérique.
    // Relevées de nouveau sous la règle du rang par grappe_id (décision de l'auteur du
    // 2026-10-02, conformité n° 19, texte en 0.15), et retrouvées par un rejeu indépendant du
    // générateur sur les grappes rangées par grappe_id. Avant, sous l'ordre de première
    // apparition des réponses : haut 1 pour le jeu figé, 158 indéfinis pour le jeu creux.
    const fige = {
      bas: 0.5714285714285714,
      haut: 0.9473684210526315,
      nombre_grappes: 10,
      reechantillonnages: 2000,
      reechantillonnages_indefinis: 0,
      degenere: null,
    };
    const creux = {
      bas: 0,
      haut: 1,
      nombre_grappes: 5,
      reechantillonnages: 2000,
      reechantillonnages_indefinis: 139,
      degenere: null,
    };
    const optionsCreux = { ...OPTIONS_FIGEES, cle: ["outil-alpha", "web_desactivee", "exactitude", "creux"] };

    expect(intervalleBootstrap(jeuFige(), exactitude, OPTIONS_FIGEES)).toEqual(fige);
    expect(intervalleStatistique(jeuFige(), valeurDuTaux(exactitude), OPTIONS_FIGEES)).toEqual(fige);
    expect(intervalleBootstrap(jeuCreux(), exactitude, optionsCreux)).toEqual(creux);
    expect(intervalleStatistique(jeuCreux(), valeurDuTaux(exactitude), optionsCreux)).toEqual(creux);
  });

  it("rééchantillonne une statistique qui n'est pas un taux, sur les grappes tirées", () => {
    // Statistique : nombre de réponses exactes (pas un rapport). Grappe n-a : 1 exacte ; grappe
    // n-b : 3 exactes ; l'indice d'une grappe est son rang par grappe_id (conformité n° 19).
    // Rejouer le générateur avec la graine dérivée donne la même liste.
    const jeu = [...grappe("n-a", 1, { categorie: "exacte" }), ...grappe("n-b", 3, { categorie: "exacte" })];
    const compte = (unites: readonly { categorie: string }[]) => unites.filter((u) => u.categorie === "exacte").length;
    const options = { reechantillonnages: 30, graine_du_run: 7, cle: ["outil-alpha", "compte"] };
    const indiceA = [ulid("n-a"), ulid("n-b")].sort().indexOf(ulid("n-a"));

    const rng = generateur(graineDerivee(7, ["bootstrap", "outil-alpha", "compte"]));
    const attendues: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      attendues.push([rng.entier(2), rng.entier(2)].reduce((s, indice) => s + (indice === indiceA ? 1 : 3), 0));
    }
    attendues.sort((x, y) => x - y);

    expect(reechantillonnerStatistique(jeu, compte, options).valeurs).toEqual(attendues);
  });

  it("écarte et compte un rééchantillon où la statistique numérique est indéfinie (§8)", () => {
    // Indéfinie quand la grappe inexacte manque au rééchantillon : deux grappes tirées avec
    // remise, elle manque quand les deux indices désignent la grappe exacte, dont le rang est fixé
    // par grappe_id (conformité n° 19). Le compte rejoué doit être exact.
    const jeu = [...grappe("n-a", 1, { categorie: "exacte" }), ...grappe("n-b", 1, { categorie: "inexacte" })];
    const avecInexacte = (unites: readonly { categorie: string }[]) =>
      unites.some((u) => u.categorie === "inexacte") ? unites.length : null;
    const options = { reechantillonnages: 40, graine_du_run: 11, cle: ["outil-alpha", "indefinie"] };
    const indiceExact = [ulid("n-a"), ulid("n-b")].sort().indexOf(ulid("n-a"));

    const rng = generateur(graineDerivee(11, ["bootstrap", "outil-alpha", "indefinie"]));
    let indefinis = 0;
    for (let i = 0; i < 40; i += 1) {
      const tirees = [rng.entier(2), rng.entier(2)];
      if (tirees.every((t) => t === indiceExact)) indefinis += 1;
    }

    const echantillon = reechantillonnerStatistique(jeu, avecInexacte, options);

    expect(indefinis).toBeGreaterThan(0);
    expect(echantillon.indefinis).toBe(indefinis);
    expect(echantillon.valeurs).toHaveLength(40 - indefinis);
    expect(intervalleStatistique(jeu, avecInexacte, options)?.reechantillonnages_indefinis).toBe(indefinis);
  });

  it("publie avec chaque différence sa clé complète et sa graine, même sans intervalle (conformité n° 30)", () => {
    // §8, « Graines de l'analyse » : chaque intervalle a sa graine, « dérivée […] d'une clé lisible
    // publiée avec le résultat ». Vecteur du §8 : clé bootstrap / outil-alpha / web_desactivee /
    // exactitude / global, graine du run 20261201, amorce 0xd8bcfbd164a58f33.
    const options = {
      reechantillonnages: 50,
      graine_du_run: 20261201,
      cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
    };
    const exacte = ["g1", "g2"].flatMap((g) => grappe(g, 1, { categorie: "exacte" }));
    const inexacte = ["g1", "g2"].flatMap((g) => grappe(g, 1, { categorie: "inexacte" }));
    const nonClassee = ["g1", "g2"].flatMap((g) => grappe(g, 1, { categorie: "non_reponse" }));

    const definie = differenceAppariee(exacte, inexacte, exactitude, options);
    const sansTerme = differenceAppariee(exacte, nonClassee, exactitude, options);

    for (const resultat of [definie, sansTerme]) {
      expect(resultat.cle).toEqual(["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"]);
      expect(resultat.graine).toBe("d8bcfbd164a58f33");
    }
    expect(definie.intervalle).not.toBeNull();
    expect(sansTerme.intervalle).toBeNull();
    // La graine publiée est bien celle qui a amorcé le rééchantillonnage, pas une étiquette.
    expect(definie.graine).toBe(graineDerivee(20261201, definie.cle).toString(16).padStart(16, "0"));
  });

  it("rend un intervalle nommé : clé complète, graine publiée, raison quand il est absent", () => {
    const options = {
      reechantillonnages: 50,
      graine_du_run: 20261201,
      cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
    };

    const nomme = intervalleNomme(jeuFige(), valeurDuTaux(exactitude), options);

    expect(nomme.cle).toEqual(["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"]);
    // Vecteur du §8 : amorce 0xd8bcfbd164a58f33.
    expect(nomme.graine).toBe("d8bcfbd164a58f33");
    expect(nomme.intervalle).toEqual(intervalleStatistique(jeuFige(), valeurDuTaux(exactitude), options));
    expect(nomme.raison_sans_intervalle).toBeNull();

    const sansGrappe = intervalleNomme([], valeurDuTaux(exactitude), options);
    expect(sansGrappe.intervalle).toBeNull();
    expect(sansGrappe.raison_sans_intervalle).toBe("aucune_grappe");

    const sansClassee = intervalleNomme(grappe("nr", 2, { categorie: "non_reponse" }), valeurDuTaux(exactitude), options);
    expect(sansClassee.intervalle).toBeNull();
    expect(sansClassee.raison_sans_intervalle).toBe("aucun_reechantillon_defini");
  });
});

describe("taux dégénéré (§8, 0.27 et 0.28)", () => {
  // §8 : « un taux dont aucune grappe n'observe l'événement, qui reçoit l'intervalle de largeur
  // nulle [0 ; 0] » ; « Symétriquement, un taux égal à 1, dont aucune grappe n'observe le
  // non-événement, reçoit l'intervalle de largeur nulle [1 ; 1] » ; « Dans les deux cas, une
  // différence qui dépend d'un tel taux n'est qualifiée ni d'« établie » ni de « non établie ». »
  // La règle se lit sur les effectifs observés du taux, jamais sur l'égalité des bornes.
  const CINQ = ["g1", "g2", "g3", "g4", "g5"];

  /** Une réponse par grappe g1 à g5, de la catégorie dite. */
  function bras(categories: readonly ("exacte" | "inexacte" | "non_reponse")[]) {
    return categories.flatMap((categorie, i) => grappe(CINQ[i] as string, 1, { categorie }));
  }

  /** Une grappe d'une exacte et d'une inexacte. */
  function melange(g: string) {
    return [...grappe(g, 1, { categorie: "exacte" }), ...grappe(g, 1, { categorie: "inexacte" })];
  }

  it("lit la dégénérescence sur les effectifs : 0/n, n/n, et ni 0/0 ni un taux intermédiaire", () => {
    expect(tauxDegenere(taux(0, 5))).toBe("aucun_evenement");
    expect(tauxDegenere(taux(5, 5))).toBe("aucun_non_evenement");
    expect(tauxDegenere(taux(1, 5))).toBeNull();
    expect(tauxDegenere(taux(4, 5))).toBeNull();
    // 0/0 : un taux absent n'est pas dégénéré, il est absent.
    expect(tauxDegenere(taux(0, 0))).toBeNull();
  });

  it("une différence qui dépend de plus de deux taux suit la même règle : un seul taux dégénéré suffit (§7, 0.29)", () => {
    const exclutZero = { bas: 0.1, haut: 0.4, nombre_grappes: 5, reechantillonnages: 200, reechantillonnages_indefinis: 0, degenere: null };
    expect(qualifierSelonTaux([taux(1, 3), taux(2, 3), taux(1, 2)], exclutZero)).toEqual({ qualificatif: "etablie", motif_sans_qualificatif: null });
    expect(qualifierSelonTaux([taux(1, 3), taux(2, 3), taux(2, 2)], exclutZero)).toEqual({
      qualificatif: null,
      motif_sans_qualificatif: "taux_degenere",
    });
    expect(qualifierSelonTaux([taux(0, 3), taux(2, 3), taux(1, 2)], exclutZero)).toEqual({
      qualificatif: null,
      motif_sans_qualificatif: "taux_degenere",
    });
    expect(qualifierSelonTaux([taux(1, 3)], null)).toEqual({ qualificatif: null, motif_sans_qualificatif: "sans_intervalle" });
  });

  it("0/n dans un bras : la différence n'est pas qualifiée (taux_degenere)", () => {
    const a = bras(["exacte", "exacte", "inexacte", "exacte", "inexacte"]);
    const b = bras(["inexacte", "inexacte", "inexacte", "inexacte", "inexacte"]);

    const resultat = differenceAppariee(a, b, exactitude, OPTIONS);

    expect(resultat.taux_b).toEqual(taux(0, 5));
    expect(resultat.difference).toBeCloseTo(0.6, 12);
    expect(resultat.intervalle).not.toBeNull();
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("n/n dans un bras : la différence n'est pas qualifiée (taux_degenere)", () => {
    const a = bras(["exacte", "exacte", "exacte", "exacte", "exacte"]);
    const b = bras(["exacte", "inexacte", "inexacte", "exacte", "inexacte"]);

    const resultat = differenceAppariee(a, b, exactitude, OPTIONS);

    expect(resultat.taux_a).toEqual(taux(5, 5));
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("0/n dans les deux bras : la différence nulle n'est pas « non établie » (taux_degenere)", () => {
    const a = bras(["inexacte", "inexacte", "inexacte", "inexacte", "inexacte"]);

    const resultat = differenceAppariee(a, a, exactitude, OPTIONS);

    expect(resultat.difference).toBe(0);
    expect(resultat.intervalle).toMatchObject({ bas: 0, haut: 0, nombre_grappes: 5, degenere: null });
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("1/n contre 0/n : un seul bras dégénéré suffit (taux_degenere)", () => {
    const a = bras(["exacte", "inexacte", "inexacte", "inexacte", "inexacte"]);
    const b = bras(["inexacte", "inexacte", "inexacte", "inexacte", "inexacte"]);

    const resultat = differenceAppariee(a, b, exactitude, OPTIONS);

    expect(tauxDegenere(resultat.taux_a)).toBeNull();
    expect(tauxDegenere(resultat.taux_b)).toBe("aucun_evenement");
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("deux taux non dégénérés : « établie » et « non établie » inchangés, même sur un intervalle [0 ; 0]", () => {
    // Bras A : 4 grappes de 2 exactes et 1 grappe exacte + inexacte (9/10) ; bras B : chaque grappe
    // exacte + inexacte (5/10). Différence par grappe 0,5 sur quatre grappes, 0 sur la cinquième :
    // un rééchantillon ne tombe à 0 que s'il ne tire que g5, (1/5)⁵ = 0,032 %.
    const a = [...["g1", "g2", "g3", "g4"].flatMap((g) => grappe(g, 2, { categorie: "exacte" })), ...melange("g5")];
    const b = CINQ.flatMap(melange);

    const etablie = differenceAppariee(a, b, exactitude, OPTIONS);
    expect(etablie.qualificatif).toBe("etablie");
    expect(etablie.motif_sans_qualificatif).toBeNull();

    // Deux bras identiques non dégénérés : l'intervalle de la différence est [0 ; 0], mais aucun
    // taux n'est dégénéré. La règle se lit sur les effectifs des taux, pas sur les bornes.
    const nulle = differenceAppariee(b, b, exactitude, OPTIONS);
    expect(nulle.intervalle).toMatchObject({ bas: 0, haut: 0 });
    expect(nulle.qualificatif).toBe("non_etablie");
    expect(nulle.motif_sans_qualificatif).toBeNull();
  });

  it("0/0, dénominateur vide : la différence reste absente (difference_indefinie), jamais taux_degenere", () => {
    const a = bras(["exacte", "inexacte", "exacte", "inexacte", "exacte"]);
    const b = bras(["non_reponse", "non_reponse", "non_reponse", "non_reponse", "non_reponse"]);

    const resultat = differenceAppariee(a, b, exactitude, OPTIONS);

    expect(resultat.taux_b).toEqual(taux(0, 0));
    expect(resultat.difference).toBeNull();
    expect(resultat.intervalle).toBeNull();
    expect(resultat.qualificatif).toBeNull();
    expect(resultat.motif_sans_qualificatif).toBe("difference_indefinie");
  });

  it("une seule grappe garde son motif grappe_unique, même quand ses taux sont dégénérés", () => {
    const resultat = differenceAppariee(
      grappe("g-unique", 3, { categorie: "exacte" }),
      grappe("g-unique", 3, { categorie: "inexacte" }),
      exactitude,
      OPTIONS,
    );

    expect(resultat.qualificatif).toBeNull();
    expect(resultat.motif_sans_qualificatif).toBe("grappe_unique");
  });
});
