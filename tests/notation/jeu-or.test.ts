/**
 * Tirage du jeu d'or (§7, calibration ; D18) : 300 réponses obtenues du run pilote, graine dérivée de
 * `run.graines.echantillon_humain` et de la clé `["jeu_or"]`, indépendante de l'échantillon humain.
 * Cas limite 7 du brief notation-humaine (partie tirage).
 */

import { describe, expect, it } from "vitest";
import { graineDerivee } from "../../analysis/graines.ts";
import {
  CLE_ECHANTILLON_HUMAIN,
  CLE_JEU_OR,
  TAILLE_JEU_OR,
  tirerEchantillonHumain,
  tirerJeuOr,
} from "../../pipeline/notation/echantillons.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/graine.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `R${String(i).padStart(5, "0")}`);
}

describe("tirerJeuOr", () => {
  it("constantes : clé lisible et taille du §7", () => {
    expect(CLE_JEU_OR).toEqual(["jeu_or"]);
    expect(TAILLE_JEU_OR).toBe(300);
  });

  it("300 parmi 1000 : sans doublon, sans sous-effectif", () => {
    const jeu = tirerJeuOr(ids(1000), graine(20261201));
    expect(jeu.reponse_ids).toHaveLength(300);
    expect(new Set(jeu.reponse_ids).size).toBe(300);
    expect(jeu).toMatchObject({ obtenues: 1000, taille_visee: 300, sous_effectif: false });
  });

  it("exactement 300 obtenues : toutes, sans sous-effectif", () => {
    const jeu = tirerJeuOr(ids(300), graine(3));
    expect([...jeu.reponse_ids].sort()).toEqual(ids(300));
    expect(jeu.sous_effectif).toBe(false);
  });

  it("sous-effectif (120 obtenues) : toutes sont prises, et c'est dit", () => {
    const jeu = tirerJeuOr(ids(120), graine(3));
    expect([...jeu.reponse_ids].sort()).toEqual(ids(120));
    expect(jeu).toMatchObject({ obtenues: 120, taille_visee: 300, sous_effectif: true });
  });

  it("rejoue la règle publiée : tri croissant, Fisher-Yates amorcé par graineDerivee(valeur, [\"jeu_or\"])", () => {
    const attendu = melanger(ids(1000), generateur(graineDerivee(20261201, ["jeu_or"]))).slice(0, 300);
    expect(tirerJeuOr(ids(1000), graine(20261201)).reponse_ids).toEqual(attendu);
  });

  it("valeur de référence figée (graine 20261201, 1000 réponses R00000 à R00999)", () => {
    const jeu = tirerJeuOr(ids(1000), graine(20261201));
    expect(jeu.reponse_ids.slice(0, 8)).toEqual(REFERENCE_8_PREMIERS);
    expect(jeu.reponse_ids.at(-1)).toBe(REFERENCE_DERNIER);
  });

  it("indépendant de l'échantillon humain : clé différente, ordre différent, même entier publié", () => {
    expect(CLE_JEU_OR).not.toEqual(CLE_ECHANTILLON_HUMAIN);
    const reponses = ids(1000);
    const jeu = tirerJeuOr(reponses, graine(20261201)).reponse_ids;
    const echantillon = tirerEchantillonHumain(reponses, graine(20261201), 0.25);
    expect(jeu.slice(0, echantillon.length)).not.toEqual(echantillon);
    // Ni préfixe l'un de l'autre : seul un recouvrement de hasard est possible.
    const communs = jeu.filter((id) => echantillon.includes(id)).length;
    expect(communs).toBeLessThan(echantillon.length);
  });

  it("indépendant de l'ordre d'entrée", () => {
    const reponses = ids(500);
    expect(tirerJeuOr([...reponses].reverse(), graine(9))).toEqual(tirerJeuOr(reponses, graine(9)));
  });

  it("un identifiant en double est refusé", () => {
    expect(() => tirerJeuOr(["R1", "R1"], graine(1))).toThrow(/en double/);
  });

  it("une graine d'un autre générateur est refusée", () => {
    expect(() => tirerJeuOr(ids(10), { ...graine(1), algorithme: "pcg64" })).toThrow(GraineNonConforme);
  });
});

/** Calculée une fois au premier tirage, puis figée : un changement de consommation la casse. */
const REFERENCE_8_PREMIERS: readonly string[] = ["R00096", "R00758", "R00174", "R00022", "R00866", "R00299", "R00793", "R00246"];
const REFERENCE_DERNIER = "R00843";
