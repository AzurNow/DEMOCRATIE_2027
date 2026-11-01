/**
 * §6 (protocole 0.22, D57 (2)) : « ni le test des liens ni la notation (section 7) ne commencent »
 * tant qu'une réponse attend l'opérateur. La notation refuse avant toute écriture ; une fois la
 * réponse stockée par l'opérateur, elle démarre. Constat 2 de la conformité du 2026-11-01.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Reponse } from "../../analysis/types.ts";
import { ReponsesEnAttenteOperateur } from "../../pipeline/interrogation/attente-operateur.ts";
import { noterRun } from "../../pipeline/notation/chaine.ts";
import { environnementSimule, preparerNotationSimulee, type RunSimulePrepare } from "../../pipeline/notation/notation-simulee.ts";
import { journalNeuf, premiereManquante, retirerReponse, stockerReponse } from "../aides/attente-operateur.ts";
import { instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference } from "./simulation.ts";

vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

interface RunEnAttente {
  readonly prepare: RunSimulePrepare;
  readonly manquante: Reponse;
  readonly octets: Buffer;
}

async function runEnAttente(arrivee: "recue_non_stockee" | "octets_sans_suite"): Promise<RunEnAttente> {
  const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
  const manquante = premiereManquante(prepare.repertoire_run);
  const octets = retirerReponse(prepare.repertoire_run, manquante);
  const journal = journalNeuf(prepare.repertoire_run, manquante);
  if (arrivee === "recue_non_stockee") journal.inscrireRecueNonStockee(1, null, "décodage non UTF-8");
  else journal.garderOctets(1, new TextEncoder().encode("{"));
  return { prepare, manquante, octets };
}

describe("la notation attend que plus aucune réponse n'attende l'opérateur (§6, 0.22)", () => {
  it("1. recue_non_stockee : refus nommé qui nomme la notation, rien n'est écrit sous le run", async () => {
    const { prepare, manquante } = await runEnAttente("recue_non_stockee");
    const avant = instantane(prepare.repertoire_run);
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());

    await expect(noterRun(prepare.reponses, env)).rejects.toThrow(ReponsesEnAttenteOperateur);
    await expect(noterRun(prepare.reponses, env)).rejects.toThrow(/la notation ne commence pas/);
    await expect(noterRun(prepare.reponses, env)).rejects.toThrow(manquante.question_id);

    expect(instantane(prepare.repertoire_run)).toEqual(avant);
  });

  it("2. octets_sans_suite : même refus, rien n'est écrit sous le run", async () => {
    const { prepare } = await runEnAttente("octets_sans_suite");
    const avant = instantane(prepare.repertoire_run);

    await expect(noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()))).rejects.toThrow(
      ReponsesEnAttenteOperateur,
    );

    expect(instantane(prepare.repertoire_run)).toEqual(avant);
  });

  it("3. la réponse stockée par l'opérateur : la notation démarre", async () => {
    const { prepare, manquante, octets } = await runEnAttente("recue_non_stockee");
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    await expect(noterRun(prepare.reponses, env)).rejects.toThrow(ReponsesEnAttenteOperateur);

    stockerReponse(prepare.repertoire_run, manquante, octets);

    const resultat = await noterRun(prepare.reponses, env);
    expect(resultat.verdicts.length + resultat.attentes.length).toBeGreaterThan(0);
  });
});
