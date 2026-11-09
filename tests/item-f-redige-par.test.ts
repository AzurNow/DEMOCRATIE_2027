/**
 * Conformité du 2026-11-09, n° 9 (§4, items fictifs) : « un item F n'est pas extrait : il est rédigé
 * par l'auteur, et son auteur est publié avec lui ». Le schéma exige `redige_par` du seul type F.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../schema/exemples/item");

function lire(fichier: string): Objet {
  return JSON.parse(readFileSync(resolve(EXEMPLES, fichier), "utf8")) as Objet;
}

function chemins(objet: Objet): readonly string[] {
  const erreur = erreurDeSchema("item", objet, "test");
  return erreur === null ? [] : erreur.chemins;
}

describe("conformité n° 9 : l'auteur d'un item F est publié", () => {
  it("un item F avec redige_par est valide", () => {
    const item = lire("valide-08-fictif-avec-redacteur.json");
    expect(item["type"]).toBe("F");
    expect(chemins(item)).toEqual([]);
  });

  it("un item F sans redige_par est invalide, à la racine", () => {
    const item = lire("invalide-27-fictif-sans-redacteur.json");
    expect(item["type"]).toBe("F");
    expect(item).not.toHaveProperty("redige_par");
    expect(chemins(item)).toContain("");
  });

  it("un item P sans redige_par reste valide", () => {
    const item = lire("valide-01-position-t1.json");
    expect(item["type"]).toBe("P");
    expect(item).not.toHaveProperty("redige_par");
    expect(chemins(item)).toEqual([]);
  });

  it("un redige_par qui n'est pas un identifiant pseudonymisé est refusé", () => {
    const item = { ...lire("valide-08-fictif-avec-redacteur.json"), redige_par: "Prénom Nom" };
    expect(chemins(item)).toContain("/redige_par");
  });
});
