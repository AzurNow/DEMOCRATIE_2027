/**
 * `lireInstant` lit `date_gel`, les bornes de fenêtre et les horodatages de tentative. `Date.parse`
 * fait glisser un jour hors du mois (`2027-02-29` devient le 1er mars) sans lever : la date civile
 * écrite suit la règle unique `dateCivileValide` (`validation/domaine/validateurs-champ.ts`), comme
 * `instantDe` (`pipeline/questions/reponse-attendue.ts`), par une erreur nommée qui porte le contexte.
 */

import { describe, expect, it } from "vitest";
import { InstantImpossible, lireInstant } from "../../pipeline/interrogation/heure-paris.ts";

describe("lireInstant : une date civile impossible est refusée, jamais glissée", () => {
  it.each(["2027-02-29T10:00:00+01:00", "2026-04-31T00:00:00Z", "2026-13-01T12:00:00+02:00"])(
    "« %s » lève InstantImpossible",
    (instant) => {
      expect(() => lireInstant(instant, "date_gel")).toThrow(InstantImpossible);
    },
  );

  it("le message nomme le contexte et l'instant refusé", () => {
    expect(() => lireInstant("2027-02-29T10:00:00+01:00", "run.json#/date_gel")).toThrow(
      /run\.json#\/date_gel.*2027-02-29T10:00:00\+01:00/,
    );
  });

  it("2028-02-29 (année bissextile) est accepté", () => {
    expect(lireInstant("2028-02-29T10:00:00+01:00", "date_gel")).toBe(Date.UTC(2028, 1, 29, 9, 0, 0));
  });

  it("un instant valide est lu inchangé, à la milliseconde près", () => {
    expect(lireInstant("2027-03-02T06:00:00.123+01:00", "date_gel")).toBe(Date.UTC(2027, 2, 2, 5, 0, 0, 123));
  });

  it("un instant sans décalage reste refusé comme avant", () => {
    expect(() => lireInstant("2027-03-02T06:00:00", "date_gel")).toThrow(/n'est pas un instant à décalage explicite/);
  });
});
