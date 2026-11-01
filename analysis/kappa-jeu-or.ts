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
 * **Refusé, jamais deviné** (`JeuOrIncoherent`) : un run qui ne déclare pas exactement deux juges ;
 * deux juges retirés ; une réponse sans exactement deux notations `calibration_jeu_or` d'humains
 * distincts ; deux humains qui divergent sans troisième, ou un troisième là où ils s'accordent, ou un
 * troisième qui est l'un des deux ; une note de juge retenu absente ou double ; une note d'un juge non
 * déclaré. Une note de juge absente couvre le refus de l'API et le renvoi d'attribution, que le §7 ne
 * règle pas pour le jeu d'or (question ouverte, rapport du lot D58).
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
  /** Les notations de juge de la réponse, une par juge déclaré (celles d'un juge retiré ne sont pas lues). */
  readonly juges: readonly Notation[];
}

export interface KappaJugeJeuOr extends KappaCategorie {
  readonly juge_id: string;
}

export interface ResultatJeuOr {
  /** Un kappa par juge retenu, dans l'ordre de `juges`. */
  readonly kappas: readonly KappaJugeJeuOr[];
  /** Le plus faible des kappas des juges retenus ; absent dès que l'un l'est. */
  readonly paire: KappaDeLaPaire;
  /** Réponses du jeu d'or dont la note humaine retenue est indéterminée, écartées de chaque kappa. */
  readonly indeterminees: number;
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
  const toutes = reponses.map((reponse) => ({ reponse, categorie: referenceDe(reponse) }));
  const references = toutes.filter((r): r is Reference => r.categorie !== "indeterminee");
  const kappas = retenus.map((juge) => kappaDuJuge(juge.juge_id, references));
  return { kappas, paire: kappaDeLaPaire(kappas), indeterminees: toutes.length - references.length };
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
  const etrangere = reponse.juges.find((n) => n.notateur.type !== "juge" || !declares.has(n.notateur.id));
  if (etrangere !== undefined) throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : notation ${etrangere.id} de ${etrangere.notateur.id}, qui n'est pas un juge déclaré au run.`);
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

function kappaDuJuge(juge_id: string, references: readonly Reference[]): KappaJugeJeuOr {
  const paires = references.map((r) => ({ a: categorieDuJuge(juge_id, r.reponse), b: r.categorie }));
  return { juge_id, ...kappaCategoriePrimaire(paires, CATEGORIES_DE_JUGE) };
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
