/**
 * Les items P de référence des comparateurs (QR9, §6 et §8), et la confrontation des lectures reçues
 * à cette liste.
 *
 * §8 : « pour les comparateurs, couverture (items P affichés / items P de référence) ». Décision de
 * l'auteur du 2026-10-02 (conformité n° 11, texte à écrire au §8 en 0.15) : les items P de référence
 * sont la base du tirage, c'est-à-dire les items P comptés au gel pour les candidats interrogés, ceux
 * dont le total décide du seuil de couverture du §4. Ce module ne recalcule pas cette admission : il
 * lit la liste que le run a figée (`perimetre.candidats[].items_p_au_gel`, produite par
 * `pipeline/questions/couverture.ts:itemsPAuGel`) et contrôle ce que le JSON Schema ne sait pas
 * exprimer : la liste est triée, sans doublon, et sa longueur vaut `items_p_verifies`.
 *
 * §6 : « Pour chaque item P de référence, deux mesures. » Chaque comparateur inclus du run porte
 * donc exactement une lecture par item de la liste, `affiche: false` compris. Une lecture absente
 * sortirait l'item du dénominateur de la couverture, une lecture en double l'y compterait deux fois,
 * une lecture hors de la liste mesurerait un autre ensemble : chacune lève, et l'erreur les liste
 * toutes (sur le modèle de `filtre.ts:ReponsesNonNotees`).
 */

import type { CandidatAuGel, IdentifiantCourt, LectureComparateur, Run, Ulid } from "./types.ts";
import { candidatsInterroges } from "./candidats-interroges.ts";

/** Ce que le run fige de la liste de référence se contredit : la mesure ne part pas d'une base fausse. */
export class ItemsPDeReferenceIncoherents extends Error {
  readonly fautes: readonly string[];

  constructor(fautes: readonly string[]) {
    super(`Items P de référence du run incohérents (${fautes.length}) : ${fautes.join(" ; ")}.`);
    this.name = "ItemsPDeReferenceIncoherents";
    this.fautes = fautes;
  }
}

function strictementCroissante(ids: readonly Ulid[]): boolean {
  return ids.every((id, rang) => {
    const precedent = ids[rang - 1];
    return precedent === undefined || precedent < id;
  });
}

function fautesDuCandidat(candidat: CandidatAuGel): string[] {
  const fautes: string[] = [];
  const liste = candidat.items_p_au_gel;
  if (liste.length !== candidat.items_p_verifies) {
    fautes.push(
      `${candidat.candidat_id} : items_p_verifies vaut ${candidat.items_p_verifies}, items_p_au_gel en liste ${liste.length}`,
    );
  }
  if (!strictementCroissante(liste)) {
    fautes.push(`${candidat.candidat_id} : items_p_au_gel n'est pas triée sans doublon`);
  }
  return fautes;
}

/**
 * La réunion des `items_p_au_gel` des candidats interrogés. Lève `ItemsPDeReferenceIncoherents` sur
 * tout candidat du run (interrogé ou non) dont la liste contredit son compte ou n'est pas triée sans
 * doublon, et sur un item listé pour deux candidats interrogés.
 */
export function itemsPDeReference(run: Run): ReadonlySet<Ulid> {
  const fautes = run.perimetre.candidats.flatMap(fautesDuCandidat);
  const reference = new Set<Ulid>();
  for (const candidat of candidatsInterroges(run.perimetre.candidats)) {
    // Un doublon interne au candidat est déjà une faute de `fautesDuCandidat` : on ne le compte pas deux fois.
    for (const id of new Set(candidat.items_p_au_gel)) {
      if (reference.has(id)) fautes.push(`item ${id} listé pour deux candidats interrogés`);
      reference.add(id);
    }
  }
  if (fautes.length > 0) throw new ItemsPDeReferenceIncoherents(fautes);
  return reference;
}

/** Les comparateurs inclus du run, dans l'ordre du périmètre : ceux dont la couverture se publie. */
export function comparateursDuRun(run: Run): readonly IdentifiantCourt[] {
  return run.perimetre.outils.filter((o) => o.famille === "comparateur" && o.inclus).map((o) => o.outil_id);
}

export interface LectureAbsente {
  readonly outil_id: IdentifiantCourt;
  readonly item_id: Ulid;
}

export interface LecturesEnDouble extends LectureAbsente {
  readonly lectures: readonly Ulid[];
}

export interface ConstatLectures {
  /** Un item P de référence qu'un comparateur inclus ne lit pas. */
  readonly manquantes: readonly LectureAbsente[];
  /** Plusieurs lectures d'un même comparateur sur un même item. */
  readonly en_double: readonly LecturesEnDouble[];
  /** Lectures portant sur un item hors de la liste de référence. */
  readonly hors_reference: readonly Ulid[];
  /** Lectures d'un outil qui n'est pas un comparateur inclus du run. */
  readonly hors_perimetre: readonly Ulid[];
}

/** Les lectures du run ne recouvrent pas exactement les items P de référence, une fois par comparateur. */
export class LecturesComparateurIncoherentes extends Error implements ConstatLectures {
  readonly manquantes: readonly LectureAbsente[];
  readonly en_double: readonly LecturesEnDouble[];
  readonly hors_reference: readonly Ulid[];
  readonly hors_perimetre: readonly Ulid[];

  constructor(constat: ConstatLectures) {
    super(
      [
        "Lectures de comparateur incohérentes avec les items P de référence du run :",
        `${constat.manquantes.length} manquante(s) [${constat.manquantes.map((m) => `${m.outil_id}/${m.item_id}`).join(", ")}],`,
        `${constat.en_double.length} item(s) lu(s) plusieurs fois [${constat.en_double.map((d) => `${d.outil_id}/${d.item_id}`).join(", ")}],`,
        `${constat.hors_reference.length} lecture(s) hors de la liste [${constat.hors_reference.join(", ")}],`,
        `${constat.hors_perimetre.length} lecture(s) d'un outil hors des comparateurs inclus [${constat.hors_perimetre.join(", ")}].`,
      ].join(" "),
    );
    this.name = "LecturesComparateurIncoherentes";
    this.manquantes = constat.manquantes;
    this.en_double = constat.en_double;
    this.hors_reference = constat.hors_reference;
    this.hors_perimetre = constat.hors_perimetre;
  }
}

interface Tri {
  readonly groupes: ReadonlyMap<IdentifiantCourt, LectureComparateur[]>;
  readonly hors_reference: Ulid[];
  readonly hors_perimetre: Ulid[];
}

function trier(
  lectures: readonly LectureComparateur[],
  reference: ReadonlySet<Ulid>,
  comparateurs: readonly IdentifiantCourt[],
): Tri {
  const tri: Tri = {
    groupes: new Map(comparateurs.map((outil_id) => [outil_id, []])),
    hors_reference: [],
    hors_perimetre: [],
  };
  for (const lecture of lectures) {
    const groupe = tri.groupes.get(lecture.outil_id);
    if (groupe === undefined) tri.hors_perimetre.push(lecture.id);
    else if (!reference.has(lecture.reference_item.item_id)) tri.hors_reference.push(lecture.id);
    else groupe.push(lecture);
  }
  return tri;
}

function lecturesParItem(lectures: readonly LectureComparateur[]): ReadonlyMap<Ulid, Ulid[]> {
  const parItem = new Map<Ulid, Ulid[]>();
  for (const lecture of lectures) {
    const deja = parItem.get(lecture.reference_item.item_id);
    if (deja === undefined) parItem.set(lecture.reference_item.item_id, [lecture.id]);
    else deja.push(lecture.id);
  }
  return parItem;
}

/** Manquantes et doublons d'un comparateur, items parcourus dans l'ordre trié de la référence. */
function recouvrement(
  outil_id: IdentifiantCourt,
  lectures: readonly LectureComparateur[],
  reference: readonly Ulid[],
): Pick<ConstatLectures, "manquantes" | "en_double"> {
  const parItem = lecturesParItem(lectures);
  const manquantes: LectureAbsente[] = [];
  const en_double: LecturesEnDouble[] = [];
  for (const item_id of reference) {
    const ids = parItem.get(item_id);
    if (ids === undefined) manquantes.push({ outil_id, item_id });
    else if (ids.length > 1) en_double.push({ outil_id, item_id, lectures: ids });
  }
  return { manquantes, en_double };
}

/**
 * Les lectures du run (contexte déjà filtré), groupées par comparateur inclus, après contrôle
 * qu'elles recouvrent exactement la référence : une lecture par item et par comparateur. Un
 * comparateur sans lecture a un groupe vide, et lève dès que la référence n'est pas vide. Lève
 * `LecturesComparateurIncoherentes` avec tous les fautifs.
 */
export function lecturesParComparateur(
  lectures: readonly LectureComparateur[],
  reference: ReadonlySet<Ulid>,
  comparateurs: readonly IdentifiantCourt[],
): ReadonlyMap<IdentifiantCourt, readonly LectureComparateur[]> {
  const tri = trier(lectures, reference, comparateurs);
  const ordonnee = [...reference].sort();
  const recouvrements = [...tri.groupes].map(([outil_id, groupe]) => recouvrement(outil_id, groupe, ordonnee));
  const constat: ConstatLectures = {
    manquantes: recouvrements.flatMap((r) => r.manquantes),
    en_double: recouvrements.flatMap((r) => r.en_double),
    hors_reference: tri.hors_reference,
    hors_perimetre: tri.hors_perimetre,
  };
  const fautes = constat.manquantes.length + constat.en_double.length;
  if (fautes + constat.hors_reference.length + constat.hors_perimetre.length > 0) {
    throw new LecturesComparateurIncoherentes(constat);
  }
  return tri.groupes;
}
