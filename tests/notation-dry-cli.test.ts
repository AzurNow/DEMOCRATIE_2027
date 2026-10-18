/**
 * `pnpm notation:dry` en ligne de commande (lot notation, PR D) : enchaînée après `pnpm run:dry`
 * sur la même sortie, relancée sans rien réécrire, et refusée sous `runs/` sans rien écrire.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executerOutil, RACINE_PROJET } from "./aides/depot.ts";
import { instantane } from "./notation/simulation.ts";

const sorties: string[] = [];

afterEach(() => {
  for (const chemin of sorties.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function sortie(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-notation-dry-cli-"));
  sorties.push(chemin);
  return chemin;
}

function contenuDeRuns(): readonly string[] {
  const runs = join(RACINE_PROJET, "runs");
  return existsSync(runs) ? readdirSync(runs).sort() : [];
}

describe("pnpm notation:dry, la commande", () => {
  it("après pnpm run:dry sur la même sortie, note le run, imprime son bilan, et pnpm notation:controle passe", () => {
    const racine = sortie();
    expect(executerOutil("run-dry.ts", [`--sortie=${racine}`]).status).toBe(0);
    const notation = executerOutil("notation-dry.ts", ["--sortie", racine]);
    expect(notation.erreur).not.toContain("non exécutée");
    expect(notation.status).toBe(0);
    expect(notation.sortie).toContain("Notation simulée (aucun modèle, aucun appel réseau)");
    expect(notation.sortie).toMatch(/Réponses obtenues : (\d+) = (\d+) verdict\(s\) \+ (\d+) en attente/);
    expect(notation.sortie).toContain("échantillon humain (double notation)");
    const controle = executerOutil("notation-controle.ts", [join(racine, "2026-11-27")]);
    expect(controle.sortie).toContain("aucune violation");
    expect(controle.status).toBe(0);
  });

  it("8. relancée sur la même sortie, ne réécrit rien et imprime le même bilan", () => {
    const racine = sortie();
    const premiere = executerOutil("notation-dry.ts", [`--sortie=${racine}`]);
    expect(premiere.status).toBe(0);
    const avant = instantane(racine);
    const seconde = executerOutil("notation-dry.ts", [`--sortie=${racine}`]);
    expect(seconde.status).toBe(0);
    expect(seconde.sortie).toBe(premiere.sortie);
    expect(instantane(racine)).toEqual(avant);
  });

  it("sans --sortie, écrit dans un répertoire temporaire neuf, jamais dans runs/", () => {
    const runsAvant = contenuDeRuns();
    const resultat = executerOutil("notation-dry.ts", []);
    expect(resultat.status).toBe(0);
    const repertoire = /— (.+)\n/.exec(resultat.sortie)?.[1];
    expect(repertoire).toBeDefined();
    if (repertoire !== undefined) sorties.push(dirname(repertoire));
    expect(repertoire?.startsWith(join(RACINE_PROJET, "runs"))).toBe(false);
    expect(contenuDeRuns()).toEqual(runsAvant);
  });

  it("7. --sortie sous runs/ : refus, code non nul, rien n'est écrit", () => {
    const runsAvant = contenuDeRuns();
    for (const argument of [["--sortie", join(RACINE_PROJET, "runs", "essai-notation-dry")], ["--sortie=runs/essai-notation-dry"]]) {
      const resultat = executerOutil("notation-dry.ts", argument);
      expect(resultat.status).toBe(2);
      expect(resultat.erreur).toContain("SimuleSousRuns");
      expect(resultat.sortie).toBe("");
    }
    expect(existsSync(join(RACINE_PROJET, "runs", "essai-notation-dry"))).toBe(false);
    expect(contenuDeRuns()).toEqual(runsAvant);
  });

  it("--sortie sans chemin : code 2", () => {
    expect(executerOutil("notation-dry.ts", ["--sortie"]).status).toBe(2);
  });
});
