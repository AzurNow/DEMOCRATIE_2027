/**
 * Contrôle croisé, part du test contrefactuel publiée avec le run (lot notation, PR C, cas limite
 * 13 du brief) : le retrait d'un juge se lit sur ses effectifs (« au-delà de 3 % », en entiers :
 * `numerateur × 100 > 3 × denominateur`), et le taux publié est leur quotient exact.
 */

import { describe, expect, it } from "vitest";
import { controleCroise } from "../../pipeline/notation/controle-croise.ts";
import type { JugeDuRun, RunDeNotation } from "../../analysis/types-notation.ts";
import { runDeNotation } from "./fabriques.ts";

/** Modifié ouvertement (D31 (1)) : le juge publie aussi ses paires écartées, 0 par défaut d'écriture du test. */
function juge(juge_id: string, retire: boolean, numerateur: number, denominateur = 200, paires_ecartees_contrefactuel = 0): JugeDuRun {
  return {
    juge_id,
    retire,
    taux_changement_contrefactuel: numerateur / denominateur,
    changements_contrefactuel: { numerateur, denominateur },
    paires_ecartees_contrefactuel,
  };
}

function runAvec(juges: readonly JugeDuRun[]): RunDeNotation {
  const retrait = juges.some((j) => j.retire);
  return { ...runDeNotation(), juges, taux_echantillon_humain: retrait ? 0.25 : 0.1 };
}

function codes(run: RunDeNotation): readonly string[] {
  return controleCroise({ run, reponses_obtenues: [], refus_api: [], textes: new Map(), notations: [], verdicts: [] }).map((v) => v.code);
}

describe("13. retrait et taux du test contrefactuel", () => {
  it("juges cohérents : gardé à 6/200 (3 % pile n'est pas au-delà), retiré à 7/200 : aucune violation", () => {
    expect(codes(runAvec([juge("j1", false, 6), juge("j2", true, 7)]))).toEqual([]);
  });

  it("juge retiré à 6/200 : violation, 3 % n'est pas au-delà de 3 %", () => {
    const violations = controleCroise({ run: runAvec([juge("j1", false, 0), juge("j2", true, 6)]), reponses_obtenues: [], refus_api: [], textes: new Map(), notations: [], verdicts: [] });
    expect(violations).toEqual([expect.objectContaining({ code: "retrait_contrefactuel_incoherent" })]);
    expect(violations[0]?.detail).toContain("j2");
    expect(violations[0]?.verdict_id).toBeUndefined();
  });

  it("juge gardé à 7/200 : violation, il aurait dû être retiré", () => {
    expect(codes(runAvec([juge("j1", false, 7), juge("j2", false, 0)]))).toEqual(["retrait_contrefactuel_incoherent"]);
  });

  it("taux publié différent de numerateur / denominateur : violation", () => {
    const faux = { ...juge("j1", false, 4), taux_changement_contrefactuel: 0.021 };
    expect(codes(runAvec([faux, juge("j2", false, 2)]))).toEqual(["taux_contrefactuel_incoherent"]);
  });

  it("taux arrondi à l'affichage (1/3 publié 0.333) : violation, le quotient exact est exigé", () => {
    const arrondi = { ...juge("j1", true, 1, 3), taux_changement_contrefactuel: 0.333 };
    expect(codes(runAvec([arrondi, juge("j2", false, 0)]))).toEqual(["taux_contrefactuel_incoherent"]);
  });

  it("dénominateur d'un juge différent de contrefactuel_candidats.taille : violation", () => {
    const run = { ...runAvec([juge("j1", false, 2, 199), juge("j2", false, 2)]), contrefactuel_candidats: { taille: 200 } };
    const violations = controleCroise({ run, reponses_obtenues: [], refus_api: [], textes: new Map(), notations: [], verdicts: [] });
    expect(violations.map((v) => v.code)).toEqual(["denominateur_contrefactuel_incoherent"]);
    expect(violations[0]?.detail).toContain("j1");
  });

  it("dénominateurs égaux à contrefactuel_candidats.taille : aucune violation", () => {
    const run = { ...runAvec([juge("j1", false, 2), juge("j2", false, 4)]), contrefactuel_candidats: { taille: 200 } };
    expect(codes(run)).toEqual([]);
  });

  it("D31 (1) : dénominateur + paires écartées = taille : aucune violation ; sinon, violation", () => {
    const bloc = { contrefactuel_candidats: { taille: 200 } };
    expect(codes({ ...runAvec([juge("j1", false, 2, 199, 1), juge("j2", false, 2)]), ...bloc })).toEqual([]);
    expect(codes({ ...runAvec([juge("j1", false, 2, 199, 2), juge("j2", false, 2)]), ...bloc })).toEqual(["denominateur_contrefactuel_incoherent"]);
  });

  it("D31 (1) : taux indéfini avec toutes les paires écartées : aucune violation ; avec une paire comptée, violation", () => {
    const indefini = (ecartees: number): JugeDuRun => ({ juge_id: "j1", retire: false, paires_ecartees_contrefactuel: ecartees, motif_indefini_contrefactuel: "toutes_paires_ecartees" });
    const bloc = { contrefactuel_candidats: { taille: 200 } };
    expect(codes({ ...runAvec([indefini(200), juge("j2", false, 2)]), ...bloc })).toEqual([]);
    expect(codes({ ...runAvec([indefini(199), juge("j2", false, 2)]), ...bloc })).toEqual(["denominateur_contrefactuel_incoherent"]);
  });

  it("D31 (1) : effectifs publiés sans le nombre de paires écartées : violation", () => {
    const { paires_ecartees_contrefactuel: _p, ...sans } = juge("j1", false, 2);
    expect(codes({ ...runAvec([sans, juge("j2", false, 2)]), contrefactuel_candidats: { taille: 200 } })).toEqual(["denominateur_contrefactuel_incoherent"]);
  });

  it("juges sans résultat contrefactuel (run planifié, ou test indéfini) : rien à contrôler", () => {
    expect(codes(runDeNotation())).toEqual([]);
  });
});
