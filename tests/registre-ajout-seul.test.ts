/**
 * `validation/io/registre-ajout-seul.ts` : le registre JSON en ajout seul générique, partagé par
 * les trois registres de mesures (revue du 2026-10-17, constat 11). Exercé ici contre un schéma
 * réel (`decision-mesure`) et son validateur de domaine, pour rester fidèle à ce qu'en font les
 * trois registres plutôt que d'inventer un schéma de test.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validerEntreeRegistre, type DecisionCorrectionMesure } from "../validation/domaine/corrections-mesure.ts";
import {
  ajouterAuRegistreGenerique,
  lireRegistreGenerique,
  poserRegistreAjoutSeul,
  RegistreModifieDepuisLecture,
  texteDuRegistre,
  validerEntreeRegistreGenerique,
  type DefinitionRegistre,
} from "../validation/io/registre-ajout-seul.ts";

class IllisibleDeTest extends Error {
  constructor(chemin: string, detail: string) {
    super(`illisible : ${chemin} : ${detail}`);
    this.name = "IllisibleDeTest";
  }
}

const DEFINITION: DefinitionRegistre<DecisionCorrectionMesure> = {
  schema: "decision-mesure",
  validerEntree: validerEntreeRegistre,
  creerIllisible: (chemin, detail) => new IllisibleDeTest(chemin, detail),
};

function entree(surcharges: Partial<DecisionCorrectionMesure> = {}): DecisionCorrectionMesure {
  return {
    mesure_id: "01JBANCESSA90000000MESVRE1",
    mesure_version: 1,
    theme_demande: "ecologie_energie",
    decision: "acceptee",
    date: "2026-11-20",
    ...surcharges,
  };
}

let repertoire = "";
let chemin = "";
beforeEach(() => {
  repertoire = mkdtempSync(join(tmpdir(), "banc-registre-ajout-seul-"));
  chemin = join(repertoire, "registre.json");
});
afterEach(() => rmSync(repertoire, { recursive: true, force: true }));

describe("texteDuRegistre", () => {
  it("rend null quand le fichier est absent", () => {
    expect(texteDuRegistre(chemin)).toBeNull();
  });

  it("rend le texte exact du fichier quand il existe", () => {
    writeFileSync(chemin, "[]\n", "utf8");
    expect(texteDuRegistre(chemin)).toBe("[]\n");
  });
});

describe("poserRegistreAjoutSeul", () => {
  it("crée le fichier quand il est absent (lu: null)", () => {
    poserRegistreAjoutSeul(chemin, null, [entree()]);
    expect(JSON.parse(readFileSync(chemin, "utf8"))).toEqual([entree()]);
  });

  it("refuse si le fichier a changé depuis sa lecture, sans toucher au fichier", () => {
    writeFileSync(chemin, "[]\n", "utf8");
    expect(() => poserRegistreAjoutSeul(chemin, null, [entree()])).toThrow(RegistreModifieDepuisLecture);
    expect(readFileSync(chemin, "utf8")).toBe("[]\n");
  });

  it("ne laisse aucun fichier temporaire après une pose refusée", () => {
    writeFileSync(chemin, "[]\n", "utf8");
    expect(() => poserRegistreAjoutSeul(chemin, null, [entree()])).toThrow(RegistreModifieDepuisLecture);
    expect(readdirSync(repertoire).sort()).toEqual(["registre.json"]);
  });
});

describe("lireRegistreGenerique / ajouterAuRegistreGenerique", () => {
  it("un fichier absent est un registre vide", () => {
    expect(lireRegistreGenerique(chemin, DEFINITION)).toEqual([]);
  });

  it("ajoute une entrée en fin de registre, en gardant les précédentes dans leur ordre", () => {
    const premiere = entree({ theme_demande: "sante" });
    const seconde = entree();
    ajouterAuRegistreGenerique(chemin, premiere, DEFINITION);
    ajouterAuRegistreGenerique(chemin, seconde, DEFINITION);
    expect(lireRegistreGenerique(chemin, DEFINITION)).toEqual([premiere, seconde]);
  });

  it("un JSON illisible lève l'erreur fournie par la définition, en nommant le fichier", () => {
    writeFileSync(chemin, "{ pas du json", "utf8");
    expect(() => lireRegistreGenerique(chemin, DEFINITION)).toThrow(IllisibleDeTest);
    expect(() => lireRegistreGenerique(chemin, DEFINITION)).toThrow(chemin);
  });

  it("un registre qui n'est pas un tableau lève l'erreur fournie", () => {
    writeFileSync(chemin, "{}", "utf8");
    expect(() => lireRegistreGenerique(chemin, DEFINITION)).toThrow(IllisibleDeTest);
  });

  it("une entrée à ajouter non conforme au schéma est refusée avant toute écriture", () => {
    expect(() => ajouterAuRegistreGenerique(chemin, entree({ mesure_version: 0 }), DEFINITION)).toThrow();
    expect(texteDuRegistre(chemin)).toBeNull();
  });
});

describe("validerEntreeRegistreGenerique", () => {
  it("rend l'entrée typée quand elle est conforme au schéma et au domaine", () => {
    expect(validerEntreeRegistreGenerique(entree(), "test", DEFINITION)).toEqual(entree());
  });

  it("lève sans rien lire ni écrire quand l'entrée est non conforme", () => {
    expect(() => validerEntreeRegistreGenerique(entree({ decision: "refusee" }), "test", DEFINITION)).toThrow();
  });
});
