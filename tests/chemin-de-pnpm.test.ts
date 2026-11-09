import { describe, expect, it } from "vitest";
import { cheminDePnpm } from "./site/construire-site.ts";

describe("cheminDePnpm (globalSetup du site)", () => {
  it("rend npm_execpath quand elle est posée", () => {
    expect(cheminDePnpm({ npm_execpath: "/x/pnpm.cjs" })).toBe("/x/pnpm.cjs");
  });
  it("lève une erreur nommée quand npm_execpath est absente", () => {
    expect(() => cheminDePnpm({})).toThrow(/npm_execpath absente/);
  });
  it("lève une erreur nommée quand npm_execpath est vide", () => {
    expect(() => cheminDePnpm({ npm_execpath: "" })).toThrow(/npm_execpath absente/);
  });
});
