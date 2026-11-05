/**
 * L'ordre des grappes ne dépend plus du fichier (décision de l'auteur du 2026-10-02, conformité
 * n° 19, texte en 0.15).
 *
 * Le générateur du bootstrap et de la permutation est consommé grappe après grappe : l'indice
 * tiré désigne une grappe par son rang. Tant que ce rang suivait l'ordre de première apparition
 * des réponses, deux archives aux mêmes réponses dans un autre ordre (tri par identifiant,
 * découpage par outil) donnaient d'autres bornes et d'autres valeurs p, sans erreur. Les grappes
 * sont désormais rangées par `grappe_id` croissant, comparaison de chaînes JavaScript (`<`, unités
 * de code UTF-16), jamais `localeCompare`, qui dépend de la locale de la machine.
 */

import { describe, expect, it } from "vitest";
import {
  differenceAppariee,
  grapper,
  intervalleBootstrap,
  reechantillonner,
  reechantillonnerDifference,
} from "../../analysis/bootstrap.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import { graineDerivee } from "../../analysis/graines.ts";
import { exactitude } from "../../analysis/metriques.ts";
import {
  ecartMaximal,
  grappesEtiquetees,
  permuterEtiquettes,
  testHomogeneiteCandidats,
  type ResultatPermutation,
} from "../../analysis/permutation.ts";
import { generateur } from "../../validation/domaine/alea.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const BOOTSTRAP = { reechantillonnages: 300, graine_du_run: 20261201, cle: ["test", "ordre"] };
const PERMUTATION = { permutations: 300, graine_du_run: 20261202, cle: ["test", "ordre"] };
const TOUS_COMPARES = { compares: ["candidat-a", "candidat-b", "candidat-c"], rapportes_a_part: [] };

/** Trois autres ordres d'archive : inverse, rotation, et un entrelacement pair/impair. */
function autresOrdres<T>(elements: readonly T[]): T[][] {
  const pairs = elements.filter((_, i) => i % 2 === 0);
  const impairs = elements.filter((_, i) => i % 2 === 1);
  return [[...elements].reverse(), [...elements.slice(3), ...elements.slice(0, 3)], [...impairs, ...pairs]];
}

/** Un jeu où les grappes ont des tailles et des catégories différentes : l'ordre y compte. */
function jeuHeterogene(candidat_id: string | null = null, prefixe = "h"): UniteAnalyse[] {
  const categories = ["exacte", "inexacte", "exacte", "non_reponse", "exacte", "inexacte", "exacte"] as const;
  return categories.flatMap((categorie, i) => grappe(`${prefixe}-${i}`, 1 + (i % 3), { categorie, candidat_id }));
}

describe("rang des grappes : grappe_id croissant, comparaison de chaînes (conformité n° 19)", () => {
  it("range les grappes par grappe_id, quel que soit l'ordre des réponses", () => {
    const jeu = jeuHeterogene();
    const attendu = [...new Set(jeu.map((u) => u.grappe_id))].sort();

    for (const ordre of [jeu, ...autresOrdres(jeu)]) {
      expect([...grapper(ordre).keys()]).toEqual(attendu);
    }
  });

  it("compare par unités de code (`<`), pas par localeCompare : « B » avant « a » avant « b »", () => {
    // localeCompare rangerait « a », « b », « B » (ou « a », « B », « b ») selon la locale : un
    // tiers sur une autre machine n'aurait pas le même rang. `<` ne dépend de rien.
    const jeu = ["b", "a", "B"].map((grappe_id) => unite({ grappe_id }));

    expect([...grapper(jeu).keys()]).toEqual(["B", "a", "b"]);
  });

  it("rejoue le bootstrap d'un taux en tirant l'indice i comme la i-ème grappe par grappe_id", () => {
    // Contrat de rejeu écrit en 0.15 : indice = sortie suivante de SplitMix64 modulo le nombre de
    // grappes, grappe d'indice i = i-ème grappe_id dans l'ordre croissant.
    const jeu = jeuHeterogene();
    const ids = [...new Set(jeu.map((u) => u.grappe_id))].sort();
    const parGrappe = ids.map((id) => jeu.filter((u) => u.grappe_id === id));
    const options = { ...BOOTSTRAP, reechantillonnages: 60 };
    const rng = generateur(graineDerivee(options.graine_du_run, ["bootstrap", ...options.cle]));
    const attendues: number[] = [];
    let indefinis = 0;
    for (let b = 0; b < options.reechantillonnages; b += 1) {
      const tirees = ids.flatMap(() => parGrappe[rng.entier(ids.length)] ?? []);
      const valeur = exactitude(tirees).valeur;
      if (valeur === undefined) indefinis += 1;
      else attendues.push(valeur);
    }
    attendues.sort((x, y) => x - y);

    const echantillon = reechantillonner([...jeu].reverse(), exactitude, options);

    expect(echantillon.valeurs).toEqual(attendues);
    expect(echantillon.indefinis).toBe(indefinis);
  });
});

describe("deux archives aux mêmes réponses dans un autre ordre donnent les mêmes bornes et la même valeur p", () => {
  it("bootstrap d'un taux : mêmes rééchantillons, mêmes bornes", () => {
    const jeu = jeuHeterogene();
    const reference = reechantillonner(jeu, exactitude, BOOTSTRAP);
    const bornes = intervalleBootstrap(jeu, exactitude, BOOTSTRAP);

    for (const ordre of autresOrdres(jeu)) {
      expect(reechantillonner(ordre, exactitude, BOOTSTRAP)).toEqual(reference);
      expect(intervalleBootstrap(ordre, exactitude, BOOTSTRAP)).toEqual(bornes);
    }
    // Garde-fou du test : le jeu n'est pas dégénéré, les bornes ne coïncident pas par hasard.
    expect(bornes?.bas).not.toBe(bornes?.haut);
  });

  it("différence entre deux bras : mêmes rééchantillons, mêmes bornes, même qualificatif", () => {
    // Les deux bras ne partagent pas toutes leurs grappes (cas de la robustesse, qui n'apparie pas
    // avant de différencier) : h-5 et h-6 n'existent qu'en A, k-0 et k-1 qu'en B. Les grappes
    // tirées sont la réunion des deux bras, rangée par grappe_id.
    const brasA = jeuHeterogene();
    const brasB = [
      ...jeuHeterogene()
        .filter((u) => u.grappe_id !== ulid("h-5") && u.grappe_id !== ulid("h-6"))
        .map((u) => ({ ...u, categorie: u.categorie === "exacte" ? ("inexacte" as const) : u.categorie })),
      ...grappe("k-0", 2, { categorie: "exacte" }),
      ...grappe("k-1", 1, { categorie: "inexacte" }),
    ];
    const reference = differenceAppariee(brasA, brasB, exactitude, BOOTSTRAP);
    const flux = reechantillonnerDifference(brasA, brasB, exactitude, BOOTSTRAP);

    const ordresA = autresOrdres(brasA);
    const ordresB = autresOrdres(brasB);
    for (let i = 0; i < ordresA.length; i += 1) {
      const a = ordresA[i] as UniteAnalyse[];
      const b = ordresB[i] as UniteAnalyse[];
      expect(reechantillonnerDifference(a, b, exactitude, BOOTSTRAP)).toEqual(flux);
      expect(differenceAppariee(a, b, exactitude, BOOTSTRAP)).toEqual(reference);
    }
    expect(flux.nombre_grappes).toBe(9);
    expect(reference.intervalle?.bas).not.toBe(reference.intervalle?.haut);
  });

  it("différence : rejoue le flux sur la réunion des grappes des deux bras, rangée par grappe_id", () => {
    const brasA = [...grappe("z", 1, { categorie: "exacte" }), ...grappe("m", 2, { categorie: "inexacte" })];
    const brasB = [...grappe("m", 1, { categorie: "exacte" }), ...grappe("c", 1, { categorie: "inexacte" })];
    const ids = [...new Set([...brasA, ...brasB].map((u) => u.grappe_id))].sort();
    const options = { ...BOOTSTRAP, reechantillonnages: 40 };
    const rng = generateur(graineDerivee(options.graine_du_run, ["bootstrap", ...options.cle]));
    const attendues: number[] = [];
    let indefinis = 0;
    for (let r = 0; r < options.reechantillonnages; r += 1) {
      const tirees = ids.map(() => ids[rng.entier(ids.length)] as string);
      const a = exactitude(tirees.flatMap((id) => brasA.filter((u) => u.grappe_id === id))).valeur;
      const b = exactitude(tirees.flatMap((id) => brasB.filter((u) => u.grappe_id === id))).valeur;
      if (a === undefined || b === undefined) indefinis += 1;
      else attendues.push(a - b);
    }
    attendues.sort((x, y) => x - y);

    const echantillon = reechantillonnerDifference(brasA, brasB, exactitude, options);

    expect(echantillon.nombre_grappes).toBe(3);
    expect(echantillon.valeurs).toEqual(attendues);
    expect(echantillon.indefinis).toBe(indefinis);
  });

  it("permutation : même statistique, même valeur p, mêmes intervalles", () => {
    const jeu = [
      ...jeuHeterogene("candidat-a", "a"),
      ...jeuHeterogene("candidat-b", "b").map((u) => ({
        ...u,
        categorie: u.categorie === "inexacte" ? ("exacte" as const) : u.categorie,
      })),
      ...grappe("c-0", 2, { candidat_id: "candidat-c", categorie: "inexacte" }),
      ...grappe("c-1", 1, { candidat_id: "candidat-c", categorie: "exacte" }),
      ...grappe("c-2", 3, { candidat_id: "candidat-c", categorie: "inexacte" }),
    ];
    const reference = testHomogeneiteCandidats(jeu, TOUS_COMPARES, PERMUTATION, BOOTSTRAP);

    expect(reference).not.toBeNull();
    // Garde-fou du test : une valeur p qui ne vaut ni 1 ni le minimum dépend du flux.
    expect(reference?.valeur_p).toBeGreaterThan(1 / 301);
    expect(reference?.valeur_p).toBeLessThan(1);
    for (const ordre of autresOrdres(jeu)) {
      expect(mesures(testHomogeneiteCandidats(ordre, TOUS_COMPARES, PERMUTATION, BOOTSTRAP))).toEqual(
        mesures(reference),
      );
    }
  });

  it("permutation : rejoue Fisher-Yates du dernier au premier sur les items rangés par grappe_id", () => {
    const jeu = [
      ...grappe("p-3", 2, { candidat_id: "candidat-a", categorie: "exacte" }),
      ...grappe("p-1", 1, { candidat_id: "candidat-b", categorie: "inexacte" }),
      ...grappe("p-4", 1, { candidat_id: "candidat-a", categorie: "inexacte" }),
      ...grappe("p-0", 2, { candidat_id: "candidat-b", categorie: "exacte" }),
      ...grappe("p-2", 1, { candidat_id: "candidat-c", categorie: "inexacte" }),
    ];
    const items = grappesEtiquetees(jeu);
    expect(items.map((g) => g.grappe_id)).toEqual([...items.map((g) => g.grappe_id)].sort());

    const options = { ...PERMUTATION, permutations: 50 };
    const observee = ecartMaximal(items);
    const rng = generateur(graineDerivee(options.graine_du_run, ["permutation", ...options.cle]));
    let extremes = 0;
    for (let i = 0; i < options.permutations; i += 1) {
      // Fisher-Yates, du dernier au premier : j = sortie suivante modulo (i + 1).
      const etiquettes = items.map((g) => g.candidat_id);
      for (let k = etiquettes.length - 1; k > 0; k -= 1) {
        const j = rng.entier(k + 1);
        [etiquettes[k], etiquettes[j]] = [etiquettes[j] as string, etiquettes[k] as string];
      }
      const permutees = items.map((g, n) => ({ ...g, candidat_id: etiquettes[n] as string }));
      if (ecartMaximal(permutees) >= observee - 1e-12) extremes += 1;
    }

    const resultat = testHomogeneiteCandidats([...jeu].reverse(), TOUS_COMPARES, options, BOOTSTRAP);

    expect(resultat?.valeur_p).toBe((1 + extremes) / (1 + options.permutations));
    // La fonction du module fait le même mélange que le rejeu écrit à la main.
    const rngModule = generateur(graineDerivee(options.graine_du_run, ["permutation", ...options.cle]));
    const rngMain = generateur(graineDerivee(options.graine_du_run, ["permutation", ...options.cle]));
    const etiquettesMain = items.map((g) => g.candidat_id);
    for (let k = etiquettesMain.length - 1; k > 0; k -= 1) {
      const j = rngMain.entier(k + 1);
      [etiquettesMain[k], etiquettesMain[j]] = [etiquettesMain[j] as string, etiquettesMain[k] as string];
    }
    expect(permuterEtiquettes(items, rngModule).map((g) => g.candidat_id)).toEqual(etiquettesMain);
  });
});

/**
 * Ce qu'un test publie comme mesure. L'ordre de la liste `candidats` suit encore la première
 * apparition des candidats ; ce n'est pas une mesure, il est comparé candidat par candidat.
 */
function mesures(resultat: ResultatPermutation | null) {
  if (resultat === null) throw new Error("Test sans objet : rien à comparer.");
  return {
    statistique_observee: resultat.statistique_observee,
    valeur_p: resultat.valeur_p,
    exactitude_de_reference: resultat.exactitude_de_reference,
    intervalle_ecart_maximal: resultat.intervalle_ecart_maximal,
    candidats: new Map(resultat.candidats.map((c) => [c.candidat_id, c])),
    cle: resultat.cle,
    graine: resultat.graine,
  };
}
