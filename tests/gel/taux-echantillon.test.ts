/**
 * Lot gel, PR 2b, cas 9 : le taux de l'échantillon humain (§7 : 10 % par défaut, 25 % après retrait
 * d'un juge) vit dans un seul module, `pipeline/notation/taux-echantillon.ts`, que le gel et le
 * contrôle croisé importent. Le test échoue si l'un des deux reprend sa propre valeur.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { geler } from "../../pipeline/gel/geler.ts";
import { controleCroise } from "../../pipeline/notation/controle-croise.ts";
import { TAUX_ECHANTILLON_APRES_RETRAIT, TAUX_ECHANTILLON_SANS_RETRAIT } from "../../pipeline/notation/taux-echantillon.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { runDeNotation } from "../notation/fabriques.ts";
import { depotDuJeu, optionsGel } from "./fixtures.ts";
import { jeuNominal } from "./jeux.ts";

const APPELANTS = [
  "pipeline/gel/assemblage.ts",
  "pipeline/notation/controle-croise.ts",
  "pipeline/notation/contrefactuel.ts",
  "pipeline/notation/publication-contrefactuel.ts",
];

const temporaires: string[] = [];

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function violationsDeTaux(retires: readonly string[], taux: 0.1 | 0.25): readonly string[] {
  const run = runDeNotation(retires, { taux_echantillon_humain: taux });
  return controleCroise({ run, reponses_obtenues: [], refus_api: [], textes: new Map(), notations: [], verdicts: [] })
    .map((violation) => violation.code)
    .filter((code) => code === "taux_echantillon_incoherent");
}

describe("gel, PR 2b, cas 9 : une seule source pour le taux de l'échantillon humain", () => {
  it("cas 9 : les deux constantes sont celles du §7", () => {
    expect(TAUX_ECHANTILLON_SANS_RETRAIT).toBe(0.1);
    expect(TAUX_ECHANTILLON_APRES_RETRAIT).toBe(0.25);
  });

  it("cas 9 : le gel inscrit TAUX_ECHANTILLON_SANS_RETRAIT dans run.json", async () => {
    const racine = depotDuJeu(jeuNominal());
    const sortie = mkdtempSync(join(tmpdir(), "banc-gel-taux-"));
    temporaires.push(racine, sortie);
    const resultat = await geler(optionsGel(racine, sortie));
    const run = JSON.parse(readFileSync(join(resultat.repertoire, "run.json"), "utf8")) as Record<string, unknown>;
    expect(run["taux_echantillon_humain"]).toBe(TAUX_ECHANTILLON_SANS_RETRAIT);
  });

  it("cas 9 : le contrôle croisé attend les mêmes constantes, sans retrait puis après retrait", () => {
    expect(violationsDeTaux([], TAUX_ECHANTILLON_SANS_RETRAIT)).toEqual([]);
    expect(violationsDeTaux([], TAUX_ECHANTILLON_APRES_RETRAIT)).toEqual(["taux_echantillon_incoherent"]);
    expect(violationsDeTaux(["j2"], TAUX_ECHANTILLON_APRES_RETRAIT)).toEqual([]);
    expect(violationsDeTaux(["j2"], TAUX_ECHANTILLON_SANS_RETRAIT)).toEqual(["taux_echantillon_incoherent"]);
  });

  it("cas 9 : le gel et le contrôle croisé importent le module, aucun n'écrit le taux en dur", () => {
    for (const fichier of APPELANTS) {
      const source = readFileSync(join(RACINE_PROJET, fichier), "utf8");
      expect(source, fichier).toMatch(/from "\.\.\/notation\/taux-echantillon\.ts"|from "\.\/taux-echantillon\.ts"/);
      expect(source, fichier).not.toMatch(/(?<![\w.])0\.(1|25)(?![\d])/);
    }
  });
});
