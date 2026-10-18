/**
 * `notation-humaine/serveur/chargement.ts:chargerRun` refuse un run invalidé (§6), comme le fait
 * déjà la chaîne de notation automatique (`pipeline/notation/chaine.ts:RunInvalideRefuse`). Sans ce
 * refus, l'écran chargeait un run invalidé et laissait l'annotateur le noter (revue du 2026-10-17,
 * constat 7).
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { dispositionRunNote } from "../../analysis/lecture-run.ts";
import { RunInvalideRefuse } from "../../pipeline/notation/chaine.ts";
import { ecrireJson } from "../notation/run-fictif.ts";
import { monter, type Monde } from "./fixture.ts";

let monde: Monde | null = null;

afterEach(() => {
  monde?.nettoyer();
  monde = null;
});

function invalider(m: Monde, motif = "Incident technique : l'interrogation a été interrompue (§6)."): void {
  const chemin = dispositionRunNote(m.repertoire_run).run_json;
  const run = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  // D51 (4) : l'invalidation est interdite pour publie et publie_provisoire ; en_cours la porte.
  ecrireJson(chemin, { ...run, statut: "en_cours", invalidation: { motif, date: "2026-12-01T12:00:00+01:00" } });
}

describe("constat 7 : chargerRun refuse un run invalidé", () => {
  it("run.json porte une invalidation ⇒ RunInvalideRefuse, avant toute lecture des réponses", () => {
    monde = monter();
    invalider(monde);
    expect(() => monde?.contexte("a1")).toThrow(RunInvalideRefuse);
  });

  it("run sans invalidation ⇒ le contexte se construit normalement", () => {
    monde = monter();
    expect(() => monde?.contexte("a1")).not.toThrow();
  });
});
