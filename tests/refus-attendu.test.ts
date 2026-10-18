/**
 * `outils/refus-attendu.ts` (revue du 2026-10-17, constat 20 ; revue du 2026-10-12, constat 32) :
 * distingue un refus métier (classe nommée, ou `Error` nue comme en lève `outils/arguments.ts`)
 * d'un bogue (`TypeError`, `RangeError`…), seul à devoir remonter avec sa pile.
 */

import { describe, expect, it } from "vitest";
import { estUnRefusAttendu } from "../outils/refus-attendu.ts";

class RefusNomme extends Error {
  constructor() {
    super("refusé");
    this.name = "RefusNomme";
  }
}

describe("estUnRefusAttendu", () => {
  it("une classe nommée du dépôt est un refus attendu", () => {
    expect(estUnRefusAttendu(new RefusNomme())).toBe(true);
  });

  it("une Error nue (obligatoire, dansListe…) est un refus attendu", () => {
    expect(estUnRefusAttendu(new Error("--motif est obligatoire"))).toBe(true);
  });

  it("une erreur native de bogue remonte : TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError", () => {
    for (const bogue of [new TypeError("x"), new RangeError("x"), new ReferenceError("x"), new SyntaxError("x"), new EvalError("x"), new URIError("x")]) {
      expect(estUnRefusAttendu(bogue)).toBe(false);
    }
  });

  it("une valeur qui n'est pas une Error n'est jamais un refus attendu", () => {
    expect(estUnRefusAttendu("texte")).toBe(false);
    expect(estUnRefusAttendu(undefined)).toBe(false);
  });
});
