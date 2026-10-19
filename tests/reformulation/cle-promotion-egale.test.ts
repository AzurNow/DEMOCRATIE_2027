/**
 * Constat 10 (revue du 2026-10-17) : une seule égalité de `ClePromotion`, réutilisée par la
 * reprise, la relecture, le gel et l'écriture partout où ils comparent deux clés de promotion
 * (même texte neutre relu, même position affirmée).
 */

import { describe, expect, it } from "vitest";
import { clePromotionEgale, type ClePromotion } from "../../pipeline/reformulation/relecture.ts";

const EMPREINTE = "a".repeat(64);
const AUTRE_EMPREINTE = "b".repeat(64);

function cle(partiel: Partial<ClePromotion> = {}): ClePromotion {
  return { empreinte_texte_neutre: EMPREINTE, position: "pour", ...partiel };
}

describe("clePromotionEgale", () => {
  it("même empreinte, même position ⇒ égales", () => {
    expect(clePromotionEgale(cle(), cle())).toBe(true);
  });

  it("empreinte différente, même position ⇒ inégales", () => {
    expect(clePromotionEgale(cle(), cle({ empreinte_texte_neutre: AUTRE_EMPREINTE }))).toBe(false);
  });

  it("même empreinte, position différente ⇒ inégales", () => {
    expect(clePromotionEgale(cle(), cle({ position: "contre" }))).toBe(false);
  });

  it("les deux champs différents ⇒ inégales", () => {
    expect(clePromotionEgale(cle(), cle({ empreinte_texte_neutre: AUTRE_EMPREINTE, position: "contre" }))).toBe(false);
  });

  it("AUCUNE n'est égale qu'à elle-même", () => {
    expect(clePromotionEgale(cle({ position: "AUCUNE" }), cle({ position: "AUCUNE" }))).toBe(true);
    expect(clePromotionEgale(cle({ position: "AUCUNE" }), cle({ position: "pour" }))).toBe(false);
  });
});
