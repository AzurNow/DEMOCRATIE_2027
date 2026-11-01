/**
 * `pnpm interrogation:attente --run=<run>` (`outils/attente-operateur.ts`) : la garde du §6
 * (protocole 0.22, D57 (2)) que `pnpm liens` exécute avant toute requête. Code 0 sans attente, 2 avec
 * la liste des requêtes, refus nommé si `--run` manque ou si le répertoire n'existe pas.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { executerOutil } from "../aides/depot.ts";
import { journalNeuf, premiereManquante, retirerReponse } from "../aides/attente-operateur.ts";
import { nettoyerSorties, nouvelleSortie, options } from "../notation/simulation.ts";

vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

const OUTIL = "attente-operateur.ts";

describe("pnpm interrogation:attente", () => {
  it("6a. aucune réponse n'attend : code 0", async () => {
    const { repertoire_run } = await preparerNotationSimulee(options(nouvelleSortie()));

    const sortie = executerOutil(OUTIL, [`--run=${repertoire_run}`]);

    expect(sortie.status).toBe(0);
    expect(sortie.sortie).toContain("Aucune réponse n'attend l'opérateur");
  });

  it("6b. une réponse attend : code 2, la requête est listée sur la sortie d'erreur", async () => {
    const { repertoire_run } = await preparerNotationSimulee(options(nouvelleSortie()));
    const manquante = premiereManquante(repertoire_run);
    retirerReponse(repertoire_run, manquante);
    journalNeuf(repertoire_run, manquante).inscrireRecueNonStockee(1, null, "décodage non UTF-8");

    const sortie = executerOutil(OUTIL, [`--run=${repertoire_run}`]);

    expect(sortie.status).toBe(2);
    expect(sortie.erreur).toContain("ReponsesEnAttenteOperateur");
    expect(sortie.erreur).toContain(manquante.question_id);
    expect(sortie.erreur).toContain("le test des liens ne commence pas");
  });

  it("6c. --run absent : refus nommé, code 2", () => {
    const sortie = executerOutil(OUTIL, []);

    expect(sortie.status).toBe(2);
    expect(sortie.erreur).toContain("--run est obligatoire");
  });

  it("6d. répertoire inexistant : refus nommé, code 2", () => {
    const sortie = executerOutil(OUTIL, ["--run=/inexistant/banc/run"]);

    expect(sortie.status).toBe(2);
    expect(sortie.erreur).toContain("n'existe pas");
  });
});
