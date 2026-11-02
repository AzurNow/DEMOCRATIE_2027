/**
 * Kappa juge-humain sur le jeu d'or (§7 « Calibration et fiabilité publiée », protocole 0.23, D58).
 *
 * « La référence est la note humaine retenue, comme pour l'échantillon : celle des deux humains quand
 * ils s'accordent, sinon celle d'un troisième humain qui note à l'aveugle ; une réponse dont la note
 * retenue est indéterminée n'entre pas dans le kappa, et leur nombre est publié. Le kappa d'un juge est
 * celui de sa note et de la note humaine retenue, sur la catégorie primaire, non pondéré ; le kappa de
 * la paire est le plus faible des kappas des deux juges. » Les règles vivent dans
 * `kappa-categorie-primaire.ts` ; ce module ne fait que les appliquer au jeu d'or.
 *
 * **Fonction pure, sans format de fichier.** Le dépôt connaît le tirage du jeu d'or
 * (`pipeline/notation/echantillons.ts:tirerJeuOr`) et ses deux notations humaines
 * (`calibration_jeu_or`, `pipeline/notation/file-humaine.ts`), mais aucun motif ni aucune tâche pour
 * le troisième humain du jeu d'or, et aucun fichier qui assemble les réponses du jeu d'or. L'appelant
 * fournit donc, par réponse, les deux notations de calibration, le troisième humain s'il existe, et
 * les notations de juge de la réponse ; aucune commande n'écrit encore `kappa_juge_humain` ni
 * `kappa_paire_juges`.
 *
 * **Juge retiré** (§7 : « Les notations déjà rendues par le juge retiré sont écartées de tout le run,
 * y compris de l'accord juges-humains et du kappa des juges publiés avec lui, qui ne portent plus que
 * sur le juge restant ») : il n'a pas de kappa, ses notations ne sont pas lues, et la paire est le
 * kappa du juge restant — comme `critereKappaJugesHumains` pour l'échantillon.
 *
 * **Refus de l'API et renvois d'attribution** (protocole 0.24, D59 (20)) : « Comme pour l'échantillon,
 * un refus de l'API, noté sans juge, n'entre pas dans l'accord juge-humain du jeu d'or, et une question
 * d'attribution qu'un juge renvoie à un humain, faute que la règle en détermine la note, n'entre pas
 * dans le kappa de ce juge ; leur nombre est publié. Un kappa du jeu d'or qui ne porte sur aucune
 * réponse comparable est publié absent, avec ce motif. » Les règles sont celles de l'échantillon
 * (`pipeline/go-no-go/kappa-echantillon.ts`, D32 et D31 (2)), reprises à l'identique :
 *
 * - un refus (la réponse porte la notation par règle `d12-refus-api`) est écarté du kappa de CHAQUE
 *   juge, avant toute lecture de sa référence humaine, et compté une fois (`refus_api`) ; une notation
 *   ou un renvoi de juge sur un refus, même d'un juge retiré, est incohérent (aucun juge ne voit un
 *   refus, D32) : rien n'est donc compté deux fois ;
 * - une réponse renvoyée par un juge est écartée du kappa de CE juge seulement, et comptée pour lui
 *   (`renvois_ecartes`) ; elle garde sa référence humaine, et une référence indéterminée la compte
 *   parmi les indéterminées, pas parmi les renvois ; les renvois d'un juge retiré ne sont pas lus ;
 * - tout écarté : `aucune_reponse_comparable` (`kappa-categorie-primaire.ts`), jamais 0 ni 1.
 *
 * **Refusé, jamais deviné** (`JeuOrIncoherent`) : un run qui ne déclare pas exactement deux juges ;
 * deux juges retirés ; une réponse sans exactement deux notations `calibration_jeu_or` d'humains
 * distincts ; deux humains qui divergent sans troisième, ou un troisième là où ils s'accordent, ou un
 * troisième qui est l'un des deux ; une note de juge retenu absente sans renvoi, ou double ; un juge
 * qui note et renvoie la même réponse ; une note ou un renvoi d'un juge non déclaré ; un refus qui
 * n'est pas une notation par règle, ou qu'un juge a noté ou renvoyé.
 */

import {
  CATEGORIES_DE_JUGE,
  categorieHumaineRetenue,
  kappaCategoriePrimaire,
  kappaDeLaPaire,
  type CategorieDeJuge,
  type KappaCategorie,
  type KappaDeLaPaire,
} from "./kappa-categorie-primaire.ts";
import type { CategorieRetenue, Notation, Ulid } from "./types.ts";

/** Ce que le kappa lit d'un juge déclaré au run (`run.json#/juges[]`). */
export interface JugeDeclare {
  readonly juge_id: string;
  readonly retire: boolean;
}

export interface ReponseDuJeuOr {
  readonly reponse_id: Ulid;
  /** Les deux notations humaines `calibration_jeu_or`, de deux annotateurs distincts. */
  readonly calibration: readonly Notation[];
  /** Le troisième humain, quand les deux premiers divergent ; `null` sinon. */
  readonly troisieme: Notation | null;
  /**
   * Les notations de juge de la réponse, une par juge déclaré qui ne l'a pas renvoyée (celles d'un
   * juge retiré ne sont pas lues).
   */
  readonly juges: readonly Notation[];
  /** D32 : la notation par règle d'un refus de l'API (`notateur.type: regle`) ; `null` si la réponse n'en est pas un. */
  readonly refus_api: Notation | null;
  /** D30 (2) : les renvois de juge vers un humain sur cette Q-ATT (`schema/renvoi-humain.schema.json`), contexte `run`. */
  readonly renvois: readonly RenvoiDuJeuOr[];
}

/** Ce que le kappa lit d'un renvoi de juge (`pipeline/notation/types.ts:RenvoiHumain` s'y conforme). */
export interface RenvoiDuJeuOr {
  readonly id: Ulid;
  readonly notateur: { readonly type: string; readonly id: string };
}

export interface KappaJugeJeuOr extends KappaCategorie {
  readonly juge_id: string;
  /** D59 (20) : réponses du jeu d'or écartées de ce kappa parce que ce juge les a renvoyées à un humain. */
  readonly renvois_ecartes: number;
}

export interface ResultatJeuOr {
  /** Un kappa par juge retenu, dans l'ordre de `juges`. */
  readonly kappas: readonly KappaJugeJeuOr[];
  /** Le plus faible des kappas des juges retenus ; absent dès que l'un l'est. */
  readonly paire: KappaDeLaPaire;
  /** Réponses du jeu d'or dont la note humaine retenue est indéterminée, écartées de chaque kappa. */
  readonly indeterminees: number;
  /** D59 (20) : réponses du jeu d'or refusées par l'API, notées par règle, écartées de chaque kappa. */
  readonly refus_api: number;
}

export class JeuOrIncoherent extends Error {
  constructor(detail: string) {
    super(`Jeu d'or : ${detail} Le kappa juge-humain n'est pas calculé (§7) ; rien n'est deviné.`);
    this.name = "JeuOrIncoherent";
  }
}

interface Reference {
  readonly reponse: ReponseDuJeuOr;
  readonly categorie: CategorieDeJuge;
}

export function kappasJeuOr(juges: readonly JugeDeclare[], reponses: readonly ReponseDuJeuOr[]): ResultatJeuOr {
  const retenus = jugesRetenus(juges);
  for (const reponse of reponses) exigerJugesDeclares(reponse, juges);
  const refus = reponses.filter(estUnRefus);
  const toutes = reponses.filter((reponse) => !estUnRefus(reponse)).map((reponse) => ({ reponse, categorie: referenceDe(reponse) }));
  const references = toutes.filter((r): r is Reference => r.categorie !== "indeterminee");
  const kappas = retenus.map((juge) => kappaDuJuge(juge.juge_id, references));
  return { kappas, paire: kappaDeLaPaire(kappas), indeterminees: toutes.length - references.length, refus_api: refus.length };
}

/** D32 : un refus porte la notation par règle et rien d'un juge, ni notation ni renvoi, même d'un juge retiré. */
function estUnRefus(reponse: ReponseDuJeuOr): boolean {
  const regle = reponse.refus_api;
  if (regle === null) return false;
  if (regle.notateur.type !== "regle") throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : la notation ${regle.id} donnée pour refus de l'API n'est pas une notation par règle (D32).`);
  const deJuges = reponse.juges.length + reponse.renvois.length;
  if (deJuges > 0) throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : refus de l'API noté par règle (D32), elle porte aussi ${deJuges} notation(s) ou renvoi(s) de juge.`);
  return true;
}

/** §7 (D58) : exactement deux juges déclarés ; au moins un retenu, sinon le run est invalide. */
function jugesRetenus(juges: readonly JugeDeclare[]): readonly JugeDeclare[] {
  if (juges.length !== 2) throw new JeuOrIncoherent(`${juges.length} juge(s) déclaré(s) au lieu de deux (§7 : « exactement deux juges »).`);
  const retenus = juges.filter((juge) => !juge.retire);
  if (retenus.length === 0) throw new JeuOrIncoherent("les deux juges sont retirés : le run est invalide, il n'a pas de kappa de paire.");
  return retenus;
}

function exigerJugesDeclares(reponse: ReponseDuJeuOr, juges: readonly JugeDeclare[]): void {
  const declares = new Set(juges.map((juge) => juge.juge_id));
  const etrangere = [...reponse.juges, ...reponse.renvois].find((n) => n.notateur.type !== "juge" || !declares.has(n.notateur.id));
  if (etrangere !== undefined) throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : notation ou renvoi ${etrangere.id} de ${etrangere.notateur.id}, qui n'est pas un juge déclaré au run.`);
}

/** La note humaine retenue de la réponse, après contrôle des deux calibrations et du troisième. */
function referenceDe(reponse: ReponseDuJeuOr): CategorieRetenue {
  const [premiere, seconde] = deuxCalibrations(reponse);
  const concordent = categorieHumaineRetenue(premiere, seconde, null) !== null;
  if (concordent && reponse.troisieme !== null) {
    throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : troisième humain alors que les deux premiers s'accordent.`);
  }
  exigerTroisiemeDistinct(reponse, premiere, seconde);
  const categorie = categorieHumaineRetenue(premiere, seconde, reponse.troisieme);
  if (categorie === null) throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : les deux humains divergent et aucun troisième humain n'a noté.`);
  return categorie;
}

function deuxCalibrations(reponse: ReponseDuJeuOr): readonly [Notation, Notation] {
  const { calibration, reponse_id } = reponse;
  const [premiere, seconde] = calibration;
  if (premiere === undefined || seconde === undefined || calibration.length !== 2) {
    throw new JeuOrIncoherent(`réponse ${reponse_id} : ${calibration.length} notation(s) de calibration au lieu de deux.`);
  }
  const fautive = calibration.find((n) => n.notateur.type !== "humain" || n.motif_notation !== "calibration_jeu_or");
  if (fautive !== undefined) throw new JeuOrIncoherent(`réponse ${reponse_id} : la notation ${fautive.id} n'est pas une calibration humaine (calibration_jeu_or).`);
  if (premiere.notateur.id === seconde.notateur.id) throw new JeuOrIncoherent(`réponse ${reponse_id} : deux calibrations du même annotateur ${premiere.notateur.id}.`);
  return [premiere, seconde];
}

function exigerTroisiemeDistinct(reponse: ReponseDuJeuOr, premiere: Notation, seconde: Notation): void {
  const troisieme = reponse.troisieme;
  if (troisieme === null) return;
  if (troisieme.notateur.type !== "humain" || [premiere, seconde].some((n) => n.notateur.id === troisieme.notateur.id)) {
    throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : le troisième (${troisieme.notateur.id}) n'est pas un troisième humain.`);
  }
}

/** D59 (20), comme D31 (2) : les réponses renvoyées par ce juge sortent de son kappa, et sont comptées. */
function kappaDuJuge(juge_id: string, references: readonly Reference[]): KappaJugeJeuOr {
  const renvoyee = (r: Reference): boolean => r.reponse.renvois.some((renvoi) => renvoi.notateur.id === juge_id);
  const gardees = references.filter((r) => !renvoyee(r));
  for (const r of references.filter(renvoyee)) exigerSansNotation(juge_id, r.reponse);
  const paires = gardees.map((r) => ({ a: categorieDuJuge(juge_id, r.reponse), b: r.categorie }));
  return { juge_id, ...kappaCategoriePrimaire(paires, CATEGORIES_DE_JUGE), renvois_ecartes: references.length - gardees.length };
}

/** Un juge qui porte à la fois un renvoi et une notation sur la réponse : deux issues, aucune n'est choisie. */
function exigerSansNotation(juge_id: string, reponse: ReponseDuJeuOr): void {
  const siennes = reponse.juges.filter((n) => n.notateur.id === juge_id).length;
  if (siennes > 0) throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : le juge ${juge_id} l'a renvoyée à un humain et l'a aussi notée (${siennes} notation(s)).`);
}

/** La note du juge retenu sur la réponse : exactement une, jamais « indeterminee » (§7). */
function categorieDuJuge(juge_id: string, reponse: ReponseDuJeuOr): CategorieDeJuge {
  const siennes = reponse.juges.filter((n) => n.notateur.id === juge_id);
  const [notation] = siennes;
  if (notation === undefined || siennes.length !== 1) {
    throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : ${siennes.length} notation(s) du juge retenu ${juge_id} au lieu d'une.`);
  }
  if (notation.categorie === "indeterminee") throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : le juge ${juge_id} a rendu « indeterminee », réservée aux humains (§7).`);
  return notation.categorie;
}
