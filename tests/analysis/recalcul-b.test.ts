/**
 * §8 et §9 (protocole 0.28, D70 (13)) : « Le fichier des métriques d'un run, recalcul (b) compris sur
 * les contestations connues à son calcul, n'est jamais réécrit : après une contestation postérieure,
 * le recalcul (b) mis à jour est publié dans un fichier daté, à côté de lui » ; l'empreinte du
 * fichier du run est « calculée hors des champs de statut, de publication et de dépôt, que ce fichier
 * reçoit après l'analyse ».
 *
 * Le cœur (`recalculB`) sur un run en mémoire (`run-analysable.ts`) ; l'écriture
 * (`recalculerEtEcrireB`) et la commande `pnpm recalcul-b` sur le run fictif écrit sur disque
 * (`tests/notation/run-fictif.ts`).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyserRun, cheminMetriques, empreinteDuRun, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { cheminRecalculB, recalculB, recalculerEtEcrireB } from "../../analysis/recalcul-b.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { dateParis } from "../../pipeline/interrogation/heure-paris.ts";
import { echantillonHumainDuRun } from "../../pipeline/notation/echantillons.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { executerOutil } from "../aides/depot.ts";
import { ITEM_P, poserRunNote, type RunFictif } from "../notation/run-fictif.ts";
import { ulid } from "./fabriques.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 20, permutations: 20 };
const JOUR = "2027-01-15";

type Json = Record<string, unknown>;
interface Contestation { readonly item_id: string; readonly contestation_id: string; readonly date_reception: string }

/** Une contestation reçue après le gel (1er décembre 2026) sur un item P de candidat-b. */
const CONTESTATION: Contestation = { item_id: ulid("item-candidat-b-P-1"), contestation_id: ulid("contestation-1"), date_reception: "2026-12-20T10:00:00+01:00" };

function avecContestations(entrees: EntreesDuRun, contestations: readonly Contestation[]): EntreesDuRun {
  return { ...entrees, run: { ...entrees.run, contestations_posterieures: contestations } };
}

/** Le texte que `pnpm analyze` écrirait pour ces entrées : la référence du recalcul daté. */
function texteMetriques(entrees: EntreesDuRun): string {
  return `${JSON.stringify(valider<object>("metriques", analyserRun(entrees, PARAMETRES, null), "référence de test"), null, 2)}\n`;
}

const BASE = entreesDuRunAnalysable(SPEC_REFERENCE);
const REFERENCE_SANS = { chemin: "metriques.json", texte: texteMetriques(BASE) };

describe("recalculB : le (b) mis à jour, à côté de metriques.json", () => {
  it("aucune contestation postérieure : le recalcul daté est identique au (b) de metriques.json, et le dit", () => {
    const document = recalculB(BASE, REFERENCE_SANS, JOUR) as Json;
    expect(() => valider("recalcul-b", document, "test")).not.toThrow();
    expect(document["identique_a_la_reference"]).toBe(true);
    expect((document["entrees"] as Json)["contestations_lues"]).toEqual([]);
    const reference = JSON.parse(REFERENCE_SANS.texte) as { robustesse: { taux: { recalculs: Json[] } } };
    const b = reference.robustesse.taux.recalculs.find((r) => r["recalcul"] === "items_contestes");
    expect(document["recalcul"]).toEqual({ statut: "calcule", ...b });
  });

  it("contestation reçue avant le calcul de metriques.json : déjà dans son (b), le recalcul daté lui est identique", () => {
    const entrees = avecContestations(BASE, [CONTESTATION]);
    const reference = { chemin: "metriques.json", texte: texteMetriques(entrees) };
    const document = recalculB(entrees, reference, JOUR) as Json;
    expect(document["identique_a_la_reference"]).toBe(true);
    expect((document["entrees"] as Json)["contestations_lues"]).toEqual([CONTESTATION]);
    expect((document["reference"] as Json)["run_json_sha256"]).toBe((document["entrees"] as Json)["run_json_sha256"]);
  });

  it("contestation reçue après le calcul de metriques.json : le recalcul daté diffère, nomme la contestation et les deux empreintes du run", () => {
    const entrees = avecContestations(BASE, [CONTESTATION]);
    const document = recalculB(entrees, REFERENCE_SANS, JOUR) as Json;
    expect(document["identique_a_la_reference"]).toBe(false);
    const lues = document["entrees"] as Json;
    expect(lues["contestations_lues"]).toEqual([CONTESTATION]);
    expect(lues["run_json_sha256"]).toBe(empreinteDuRun(entrees.run));
    expect((document["reference"] as Json)["run_json_sha256"]).toBe(empreinteDuRun(BASE.run));
    expect(lues["run_json_sha256"]).not.toBe((document["reference"] as Json)["run_json_sha256"]);
    // Le (b) mis à jour est exactement celui qu'une analyse complète calculerait sur ces entrées.
    const complet = JSON.parse(texteMetriques(entrees)) as { robustesse: { taux: { recalculs: Json[] } } };
    const attendu = complet.robustesse.taux.recalculs.find((r) => r["recalcul"] === "items_contestes");
    expect(document["recalcul"]).toEqual({ statut: "calcule", ...attendu });
  });

  it("l'empreinte des contestations lues est publiée, et change avec elles", () => {
    const sans = (recalculB(BASE, REFERENCE_SANS, JOUR) as { entrees: Json }).entrees;
    const avec = (recalculB(avecContestations(BASE, [CONTESTATION]), REFERENCE_SANS, JOUR) as { entrees: Json }).entrees;
    expect(sans["contestations_sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(avec["contestations_sha256"]).not.toBe(sans["contestations_sha256"]);
  });

  it("entrées autres que les contestations changées depuis metriques.json : refus, le (b) ne mélange pas deux changements", () => {
    const entrees = { ...BASE, notations: BASE.notations.slice(1) };
    expect(() => recalculB(entrees, REFERENCE_SANS, JOUR)).toThrow(expect.objectContaining({ name: "EntreesDuRecalculDivergentes" }));
  });

  it("date mal formée : refus du schéma, rien n'est publié", () => {
    expect(() => recalculB(BASE, REFERENCE_SANS, "15/01/2027")).toThrow(expect.objectContaining({ name: "ErreurSchema" }));
  });
});

describe("empreinte de run.json : hors des champs de statut, de publication et de dépôt (§9)", () => {
  const brut = BASE.run as unknown as Json;

  it("run.json modifié seulement sur statut, publication et dépôt : même empreinte", () => {
    const publie = {
      ...brut,
      statut: "publie",
      publication: { date: "2027-01-10T09:00:00+01:00", doi: "10.5281/zenodo.1" },
      depot: { doi: "10.5281/zenodo.2", date: "2027-01-10T09:00:00+01:00", archives: [{ nom: "a", contenu: "reponses_brutes", sha256: "a".repeat(64), nombre_entrees: 1 }] },
    };
    expect(empreinteDuRun(publie)).toBe(empreinteDuRun(brut));
  });

  it("run.json modifié sur un autre champ : empreinte différente", () => {
    expect(empreinteDuRun({ ...brut, contestations_posterieures: [CONTESTATION] })).not.toBe(empreinteDuRun(brut));
    expect(empreinteDuRun({ ...brut, invalidation: { motif: "incident", date: "2026-12-02T10:00:00+01:00" } })).not.toBe(empreinteDuRun(brut));
    expect(empreinteDuRun({ ...brut, taux_echantillon_humain: 0.25 })).not.toBe(empreinteDuRun(brut));
  });
});

describe("recalculerEtEcrireB et pnpm recalcul-b, sur un run écrit sur disque", () => {
  let fictif: RunFictif;
  const options = () => ({ items: fictif.items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun, sous_echantillon_application: questionsDuSousEchantillonDuRun });

  beforeAll(() => {
    fictif = poserRunNote();
  });
  afterAll(() => fictif.nettoyer());

  it("metriques.json absent : le recalcul daté refuse, rien n'est écrit", () => {
    expect(existsSync(cheminMetriques(fictif.repertoire_run))).toBe(false);
    expect(() => recalculerEtEcrireB(fictif.repertoire_run, options(), JOUR)).toThrow(expect.objectContaining({ name: "MetriquesDeReferenceAbsentes" }));
    expect(existsSync(cheminRecalculB(fictif.repertoire_run, JOUR))).toBe(false);
  });

  it("metriques.json déjà présent et contestation postérieure : pnpm analyze refuse (MetriquesDivergentes), le fichier reste intact", () => {
    const premier = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(premier.status).toBe(0);
    const chemin = cheminMetriques(fictif.repertoire_run);
    const octets = readFileSync(chemin, "utf8");
    const cheminRun = `${fictif.repertoire_run}/run.json`;
    const contestation = { item_id: ITEM_P.id, contestation_id: ulid("contestation-disque"), date_reception: "2026-12-20T10:00:00+01:00" };
    writeFileSync(cheminRun, `${JSON.stringify({ ...fictif.run, contestations_posterieures: [contestation] }, null, 2)}\n`, "utf8");
    const second = executerOutil("analyze.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(second.status).toBe(2);
    expect(second.erreur).toContain("MetriquesDivergentes");
    expect(readFileSync(chemin, "utf8")).toBe(octets);
  });

  it("pnpm recalcul-b écrit le fichier daté du jour à côté de metriques.json, avec l'empreinte de la référence", () => {
    const resultat = executerOutil("recalcul-b.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(resultat.erreur).toBe("");
    expect(resultat.status).toBe(0);
    const chemin = cheminRecalculB(fictif.repertoire_run, dateParis(Date.now()));
    const document = valider<Json>("recalcul-b", JSON.parse(readFileSync(chemin, "utf8")), chemin);
    const reference = readFileSync(cheminMetriques(fictif.repertoire_run));
    expect((document["reference"] as Json)["metriques_json_sha256"]).toBe(createHash("sha256").update(reference).digest("hex"));
    expect((document["entrees"] as Json)["contestations_lues"]).toHaveLength(1);
  });

  it("recalcul daté déjà présent pour ce jour : refus, code 2, le fichier existant reste tel quel", () => {
    const chemin = cheminRecalculB(fictif.repertoire_run, dateParis(Date.now()));
    const octets = readFileSync(chemin, "utf8");
    const resultat = executerOutil("recalcul-b.ts", [fictif.repertoire_run, `--items=${fictif.items}`]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("RecalculBDejaPublie");
    expect(readFileSync(chemin, "utf8")).toBe(octets);
    expect(() => recalculerEtEcrireB(fictif.repertoire_run, options(), dateParis(Date.now()))).toThrow(expect.objectContaining({ name: "RecalculBDejaPublie" }));
  });
});
