/**
 * §7 (§7.59, D74 (22)) : `pnpm analyze` publie dans `metriques.json` le nombre de renvois à un humain
 * de chaque juge déclaré au gel, par contexte et par motif, chaque motif connu à 0 compris ; le
 * document est validé contre `schema/metriques.schema.json`. Le calcul lui-même est éprouvé par
 * `tests/analysis/renvois-humains.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { analyserRun, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { renvoiDefaillant, renvoiJuge } from "../notation/fabriques.ts";
import { ulid } from "./fabriques.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 10, permutations: 10 };
const ZERO = { attribution_indecidable: 0, erreur_api_persistante: 0, contexte_depasse: 0, sortie_refusee: 0, sortie_illisible: 0 };
const ZERO_PAR_CONTEXTE = { run: ZERO, contrefactuel_candidat: ZERO, contrefactuel_outil: ZERO };

type Document = { renvois_humains: { statut: string; par_juge: { juge_id: string; retire: boolean; par_contexte: typeof ZERO_PAR_CONTEXTE }[] } };

function analyser(entrees: EntreesDuRun): Document {
  return valider<Document>("metriques", analyserRun(entrees, PARAMETRES, null), "metriques.json de test");
}

function surReponse(id: string) {
  return { objet_note: { type: "reponse" as const, id: ulid(id) } };
}

describe("D74 (22) : renvois à un humain publiés par pnpm analyze", () => {
  it("aucun renvoi : les deux juges du gel publiés, chaque motif à 0 dans chaque contexte, document conforme", () => {
    const document = analyser(entreesDuRunAnalysable(SPEC_REFERENCE));
    expect(document.renvois_humains).toEqual({
      statut: "calcule",
      par_juge: [
        { juge_id: "juge-1", retire: false, par_contexte: ZERO_PAR_CONTEXTE },
        { juge_id: "juge-2", retire: false, par_contexte: ZERO_PAR_CONTEXTE },
      ],
    });
  });

  it("renvois lus du run : comptés par juge, par contexte et par motif ; un juge retiré reste publié", () => {
    const base = entreesDuRunAnalysable(SPEC_REFERENCE);
    const entrees: EntreesDuRun = {
      ...base,
      run: { ...base.run, juges: [{ juge_id: "juge-1", retire: false }, { juge_id: "juge-2", retire: true }] },
      renvois: [
        renvoiJuge("juge-1", { ...surReponse("r1"), id: ulid("rv-1") }),
        renvoiDefaillant("juge-1", { ...surReponse("r2"), id: ulid("rv-2"), motif: "contexte_depasse" }),
        renvoiDefaillant("juge-2", { ...surReponse("r3"), id: ulid("rv-3"), contexte: "contrefactuel_candidat" }),
      ],
    };
    const { par_juge } = analyser(entrees).renvois_humains;
    expect(par_juge).toEqual([
      { juge_id: "juge-1", retire: false, par_contexte: { ...ZERO_PAR_CONTEXTE, run: { ...ZERO, attribution_indecidable: 1, contexte_depasse: 1 } } },
      { juge_id: "juge-2", retire: true, par_contexte: { ...ZERO_PAR_CONTEXTE, contrefactuel_candidat: { ...ZERO, sortie_illisible: 1 } } },
    ]);
  });

  it("aucune identité d'outil noté dans la section : seuls les identifiants de gel des juges", () => {
    const texte = JSON.stringify(analyser(entreesDuRunAnalysable(SPEC_REFERENCE)).renvois_humains);
    for (const outil of SPEC_REFERENCE.outils) expect(texte).not.toContain(outil.outil_id);
  });
});
