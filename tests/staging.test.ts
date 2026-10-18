/**
 * `validation/io/staging.ts` : lecture de `staging/items/` et `staging/mesures/`, un JSON par
 * fichier, chacun confronté à son schéma (constat 26 de la revue du 2026-10-17 : un JSON illisible
 * doit arrêter la lecture par une erreur nommée qui nomme le fichier, pas un `SyntaxError` nu).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonIllisible } from "../outils/schemas/valider.ts";
import { chargerStaging } from "../validation/io/staging.ts";

let racine = "";
beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "banc-staging-"));
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

describe("chargerStaging", () => {
  it("un répertoire absent est un staging sans item ni mesure", () => {
    const staging = chargerStaging(racine);
    expect(staging.items.size).toBe(0);
    expect(staging.mesures.size).toBe(0);
  });

  it("constat 26 : un JSON illisible dans items/ arrête le chargement en nommant le fichier", () => {
    const items = join(racine, "items");
    mkdirSync(items, { recursive: true });
    const chemin = join(items, "01JBANCESSA1000000001TEM01.json");
    writeFileSync(chemin, "{ ceci n'est pas du JSON", "utf8");
    expect(() => chargerStaging(racine)).toThrow(JsonIllisible);
    expect(() => chargerStaging(racine)).toThrow(chemin);
  });

  it("constat 26 : un JSON illisible dans mesures/ arrête le chargement en nommant le fichier", () => {
    const mesures = join(racine, "mesures");
    mkdirSync(mesures, { recursive: true });
    const chemin = join(mesures, "01JBANCESSA90000000MESVRE1.json");
    writeFileSync(chemin, "[]extra", "utf8");
    expect(() => chargerStaging(racine)).toThrow(JsonIllisible);
    expect(() => chargerStaging(racine)).toThrow(chemin);
  });
});
