/**
 * Lot gel, PR 1, cas limite 9 : `config/gel.json` porte ce que `run.json` exige et qu'aucune autre
 * source ne porte. Livré à `null`, rempli par l'auteur ; `pnpm geler` refuse de partir sur un champ
 * `null` ou absent, en le nommant, sans valeur par défaut.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import {
  AnnotateurAuteurNonDeclare,
  ConfigurationGelIncomplete,
  ConfigurationGelIllisible,
  validerConfigurationGel,
} from "../../pipeline/gel/configuration.ts";
import { FamilleDeJugeAbsente, JugesDeMemeFamille } from "../../pipeline/notation/familles-juges.ts";
import { CONFIGURATION_GEL } from "./fixtures.ts";

const LIVRE = resolve(import.meta.dirname, "../../config/gel.json");

function texte(valeur: unknown): string {
  return JSON.stringify(valeur, null, 2);
}

function erreurDe(appel: () => unknown): Error {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("aucune erreur levée");
}

describe("cas 9 : config/gel.json", () => {
  it("une configuration complète est rendue telle quelle", () => {
    const lue = validerConfigurationGel(texte(CONFIGURATION_GEL), "essai");
    expect(lue.version_protocole).toBe(CONFIGURATION_GEL.version_protocole);
    expect(lue.fenetre_debut).toBe(CONFIGURATION_GEL.fenetre_debut);
    expect(lue.juges).toEqual(CONFIGURATION_GEL.juges);
    expect([...lue.alias_aveugles.entries()]).toEqual(Object.entries(CONFIGURATION_GEL.alias_aveugles));
  });

  it("cas 9 : une valeur null ⇒ refus qui nomme le champ", () => {
    const erreur = erreurDe(() => validerConfigurationGel(texte({ ...CONFIGURATION_GEL, fenetre_debut: null }), "essai"));
    expect(erreur).toBeInstanceOf(ConfigurationGelIncomplete);
    expect((erreur as ConfigurationGelIncomplete).champs).toEqual(["fenetre_debut"]);
    expect(erreur.message).toContain("fenetre_debut");
    expect(erreur.message).toContain("essai");
  });

  it("cas 9 : le fichier livré dans le dépôt est refusé, ses quatre champs nommés", () => {
    const erreur = erreurDe(() => validerConfigurationGel(readFileSync(LIVRE, "utf8"), LIVRE));
    expect(erreur).toBeInstanceOf(ConfigurationGelIncomplete);
    expect((erreur as ConfigurationGelIncomplete).champs).toEqual(["version_protocole", "fenetre_debut", "juges", "alias_aveugles"]);
  });

  it("cas 9 : un champ absent ⇒ refus du schéma qui nomme le champ", () => {
    const { juges: _retire, ...sans } = CONFIGURATION_GEL;
    const erreur = erreurDe(() => validerConfigurationGel(texte(sans), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("juges");
  });

  // §7, protocole 0.23 (D58) : « Un run déclare exactement deux juges, ni plus ni moins ». Le refus
  // tombe à la lecture de config/gel.json, première étape de pnpm geler, avant toute écriture.
  it("D58 : un seul juge déclaré ⇒ refus du schéma qui nomme juges, avant toute écriture", () => {
    const [premier] = CONFIGURATION_GEL.juges;
    const erreur = erreurDe(() => validerConfigurationGel(texte({ ...CONFIGURATION_GEL, juges: [premier] }), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("/juges");
    expect(erreur.message).toContain("must NOT have fewer than 2 items");
  });

  it("D58 : trois juges déclarés ⇒ refus du schéma qui nomme juges, avant toute écriture", () => {
    const troisieme = { juge_id: "juge-3", famille_modele: "famille-z", modele: "famille-z/modele-juge-3", version_prompt: "prompts/judge-primaire-1.0.0" };
    const erreur = erreurDe(() => validerConfigurationGel(texte({ ...CONFIGURATION_GEL, juges: [...CONFIGURATION_GEL.juges, troisieme] }), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("/juges");
    expect(erreur.message).toContain("must NOT have more than 2 items");
  });

  it("une clé inconnue est refusée par le schéma, jamais ignorée", () => {
    const erreur = erreurDe(() => validerConfigurationGel(texte({ ...CONFIGURATION_GEL, taux_echantillon_humain: 0.1 }), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("must NOT have additional properties");
  });

  it("une clé répétée est refusée : JSON.parse n'en garderait que la dernière", () => {
    const repete = texte(CONFIGURATION_GEL).replace('"version_protocole"', '"version_protocole": "0.0",\n  "version_protocole"');
    const erreur = erreurDe(() => validerConfigurationGel(repete, "essai"));
    expect(erreur).toBeInstanceOf(ConfigurationGelIllisible);
    expect(erreur.message).toContain("version_protocole");
  });

  it("un JSON illisible est refusé, provenance nommée", () => {
    const erreur = erreurDe(() => validerConfigurationGel("{ pas du JSON", "config/gel.json"));
    expect(erreur).toBeInstanceOf(ConfigurationGelIllisible);
    expect(erreur.message).toContain("config/gel.json");
  });
});

describe("§7.12 : familles de juges, refusées au gel", () => {
  const [premier, second] = CONFIGURATION_GEL.juges;
  if (premier === undefined || second === undefined) throw new Error("fixture sans deux juges");
  const avec = (juges: readonly unknown[]) => texte({ ...CONFIGURATION_GEL, juges });

  it("même famille ⇒ JugesDeMemeFamille", () => {
    const erreur = erreurDe(() => validerConfigurationGel(avec([premier, { ...second, famille_modele: premier.famille_modele }]), "essai"));
    expect(erreur).toBeInstanceOf(JugesDeMemeFamille);
  });

  it("même famille à la casse et aux espaces de bord près ⇒ JugesDeMemeFamille", () => {
    const erreur = erreurDe(() =>
      validerConfigurationGel(avec([{ ...premier, famille_modele: "Anthropic" }, { ...second, famille_modele: " anthropic " }]), "essai"),
    );
    expect(erreur).toBeInstanceOf(JugesDeMemeFamille);
  });

  it.each(["   ", "\t"])("famille faite d'espaces %j ⇒ FamilleDeJugeAbsente", (famille) => {
    const erreur = erreurDe(() => validerConfigurationGel(avec([premier, { ...second, famille_modele: famille }]), "essai"));
    expect(erreur).toBeInstanceOf(FamilleDeJugeAbsente);
  });

  it("famille vide ⇒ refusée par le schéma (minLength 1), avant la règle", () => {
    const erreur = erreurDe(() => validerConfigurationGel(avec([premier, { ...second, famille_modele: "" }]), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
  });

  it("deux familles distinctes ⇒ accepté", () => {
    expect(validerConfigurationGel(avec([premier, second]), "essai").juges).toEqual([premier, second]);
  });
});

// §7 (protocole 0.31, D73 (7)) : « Les outils du run qu'édite l'éditeur de chaque juge forment une
// liste déclarée par l'auteur au gel, vide comprise, et publiée avec le run. » Déclarée, jamais déduite :
// le champ est exigé de chaque juge, une liste vide est une déclaration, son absence un refus.
describe("D73 (7) : outils de l'éditeur de chaque juge, déclarés au gel", () => {
  const [premier, second] = CONFIGURATION_GEL.juges;
  if (premier === undefined || second === undefined) throw new Error("fixture sans deux juges");
  const avec = (juges: readonly unknown[]) => texte({ ...CONFIGURATION_GEL, juges });

  it("la liste déclarée est rendue telle quelle, une liste vide comprise", () => {
    const lue = validerConfigurationGel(avec([{ ...premier, outils_de_son_editeur: ["outil-alpha"] }, { ...second, outils_de_son_editeur: [] }]), "essai");
    expect(lue.juges.map((juge) => juge.outils_de_son_editeur)).toEqual([["outil-alpha"], []]);
  });

  it("champ absent ⇒ refus du schéma qui nomme le juge, jamais une liste vide implicite", () => {
    const { outils_de_son_editeur: _retire, ...sans } = second;
    const erreur = erreurDe(() => validerConfigurationGel(avec([premier, sans]), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("/juges/1");
    expect(erreur.message).toContain("outils_de_son_editeur");
  });

  it("null ⇒ refus du schéma : seul le champ juges entier peut rester à null dans un brouillon", () => {
    const erreur = erreurDe(() => validerConfigurationGel(avec([premier, { ...second, outils_de_son_editeur: null }]), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("/juges/1/outils_de_son_editeur");
  });

  it("un outil répété dans la liste ⇒ refus du schéma", () => {
    const erreur = erreurDe(() => validerConfigurationGel(avec([premier, { ...second, outils_de_son_editeur: ["outil-alpha", "outil-alpha"] }]), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("/juges/1/outils_de_son_editeur");
  });
});

describe("§7 (0.27, D67) : le pseudonyme de l'auteur au gel", () => {
  it("annotateur_auteur est recopié dans la configuration lue", () => {
    expect(validerConfigurationGel(texte(CONFIGURATION_GEL), "essai").annotateur_auteur).toBe(CONFIGURATION_GEL.annotateur_auteur);
  });

  it("gel réel : annotateur_auteur absent ⇒ AnnotateurAuteurNonDeclare, sans valeur par défaut", () => {
    const { annotateur_auteur: _retire, ...sans } = CONFIGURATION_GEL;
    const erreur = erreurDe(() => validerConfigurationGel(texte(sans), "essai"));
    expect(erreur).toBeInstanceOf(AnnotateurAuteurNonDeclare);
    expect(erreur.message).toContain("annotateur_auteur");
    expect(erreur.message).toContain("essai");
  });

  it("annotateur_auteur n'a pas la forme d'un pseudonyme ⇒ refus du schéma", () => {
    const erreur = erreurDe(() => validerConfigurationGel(texte({ ...CONFIGURATION_GEL, annotateur_auteur: "Prénom Nom" }), "essai"));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("annotateur_auteur");
  });
});
