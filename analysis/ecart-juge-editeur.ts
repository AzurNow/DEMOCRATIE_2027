/**
 * Écart d'un juge sur l'outil de son propre éditeur (§7, « Conflit d'intérêts », protocole 0.24,
 * D59 (14)).
 *
 * « Pour chaque juge dont l'éditeur édite un outil du run, l'écart signé entre son exactitude et celle
 * de l'autre juge est calculé sur les réponses de chaque outil ; l'écart sur l'outil de son propre
 * éditeur est comparé à la moyenne de ses écarts sur les autres outils, et leur différence reçoit un
 * intervalle par bootstrap en grappes (section 8). Elle est signalée dans le rapport quand cet
 * intervalle exclut 0. »
 *
 * **Ce qui est reçu, et non décidé ici.**
 * - Quels outils du run édite l'éditeur de chaque juge (`JugeEtSonEditeur.outils_de_son_editeur`) :
 *   une donnée, jamais un `if` sur un outil. §7 (0.31, D73 (7)) : la liste est déclarée par l'auteur
 *   au gel (`config/gel.json`), vide comprise, et publiée dans `run.json#/juges[]` ;
 *   `analyse-du-run.ts:sectionEcartJugeEditeur` l'y lit et la passe ici.
 * - La population des réponses (`unites`) : celles que l'appelant passe, des unités d'analyse du run.
 *   §7 (0.33, D75 (26)) : « ce sont les réponses obtenues du canal API, les deux modes confondus,
 *   couples marqués « run incomplet » (section 8) compris » ;
 *   `analyse-du-run.ts:sectionEcartJugeEditeur` passe les unités du canal API du contexte, que le
 *   partage des couples ne restreint pas.
 * - La métrique et la strate de la clé de la graine : `options.cle` (`exactitude`, `global`, dans
 *   l'ordre du §8). Ce module y ajoute le composant qui nomme la comparaison, `<juge>:propre-editeur`
 *   (§8, « Graines de l'analyse », protocole 0.25, D60).
 *
 * **Lectures, toutes visibles dans la sortie.**
 * - L'exactitude d'un juge sur un outil est `metriques.ts:exactitude` appliquée à ses notations des
 *   réponses de cet outil ; l'écart signé est la sienne moins celle de l'autre juge. Les deux juges
 *   sont lus sur les mêmes réponses : celles que tous deux ont notées.
 * - Une réponse qu'aucun juge n'a notée ni renvoyée (refus de l'API, noté par règle, §7) est nommée
 *   dans `reponses_sans_note_de_juge` et sort du calcul.
 * - D75 (25) : une réponse qu'un juge au moins a renvoyée à un humain (`volume/renvois/`, contexte
 *   `run`), quel que soit le motif, n'est pas de celles « que tous deux ont notées » (§7) : elle sort
 *   du calcul et est nommée dans `reponses_renvoyees`, avec chaque juge qui l'a renvoyée et son
 *   motif ; jamais une note prise ailleurs à la place de celle qui manque.
 * - Lève (`NotationDeJugeIncoherente`), §7 faisant noter chaque réponse par les deux juges, une
 *   fois : une réponse notée par un seul juge sans renvoi de l'autre, ou renvoyée par un juge sans
 *   notation ni renvoi de l'autre ; deux notations, ou deux renvois, d'un même juge ; un juge qui
 *   note et renvoie la même réponse ; une notation ou un renvoi d'un juge que le run ne déclare pas.
 * - Les outils comparés sont ceux de la population. Un outil dont l'écart n'est pas défini au calcul
 *   principal (un juge n'y classe aucune réponse, toutes renvoyées ou sans note de juge comprises) a
 *   un écart `null`, jamais 0 : sur l'outil de l'éditeur, la différence est absente
 *   (`ecart_indefini_sur_son_outil`) ; un autre outil sort de la moyenne et est nommé dans
 *   `autres_outils_sans_ecart`. Les outils de la
 *   moyenne sont fixés au calcul principal : un rééchantillon où l'un d'eux, ou l'outil de l'éditeur,
 *   n'a plus d'écart défini ne définit pas la différence (écarté et compté, comme l'écart maximal du
 *   test d'asymétrie, §8).
 * - « Exclut 0 » est `bootstrap.ts:qualifier` : borne basse strictement positive ou borne haute
 *   strictement négative ; un intervalle d'une seule grappe ne se qualifie pas (§8) et `signale`
 *   vaut alors `null`.
 * - §7 (protocole 0.29, D71 (2)) : « L'exactitude d'un juge sur un outil égale à 0 ou à 1 suit la
 *   règle des intervalles de largeur nulle (section 8) : la différence qui en dépend n'est
 *   qualifiée ni d'« établie » ni de « non établie », et elle n'est pas signalée. » La différence
 *   dépend des exactitudes des deux juges sur l'outil de l'éditeur et sur chaque outil de la
 *   moyenne ; un outil sorti de la moyenne n'en fait pas partie. La règle est celle des taux
 *   dégénérés de `bootstrap.ts:qualifierSelonTaux`, jamais recopiée : `signale` vaut `null` et
 *   `motif_sans_qualificatif` dit pourquoi.
 * - Un éditeur qui édite plusieurs outils du run : le §7 compare « l'écart sur l'outil de son propre
 *   éditeur », au singulier ; la différence est publiée absente avec le motif
 *   `plusieurs_outils_de_son_editeur`, jamais une règle de choix inventée.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import {
  intervalleNomme,
  qualifierSelonTaux,
  type IntervalleNomme,
  type MotifSansQualificatif,
  type OptionsBootstrap,
} from "./bootstrap.ts";
import { filtrerContexteRun, type UniteAnalyse } from "./filtre.ts";
import { exactitude } from "./metriques.ts";
import type { RenvoiLu } from "./renvois-humains.ts";
import type { CategorieRetenue, IdentifiantCourt, Intervalle95, Notation, Taux, Ulid } from "./types.ts";

/** Un juge déclaré du run et les outils du run qu'édite son éditeur (aucun : liste vide). */
export interface JugeEtSonEditeur {
  readonly juge_id: IdentifiantCourt;
  readonly outils_de_son_editeur: readonly IdentifiantCourt[];
}

export interface EcartSurOutil {
  readonly outil_id: IdentifiantCourt;
  readonly exactitude_juge: Taux;
  readonly exactitude_autre_juge: Taux;
  /** Exactitude du juge moins celle de l'autre ; `null` quand l'une des deux n'existe pas. */
  readonly ecart: number | null;
}

export type MotifSansEcartEditeur =
  | "plusieurs_outils_de_son_editeur"
  | "aucune_reponse_de_son_outil"
  | "ecart_indefini_sur_son_outil"
  | "aucun_autre_outil_avec_ecart";

export interface EcartJugeEditeur {
  readonly juge_id: IdentifiantCourt;
  readonly autre_juge_id: IdentifiantCourt;
  readonly outils_de_son_editeur: readonly IdentifiantCourt[];
  /** L'écart de chaque outil noté par les deux juges, trié par outil. */
  readonly ecarts: readonly EcartSurOutil[];
  readonly autres_outils_sans_ecart: readonly IdentifiantCourt[];
  readonly moyenne_autres_outils: number | null;
  /** Écart sur l'outil de l'éditeur moins la moyenne des écarts sur les autres outils. */
  readonly difference: number | null;
  readonly intervalle: IntervalleNomme | null;
  /**
   * Vrai quand l'intervalle exclut 0 ; `null` sans différence, sans intervalle, sur une seule
   * grappe ou quand une exactitude dont dépend la différence vaut 0 ou 1 (§7, 0.29).
   */
  readonly signale: boolean | null;
  /** `null` exactement quand `signale` ne l'est pas : il dit pourquoi la différence n'est pas qualifiée. */
  readonly motif_sans_qualificatif: MotifSansQualificatif | null;
  /** `null` quand la différence existe. */
  readonly motif_absence: MotifSansEcartEditeur | null;
}

/** Le renvoi d'une réponse à un humain par un juge (D75 (25)) : qui, et pourquoi. */
export interface RenvoiNomme {
  readonly juge_id: IdentifiantCourt;
  readonly motif: string;
}

/** Une réponse de la population qu'un juge au moins a renvoyée à un humain : hors calcul, nommée. */
export interface ReponseRenvoyee {
  readonly reponse_id: Ulid;
  /** Un renvoi par juge qui l'a renvoyée, trié par juge. */
  readonly renvois: readonly RenvoiNomme[];
}

export interface EcartsJugesEditeurs {
  /** Un résultat par juge dont l'éditeur édite au moins un outil du run, dans l'ordre déclaré. */
  readonly par_juge: readonly EcartJugeEditeur[];
  readonly juges_sans_outil_de_leur_editeur: readonly IdentifiantCourt[];
  /** Réponses du run qu'aucun juge n'a notées ni renvoyées : hors calcul, nommées. */
  readonly reponses_sans_note_de_juge: readonly Ulid[];
  /** D75 (25) : réponses du run renvoyées à un humain par un juge au moins, dans l'ordre de la population. */
  readonly reponses_renvoyees: readonly ReponseRenvoyee[];
}

/** Notations de juges du run qui ne forment pas la double notation du §7 sur une réponse. */
export class NotationDeJugeIncoherente extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid, detail: string) {
    super(`Réponse ${reponse_id}, notations des juges (§7) : ${detail}`);
    this.name = "NotationDeJugeIncoherente";
    this.reponse_id = reponse_id;
  }
}

/** §8 (0.25) : le composant de clé de l'écart d'un juge sur l'outil de son propre éditeur. */
function composantPropreEditeur(juge_id: IdentifiantCourt): string {
  return `${juge_id}:propre-editeur`;
}

/**
 * §7 : vrai quand l'intervalle exclut 0 ; `null`, avec son motif, quand il n'y a rien à qualifier,
 * dont le cas d'une exactitude à 0 ou à 1 parmi `exactitudes` (0.29, D71 (2)) : celles des deux
 * juges sur chaque outil dont dépend la différence.
 */
export function signaler(
  exactitudes: readonly Taux[],
  intervalle: Intervalle95 | null,
): Pick<EcartJugeEditeur, "signale" | "motif_sans_qualificatif"> {
  const { qualificatif, motif_sans_qualificatif } = qualifierSelonTaux(exactitudes, intervalle);
  return { signale: qualificatif === null ? null : qualificatif === "etablie", motif_sans_qualificatif };
}

/** Les exactitudes des deux juges sur les outils dont la différence dépend. */
function exactitudesComparees(ecarts: readonly EcartSurOutil[], outils: readonly IdentifiantCourt[]): Taux[] {
  return ecarts.filter((e) => outils.includes(e.outil_id)).flatMap((e) => [e.exactitude_juge, e.exactitude_autre_juge]);
}

/** Les deux notes d'une réponse, par juge. */
type NotesDesJuges = ReadonlyMap<IdentifiantCourt, CategorieRetenue>;

/** Les renvois d'une réponse, par juge : leur motif. */
type RenvoisDesJuges = ReadonlyMap<IdentifiantCourt, string>;

/**
 * `renvois` : les renvois de juge vers un humain du run (`volume/renvois/`) ; seuls ceux du contexte
 * `run` sont lus, comme les notations.
 */
export function ecartsJugesEditeurs(
  unites: readonly UniteAnalyse[],
  notations: readonly Notation[],
  renvois: readonly RenvoiLu[],
  juges: readonly JugeEtSonEditeur[],
  options: OptionsBootstrap,
): EcartsJugesEditeurs {
  const [premier, second] = exigerDeuxJuges(juges);
  const declares = new Set([premier.juge_id, second.juge_id]);
  const notes = notesParReponse(notations, declares);
  const { notees, sans_note, renvoyees } = apparier(unites, notes, renvoisParReponse(renvois, declares, notes));
  const outils = [...new Set(unites.map((u) => u.outil_id))].sort(comparerChaines);
  const concernes = [
    { juge: premier, autre: second },
    { juge: second, autre: premier },
  ].filter(({ juge }) => juge.outils_de_son_editeur.length > 0);
  return {
    par_juge: concernes.map(({ juge, autre }) => ecartDuJuge(juge, { autre_juge_id: autre.juge_id, outils, notees, notes }, options)),
    juges_sans_outil_de_leur_editeur: juges.filter((j) => j.outils_de_son_editeur.length === 0).map((j) => j.juge_id),
    reponses_sans_note_de_juge: sans_note,
    reponses_renvoyees: renvoyees,
  };
}

function exigerDeuxJuges(juges: readonly JugeEtSonEditeur[]): readonly [JugeEtSonEditeur, JugeEtSonEditeur] {
  const [premier, second] = juges;
  if (juges.length !== 2 || premier === undefined || second === undefined || premier.juge_id === second.juge_id) {
    throw new Error(`${juges.length} juge(s) déclaré(s) : un run déclare exactement deux juges distincts (§7, D58).`);
  }
  return [premier, second];
}

/** Les notes de juges du run sur des réponses, par réponse puis par juge. */
function notesParReponse(notations: readonly Notation[], declares: ReadonlySet<IdentifiantCourt>): Map<Ulid, Map<IdentifiantCourt, CategorieRetenue>> {
  const parReponse = new Map<Ulid, Map<IdentifiantCourt, CategorieRetenue>>();
  const deJuges = filtrerContexteRun(notations).filter((n) => n.objet_note.type === "reponse" && n.notateur.type === "juge");
  for (const notation of deJuges) {
    const { id: juge_id } = notation.notateur;
    const reponse_id = notation.objet_note.id;
    if (!declares.has(juge_id)) throw new NotationDeJugeIncoherente(reponse_id, `notation du juge ${juge_id}, que le run ne déclare pas.`);
    const connues = parReponse.get(reponse_id);
    const notes = connues === undefined ? new Map<IdentifiantCourt, CategorieRetenue>() : connues;
    if (notes.has(juge_id)) throw new NotationDeJugeIncoherente(reponse_id, `deux notations du juge ${juge_id}.`);
    notes.set(juge_id, notation.categorie);
    parReponse.set(reponse_id, notes);
  }
  return parReponse;
}

/**
 * D75 (25) : les renvois du run (contexte `run`) de chaque réponse, par juge. Lève sur un renvoi d'un
 * juge non déclaré, sur deux renvois d'un même juge, et sur un juge qui renvoie une réponse qu'il a
 * aussi notée : deux issues, aucune n'est choisie.
 */
function renvoisParReponse(
  renvois: readonly RenvoiLu[],
  declares: ReadonlySet<IdentifiantCourt>,
  notes: ReadonlyMap<Ulid, NotesDesJuges>,
): Map<Ulid, Map<IdentifiantCourt, string>> {
  const parReponse = new Map<Ulid, Map<IdentifiantCourt, string>>();
  for (const renvoi of renvois.filter((r) => r.contexte === "run")) {
    const { id: juge_id } = renvoi.notateur;
    const reponse_id = renvoi.objet_note.id;
    if (!declares.has(juge_id)) throw new NotationDeJugeIncoherente(reponse_id, `renvoi ${renvoi.id} du juge ${juge_id}, que le run ne déclare pas.`);
    if (notes.get(reponse_id)?.has(juge_id) === true) {
      throw new NotationDeJugeIncoherente(reponse_id, `le juge ${juge_id} l'a renvoyée à un humain (renvoi ${renvoi.id}) et l'a aussi notée.`);
    }
    const connus = parReponse.get(reponse_id);
    const motifs = connus === undefined ? new Map<IdentifiantCourt, string>() : connus;
    if (motifs.has(juge_id)) throw new NotationDeJugeIncoherente(reponse_id, `deux renvois du juge ${juge_id}.`);
    motifs.set(juge_id, renvoi.motif);
    parReponse.set(reponse_id, motifs);
  }
  return parReponse;
}

interface Appariement {
  readonly notees: UniteAnalyse[];
  readonly sans_note: Ulid[];
  readonly renvoyees: ReponseRenvoyee[];
}

function apparier(unites: readonly UniteAnalyse[], notes: ReadonlyMap<Ulid, NotesDesJuges>, renvois: ReadonlyMap<Ulid, RenvoisDesJuges>): Appariement {
  const appariement: Appariement = { notees: [], sans_note: [], renvoyees: [] };
  for (const unite of unites) {
    const recues = notes.get(unite.reponse_id);
    const renvoyee = renvois.get(unite.reponse_id);
    if (renvoyee !== undefined) appariement.renvoyees.push(reponseRenvoyee(unite.reponse_id, recues, renvoyee));
    else if (recues === undefined) appariement.sans_note.push(unite.reponse_id);
    else if (recues.size === 2) appariement.notees.push(unite);
    else throw new NotationDeJugeIncoherente(unite.reponse_id, `notée par le seul juge ${[...recues.keys()].join(", ")}, sans renvoi de l'autre.`);
  }
  return appariement;
}

/**
 * Une réponse renvoyée par un juge au moins. Chaque juge l'a notée ou renvoyée (un juge qui fait les
 * deux a déjà levé) ; sinon la double notation du §7 n'est pas faite, et la réponse lève.
 */
function reponseRenvoyee(reponse_id: Ulid, recues: NotesDesJuges | undefined, renvoyee: RenvoisDesJuges): ReponseRenvoyee {
  const notee = recues === undefined ? 0 : recues.size;
  if (notee + renvoyee.size !== 2) {
    throw new NotationDeJugeIncoherente(reponse_id, `renvoyée par le juge ${[...renvoyee.keys()].join(", ")}, que l'autre juge n'a ni notée ni renvoyée.`);
  }
  const renvois = [...renvoyee].map(([juge_id, motif]) => ({ juge_id, motif })).sort((a, b) => comparerChaines(a.juge_id, b.juge_id));
  return { reponse_id, renvois };
}

/** Ce qui fixe la statistique d'un juge : qui il est, à qui il se compare, et sur quels outils. */
interface Comparaison {
  readonly juge_id: IdentifiantCourt;
  readonly autre_juge_id: IdentifiantCourt;
  readonly notes: ReadonlyMap<Ulid, NotesDesJuges>;
}

/** Ce que les deux juges partagent : l'autre juge, les outils de la population, les réponses notées par les deux. */
interface Population {
  readonly autre_juge_id: IdentifiantCourt;
  readonly outils: readonly IdentifiantCourt[];
  readonly notees: readonly UniteAnalyse[];
  readonly notes: ReadonlyMap<Ulid, NotesDesJuges>;
}

function ecartDuJuge(juge: JugeEtSonEditeur, population: Population, options: OptionsBootstrap): EcartJugeEditeur {
  const { autre_juge_id, outils, notees, notes } = population;
  const comparaison: Comparaison = { juge_id: juge.juge_id, autre_juge_id, notes };
  const ecarts = outils.map((outil_id) => ecartSurOutil(outil_id, notees.filter((u) => u.outil_id === outil_id), comparaison));
  const base = { juge_id: juge.juge_id, autre_juge_id, outils_de_son_editeur: juge.outils_de_son_editeur, ecarts };
  const [sonOutil] = juge.outils_de_son_editeur;
  if (juge.outils_de_son_editeur.length > 1 || sonOutil === undefined) return absent(base, [], "plusieurs_outils_de_son_editeur");
  const autres = ecarts.filter((e) => e.outil_id !== sonOutil);
  const sansEcart = autres.filter((e) => e.ecart === null).map((e) => e.outil_id);
  const motif = motifAbsence(ecarts.find((e) => e.outil_id === sonOutil), autres.length - sansEcart.length);
  if (motif !== null) return absent(base, sansEcart, motif);
  const outilsMoyenne = autres.filter((e) => e.ecart !== null).map((e) => e.outil_id);
  const statistique = differenceSur(sonOutil, outilsMoyenne, comparaison);
  const retenues = notees.filter((u) => u.outil_id === sonOutil || outilsMoyenne.includes(u.outil_id));
  const intervalle = intervalleNomme(retenues, statistique, { ...options, cle: [...options.cle, composantPropreEditeur(juge.juge_id)] });
  return {
    ...base,
    autres_outils_sans_ecart: sansEcart,
    moyenne_autres_outils: moyenneDesEcarts(autres),
    difference: statistique(retenues),
    intervalle,
    ...signaler(exactitudesComparees(ecarts, [sonOutil, ...outilsMoyenne]), intervalle.intervalle),
    motif_absence: null,
  };
}

function motifAbsence(sonEcart: EcartSurOutil | undefined, autresAvecEcart: number): MotifSansEcartEditeur | null {
  if (sonEcart === undefined) return "aucune_reponse_de_son_outil";
  if (sonEcart.ecart === null) return "ecart_indefini_sur_son_outil";
  return autresAvecEcart === 0 ? "aucun_autre_outil_avec_ecart" : null;
}

function absent(
  base: Pick<EcartJugeEditeur, "juge_id" | "autre_juge_id" | "outils_de_son_editeur" | "ecarts">,
  autres_outils_sans_ecart: readonly IdentifiantCourt[],
  motif: MotifSansEcartEditeur,
): EcartJugeEditeur {
  const autres = base.ecarts.filter((e) => !base.outils_de_son_editeur.includes(e.outil_id));
  return {
    ...base,
    autres_outils_sans_ecart,
    moyenne_autres_outils: moyenneDesEcarts(autres),
    difference: null,
    intervalle: null,
    signale: null,
    motif_sans_qualificatif: "difference_indefinie",
    motif_absence: motif,
  };
}

/** Moyenne des écarts définis ; `null` s'il n'y en a aucun. */
function moyenneDesEcarts(ecarts: readonly EcartSurOutil[]): number | null {
  const definis = ecarts.flatMap((e) => (e.ecart === null ? [] : [e.ecart]));
  if (definis.length === 0) return null;
  return definis.reduce((somme, e) => somme + e, 0) / definis.length;
}

function ecartSurOutil(outil_id: IdentifiantCourt, unites: readonly UniteAnalyse[], comparaison: Comparaison): EcartSurOutil {
  const exactitude_juge = exactitudeDuJuge(unites, comparaison.juge_id, comparaison.notes);
  const exactitude_autre_juge = exactitudeDuJuge(unites, comparaison.autre_juge_id, comparaison.notes);
  const ecart = exactitude_juge.valeur === undefined || exactitude_autre_juge.valeur === undefined ? null : exactitude_juge.valeur - exactitude_autre_juge.valeur;
  return { outil_id, exactitude_juge, exactitude_autre_juge, ecart };
}

function exactitudeDuJuge(unites: readonly UniteAnalyse[], juge_id: IdentifiantCourt, notes: ReadonlyMap<Ulid, NotesDesJuges>): Taux {
  return exactitude(unites.map((u) => ({ categorie: noteDe(u.reponse_id, juge_id, notes) })));
}

function noteDe(reponse_id: Ulid, juge_id: IdentifiantCourt, notes: ReadonlyMap<Ulid, NotesDesJuges>): CategorieRetenue {
  const categorie = notes.get(reponse_id)?.get(juge_id);
  if (categorie === undefined) throw new NotationDeJugeIncoherente(reponse_id, `aucune notation du juge ${juge_id}.`);
  return categorie;
}

/**
 * La différence sur un jeu d'unités : écart sur l'outil de l'éditeur moins la moyenne des écarts sur
 * `outilsMoyenne`, ou `null` dès que l'un de ces écarts n'est pas défini sur ces unités.
 */
function differenceSur(
  sonOutil: IdentifiantCourt,
  outilsMoyenne: readonly IdentifiantCourt[],
  comparaison: Comparaison,
): (unites: readonly UniteAnalyse[]) => number | null {
  return (unites) => {
    const ecartDe = (outil_id: IdentifiantCourt) => ecartSurOutil(outil_id, unites.filter((u) => u.outil_id === outil_id), comparaison).ecart;
    const sien = ecartDe(sonOutil);
    const autres = outilsMoyenne.map(ecartDe);
    if (sien === null || autres.some((e) => e === null)) return null;
    return sien - (autres as number[]).reduce((somme, e) => somme + e, 0) / autres.length;
  };
}
