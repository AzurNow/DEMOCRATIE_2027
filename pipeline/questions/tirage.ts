/**
 * Tirage des questions d'un run.
 *
 * §5 : « les questions sont tirées de façon aléatoire stratifiée (candidat × thème × gabarit)
 * avec une graine publiée, ce qui rend le tirage reproductible. 80 % des questions sont reprises
 * du run précédent, 20 % sont neuves. »
 *
 * Ce que le module fixe, tout visible dans le tirage publié :
 *
 * - **La graine.** Le générateur est celui du dépôt (`validation/domaine/alea.ts`, SplitMix64
 *   amorcé par sha256 d'une chaîne). La chaîne d'amorce est construite à partir des seuls champs
 *   publiés de `graine_tirage` et du `run_id` : un tiers qui a le fichier de tirage a tout ce
 *   qu'il faut pour rejouer, ce qu'exige le §9. Une graine qui déclare un autre générateur
 *   (`GENERATEUR_DU_TIRAGE`) est refusée avant tout tirage (constat n° 24).
 * - **Ce qui entre au tirage** (§5, protocole 0.9 ; décisions de l'auteur du 2026-09-29). Une
 *   question n'est lue qu'avec les items que la vérité de référence contient au gel
 *   (`place-au-gel.ts`) : elle n'existe au gel que si l'engendrement l'y aurait produite — item
 *   principal (et tout item hors liste) retenu, ou, pour une Q-ATT sans principal, au moins un item
 *   retenu qui admet le gabarit. Sinon elle est absente, comme elle le serait engendrée au gel. Dans
 *   la liste d'une Q-ATT, un item écarté (en attente, retiré, non évaluable…) est ignoré ; un item
 *   vérifié contesté d'un candidat interrogé exclut la question (`attribution_contestee`). Un item
 *   définissant qui épingle une version dépassée de sa mesure l'exclut aussi
 *   (`mesure_version_depassee`). Une question dont la réponse attendue n'est pas définie au gel —
 *   item hors de sa fenêtre de validité, position « sans objet » sur un gabarit fermé, négatif ou
 *   orienté, liste d'attribution non définie — est exclue. Chaque exclusion est inscrite dans
 *   `tirage.exclusions` avec son motif. Ces règles sont évaluées avant tout usage de la graine :
 *   aucune graine ne fait échouer ni réussir le tirage pour ces motifs. Les items P vérifiés
 *   qu'une contestation pendante tient hors du tirage sont publiés, par candidat interrogé, dans
 *   `tirage.contestes_au_gel` (décision de l'auteur du 2026-09-29, n° 8 ; règle de `couverture.ts`).
 * - **La reprise** (§5, protocole 0.9). Une question est reprise si elle a le même identifiant et
 *   les mêmes empreintes de texte qu'au run précédent (`signature.ts`, seule définition, partagée
 *   avec la tendance du §8). Par candidat, et pour les questions d'attribution sur l'ensemble des
 *   thèmes, le budget est `⌊0,8 × questions tirées⌋`, compensations comprises. Il se consomme
 *   strate par strate, dans l'ordre mélangé par la graine ; une strate sans assez de questions
 *   neuves est complétée par des reprises hors budget, et le dépassement est inscrit dans
 *   `tirage.bilan_reprise`.
 * - **La compensation** (§5, protocole 0.9). Pour chaque strate thème × gabarit, la cible d'un
 *   candidat comparé (interrogé, au-dessus du seuil) est `min(quota, max des questions disponibles
 *   parmi les candidats comparés)`. Son déficit est comblé par des questions du MÊME gabarit prises
 *   dans ses autres thèmes, parmi celles que les strates n'ont pas tirées, choisies par la graine
 *   (voir `compenser`). Si le déficit ne peut pas être comblé, rien n'est forcé : le total du
 *   candidat diffère, et `symetrie.ts:nombreQuestionsParCandidat` refuse le run. Chaque
 *   compensation est inscrite dans `tirage.compensations`. Un candidat sous le seuil ou non
 *   interrogé n'est ni cible ni source de cette égalisation.
 *
 * Les deux quotas (par strate candidat × thème × gabarit, et d'attribution par thème) n'ont aucune
 * valeur dans le protocole : ce sont des paramètres obligatoires de l'appel, sans valeur par
 * défaut. Ils sont recopiés dans `tirage.parametres` (conformité n° 59) : avec la graine, le fichier
 * de tirage porte tout ce que le tirage lit en dehors des questions, des items, des mesures et du run.
 *
 * Une formulation dont la relecture conclut à un sens changé (`relecture.sens_preserve: false`)
 * n'est jamais interrogée (§5, conformité n° 58) : si sa question est tirable, `tirer` lève
 * `FormulationAuSensChange` avant tout usage de la graine.
 */

import type { GenerateurAleatoire } from "../../validation/domaine/alea.ts";
import { ALGORITHME_ALEA, generateur, graineDepuisTexte, melanger } from "../../validation/domaine/alea.ts";
import { epingleLaVersionCourante, gabaritsPourItem, mesureDe, themeDe } from "./engendrement.ts";
import { decisionPanelAuGel } from "./contestation.ts";
import { effetSurAttribution, placeAuGel } from "./place-au-gel.ts";
import {
  ItemHorsValidite,
  ItemIntrouvable,
  premisseFausseAuGel,
  reponseAttendue,
  ReponseNonDefinieAuGel,
} from "./reponse-attendue.ts";
import type { CandidatDuPerimetre } from "./reponse-attendue.ts";
import { itemsPContestesAuGel } from "./couverture.ts";
import { signatureQuestion } from "./signature.ts";
import { estCompare } from "./symetrie.ts";
import type {
  BilanReprise,
  CandidatAuGel,
  CodeGabarit,
  CompensationTirage,
  ContestesAuGel,
  EntreeTirage,
  ExclusionTirage,
  GraineTirage,
  Item,
  ItemAuGel,
  ItemDeQuestion,
  Mesure,
  MotifExclusion,
  ParametresTirage,
  Question,
  RunAuGel,
  Theme,
  Tirage,
} from "./types.ts";
import { estStatutValidation } from "./types.ts";

/** §5 : 80 % des questions sont reprises du run précédent, 20 % sont neuves. */
export const PART_REPRISE = 0.8;

export type { ParametresTirage } from "./types.ts";

/** Ce que le run précédent dit d'une question : sa signature (§5, 0.9) et son empreinte neutre. */
export interface QuestionPrecedente {
  readonly signature: string;
  /** Recopiée dans `empreinte_texte_precedente` d'une entrée reprise. */
  readonly empreinte_neutre: string;
}

/**
 * Ce qu'il faut savoir du run précédent pour décider d'une reprise : son identifiant, et chaque
 * question tirée alors, telle qu'elle était (signature des trois textes). Une question dont un
 * texte a changé depuis n'est pas reprise.
 */
export interface TiragePrecedent {
  readonly run_id: string;
  readonly questions: ReadonlyMap<string, QuestionPrecedente>;
}

export interface StrateVide {
  /** `null` pour les questions d'attribution, qui ne sont attribuables à aucun candidat. */
  readonly candidat_id: string | null;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

export interface RapportTirage {
  readonly strates_vides: readonly StrateVide[];
  /** §4 : candidats sous 10 items P vérifiés, tirés mais hors des comparaisons inter-candidats. */
  readonly candidats_a_part: readonly string[];
  /** §3 : candidat retiré, conservé dans le jeu de données mais plus interrogé. */
  readonly candidats_non_interroges: readonly string[];
}

export interface ResultatTirage {
  readonly tirage: Tirage;
  readonly rapport: RapportTirage;
}

export interface DemandeTirage {
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly run: RunAuGel;
  readonly graine: GraineTirage;
  readonly parametres: ParametresTirage;
  readonly tirage_precedent?: TiragePrecedent;
}

export {
  ArbitrageSansDecision,
  contestationPermetLeTirage,
  DecisionPanelPosterieureAuGel,
  DecisionsPanelSimultanees,
} from "./contestation.ts";

/**
 * Ce que la tirabilité et la résolution lisent du run : l'instant du gel et le périmètre (qui est
 * interrogé). Les deux viennent du même objet, jamais de deux sources séparées.
 */
export type GelDuRun = Pick<RunAuGel, "date_gel"> & {
  readonly perimetre: { readonly candidats: readonly CandidatDuPerimetre[] };
};

/** Identifiant conventionnel du groupe des questions d'attribution, sans candidat. */
const GROUPE_ATTRIBUTION = "";

/**
 * Amorce du flux aléatoire du groupe d'attribution (§5). Exportée pour que `charger-perimetre.ts`
 * refuse un `candidat_id` homonyme (D55 (10), constat 42 de la revue du 2026-10-12) : un tel
 * candidat partagerait sinon son flux aléatoire avec le groupe d'attribution, puisque `amorce` ne
 * voit que cette chaîne, jamais `GROUPE_ATTRIBUTION` qu'aucun `candidat_id` ne peut prendre.
 */
export const AMORCE_GROUPE_ATTRIBUTION = "attribution";

/* ------------------------------------------------------------- indexation */

interface Index {
  readonly items: ReadonlyMap<string, Item>;
  readonly mesures: ReadonlyMap<string, Mesure>;
}

function indexer(items: readonly Item[], mesures: readonly Mesure[]): Index {
  return {
    items: new Map(items.map((item) => [item.id, item])),
    mesures: new Map(mesures.map((mesure) => [mesure.id, mesure])),
  };
}

function itemDe(item_id: string, items: ReadonlyMap<string, Item>): Item {
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
function themeDeQuestion(question: Question, index: Index): Theme {
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

function interrogesDe(run: GelDuRun): ReadonlySet<string> {
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
function itemsGardesAuGel(
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
 * C'est le filtre que `tirer` applique avant tout usage de la graine ; un tirage construit à la main
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

interface Separation {
  readonly tirables: readonly Question[];
  readonly exclusions: readonly ExclusionTirage[];
}

/**
 * Les questions concernées par le run — attribution, ou candidat interrogé — qui existent au gel,
 * séparées en tirables et exclues. Les exclusions sont triées par identifiant : l'ordre des
 * fichiers lus ne change pas le tirage publié.
 */
function separer(demande: DemandeTirage, index: Index, interroges: ReadonlySet<string>): Separation {
  const tirables: Question[] = [];
  const exclusions: ExclusionTirage[] = [];
  for (const question of demande.questions) {
    if (!concerneLeRun(question, interroges)) continue;
    const verdict = juger(question, index, demande.run, interroges);
    if (verdict.sorte === "absente") continue;
    if (verdict.sorte === "exclue") {
      exclusions.push(exclusionDe(question, index, verdict.exclusion));
      continue;
    }
    // §5 (protocole 0.11) : une prémisse indécidable au gel est une question mal formée. Elle arrête
    // le tirage avant tout usage de la graine, qu'elle eût été tirée ou non.
    premisseFausseAuGel(question, demande.items, demande.run.date_gel);
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

/* ------------------------------------------------------- entrées de tirage */

export function empreinteNeutre(question: Question): string {
  const neutre = question.formulations.find((formulation) => formulation.registre === "neutre");
  if (neutre === undefined) {
    throw new Error(`La question ${question.id} ne porte aucune formulation neutre.`);
  }
  return neutre.empreinte_texte;
}

/** La question telle que le run précédent l'a posée, si elle est reprise (§5, protocole 0.9). */
function precedenteSiReprise(question: Question, precedent: TiragePrecedent | undefined): QuestionPrecedente | undefined {
  const avant = precedent?.questions.get(question.id);
  if (avant === undefined || avant.signature !== signatureQuestion(question)) return undefined;
  return avant;
}

/**
 * Frontière de sortie : le statut écrit dans le tirage appartient à l'énumération du schéma. Pour
 * un item arbitré, la dernière décision du panel est figée avec sa date : la symétrie du tirage
 * publié se juge sur elle, et non sur l'état des items au moment où l'on revérifie.
 */
function itemAuGel(entree: Question["items"][number], index: Index, date_gel: string): ItemAuGel {
  const item = itemDe(entree.reference.item_id, index.items);
  if (!estStatutValidation(item.statut_validation)) {
    throw new Error(
      `Statut de validation « ${item.statut_validation} » de l'item ${item.id} hors de ` +
        `l'énumération du schéma.`,
    );
  }
  const socle = {
    reference: entree.reference,
    role: entree.role,
    statut_validation_au_gel: item.statut_validation,
    statut_contestation_au_gel: item.statut_contestation,
  };
  if (item.statut_contestation !== "arbitree") return socle;
  return { ...socle, decision_panel_au_gel: decisionPanelAuGel(item, date_gel) };
}

function entreeDe(
  question: Question,
  index: Index,
  run: GelDuRun,
  precedent: TiragePrecedent | undefined,
): EntreeTirage {
  const items = [...index.items.values()];
  // Les items que le gel garde (`itemsGardesAuGel`) : ceux-là seuls sont figés et définissent la liste.
  const gardes = itemsGardesAuGel(question, index.items, interrogesDe(run));
  const socle = {
    question_id: question.id,
    theme: themeDeQuestion(question, index),
    gabarit: question.gabarit,
    grappe_id: question.grappe_id,
    items_au_gel: gardes.map((entree) => itemAuGel(entree, index, run.date_gel)),
    reponse_attendue: reponseAttendue({ gabarit: question.gabarit, items: gardes }, items, run.date_gel, run.perimetre.candidats),
    premisse_fausse: premisseFausseAuGel(question, items, run.date_gel),
    ...(question.candidat_id === undefined ? {} : { candidat_id: question.candidat_id }),
  };

  const avant = precedenteSiReprise(question, precedent);
  if (precedent === undefined || avant === undefined) return { ...socle, reprise: false };
  return {
    ...socle,
    reprise: true,
    run_origine_id: precedent.run_id,
    empreinte_texte_precedente: avant.empreinte_neutre,
  };
}

/**
 * Utilitaire public : construit les entrées d'un ensemble de questions déjà choisi, au gel du run
 * (sa date et son périmètre : une seule source pour les deux).
 */
export function entreesPour(
  questions: readonly Question[],
  items: readonly Item[],
  mesures: readonly Mesure[],
  run: GelDuRun,
  precedent?: TiragePrecedent,
): readonly EntreeTirage[] {
  const index = indexer(items, mesures);
  return questions.map((question) => entreeDe(question, index, run, precedent));
}

/** Le run précédent, à partir des questions qu'il a tirées, telles qu'elles étaient alors. */
export function tiragePrecedentDe(run_id: string, questions: readonly Question[]): TiragePrecedent {
  return {
    run_id,
    questions: new Map(
      questions.map((question) => [
        question.id,
        { signature: signatureQuestion(question), empreinte_neutre: empreinteNeutre(question) },
      ]),
    ),
  };
}

/** Reconstruit l'entrée du run suivant à partir d'un tirage publié et de ses questions. */
export function tiragePrecedentDepuis(
  tirage: Tirage,
  questions: readonly Question[],
): TiragePrecedent {
  const parId = new Map(questions.map((question) => [question.id, question]));
  const tirees = tirage.entrees.map((entree) => {
    const question = parId.get(entree.question_id);
    if (question === undefined) {
      throw new Error(`Question ${entree.question_id} du tirage ${tirage.run_id} introuvable.`);
    }
    return question;
  });
  return tiragePrecedentDe(tirage.run_id, tirees);
}

/* ------------------------------------------------------------- strates */

interface Couple {
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

interface Strate extends Couple {
  readonly cle: string;
  readonly questions: readonly Question[];
}

function cleStrate(theme: Theme, gabarit: CodeGabarit): string {
  return `${theme}|${gabarit}`;
}

function comparer(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Univers des strates : tous les couples thème × gabarit observés dans le groupe, tous candidats
 * confondus. Une strate absente chez un candidat mais présente chez un autre est donc une strate
 * VIDE rapportée, et non une strate qui n'existe pas.
 */
function universDesStrates(questions: readonly Question[], index: Index): readonly Couple[] {
  const couples = new Map<string, Couple>();
  for (const question of questions) {
    const theme = themeDeQuestion(question, index);
    couples.set(cleStrate(theme, question.gabarit), { theme, gabarit: question.gabarit });
  }
  // Les clés sont triées avant tout tirage : l'ordre d'itération d'une Map suit l'ordre
  // d'insertion, donc l'ordre des fichiers lus, ce qui rendrait le tirage non reproductible.
  return [...couples.entries()].sort(([a], [b]) => comparer(a, b)).map(([, couple]) => couple);
}

function strates(univers: readonly Couple[], questions: readonly Question[], index: Index): readonly Strate[] {
  const parCle = new Map<string, Question[]>();
  for (const question of questions) {
    const cle = cleStrate(themeDeQuestion(question, index), question.gabarit);
    const groupe = parCle.get(cle);
    if (groupe === undefined) parCle.set(cle, [question]);
    else groupe.push(question);
  }
  return univers.map((couple) => {
    const cle = cleStrate(couple.theme, couple.gabarit);
    const trouvees = parCle.get(cle);
    return { cle, ...couple, questions: trouvees === undefined ? [] : [...trouvees].sort(parIdentifiant) };
  });
}

function parIdentifiant(a: Question, b: Question): number {
  return comparer(a.id, b.id);
}

/**
 * §5 (protocole 0.9) : « au regard de ce que les autres candidats comparés y reçoivent ». Par
 * strate, la cible d'un candidat comparé est `min(quota, max des questions disponibles parmi les
 * candidats comparés)`. Seuls les candidats comparés comptent : un candidat sous le seuil ou non
 * interrogé n'élève la cible de personne.
 */
function ciblesDesCompares(
  groupes: ReadonlyMap<string, readonly Question[]>,
  compares: readonly CandidatAuGel[],
  quota: number,
  index: Index,
): ReadonlyMap<string, number> {
  const cibles = new Map<string, number>();
  for (const candidat of compares) {
    for (const [cle, nombre] of disponiblesParStrate(questionsDuGroupe(groupes, candidat.candidat_id), index)) {
      const courante = cibles.get(cle);
      const cible = Math.min(quota, nombre);
      cibles.set(cle, courante === undefined ? cible : Math.max(courante, cible));
    }
  }
  return cibles;
}

function disponiblesParStrate(questions: readonly Question[], index: Index): ReadonlyMap<string, number> {
  const nombres = new Map<string, number>();
  for (const question of questions) {
    const cle = cleStrate(themeDeQuestion(question, index), question.gabarit);
    const courant = nombres.get(cle);
    nombres.set(cle, courant === undefined ? 1 : courant + 1);
  }
  return nombres;
}

/* --------------------------------------------------------- tirage d'un groupe */

interface DemandeGroupe {
  readonly identifiant: string;
  readonly questions: readonly Question[];
  readonly univers: readonly Couple[];
  readonly quota: number;
  /** Cibles par strate d'un candidat comparé ; `undefined` : aucune compensation. */
  readonly cibles: ReadonlyMap<string, number> | undefined;
  readonly eligible_a_la_reprise: boolean;
  readonly index: Index;
  readonly rng: GenerateurAleatoire;
  readonly precedent: TiragePrecedent | undefined;
}

interface ResultatGroupe {
  readonly choisies: readonly Question[];
  readonly strates_vides: readonly StrateVide[];
  readonly compensations: readonly CompensationTirage[];
  readonly cible: number;
  readonly budget_reprise: number;
}

/** Une strate du groupe, ce qu'elle tire d'elle-même et ce qui lui manque pour atteindre sa cible. */
interface Plan {
  readonly strate: Strate;
  readonly propre: number;
  readonly deficit: number;
}

function planifier(strate: Strate, demande: DemandeGroupe): Plan {
  const propre = Math.min(demande.quota, strate.questions.length);
  const cible = demande.cibles?.get(strate.cle);
  const deficit = cible === undefined ? 0 : Math.max(0, cible - propre);
  return { strate, propre, deficit };
}

/**
 * Par gabarit, ce que la compensation peut effectivement apporter : le déficit total du gabarit,
 * borné par les questions de ce gabarit que les strates laissent. Connu avant tout tirage, il fixe
 * la cible du groupe, donc le budget de reprise (§5 : le budget porte sur le total tiré).
 */
function compensable(plans: readonly Plan[]): number {
  const parGabarit = new Map<CodeGabarit, { deficit: number; surplus: number }>();
  for (const plan of plans) {
    const courant = parGabarit.get(plan.strate.gabarit);
    const surplus = plan.strate.questions.length - plan.propre;
    if (courant === undefined) parGabarit.set(plan.strate.gabarit, { deficit: plan.deficit, surplus });
    else parGabarit.set(plan.strate.gabarit, { deficit: courant.deficit + plan.deficit, surplus: courant.surplus + surplus });
  }
  return [...parGabarit.values()].reduce((total, { deficit, surplus }) => total + Math.min(deficit, surplus), 0);
}

function tirerGroupe(demande: DemandeGroupe): ResultatGroupe {
  const plans = strates(demande.univers, demande.questions, demande.index).map((strate) => planifier(strate, demande));
  const cible = plans.reduce((total, plan) => total + plan.propre, 0) + compensable(plans);
  // Arrondi par le bas, par groupe : voir l'en-tête du module.
  const budget = demande.eligible_a_la_reprise ? Math.floor(PART_REPRISE * cible) : 0;

  const vides: StrateVide[] = [];
  const choisies: Question[] = [];
  let restant = budget;
  for (const plan of melanger(plans, demande.rng)) {
    if (plan.strate.questions.length === 0) vides.push(strateVide(plan.strate, demande));
    const tirees = tirerParmi(plan.strate.questions, plan.propre, demande, restant);
    restant -= tirees.reprises_budgetees;
    choisies.push(...tirees.questions);
  }
  const compensation = compenser(plans, new Set(choisies), demande, restant);
  return {
    choisies: [...choisies, ...compensation.questions],
    strates_vides: vides,
    compensations: compensation.inscrites,
    cible,
    budget_reprise: budget,
  };
}

function strateVide(strate: Strate, demande: DemandeGroupe): StrateVide {
  const candidat_id = demande.identifiant === GROUPE_ATTRIBUTION ? null : demande.identifiant;
  return { candidat_id, theme: strate.theme, gabarit: strate.gabarit };
}

interface Compensation {
  readonly questions: readonly Question[];
  readonly inscrites: readonly CompensationTirage[];
}

/**
 * §5 (protocole 0.9) : le déficit d'une strate est comblé par des questions du même gabarit prises
 * dans les autres thèmes du candidat, parmi celles qu'aucune strate n'a tirées. Ordre déterministe,
 * documenté : les strates déficitaires sont servies dans l'ordre de leur clé `thème|gabarit`, après
 * le tirage de toutes les strates ; pour chacune, le réservoir restant de son gabarit (trié par
 * identifiant) est tiré par `tirerParmi`, avec le générateur du groupe et le budget de reprise
 * restant. Quand le réservoir ne suffit pas à tous les déficits d'un gabarit, les premières strates
 * dans cet ordre sont servies d'abord. Une strate déficitaire a déjà tiré toutes ses questions : le
 * réservoir ne contient que d'autres thèmes.
 */
function compenser(
  plans: readonly Plan[],
  dejaTirees: ReadonlySet<Question>,
  demande: DemandeGroupe,
  budget: number,
): Compensation {
  const questions: Question[] = [];
  const inscrites: CompensationTirage[] = [];
  let restant = budget;
  const deficitaires = plans.filter((plan) => plan.deficit > 0);
  const reservoirs = reservoirsParGabarit(plans, dejaTirees);
  for (const plan of deficitaires) {
    const reservoir = reservoirs.get(plan.strate.gabarit);
    if (reservoir === undefined) continue;
    const tirees = tirerParmi(reservoir, Math.min(plan.deficit, reservoir.length), demande, restant);
    restant -= tirees.reprises_budgetees;
    reservoirs.set(plan.strate.gabarit, reservoir.filter((question) => !tirees.questions.includes(question)));
    questions.push(...tirees.questions);
    inscrites.push(...tirees.questions.map((question) => inscrire(question, plan.strate, demande)));
  }
  return { questions, inscrites };
}

/** Par gabarit, les questions que les strates n'ont pas tirées, triées par identifiant. */
function reservoirsParGabarit(
  plans: readonly Plan[],
  dejaTirees: ReadonlySet<Question>,
): Map<CodeGabarit, readonly Question[]> {
  const reservoirs = new Map<CodeGabarit, Question[]>();
  for (const plan of plans) {
    const restantes = plan.strate.questions.filter((question) => !dejaTirees.has(question));
    const courant = reservoirs.get(plan.strate.gabarit);
    if (courant === undefined) reservoirs.set(plan.strate.gabarit, [...restantes]);
    else courant.push(...restantes);
  }
  for (const reservoir of reservoirs.values()) reservoir.sort(parIdentifiant);
  return reservoirs;
}

function inscrire(question: Question, deficitaire: Strate, demande: DemandeGroupe): CompensationTirage {
  return {
    candidat_id: demande.identifiant,
    gabarit: deficitaire.gabarit,
    theme_deficitaire: deficitaire.theme,
    question_id: question.id,
    theme_origine: themeDeQuestion(question, demande.index),
  };
}

interface TirageStrate {
  readonly questions: readonly Question[];
  /** Reprises imputées au budget du groupe. Le complément de secours n'y est pas compté. */
  readonly reprises_budgetees: number;
}

/**
 * Parmi des questions (une strate, ou le réservoir d'une compensation), les reprises passent
 * d'abord, tant que le budget du groupe n'est pas épuisé ; le complément vient des questions
 * neuves. Si les neuves ne suffisent pas, on complète par des reprises plutôt que de rendre la
 * strate incomplète : la symétrie du §5 compte les questions, pas leur fraîcheur. Ce complément est
 * le dépassement que `bilan_reprise` publie.
 */
function tirerParmi(
  questions: readonly Question[],
  aTirer: number,
  demande: DemandeGroupe,
  budget: number,
): TirageStrate {
  const estReprise = (question: Question): boolean => precedenteSiReprise(question, demande.precedent) !== undefined;

  const reprises = melanger(questions.filter(estReprise), demande.rng);
  const neuves = melanger(
    questions.filter((question) => !estReprise(question)),
    demande.rng,
  );

  const nombreReprises = Math.max(0, Math.min(aTirer, budget, reprises.length));
  const choisies = [...reprises.slice(0, nombreReprises)];
  choisies.push(...neuves.slice(0, aTirer - nombreReprises));
  const complement = reprises.slice(nombreReprises, nombreReprises + (aTirer - choisies.length));
  return { questions: [...choisies, ...complement], reprises_budgetees: nombreReprises };
}

/* ------------------------------------------------------------------ tirage */

/**
 * Le générateur que `tirer` emploie réellement, tel qu'une graine publiée doit le déclarer (§5 :
 * « une graine publiée, ce qui rend le tirage reproductible » ; constat n° 24). `algorithme` vient du
 * module lui-même ; `bibliotheque` et `version` désignent ce module du dépôt. Une graine qui en
 * nomme un autre (PCG64, numpy…) promettrait un tirage qu'un tiers ne pourrait pas rejouer.
 */
export const GENERATEUR_DU_TIRAGE: Omit<GraineTirage, "valeur"> = {
  algorithme: ALGORITHME_ALEA,
  bibliotheque: "banc-essai-2027/validation/domaine/alea.ts",
  version: "1",
};

/** Une graine dont la déclaration ne désigne pas le générateur employé. */
export class GraineNonConforme extends Error {
  constructor(objet: string, champ: keyof typeof GENERATEUR_DU_TIRAGE, declare: string, attendu: string) {
    super(
      `Graine ${objet} non conforme : ${champ} « ${declare} » déclaré, alors que le tirage emploie ` +
        `${attendu} (${GENERATEUR_DU_TIRAGE.algorithme}, ${GENERATEUR_DU_TIRAGE.bibliotheque}, ` +
        `version ${GENERATEUR_DU_TIRAGE.version}). Un tiers qui rejouerait avec le générateur déclaré ` +
        `obtiendrait un autre tirage (§5, §9).`,
    );
    this.name = "GraineNonConforme";
  }
}

/**
 * Une graine qui déclare un autre générateur que celui du tirage promet un tirage non rejouable
 * (constat 18 de la revue du 2026-10-12 : seule définition, partagée par tous les tirages de
 * notation). `objet` nomme ce que la graine vérifiée désigne dans le message de refus — « du
 * tirage » pour celle de `tirer`, « de l'échantillon », « du dérangement » ou « de la table
 * d'alias » pour celles de `pipeline/notation/` — et est obligatoire : un message qui dirait
 * toujours « du tirage » pour une graine d'échantillon, de dérangement ou d'alias nommerait le
 * mauvais objet vérifié (relecture du 2026-10-21 du constat 18).
 */
export function verifierGraine(graine: GraineTirage, objet: string): void {
  for (const champ of ["algorithme", "bibliotheque", "version"] as const) {
    const attendu = GENERATEUR_DU_TIRAGE[champ];
    if (graine[champ] !== attendu) throw new GraineNonConforme(objet, champ, graine[champ], `« ${attendu} »`);
  }
}

/** Un quota est un entier ≥ 1, fourni par l'appelant : le protocole n'en fixe aucun. */
function verifierQuota(valeur: unknown, nom: keyof ParametresTirage, libelle: string): void {
  if (typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 1) return;
  throw new Error(
    `Quota ${libelle} (${nom}) invalide : ${String(valeur)}. ` +
      `Le protocole n'en fixe aucun ; il est fourni par l'appelant, jamais deviné.`,
  );
}

/** Les deux quotas employés, et eux seuls : ce que `tirage.schema.json` publie (conformité n° 59). */
function quotasPublies(parametres: ParametresTirage): ParametresTirage {
  return {
    questions_par_strate: parametres.questions_par_strate,
    questions_attribution_par_theme: parametres.questions_attribution_par_theme,
  };
}

export function tirer(demande: DemandeTirage): ResultatTirage {
  verifierGraine(demande.graine, "du tirage");
  verifierQuota(demande.parametres.questions_par_strate, "questions_par_strate", "par strate");
  verifierQuota(
    demande.parametres.questions_attribution_par_theme,
    "questions_attribution_par_theme",
    "d'attribution par thème",
  );

  const index = indexer(demande.items, demande.mesures);
  const interroges = demande.run.perimetre.candidats.filter((candidat) => candidat.interroge);
  const separation = separer(demande, index, new Set(interroges.map((candidat) => candidat.candidat_id)));
  const contestes = contestesAuGel(demande, interroges);
  const groupes = grouperParCandidat(separation.tirables, interroges);
  const contexte: ContexteTirage = {
    demande,
    index,
    groupes,
    univers: universDesStrates(questionsNommantUnCandidat(groupes), index),
    cibles: ciblesDesCompares(groupes, interroges.filter(estCompare), demande.parametres.questions_par_strate, index),
  };

  const resultats = [
    ...interroges.map((candidat) => tirerGroupeCandidat(contexte, candidat)),
    tirerGroupeAttribution(contexte),
  ];
  return {
    tirage: {
      run_id: demande.run.id,
      date_gel: demande.run.date_gel,
      graine_tirage: demande.graine,
      parametres: quotasPublies(demande.parametres),
      entrees: resultats.flatMap((resultat) => resultat.entrees),
      exclusions: separation.exclusions,
      contestes_au_gel: contestes,
      bilan_reprise: resultats.map((resultat) => resultat.bilan),
      compensations: resultats.flatMap((resultat) => resultat.compensations),
    },
    rapport: {
      strates_vides: resultats.flatMap((resultat) => resultat.strates_vides),
      candidats_a_part: interroges.filter((c) => c.sous_seuil).map((c) => c.candidat_id),
      candidats_non_interroges: demande.run.perimetre.candidats
        .filter((candidat) => !candidat.interroge)
        .map((candidat) => candidat.candidat_id),
    },
  };
}

/**
 * Décision de l'auteur du 2026-09-29, n° 8 : par candidat interrogé, zéro compris, les items P
 * vérifiés que leur contestation tient hors du tirage au gel. Compte par item, pas par question :
 * une question qu'un item contesté n'a pas engendrée n'est pas inventée pour être comptée. La règle
 * est celle de `couverture.ts`, lue sur les items et le référentiel au gel, sans la graine.
 */
function contestesAuGel(demande: DemandeTirage, interroges: readonly CandidatAuGel[]): readonly ContestesAuGel[] {
  return interroges
    .map((candidat) => candidat.candidat_id)
    .sort(comparer)
    .map((candidat_id) => ({
      candidat_id,
      item_ids: itemsPContestesAuGel(demande.items, candidat_id, demande.run.date_gel, demande.mesures),
    }));
}

interface ContexteTirage {
  readonly demande: DemandeTirage;
  readonly index: Index;
  readonly groupes: ReadonlyMap<string, readonly Question[]>;
  /** Strates thème × gabarit observées chez les candidats interrogés. */
  readonly univers: readonly Couple[];
  /** Cibles des candidats comparés, par strate (`ciblesDesCompares`). */
  readonly cibles: ReadonlyMap<string, number>;
}

function grouperParCandidat(
  questions: readonly Question[],
  interroges: readonly CandidatAuGel[],
): ReadonlyMap<string, readonly Question[]> {
  const groupes = new Map<string, Question[]>();
  groupes.set(GROUPE_ATTRIBUTION, []);
  for (const candidat of interroges) groupes.set(candidat.candidat_id, []);

  for (const question of questions) {
    const cle = question.candidat_id === undefined ? GROUPE_ATTRIBUTION : question.candidat_id;
    const groupe = groupes.get(cle);
    if (groupe !== undefined) groupe.push(question);
  }
  return groupes;
}

function questionsDuGroupe(
  groupes: ReadonlyMap<string, readonly Question[]>,
  identifiant: string,
): readonly Question[] {
  const groupe = groupes.get(identifiant);
  return groupe === undefined ? [] : groupe;
}

function questionsNommantUnCandidat(groupes: ReadonlyMap<string, readonly Question[]>): readonly Question[] {
  return [...groupes.keys()]
    .filter((cle) => cle !== GROUPE_ATTRIBUTION)
    .flatMap((cle) => questionsDuGroupe(groupes, cle));
}

interface ResultatPublie {
  readonly entrees: readonly EntreeTirage[];
  readonly strates_vides: readonly StrateVide[];
  readonly compensations: readonly CompensationTirage[];
  readonly bilan: BilanReprise;
}

function tirerGroupeCandidat(contexte: ContexteTirage, candidat: CandidatAuGel): ResultatPublie {
  const { demande } = contexte;
  const resultat = tirerGroupe({
    identifiant: candidat.candidat_id,
    questions: questionsDuGroupe(contexte.groupes, candidat.candidat_id),
    univers: contexte.univers,
    quota: demande.parametres.questions_par_strate,
    cibles: estCompare(candidat) ? contexte.cibles : undefined,
    // §5 et schema/README.md : un candidat « nouveau » est hors du calcul du ratio 80/20.
    eligible_a_la_reprise: demande.tirage_precedent !== undefined && candidat.statut_au_gel !== "nouveau",
    index: contexte.index,
    rng: generateur(amorceDuGroupe(demande, candidat.candidat_id)),
    precedent: demande.tirage_precedent,
  });
  return publier(contexte, resultat, { candidat_id: candidat.candidat_id });
}

/**
 * Les questions d'attribution forment leur propre groupe : §5 interdit de les attribuer à un
 * candidat, elles ne peuvent donc pas entrer dans une strate candidat × thème × gabarit. Leur
 * strate est le thème seul, leur quota le leur (§5, protocole 0.9), et le budget de reprise porte
 * sur l'ensemble du groupe. Aucune compensation : aucun candidat n'y est comparé.
 */
function tirerGroupeAttribution(contexte: ContexteTirage): ResultatPublie {
  const { demande } = contexte;
  const attributions = questionsDuGroupe(contexte.groupes, GROUPE_ATTRIBUTION);
  const resultat = tirerGroupe({
    identifiant: GROUPE_ATTRIBUTION,
    questions: attributions,
    univers: universDesStrates(attributions, contexte.index),
    quota: demande.parametres.questions_attribution_par_theme,
    cibles: undefined,
    eligible_a_la_reprise: demande.tirage_precedent !== undefined,
    index: contexte.index,
    rng: generateur(amorceDuGroupe(demande, undefined)),
    precedent: demande.tirage_precedent,
  });
  return publier(contexte, resultat, {});
}

function publier(
  contexte: ContexteTirage,
  resultat: ResultatGroupe,
  groupe: { readonly candidat_id?: string },
): ResultatPublie {
  const { demande } = contexte;
  const entrees = resultat.choisies.map((question) =>
    entreeDe(question, contexte.index, demande.run, demande.tirage_precedent),
  );
  const reprises = entrees.filter((entree) => entree.reprise).length;
  return {
    entrees,
    strates_vides: resultat.strates_vides,
    compensations: resultat.compensations,
    bilan: {
      ...groupe,
      cible: resultat.cible,
      budget_reprise: resultat.budget_reprise,
      reprises,
      depassement: Math.max(0, reprises - resultat.budget_reprise),
    },
  };
}

/**
 * Amorce textuelle du générateur, bâtie sur les seuls champs publiés : un tiers qui a le fichier
 * de tirage rejoue le tirage sans rien d'autre.
 */
function amorce(demande: DemandeTirage, groupe: string): bigint {
  return graineDepuisTexte(
    String(demande.graine.valeur),
    demande.graine.algorithme,
    demande.run.id,
    groupe,
  );
}

/**
 * Amorce du groupe candidat ou du groupe d'attribution, selon `candidat_id` : seul point commun
 * aux deux sites de tirage (`tirerGroupeCandidat`, `tirerGroupeAttribution`), exporté pour que le
 * test de collision (D55 (10), constat 42 de la revue du 2026-10-12) passe par le code réellement
 * utilisé au tirage plutôt que par deux appels isolés de `amorce`.
 */
export function amorceDuGroupe(demande: DemandeTirage, candidat_id: string | undefined): bigint {
  return amorce(demande, candidat_id === undefined ? AMORCE_GROUPE_ATTRIBUTION : candidat_id);
}
