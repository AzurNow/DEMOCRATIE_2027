/**
 * Le libellé `CHANGEMENT_RATTACHEMENT` est un format publié : `renvoyeDepuis` reconnaît un item
 * rattaché à une autre mesure au préfixe `<libellé> :` de l'entrée d'historique que
 * `rattacherItem` a écrite en staging. Le changer ferait redevenir jugés par leur ancien lot les
 * items déjà rattachés. Les tests de `rattachements-item` fabriquent leurs historiques avec la
 * constante : ils ne verraient pas un changement. Ce test écrit la chaîne littérale.
 */

import { describe, expect, it } from "vitest";
import { CHANGEMENT_RATTACHEMENT, lotJugeEncore, renvoyeDepuis } from "../validation/domaine/renvoi-mesure.ts";
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

describe("libellé CHANGEMENT_RATTACHEMENT", () => {
  it("sa valeur exacte est figée", () => {
    expect(
      CHANGEMENT_RATTACHEMENT,
      "CHANGEMENT_RATTACHEMENT est un format publié : des items déjà en staging portent l'ancien libellé " +
        "dans leur historique. Migrer ces historiques avant de changer ce libellé, sans quoi ils redeviennent " +
        "jugés par leur ancien lot.",
    ).toBe("rattachement à une autre mesure");
  });

  it("reconnaît une entrée écrite avec la chaîne littérale, sans passer par la constante", () => {
    const rattache = itemAvecChangement("rattachement à une autre mesure : mesure M2 en version 3");
    expect(renvoyeDepuis(rattache, 1)).toBe(true);
    expect(lotJugeEncore(rattache, { item_version: 1 })).toBe(false);
  });

  it.each([
    ["casse différente", "Rattachement à une autre mesure : mesure M2 en version 3"],
    ["espace en trop devant", " rattachement à une autre mesure : mesure M2 en version 3"],
    ["espace en trop avant les deux-points", "rattachement à une autre mesure  : mesure M2 en version 3"],
    ["sans séparateur", "rattachement à une autre mesure"],
    ["autre préfixe", "rattachement à une mesure : mesure M2 en version 3"],
    ["libellé enfoui plus loin", "note : rattachement à une autre mesure : mesure M2 en version 3"],
  ])("une entrée au libellé voisin (%s) n'est pas reconnue", (_cas, changement) => {
    const voisin = itemAvecChangement(changement);
    expect(renvoyeDepuis(voisin, 1)).toBe(false);
    expect(lotJugeEncore(voisin, { item_version: 1 })).toBe(true);
  });
});
