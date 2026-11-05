/**
 * La section des comparateurs de `pnpm analyze` (§8, métriques secondaires ; §6, QR9) : couverture
 * (items P affichés / items P de référence) et exactitude (items affichés compatibles / items affichés
 * classés) de chaque comparateur inclus, chacune avec son intervalle (§8, « Incertitude »), sous la clé
 * `bootstrap / <outil> / lecture / <métrique> / global` (§8, « Graines de l'analyse » : « Un taux qui
 * n'a pas de mode, celui d'un comparateur […], porte à la place du mode le composant `lecture` »).
 *
 * La note retenue d'une lecture affichée est celle de son verdict de lecture (§6, 0.31, D73 (13) ;
 * D75 (16)), construit ici comme la chaîne le construit
 * (`pipeline/notation/lectures-comparateur.ts:verdictDeLecture`), et recoupée par la règle de
 * l'échantillon sur ses notations humaines (`etatsDesLectures`, injectée comme `pnpm analyze`
 * l'injecte) : une notation sans déclaration d'aveuglement est refusée (D62).
 */

import { describe, expect, it } from "vitest";
import { analyserRun, etatsDesLecturesDuRun, LectureNonRetenue, VerdictDeLectureIncoherent, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { VerdictEnDouble } from "../../analysis/filtre.ts";
import { LecturesComparateurIncoherentes } from "../../analysis/reference-comparateurs.ts";
import type { CategorieRetenue, LectureComparateur, Notation, Verdict } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { etatsDesLectures, MOTIF_DOUBLE_NOTATION_COMPARATEUR, NotationLectureRefusee, verdictDeLecture } from "../../pipeline/notation/lectures-comparateur.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import { notationHumaine } from "../notation/fabriques.ts";
import { empreinte, outil, ulid, verdict } from "./fabriques.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE, type SpecRun } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 40, permutations: 40 };

type Json = Record<string, unknown>;

interface TauxPublieJson {
  readonly metrique: string;
  readonly strate: string;
  readonly taux: { numerateur: number; denominateur: number; valeur?: number };
  readonly motif_absence: string | null;
  readonly intervalle: { cle: string[]; graine: string; intervalle: { nombre_grappes: number } | null; raison_sans_intervalle: string | null };
  readonly taux_degenere: string | null;
}

interface ComparateurJson {
  readonly outil_id: string;
  readonly couverture: TauxPublieJson;
  readonly exactitude: TauxPublieJson;
}

/** Ce que lit un comparateur sur l'item de rang `rang` de la référence triée : affiché, et sa note. */
type Lecteur = (rang: number, item_id: string) => { readonly affiche: false } | { readonly affiche: true; readonly categorie: CategorieRetenue };

interface SpecComparateurs {
  readonly comparateurs: Readonly<Record<string, Lecteur>>;
  /** Pour retirer à un notateur sa déclaration d'aveuglement (D62). */
  readonly aveugle?: boolean;
}

const INDETERMINEE = {
  categorie: "indeterminee" as const,
  extrait_justificatif: { provenance: "reponse" as const, texte: "position ambiguë", verifie_deterministe: true },
};

const INEXACTE = {
  categorie: "inexacte" as const,
  motif_inexactitude: "position_opposee" as const,
  extrait_justificatif: { provenance: "reponse" as const, texte: "position contraire", verifie_deterministe: true },
};

function surcharges(categorie: CategorieRetenue): object {
  if (categorie === "indeterminee") return INDETERMINEE;
  if (categorie === "inexacte") return INEXACTE;
  return { categorie };
}

/** Deux notations humaines à l'aveugle d'une lecture, concordantes (§6). */
function notationsDe(lecture: LectureComparateur, categorie: CategorieRetenue, aveugle: boolean): NotationIndividuelle[] {
  return ["a1", "a2"].map((annotateur) => {
    const { version_charge: _sans, ...humaine } = notationHumaine(annotateur, MOTIF_DOUBLE_NOTATION_COMPARATEUR, {
      run_id: lecture.run_id,
      objet_note: { type: "lecture_comparateur", id: lecture.id },
      ...surcharges(categorie),
    });
    const notateur = aveugle ? humaine.notateur : { type: "humain" as const, id: annotateur, sensibilite_declaree_famille: "famille-1" };
    return { ...humaine, notateur, id: ulid(`n-${lecture.id}-${annotateur}`) };
  });
}

interface LecturesPosees {
  readonly lectures: LectureComparateur[];
  readonly notations: NotationIndividuelle[];
}

function poserLectures(entrees: EntreesDuRun, spec: SpecComparateurs): LecturesPosees {
  const reference = entrees.run.perimetre.candidats.flatMap((c) => c.items_p_au_gel).sort();
  const posees: LecturesPosees = { lectures: [], notations: [] };
  for (const [outil_id, lecteur] of Object.entries(spec.comparateurs)) {
    reference.forEach((item_id, rang) => {
      const lu = lecteur(rang, item_id);
      const lecture: LectureComparateur = {
        id: ulid(`lecture-${outil_id}-${item_id}`),
        run_id: entrees.run.id,
        contexte: "run",
        outil_id,
        reference_item: { item_id, item_version: 1, item_empreinte: empreinte(item_id) },
        affiche: lu.affiche,
      };
      posees.lectures.push(lecture);
      if (lu.affiche) posees.notations.push(...notationsDe(lecture, lu.categorie, spec.aveugle !== false));
    });
  }
  return posees;
}

const DATE_VERDICT_LECTURE = "2026-12-06T12:00:00+01:00";

/** §6 (0.31, D73 (13)) : le verdict de chaque lecture affichée, construit comme la chaîne le construit, depuis ses notations. */
function verdictsDesLectures(run_id: string, lectures: readonly LectureComparateur[], notations: readonly NotationIndividuelle[]): Verdict[] {
  return lectures
    .filter((l) => l.affiche)
    .map((l) => verdictDeLecture(run_id, lectures, notations, l.id, { verdict_id: ulid(`v-${l.id}`), date: DATE_VERDICT_LECTURE }));
}

/** Le run de référence, ou `base`, avec ses comparateurs inclus, leurs lectures, leurs notations et leurs verdicts. */
function avecComparateurs(spec: SpecComparateurs, base: SpecRun = SPEC_REFERENCE, ajuster: (e: EntreesDuRun) => EntreesDuRun = (e) => e): EntreesDuRun {
  const sans = ajuster(entreesDuRunAnalysable(base));
  const comparateurs = Object.keys(spec.comparateurs).map((outil_id) => outil({ outil_id, famille: "comparateur", mode_de_tete: undefined }));
  const entrees: EntreesDuRun = { ...sans, run: { ...sans.run, perimetre: { ...sans.run.perimetre, outils: [...sans.run.perimetre.outils, ...comparateurs] } } };
  const { lectures, notations } = poserLectures(entrees, spec);
  const etats_des_lectures = etatsDesLecturesDuRun(entrees.run.id, lectures, notations, etatsDesLectures);
  return {
    ...entrees,
    lectures,
    notations: [...entrees.notations, ...(notations as Notation[])],
    verdicts: [...entrees.verdicts, ...verdictsDesLectures(entrees.run.id, lectures, notations)],
    etats_des_lectures,
  };
}

/** Les entrées sans le verdict de la lecture `lecture_id`. */
function sansVerdictDe(entrees: EntreesDuRun, lecture_id: string): EntreesDuRun {
  return { ...entrees, verdicts: entrees.verdicts.filter((v) => v.objet_note.id !== lecture_id) };
}

function sectionDe(entrees: EntreesDuRun): Json {
  return (analyserRun(entrees, PARAMETRES, null) as Json)["comparateurs"] as Json;
}

function comparateur(section: Json, outil_id: string): ComparateurJson {
  const trouve = (section["comparateurs"] as ComparateurJson[]).find((c) => c.outil_id === outil_id);
  if (trouve === undefined) throw new Error(`comparateur ${outil_id} absent`);
  return trouve;
}

/** Affiche un item sur deux (rangs pairs) ; tous exacts, sauf le rang 2, inexact, et le rang 4, indéterminé. */
const UN_SUR_DEUX: Lecteur = (rang) => {
  if (rang % 2 === 1) return { affiche: false };
  if (rang === 2) return { affiche: true, categorie: "inexacte" };
  return { affiche: true, categorie: rang === 4 ? "indeterminee" : "exacte" };
};
const AUCUN: Lecteur = () => ({ affiche: false });

// SPEC_REFERENCE : candidat-a et candidat-b à 20 items P au gel, candidat-bas (sous le seuil) à 2.
const REFERENCE = 42;

describe("section des comparateurs : sans objet, jamais vide", () => {
  it("aucun comparateur inclus : sans_objet, motif aucun_comparateur_inclus, et le document reste conforme", () => {
    const document = analyserRun(entreesDuRunAnalysable(SPEC_REFERENCE), PARAMETRES, null) as Json;
    expect(document["comparateurs"]).toEqual({ statut: "sans_objet", motif: "aucun_comparateur_inclus" });
    expect(() => valider("metriques", document, "document sans comparateur")).not.toThrow();
  });

  it("un comparateur inclus sans aucune lecture : refus (LecturesComparateurIncoherentes), jamais une couverture nulle", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    expect(() => analyserRun({ ...entrees, lectures: [], etats_des_lectures: [] }, PARAMETRES, null)).toThrow(LecturesComparateurIncoherentes);
  });

  it("une lecture sans comparateur inclus au run : refus, la lecture n'est pas ignorée", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": AUCUN } });
    const sansComparateur = { ...entrees, run: { ...entrees.run, perimetre: { ...entrees.run.perimetre, outils: entrees.run.perimetre.outils.filter((o) => o.famille === "assistant") } } };
    expect(() => analyserRun(sansComparateur, PARAMETRES, null)).toThrow(LecturesComparateurIncoherentes);
  });
});

describe("couverture et exactitude d'un comparateur (§8)", () => {
  const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX, "comparateur-deux": AUCUN } });
  const section = sectionDe(entrees);

  it("la couverture divise les items affichés par les items P de référence, sous-seuil compris", () => {
    expect(section["statut"]).toBe("calcule");
    expect(section["items_p_de_reference"]).toBe(REFERENCE);
    const un = comparateur(section, "comparateur-un");
    expect(un.couverture).toMatchObject({ metrique: "couverture", strate: "global", taux: { numerateur: 21, denominateur: REFERENCE }, motif_absence: null, taux_degenere: null });
    expect(un.couverture.intervalle.intervalle?.nombre_grappes).toBe(REFERENCE);
  });

  it("une lecture indéterminée sort du dénominateur de l'exactitude, pas de celui de la couverture", () => {
    const un = comparateur(section, "comparateur-un");
    // 21 affichées : une inexacte (rang 2), une indéterminée (rang 4), 19 exactes ; 20 classées.
    expect(un.exactitude).toMatchObject({ metrique: "exactitude", strate: "global", taux: { numerateur: 19, denominateur: 20 }, motif_absence: null });
    // La grappe est l'item, et la strate `global` est l'ensemble des lectures du comparateur : une
    // lecture non affichée est hors du dénominateur comme une non-réponse d'assistant, pas hors des grappes.
    expect(un.exactitude.intervalle.intervalle?.nombre_grappes).toBe(REFERENCE);
  });

  it("un comparateur qui n'affiche rien : couverture nulle (aucun événement), exactitude absente (denominateur_nul)", () => {
    const deux = comparateur(section, "comparateur-deux");
    expect(deux.couverture).toMatchObject({ taux: { numerateur: 0, denominateur: REFERENCE }, taux_degenere: "aucun_evenement" });
    expect(deux.exactitude).toMatchObject({ taux: { numerateur: 0, denominateur: 0 }, motif_absence: "denominateur_nul", taux_degenere: null });
    expect(deux.exactitude.intervalle).toMatchObject({ intervalle: null, raison_sans_intervalle: "aucun_reechantillon_defini" });
  });

  it("les comparateurs sont publiés dans l'ordre du périmètre, et chaque clé porte le composant lecture à la place du mode", () => {
    expect((section["comparateurs"] as ComparateurJson[]).map((c) => c.outil_id)).toEqual(["comparateur-un", "comparateur-deux"]);
    const un = comparateur(section, "comparateur-un");
    expect(un.couverture.intervalle.cle).toEqual(["bootstrap", "comparateur-un", "lecture", "couverture", "global"]);
    expect(un.exactitude.intervalle.cle).toEqual(["bootstrap", "comparateur-un", "lecture", "exactitude", "global"]);
  });

  it("les graines des comparateurs sont relevées par collecterGraines, et le document est conforme", () => {
    const document = analyserRun(entrees, PARAMETRES, null) as Json;
    const graines = (document["graines"] as { cle: string[]; graine: string }[]).map((g) => g.cle.join("/"));
    expect(graines).toContain("bootstrap/comparateur-un/lecture/couverture/global");
    expect(graines).toContain("bootstrap/comparateur-deux/lecture/exactitude/global");
    expect(() => valider("metriques", document, "document avec comparateurs")).not.toThrow();
  });
});

describe("items P de référence par candidat", () => {
  it("un candidat interrogé sans item P au gel n'ajoute rien à la référence ; une référence vide rend des taux absents, pas nuls", () => {
    const vide = (e: EntreesDuRun): EntreesDuRun => ({
      ...e,
      run: { ...e.run, perimetre: { ...e.run.perimetre, candidats: e.run.perimetre.candidats.map((c) => ({ ...c, items_p_verifies: 0, items_p_au_gel: [] })) } },
    });
    const section = sectionDe(avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } }, SPEC_REFERENCE, vide));
    expect(section["items_p_de_reference"]).toBe(0);
    const un = comparateur(section, "comparateur-un");
    expect(un.couverture).toMatchObject({ taux: { numerateur: 0, denominateur: 0 }, motif_absence: "strate_vide" });
    expect(un.couverture.intervalle.raison_sans_intervalle).toBe("aucune_grappe");
  });

  it("un candidat sans item P n'en retire aucun aux autres", () => {
    const sansB = (e: EntreesDuRun): EntreesDuRun => ({
      ...e,
      run: {
        ...e.run,
        perimetre: { ...e.run.perimetre, candidats: e.run.perimetre.candidats.map((c) => (c.candidat_id === "candidat-b" ? { ...c, items_p_verifies: 0, items_p_au_gel: [] } : c)) },
      },
    });
    const section = sectionDe(avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } }, SPEC_REFERENCE, sansB));
    expect(section["items_p_de_reference"]).toBe(22);
    expect(comparateur(section, "comparateur-un").couverture.taux).toMatchObject({ numerateur: 11, denominateur: 22 });
  });

  it("le candidat sous le seuil de couverture garde ses items P dans la référence (§8 : ceux qui comptent pour son seuil)", () => {
    const bas = entreesDuRunAnalysable(SPEC_REFERENCE).run.perimetre.candidats.find((c) => c.sous_seuil);
    if (bas === undefined) throw new Error("aucun candidat sous le seuil");
    expect(bas.items_p_au_gel).toHaveLength(2);
    const sesItems = new Set(bas.items_p_au_gel);
    const lecteur: Lecteur = (_rang, item_id) => (sesItems.has(item_id) ? { affiche: true, categorie: "exacte" } : { affiche: false });
    const section = sectionDe(avecComparateurs({ comparateurs: { "comparateur-un": lecteur } }));
    expect(section["items_p_de_reference"]).toBe(REFERENCE);
    expect(comparateur(section, "comparateur-un").couverture.taux).toMatchObject({ numerateur: 2, denominateur: REFERENCE });
    expect(comparateur(section, "comparateur-un").exactitude).toMatchObject({ taux: { numerateur: 2, denominateur: 2 }, taux_degenere: "aucun_non_evenement" });
  });
});

describe("régime entre_deux_tours (§3, D68)", () => {
  it("le comparateur inclus reste lu, sur les items P de référence des deux finalistes", () => {
    const deuxTours: SpecRun = {
      ...SPEC_REFERENCE,
      candidats: SPEC_REFERENCE.candidats.filter((c) => !c.sous_seuil),
      run: { regime_inclusion: "entre_deux_tours" },
    };
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } }, deuxTours);
    const document = analyserRun(entrees, PARAMETRES, null) as Json;
    expect((document["population"] as Json)["regime_inclusion"]).toBe("entre_deux_tours");
    const section = document["comparateurs"] as Json;
    expect(section["items_p_de_reference"]).toBe(40);
    expect(comparateur(section, "comparateur-un").couverture.taux).toMatchObject({ numerateur: 20, denominateur: 40 });
    expect(() => valider("metriques", document, "entre deux tours")).not.toThrow();
  });
});

describe("notes des lectures : humaines, à l'aveugle, complètes", () => {
  it("une notation sans déclaration d'aveuglement est refusée (D62), et rien n'est calculé", () => {
    expect(() => avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX }, aveugle: false })).toThrow(NotationLectureRefusee);
    try {
      avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX }, aveugle: false });
    } catch (erreur) {
      expect((erreur as NotationLectureRefusee).motif).toBe("non_aveugle");
    }
  });

  it("une note pour une lecture qui n'est pas une lecture affichée du run : refus", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const etranger = { statut: "retenue" as const, lecture_id: ulid("lecture-etrangere"), note: { categorie: "exacte" as const } };
    expect(() => analyserRun({ ...entrees, etats_des_lectures: [...entrees.etats_des_lectures, etranger] }, PARAMETRES, null)).toThrow(LectureNonRetenue);
  });
});

/** La première lecture affichée de `outil_id` (UN_SUR_DEUX : rang 0, exacte). */
function premiereAffichee(entrees: EntreesDuRun, outil_id: string): LectureComparateur {
  const lecture = entrees.lectures.find((l) => l.outil_id === outil_id && l.affiche);
  if (lecture === undefined) throw new Error(`aucune lecture affichée de ${outil_id}`);
  return lecture;
}

describe("D75 (16) : la section des comparateurs lit le verdict de lecture", () => {
  it("D75 (16) verdict de lecture présent : la section le lit (mode lecture_comparateur_humaine), et le document est conforme", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const deLecture = entrees.verdicts.filter((v) => v.objet_note.type === "lecture_comparateur");
    expect(deLecture).toHaveLength(21);
    expect(deLecture.every((v) => (v as Verdict & { mode_resolution?: string }).mode_resolution === "lecture_comparateur_humaine")).toBe(true);
    const document = analyserRun(entrees, PARAMETRES, null) as Json;
    const un = comparateur(document["comparateurs"] as Json, "comparateur-un");
    expect(un.exactitude.taux).toMatchObject({ numerateur: 19, denominateur: 20 });
    expect(() => valider("metriques", document, "verdicts de lecture lus")).not.toThrow();
  });

  it("D75 (16) verdict de lecture absent : le comparateur est absent avec son motif et la lecture nommée, sans exception ; les autres sont calculés", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX, "comparateur-deux": UN_SUR_DEUX } });
    const lecture = premiereAffichee(entrees, "comparateur-un");
    const document = analyserRun(sansVerdictDe(entrees, lecture.id), PARAMETRES, null) as Json;
    const section = document["comparateurs"] as Json;
    expect(section["statut"]).toBe("calcule");
    const liste = section["comparateurs"] as Json[];
    expect(liste[0]).toEqual({ outil_id: "comparateur-un", motif_absence: "lectures_sans_verdict", lectures_sans_verdict: [lecture.id] });
    expect(JSON.stringify(liste[0])).not.toMatch(/couverture|exactitude/);
    expect(comparateur(section, "comparateur-deux").exactitude.taux).toMatchObject({ numerateur: 19, denominateur: 20 });
    // Aucune graine publiée pour le comparateur absent.
    const graines = (document["graines"] as { cle: string[] }[]).map((g) => g.cle.join("/"));
    expect(graines.some((c) => c.includes("comparateur-un"))).toBe(false);
    expect(() => valider("metriques", document, "comparateur sans verdict")).not.toThrow();
  });

  it("D75 (16) aucun verdict de lecture (chaîne de notation pas encore relancée après la saisie humaine, D87) : chaque comparateur absent, ses lectures affichées toutes nommées, triées", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const sans = { ...entrees, verdicts: entrees.verdicts.filter((v) => v.objet_note.type !== "lecture_comparateur") };
    const liste = ((analyserRun(sans, PARAMETRES, null) as Json)["comparateurs"] as Json)["comparateurs"] as Json[];
    const affichees = entrees.lectures.filter((l) => l.affiche).map((l) => l.id).sort();
    expect(liste).toEqual([{ outil_id: "comparateur-un", motif_absence: "lectures_sans_verdict", lectures_sans_verdict: affichees }]);
  });

  it("D75 (16) un comparateur qui n'affiche rien n'attend aucun verdict : il reste calculé", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-deux": AUCUN } });
    expect(entrees.verdicts.some((v) => v.objet_note.type === "lecture_comparateur")).toBe(false);
    const deux = comparateur((analyserRun(entrees, PARAMETRES, null) as Json)["comparateurs"] as Json, "comparateur-deux");
    expect(deux.couverture.taux).toMatchObject({ numerateur: 0, denominateur: REFERENCE });
  });

  it("D75 (16) verdict qui ne concorde pas avec ses notations humaines (autre catégorie) : refus VerdictDeLectureIncoherent", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const lecture = premiereAffichee(entrees, "comparateur-un");
    const verdicts = entrees.verdicts.map((v) => (v.objet_note.id === lecture.id ? { ...v, categorie_retenue: "non_reponse" as const } : v));
    expect(() => analyserRun({ ...entrees, verdicts }, PARAMETRES, null)).toThrow(VerdictDeLectureIncoherent);
  });

  it("D75 (16) verdict d'une lecture que ses notations laissent à noter ou à arbitrer : refus VerdictDeLectureIncoherent, jamais une note en repli", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const lecture = premiereAffichee(entrees, "comparateur-un");
    for (const statut of ["a_noter", "a_arbitrer"] as const) {
      const etats = entrees.etats_des_lectures.map((e) => (e.lecture_id === lecture.id ? { statut, lecture_id: lecture.id } : e));
      expect(() => analyserRun({ ...entrees, etats_des_lectures: etats }, PARAMETRES, null)).toThrow(VerdictDeLectureIncoherent);
    }
  });

  it("D75 (16) lecture à noter sans verdict : le comparateur est absent avec son motif, sans exception", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const lecture = premiereAffichee(entrees, "comparateur-un");
    const etats = entrees.etats_des_lectures.map((e) => (e.lecture_id === lecture.id ? { statut: "a_noter" as const, lecture_id: lecture.id } : e));
    const liste = ((analyserRun({ ...sansVerdictDe(entrees, lecture.id), etats_des_lectures: etats }, PARAMETRES, null) as Json)["comparateurs"] as Json)["comparateurs"] as Json[];
    expect(liste).toEqual([{ outil_id: "comparateur-un", motif_absence: "lectures_sans_verdict", lectures_sans_verdict: [lecture.id] }]);
  });

  it("D75 (16) verdict sur une lecture non affichée, ou étrangère au run : refus LectureNonRetenue", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const cachee = entrees.lectures.find((l) => !l.affiche);
    if (cachee === undefined) throw new Error("aucune lecture non affichée");
    for (const id of [cachee.id, ulid("lecture-etrangere")]) {
      const deTrop = verdict({ id: ulid(`v-de-trop-${id}`), objet_note: { type: "lecture_comparateur", id } });
      expect(() => analyserRun({ ...entrees, verdicts: [...entrees.verdicts, deTrop] }, PARAMETRES, null)).toThrow(LectureNonRetenue);
    }
  });

  it("D75 (16) deux verdicts sur une même lecture : refus VerdictEnDouble, jamais le dernier", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const lecture = premiereAffichee(entrees, "comparateur-un");
    const second = verdict({ id: ulid("v-second"), objet_note: { type: "lecture_comparateur", id: lecture.id } });
    expect(() => analyserRun({ ...entrees, verdicts: [...entrees.verdicts, second] }, PARAMETRES, null)).toThrow(VerdictEnDouble);
  });
});

describe("déterminisme à l'octet", () => {
  it("deux analyses, lectures et notations dans un autre ordre : le même document, octet pour octet", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX, "comparateur-deux": AUCUN } });
    const lectures = [...entrees.lectures].reverse();
    const notations = [...entrees.notations].reverse() as NotationIndividuelle[];
    const melange: EntreesDuRun = {
      ...entrees,
      lectures,
      etats_des_lectures: etatsDesLecturesDuRun(entrees.run.id, lectures, notations, etatsDesLectures),
    };
    const a = JSON.stringify(analyserRun(entrees, PARAMETRES, null));
    const b = JSON.stringify(analyserRun(melange, PARAMETRES, null));
    expect(b).toBe(a);
    expect(JSON.stringify(analyserRun(entrees, PARAMETRES, null))).toBe(a);
  });
});
