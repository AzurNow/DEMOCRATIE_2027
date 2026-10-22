/**
 * Tirabilité des questions au gel d'un run (§5, protocole 0.9 ; décisions de l'auteur du
 * 2026-09-29).
 *
 * **Ce qui entre au tirage.** Une question n'est lue qu'avec les items que la vérité de référence
 * contient au gel (`place-au-gel.ts`) : elle n'existe au gel que si l'engendrement l'y aurait
 * produite — item principal (et tout item hors liste) retenu, ou, pour une Q-ATT sans principal,
 * au moins un item retenu qui admet le gabarit. Sinon elle est absente, comme elle le serait
 * engendrée au gel. Dans la liste d'une Q-ATT, un item écarté (en attente, retiré, non
 * évaluable…) est ignoré ; un item vérifié contesté d'un candidat interrogé exclut la question
 * (`attribution_contestee`). Un item définissant qui épingle une version dépassée de sa mesure
 * l'exclut aussi (`mesure_version_depassee`). Une question dont la réponse attendue n'est pas
 * définie au gel — item hors de sa fenêtre de validité, position « sans objet » sur un gabarit
 * fermé, négatif ou orienté, liste d'attribution non définie — est exclue. Chaque exclusion est
 * inscrite dans `tirage.exclusions` avec son motif. Ces règles sont évaluées avant tout usage de
 * la graine : aucune graine ne fait échouer ni réussir le tirage pour ces motifs.
 *
 * Une formulation dont la relecture conclut à un sens changé (`relecture.sens_preserve: false`)
 * n'est jamais interrogée (§5, conformité n° 58) : si sa question est tirable, `separer` lève
 * `FormulationAuSensChange` avant tout usage de la graine.
 *
 * `concerneLeRun` est la seule définition des questions que le tirage examine, lue aussi par la
 * complétude du jeu (`completude.ts`). `estCompare` est la seule définition du candidat comparé
 * (§4), lue par le tirage (`tirage.ts`, pour la compensation des strates) et par la symétrie
 * (`symetrie.ts`).
 */

import { epingleLaVersionCourante, gabaritsPourItem, mesureDe, themeDe } from "./engendrement.ts";
import { effetSurAttribution, placeAuGel } from "./place-au-gel.ts";
import {
  ItemHorsValidite,
  ItemIntrouvable,
  premisseFausseAuGel,
  reponseAttendue,
  ReponseNonDefinieAuGel,
} from "./reponse-attendue.ts";
import type { CandidatDuPerimetre } from "./reponse-attendue.ts";
import type {
  CandidatAuGel,
  CodeGabarit,
  ExclusionTirage,
  Item,
  ItemDeQuestion,
  Mesure,
  MotifExclusion,
  Question,
  RunAuGel,
  Theme,
} from "./types.ts";

/**
 * Ce que la tirabilité et la résolution lisent du run : l'instant du gel et le périmètre (qui est
 * interrogé). Les deux viennent du même objet, jamais de deux sources séparées.
 */
export type GelDuRun = Pick<RunAuGel, "date_gel"> & {
  readonly perimetre: { readonly candidats: readonly CandidatDuPerimetre[] };
};

/* ------------------------------------------------------------- indexation */

export interface Index {
  readonly items: ReadonlyMap<string, Item>;
  readonly mesures: ReadonlyMap<string, Mesure>;
}

export function indexer(items: readonly Item[], mesures: readonly Mesure[]): Index {
  return {
    items: new Map(items.map((item) => [item.id, item])),
    mesures: new Map(mesures.map((mesure) => [mesure.id, mesure])),
  };
}

export function itemDe(item_id: string, items: ReadonlyMap<string, Item>): Item {
  const item = items.get(item_id);
  if (item === undefined) throw new ItemIntrouvable(item_id);
  return item;
}

/**
 * Le thème d'une question est celui de la mesure de ses items définissants — le principal, ou les
 * `attendu_dans_liste` d'une question d'attribution sans principal (§5, protocole 0.9). Il est lu
 * sur les items, jamais sur `grappe_id`, dont le sens dépend du gabarit. Des items de mesures
 * différentes sont un refus : la strate serait indécidable.
 */
export function themeDeQuestion(question: Question, index: Index): Theme {
  const definissants = question.items
    .filter((entree) => entree.role === "principal" || entree.role === "attendu_dans_liste")
    .map((entree) => itemDe(entree.reference.item_id, index.items));
  const mesures = [...new Set(definissants.map((item) => item.mesure_id))];
  const premier = definissants[0];
  if (premier === undefined || mesures.length !== 1) {
    throw new Error(
      `Question ${question.id} : ses items définissants portent ${mesures.length} mesures ; son thème est indécidable.`,
    );
  }
  return themeDe(mesureDe(index.mesures, premier));
}

/* ------------------------------------------------------------ tirabilité */

/** Un motif d'exclusion et son détail, tels qu'ils sont inscrits dans `tirage.exclusions`. */
interface MotifEtDetail {
  readonly motif: MotifExclusion;
  readonly detail: string;
}

/** Ce que le gel fait d'une question avant la résolution de sa réponse attendue. */
type LectureAuGel =
  | { readonly sorte: "absente" }
  | { readonly sorte: "exclue"; readonly exclusion: MotifEtDetail }
  | { readonly sorte: "admise"; readonly items: readonly ItemDeQuestion[] };

export function interrogesDe(run: GelDuRun): ReadonlySet<string> {
  return new Set(run.perimetre.candidats.filter((c) => c.interroge).map((c) => c.candidat_id));
}

function estDansLaListe(entree: ItemDeQuestion): boolean {
  return entree.role === "attendu_dans_liste";
}

function porteLeGabarit(item: Item, gabarit: CodeGabarit): boolean {
  return gabaritsPourItem(item).some((candidat) => candidat.code === gabarit);
}

/**
 * La question existe-t-elle au gel, c'est-à-dire l'engendrement l'aurait-il produite sur les items du
 * gel ? §5 : aucun item contesté ou en attente dans le tirage — tout item hors de la liste
 * (principal, distracteur, contexte) doit être retenu ; comportement d'avant ce lot, qui écarte sans
 * la compter une question dont l'item principal est contesté ou en attente. Une Q-ATT sans principal
 * existe si un item retenu de sa liste admet son gabarit (décision de l'auteur du 2026-09-29, n° 3 :
 * le résultat ne dépend plus du moment où la Q-ATT a été engendrée). La place de chaque item est
 * évaluée avant de conclure : une référence absente ou un arbitrage illisible se signale toujours.
 */
function existeAuGel(question: Question, items: ReadonlyMap<string, Item>): boolean {
  const lus = question.items.map((entree) => {
    const item = itemDe(entree.reference.item_id, items);
    return { entree, item, retenu: placeAuGel(item) === "retenu" };
  });
  const horsListe = lus.filter((lu) => !estDansLaListe(lu.entree));
  if (!horsListe.every((lu) => lu.retenu)) return false;
  if (horsListe.some((lu) => lu.entree.role === "principal")) return true;
  return lus.some((lu) => estDansLaListe(lu.entree) && lu.retenu && porteLeGabarit(lu.item, question.gabarit));
}

/**
 * Les items de la question que le gel garde (`EFFET_SUR_ATTRIBUTION`, en données) : hors de la liste,
 * tous ; dans la liste d'une Q-ATT, l'item qui y entre, et l'item contesté d'un candidat interrogé,
 * gardé pour que l'exclusion le nomme (et, dans un tirage construit à la main, pour que la symétrie
 * le voie). Un item écarté, ou contesté d'un candidat non interrogé, n'est ni dans la liste ni figé.
 */
export function itemsGardesAuGel(
  question: Pick<Question, "items">,
  items: ReadonlyMap<string, Item>,
  interroges: ReadonlySet<string>,
): readonly ItemDeQuestion[] {
  return question.items.filter((entree) => {
    if (!estDansLaListe(entree)) return true;
    const item = itemDe(entree.reference.item_id, items);
    const effet = effetSurAttribution(item);
    return effet === "entre" || (effet === "bloque" && interroges.has(item.candidat_id));
  });
}

/** n° 3 : un item gardé de la liste qui bloque est celui d'un candidat interrogé, contesté au gel. */
function contestationBloquante(
  gardes: readonly ItemDeQuestion[],
  items: ReadonlyMap<string, Item>,
): MotifEtDetail | undefined {
  const bloquant = gardes
    .filter(estDansLaListe)
    .map((entree) => itemDe(entree.reference.item_id, items))
    .find((item) => effetSurAttribution(item) === "bloque");
  if (bloquant === undefined) return undefined;
  return {
    motif: "attribution_contestee",
    detail:
      `Item ${bloquant.id} du candidat interrogé ${bloquant.candidat_id} contesté au gel : sa position fait ` +
      `l'objet d'une contestation, la liste attendue de la question d'attribution n'est pas établie.`,
  };
}

/**
 * n° 2 : un item définissant (principal ou attendu dans la liste) qui épingle une version dépassée de
 * sa mesure a été jugé contre une version qui n'existe plus. Tous sont évalués : une mesure absente
 * du référentiel lève `MesureIntrouvable`, jamais une exclusion.
 */
function versionDepassee(gardes: readonly ItemDeQuestion[], index: Index): MotifEtDetail | undefined {
  const perimes = gardes
    .filter((entree) => entree.role === "principal" || estDansLaListe(entree))
    .map((entree) => itemDe(entree.reference.item_id, index.items))
    .filter((item) => !epingleLaVersionCourante(item, index.mesures));
  const perime = perimes[0];
  if (perime === undefined) return undefined;
  return {
    motif: "mesure_version_depassee",
    detail:
      `Item ${perime.id} vérifié sur la version ${perime.mesure_version} de la mesure ${perime.mesure_id}, dont la ` +
      `version courante est ${mesureDe(index.mesures, perime).version} : jugé contre une version qui n'existe plus.`,
  };
}

function lireAuGel(question: Question, index: Index, interroges: ReadonlySet<string>): LectureAuGel {
  if (!existeAuGel(question, index.items)) return { sorte: "absente" };
  const gardes = itemsGardesAuGel(question, index.items, interroges);
  const contestee = contestationBloquante(gardes, index.items);
  if (contestee !== undefined) return { sorte: "exclue", exclusion: contestee };
  const perimee = versionDepassee(gardes, index);
  if (perimee !== undefined) return { sorte: "exclue", exclusion: perimee };
  return { sorte: "admise", items: gardes };
}

/**
 * §5 (protocole 0.9) : la réponse attendue est-elle définie au gel ? La règle est celle de
 * `reponseAttendue`, appelée telle quelle sur les items gardés au gel : seuls ses deux refus « non
 * défini au gel » deviennent un motif d'exclusion. Tout autre refus (question mal formée, positions
 * contradictoires, référence absente) remonte et arrête le tirage.
 */
function motifDExclusion(
  question: Pick<Question, "gabarit" | "items">,
  items: readonly Item[],
  run: GelDuRun,
): MotifEtDetail | undefined {
  try {
    reponseAttendue(question, items, run.date_gel, run.perimetre.candidats);
    return undefined;
  } catch (erreur) {
    if (erreur instanceof ItemHorsValidite) return { motif: "hors_validite", detail: erreur.message };
    if (erreur instanceof ReponseNonDefinieAuGel) {
      return { motif: "reponse_attendue_indecidable", detail: erreur.message };
    }
    throw erreur;
  }
}

/** Le verdict du gel sur une question : absente, exclue avec son motif, ou tirable. */
type Verdict = { readonly sorte: "absente" | "tirable" } | { readonly sorte: "exclue"; readonly exclusion: MotifEtDetail };

function juger(question: Question, index: Index, run: GelDuRun, interroges: ReadonlySet<string>): Verdict {
  const lecture = lireAuGel(question, index, interroges);
  if (lecture.sorte !== "admise") return lecture;
  const exclusion = motifDExclusion({ gabarit: question.gabarit, items: lecture.items }, [...index.items.values()], run);
  return exclusion === undefined ? { sorte: "tirable" } : { sorte: "exclue", exclusion };
}

/**
 * Utilitaire public : les questions que la règle de tirabilité admet au gel du run, dans leur ordre.
 * C'est le filtre que `separer` applique avant tout usage de la graine ; un tirage construit à la main
 * (`entreesPour`) ne contient que des questions qui le passent. `mesures` : le référentiel au gel,
 * dont la version courante de chaque mesure (conformité n° 2).
 */
export function questionsTirables(
  questions: readonly Question[],
  items: readonly Item[],
  mesures: readonly Mesure[],
  run: GelDuRun,
): readonly Question[] {
  const index = indexer(items, mesures);
  const interroges = interrogesDe(run);
  return questions.filter((question) => juger(question, index, run, interroges).sorte === "tirable");
}

/** Clé d'une strate candidat × thème × gabarit, partagée avec la symétrie (`symetrie.ts`). */
export function cleStrateCandidat(candidat_id: string, theme: Theme, gabarit: CodeGabarit): string {
  return `${candidat_id}|${theme}|${gabarit}`;
}

/**
 * §5 (constat n° 23) : par strate candidat × thème × gabarit, le nombre de questions que la règle de
 * tirabilité admet au gel (`questionsTirables`, appliquée telle quelle), le thème étant lu comme au
 * tirage (`themeDeQuestion`). C'est ce que « les items le permettent » veut dire pour la symétrie.
 * Les questions d'attribution, sans candidat, n'y figurent pas.
 */
export function tirablesParStrate(
  questions: readonly Question[],
  items: readonly Item[],
  mesures: readonly Mesure[],
  run: GelDuRun,
): ReadonlyMap<string, number> {
  const index = indexer(items, mesures);
  const comptes = new Map<string, number>();
  for (const question of questionsTirables(questions, items, mesures, run)) {
    if (question.candidat_id === undefined) continue;
    const cle = cleStrateCandidat(question.candidat_id, themeDeQuestion(question, index), question.gabarit);
    const courant = comptes.get(cle);
    comptes.set(cle, courant === undefined ? 1 : courant + 1);
  }
  return comptes;
}

function comparer(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface Separation {
  readonly tirables: readonly Question[];
  readonly exclusions: readonly ExclusionTirage[];
}

/**
 * Les questions concernées par le run — attribution, ou candidat interrogé — qui existent au gel,
 * séparées en tirables et exclues. Les exclusions sont triées par identifiant : l'ordre des
 * fichiers lus ne change pas le tirage publié. `questions`, `items`, `mesures` et `run` sont ceux
 * du run gelé ; seul `tirer` (`tirage.ts`) appelle cette fonction.
 */
export function separer(
  questions: readonly Question[],
  items: readonly Item[],
  index: Index,
  run: GelDuRun,
  interroges: ReadonlySet<string>,
): Separation {
  const tirables: Question[] = [];
  const exclusions: ExclusionTirage[] = [];
  for (const question of questions) {
    if (!concerneLeRun(question, interroges)) continue;
    const verdict = juger(question, index, run, interroges);
    if (verdict.sorte === "absente") continue;
    if (verdict.sorte === "exclue") {
      exclusions.push(exclusionDe(question, index, verdict.exclusion));
      continue;
    }
    // §5 (protocole 0.11) : une prémisse indécidable au gel est une question mal formée. Elle arrête
    // le tirage avant tout usage de la graine, qu'elle eût été tirée ou non.
    premisseFausseAuGel(question, items, run.date_gel);
    verifierRelecture(question);
    tirables.push(question);
  }
  return { tirables, exclusions: exclusions.sort((a, b) => comparer(a.question_id, b.question_id)) };
}

/**
 * §5 : « les formulations sont produites par un modèle puis relues par un annotateur qui vérifie
 * qu'elles ne changent pas le sens » (conformité n° 58). Une formulation relue « sens changé » reste
 * dans le fichier de sa question, trace de la relecture ; elle n'est jamais posée à un outil. Le
 * tirage ne l'écarte pas en silence : il s'arrête en la nommant.
 */
export class FormulationAuSensChange extends Error {
  constructor(question: Question, formulation: Question["formulations"][number]) {
    super(
      `Question ${question.id} : la formulation ${formulation.id} (${formulation.registre}) a été relue ` +
        `par ${formulation.relecture.annotateur_id} le ${formulation.relecture.date} avec ` +
        `sens_preserve: false. Une formulation qui change le sens n'est jamais interrogée (§5) : ` +
        `la reformuler et la faire relire avant le tirage.`,
    );
    this.name = "FormulationAuSensChange";
  }
}

function verifierRelecture(question: Question): void {
  const fautive = question.formulations.find((formulation) => !formulation.relecture.sens_preserve);
  if (fautive !== undefined) throw new FormulationAuSensChange(question, fautive);
}

/**
 * Les questions que le tirage examine : une question d'attribution, ou une question qui nomme un
 * candidat interrogé. Seule définition, lue aussi par la complétude du jeu (`completude.ts`).
 */
export function concerneLeRun(question: Pick<Question, "candidat_id">, interroges: ReadonlySet<string>): boolean {
  return question.candidat_id === undefined || interroges.has(question.candidat_id);
}

function exclusionDe(question: Question, index: Index, exclusion: MotifEtDetail): ExclusionTirage {
  const socle = {
    question_id: question.id,
    theme: themeDeQuestion(question, index),
    gabarit: question.gabarit,
    motif: exclusion.motif,
    detail: exclusion.detail,
  };
  return question.candidat_id === undefined ? socle : { ...socle, candidat_id: question.candidat_id };
}

/**
 * §4 : « les candidats sous le seuil de couverture sont traités à part ». Seule définition du
 * candidat comparé : le tirage la lit pour la compensation des strates (§5, protocole 0.9).
 */
export function estCompare(candidat: Pick<CandidatAuGel, "interroge" | "sous_seuil">): boolean {
  return candidat.interroge && !candidat.sous_seuil;
}
