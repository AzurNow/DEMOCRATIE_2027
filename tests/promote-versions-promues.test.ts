/**
 * `pnpm promote` relit le corpus déjà promu (docs/DETTE.md, 2026-09-17, point 1) : un item de
 * `data/items/` dont les deux validations concordantes portent, au journal, deux versions
 * différentes arrête la commande par `ValidationsPromuesIncoherentes`, avant toute écriture.
 * Exercé dans un dépôt Git jetable, avec `--ecrire` et un arbre propre.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { evaluerPromotion } from "../validation/domaine/promotion.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure, OPTIONS_PROMOTION } from "./aides/fabriques.ts";

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    `--data=${join(bac.racine, "data/items")}`,
    `--data-mesures=${join(bac.racine, "data/mesures")}`,
    `--notifications=${join(bac.racine, "validation/notifications")}`,
  ];
}

/** L'item à promouvoir dans ce lancement : lot-062, deux acceptations. */
function poserNouveau(bac: Bac): Item {
  const item = itemP({ id: "01JBANCESSA1000000000TEM62", candidat_id: "demo-62", mesure_id: "01JBANCESSA90000000MESVR62" });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.relireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.ecrireLot(lotDe("lot-062", [item]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-062", decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-062" }));
  }
  return item;
}

/**
 * Un item déjà dans `data/`, promu par la vraie règle (lot-061), dont le journal porte les versions
 * données : `a2_version` différente de 1 fabrique le corpus fautif que la garde d'entrée aurait dû
 * refuser.
 */
function poserDejaPromu(bac: Bac, a2_version: number): Item {
  const item = itemP({ id: "01JBANCESSA1000000000TEM61", candidat_id: "demo-61", mesure_id: "01JBANCESSA90000000MESVR61" });
  const decisions = ["a1", "a2"].map((annotateur_id) => decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-061" }));
  const issue = evaluerPromotion(
    {
      item,
      mesure: mesure({ id: item.mesure_id, version: 1 }),
      lot_id: "lot-061",
      lot_nature: "reel",
      decisions,
      registre_corrections_mesure: [],
    },
    OPTIONS_PROMOTION,
  );
  if (issue.sort !== "promouvoir") throw new Error("L'item de départ aurait dû être promu.");
  bac.journal("a1").ajouter("lot-061", decisions[0] as (typeof decisions)[number]);
  bac.journal("a2").ajouter(
    "lot-061",
    decision({ annotateur_id: "a2", item, decision: "accepter", lot_id: "lot-061", item_version: a2_version }),
  );
  mkdirSync(join(bac.racine, "data/items"), { recursive: true });
  writeFileSync(join(bac.racine, "data/items", `${item.id}.json`), `${JSON.stringify(issue.item, null, 2)}\n`, "utf8");
  return issue.item;
}

function lancer(preparer: (bac: Bac) => void) {
  const bac = creerBac();
  const nouveau = poserNouveau(bac);
  preparer(bac);
  initialiserDepot(bac.racine);
  const avant = existsSync(join(bac.racine, "data/items")) ? readdirSync(join(bac.racine, "data/items")).sort() : [];
  const resultat = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  return { bac, nouveau, avant, resultat };
}

describe("corpus promu vide", () => {
  const { bac, nouveau, resultat } = lancer(() => undefined);
  afterAll(() => bac.detruire());

  it("la promotion écrit le nouvel item, comme avant", () => {
    expect(resultat.status, resultat.erreur).toBe(0);
    expect(existsSync(join(bac.racine, "data/items", `${nouveau.id}.json`))).toBe(true);
  });
});

describe("corpus promu sain : deux validations sur la même version au journal", () => {
  const { bac, nouveau, resultat } = lancer((b) => poserDejaPromu(b, 1));
  afterAll(() => bac.detruire());

  it("comportement inchangé : le nouvel item est écrit, l'ancien n'est pas réécrit", () => {
    expect(resultat.status, resultat.erreur).toBe(0);
    expect(resultat.erreur).not.toContain("ValidationsPromuesIncoherentes");
    expect(resultat.sortie).toMatch(/Déjà dans data\/, non réécrits : 0/);
    expect(existsSync(join(bac.racine, "data/items", `${nouveau.id}.json`))).toBe(true);
  });
});

describe("item déjà promu dont les deux validations concordantes portent deux versions", () => {
  let fautif: Item | undefined;
  const { bac, nouveau, avant, resultat } = lancer((b) => {
    fautif = poserDejaPromu(b, 2);
  });
  afterAll(() => bac.detruire());

  it("refus nommé ValidationsPromuesIncoherentes, qui désigne l'item fautif", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("ValidationsPromuesIncoherentes");
    expect(resultat.erreur).toContain((fautif as Item).id);
    expect(resultat.erreur).toMatch(/2 versions différentes/);
  });

  it("aucune écriture dans data/ : le nouvel item n'est pas promu, data/items/ est inchangé", () => {
    expect(existsSync(join(bac.racine, "data/items", `${nouveau.id}.json`))).toBe(false);
    expect(readdirSync(join(bac.racine, "data/items")).sort()).toEqual(avant);
    expect(existsSync(join(bac.racine, "data/mesures"))).toBe(false);
  });
});
