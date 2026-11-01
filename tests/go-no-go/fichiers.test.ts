/**
 * `pipeline/go-no-go/fichiers.ts` (Lot 6 de la vague du 2026-11-01) : l'écriture de `run.json` et
 * `checklist.json` par le go/no-go passe par l'aide partagée `pipeline/run/ecriture.ts`, comme les
 * trois autres écrivains de `run.json`. Un temporaire orphelin lève `TemporaireOrphelin` (nommé, et
 * non un `EEXIST` brut) ; un échec d'écriture rattrapé retire le temporaire qu'on vient de créer.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ecrireParRenommage } from "../../pipeline/go-no-go/fichiers.ts";
import { type EcritureTemporaire, TemporaireOrphelin } from "../../pipeline/run/ecriture.ts";

let repertoire = "";

afterEach(() => {
  if (repertoire !== "") rmSync(repertoire, { recursive: true, force: true });
  repertoire = "";
});

function poser(): { chemin: string; temporaire: string; contenuInitial: string } {
  repertoire = mkdtempSync(join(tmpdir(), "banc-go-no-go-fichiers-"));
  const chemin = join(repertoire, "run.json");
  const contenuInitial = `${JSON.stringify({ exemple: "avant" }, null, 2)}\n`;
  writeFileSync(chemin, contenuInitial, "utf8");
  return { chemin, temporaire: `${chemin}.go-no-go`, contenuInitial };
}

function capter(appel: () => void): unknown {
  try {
    appel();
  } catch (erreur) {
    return erreur;
  }
  throw new Error("l'appel n'a pas levé");
}

describe("go-no-go/fichiers : ecrireParRenommage", () => {
  it("un temporaire orphelin lève TemporaireOrphelin (classe exacte, jamais un EEXIST brut), rien écrasé ni supprimé", () => {
    const { chemin, temporaire, contenuInitial } = poser();
    writeFileSync(temporaire, "tronqué par un arrêt", "utf8");

    const erreur = capter(() => ecrireParRenommage(chemin, { exemple: "apres" }));

    expect(erreur).toBeInstanceOf(TemporaireOrphelin);
    expect((erreur as Error).name).toBe("TemporaireOrphelin");
    expect((erreur as Error).message).toContain(temporaire);
    expect(readFileSync(temporaire, "utf8")).toBe("tronqué par un arrêt");
    expect(readFileSync(chemin, "utf8")).toBe(contenuInitial);
  });

  it("un échec d'écriture rattrapé retire le temporaire, remonte l'erreur d'origine, laisse le fichier intact ; la relance écrit", () => {
    const { chemin, temporaire, contenuInitial } = poser();
    const erreurDisque = new Error("ENOSPC: no space left on device, write");
    const ecritureQuiEchoue: EcritureTemporaire = {
      writeSync: () => {
        throw erreurDisque;
      },
      fsyncSync: () => {
        throw new Error("fsyncSync ne doit pas être atteint");
      },
    };

    expect(() => ecrireParRenommage(chemin, { exemple: "apres" }, ecritureQuiEchoue)).toThrow(erreurDisque);
    expect(existsSync(temporaire)).toBe(false);
    expect(readFileSync(chemin, "utf8")).toBe(contenuInitial);

    ecrireParRenommage(chemin, { exemple: "apres" });
    expect(JSON.parse(readFileSync(chemin, "utf8")) as unknown).toEqual({ exemple: "apres" });
    expect(existsSync(temporaire)).toBe(false);
  });
});
