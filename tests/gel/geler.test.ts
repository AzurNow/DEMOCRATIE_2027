/**
 * Lot gel, PR 1 : `pnpm geler` sur fixtures (décisions D41, D44). Chaque cas limite du brief a son
 * test, nommé « cas n ». Tous les gels visent un dépôt Git jetable (`fixtures.ts`) et une sortie
 * temporaire ; `runs/` du projet est photographié avant et après, et ne doit pas bouger (cas 3).
 *
 * Lot gel, PR 2a (D44, D45 (1), D46) : la balise et l'engagement au bout de la chaîne, nommés
 * « balise, cas n » ; le réseau est rejoué par `pipeline/gel/reseau-simule.ts`, jamais appelé.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import { lireRunJson } from "../../analysis/lecture-run.ts";
import { ECHANTILLONS } from "../../pipeline/interrogation/conditions.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { STATUT_AU_GEL } from "../../pipeline/gel/assemblage.ts";
import { BaliseRefusee, identifiantDuRun, QUICKNET, RELAIS, urlTour, valeursDesGraines } from "../../pipeline/gel/balise.ts";
import { DepotSale } from "../../pipeline/gel/depot.ts";
import { RunDejaGele, SortieSousRuns } from "../../pipeline/gel/destination.ts";
import { ConfigurationGelIncomplete } from "../../pipeline/gel/configuration.ts";
import { OutilDeSonEditeurHorsDuRun } from "../../pipeline/gel/editeurs.ts";
import { DEPOT_PUBLIC, EngagementRefuse } from "../../pipeline/gel/engagement.ts";
import { DELAI_APPEL_RESEAU_MS, lectureParFetch } from "../../pipeline/gel/reseau.ts";
import type { Envoi } from "../../pipeline/gel/reseau.ts";
import { geler, GelBloque, texteItemsAContester } from "../../pipeline/gel/geler.ts";
import { OrdreDesInstantsRefuse } from "../../pipeline/gel/instants.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { FormulationsEnDefautAuGel } from "../../pipeline/reformulation/lecture-au-gel.ts";
import { FamilleDeJugeAbsente, JugesDeMemeFamille } from "../../pipeline/notation/familles-juges.ts";
import { tableAliasCandidats } from "../../analysis/alias-candidats.ts";
import { identifiantAttribution } from "../../pipeline/questions/engendrement.ts";
import type { Item, Mesure } from "../../pipeline/questions/types.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
import { head, RACINE_PROJET } from "../aides/depot.ts";
import {
  ALPHA,
  BETA,
  CONFIGURATION_GEL,
  depotDuJeu,
  engagementDe,
  GEL,
  GEL_MINUIT_TRENTE,
  HORODATAGE_ENGAGEMENT,
  itemFDeData,
  itemPDeData,
  mesureFictive,
  optionsGel,
  PROTOCOLE_DE_FIXTURE,
  recommiter,
  relue,
  tachesDuJeu,
} from "./fixtures.ts";
import type { Jeu } from "./fixtures.ts";
import { ITEM_FIN_AU_GEL, ITEM_P1, jeuEcartTolere, jeuNominal, jeuRouge, MESURE_FISC_1 } from "./jeux.ts";
import { capturePresente, octetsJson, relaisSimules, reponseJson, reponseTour, waybackSimulee } from "../../pipeline/gel/reseau-simule.ts";

const DATE = "2026-12-01";
const RUNS_DU_PROJET = join(RACINE_PROJET, "runs");
/** `GEL` tombe exactement sur l'émission de ce tour (`tests/gel/balise.test.ts`, cas 1). */
const TOUR_DU_GEL = 34426612;
const ARCHIVES = RELAIS.map((relais) => `balise/${relais.nom}.json`);
/** D47 (3) : la réponse brute de l'API de disponibilité de la Wayback Machine. */
const ARCHIVE_WAYBACK = "engagement/wayback.json";
const FICHIERS_DU_RUN = ["balise", ...ARCHIVES, "engagement", ARCHIVE_WAYBACK, "questions.json", "run.json", "tirage.json"].sort();

function sha256(octets: string | Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

/* ------------------------------------------------------------------ outillage */

const temporaires: string[] = [];

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

function depot(jeu: Jeu): string {
  const racine = depotDuJeu(jeu);
  temporaires.push(racine);
  return racine;
}

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

/** Tous les chemins sous un répertoire, triés : une photographie de ce qui existe. */
function arborescence(racine: string): readonly string[] {
  if (!existsSync(racine)) return [];
  return readdirSync(racine, { recursive: true, encoding: "utf8" }).sort();
}

let runsAvant: readonly string[];

beforeAll(() => {
  runsAvant = arborescence(RUNS_DU_PROJET);
});

afterAll(() => {
  // Cas 3 : aucun test n'écrit dans runs/ du projet.
  expect(arborescence(RUNS_DU_PROJET)).toEqual(runsAvant);
});

async function refusDe(options: OptionsGel): Promise<Error> {
  try {
    await geler(options);
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("Le gel a été accepté alors qu'un refus était attendu.");
}

function lire(repertoire: string, nom: string): string {
  return readFileSync(join(repertoire, nom), "utf8");
}

function json(repertoire: string, nom: string): Record<string, unknown> {
  return JSON.parse(lire(repertoire, nom)) as Record<string, unknown>;
}

/** Un gel nominal vers une sortie neuve ; rend la sortie et le répertoire du run. */
async function gelNominal(jeu: Jeu = jeuNominal()) {
  const racine = depot(jeu);
  const sortie = temporaire("banc-gel-sortie-");
  const resultat = await geler(optionsGel(racine, sortie));
  return { racine, sortie, resultat, run: join(sortie, DATE) };
}

/* ------------------------------------------------------------------ nominal */

describe("gel nominal", () => {
  it("écrit run.json, tirage.json et questions.json, statut planifie, commits inscrits", async () => {
    const { racine, run, resultat } = await gelNominal();
    expect(readdirSync(run).sort()).toEqual(["balise", "engagement", "questions.json", "run.json", "tirage.json"]);
    expect(readdirSync(join(run, "balise")).sort()).toEqual(RELAIS.map((relais) => `${relais.nom}.json`).sort());
    const objet = json(run, "run.json");
    expect(objet["statut"]).toBe("planifie");
    expectTypeOf<typeof STATUT_AU_GEL>().toEqualTypeOf<"planifie">();
    expect(objet["type_run"]).toBe("pilote");
    // D45 (1) : l'identifiant est dérivé de date_gel et de l'aléa du tour, jamais tiré.
    expect(objet["id"]).toBe(identifiantDuRun(Date.parse(GEL), reponseTour(TOUR_DU_GEL).randomness));
    // Balise, cas 12 : versions.protocole_sha256 est l'empreinte de docs/PROTOCOLE.md du dépôt de fixture.
    expect(objet["versions"]).toEqual({
      protocole: CONFIGURATION_GEL.version_protocole,
      protocole_sha256: sha256(PROTOCOLE_DE_FIXTURE),
      code_commit: head(racine),
      donnees_commit: head(racine),
    });
    expect(objet["fenetre"]).toEqual({ debut: CONFIGURATION_GEL.fenetre_debut, fin: "2026-12-03T06:00:00.000+01:00" });
    expect(objet["taux_echantillon_humain"]).toBe(0.1);
    expect((objet["juges"] as Record<string, unknown>[]).map((juge) => juge["retire"])).toEqual([false, false]);
    expect((objet["symetrie"] as Record<string, unknown>)["statut_global"]).toBe("vert");
    expect(resultat.repertoire).toBe(run);
  });

  it("D44 : engendree_le de chaque question vaut date_gel", async () => {
    const { run } = await gelNominal();
    const questions = JSON.parse(lire(run, "questions.json")) as { engendree_le: string }[];
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) expect(question.engendree_le).toBe(jeuNominal().date_gel);
  });

  it("run.json référence tirage.json par son chemin sous runs/<date>/ et le SHA-256 de ses octets", async () => {
    const { run } = await gelNominal();
    const tirage = json(run, "run.json")["tirage"] as Record<string, unknown>;
    const { createHash } = await import("node:crypto");
    expect(tirage["chemin"]).toBe(`runs/${DATE}/tirage.json`);
    expect(tirage["sha256"]).toBe(createHash("sha256").update(readFileSync(join(run, "tirage.json"))).digest("hex"));
    expect(tirage["nombre_questions"]).toBe((json(run, "tirage.json")["entrees"] as unknown[]).length);
  });

  it("D59 (17) : run.json inscrit au gel le nombre de réponses prévues par le plan, sans réponses obtenues", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    const outils = (objet["perimetre"] as { outils: { famille: string; inclus: boolean; modes?: string[] }[] }).outils;
    const interroges = outils.filter((o) => o.famille === "assistant" && o.inclus);
    expect(interroges.every((o) => o.modes !== undefined)).toBe(true);
    const modes = interroges.flatMap((o) => o.modes ?? []).length;
    const tirees = new Set((json(run, "tirage.json")["entrees"] as { question_id: string }[]).map((e) => e.question_id));
    const questions = JSON.parse(lire(run, "questions.json")) as { id: string; formulations: unknown[] }[];
    const formulations = questions.filter((q) => tirees.has(q.id)).reduce((total, q) => total + q.formulations.length, 0);
    expect(modes).toBeGreaterThan(0);
    expect(objet["reponses"]).toEqual({ echantillons_par_question: 2, prevues: modes * formulations * 2 });
  });

  it("D75 (14) : run.json inscrit au gel le nombre d'échantillons du §6, et le plan relu du gel le suit", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    expect((objet["reponses"] as { echantillons_par_question: number }).echantillons_par_question).toBe(ECHANTILLONS);
    const plan = requetesDuPlanDuRun(run, lireRunJson(run));
    expect(plan).toHaveLength((objet["reponses"] as { prevues: number }).prevues);
    expect(new Set(plan.map((requete) => requete.echantillon))).toEqual(new Set([1, 2]));
  });

  it("D75 (14) : planifier avec 1 échantillon inscrit au gel : planifie 1, pas 2 (levier 2 → 1 du §12, plan relu du gel)", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    const prevues = (objet["reponses"] as { prevues: number }).prevues;
    writeFileSync(join(run, "run.json"), `${JSON.stringify({ ...objet, reponses: { echantillons_par_question: 1, prevues: prevues / 2 } }, null, 2)}\n`, "utf8");
    const plan = requetesDuPlanDuRun(run, lireRunJson(run));
    expect(plan).toHaveLength(prevues / 2);
    expect(new Set(plan.map((requete) => requete.echantillon))).toEqual(new Set([1]));
  });

  it("D75 (14) : run.json sans nombre d'échantillons : refusé par le schéma, aucun nombre supposé", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    const { echantillons_par_question: _retire, ...reponses } = objet["reponses"] as Record<string, unknown>;
    expect(() => valider("run", { ...objet, reponses }, "run.json sans echantillons_par_question")).toThrow(/echantillons_par_question/);
  });

  it("D48 (4), cas 6 : run.json déclare questions.json par son chemin sous runs/<date>/ et le SHA-256 de ses octets exacts", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    const { createHash } = await import("node:crypto");
    expect(objet["questions"]).toEqual({
      chemin: `runs/${DATE}/questions.json`,
      sha256: createHash("sha256").update(readFileSync(join(run, "questions.json"))).digest("hex"),
    });
    expect(Object.keys(objet).indexOf("questions")).toBe(Object.keys(objet).indexOf("tirage") + 1);
  });

  it("les alias aveugles de config/gel.json sont inscrits au périmètre du run", async () => {
    const { run } = await gelNominal();
    const outils = (json(run, "run.json")["perimetre"] as { outils: Record<string, unknown>[] }).outils;
    expect(outils.map((outil) => [outil["outil_id"], outil["alias_aveugle"]])).toEqual([["outil-alpha", "O07"]]);
  });
});

/* ------------------------------------------------------------------ cas limites */

describe("cas 1 : dépôt sale", () => {
  it("cas 1 : un fichier suivi modifié ⇒ refus avant toute lecture coûteuse, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    // Un item rendu illisible : s'il était lu, l'erreur serait celle du JSON, pas celle du dépôt.
    writeFileSync(join(racine, "data/items", `${ITEM_P1.id}.json`), "{ pas du JSON", "utf8");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(DepotSale);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 1 : un fichier non suivi ⇒ refus, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    writeFileSync(join(racine, "brouillon.txt"), "non suivi", "utf8");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(DepotSale);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 1 : un fichier que .gitignore exclut ne rend pas le dépôt sale", async () => {
    const racine = depot(jeuNominal());
    writeFileSync(join(racine, ".gitignore"), "*.local\n", "utf8");
    recommiter(racine, "gitignore");
    writeFileSync(join(racine, "notes.local"), "ignoré", "utf8");
    const sortie = temporaire("banc-gel-sortie-");
    await geler(optionsGel(racine, sortie));
    expect(existsSync(join(sortie, DATE, "run.json"))).toBe(true);
  });
});

describe("cas 2 : runs/<date>/ existe déjà", () => {
  it("cas 2 : <sortie>/<date>/ vide ⇒ refus, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    mkdirSync(join(sortie, DATE));
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(RunDejaGele);
    expect(arborescence(sortie)).toEqual([DATE]);
  });

  it("cas 2 : runs/<date>/ du dépôt lu, vide (que Git ne voit pas) ⇒ refus sans --sortie", async () => {
    const racine = depot(jeuNominal());
    mkdirSync(join(racine, "runs", DATE), { recursive: true });
    expect(await refusDe(optionsGel(racine, undefined))).toBeInstanceOf(RunDejaGele);
    expect(arborescence(join(racine, "runs"))).toEqual([DATE]);
  });

  it("cas 2 : un second gel vers la même sortie est refusé, le premier reste intact", async () => {
    const { racine, sortie, run } = await gelNominal();
    const avant = lire(run, "run.json");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(RunDejaGele);
    expect(lire(run, "run.json")).toBe(avant);
  });
});

describe("cas 3 : --sortie", () => {
  it("cas 3 : sans --sortie, le gel écrit sous runs/ du dépôt lu, et seulement là", async () => {
    const racine = depot(jeuNominal());
    await geler(optionsGel(racine, undefined));
    expect(readdirSync(join(racine, "runs", DATE)).sort()).toEqual(["balise", "engagement", "questions.json", "run.json", "tirage.json"]);
    expect(readdirSync(join(racine, "runs"))).toEqual([DATE]);
  });

  it("cas 3 : une --sortie sous runs/ du dépôt lu est refusée, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const sortie = join(racine, "runs", "essai");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(SortieSousRuns);
    expect(existsSync(join(racine, "runs"))).toBe(false);
  });
});

describe("cas 4 : date du répertoire", () => {
  it("cas 4 : date_gel à 00:30 heure de Paris, veille en UTC ⇒ répertoire à la date de Paris", async () => {
    const racine = depot(jeuNominal(GEL_MINUIT_TRENTE));
    const sortie = temporaire("banc-gel-sortie-");
    await geler(optionsGel(racine, sortie));
    expect(new Date(GEL_MINUIT_TRENTE).toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(readdirSync(sortie)).toEqual([DATE]);
    const run = json(join(sortie, DATE), "run.json");
    expect(run["date_gel"]).toBe(GEL_MINUIT_TRENTE);
    expect((run["tirage"] as Record<string, unknown>)["chemin"]).toBe(`runs/${DATE}/tirage.json`);
  });
});

describe("cas 5 : validité au gel", () => {
  it("cas 5 : item dont valide_au = date_gel exactement ⇒ exclu du tirage, compté à part", async () => {
    const { run } = await gelNominal();
    const tirage = json(run, "tirage.json") as {
      entrees: { question_id: string }[];
      exclusions: { question_id: string; motif: string; candidat_id: string }[];
    };
    const questions = JSON.parse(lire(run, "questions.json")) as { id: string; grappe_id: string }[];
    const surItem = questions.filter((question) => question.grappe_id === ITEM_FIN_AU_GEL.id).map((question) => question.id);
    expect(surItem.length).toBeGreaterThan(0);
    // Engendrées au gel (le jeu est complet), jamais tirées, chacune comptée à part avec son motif.
    expect(tirage.entrees.filter((entree) => surItem.includes(entree.question_id))).toEqual([]);
    const exclues = tirage.exclusions.filter((exclusion) => surItem.includes(exclusion.question_id));
    expect(exclues.map((exclusion) => exclusion.question_id).sort()).toEqual([...surItem].sort());
    expect(new Set(exclues.map((exclusion) => exclusion.motif))).toEqual(new Set(["hors_validite"]));
  });
});

describe("§7.12 : familles de juges au gel", () => {
  const [premier, second] = CONFIGURATION_GEL.juges;
  if (premier === undefined || second === undefined) throw new Error("fixture sans deux juges");

  async function refusAvecJuges(juges: readonly unknown[]): Promise<{ erreur: Error; sortie: string }> {
    const racine = depot({ ...jeuNominal(), configuration: { ...CONFIGURATION_GEL, juges } });
    const sortie = temporaire("banc-gel-sortie-");
    return { erreur: await refusDe(optionsGel(racine, sortie)), sortie };
  }

  it("deux juges de la même famille (casse différente) ⇒ JugesDeMemeFamille, rien écrit", async () => {
    const { erreur, sortie } = await refusAvecJuges([{ ...premier, famille_modele: "Anthropic" }, { ...second, famille_modele: "anthropic" }]);
    expect(erreur).toBeInstanceOf(JugesDeMemeFamille);
    expect(arborescence(sortie)).toEqual([]);
  });

  it.each(["   ", "\t"])("famille faite d'espaces %j ⇒ FamilleDeJugeAbsente, rien écrit", async (famille) => {
    const { erreur, sortie } = await refusAvecJuges([premier, { ...second, famille_modele: famille }]);
    expect(erreur).toBeInstanceOf(FamilleDeJugeAbsente);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("deux familles distinctes ⇒ le gel s'écrit", async () => {
    const { run } = await gelNominal();
    expect(existsSync(join(run, "run.json"))).toBe(true);
  });

  // §7 (protocole 0.31, D73 (7)) : la liste déclarée au gel, vide comprise, est publiée avec le run.
  it("D73 (7) : run.json porte la liste déclarée des outils de l'éditeur de chaque juge, vide comprise", async () => {
    const { run } = await gelNominal();
    const juges = json(run, "run.json")["juges"] as { juge_id: string; outils_de_son_editeur: string[] }[];
    expect(juges.map((j) => [j.juge_id, j.outils_de_son_editeur])).toEqual([
      ["juge-1", ["outil-alpha"]],
      ["juge-2", []],
    ]);
  });

  it("D73 (7) : un outil de la liste hors du périmètre du run ⇒ OutilDeSonEditeurHorsDuRun, rien écrit", async () => {
    const { erreur, sortie } = await refusAvecJuges([premier, { ...second, outils_de_son_editeur: ["outil-inconnu"] }]);
    expect(erreur).toBeInstanceOf(OutilDeSonEditeurHorsDuRun);
    expect(erreur.message).toContain("outil-inconnu");
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("cas 6 et 7 : formulations relues", () => {
  it("cas 6 : une question engendrée sans formulation relue ⇒ FormulationsEnDefautAuGel, rien écrit", async () => {
    let retiree = "";
    const racine = depot({
      ...jeuNominal(),
      formulations: (taches) => {
        const [premiere, ...reste] = taches;
        if (premiere === undefined) throw new Error("jeu sans question");
        retiree = premiere.question.id;
        return reste.map(relue);
      },
    });
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(FormulationsEnDefautAuGel);
    expect((erreur as FormulationsEnDefautAuGel).defauts).toEqual([
      { question_id: retiree, motif: "absente", detail: expect.any(String) as unknown },
    ]);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 7 : position de l'item changée depuis la relecture (D43) ⇒ refus, rien écrit", async () => {
    const nominal = jeuNominal();
    const corrige = itemPDeData({ cle: "gel-p1", candidat_id: ITEM_P1.candidat_id, mesure: MESURE_FISC_1, position: "contre" });
    expect(corrige.id).toBe(ITEM_P1.id);
    // Les formulations ont été relues sur l'item d'avant (« pour ») ; data/items porte la correction.
    const racine = depot({
      ...nominal,
      items: nominal.items.map((item) => (item.id === ITEM_P1.id ? corrige : item)),
      formulations: () => tachesDuJeu(nominal).map(relue),
    });
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(FormulationsEnDefautAuGel);
    const motifs = (erreur as FormulationsEnDefautAuGel).defauts.map((defaut) => defaut.motif);
    expect(motifs.length).toBeGreaterThan(0);
    expect(new Set(motifs)).toEqual(new Set(["position_perimee"]));
    expect(arborescence(sortie)).toEqual([]);
  });
});

/**
 * Lot V3-1 (§7, protocole 0.21), puis D57 (1) (§5, protocole 0.22) : une Q-ATT de mesure fictive dont
 * l'item F principal est celui d'un candidat non interrogé n'est pas tirée. Jusqu'à la 0.21 (#209) elle
 * faisait refuser tout le gel ; depuis la 0.22 elle est exclue, motif `principal_non_interroge`, et le
 * gel s'écrit. `ItemPrincipalNonInterroge` (notation) ne la voit donc jamais.
 */
describe("V3-1 : item principal d'un candidat non interrogé", () => {
  const FICTIVE_RETIRE = mesureFictive("gel-fictive-retire", "immigration");
  const F_RETIRE = itemFDeData({ cle: "gel-f-retire", candidat_id: BETA.candidat_id, mesure: FICTIVE_RETIRE });
  const P_RETIRE = itemPDeData({ cle: "gel-p-retire", candidat_id: BETA.candidat_id, mesure: MESURE_FISC_1 });

  function avecRetire(items: readonly Item[], mesures: readonly Mesure[]): Jeu {
    const nominal = jeuNominal();
    return { ...nominal, retires: [BETA], items: [...nominal.items, ...items], mesures: [...nominal.mesures, ...mesures] };
  }

  // D57 (1), protocole 0.22 : ce cas attendait le refus du gel (PrincipalNonInterrogeAuTirage, #209).
  // Réécrit, pas supprimé : « elle est exclue et comptée à part dans le rapport du run, avec ce motif ».
  it("D57 (1) : Q-ATT fictive, item F principal d'un candidat retiré ⇒ gel écrit, la Q-ATT exclue (principal_non_interroge), non tirée", async () => {
    const { run } = await gelNominal(avecRetire([F_RETIRE], [FICTIVE_RETIRE]));
    const tirage = json(run, "tirage.json") as {
      entrees: { question_id: string }[];
      exclusions: { question_id: string; motif: string; detail: string; candidat_id?: string }[];
    };
    const question_id = identifiantAttribution(FICTIVE_RETIRE.id, "Q-ATT");
    expect(tirage.entrees.map((entree) => entree.question_id)).not.toContain(question_id);
    const exclusion = tirage.exclusions.find((une) => une.question_id === question_id);
    expect(exclusion?.motif).toBe("principal_non_interroge");
    expect(exclusion?.candidat_id).toBeUndefined();
    expect(exclusion?.detail).toContain(F_RETIRE.id);
    expect(exclusion?.detail).toContain(BETA.candidat_id);
  });

  it("V3-1 : la même Q-ATT, item F principal d'un candidat interrogé ⇒ gel écrit, la Q-ATT tirée", async () => {
    const nominal = jeuNominal();
    const fInterroge = itemFDeData({ cle: "gel-f-interroge", candidat_id: ALPHA.candidat_id, mesure: FICTIVE_RETIRE });
    const { run } = await gelNominal({ ...nominal, items: [...nominal.items, fInterroge], mesures: [...nominal.mesures, FICTIVE_RETIRE] });
    const tirage = json(run, "tirage.json") as { entrees: { question_id: string }[] };
    expect(tirage.entrees.map((entree) => entree.question_id)).toContain(identifiantAttribution(FICTIVE_RETIRE.id, "Q-ATT"));
  });

  it("V3-1 : seul un item non principal d'un retiré (liste d'une Q-ATT réelle) ⇒ gel écrit, l'item figé dans la liste", async () => {
    const { run } = await gelNominal(avecRetire([P_RETIRE], []));
    const tirage = json(run, "tirage.json") as { entrees: { question_id: string; items_au_gel: { reference: { item_id: string }; role: string }[] }[] };
    const entree = tirage.entrees.find((une) => une.question_id === identifiantAttribution(MESURE_FISC_1.id, "Q-ATT"));
    expect(entree?.items_au_gel.find((item) => item.reference.item_id === P_RETIRE.id)?.role).toBe("attendu_dans_liste");
  });
});

/**
 * §5.60 et §5.61 (protocole 0.27, D67 ; conformité du 2026-11-03, constat n° 3) : deux items en vigueur
 * d'un même candidat interrogé aux positions différentes sur une mesure ne font plus refuser le gel
 * (`PositionsContradictoires`) : leurs questions et la Q-ATT de la mesure sont exclues, motif
 * `positions_incompatibles`, et le gel rend la liste des items que l'auteur conteste dès le gel.
 */
describe("§5.60 : positions incompatibles au gel", () => {
  const P_CONTRE = itemPDeData({ cle: "gel-p1-contre", candidat_id: ALPHA.candidat_id, mesure: MESURE_FISC_1, position: "contre" });

  it("deux items d'ALPHA « pour » et « contre » sur une mesure ⇒ gel écrit, questions exclues et comptées, items à contester rendus", async () => {
    const nominal = jeuNominal();
    expect(ITEM_P1.candidat_id).toBe(ALPHA.candidat_id);
    expect(ITEM_P1.mesure_id).toBe(MESURE_FISC_1.id);
    expect(ITEM_P1.assertion?.position).toBe("pour");
    const { run, resultat } = await gelNominal({ ...nominal, items: [...nominal.items, P_CONTRE] });
    const tirage = json(run, "tirage.json") as {
      entrees: { question_id: string }[];
      exclusions: { question_id: string; motif: string; detail: string; candidat_id?: string }[];
    };
    const exclues = tirage.exclusions.filter((exclusion) => exclusion.motif === "positions_incompatibles");
    const attribution = identifiantAttribution(MESURE_FISC_1.id, "Q-ATT");
    expect(exclues.map((exclusion) => exclusion.question_id)).toContain(attribution);
    expect(exclues.some((exclusion) => exclusion.candidat_id === ALPHA.candidat_id)).toBe(true);
    const tirees = new Set(tirage.entrees.map((entree) => entree.question_id));
    for (const exclusion of exclues) expect(tirees.has(exclusion.question_id)).toBe(false);
    expect(resultat.items_a_contester).toEqual([
      {
        candidat_id: ALPHA.candidat_id,
        mesure_id: MESURE_FISC_1.id,
        items: [
          { item_id: ITEM_P1.id, position: "pour" },
          { item_id: P_CONTRE.id, position: "contre" },
        ].sort((a, b) => (a.item_id < b.item_id ? -1 : 1)),
      },
    ]);
    const texte = texteItemsAContester(resultat.items_a_contester);
    expect(texte).toContain("à contester dès le gel");
    expect(texte).toContain(`candidat ${ALPHA.candidat_id}, mesure ${MESURE_FISC_1.id}`);
    expect(texte).toContain(`${ITEM_P1.id} (pour)`);
    expect(texte).toContain(`${P_CONTRE.id} (contre)`);
  });

  it("aucun conflit ⇒ aucune exclusion de ce motif, aucun item à contester (non-régression)", async () => {
    const { run, resultat } = await gelNominal();
    const tirage = json(run, "tirage.json") as { exclusions: { motif: string }[] };
    expect(tirage.exclusions.filter((exclusion) => exclusion.motif === "positions_incompatibles")).toEqual([]);
    expect(resultat.items_a_contester).toEqual([]);
    expect(texteItemsAContester(resultat.items_a_contester)).toBe("");
  });
});

describe("cas 8 : barrière de symétrie", () => {
  it("cas 8 : symétrie rouge ⇒ GelBloque (code 1 en ligne de commande), rien écrit", async () => {
    const racine = depot(jeuRouge());
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(GelBloque);
    const verdict = (erreur as GelBloque).verdict;
    expect(verdict.bloque).toBe(true);
    expect(erreur.message).toContain("aucun_nom_candidat_dans_q_att");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("cas 8 : écart toléré ⇒ écrit, l'écart inscrit dans run.json#/symetrie", async () => {
    const { run } = await gelNominal(jeuEcartTolere());
    const symetrie = json(run, "run.json")["symetrie"] as { statut_global: string; conditions: Record<string, unknown>[] };
    expect(symetrie.statut_global).toBe("ecart_tolere");
    const ecart = symetrie.conditions.find((condition) => condition["code"] === "repartition_themes");
    expect(ecart?.["statut"]).toBe("ecart_tolere");
    expect(ecart?.["mesure"]).toBeGreaterThan(0);
    expect(ecart?.["commentaire"]).toContain("compensation");
  });
});

describe("cas 9 : config/gel.json incomplet", () => {
  it("cas 9 : une valeur null ⇒ refus nommant le champ, rien écrit", async () => {
    const racine = depot({ ...jeuNominal(), configuration: { ...CONFIGURATION_GEL, juges: null } });
    const sortie = temporaire("banc-gel-sortie-");
    const erreur = await refusDe(optionsGel(racine, sortie));
    expect(erreur).toBeInstanceOf(ConfigurationGelIncomplete);
    expect((erreur as ConfigurationGelIncomplete).champs).toEqual(["juges"]);
    expect(arborescence(sortie)).toEqual([]);
  });
});

/* --------------------------------------------------- pnpm symmetry sur la sortie */

function symmetry(racine: string, run: string) {
  const resultat = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(RACINE_PROJET, "outils/symmetry.ts"),
      `--tirage=${join(run, "tirage.json")}`,
      `--questions=${join(run, "questions.json")}`,
      `--items=${join(racine, "data/items")}`,
      `--mesures=${join(racine, "data/mesures")}`,
      `--run=${join(run, "run.json")}`,
    ],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("cas 10 : mesure modifiée après donnees_commit", () => {
  it("cas 10 : pnpm symmetry refuse une mesure modifiée depuis le gel (MesuresHorsDuGel)", async () => {
    const { racine, run } = await gelNominal();
    const chemin = join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`);
    writeFileSync(chemin, `${JSON.stringify({ ...MESURE_FISC_1, libelle: "retouchée après le gel" }, null, 2)}\n`, "utf8");
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("MesuresHorsDuGel");
    expect(resultat.erreur).toContain(`${MESURE_FISC_1.id}.json modifié depuis le gel`);
    expect(resultat.sortie).not.toContain("Contrôles verts");
  });

  it("cas 10 : pnpm symmetry refuse une mesure modifiée puis commitée après le gel", async () => {
    const { racine, run } = await gelNominal();
    const chemin = join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`);
    writeFileSync(chemin, `${JSON.stringify({ ...MESURE_FISC_1, libelle: "retouchée après le gel" }, null, 2)}\n`, "utf8");
    recommiter(racine, "mesure retouchée après le gel");
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${MESURE_FISC_1.id}.json modifié depuis le gel`);
  });

  it("cas 10 : pnpm symmetry refuse une mesure ajoutée ou retirée après le gel", async () => {
    const { racine, run } = await gelNominal();
    rmSync(join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`));
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${MESURE_FISC_1.id}.json absent des mesures reçues`);
  });

  it("cas 10 : le gel refuse une mesure modifiée après le dernier commit, rien écrit", async () => {
    const racine = depot(jeuNominal());
    const chemin = join(racine, "data/mesures", `${MESURE_FISC_1.id}.json`);
    writeFileSync(chemin, `${JSON.stringify({ ...MESURE_FISC_1, libelle: "retouchée" }, null, 2)}\n`, "utf8");
    const sortie = temporaire("banc-gel-sortie-");
    expect(await refusDe(optionsGel(racine, sortie))).toBeInstanceOf(DepotSale);
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("cas 11 : reproductibilité", () => {
  it("cas 11, balise, cas 9 : deux gels du même commit et de la même balise ⇒ les trois fichiers et les archives de balise identiques octet pour octet", async () => {
    // D45 (1) : l'identifiant du run ne se choisit plus, il est dérivé de date_gel et de l'aléa ;
    // tirage.json (qui porte run_id et dont le générateur est amorcé par lui) et run.json sont donc
    // identiques eux aussi, et pas seulement questions.json.
    const racine = depot(jeuNominal());
    const [a, b] = [temporaire("banc-gel-a-"), temporaire("banc-gel-b-")];
    await geler(optionsGel(racine, a));
    await geler(optionsGel(racine, b));
    expect(arborescence(join(b, DATE))).toEqual(FICHIERS_DU_RUN);
    expect(arborescence(join(a, DATE))).toEqual(FICHIERS_DU_RUN);
    for (const nom of ["questions.json", "tirage.json", "run.json", ...ARCHIVES, ARCHIVE_WAYBACK]) {
      expect(readFileSync(join(b, DATE, nom))).toEqual(readFileSync(join(a, DATE, nom)));
    }
    expect(json(join(a, DATE), "tirage.json")["run_id"]).toBe(json(join(a, DATE), "run.json")["id"]);
  });

  it("cas 11 : deux balises différentes (deux date_gel) ⇒ identifiants et graines différents, chacun dérivé de sa balise", async () => {
    const racine_a = depot(jeuNominal());
    const racine_b = depot(jeuNominal(GEL_MINUIT_TRENTE));
    const [a, b] = [temporaire("banc-gel-a-"), temporaire("banc-gel-b-")];
    await geler(optionsGel(racine_a, a));
    await geler(optionsGel(racine_b, b));
    const [run_a, run_b] = [json(join(a, DATE), "run.json"), json(join(b, DATE), "run.json")];
    const [balise_a, balise_b] = [run_a["balise"] as { tour: number; alea: string }, run_b["balise"] as { tour: number; alea: string }];
    expect(balise_a.tour).not.toBe(balise_b.tour);
    expect(run_a["id"]).not.toBe(run_b["id"]);
    expect(run_b["id"]).toBe(identifiantDuRun(Date.parse(GEL_MINUIT_TRENTE), balise_b.alea));
    expect(json(join(b, DATE), "tirage.json")["run_id"]).toBe(run_b["id"]);
    const graines_b = run_b["graines"] as Record<string, { valeur: number }>;
    expect(Object.fromEntries(Object.entries(graines_b).map(([nom, graine]) => [nom, graine.valeur]))).toEqual(valeursDesGraines(balise_b.alea));
  });
});

describe("cas 12 : écriture tout ou rien", () => {
  it("cas 12 : une erreur à l'écriture du troisième fichier ne laisse aucun fichier", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    let appels = 0;
    const ecrire = (chemin: string, contenu: string | Uint8Array): void => {
      appels += 1;
      if (appels === 3) throw new Error("disque plein (simulé)");
      writeFileSync(chemin, contenu, { encoding: "utf8", flag: "wx" });
    };
    const erreur = await refusDe(optionsGel(racine, sortie, { ecrire }));
    expect(erreur.message).toBe("disque plein (simulé)");
    expect(appels).toBe(3);
    // Ni le répertoire du run, ni le temporaire, ni aucun des deux fichiers déjà écrits.
    expect(arborescence(sortie)).toEqual([]);
  });
});

describe("cas 13 : bout en bout", () => {
  it("cas 13 : la sortie du gel passe pnpm symmetry avec ses cinq options", async () => {
    const { racine, run } = await gelNominal();
    const resultat = symmetry(racine, run);
    expect(resultat.erreur).not.toContain("non évaluée");
    expect(resultat.erreur).not.toContain("Le run ne peut pas être lancé");
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toContain("statut global : vert");
    expect(resultat.sortie).toContain("Contrôles verts : le run peut être lancé.");
  });

  it("cas 13 : un gel à écart toléré passe aussi pnpm symmetry, écart imprimé", async () => {
    const { racine, run } = await gelNominal(jeuEcartTolere());
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toContain("statut global : ecart_tolere");
  });
});

/* ------------------------------------------------ PR 2a : balise et engagement */

interface BaliseDuRun {
  chaine: Record<string, unknown>;
  tour: number;
  signature: string;
  alea: string;
  relais: { base: string; url: string; chemin: string; sha256: string }[];
  cles: Record<string, string>;
  cle_identifiant: string;
}

describe("balise, cas 11 : run.json porte la balise et l'engagement", () => {
  it("balise, cas 11 : run.json passe le schéma ; balise et engagement exigés de tout run, pilote compris (D47 (2))", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    expect(() => valider("run", objet, "run.json du gel")).not.toThrow();
    // D73 (11) : un run mensuel ne porte jamais le motif type_run_exclu du pilote ; sa désignation suit son type.
    const mensuel = { ...objet, type_run: "mensuel", application_testee: { designe: true, mois_utc: "2026-12" } };
    expect(() => valider("run", mensuel, "run.json du gel, mensuel")).not.toThrow();
    const { balise: _b, ...sans_balise } = objet;
    expect(() => valider("run", { ...sans_balise, type_run: "mensuel" }, "sans balise")).toThrow(/balise/);
    const { engagement: _e, ...sans_engagement } = objet;
    expect(() => valider("run", { ...sans_engagement, type_run: "mensuel" }, "sans engagement")).toThrow(/engagement/);
    expect(objet["type_run"]).toBe("pilote");
    expect(() => valider("run", sans_balise, "pilote sans balise")).toThrow(/balise/);
    expect(() => valider("run", sans_engagement, "pilote sans engagement")).toThrow(/engagement/);
  });

  it("la balise inscrite : chaîne, tour, signature, aléa recalculé, relais et empreinte de chaque archive, clés", async () => {
    const { run } = await gelNominal();
    const balise = json(run, "run.json")["balise"] as BaliseDuRun;
    const tour = reponseTour(TOUR_DU_GEL);
    expect(balise.chaine).toEqual({ ...QUICKNET });
    expect(balise.tour).toBe(TOUR_DU_GEL);
    expect(balise.signature).toBe(tour.signature);
    expect(balise.alea).toBe(sha256(Buffer.from(tour.signature, "hex")));
    expect(balise.relais.map((relais) => relais.base)).toEqual(RELAIS.map((relais) => relais.base));
    expect(balise.relais.map((relais) => relais.url)).toEqual(RELAIS.map((relais) => urlTour(relais, TOUR_DU_GEL)));
    expect(balise.relais.map((relais) => relais.chemin)).toEqual(ARCHIVES.map((archive) => `runs/${DATE}/${archive}`));
    for (const [rang, archive] of ARCHIVES.entries()) {
      const octets = readFileSync(join(run, archive));
      // Règle 7 : la réponse brute, octet pour octet, et son empreinte.
      expect(Buffer.from(octets)).toEqual(Buffer.from(octetsJson(tour)));
      expect(balise.relais[rang]?.sha256).toBe(sha256(octets));
    }
    expect(balise.cles).toEqual({
      tirage: "tirage",
      echantillon_humain: "echantillon_humain",
      bootstrap: "bootstrap",
      permutation: "permutation",
      contrefactuel: "contrefactuel",
      alias_candidats: "alias_candidats",
    });
    expect(balise.cle_identifiant).toBe("run_id");
    const graines = json(run, "run.json")["graines"] as Record<string, { valeur: number }>;
    expect(Object.fromEntries(Object.entries(graines).map(([nom, graine]) => [nom, graine.valeur]))).toEqual(valeursDesGraines(balise.alea));
  });

  it("§7 (protocole 0.20), D55 (9) : run.json porte la table alias aveugle des candidats interrogés, recalculée de la graine", async () => {
    const { run } = await gelNominal();
    const objet = json(run, "run.json");
    const graine = (objet["graines"] as Record<string, GraineTirage>)["alias_candidats"] as GraineTirage;
    const candidats = (objet["perimetre"] as { candidats: { candidat_id: string; interroge: boolean }[] }).candidats;
    const interroges = candidats.filter((candidat) => candidat.interroge);
    const table = objet["alias_candidats"] as Record<string, string>;
    expect(table).toEqual(tableAliasCandidats(interroges, graine));
    expect(Object.keys(table).sort()).toEqual(interroges.map((_, rang) => `C${rang + 1}`).sort());
    for (const candidat of candidats.filter((c) => !c.interroge)) expect(Object.values(table)).not.toContain(candidat.candidat_id);
  });

  it("l'engagement inscrit : l'URL de capture et son horodatage", async () => {
    const { racine, run } = await gelNominal();
    const page = `${DEPOT_PUBLIC}/commit/${head(racine)}`;
    const url_disponibilite = `https://archive.org/wayback/available?${new URLSearchParams({ url: page, timestamp: HORODATAGE_ENGAGEMENT }).toString()}`;
    const archive = readFileSync(join(run, ARCHIVE_WAYBACK));
    // D47 (3), règle 7 : la réponse de l'API telle que reçue, octet pour octet, et son empreinte.
    expect(Buffer.from(archive)).toEqual(Buffer.from(octetsJson(capturePresente(page, HORODATAGE_ENGAGEMENT))));
    expect(json(run, "run.json")["engagement"]).toEqual({
      url: engagementDe(head(racine)),
      horodatage: HORODATAGE_ENGAGEMENT,
      disponibilite: { url: url_disponibilite, chemin: `runs/${DATE}/${ARCHIVE_WAYBACK}`, sha256: sha256(archive) },
    });
  });

  it("balise, cas 11 : la sortie du gel passe pnpm symmetry, archives de balise comprises", async () => {
    const { racine, run } = await gelNominal();
    expect(arborescence(run)).toEqual(FICHIERS_DU_RUN);
    const resultat = symmetry(racine, run);
    expect(resultat.status).toBe(0);
    expect(resultat.sortie).toContain("Contrôles verts : le run peut être lancé.");
  });
});

/** Un gel refusé : l'erreur, et la preuve que rien n'est écrit. */
async function refusSansEcriture(surcharges: (racine: string) => Partial<OptionsGel>) {
  const racine = depot(jeuNominal());
  const sortie = temporaire("banc-gel-sortie-");
  const erreur = await refusDe(optionsGel(racine, sortie, surcharges(racine)));
  expect(arborescence(sortie)).toEqual([]);
  return erreur;
}

describe("balise, cas 3, 4 et 7 : refus de la balise, rien écrit", () => {
  it("balise, cas 3 : les deux relais diffèrent par la signature ⇒ refus, rien écrit", async () => {
    const autre = reponseTour(TOUR_DU_GEL + 1);
    const relais = relaisSimules((url) => (url === urlTour(RELAIS[1] as (typeof RELAIS)[number], TOUR_DU_GEL) ? reponseJson({ ...autre, round: TOUR_DU_GEL }) : undefined));
    const erreur = await refusSansEcriture(() => ({ relais: relais.lire }));
    expect(erreur).toBeInstanceOf(BaliseRefusee);
    expect((erreur as BaliseRefusee).motif).toBe("relais_en_desaccord");
  });

  it("balise, cas 3 : les deux relais diffèrent par le tour ⇒ refus, rien écrit", async () => {
    const relais = relaisSimules((url) =>
      url === urlTour(RELAIS[0] as (typeof RELAIS)[number], TOUR_DU_GEL) ? reponseJson(reponseTour(TOUR_DU_GEL - 1)) : undefined,
    );
    const erreur = await refusSansEcriture(() => ({ relais: relais.lire }));
    expect((erreur as BaliseRefusee).motif).toBe("tour_different");
  });

  it("balise, cas 4 : un relais injoignable ⇒ refus, rien écrit, l'autre n'est pas retenu seul", async () => {
    const second = RELAIS[1] as (typeof RELAIS)[number];
    const relais = relaisSimules((url) => (url.startsWith(second.base) ? new Error("ENOTFOUND (simulé)") : undefined));
    const erreur = await refusSansEcriture(() => ({ relais: relais.lire }));
    expect(erreur).toBeInstanceOf(BaliseRefusee);
    expect((erreur as BaliseRefusee).motif).toBe("injoignable");
    expect((erreur as BaliseRefusee).relais).toBe(second.nom);
    // Le premier relais a répondu, et n'a pas suffi.
    expect(relais.appels.filter((url) => url.startsWith((RELAIS[0] as (typeof RELAIS)[number]).base))).toHaveLength(2);
  });

  it("balise, cas 4 : un relais en erreur HTTP ⇒ refus, rien écrit", async () => {
    const relais = relaisSimules((url) => (url === urlTour(RELAIS[1] as (typeof RELAIS)[number], TOUR_DU_GEL) ? reponseJson({}, 500) : undefined));
    const erreur = await refusSansEcriture(() => ({ relais: relais.lire }));
    expect((erreur as BaliseRefusee).motif).toBe("statut_http");
  });

  it("balise, cas 5 : randomness d'un relais ≠ SHA-256(signature) ⇒ refus, rien écrit", async () => {
    const faux = { ...reponseTour(TOUR_DU_GEL), randomness: "f".repeat(64) };
    const relais = relaisSimules((url) => (url === urlTour(RELAIS[0] as (typeof RELAIS)[number], TOUR_DU_GEL) ? reponseJson(faux) : undefined));
    expect(((await refusSansEcriture(() => ({ relais: relais.lire }))) as BaliseRefusee).motif).toBe("alea_faux");
  });

  it("balise, cas 7 : date_gel dans le futur ⇒ refus avant tout appel réseau, aucun port appelé", async () => {
    const relais = relaisSimules();
    const wayback = waybackSimulee();
    const erreur = await refusSansEcriture(() => ({
      relais: relais.lire,
      wayback: wayback.lire,
      maintenant: () => Date.parse(GEL) - 1,
    }));
    // PR 2b (D45 (4)) : le refus général d'ordre des instants précède celui du tour non émis, qui
    // reste éprouvé dans tests/gel/instants.test.ts (date_gel passée, tour pas encore émis).
    expect(erreur).toBeInstanceOf(OrdreDesInstantsRefuse);
    expect((erreur as OrdreDesInstantsRefuse).motif).toBe("gel_avant_date_gel");
    expect(relais.appels).toEqual([]);
    expect(wayback.appels).toEqual([]);
  });

  it("balise, cas 7 : date_gel à l'instant présent exact ⇒ le tour est émis, le gel passe", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    await geler(optionsGel(racine, sortie, { maintenant: () => Date.parse(GEL) }));
    expect(arborescence(join(sortie, DATE))).toEqual(FICHIERS_DU_RUN);
  });
});

describe("balise, cas 8 : engagement archivé, rien écrit", () => {
  it("balise, cas 8 : engagement absent ⇒ refus nommant --engagement, aucun appel réseau", async () => {
    const relais = relaisSimules();
    const wayback = waybackSimulee();
    const erreur = await refusSansEcriture(() => ({ engagement: undefined, relais: relais.lire, wayback: wayback.lire }));
    expect(erreur).toBeInstanceOf(EngagementRefuse);
    expect((erreur as EngagementRefuse).motif).toBe("absent");
    expect(erreur.message).toContain("--engagement");
    expect([...relais.appels, ...wayback.appels]).toEqual([]);
  });

  it("balise, cas 8 : capture d'un autre commit que HEAD ⇒ refus, la balise n'est pas lue", async () => {
    const relais = relaisSimules();
    const erreur = await refusSansEcriture(() => ({ engagement: engagementDe("a".repeat(40)), relais: relais.lire }));
    expect((erreur as EngagementRefuse).motif).toBe("autre_commit");
    expect(relais.appels).toEqual([]);
  });

  it("balise, cas 8 : capture horodatée à date_gel exactement ⇒ refus", async () => {
    const erreur = await refusSansEcriture((racine) => ({ engagement: engagementDe(head(racine), "20261201000000") }));
    expect((erreur as EngagementRefuse).motif).toBe("tardif");
  });

  it("balise, cas 8 : capture postérieure à date_gel ⇒ refus", async () => {
    const erreur = await refusSansEcriture((racine) => ({ engagement: engagementDe(head(racine), "20261201120000") }));
    expect((erreur as EngagementRefuse).motif).toBe("tardif");
  });

  it("balise, cas 8 : Wayback ne sert pas la capture ⇒ refus, la balise n'est pas lue", async () => {
    const relais = relaisSimules();
    const wayback = waybackSimulee(() => reponseJson({ archived_snapshots: {} }));
    const erreur = await refusSansEcriture(() => ({ relais: relais.lire, wayback: wayback.lire }));
    expect((erreur as EngagementRefuse).motif).toBe("non_servie");
    expect(wayback.appels).toHaveLength(1);
    expect(relais.appels).toEqual([]);
  });
});

describe("balise, cas 10 : écriture tout ou rien des archives", () => {
  it("balise, cas 10 : une erreur à l'écriture de la dernière archive de balise ne laisse aucun fichier", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    const ecrits: string[] = [];
    const ecrire = (chemin: string, contenu: string | Uint8Array): void => {
      if (chemin.endsWith(ARCHIVES[ARCHIVES.length - 1] as string)) throw new Error("disque plein à l'archive (simulé)");
      writeFileSync(chemin, contenu, { flag: "wx" });
      ecrits.push(chemin);
    };
    const erreur = await refusDe(optionsGel(racine, sortie, { ecrire }));
    expect(erreur.message).toBe("disque plein à l'archive (simulé)");
    // Les trois fichiers et la première archive ont été écrits dans le temporaire, puis retirés.
    expect(ecrits).toHaveLength(4);
    expect(arborescence(sortie)).toEqual([]);
  });

  it("D47 (3) : une erreur à l'écriture de l'archive Wayback ne laisse aucun fichier", async () => {
    const racine = depot(jeuNominal());
    const sortie = temporaire("banc-gel-sortie-");
    const ecrits: string[] = [];
    const ecrire = (chemin: string, contenu: string | Uint8Array): void => {
      if (chemin.endsWith(ARCHIVE_WAYBACK)) throw new Error("disque plein à l'archive Wayback (simulé)");
      writeFileSync(chemin, contenu, { flag: "wx" });
      ecrits.push(chemin);
    };
    const erreur = await refusDe(optionsGel(racine, sortie, { ecrire }));
    expect(erreur.message).toBe("disque plein à l'archive Wayback (simulé)");
    // Les trois fichiers et les deux archives de balise ont été écrits dans le temporaire, puis retirés.
    expect(ecrits).toHaveLength(3 + ARCHIVES.length);
    expect(arborescence(sortie)).toEqual([]);
  });
});

/** Un `fetch` qui ne répond jamais, mais respecte le signal d'abandon. */
const fetchMuet: Envoi = (_url, init) =>
  new Promise((_resolu, rejete) => {
    const signal = init.signal;
    if (signal === undefined || signal === null) {
      rejete(new Error("appel sans signal d'abandon"));
      return;
    }
    signal.addEventListener("abort", () => rejete(signal.reason));
  });

describe("D47 (4) : délai de 30 s par appel réseau", () => {
  it("le délai est une constante nommée de 30 s", () => {
    expect(DELAI_APPEL_RESEAU_MS).toBe(30_000);
  });

  it("un relais qui ne répond pas dans le délai ⇒ refus nommé (relais, URL), rien écrit, aucune nouvelle tentative", async () => {
    const appels: string[] = [];
    const muet: Envoi = (url, init) => {
      appels.push(url);
      return fetchMuet(url, init);
    };
    const erreur = await refusSansEcriture(() => ({ relais: lectureParFetch(muet, 5) }));
    expect(erreur).toBeInstanceOf(BaliseRefusee);
    expect((erreur as BaliseRefusee).motif).toBe("delai_depasse");
    expect((erreur as BaliseRefusee).relais).toBe((RELAIS[0] as (typeof RELAIS)[number]).nom);
    expect(erreur.message).toContain(`${(RELAIS[0] as (typeof RELAIS)[number]).base}/${QUICKNET.empreinte}/info`);
    expect(appels).toHaveLength(1);
  });

  it("la Wayback Machine qui ne répond pas dans le délai ⇒ refus nommé (URL), rien écrit, la balise n'est pas lue", async () => {
    const relais = relaisSimules();
    const erreur = await refusSansEcriture(() => ({ wayback: lectureParFetch(fetchMuet, 5), relais: relais.lire }));
    expect(erreur).toBeInstanceOf(EngagementRefuse);
    expect((erreur as EngagementRefuse).motif).toBe("delai_depasse");
    expect(erreur.message).toContain("https://archive.org/wayback/available?");
    expect(relais.appels).toEqual([]);
  });
});

/* --------------------------------------------------------------- ligne de commande */

function geleCli(arguments_: readonly string[]) {
  const resultat = spawnSync(process.execPath, ["--experimental-strip-types", join(RACINE_PROJET, "outils/geler.ts"), ...arguments_], {
    encoding: "utf8",
  });
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("pnpm geler en ligne de commande", () => {
  it("sans --type-run : code 1, l'option nommée, rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, `--engagement=${engagementDe("a".repeat(40))}`]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("--type-run est obligatoire");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("un --type-run hors du schéma : code 1, rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, "--type-run=hebdo", `--engagement=${engagementDe("a".repeat(40))}`]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("type_run");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("sans --engagement : code 1, la raison dite (capture Wayback, D46), rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, "--type-run=pilote"]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("--engagement est obligatoire");
    expect(resultat.erreur).toContain("Wayback");
    expect(resultat.erreur).toContain("Rien n'est écrit.");
    expect(arborescence(sortie)).toEqual([]);
  });

  it("--graines-fixes n'existe plus : option inconnue, code 1, rien écrit", () => {
    const sortie = temporaire("banc-gel-cli-");
    const resultat = geleCli([`--sortie=${sortie}`, "--type-run=pilote", "--graines-fixes=/nulle-part.json"]);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("option(s) inconnue(s) : --graines-fixes");
    expect(arborescence(sortie)).toEqual([]);
  });
});

/* -------------------------------------------------- la chaîne nominale est saine */

describe("le jeu nominal", () => {
  it("son dépôt de fixture reste propre après le gel, et le run inscrit son HEAD", async () => {
    const { racine, run } = await gelNominal();
    const versions = json(run, "run.json")["versions"] as Record<string, unknown>;
    expect(versions["code_commit"]).toBe(head(racine));
    const statut = spawnSync("git", ["status", "--porcelain"], { cwd: racine, encoding: "utf8" });
    expect(statut.stdout).toBe("");
  });
});
