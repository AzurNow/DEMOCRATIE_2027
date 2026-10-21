/**
 * Lot 8 (constat 22 du 2026-10-17, constats 29 et 30 du 2026-10-12) : `ecrireParRenommage` refuse un
 * temporaire orphelin par une erreur nommée plutôt qu'un `EEXIST` brut.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ecrireParRenommage, TemporaireOrphelin } from "../../pipeline/run/ecriture.ts";

let repertoire: string | null = null;

afterEach(() => {
  if (repertoire !== null) rmSync(repertoire, { recursive: true, force: true });
  repertoire = null;
});

function poser(): { chemin: string; temporaire: string; contenuInitial: string } {
  repertoire = mkdtempSync(join(tmpdir(), "banc-ecriture-renommage-"));
  const chemin = join(repertoire, "run.json");
  const contenuInitial = `${JSON.stringify({ exemple: "avant" }, null, 2)}\n`;
  writeFileSync(chemin, contenuInitial, "utf8");
  const temporaire = `${chemin}.invalidation`;
  writeFileSync(temporaire, "reste d'une écriture interrompue", "utf8");
  return { chemin, temporaire, contenuInitial };
}

describe("ecrireParRenommage, temporaire orphelin", () => {
  it("un temporaire <chemin>.<suffixe> déjà présent lève TemporaireOrphelin : nomme le temporaire et le suffixe, run.json inchangé à l'octet, temporaire ni supprimé ni modifié", () => {
    const { chemin, temporaire, contenuInitial } = poser();

    let erreur: unknown;
    try {
      ecrireParRenommage(chemin, { exemple: "apres" }, "invalidation");
    } catch (e) {
      erreur = e;
    }

    expect(erreur).toBeInstanceOf(TemporaireOrphelin);
    expect((erreur as Error).name).toBe("TemporaireOrphelin");
    expect((erreur as Error).message).toContain(temporaire);
    expect((erreur as Error).message).toContain("invalidation");
    expect(readFileSync(chemin, "utf8")).toBe(contenuInitial);
    expect(readFileSync(temporaire, "utf8")).toBe("reste d'une écriture interrompue");
  });

  it("sans temporaire laissé, écrit run.json et ne laisse aucun temporaire", () => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-ecriture-renommage-"));
    const chemin = join(repertoire, "run.json");
    writeFileSync(chemin, `${JSON.stringify({ exemple: "avant" }, null, 2)}\n`, "utf8");

    ecrireParRenommage(chemin, { exemple: "apres" }, "invalidation");

    expect(JSON.parse(readFileSync(chemin, "utf8")) as unknown).toEqual({ exemple: "apres" });
    expect(() => readFileSync(`${chemin}.invalidation`, "utf8")).toThrow();
  });
});
