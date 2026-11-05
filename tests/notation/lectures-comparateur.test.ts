/**
 * Notation des lectures de comparateur (§6, protocole 0.24, D59 (15)) : « aucun juge automatique ne
 * note une lecture de comparateur ; chaque lecture est doublement notée par des humains à l'aveugle
 * puis, quand ils divergent, arbitrée par un troisième humain, comme une réponse de l'échantillon. »
 * Les notations d'entrée sont validées contre `schema/notation.schema.json`.
 */

import { describe, expect, it } from "vitest";
import {
  etatsDesLectures,
  LectureSansVerdict,
  lecturesANoter,
  MOTIF_ARBITRAGE_COMPARATEUR,
  MOTIF_DOUBLE_NOTATION_COMPARATEUR,
  NotationLectureRefusee,
  verdictDeLecture,
  type EtatLecture,
} from "../../pipeline/notation/lectures-comparateur.ts";
import type { NotationIndividuelle, VerdictProduit } from "../../analysis/types-notation.ts";
import type { MotifNotation } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { lectureComparateur, ulid } from "../analysis/fabriques.ts";
import { inexacte, lien, notationHumaine, notationJuge } from "./fabriques.ts";

const RUN = ulid("run");
const L1 = ulid("lecture-1");
const L2 = ulid("lecture-2");

type Surcharges = Parameters<typeof notationHumaine>[2];

/** Annexe C : toute note autre qu'exacte porte son extrait. */
const INDETERMINEE: Surcharges = {
  categorie: "indeterminee",
  extrait_justificatif: { provenance: "reponse", texte: "position ambiguë", verifie_deterministe: true },
};

/** Une notation humaine de lecture : sans version de charge (D30 (4)), validée au schéma. */
function surLecture(annotateur: string, motif: MotifNotation, lecture = L1, surcharges: Surcharges = {}): NotationIndividuelle {
  const { version_charge: _sans, ...humaine } = notationHumaine(annotateur, motif, { run_id: RUN, objet_note: { type: "lecture_comparateur", id: lecture }, ...surcharges });
  const notation = { ...humaine, id: ulid(`notation-${annotateur}-${motif}-${lecture}`) };
  return valider<NotationIndividuelle>("notation", notation, `notation de lecture ${notation.id}`);
}

const double = (annotateur: string, lecture = L1, surcharges: Surcharges = {}): NotationIndividuelle =>
  surLecture(annotateur, MOTIF_DOUBLE_NOTATION_COMPARATEUR, lecture, surcharges);
const arbitre = (annotateur: string, lecture = L1, surcharges: Surcharges = {}): NotationIndividuelle =>
  surLecture(annotateur, MOTIF_ARBITRAGE_COMPARATEUR, lecture, surcharges);

const lectures = [lectureComparateur({ id: L1, run_id: RUN })];

function etat(notations: readonly NotationIndividuelle[]): EtatLecture {
  const [premier] = etatsDesLectures(RUN, lectures, notations);
  if (premier === undefined) throw new Error("aucun état");
  return premier;
}

function refus(notations: readonly NotationIndividuelle[]): NotationLectureRefusee {
  try {
    etatsDesLectures(RUN, lectures, notations);
  } catch (erreur) {
    if (erreur instanceof NotationLectureRefusee) return erreur;
    throw erreur;
  }
  throw new Error("aurait dû être refusé");
}

describe("sélection : chaque lecture affichée du run est à noter", () => {
  it("les lectures affichées du run, triées par identifiant ; une lecture non affichée n'a rien à noter", () => {
    const recues = [
      lectureComparateur({ id: L2, run_id: RUN }),
      lectureComparateur({ id: L1, run_id: RUN }),
      lectureComparateur({ id: ulid("lecture-3"), run_id: RUN, affiche: false }),
      lectureComparateur({ id: ulid("lecture-4"), run_id: RUN, contexte: "contrefactuel_outil" }),
    ];
    expect(lecturesANoter(RUN, recues)).toEqual([L1, L2].sort());
  });

  it("une lecture d'un autre run, ou en double : refus nommé", () => {
    expect(() => lecturesANoter(RUN, [lectureComparateur({ id: L1, run_id: ulid("autre-run") })])).toThrow(NotationLectureRefusee);
    expect(() => lecturesANoter(RUN, [lectureComparateur({ id: L1, run_id: RUN }), lectureComparateur({ id: L1, run_id: RUN })])).toThrow(/double/);
  });
});

describe("double notation humaine et arbitrage", () => {
  it("aucune notation, puis une seule : à noter, avec le nombre de notations manquantes", () => {
    expect(etat([])).toEqual({ statut: "a_noter", lecture_id: L1, notations_manquantes: 2 });
    expect(etat([double("a1")])).toEqual({ statut: "a_noter", lecture_id: L1, notations_manquantes: 1 });
  });

  it("deux humains d'accord : leur note est retenue, sans arbitrage", () => {
    const [a, b] = [double("a1"), double("a2")];
    const retenu = etat([a, b]);
    expect(retenu).toMatchObject({ statut: "retenue", lecture_id: L1, mode: "accord_humains", note: { categorie: "exacte", drapeaux: [] } });
    if (retenu.statut === "retenue") expect([...retenu.notations_sources].sort()).toEqual([a.id, b.id].sort());
  });

  it("deux humains en désaccord, sans troisième : à arbitrer, jamais une note en repli", () => {
    const [a, b] = [double("a1"), double("a2", L1, inexacte())];
    expect(etat([a, b])).toEqual({ statut: "a_arbitrer", lecture_id: L1, notations: [a.id, b.id].sort() });
  });

  it("désaccord puis arbitrage d'un troisième humain : la note de l'arbitre est retenue", () => {
    const [a, b, c] = [double("a1"), double("a2", L1, inexacte()), arbitre("a3", L1, inexacte())];
    const retenu = etat([a, b, c]);
    expect(retenu).toMatchObject({ statut: "retenue", mode: "arbitrage", note: { categorie: "inexacte" } });
    if (retenu.statut === "retenue") expect([...retenu.notations_sources].sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("l'arbitre peut noter « indéterminée » : elle est retenue (réservée aux humains)", () => {
    const retenu = etat([double("a1"), double("a2", L1, inexacte()), arbitre("a3", L1, INDETERMINEE)]);
    expect(retenu).toMatchObject({ statut: "retenue", mode: "arbitrage", note: { categorie: "indeterminee" } });
  });

  it("deux « indéterminée » s'accordent", () => {
    expect(etat([double("a1", L1, INDETERMINEE), double("a2", L1, INDETERMINEE)])).toMatchObject({ statut: "retenue", mode: "accord_humains" });
  });

  it("chaque lecture a son état, dans l'ordre des lectures à noter", () => {
    const deux = [lectureComparateur({ id: L1, run_id: RUN }), lectureComparateur({ id: L2, run_id: RUN })];
    const etats = etatsDesLectures(RUN, deux, [double("a1", L2), double("a2", L2)]);
    expect(etats.map((e) => [e.lecture_id, e.statut])).toEqual([L1, L2].sort().map((id) => [id, id === L2 ? "retenue" : "a_noter"]));
  });
});

describe("§6 (0.31, D73 (14)) : deux humains d'accord sur la note mais motifs différents → troisième humain", () => {
  const OPPOSEE: Surcharges = { ...inexacte(), motif_inexactitude: "position_opposee" };

  it("sans arbitre : à arbitrer, jamais retenue sur la note de l'un des deux", () => {
    const [a, b] = [double("a1", L1, inexacte()), double("a2", L1, OPPOSEE)];
    expect(etat([a, b])).toEqual({ statut: "a_arbitrer", lecture_id: L1, notations: [a.id, b.id].sort() });
  });

  it("l'arbitre rejoint l'un des deux motifs : sa note est retenue", () => {
    const [a, b, c] = [double("a1", L1, inexacte()), double("a2", L1, OPPOSEE), arbitre("a3", L1, OPPOSEE)];
    const retenu = etat([a, b, c]);
    expect(retenu).toMatchObject({ statut: "retenue", mode: "arbitrage", note: { categorie: "inexacte" } });
    if (retenu.statut === "retenue") expect([...retenu.notations_sources].sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("l'arbitre donne un troisième motif : sa note est retenue (§7, la note du troisième humain)", () => {
    const retenu = etat([double("a1", L1, inexacte()), double("a2", L1, OPPOSEE), arbitre("a3", L1, { ...inexacte(), motif_inexactitude: "omission" })]);
    expect(retenu).toMatchObject({ statut: "retenue", mode: "arbitrage" });
  });

  it("même motif : aucun arbitrage admis", () => {
    expect(refus([double("a1", L1, inexacte()), double("a2", L1, inexacte()), arbitre("a3", L1, inexacte())]).motif).toBe("arbitrage_sans_divergence");
  });
});

describe("§6 (0.31, D73 (13)) : le verdict d'une lecture", () => {
  const CADRE = { verdict_id: ulid("verdict-lecture"), date: "2026-12-08T12:00:00+01:00" };

  function verdict(notations: readonly NotationIndividuelle[]): VerdictProduit {
    const produit = verdictDeLecture(RUN, lectures, notations, L1, CADRE);
    return valider<VerdictProduit>("verdict", produit, "verdict de lecture");
  }

  function sansVerdict(notations: readonly NotationIndividuelle[]): LectureSansVerdict {
    try {
      verdictDeLecture(RUN, lectures, notations, L1, CADRE);
    } catch (erreur) {
      if (erreur instanceof LectureSansVerdict) return erreur;
      throw erreur;
    }
    throw new Error("aurait dû être refusé");
  }

  it("deux humains d'accord : mode lecture_comparateur_humaine, hors échantillon humain, sans désaccord de juges, revue humaine", () => {
    const [a, b] = [double("a1"), double("a2", L1, { date: "2026-12-06T09:30:00+01:00" })];
    const v = verdict([a, b]);
    expect(v).toMatchObject({
      id: CADRE.verdict_id,
      run_id: RUN,
      contexte: "run",
      objet_note: { type: "lecture_comparateur", id: L1 },
      categorie_retenue: "exacte",
      mode_resolution: "lecture_comparateur_humaine",
      dans_echantillon_humain: false,
      desaccord_juges: false,
      erreur_grave: false,
      date: CADRE.date,
    });
    expect([...v.notations_sources].sort()).toEqual([a.id, b.id].sort());
    expect(v.revue_humaine).toEqual({ effectuee: true, date: b.date, annotateurs: ["a1", "a2"] });
  });

  it("après arbitrage (motif divergent) : la note de l'arbitre, son motif, trois humains pour sources", () => {
    const [a, b, c] = [double("a1", L1, inexacte()), double("a2", L1, { ...inexacte(), motif_inexactitude: "position_opposee" }), arbitre("a3", L1, { ...inexacte(), motif_inexactitude: "omission" })];
    const v = verdict([a, b, c]);
    expect(v).toMatchObject({ mode_resolution: "lecture_comparateur_humaine", dans_echantillon_humain: false, categorie_retenue: "inexacte", motif_inexactitude_retenu: "omission" });
    expect([...v.notations_sources].sort()).toEqual([a.id, b.id, c.id].sort());
    expect(v.revue_humaine?.annotateurs).toEqual(["a1", "a2", "a3"]);
  });

  it("après arbitrage d'une divergence de note : « indéterminée » de l'arbitre retenue", () => {
    expect(verdict([double("a1"), double("a2", L1, inexacte()), arbitre("a3", L1, INDETERMINEE)])).toMatchObject({ categorie_retenue: "indeterminee", mode_resolution: "lecture_comparateur_humaine" });
  });

  it("une fabrication confirmée par les deux humains : erreur grave, revue humaine", () => {
    const v = verdict([double("a1", L1, inexacte(["fabrication"])), double("a2", L1, inexacte(["fabrication"]))]);
    expect(v).toMatchObject({ erreur_grave: true, drapeaux_retenus: ["fabrication"], revue_humaine: { effectuee: true } });
  });

  it("lecture à noter ou à arbitrer : pas de verdict, refus nommé avec l'état", () => {
    expect(sansVerdict([double("a1")]).statut).toBe("a_noter");
    expect(sansVerdict([double("a1"), double("a2", L1, inexacte())]).statut).toBe("a_arbitrer");
  });

  it("D75 (15) : accord, même motif, mais l'existence d'un lien diverge : à arbitrer, puis la note de l'arbitre est retenue", () => {
    const a = double("a1", L1, { sourcage: { cite: true, liens: [lien("mort", "non_applicable")] } });
    const b = double("a2", L1, { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    expect(sansVerdict([a, b]).statut).toBe("a_arbitrer");
    const c = arbitre("a3", L1, { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    const v = verdict([a, b, c]);
    expect(v.sourcage_retenu).toEqual({ cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: false });
    expect([...v.notations_sources].sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("D75 (15) : accord, même motif, mais la citation d'une source diverge : à arbitrer", () => {
    expect(sansVerdict([double("a1", L1, { sourcage: { cite: false, liens: [] } }), double("a2", L1, { sourcage: { cite: true, liens: [] } })]).statut).toBe("a_arbitrer");
  });

  it("une lecture qui n'est pas à noter : refus nommé", () => {
    expect(() => verdictDeLecture(RUN, lectures, [], ulid("lecture-inconnue"), CADRE)).toThrow(NotationLectureRefusee);
  });
});

describe("schéma : le mode d'une lecture lui est propre (D73 (13))", () => {
  const base = (): Record<string, unknown> => {
    const v = verdictDeLecture(RUN, lectures, [double("a1"), double("a2")], L1, { verdict_id: ulid("v-schema"), date: "2026-12-08T12:00:00+01:00" });
    return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
  };

  it("une lecture dans l'échantillon humain est invalide", () => {
    expect(() => valider("verdict", { ...base(), dans_echantillon_humain: true }, "lecture dans l'échantillon")).toThrow();
  });

  it("une lecture sous un autre mode, ou ce mode sur une réponse, est invalide", () => {
    expect(() => valider("verdict", { ...base(), mode_resolution: "tranche_humain" }, "lecture tranchée")).toThrow();
    expect(() => valider("verdict", { ...base(), objet_note: { type: "reponse", id: L1 } }, "réponse en mode lecture")).toThrow();
  });

  it("un verdict de lecture sans revue humaine, ou sur une seule notation, est invalide", () => {
    const { revue_humaine: _r, ...sansRevue } = base();
    expect(() => valider("verdict", sansRevue, "sans revue")).toThrow();
    const une = base();
    expect(() => valider("verdict", { ...une, notations_sources: (une["notations_sources"] as string[]).slice(0, 1) }, "une source")).toThrow();
  });
});

describe("refus nommés : rien n'est ignoré, aucun juge automatique", () => {
  it("une notation de juge sur une lecture : refusée (aucun juge automatique, §6 0.24)", () => {
    const { version_charge: _v, ...juge } = notationJuge("j1", { run_id: RUN, objet_note: { type: "lecture_comparateur", id: L1 } });
    expect(refus([juge as NotationIndividuelle]).motif).toBe("notateur_non_humain");
  });

  it("un humain sous un autre motif (échantillon de 10 %) : refusé", () => {
    const { version_charge: _v, ...autre } = notationHumaine("a1", "echantillon_aleatoire_10", { run_id: RUN, objet_note: { type: "lecture_comparateur", id: L1 } });
    expect(refus([autre as NotationIndividuelle]).motif).toBe("motif_hors_comparateur");
  });

  it("une notation qui a vu l'identité de l'outil : refusée (à l'aveugle)", () => {
    const vue = double("a1", L1, { notateur: { type: "humain", id: "a1", sensibilite_declaree_famille: "famille-1", a_vu_identite_outil: true } });
    expect(refus([vue]).motif).toBe("non_aveugle");
  });

  it("§6.42 : une notation sans déclaration d'aveuglement (champ absent) : refusée, non_aveugle — une déclaration absente n'est pas une preuve", () => {
    const sansDeclaration = double("a1", L1, { notateur: { type: "humain", id: "a1", sensibilite_declaree_famille: "famille-1" } });
    expect("a_vu_identite_outil" in sansDeclaration.notateur).toBe(false);
    expect(refus([sansDeclaration]).motif).toBe("non_aveugle");
    // Seule la seconde porte la déclaration manquante : le refus ne dépend pas de l'ordre.
    expect(refus([double("a2"), sansDeclaration]).motif).toBe("non_aveugle");
  });

  it("§6.42 : une déclaration explicite false est admise, la notation compte", () => {
    const aveugle = double("a1", L1, { notateur: { type: "humain", id: "a1", sensibilite_declaree_famille: "famille-1", a_vu_identite_outil: false } });
    expect(etat([aveugle])).toEqual({ statut: "a_noter", lecture_id: L1, notations_manquantes: 1 });
  });

  it("deux notations du même annotateur : refusées", () => {
    const bis = { ...double("a1"), id: ulid("bis") };
    expect(refus([double("a1"), bis]).motif).toBe("meme_annotateur");
  });

  it("trois doubles notations : refusées", () => {
    expect(refus([double("a1"), double("a2"), double("a3")]).motif).toBe("trop_de_notations");
  });

  it("un arbitre qui est l'un des deux annotateurs : refusé", () => {
    expect(refus([double("a1"), double("a2", L1, inexacte()), arbitre("a2", L1)]).motif).toBe("arbitre_non_tiers");
  });

  it("un arbitrage alors que les deux s'accordent, ou avant la seconde notation : refusé", () => {
    expect(refus([double("a1"), double("a2"), arbitre("a3")]).motif).toBe("arbitrage_sans_divergence");
    expect(refus([double("a1"), arbitre("a3")]).motif).toBe("arbitrage_sans_divergence");
  });

  it("deux arbitrages : refusés", () => {
    expect(refus([double("a1"), double("a2", L1, inexacte()), arbitre("a3"), arbitre("a4")]).motif).toBe("arbitrages_multiples");
  });

  it("une notation sur une lecture qui n'est pas à noter, ou d'un autre run : refusée", () => {
    expect(refus([double("a1", ulid("lecture-inconnue"))]).motif).toBe("lecture_hors_selection");
    expect(refus([{ ...double("a1"), run_id: ulid("autre-run") }]).motif).toBe("lecture_hors_selection");
  });
});

describe("schéma : aucun juge automatique sur une lecture de comparateur", () => {
  it("une notation de juge sur une lecture est invalide au schéma", () => {
    const { version_charge: _v, ...juge } = notationJuge("j1", { objet_note: { type: "lecture_comparateur", id: L1 } });
    expect(() => valider("notation", juge, "juge sur lecture")).toThrow();
  });

  it("les motifs de lecture ne valent que pour une lecture, par un humain", () => {
    const surReponse = notationHumaine("a1", MOTIF_DOUBLE_NOTATION_COMPARATEUR);
    expect(() => valider("notation", surReponse, "motif de lecture sur une réponse")).toThrow();
  });
});
