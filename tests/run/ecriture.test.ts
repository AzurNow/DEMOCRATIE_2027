/**
 * Lot 8 (constat 22 du 2026-10-17, constats 29 et 30 du 2026-10-12) : `ecrireParRenommage` refuse un
 * temporaire orphelin par une erreur nommée plutôt qu'un `EEXIST` brut, et une interruption rattrapée
 * de l'écriture du temporaire (relecture de Lot 8) ne laisse aucun temporaire derrière elle.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ecrireParRenommage, type EcritureTemporaire, TemporaireOrphelin } from "../../pipeline/run/ecriture.ts";

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

function poserSansTemporaire(): { chemin: string; temporaire: string; contenuInitial: string } {
  repertoire = mkdtempSync(join(tmpdir(), "banc-ecriture-renommage-"));
  const chemin = join(repertoire, "run.json");
  const contenuInitial = `${JSON.stringify({ exemple: "avant" }, null, 2)}\n`;
  writeFileSync(chemin, contenuInitial, "utf8");
  return { chemin, temporaire: `${chemin}.invalidation`, contenuInitial };
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

describe("ecrireParRenommage, interruption rattrapée de l'écriture du temporaire", () => {
  it("un échec de l'écriture du temporaire, rattrapé par ce processus (disque plein, par exemple), ne laisse aucun temporaire, remonte l'erreur d'origine, run.json inchangé à l'octet, et la relance directe écrit run.json", () => {
    const { chemin, temporaire, contenuInitial } = poserSansTemporaire();
    const erreurDisque = new Error("ENOSPC: no space left on device, write");
    const ecritureQuiEchoue: EcritureTemporaire = {
      writeSync: () => {
        throw erreurDisque;
      },
      fsyncSync: () => {
        throw new Error("fsyncSync ne doit pas être atteint : writeSync a déjà levé");
      },
    };

    expect(() => ecrireParRenommage(chemin, { exemple: "apres" }, "invalidation", ecritureQuiEchoue)).toThrow(erreurDisque);
    expect(existsSync(temporaire)).toBe(false);
    expect(readFileSync(chemin, "utf8")).toBe(contenuInitial);

    ecrireParRenommage(chemin, { exemple: "apres" }, "invalidation");

    expect(JSON.parse(readFileSync(chemin, "utf8")) as unknown).toEqual({ exemple: "apres" });
    expect(existsSync(temporaire)).toBe(false);
  });

  it("un échec de la synchronisation (fsyncSync) du temporaire, rattrapé par ce processus, ne laisse aucun temporaire et remonte l'erreur d'origine", () => {
    const { chemin, temporaire, contenuInitial } = poserSansTemporaire();
    const erreurDisque = new Error("EIO: i/o error, fsync");
    const ecritureQuiEchoue: EcritureTemporaire = {
      writeSync: (descripteur, contenu) => contenu.length,
      fsyncSync: () => {
        throw erreurDisque;
      },
    };

    expect(() => ecrireParRenommage(chemin, { exemple: "apres" }, "invalidation", ecritureQuiEchoue)).toThrow(erreurDisque);
    expect(existsSync(temporaire)).toBe(false);
    expect(readFileSync(chemin, "utf8")).toBe(contenuInitial);
  });
});
