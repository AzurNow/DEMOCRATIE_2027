/**
 * La chaîne de notation relancée sur un run pilote dont des réponses du jeu d'or sont déjà calibrées
 * par les humains (§7 « Calibration et fiabilité publiée » ; D93). Les notations du jeu d'or
 * (`calibration_jeu_or`, `arbitrage_jeu_or`) sont de contexte `run`, comme celles de la règle de
 * décision, mais n'en relèvent pas : le verdict d'une réponse ne dépend que des juges, de
 * l'échantillon de 10 % et des humains appelés par la règle de décision. La chaîne les écarte donc
 * de l'entrée de `decider` (`file-humaine.ts:separerCalibration`, seule définition du dépôt), qui
 * les refuserait (`NotationsIncoherentes`).
 *
 * Chaque cas compare deux copies du même run pilote simulé, notées à l'identique : la référence, sans
 * calibration, et la copie calibrée. Leurs verdicts et leurs attentes doivent être les mêmes, octet
 * pour octet.
 */

import { createHash } from "node:crypto";
import { cpSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTIF_ARBITRAGE_JEU_OR, MOTIF_CALIBRATION_JEU_OR, calibrationsDivergent } from "../../analysis/kappa-jeu-or.ts";
import { dispositionRunNote, lireNotationsDuRun, lireRunJson, lireVerdicts, runDeNotationDe } from "../../analysis/lecture-run.ts";
import type { MotifNotation } from "../../analysis/types.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import { identifiantDerive, noterRun, type ResultatChaine } from "../../pipeline/notation/chaine.ts";
import { VERSION_CHARGE_JUGE } from "../../pipeline/notation/charge-juge.ts";
import { tirerEchantillonHumain, tirerJeuOr } from "../../pipeline/notation/echantillons.ts";
import { environnementSimule, preparerNotationSimulee, type RunSimulePrepare } from "../../pipeline/notation/notation-simulee.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import { ecrireJson } from "./run-fictif.ts";
import { contenus, nettoyerSorties, nouvelleSortie, options, parametresDeReference } from "./simulation.ts";

// Tests de bout en bout (lancements et écritures réels) : même limite que `chaine.test.ts`.
vi.setConfig({ testTimeout: 60_000 });

const alea = vi.hoisted(() => ({ compteur: 0 }));

vi.mock("../../validation/domaine/ulid.ts", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("../../validation/domaine/ulid.ts")>();
  return {
    ...vrai,
    ulid: (maintenant?: number) => {
      alea.compteur += 1;
      return `${vrai.ulid(maintenant).slice(0, 10)}${String(alea.compteur).padStart(16, "0")}`;
    },
  };
});

beforeEach(() => {
  alea.compteur = 0;
});

afterEach(nettoyerSorties);

/* ------------------------------------------------------------------ run pilote */

/** Deux copies du même run pilote simulé, notées une première fois : la référence et la calibrée. */
interface Paire {
  readonly reference: RunSimulePrepare;
  readonly calibree: RunSimulePrepare;
  readonly premiere: ResultatChaine;
}

/** Le `run.json` gelé passé en pilote, comme `inscription-jeu-or.test.ts:runPilote` (le run qui porte le jeu d'or, D18). */
function passerEnPilote(repertoire_run: string): void {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const lu = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  const application_testee = lu["application_testee"] as { mois_utc: string };
  ecrireJson(chemin, { ...lu, type_run: "pilote", application_testee: { designe: false, mois_utc: application_testee.mois_utc, motif: "type_run_exclu" } });
}

async function noterUneFois(prepare: RunSimulePrepare): Promise<ResultatChaine> {
  return noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
}

async function deuxCopiesNotees(): Promise<Paire> {
  const sortie_reference = nouvelleSortie();
  const sortie_calibree = nouvelleSortie();
  const reference = await preparerNotationSimulee(options(sortie_reference));
  passerEnPilote(reference.repertoire_run);
  cpSync(sortie_reference, sortie_calibree, { recursive: true });
  const calibree = { ...reference, repertoire_run: reference.repertoire_run.replace(sortie_reference, sortie_calibree) };
  expect(lireRunJson(calibree.repertoire_run).type_run).toBe("pilote");
  const premiere = await noterUneFois(reference);
  expect(await noterUneFois(calibree)).toEqual(premiere);
  return { reference, calibree, premiere };
}

/** Les réponses du jeu d'or (`tirerJeuOr`, graine de l'échantillon humain, D18), sans verdict après la première passe. */
function jeuOrSansVerdict(prepare: RunSimulePrepare, premiere: ResultatChaine): ReadonlySet<string> {
  const run = runDeNotationDe(lireRunJson(prepare.repertoire_run));
  const jeu = new Set(tirerJeuOr(prepare.reponses.map((r) => r.reponse.id), run.graines.echantillon_humain).reponse_ids);
  return new Set(premiere.attentes.map((a) => a.reponse_id).filter((id) => jeu.has(id)));
}

function echantillonDe(prepare: RunSimulePrepare): ReadonlySet<string> {
  const run = runDeNotationDe(lireRunJson(prepare.repertoire_run));
  return new Set(tirerEchantillonHumain(prepare.reponses.map((r) => r.reponse.id), run.graines.echantillon_humain, run.taux_echantillon_humain));
}

/* ------------------------------------------------------------------ notations humaines */

function notationsDuJuge(prepare: RunSimulePrepare, reponse_id: string): readonly NotationIndividuelle[] {
  const run_id = lireRunJson(prepare.repertoire_run).id;
  return lireNotationsDuRun(prepare.repertoire_run, run_id).notations.filter((n) => n.contexte === "run" && n.objet_note.id === reponse_id && n.notateur.type === "juge");
}

/** La notation d'un juge reprise par un humain, sous un motif : une note que la réponse admet (extrait compris). */
function humaineDepuis(source: NotationIndividuelle, annotateur: string, motif: MotifNotation): NotationIndividuelle {
  const { notateur: _juge, ...reste } = source;
  return {
    ...reste,
    id: identifiantDerive([source.run_id, "humain-test", motif, source.objet_note.id, annotateur]),
    notateur: { type: "humain", id: annotateur, sensibilite_declaree_famille: "famille-1", a_vu_identite_outil: false },
    version_charge: VERSION_CHARGE_JUGE,
    motif_notation: motif,
    date: "2026-12-05T09:30:00+01:00",
  };
}

function ecrire(prepare: RunSimulePrepare, notations: readonly NotationIndividuelle[]): void {
  const depot = DepotNotation.ouvrir(prepare.repertoire_run);
  for (const notation of notations) depot.ecrireNotation(notation);
}

/** Deux calibrations concordantes : la note du premier juge, reprise par deux annotateurs. */
function calibrationsConcordantes(prepare: RunSimulePrepare, reponse_id: string): readonly NotationIndividuelle[] {
  const [juge] = notationsDuJuge(prepare, reponse_id);
  if (juge === undefined) throw new Error(`réponse ${reponse_id} sans notation de juge`);
  return [humaineDepuis(juge, "calibrateur-1", MOTIF_CALIBRATION_JEU_OR), humaineDepuis(juge, "calibrateur-2", MOTIF_CALIBRATION_JEU_OR)];
}

/** Deux calibrations divergentes (les deux notes des juges en désaccord), puis l'arbitre du jeu d'or (D93). */
function calibrationsArbitrees(prepare: RunSimulePrepare, reponse_id: string): readonly NotationIndividuelle[] {
  const [a, b] = notationsDuJuge(prepare, reponse_id);
  if (a === undefined || b === undefined) throw new Error(`réponse ${reponse_id} sans deux notations de juge`);
  const premiere = humaineDepuis(a, "calibrateur-1", MOTIF_CALIBRATION_JEU_OR);
  const seconde = humaineDepuis(b, "calibrateur-2", MOTIF_CALIBRATION_JEU_OR);
  expect(calibrationsDivergent(premiere, seconde)).toBe(true);
  return [premiere, seconde, humaineDepuis(a, "arbitre-jeu-or", MOTIF_ARBITRAGE_JEU_OR)];
}

/** Les réponses du jeu d'or hors échantillon que les juges laissent en désaccord : un humain les tranche (`desaccord_juges`). */
function enDesaccordHorsEchantillon(paire: Paire): readonly string[] {
  const echantillon = echantillonDe(paire.reference);
  const jeu = jeuOrSansVerdict(paire.reference, paire.premiere);
  return paire.premiere.attentes
    .filter((a) => jeu.has(a.reponse_id) && !echantillon.has(a.reponse_id) && a.motifs.length === 1 && a.motifs[0] === "desaccord_juges")
    .map((a) => a.reponse_id);
}

/** L'humain appelé par la règle de décision, écrit à l'identique dans les deux copies. */
function trancherDansLesDeux(paire: Paire, reponse_id: string): void {
  const [juge] = notationsDuJuge(paire.reference, reponse_id);
  if (juge === undefined) throw new Error(`réponse ${reponse_id} sans notation de juge`);
  const humaine = humaineDepuis(juge, "annotateur-decision", "desaccord_juges");
  ecrire(paire.reference, [humaine]);
  ecrire(paire.calibree, [humaine]);
}

async function relancerLesDeux(paire: Paire): Promise<{ readonly reference: ResultatChaine; readonly calibree: ResultatChaine }> {
  const reference = await noterUneFois(paire.reference);
  const calibree = await noterUneFois(paire.calibree);
  return { reference, calibree };
}

function verdictsDe(prepare: RunSimulePrepare): ReadonlyMap<string, string> {
  return contenus(dispositionRunNote(prepare.repertoire_run).verdicts);
}

/* ------------------------------------------------------------------ cas limites */

describe("reprise sur une réponse du jeu d'or calibrée, sans verdict", () => {
  it("les calibrations n'entrent pas dans decider : la relance rend les mêmes verdicts et les mêmes attentes que sans calibration", async () => {
    const paire = await deuxCopiesNotees();
    const sans_verdict = jeuOrSansVerdict(paire.reference, paire.premiere);
    expect(sans_verdict.size).toBeGreaterThan(0);
    const calibrables = [...sans_verdict].filter((id) => notationsDuJuge(paire.calibree, id).length > 0);
    expect(calibrables.length).toBeGreaterThan(0);
    ecrire(paire.calibree, calibrables.flatMap((id) => calibrationsConcordantes(paire.calibree, id)));
    const relance = await relancerLesDeux(paire);
    expect(relance.calibree).toEqual(relance.reference);
    expect(verdictsDe(paire.calibree)).toEqual(verdictsDe(paire.reference));
  });

  it("un humain tranche la réponse calibrée : son verdict est celui de la copie sans calibration, octet pour octet, sans calibration dans ses sources", async () => {
    const paire = await deuxCopiesNotees();
    const [cible] = enDesaccordHorsEchantillon(paire);
    expect(cible).toBeDefined();
    const id = cible as string;
    const calibrations = calibrationsConcordantes(paire.calibree, id);
    ecrire(paire.calibree, calibrations);
    trancherDansLesDeux(paire, id);
    const relance = await relancerLesDeux(paire);
    expect(relance.calibree).toEqual(relance.reference);
    expect(relance.calibree.verdicts).toContain(id);
    expect(verdictsDe(paire.calibree)).toEqual(verdictsDe(paire.reference));
    const verdict = lireVerdicts(paire.calibree.repertoire_run, relance.calibree.run_id).find((v) => v.objet_note.id === id);
    expect(verdict?.mode_resolution).toBe("tranche_humain");
    for (const calibration of calibrations) expect(verdict?.notations_sources).not.toContain(calibration.id);
  });
});

describe("même cas avec l'arbitrage du jeu d'or (D93)", () => {
  it("calibrations divergentes et arbitre arbitrage_jeu_or : verdict identique à la copie sans calibration, aucune notation du jeu d'or dans ses sources", async () => {
    const paire = await deuxCopiesNotees();
    const [cible] = enDesaccordHorsEchantillon(paire);
    expect(cible).toBeDefined();
    const id = cible as string;
    const jeu = calibrationsArbitrees(paire.calibree, id);
    ecrire(paire.calibree, jeu);
    trancherDansLesDeux(paire, id);
    const relance = await relancerLesDeux(paire);
    expect(relance.calibree).toEqual(relance.reference);
    expect(verdictsDe(paire.calibree)).toEqual(verdictsDe(paire.reference));
    const verdict = lireVerdicts(paire.calibree.repertoire_run, relance.calibree.run_id).find((v) => v.objet_note.id === id);
    expect(verdict?.mode_resolution).toBe("tranche_humain");
    for (const notation of jeu) expect(verdict?.notations_sources).not.toContain(notation.id);
  });

  // Un arbitre sans calibrations est un jeu d'or incohérent, que refusent la file humaine (FileIncoherente) et le
  // kappa (JeuOrIncoherent) ; la chaîne, qui ne lit pas le jeu d'or, n'en tire rien.
  it("arbitre du jeu d'or seul, sans humain de décision : la réponse reste en attente sous les mêmes motifs que sans lui", async () => {
    const paire = await deuxCopiesNotees();
    const [cible] = enDesaccordHorsEchantillon(paire);
    expect(cible).toBeDefined();
    const id = cible as string;
    const [juge] = notationsDuJuge(paire.calibree, id);
    if (juge === undefined) throw new Error(`réponse ${id} sans notation de juge`);
    ecrire(paire.calibree, [humaineDepuis(juge, "arbitre-jeu-or", MOTIF_ARBITRAGE_JEU_OR)]);
    const relance = await relancerLesDeux(paire);
    expect(relance.calibree).toEqual(relance.reference);
    expect(relance.calibree.attentes.find((a) => a.reponse_id === id)?.motifs).toEqual(["desaccord_juges"]);
  });
});

describe("réponse hors jeu d'or, notations de l'échantillon de 10 %", () => {
  it("run mensuel, sans jeu d'or : echantillon_aleatoire_10 puis arbitrage_echantillon_10 entrent toujours dans decider, le verdict vient de l'arbitre", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    expect(lireRunJson(prepare.repertoire_run).type_run).not.toBe("pilote");
    const premiere = await noterUneFois(prepare);
    const echantillon = echantillonDe(prepare);
    // Une réponse de l'échantillon que les deux juges notent inexacte, du même avis.
    const cible = premiere.attentes.find((a) => echantillon.has(a.reponse_id) && notationsDuJuge(prepare, a.reponse_id).some((n) => n.categorie === "inexacte"));
    expect(cible?.motifs).toEqual(["double_notation_humaine_incomplete"]);
    const id = (cible as { reponse_id: string }).reponse_id;
    const juge = notationsDuJuge(prepare, id).find((n) => n.categorie === "inexacte") as NotationIndividuelle;
    const premier_humain = humaineDepuis(juge, "annotateur-1", "echantillon_aleatoire_10");
    // Le second humain ajoute un drapeau : les deux ne s'accordent plus (§7, accord sur tous les drapeaux).
    const second_humain = { ...humaineDepuis(juge, "annotateur-2", "echantillon_aleatoire_10"), drapeaux: ["deformation" as const] };
    expect(calibrationsDivergent(premier_humain, second_humain)).toBe(true);
    ecrire(prepare, [premier_humain, second_humain]);
    const sans_arbitre = await noterUneFois(prepare);
    expect(sans_arbitre.attentes.find((a) => a.reponse_id === id)?.motifs).toEqual(["arbitrage_echantillon_manquant"]);
    const arbitre = humaineDepuis(juge, "annotateur-3", "arbitrage_echantillon_10");
    ecrire(prepare, [arbitre]);
    const avec_arbitre = await noterUneFois(prepare);
    expect(avec_arbitre.verdicts).toContain(id);
    const verdict = lireVerdicts(prepare.repertoire_run, avec_arbitre.run_id).find((v) => v.objet_note.id === id);
    expect(verdict).toMatchObject({ mode_resolution: "echantillon_humain_10", dans_echantillon_humain: true });
    for (const humaine of [premier_humain, second_humain, arbitre]) expect(verdict?.notations_sources).toContain(humaine.id);
  });
});

/**
 * Empreinte des verdicts du run simulé de référence (`pnpm run:dry`), noté une fois sans aucune
 * notation humaine : 39 fichiers, figée le 2026-11-06 sur le code d'avant le correctif (main
 * f5022fd). L'écart des notations du jeu d'or ne doit rien changer à un run qui n'en porte pas.
 * Elle ne bouge qu'avec un changement voulu de la simulation ou de la règle de décision.
 */
const EMPREINTE_VERDICTS_AVANT_CORRECTIF = "c6c0cbdd16c1b174b1e3343668c34cc9d8634d82f31fd9fe1e4598290ee9bc3e";

describe("verdicts de la masse sur le run simulé sans calibration", () => {
  it("identiques octet pour octet à ceux du code d'avant le correctif", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    await noterUneFois(prepare);
    const verdicts = verdictsDe(prepare);
    expect(verdicts.size).toBe(39);
    const empreinte = createHash("sha256");
    for (const [nom, contenu] of verdicts) empreinte.update(`${nom}\u0000${contenu}\u0000`);
    expect(empreinte.digest("hex")).toBe(EMPREINTE_VERDICTS_AVANT_CORRECTIF);
  });
});
