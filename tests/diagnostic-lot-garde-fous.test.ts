/**
 * Garde-fous structurels du diagnostic de lot (revue du 2026-10-12, constat 4 ; D55 (3)).
 *
 * Avant ce lot : un `item_id` en double dans `lot.items` faisait produire par `apparier` deux
 * paires identiques pour la même décision, gonflant silencieusement le `n` du kappa publié ;
 * `etatsDesDeux` prenait les deux premiers annotateurs triés et ignorait un troisième en
 * silence — « exactement deux », annoncé par son message d'erreur, n'était vérifié que comme
 * « au moins deux ». Les deux sont désormais des refus nommés.
 */

import { describe, expect, it } from "vitest";
import { diagnostiquerLot, ItemEnDoubleDansLeLot } from "../validation/domaine/analyse-lot.ts";
import { rejouer } from "../validation/domaine/journal.ts";
import type { Decision, EntreeJournal, Item } from "../validation/domaine/types.ts";
import { lotDe } from "./aides/bac.ts";
import { decision, itemP } from "./aides/fabriques.ts";

const ITEM_A = itemP({ id: "01JBANCESSA1000000001TEM01", candidat_id: "demo-alpha" });
const ITEM_B = itemP({ id: "01JBANCESSA1000000001TEM02", candidat_id: "demo-beta" });

function entree(annotateur_id: string, item: Item, sens: Decision): EntreeJournal {
  return decision({ annotateur_id, item, decision: sens });
}

function etatsDe(journaux: Readonly<Record<string, readonly EntreeJournal[]>>) {
  return new Map(Object.entries(journaux).map(([annotateur, entrees]) => [annotateur, rejouer(entrees)]));
}

function itemsDe(items: readonly Item[]): ReadonlyMap<string, Item> {
  return new Map(items.map((item) => [item.id, item]));
}

describe("apparier : un item_id en double dans le lot", () => {
  it("refuse par une erreur nommée au lieu de produire deux paires pour la même décision", () => {
    const lot = lotDe("lot-001", [ITEM_A, ITEM_A, ITEM_B]);
    const etats = etatsDe({
      a1: [entree("a1", ITEM_A, "accepter"), entree("a1", ITEM_B, "accepter")],
      a2: [entree("a2", ITEM_A, "accepter"), entree("a2", ITEM_B, "rejeter")],
    });
    expect(() =>
      diagnostiquerLot({ lot, items: itemsDe([ITEM_A, ITEM_B]), etats, taille_attendue: 2 }),
    ).toThrow(ItemEnDoubleDansLeLot);
  });

  it("aucun doublon : le n du kappa compte chaque item une seule fois", () => {
    const lot = lotDe("lot-001", [ITEM_A, ITEM_B]);
    const etats = etatsDe({
      a1: [entree("a1", ITEM_A, "accepter"), entree("a1", ITEM_B, "accepter")],
      a2: [entree("a2", ITEM_A, "accepter"), entree("a2", ITEM_B, "rejeter")],
    });
    const diagnostic = diagnostiquerLot({ lot, items: itemsDe([ITEM_A, ITEM_B]), etats, taille_attendue: 2 });
    expect(diagnostic.kappa.n).toBe(2);
  });
});

describe("etatsDesDeux : nombre d'annotateurs", () => {
  it("trois annotateurs : lève plutôt que d'ignorer le troisième en silence", () => {
    const lot = lotDe("lot-001", [ITEM_A]);
    const etats = etatsDe({
      a1: [entree("a1", ITEM_A, "accepter")],
      a2: [entree("a2", ITEM_A, "accepter")],
      a3: [entree("a3", ITEM_A, "rejeter")],
    });
    expect(() =>
      diagnostiquerLot({ lot, items: itemsDe([ITEM_A]), etats, taille_attendue: 1 }),
    ).toThrow(/exactement deux/);
  });

  it("zéro annotateur : lève un message propre, sans liste vide ni virgule en trop", () => {
    const lot = lotDe("lot-001", [ITEM_A]);
    const etats = etatsDe({});
    expect(() => diagnostiquerLot({ lot, items: itemsDe([ITEM_A]), etats, taille_attendue: 1 })).toThrow(
      "Un diagnostic de lot exige exactement deux annotateurs (reçu : 0).",
    );
  });

  it("un seul annotateur : lève aussi", () => {
    const lot = lotDe("lot-001", [ITEM_A]);
    const etats = etatsDe({ a1: [entree("a1", ITEM_A, "accepter")] });
    expect(() =>
      diagnostiquerLot({ lot, items: itemsDe([ITEM_A]), etats, taille_attendue: 1 }),
    ).toThrow(/exactement deux/);
  });

  it("exactement deux : inchangé", () => {
    const lot = lotDe("lot-001", [ITEM_A]);
    const etats = etatsDe({
      a1: [entree("a1", ITEM_A, "accepter")],
      a2: [entree("a2", ITEM_A, "accepter")],
    });
    expect(() =>
      diagnostiquerLot({ lot, items: itemsDe([ITEM_A]), etats, taille_attendue: 1 }),
    ).not.toThrow();
  });
});
