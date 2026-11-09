/**
 * Revue du 2026-11-09, constat 4 : « les décisions qui vérifient un item sont accepter et corriger »
 * n'est écrite qu'une fois (`validation/domaine/types.ts:DECISIONS_VERIFIANTES`), et ses trois
 * lecteurs la suivent décision par décision : le kappa de validation (`kappa.ts:categorieDe`), la
 * règle de concordance post-hoc (`invariants.ts:validationsConcordantesMemeVersion`) et le contrôle a
 * posteriori de `pnpm promote` (`versions-promues.ts:controlerVersionsPromues`). Une décision
 * vérifiante ajoutée à `DECISIONS` change les trois ensemble, ou ce test casse.
 */
import { describe, expect, it } from "vitest";
import { validationsConcordantesMemeVersion, type DecisionValidation } from "../pipeline/questions/invariants.ts";
import { categorieDe } from "../validation/domaine/kappa.ts";
import { DECISIONS, DECISIONS_VERIFIANTES, type Decision, type Item } from "../validation/domaine/types.ts";
import { controlerVersionsPromues } from "../validation/domaine/versions-promues.ts";
import { itemPromu } from "./aides/data.ts";

function deuxVersions(decision: Decision): readonly DecisionValidation[] {
  const commune = { item_id: "item-p-1", decision, item_empreinte: "7".repeat(64) };
  return [
    { ...commune, id: "d1", annotateur_id: "a1", item_version: 1 },
    { ...commune, id: "d2", annotateur_id: "a2", item_version: 2 },
  ];
}

/** Un item promu dont les deux validations portent `decision`, face à un journal vide. */
function itemDecide(decision: Decision): Item {
  const item = itemPromu();
  const validations = (item.validations as readonly Record<string, unknown>[]).map((validation) => ({ ...validation, decision }));
  return { ...item, validations };
}

describe("DECISIONS_VERIFIANTES", () => {
  it("accepter et corriger, et elles seules", () => {
    expect([...DECISIONS_VERIFIANTES].sort()).toEqual(["accepter", "corriger"]);
  });

  it("chacune est une décision de DECISIONS", () => {
    for (const decision of DECISIONS_VERIFIANTES) expect(DECISIONS as readonly string[]).toContain(decision);
  });

  describe.each(DECISIONS)("décision %s : les trois lecteurs suivent la constante", (decision) => {
    const verifiante = DECISIONS_VERIFIANTES.has(decision);

    it("kappa de validation : catégorie « retenu » si et seulement si elle vérifie", () => {
      expect(categorieDe(decision) === "retenu").toBe(verifiante);
    });

    it("concordance post-hoc : deux versions font une violation si et seulement si elle vérifie", () => {
      expect(validationsConcordantesMemeVersion(deuxVersions(decision)).length > 0).toBe(verifiante);
    });

    it("contrôle de pnpm promote : rapprochée du journal (introuvable ici) si et seulement si elle vérifie", () => {
      const { introuvables } = controlerVersionsPromues([itemDecide(decision)], () => []);
      expect(introuvables.length > 0).toBe(verifiante);
    });
  });
});
