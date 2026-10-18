/**
 * `validation/io/data-items.ts`, seul module qui écrit dans `data/items/` (lot
 * contestation-notification, V1) : création sans écrasement, réécriture refusée si le fichier a
 * changé depuis sa lecture, validation de schéma et règle d'ajout seul avant toute écriture,
 * écriture atomique qui ne laisse aucun temporaire.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErreurSchema, JsonIllisible } from "../outils/schemas/valider.ts";
import { EcritureNonAjoutSeule } from "../validation/domaine/ajout-seul.ts";
import type { Item } from "../validation/domaine/types.ts";
import {
  cheminItem,
  creerItem,
  FichierModifieDepuisLecture,
  ItemAbsentDeData,
  ItemDejaDansData,
  lireItem,
  lireItemsData,
  reecrireItem,
} from "../validation/io/data-items.ts";
import { itemConteste, itemPromu } from "./aides/data.ts";

let repertoire = "";
beforeEach(() => {
  repertoire = mkdtempSync(join(tmpdir(), "banc-data-"));
});
afterEach(() => rmSync(repertoire, { recursive: true, force: true }));

function fichiers(): readonly string[] {
  return readdirSync(repertoire).sort();
}

describe("creerItem", () => {
  it("écrit un item conforme, lisible par lireItem, sans laisser de temporaire", () => {
    const item = itemPromu();
    creerItem(repertoire, item);
    expect(fichiers()).toEqual([`${item.id}.json`]);
    expect(lireItem(repertoire, item.id).item).toEqual(item);
  });

  it("refuse un item déjà présent, et ne touche pas au fichier", () => {
    const item = itemPromu();
    creerItem(repertoire, item);
    const avant = readFileSync(cheminItem(repertoire, item.id));
    expect(() => creerItem(repertoire, { ...item, statut_validation: "rejete" })).toThrow(ItemDejaDansData);
    expect(readFileSync(cheminItem(repertoire, item.id))).toEqual(avant);
    expect(fichiers()).toEqual([`${item.id}.json`]);
  });

  it("refuse un item non conforme au schéma, sans rien écrire", () => {
    const { historique: _retire, ...sansHistorique } = itemPromu();
    expect(() => creerItem(repertoire, sansHistorique as Item)).toThrow(ErreurSchema);
    expect(fichiers()).toEqual([]);
  });
});

describe("lireItem et lireItemsData", () => {
  it("un item absent de data/ est une erreur nommée", () => {
    expect(() => lireItem(repertoire, "01JBANCESSA1000000001TEM01")).toThrow(ItemAbsentDeData);
  });

  it("un fichier non conforme arrête la lecture", () => {
    const item = itemPromu();
    writeFileSync(cheminItem(repertoire, item.id), JSON.stringify({ ...item, version: 0 }), "utf8");
    expect(() => lireItem(repertoire, item.id)).toThrow(ErreurSchema);
    expect(() => lireItemsData(repertoire)).toThrow(ErreurSchema);
  });

  it("un répertoire absent est un data/ vide", () => {
    expect(lireItemsData(join(repertoire, "absent")).size).toBe(0);
  });

  it("constat 26 : un JSON illisible arrête la lecture par une erreur nommée qui nomme le fichier", () => {
    const item = itemPromu();
    const chemin = cheminItem(repertoire, item.id);
    writeFileSync(chemin, "{ ceci n'est pas du JSON", "utf8");
    expect(() => lireItem(repertoire, item.id)).toThrow(JsonIllisible);
    expect(() => lireItem(repertoire, item.id)).toThrow(chemin);
    expect(() => lireItemsData(repertoire)).toThrow(JsonIllisible);
  });
});

describe("reecrireItem", () => {
  it("réécrit un ajout conforme, sans laisser de temporaire", () => {
    const item = itemPromu();
    creerItem(repertoire, item);
    const lu = lireItem(repertoire, item.id);
    reecrireItem(repertoire, lu, itemConteste(lu.item), { corrections: false });
    expect(lireItem(repertoire, item.id).item.statut_contestation).toBe("contestee");
    expect(fichiers()).toEqual([`${item.id}.json`]);
  });

  it("refuse si le fichier a changé entre la lecture et la réécriture", () => {
    const item = itemPromu();
    creerItem(repertoire, item);
    const lu = lireItem(repertoire, item.id);
    const chemin = cheminItem(repertoire, item.id);
    writeFileSync(chemin, `${readFileSync(chemin, "utf8")}\n`, "utf8");
    const modifie = readFileSync(chemin);
    expect(() => reecrireItem(repertoire, lu, itemConteste(lu.item), { corrections: false })).toThrow(
      FichierModifieDepuisLecture,
    );
    expect(readFileSync(chemin)).toEqual(modifie);
  });

  it("refuse une réécriture qui n'est pas un ajout, sans rien écrire", () => {
    const item = itemPromu();
    creerItem(repertoire, item);
    const lu = lireItem(repertoire, item.id);
    const avant = readFileSync(cheminItem(repertoire, item.id));
    const efface = { ...itemConteste(lu.item), candidat_id: "demo-autre" };
    expect(() => reecrireItem(repertoire, lu, efface, { corrections: false })).toThrow(EcritureNonAjoutSeule);
    expect(readFileSync(cheminItem(repertoire, item.id))).toEqual(avant);
  });

  it("refuse un item à écrire non conforme au schéma", () => {
    const item = itemPromu();
    creerItem(repertoire, item);
    const lu = lireItem(repertoire, item.id);
    const nonConforme = { ...itemConteste(lu.item), statut_contestation: "inconnu" } as unknown as Item;
    expect(() => reecrireItem(repertoire, lu, nonConforme, { corrections: false })).toThrow(ErreurSchema);
    expect(fichiers()).toEqual([`${item.id}.json`]);
  });
});
