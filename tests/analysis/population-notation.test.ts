/**
 * La population « réponses obtenues du run » (`analysis/population-notation.ts`), seule définition
 * lue par les six appelants du constat 1 de la revue du 2026-11-09 : jeu d'or, contrôle de la
 * notation, notation simulée, lecture du run, go/no-go, écran de notation humaine.
 *
 * Ces tests figent le comportement d'avant la factorisation, canal application compris : le passage
 * au canal API seul attend un amendement du §7 (docs/DETTE.md, 2026-11-09).
 */

import { describe, expect, it } from "vitest";
import { reponsesObtenuesDuRun } from "../../analysis/population-notation.ts";
import { CONTEXTES_MESURE, type Canal, type ContexteMesure, type StatutReponse } from "../../analysis/types.ts";

interface ReponseMinimale {
  readonly id: string;
  readonly contexte: ContexteMesure;
  readonly canal: Canal;
  readonly statut_reponse: StatutReponse;
}

function reponse(id: string, surcharges: Partial<ReponseMinimale> = {}): ReponseMinimale {
  return { id, contexte: "run", canal: "api", statut_reponse: "obtenue", ...surcharges };
}

const ids = (reponses: readonly ReponseMinimale[]): readonly string[] => reponses.map((r) => r.id);

describe("reponsesObtenuesDuRun", () => {
  it("garde une réponse obtenue de contexte run", () => {
    expect(ids(reponsesObtenuesDuRun([reponse("a")]))).toEqual(["a"]);
  });

  it("écarte une réponse manquante (§6 : elle n'a rien à noter)", () => {
    expect(reponsesObtenuesDuRun([reponse("a", { statut_reponse: "manquante" })])).toEqual([]);
  });

  it.each(CONTEXTES_MESURE.filter((c) => c !== "run"))("écarte une réponse obtenue de contexte %s", (contexte) => {
    expect(reponsesObtenuesDuRun([reponse("a", { contexte })])).toEqual([]);
  });

  it("garde une saisie de l'application (comportement actuel, amendement du §7 en attente)", () => {
    expect(ids(reponsesObtenuesDuRun([reponse("api"), reponse("app", { canal: "application" })]))).toEqual(["api", "app"]);
  });

  it("garde l'ordre reçu, sans dédoublonner ni trier", () => {
    const entree = [reponse("c"), reponse("x", { statut_reponse: "manquante" }), reponse("a"), reponse("b", { contexte: "pilote" }), reponse("b")];
    expect(ids(reponsesObtenuesDuRun(entree))).toEqual(["c", "a", "b"]);
  });

  it("une liste vide rend une liste vide", () => {
    expect(reponsesObtenuesDuRun([])).toEqual([]);
  });

  it("rend les objets reçus eux-mêmes, sans copie ni projection", () => {
    const a = reponse("a");
    const [rendue] = reponsesObtenuesDuRun([a]);
    expect(rendue).toBe(a);
  });
});
