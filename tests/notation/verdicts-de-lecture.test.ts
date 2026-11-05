/**
 * D87 (option 1) : l'écriture du verdict d'une lecture de comparateur dès que sa note est retenue
 * (§6 : deux humains à l'aveugle qui s'accordent, ou le troisième qui arbitre leur divergence), dans
 * `verdicts/`, par l'écrivain des verdicts des réponses (`pipeline/notation/verdicts-de-lecture.ts`).
 * Sur un run écrit sur disque (`run-fictif.ts`, un comparateur inclus), puis lu par `pnpm analyze` :
 * la note d'une lecture n'a qu'une source, le verdict que la notation publie (D75 (16)).
 */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyserRun, lireEntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { dispositionRunNote, lireVerdicts } from "../../analysis/lecture-run.ts";
import type { LectureComparateur } from "../../analysis/types.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { identifiantDerive } from "../../pipeline/notation/chaine.ts";
import { echantillonHumainDuRun } from "../../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../../pipeline/notation/lectures-comparateur.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import type { VerdictProduit } from "../../analysis/types-notation.ts";
import { ecrireVerdictsDeLecture, type CadreDeLecture, type EtatLecturesDuRun } from "../../pipeline/notation/verdicts-de-lecture.ts";
import { arbitrage, doubleNotation, EXACTE, INEXACTE, poserLecturesAffichees } from "./lectures-sur-disque.ts";
import { poserRunNote, RUN_ID, type RunFictif } from "./run-fictif.ts";

// Run écrit sur disque dans un dépôt jetable, puis analysé (~2 à 4 s par test) : même limite large
// que les autres tests de bout en bout, aucune assertion n'en dépend.
vi.setConfig({ testTimeout: 60_000 });

const DATE = "2026-12-07T10:00:00+01:00";
const PLUS_TARD = "2026-12-20T10:00:00+01:00";
const PARAMETRES = { reechantillonnages: 20, permutations: 20 };

/** Le cadre que la chaîne passe (`chaine.ts:passerLectures`) : identifiant dérivé, date de l'exécution. */
function cadre(date: string = DATE): CadreDeLecture {
  return (lecture_id) => ({ verdict_id: identifiantDerive([RUN_ID, "verdict", lecture_id]), date });
}

let fictif: RunFictif;
let lectures: readonly LectureComparateur[];

beforeEach(() => {
  fictif = poserRunNote();
  lectures = poserLecturesAffichees(fictif.repertoire_run);
});
afterEach(() => fictif.nettoyer());

function depot(): DepotNotation {
  return DepotNotation.ouvrir(fictif.repertoire_run);
}

function ecrire(date: string = DATE): EtatLecturesDuRun {
  return ecrireVerdictsDeLecture(fictif.repertoire_run, depot(), cadre(date));
}

function premiere(): LectureComparateur {
  const [lecture] = lectures;
  if (lecture === undefined) throw new Error("aucune lecture posée");
  return lecture;
}

function verdictsDeLecture(): readonly VerdictProduit[] {
  return lireVerdicts(fictif.repertoire_run, RUN_ID).filter((v) => v.objet_note.type === "lecture_comparateur");
}

function verdictDe(lecture_id: string): VerdictProduit {
  const trouve = verdictsDeLecture().find((v) => v.objet_note.id === lecture_id);
  if (trouve === undefined) throw new Error(`aucun verdict pour ${lecture_id}`);
  return trouve;
}

function attentesDe(etat: EtatLecturesDuRun): ReadonlyMap<string, string> {
  if (etat.statut !== "notees") throw new Error(`lectures non jouées : ${etat.motif}`);
  return new Map(etat.attentes.map((a) => [a.lecture_id, a.statut]));
}

/** Le contenu de chaque fichier de `verdicts/`, par nom. */
function octetsDesVerdicts(): ReadonlyMap<string, string> {
  const dossier = dispositionRunNote(fictif.repertoire_run).verdicts;
  return new Map(readdirSync(dossier).map((f) => [f, readFileSync(join(dossier, f), "utf8")]));
}

describe("D87 : le verdict d'une lecture est écrit dès que sa note est retenue", () => {
  it("D87 deux humains d'accord ⇒ verdict écrit avec leur note, sous le mode des lectures, hors échantillon", () => {
    const lecture = premiere();
    const sources = [doubleNotation(depot(), lecture, "a1", INEXACTE), doubleNotation(depot(), lecture, "a2", INEXACTE)];
    const etat = ecrire();
    expect(etat).toMatchObject({ statut: "notees", verdicts: [lecture.id] });
    const verdict = verdictDe(lecture.id);
    expect(verdict).toMatchObject({
      id: identifiantDerive([RUN_ID, "verdict", lecture.id]),
      objet_note: { type: "lecture_comparateur", id: lecture.id },
      categorie_retenue: "inexacte",
      motif_inexactitude_retenu: "position_opposee",
      mode_resolution: "lecture_comparateur_humaine",
      dans_echantillon_humain: false,
      desaccord_juges: false,
      date: DATE,
    });
    expect([...verdict.notations_sources].sort()).toEqual(sources.map((n) => n.id).sort());
    expect(verdict.revue_humaine?.annotateurs).toEqual(["a1", "a2"]);
    // Les autres lectures, sans notation, restent sans verdict et sont nommées.
    expect(attentesDe(etat).size).toBe(lectures.length - 1);
    expect(verdictsDeLecture()).toHaveLength(1);
  });

  it("D87 désaccord ⇒ pas de verdict tant que le troisième humain n'a pas tranché ; puis le verdict porte la note de l'arbitrage", () => {
    const lecture = premiere();
    doubleNotation(depot(), lecture, "a1", EXACTE);
    doubleNotation(depot(), lecture, "a2", INEXACTE);
    expect(attentesDe(ecrire()).get(lecture.id)).toBe("a_arbitrer");
    expect(verdictsDeLecture()).toEqual([]);

    const arbitre = arbitrage(depot(), lecture, "a3", INEXACTE);
    const etat = ecrire(PLUS_TARD);
    expect(etat).toMatchObject({ statut: "notees", verdicts: [lecture.id] });
    const verdict = verdictDe(lecture.id);
    expect(verdict).toMatchObject({ categorie_retenue: "inexacte", mode_resolution: "lecture_comparateur_humaine", date: PLUS_TARD });
    expect(verdict.notations_sources).toHaveLength(3);
    expect(verdict.notations_sources).toContain(arbitre.id);
    expect(verdict.revue_humaine?.annotateurs).toEqual(["a1", "a2", "a3"]);
  });

  it("D87 un seul humain a noté ⇒ pas de verdict, la lecture est rendue à noter", () => {
    const lecture = premiere();
    doubleNotation(depot(), lecture, "a1", EXACTE);
    const etat = ecrire();
    expect(attentesDe(etat).get(lecture.id)).toBe("a_noter");
    expect(etat).toMatchObject({ statut: "notees", verdicts: [] });
    expect(verdictsDeLecture()).toEqual([]);
  });

  it("D87 relance idempotente : un verdict déjà écrit n'est ni recalculé ni réécrit, même à une autre date (comportement des verdicts de réponses)", () => {
    const lecture = premiere();
    doubleNotation(depot(), lecture, "a1", EXACTE);
    doubleNotation(depot(), lecture, "a2", EXACTE);
    const premierPassage = ecrire(DATE);
    const avant = octetsDesVerdicts();
    const second = ecrire(PLUS_TARD);
    expect(second).toEqual(premierPassage);
    expect(octetsDesVerdicts()).toEqual(avant);
    expect(verdictDe(lecture.id).date).toBe(DATE);
  });

  it("D87 lectures pas encore collectées (comparateur inclus, dossier absent) : rien n'est écrit, et l'absence est dite", () => {
    rmSync(dispositionRunNote(fictif.repertoire_run).lectures_comparateur, { recursive: true });
    const avant = octetsDesVerdicts();
    expect(ecrire()).toEqual({ statut: "non_jouees", motif: "lectures_non_collectees" });
    expect(octetsDesVerdicts()).toEqual(avant);
  });
});

/* ------------------------------------------------------------------ bout en bout */

function analyser(): Record<string, unknown> {
  const options = { items: fictif.items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun, sous_echantillon_application: questionsDuSousEchantillonDuRun, etats_des_lectures: etatsDesLectures };
  return analyserRun(lireEntreesDuRun(fictif.repertoire_run, options), PARAMETRES, null) as Record<string, unknown>;
}

function comparateursPublies(document: Record<string, unknown>): readonly Record<string, unknown>[] {
  const section = document["comparateurs"] as { statut: string; comparateurs: Record<string, unknown>[] };
  expect(section.statut).toBe("calcule");
  return section.comparateurs;
}

describe("D87 de bout en bout : notations de lecture → verdict écrit → pnpm analyze lit le taux", () => {
  it("D87 toutes les lectures affichées ont leur verdict : couverture et exactitude publiées, sans motif d'absence", () => {
    for (const lecture of lectures) {
      doubleNotation(depot(), lecture, "a1", EXACTE);
      doubleNotation(depot(), lecture, "a2", EXACTE);
    }
    expect(ecrire()).toEqual({ statut: "notees", verdicts: lectures.map((l) => l.id), attentes: [] });
    const [publie, ...autres] = comparateursPublies(analyser());
    expect(autres).toEqual([]);
    expect(publie).not.toHaveProperty("motif_absence");
    expect(publie).toMatchObject({
      outil_id: "comparateur-gamma",
      couverture: { taux: { numerateur: lectures.length, denominateur: lectures.length } },
      exactitude: { taux: { numerateur: lectures.length, denominateur: lectures.length } },
    });
  });

  it("D87 une lecture affichée sans verdict (un seul humain) : le comparateur est absent, motif lectures_sans_verdict, la lecture nommée", () => {
    const [seule, ...notees] = lectures;
    if (seule === undefined) throw new Error("aucune lecture posée");
    for (const lecture of notees) {
      doubleNotation(depot(), lecture, "a1", EXACTE);
      doubleNotation(depot(), lecture, "a2", EXACTE);
    }
    doubleNotation(depot(), seule, "a1", EXACTE);
    expect(attentesDe(ecrire())).toEqual(new Map([[seule.id, "a_noter"]]));
    expect(comparateursPublies(analyser())).toEqual([{ outil_id: "comparateur-gamma", motif_absence: "lectures_sans_verdict", lectures_sans_verdict: [seule.id] }]);
  });
});

it("D87 : aucune lecture n'a de verdict avant la notation humaine (la notation n'en invente pas)", () => {
  expect(existsSync(dispositionRunNote(fictif.repertoire_run).lectures_comparateur)).toBe(true);
  const etat = ecrire();
  expect([...attentesDe(etat).values()].every((s) => s === "a_noter")).toBe(true);
  expect(verdictsDeLecture()).toEqual([]);
});
