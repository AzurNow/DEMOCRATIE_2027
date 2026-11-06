/**
 * Contrôle croisé n° 18, part du contrefactuel d'outil terminé (§7, « Conflit d'intérêts » ; D90) :
 * `run.json#/contrefactuel_outils` à l'état `termine` est recoupé avec les juges du run, avec le
 * sous-ensemble rejoué (réponses obtenues dont le texte nomme un outil permuté, hors refus de
 * l'API, tirées avec la clé `contrefactuel_outil`) et avec les notations de contexte
 * `contrefactuel_outil` du volume. Un bloc indéfini, ou absent, ne change rien au contrôle.
 */

import { describe, expect, it } from "vitest";
import { ulid } from "../analysis/fabriques.ts";
import { controleCroise, type ContrefactuelOutilsAControler, type EntreeControleCroise } from "../../pipeline/notation/controle-croise.ts";
import type { OutilAuGelNomme } from "../../pipeline/notation/derangement-outils.ts";
import { tirerSousEnsembleContrefactuelOutils } from "../../pipeline/notation/echantillons.ts";
import type { BlocContrefactuelOutils, BlocContrefactuelOutilsTermine, JugeContrefactuelOutils } from "../../pipeline/notation/publication-contrefactuel-outils.ts";
import type { NotationIndividuelle, RunDeNotation } from "../../analysis/types-notation.ts";
import { notationHumaine, notationJuge, runDeNotation } from "./fabriques.ts";

const OUTILS: readonly OutilAuGelNomme[] = [
  { outil_id: "outil-alpha", libelle: "Alpha Chat", editeur: "Maison Alpha", famille: "assistant", inclus: true },
  { outil_id: "outil-beta", libelle: "Beta Assist", editeur: "Maison Beta", famille: "assistant", inclus: true },
];

const REPONSES = Array.from({ length: 12 }, (_, i) => ulid(`reponse-outil-${i}`));
/** Les réponses d'indice pair nomment un outil permuté ; celle d'indice 0 est un refus de l'API, jamais éligible. */
const TEXTES: ReadonlyMap<string, string> = new Map(REPONSES.map((id, i) => [id, i % 2 === 0 ? "Selon Alpha Chat, le candidat propose une baisse." : "Le candidat propose une baisse."]));
const REFUS = [REPONSES[0] ?? ""];
const ELIGIBLES = REPONSES.filter((id, i) => i % 2 === 0 && !REFUS.includes(id));

function sousEnsemble(run: RunDeNotation): readonly string[] {
  return tirerSousEnsembleContrefactuelOutils(ELIGIBLES, run.graines.contrefactuel).reponse_ids;
}

function copieDe(origine: string): string {
  return ulid(`copie-outil-${origine}`);
}

function notationPermutee(juge_id: string, origine: string): NotationIndividuelle {
  return notationJuge(juge_id, { contexte: "contrefactuel_outil", objet_note: { type: "reponse", id: copieDe(origine) }, motif_notation: "contrefactuel" });
}

function mesure(juge_id: string, numerateur: number, denominateur: number, paires_ecartees = 0): JugeContrefactuelOutils {
  return { juge_id, taux_changement: numerateur / denominateur, changements: { numerateur, denominateur }, paires_ecartees };
}

function bloc(run: RunDeNotation, juges: readonly JugeContrefactuelOutils[]): BlocContrefactuelOutilsTermine {
  const taille = sousEnsemble(run).length;
  return {
    etat: "termine",
    outils: 2,
    eligibles: ELIGIBLES.length,
    taille_visee: 200,
    taille,
    sous_effectif: true,
    correspondances: { "outil-alpha": "outil-beta", "outil-beta": "outil-alpha" },
    cle_graine: ["contrefactuel_outil"],
    cle_graine_derangement: ["contrefactuel", "noms_outils", "derangement"],
    mentions_residuelles: 0,
    juges,
  };
}

function aControler(publie: BlocContrefactuelOutils, origines: readonly string[]): ContrefactuelOutilsAControler {
  return {
    bloc: publie,
    outils_au_gel: OUTILS,
    reponses_contrefactuelles: origines.map((origine) => ({ id: copieDe(origine), contexte: "contrefactuel_outil" as const, derive_de_reponse_id: origine })),
  };
}

/** Un run dont le test d'outil est terminé et cohérent : chaque juge mesuré note chaque copie du sous-ensemble. */
function entreeTerminee(run: RunDeNotation, mesures: readonly string[] = ["j1", "j2"]): EntreeControleCroise {
  const taille = sousEnsemble(run).length;
  const juges = run.juges.map((juge): JugeContrefactuelOutils => (juge.retire ? { juge_id: juge.juge_id, motif_non_mesure: "retire_au_test_des_candidats" } : mesure(juge.juge_id, 1, taille)));
  return {
    run,
    reponses_obtenues: REPONSES,
    refus_api: REFUS,
    textes: TEXTES,
    notations: mesures.flatMap((juge_id) => sousEnsemble(run).map((origine) => notationPermutee(juge_id, origine))),
    verdicts: [],
    contrefactuel_outils: aControler(bloc(run, juges), sousEnsemble(run)),
  };
}

function avecBloc(entree: EntreeControleCroise, modifier: (b: BlocContrefactuelOutilsTermine) => BlocContrefactuelOutils): EntreeControleCroise {
  const actuel = entree.contrefactuel_outils;
  if (actuel === null || actuel.bloc.etat !== "termine") throw new Error("bloc terminé attendu");
  return { ...entree, contrefactuel_outils: { ...actuel, bloc: modifier(actuel.bloc) } };
}

function avecJuges(entree: EntreeControleCroise, juges: readonly JugeContrefactuelOutils[]): EntreeControleCroise {
  return avecBloc(entree, (b) => ({ ...b, juges }));
}

function codes(entree: EntreeControleCroise): readonly string[] {
  return controleCroise(entree).map((v) => v.code);
}

describe("D90 : contrôle croisé du contrefactuel d'outil terminé", () => {
  it("le sous-ensemble du test est non vide, et ne contient ni refus de l'API ni réponse qui ne nomme aucun outil", () => {
    const tire = sousEnsemble(runDeNotation());
    expect(tire.length).toBe(ELIGIBLES.length);
    expect(tire.length).toBeGreaterThan(0);
    expect(tire).not.toContain(REFUS[0]);
  });

  it("bloc terminé cohérent ⇒ aucune violation", () => {
    expect(controleCroise(entreeTerminee(runDeNotation()))).toEqual([]);
  });

  it("bloc terminé cohérent, juge retiré au test des candidats publié non mesuré et sans notation permutée ⇒ aucune violation", () => {
    expect(controleCroise(entreeTerminee(runDeNotation(["j2"]), ["j1"]))).toEqual([]);
  });

  it("dénominateur + paires écartées ≠ taille du sous-ensemble ⇒ denominateur_contrefactuel_outils_incoherent, nommé par juge", () => {
    const entree = entreeTerminee(runDeNotation());
    const taille = sousEnsemble(runDeNotation()).length;
    const violations = controleCroise(avecJuges(entree, [mesure("j1", 1, taille - 1), mesure("j2", 1, taille)]));
    expect(violations.map((v) => v.code)).toEqual(["denominateur_contrefactuel_outils_incoherent"]);
    expect(violations[0]?.detail).toContain("j1");
    expect(violations[0]?.verdict_id).toBeUndefined();
  });

  it("dénominateur + paires écartées = taille, une paire écartée ⇒ aucune violation", () => {
    const taille = sousEnsemble(runDeNotation()).length;
    expect(codes(avecJuges(entreeTerminee(runDeNotation()), [mesure("j1", 1, taille - 1, 1), mesure("j2", 1, taille)]))).toEqual([]);
  });

  it("toutes paires écartées : écartées = taille ⇒ aucune violation ; écartées ≠ taille ⇒ denominateur_contrefactuel_outils_incoherent", () => {
    const taille = sousEnsemble(runDeNotation()).length;
    const entree = entreeTerminee(runDeNotation(), ["j2"]);
    const indefini = (ecartees: number): JugeContrefactuelOutils => ({ juge_id: "j1", motif_indefini: "toutes_paires_ecartees", paires_ecartees: ecartees });
    expect(codes(avecJuges(entree, [indefini(taille), mesure("j2", 1, taille)]))).toEqual([]);
    expect(codes(avecJuges(entree, [indefini(taille - 1), mesure("j2", 1, taille)]))).toEqual(["denominateur_contrefactuel_outils_incoherent"]);
  });

  it("taux publié différent de numerateur / denominateur ⇒ taux_contrefactuel_outils_incoherent", () => {
    const taille = sousEnsemble(runDeNotation()).length;
    const faux = { ...mesure("j1", 1, taille), taux_changement: 0.5 };
    expect(codes(avecJuges(entreeTerminee(runDeNotation()), [faux, mesure("j2", 1, taille)]))).toEqual(["taux_contrefactuel_outils_incoherent"]);
  });

  it("juge retiré au test des candidats mais mesuré au test d'outil ⇒ mesure_contrefactuel_outils_incoherente", () => {
    const run = runDeNotation(["j2"]);
    const taille = sousEnsemble(run).length;
    const violations = controleCroise(avecJuges(entreeTerminee(run, ["j1"]), [mesure("j1", 1, taille), mesure("j2", 1, taille)]));
    expect(violations.map((v) => v.code)).toEqual(["mesure_contrefactuel_outils_incoherente"]);
    expect(violations[0]?.detail).toContain("j2");
  });

  it("juge non retiré mais publié non mesuré au test d'outil ⇒ mesure_contrefactuel_outils_incoherente", () => {
    const taille = sousEnsemble(runDeNotation()).length;
    const entree = avecJuges(entreeTerminee(runDeNotation(), ["j1"]), [mesure("j1", 1, taille), { juge_id: "j2", motif_non_mesure: "retire_au_test_des_candidats" }]);
    expect(codes(entree)).toEqual(["mesure_contrefactuel_outils_incoherente"]);
  });

  it("juge du run absent du bloc, ou juge du bloc absent du run ⇒ mesure_contrefactuel_outils_incoherente", () => {
    const taille = sousEnsemble(runDeNotation()).length;
    const entree = entreeTerminee(runDeNotation(), ["j1"]);
    expect(codes(avecJuges(entree, [mesure("j1", 1, taille)]))).toEqual(["mesure_contrefactuel_outils_incoherente"]);
    const inconnu = avecJuges(entreeTerminee(runDeNotation()), [mesure("j1", 1, taille), mesure("j2", 1, taille), mesure("j3", 1, taille)]);
    expect(codes(inconnu)).toEqual(["mesure_contrefactuel_outils_incoherente"]);
  });

  it("notation contrefactuel_outil sur la copie d'une réponse hors du sous-ensemble publié ⇒ notation_contrefactuel_outil_hors_sous_ensemble", () => {
    const run = runDeNotation();
    const entree = entreeTerminee(run);
    const hors = REPONSES[1] ?? "";
    const actuel = entree.contrefactuel_outils;
    if (actuel === null) throw new Error("bloc attendu");
    const avecIntruse: EntreeControleCroise = {
      ...entree,
      notations: [...entree.notations, notationPermutee("j1", hors)],
      contrefactuel_outils: aControler(actuel.bloc, [...sousEnsemble(run), hors]),
    };
    const violations = controleCroise(avecIntruse);
    expect(violations.map((v) => v.code)).toEqual(["notation_contrefactuel_outil_hors_sous_ensemble"]);
    expect(violations[0]?.detail).toContain(hors);
  });

  it("notation contrefactuel_outil sur un objet qui n'est la copie d'aucune réponse du volume ⇒ notation_contrefactuel_outil_hors_sous_ensemble", () => {
    const entree = entreeTerminee(runDeNotation());
    const orpheline = notationJuge("j1", { contexte: "contrefactuel_outil", objet_note: { type: "reponse", id: ulid("copie-inconnue") }, motif_notation: "contrefactuel" });
    expect(codes({ ...entree, notations: [...entree.notations, orpheline] })).toEqual(["notation_contrefactuel_outil_hors_sous_ensemble"]);
  });

  it("notation contrefactuel_outil d'un juge non mesuré (retiré au test des candidats) ⇒ notation_contrefactuel_outil_de_juge_non_mesure", () => {
    const run = runDeNotation(["j2"]);
    const entree = entreeTerminee(run, ["j1"]);
    const origine = sousEnsemble(run)[0] ?? "";
    const violations = controleCroise({ ...entree, notations: [...entree.notations, notationPermutee("j2", origine)] });
    expect(violations.map((v) => v.code)).toEqual(["notation_contrefactuel_outil_de_juge_non_mesure"]);
    expect(violations[0]?.detail).toContain("j2");
  });

  it("notation humaine d'une copie du sous-ensemble (côté renvoyé) ⇒ aucune violation", () => {
    const run = runDeNotation();
    const entree = entreeTerminee(run);
    const origine = sousEnsemble(run)[0] ?? "";
    const humaine = notationHumaine("a1", "juge_defaillant", { contexte: "contrefactuel_outil", objet_note: { type: "reponse", id: copieDe(origine) } });
    expect(codes({ ...entree, notations: [...entree.notations, humaine] })).toEqual([]);
  });

  it("éligibles ou taille publiés différents du tirage rejoué ⇒ sous_ensemble_contrefactuel_outils_non_rejoue", () => {
    const entree = entreeTerminee(runDeNotation());
    expect(codes(avecBloc(entree, (b) => ({ ...b, eligibles: b.eligibles + 1 })))).toEqual(["sous_ensemble_contrefactuel_outils_non_rejoue"]);
    const autreGraine = { ...entree, run: { ...entree.run, graines: { ...entree.run.graines, contrefactuel: { ...entree.run.graines.contrefactuel, valeur: 1 } } } };
    // Sous-effectif : tous les éligibles sont pris, quelle que soit la graine ; le tirage rejoué garde le même ensemble.
    expect(codes(autreGraine)).toEqual([]);
  });

  it("le texte d'une réponse obtenue hors refus manque ⇒ le contrôle lève, rien n'est supposé", () => {
    const entree = entreeTerminee(runDeNotation());
    const textes = new Map(TEXTES);
    textes.delete(REPONSES[2] ?? "");
    expect(() => controleCroise({ ...entree, textes })).toThrow(/texte projeté/);
  });
});

describe("D90 : bloc indéfini ou absent, comportement inchangé", () => {
  const base = { run: runDeNotation(), reponses_obtenues: REPONSES, refus_api: REFUS, textes: TEXTES, notations: [], verdicts: [] };

  it("aucun bloc inscrit ⇒ aucune violation", () => {
    expect(controleCroise({ ...base, contrefactuel_outils: null })).toEqual([]);
  });

  it("test non joué, moins de deux outils ⇒ aucune violation", () => {
    const nonJoue: BlocContrefactuelOutils = { etat: "indefini", motif_indefini: "moins_de_deux_outils", outils: 1, taille_visee: 200, taille: 0 };
    expect(controleCroise({ ...base, contrefactuel_outils: aControler(nonJoue, []) })).toEqual([]);
  });

  it("test joué sans réponse éligible ⇒ aucune violation", () => {
    const sansEligible: BlocContrefactuelOutils = {
      etat: "indefini",
      motif_indefini: "aucune_reponse_eligible",
      outils: 2,
      eligibles: 0,
      taille_visee: 200,
      taille: 0,
      sous_effectif: true,
      correspondances: { "outil-alpha": "outil-beta", "outil-beta": "outil-alpha" },
      cle_graine: ["contrefactuel_outil"],
      cle_graine_derangement: ["contrefactuel", "noms_outils", "derangement"],
      mentions_residuelles: 0,
    };
    expect(controleCroise({ ...base, contrefactuel_outils: aControler(sansEligible, []) })).toEqual([]);
  });
});
