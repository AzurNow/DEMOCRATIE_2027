/**
 * Décision D42 (4) : le contrôle de la reformulation accepte la mesure sous sa forme canonique ou
 * sous la forme contractée par la règle fixe de `gabarits.ts` (D35 (4)), cette dernière seulement
 * quand le gabarit place « à » devant `[mesure]`. La règle de contraction n'existe qu'à un endroit.
 */

import { describe, expect, it } from "vitest";
import {
  ArticleMajusculeApresA,
  formesAdmisesDeMesure,
  gabaritParCode,
  mesureFigureSousFormeAdmise,
  remplirTexteNeutre,
} from "../../pipeline/questions/gabarits.ts";

const Q_NEG = gabaritParCode("Q-NEG");
const Q_FER = gabaritParCode("Q-FER");

describe("formes admises de la mesure (D42 (4))", () => {
  it("Q-NEG place « à » devant la mesure : canonique et contractée", () => {
    expect(formesAdmisesDeMesure(Q_NEG, "le budget")).toEqual({ canonique: "le budget", contractee: "au budget" });
    expect(formesAdmisesDeMesure(Q_NEG, "les retraites")).toEqual({
      canonique: "les retraites",
      contractee: "aux retraites",
    });
  });

  it("la forme contractée est celle qu'écrit le texte neutre : une seule règle", () => {
    const neutre = remplirTexteNeutre(Q_NEG, { libelle_candidat: "X", formulation_mesure: "le budget" });
    const { contractee } = formesAdmisesDeMesure(Q_NEG, "le budget");
    expect(contractee).not.toBeNull();
    expect(neutre).toContain(` ${String(contractee)} `);
  });

  it("article qui ne se contracte pas (« la ») : canonique seule, même derrière « à »", () => {
    expect(formesAdmisesDeMesure(Q_NEG, "la retraite")).toEqual({ canonique: "la retraite", contractee: null });
  });

  it("gabarit sans « à » devant la mesure : canonique seule", () => {
    expect(formesAdmisesDeMesure(Q_FER, "le budget")).toEqual({ canonique: "le budget", contractee: null });
  });

  it("article en majuscule derrière « à » : même refus qu'au remplissage du texte neutre", () => {
    expect(() => formesAdmisesDeMesure(Q_NEG, "Le budget")).toThrow(ArticleMajusculeApresA);
  });
});

describe("cas limite 9 : la mesure figure sous une forme admise", () => {
  it("Q-NEG + « le budget » : « au budget » accepté", () => {
    expect(mesureFigureSousFormeAdmise("Tu sais si X s'oppose au budget ?", Q_NEG, "le budget")).toBe(true);
  });

  it("Q-NEG + « le budget » : « contre le budget » accepté (forme canonique)", () => {
    expect(mesureFigureSousFormeAdmise("X est contre le budget, non ?", Q_NEG, "le budget")).toBe(true);
  });

  it("Q-NEG + « le budget » : « au Budget » rejeté", () => {
    expect(mesureFigureSousFormeAdmise("X s'oppose au Budget ?", Q_NEG, "le budget")).toBe(false);
  });

  it("Q-NEG + « le budget » : « à le budget » rejeté", () => {
    expect(mesureFigureSousFormeAdmise("X s'oppose à le budget ?", Q_NEG, "le budget")).toBe(false);
  });

  it("constat 28 : « à le » avec une majuscule (« À le budget ») est rejeté, pas seulement la forme minuscule", () => {
    expect(mesureFigureSousFormeAdmise("X s'oppose À le budget ?", Q_NEG, "le budget")).toBe(false);
  });

  it("constat 28 : « à le » avec une espace insécable ou fine insécable après « à » est rejeté", () => {
    expect(mesureFigureSousFormeAdmise("X s'oppose à le budget ?", Q_NEG, "le budget")).toBe(false);
    expect(mesureFigureSousFormeAdmise("X s'oppose à le budget ?", Q_NEG, "le budget")).toBe(false);
  });

  it("Q-NEG + « le budget » : une occurrence admise suffit, même si une autre suit « à »", () => {
    expect(mesureFigureSousFormeAdmise("Contre le budget ? Ou à le budget ?", Q_NEG, "le budget")).toBe(true);
  });

  it("Q-NEG + « les retraites » : « aux retraites » accepté, « à les retraites » rejeté", () => {
    expect(mesureFigureSousFormeAdmise("X s'oppose aux retraites ?", Q_NEG, "les retraites")).toBe(true);
    expect(mesureFigureSousFormeAdmise("X s'oppose à les retraites ?", Q_NEG, "les retraites")).toBe(false);
  });

  it("gabarit sans « à » devant la mesure + « le budget » : « au budget » rejeté, canonique acceptée", () => {
    expect(mesureFigureSousFormeAdmise("X propose au budget ?", Q_FER, "le budget")).toBe(false);
    expect(mesureFigureSousFormeAdmise("X propose le budget ?", Q_FER, "le budget")).toBe(true);
  });

  it("mesure absente du texte ⇒ faux", () => {
    expect(mesureFigureSousFormeAdmise("X s'oppose à quoi ?", Q_NEG, "le budget")).toBe(false);
  });
});

describe("cas limite 11 : apostrophes et guillemets typographiques, comparaison exacte", () => {
  const typographique = "la création d’un jardin partagé";
  const droite = "la création d'un jardin partagé";

  it("mesure à apostrophe typographique recopiée avec une apostrophe droite ⇒ rejet", () => {
    expect(mesureFigureSousFormeAdmise(`X propose ${droite} ?`, Q_FER, typographique)).toBe(false);
  });

  it("mesure à apostrophe droite recopiée avec une apostrophe typographique ⇒ rejet", () => {
    expect(mesureFigureSousFormeAdmise(`X propose ${typographique} ?`, Q_FER, droite)).toBe(false);
  });

  it("recopie exacte ⇒ acceptée", () => {
    expect(mesureFigureSousFormeAdmise(`X propose ${typographique} ?`, Q_FER, typographique)).toBe(true);
  });

  it("guillemets français et droits ne se confondent pas", () => {
    expect(mesureFigureSousFormeAdmise('X propose le "chèque" ?', Q_FER, "le « chèque »")).toBe(false);
  });
});
