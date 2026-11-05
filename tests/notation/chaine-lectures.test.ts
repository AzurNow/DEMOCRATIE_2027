/**
 * D87 : l'étape 5 de la chaîne de notation (`chaine.ts`), de bout en bout sur le run simulé de
 * `pnpm run:dry` (un comparateur inclus). Les verdicts de lecture sont écrits au même endroit que
 * ceux des réponses, par la même relance qui lit les notations humaines déjà saisies.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { lireRunJson, lireVerdicts } from "../../analysis/lecture-run.ts";
import { bilanNotation } from "../../pipeline/notation/bilan-notation.ts";
import { identifiantDerive, noterRun } from "../../pipeline/notation/chaine.ts";
import type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";
import { environnementSimule, preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import { ulid } from "../analysis/fabriques.ts";
import { doubleNotation, INEXACTE, poserLecturesAffichees } from "./lectures-sur-disque.ts";
import { nettoyerSorties, nouvelleSortie, options, parametresDeReference } from "./simulation.ts";

// Bout en bout (lancements et écritures réels) : même limite large que chaine.test.ts.
vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

describe("D87 : la chaîne écrit les verdicts de lecture", () => {
  it("D87 chaîne : une lecture notée à l'accord par deux humains reçoit son verdict, les autres attendent ; les réponses gardent chacune une issue", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const run = lireRunJson(prepare.repertoire_run);
    // Le run simulé ne fige pas d'items P de référence : deux items fictifs, que la notation ne recoupe pas (l'analyse le fait).
    const lectures = poserLecturesAffichees(prepare.repertoire_run, [ulid("d87-item-1"), ulid("d87-item-2")]);
    const [notee, ...autres] = lectures;
    if (notee === undefined) throw new Error("aucune lecture posée");
    const depot = DepotNotation.ouvrir(prepare.repertoire_run);
    doubleNotation(depot, notee, "a1", INEXACTE);
    doubleNotation(depot, notee, "a2", INEXACTE);

    const parametres = parametresDeReference();
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametres));
    expect(resultat.lectures).toEqual({ statut: "notees", verdicts: [notee.id], attentes: autres.map((l) => ({ lecture_id: l.id, statut: "a_noter" })) });
    const verdict = lireVerdicts(prepare.repertoire_run, run.id).find((v) => v.objet_note.id === notee.id);
    expect(verdict).toMatchObject({
      id: identifiantDerive([run.id, "verdict", notee.id]),
      categorie_retenue: "inexacte",
      mode_resolution: "lecture_comparateur_humaine",
      date: parametres.date_notation,
    });
    // Le bilan des réponses ne compte pas les verdicts de lecture : chaque réponse a toujours une issue.
    expect(() => bilanNotation(prepare.repertoire_run, resultat, prepare.reponses.map((r) => r.reponse.id))).not.toThrow();
  });

  it("D87 chaîne : lectures pas encore collectées, la chaîne note les réponses et dit que les lectures ne sont pas jouées", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    expect(resultat.lectures).toEqual({ statut: "non_jouees", motif: "lectures_non_collectees" });
    expect(resultat.verdicts.length).toBeGreaterThan(0);
  });

  it("D87 chaîne : test des candidats en attente, ni les réponses ni les lectures ne reçoivent de verdict (même condition que la masse)", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const run = lireRunJson(prepare.repertoire_run);
    const [notee] = poserLecturesAffichees(prepare.repertoire_run, [ulid("d87-item-1")]);
    if (notee === undefined) throw new Error("aucune lecture posée");
    const depot = DepotNotation.ouvrir(prepare.repertoire_run);
    doubleNotation(depot, notee, "a1", INEXACTE);
    doubleNotation(depot, notee, "a2", INEXACTE);
    // Aucun lien n'a de verdict d'existence : une réponse du sous-ensemble contrefactuel attend le test des liens.
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const aveugle: FournisseurExistences = { existencesDe: () => [], texteDeCopie: (sha256) => env.existences.texteDeCopie(sha256) };
    const resultat = await noterRun(prepare.reponses, { ...env, existences: aveugle });
    expect(resultat.contrefactuel.statut).toBe("en_attente_test_liens");
    expect(resultat.lectures).toEqual({ statut: "non_jouees", motif: "contrefactuel_candidats_non_conclu" });
    expect(lireVerdicts(prepare.repertoire_run, run.id)).toEqual([]);
  });
});
