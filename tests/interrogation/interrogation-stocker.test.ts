/**
 * `pnpm interrogation:stocker` de bout en bout (§6, 0.21) : un run gelé, une réponse gardée avant un
 * arrêt brutal, la relance qui la met en attente, puis la commande de l'opérateur qui la stocke.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { geler } from "../../pipeline/gel/geler.ts";
import { instantParis } from "../../pipeline/interrogation/heure-paris.ts";
import { JournalRequete, nomOctets } from "../../pipeline/interrogation/journal.ts";
import { planifier } from "../../pipeline/interrogation/plan.ts";
import { lireRunGele } from "../../pipeline/interrogation/run-gele.ts";
import { lancerRunGeleSimule } from "../../pipeline/interrogation/run-simule.ts";
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

function copie(): string {
  const parent = mkdtempSync(join(tmpdir(), "banc-stocker-"));
  temporaires.push(parent);
  const repertoire = join(parent, basename(gabarit));
  cpSync(gabarit, repertoire, { recursive: true });
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

/** La première requête du plan du run gelé, et son journal sous `volume/tentatives/`. */
function premiereRequete(repertoire: string): { readonly requete: RequetePlanifiee; readonly journal: JournalRequete; readonly debut_ms: number } {
  const gele = lireRunGele(repertoire);
  const [requete] = [...planifier(gele.outils, gele.questions_tirees).values()].flat();
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
    journal.garderReception({ numero: 1, statut_http: 200, debut_ms, reception_ms: debut_ms + 1_200, octets_sha256: empreinteOctets(CORPS) });
    journal.garderOctets(1, CORPS);
    const run = await lancerRunGeleSimule({ repertoire, profils: PROFILS });
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
    expect(stockee).toMatchObject({ statut_reponse: "obtenue", run_id: lireRunGele(repertoire).run_id });
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
});
