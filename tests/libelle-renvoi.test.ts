/**
 * Le libellé `CHANGEMENT_RENVOI` est un format publié : `renvoyeDepuis` reconnaît un item renvoyé
 * au préfixe de l'entrée d'historique que `pnpm mesures --renvoyer` a écrite en staging
 * (docs/DETTE.md, « Un item renvoyé redevient jugé par son ancien lot si le libellé change »). Les
 * tests de `renvoi-mesure.test.ts` fabriquent leurs historiques avec la constante : ils ne
 * verraient pas un changement. Ce test écrit la chaîne littérale.
 */

import { describe, expect, it } from "vitest";
import { CHANGEMENT_RENVOI, lotJugeEncore, renvoyeDepuis } from "../validation/domaine/renvoi-mesure.ts";
import type { Item } from "../validation/domaine/types.ts";
import { itemP } from "./aides/fabriques.ts";

/** Item dont l'historique porte une seule entrée, au `changement` donné, produisant la version 2. */
function itemAvecChangement(changement: string): Item {
  const entree = {
    date: "2026-11-02T10:00:00+01:00",
    changement,
    motif: "historique fabriqué avec une chaîne littérale",
    commit: "c".repeat(40),
    version_resultante: 2,
  };
  return { ...itemP(), version: 2, historique: [entree] };
}

describe("libellé CHANGEMENT_RENVOI", () => {
  it("sa valeur exacte est figée", () => {
    expect(
      CHANGEMENT_RENVOI,
      "CHANGEMENT_RENVOI est un format publié : des items déjà en staging portent l'ancien libellé dans " +
        "leur historique. Migrer ces historiques avant de changer ce libellé, sans quoi ils redeviennent " +
        "jugés par leur ancien lot.",
    ).toBe("renvoi en attente");
  });

  it("reconnaît une entrée écrite avec la chaîne littérale, sans passer par la constante", () => {
    const renvoye = itemAvecChangement("renvoi en attente : mesure M1 en version 2");
    expect(renvoyeDepuis(renvoye, 1)).toBe(true);
    expect(lotJugeEncore(renvoye, { item_version: 1 })).toBe(false);
  });

  it.each([
    ["casse différente", "Renvoi en attente : mesure M1 en version 2"],
    ["espace en trop devant", " renvoi en attente : mesure M1 en version 2"],
    ["espace en trop avant les deux-points", "renvoi en attente  : mesure M1 en version 2"],
    ["sans séparateur", "renvoi en attente"],
    ["autre préfixe", "renvoi différé : mesure M1 en version 2"],
    ["libellé enfoui plus loin", "note : renvoi en attente : mesure M1 en version 2"],
  ])("une entrée au libellé voisin (%s) n'est pas reconnue", (_cas, changement) => {
    const voisin = itemAvecChangement(changement);
    expect(renvoyeDepuis(voisin, 1)).toBe(false);
    expect(lotJugeEncore(voisin, { item_version: 1 })).toBe(true);
  });
});
