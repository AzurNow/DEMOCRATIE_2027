/**
 * `outils/items-au-gel.ts` hors de la ligne de commande (conformité du 2026-09-29, n° 9). Les cas de
 * bout en bout, dépôt Git compris, sont dans `symmetry-cli.test.ts` ; ici, la comparaison des
 * empreintes et le refus d'un run sans commit du gel, que le schéma du run arrête désormais avant
 * la barrière (décision de l'auteur du 2026-10-01) mais que la fonction refuse aussi seule.
 */

import { describe, expect, it } from "vitest";
import { GitInaccessible } from "../outils/executer-git.ts";
import { ecartsAuGel, exigerItemsDuGel, ItemsHorsDuGel } from "../outils/items-au-gel.ts";

function sansGit<T>(appel: () => T): T {
  const avant = process.env["PATH"];
  process.env["PATH"] = "";
  try {
    return appel();
  } finally {
    process.env["PATH"] = avant;
  }
}

const GEL = new Map([
  ["a.json", "1111"],
  ["b.json", "2222"],
]);

describe("ecartsAuGel", () => {
  it("rend une liste vide quand les noms et les empreintes sont les mêmes", () => {
    expect(ecartsAuGel(GEL, new Map(GEL))).toEqual([]);
  });

  it("nomme chaque écart, trié par nom : absent reçu, absent du gel, modifié", () => {
    const recues = new Map([
      ["b.json", "2223"],
      ["c.json", "3333"],
    ]);
    expect(ecartsAuGel(GEL, recues)).toEqual([
      "a.json absent des items reçus",
      "b.json modifié depuis le gel",
      "c.json absent du gel",
    ]);
  });

  it("un gel vide face à des items reçus : chacun est absent du gel", () => {
    expect(ecartsAuGel(new Map(), GEL)).toEqual(["a.json absent du gel", "b.json absent du gel"]);
  });
});

describe("exigerItemsDuGel", () => {
  it("refuse un run sans commit du gel, sans lire aucun dépôt", () => {
    expect(() => exigerItemsDuGel("/nulle-part", undefined)).toThrow(ItemsHorsDuGel);
    expect(() => exigerItemsDuGel("/nulle-part", undefined)).toThrow("versions.donnees_commit");
  });

  it("répertoire inexistant : ItemsHorsDuGel nommé, dont la cause dit le répertoire absent, jamais « git introuvable » (constat 37 de la revue du 2026-10-12)", () => {
    expect(() => exigerItemsDuGel("/nulle-part-xyz", "0".repeat(40))).toThrow(ItemsHorsDuGel);
    try {
      exigerItemsDuGel("/nulle-part-xyz", "0".repeat(40));
      throw new Error("exigerItemsDuGel n'a pas levé");
    } catch (erreur) {
      expect((erreur as Error).message).not.toContain("git introuvable");
      expect((erreur as Error).message).toMatch(/inexistant/);
    }
  });

  it("git absent du PATH, répertoire existant : GitInaccessible, pas une TypeError (constat 37 de la revue du 2026-10-12)", () => {
    const erreur = sansGit(() => {
      try {
        exigerItemsDuGel(".", "0".repeat(40));
        throw new Error("exigerItemsDuGel n'a pas levé");
      } catch (e) {
        return e;
      }
    });
    expect(erreur).toBeInstanceOf(GitInaccessible);
  });
});
