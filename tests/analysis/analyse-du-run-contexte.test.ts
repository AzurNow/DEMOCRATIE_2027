/**
 * `analysis/analyse-du-run.ts` : le partage de la population est calculé une seule fois par analyse
 * (docs/DETTE.md, 2026-11-02, n° 1). Les fonctions de partage sont enveloppées pour compter leurs
 * appels ; leur résultat est inchangé. Fichier à part : `vi.mock` vaut pour tout le fichier.
 */

import { describe, expect, it, vi } from "vitest";
import * as incertitude from "../../analysis/incertitude.ts";
import * as seuils from "../../analysis/seuils.ts";
import * as strateRecente from "../../analysis/strate-recente.ts";
import { analyserRun, contexteDuRun } from "../../analysis/analyse-du-run.ts";
import { assembler } from "../../analysis/filtre.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "./run-analysable.ts";

vi.mock("../../analysis/seuils.ts", async (original) => {
  const module = await original<typeof import("../../analysis/seuils.ts")>();
  return { ...module, couplesComparables: vi.fn(module.couplesComparables), candidatsComparables: vi.fn(module.candidatsComparables) };
});
vi.mock("../../analysis/incertitude.ts", async (original) => {
  const module = await original<typeof import("../../analysis/incertitude.ts")>();
  return { ...module, stratesDuCalculPrincipal: vi.fn(module.stratesDuCalculPrincipal) };
});
vi.mock("../../analysis/strate-recente.ts", async (original) => {
  const module = await original<typeof import("../../analysis/strate-recente.ts")>();
  return { ...module, unitesDeLaStrateRecente: vi.fn(module.unitesDeLaStrateRecente) };
});

const PARTAGE = [seuils.couplesComparables, seuils.candidatsComparables, incertitude.stratesDuCalculPrincipal, strateRecente.unitesDeLaStrateRecente];

describe("contexte calculé une fois", () => {
  it("une analyse complète appelle chaque fonction de partage exactement une fois", () => {
    for (const fonction of PARTAGE) vi.mocked(fonction).mockClear();
    analyserRun(entreesDuRunAnalysable(SPEC_REFERENCE), { reechantillonnages: 20, permutations: 20 });
    for (const fonction of PARTAGE) expect(vi.mocked(fonction)).toHaveBeenCalledTimes(1);
  });

  it("le contexte est figé : son partage ne se modifie pas après coup", () => {
    const entrees = entreesDuRunAnalysable(SPEC_REFERENCE);
    const contexte = contexteDuRun(entrees, assembler(entrees), { reechantillonnages: 20, permutations: 20 });
    expect(Object.isFrozen(contexte)).toBe(true);
    expect(Object.isFrozen(contexte.couples.compares)).toBe(true);
    expect(Object.isFrozen(contexte.candidats.rapportes_a_part)).toBe(true);
    expect(Object.isFrozen(contexte.strates.candidats)).toBe(true);
    expect(() => (contexte.couples.compares as unknown[]).push({ outil_id: "intrus", mode: "web_activee" })).toThrow(TypeError);
  });
});
