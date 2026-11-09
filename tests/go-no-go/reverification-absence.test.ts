/**
 * `runs/<date>/reverification-absence.json` sur disque (`pipeline/go-no-go/reverification-absence.ts`) :
 * la lecture du go/no-go dit un fichier absent ou non conforme sans s'arrêter ; celle de la commande
 * lève ; l'écriture valide avant d'écrire.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import {
  cheminReverificationAbsence,
  ecrireReverificationAbsence,
  lireReverificationAbsence,
  lireReverificationExistante,
  ReverificationEnDouble,
} from "../../pipeline/go-no-go/reverification-absence.ts";
import type { FichierReverification } from "../../validation/domaine/reverification-absence.ts";

const RUN_ID = "W5ZT1TXQV92JTWYQPS5WCF9YAN";
const REFERENCE = { item_id: "01JBANCESSA1000000001TEM02", item_version: 1, item_empreinte: "9".repeat(64) };
const FICHIER: FichierReverification = { run_id: RUN_ID, items: [{ reference: REFERENCE }] };

const repertoires: string[] = [];
afterEach(() => {
  for (const repertoire of repertoires.splice(0)) rmSync(repertoire, { recursive: true, force: true });
});

function repertoireRun(): string {
  const repertoire = mkdtempSync(join(tmpdir(), "banc-reverification-"));
  repertoires.push(repertoire);
  return repertoire;
}

function poser(repertoire: string, texte: string): void {
  writeFileSync(cheminReverificationAbsence(repertoire), texte, "utf8");
}

describe("lecture pour la checklist (cas limite 6)", () => {
  it("fichier absent : statut absent, rien n'est levé", () => {
    expect(lireReverificationAbsence(repertoireRun())).toEqual({ statut: "absent" });
  });

  it("JSON illisible : non conforme, avec le détail", () => {
    const repertoire = repertoireRun();
    poser(repertoire, "{ pas du json");
    expect(lireReverificationAbsence(repertoire)).toMatchObject({ statut: "non_conforme", detail: expect.stringContaining("JSON illisible") });
  });

  it("non conforme au schéma : non conforme, avec le détail", () => {
    const repertoire = repertoireRun();
    poser(repertoire, JSON.stringify({ run_id: RUN_ID }));
    expect(lireReverificationAbsence(repertoire)).toMatchObject({ statut: "non_conforme", detail: expect.stringContaining("reverification-absence") });
  });

  it("un item présent deux fois : non conforme (contrôle de code, hors de portée du schéma)", () => {
    const repertoire = repertoireRun();
    poser(repertoire, JSON.stringify({ run_id: RUN_ID, items: [{ reference: REFERENCE }, { reference: REFERENCE }] }));
    expect(lireReverificationAbsence(repertoire)).toMatchObject({ statut: "non_conforme", detail: expect.stringContaining("deux fois") });
  });

  it("conforme : lu tel quel", () => {
    const repertoire = repertoireRun();
    poser(repertoire, JSON.stringify(FICHIER));
    expect(lireReverificationAbsence(repertoire)).toEqual({ statut: "lu", fichier: FICHIER });
  });
});

describe("lecture et écriture par la commande", () => {
  it("absent : null ; non conforme : lève, la commande n'écrit pas par-dessus", () => {
    const repertoire = repertoireRun();
    expect(lireReverificationExistante(repertoire)).toBeNull();
    poser(repertoire, JSON.stringify({ run_id: RUN_ID }));
    expect(() => lireReverificationExistante(repertoire)).toThrow(ErreurSchema);
  });

  it("écrit un fichier conforme, relu à l'identique", () => {
    const repertoire = repertoireRun();
    ecrireReverificationAbsence(repertoire, FICHIER);
    expect(lireReverificationExistante(repertoire)).toEqual(FICHIER);
  });

  it("refuse d'écrire un fichier non conforme ou à doublon, et n'écrit rien", () => {
    const repertoire = repertoireRun();
    expect(() => ecrireReverificationAbsence(repertoire, { run_id: "pas-un-ulid", items: [] })).toThrow(ErreurSchema);
    expect(() => ecrireReverificationAbsence(repertoire, { run_id: RUN_ID, items: [{ reference: REFERENCE }, { reference: REFERENCE }] })).toThrow(ReverificationEnDouble);
    expect(existsSync(cheminReverificationAbsence(repertoire))).toBe(false);
  });
});
