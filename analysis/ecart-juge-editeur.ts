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
 *   une donnée, jamais un `if` sur un outil. Ni `run.json` ni la notation ne la portent aujourd'hui ;
 *   son origine reste à décider (rapport du lot D59 (14)).
 * - La population des réponses (`unites`) : celles que l'appelant passe, des unités d'analyse du run.
 * - La clé de la graine : `options.cle`, suivie de l'identifiant du juge. Le §8 n'écrit pas la clé de
 *   cet intervalle.
 *
 * **Lectures, toutes visibles dans la sortie.**
 * - L'exactitude d'un juge sur un outil est `metriques.ts:exactitude` appliquée à ses notations des
 *   réponses de cet outil ; l'écart signé est la sienne moins celle de l'autre juge. Les deux juges
 *   sont lus sur les mêmes réponses : celles que tous deux ont notées.
 * - Une réponse qu'aucun juge n'a notée (refus de l'API, noté par règle, §7) est nommée dans
 *   `reponses_sans_note_de_juge` et sort du calcul ; une réponse notée par un seul des deux juges, ou
 *   deux fois par le même, lève (`NotationDeJugeIncoherente`) : §7 fait noter chaque réponse par les
 *   deux juges, une fois.
 * - Un autre outil dont l'écart n'est pas défini au calcul principal (un juge n'y classe aucune
 *   réponse) sort de la moyenne et est nommé dans `autres_outils_sans_ecart`. Les outils de la
 *   moyenne sont fixés au calcul principal : un rééchantillon où l'un d'eux, ou l'outil de l'éditeur,
 *   n'a plus d'écart défini ne définit pas la différence (écarté et compté, comme l'écart maximal du
 *   test d'asymétrie, §8).
 * - « Exclut 0 » est `bootstrap.ts:qualifier` : borne basse strictement positive ou borne haute
 *   strictement négative ; un intervalle d'une seule grappe ne se qualifie pas (§8) et `signale`
 *   vaut alors `null`.
 * - Un éditeur qui édite plusieurs outils du run : le §7 compare « l'écart sur l'outil de son propre
 *   éditeur », au singulier ; la différence est publiée absente avec le motif
 *   `plusieurs_outils_de_son_editeur`, jamais une règle de choix inventée.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import { intervalleNomme, qualifier, type IntervalleNomme, type OptionsBootstrap } from "./bootstrap.ts";
import { filtrerContexteRun, type UniteAnalyse } from "./filtre.ts";
import { exactitude } from "./metriques.ts";
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
  /** Vrai quand l'intervalle exclut 0 ; `null` sans intervalle ou sur une seule grappe. */
  readonly signale: boolean | null;
  /** `null` quand la différence existe. */
  readonly motif_absence: MotifSansEcartEditeur | null;
}

export interface EcartsJugesEditeurs {
  /** Un résultat par juge dont l'éditeur édite au moins un outil du run, dans l'ordre déclaré. */
  readonly par_juge: readonly EcartJugeEditeur[];
  readonly juges_sans_outil_de_leur_editeur: readonly IdentifiantCourt[];
  /** Réponses du run qu'aucun juge n'a notées : hors calcul, nommées. */
  readonly reponses_sans_note_de_juge: readonly Ulid[];
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

/** §7 : vrai quand l'intervalle exclut 0 ; `null` quand il n'y a rien à qualifier. */
export function signaler(intervalle: Intervalle95 | null): boolean | null {
  const qualificatif = qualifier(intervalle);
  return qualificatif === null ? null : qualificatif === "etablie";
}

/** Les deux notes d'une réponse, par juge. */
type NotesDesJuges = ReadonlyMap<IdentifiantCourt, CategorieRetenue>;

export function ecartsJugesEditeurs(
  unites: readonly UniteAnalyse[],
  notations: readonly Notation[],
  juges: readonly JugeEtSonEditeur[],
  options: OptionsBootstrap,
): EcartsJugesEditeurs {
  const [premier, second] = exigerDeuxJuges(juges);
  const notes = notesParReponse(notations, new Set([premier.juge_id, second.juge_id]));
  const { notees, sans_note } = apparier(unites, notes);
  const concernes = [
    { juge: premier, autre: second },
    { juge: second, autre: premier },
  ].filter(({ juge }) => juge.outils_de_son_editeur.length > 0);
  return {
    par_juge: concernes.map(({ juge, autre }) => ecartDuJuge(juge, autre.juge_id, notees, notes, options)),
    juges_sans_outil_de_leur_editeur: juges.filter((j) => j.outils_de_son_editeur.length === 0).map((j) => j.juge_id),
    reponses_sans_note_de_juge: sans_note,
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

function apparier(
  unites: readonly UniteAnalyse[],
  notes: ReadonlyMap<Ulid, NotesDesJuges>,
): { notees: UniteAnalyse[]; sans_note: Ulid[] } {
  const notees: UniteAnalyse[] = [];
  const sans_note: Ulid[] = [];
  for (const unite of unites) {
    const recues = notes.get(unite.reponse_id);
    if (recues === undefined) sans_note.push(unite.reponse_id);
    else if (recues.size === 2) notees.push(unite);
    else throw new NotationDeJugeIncoherente(unite.reponse_id, `notée par le seul juge ${[...recues.keys()].join(", ")}.`);
  }
  return { notees, sans_note };
}

/** Ce qui fixe la statistique d'un juge : qui il est, à qui il se compare, et sur quels outils. */
interface Comparaison {
  readonly juge_id: IdentifiantCourt;
  readonly autre_juge_id: IdentifiantCourt;
  readonly notes: ReadonlyMap<Ulid, NotesDesJuges>;
}

function ecartDuJuge(
  juge: JugeEtSonEditeur,
  autre_juge_id: IdentifiantCourt,
  notees: readonly UniteAnalyse[],
  notes: ReadonlyMap<Ulid, NotesDesJuges>,
  options: OptionsBootstrap,
): EcartJugeEditeur {
  const comparaison: Comparaison = { juge_id: juge.juge_id, autre_juge_id, notes };
  const ecarts = ecartsParOutil(notees, comparaison);
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
  const intervalle = intervalleNomme(retenues, statistique, { ...options, cle: [...options.cle, juge.juge_id] });
  return {
    ...base,
    autres_outils_sans_ecart: sansEcart,
    moyenne_autres_outils: moyenneDesEcarts(autres),
    difference: statistique(retenues),
    intervalle,
    signale: signaler(intervalle.intervalle),
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
    motif_absence: motif,
  };
}

/** Moyenne des écarts définis ; `null` s'il n'y en a aucun. */
function moyenneDesEcarts(ecarts: readonly EcartSurOutil[]): number | null {
  const definis = ecarts.flatMap((e) => (e.ecart === null ? [] : [e.ecart]));
  if (definis.length === 0) return null;
  return definis.reduce((somme, e) => somme + e, 0) / definis.length;
}

function ecartsParOutil(unites: readonly UniteAnalyse[], comparaison: Comparaison): EcartSurOutil[] {
  const outils = [...new Set(unites.map((u) => u.outil_id))].sort(comparerChaines);
  return outils.map((outil_id) => ecartSurOutil(outil_id, unites.filter((u) => u.outil_id === outil_id), comparaison));
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
