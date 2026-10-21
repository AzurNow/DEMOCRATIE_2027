/**
 * Constat 19 de la revue du 2026-10-12 : les couples gabarit × type admis sont écrits deux fois,
 * en données (`prompts/gabarits-1.0.0.json#/gabarits[].types_admis`) et en clés de `RESOLVEURS`
 * (`pipeline/questions/reponse-attendue.ts`), sans test d'accord. Une table 1.1.0 qui ajouterait
 * un type sans toucher `RESOLVEURS` ferait engendrer des questions que `reponseAttendue` refuse :
 * le tirage s'arrêterait le jour du gel. Ce test compare les deux ensembles et nomme les couples
 * en trop de chaque côté.
 */

import { describe, expect, it } from "vitest";
import { GABARITS } from "../../pipeline/questions/gabarits.ts";
import { COUPLES_RESOLUS } from "../../pipeline/questions/reponse-attendue.ts";

function coupleDe(gabarit: string, type: string): string {
  return `${gabarit}:${type}`;
}

describe("couples gabarit × type : types_admis contre RESOLVEURS", () => {
  it("les onze couples admis par l'annexe B sont exactement ceux que RESOLVEURS sait trancher", () => {
    const admis = new Set(GABARITS.flatMap((gabarit) => gabarit.types_admis.map((type) => coupleDe(gabarit.code, type))));
    const enTrop = {
      admis_sans_resolveur: [...admis].filter((couple) => !COUPLES_RESOLUS.has(couple)).sort(),
      resolveur_sans_admission: [...COUPLES_RESOLUS].filter((couple) => !admis.has(couple)).sort(),
    };
    expect(enTrop).toEqual({ admis_sans_resolveur: [], resolveur_sans_admission: [] });
    expect(admis.size).toBe(11);
  });
});
