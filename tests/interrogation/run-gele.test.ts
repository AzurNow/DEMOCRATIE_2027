/**
 * Lot gel, PR 4 (décision D51 (1)) : `pnpm run:dry --run <répertoire>` interroge en simulé un run
 * produit par `pnpm geler --sortie`, et écrit `statut: en_cours` dans son `run.json` avant la
 * première tentative. Chaque cas limite du brief a son test, nommé « run gelé, cas n ».
 *
 * Le run est gelé une fois, sur le jeu nominal du lot gel (`tests/gel/jeux.ts`), vers un temporaire,
 * avec les ports réseau de fixture (`tests/gel/reseau-fixture.ts`) : aucun appel réseau. Chaque test
 * travaille sur une copie de ce répertoire gelé, jamais sous `runs/` du projet.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ErreurSchema, erreurDeSchema } from "../../outils/schemas/valider.ts";
import { geler } from "../../pipeline/gel/geler.ts";
import { ECHANTILLONS } from "../../pipeline/interrogation/conditions.ts";
import { questionsTirees, RunGeleRefuse } from "../../pipeline/interrogation/run-gele.ts";
import { lancerRunGeleSimule, ProfilSimuleAbsent } from "../../pipeline/interrogation/run-simule.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import { TemporaireOrphelin } from "../../pipeline/run/ecriture.ts";
import { invaliderRun } from "../../pipeline/run/invalidation.ts";
import { TransitionRefusee } from "../../pipeline/run/statut.ts";
import type { Question, Tirage } from "../../pipeline/questions/types.ts";
import { depotDuJeu, optionsGel } from "../gel/fixtures.ts";
import { jeuNominal } from "../gel/jeux.ts";

type Objet = Record<string, unknown>;

const RACINE = resolve(import.meta.dirname, "../..");
const RUNS_DU_PROJET = join(RACINE, "runs");
const PROFILS = join(import.meta.dirname, "fixtures/run-gele/profils-simules.json");
const EXEMPLES = join(RACINE, "schema/exemples/run");
const CLE_API = (JSON.parse(readFileSync(PROFILS, "utf8")) as { cle_api: string }).cle_api;
/** Après la fenêtre des jeux du gel (2026-12-01 06:00 à Paris, 48 h) : une heure d'invalidation admise. */
const APRES_GEL_MS = Date.parse("2026-12-02T10:00:00Z");
const MOTIF = "Incident technique simulé pour le test (§6).";

/* ------------------------------------------------------------------ outillage */

const temporaires: string[] = [];
let gabarit: string;

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

let runsAvant: readonly string[];

beforeAll(async () => {
  runsAvant = arborescence(RUNS_DU_PROJET);
  const depot = depotDuJeu(jeuNominal());
  const sortie = mkdtempSync(join(tmpdir(), "banc-run-gele-gabarit-"));
  const resultat = await geler(optionsGel(depot, sortie));
  rmSync(depot, { recursive: true, force: true });
  gabarit = resultat.repertoire;
}, 60_000);

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(resolve(gabarit, ".."), { recursive: true, force: true });
  expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
});

/** Une copie du run gelé, sous `<temporaire>/<date>/`, comme `pnpm geler --sortie` l'écrit. */
function copie(): string {
  const repertoire = join(temporaire("banc-run-gele-"), basename(gabarit));
  cpSync(gabarit, repertoire, { recursive: true });
  return repertoire;
}

function texte(repertoire: string, fichier: string): string {
  return readFileSync(join(repertoire, fichier), "utf8");
}

function json<T>(repertoire: string, fichier: string): T {
  return JSON.parse(texte(repertoire, fichier)) as T;
}

function ecrireJson(repertoire: string, fichier: string, valeur: unknown): void {
  writeFileSync(join(repertoire, fichier), `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

function sha256(contenu: string): string {
  return createHash("sha256").update(contenu, "utf8").digest("hex");
}

function lancer(repertoire: string, profils = PROFILS) {
  return lancerRunGeleSimule({ repertoire, profils });
}

async function refus(promesse: Promise<unknown>): Promise<Error> {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw erreur;
  }
  throw new Error("Le run gelé a été interrogé alors qu'un refus était attendu.");
}

/** Le refus et la preuve que rien n'a été écrit : `run.json` octet pour octet, pas de `volume/`. */
async function refusSansEcriture(repertoire: string, profils = PROFILS): Promise<Error> {
  const avant = texte(repertoire, "run.json");
  const erreur = await refus(lancer(repertoire, profils));
  expect(texte(repertoire, "run.json")).toBe(avant);
  expect(existsSync(join(repertoire, "volume"))).toBe(false);
  return erreur;
}

function cle(r: { outil_id: string; mode: string; question_id: string; formulation_id: string; echantillon: number }): string {
  return [r.outil_id, r.mode, r.question_id, r.formulation_id, r.echantillon].join("|");
}

interface OutilGele {
  readonly outil_id: string;
  readonly famille: string;
  readonly inclus: boolean;
  readonly modes?: readonly string[];
  readonly alias_aveugle?: string;
  readonly modele_demande?: string;
}

/** Les requêtes que le gel prévoit, recalculées ici depuis ses trois fichiers, sans le code du plan. */
function requetesPrevues(repertoire: string): ReadonlySet<string> {
  const run = json<{ perimetre: { outils: readonly OutilGele[] } }>(repertoire, "run.json");
  const tirees = new Set(json<Tirage>(repertoire, "tirage.json").entrees.map((e) => e.question_id));
  const questions = json<readonly Question[]>(repertoire, "questions.json").filter((q) => tirees.has(q.id));
  const prevues = new Set<string>();
  for (const outil of run.perimetre.outils.filter((o) => o.famille === "assistant" && o.inclus)) {
    for (const mode of outil.modes ?? []) {
      for (const question of questions) {
        for (const formulation of question.formulations) {
          for (let echantillon = 1; echantillon <= ECHANTILLONS; echantillon++) {
            prevues.add(cle({ outil_id: outil.outil_id, mode, question_id: question.id, formulation_id: formulation.id, echantillon }));
          }
        }
      }
    }
  }
  return prevues;
}

function executerCommande(...argumentsCommande: readonly string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(RACINE, "outils/run-dry.ts"), ...argumentsCommande], {
    cwd: RACINE,
    encoding: "utf8",
  });
}

/* --------------------------------------------------------------------- cas */

describe("run gelé, cas 1 : bout en bout", () => {
  it("run gelé, cas 1 : run.json passe à en_cours (seul statut change), une réponse conforme par requête prévue, run_id du gel", async () => {
    const repertoire = copie();
    const avant = json<Objet>(repertoire, "run.json");
    expect(avant["statut"]).toBe("planifie");
    const resultat = await lancer(repertoire);
    const apres = json<Objet>(repertoire, "run.json");
    expect(erreurDeSchema("run", apres, "run.json après démarrage")).toBeNull();
    expect(apres).toEqual({ ...avant, statut: "en_cours" });
    expect(Object.keys(apres)).toEqual(Object.keys(avant));
    expect(resultat.demarrage).toBe("demarre");
    expect(resultat.disposition.run).toBe(repertoire);
    expect(resultat.disposition.reponses).toBe(join(repertoire, "volume", "reponses"));

    const reponses = DepotReponses.ouvrir(join(repertoire, "volume", "reponses")).toutes();
    const prevues = requetesPrevues(repertoire);
    expect(prevues.size).toBeGreaterThan(0);
    expect(resultat.execution).toEqual({ ecrites: prevues.size, deja_ecrites: 0, en_attente_operateur: [] });
    expect(reponses).toHaveLength(prevues.size);
    expect(new Set(reponses.map(cle))).toEqual(prevues);
    expect(new Set(reponses.map((r) => r.run_id))).toEqual(new Set([avant["id"]]));
    for (const reponse of reponses) expect(erreurDeSchema("reponse", reponse, reponse.id)).toBeNull();
  });

  it("run gelé, cas 1 : alias aveugle, modèle demandé et fenêtre viennent du gel ; la clé d'API simulée n'est écrite nulle part", async () => {
    const repertoire = copie();
    const run = json<{ perimetre: { outils: readonly OutilGele[] }; fenetre: { debut: string; fin: string } }>(repertoire, "run.json");
    const alpha = run.perimetre.outils.find((o) => o.outil_id === "outil-alpha");
    await lancer(repertoire);
    const reponses = DepotReponses.ouvrir(join(repertoire, "volume", "reponses")).toutes();
    expect(new Set(reponses.map((r) => r.alias_aveugle))).toEqual(new Set([alpha?.alias_aveugle]));
    const debut = Date.parse(run.fenetre.debut);
    const fin = Date.parse(run.fenetre.fin);
    for (const reponse of reponses) {
      const envoi = Date.parse(reponse.requete.horodatage);
      expect(envoi).toBeGreaterThanOrEqual(debut);
      expect(envoi).toBeLessThan(fin);
      if (reponse.statut_reponse === "obtenue") expect(reponse.metadonnees.modele_demande).toBe(alpha?.modele_demande);
    }
    const fichiers = arborescence(repertoire).map((relatif) => join(repertoire, relatif)).filter((chemin) => chemin.endsWith(".json") || chemin.endsWith(".jsonl"));
    expect(fichiers.filter((chemin) => readFileSync(chemin, "utf8").includes(CLE_API))).toEqual([]);
  });
});

describe("run gelé, cas 2 : seules les questions tirées sont interrogées", () => {
  it("run gelé, cas 2 : une question de questions.json non tirée n'apparaît dans aucune requête", async () => {
    const repertoire = copie();
    const tirees = new Set(json<Tirage>(repertoire, "tirage.json").entrees.map((e) => e.question_id));
    const non_tirees = json<readonly Question[]>(repertoire, "questions.json").filter((q) => !tirees.has(q.id));
    expect(non_tirees.length).toBeGreaterThan(0);
    await lancer(repertoire);
    const reponses = DepotReponses.ouvrir(join(repertoire, "volume", "reponses")).toutes();
    expect(new Set(reponses.map((r) => r.question_id))).toEqual(tirees);
    const corps = reponses.map((r) => JSON.stringify(r.requete.corps));
    for (const question of non_tirees) {
      for (const formulation of question.formulations) expect(corps.filter((c) => c.includes(JSON.stringify(formulation.texte).slice(1, -1)))).toEqual([]);
    }
  });
});

describe("run gelé, cas 3 : entrée du tirage absente de questions.json", () => {
  it("run gelé, cas 3 : refus nommé question_introuvable, rien d'écrit", async () => {
    const repertoire = copie();
    const premiere = json<Tirage>(repertoire, "tirage.json").entrees[0]?.question_id;
    const questions = json<readonly Question[]>(repertoire, "questions.json").filter((q) => q.id !== premiere);
    ecrireJson(repertoire, "questions.json", questions);
    const run = json<Objet>(repertoire, "run.json");
    const declaration = run["questions"] as Objet;
    ecrireJson(repertoire, "run.json", { ...run, questions: { ...declaration, sha256: sha256(texte(repertoire, "questions.json")) } });
    const erreur = await refusSansEcriture(repertoire);
    expect(erreur).toBeInstanceOf(RunGeleRefuse);
    expect((erreur as RunGeleRefuse).motif).toBe("question_introuvable");
    expect(erreur.message).toContain(String(premiere));
  });

  it("run gelé, cas 3 : la garde interne de questionsTirees, inatteignable depuis lireRunGele (constat 31), lève une erreur d'invariant et non un RunGeleRefuse", () => {
    const repertoire = copie();
    const tirage = json<Tirage>(repertoire, "tirage.json");
    const premiere = tirage.entrees[0]?.question_id;
    const questions = json<readonly Question[]>(repertoire, "questions.json").filter((q) => q.id !== premiere);
    expect(() => questionsTirees(repertoire, { tirage, questions })).toThrow(Error);
    try {
      questionsTirees(repertoire, { tirage, questions });
      throw new Error("devait lever");
    } catch (erreur) {
      expect(erreur).not.toBeInstanceOf(RunGeleRefuse);
      expect(erreur).toBeInstanceOf(Error);
      expect((erreur as Error).message).toContain(String(premiere));
      expect((erreur as Error).message).toContain("Invariant");
    }
  });
});

describe("run gelé, cas 4 : un octet de plus dans tirage.json ou questions.json", () => {
  for (const [fichier, motif] of [
    ["tirage.json", "empreinte_differente"],
    ["questions.json", "questions_empreinte"],
  ] as const) {
    it(`run gelé, cas 4 : ${fichier} modifié d'un octet ⇒ refus nommé ${motif}, run.json intact, volume/ absent`, async () => {
      const repertoire = copie();
      writeFileSync(join(repertoire, fichier), `${texte(repertoire, fichier)} `, "utf8");
      const erreur = await refusSansEcriture(repertoire);
      expect(erreur).toBeInstanceOf(RunGeleRefuse);
      expect((erreur as RunGeleRefuse).motif).toBe(motif);
      expect(erreur.message).toContain(fichier);
    });
  }
});

describe("run gelé, cas 5 : run.json invalide au schéma", () => {
  it("run gelé, cas 5 : refus à la frontière (ErreurSchema), rien d'écrit", async () => {
    const repertoire = copie();
    const { fenetre: _fenetre, ...sans_fenetre } = json<Objet>(repertoire, "run.json");
    ecrireJson(repertoire, "run.json", sans_fenetre);
    const erreur = await refusSansEcriture(repertoire);
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain("run.json");
  });

  it("run gelé, cas 5 : fenêtre dont la fin n'est pas début + 48 h ⇒ refus nommé fenetre_incoherente, rien d'écrit", async () => {
    const repertoire = copie();
    const run = json<Objet>(repertoire, "run.json");
    const fenetre = run["fenetre"] as { debut: string; fin: string };
    ecrireJson(repertoire, "run.json", { ...run, fenetre: { ...fenetre, fin: "2026-12-03T07:00:00+01:00" } });
    const erreur = await refusSansEcriture(repertoire);
    expect(erreur).toBeInstanceOf(RunGeleRefuse);
    expect((erreur as RunGeleRefuse).motif).toBe("fenetre_incoherente");
  });

  it("run gelé, cas 5 : run.json qui n'est pas du JSON ⇒ refus nommé run_json_illisible", async () => {
    const repertoire = copie();
    writeFileSync(join(repertoire, "run.json"), "{ pas du json", "utf8");
    const erreur = await refusSansEcriture(repertoire);
    expect(erreur).toBeInstanceOf(RunGeleRefuse);
    expect((erreur as RunGeleRefuse).motif).toBe("run_json_illisible");
  });
});

/** Un exemple valide du schéma au statut voulu, rattaché aux fichiers du gel (chemins et empreintes). */
function exempleRattache(repertoire: string, nom: string): Objet {
  const gele = json<Objet>(repertoire, "run.json");
  const exemple = JSON.parse(readFileSync(join(EXEMPLES, nom), "utf8")) as Objet;
  const tirage = { ...(exemple["tirage"] as Objet), ...(gele["tirage"] as Objet) };
  return { ...exemple, id: gele["id"], tirage, questions: gele["questions"] };
}

describe("run gelé, cas 6 : un run qui ne démarre pas", () => {
  for (const [statut, exemple] of [
    ["publie", "valide-01-mensuel-publie.json"],
    ["publie_provisoire", "valide-02-provisoire-juge-retire.json"],
    ["invalide", "valide-06-invalide-deux-juges-retires.json"],
  ] as const) {
    it(`run gelé, cas 6 : statut ${statut} ⇒ refus nommé statut_de_depart, rien d'écrit`, async () => {
      const repertoire = copie();
      const run = exempleRattache(repertoire, exemple);
      expect(run["statut"]).toBe(statut);
      expect(erreurDeSchema("run", run, exemple)).toBeNull();
      ecrireJson(repertoire, "run.json", run);
      const erreur = await refusSansEcriture(repertoire);
      expect(erreur).toBeInstanceOf(TransitionRefusee);
      expect((erreur as TransitionRefusee).motif).toBe("statut_de_depart");
    });
  }

  it("run gelé, cas 6 : planifie portant une invalidation (invaliderRun) ⇒ refus nommé porte_une_invalidation, rien d'écrit", async () => {
    const repertoire = copie();
    invaliderRun(repertoire, MOTIF, APRES_GEL_MS);
    expect(json<Objet>(repertoire, "run.json")["statut"]).toBe("planifie");
    const erreur = await refusSansEcriture(repertoire);
    expect(erreur).toBeInstanceOf(TransitionRefusee);
    expect((erreur as TransitionRefusee).motif).toBe("porte_une_invalidation");
  });
});

describe("run gelé, cas 7 : reprise d'un run en_cours", () => {
  it("run gelé, cas 7 : relancé, pas de nouvelle transition, run.json octet pour octet, aucune réponse réécrite", async () => {
    const repertoire = copie();
    const premier = await lancer(repertoire);
    const run_avant = texte(repertoire, "run.json");
    const reponses = join(repertoire, "volume", "reponses");
    const fichiers_avant = new Map(readdirSync(reponses).map((nom) => [nom, readFileSync(join(reponses, nom), "utf8")]));
    const second = await lancer(repertoire);
    expect(second.demarrage).toBe("reprend");
    expect(second.execution).toEqual({ ecrites: 0, deja_ecrites: premier.execution.ecrites, en_attente_operateur: [] });
    expect(second.execution.deja_ecrites).toBeGreaterThan(0);
    expect(texte(repertoire, "run.json")).toBe(run_avant);
    expect(new Map(readdirSync(reponses).map((nom) => [nom, readFileSync(join(reponses, nom), "utf8")]))).toEqual(fichiers_avant);
    expect(second.bilan).toEqual(premier.bilan);
  });
});

describe("run gelé, cas 8 : la ligne de commande", () => {
  it("run gelé, cas 8 : --run=<répertoire> nominal ⇒ code 0, bilan imprimé, run.json en_cours", () => {
    const repertoire = copie();
    const resultat = executerCommande(`--run=${repertoire}`);
    expect(resultat.stderr).toBe("");
    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toContain(repertoire);
    expect(resultat.stdout).toContain("en_cours");
    expect(resultat.stdout).toMatch(/outil-alpha\s+web_activee\s+obtenues/);
    expect(json<Objet>(repertoire, "run.json")["statut"]).toBe("en_cours");
    const relance = executerCommande(`--run=${repertoire}`);
    expect(relance.status).toBe(0);
    expect(relance.stdout).toContain("reprise");
  });

  it("run gelé, cas 8 : --run sous runs/ du dépôt ⇒ refus SimuleSousRuns avant toute lecture, runs/ inchangé", () => {
    for (const argument of [[`--run=${join(RUNS_DU_PROJET, "2026-12-01")}`], ["--run=runs/2026-12-01"]]) {
      const resultat = executerCommande(...argument);
      expect(resultat.status).not.toBe(0);
      expect(resultat.stderr).toContain("SimuleSousRuns");
      expect(resultat.stdout).toBe("");
    }
    expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
  });

  it("run gelé, cas 8 : --run sans valeur ⇒ refus nommé", () => {
    for (const argument of [["--run"], ["--run="], ["--run", "--sortie=/tmp/x"]]) {
      const resultat = executerCommande(...argument);
      expect(resultat.status).not.toBe(0);
      expect(resultat.stderr).toContain("ArgumentsRunDryRefuses");
      expect(resultat.stderr).toContain("--run attend un chemin");
      expect(resultat.stdout).toBe("");
    }
  });

  it("run gelé, cas 8 : --run vers un répertoire sans run.json ⇒ refus nommé run_json_illisible, rien d'écrit", () => {
    const repertoire = join(temporaire("banc-run-gele-vide-"), "2026-12-01");
    mkdirSync(repertoire);
    const resultat = executerCommande(`--run=${repertoire}`);
    expect(resultat.status).not.toBe(0);
    expect(resultat.stderr).toContain("RunGeleRefuse");
    expect(resultat.stderr).toContain("run_json_illisible");
    expect(readdirSync(repertoire)).toEqual([]);
  });

  it("run gelé, cas 8 : --run et --sortie ensemble ⇒ refus nommé, rien d'écrit", () => {
    const repertoire = copie();
    const sortie = temporaire("banc-run-gele-sortie-");
    const avant = texte(repertoire, "run.json");
    const resultat = executerCommande(`--run=${repertoire}`, `--sortie=${sortie}`);
    expect(resultat.status).not.toBe(0);
    expect(resultat.stderr).toContain("ArgumentsRunDryRefuses");
    expect(resultat.stderr).toContain("--run et --sortie");
    expect(texte(repertoire, "run.json")).toBe(avant);
    expect(existsSync(join(repertoire, "volume"))).toBe(false);
    expect(readdirSync(sortie)).toEqual([]);
  });
});

describe("run gelé, cas 9 : outil interrogé sans profil simulé", () => {
  it("run gelé, cas 9 : refus nommé ProfilSimuleAbsent, ni run.json ni volume/ écrits", async () => {
    const repertoire = copie();
    const profils = join(temporaire("banc-run-gele-profils-"), "profils.json");
    writeFileSync(profils, JSON.stringify({ cle_api: "cle-fictive", profils: { "outil-autre": ["reponse"] } }), "utf8");
    const erreur = await refusSansEcriture(repertoire, profils);
    expect(erreur).toBeInstanceOf(ProfilSimuleAbsent);
    expect(erreur.message).toContain("outil-alpha");
  });
});

describe("run gelé, cas 10 : temporaire laissé par une écriture interrompue", () => {
  it("run gelé, cas 10 : run.json.demarrage présent ⇒ refus nommé TemporaireOrphelin qui le nomme, pas d'écrasement, volume/ absent", async () => {
    const repertoire = copie();
    const temporaire_laisse = join(repertoire, "run.json.demarrage");
    writeFileSync(temporaire_laisse, "reste d'une écriture interrompue", "utf8");
    const erreur = await refusSansEcriture(repertoire);
    expect(erreur).toBeInstanceOf(TemporaireOrphelin);
    expect((erreur as TemporaireOrphelin).name).toBe("TemporaireOrphelin");
    expect(erreur.message).toContain(temporaire_laisse);
    expect(erreur.message).toContain("demarrage");
    expect(readFileSync(temporaire_laisse, "utf8")).toBe("reste d'une écriture interrompue");
  });
});

describe("run gelé, cas 12 : run en_cours qui porte une invalidation", () => {
  it("run gelé, cas 12 : invalidé pendant la fenêtre, relancé ⇒ refus nommé porte_une_invalidation, rien d'écrit", async () => {
    const repertoire = copie();
    await lancer(repertoire);
    invaliderRun(repertoire, MOTIF, APRES_GEL_MS);
    const run = json<Objet>(repertoire, "run.json");
    expect(run["statut"]).toBe("en_cours");
    expect(run["invalidation"]).toBeDefined();
    const avant = texte(repertoire, "run.json");
    const reponses = join(repertoire, "volume", "reponses");
    const fichiers_avant = arborescence(join(repertoire, "volume"));
    const erreur = await refus(lancer(repertoire));
    expect(erreur).toBeInstanceOf(TransitionRefusee);
    expect((erreur as TransitionRefusee).motif).toBe("porte_une_invalidation");
    expect(texte(repertoire, "run.json")).toBe(avant);
    expect(arborescence(join(repertoire, "volume"))).toEqual(fichiers_avant);
    expect(readdirSync(reponses).length).toBeGreaterThan(0);
  });
});
