/**
 * Les avertissements `strict: "log"` d'ajv sont catégorisés : une catégorie connue est comptée,
 * une inconnue fait échouer, une catégorie admise sans occurrence est signalée
 * (docs/DETTE.md, 2026-09-18, point 4).
 */

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bilanDesAvertissements,
  CATEGORIES_ADMISES,
  ErreurAvertissementStrictInconnu,
} from "../outils/schemas/avertissements.ts";
import { NOMS_SCHEMAS, urnSchema } from "../outils/schemas/noms.ts";
import { construireRegistre, creerAjv } from "../outils/schemas/registre.ts";

const racineSchema = resolve(import.meta.dirname, "../schema");

describe("avertissements strict d'ajv", () => {
  it("un avertissement d'une catégorie connue est ignoré et compté", () => {
    const bilan = bilanDesAvertissements([
      'strict mode: required property "a" is not defined at "urn:x#/then" (strictRequired)',
      'strict mode: required property "b" is not defined at "urn:x#/not" (strictRequired)',
    ]);
    expect(bilan.total).toBe(2);
    expect(bilan.comptes.get("strictRequired")).toBe(2);
  });

  it("un mot-clé mal orthographié (requird) dans un schéma en mémoire échoue en citant schéma et message", () => {
    const avertissements: string[] = [];
    const ajv = creerAjv(avertissements);
    ajv.addSchema({ $id: "urn:test:coquille", type: "object", requird: ["a"] });
    ajv.getSchema("urn:test:coquille");
    expect(avertissements.length).toBeGreaterThan(0);
    const appel = () => bilanDesAvertissements(avertissements);
    expect(appel).toThrow(ErreurAvertissementStrictInconnu);
    expect(appel).toThrow(/requird/);
  });

  it("l'erreur cite le message complet, schéma compris", () => {
    const message = 'strict mode: nouvelle règle at "urn:banc-essai-2027:schema:item#/x" (strictNouvelle)';
    expect(() => bilanDesAvertissements([message])).toThrow(message);
  });

  it("une catégorie admise sans occurrence est signalée, jamais silencieuse", () => {
    const bilan = bilanDesAvertissements([
      'strict mode: required property "a" is not defined at "urn:x#/then" (strictRequired)',
    ]);
    expect(bilan.sansOccurrence).toContain("strictTuples");
    expect(bilan.sansOccurrence).not.toContain("strictRequired");
  });

  it("les vrais schémas : aucun avertissement hors table, aucune catégorie admise sans occurrence", () => {
    const registre = construireRegistre(racineSchema);
    for (const nom of NOMS_SCHEMAS) registre.ajv.getSchema(urnSchema(nom));
    const bilan = bilanDesAvertissements(registre.avertissementsStrict);
    expect(bilan.total).toBeGreaterThan(0);
    expect(bilan.sansOccurrence).toEqual([]);
    expect([...bilan.comptes.keys()]).toEqual(CATEGORIES_ADMISES.map((categorie) => categorie.code));
  });
});
