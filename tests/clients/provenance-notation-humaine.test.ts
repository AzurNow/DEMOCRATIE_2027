/**
 * Constat 34 du 2026-10-12 : la provenance d'un extrait n'a aucune valeur par défaut. Un extrait
 * sans provenance choisie est refusé côté client, avec un message, sans envoi.
 */

import { describe, expect, it } from "vitest";
import { erreurDeProvenance, valeurChoisie } from "../../notation-humaine/client/provenance.ts";

describe("provenance de l'extrait", () => {
  it("extrait saisi, provenance absente : refus avec message", () => {
    expect(erreurDeProvenance("une phrase", null)).toMatch(/provenance/i);
  });

  it("extrait saisi, provenance choisie : pas d'erreur", () => {
    expect(erreurDeProvenance("une phrase", "reponse")).toBeNull();
  });

  it("aucun extrait : la provenance n'est pas exigée", () => {
    expect(erreurDeProvenance("", null)).toBeNull();
  });

  it("« — choisir — » (valeur vide) vaut absence de choix", () => {
    expect(valeurChoisie({ value: "" })).toBeNull();
    expect(valeurChoisie({ value: "reponse" })).toBe("reponse");
  });
});
