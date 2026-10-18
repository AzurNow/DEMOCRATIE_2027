/**
 * `validation/domaine/validateurs-champ.ts` : la frontière partagée par les trois registres de
 * mesures (revue du 2026-10-17, constat 11). Chaque fonction délègue la levée d'erreur à
 * l'appelant (`leveErreur`), pour que chaque registre garde son propre type d'erreur nommée.
 */

import { describe, expect, it } from "vitest";
import { DATE_CIVILE, dateCivileValide, objetOuLeve, refuserChampsEnTrop } from "../validation/domaine/validateurs-champ.ts";

class ErreurDeTest extends Error {
  constructor(detail: string, provenance: string) {
    super(`${provenance} : ${detail}`);
    this.name = "ErreurDeTest";
  }
}

function leve(detail: string, provenance: string): never {
  throw new ErreurDeTest(detail, provenance);
}

describe("objetOuLeve", () => {
  it("rend l'objet tel quel quand la valeur est un objet JSON", () => {
    expect(objetOuLeve({ a: 1 }, "test", leve)).toEqual({ a: 1 });
  });

  it.each([null, undefined, "x", 1, true, [], [1, 2]])("lève sur %s, qui n'est pas un objet", (valeur) => {
    expect(() => objetOuLeve(valeur, "prov", leve)).toThrow(ErreurDeTest);
    expect(() => objetOuLeve(valeur, "prov", leve)).toThrow(/n'est pas un objet JSON/);
  });

  it("transmet la provenance à l'erreur levée", () => {
    expect(() => objetOuLeve(null, "une provenance précise", leve)).toThrow(/une provenance précise/);
  });
});

describe("refuserChampsEnTrop", () => {
  const CHAMPS: ReadonlySet<string> = new Set(["a", "b"]);

  it("ne lève rien quand tous les champs sont connus", () => {
    expect(() => refuserChampsEnTrop({ a: 1, b: 2 }, CHAMPS, "prov", leve)).not.toThrow();
  });

  it("ne lève rien quand un champ connu est absent", () => {
    expect(() => refuserChampsEnTrop({ a: 1 }, CHAMPS, "prov", leve)).not.toThrow();
  });

  it("lève en nommant le ou les champs en trop", () => {
    expect(() => refuserChampsEnTrop({ a: 1, c: 3, d: 4 }, CHAMPS, "prov", leve)).toThrow(/c, d/);
  });
});

describe("DATE_CIVILE", () => {
  it.each(["2026-11-20", "0001-01-01", "9999-12-31"])("accepte la forme AAAA-MM-JJ : %s", (valeur) => {
    expect(DATE_CIVILE.test(valeur)).toBe(true);
  });

  it.each(["2026-1-20", "26-11-20", "2026/11/20", "", "2026-11-20T00:00:00Z"])("refuse une forme différente : %s", (valeur) => {
    expect(DATE_CIVILE.test(valeur)).toBe(false);
  });
});

describe("dateCivileValide", () => {
  it.each(["2026-11-20", "2026-01-01", "2026-12-31", "2024-02-29"])("accepte une vraie date civile : %s", (valeur) => {
    expect(dateCivileValide(valeur)).toBe(true);
  });

  it.each([
    ["2027-02-29", "pas une année bissextile"],
    ["2026-19-01", "mois hors 1-12"],
    ["2027-04-31", "avril n'a que 30 jours"],
    ["2026-00-10", "mois 0"],
    ["2026-11-00", "jour 0"],
  ])("refuse %s par aller-retour (%s), sans glisser au jour suivant", (valeur) => {
    expect(dateCivileValide(valeur)).toBe(false);
  });

  it.each(["2026-1-20", "26-11-20", ""])("refuse une forme qui n'est déjà pas AAAA-MM-JJ : %s", (valeur) => {
    expect(dateCivileValide(valeur)).toBe(false);
  });
});
