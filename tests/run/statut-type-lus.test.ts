/**
 * Lot 10 (b), constat 30 (PR #173 incomplète) : le statut et le type d'un run lus par l'analyse, le
 * go/no-go et la notation humaine sont les unions dérivées du schéma (`analysis/types-run.ts`), pas
 * des `string`. Une faute de frappe ou un statut renommé dans le schéma casse alors la compilation
 * (`pnpm check`) au lieu de laisser passer une comparaison toujours fausse.
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import type { RunLu } from "../../analysis/lecture-run.ts";
import {
  STATUT_INVALIDE,
  STATUT_PLANIFIE,
  STATUTS_RUN,
  TYPE_PILOTE,
  TYPES_RUN,
  type StatutRun,
  type TypeRun,
} from "../../analysis/types-run.ts";

describe("statut et type de run typés à la lecture (Lot 10 (b))", () => {
  it("RunLu.statut et RunLu.type_run sont les unions du schéma, pas des chaînes libres", () => {
    expectTypeOf<RunLu["statut"]>().toEqualTypeOf<StatutRun>();
    expectTypeOf<RunLu["type_run"]>().toEqualTypeOf<TypeRun>();
  });

  it("les constantes lues par le go/no-go et la notation humaine appartiennent aux listes accordées au schéma", () => {
    expect(STATUTS_RUN).toContain(STATUT_INVALIDE);
    expect(STATUTS_RUN).toContain(STATUT_PLANIFIE);
    expect(TYPES_RUN).toContain(TYPE_PILOTE);
  });
});
