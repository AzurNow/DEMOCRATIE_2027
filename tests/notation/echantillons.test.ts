/**
 * Tirages de la notation (§7) : échantillon humain emboîté (D14 (1)) et sous-ensemble contrefactuel
 * (D14 (2)). Cas limites 9, 10 et 11 du brief du lot notation.
 */

import { describe, expect, it } from "vitest";
import { graineDerivee } from "../../analysis/graines.ts";
import {
  CLE_ECHANTILLON_HUMAIN,
  CLE_SOUS_ENSEMBLE_CONTREFACTUEL,
  ordreEchantillonHumain,
  tailleEchantillonHumain,
  TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL,
  tirerEchantillonHumain,
  tirerSousEnsembleContrefactuel,
} from "../../pipeline/notation/echantillons.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/graine.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

function ids(n: number, prefixe = "R"): string[] {
  return Array.from({ length: n }, (_, i) => `${prefixe}${String(i).padStart(5, "0")}`);
}

describe("taille de l'échantillon humain : ⌈taux × n⌉ en entiers", () => {
  it("zéro réponse donne un échantillon vide, aux deux taux", () => {
    expect(tailleEchantillonHumain(0, 0.1)).toBe(0);
    expect(tailleEchantillonHumain(0, 0.25)).toBe(0);
    expect(tirerEchantillonHumain([], graine(1), 0.1)).toEqual([]);
    expect(tirerEchantillonHumain([], graine(1), 0.25)).toEqual([]);
  });

  it("une réponse donne un échantillon d'une réponse, aux deux taux", () => {
    expect(tirerEchantillonHumain(["R1"], graine(7), 0.1)).toEqual(["R1"]);
    expect(tirerEchantillonHumain(["R1"], graine(7), 0.25)).toEqual(["R1"]);
  });

  it("arrondit au supérieur, jamais sous le taux", () => {
    expect(tailleEchantillonHumain(10, 0.1)).toBe(1);
    expect(tailleEchantillonHumain(11, 0.1)).toBe(2);
    expect(tailleEchantillonHumain(100, 0.1)).toBe(10);
    expect(tailleEchantillonHumain(101, 0.25)).toBe(26);
    expect(tailleEchantillonHumain(30, 0.1)).toBe(3);
    for (let n = 0; n <= 500; n += 1) {
      expect(tailleEchantillonHumain(n, 0.1) * 10).toBeGreaterThanOrEqual(n);
      expect(tailleEchantillonHumain(n, 0.25) * 4).toBeGreaterThanOrEqual(n);
      expect((tailleEchantillonHumain(n, 0.1) - 1) * 10).toBeLessThan(n);
    }
  });

  it("refuse un taux absent du schéma du run", () => {
    expect(() => tailleEchantillonHumain(10, 0.2 as 0.1)).toThrow(/hors de run.schema.json/);
  });
});

describe("échantillon de 25 % emboîté sur celui de 10 % (D14 (1))", () => {
  it("contient l'échantillon de 10 %, et en prolonge l'ordre, sur plusieurs graines et tailles", () => {
    for (const valeur of [0, 1, 20261201, 9007199254740991]) {
      for (const n of [1, 2, 9, 10, 11, 37, 400, 1001]) {
        const reponses = ids(n);
        const dix = tirerEchantillonHumain(reponses, graine(valeur), 0.1);
        const vingtCinq = tirerEchantillonHumain(reponses, graine(valeur), 0.25);
        expect(vingtCinq.slice(0, dix.length)).toEqual(dix);
        expect(new Set(vingtCinq).size).toBe(vingtCinq.length);
        expect(dix).toHaveLength(Math.ceil(n / 10));
        expect(vingtCinq).toHaveLength(Math.ceil(n / 4));
      }
    }
  });

  it("dépend de la graine", () => {
    const reponses = ids(200);
    expect(tirerEchantillonHumain(reponses, graine(1), 0.1)).not.toEqual(tirerEchantillonHumain(reponses, graine(2), 0.1));
  });

  it("rejoue la règle publiée : tri croissant, Fisher-Yates amorcé par la graine dérivée", () => {
    const reponses = ids(50);
    const attendu = melanger(reponses, generateur(graineDerivee(20261201, ["echantillon_humain"])));
    expect(CLE_ECHANTILLON_HUMAIN).toEqual(["echantillon_humain"]);
    expect(ordreEchantillonHumain(reponses, graine(20261201))).toEqual(attendu);
  });
});

describe("indépendance de l'ordre d'entrée", () => {
  it("permuter les identifiants reçus ne change pas l'échantillon humain", () => {
    const reponses = ids(123);
    const inverse = [...reponses].reverse();
    const melange = melanger(reponses, generateur(99n));
    const reference = tirerEchantillonHumain(reponses, graine(42), 0.25);
    expect(tirerEchantillonHumain(inverse, graine(42), 0.25)).toEqual(reference);
    expect(tirerEchantillonHumain(melange, graine(42), 0.25)).toEqual(reference);
  });

  it("permuter les éligibles ne change pas le sous-ensemble contrefactuel", () => {
    const eligibles = ids(450);
    const reference = tirerSousEnsembleContrefactuel(eligibles, graine(5));
    expect(tirerSousEnsembleContrefactuel([...eligibles].reverse(), graine(5))).toEqual(reference);
  });

  it("un identifiant en double est refusé, pas compté deux fois", () => {
    expect(() => tirerEchantillonHumain(["R1", "R2", "R1"], graine(1), 0.1)).toThrow(/en double/);
  });
});

describe("sous-ensemble contrefactuel (D14 (2))", () => {
  it("prend 200 réponses parmi plus de 200 éligibles, sans doublon", () => {
    const tire = tirerSousEnsembleContrefactuel(ids(1000), graine(3));
    expect(tire.reponse_ids).toHaveLength(TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL);
    expect(new Set(tire.reponse_ids).size).toBe(200);
    expect(tire).toMatchObject({ eligibles: 1000, taille_visee: 200, sous_effectif: false });
  });

  it("exactement 200 éligibles : toutes, sans sous-effectif", () => {
    const tire = tirerSousEnsembleContrefactuel(ids(200), graine(3));
    expect([...tire.reponse_ids].sort()).toEqual(ids(200));
    expect(tire.sous_effectif).toBe(false);
  });

  it("moins de 200 éligibles : toutes, et le sous-effectif est signalé", () => {
    const tire = tirerSousEnsembleContrefactuel(ids(57), graine(3));
    expect([...tire.reponse_ids].sort()).toEqual(ids(57));
    expect(tire).toMatchObject({ eligibles: 57, taille_visee: 200, sous_effectif: true });
  });

  it("aucun éligible : sous-ensemble vide, signalé", () => {
    expect(tirerSousEnsembleContrefactuel([], graine(3))).toEqual({
      reponse_ids: [],
      eligibles: 0,
      taille_visee: 200,
      sous_effectif: true,
    });
  });

  it("sa graine est distincte de celle de l'échantillon humain, même entier publié", () => {
    expect(CLE_SOUS_ENSEMBLE_CONTREFACTUEL).toEqual(["contrefactuel", "noms_candidats", "sous_ensemble"]);
    const attendu = melanger(ids(300), generateur(graineDerivee(8, CLE_SOUS_ENSEMBLE_CONTREFACTUEL))).slice(0, 200);
    expect(tirerSousEnsembleContrefactuel(ids(300), graine(8)).reponse_ids).toEqual(attendu);
  });
});

describe("graine non conforme", () => {
  it("refuse une graine qui déclare un autre générateur", () => {
    const autre: GraineTirage = { ...graine(1), algorithme: "pcg64" };
    expect(() => tirerEchantillonHumain(ids(10), autre, 0.1)).toThrow(GraineNonConforme);
    expect(() => tirerSousEnsembleContrefactuel(ids(10), autre)).toThrow(GraineNonConforme);
  });

  it("nomme l'échantillon, pas le tirage, dans le message de refus (constat 18 de la revue du 2026-10-12)", () => {
    const autre: GraineTirage = { ...graine(1), algorithme: "pcg64" };
    expect(() => tirerEchantillonHumain(ids(10), autre, 0.1)).toThrow(/Graine de l.échantillon non conforme/);
    expect(() => tirerSousEnsembleContrefactuel(ids(10), autre)).toThrow(/Graine de l.échantillon non conforme/);
  });
});
