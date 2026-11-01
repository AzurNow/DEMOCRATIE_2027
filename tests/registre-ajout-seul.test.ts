/**
 * `validation/io/registre-ajout-seul.ts` : le registre JSON en ajout seul générique, partagé par
 * les trois registres de mesures (revue du 2026-10-17, constat 11). Exercé ici contre un schéma
 * réel (`decision-mesure`) et son validateur de domaine, pour rester fidèle à ce qu'en font les
 * trois registres plutôt que d'inventer un schéma de test.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validerEntreeRegistre, type DecisionCorrectionMesure } from "../validation/domaine/corrections-mesure.ts";
import {
  ajouterAuRegistreGenerique,
  lireRegistreGenerique,
  cheminVerrou,
  poserRegistreAjoutSeul,
  RegistreModifieDepuisLecture,
  RegistreVerrouille,
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

/*
 * Exclusion entre écritures concurrentes (revue du 2026-10-17, constat 9) : le contrôle de
 * modification seul laisse une fenêtre entre la relecture et le renommage, où deux écritures
 * lancées sur le même état passent toutes deux et la seconde efface la première. Un verrou
 * `<registre>.verrou`, posé avant la lecture et retiré après, ferme cette fenêtre.
 */
describe("ajouterAuRegistreGenerique : verrou exclusif par registre", () => {
  it("une seconde écriture lancée pendant la première est refusée nommément, et rien n'est perdu", () => {
    const premiere = entree({ theme_demande: "sante" });
    const concurrente = entree();
    const existante = entree({ theme_demande: "education" });
    writeFileSync(chemin, `${JSON.stringify([existante], null, 2)}\n`, "utf8");
    let refus: unknown = null;
    // La première écriture relit les entrées existantes sous verrou : c'est là qu'on lance la seconde.
    const pendantLaPremiere: DefinitionRegistre<DecisionCorrectionMesure> = {
      ...DEFINITION,
      validerEntree: (valeur, provenance) => {
        if (provenance.endsWith("entrée 1") && refus === null) {
          try {
            ajouterAuRegistreGenerique(chemin, concurrente, DEFINITION);
            refus = "aucun refus";
          } catch (erreur) {
            refus = erreur;
          }
        }
        return DEFINITION.validerEntree(valeur, provenance);
      },
    };
    ajouterAuRegistreGenerique(chemin, premiere, pendantLaPremiere);
    expect(refus).toBeInstanceOf(RegistreVerrouille);
    expect((refus as Error).message).toContain(cheminVerrou(chemin));
    expect(lireRegistreGenerique(chemin, DEFINITION)).toEqual([existante, premiere]);
    expect(existsSync(cheminVerrou(chemin))).toBe(false);
  });

  it("le verrou est retiré après une écriture réussie", () => {
    ajouterAuRegistreGenerique(chemin, entree(), DEFINITION);
    expect(existsSync(cheminVerrou(chemin))).toBe(false);
    expect(readdirSync(repertoire).sort()).toEqual(["registre.json"]);
  });

  it("le verrou est retiré après un échec au milieu de l'écriture (registre illisible)", () => {
    writeFileSync(chemin, "{ pas du json", "utf8");
    expect(() => ajouterAuRegistreGenerique(chemin, entree(), DEFINITION)).toThrow(IllisibleDeTest);
    expect(existsSync(cheminVerrou(chemin))).toBe(false);
    expect(readFileSync(chemin, "utf8")).toBe("{ pas du json");
  });

  it("le verrou est retiré après une exception levée par le validateur de domaine sous verrou", () => {
    writeFileSync(chemin, `${JSON.stringify([entree()], null, 2)}\n`, "utf8");
    const enPanne: DefinitionRegistre<DecisionCorrectionMesure> = {
      ...DEFINITION,
      validerEntree: (valeur, provenance) => {
        if (provenance.endsWith("entrée 1")) throw new Error("panne simulée");
        return DEFINITION.validerEntree(valeur, provenance);
      },
    };
    expect(() => ajouterAuRegistreGenerique(chemin, entree({ theme_demande: "sante" }), enPanne)).toThrow("panne simulée");
    expect(existsSync(cheminVerrou(chemin))).toBe(false);
    expect(lireRegistreGenerique(chemin, DEFINITION)).toEqual([entree()]);
  });

  it("un verrou orphelin bloque l'écriture par un refus qui nomme le verrou, sans le voler ni toucher au registre", () => {
    writeFileSync(chemin, "[]\n", "utf8");
    writeFileSync(cheminVerrou(chemin), "pid 99999\n", "utf8");
    const appel = (): unknown => ajouterAuRegistreGenerique(chemin, entree(), DEFINITION);
    expect(appel).toThrow(RegistreVerrouille);
    expect(appel).toThrow(cheminVerrou(chemin));
    expect(appel).toThrow(/supprimer/);
    expect(readFileSync(cheminVerrou(chemin), "utf8")).toBe("pid 99999\n");
    expect(readFileSync(chemin, "utf8")).toBe("[]\n");
  });

  it("le verrou se pose aussi quand le répertoire du registre n'existe pas encore", () => {
    const profond = join(repertoire, "sous", "dossier", "registre.json");
    ajouterAuRegistreGenerique(profond, entree(), DEFINITION);
    expect(lireRegistreGenerique(profond, DEFINITION)).toEqual([entree()]);
    expect(existsSync(cheminVerrou(profond))).toBe(false);
  });

  it("le contrôle de modification reste actif sans verrou (défense en profondeur)", () => {
    writeFileSync(chemin, "[]\n", "utf8");
    expect(() => poserRegistreAjoutSeul(chemin, null, [entree()])).toThrow(RegistreModifieDepuisLecture);
    expect(readFileSync(chemin, "utf8")).toBe("[]\n");
  });
});
