/**
 * Deux garde-fous de `pnpm promote` (revue du 2026-09-23, constats 3 et 4), vérifiés sur la
 * simulation, qui annonce exactement ce que `--ecrire` fera :
 *
 * - un item jugé dans un lot mais absent de `staging/` est nommé, et la commande sort en erreur :
 *   il ne disparaît plus de la promotion sans trace ;
 * - un item déjà présent dans `data/` n'est jamais réécrit : relancer la promotion est sans effet
 *   sur lui, et le rapport le dit.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { evaluerPromotion } from "../validation/domaine/promotion.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { decision, itemF, itemP, mesure } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");

function poserItem(bac: Bac, suffixe: string): Item {
  const item = itemP({
    id: `01JBANCESSA1000000000TEM${suffixe}`,
    candidat_id: `demo-${suffixe}`,
    mesure_id: `01JBANCESSA90000000MESVR${suffixe}`,
  });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.relireMesure(mesure({ id: item.mesure_id, version: 1 }));
  return item;
}

function accepterParLesDeux(bac: Bac, item: Item, lot_id: string): void {
  for (const annotateur of ["a1", "a2"]) {
    bac.journal(annotateur).ajouter(lot_id, decision({ annotateur_id: annotateur, item, decision: "accepter", lot_id }));
  }
}

function simuler(bac: Bac) {
  const resultat = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(RACINE, "outils/promote.ts"),
      `--staging=${join(bac.racine, "staging")}`,
      `--lots=${join(bac.racine, "validation/lots")}`,
      `--decisions=${join(bac.racine, "validation/decisions")}`,
      `--mesures=${join(bac.racine, "validation/mesures")}`,
      `--data=${join(bac.racine, "data/items")}`,
    ],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("item d'un lot introuvable dans staging", () => {
  const bac = creerBac();
  const present = poserItem(bac, "71");
  const disparu = itemP({ id: "01JBANCESSA1000000000TEM72", candidat_id: "demo-72", mesure_id: present.mesure_id });
  bac.ecrireLot(lotDe("lot-007", [present, disparu]));
  accepterParLesDeux(bac, present, "lot-007");
  accepterParLesDeux(bac, disparu, "lot-007");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("est nommé avec son lot dans le rapport", () => {
    expect(resultat.sortie).toMatch(/Items des lots introuvables dans staging : 1/);
    expect(resultat.sortie).toMatch(new RegExp(`${disparu.id}\\s+\\[lot-007\\]`));
  });

  it("fait sortir la commande en erreur, sans empêcher d'évaluer les autres", () => {
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).toMatch(new RegExp(`${present.id}\\s+verifie`));
  });
});

describe("item déjà présent dans data/", () => {
  const bac = creerBac();
  const nouveau = poserItem(bac, "81");
  const dejaPromu = poserItem(bac, "82");
  bac.ecrireLot(lotDe("lot-008", [nouveau, dejaPromu]));
  accepterParLesDeux(bac, nouveau, "lot-008");
  accepterParLesDeux(bac, dejaPromu, "lot-008");
  mkdirSync(join(bac.racine, "data/items"), { recursive: true });
  // Un vrai item : depuis le protocole 0.9, `data/` est relu (et validé) pour la règle « une mesure
  // fictive porte un seul item F ».
  writeFileSync(join(bac.racine, "data/items", `${dejaPromu.id}.json`), `${JSON.stringify(dejaPromu)}\n`, "utf8");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("est annoncé comme non réécrit, et seul le nouvel item reste à écrire", () => {
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toMatch(/Déjà dans data\/, non réécrits : 1/);
    expect(resultat.sortie).toMatch(new RegExp(`${dejaPromu.id}\\s+\\[lot-008\\]`));
    expect(resultat.sortie).toMatch(/À écrire par --ecrire : 1/);
  });
});

/*
 * Protocole 0.9 (§5) : « Une mesure fictive porte un seul item fictif. » Un item F vérifié déjà
 * dans `data/` sur une mesure fictive, et un second item F de la même mesure promu : la commande
 * refuse, nomme l'erreur et n'écrit rien.
 */
describe("second item F vérifié sur une mesure fictive déjà portée", () => {
  const bac = creerBac();
  const mesureFictive = {
    ...mesure({ id: "01JBANCESSA90000000MESVRF9", version: 1, fictive: true }),
    origine_fictive: "Mesure fictive de test, sans rapport avec aucun candidat.",
    verification_fictivite: {
      date: "2026-09-10T11:00:00+02:00",
      corpus_verifies: ["demo-91", "demo-92"],
      niveaux_balayes: ["T1", "T2", "items_T3"],
      operateur: "a2",
      resultat: "aucune_occurrence",
    },
  };
  const acceptations = (item: Item, lot_id: string) =>
    ["a1", "a2"].map((annotateur_id) =>
      decision({
        annotateur_id,
        item,
        decision: "accepter",
        lot_id,
        questions_specifiques: { fictivite_verifiee: true, plausibilite: true },
      }),
    );
  // L'item déjà promu l'a été par la vraie règle de promotion : `data/` est relu et validé.
  const premier = itemF({ id: "01JBANCESSA1000000000TEM91", candidat_id: "demo-91", mesure_id: mesureFictive.id });
  const issue = evaluerPromotion(
    {
      item: premier,
      mesure: mesureFictive,
      lot_id: "lot-000",
      lot_nature: "reel",
      decisions: acceptations(premier, "lot-000"),
      registre_corrections_mesure: [],
    },
    { commit: "0".repeat(40), horodatage: "2026-09-20T10:00:00+02:00" },
  );
  if (issue.sort !== "promouvoir") throw new Error("L'item F de départ aurait dû être promu.");
  const existant = issue.item;
  const second = itemF({ id: "01JBANCESSA1000000000TEM92", candidat_id: "demo-92", mesure_id: mesureFictive.id });
  bac.ecrireItem(second);
  bac.ecrireMesure(mesureFictive);
  bac.ecrireLot(lotDe("lot-009", [second]));
  for (const entree of acceptations(second, "lot-009")) bac.journal(entree.annotateur_id).ajouter("lot-009", entree);
  mkdirSync(join(bac.racine, "data/items"), { recursive: true });
  writeFileSync(join(bac.racine, "data/items", `${existant.id}.json`), `${JSON.stringify(existant)}\n`, "utf8");
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("sort en erreur avec ItemFictifEnDouble, qui nomme la mesure et les deux items", () => {
    expect(resultat.sortie, resultat.erreur).toMatch(new RegExp(`${second.id}\\s+verifie`));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("ItemFictifEnDouble");
    expect(resultat.erreur).toContain(mesureFictive.id);
    expect(resultat.erreur).toContain(existant.id);
    expect(resultat.erreur).toContain(second.id);
  });
});
