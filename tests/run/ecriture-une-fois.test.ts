/**
 * `ecrireUneFois` (`pipeline/run/ecriture.ts`) : la seule écriture « exclusive, atomique, une fois »
 * par lien dur, partagée par le journal des octets reçus de l'interrogation
 * (`pipeline/interrogation/journal.ts`) et le staging des reformulations
 * (`pipeline/reformulation/staging.ts`). Chaque appelant garde son refus nommé.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ecrireUneFois } from "../../pipeline/run/ecriture.ts";

class DejaLa extends Error {
  constructor(chemin: string) {
    super(`déjà là : ${chemin}`);
    this.name = "DejaLa";
  }
}

let repertoire: string | null = null;

function poser(): string {
  repertoire = mkdtempSync(join(tmpdir(), "banc-ecriture-une-fois-"));
  return repertoire;
}

afterEach(() => {
  if (repertoire !== null) rmSync(repertoire, { recursive: true, force: true });
  repertoire = null;
});

describe("ecrireUneFois", () => {
  it("écrit les octets exacts sous le nom final, rend son chemin, ne laisse aucun temporaire", () => {
    const dossier = poser();
    const octets = new Uint8Array([0, 255, 10, 0xe2, 0x80, 0x9c]);
    const chemin = ecrireUneFois(dossier, "a.octets", octets, (c) => new DejaLa(c));
    expect(chemin).toBe(join(dossier, "a.octets"));
    expect(new Uint8Array(readFileSync(chemin))).toEqual(octets);
    expect(readdirSync(dossier)).toEqual(["a.octets"]);
  });

  it("écrit un texte en UTF-8, guillemets typographiques compris", () => {
    const dossier = poser();
    const chemin = ecrireUneFois(dossier, "a.txt", "« cause » “citée”\n", (c) => new DejaLa(c));
    expect(readFileSync(chemin, "utf8")).toBe("« cause » “citée”\n");
  });

  it("un nom déjà pris lève le refus nommé de l'appelant, sans toucher au fichier ni laisser de temporaire", () => {
    const dossier = poser();
    const chemin = join(dossier, "a.json");
    writeFileSync(chemin, "avant", "utf8");
    expect(() => ecrireUneFois(dossier, "a.json", "après", (c) => new DejaLa(c))).toThrow(DejaLa);
    expect(() => ecrireUneFois(dossier, "a.json", "après", (c) => new DejaLa(c))).toThrow(chemin);
    expect(readFileSync(chemin, "utf8")).toBe("avant");
    expect(readdirSync(dossier)).toEqual(["a.json"]);
  });

  it("un répertoire absent n'est pas créé : l'erreur du système remonte telle quelle", () => {
    const dossier = poser();
    expect(() => ecrireUneFois(join(dossier, "absent"), "a.json", "x", (c) => new DejaLa(c))).toThrow(/ENOENT/);
  });
});
