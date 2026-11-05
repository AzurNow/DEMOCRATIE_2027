/**
 * Contrôle croisé verdicts × notations × run (conformité n° 18 ; D13). Cas limite 15 du brief :
 * un run propre ne rend aucune violation, et chaque violation a son test. Les verdicts du run propre
 * sont produits par `decider`, et validés contre le schéma.
 */

import { describe, expect, it } from "vitest";
import { lectureComparateur, ulid } from "../analysis/fabriques.ts";
import { controleCroise, type EntreeControleCroise } from "../../pipeline/notation/controle-croise.ts";
import { decider } from "../../pipeline/notation/decision.ts";
import { tirerEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import { MOTIF_DOUBLE_NOTATION_COMPARATEUR, verdictDeLecture } from "../../pipeline/notation/lectures-comparateur.ts";
import type { NotationIndividuelle, RunDeNotation, VerdictProduit } from "../../pipeline/notation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { inexacte, notationHumaine, notationJuge, notationRegle, REPONSE_PROJETEE, runDeNotation } from "./fabriques.ts";

const REPONSES = Array.from({ length: 30 }, (_, i) => ulid(`reponse-croise-${i}`));

function surObjet(id: string): { objet_note: { type: "reponse"; id: string } } {
  return { objet_note: { type: "reponse", id } };
}

/** Un run complet et propre : chaque réponse notée par les juges actifs, et par deux humains si tirée. */
function runPropre(run: RunDeNotation): EntreeControleCroise {
  const echantillon = new Set(tirerEchantillonHumain(REPONSES, run.graines.echantillon_humain, run.taux_echantillon_humain));
  const notations: NotationIndividuelle[] = [];
  const verdicts: VerdictProduit[] = [];
  for (const id of REPONSES) {
    const dans = echantillon.has(id);
    const siennes = [
      notationJuge("j1", surObjet(id)),
      notationJuge("j2", surObjet(id)),
      ...(dans ? [notationHumaine("a1", "echantillon_aleatoire_10", surObjet(id)), notationHumaine("a2", "echantillon_aleatoire_10", surObjet(id))] : []),
    ];
    notations.push(...siennes);
    const decision = decider({
      run,
      objet_note: { type: "reponse", id },
      notations: siennes,
      renvois: [],
      dans_echantillon_humain: dans,
      textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
      verdict_id: ulid(`verdict-${id}`),
      date: "2026-12-06T12:00:00+01:00",
    });
    if (decision.statut !== "verdict") throw new Error(`réponse ${id} en attente`);
    verdicts.push(valider<VerdictProduit>("verdict", decision.verdict, `verdict ${id}`));
  }
  return { run, reponses_obtenues: REPONSES, refus_api: [], textes: new Map(REPONSES.map((id) => [id, REPONSE_PROJETEE])), notations, verdicts };
}

function codes(entree: EntreeControleCroise): readonly string[] {
  return controleCroise(entree).map((v) => v.code);
}

/** Remplace le verdict d'indice `i` (après validation de schéma : la violation n'est visible qu'ici). */
function avecVerdict(entree: EntreeControleCroise, i: number, modifier: (v: VerdictProduit) => VerdictProduit): EntreeControleCroise {
  const verdicts = entree.verdicts.map((v, j) => (j === i ? valider<VerdictProduit>("verdict", modifier(v), "verdict modifié") : v));
  return { ...entree, verdicts };
}

function verdictA(entree: EntreeControleCroise, i: number): VerdictProduit {
  const verdict = entree.verdicts[i];
  if (verdict === undefined) throw new Error(`aucun verdict d'indice ${i}`);
  return verdict;
}

function premiere(ids: readonly string[]): string {
  const [id] = ids;
  if (id === undefined) throw new Error("liste vide");
  return id;
}

function indiceHorsEchantillon(entree: EntreeControleCroise): number {
  return entree.verdicts.findIndex((v) => !v.dans_echantillon_humain);
}

function indiceDansEchantillon(entree: EntreeControleCroise): number {
  return entree.verdicts.findIndex((v) => v.dans_echantillon_humain);
}

describe("run propre", () => {
  it("sans retrait : aucune violation, et l'échantillon de 10 % est bien représenté", () => {
    const propre = runPropre(runDeNotation());
    expect(propre.verdicts.filter((v) => v.dans_echantillon_humain)).toHaveLength(3);
    expect(controleCroise(propre)).toEqual([]);
  });

  it("avec un juge retiré : aucune violation, échantillon de 25 %, juge_unique ailleurs", () => {
    const propre = runPropre(runDeNotation(["j2"]));
    expect(propre.verdicts.filter((v) => v.dans_echantillon_humain)).toHaveLength(8);
    expect(propre.verdicts.filter((v) => v.mode_resolution === "juge_unique_apres_retrait")).toHaveLength(22);
    expect(controleCroise(propre)).toEqual([]);
  });
});

describe("violations", () => {
  it("un verdict qui cite une notation de juge retiré", () => {
    const run = runDeNotation(["j2"]);
    const propre = runPropre(run);
    const i = indiceHorsEchantillon(propre);
    const objet = verdictA(propre, i).objet_note.id;
    const retire = notationJuge("j2", surObjet(objet));
    const entree = avecVerdict(propre, i, (v) => ({ ...v, notations_sources: [...v.notations_sources, retire.id] }));
    const violations = controleCroise(entree);
    expect(violations).toEqual([expect.objectContaining({ code: "source_de_juge_retire", verdict_id: verdictA(propre, i).id })]);
  });

  it("juge_unique_apres_retrait alors qu'aucun juge n'est retiré", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const entree = avecVerdict(propre, i, (v) => ({ ...v, mode_resolution: "juge_unique_apres_retrait", notations_sources: v.notations_sources.slice(0, 1) }));
    expect(codes(entree)).toEqual(["juge_unique_sans_retrait"]);
  });

  it("un verdict hors échantillon qui ignore un drapeau grave du juge restant", () => {
    const propre = runPropre(runDeNotation(["j2"]));
    const i = indiceHorsEchantillon(propre);
    const objet = verdictA(propre, i).objet_note.id;
    const restant = notationJuge("j1", { ...surObjet(objet), ...inexacte(["fabrication"]) });
    const notations = propre.notations.map((n) => (n.id === restant.id ? restant : n));
    expect(codes({ ...propre, notations })).toEqual(["drapeau_grave_ignore"]);
  });

  it("le drapeau grave du juge retiré, lui, n'est pas une violation (D13)", () => {
    const propre = runPropre(runDeNotation(["j2"]));
    const i = indiceHorsEchantillon(propre);
    const objet = verdictA(propre, i).objet_note.id;
    const retire = notationJuge("j2", { ...surObjet(objet), ...inexacte(["fabrication"]) });
    const notations = propre.notations.map((n) => (n.id === retire.id ? retire : n));
    expect(codes({ ...propre, notations })).toEqual([]);
  });

  it("une notation source qui porte sur un autre objet", () => {
    const propre = runPropre(runDeNotation());
    const [a, b] = [indiceHorsEchantillon(propre), propre.verdicts.findIndex((v, j) => j > indiceHorsEchantillon(propre) && !v.dans_echantillon_humain)];
    const etrangere = premiere(verdictA(propre, b).notations_sources);
    const entree = avecVerdict(propre, a, (v) => ({ ...v, notations_sources: [premiere(v.notations_sources), etrangere] }));
    expect(codes(entree)).toEqual(["source_hors_objet_ou_run"]);
  });

  it("une notation source qui porte sur un autre run", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const source = premiere(verdictA(propre, i).notations_sources);
    const notations = propre.notations.map((n) => (n.id === source ? { ...n, run_id: ulid("autre-run") } : n));
    expect(codes({ ...propre, notations })).toEqual(["source_hors_objet_ou_run"]);
  });

  it("une notation source introuvable", () => {
    const propre = runPropre(runDeNotation());
    const entree = avecVerdict(propre, 0, (v) => ({ ...v, notations_sources: [...v.notations_sources, ulid("fantome")] }));
    expect(codes(entree)).toEqual(["source_introuvable"]);
  });

  it("un verdict dans l'échantillon dont l'appartenance ne correspond pas au tirage rejoué", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const entree = avecVerdict(propre, i, (v) => ({ ...v, dans_echantillon_humain: true, mode_resolution: "tranche_humain" }));
    expect(codes(entree)).toContain("appartenance_echantillon_non_rejouee");
  });

  it("une réponse tirée dont le verdict se dit hors échantillon", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceDansEchantillon(propre);
    const entree = avecVerdict(propre, i, (v) => ({ ...v, dans_echantillon_humain: false }));
    expect(codes(entree)).toEqual(["appartenance_echantillon_non_rejouee"]);
  });

  it("un échantillon tiré à 10 % alors qu'un juge est retiré : l'appartenance rejouée à 25 % diverge", () => {
    const aDix = runPropre(runDeNotation(["j2"], { taux_echantillon_humain: 0.1 }));
    const rejoue = { ...aDix, run: runDeNotation(["j2"]) };
    expect(codes(rejoue)).toContain("appartenance_echantillon_non_rejouee");
  });

  it("une notation d'humain absente là où le mode l'exige", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const entree = avecVerdict(propre, i, (v) => ({ ...v, mode_resolution: "tranche_humain" }));
    expect(codes(entree)).toEqual(["notation_humaine_absente"]);
  });

  it("un verdict d'échantillon qui ne cite qu'un humain", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceDansEchantillon(propre);
    const verdict = verdictA(propre, i);
    const unHumain = verdict.notations_sources.filter((id) => propre.notations.find((n) => n.id === id)?.notateur.id !== "a2");
    const entree = avecVerdict(propre, i, (v) => ({ ...v, notations_sources: unHumain }));
    expect(codes(entree)).toEqual(["notation_humaine_absente"]);
  });

  it("un taux d'échantillon incohérent avec le retrait", () => {
    const propre = runPropre(runDeNotation());
    const run = { ...propre.run, taux_echantillon_humain: 0.25 as const };
    expect(codes({ ...propre, run, verdicts: [] })).toEqual(["taux_echantillon_incoherent"]);  });
});

/** D32 : un refus de l'API hors échantillon, noté par règle, dans un run par ailleurs propre. */
function avecRefusParRegle(propre: EntreeControleCroise, i: number): EntreeControleCroise {
  const id = verdictA(propre, i).objet_note.id;
  const regle = notationRegle(surObjet(id));
  const decision = decider({
    run: propre.run,
    objet_note: { type: "reponse", id },
    notations: [regle],
    renvois: [],
    dans_echantillon_humain: false,
    textes: { reponse: "", citations_reference: [] },
    verdict_id: ulid(`verdict-${id}`),
    date: "2026-12-06T12:00:00+01:00",
  });
  if (decision.statut !== "verdict") throw new Error(`refus ${id} en attente`);
  const notations = [...propre.notations.filter((n) => n.objet_note.id !== id), regle];
  return {
    ...propre,
    refus_api: [...propre.refus_api, id],
    // Un refus de l'API est projeté au texte vide (`interrogation/executer.ts`), sans `sur_texte_vide` (annexe C).
    textes: new Map([...propre.textes, [id, ""]]),
    notations,
    verdicts: propre.verdicts.map((v, j) => (j === i ? valider<VerdictProduit>("verdict", decision.verdict, "verdict par règle") : v)),
  };
}

describe("D33 : marqueur sur_refus_api ⇔ réponse refusée par l'API", () => {
  it("un marqueur sur une réponse qui n'est pas un refus : violation, sans verdict", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const avecRegle = avecRefusParRegle(propre, i);
    // La réponse n'est pas un refus : elle garde son texte ordinaire (au texte vide, D74 (26) exigerait aussi sur_texte_vide).
    const violations = controleCroise({ ...avecRegle, refus_api: [], textes: propre.textes });
    expect(violations.map((v) => v.code)).toEqual(["marqueur_refus_api_incoherent"]);
    expect(violations[0]?.verdict_id).toBeUndefined();
  });

  it("un refus noté sans marqueur (comme une réponse ordinaire) : violation", () => {
    const propre = runPropre(runDeNotation());
    const id = verdictA(propre, indiceHorsEchantillon(propre)).objet_note.id;
    expect(codes({ ...propre, refus_api: [id] })).toEqual(["marqueur_refus_api_incoherent", "marqueur_refus_api_incoherent"]);
  });
});

/**
 * D74 (26), annexe C (protocole 0.32, D74 (23)) : une notation de contexte run sur une réponse porte
 * `sur_texte_vide` si et seulement si la réponse, hors refus de l'API, a pour texte la chaîne vide.
 */
describe("D74 (26) : marqueur sur_texte_vide ⇔ texte de la réponse égal à la chaîne vide", () => {
  /** La réponse hors échantillon d'indice `i` reçoit `texte`, et ses notations de juge `marqueur` (validées contre le schéma). */
  function avecTexte(texte: string, marqueur: boolean): { readonly entree: EntreeControleCroise; readonly id: string } {
    const propre = runPropre(runDeNotation());
    const id = verdictA(propre, indiceHorsEchantillon(propre)).objet_note.id;
    const notations = propre.notations.map((n) => {
      if (n.objet_note.id !== id) return n;
      const { sur_texte_vide: _retire, ...sans } = n;
      return valider<NotationIndividuelle>("notation", marqueur ? { ...sans, sur_texte_vide: true } : sans, `notation ${n.id}`);
    });
    return { entree: { ...propre, textes: new Map([...propre.textes, [id, texte]]), notations }, id };
  }

  it("texte vide, marqueur posé par chaque juge : aucune violation", () => {
    expect(codes(avecTexte("", true).entree)).toEqual([]);
  });

  it("texte vide, marqueur absent : une violation par notation, sans verdict", () => {
    const { entree, id } = avecTexte("", false);
    const violations = controleCroise(entree);
    expect(violations.map((v) => v.code)).toEqual(["marqueur_texte_vide_incoherent", "marqueur_texte_vide_incoherent"]);
    expect(violations.every((v) => v.verdict_id === undefined && v.detail.includes(id) && v.detail.includes("absent"))).toBe(true);
  });

  it("texte fait d'une espace seule, marqueur posé : violation, une espace n'est pas le texte vide (annexe C)", () => {
    const violations = controleCroise(avecTexte(" ", true).entree);
    expect(violations.map((v) => v.code)).toEqual(["marqueur_texte_vide_incoherent", "marqueur_texte_vide_incoherent"]);
    expect(violations[0]?.detail).toContain("posé");
  });

  it("texte fait d'une espace seule, marqueur absent : aucune violation", () => {
    expect(codes(avecTexte(" ", false).entree)).toEqual([]);
  });

  it("texte non vide, marqueur absent : aucune violation", () => {
    expect(codes(avecTexte(REPONSE_PROJETEE, false).entree)).toEqual([]);
  });

  it("texte non vide, marqueur posé : violation", () => {
    expect(codes(avecTexte(REPONSE_PROJETEE, true).entree)).toEqual(["marqueur_texte_vide_incoherent", "marqueur_texte_vide_incoherent"]);
  });

  it("une notation humaine est contrôlée comme celle d'un juge", () => {
    const propre = runPropre(runDeNotation());
    const id = verdictA(propre, indiceDansEchantillon(propre)).objet_note.id;
    const notations = propre.notations.map((n) =>
      n.objet_note.id === id && n.notateur.type === "humain" ? valider<NotationIndividuelle>("notation", { ...n, sur_texte_vide: true }, `notation ${n.id}`) : n,
    );
    expect(codes({ ...propre, notations })).toEqual(["marqueur_texte_vide_incoherent", "marqueur_texte_vide_incoherent"]);
  });

  it("refus de l'API au texte vide, noté par règle avec sur_refus_api seul : aucune violation (le refus n'a pas sur_texte_vide)", () => {
    const propre = runPropre(runDeNotation());
    const avecRegle = avecRefusParRegle(propre, indiceHorsEchantillon(propre));
    expect(avecRegle.notations.some((n) => n.sur_refus_api === true && n.sur_texte_vide === undefined)).toBe(true);
    expect(codes(avecRegle)).toEqual([]);
  });

  it("texte de la réponse notée non fourni : le contrôle lève, rien n'est supposé", () => {
    const propre = runPropre(runDeNotation());
    const id = verdictA(propre, 0).objet_note.id;
    const textes = new Map([...propre.textes].filter(([cle]) => cle !== id));
    expect(() => controleCroise({ ...propre, textes })).toThrow(/texte projeté n'est pas fourni/);
  });
});

describe("D32 : verdict d'un refus de l'API noté par règle", () => {
  it("un run propre avec un refus noté par règle, juge retiré ou non : aucune violation", () => {
    for (const run of [runDeNotation(), runDeNotation(["j2"])]) {
      const propre = runPropre(run);
      expect(codes(avecRefusParRegle(propre, indiceHorsEchantillon(propre)))).toEqual([]);
    }
  });

  it("un verdict regle_refus_api dont la source n'est pas la notation par règle : violation", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const avecRegle = avecRefusParRegle(propre, i);
    const id = verdictA(avecRegle, i).objet_note.id;
    const juge = notationJuge("j1", { ...surObjet(id), id: ulid(`juge-sur-refus-${id}`) });
    const entree = { ...avecRegle, notations: [...avecRegle.notations, juge], verdicts: avecRegle.verdicts.map((v, j) => (j === i ? { ...v, notations_sources: [juge.id] } : v)) };
    // D33 : la notation de juge posée sur le refus ne porte pas le marqueur, violation de plus.
    expect(codes(entree)).toEqual(["marqueur_refus_api_incoherent", "notation_par_regle_incoherente"]);
  });

  it("une notation par règle citée par un verdict qui n'est pas regle_refus_api hors échantillon : violation", () => {
    const propre = runPropre(runDeNotation());
    const i = indiceHorsEchantillon(propre);
    const avecRegle = avecRefusParRegle(propre, i);
    const entree = avecVerdict(avecRegle, i, (v) => ({ ...v, mode_resolution: "juge_unique_apres_retrait" }));
    expect(codes(entree)).toEqual(expect.arrayContaining(["notation_par_regle_incoherente"]));
  });
});

describe("D73 (13) : verdict d'une lecture de comparateur", () => {
  const LECTURE = ulid("lecture-croise");
  const surLecture = { objet_note: { type: "lecture_comparateur" as const, id: LECTURE } };

  /** Notation humaine de lecture, sans version de charge (D30 (4)). */
  function lecture(annotateur: string): NotationIndividuelle {
    const { version_charge: _sans, ...humaine } = notationHumaine(annotateur, MOTIF_DOUBLE_NOTATION_COMPARATEUR, surLecture);
    return valider<NotationIndividuelle>("notation", humaine, `notation de lecture ${annotateur}`);
  }

  function avecLecture(propre: EntreeControleCroise, notations: readonly NotationIndividuelle[]): EntreeControleCroise {
    const lectures = [lectureComparateur({ id: LECTURE, run_id: propre.run.id })];
    const verdict = valider<VerdictProduit>("verdict", verdictDeLecture(propre.run.id, lectures, notations, LECTURE, { verdict_id: ulid("verdict-lecture-croise"), date: "2026-12-08T12:00:00+01:00" }), "verdict de lecture");
    return { ...propre, notations: [...propre.notations, ...notations], verdicts: [...propre.verdicts, verdict] };
  }

  it("un verdict de lecture propre (deux humains d'accord) : aucune violation, ni d'appartenance à l'échantillon", () => {
    expect(codes(avecLecture(runPropre(runDeNotation()), [lecture("a1"), lecture("a2")]))).toEqual([]);
  });

  it("un verdict de lecture dont les deux sources sont d'un seul humain : notation_humaine_absente", () => {
    const entree = avecLecture(runPropre(runDeNotation()), [lecture("a1"), lecture("a2")]);
    const notations = entree.notations.map((n) => (n.notateur.id === "a2" && n.objet_note.id === LECTURE ? { ...n, notateur: { ...n.notateur, id: "a1" } } : n));
    expect(codes({ ...entree, notations })).toEqual(["notation_humaine_absente"]);
  });
});
