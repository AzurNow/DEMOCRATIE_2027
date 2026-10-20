/**
 * Cas limite 12 du brief : les nouveaux exemples de `schema/exemples/reponse/` (décisions de
 * l'auteur du 2026-10-02) passent ou échouent comme le manifeste le dit, et les listes fermées du
 * lot recopient exactement les énumérations du schéma.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { MODES, MOTIFS_MANQUANTE, TYPES_ERREUR_TENTATIVE } from "../../pipeline/interrogation/types.ts";

const EXEMPLES = join(import.meta.dirname, "../../schema/exemples/reponse");
const SCHEMA = JSON.parse(readFileSync(join(import.meta.dirname, "../../schema/reponse.schema.json"), "utf8")) as {
  properties: { mode: { enum: string[] }; motif_manquante: { enum: string[] } };
  $defs: { tentative: { properties: { erreur: { properties: { type: { enum: string[] } } } } } };
};

function exemple(nom: string): unknown {
  return JSON.parse(readFileSync(join(EXEMPLES, nom), "utf8"));
}

describe("cas 12 : les nouveaux exemples valides passent", () => {
  it.each([
    "valide-03-api-obtenue-refus-api.json",
    "valide-04-api-manquante-hors-fenetre-une-tentative.json",
    "valide-05-api-manquante-hors-fenetre-jamais-partie.json",
    "valide-06-api-obtenue-refus-brut-texte.json",
  ])("%s", (nom) => {
    expect(erreurDeSchema("reponse", exemple(nom), nom)).toBeNull();
  });
});

describe("cas 12 : les nouveaux exemples invalides échouent, sur la règle visée", () => {
  it.each([
    ["invalide-09-hors-fenetre-trois-tentatives.json", "/tentatives"],
    ["invalide-10-manquante-sans-motif.json", ""],
    ["invalide-11-obtenue-avec-motif.json", ""],
    ["invalide-12-refus-api-avec-texte.json", "/normalise/texte"],
    ["invalide-13-tentative-refus-api.json", "/tentatives/2/erreur/type"],
    ["invalide-14-echecs-deux-tentatives.json", "/tentatives"],
    ["invalide-15-brut-et-brut-texte.json", ""],
    ["invalide-16-obtenue-sans-brut-octets-sha256.json", ""],
    ["invalide-17-requete-sans-entetes.json", "/requete"],
  ])("%s (chemin %s)", (nom, chemin) => {
    const erreur = erreurDeSchema("reponse", exemple(nom), nom);
    expect(erreur).not.toBeNull();
    expect(erreur?.chemins).toContain(chemin);
  });
});

describe("cas 12 : chaque tentative est contrôlée, pas seulement son numéro", () => {
  it("une première tentative sans message est refusée (prefixItems porte la forme d'une tentative)", () => {
    const manquante = exemple("valide-02-api-manquante.json") as { tentatives: { erreur: object }[] };
    const tentatives = manquante.tentatives.map((t, rang) => (rang === 0 ? { ...t, erreur: { type: "http" } } : t));
    const erreur = erreurDeSchema("reponse", { ...manquante, tentatives }, "tentative 1 sans message");
    expect(erreur?.chemins).toContain("/tentatives/0/erreur");
  });
});

describe("D55 (1), §7 : la trace de normalisation ne peut pas disparaître de la réponse publiée", () => {
  it("une réponse obtenue sans reponse.normalisation est refusée par le schéma", () => {
    const obtenue = exemple("valide-01-api-obtenue.json") as Record<string, unknown>;
    const { normalisation: _normalisation, ...sansNormalisation } = obtenue;
    const erreur = erreurDeSchema("reponse", sansNormalisation, "obtenue sans normalisation");
    expect(erreur).not.toBeNull();
    expect(erreur?.chemins).toContain("");
  });
});

describe("les listes fermées du lot égalent les énumérations du schéma", () => {
  it("TYPES_ERREUR_TENTATIVE = $defs/tentative/properties/erreur/properties/type, sans refus_api", () => {
    expect([...TYPES_ERREUR_TENTATIVE]).toEqual(SCHEMA.$defs.tentative.properties.erreur.properties.type.enum);
    expect(TYPES_ERREUR_TENTATIVE).not.toContain("refus_api");
  });

  it("MOTIFS_MANQUANTE = properties/motif_manquante", () => {
    expect([...MOTIFS_MANQUANTE]).toEqual(SCHEMA.properties.motif_manquante.enum);
  });

  it("MODES = properties/mode", () => {
    expect([...MODES]).toEqual(SCHEMA.properties.mode.enum);
  });
});
