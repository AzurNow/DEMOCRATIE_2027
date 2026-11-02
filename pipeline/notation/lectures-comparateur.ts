/**
 * La notation des lectures de comparateur (§6, protocole 0.24, D59 (15)) : « L'appariement
 * item-comparateur suit la procédure de notation de la section 7 dans ses seules étapes humaines :
 * en attendant un prompt de juge dédié, aucun juge automatique ne note une lecture de comparateur ;
 * chaque lecture est doublement notée par des humains à l'aveugle puis, quand ils divergent,
 * arbitrée par un troisième humain, comme une réponse de l'échantillon. »
 *
 * **Sélection.** Sont à noter les lectures du run (contexte `run`) qui affichent une position
 * (`affiche`) : la compatibilité est la seconde mesure du §6, et une lecture sans affichage n'a ni
 * extrait ni position à confronter (`lecture-comparateur.schema.json`) ; c'est aussi le seul
 * ensemble dont `analysis/metriques.ts:metriquesComparateur` exige un verdict. Rangées par
 * identifiant (`comparerChaines`). Une lecture d'un autre run, ou en double : refus nommé.
 *
 * **Notations admises.** Celles d'un humain, du run, sur une lecture à noter, sous le motif
 * `double_notation_comparateur` (les deux notations à l'aveugle) ou `arbitrage_comparateur` (le
 * troisième humain), et qui déclarent n'avoir pas vu l'identité de l'outil
 * (`a_vu_identite_outil: false`) : une déclaration absente n'est pas une preuve d'aveuglement. Toute
 * autre notation passée ici est refusée, jamais ignorée ; un juge automatique d'abord
 * (`notateur_non_humain`), que le schéma refuse aussi.
 *
 * **Règle, celle de l'échantillon** (§7 ; `analysis/robustesse.ts`, recalcul (a)) : deux humains
 * distincts qui s'accordent au sens de `analysis/note-lue.ts:notationsConcordent` (catégorie,
 * drapeaux, fraîcheur, sourçage valide ; deux « indéterminée » s'accordent) : leur note est
 * retenue. Qui divergent : la lecture attend l'arbitrage, puis la note du troisième humain est
 * retenue. Jamais de note en repli, jamais d'arbitre parmi les deux premiers, jamais d'arbitrage sans
 * divergence établie.
 *
 * Ce module ne construit pas le verdict (`verdict.schema.json`) : le mode de résolution et le
 * drapeau d'échantillon d'une lecture ne sont pas encore définis (rapport du lot D59).
 */

import { lireNote, notationsConcordent, type NoteLue } from "../../analysis/note-lue.ts";
import type { LectureComparateur, Ulid } from "../../analysis/types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { NotationIndividuelle } from "./types.ts";

export const MOTIF_DOUBLE_NOTATION_COMPARATEUR = "double_notation_comparateur";
export const MOTIF_ARBITRAGE_COMPARATEUR = "arbitrage_comparateur";

export type MotifRefusLecture =
  | "lecture_autre_run"
  | "lecture_en_double"
  | "lecture_hors_selection"
  | "notateur_non_humain"
  | "motif_hors_comparateur"
  | "non_aveugle"
  | "trop_de_notations"
  | "meme_annotateur"
  | "arbitre_non_tiers"
  | "arbitrage_sans_divergence"
  | "arbitrages_multiples";

export class NotationLectureRefusee extends Error {
  readonly motif: MotifRefusLecture;
  readonly lecture_id: Ulid;

  constructor(motif: MotifRefusLecture, lecture_id: Ulid, detail: string) {
    super(`Lecture de comparateur ${lecture_id} (${motif}) : ${detail}`);
    this.name = "NotationLectureRefusee";
    this.motif = motif;
    this.lecture_id = lecture_id;
  }
}

export type EtatLecture =
  | { readonly statut: "a_noter"; readonly lecture_id: Ulid; readonly notations_manquantes: number }
  | { readonly statut: "a_arbitrer"; readonly lecture_id: Ulid; readonly notations: readonly Ulid[] }
  | {
      readonly statut: "retenue";
      readonly lecture_id: Ulid;
      readonly mode: "accord_humains" | "arbitrage";
      readonly note: NoteLue;
      readonly notations_sources: readonly Ulid[];
    };

/** Les lectures affichées du run, triées par identifiant. */
export function lecturesANoter(run_id: Ulid, lectures: readonly LectureComparateur[]): readonly Ulid[] {
  const duRun = lectures.filter((lecture) => lecture.contexte === "run");
  for (const lecture of duRun) {
    if (lecture.run_id !== run_id) throw new NotationLectureRefusee("lecture_autre_run", lecture.id, `lecture du run ${lecture.run_id}, pas du run ${run_id}.`);
  }
  const ids = duRun.filter((lecture) => lecture.affiche).map((lecture) => lecture.id).sort(comparerChaines);
  const double = ids.find((id, rang) => ids[rang - 1] === id);
  if (double !== undefined) throw new NotationLectureRefusee("lecture_en_double", double, "lecture en double dans le run.");
  return ids;
}

/** L'état de chaque lecture à noter, dans l'ordre de `lecturesANoter`. */
export function etatsDesLectures(run_id: Ulid, lectures: readonly LectureComparateur[], notations: readonly NotationIndividuelle[]): readonly EtatLecture[] {
  const ids = lecturesANoter(run_id, lectures);
  const parLecture = new Map<Ulid, NotationIndividuelle[]>(ids.map((id) => [id, []]));
  for (const notation of notations) {
    const groupe = estDuRun(notation, run_id) ? parLecture.get(notation.objet_note.id) : undefined;
    if (groupe === undefined) throw new NotationLectureRefusee("lecture_hors_selection", notation.objet_note.id, `la notation ${notation.id} ne porte pas sur une lecture à noter du run.`);
    verifierNotation(notation);
    groupe.push(notation);
  }
  return ids.map((id) => etatLecture(id, notationsDe(parLecture, id)));
}

function notationsDe(parLecture: ReadonlyMap<Ulid, readonly NotationIndividuelle[]>, id: Ulid): readonly NotationIndividuelle[] {
  const notations = parLecture.get(id);
  if (notations === undefined) throw new Error(`Lecture ${id} absente de l'index de ses notations (incohérence interne).`);
  return notations;
}

function estDuRun(notation: NotationIndividuelle, run_id: Ulid): boolean {
  return notation.run_id === run_id && notation.contexte === "run" && notation.objet_note.type === "lecture_comparateur";
}

function verifierNotation(notation: NotationIndividuelle): void {
  const lecture_id = notation.objet_note.id;
  if (notation.notateur.type !== "humain") {
    throw new NotationLectureRefusee("notateur_non_humain", lecture_id, `la notation ${notation.id} vient d'un ${notation.notateur.type} : aucun juge automatique ne note une lecture (§6).`);
  }
  if (notation.motif_notation !== MOTIF_DOUBLE_NOTATION_COMPARATEUR && notation.motif_notation !== MOTIF_ARBITRAGE_COMPARATEUR) {
    throw new NotationLectureRefusee("motif_hors_comparateur", lecture_id, `la notation ${notation.id} porte le motif ${String(notation.motif_notation)}.`);
  }
  if (notation.notateur.a_vu_identite_outil !== false) {
    throw new NotationLectureRefusee("non_aveugle", lecture_id, `la notation ${notation.id} ne déclare pas avoir été rendue sans voir l'outil (§6 : à l'aveugle).`);
  }
}

/** La règle de l'échantillon, sur les notations d'une lecture, déjà contrôlées une à une. */
function etatLecture(lecture_id: Ulid, notations: readonly NotationIndividuelle[]): EtatLecture {
  const doubles = notations.filter((n) => n.motif_notation === MOTIF_DOUBLE_NOTATION_COMPARATEUR);
  const arbitrages = notations.filter((n) => n.motif_notation === MOTIF_ARBITRAGE_COMPARATEUR);
  exigerDoubleNotation(lecture_id, doubles, arbitrages);
  const [premiere, seconde] = doubles;
  if (premiere === undefined || seconde === undefined) {
    exigerSansArbitrage(lecture_id, arbitrages, "la double notation n'est pas complète");
    return { statut: "a_noter", lecture_id, notations_manquantes: 2 - doubles.length };
  }
  if (notationsConcordent(premiere, seconde)) {
    exigerSansArbitrage(lecture_id, arbitrages, "les deux humains s'accordent");
    return { statut: "retenue", lecture_id, mode: "accord_humains", note: lireNote(premiere), notations_sources: idsDe(doubles) };
  }
  return apresDivergence(lecture_id, doubles, arbitrages);
}

function exigerDoubleNotation(lecture_id: Ulid, doubles: readonly NotationIndividuelle[], arbitrages: readonly NotationIndividuelle[]): void {
  if (doubles.length > 2) throw new NotationLectureRefusee("trop_de_notations", lecture_id, `${doubles.length} notations à l'aveugle au lieu de deux.`);
  const [premiere, seconde] = doubles;
  if (premiere !== undefined && seconde !== undefined && premiere.notateur.id === seconde.notateur.id) {
    throw new NotationLectureRefusee("meme_annotateur", lecture_id, `deux notations du même annotateur ${premiere.notateur.id}.`);
  }
  if (arbitrages.length > 1) throw new NotationLectureRefusee("arbitrages_multiples", lecture_id, `${arbitrages.length} arbitrages au lieu d'un.`);
}

function exigerSansArbitrage(lecture_id: Ulid, arbitrages: readonly NotationIndividuelle[], pourquoi: string): void {
  if (arbitrages.length > 0) throw new NotationLectureRefusee("arbitrage_sans_divergence", lecture_id, `arbitrage d'un troisième humain alors que ${pourquoi}.`);
}

function apresDivergence(lecture_id: Ulid, doubles: readonly NotationIndividuelle[], arbitrages: readonly NotationIndividuelle[]): EtatLecture {
  const [arbitre] = arbitrages;
  if (arbitre === undefined) return { statut: "a_arbitrer", lecture_id, notations: idsDe(doubles) };
  if (doubles.some((n) => n.notateur.id === arbitre.notateur.id)) {
    throw new NotationLectureRefusee("arbitre_non_tiers", lecture_id, `l'arbitre ${arbitre.notateur.id} est l'un des deux annotateurs.`);
  }
  return { statut: "retenue", lecture_id, mode: "arbitrage", note: lireNote(arbitre), notations_sources: idsDe([...doubles, arbitre]) };
}

function idsDe(notations: readonly NotationIndividuelle[]): readonly Ulid[] {
  return notations.map((n) => n.id).sort(comparerChaines);
}
