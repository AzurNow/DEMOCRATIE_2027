/**
 * Recherche d'un nom de candidat (D14 (2)) : libellé ou nom seul déclarés au périmètre, par
 * correspondance exacte, en mot entier. Cas limite 12 du brief. Le prédicat d'éligibilité qui s'en
 * sert, `permutation.ts:nommeUnInterroge`, est testé dans `permutation.test.ts`.
 * Candidats ouvertement fictifs : aucune personne réelle.
 */

import { describe, expect, it } from "vitest";
import { occurrencesDeNom, textesNommables } from "../../pipeline/notation/candidats.ts";
import { itemO, itemP } from "../aides/fabriques.ts";

describe("occurrencesDeNom", () => {
  it("rend les intervalles en unités UTF-16, en mot entier seulement", () => {
    expect(occurrencesDeNom("Martinez et Martinezville, puis Martinez.", "Martinez")).toEqual([
      { debut: 0, fin: 8 },
      { debut: 32, fin: 40 },
    ]);
  });

  it("refuse un nom vide ou blanc : il nommerait tout", () => {
    expect(() => occurrencesDeNom("x", " ")).toThrow(/vide/);
  });
});

describe("textesNommables : la réponse projetée et les textes de l'item", () => {
  it("prend la paraphrase et la citation d'un item P", () => {
    const item = itemP();
    const assertion = item.assertion;
    if (assertion === undefined) throw new Error("fabrique sans assertion");
    expect(textesNommables("texte", [item])).toEqual(["texte", assertion.paraphrase, assertion.citation_verbatim]);
  });

  it("prend les deux états d'un item O", () => {
    const item = itemO();
    const obsolescence = item.obsolescence;
    if (obsolescence === undefined) throw new Error("fabrique sans obsolescence");
    expect(textesNommables("t", [item])).toEqual([
      "t",
      obsolescence.etat_anterieur.paraphrase,
      obsolescence.etat_anterieur.citation_verbatim,
      obsolescence.etat_posterieur.paraphrase,
      obsolescence.etat_posterieur.citation_verbatim,
    ]);
  });
});
