/**
 * La plomberie HTTP partagée entre `pnpm validate` et `pnpm notation:humaine`
 * (`validation/serveur/http.ts`, D55 (8), revue du 2026-10-12 constat 20) : un corps JSON illisible
 * répond 400 des deux côtés, une erreur inattendue masque son message et sa pile au navigateur
 * (D18), un paramètre de route mal encodé répond 400 nommé plutôt que de remonter en 500, et les
 * deux serveurs servent le même en-tête `content-security-policy`, tiré du même module.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creerServeur as creerServeurNotation, ADRESSE } from "../notation-humaine/serveur/principal.ts";
import { creerServeur as creerServeurValidation } from "../validation/serveur/principal.ts";
import { POLITIQUE_SECURITE } from "../validation/serveur/http.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, itemP } from "./aides/fabriques.ts";
import { monter, type Monde } from "./notation-humaine/fixture.ts";

let bac: Bac | null = null;
let monde: Monde | null = null;
let serveurs: Server[] = [];

afterEach(async () => {
  for (const serveur of serveurs) await new Promise<void>((resolu) => serveur.close(() => resolu()));
  serveurs = [];
  bac?.detruire();
  bac = null;
  monde?.nettoyer();
  monde = null;
});

async function ecouter(serveur: Server): Promise<string> {
  await new Promise<void>((resolu) => serveur.listen(0, ADRESSE, resolu));
  serveurs.push(serveur);
  return `http://${ADRESSE}:${(serveur.address() as AddressInfo).port}`;
}

function bacAvecLot(lot_id: string): { bac: Bac; item: Item } {
  const b = creerBac();
  const item = itemP({ id: "01JBANCESSA100000001TEM0A1", candidat_id: "demo-alpha" });
  b.ecrireItem(item);
  b.ecrireMesure(mesurePour(item));
  b.ecrireLot(lotDe(lot_id, [item]));
  return { bac: b, item };
}

describe("JSON illisible dans un POST (D55 (8))", () => {
  it("la validation répond 400, comme la notation, au lieu de 500", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/decisions`, { method: "POST", body: "{ pas du json" });
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreur: string };
    expect(corps.erreur).toBe("CorpsIllisible");
  });
});

describe("erreur inattendue : seul le nom sort, message et chemin restent au serveur (D18, D55 (8))", () => {
  it("une LigneAlteree du journal de l'autre annotateur ne nomme ni son message ni son chemin au navigateur", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    bac.journal("a2").ajouter("lot-001", decision({ annotateur_id: "a2", item: posee.item, decision: "accepter", lot_id: "lot-001" }));
    const chemin = bac.journal("a2").chemin("lot-001");
    const entree = JSON.parse(readFileSync(chemin, "utf8").trim()) as Record<string, unknown>;
    writeFileSync(chemin, `${JSON.stringify({ ...entree, decision: "rejeter" })}\n`, "utf8");

    const espion = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
      const reponse = await fetch(`${base}/api/lots/lot-001/diagnostic`);
      expect(reponse.status).toBe(500);
      const corps = (await reponse.json()) as { erreur: string; detail: string };
      expect(corps.erreur).toBe("LigneAlteree");
      expect(corps.detail).toBe("Voir la console du serveur.");
      const serialise = JSON.stringify(corps);
      expect(serialise).not.toContain("a2");
      expect(serialise).not.toContain(chemin);

      const ecrit = espion.mock.calls.map((appel) => String(appel[0])).join("");
      expect(ecrit).toContain(chemin);
      expect(ecrit).toContain("a2");
    } finally {
      espion.mockRestore();
    }
  });
});

describe("paramètre de route mal encodé (D55 (8))", () => {
  it("la validation répond 400 nommé, pas un URIError en 500", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/lots/%E0%A4%A`);
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreur: string };
    expect(corps.erreur).toBe("ParametreMalEncode");
  });

  it("la notation répond 400 nommé par la même fonction", async () => {
    monde = monter();
    const base = await ecouter(creerServeurNotation(monde.contexte("a1")));
    const reponse = await fetch(`${base}/api/vue/%E0%A4%A`);
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreur: string };
    expect(corps.erreur).toBe("ParametreMalEncode");
  });

  it("un paramètre pourcent-encodé valide est décodé avant d'atteindre le gestionnaire", async () => {
    const posee = bacAvecLot("lot-aa");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/lots/lot%2Daa`);
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { lot_id?: string };
    expect(corps.lot_id ?? "lot-aa").toBe("lot-aa");
  });
});

describe("une seule politique de sécurité pour les deux serveurs (constat 20, D55 (8))", () => {
  it("validation et notation servent le même en-tête content-security-policy", async () => {
    bac = creerBac();
    monde = monter();
    const baseValidation = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const baseNotation = await ecouter(creerServeurNotation(monde.contexte("a1")));
    const reponseValidation = await fetch(`${baseValidation}/api/session`);
    const reponseNotation = await fetch(`${baseNotation}/api/session`);
    expect(reponseValidation.headers.get("content-security-policy")).toBe(POLITIQUE_SECURITE);
    expect(reponseNotation.headers.get("content-security-policy")).toBe(POLITIQUE_SECURITE);
  });

  it("un 204 de la validation (brouillon) reste sans corps ni content-type", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/brouillon`, {
      method: "POST",
      body: JSON.stringify({ lot_id: "lot-001", item_id: "x", duree_affichage_ms: 1, duree_active_ms: 1 }),
    });
    expect(reponse.status).toBe(204);
    expect(reponse.headers.get("content-type")).toBeNull();
    expect(await reponse.text()).toBe("");
  });
});
