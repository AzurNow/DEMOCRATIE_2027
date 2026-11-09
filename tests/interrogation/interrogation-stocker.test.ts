/**
 * `pnpm interrogation:stocker` de bout en bout (§6, 0.21) : un run gelé, une réponse gardée avant un
 * arrêt brutal, la relance qui la met en attente, puis la commande de l'opérateur qui la stocke.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { geler } from "../../pipeline/gel/geler.ts";
import { adaptateurSimule } from "../../pipeline/interrogation/editeur-simule.ts";
import { instantParis } from "../../analysis/heure-paris.ts";
import { JournalRequete, nomOctets } from "../../pipeline/interrogation/journal.ts";
import { planifier } from "../../pipeline/interrogation/plan.ts";
import { lireRunGele } from "../../pipeline/interrogation/run-gele.ts";
import { lancerRunGeleSimule, stockerRunGeleSimule } from "../../pipeline/interrogation/run-simule.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import { cleDeRequete } from "../../pipeline/interrogation/stocker.ts";
import { empreinteOctets } from "../../pipeline/interrogation/tentatives.ts";
import { cleDe, type RequetePlanifiee } from "../../pipeline/interrogation/types.ts";
import { depotDuJeu, optionsGel } from "../gel/fixtures.ts";
import { jeuNominal } from "../gel/jeux.ts";

// Bout en bout (gel, run simulé complet, lancements réels) : limite large, comme run-gele.test.ts.
vi.setConfig({ testTimeout: 60_000 });

const RACINE = resolve(import.meta.dirname, "../..");
const PROFILS = join(import.meta.dirname, "fixtures/run-gele/profils-simules.json");
/** `runs/` du projet : lu seulement pour la fenêtre d'une réexécution, jamais ici (run pilote). */
const RUNS_DU_PROJET = join(RACINE, "runs");

const temporaires: string[] = [];
let gabarit: string;

beforeAll(async () => {
  const depot = depotDuJeu(jeuNominal());
  const sortie = mkdtempSync(join(tmpdir(), "banc-stocker-gabarit-"));
  const resultat = await geler(optionsGel(depot, sortie));
  rmSync(depot, { recursive: true, force: true });
  gabarit = resultat.repertoire;
}, 60_000);

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(resolve(gabarit, ".."), { recursive: true, force: true });
});

/** Une copie du gel dont `run.json` porte `simule: true` (D92 (c)) : `geler` sans `--simule` ne l'écrit pas. */
function copie(): string {
  const parent = mkdtempSync(join(tmpdir(), "banc-stocker-"));
  temporaires.push(parent);
  const repertoire = join(parent, basename(gabarit));
  cpSync(gabarit, repertoire, { recursive: true });
  const chemin = join(repertoire, "run.json");
  const run = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  run["simule"] = true;
  writeFileSync(chemin, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return repertoire;
}

function commande(...argumentsCommande: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", join(RACINE, "outils/interrogation-stocker.ts"), ...argumentsCommande],
    { cwd: RACINE, encoding: "utf8" },
  );
}

const CORPS = new TextEncoder().encode(
  '{"id":"sim-0","type":"message","model":"modele-simule-2026-12","content":[{"type":"text","text":"Gardée avant l\'arrêt.","citations":[]}],' +
    '"stop_reason":"end_turn","usage":{"input_tokens":12,"output_tokens":34}}',
);

/** L'adaptateur de l'éditeur simulé, qui a interrogé le run gelé de ces tests. */
const RECU_PAR = adaptateurSimule("cle-de-test").normalisation;

/** La première requête du plan du run gelé, et son journal sous `volume/tentatives/`. */
function premiereRequete(repertoire: string): { readonly requete: RequetePlanifiee; readonly journal: JournalRequete; readonly debut_ms: number } {
  const gele = lireRunGele(repertoire, () => []);
  const [requete] = [...planifier(gele.outils, gele.questions_tirees, gele.echantillons).values()].flat();
  if (requete === undefined) throw new Error("plan vide");
  const tentatives = join(repertoire, "volume", "tentatives");
  mkdirSync(tentatives, { recursive: true });
  return { requete, journal: new JournalRequete(tentatives, cleDe(requete)), debut_ms: gele.fenetre.debut_ms };
}

describe("pnpm interrogation:stocker", () => {
  it("réponse gardée avant un arrêt : la relance la met en attente, la commande la stocke (code 0), le deuxième lancement ne fait rien", async () => {
    const repertoire = copie();
    const { requete, journal, debut_ms } = premiereRequete(repertoire);
    journal.inscrireDebut(1, instantParis(debut_ms), cleDe(requete));
    journal.garderReception({ numero: 1, statut_http: 200, debut_ms, reception_ms: debut_ms + 1_200, octets_sha256: empreinteOctets(CORPS), normalisation: RECU_PAR });
    journal.garderOctets(1, CORPS);
    const run = await lancerRunGeleSimule({ repertoire, profils: PROFILS, runs: RUNS_DU_PROJET });
    expect(run.execution.en_attente_operateur.map((a) => a.requete)).toEqual([cleDe(requete)]);
    const ecritesAvant = readdirSync(join(repertoire, "volume", "reponses")).length;

    const premier = commande(`--run=${repertoire}`);
    expect(premier.stderr).toBe("");
    expect(premier.status).toBe(0);
    expect(premier.stdout).toContain("Stockée");
    expect(premier.stdout).toContain(cleDeRequete(requete));
    const reponses = DepotReponses.ouvrir(join(repertoire, "volume", "reponses")).toutes();
    expect(reponses).toHaveLength(ecritesAvant + 1);
    const stockee = reponses.find((r) => cleDeRequete(r) === cleDeRequete(requete));
    expect(stockee).toMatchObject({ statut_reponse: "obtenue", run_id: lireRunGele(repertoire, () => []).run_id });
    expect(stockee?.statut_reponse === "obtenue" ? stockee.metadonnees.horodatage_reponse : null).toBe(instantParis(debut_ms + 1_200));
    expect(Array.from(readFileSync(join(repertoire, "volume", "tentatives", nomOctets(cleDe(requete), 1))))).toEqual(Array.from(CORPS));

    const second = commande(`--run=${repertoire}`);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("Rien à faire");
    expect(DepotReponses.ouvrir(join(repertoire, "volume", "reponses")).toutes()).toHaveLength(ecritesAvant + 1);
  });

  it("octets sans métadonnées de réception : refus nommé sans_metadonnees, code 2, rien d'écrit", () => {
    const repertoire = copie();
    const { requete, journal, debut_ms } = premiereRequete(repertoire);
    journal.inscrireDebut(1, instantParis(debut_ms), cleDe(requete));
    const chemin = journal.garderOctets(1, CORPS);
    journal.inscrireRecueNonStockee(1, chemin, "volume antérieur à la garde des réceptions");
    const resultat = commande(`--run=${repertoire}`, `--requete=${cleDeRequete(requete)}`);
    expect(resultat.status).toBe(2);
    expect(resultat.stdout).toContain("sans_metadonnees");
    expect(readdirSync(join(repertoire, "volume", "reponses"))).toEqual([]);
  });

  it("octets reçus par l'adaptateur d'un éditeur réel : refus nommé adaptateur_different, code 2, jamais classés par l'éditeur simulé", () => {
    const repertoire = copie();
    const { requete, journal, debut_ms } = premiereRequete(repertoire);
    journal.inscrireDebut(1, instantParis(debut_ms), cleDe(requete));
    journal.garderReception({
      numero: 1,
      statut_http: 200,
      debut_ms,
      reception_ms: debut_ms + 1_200,
      octets_sha256: empreinteOctets(CORPS),
      normalisation: { fonction: "normaliser_editeur_reel", version: "1.0.0" },
    });
    const chemin = journal.garderOctets(1, CORPS);
    journal.inscrireRecueNonStockee(1, chemin, "écriture en échec");
    const resultat = commande(`--run=${repertoire}`, `--requete=${cleDeRequete(requete)}`);
    expect(resultat.status).toBe(2);
    expect(resultat.stdout).toContain("adaptateur_different");
    expect(resultat.stdout).toContain("normaliser_editeur_reel 1.0.0");
    expect(existsSync(join(repertoire, "volume", "reponses")) ? readdirSync(join(repertoire, "volume", "reponses")) : []).toEqual([]);
  });

  it("un gel réel passé directement à stockerRunGeleSimule (sans la commande) est refusé GelNonSimule, rien d'écrit", () => {
    for (const [simule, refus_attendu] of [[undefined, "GelNonSimule"], [false, "ErreurSchema"]] as const) {
      const repertoire = copie();
      const chemin = join(repertoire, "run.json");
      const run = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
      if (simule === undefined) delete run["simule"];
      else run["simule"] = simule;
      writeFileSync(chemin, `${JSON.stringify(run, null, 2)}\n`, "utf8");
      const avant = readFileSync(chemin, "utf8");
      expect(() => stockerRunGeleSimule({ repertoire, profils: PROFILS, runs: RUNS_DU_PROJET })).toThrow(expect.objectContaining({ name: refus_attendu }));
      expect(readFileSync(chemin, "utf8")).toBe(avant);
    }
  });

  it("requête inconnue : refus nommé RequeteInconnue, code 2, rien d'écrit", () => {
    const repertoire = copie();
    const resultat = commande(`--run=${repertoire}`, `--requete=${"0".repeat(64)}`);
    expect(resultat.status).toBe(2);
    expect(resultat.stderr).toContain("RequeteInconnue");
    expect(existsSync(join(repertoire, "volume", "reponses")) ? readdirSync(join(repertoire, "volume", "reponses")) : []).toEqual([]);
  });

  it("--run absent : refus nommé, code 2", () => {
    const resultat = commande();
    expect(resultat.status).toBe(2);
    expect(resultat.stderr).toContain("ArgumentsStockageRefuses");
  });

  describe("D92 (c) : le run.json du gel doit porter simule: true", () => {
    type Objet = Record<string, unknown>;

    function copieModifiee(modifier: (run: Objet) => void): { readonly repertoire: string; readonly avant: string } {
      const repertoire = copie();
      const chemin = join(repertoire, "run.json");
      const run = JSON.parse(readFileSync(chemin, "utf8")) as Objet;
      modifier(run);
      writeFileSync(chemin, `${JSON.stringify(run, null, 2)}\n`, "utf8");
      return { repertoire, avant: readFileSync(chemin, "utf8") };
    }

    function exigerRefusSansEcriture(repertoire: string, avant: string, ...attendus: readonly string[]): void {
      const resultat = commande(`--run=${repertoire}`);
      expect(resultat.status).toBe(2);
      expect(resultat.stdout).toBe("");
      for (const attendu of attendus) expect(resultat.stderr).toContain(attendu);
      expect(readFileSync(join(repertoire, "run.json"), "utf8")).toBe(avant);
      expect(existsSync(join(repertoire, "volume", "reponses"))).toBe(false);
    }

    it("gel simule: true : chemin inchangé, rien à faire, code 0", () => {
      const repertoire = copie();
      expect(JSON.parse(readFileSync(join(repertoire, "run.json"), "utf8")).simule).toBe(true);
      const resultat = commande(`--run=${repertoire}`);
      expect(resultat.status).toBe(0);
      expect(resultat.stdout).toContain("Rien à faire");
    });

    it("simule absent : refus GelNonSimule, code 2, rien d'écrit", () => {
      const { repertoire, avant } = copieModifiee((run) => {
        delete run["simule"];
      });
      exigerRefusSansEcriture(repertoire, avant, "GelNonSimule", "simule: true");
    });

    it("simule: false (le schéma l'interdit) : refus, code 2, rien d'écrit", () => {
      const { repertoire, avant } = copieModifiee((run) => {
        run["simule"] = false;
      });
      exigerRefusSansEcriture(repertoire, avant, "simule");
    });

    it("run.json invalide au schéma : refus, code 2, rien d'écrit", () => {
      const { repertoire, avant } = copieModifiee((run) => {
        delete run["perimetre"];
      });
      exigerRefusSansEcriture(repertoire, avant, "perimetre");
    });

    it("run.json absent : refus nommé run_json_illisible conservé, rien d'écrit", () => {
      const repertoire = copie();
      rmSync(join(repertoire, "run.json"));
      const resultat = commande(`--run=${repertoire}`);
      expect(resultat.status).toBe(2);
      expect(resultat.stderr).toContain("run_json_illisible");
      expect(existsSync(join(repertoire, "volume", "reponses"))).toBe(false);
    });
  });
});
