/**
 * Test verbatim et normalisation. Les cas limites du cahier des charges sont ici : guillemets
 * typographiques, espaces insécables, coupures de ligne d'un PDF, caractères hors du plan de
 * base — tout ce qui décale un surlignage d'un caractère sans qu'aucune assertion n'échoue.
 */

import { describe, expect, it } from "vitest";
import { normaliser, trancherPointsDeCode } from "../validation/domaine/normalisation.ts";
import { testerVerbatim } from "../validation/domaine/verbatim.ts";

describe("normalisation", () => {
  it("ramène guillemets et apostrophes typographiques à leur forme ASCII", () => {
    expect(normaliser("« L’impôt »")).toBe('" L\'impôt "');
  });

  it("réduit toute suite d'espaces, y compris une coupure de ligne de PDF", () => {
    expect(normaliser("la TVA\n   sur\tles carburants")).toBe("la TVA sur les carburants");
  });

  it("ne corrige aucune coquille : elle est dans la source", () => {
    expect(normaliser("Nous rétablirons la retraitte à 60 ans.")).toBe(
      "Nous rétablirons la retraitte à 60 ans.",
    );
  });

  it("ne change ni la casse ni la ponctuation", () => {
    expect(normaliser("TVA : 5,5 % ; point final.")).toBe("TVA : 5,5 % ; point final.");
  });
});

describe("test verbatim", () => {
  const source = "Page 14.\nNous ramènerons la TVA sur les carburants\nà 5,5 %, dès 2027.";

  it("trouve une citation malgré une coupure de ligne et rend des offsets exacts", () => {
    const resultat = testerVerbatim("la TVA sur les carburants à 5,5 %", source);
    expect(resultat.passe).toBe(true);
    expect(resultat.occurrences).toBe(1);
    const extrait = trancherPointsDeCode(
      source,
      resultat.offset_debut as number,
      resultat.offset_fin as number,
    );
    expect(extrait).toBe("la TVA sur les carburants\nà 5,5 %");
    expect(normaliser(extrait)).toBe(normaliser("la TVA sur les carburants à 5,5 %"));
  });

  it("trouve une citation dont les guillemets diffèrent de ceux de la source", () => {
    // Source en guillemets français sans espace intérieure, citation retapée en guillemets ASCII.
    // Les espaces fines insécables sont couvertes par le test suivant.
    const avecGuillemets = "Le candidat a dit : «ce sera 62 ans».";
    const resultat = testerVerbatim('"ce sera 62 ans"', avecGuillemets);
    expect(resultat.passe).toBe(true);
    expect(
      trancherPointsDeCode(avecGuillemets, resultat.offset_debut as number, resultat.offset_fin as number),
    ).toBe("«ce sera 62 ans»");
  });

  it("normalise une espace fine insécable en espace, sans la supprimer", () => {
    // La convention typographique française insère une espace fine dans les guillemets.
    // Elle devient une espace ordinaire ; elle ne disparaît pas, car supprimer un caractère
    // serait rapprocher la citation de sa source.
    const source = "Il a dit : « ce sera 62 ans ».";
    expect(testerVerbatim('" ce sera 62 ans "', source).passe).toBe(true);
    expect(testerVerbatim('"ce sera 62 ans"', source).passe).toBe(false);
  });

  it("échoue quand la citation n'est pas dans la source, sans proposer de rapprochement", () => {
    const resultat = testerVerbatim("la TVA sur les carburants à 5 %", source);
    expect(resultat.passe).toBe(false);
    expect(resultat.motif_echec).toBe("introuvable");
    expect(resultat.offset_debut).toBeNull();
    expect(resultat.offset_fin).toBeNull();
  });

  it("échoue sur une citation vide plutôt que de trouver la chaîne vide partout", () => {
    const resultat = testerVerbatim("   ", source);
    expect(resultat.passe).toBe(false);
    expect(resultat.motif_echec).toBe("citation_vide");
  });

  it("signale une citation présente deux fois au lieu de choisir en silence", () => {
    const repetee = "Il faut agir. Il faut agir.";
    const resultat = testerVerbatim("Il faut agir.", repetee);
    expect(resultat.passe).toBe(true);
    expect(resultat.occurrences).toBe(2);
    expect(resultat.offset_debut).toBe(0);
  });

  it("garde des offsets en points de code quand la source contient un caractère hors BMP", () => {
    // « 🌍 » occupe deux unités UTF-16 et un seul point de code : un offset en unités UTF-16
    // décalerait le surlignage de tout ce qui suit.
    const avecEmoji = "Objectif 🌍 : neutralité carbone en 2050.";
    const resultat = testerVerbatim("neutralité carbone en 2050", avecEmoji);
    expect(resultat.passe).toBe(true);
    expect(
      trancherPointsDeCode(avecEmoji, resultat.offset_debut as number, resultat.offset_fin as number),
    ).toBe("neutralité carbone en 2050");
    // « Objectif »(0-7), espace(8), 🌍(9), espace(10), « : »(11), espace(12) → n = 13.
    expect(resultat.offset_debut).toBe(13);
  });

  it("situe correctement une citation en fin de source", () => {
    const resultat = testerVerbatim("dès 2027.", source);
    expect(resultat.passe).toBe(true);
    expect(
      trancherPointsDeCode(source, resultat.offset_debut as number, resultat.offset_fin as number),
    ).toBe("dès 2027.");
  });
});
