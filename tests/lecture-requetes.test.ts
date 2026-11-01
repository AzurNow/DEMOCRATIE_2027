/**
 * Lecteurs de forme des corps POST (`validation/serveur/lecture-requetes.ts`) : les contrôles de
 * forme partagés avec les brouillons ont une seule règle, la plus stricte (revue du 2026-10-12,
 * constat 12, Lot 4).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTIF_IDENTIFIANT_COURT } from "../validation/domaine/identifiant.ts";
import { erreursBrouillon } from "../validation/io/brouillons.ts";
import { lireRequeteDecision } from "../validation/serveur/lecture-requetes.ts";
import { GRILLE_TOUT_VRAI } from "./aides/fabriques.ts";

const CORPS = {
  lot_id: "lot-001",
  item_id: "01JBANCESSA100000001TEM0A1",
  decision: "accepter",
  reponses_grille: GRILLE_TOUT_VRAI,
  corrections: [],
  duree_affichage_ms: 1,
  duree_active_ms: 1,
};

describe("durée négative : refusée en 400 aux deux endroits", () => {
  it("une décision à duree_affichage_ms négative est refusée par le lecteur", () => {
    expect(lireRequeteDecision({ ...CORPS, duree_affichage_ms: -1 }).ok).toBe(false);
  });

  it("une décision à duree_active_ms négative est refusée par le lecteur", () => {
    expect(lireRequeteDecision({ ...CORPS, duree_active_ms: -5 }).ok).toBe(false);
  });

  it("le brouillon et la décision refusent avec le même message", () => {
    const decision = lireRequeteDecision({ ...CORPS, duree_active_ms: -5 });
    const brouillon = erreursBrouillon({ lot_id: "lot-001", item_id: "x", duree_affichage_ms: 1, duree_active_ms: -5 });
    expect(decision.ok ? [] : decision.erreurs).toEqual(brouillon);
  });

  it("une durée nulle reste acceptée", () => {
    expect(lireRequeteDecision({ ...CORPS, duree_active_ms: 0 }).ok).toBe(true);
  });
});

describe("lot_id des corps : même format que les paramètres de route (identifiant_court)", () => {
  it("le motif du code est celui de schema/commun.schema.json", () => {
    const schema = JSON.parse(readFileSync("schema/commun.schema.json", "utf8")) as {
      $defs: { identifiant_court: { pattern: string } };
    };
    expect(MOTIF_IDENTIFIANT_COURT.source).toBe(schema.$defs.identifiant_court.pattern);
  });

  it("un lot_id hors du format identifiant_court est refusé (majuscule, trop long)", () => {
    expect(lireRequeteDecision({ ...CORPS, lot_id: "LOT-001" }).ok).toBe(false);
    expect(lireRequeteDecision({ ...CORPS, lot_id: "a".repeat(65) }).ok).toBe(false);
  });
});
