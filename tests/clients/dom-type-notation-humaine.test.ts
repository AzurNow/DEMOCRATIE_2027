/** Constat 19 du 2026-09-23 / 36 du 2026-10-17 : un élément absent ou de mauvais type est une erreur nommée. */

import { describe, expect, it } from "vitest";
import { elementFacultatif, elementParId, ElementAbsent, ElementDeMauvaisType, type Racine } from "../../notation-humaine/client/dom-type.ts";

class Bouton {}
class Zone {}

function faux(elements: Readonly<Record<string, object>>): Racine {
  return { getElementById: (id: string) => elements[id] ?? null };
}

describe("elementParId (notation humaine)", () => {
  it("rend l'élément du bon type", () => {
    const bouton = new Bouton();
    expect(elementParId("b", Bouton, faux({ b: bouton }))).toBe(bouton);
  });

  it("élément absent : ElementAbsent, qui dit l'identifiant", () => {
    expect(() => elementParId("fantome", Bouton, faux({}))).toThrow(ElementAbsent);
    expect(() => elementParId("fantome", Bouton, faux({}))).toThrow(/#fantome/);
  });

  it("élément de mauvais type : ElementDeMauvaisType, qui dit l'identifiant et le type attendu", () => {
    expect(() => elementParId("b", Bouton, faux({ b: new Zone() }))).toThrow(ElementDeMauvaisType);
    expect(() => elementParId("b", Bouton, faux({ b: new Zone() }))).toThrow(/#b.*Bouton/);
  });

  it("elementFacultatif : absent donne null, mauvais type lève", () => {
    expect(elementFacultatif("x", Bouton, faux({}))).toBeNull();
    expect(() => elementFacultatif("x", Bouton, faux({ x: new Zone() }))).toThrow(ElementDeMauvaisType);
  });
});
