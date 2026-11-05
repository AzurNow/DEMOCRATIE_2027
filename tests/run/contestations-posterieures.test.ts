/**
 * D72 (1), D73 (2) et (4), §8 recalcul (b) : `run.json#/contestations_posterieures` reçoit, en ajout
 * seul, chaque contestation que ne porte pas le commit des données inscrit au gel
 * (`versions.donnees_commit`), quelle que soit sa date, dans tout run gelé non invalide
 * (`pipeline/run/contestations-posterieures.ts`, `pnpm contestations-posterieures`). Les runs et les
 * items de fixture sont rangés dans un dépôt Git temporaire, jamais dans celui du projet.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ContestationPosterieure } from "../../analysis/types.ts";
import { executerGit } from "../../outils/executer-git.ts";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import {
  cleDeContestation,
  ContestationPosterieureDivergente,
  ContestationsPosterieuresNonInscrites,
  contestationsAAjouter,
  contestationsAuCommit,
  contestationsRecues,
  DepotDesItemsRefuse,
  DepotDuRunIntrouvable,
  exigerContestationsInscrites,
  ItemsDuDepotAbsents,
  repertoireDesItemsDuRun,
  repertoireDesItemsPourLeRun,
  synchroniserContestationsPosterieures,
  type AjoutAuRun,
  type RunEtSesContestations,
} from "../../pipeline/run/contestations-posterieures.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { lireItemsData } from "../../validation/io/data-items.ts";
import { contestationRecue, itemConteste, itemPromu } from "../aides/data.ts";
import { commiterTout, executerOutil, head, initialiserDepot } from "../aides/depot.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../../schema/exemples/run");
/** `date_gel` de `valide-01` : 2026-12-01T06:00:00+01:00, soit 05:00:00Z. */
const GEL = "2026-12-01T06:00:00+01:00";
/** L'entrée que `valide-01` porte déjà. */
const PRESENTE: ContestationPosterieure = { item_id: "2MKBWSFAX0BQD36HSYE7WVJZS6", contestation_id: "PFHW0PWQ9VE2N6738D4VKSE3TM", date_reception: "2026-12-02T15:20:00+01:00" };

function contestation(numero: number, date_reception: string): ContestationPosterieure {
  return { item_id: `01JBANCESSA1000000000TEM${numero}`, contestation_id: `01JBANCESSA1C0NTESTAT10N${numero}`, date_reception };
}

function auGel(...contestations: readonly ContestationPosterieure[]): ReadonlySet<string> {
  return new Set(contestations.map((c) => cleDeContestation(c.item_id, c.contestation_id)));
}

const APRES = contestation(11, "2026-12-03T10:00:00+01:00");
const AVANT = contestation(12, "2026-11-30T10:00:00+01:00");
const AUCUNE = auGel();

function run(statut: RunEtSesContestations["statut"], contestations_posterieures?: readonly ContestationPosterieure[]): RunEtSesContestations {
  return { id: "01JBANCESSA1RXN00000000001", statut, ...(contestations_posterieures === undefined ? {} : { contestations_posterieures }) };
}

describe("contestationsAAjouter (D73 (2) et (4))", () => {
  it("absente du commit gelé, reçue après le gel ⇒ ajoutée", () => {
    expect(contestationsAAjouter(run("publie"), [APRES], AUCUNE)).toEqual([APRES]);
  });

  it("absente du commit gelé, reçue à l'instant exact du gel ⇒ postérieure, ajoutée", () => {
    const aLInstant = contestation(13, GEL);
    expect(contestationsAAjouter(run("publie"), [aLInstant], AUCUNE)).toEqual([aLInstant]);
    const memeInstantAutreDecalage = contestation(14, "2026-12-01T05:00:00Z");
    expect(contestationsAAjouter(run("publie"), [memeInstantAutreDecalage], AUCUNE)).toEqual([memeInstantAutreDecalage]);
  });

  it("absente du commit gelé, reçue avant le gel ⇒ postérieure, ajoutée", () => {
    expect(contestationsAAjouter(run("publie"), [AVANT], AUCUNE)).toEqual([AVANT]);
  });

  it("présente au commit gelé ⇒ jamais postérieure, quelle que soit sa date", () => {
    for (const portee of [AVANT, APRES, contestation(13, GEL)]) {
      expect(contestationsAAjouter(run("publie"), [portee], auGel(portee))).toEqual([]);
    }
  });

  it("la même contestation au commit, sous un autre item, ne vaut pas pour celui-ci", () => {
    const autreItem = { ...APRES, item_id: "01JBANCESSA1000000000TEM99" };
    expect(contestationsAAjouter(run("publie"), [APRES], auGel(autreItem))).toEqual([APRES]);
  });

  it("tout run gelé non invalide la reçoit : planifie, en_cours, publie, publie_provisoire", () => {
    for (const statut of ["planifie", "en_cours", "publie", "publie_provisoire"] as const) {
      expect(contestationsAAjouter(run(statut), [APRES], AUCUNE)).toEqual([APRES]);
    }
  });

  it("run invalide ⇒ rien", () => {
    expect(contestationsAAjouter(run("invalide"), [APRES, AVANT], AUCUNE)).toEqual([]);
  });

  it("même contestation ajoutée deux fois ⇒ une seule entrée", () => {
    expect(contestationsAAjouter(run("publie"), [APRES, APRES], AUCUNE)).toEqual([APRES]);
    expect(contestationsAAjouter(run("publie", [APRES]), [APRES], AUCUNE)).toEqual([]);
  });

  it("entrée existante jamais réécrite : une contestation de même identifiant qui en diffère est refusée", () => {
    const autreDate = { ...APRES, date_reception: "2026-12-04T10:00:00+01:00" };
    const autreItem = { ...APRES, item_id: "01JBANCESSA1000000000TEM99" };
    for (const divergente of [autreDate, autreItem]) {
      expect(() => contestationsAAjouter(run("publie", [APRES]), [divergente], AUCUNE)).toThrow(ContestationPosterieureDivergente);
    }
    expect(() => contestationsAAjouter(run("publie"), [APRES, autreDate], AUCUNE)).toThrow(ContestationPosterieureDivergente);
  });

  it("les ajouts sont rangés par instant de réception puis par identifiant", () => {
    const tot = contestation(15, "2026-12-02T08:00:00+01:00");
    const memeInstant = contestation(16, "2026-12-02T07:00:00Z");
    expect(contestationsAAjouter(run("publie"), [APRES, memeInstant, tot, AVANT], AUCUNE)).toEqual([AVANT, tot, memeInstant, APRES]);
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

function exemple(nom = "valide-01-mensuel-publie.json"): Objet {
  return JSON.parse(readFileSync(join(EXEMPLES, nom), "utf8")) as Objet;
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

type Contestations = NonNullable<Item["contestations"]>;

/** `item` avec une contestation de plus, reçue à `date_reception` (statut et historique par `itemConteste`). */
function contesteLe(item: Item, numero: number, date_reception: string): Item {
  const conteste = itemConteste(item);
  const anterieures = (conteste.contestations as Contestations).slice(0, -1);
  return { ...conteste, contestations: [...anterieures, { ...contestationRecue(`01JBANCESSA1C0NTESTAT10N${numero}`), date_reception }] };
}

function poserItem(data: string, item: Item): void {
  mkdirSync(data, { recursive: true });
  expect(erreurDeSchema("item", item, "fixture")).toBeNull();
  writeFileSync(join(data, `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`, "utf8");
}

/** L'entrée de la contestation `numero`, portée par l'item `item` (le même numéro sauf pour C43, sur l'item 41). */
function entree(numero: number, date_reception: string, item = numero): ContestationPosterieure {
  return { item_id: `01JBANCESSA1000000000TEM${item}`, contestation_id: `01JBANCESSA1C0NTESTAT10N${numero}`, date_reception };
}

/** Reçue avant tout gel, portée par les deux commits des données. */
const C41 = "2026-11-20T09:00:00+01:00";
/** Reçue avant tout gel, sur l'item 41 encore ; portée par le second commit seulement. */
const C43 = "2026-11-25T09:00:00+01:00";
/** Reçue à l'instant exact du gel du premier run, sur l'item 42 : portée par aucun commit. */
const C42 = "2026-12-01T05:00:00Z";
/** Reçue après les gels, sur l'item 44, absent des commits et de tout tirage. */
const C44 = "2026-12-10T09:00:00+01:00";

interface Bac {
  readonly racine: string;
  readonly runs: string;
  readonly data: string;
  readonly premier: string;
  readonly second: string;
  readonly troisieme: string;
  readonly quatrieme: string;
}

function racineTemporaire(): string {
  const racine = mkdtempSync(join(tmpdir(), "banc-contestations-posterieures-"));
  temporaires.push(racine);
  return racine;
}

/**
 * Un dépôt Git et quatre runs :
 * - commit 1 : item 41 contesté (C41), item 42 sans contestation ;
 * - commit 2 : item 41 contesté une seconde fois (C43, reçue avant tout gel) ;
 * - `premier` : `valide-01` publié, gelé le 2026-12-01 au commit 1 (porte déjà `PRESENTE`) ;
 * - `second` : publié, gelé le 2026-12-08 au commit 2 ;
 * - `troisieme` : en cours, gelé le 2026-12-15 au commit 2 ;
 * - `quatrieme` : invalide (`valide-04`), gelé le 2026-12-22 au commit 2.
 * Puis, dans l'arbre de travail, après les gels : l'item 42 contesté (C42, daté de l'instant du gel
 * du premier run) et l'item 44 créé contesté (C44), hors de tout tirage.
 */
function bac(): Bac {
  const racine = racineTemporaire();
  const runs = join(racine, "runs");
  const data = join(racine, "data", "items");
  const i41 = contesteLe(itemPromu({ id: "01JBANCESSA1000000000TEM41" }), 41, C41);
  const i42 = itemPromu({ id: "01JBANCESSA1000000000TEM42" });
  poserItem(data, i41);
  poserItem(data, i42);
  initialiserDepot(racine);
  const commit1 = head(racine);
  poserItem(data, contesteLe(i41, 43, C43));
  commiterTout(racine, "seconde contestation de l'item 41");
  const commit2 = head(racine);

  const auCommit = (brut: Objet, commit: string): Objet => ({ ...brut, versions: { ...(brut["versions"] as Objet), donnees_commit: commit } });
  const premier = poser(runs, "2026-12-01", auCommit(exemple(), commit1));
  const { contestations_posterieures: _presentes, ...sansListe } = exemple();
  const second = poser(runs, "2026-12-08", auCommit({ ...sansListe, id: "01JBANCESSA1RXN00000000002", date_gel: "2026-12-08T06:00:00+01:00" }, commit2));
  const troisieme = poser(runs, "2026-12-15", auCommit({ ...enCours(), id: "01JBANCESSA1RXN00000000003", date_gel: "2026-12-15T06:00:00+01:00" }, commit2));
  const quatrieme = poser(runs, "2026-12-22", auCommit({ ...exemple("valide-04-invalide-symetrie-rouge-sans-go-no-go.json"), id: "01JBANCESSA1RXN00000000004", date_gel: "2026-12-22T06:00:00+01:00" }, commit2));

  poserItem(data, contesteLe(i42, 42, C42));
  poserItem(data, contesteLe(itemPromu({ id: "01JBANCESSA1000000000TEM44" }), 44, C44));
  return { racine, runs, data, premier, second, troisieme, quatrieme };
}

function items(b: Bac): Iterable<Item> {
  return lireItemsData(b.data).values();
}

describe("contestationsAuCommit (D73 (2))", () => {
  it("lit les contestations des items contestés au commit ; un item absent du commit n'en porte aucune", () => {
    const b = bac();
    const recues = contestationsRecues(items(b));
    const commit1 = (JSON.parse(texteRun(b.premier)) as { versions: { donnees_commit: string } }).versions.donnees_commit;
    const commit2 = (JSON.parse(texteRun(b.second)) as { versions: { donnees_commit: string } }).versions.donnees_commit;
    const cle = (n: number, item = n) => cleDeContestation(`01JBANCESSA1000000000TEM${item}`, `01JBANCESSA1C0NTESTAT10N${n}`);
    expect([...contestationsAuCommit(b.data, commit1, recues)]).toEqual([cle(41)]);
    expect([...contestationsAuCommit(b.data, commit2, recues)].sort()).toEqual([cle(41), cle(43, 41)]);
    expect(contestationsAuCommit(b.data, commit1, [])).toEqual(new Set());
  });
});

describe("synchroniserContestationsPosterieures (D73 (2) et (4))", () => {
  it("chaque run gelé non invalide reçoit ce que son commit des données ne porte pas ; le run invalide ne reçoit rien", () => {
    const b = bac();
    const avantQuatrieme = texteRun(b.quatrieme);
    const ajouts = synchroniserContestationsPosterieures(b.runs, null, true);
    expect(ajouts.map((ajout) => ajout.repertoire)).toEqual([b.premier, b.second, b.troisieme]);
    // Premier, au commit 1 : C43 (avant le gel, absente du commit), C42 (à l'instant du gel), C44
    // (après, item hors tirage) ; C41, portée par le commit, n'entre jamais.
    expect(listeDe(b.premier)).toEqual([PRESENTE, entree(43, C43, 41), entree(42, C42), entree(44, C44)]);
    // Second et troisième, au commit 2, qui porte C43 : en cours compris.
    expect(listeDe(b.second)).toEqual([entree(42, C42), entree(44, C44)]);
    expect(listeDe(b.troisieme)).toEqual([entree(42, C42), entree(44, C44)]);
    expect(texteRun(b.quatrieme)).toBe(avantQuatrieme);
    for (const repertoire of [b.premier, b.second, b.troisieme]) expect(erreurDeSchema("run", JSON.parse(texteRun(repertoire)), repertoire)).toBeNull();
  });

  it("ajout seul : relancer n'écrit rien de nouveau, et une divergence n'écrit rien nulle part", () => {
    const b = bac();
    synchroniserContestationsPosterieures(b.runs, null, true);
    const apres = [texteRun(b.premier), texteRun(b.second), texteRun(b.troisieme)];
    expect(synchroniserContestationsPosterieures(b.runs, null, true)).toEqual([]);
    expect([texteRun(b.premier), texteRun(b.second), texteRun(b.troisieme)]).toEqual(apres);
    const i44 = lireItemsData(b.data).get("01JBANCESSA1000000000TEM44") as Item;
    const divergent = { ...i44, contestations: [{ ...contestationRecue("01JBANCESSA1C0NTESTAT10N44"), date_reception: "2026-12-11T09:00:00+01:00" }] };
    poserItem(b.data, divergent);
    expect(() => synchroniserContestationsPosterieures(b.runs, null, true)).toThrow(ContestationPosterieureDivergente);
    expect([texteRun(b.premier), texteRun(b.second), texteRun(b.troisieme)]).toEqual(apres);
  });

  it("sans écrire : le résultat dit les ajouts, aucun fichier ne change", () => {
    const b = bac();
    const avant = [texteRun(b.premier), texteRun(b.second), texteRun(b.troisieme)];
    expect(synchroniserContestationsPosterieures(b.runs, null, false)).toHaveLength(3);
    expect([texteRun(b.premier), texteRun(b.second), texteRun(b.troisieme)]).toEqual(avant);
  });

  it("commit des données introuvable : refus nommé, rien n'est écrit", () => {
    const b = bac();
    const brut = JSON.parse(texteRun(b.second)) as Objet;
    writeFileSync(join(b.second, "run.json"), `${JSON.stringify({ ...brut, versions: { ...(brut["versions"] as Objet), donnees_commit: "f".repeat(40) } }, null, 2)}\n`, "utf8");
    const avant = texteRun(b.premier);
    expect(() => synchroniserContestationsPosterieures(b.runs, null, true)).toThrow(/ItemsDuGelIllisibles|introuvable/);
    expect(texteRun(b.premier)).toBe(avant);
  });
});

describe("exigerContestationsInscrites (D73 (4), avant pnpm analyze)", () => {
  it("refuse un run où manque une contestation postérieure connue, accepte quand tout est inscrit", () => {
    const b = bac();
    expect(() => exigerContestationsInscrites(b.troisieme)).toThrow(ContestationsPosterieuresNonInscrites);
    synchroniserContestationsPosterieures(b.runs, null, true);
    expect(() => exigerContestationsInscrites(b.troisieme)).not.toThrow();
    expect(() => exigerContestationsInscrites(b.premier)).not.toThrow();
  });

  it("connue, absente du commit gelé et de run.json ⇒ refus qui la nomme ; portée par le commit gelé, absente de run.json ⇒ jamais exigée (D73 (2))", () => {
    const b = bac();
    // Le premier run, au commit 1, porte PRESENTE mais ni C43, ni C42, ni C44 : refus, qui les nomme.
    expect(() => exigerContestationsInscrites(b.premier)).toThrow(
      expect.objectContaining({ name: "ContestationsPosterieuresNonInscrites", manquantes: [entree(43, C43, 41), entree(42, C42), entree(44, C44)] }),
    );
    // C41, que le commit 1 porte, n'entre pas dans run.json et n'est jamais exigée.
    synchroniserContestationsPosterieures(b.runs, null, true);
    expect(JSON.stringify(listeDe(b.premier))).not.toContain("01JBANCESSA1C0NTESTAT10N41");
    expect(() => exigerContestationsInscrites(b.premier)).not.toThrow();
  });

  it("run invalide : rien n'est exigé", () => {
    const b = bac();
    expect(() => exigerContestationsInscrites(b.quatrieme)).not.toThrow();
  });

  it("les items se lisent dans le data/items du dépôt du run : un autre dépôt sans contestation n'a aucun moyen de rendre le contrôle muet", () => {
    const b = bac();
    const autre = racineTemporaire();
    poserItem(join(autre, "data", "items"), itemPromu({ id: "01JBANCESSA1000000000TEM41" }));
    initialiserDepot(autre);
    expect(() => exigerContestationsInscrites(b.troisieme)).toThrow(ContestationsPosterieuresNonInscrites);
    expect(realpathSync.native(repertoireDesItemsDuRun(b.troisieme))).toBe(realpathSync.native(b.data));
  });
});

describe("repertoireDesItemsDuRun : le data/items du dépôt qui porte le run", () => {
  it("rend le data/items de la racine du dépôt Git qui porte le run", () => {
    const b = bac();
    for (const repertoire of [b.premier, b.second, b.troisieme]) {
      expect(realpathSync.native(repertoireDesItemsDuRun(repertoire))).toBe(realpathSync.native(b.data));
    }
  });

  it("run hors de tout dépôt Git : refus DepotDuRunIntrouvable", () => {
    const hors = racineTemporaire();
    const repertoire = poser(join(hors, "runs"), "2026-12-01", exemple());
    expect(() => repertoireDesItemsDuRun(repertoire)).toThrow(DepotDuRunIntrouvable);
    expect(() => exigerContestationsInscrites(repertoire)).toThrow(DepotDuRunIntrouvable);
  });

  it("data/items absent du dépôt (aucune donnée validée) : refus ItemsDuDepotAbsents, jamais « zéro contestation »", () => {
    const b = bac();
    rmSync(join(b.racine, "data"), { recursive: true, force: true });
    expect(() => repertoireDesItemsDuRun(b.troisieme)).toThrow(ItemsDuDepotAbsents);
    expect(() => exigerContestationsInscrites(b.troisieme)).toThrow(ItemsDuDepotAbsents);
  });

  it("data/items présent mais sans aucun item : refus ItemsDuDepotAbsents", () => {
    const b = bac();
    rmSync(b.data, { recursive: true, force: true });
    mkdirSync(b.data, { recursive: true });
    expect(() => repertoireDesItemsDuRun(b.troisieme)).toThrow(ItemsDuDepotAbsents);
  });
});

describe("pnpm contestations-posterieures", () => {
  it("simule par défaut, écrit avec --ecrire sur un arbre propre, puis n'ajoute plus rien", () => {
    const b = bac();
    commiterTout(b.racine, "contestations reçues après les gels");
    const options = [b.runs];
    const avant = texteRun(b.premier);

    const simulation = executerOutil("contestations-posterieures.ts", options);
    expect(simulation.status, simulation.erreur).toBe(0);
    expect(simulation.sortie).toMatch(/Simulation/);
    expect(texteRun(b.premier)).toBe(avant);

    const ecriture = executerOutil("contestations-posterieures.ts", [...options, "--ecrire"]);
    expect(ecriture.status, ecriture.erreur).toBe(0);
    // Séparateur du système dans la commande proposée : `/` sous POSIX, `\` sous Windows.
    expect(ecriture.sortie).toMatch(/git add runs[\\/]2026-12-01[\\/]run\.json runs[\\/]2026-12-08[\\/]run\.json runs[\\/]2026-12-15[\\/]run\.json\n/);
    expect(listeDe(b.premier)).toEqual([PRESENTE, entree(43, C43, 41), entree(42, C42), entree(44, C44)]);

    const sale = executerOutil("contestations-posterieures.ts", [...options, "--ecrire"]);
    expect(sale.status).toBe(1);
    commiterTout(b.racine, "contestations postérieures");
    const relance = executerOutil("contestations-posterieures.ts", [...options, "--ecrire"]);
    expect(relance.status, relance.erreur).toBe(0);
    expect(relance.sortie).toMatch(/Aucune contestation postérieure à ajouter/);
  });

  it("D75 (12) : --data, --racine et --runs sont refusées, code 2, par un message qui nomme l'option ; rien n'est écrit", () => {
    const b = bac();
    commiterTout(b.racine, "contestations reçues après les gels");
    const avant = texteRun(b.premier);
    for (const [cle, valeur] of [["data", b.data], ["racine", b.racine], ["runs", b.runs]] as const) {
      for (const appel of [[`--${cle}=${valeur}`], [b.runs, `--${cle}=${valeur}`, "--ecrire"]]) {
        const resultat = executerOutil("contestations-posterieures.ts", appel);
        expect(resultat.status, resultat.erreur).toBe(2);
        expect(resultat.erreur).toContain("OptionRetiree");
        expect(resultat.erreur).toContain(`--${cle} n'existe plus`);
        expect(texteRun(b.premier)).toBe(avant);
      }
    }
  });

  it("D75 (12) : un second répertoire, ou une option inconnue, est refusé, code 2", () => {
    const b = bac();
    expect(executerOutil("contestations-posterieures.ts", [b.runs, b.runs]).status).toBe(2);
    const inconnue = executerOutil("contestations-posterieures.ts", [b.runs, "--items=ailleurs"]);
    expect(inconnue.status).toBe(2);
    expect(inconnue.erreur).toContain("OptionsInconnues");
  });
});

/* ------------------------------------------------------------ D75 (13) : run hors de son clone */

/** Les runs de `b` recopiés hors de tout dépôt Git (une archive Zenodo dépliée). */
function horsDuClone(b: Bac): { readonly runs: string; readonly premier: string; readonly troisieme: string; readonly quatrieme: string } {
  const runs = join(racineTemporaire(), "runs");
  cpSync(b.runs, runs, { recursive: true });
  return { runs, premier: join(runs, "2026-12-01"), troisieme: join(runs, "2026-12-15"), quatrieme: join(runs, "2026-12-22") };
}

function commitDe(repertoire_run: string): string {
  return (JSON.parse(texteRun(repertoire_run)) as { versions: { donnees_commit: string } }).versions.donnees_commit;
}

/** Un clone de `b`, ramené au commit `commit`. */
function cloneAu(b: Bac, commit: string): string {
  const clone = join(racineTemporaire(), "clone");
  expect(executerGit(b.racine, ["clone", "--quiet", b.racine, clone]).ok).toBe(true);
  expect(executerGit(clone, ["reset", "--quiet", "--hard", commit]).ok).toBe(true);
  return clone;
}

describe("D75 (13) : items d'un run hors de son clone, lus dans un dépôt désigné", () => {
  it("run dans son clone, sans option : inchangé, les items du dépôt du run", () => {
    const b = bac();
    expect(realpathSync.native(repertoireDesItemsPourLeRun(b.troisieme, null))).toBe(realpathSync.native(b.data));
    expect(() => exigerContestationsInscrites(b.troisieme, null)).toThrow(ContestationsPosterieuresNonInscrites);
  });

  it("run dans son clone, avec l'option : refus run_dans_un_depot, même vers son propre clone", () => {
    const b = bac();
    expect(() => exigerContestationsInscrites(b.troisieme, b.racine)).toThrow(expect.objectContaining({ name: "DepotDesItemsRefuse", motif: "run_dans_un_depot" }));
    expect(() => synchroniserContestationsPosterieures(b.runs, b.racine, false)).toThrow(DepotDesItemsRefuse);
  });

  it("run hors clone, sans option : refus DepotDuRunIntrouvable, inchangé", () => {
    const hors = horsDuClone(bac());
    expect(() => exigerContestationsInscrites(hors.troisieme)).toThrow(DepotDuRunIntrouvable);
    expect(() => synchroniserContestationsPosterieures(hors.runs, null, false)).toThrow(DepotDuRunIntrouvable);
  });

  it("option vers un dépôt qui porte le commit gelé : accepté, mêmes résultats que dans le clone", () => {
    const b = bac();
    commiterTout(b.racine, "contestations reçues après les gels");
    const hors = horsDuClone(b);
    expect(realpathSync.native(repertoireDesItemsPourLeRun(hors.troisieme, b.racine))).toBe(realpathSync.native(b.data));
    const manquantes = (repertoire: string, depot: string | null): unknown => {
      try {
        exigerContestationsInscrites(repertoire, depot);
        return [];
      } catch (erreur) {
        return (erreur as ContestationsPosterieuresNonInscrites).manquantes;
      }
    };
    for (const nom of ["premier", "troisieme", "quatrieme"] as const) {
      expect(manquantes(hors[nom], b.racine)).toEqual(manquantes(b[nom], null));
    }
    const resume = (ajouts: readonly AjoutAuRun[]) => ajouts.map(({ run_id, ajoutees }) => ({ run_id, ajoutees }));
    expect(resume(synchroniserContestationsPosterieures(hors.runs, b.racine, false))).toEqual(resume(synchroniserContestationsPosterieures(b.runs, null, false)));
    // Un clone tiers, à jour, vaut le dépôt de l'auteur.
    const tiers = cloneAu(b, head(b.racine));
    expect(resume(synchroniserContestationsPosterieures(hors.runs, tiers, false))).toEqual(resume(synchroniserContestationsPosterieures(b.runs, null, false)));
    synchroniserContestationsPosterieures(hors.runs, tiers, true);
    expect(listeDe(hors.premier)).toEqual([PRESENTE, entree(43, C43, 41), entree(42, C42), entree(44, C44)]);
    expect(() => exigerContestationsInscrites(hors.troisieme, tiers)).not.toThrow();
  });

  it("option vers un dépôt sans le commit gelé : un autre dépôt, ou un clone arrêté avant le gel, refus commit_du_gel_absent", () => {
    const b = bac();
    const hors = horsDuClone(b);
    const autre = racineTemporaire();
    poserItem(join(autre, "data", "items"), itemPromu({ id: "01JBANCESSA1000000000TEM41" }));
    initialiserDepot(autre);
    // Le troisième run est gelé au second commit ; ce clone s'arrête au premier.
    const avantLeGel = cloneAu(b, commitDe(b.premier));
    for (const depot of [autre, avantLeGel]) {
      expect(() => exigerContestationsInscrites(hors.troisieme, depot)).toThrow(expect.objectContaining({ name: "DepotDesItemsRefuse", motif: "commit_du_gel_absent" }));
    }
    expect(() => synchroniserContestationsPosterieures(hors.runs, avantLeGel, false)).toThrow(DepotDesItemsRefuse);
  });

  it("option vers un répertoire vide, absent ou qui n'est pas la racine d'un dépôt : refus pas_la_racine_d_un_depot", () => {
    const b = bac();
    const hors = horsDuClone(b);
    for (const depot of [racineTemporaire(), join(racineTemporaire(), "absent"), join(b.racine, "data")]) {
      expect(() => exigerContestationsInscrites(hors.troisieme, depot)).toThrow(expect.objectContaining({ name: "DepotDesItemsRefuse", motif: "pas_la_racine_d_un_depot" }));
    }
  });

  it("option vers un dépôt qui porte le commit gelé mais aucun item : refus ItemsDuDepotAbsents, jamais « zéro contestation »", () => {
    const b = bac();
    const hors = horsDuClone(b);
    rmSync(b.data, { recursive: true, force: true });
    mkdirSync(b.data, { recursive: true });
    expect(() => exigerContestationsInscrites(hors.troisieme, b.racine)).toThrow(ItemsDuDepotAbsents);
    rmSync(join(b.racine, "data"), { recursive: true, force: true });
    commiterTout(b.racine, "plus aucun item");
    expect(() => exigerContestationsInscrites(hors.troisieme, b.racine)).toThrow(ItemsDuDepotAbsents);
    expect(() => synchroniserContestationsPosterieures(hors.runs, b.racine, false)).toThrow(ItemsDuDepotAbsents);
  });

  it("pnpm contestations-posterieures --depot-des-items : simule hors du clone ; sans option, sans valeur ou avec --ecrire, refus", () => {
    const b = bac();
    commiterTout(b.racine, "contestations reçues après les gels");
    const hors = horsDuClone(b);
    const avant = texteRun(hors.premier);

    const simulation = executerOutil("contestations-posterieures.ts", [hors.runs, `--depot-des-items=${b.racine}`]);
    expect(simulation.status, simulation.erreur).toBe(0);
    expect(simulation.sortie).toMatch(/Simulation/);
    expect(simulation.sortie).toContain("01JBANCESSA1C0NTESTAT10N44");

    const sansOption = executerOutil("contestations-posterieures.ts", [hors.runs]);
    expect(sansOption.status).toBe(1);
    expect(sansOption.erreur).toContain("DepotDuRunIntrouvable");

    const avecEcriture = executerOutil("contestations-posterieures.ts", [hors.runs, `--depot-des-items=${b.racine}`, "--ecrire"]);
    expect(avecEcriture.status).toBe(2);
    expect(avecEcriture.erreur).toContain("CommandeMalAppelee");

    const sansValeur = executerOutil("contestations-posterieures.ts", [hors.runs, "--depot-des-items"]);
    expect(sansValeur.status).toBe(2);

    const refuse = executerOutil("contestations-posterieures.ts", [hors.runs, `--depot-des-items=${racineTemporaire()}`]);
    expect(refuse.status).toBe(1);
    expect(refuse.erreur).toContain("DepotDesItemsRefuse");
    expect(texteRun(hors.premier)).toBe(avant);
  });
});
