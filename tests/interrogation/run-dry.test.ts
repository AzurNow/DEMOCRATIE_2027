/**
 * `pnpm run:dry` de bout en bout : périmètre de fixture chargé par le chargeur du dépôt, questions
 * validées, run complet contre l'éditeur simulé, réponses conformes et immuables, reprise, bilan.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lancerRunSimule } from "../../pipeline/interrogation/run-simule.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const FIXTURES = join(import.meta.dirname, "fixtures/run-simule");
const CLE_API = (JSON.parse(readFileSync(join(FIXTURES, "run-simule.json"), "utf8")) as { cle_api: string }).cle_api;

const sorties: string[] = [];

function sortie(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-run-dry-test-"));
  sorties.push(chemin);
  return chemin;
}

afterEach(() => {
  for (const chemin of sorties.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

describe("run simulé complet", () => {
  it("écrit une réponse conforme par requête du plan, sous <sortie>/<date de gel à Paris>/volume/", async () => {
    const racine = sortie();
    const resultat = await lancerRunSimule({ sortie: racine, fixtures: FIXTURES });
    expect(resultat.disposition.run).toBe(join(racine, "2026-11-27"));
    // outil-alpha : 3 questions × 3 formulations × 2 modes × 2 échantillons ; outil-beta : un seul mode.
    expect(resultat.execution).toEqual({ ecrites: 54, deja_ecrites: 0, en_attente_operateur: [] });
    const reponses = DepotReponses.ouvrir(resultat.disposition.reponses).toutes();
    expect(reponses).toHaveLength(54);
    expect(new Set(reponses.map((r) => r.outil_id))).toEqual(new Set(["outil-alpha", "outil-beta"]));
    expect(reponses.filter((r) => r.outil_id === "outil-beta").every((r) => r.mode === "web_desactivee")).toBe(true);
  });

  it("ne laisse la clé d'API dans aucun fichier écrit", async () => {
    const racine = sortie();
    const { disposition } = await lancerRunSimule({ sortie: racine, fixtures: FIXTURES });
    const fichiers = [
      ...readdirSync(disposition.reponses).map((n) => join(disposition.reponses, n)),
      ...readdirSync(disposition.tentatives).map((n) => join(disposition.tentatives, n)),
    ];
    expect(fichiers.length).toBeGreaterThan(54);
    expect(fichiers.filter((f) => readFileSync(f, "utf8").includes(CLE_API))).toEqual([]);
  });

  it("relancé sur la même sortie, ne refait rien et rend le même bilan", async () => {
    const racine = sortie();
    const premier = await lancerRunSimule({ sortie: racine, fixtures: FIXTURES });
    const second = await lancerRunSimule({ sortie: racine, fixtures: FIXTURES });
    expect(second.execution).toEqual({ ecrites: 0, deja_ecrites: 54, en_attente_operateur: [] });
    expect(second.bilan).toEqual(premier.bilan);
  });

  it("run gelé, cas 11 : sans --run, le bilan des fixtures est celui d'avant le lot gel, PR 4 (relevé sur main 49a0577)", async () => {
    const { bilan } = await lancerRunSimule({ sortie: sortie(), fixtures: FIXTURES });
    const releve = bilan.map((l) => [l.outil_id, l.mode, l.obtenues, l.refus_api, l.manquantes_echecs, l.manquantes_hors_fenetre, l.part_manquantes.numerateur, l.part_manquantes.denominateur]);
    expect(releve).toEqual([
      ["outil-alpha", "web_activee", 18, 3, 0, 0, 0, 18],
      ["outil-alpha", "web_desactivee", 18, 3, 0, 0, 0, 18],
      ["outil-beta", "web_desactivee", 17, 12, 1, 0, 1, 18],
    ]);
  });

  it("le bilan compte, par outil × mode, obtenues, refus et manquantes par motif", async () => {
    const { bilan } = await lancerRunSimule({ sortie: sortie(), fixtures: FIXTURES });
    expect(bilan.map((l) => `${l.outil_id}/${l.mode}`)).toEqual([
      "outil-alpha/web_activee",
      "outil-alpha/web_desactivee",
      "outil-beta/web_desactivee",
    ]);
    for (const ligne of bilan) {
      expect(ligne.obtenues + ligne.manquantes_echecs + ligne.manquantes_hors_fenetre).toBe(ligne.part_manquantes.denominateur);
      expect(ligne.manquantes_echecs + ligne.manquantes_hors_fenetre).toBe(ligne.part_manquantes.numerateur);
    }
  });
});

describe("pnpm run:dry, la commande", () => {
  it("imprime son bilan et n'écrit jamais dans runs/", () => {
    const racine = sortie();
    const runsAvant = existsSync(join(RACINE, "runs")) ? readdirSync(join(RACINE, "runs")).sort() : [];
    const sortieTexte = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", join(RACINE, "outils/run-dry.ts"), `--sortie=${racine}`],
      { cwd: RACINE, encoding: "utf8" },
    );
    expect(sortieTexte).toContain("Bilan par outil × mode");
    expect(sortieTexte).toMatch(/outil-alpha\s+web_activee\s+obtenues/);
    expect(sortieTexte).toMatch(/outil-beta\s+web_desactivee\s+obtenues/);
    expect(sortieTexte).toContain("taux de manquantes");
    const runsApres = existsSync(join(RACINE, "runs")) ? readdirSync(join(RACINE, "runs")).sort() : [];
    expect(runsApres).toEqual(runsAvant);
  });

  it("--sortie sous runs/ : refus nommé, code non nul, rien n'est écrit (revue du 2026-10-12, constat 9)", () => {
    const runs = join(RACINE, "runs");
    const runsAvant = existsSync(runs) ? readdirSync(runs).sort() : [];
    for (const argument of [`--sortie=${join(runs, "essai-run-dry")}`, "--sortie=runs/essai-run-dry"]) {
      const resultat = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(RACINE, "outils/run-dry.ts"), argument], {
        cwd: RACINE,
        encoding: "utf8",
      });
      expect(resultat.status).not.toBe(0);
      expect(resultat.stderr).toContain("SimuleSousRuns");
      expect(resultat.stdout).toBe("");
    }
    expect(existsSync(join(runs, "essai-run-dry"))).toBe(false);
    expect(existsSync(runs) ? readdirSync(runs).sort() : []).toEqual(runsAvant);
  });

  it("option inconnue (coquille) ⇒ refus nommé OptionsInconnues, code non nul, rien n'est écrit (constat 19)", () => {
    const racine = sortie();
    const resultat = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", join(RACINE, "outils/run-dry.ts"), `--saortie=${racine}`],
      { cwd: RACINE, encoding: "utf8" },
    );
    expect(resultat.status).not.toBe(0);
    expect(resultat.stderr).toContain("OptionsInconnues");
    expect(resultat.stdout).toBe("");
    expect(existsSync(join(racine, "2026-11-27"))).toBe(false);
  });

  it("--sortie sans valeur (coquille sans =) ⇒ refus nommé, rien n'est écrit", () => {
    const resultat = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(RACINE, "outils/run-dry.ts"), "--sortie"], {
      cwd: RACINE,
      encoding: "utf8",
    });
    expect(resultat.status).not.toBe(0);
    expect(resultat.stderr).toContain("ArgumentsRunDryRefuses");
    expect(resultat.stdout).toBe("");
  });
});
