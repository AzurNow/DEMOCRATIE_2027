/**
 * La section des comparateurs de `pnpm analyze` (§8, métriques secondaires ; §6, QR9) : couverture
 * (items P affichés / items P de référence) et exactitude (items affichés compatibles / items affichés
 * classés) de chaque comparateur inclus, chacune avec son intervalle (§8, « Incertitude »), sous la clé
 * `bootstrap / <outil> / lecture / <métrique> / global` (§8, « Graines de l'analyse » : « Un taux qui
 * n'a pas de mode, celui d'un comparateur […], porte à la place du mode le composant `lecture` »).
 *
 * La note retenue d'une lecture affichée vient de ses notations humaines, par la règle de
 * l'échantillon (§6 ; `pipeline/notation/lectures-comparateur.ts:etatsDesLectures`, injectée comme
 * `pnpm analyze` l'injecte) : une notation sans déclaration d'aveuglement est refusée (D62).
 */

import { describe, expect, it } from "vitest";
import { analyserRun, etatsDesLecturesDuRun, LectureNonRetenue, VerdictDeLectureNonDefini, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { LecturesComparateurIncoherentes } from "../../analysis/reference-comparateurs.ts";
import type { CategorieRetenue, LectureComparateur, Notation } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { etatsDesLectures, MOTIF_DOUBLE_NOTATION_COMPARATEUR, NotationLectureRefusee } from "../../pipeline/notation/lectures-comparateur.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
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

/** Le run de référence, ou `base`, avec ses comparateurs inclus, leurs lectures et leurs notations. */
function avecComparateurs(spec: SpecComparateurs, base: SpecRun = SPEC_REFERENCE, ajuster: (e: EntreesDuRun) => EntreesDuRun = (e) => e): EntreesDuRun {
  const sans = ajuster(entreesDuRunAnalysable(base));
  const comparateurs = Object.keys(spec.comparateurs).map((outil_id) => outil({ outil_id, famille: "comparateur", mode_de_tete: undefined }));
  const entrees: EntreesDuRun = { ...sans, run: { ...sans.run, perimetre: { ...sans.run.perimetre, outils: [...sans.run.perimetre.outils, ...comparateurs] } } };
  const { lectures, notations } = poserLectures(entrees, spec);
  return {
    ...entrees,
    lectures,
    notations: [...entrees.notations, ...(notations as Notation[])],
    etats_des_lectures: etatsDesLecturesDuRun(entrees.run.id, lectures, notations, etatsDesLectures),
  };
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

  it("une lecture affichée encore à noter ou à arbitrer : refus nommé, jamais une note en repli", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const [premier, ...reste] = entrees.etats_des_lectures;
    if (premier === undefined) throw new Error("aucun état");
    const aNoter = { ...entrees, etats_des_lectures: [{ statut: "a_noter" as const, lecture_id: premier.lecture_id }, ...reste] };
    expect(() => analyserRun(aNoter, PARAMETRES, null)).toThrow(LectureNonRetenue);
  });

  it("une note pour une lecture qui n'est pas une lecture affichée du run : refus", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const etranger = { statut: "retenue" as const, lecture_id: ulid("lecture-etrangere"), note: { categorie: "exacte" as const } };
    expect(() => analyserRun({ ...entrees, etats_des_lectures: [...entrees.etats_des_lectures, etranger] }, PARAMETRES, null)).toThrow(LectureNonRetenue);
  });

  it("un verdict de lecture dans verdicts/ : refus, la note d'une lecture ne se lit pas à deux endroits", () => {
    const entrees = avecComparateurs({ comparateurs: { "comparateur-un": UN_SUR_DEUX } });
    const [lecture] = entrees.lectures;
    if (lecture === undefined) throw new Error("aucune lecture");
    const surLecture = verdict({ id: ulid("v-lecture"), objet_note: { type: "lecture_comparateur", id: lecture.id } });
    expect(() => analyserRun({ ...entrees, verdicts: [...entrees.verdicts, surLecture] }, PARAMETRES, null)).toThrow(VerdictDeLectureNonDefini);
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
