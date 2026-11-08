/** Mentions de l'écran de validation : taille de lot non conforme, item renvoyé (docs/DETTE.md). */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mentionItemRenvoye, mentionTailleLot } from "../validation/domaine/mentions-lot.ts";
import { rattacherItem } from "../validation/domaine/rattachements-item.ts";
import { ROUTES } from "../validation/serveur/routes.ts";
import type { Contexte } from "../validation/serveur/contexte.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { itemP, mesure } from "./aides/fabriques.ts";

describe("mentionTailleLot", () => {
  it("un lot de 50 conforme n'a aucune mention", () => {
    expect(mentionTailleLot({ taille_lot: 50, taille_attendue: 50, taille_conforme: true })).toBeNull();
  });

  it("un lot de 49 sur 50 attendus est signalé avec les deux effectifs", () => {
    const mention = mentionTailleLot({ taille_lot: 49, taille_attendue: 50, taille_conforme: false });
    expect(mention).toContain("49 item(s) au lieu de 50");
  });

  it("un lot d'entraînement de 30 attendu à 30 n'a aucune mention, à 29 il est signalé", () => {
    expect(mentionTailleLot({ taille_lot: 30, taille_attendue: 30, taille_conforme: true })).toBeNull();
    expect(mentionTailleLot({ taille_lot: 29, taille_attendue: 30, taille_conforme: false })).toContain(
      "29 item(s) au lieu de 30",
    );
  });
});

describe("mentionItemRenvoye", () => {
  it("un item non renvoyé n'est pas marqué", () => {
    expect(mentionItemRenvoye(false)).toBeNull();
  });

  it("un item renvoyé est marqué, et la mention dit que la décision reste au journal", () => {
    expect(mentionItemRenvoye(true)).toContain("enregistrée au journal");
  });
});

describe("route item : le champ renvoye", () => {
  let bac: Bac;
  let item: Item;

  function renvoye(contexte: Contexte, lot_id: string): boolean {
    const route = ROUTES.find((candidate) => candidate.nom === "item");
    if (route === undefined) throw new Error("Route item inconnue");
    const reponse = route.gestionnaire(contexte, [lot_id, item.id], null);
    expect(reponse.statut).toBe(200);
    return (reponse.corps as { renvoye: boolean }).renvoye;
  }

  beforeEach(() => {
    bac = creerBac();
    item = itemP({ id: "01JBANCESSA100000001TEM0A1", candidat_id: "demo-alpha" });
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
    bac.ecrireLot(lotDe("lot-001", [item], "reel"));
  });

  afterEach(() => {
    bac.detruire();
  });

  it("un item non renvoyé n'est pas marqué", () => {
    expect(renvoye(bac.contexte("a1"), "lot-001")).toBe(false);
  });

  it("un item renvoyé est marqué dans l'ancien lot, pas dans un nouveau lot qui épingle la nouvelle version", () => {
    const cible = mesure({ id: "01JBANCESSA90000000MESVRE9", version: 2 });
    const rattache = rattacherItem(item, cible, {
      commit: "c".repeat(40),
      horodatage: "2026-11-08T10:00:00+02:00",
      date: "2026-11-08",
    });
    bac.ecrireItem(rattache);
    bac.ecrireMesure(cible);
    bac.ecrireLot(lotDe("lot-002", [rattache], "reel"));

    expect(renvoye(bac.contexte("a1"), "lot-001")).toBe(true);
    expect(renvoye(bac.contexte("a1"), "lot-002")).toBe(false);
  });
});
