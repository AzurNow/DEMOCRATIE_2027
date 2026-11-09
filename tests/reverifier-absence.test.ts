/**
 * `pnpm reverifier-absence`, de bout en bout dans des dépôts Git jetables (§4, protocole 0.24,
 * D59 (11) ; annexe F, case 2) : jamais le vrai `data/` ni le vrai `runs/`. Le run et le tirage
 * partent des exemples valides de `schema/exemples/`, le tirage réduit aux items du bac.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { constatItemsAbsenceReverifies } from "../pipeline/go-no-go/checklist.ts";
import { cheminReverificationAbsence, lireReverificationAbsence } from "../pipeline/go-no-go/reverification-absence.ts";
import type { FichierReverification } from "../validation/domaine/reverification-absence.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerItem } from "../validation/io/data-items.ts";
import { itemPromu } from "./aides/data.ts";
import { commiterTout, executerOutil, initialiserDepot, RACINE_PROJET, type Execution } from "./aides/depot.ts";
import { itemA } from "./aides/fabriques.ts";

const RUN_ID = "W5ZT1TXQV92JTWYQPS5WCF9YAN";
const DATE_RUN = "2026-12-01";
const SANS_NOUVELLE = itemA({ id: "01JBANCESSA1000000001TEM02", candidat_id: "demo-alpha" });
const AVEC_NOUVELLE = itemA({ id: "01JBANCESSA1000000001TEM05", candidat_id: "demo-beta" });
const POSITION = itemPromu({ id: "01JBANCESSA1000000001TEM01", candidat_id: "demo-alpha" });
const SOURCE_NOUVELLE = "5".repeat(64);

function exemple(chemin: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples", chemin), "utf8")) as Record<string, unknown>;
}

function ecrireJson(chemin: string, valeur: unknown): void {
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

/** Une entrée du tirage par item épinglé, copiée de la première entrée de l'exemple valide. */
function entreeTirage(modele: Record<string, unknown>, item: Item, rang: number): Record<string, unknown> {
  const [itemAuGel] = modele["items_au_gel"] as Record<string, unknown>[];
  return {
    ...modele,
    question_id: `q_${String(rang).padStart(32, "0")}`,
    grappe_id: item.id,
    items_au_gel: [{ ...itemAuGel, reference: { item_id: item.id, item_version: 1, item_empreinte: item.empreinte } }],
  };
}

function fiche(candidat_id: string, sha256: string, date_collecte: string): Record<string, unknown> {
  return { ...exemple("fiche-source/valide-01-programme-pdf.json"), candidat_id, sha256, date_collecte };
}

interface Banc {
  readonly racine: string;
  readonly run: string;
  readonly lancer: (arguments_: readonly string[], annotateur?: string) => Execution;
  readonly lireItem: (item: Item) => Item;
  readonly lireFichier: () => FichierReverification;
  readonly commiter: () => void;
}

const bancs: string[] = [];
afterAll(() => {
  for (const racine of bancs) rmSync(racine, { recursive: true, force: true });
});

/** `dansData` : les items tels que `data/items` les porte ; `auTirage` : ceux que le tirage épingle (en version 1). */
function preparer(dansData: readonly Item[], auTirage: readonly Item[]): Banc {
  const racine = mkdtempSync(join(tmpdir(), "banc-reverifier-"));
  bancs.push(racine);
  const run = join(racine, "runs", DATE_RUN);
  const tirage = exemple("tirage/valide-01-tirage-nominal.json");
  const [modele] = tirage["entrees"] as Record<string, unknown>[];
  const texteTirage = `${JSON.stringify({ ...tirage, entrees: auTirage.map((item, rang) => entreeTirage(modele as Record<string, unknown>, item, rang)) }, null, 2)}\n`;
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "tirage.json"), texteTirage, "utf8");
  const runJson = exemple("run/valide-01-mensuel-publie.json");
  const sha256 = createHash("sha256").update(texteTirage).digest("hex");
  ecrireJson(join(run, "run.json"), { ...runJson, tirage: { ...(runJson["tirage"] as Record<string, unknown>), sha256 } });
  for (const item of dansData) creerItem(join(racine, "data/items"), item);
  const fiches = join(racine, "staging/sources/par-source");
  ecrireJson(join(fiches, "a".repeat(64), `${SOURCE_NOUVELLE}.json`), fiche("demo-beta", SOURCE_NOUVELLE, "2026-11-15T10:00:00+01:00"));
  ecrireJson(join(fiches, "b".repeat(64), `${"6".repeat(64)}.json`), fiche("demo-alpha", "6".repeat(64), "2026-09-01T10:00:00+02:00"));
  initialiserDepot(racine);
  return {
    racine,
    run,
    lancer: (arguments_, annotateur = "a1") => {
      const { ANNOTATEUR_ID: _ignore, ...sans } = process.env;
      const env: NodeJS.ProcessEnv = annotateur.length === 0 ? sans : { ...sans, ANNOTATEUR_ID: annotateur };
      return executerOutil("reverifier-absence.ts", [run, `--racine=${racine}`, ...arguments_], env);
    },
    lireItem: (item) => JSON.parse(readFileSync(join(racine, "data/items", `${item.id}.json`), "utf8")) as Item,
    lireFichier: () => JSON.parse(readFileSync(cheminReverificationAbsence(run), "utf8")) as FichierReverification,
    commiter: () => commiterTout(racine, "revérification"),
  };
}

function constatDu(banc: Banc) {
  return constatItemsAbsenceReverifies(lireReverificationAbsence(banc.run), RUN_ID);
}

const TEMPS = 120_000;

describe("pnpm reverifier-absence : refus (cas limite 7)", () => {
  const banc = preparer([SANS_NOUVELLE, POSITION], [SANS_NOUVELLE, POSITION]);

  it(
    "sans ANNOTATEUR_ID, refus, code 1, rien n'est écrit",
    () => {
      const sortie = banc.lancer(["--confirmer-sans-nouvelle-source", "--ecrire"], "");
      expect(sortie.status).toBe(1);
      expect(sortie.erreur).toMatch(/ANNOTATEUR_ID n'est pas défini/);
      expect(existsSync(cheminReverificationAbsence(banc.run))).toBe(false);
    },
    TEMPS,
  );

  it(
    "ANNOTATEUR_ID qui n'est pas un pseudonyme : refus",
    () => {
      const sortie = banc.lancer([], "Jean Dupont");
      expect(sortie.status).toBe(1);
      expect(sortie.erreur).toMatch(/ANNOTATEUR_ID/);
    },
    TEMPS,
  );

  it(
    "--ecrire sur un arbre Git sale : refus, code 1, rien n'est écrit",
    () => {
      const parasite = join(banc.racine, "parasite.txt");
      writeFileSync(parasite, "modification non commitée\n", "utf8");
      const sortie = banc.lancer(["--confirmer-sans-nouvelle-source", "--ecrire"]);
      rmSync(parasite);
      expect(sortie.status).toBe(1);
      expect(sortie.erreur).toMatch(/Arbre Git non propre/);
      expect(existsSync(cheminReverificationAbsence(banc.run))).toBe(false);
      expect(banc.lireItem(SANS_NOUVELLE).absence?.reverifications).toEqual([]);
    },
    TEMPS,
  );

  it(
    "--confirmer sans identifiant, ou un item hors du tirage : refus",
    () => {
      expect(banc.lancer(["--confirmer"]).status).toBe(1);
      const horsTirage = banc.lancer([`--confirmer=${POSITION.id}`, "--ecrire"]);
      expect(horsTirage.status).toBe(1);
      expect(horsTirage.erreur).toMatch(/n'est pas un item A du tirage/);
      expect(existsSync(cheminReverificationAbsence(banc.run))).toBe(false);
    },
    TEMPS,
  );
});

describe("pnpm reverifier-absence : confirmation, ajout seul, idempotence", () => {
  const banc = preparer([SANS_NOUVELLE, AVEC_NOUVELLE, POSITION], [SANS_NOUVELLE, AVEC_NOUVELLE, POSITION]);

  it(
    "simulation : expose les nouvelles sources T1, n'écrit rien",
    () => {
      const sortie = banc.lancer(["--confirmer-sans-nouvelle-source"]);
      expect(sortie.status, sortie.erreur).toBe(0);
      expect(sortie.sortie).toContain("2 item(s) A au tirage");
      expect(sortie.sortie).toContain(`${SANS_NOUVELLE.id} (version 1) : aucune nouvelle source T1`);
      expect(sortie.sortie).toContain(`${AVEC_NOUVELLE.id} (version 1) : 1 nouvelle(s) source(s) T1 à examiner`);
      expect(sortie.sortie).toContain(SOURCE_NOUVELLE);
      expect(sortie.sortie).toContain("Simulation : rien n'a été écrit");
      expect(existsSync(cheminReverificationAbsence(banc.run))).toBe(false);
    },
    TEMPS,
  );

  it(
    "cas limites 2 et 3 : le geste groupé confirme l'item sans nouvelle source ; l'autre reste en attente, la case non faite",
    () => {
      const sortie = banc.lancer(["--confirmer-sans-nouvelle-source", "--ecrire"]);
      // Commité avant toute assertion : un échec ici ne laisse pas un arbre sale aux tests suivants.
      banc.commiter();
      expect(sortie.status, sortie.erreur).toBe(0);
      const fichier = banc.lireFichier();
      expect(fichier.items.map((entree) => [entree.reference.item_id, entree.confirmation?.confirme_par])).toEqual([
        [SANS_NOUVELLE.id, "a1"],
        [AVEC_NOUVELLE.id, undefined],
      ]);
      expect(banc.lireItem(SANS_NOUVELLE).absence?.reverifications).toMatchObject([{ run_id: RUN_ID, resultat: "absence_confirmee", confirme_par: "a1" }]);
      expect(banc.lireItem(SANS_NOUVELLE).historique).toHaveLength((SANS_NOUVELLE.historique ?? []).length + 1);
      expect(banc.lireItem(AVEC_NOUVELLE)).toEqual(AVEC_NOUVELLE);
      expect(constatDu(banc)).toMatchObject({ fait: false, detail: expect.stringContaining(AVEC_NOUVELLE.id) });
    },
    TEMPS,
  );

  it(
    "cas limite 3 : nommé par l'annotateur après examen, l'item est confirmé avec la source examinée ; la case est faite",
    () => {
      const sortie = banc.lancer([`--confirmer=${AVEC_NOUVELLE.id}`, "--ecrire"], "a2");
      banc.commiter();
      expect(sortie.status, sortie.erreur).toBe(0);
      const [, entree] = banc.lireFichier().items;
      expect(entree?.confirmation).toMatchObject({ confirme_par: "a2", item_version: 1, nouvelles_sources_t1: [SOURCE_NOUVELLE] });
      expect(banc.lireItem(AVEC_NOUVELLE).absence?.reverifications).toMatchObject([{ run_id: RUN_ID, confirme_par: "a2" }]);
      expect(constatDu(banc)).toEqual({ nom: "items_absence_reverifies", fait: true, detail: "" });
    },
    TEMPS,
  );

  it(
    "cas limite 4 : relancée sur des items déjà revérifiés pour ce run, aucune seconde revérification, aucun octet changé",
    () => {
      const avant = [readFileSync(cheminReverificationAbsence(banc.run)), banc.lireItem(SANS_NOUVELLE), banc.lireItem(AVEC_NOUVELLE)];
      const sortie = banc.lancer([`--confirmer=${SANS_NOUVELLE.id}`, `--confirmer=${AVEC_NOUVELLE.id}`, "--confirmer-sans-nouvelle-source", "--ecrire"]);
      expect(sortie.status, sortie.erreur).toBe(0);
      expect(sortie.sortie).toContain("0 confirmation(s) nouvelle(s), 0 item(s) à réécrire");
      expect([readFileSync(cheminReverificationAbsence(banc.run)), banc.lireItem(SANS_NOUVELLE), banc.lireItem(AVEC_NOUVELLE)]).toEqual(avant);
      expect(banc.lireItem(SANS_NOUVELLE).absence?.reverifications).toHaveLength(1);
    },
    TEMPS,
  );
});

describe("pnpm reverifier-absence : cas limites 1 et 5", () => {
  it(
    "cas limite 1 : aucun item A au tirage, le fichier constate une liste vide et la case est faite",
    () => {
      const banc = preparer([POSITION], [POSITION]);
      const sortie = banc.lancer(["--ecrire"]);
      expect(sortie.status, sortie.erreur).toBe(0);
      expect(banc.lireFichier()).toEqual({ run_id: RUN_ID, items: [] });
      expect(constatDu(banc).fait).toBe(true);
    },
    TEMPS,
  );

  it(
    "cas limite 5 : un item modifié depuis le gel n'est pas confirmable ; il reste en attente, la case non faite",
    () => {
      const modifie = { ...SANS_NOUVELLE, version: 2, historique: [...(SANS_NOUVELLE.historique ?? []), { date: "2026-12-01T08:00:00+01:00", changement: "nouvelle version de la mesure", commit: "c".repeat(40), version_resultante: 2 }] };
      const banc = preparer([modifie], [SANS_NOUVELLE]);
      const nomme = banc.lancer([`--confirmer=${SANS_NOUVELLE.id}`, "--ecrire"]);
      expect(nomme.status).toBe(1);
      expect(nomme.erreur).toMatch(/en version 2 dans data\/items, le tirage épingle la version 1/);
      const groupe = banc.lancer(["--confirmer-sans-nouvelle-source", "--ecrire"]);
      expect(groupe.status, groupe.erreur).toBe(0);
      expect(groupe.sortie).toContain("modifié depuis le gel (version 2), non confirmable");
      expect(banc.lireFichier().items).toEqual([{ reference: { item_id: SANS_NOUVELLE.id, item_version: 1, item_empreinte: SANS_NOUVELLE.empreinte } }]);
      expect(banc.lireItem(modifie).absence?.reverifications).toEqual([]);
      expect(constatDu(banc).fait).toBe(false);
    },
    TEMPS,
  );
});
