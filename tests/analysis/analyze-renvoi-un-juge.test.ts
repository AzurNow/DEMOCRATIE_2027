/**
 * D75 (25), de bout en bout : `pnpm analyze` sur un run écrit sur disque (`tests/notation/run-fictif.ts`)
 * dont une réponse, hors de l'échantillon humain, a été renvoyée à un humain par un seul juge (§7,
 * juge défaillant) puis tranchée par un humain. Avant D75, `ecart-juge-editeur.ts` levait sur cette
 * réponse « notée par le seul juge » : la commande échouait au premier renvoi réel. Elle rend
 * maintenant le code 0 et nomme la réponse dans `ecart_juge_editeur.reponses_renvoyees`.
 */

import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cheminMetriques } from "../../analysis/analyse-du-run.ts";
import { dispositionRunNote, lireRunJson, runDeNotationDe } from "../../analysis/lecture-run.ts";
import { decider } from "../../pipeline/notation/decision.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import { executerOutil } from "../aides/depot.ts";
import { ulid } from "./fabriques.ts";
import { notationHumaine, renvoiDefaillant } from "../notation/fabriques.ts";
import { ecrireJson, poserLecturesNonAffichees, poserRunNote, RUN_ID, type RunFictif } from "../notation/run-fictif.ts";

let fictif: RunFictif;
let renvoyee: string;

/** juge-1 renvoie la réponse hors échantillon au lieu de la noter ; un humain tranche (§7, juge défaillant). */
function renvoyerParJuge1(run: RunFictif): string {
  const hors = run.verdicts.find((v) => !v.dans_echantillon_humain);
  if (hors === undefined) throw new Error("aucune réponse hors de l'échantillon humain");
  const reponse_id = hors.objet_note.id;
  const disposition = dispositionRunNote(run.repertoire_run);
  const noteJuge1 = run.notations.find((n) => n.objet_note.id === reponse_id && n.notateur.id === "juge-1");
  if (noteJuge1 === undefined) throw new Error("aucune notation de juge-1");
  rmSync(join(disposition.notations, `${noteJuge1.id}.json`));
  rmSync(join(disposition.verdicts, `${hors.id}.json`));

  const surObjet = { objet_note: { type: "reponse" as const, id: reponse_id }, run_id: RUN_ID };
  const renvoi = renvoiDefaillant("juge-1", { ...surObjet, id: ulid("e2e-renvoi-juge-1") });
  const humain = notationHumaine("a3", "juge_defaillant", { ...surObjet, id: ulid("e2e-humain-a3") });
  const gardees = run.notations.filter((n) => n.objet_note.id === reponse_id && n.id !== noteJuge1.id);
  const reponse = run.reponses.find((r) => r.id === reponse_id);
  if (reponse === undefined) throw new Error("réponse introuvable");
  const decision = decider({
    run: runDeNotationDe(lireRunJson(run.repertoire_run)),
    objet_note: surObjet.objet_note,
    notations: [...gardees, humain],
    renvois: [renvoi],
    dans_echantillon_humain: false,
    textes: { reponse: reponse.normalise.texte, citations_reference: [] },
    verdict_id: ulid("e2e-verdict-renvoyee"),
    date: "2026-12-06T12:00:00+01:00",
  });
  if (decision.statut !== "verdict") throw new Error(`réponse ${reponse_id} en attente`);
  const depot = DepotNotation.ouvrir(run.repertoire_run);
  depot.ecrireRenvoi(renvoi);
  depot.ecrireNotation(humain);
  depot.ecrireVerdict(decision.verdict);
  return reponse_id;
}

/** §7 (D73 (7)) : la liste des outils de l'éditeur de chaque juge, déclarée au gel, pour que l'écart soit calculé. */
function declarerOutilsDesEditeurs(run: RunFictif): void {
  const chemin = join(run.repertoire_run, "run.json");
  const json = JSON.parse(readFileSync(chemin, "utf8")) as { juges: Record<string, unknown>[] };
  const juges = json.juges.map((j) => ({ ...j, outils_de_son_editeur: j["juge_id"] === "juge-1" ? ["outil-alpha"] : [] }));
  ecrireJson(chemin, { ...json, juges });
}

beforeAll(() => {
  fictif = poserRunNote();
  poserLecturesNonAffichees(fictif);
  declarerOutilsDesEditeurs(fictif);
  renvoyee = renvoyerParJuge1(fictif);
});
afterAll(() => fictif.nettoyer());

describe("D75 (25) : pnpm analyze avec une réponse renvoyée par un seul juge", () => {
  it("D75 (25) la commande rend le code 0, et la réponse renvoyée est nommée hors du calcul, avec son juge et son motif", () => {
    const resultat = executerOutil("analyze.ts", [fictif.repertoire_run]);
    expect(resultat.erreur).not.toContain("NotationDeJugeIncoherente");
    expect(resultat.status).toBe(0);
    const metriques = JSON.parse(readFileSync(cheminMetriques(fictif.repertoire_run), "utf8")) as {
      ecart_juge_editeur: { statut: string; reponses_renvoyees: unknown[]; reponses_sans_note_de_juge: string[] };
    };
    expect(metriques.ecart_juge_editeur.statut).toBe("calcule");
    expect(metriques.ecart_juge_editeur.reponses_renvoyees).toEqual([{ reponse_id: renvoyee, renvois: [{ juge_id: "juge-1", motif: "sortie_illisible" }] }]);
    expect(metriques.ecart_juge_editeur.reponses_sans_note_de_juge).toEqual([]);
  });
});
