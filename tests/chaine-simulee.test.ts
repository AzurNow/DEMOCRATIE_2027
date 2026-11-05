/**
 * D80 : la chaîne simulée de bout en bout, en commandes réelles (sous-processus), sans clé ni
 * réseau — `pnpm geler --simule` → `pnpm run:dry --run` → `pnpm notation:dry --run` → humains (joués
 * par `tests/aides/humains-simules.ts`, aucune commande ne les simule) → `pnpm notation:dry --run` →
 * `pnpm analyze` → `pnpm go-no-go`. Chaque commande est lancée avec `tests/aides/sans-reseau.ts`
 * préchargé : tout `fetch` et toute connexion de socket y sont inscrits et refusés, et le journal doit
 * rester absent. Puis les refus nommés du brief, chacun son test.
 *
 * Tout s'écrit sous `os.tmpdir()`, hors de tout dépôt Git ; `runs/` du projet est photographié avant
 * et après, et ne doit pas bouger.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { geler } from "../pipeline/gel/geler.ts";
import { gelerSimule, lireParametresGelSimule, NOM_DEPOT_SIMULE } from "../pipeline/gel/gel-simule.ts";
import { ecrireExclusif } from "../pipeline/gel/ecriture.ts";
import { RACINE_PROJET } from "./aides/depot.ts";
import { jouerLesHumains } from "./aides/humains-simules.ts";
import { depotDuJeu, optionsGel } from "./gel/fixtures.ts";
import { jeuNominal } from "./gel/jeux.ts";

const DATE = "2026-12-01";
const PRECHARGE = pathToFileURL(join(RACINE_PROJET, "tests", "aides", "sans-reseau.ts")).href;
const RUNS_DU_PROJET = join(RACINE_PROJET, "runs");
const SOURCE_SIMULEE = join(RACINE_PROJET, "tests", "gel", "depot-simule");
const PARAMETRES_SIMULES = join(RACINE_PROJET, "tests", "gel", "gel-simule.json");

const temporaires: string[] = [];

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

interface Execution {
  readonly status: number | null;
  readonly sortie: string;
  readonly erreur: string;
}

/** Une commande du projet, réseau piégé : chaque tentative est inscrite dans `journal`. */
function lancer(journal: string, outil: string, arguments_: readonly string[]): Execution {
  const resultat = spawnSync(process.execPath, ["--experimental-strip-types", "--import", PRECHARGE, join(RACINE_PROJET, "outils", outil), ...arguments_], {
    encoding: "utf8",
    env: { ...process.env, BANC_JOURNAL_RESEAU: journal },
  });
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

function json(chemin: string): Record<string, unknown> {
  return JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
}

function compter(dossier: string): number {
  return existsSync(dossier) ? readdirSync(dossier).filter((nom) => nom.endsWith(".json")).length : 0;
}

let runsAvant: readonly string[];

beforeAll(() => {
  runsAvant = arborescence(RUNS_DU_PROJET);
});

afterAll(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
  expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
});

describe("D80, chaîne complète : metriques.json produit, aucun appel réseau", () => {
  it("geler --simule, run:dry --run, notation:dry --run, humains, notation:dry --run, analyze, go-no-go", () => {
    const sortie = temporaire("banc-chaine-simulee-");
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const run = join(sortie, DATE);
    const depot = join(sortie, NOM_DEPOT_SIMULE);
    const items = ["--run=" + run, "--depot-des-items=" + depot];

    const gel = lancer(journal, "geler.ts", ["--simule", "--type-run=mensuel", `--sortie=${sortie}`]);
    expect(gel.status, gel.erreur).toBe(0);
    expect(gel.sortie).toContain("GEL SIMULÉ");
    expect(json(join(run, "run.json"))["simule"]).toBe(true);

    const interrogation = lancer(journal, "run-dry.ts", [`--run=${run}`]);
    expect(interrogation.status, interrogation.erreur).toBe(0);

    const premiere = lancer(journal, "notation-dry.ts", items);
    expect(premiere.status, premiere.erreur).toBe(0);
    const humaines = jouerLesHumains({ repertoire_run: run, repertoire_items: join(depot, "data", "items"), juge_recopie: "juge-simule-b", date: "2026-12-05T09:30:00+01:00" });
    expect(humaines).toBeGreaterThan(0);
    const seconde = lancer(journal, "notation-dry.ts", items);
    expect(seconde.status, seconde.erreur).toBe(0);
    const obtenues = readdirSync(join(run, "volume", "reponses")).filter((nom) => json(join(run, "volume", "reponses", nom))["statut_reponse"] === "obtenue").length;
    expect(compter(join(run, "verdicts"))).toBe(obtenues);

    const analyse = lancer(journal, "analyze.ts", [run, `--depot-des-items=${depot}`]);
    expect(analyse.status, analyse.erreur).toBe(0);
    const metriques = json(join(run, "metriques", "metriques.json"));
    expect(metriques["run_id"]).toBe(json(join(run, "run.json"))["id"]);

    const decision = lancer(journal, "go-no-go.ts", [run]);
    expect(decision.status, decision.erreur).toBe(0);
    expect(existsSync(join(run, "checklist.json"))).toBe(true);
    expect(lancer(journal, "notation-controle.ts", [run]).status).toBe(0);

    // Aucune commande n'a tenté d'appel réseau : le journal n'a jamais été créé.
    expect(existsSync(journal)).toBe(false);
  }, 240_000);
});

describe("D80, le piège à réseau (test du test)", () => {
  it("un fetch et une connexion de socket sont inscrits au journal et refusés", () => {
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const script = 'fetch("https://exemple.invalid/").catch(() => {}); try { require("node:net").connect(80, "exemple.invalid"); } catch {}';
    const resultat = spawnSync(process.execPath, ["--experimental-strip-types", "--import", PRECHARGE, "-e", script], {
      encoding: "utf8",
      env: { ...process.env, BANC_JOURNAL_RESEAU: journal },
    });
    expect(resultat.status).toBe(0);
    expect(readFileSync(journal, "utf8")).toContain("fetch https://exemple.invalid/");
    expect(readFileSync(journal, "utf8")).toContain("socket");
  });
});

describe("D80, refus nommés", () => {
  it("geler --simule vers runs/ : refusé, code 1, runs/ inchangé", () => {
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const refus = lancer(journal, "geler.ts", ["--simule", "--type-run=mensuel", `--sortie=${join(RUNS_DU_PROJET, "essai-simule")}`]);
    expect(refus.status).toBe(1);
    expect(refus.erreur).toContain("SimuleSousRuns");
    expect(existsSync(join(RUNS_DU_PROJET, "essai-simule"))).toBe(false);
    expect(existsSync(journal)).toBe(false);
  });

  it("geler --simule sans sortie, dans un dépôt Git, avec --engagement ou --simule=<valeur> : refusé, code 1", () => {
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const sansSortie = lancer(journal, "geler.ts", ["--simule", "--type-run=mensuel"]);
    expect(sansSortie.erreur).toContain("sans_sortie");
    const dansLeDepot = lancer(journal, "geler.ts", ["--simule", "--type-run=mensuel", `--sortie=${join(RACINE_PROJET, "scratch", "essai-gel-simule")}`]);
    expect(dansLeDepot.erreur).toContain("sortie_dans_un_depot");
    expect(existsSync(join(RACINE_PROJET, "scratch", "essai-gel-simule"))).toBe(false);
    const sortie = temporaire("banc-gel-simule-refus-");
    const engagement = lancer(journal, "geler.ts", ["--simule", "--type-run=mensuel", `--sortie=${sortie}`, "--engagement=https://web.archive.org/web/20261130120000/x"]);
    expect(engagement.erreur).toContain("--engagement est refusé avec --simule");
    const valeur = lancer(journal, "geler.ts", ["--simule=1", "--type-run=mensuel", `--sortie=${sortie}`]);
    expect(valeur.erreur).toContain("--simule ne prend pas de valeur");
    for (const execution of [sansSortie, dansLeDepot, engagement, valeur]) expect(execution.status).toBe(1);
    expect(readdirSync(sortie)).toEqual([]);
    expect(existsSync(journal)).toBe(false);
  });

  it("notation:dry --run sur un vrai gel (non simulé) : refusé (GelNonSimule), code 2, rien n'est écrit", async () => {
    const racine = depotDuJeu(jeuNominal());
    temporaires.push(racine);
    const sortie = temporaire("banc-gel-reel-");
    await geler(optionsGel(racine, sortie));
    const run = join(sortie, DATE);
    expect(json(join(run, "run.json"))).not.toHaveProperty("simule");
    const avant = arborescence(sortie);
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const refus = lancer(journal, "notation-dry.ts", [`--run=${run}`, `--depot-des-items=${racine}`]);
    expect(refus.status).toBe(2);
    expect(refus.erreur).toContain("GelNonSimule");
    expect(arborescence(sortie)).toEqual(avant);
  });

  it("notation:dry : --run avec --sortie, ou --depot-des-items sans --run, refusés (code 2)", () => {
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const sortie = temporaire("banc-notation-dry-options-");
    expect(lancer(journal, "notation-dry.ts", [`--run=${join(sortie, DATE)}`, `--sortie=${sortie}`]).status).toBe(2);
    expect(lancer(journal, "notation-dry.ts", [`--depot-des-items=${sortie}`]).status).toBe(2);
    expect(readdirSync(sortie)).toEqual([]);
  });

  it("analyze sur un run simulé sans items désignés : refus nommé (ItemsDuRunSimuleNonDesignes), code 2", async () => {
    const sortie = temporaire("banc-analyze-simule-");
    await gelerSimule({ sortie, type_run: "mensuel", remplace: undefined, source: SOURCE_SIMULEE, parametres: lireParametresGelSimule(PARAMETRES_SIMULES), ecrire: ecrireExclusif });
    const run = join(sortie, DATE);
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const refus = lancer(journal, "analyze.ts", [run]);
    expect(refus.status).toBe(2);
    expect(refus.erreur).toContain("ItemsDuRunSimuleNonDesignes");
    expect(existsSync(join(run, "metriques"))).toBe(false);
  });

  it("notation:dry --run sur un run simulé sans --depot-des-items : refus nommé, rien n'est écrit", async () => {
    const sortie = temporaire("banc-notation-simule-");
    await gelerSimule({ sortie, type_run: "mensuel", remplace: undefined, source: SOURCE_SIMULEE, parametres: lireParametresGelSimule(PARAMETRES_SIMULES), ecrire: ecrireExclusif });
    const run = join(sortie, DATE);
    const avant = arborescence(run);
    const journal = join(temporaire("banc-journal-reseau-"), "appels.log");
    const refus = lancer(journal, "notation-dry.ts", [`--run=${run}`]);
    expect(refus.status).toBe(2);
    expect(refus.erreur).toContain("ItemsDuRunSimuleNonDesignes");
    expect(arborescence(run)).toEqual(avant);
  });
});

describe("D80, gel simulé", () => {
  it("deux gels simulés donnent le même run.json, octet pour octet, marqué simule: true", async () => {
    const parametres = lireParametresGelSimule(PARAMETRES_SIMULES);
    const [a, b] = [temporaire("banc-gel-simule-a-"), temporaire("banc-gel-simule-b-")];
    for (const sortie of [a, b]) await gelerSimule({ sortie, type_run: "mensuel", remplace: undefined, source: SOURCE_SIMULEE, parametres, ecrire: ecrireExclusif });
    const octets = (sortie: string) => readFileSync(join(sortie, DATE, "run.json"), "utf8");
    expect(octets(a)).toBe(octets(b));
    expect(json(join(a, DATE, "run.json"))["simule"]).toBe(true);
  });

  it("un gel simulé refusé ne laisse pas son dépôt simulé derrière lui", async () => {
    const sortie = temporaire("banc-gel-simule-refuse-");
    const parametres = { ...lireParametresGelSimule(PARAMETRES_SIMULES), maintenant_ms: Date.parse("2026-11-30T00:00:00Z") };
    await expect(gelerSimule({ sortie, type_run: "mensuel", remplace: undefined, source: SOURCE_SIMULEE, parametres, ecrire: ecrireExclusif })).rejects.toThrow(/date_gel|OrdreDesInstants/);
    expect(readdirSync(sortie)).toEqual([]);
  });
});
