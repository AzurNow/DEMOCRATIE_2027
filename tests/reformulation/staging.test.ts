/**
 * `staging/formulations/` : écriture validée, atomique, jamais réécrite ; relecture validée, qui
 * refuse un fichier étranger, mal nommé ou rangé sous une autre question.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import {
  ecrireProposition,
  lirePropositions,
  PropositionDejaEcrite,
  StagingFormulationsIllisible,
} from "../../pipeline/reformulation/staging.ts";
import type { PropositionFormulation } from "../../pipeline/reformulation/staging.ts";

const EXEMPLE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../schema/exemples/proposition-formulation/valide-01-acceptee.json"), "utf8"),
) as PropositionFormulation;

const repertoires: string[] = [];
function staging(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-staging-formulations-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

describe("écriture d'une proposition", () => {
  it("écrit <question_id>/<id>.json, relu à l'identique, sans temporaire laissé", () => {
    const racine = staging();
    ecrireProposition(racine, EXEMPLE);
    expect(readdirSync(join(racine, EXEMPLE.question_id))).toEqual([`${EXEMPLE.id}.json`]);
    expect(lirePropositions(racine, EXEMPLE.question_id)).toEqual([EXEMPLE]);
  });

  it("un fichier existant n'est jamais écrasé", () => {
    const racine = staging();
    ecrireProposition(racine, EXEMPLE);
    const avant = readFileSync(join(racine, EXEMPLE.question_id, `${EXEMPLE.id}.json`), "utf8");
    expect(() => ecrireProposition(racine, { ...EXEMPLE, issue: { statut: "echec_http" } })).toThrow(PropositionDejaEcrite);
    expect(readFileSync(join(racine, EXEMPLE.question_id, `${EXEMPLE.id}.json`), "utf8")).toBe(avant);
    expect(readdirSync(join(racine, EXEMPLE.question_id))).toEqual([`${EXEMPLE.id}.json`]);
  });

  it("un objet non conforme au schéma ⇒ ErreurSchema, rien d'écrit", () => {
    const racine = staging();
    const fautive = { ...EXEMPLE, appel: { ...EXEMPLE.appel, brut_texte: "x" } } as PropositionFormulation;
    expect(() => ecrireProposition(racine, fautive)).toThrow(ErreurSchema);
    expect(readdirSync(racine)).toEqual([]);
  });
});

describe("relecture des propositions", () => {
  it("répertoire absent ⇒ aucune proposition", () => {
    expect(lirePropositions(staging(), EXEMPLE.question_id)).toEqual([]);
  });

  it("fichier étranger ⇒ StagingFormulationsIllisible", () => {
    const racine = staging();
    mkdirSync(join(racine, EXEMPLE.question_id));
    writeFileSync(join(racine, EXEMPLE.question_id, "notes.txt"), "x");
    expect(() => lirePropositions(racine, EXEMPLE.question_id)).toThrow(StagingFormulationsIllisible);
  });

  it("fichier dont le nom n'est pas l'id ⇒ StagingFormulationsIllisible", () => {
    const racine = staging();
    mkdirSync(join(racine, EXEMPLE.question_id));
    writeFileSync(join(racine, EXEMPLE.question_id, "01JA0000000000000000000009.json"), JSON.stringify(EXEMPLE));
    expect(() => lirePropositions(racine, EXEMPLE.question_id)).toThrow(/pas celui de son nom/u);
  });

  it("proposition rangée sous une autre question ⇒ StagingFormulationsIllisible", () => {
    const racine = staging();
    const autre = "q_ffffffffffffffffffffffffffffffff";
    mkdirSync(join(racine, autre));
    writeFileSync(join(racine, autre, `${EXEMPLE.id}.json`), JSON.stringify(EXEMPLE));
    expect(() => lirePropositions(racine, autre)).toThrow(/pas celle de son répertoire/u);
  });

  it("fichier non conforme ⇒ ErreurSchema ; JSON illisible ⇒ StagingFormulationsIllisible", () => {
    const racine = staging();
    mkdirSync(join(racine, EXEMPLE.question_id));
    const chemin = join(racine, EXEMPLE.question_id, `${EXEMPLE.id}.json`);
    writeFileSync(chemin, "{}");
    expect(() => lirePropositions(racine, EXEMPLE.question_id)).toThrow(ErreurSchema);
    writeFileSync(chemin, "{");
    expect(() => lirePropositions(racine, EXEMPLE.question_id)).toThrow(StagingFormulationsIllisible);
  });

  it("D54 (8), constat 23 : .DS_Store est ignoré, les propositions valides à côté sont lues", () => {
    const racine = staging();
    ecrireProposition(racine, EXEMPLE);
    writeFileSync(join(racine, EXEMPLE.question_id, ".DS_Store"), "appelé par le Finder", "utf8");
    expect(lirePropositions(racine, EXEMPLE.question_id)).toEqual([EXEMPLE]);
  });

  it("D54 (8), constat 23 : liste fermée — un .tmp ou tout autre fichier parasite reste un refus nommé", () => {
    const racine = staging();
    mkdirSync(join(racine, EXEMPLE.question_id));
    writeFileSync(join(racine, EXEMPLE.question_id, ".tmp"), "x", "utf8");
    expect(() => lirePropositions(racine, EXEMPLE.question_id)).toThrow(StagingFormulationsIllisible);
    expect(() => lirePropositions(racine, EXEMPLE.question_id)).toThrow(/\.tmp/u);
  });
});
