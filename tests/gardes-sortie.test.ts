/**
 * `pipeline/gardes-sortie.ts` : les deux gardes de sortie partagées (zones protégées, `runs/`) et
 * leurs briques communes (`cheminReel`, `estSous`), isolément des commandes qui les appellent.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  estSous,
  LienEnBoucle,
  estSousRuns,
  exigerHorsDeRuns,
  exigerHorsDesZonesProtegees,
  RUNS_DU_DEPOT,
  SimuleSousRuns,
  SimuleSousZoneProtegee,
} from "../pipeline/gardes-sortie.ts";

const repertoires: string[] = [];
function temporaire(prefixe = "banc-gardes-sortie-"): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

describe("estSous", () => {
  it("vrai pour le répertoire lui-même et pour un descendant", () => {
    const racine = temporaire();
    expect(estSous(racine, racine)).toBe(true);
    expect(estSous(join(racine, "a", "b"), racine)).toBe(true);
  });

  it("faux pour un répertoire voisin au nom préfixé", () => {
    const racine = temporaire();
    expect(estSous(`${racine}-bis`, racine)).toBe(false);
  });

  it("vrai à travers un lien symbolique posé hors du répertoire qui y mène", () => {
    const racine = temporaire();
    const lien = join(temporaire(), "raccourci");
    symlinkSync(racine, lien);
    expect(estSous(join(lien, "sous"), racine)).toBe(true);
  });
});

describe("exigerHorsDesZonesProtegees", () => {
  const zones = ["staging", "data", "runs"] as const;

  it.each(zones)("refuse une sortie sous %s/ du dépôt, nommé SimuleSousZoneProtegee", (zone) => {
    const depot = temporaire();
    const sortie = join(depot, zone, "essai");
    expect(() => exigerHorsDesZonesProtegees(sortie, depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse le chemin de la zone protégée elle-même, sans sous-répertoire", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(join(depot, "data"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse un lien symbolique posé hors du dépôt qui mène sous data/", () => {
    const depot = temporaire();
    mkdirSync(join(depot, "data"), { recursive: true });
    const lien = join(temporaire(), "raccourci");
    symlinkSync(join(depot, "data"), lien);
    expect(() => exigerHorsDesZonesProtegees(join(lien, "essai"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("accepte un répertoire voisin au nom préfixé (data-bis/)", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(join(depot, "data-bis"), depot)).not.toThrow();
  });

  it("accepte une sortie temporaire hors du dépôt", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(temporaire(), depot)).not.toThrow();
  });
});

describe("constat 6 du 2026-10-17 : comparaison insensible à la casse, après NFC", () => {
  const casses = [
    ["DATA", "x"],
    ["Data", "formulations"],
    ["RUNS", "x"],
    ["Staging", "x"],
  ] as const;

  it.each(casses)("refuse <dépôt>/%s/%s quand la zone existe en minuscules", (zone, feuille) => {
    const depot = temporaire();
    mkdirSync(join(depot, zone.toLowerCase()));
    expect(() => exigerHorsDesZonesProtegees(join(depot, zone, feuille), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it.each(casses)("refuse <dépôt>/%s/%s quand la zone n'existe pas encore", (zone, feuille) => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(join(depot, zone, feuille), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse <dépôt>/Data/x alors que data/ n'existe pas : le dépôt verrait Data/ comme un autre nom", () => {
    const depot = temporaire();
    expect(() => exigerHorsDesZonesProtegees(join(depot, "Data", "x"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse un lien symbolique dont la cible est écrite DATA/ et mène à data/", () => {
    const depot = temporaire();
    mkdirSync(join(depot, "data"));
    const lien = join(temporaire(), "raccourci");
    symlinkSync(join(depot, "DATA"), lien);
    expect(() => exigerHorsDesZonesProtegees(join(lien, "x"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("refuse un lien symbolique vers <dépôt>/DATA quand data/ n'existe pas encore (lien qui ne mène à rien)", () => {
    const depot = temporaire();
    const lien = join(temporaire(), "raccourci");
    symlinkSync(join(depot, "DATA"), lien);
    expect(() => exigerHorsDesZonesProtegees(join(lien, "x"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it("une boucle de liens symboliques lève LienEnBoucle, sans récursion infinie", () => {
    const depot = temporaire();
    const ailleurs = temporaire();
    symlinkSync(join(ailleurs, "b"), join(ailleurs, "a"));
    symlinkSync(join(ailleurs, "a"), join(ailleurs, "b"));
    expect(() => exigerHorsDesZonesProtegees(join(ailleurs, "a", "x"), depot)).toThrow(LienEnBoucle);
  });

  it("refuse la zone elle-même en casse différente (<dépôt>/DATA, égalité)", () => {
    const depot = temporaire();
    mkdirSync(join(depot, "data"));
    expect(() => exigerHorsDesZonesProtegees(join(depot, "DATA"), depot)).toThrow(SimuleSousZoneProtegee);
    expect(() => exigerHorsDesZonesProtegees(join(depot, "data"), depot)).toThrow(SimuleSousZoneProtegee);
  });

  it.each(["data-bis", "database", "Data-bis", "DATABASE"])("accepte <dépôt>/%s/x : aucun faux positif par préfixe", (voisin) => {
    const depot = temporaire();
    mkdirSync(join(depot, "data"));
    expect(() => exigerHorsDesZonesProtegees(join(depot, voisin, "x"), depot)).not.toThrow();
  });

  it("un parent non ASCII du dépôt écrit en NFD d'un côté et en NFC de l'autre ne casse pas la comparaison", () => {
    const parent = temporaire();
    const nfd = join(parent, "Démocratie");
    mkdirSync(nfd);
    const nfc = join(parent, "Démocratie");
    expect(() => exigerHorsDesZonesProtegees(join(nfd, "Data", "x"), nfc)).toThrow(SimuleSousZoneProtegee);
    expect(() => exigerHorsDesZonesProtegees(join(nfc, "data", "x"), nfd)).toThrow(SimuleSousZoneProtegee);
    expect(() => exigerHorsDesZonesProtegees(join(nfd, "database", "x"), nfc)).not.toThrow();
  });

  it("estSous ignore la casse et la normalisation Unicode, quel que soit le disque", () => {
    const racine = temporaire();
    expect(estSous(join(racine, "ZONE", "x"), join(racine, "zone"))).toBe(true);
    expect(estSous(join(racine, "Zône"), join(racine, "zône"))).toBe(true);
    expect(estSous(join(racine, "zone-bis"), join(racine, "ZONE"))).toBe(false);
  });

  it("exigerHorsDeRuns et estSousRuns refusent Runs/ et RUNS/ du dépôt", () => {
    const depot = dirname(RUNS_DU_DEPOT);
    expect(estSousRuns(join(depot, "Runs", "2026-10-17"))).toBe(true);
    expect(() => exigerHorsDeRuns(join(depot, "RUNS", "x"))).toThrow(SimuleSousRuns);
    expect(() => exigerHorsDeRuns(join(depot, "RUNS"))).toThrow(SimuleSousRuns);
  });

  it("accepte runs-bis/ voisin de runs/ du dépôt, en toute casse", () => {
    const depot = dirname(RUNS_DU_DEPOT);
    expect(estSousRuns(join(depot, "Runs-bis", "x"))).toBe(false);
  });
});

describe("exigerHorsDeRuns et estSousRuns", () => {
  it("refuse runs/ du dépôt et ses descendants, nommé SimuleSousRuns", () => {
    expect(() => exigerHorsDeRuns(RUNS_DU_DEPOT)).toThrow(SimuleSousRuns);
    expect(() => exigerHorsDeRuns(join(RUNS_DU_DEPOT, "2026-10-17"))).toThrow(SimuleSousRuns);
  });

  it("un lien symbolique posé hors de runs/ qui y mène est refusé comme le chemin direct", () => {
    const lien = join(temporaire(), "raccourci-runs");
    symlinkSync(RUNS_DU_DEPOT, lien);
    expect(estSousRuns(join(lien, "2026-10-17"))).toBe(true);
    expect(() => exigerHorsDeRuns(join(lien, "2026-10-17"))).toThrow(SimuleSousRuns);
  });

  it("accepte un répertoire hors de runs/", () => {
    expect(estSousRuns(temporaire())).toBe(false);
    expect(() => exigerHorsDeRuns(temporaire())).not.toThrow();
  });
});
