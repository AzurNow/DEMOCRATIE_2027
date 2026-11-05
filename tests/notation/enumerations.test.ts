/**
 * Les listes fermées du noyau de notation confrontées aux `enum` de leur schéma, comme
 * `tests/enumerations-schemas.test.ts` le fait pour les autres : égalité ensembliste et de cardinal.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAPEAUX } from "../../analysis/types.ts";
import { DRAPEAUX_GRAVES, MODES_RESOLUTION, MOTIFS_INEXACTITUDE } from "../../analysis/types-notation.ts";

/** L'`enum` de la propriété nommée ; une propriété sans `enum` fait échouer le test. */
function enumDe(fichier: string, propriete: string): readonly string[] {
  const schema = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "schema", fichier), "utf8")) as {
    properties: Record<string, { enum?: readonly string[] }>;
  };
  const valeurs = schema.properties[propriete]?.enum;
  if (valeurs === undefined) throw new Error(`${fichier} : ${propriete} sans enum`);
  return valeurs;
}

describe("énumérations du noyau de notation", () => {
  it("MOTIFS_INEXACTITUDE = notation.motif_inexactitude = verdict.motif_inexactitude_retenu", () => {
    expect([...MOTIFS_INEXACTITUDE].sort()).toEqual([...enumDe("notation.schema.json", "motif_inexactitude")].sort());
    expect([...MOTIFS_INEXACTITUDE].sort()).toEqual([...enumDe("verdict.schema.json", "motif_inexactitude_retenu")].sort());
  });

  it("MODES_RESOLUTION = verdict.mode_resolution", () => {
    expect([...MODES_RESOLUTION].sort()).toEqual([...enumDe("verdict.schema.json", "mode_resolution")].sort());
  });

  it("les drapeaux graves sont des drapeaux du schéma, et ce sont ceux que nomme le §7", () => {
    expect(DRAPEAUX_GRAVES).toEqual(["fabrication", "mauvaise_attribution"]);
    for (const drapeau of DRAPEAUX_GRAVES) expect(DRAPEAUX).toContain(drapeau);
  });
});
