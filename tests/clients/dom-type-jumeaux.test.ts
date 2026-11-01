/** Les deux `dom-type.ts` sont des jumeaux voulus (un par client) : ils ne doivent pas diverger. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const racine = join(import.meta.dirname, "..", "..");

/** Le texte du module, sans la ligne qui nomme son jumeau : seule différence admise. */
function sansRenvoiAuJumeau(chemin: string): string {
  const lignes = readFileSync(join(racine, chemin), "utf8").split("\n");
  const renvois = lignes.filter((ligne) => ligne.includes("le jumeau vit dans"));
  expect(renvois, chemin).toHaveLength(1);
  return lignes.filter((ligne) => !ligne.includes("le jumeau vit dans")).join("\n");
}

describe("dom-type.ts, jumeaux des deux clients", () => {
  it("validation/client et notation-humaine/client sont identiques, hors la ligne qui nomme le jumeau", () => {
    expect(sansRenvoiAuJumeau("validation/client/dom-type.ts")).toBe(
      sansRenvoiAuJumeau("notation-humaine/client/dom-type.ts"),
    );
  });
});
