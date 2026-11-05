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
 * fermé, négatif ou orienté, liste d'attribution non définie — est exclue. Une question dont l'item
 * principal est celui d'un candidat non interrogé au run est exclue aussi (`principal_non_interroge`,
 * D57 (1), protocole 0.22). Deux items retenus d'un même candidat interrogé sur une même mesure,
 * épinglés sur sa version courante (D74 (18)), en vigueur au gel et de positions différentes, excluent toutes leurs questions et la question
 * d'attribution de la mesure (`positions_incompatibles`, protocole 0.27, D67), au lieu d'arrêter le
 * tirage. Chaque exclusion est inscrite dans `tirage.exclusions` avec un seul motif, le premier dans
 * l'ordre : `attribution_contestee`, `mesure_version_depassee`, `positions_incompatibles`,
 * `hors_validite` ou `reponse_attendue_indecidable`, puis `principal_non_interroge`. Ces règles sont
 * évaluées avant tout usage de la graine : aucune graine ne fait échouer ni réussir le tirage pour ces
 * motifs.
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
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { effetSurAttribution, placeAuGel } from "./place-au-gel.ts";
import {
  ItemHorsValidite,
  ItemIntrouvable,
  positionEnVigueur,
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
  Position,
  Question,
  RunAuGel,
  Theme,
} from "./types.ts";
import { estInterroge, idsInterroges } from "../../analysis/candidats-interroges.ts";

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

/**
 * Les candidats interrogés au run, d'après la seule définition (`analysis/candidats-interroges.ts`),
 * lue aussi par la notation (`notation/preparation.ts:interrogesDuRun`).
 */
export function interrogesDe(run: Pick<GelDuRun, "perimetre">): ReadonlySet<string> {
  return idsInterroges(run.perimetre.candidats);
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

/* ------------------------------------------------- positions incompatibles */

/**
 * §5 (protocole 0.27, D67) : « Deux items d'un même candidat sur la même mesure, tous deux en vigueur
 * au gel, dont les positions diffèrent, sans qu'une source postérieure ait retiré l'une d'elles, ne
 * disent pas laquelle fait foi : les deux items sont exclus du tirage et comptés à part dans le rapport
 * du run, la mesure n'engendre aucune question d'attribution tant qu'ils le sont, et l'auteur les
 * conteste dès le gel. »
 *
 * Un groupe par candidat × mesure : tous les items retenus au gel (`placeAuGel`) qui donnent au
 * candidat une position en vigueur (`positionEnVigueur` : item P, ou état en vigueur d'un item O), dès
 * qu'au moins deux de ces positions diffèrent. Tous les items du groupe y sont, même deux qui
 * s'accordent entre eux : chacun forme avec l'item discordant une paire dont aucune ne fait foi. Un item
 * dont la fin de validité est l'instant de gel n'est plus en vigueur et n'y entre pas (intervalles
 * semi-ouverts, §4) ; une source postérieure qui retire une position la rend obsolète, donc hors de
 * vigueur. Seuls les candidats interrogés au run comptent, comme pour un item contesté : le tirage
 * n'examine que leurs questions, et la liste d'une question d'attribution ne lit qu'eux (protocole
 * 0.32, D74 (14)). Un item vérifié sur une version de sa mesure qui n'est pas la version en vigueur,
 * que le tirage exclut déjà (`mesure_version_depassee`), n'entre pas dans la comparaison et ne fait
 * exclure aucun autre item (protocole 0.32, D74 (18)).
 *
 * Ces items ne comptent pas au seuil de couverture du §4 (`couverture.ts:itemsPAuGel`, D74 (16)) et
 * sont publiés un à un avec le tirage (`tirage.incompatibles_au_gel`, D74 (17)), tous deux lus par
 * `itemsAuxPositionsIncompatibles`, seule définition de la liste par candidat.
 */
export interface PositionsIncompatibles {
  readonly candidat_id: string;
  readonly mesure_id: string;
  /** Les items du groupe et leur position en vigueur au gel, triés par identifiant d'item. */
  readonly items: readonly PositionDItem[];
}

export interface PositionDItem {
  readonly item_id: string;
  readonly position: Position;
}

interface PositionLue {
  readonly item: Item;
  readonly position: Position;
}

/**
 * La position qu'un item apporte à la détection : celle d'un item retenu d'un candidat interrogé,
 * épinglé sur la version courante de sa mesure, en vigueur au gel. La version est lue après la
 * place : une mesure absente du référentiel lève `MesureIntrouvable` pour tout item retenu d'un
 * candidat interrogé, jamais une position supposée.
 */
function positionRetenueAuGel(item: Item, gel: GelDeLaDetection): PositionLue | undefined {
  if (!gel.interroges.has(item.candidat_id) || placeAuGel(item) !== "retenu") return undefined;
  if (!epingleLaVersionCourante(item, gel.mesures)) return undefined;
  const position = positionEnVigueur(item, gel.date_gel);
  return position === undefined ? undefined : { item, position };
}

function enConflit(lues: readonly PositionLue[]): PositionsIncompatibles | undefined {
  const premiere = lues[0];
  if (premiere === undefined || new Set(lues.map((lue) => lue.position)).size < 2) return undefined;
  return {
    candidat_id: premiere.item.candidat_id,
    mesure_id: premiere.item.mesure_id,
    items: lues
      .map((lue) => ({ item_id: lue.item.id, position: lue.position }))
      .sort((a, b) => comparerChaines(a.item_id, b.item_id)),
  };
}

/** Ce que la détection lit du gel : son instant, les candidats interrogés, le référentiel des mesures. */
interface GelDeLaDetection {
  readonly date_gel: string;
  readonly interroges: ReadonlySet<string>;
  readonly mesures: ReadonlyMap<string, Mesure>;
}

/**
 * Les groupes incompatibles au gel, triés par candidat puis par mesure. Évalué sans la graine.
 * `mesures` : le référentiel au gel, par identifiant, dont la version courante de chaque mesure.
 */
export function positionsIncompatiblesAuGel(
  items: readonly Item[],
  date_gel: string,
  interroges: ReadonlySet<string>,
  mesures: ReadonlyMap<string, Mesure>,
): readonly PositionsIncompatibles[] {
  const gel: GelDeLaDetection = { date_gel, interroges, mesures };
  const groupes = new Map<string, PositionLue[]>();
  for (const item of items) {
    const lue = positionRetenueAuGel(item, gel);
    if (lue === undefined) continue;
    const cle = `${item.candidat_id}|${item.mesure_id}`;
    const groupe = groupes.get(cle);
    if (groupe === undefined) groupes.set(cle, [lue]);
    else groupe.push(lue);
  }
  return [...groupes.entries()]
    .sort(([a], [b]) => comparerChaines(a, b))
    .map(([, lues]) => enConflit(lues))
    .filter((conflit): conflit is PositionsIncompatibles => conflit !== undefined);
}

/**
 * Les identifiants, triés, des items de ce candidat que la détection exclut du tirage, tous groupes
 * (mesures) confondus. Vide si le candidat n'en porte aucun. Seule définition de la liste par
 * candidat : le seuil de couverture (D74 (16)) et le tirage publié (D74 (17)) la lisent.
 */
export function itemsAuxPositionsIncompatibles(
  conflits: readonly PositionsIncompatibles[],
  candidat_id: string,
): readonly string[] {
  return conflits
    .filter((conflit) => conflit.candidat_id === candidat_id)
    .flatMap((conflit) => conflit.items.map((lu) => lu.item_id))
    .sort(comparerChaines);
}

/**
 * Les groupes qui touchent la question : ceux dont un item est parmi ses items gardés au gel, et, pour
 * une question d'attribution (sans candidat), ceux de la mesure de ses items.
 */
function conflitsDeLaQuestion(
  question: Pick<Question, "candidat_id">,
  gardes: readonly ItemDeQuestion[],
  contexte: ContexteDuGel,
): readonly PositionsIncompatibles[] {
  const ids = new Set(gardes.map((entree) => entree.reference.item_id));
  const mesures = new Set(
    question.candidat_id === undefined ? [...ids].map((id) => itemDe(id, contexte.index.items).mesure_id) : [],
  );
  return contexte.incompatibles.filter(
    (conflit) => mesures.has(conflit.mesure_id) || conflit.items.some((lu) => ids.has(lu.item_id)),
  );
}

function decrireConflit(conflit: PositionsIncompatibles): string {
  const items = conflit.items.map((lu) => `${lu.item_id} (${lu.position})`).join(", ");
  return `le candidat interrogé ${conflit.candidat_id} porte au gel, sur la mesure ${conflit.mesure_id}, des positions en vigueur différentes : ${items}`;
}

function incompatibilite(
  question: Pick<Question, "candidat_id">,
  gardes: readonly ItemDeQuestion[],
  contexte: ContexteDuGel,
): MotifEtDetail | undefined {
  const conflits = conflitsDeLaQuestion(question, gardes, contexte);
  if (conflits.length === 0) return undefined;
  return {
    motif: "positions_incompatibles",
    detail:
      `${conflits.map(decrireConflit).join(" ; ")}. Aucun de ces items ne dit laquelle fait foi : ils sont exclus ` +
      `du tirage, la mesure n'engendre aucune question d'attribution, et l'auteur les conteste dès le gel (§5).`,
  };
}

/** Ce que le jugement d'une question lit du gel, calculé une fois pour toutes les questions. */
interface ContexteDuGel {
  readonly index: Index;
  readonly run: GelDuRun;
  readonly interroges: ReadonlySet<string>;
  readonly incompatibles: readonly PositionsIncompatibles[];
}

function contexteDuGel(items: readonly Item[], index: Index, run: GelDuRun, interroges: ReadonlySet<string>): ContexteDuGel {
  return { index, run, interroges, incompatibles: positionsIncompatiblesAuGel(items, run.date_gel, interroges, index.mesures) };
}

function lireAuGel(question: Question, contexte: ContexteDuGel): LectureAuGel {
  const { index, interroges } = contexte;
  if (!existeAuGel(question, index.items)) return { sorte: "absente" };
  const gardes = itemsGardesAuGel(question, index.items, interroges);
  // Dans l'ordre des motifs : le premier qui s'applique est le seul inscrit.
  const controles: readonly (() => MotifEtDetail | undefined)[] = [
    () => contestationBloquante(gardes, index.items),
    () => versionDepassee(gardes, index),
    () => incompatibilite(question, gardes, contexte),
  ];
  for (const controle of controles) {
    const exclusion = controle();
    if (exclusion !== undefined) return { sorte: "exclue", exclusion };
  }
  return { sorte: "admise", items: gardes };
}

/**
 * §5 (protocole 0.9) : la réponse attendue est-elle définie au gel ? La règle est celle de
 * `reponseAttendue`, appelée telle quelle sur les items gardés au gel : seuls ses deux refus « non
 * défini au gel » deviennent un motif d'exclusion. Tout autre refus (question mal formée, référence
 * absente) remonte et arrête le tirage. Des positions contradictoires n'arrivent plus jusqu'ici : la
 * question est déjà exclue (`positions_incompatibles`) ; `PositionsContradictoires` ne garde plus
 * qu'un appel direct de `reponseAttendue`.
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

function juger(question: Question, contexte: ContexteDuGel): Verdict {
  const { index, run, interroges } = contexte;
  const lecture = lireAuGel(question, contexte);
  if (lecture.sorte !== "admise") return lecture;
  const exclusion = motifDExclusion({ gabarit: question.gabarit, items: lecture.items }, [...index.items.values()], run);
  if (exclusion !== undefined) return { sorte: "exclue", exclusion };
  const horsRun = principalNonInterroge(question, index.items, interroges);
  return horsRun === undefined ? { sorte: "tirable" } : { sorte: "exclue", exclusion: horsRun };
}

/**
 * §5 (protocole 0.22, D57 (1)) : « Une question dont l'item principal est celui d'un candidat non
 * interrogé au run n'est pas tirée non plus : elle est exclue et comptée à part dans le rapport du
 * run, avec ce motif. » Le juge ne reçoit que les items des candidats interrogés (§7) : sans son item
 * principal, la question n'aurait plus d'objet. La règle vaut pour toute question ; seule une question
 * d'attribution l'atteint en pratique (elle ne nomme personne, `concerneLeRun` l'examine toujours),
 * celle d'une mesure fictive dont l'item F est celui d'un candidat retiré ou non interrogé. Un item non
 * principal d'un non-interrogé reste admis : la notation l'écarte. Évaluée en dernier : une question
 * qui relève aussi d'un autre motif porte celui-là. `interroges` est celui du tirage (`interrogesDe`).
 * Le refus de la notation (`preparation.ts`, `ItemPrincipalNonInterroge`) garde un tirage construit à
 * la main.
 */
function principalNonInterroge(
  question: Pick<Question, "items">,
  items: ReadonlyMap<string, Item>,
  interroges: ReadonlySet<string>,
): MotifEtDetail | undefined {
  const horsRun = question.items
    .filter((entree) => entree.role === "principal")
    .map((entree) => itemDe(entree.reference.item_id, items))
    .find((item) => !interroges.has(item.candidat_id));
  if (horsRun === undefined) return undefined;
  return {
    motif: "principal_non_interroge",
    detail:
      `Item principal ${horsRun.id} du candidat ${horsRun.candidat_id}, non interrogé au run : le juge ne reçoit ` +
      `que les items des candidats interrogés (§7), la question n'est pas tirée (§5).`,
  };
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
  const contexte = contexteDuGel(items, indexer(items, mesures), run, interrogesDe(run));
  return questions.filter((question) => juger(question, contexte).sorte === "tirable");
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

interface Separation {
  readonly tirables: readonly Question[];
  readonly exclusions: readonly ExclusionTirage[];
  /** §5 (0.27, D67) : les items que l'auteur conteste dès le gel (`positionsIncompatiblesAuGel`). */
  readonly incompatibles: readonly PositionsIncompatibles[];
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
  const contexte = contexteDuGel(items, index, run, interroges);
  const tirables: Question[] = [];
  const exclusions: ExclusionTirage[] = [];
  for (const question of questions) {
    if (!concerneLeRun(question, interroges)) continue;
    const verdict = juger(question, contexte);
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
  return {
    tirables,
    exclusions: exclusions.sort((a, b) => comparerChaines(a.question_id, b.question_id)),
    incompatibles: contexte.incompatibles,
  };
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
  return estInterroge(candidat) && !candidat.sous_seuil;
}
