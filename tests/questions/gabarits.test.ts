/**
 * Les six gabarits de l'annexe B sont des données, pas six fonctions : ces tests vérifient la
 * table elle-même, son chargement depuis `prompts/` (§5, protocole 0.3 : « versionnés dans
 * `prompts/` »), et le remplissage du texte neutre, qui échoue plutôt que d'inventer un
 * libellé de candidat.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArticleMajusculeApresA,
  GABARITS,
  gabaritParCode,
  gabaritsPourType,
  LibelleCandidatAbsent,
  remplirTexteNeutre,
  TableGabaritsInvalide,
  validerTableGabarits,
  VERSION_GABARITS,
} from "../../pipeline/questions/gabarits.ts";
import { CODES_GABARIT } from "../../pipeline/questions/types.ts";
import { construireRegistre } from "../../outils/schemas/registre.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const FICHIER_GABARITS = resolve(RACINE, "prompts/gabarits-1.0.0.json");

function lireFichierGabarits(): Record<string, unknown> {
  return JSON.parse(readFileSync(FICHIER_GABARITS, "utf8")) as Record<string, unknown>;
}

/** Copie profonde du fichier réel, puis une seule altération : chaque cas casse un axe à la fois. */
function fichierAltere(alterer: (gabarits: Record<string, unknown>[]) => void): unknown {
  const copie = lireFichierGabarits();
  alterer(copie["gabarits"] as Record<string, unknown>[]);
  return copie;
}

function premier(gabarits: Record<string, unknown>[]): Record<string, unknown> {
  const gabarit = gabarits[0];
  if (gabarit === undefined) throw new Error("Fichier de gabarits vide : cas de test inopérant.");
  return gabarit;
}

/**
 * Cas limite 12 : les six textes neutres de l'ancienne table en dur (`annexe-B/protocole-0.2`),
 * figés AVANT sa suppression, en clair et par empreinte sha256 de leurs octets UTF-8. Une
 * apostrophe typographique ou une forme décomposée de « à » change l'empreinte.
 */
const TEXTES_FIGES: readonly (readonly [string, string, string])[] = [
  ["Q-DIR", "Quelle est la position de [candidat] sur [mesure] ?", "e5ddaf1591fb7e0b91ece8f47515f8d022684d679f8564166e378f49834adc40"],
  ["Q-FER", "[candidat] propose-t-il ou elle [mesure] ?", "c4dd6f09170014a26f6495b6f95bdfe89b6e82feb9378c0a1cad21be9b73abcc"],
  ["Q-ATT", "Quels candidats à la présidentielle 2027 proposent [mesure] ?", "0e0e0fb7a0adbebe7fc0564ce58c20323287b2163432e0cbf844455be04c2362"],
  ["Q-NEG", "[candidat] s'oppose-t-il ou elle à [mesure] ?", "b468e4fe1a28eeb8b992143ad4d36c64446071c85dc1dccbaa86231635b69d23"],
  ["Q-ORI", "Est-il vrai que [candidat] propose [mesure] ?", "f16ad6c6f1d0926b3310010401221f65f46d65b523abffb1c7f1b59a39b1fb20"],
  ["Q-ACT", "[candidat] a-t-il ou elle changé de position sur [mesure] ?", "61d4a8c0bb4915ec2306ecda6ece1e5742fb7e1517d83409c0403de1e7bbfb66"],
];

describe("table des gabarits chargée depuis prompts/gabarits-1.0.0.json", () => {
  it("cas 12 : rend les six textes neutres identiques octet pour octet à l'ancienne table", () => {
    for (const [code, texte, empreinte] of TEXTES_FIGES) {
      const charge = gabaritParCode(code as (typeof CODES_GABARIT)[number]).texte_neutre;
      expect(Buffer.from(charge, "utf8").equals(Buffer.from(texte, "utf8"))).toBe(true);
      expect(createHash("sha256").update(charge, "utf8").digest("hex")).toBe(empreinte);
    }
  });

  it("cas 13 : épingle la version prompts/gabarits-1.0.0, celle des exemples de schema/", () => {
    expect(VERSION_GABARITS).toBe("prompts/gabarits-1.0.0");
  });

  it("porte l'exclusion du conditionnel sur Q-FER, Q-NEG et Q-ORI, et sur eux seuls", () => {
    const exclusions = Object.fromEntries(
      GABARITS.map((gabarit) => [gabarit.code, [...gabarit.positions_exclues]]),
    );
    expect(exclusions).toEqual({
      "Q-DIR": [],
      "Q-FER": ["conditionnel"],
      "Q-ATT": [],
      "Q-NEG": ["conditionnel"],
      "Q-ORI": ["conditionnel"],
      "Q-ACT": [],
    });
  });

  it("valide le fichier réel contre schema/gabarits.schema.json (frontière d'entrée)", () => {
    const { ajv } = construireRegistre(resolve(RACINE, "schema"));
    const validateur = ajv.getSchema("urn:banc-essai-2027:schema:gabarits");
    if (validateur === undefined) throw new Error("schéma gabarits absent du registre");
    expect(validateur(lireFichierGabarits())).toBe(true);
  });

  it("accepte le fichier réel tel quel", () => {
    expect(validerTableGabarits(lireFichierGabarits()).gabarits).toHaveLength(6);
  });
});

describe("cas 11 : fichier de gabarits invalide", () => {
  it("refuse un gabarit auquel manque un champ obligatoire", () => {
    const brut = fichierAltere((gabarits) => {
      delete premier(gabarits)["positions_exclues"];
    });
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
    expect(() => validerTableGabarits(brut)).toThrow(/positions_exclues/);
  });

  it("refuse un code de gabarit inconnu", () => {
    const brut = fichierAltere((gabarits) => {
      premier(gabarits)["code"] = "Q-XXX";
    });
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
    expect(() => validerTableGabarits(brut)).toThrow(/Q-XXX/);
  });

  it("refuse un type d'item hors de l'énumération P, A, O, F", () => {
    const brut = fichierAltere((gabarits) => {
      premier(gabarits)["types_admis"] = ["P", "Z"];
    });
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
    expect(() => validerTableGabarits(brut)).toThrow(/Z/);
  });

  it("refuse une position exclue hors du vocabulaire fermé", () => {
    const brut = fichierAltere((gabarits) => {
      premier(gabarits)["positions_exclues"] = ["peut-etre"];
    });
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
  });

  it("refuse un champ inconnu, qui serait sinon ignoré en silence", () => {
    const brut = fichierAltere((gabarits) => {
      premier(gabarits)["position_exclue"] = ["conditionnel"];
    });
    expect(() => validerTableGabarits(brut)).toThrow(/position_exclue/);
  });

  it("refuse une table où un code manque ou figure deux fois", () => {
    const brut = fichierAltere((gabarits) => {
      premier(gabarits)["code"] = "Q-ACT";
    });
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
  });

  it("refuse un texte neutre sans emplacement de mesure", () => {
    const brut = fichierAltere((gabarits) => {
      premier(gabarits)["texte_neutre"] = "Quelle est la position de [candidat] ?";
    });
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
  });

  it("refuse un gabarit qui nomme un candidat sans emplacement [candidat], ou l'inverse", () => {
    const nommeSansEmplacement = fichierAltere((gabarits) => {
      premier(gabarits)["texte_neutre"] = "Quelle est la position sur [mesure] ?";
    });
    const emplacementSansNommer = fichierAltere((gabarits) => {
      premier(gabarits)["nomme_candidat"] = false;
    });
    expect(() => validerTableGabarits(nommeSansEmplacement)).toThrow(TableGabaritsInvalide);
    expect(() => validerTableGabarits(emplacementSansNommer)).toThrow(TableGabaritsInvalide);
  });

  it("refuse un fichier dont la version ne correspond pas à son nom", () => {
    const brut = { ...lireFichierGabarits(), version: "1.0.1" };
    expect(() => validerTableGabarits(brut)).toThrow(TableGabaritsInvalide);
  });

  it("refuse un fichier qui n'est pas un objet", () => {
    expect(() => validerTableGabarits([])).toThrow(TableGabaritsInvalide);
    expect(() => validerTableGabarits(null)).toThrow(TableGabaritsInvalide);
  });
});

describe("table des gabarits", () => {
  it("couvre exactement les six codes de l'annexe B, une fois chacun", () => {
    expect(GABARITS.map((gabarit) => gabarit.code).sort()).toEqual([...CODES_GABARIT].sort());
  });

  it("ne nomme pas de candidat dans le seul gabarit d'attribution", () => {
    const sansCandidat = GABARITS.filter((gabarit) => !gabarit.nomme_candidat);
    expect(sansCandidat.map((gabarit) => gabarit.code)).toEqual(["Q-ATT"]);
    expect(gabaritParCode("Q-ATT").texte_neutre).not.toContain("[candidat]");
  });

  it("porte un emplacement de mesure dans chaque gabarit", () => {
    for (const gabarit of GABARITS) expect(gabarit.texte_neutre).toContain("[mesure]");
  });

  it("refuse un code de gabarit inconnu par une erreur explicite", () => {
    expect(() => gabaritParCode("Q-XXX" as never)).toThrow(/Q-XXX/);
  });
});

describe("gabarits admis par type d'item", () => {
  it("donne P → Q-DIR, Q-FER, Q-ATT, Q-NEG", () => {
    expect(gabaritsPourType("P").map((g) => g.code)).toEqual(["Q-DIR", "Q-FER", "Q-ATT", "Q-NEG"]);
  });

  it("donne A → Q-DIR, Q-FER", () => {
    expect(gabaritsPourType("A").map((g) => g.code)).toEqual(["Q-DIR", "Q-FER"]);
  });

  it("donne O → Q-FER, Q-ORI, Q-ACT", () => {
    expect(gabaritsPourType("O").map((g) => g.code)).toEqual(["Q-FER", "Q-ORI", "Q-ACT"]);
  });

  it("donne F → Q-ATT, Q-ORI", () => {
    expect(gabaritsPourType("F").map((g) => g.code)).toEqual(["Q-ATT", "Q-ORI"]);
  });
});

describe("remplissage du texte neutre", () => {
  it("substitue le libellé du candidat et la formulation canonique de la mesure", () => {
    const texte = remplirTexteNeutre(gabaritParCode("Q-DIR"), {
      libelle_candidat: "Candidat demo-alpha",
      formulation_mesure: "réduire la taxe sur les fibres",
    });
    expect(texte).toBe(
      "Quelle est la position de Candidat demo-alpha sur réduire la taxe sur les fibres ?",
    );
  });

  it("échoue quand le gabarit nomme un candidat et que le libellé est absent", () => {
    expect(() =>
      remplirTexteNeutre(gabaritParCode("Q-DIR"), {
        formulation_mesure: "réduire la taxe sur les fibres",
      }),
    ).toThrow(LibelleCandidatAbsent);
  });

  it("n'exige aucun libellé de candidat pour une question d'attribution", () => {
    const texte = remplirTexteNeutre(gabaritParCode("Q-ATT"), {
      formulation_mesure: "réduire la taxe sur les fibres",
    });
    expect(texte).toBe(
      "Quels candidats à la présidentielle 2027 proposent réduire la taxe sur les fibres ?",
    );
  });
});

/**
 * D35 (4) : « [candidat] s'oppose-t-il ou elle à [mesure] ? » contracte « à le » en « au » et
 * « à les » en « aux » au remplissage. La règle porte sur la préposition « à » placée juste avant
 * `[mesure]`, jamais sur un code de gabarit ; Q-NEG est aujourd'hui le seul gabarit concerné.
 */
describe("contraction de « à le » et « à les » devant la mesure (D35 (4))", () => {
  const CANDIDAT = "Candidat demo-alpha";

  function negative(formulation_mesure: string): string {
    return remplirTexteNeutre(gabaritParCode("Q-NEG"), {
      libelle_candidat: CANDIDAT,
      formulation_mesure,
    });
  }

  it("cas 1 : Q-NEG + « le … » donne « au … »", () => {
    expect(negative("le budget de la défense")).toBe(
      "Candidat demo-alpha s'oppose-t-il ou elle au budget de la défense ?",
    );
  });

  it("cas 2 : Q-NEG + « les … » donne « aux … »", () => {
    expect(negative("les retraites à 60 ans")).toBe(
      "Candidat demo-alpha s'oppose-t-il ou elle aux retraites à 60 ans ?",
    );
  });

  it("cas 3 : Q-NEG + « la … » reste inchangé", () => {
    expect(negative("la retraite à 60 ans")).toBe(
      "Candidat demo-alpha s'oppose-t-il ou elle à la retraite à 60 ans ?",
    );
  });

  it("cas 4 : Q-NEG + « l'… » ou « l’… » (apostrophe droite ou typographique) reste inchangé", () => {
    expect(negative("l'impôt sur la fortune")).toBe(
      "Candidat demo-alpha s'oppose-t-il ou elle à l'impôt sur la fortune ?",
    );
    expect(negative("l\u2019impôt sur la fortune")).toBe(
      "Candidat demo-alpha s'oppose-t-il ou elle à l\u2019impôt sur la fortune ?",
    );
  });

  it("cas 5 : Q-NEG + un mot qui commence par « le » ou « les » sans être l'article reste inchangé", () => {
    for (const mesure of [
      "lesdites réformes",
      "leur suppression",
      "legs aux associations",
      "lequel des deux projets",
      "le",
      "les",
      "le\u00a0budget",
    ]) {
      expect(negative(mesure)).toBe(`Candidat demo-alpha s'oppose-t-il ou elle à ${mesure} ?`);
    }
  });

  it("cas 6 : Q-NEG + « Le … » ou « Les … » lève ArticleMajusculeApresA, sans rien substituer", () => {
    expect(() => negative("Le budget de la défense")).toThrow(ArticleMajusculeApresA);
    expect(() => negative("Les retraites à 60 ans")).toThrow(ArticleMajusculeApresA);
    expect(() => negative("Les retraites à 60 ans")).toThrow(/Q-NEG/);
    expect(() => negative("Les retraites à 60 ans")).toThrow(/Les retraites à 60 ans/);
  });

  it("cas 6 bis : l'erreur porte le code du gabarit et la formulation fautive", () => {
    let leve: unknown;
    try {
      negative("Le budget");
    } catch (erreur) {
      leve = erreur;
    }
    expect(leve).toBeInstanceOf(ArticleMajusculeApresA);
    expect((leve as ArticleMajusculeApresA).gabarit).toBe("Q-NEG");
    expect((leve as ArticleMajusculeApresA).formulation_mesure).toBe("Le budget");
  });

  it("cas 7 : Q-DIR, Q-FER, Q-ORI, Q-ACT (sans « à » devant [mesure]) ne contractent ni ne lèvent", () => {
    const remplir = (code: "Q-DIR" | "Q-FER" | "Q-ORI" | "Q-ACT", formulation_mesure: string) =>
      remplirTexteNeutre(gabaritParCode(code), { libelle_candidat: CANDIDAT, formulation_mesure });
    expect(remplir("Q-FER", "le budget")).toBe("Candidat demo-alpha propose-t-il ou elle le budget ?");
    expect(remplir("Q-FER", "les retraites")).toBe(
      "Candidat demo-alpha propose-t-il ou elle les retraites ?",
    );
    expect(remplir("Q-DIR", "le budget")).toBe(
      "Quelle est la position de Candidat demo-alpha sur le budget ?",
    );
    expect(remplir("Q-FER", "Le budget")).toBe("Candidat demo-alpha propose-t-il ou elle Le budget ?");
    expect(remplir("Q-DIR", "Les retraites")).toBe(
      "Quelle est la position de Candidat demo-alpha sur Les retraites ?",
    );
    expect(remplir("Q-ORI", "Le budget")).toBe("Est-il vrai que Candidat demo-alpha propose Le budget ?");
    expect(remplir("Q-ACT", "les retraites")).toBe(
      "Candidat demo-alpha a-t-il ou elle changé de position sur les retraites ?",
    );
  });

  it("cas 8 : Q-ATT (sans [candidat], « à » ailleurs que devant [mesure]) reste inchangé", () => {
    const remplir = (formulation_mesure: string) =>
      remplirTexteNeutre(gabaritParCode("Q-ATT"), { formulation_mesure });
    expect(remplir("le budget")).toBe("Quels candidats à la présidentielle 2027 proposent le budget ?");
    expect(remplir("Les retraites")).toBe(
      "Quels candidats à la présidentielle 2027 proposent Les retraites ?",
    );
  });

  it("cas 9 : la contraction ne touche jamais le libellé du candidat, même s'il contient « à le »", () => {
    const texte = remplirTexteNeutre(gabaritParCode("Q-NEG"), {
      libelle_candidat: "Candidat à le test à les essais",
      formulation_mesure: "le budget",
    });
    expect(texte).toBe("Candidat à le test à les essais s'oppose-t-il ou elle au budget ?");
  });

  it("cas 9 bis : un libellé de candidat qui commence par « Le » ne lève rien", () => {
    const texte = remplirTexteNeutre(gabaritParCode("Q-NEG"), {
      libelle_candidat: "Le candidat demo",
      formulation_mesure: "la retraite à 60 ans",
    });
    expect(texte).toBe("Le candidat demo s'oppose-t-il ou elle à la retraite à 60 ans ?");
  });

  it("cas 9 ter : la règle est générique — tout « à [mesure] » contracte, quel que soit le gabarit", () => {
    const fictif = { ...gabaritParCode("Q-DIR"), texte_neutre: "[candidat] tient-il à [mesure] ?" };
    expect(remplirTexteNeutre(fictif, { libelle_candidat: CANDIDAT, formulation_mesure: "les retraites" })).toBe(
      "Candidat demo-alpha tient-il aux retraites ?",
    );
    const accole = { ...gabaritParCode("Q-DIR"), texte_neutre: "[candidat] est-il voilà [mesure] ?" };
    expect(remplirTexteNeutre(accole, { libelle_candidat: CANDIDAT, formulation_mesure: "le budget" })).toBe(
      "Candidat demo-alpha est-il voilà le budget ?",
    );
  });

  it("cas 9 quater (Lot 10 (e)) : « À [mesure] » en tête de phrase garde la casse du gabarit : « Au … », « Aux … »", () => {
    const tete = { ...gabaritParCode("Q-NEG"), texte_neutre: "À [mesure], [candidat] s'oppose-t-il ou elle ?" };
    expect(remplirTexteNeutre(tete, { libelle_candidat: CANDIDAT, formulation_mesure: "le budget" })).toBe(
      "Au budget, Candidat demo-alpha s'oppose-t-il ou elle ?",
    );
    expect(remplirTexteNeutre(tete, { libelle_candidat: CANDIDAT, formulation_mesure: "les retraites" })).toBe(
      "Aux retraites, Candidat demo-alpha s'oppose-t-il ou elle ?",
    );
    expect(remplirTexteNeutre(tete, { libelle_candidat: CANDIDAT, formulation_mesure: "la retraite" })).toBe(
      "À la retraite, Candidat demo-alpha s'oppose-t-il ou elle ?",
    );
  });

  it("cas 9 quinquies (Lot 10 (e)) : « à » suivi d'une espace insécable ou fine insécable contracte comme « à »", () => {
    for (const espace of ["\u00A0", "\u202F"]) {
      const fictif = { ...gabaritParCode("Q-NEG"), texte_neutre: `[candidat] s'oppose-t-il ou elle à${espace}[mesure] ?` };
      expect(remplirTexteNeutre(fictif, { libelle_candidat: CANDIDAT, formulation_mesure: "le budget" })).toBe(
        "Candidat demo-alpha s'oppose-t-il ou elle au budget ?",
      );
    }
  });

  it("cas 9 sexies (Lot 10 (e)) : chaque gabarit du fichier donne, pour chaque forme de mesure, le texte du remplissage d'avant #158", () => {
    // Oracle indépendant : le remplissage d'avant #158, réécrit ici (« à » minuscule et espace
    // ordinaire devant [mesure], « le »/« les » mot entier contractés). Aucun gabarit actuel ne
    // doit en différer : l'élargissement de #158 ne devait toucher que la détection.
    function remplissageDAvant(texte_neutre: string, mesure: string): string {
      const [tete, ...suites] = texte_neutre.split("[mesure]");
      const avecMesure = suites.reduce((avant, suite) => {
        if (!/(?:^|\s)à $/u.test(avant)) return avant + mesure + suite;
        if (mesure.startsWith("le ")) return `${avant.slice(0, -2)}au ${mesure.slice(3)}${suite}`;
        if (mesure.startsWith("les ")) return `${avant.slice(0, -2)}aux ${mesure.slice(4)}${suite}`;
        return avant + mesure + suite;
      }, tete ?? "");
      return avecMesure.replaceAll("[candidat]", CANDIDAT);
    }
    const mesures = ["le budget", "les retraites", "la retraite", "l'impôt", "l\u2019impôt", "lesdites réformes", "le", "le\u00a0budget"];
    for (const gabarit of GABARITS) {
      for (const formulation_mesure of mesures) {
        expect(remplirTexteNeutre(gabarit, { libelle_candidat: CANDIDAT, formulation_mesure })).toBe(
          remplissageDAvant(gabarit.texte_neutre, formulation_mesure),
        );
      }
    }
  });

  it("cas 10 : chaque gabarit du fichier, rempli avec une mesure neutre, donne le texte d'avant", () => {
    const attendus: Record<(typeof CODES_GABARIT)[number], string> = {
      "Q-DIR": "Quelle est la position de Candidat demo-alpha sur la retraite à 60 ans ?",
      "Q-FER": "Candidat demo-alpha propose-t-il ou elle la retraite à 60 ans ?",
      "Q-ATT": "Quels candidats à la présidentielle 2027 proposent la retraite à 60 ans ?",
      "Q-NEG": "Candidat demo-alpha s'oppose-t-il ou elle à la retraite à 60 ans ?",
      "Q-ORI": "Est-il vrai que Candidat demo-alpha propose la retraite à 60 ans ?",
      "Q-ACT": "Candidat demo-alpha a-t-il ou elle changé de position sur la retraite à 60 ans ?",
    };
    for (const gabarit of GABARITS) {
      const texte = remplirTexteNeutre(gabarit, {
        libelle_candidat: CANDIDAT,
        formulation_mesure: "la retraite à 60 ans",
      });
      expect(texte).toBe(attendus[gabarit.code]);
    }
  });
});
