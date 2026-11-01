/**
 * Garde de confinement de `lireLot` (défense en profondeur, Lot 4) : le chemin résolu d'un
 * manifeste reste sous le répertoire des lots, même si l'appelant a oublié de valider l'identifiant.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lireLot, LotHorsRepertoire } from "../validation/io/lots-fichier.ts";

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "lots-confinement-"));
  mkdirSync(join(racine, "lots"));
  mkdirSync(join(racine, "hors-lots"));
  writeFileSync(join(racine, "hors-lots", "x.json"), "{}", "utf8");
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

describe("lireLot", () => {
  it("refuse un identifiant dont le chemin résolu sort du répertoire des lots", () => {
    for (const lot_id of ["../hors-lots/x", "a/../../hors-lots/x"]) {
      expect(() => lireLot(join(racine, "lots"), lot_id), lot_id).toThrow(LotHorsRepertoire);
    }
  });

  it("un identifiant ordinaire absent reste null", () => {
    expect(lireLot(join(racine, "lots"), "lot-001")).toBeNull();
  });
});
