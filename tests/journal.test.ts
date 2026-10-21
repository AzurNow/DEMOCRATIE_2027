/**
 * Journal append-only et reprise de session.
 *
 * Les deux propriétés se tiennent l'une l'autre : parce que rien n'est jamais écrasé, l'état
 * d'un annotateur se **rejoue** au lieu d'être stocké, et la reprise de session ne peut donc
 * pas se désynchroniser d'un fichier d'état qui n'existe pas.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { construireAnnulation, construireRetrait } from "../validation/domaine/decision.ts";
import { itemCourant, prochaineVisite, progression, rejouer, retiresEffectifs } from "../validation/domaine/journal.ts";
import { ordreAffichage } from "../validation/domaine/lot.ts";
import { JournalIncomplet, LigneAlteree } from "../validation/io/journal-fichier.ts";
import * as journalFichier from "../validation/io/journal-fichier.ts";
import { creerBac, lotDe, resceller, type Bac } from "./aides/bac.ts";
import { decision, itemP } from "./aides/fabriques.ts";
import type { EntreeDecision, Item } from "../validation/domaine/types.ts";

let bac: Bac;
let items: Item[];

beforeEach(() => {
  bac = creerBac();
  items = [
    itemP({ id: "01JBANCESSA100000001TEM0A1", candidat_id: "demo-alpha" }),
    itemP({ id: "01JBANCESSA100000001TEM0B2", candidat_id: "demo-beta" }),
    itemP({ id: "01JBANCESSA100000001TEM0C3", candidat_id: "demo-gamma" }),
  ];
  for (const item of items) bac.ecrireItem(item);
});

afterEach(() => {
  bac.detruire();
});

describe("append-only", () => {
  it("un changement d'avis ajoute une ligne, il n'en modifie aucune", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "accepter" }));
    const apresPremiere = readFileSync(journal.chemin("lot-001"), "utf8");

    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "rejeter" }));
    const apresSeconde = readFileSync(journal.chemin("lot-001"), "utf8");

    expect(apresSeconde.startsWith(apresPremiere)).toBe(true);
    expect(apresSeconde.trimEnd().split("\n")).toHaveLength(2);
  });

  it("l'entrée annulée reste dans le fichier ; seule la relecture l'écarte", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    const premiere = decision({ annotateur_id: "a1", item, decision: "accepter" });
    journal.ajouter("lot-001", premiere);
    journal.ajouter(
      "lot-001",
      construireAnnulation({
        identifiant: "01JBANCESSA1ANNV1AT10N0001",
        annotateur_id: "a1",
        lot_id: "lot-001",
        lot_nature: "reel",
        item_id: item.id,
        annule: premiere.id,
        horodatage: "2026-09-20T10:05:00+02:00",
      }),
    );

    const brut = readFileSync(journal.chemin("lot-001"), "utf8");
    expect(brut).toContain(premiere.id);
    expect(brut.trimEnd().split("\n")).toHaveLength(2);

    const etat = rejouer(journal.lire("lot-001"));
    expect(etat.decisions.has(item.id)).toBe(false);
    expect(etat.annulable).toBeNull();
  });

  it("le module n'expose aucune fonction de modification ni de suppression", () => {
    const exportes = Object.keys(journalFichier);
    for (const nom of exportes) {
      expect(nom).not.toMatch(/supprim|efface|remplac|reecri|modifi|mettre/i);
    }
    const methodes = Object.getOwnPropertyNames(
      Object.getPrototypeOf(bac.journal("a1")) as object,
    );
    expect(methodes.sort()).toEqual(
      ["ajouter", "annotateur_id", "chemin", "constructor", "lire", "lotsCommences"].sort(),
    );
  });

  it("la visite s'incrémente à chaque décision portée sur le même item", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    expect(prochaineVisite(rejouer(journal.lire("lot-001")), item.id)).toBe(1);
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "accepter" }));
    expect(prochaineVisite(rejouer(journal.lire("lot-001")), item.id)).toBe(2);
  });
});

describe("détection de corruption", () => {
  it("bloque sur une écriture interrompue au lieu d'oublier la ligne", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "accepter" }));

    const chemin = journal.chemin("lot-001");
    const contenu = readFileSync(chemin, "utf8");
    writeFileSync(chemin, `${contenu}{"id":"01JBANCESSAITRONQUEE00001","type_`, "utf8");

    expect(() => journal.lire("lot-001")).toThrow(JournalIncomplet);
    // La ligne complète qui précède est intacte : rien n'a été réparé à sa place.
    expect(readFileSync(chemin, "utf8")).toContain(contenu);
  });

  it("bloque sur une ligne modifiée après coup", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "accepter" }));

    const chemin = journal.chemin("lot-001");
    const entree = JSON.parse(readFileSync(chemin, "utf8").trim()) as EntreeDecision;
    writeFileSync(chemin, `${JSON.stringify({ ...entree, decision: "rejeter" })}\n`, "utf8");

    expect(() => journal.lire("lot-001")).toThrow(LigneAlteree);
  });

  it("accepte une entrée dont l'empreinte a été recalculée de bonne foi", () => {
    const journal = bac.journal("a1");
    const item = items[0] as Item;
    const entree = decision({ annotateur_id: "a1", item, decision: "accepter" });
    mkdirSync(join(bac.racine, "validation/decisions/a1"), { recursive: true });
    writeFileSync(
      journal.chemin("lot-001"),
      `${JSON.stringify(resceller({ ...entree, commentaire: "relu" }))}\n`,
      "utf8",
    );
    expect(journal.lire("lot-001")).toHaveLength(1);
  });
});

describe("reprise de session", () => {
  it("rouvre exactement là où l'annotateur s'était arrêté", () => {
    const lot = lotDe("lot-001", items);
    const ordre = ordreAffichage(lot, "a1");
    const journal = bac.journal("a1");

    // Deux items décidés dans l'ordre d'affichage, puis on ferme.
    for (const reference of ordre.slice(0, 2)) {
      const item = items.find((candidat) => candidat.id === reference.item_id) as Item;
      journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "accepter" }));
    }

    // Réouverture : un nouveau journal, un nouveau rejeu, rien d'autre.
    const apres = rejouer(bac.journal("a1").lire("lot-001"));
    expect(progression(ordre, apres)).toEqual({
      total: 3,
      decides: 2,
      retires: 0,
      restants: 1,
      termine: false,
    });
    expect(itemCourant(ordre, apres)?.item_id).toBe((ordre[2] as { item_id: string }).item_id);
  });

  it("ne perd ni ne duplique une décision après réouverture", () => {
    const journal = bac.journal("a1");
    for (const item of items) {
      journal.ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: "accepter" }));
    }
    const relu = bac.journal("a1").lire("lot-001");
    expect(relu).toHaveLength(3);
    expect(new Set(relu.map((entree) => entree.item_id)).size).toBe(3);
  });

  it("reprend sur l'item suivant après une annulation, pas au début du lot", () => {
    const lot = lotDe("lot-001", items);
    const ordre = ordreAffichage(lot, "a1");
    const journal = bac.journal("a1");
    const premier = items.find((item) => item.id === (ordre[0] as { item_id: string }).item_id) as Item;
    const second = items.find((item) => item.id === (ordre[1] as { item_id: string }).item_id) as Item;

    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item: premier, decision: "accepter" }));
    const seconde = decision({ annotateur_id: "a1", item: second, decision: "accepter" });
    journal.ajouter("lot-001", seconde);
    journal.ajouter(
      "lot-001",
      construireAnnulation({
        identifiant: "01JBANCESSA1ANNV1AT10N0002",
        annotateur_id: "a1",
        lot_id: "lot-001",
        lot_nature: "reel",
        item_id: second.id,
        annule: seconde.id,
        horodatage: "2026-09-20T10:10:00+02:00",
      }),
    );

    const etat = rejouer(bac.journal("a1").lire("lot-001"));
    expect(itemCourant(ordre, etat)?.item_id).toBe(second.id);
    expect(etat.annulable?.item_id).toBe(premier.id);
  });

  it("un lot dont tous les items sont décidés ou retirés est terminé", () => {
    const lot = lotDe("lot-001", items);
    const ordre = ordreAffichage(lot, "a1");
    const journal = bac.journal("a1");
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item: items[0] as Item, decision: "accepter" }));
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item: items[1] as Item, decision: "rejeter" }));
    journal.ajouter(
      "lot-001",
      construireRetrait({
        identifiant: "01JBANCESSA1RETRA1T0000001",
        annotateur_id: "a1",
        lot_id: "lot-001",
        lot_nature: "reel",
        item_id: (items[2] as Item).id,
        motif: "item contestee",
        horodatage: "2026-09-20T10:20:00+02:00",
      }),
    );

    const etat = rejouer(bac.journal("a1").lire("lot-001"));
    expect(progression(ordre, etat).termine).toBe(true);
    expect(itemCourant(ordre, etat)).toBeNull();
  });
});

describe("retiresEffectifs (D55 (6), relecture)", () => {
  it("ajoute un item contesté non décidé à etat.retires", () => {
    const journal = bac.journal("a1");
    const premier = items[0] as Item;
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item: premier, decision: "accepter" }));
    const etat = rejouer(journal.lire("lot-001"));

    const effectifs = retiresEffectifs(etat, new Set([(items[1] as Item).id]));
    expect(effectifs).toEqual(new Set([(items[1] as Item).id]));
  });

  it("exclut un item contesté dont cet annotateur a une décision active", () => {
    const journal = bac.journal("a1");
    const premier = items[0] as Item;
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item: premier, decision: "accepter" }));
    const etat = rejouer(journal.lire("lot-001"));

    const effectifs = retiresEffectifs(etat, new Set([premier.id]));
    expect(effectifs.has(premier.id)).toBe(false);
    expect(effectifs).toEqual(etat.retires);
  });

  it("un ensemble de contestations vide rend etat.retires tel quel", () => {
    const journal = bac.journal("a1");
    journal.ajouter(
      "lot-001",
      construireRetrait({
        identifiant: "01JBANCESSA1RETRA1T0000002",
        annotateur_id: "a1",
        lot_id: "lot-001",
        lot_nature: "reel",
        item_id: (items[0] as Item).id,
        motif: "item contestee",
        horodatage: "2026-09-20T10:20:00+02:00",
      }),
    );
    const etat = rejouer(journal.lire("lot-001"));

    expect(retiresEffectifs(etat)).toBe(etat.retires);
    expect(retiresEffectifs(etat, new Set())).toBe(etat.retires);
  });

  it("progression et itemCourant sans 3ᵉ argument gardent leur comportement d'avant", () => {
    const lot = lotDe("lot-001", items);
    const ordre = ordreAffichage(lot, "a1");
    const journal = bac.journal("a1");
    const premierDeLOrdre = items.find((item) => item.id === (ordre[0] as { item_id: string }).item_id) as Item;
    journal.ajouter("lot-001", decision({ annotateur_id: "a1", item: premierDeLOrdre, decision: "accepter" }));

    const etat = rejouer(journal.lire("lot-001"));
    expect(progression(ordre, etat)).toEqual({ total: 3, decides: 1, retires: 0, restants: 2, termine: false });
    expect(itemCourant(ordre, etat)?.item_id).toBe((ordre[1] as { item_id: string }).item_id);
  });
});
