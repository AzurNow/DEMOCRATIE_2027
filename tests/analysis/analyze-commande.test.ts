/**
 * `pnpm analyze` sur un run écrit sur disque (`tests/notation/run-fictif.ts`) : lecture validée,
 * kappa indéfini sans effet sur l'analyse, et politique d'écriture de `metriques/metriques.json`
 * (absent : écrit ; identique : rien ; différent : refus, code 2). Lancements réels de la commande.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyserRun, cheminMetriques, empreinteDuRun, lireEntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { echantillonHumainDuRun } from "../../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../../pipeline/notation/lectures-comparateur.ts";
import { synchroniserContestationsPosterieures } from "../../pipeline/run/contestations-posterieures.ts";
import { lireItemsData } from "../../validation/io/data-items.ts";
import { contestationRecue, itemConteste } from "../aides/data.ts";
import { executerOutil } from "../aides/depot.ts";
import { ecrireJson, ITEM_P, poserLecturesNonAffichees, poserRunNote, type RunFictif } from "../notation/run-fictif.ts";

const PARAMETRES = { reechantillonnages: 20, permutations: 20 };
let fictif: RunFictif;

beforeAll(() => {
  fictif = poserRunNote();
  poserLecturesNonAffichees(fictif);
});
afterAll(() => fictif.nettoyer());

function options(run: RunFictif) {
  return { items: run.items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun, sous_echantillon_application: questionsDuSousEchantillonDuRun, etats_des_lectures: etatsDesLectures };
}

describe("pnpm analyze sur un run lu sur disque", () => {
  it("kappa indéfini : l'analyse s'exécute, et aucun kappa n'est recopié dans metriques.json", () => {
    const accord = (fictif.run["accord_humains_echantillon"] as Record<string, unknown>)["motif_indefini_kappa"];
    expect(accord).toBe("accord_attendu_maximal");
    const document = analyserRun(lireEntreesDuRun(fictif.repertoire_run, options(fictif)), PARAMETRES, null);
    expect(JSON.stringify(document)).not.toMatch(/kappa|contrefactuel/);
    // Le seul couple du run fictif est incomplet (10 requêtes sur 12 sans réponse) : rien n'est comparé.
    expect(document).toMatchObject({ taux: { statut: "sans_objet", motif: "aucun_couple_compare" }, hypotheses: { H1: { verdict: "sans_objet" }, H4: { verdict: "indecidable" } } });
  });

  it("run sans réponse de l'application : le sous-échantillon n'est pas calculé, et l'écart est sans objet avec son motif", () => {
    const refuse = () => {
      throw new Error("sous-échantillon calculé sans réponse de l'application");
    };
    const entrees = lireEntreesDuRun(fictif.repertoire_run, { ...options(fictif), sous_echantillon_application: refuse });
    expect(entrees.questions_sous_echantillon).toBeNull();
    const document = analyserRun(entrees, PARAMETRES, null);
    expect(document).toMatchObject({ exploratoire: { ecart_api_application: { statut: "sans_objet", motif: "aucune_reponse_application" } } });
  });

  it("l'empreinte de run.json ignore les champs que pnpm go-no-go écrit ensuite", () => {
    const { run } = lireEntreesDuRun(fictif.repertoire_run, options(fictif));
    const brut = run as unknown as Record<string, unknown>;
    const juges = (brut["juges"] as Record<string, unknown>[]).map((j) => ({ ...j, kappa_echantillon_humain: 0.1 }));
    const apresGoNoGo = { ...brut, juges, go_no_go: { autre: true }, accord_humains_echantillon: { autre: true } };
    expect(empreinteDuRun(apresGoNoGo)).toBe(empreinteDuRun(brut));
    // §9 (0.28, D70 (13)) : le statut, la publication et le dépôt sont aussi hors de l'empreinte
    // (tests/analysis/recalcul-b.test.ts) ; tout autre champ y reste.
    expect(empreinteDuRun({ ...brut, taux_echantillon_humain: 0.25 })).not.toBe(empreinteDuRun(brut));
  });

  it("réécriture identique : la commande ne réécrit rien et le dit (code 0)", () => {
    const chemin = cheminMetriques(fictif.repertoire_run);
    const premier = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(premier.status).toBe(0);
    expect(premier.sortie).toContain("écrit");
    const octets = readFileSync(chemin, "utf8");
    const second = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(second.status).toBe(0);
    expect(second.sortie).toContain("inchangé");
    expect(readFileSync(chemin, "utf8")).toBe(octets);
  });

  it("réécriture différente : refus MetriquesDivergentes, code 2, le fichier existant reste tel quel", () => {
    const chemin = cheminMetriques(fictif.repertoire_run);
    const altere = readFileSync(chemin, "utf8").replace('"permutations": 10000', '"permutations": 9999');
    writeFileSync(chemin, altere, "utf8");
    const resultat = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("MetriquesDivergentes");
    expect(readFileSync(chemin, "utf8")).toBe(altere);
  });

  it("--items absent : refus, code 2, rien n'est écrit", () => {
    const resultat = executerOutil("analyze.ts", [fictif.repertoire_run]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("--items est obligatoire");
  });

  it("--premier sans répertoire, ou désignant le run analysé lui-même : refus, code 2", () => {
    const sansValeur = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`, "--premier"]);
    expect(sansValeur.status).toBe(2);
    expect(sansValeur.erreur).toContain("--premier attend un répertoire de run");
    const lui = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`, `--premier=${fictif.repertoire_run}`]);
    expect(lui.status).toBe(2);
    expect(lui.erreur).toContain("PremierRunInvalide");
  });
});

/**
 * D73 (4) : le recalcul (b) de `metriques.json` porte les contestations connues à son calcul. Un run
 * où manque une contestation postérieure connue (ici, ITEM_P contesté après le commit des données
 * du gel) n'est pas analysé ; inscrite par `pnpm contestations-posterieures`, il l'est.
 */
describe("pnpm analyze et les contestations postérieures (D73 (4))", () => {
  let conteste: RunFictif;

  beforeAll(() => {
    conteste = poserRunNote();
    poserLecturesNonAffichees(conteste);
    const item = itemConteste(ITEM_P);
    ecrireJson(join(conteste.items, `${item.id}.json`), { ...item, contestations: [{ ...contestationRecue(), date_reception: "2026-12-03T09:00:00+01:00" }] });
  });
  afterAll(() => conteste.nettoyer());

  it("refuse un run où une contestation postérieure connue manque (code 2, rien n'est écrit), accepte quand tout est inscrit", () => {
    const refus = executerOutil("analyze.ts", [conteste.repertoire_run, `--items=${conteste.items}`]);
    expect(refus.status).toBe(2);
    expect(refus.erreur).toContain("ContestationsPosterieuresNonInscrites");
    expect(refus.erreur).toContain("pnpm contestations-posterieures");
    expect(existsSync(cheminMetriques(conteste.repertoire_run))).toBe(false);

    const ajouts = synchroniserContestationsPosterieures(join(conteste.bac, "runs"), conteste.items, lireItemsData(conteste.items).values(), true);
    expect(ajouts).toHaveLength(1);
    const accepte = executerOutil("analyze.ts", [conteste.repertoire_run, `--items=${conteste.items}`]);
    expect(accepte.status, accepte.erreur).toBe(0);
    expect(existsSync(cheminMetriques(conteste.repertoire_run))).toBe(true);
  });
});
