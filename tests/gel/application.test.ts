/**
 * D73 (11), §6 (protocole 0.31) : `run.json#/application_testee`. Le run dont le sous-échantillon de
 * l'application est saisi est « le premier run mensuel ou hebdomadaire du mois civil, compté en UTC,
 * ni le run pilote ni un run supplémentaire, et il est désigné à son gel ».
 *
 * Le choix (`applicationDuGel`) est éprouvé sur des runs déjà lus ; l'inscription au gel, sur un
 * dépôt de fixture où un premier gel écrit sous `runs/` (dépôt jetable), puis un second gel vers une
 * sortie temporaire, comme `precedent.test.ts`.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { ApplicationRefusee, applicationDuGel, moisCivilUtc } from "../../pipeline/gel/application.ts";
import type { RunGelePourApplication } from "../../pipeline/gel/application.ts";
import { geler } from "../../pipeline/gel/geler.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ALPHA, CONFIGURATION_GEL, depotDuJeu, optionsGel, perimetreSaisi, recommiter } from "./fixtures.ts";
import { jeuNominal } from "./jeux.ts";

const RUN_A = "01JF0000000000000000000001";
const RUN_B = "01JF0000000000000000000002";

/** Le statut est porté comme sous `runs/`, pour montrer qu'il n'est pas lu. */
function run(repertoire: string, id: string, type_run: string, date_gel: string, statut = "publie"): RunGelePourApplication & { readonly statut: string } {
  return { repertoire, id, type_run, statut, date_gel_ms: Date.parse(date_gel) };
}

function refusDe(appel: () => unknown): ApplicationRefusee {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof ApplicationRefusee) return erreur;
    throw erreur;
  }
  throw new Error("Accepté alors qu'un refus était attendu.");
}

/* -------------------------------------------------------- mois civil UTC */

describe("moisCivilUtc : le mois civil compté en UTC, jamais à Paris", () => {
  it("gel le 1er du mois à 00:00:00 UTC ⇒ ce mois-là", () => {
    expect(moisCivilUtc(Date.parse("2027-02-01T00:00:00Z"))).toBe("2027-02");
  });

  it("gel le dernier jour du mois à 23:59:59 UTC ⇒ ce mois-là, pas le suivant", () => {
    expect(moisCivilUtc(Date.parse("2027-01-31T23:59:59Z"))).toBe("2027-01");
  });

  it("gel le 1er février à 00:30 heure de Paris (31 janvier 23:30 UTC) ⇒ janvier", () => {
    expect(moisCivilUtc(Date.parse("2027-02-01T00:30:00+01:00"))).toBe("2027-01");
  });
});

/* ---------------------------------------------------------------- le choix */

describe("applicationDuGel : désignation au gel", () => {
  it("aucun run gelé dans le mois, run mensuel ⇒ désigné", () => {
    expect(applicationDuGel([], "mensuel", Date.parse("2026-12-01T00:00:00Z"))).toEqual({ designe: true, mois_utc: "2026-12" });
  });

  it("run hebdomadaire seul dans le mois ⇒ désigné", () => {
    expect(applicationDuGel([], "hebdomadaire", Date.parse("2027-02-02T00:00:00Z"))).toEqual({ designe: true, mois_utc: "2027-02" });
  });

  it("le 1er du mois à 00:00:00 UTC, un run du mois précédent gelé le dernier jour à 23:59:59 UTC ⇒ désigné (autre mois)", () => {
    const runs = [run("2027-02-01", RUN_A, "hebdomadaire", "2027-01-31T23:59:59Z")];
    expect(applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-01T00:00:00Z"))).toEqual({ designe: true, mois_utc: "2027-02" });
  });

  it("le dernier jour à 23:59:59 UTC, un run du même mois gelé le 1er à 00:00:00 UTC ⇒ non désigné, le premier nommé", () => {
    const runs = [run("2027-01-01", RUN_A, "mensuel", "2027-01-01T00:00:00Z")];
    expect(applicationDuGel(runs, "mensuel", Date.parse("2027-01-31T23:59:59Z"))).toEqual({
      designe: false,
      mois_utc: "2027-01",
      motif: "mois_deja_servi",
      premier_run_id: RUN_A,
    });
  });

  it("le premier run du mois est un pilote ⇒ le run mensuel suivant est désigné", () => {
    const runs = [run("2026-12-01", RUN_A, "pilote", "2026-12-01T00:00:00Z")];
    expect(applicationDuGel(runs, "mensuel", Date.parse("2026-12-15T00:00:00Z"))).toEqual({ designe: true, mois_utc: "2026-12" });
  });

  it("un pilote n'est jamais désigné, même seul dans le mois", () => {
    expect(applicationDuGel([], "pilote", Date.parse("2026-12-01T00:00:00Z"))).toEqual({
      designe: false,
      mois_utc: "2026-12",
      motif: "type_run_exclu",
    });
  });

  it("run supplémentaire seul dans le mois ⇒ jamais désigné (les deux types supplémentaires)", () => {
    for (const type_run of ["supplementaire_liste_officielle", "supplementaire_debat"]) {
      expect(applicationDuGel([], type_run, Date.parse("2027-03-10T00:00:00Z"))).toEqual({
        designe: false,
        mois_utc: "2027-03",
        motif: "type_run_exclu",
      });
    }
  });

  it("un run supplémentaire gelé plus tôt dans le mois ne prend pas la place : le run hebdomadaire suivant est désigné", () => {
    const runs = [run("2027-03-02", RUN_A, "supplementaire_debat", "2027-03-02T00:00:00Z")];
    expect(applicationDuGel(runs, "hebdomadaire", Date.parse("2027-03-09T00:00:00Z"))).toEqual({ designe: true, mois_utc: "2027-03" });
  });

  it("une réexécution n'est ni mensuelle ni hebdomadaire : jamais désignée (lecture littérale, question ouverte)", () => {
    expect(applicationDuGel([], "reexecution", Date.parse("2027-03-10T00:00:00Z"))).toEqual({
      designe: false,
      mois_utc: "2027-03",
      motif: "type_run_exclu",
    });
  });

  it("deux runs du même mois ⇒ seul le premier est désigné, le second nomme le premier", () => {
    const premier = applicationDuGel([], "hebdomadaire", Date.parse("2027-02-02T00:00:00Z"));
    const second = applicationDuGel([run("2027-02-02", RUN_A, "hebdomadaire", "2027-02-02T00:00:00Z", "en_cours")], "hebdomadaire", Date.parse("2027-02-09T00:00:00Z"));
    expect(premier).toEqual({ designe: true, mois_utc: "2027-02" });
    expect(second).toEqual({ designe: false, mois_utc: "2027-02", motif: "mois_deja_servi", premier_run_id: RUN_A });
  });

  it("le premier run du mois invalidé reste le premier : le suivant n'est pas désigné (désignation au gel, statut ignoré)", () => {
    const runs = [run("2027-02-02", RUN_A, "hebdomadaire", "2027-02-02T00:00:00Z", "invalide")];
    expect(applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-09T00:00:00Z"))).toEqual({
      designe: false,
      mois_utc: "2027-02",
      motif: "mois_deja_servi",
      premier_run_id: RUN_A,
    });
  });

  it("le premier run du mois planifié, pas encore publié, compte déjà : il est gelé", () => {
    const runs = [run("2027-02-02", RUN_A, "mensuel", "2027-02-02T00:00:00Z", "planifie")];
    expect(applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-09T00:00:00Z"))).toMatchObject({ designe: false, premier_run_id: RUN_A });
  });

  it("un run du même mois gelé à une date_gel postérieure ⇒ refus gel_hors_ordre, sa désignation serait fausse", () => {
    const runs = [run("2027-02-09", RUN_A, "hebdomadaire", "2027-02-09T00:00:00Z")];
    const refus = refusDe(() => applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-02T00:00:00Z")));
    expect(refus.motif).toBe("gel_hors_ordre");
    expect(refus.message).toContain("runs/2027-02-09");
  });

  it("un run du même mois déjà gelé à la même date_gel (essai --sortie) ⇒ il a été gelé avant : ce gel n'est pas désigné", () => {
    const runs = [run("2027-02-02", RUN_A, "hebdomadaire", "2027-02-02T00:00:00Z")];
    expect(applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-02T00:00:00Z"))).toEqual({
      designe: false,
      mois_utc: "2027-02",
      motif: "mois_deja_servi",
      premier_run_id: RUN_A,
    });
  });

  it("deux runs antérieurs du mois à la même date_gel ⇒ refus premier_ambigu", () => {
    const runs = [
      run("2027-02-02", RUN_A, "hebdomadaire", "2027-02-02T00:00:00Z"),
      run("2027-02-02b", RUN_B, "mensuel", "2027-02-02T00:00:00Z"),
    ];
    expect(refusDe(() => applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-09T00:00:00Z"))).motif).toBe("premier_ambigu");
  });

  it("le premier de plusieurs runs antérieurs du mois est nommé, quel que soit l'ordre reçu", () => {
    const runs = [
      run("2027-02-16", RUN_B, "hebdomadaire", "2027-02-16T00:00:00Z"),
      run("2027-02-02", RUN_A, "hebdomadaire", "2027-02-02T00:00:00Z"),
    ];
    expect(applicationDuGel(runs, "hebdomadaire", Date.parse("2027-02-23T00:00:00Z"))).toMatchObject({ premier_run_id: RUN_A });
  });

  it("un run non désigné hors type n'est refusé par aucun ordre : un supplémentaire avant un run du mois gelé plus tard", () => {
    const runs = [run("2027-02-09", RUN_A, "hebdomadaire", "2027-02-09T00:00:00Z")];
    expect(applicationDuGel(runs, "supplementaire_debat", Date.parse("2027-02-05T00:00:00Z"))).toMatchObject({ designe: false, motif: "type_run_exclu" });
  });
});

/* ---------------------------------------------------------------- schéma */

describe("run.schema.json#/properties/application_testee", () => {
  /** valide-01 est un run mensuel publié ; `type_run` est surchargé au besoin. */
  const fragment = (valeur: unknown, type_run = "mensuel") => valider<unknown>("run", { ...exempleValide(), type_run, application_testee: valeur }, "test");

  it("les trois formes produites par le gel passent le schéma", () => {
    expect(() => fragment({ designe: true, mois_utc: "2027-02" })).not.toThrow();
    expect(() => fragment({ designe: false, mois_utc: "2027-02", motif: "type_run_exclu" }, "pilote")).not.toThrow();
    expect(() => fragment({ designe: false, mois_utc: "2027-02", motif: "mois_deja_servi", premier_run_id: RUN_A })).not.toThrow();
  });

  it("un run.json sans le champ reste conforme : un run gelé avant ce lot reste lisible", () => {
    expect(() => valider<unknown>("run", exempleValide(), "test")).not.toThrow();
  });

  it("un run mensuel ou hebdomadaire ne porte jamais le motif type_run_exclu", () => {
    expect(() => fragment({ designe: false, mois_utc: "2027-02", motif: "type_run_exclu" })).toThrow(ErreurSchema);
    expect(() => fragment({ designe: false, mois_utc: "2027-02", motif: "type_run_exclu" }, "hebdomadaire")).toThrow(ErreurSchema);
  });

  it("un pilote ou un supplémentaire désigné ⇒ refusé : seul type_run_exclu leur est permis", () => {
    expect(() => fragment({ designe: true, mois_utc: "2027-02" }, "pilote")).toThrow(ErreurSchema);
    expect(() => fragment({ designe: false, mois_utc: "2027-02", motif: "mois_deja_servi", premier_run_id: RUN_A }, "supplementaire_debat")).toThrow(ErreurSchema);
  });

  it("non désigné sans motif ⇒ refusé : l'absence de désignation se justifie", () => {
    expect(() => fragment({ designe: false, mois_utc: "2027-02" })).toThrow(ErreurSchema);
  });

  it("mois déjà servi sans le premier run ⇒ refusé : invérifiable", () => {
    expect(() => fragment({ designe: false, mois_utc: "2027-02", motif: "mois_deja_servi" })).toThrow(ErreurSchema);
  });

  it("désigné avec un motif ⇒ refusé", () => {
    expect(() => fragment({ designe: true, mois_utc: "2027-02", motif: "type_run_exclu" })).toThrow(ErreurSchema);
  });

  it("un booléen nu ⇒ refusé : le mois et le motif doivent se vérifier", () => {
    expect(() => fragment(true)).toThrow(ErreurSchema);
  });

  it("mois au format autre que AAAA-MM ⇒ refusé", () => {
    expect(() => fragment({ designe: true, mois_utc: "2027-2" })).toThrow(ErreurSchema);
  });
});

function exempleValide(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/run/valide-01-mensuel-publie.json"), "utf8")) as Record<string, unknown>;
}

/* --------------------------------------------------------- inscription au gel */

const GEL_2 = "2026-12-02T01:00:00+01:00";
const DATE_2 = "2026-12-02";
const FENETRE_2 = "2026-12-08T06:00:00+01:00";
const MAINTENANT_2 = Date.parse("2026-12-03T00:00:00Z");
const RUNS_DU_PROJET = join(RACINE_PROJET, "runs");

const temporaires: string[] = [];

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

let runsAvant: readonly string[];

beforeAll(() => {
  runsAvant = arborescence(RUNS_DU_PROJET);
});

afterAll(() => {
  expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
});

function runJson(repertoire: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repertoire, "run.json"), "utf8")) as Record<string, unknown>;
}

describe("pnpm geler inscrit run.json#/application_testee", () => {
  it("premier run mensuel gelé le 1er décembre à 00:00:00 UTC ⇒ désigné, run.json conforme au schéma", async () => {
    const racine = depotDuJeu(jeuNominal());
    temporaires.push(racine);
    const sortie = temporaire("banc-gel-application-");
    await geler(optionsGel(racine, sortie, { type_run: "mensuel" }));
    const ecrit = runJson(join(sortie, "2026-12-01"));
    expect(ecrit["application_testee"]).toEqual({ designe: true, mois_utc: "2026-12" });
    expect(() => valider<unknown>("run", ecrit, "run.json du gel")).not.toThrow();
  });

  it("un pilote gelé ⇒ non désigné, motif type_run_exclu", async () => {
    const racine = depotDuJeu(jeuNominal());
    temporaires.push(racine);
    const sortie = temporaire("banc-gel-application-");
    await geler(optionsGel(racine, sortie));
    expect(runJson(join(sortie, "2026-12-01"))["application_testee"]).toEqual({ designe: false, mois_utc: "2026-12", motif: "type_run_exclu" });
  });

  it("deux runs mensuels du même mois : le second gel nomme le premier, gelé sous runs/ et encore planifié", async () => {
    const racine = depotDuJeu(jeuNominal());
    temporaires.push(racine);
    await geler(optionsGel(racine, undefined, { type_run: "mensuel" }));
    const premier = runJson(join(racine, "runs", "2026-12-01"));
    recommiter(racine, "premier run");
    writeFileSync(join(racine, "config/perimetre.yaml"), stringify(perimetreSaisi(GEL_2, [ALPHA])), "utf8");
    writeFileSync(join(racine, "config/gel.json"), `${JSON.stringify({ ...CONFIGURATION_GEL, fenetre_debut: FENETRE_2 }, null, 2)}\n`, "utf8");
    recommiter(racine, "second gel");
    const sortie = temporaire("banc-gel-application-");
    await geler(optionsGel(racine, sortie, { type_run: "mensuel", maintenant: () => MAINTENANT_2 }));
    expect(runJson(join(sortie, DATE_2))["application_testee"]).toEqual({
      designe: false,
      mois_utc: "2026-12",
      motif: "mois_deja_servi",
      premier_run_id: premier["id"],
    });
  });
});
