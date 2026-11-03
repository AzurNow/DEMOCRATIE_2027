/**
 * D72 (1), §8 recalcul (b) : `run.json#/contestations_posterieures` reçoit, en ajout seul, chaque
 * contestation reçue strictement après le gel d'un run publié
 * (`pipeline/run/contestations-posterieures.ts`, `pnpm contestations-posterieures`). Les runs de
 * fixture sont rangés sous un `runs/` temporaire, jamais sous celui du projet.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ContestationPosterieure } from "../../analysis/types.ts";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import {
  ContestationPosterieureDivergente,
  contestationsAAjouter,
  contestationsRecues,
  synchroniserContestationsPosterieures,
  type RunEtSesContestations,
} from "../../pipeline/run/contestations-posterieures.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { creerItem } from "../../validation/io/data-items.ts";
import { contestationRecue, itemConteste, itemPromu } from "../aides/data.ts";
import { commiterTout, executerOutil, initialiserDepot } from "../aides/depot.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../../schema/exemples/run");
/** `date_gel` de `valide-01` : 2026-12-01T06:00:00+01:00, soit 05:00:00Z. */
const GEL = "2026-12-01T06:00:00+01:00";
/** L'entrée que `valide-01` porte déjà. */
const PRESENTE: ContestationPosterieure = { item_id: "2MKBWSFAX0BQD36HSYE7WVJZS6", contestation_id: "PFHW0PWQ9VE2N6738D4VKSE3TM", date_reception: "2026-12-02T15:20:00+01:00" };

function contestation(numero: number, date_reception: string): ContestationPosterieure {
  return { item_id: `01JBANCESSA1000000000TEM${numero}`, contestation_id: `01JBANCESSA1C0NTESTAT10N${numero}`, date_reception };
}

const APRES = contestation(11, "2026-12-03T10:00:00+01:00");
const AVANT = contestation(12, "2026-11-30T10:00:00+01:00");

function run(statut: RunEtSesContestations["statut"], contestations_posterieures?: readonly ContestationPosterieure[]): RunEtSesContestations {
  return { id: "01JBANCESSA1RXN00000000001", date_gel: GEL, statut, ...(contestations_posterieures === undefined ? {} : { contestations_posterieures }) };
}

describe("contestationsAAjouter (D72 (1))", () => {
  it("reçue après le gel d'un run publié ⇒ ajoutée, publie_provisoire compris", () => {
    expect(contestationsAAjouter(run("publie"), [APRES])).toEqual([APRES]);
    expect(contestationsAAjouter(run("publie_provisoire"), [APRES])).toEqual([APRES]);
  });

  it("reçue avant le gel ⇒ non ajoutée", () => {
    expect(contestationsAAjouter(run("publie"), [AVANT])).toEqual([]);
  });

  it("run non publié (planifie, en_cours, invalide) ⇒ non ajoutée", () => {
    for (const statut of ["planifie", "en_cours", "invalide"] as const) expect(contestationsAAjouter(run(statut), [APRES])).toEqual([]);
  });

  it("reçue exactement à l'instant du gel ⇒ non ajoutée : elle est du gel, pas postérieure ; une seconde après ⇒ ajoutée", () => {
    expect(contestationsAAjouter(run("publie"), [contestation(13, GEL)])).toEqual([]);
    // Le même instant écrit dans un autre décalage : la comparaison porte sur l'instant, pas la chaîne.
    expect(contestationsAAjouter(run("publie"), [contestation(13, "2026-12-01T05:00:00Z")])).toEqual([]);
    const uneSecondeApres = contestation(14, "2026-12-01T06:00:01+01:00");
    expect(contestationsAAjouter(run("publie"), [uneSecondeApres])).toEqual([uneSecondeApres]);
  });

  it("même contestation ajoutée deux fois ⇒ une seule entrée", () => {
    expect(contestationsAAjouter(run("publie"), [APRES, APRES])).toEqual([APRES]);
    expect(contestationsAAjouter(run("publie", [APRES]), [APRES])).toEqual([]);
  });

  it("entrée existante jamais réécrite : une contestation de même identifiant qui en diffère est refusée", () => {
    const autreDate = { ...APRES, date_reception: "2026-12-04T10:00:00+01:00" };
    const autreItem = { ...APRES, item_id: "01JBANCESSA1000000000TEM99" };
    for (const divergente of [autreDate, autreItem]) {
      expect(() => contestationsAAjouter(run("publie", [APRES]), [divergente])).toThrow(ContestationPosterieureDivergente);
    }
    expect(() => contestationsAAjouter(run("publie"), [APRES, autreDate])).toThrow(ContestationPosterieureDivergente);
  });

  it("les ajouts sont rangés par instant de réception puis par identifiant", () => {
    const tot = contestation(15, "2026-12-02T08:00:00+01:00");
    const memeInstant = contestation(16, "2026-12-02T07:00:00Z");
    expect(contestationsAAjouter(run("publie"), [APRES, memeInstant, tot])).toEqual([tot, memeInstant, APRES]);
  });

  it("contestationsRecues : une entrée par contestation d'item, item sans contestation ignoré", () => {
    const sans = itemPromu({ id: "01JBANCESSA1000000000TEM21" });
    const avec = itemConteste(itemPromu({ id: "01JBANCESSA1000000000TEM22" }));
    const recue = contestationRecue();
    expect(contestationsRecues([sans, avec])).toEqual([{ item_id: avec.id, contestation_id: recue.id, date_reception: recue.date_reception }]);
  });
});

/* ------------------------------------------------------------ lecture et écriture */

const temporaires: string[] = [];

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function exemple(): Objet {
  return JSON.parse(readFileSync(join(EXEMPLES, "valide-01-mensuel-publie.json"), "utf8")) as Objet;
}

/** `valide-01` ramené au statut `en_cours` : sans go/no-go, publication ni dépôt. */
function enCours(): Objet {
  const brut = exemple();
  for (const cle of ["go_no_go", "publication", "depot", "indeterminees_echantillon_humain", "non_classees_echantillon_humain", "renvois_attribution_indecidable", "refus_api_echantillon_humain", "contestations_posterieures"]) delete brut[cle];
  return { ...brut, statut: "en_cours" };
}

function poser(runs: string, date: string, brut: Objet): string {
  const repertoire = join(runs, date);
  mkdirSync(repertoire, { recursive: true });
  expect(erreurDeSchema("run", brut, "fixture")).toBeNull();
  writeFileSync(join(repertoire, "run.json"), `${JSON.stringify(brut, null, 2)}\n`, "utf8");
  return repertoire;
}

function texteRun(repertoire: string): string {
  return readFileSync(join(repertoire, "run.json"), "utf8");
}

function listeDe(repertoire: string): unknown {
  return (JSON.parse(texteRun(repertoire)) as Objet)["contestations_posterieures"];
}

/** Un item contesté, reçu à `date_reception`. */
function itemContesteLe(numero: number, date_reception: string): Item {
  const item = itemConteste(itemPromu({ id: `01JBANCESSA1000000000TEM${numero}` }));
  return { ...item, contestations: [{ ...contestationRecue(`01JBANCESSA1C0NTESTAT10N${numero}`), date_reception }] };
}

/**
 * Trois runs : `valide-01` publié (gel 2026-12-01, porte déjà `PRESENTE`), un second publié gelé le
 * 2026-12-08, un troisième en cours gelé le 2026-12-15.
 */
function troisRuns(racine: string): { readonly premier: string; readonly second: string; readonly troisieme: string } {
  const runs = join(racine, "runs");
  const premier = poser(runs, "2026-12-01", exemple());
  const { contestations_posterieures: _presentes, ...sansListe } = exemple();
  const second = poser(runs, "2026-12-08", { ...sansListe, id: "01JBANCESSA1RXN00000000002", date_gel: "2026-12-08T06:00:00+01:00" });
  const troisieme = poser(runs, "2026-12-15", { ...enCours(), id: "01JBANCESSA1RXN00000000003", date_gel: "2026-12-15T06:00:00+01:00" });
  return { premier, second, troisieme };
}

function racineTemporaire(): string {
  const racine = mkdtempSync(join(tmpdir(), "banc-contestations-posterieures-"));
  temporaires.push(racine);
  return racine;
}

describe("synchroniserContestationsPosterieures (D72 (1))", () => {
  it("deux runs publiés antérieurs ⇒ ajoutée aux deux ; le run en cours ne reçoit rien", () => {
    const racine = racineTemporaire();
    const { premier, second, troisieme } = troisRuns(racine);
    const avantTroisieme = texteRun(troisieme);
    const item = itemContesteLe(31, "2026-12-10T09:00:00+01:00");
    const ajouts = synchroniserContestationsPosterieures(join(racine, "runs"), [item], true);
    const entree = { item_id: item.id, contestation_id: "01JBANCESSA1C0NTESTAT10N31", date_reception: "2026-12-10T09:00:00+01:00" };
    expect(ajouts.map((ajout) => ajout.repertoire)).toEqual([premier, second]);
    expect(listeDe(premier)).toEqual([PRESENTE, entree]);
    expect(listeDe(second)).toEqual([entree]);
    expect(texteRun(troisieme)).toBe(avantTroisieme);
    for (const repertoire of [premier, second]) expect(erreurDeSchema("run", JSON.parse(texteRun(repertoire)), repertoire)).toBeNull();
  });

  it("reçue entre deux gels ⇒ ajoutée au seul run gelé avant elle", () => {
    const racine = racineTemporaire();
    const { premier, second } = troisRuns(racine);
    const avantSecond = texteRun(second);
    synchroniserContestationsPosterieures(join(racine, "runs"), [itemContesteLe(32, "2026-12-05T09:00:00+01:00")], true);
    expect(listeDe(premier)).toHaveLength(2);
    expect(texteRun(second)).toBe(avantSecond);
  });

  it("entrée existante jamais réécrite : relancer n'ajoute rien, et une divergence n'écrit rien nulle part", () => {
    const racine = racineTemporaire();
    const { premier, second } = troisRuns(racine);
    const item = itemContesteLe(33, "2026-12-10T09:00:00+01:00");
    synchroniserContestationsPosterieures(join(racine, "runs"), [item], true);
    const apres = [texteRun(premier), texteRun(second)];
    expect(synchroniserContestationsPosterieures(join(racine, "runs"), [item], true)).toEqual([]);
    expect([texteRun(premier), texteRun(second)]).toEqual(apres);
    const divergent = itemContesteLe(33, "2026-12-11T09:00:00+01:00");
    expect(() => synchroniserContestationsPosterieures(join(racine, "runs"), [divergent], true)).toThrow(ContestationPosterieureDivergente);
    expect([texteRun(premier), texteRun(second)]).toEqual(apres);
  });

  it("sans écrire : le résultat dit l'ajout, aucun fichier ne change", () => {
    const racine = racineTemporaire();
    const { premier } = troisRuns(racine);
    const avant = texteRun(premier);
    const ajouts = synchroniserContestationsPosterieures(join(racine, "runs"), [itemContesteLe(34, "2026-12-03T09:00:00+01:00")], false);
    expect(ajouts).toHaveLength(1);
    expect(texteRun(premier)).toBe(avant);
  });
});

describe("pnpm contestations-posterieures", () => {
  it("simule par défaut, écrit avec --ecrire sur un arbre propre, puis n'ajoute plus rien", () => {
    const racine = racineTemporaire();
    const { premier } = troisRuns(racine);
    const item = itemContesteLe(35, "2026-12-03T09:00:00+01:00");
    creerItem(join(racine, "data/items"), item);
    initialiserDepot(racine);
    const options = [`--racine=${racine}`];
    const avant = texteRun(premier);

    const simulation = executerOutil("contestations-posterieures.ts", options);
    expect(simulation.status, simulation.erreur).toBe(0);
    expect(simulation.sortie).toMatch(/Simulation/);
    expect(texteRun(premier)).toBe(avant);

    const ecriture = executerOutil("contestations-posterieures.ts", [...options, "--ecrire"]);
    expect(ecriture.status, ecriture.erreur).toBe(0);
    // Reçue le 3 décembre : après le gel du 1er, avant celui du 8 ; seul le premier run change.
    expect(ecriture.sortie).toMatch(/git add runs\/2026-12-01\/run\.json\n/);
    expect(listeDe(premier)).toEqual([PRESENTE, { item_id: item.id, contestation_id: "01JBANCESSA1C0NTESTAT10N35", date_reception: "2026-12-03T09:00:00+01:00" }]);

    const sale = executerOutil("contestations-posterieures.ts", [...options, "--ecrire"]);
    expect(sale.status).toBe(1);
    commiterTout(racine, "contestations postérieures");
    const relance = executerOutil("contestations-posterieures.ts", [...options, "--ecrire"]);
    expect(relance.status, relance.erreur).toBe(0);
    expect(relance.sortie).toMatch(/Aucune contestation postérieure à ajouter/);
  });
});
