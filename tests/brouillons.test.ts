/**
 * Brouillons de saisie (`validation/io/brouillons.ts`) : lecture tolérante d'un fichier illisible,
 * écriture par renommage (revue du 2026-10-12, constat 12, PR #184 incomplète).
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Brouillons, erreursBrouillon, type Brouillon } from "../validation/io/brouillons.ts";

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "brouillons-"));
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

const BROUILLON: Brouillon = { lot_id: "lot-001", item_id: "x", duree_affichage_ms: 10, duree_active_ms: 5 };

describe("lecture d'un brouillon illisible", () => {
  it("un fichier tronqué est traité comme absent, signalé sur stderr, jamais supprimé", () => {
    const brouillons = new Brouillons(racine, "a1");
    const chemin = join(racine, "a1.json");
    writeFileSync(chemin, '{"lot_id":"lot-0', "utf8");
    const espion = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(brouillons.lire()).toBeNull();
      const ecrit = espion.mock.calls.map((appel) => String(appel[0])).join("");
      expect(ecrit).toContain(chemin);
    } finally {
      espion.mockRestore();
    }
    expect(readFileSync(chemin, "utf8")).toBe('{"lot_id":"lot-0');
  });

  it("un brouillon réécrit après un fichier tronqué redevient lisible", () => {
    const brouillons = new Brouillons(racine, "a1");
    writeFileSync(join(racine, "a1.json"), '{"lot_id":"lot-0', "utf8");
    brouillons.ecrire(BROUILLON);
    expect(brouillons.lire()).toEqual(BROUILLON);
  });
});

describe("écriture atomique", () => {
  it("une interruption pendant l'écriture laisse l'ancien brouillon lisible et aucun temporaire", () => {
    const ancien: Brouillon = { ...BROUILLON, duree_active_ms: 1 };
    new Brouillons(racine, "a1").ecrire(ancien);
    const interrompue = new Brouillons(racine, "a1", {
      writeSync: () => {
        throw new Error("coupure simulée");
      },
      fsyncSync: () => undefined,
    });
    expect(() => interrompue.ecrire({ ...BROUILLON, duree_active_ms: 99 })).toThrow("coupure simulée");
    expect(new Brouillons(racine, "a1").lire()).toEqual(ancien);
    expect(readdirSync(racine)).toEqual(["a1.json"]);
  });

  it("un temporaire laissé par un processus tué ne bloque pas l'écriture suivante", () => {
    writeFileSync(join(racine, "a1.json.brouillon-1"), '{"lot_id":"lot-0', "utf8");
    const brouillons = new Brouillons(racine, "a1");
    brouillons.ecrire(BROUILLON);
    expect(brouillons.lire()).toEqual(BROUILLON);
    expect(existsSync(join(racine, "a1.json"))).toBe(true);
  });
});

describe("forme d'un brouillon", () => {
  it("une durée négative est refusée", () => {
    const erreurs = erreursBrouillon({ ...BROUILLON, duree_active_ms: -1 });
    expect(erreurs.some((e) => e.includes("duree_active_ms"))).toBe(true);
  });
});
