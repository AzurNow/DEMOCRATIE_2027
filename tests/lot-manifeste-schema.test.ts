/**
 * `schema/lot.schema.json` confronté à `lireLot`, `lireLots`, `ecrireLot` et `ecrireLots`
 * (revue du 2026-10-12, constat 4 ; D55 (3)).
 *
 * Avant ce lot, `lireEtValiderLot` faisait `JSON.parse(...) as Lot` et ne contrôlait que
 * `nature` et la réannotation : un champ inconnu, un troisième annotateur ou un `item_id` en
 * double dans `items` étaient lus (ou écrits) sans qu'aucun contrôle ne s'y oppose.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Lot } from "../validation/domaine/types.ts";
import { ecrireLot, ecrireLots, lireLot, lireLots, ManifesteLotInvalide } from "../validation/io/lots-fichier.ts";

function lot(extra: Partial<Lot> = {}): Lot {
  return {
    lot_id: "lot-001",
    nature: "reel",
    graine_maitresse: "graine",
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: "2026-11-02T10:00:00+01:00",
    annotateurs: ["a1", "a2"],
    items: [],
    ...extra,
  };
}

function itemDuLot(item_id: string, candidat_id = "cand-a") {
  return { item_id, item_version: 1, item_empreinte: "a".repeat(64), candidat_id };
}

let repertoire = "";

afterEach(() => {
  if (repertoire.length > 0) rmSync(repertoire, { recursive: true, force: true });
  repertoire = "";
});

function nouveauRepertoire(): string {
  repertoire = mkdtempSync(join(tmpdir(), "banc-lot-schema-"));
  return repertoire;
}

function ecrireManifesteBrut(dossier: string, lot_id: string, manifeste: object): void {
  writeFileSync(join(dossier, `${lot_id}.json`), JSON.stringify(manifeste), "utf8");
}

describe("lireLot() / lireLots() : conformité au schéma", () => {
  it("un item_id en double dans items : lève, ne le confond pas avec un lot ordinaire", () => {
    const dossier = nouveauRepertoire();
    ecrireManifesteBrut(dossier, "lot-001", lot({ items: [itemDuLot("item-01"), itemDuLot("item-01")] }));
    expect(() => lireLot(dossier, "lot-001")).toThrow(ManifesteLotInvalide);
    expect(() => lireLot(dossier, "lot-001")).toThrow(/item-01/);
  });

  it("un champ inconnu : lève (additionalProperties: false)", () => {
    const dossier = nouveauRepertoire();
    ecrireManifesteBrut(dossier, "lot-001", { ...lot(), commentaire: "champ en trop" });
    expect(() => lireLot(dossier, "lot-001")).toThrow(ManifesteLotInvalide);
  });

  it("trois annotateurs : lève", () => {
    const dossier = nouveauRepertoire();
    ecrireManifesteBrut(dossier, "lot-001", lot({ annotateurs: ["a1", "a2", "a3"] }));
    expect(() => lireLot(dossier, "lot-001")).toThrow(ManifesteLotInvalide);
  });

  it("un seul annotateur : lève", () => {
    const dossier = nouveauRepertoire();
    ecrireManifesteBrut(dossier, "lot-001", lot({ annotateurs: ["a1"] }));
    expect(() => lireLot(dossier, "lot-001")).toThrow(ManifesteLotInvalide);
  });

  it("exactement deux annotateurs distincts, sans doublon : inchangé", () => {
    const dossier = nouveauRepertoire();
    ecrireManifesteBrut(dossier, "lot-001", lot({ items: [itemDuLot("item-01"), itemDuLot("item-02")] }));
    expect(() => lireLot(dossier, "lot-001")).not.toThrow();
  });

  it("lireLots() lève aussi sur le premier manifeste non conforme du répertoire, sans le sauter", () => {
    const dossier = nouveauRepertoire();
    ecrireManifesteBrut(dossier, "lot-001", lot());
    ecrireManifesteBrut(dossier, "lot-002", { ...lot({ lot_id: "lot-002" }), commentaire: "en trop" });
    expect(() => lireLots(dossier)).toThrow(ManifesteLotInvalide);
  });
});

describe("ecrireLot() / ecrireLots() : rien n'est écrit sur un manifeste non conforme", () => {
  it("un item_id en double : ecrireLot() lève, aucun fichier n'est créé", () => {
    const dossier = nouveauRepertoire();
    const invalide = lot({ items: [itemDuLot("item-01"), itemDuLot("item-01")] });
    expect(() => ecrireLot(dossier, invalide)).toThrow(ManifesteLotInvalide);
    expect(existsSync(join(dossier, "lot-001.json"))).toBe(false);
  });

  it("trois annotateurs : ecrireLot() lève, aucun fichier n'est créé", () => {
    const dossier = nouveauRepertoire();
    const invalide = lot({ annotateurs: ["a1", "a2", "a3"] });
    expect(() => ecrireLot(dossier, invalide)).toThrow(ManifesteLotInvalide);
    expect(existsSync(join(dossier, "lot-001.json"))).toBe(false);
  });

  it("ecrireLots() tout ou rien : un manifeste non conforme dans la composition empêche d'écrire les autres", () => {
    const dossier = nouveauRepertoire();
    const valide = lot({ lot_id: "lot-001" });
    const invalide = lot({ lot_id: "lot-002", annotateurs: ["a1", "a2", "a3"] });
    expect(() => ecrireLots(dossier, [valide, invalide])).toThrow(ManifesteLotInvalide);
    expect(existsSync(dossier) ? readdirSync(dossier) : []).toEqual([]);
  });

  it("un manifeste conforme : ecrireLot() écrit normalement", () => {
    const dossier = nouveauRepertoire();
    ecrireLot(dossier, lot({ items: [itemDuLot("item-01")] }));
    expect(existsSync(join(dossier, "lot-001.json"))).toBe(true);
  });
});
