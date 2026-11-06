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
 * (`pipeline/notation/echantillons.ts:tirerJeuOr`), ses deux notations humaines (`calibration_jeu_or`)
 * et le troisième humain qui arbitre leur divergence (`arbitrage_jeu_or`, D93), dont
 * `pipeline/notation/file-humaine.ts` ouvre les tâches. L'appelant fournit, par réponse, les deux
 * notations de calibration, le troisième humain s'il a noté, et les notations de juge de la réponse :
 * c'est `pipeline/notation/inscription-jeu-or.ts` (`pnpm kappa:jeu-or`, D89, D93). `inscriptionsJeuOr`
 * rend, d'un seul calcul, ce que `run.json#/juges[]` recevra (le kappa ou son motif, et les comptes du
 * jeu d'or qui le fondent, D73 (8)) et ce que la racine de `run.json` recevra (`kappa_paire_juges` ou
 * son motif, D93).
 *
 * **Divergence des deux humains** (`calibrationsDivergent`, seule définition du jeu d'or, lue aussi
 * par la file humaine) : celle du §7, « deux humains s'accordent lorsque leurs notations sont
 * identiques sur la catégorie, sur tous les drapeaux, sur la fraîcheur de l'obsolescence et, pour le
 * sourçage, sur le seul sourçage valide » (`note-lue.ts:notationsConcordent`, par
 * `categorieHumaineRetenue`). L'arbitrage supplémentaire sur le motif, la citation d'une source ou
 * l'existence d'un lien ne vaut que pour « la note retenue » de l'échantillon (D75 (15),
 * `humainsAArbitrer`) ; le jeu d'or ne retient aucune note, seulement la référence du kappa.
 * Un désaccord qui attend encore son troisième humain lève `ArbitrageJeuOrEnAttente`, qui nomme les
 * réponses en attente.
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
 * distincts ; un troisième là où les deux humains s'accordent, un troisième qui est l'un des deux, ou
 * qui ne note pas sous `arbitrage_jeu_or` ; une note de juge retenu absente sans renvoi, ou double ; un
 * juge qui note et renvoie la même réponse ; une note ou un renvoi d'un juge non déclaré ; un refus
 * qui n'est pas une notation par règle, ou qu'un juge a noté ou renvoyé. Deux humains qui divergent
 * sans troisième ne sont pas une incohérence mais une attente (`ArbitrageJeuOrEnAttente`). Sur un
 * refus de l'API, la référence humaine n'est pas lue : ni les calibrations ni un troisième humain.
 */

import {
  CATEGORIES_DE_JUGE,
  categorieHumaineRetenue,
  categoriePourKappa,
  ecarterNonClassees,
  kappaCategoriePrimaire,
  kappaDeLaPaire,
  type CategorieDeJuge,
  type KappaCategorie,
  type KappaDeLaPaire,
} from "./kappa-categorie-primaire.ts";
import type { CategorieRetenue, MotifNotation, Notation, Ulid } from "./types.ts";

/** Les deux notations humaines de chaque réponse du jeu d'or (§7). */
export const MOTIF_CALIBRATION_JEU_OR = "calibration_jeu_or" satisfies MotifNotation;
/** Le troisième humain du jeu d'or, quand les deux premiers divergent (§7, D93). */
export const MOTIF_ARBITRAGE_JEU_OR = "arbitrage_jeu_or" satisfies MotifNotation;

/** Ce que le kappa lit d'un juge déclaré au run (`run.json#/juges[]`). */
export interface JugeDeclare {
  readonly juge_id: string;
  readonly retire: boolean;
}

export interface ReponseDuJeuOr {
  readonly reponse_id: Ulid;
  /** Les deux notations humaines `calibration_jeu_or`, de deux annotateurs distincts. */
  readonly calibration: readonly Notation[];
  /**
   * Le troisième humain (`arbitrage_jeu_or`), quand les deux premiers divergent (`calibrationsDivergent`)
   * et qu'il a noté ; `null` sinon.
   */
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

/** Ce que le kappa lit d'un renvoi de juge (`analysis/types-notation.ts:RenvoiHumain` s'y conforme). */
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
  /**
   * D64, D70 : réponses du jeu d'or dont la note humaine retenue ou la note d'un juge retenu est non
   * classée, écartées de chaque kappa (et donc du kappa de la paire), comptées avant les indéterminées.
   */
  readonly non_classees: number;
  /** D59 (20) : réponses du jeu d'or refusées par l'API, notées par règle, écartées de chaque kappa. */
  readonly refus_api: number;
}

export class JeuOrIncoherent extends Error {
  constructor(detail: string) {
    super(`Jeu d'or : ${detail} Le kappa juge-humain n'est pas calculé (§7) ; rien n'est deviné.`);
    this.name = "JeuOrIncoherent";
  }
}

/**
 * D93 : deux humains du jeu d'or divergent et leur troisième n'a pas encore noté. Ce n'est pas une
 * incohérence mais une attente : la référence du kappa n'existe pas encore (§7). Toutes les réponses
 * en attente sont nommées.
 */
export class ArbitrageJeuOrEnAttente extends Error {
  readonly reponse_ids: readonly Ulid[];

  constructor(reponse_ids: readonly Ulid[]) {
    super(
      `Jeu d'or : ${reponse_ids.length} réponse(s) dont les deux notations calibration_jeu_or divergent attendent la note du ` +
        `troisième humain (arbitrage_jeu_or, §7) : ${reponse_ids.join(", ")}. Le kappa juge-humain n'est pas calculé ; rien n'est deviné.`,
    );
    this.name = "ArbitrageJeuOrEnAttente";
    this.reponse_ids = reponse_ids;
  }
}

/**
 * Les deux humains du jeu d'or divergent (§7) : leurs notations ne s'accordent pas au sens de
 * `note-lue.ts:notationsConcordent`, et la référence du kappa est alors la note d'un troisième humain.
 * Seule définition de la divergence du jeu d'or : `referenceDe` et la file humaine la lisent ici.
 */
export function calibrationsDivergent(premiere: Notation, seconde: Notation): boolean {
  return categorieHumaineRetenue(premiere, seconde, null) === null;
}

interface Reference {
  readonly reponse: ReponseDuJeuOr;
  readonly categorie: CategorieDeJuge;
}

export function kappasJeuOr(juges: readonly JugeDeclare[], reponses: readonly ReponseDuJeuOr[]): ResultatJeuOr {
  const retenus = jugesRetenus(juges);
  for (const reponse of reponses) exigerJugesDeclares(reponse, juges);
  const hors_refus = reponses.filter((reponse) => !estUnRefus(reponse));
  exigerArbitragesRendus(hors_refus);
  const toutes = hors_refus.map((reponse) => ({ reponse, categorie: referenceDe(reponse) }));
  // D64, D70 : une réponse dont la référence humaine ou un juge retenu est non classée sort de tout kappa, comptée à part.
  const ids = new Set(retenus.map((juge) => juge.juge_id));
  const { gardes, non_classees } = ecarterNonClassees(toutes, (r) => [r.categorie, ...r.reponse.juges.filter((n) => ids.has(n.notateur.id)).map((n) => n.categorie)]);
  const references = gardes.filter((r): r is Reference => categoriePourKappa(r.categorie, `Réponse ${r.reponse.reponse_id} du jeu d'or`) !== "indeterminee");
  const kappas = retenus.map((juge) => kappaDuJuge(juge.juge_id, references));
  return { kappas, paire: kappaDeLaPaire(kappas), indeterminees: gardes.length - references.length, non_classees, refus_api: reponses.length - hors_refus.length };
}

/** D93 : aucune référence n'est lue tant qu'un désaccord des deux humains attend son troisième. */
function exigerArbitragesRendus(hors_refus: readonly ReponseDuJeuOr[]): void {
  const en_attente = hors_refus.filter((reponse) => reponse.troisieme === null && calibrationsDivergent(...deuxCalibrations(reponse)));
  if (en_attente.length > 0) throw new ArbitrageJeuOrEnAttente(en_attente.map((reponse) => reponse.reponse_id));
}

/**
 * D73 (8), décision de forme hors protocole : les effectifs du jeu d'or qui fondent le kappa d'un juge,
 * publiés à côté de lui dans `run.json#/juges[]/comptes_jeu_or` (§7 : « leur nombre est publié »).
 */
export interface ComptesJeuOr {
  /** Réponses du jeu d'or lues : la somme des cinq comptes qui suivent. */
  readonly reponses: number;
  /** Réponses sur lesquelles porte le kappa de ce juge (`n`). */
  readonly comparees: number;
  readonly renvois_ecartes: number;
  readonly indeterminees: number;
  readonly non_classees: number;
  readonly refus_api: number;
}

/** Ce que `run.json#/juges[]` reçoit d'un juge retenu : le kappa ou son motif, et ses comptes. */
export type InscriptionJeuOr = { readonly juge_id: string; readonly comptes_jeu_or: ComptesJeuOr } & (
  | { readonly kappa_juge_humain: number }
  | { readonly motif_indefini_kappa_juge_humain: NonNullable<KappaJugeJeuOr["motif_indefini"]> }
);

/**
 * Ce que la racine de `run.json` reçoit (D93) : le kappa de la paire de juges, ou le motif de son
 * indéfinition (§7 : « Un kappa indéfini [...] est publié absent avec son motif, jamais comme une
 * valeur »).
 */
export type InscriptionPaire =
  | { readonly kappa_paire_juges: number }
  | { readonly motif_indefini_kappa_paire_juges: NonNullable<KappaDeLaPaire["motif_indefini"]> };

export interface InscriptionsJeuOr {
  /** Une par juge retenu, dans l'ordre de `juges`. */
  readonly juges: readonly InscriptionJeuOr[];
  /**
   * Le plus faible des kappas des juges retenus (§7) ; avec un juge retiré, le kappa du juge restant
   * (§7 : le kappa des juges « ne porte plus que sur le juge restant », `kappaDeLaPaire`).
   */
  readonly paire: InscriptionPaire;
}

/**
 * Le kappa de chaque juge retenu et ses comptes, et le kappa de la paire, d'un seul appel à
 * `kappasJeuOr` sur `reponses` : les comptes ne sont jamais recalculés sur une autre population, et la
 * paire est lue des mêmes kappas. Un juge retiré n'en reçoit aucune : hors de l'accord (§7, D13), il
 * garde ce qu'une calibration antérieure lui a donné, que ce calcul n'invente pas. Lève
 * `JeuOrIncoherent` si les comptes ne rendent pas toutes les réponses lues (invariant).
 */
export function inscriptionsJeuOr(juges: readonly JugeDeclare[], reponses: readonly ReponseDuJeuOr[]): InscriptionsJeuOr {
  const resultat = kappasJeuOr(juges, reponses);
  return { juges: inscriptionsDesJuges(resultat, reponses.length), paire: paireOuMotif(resultat.paire) };
}

function paireOuMotif(paire: KappaDeLaPaire): InscriptionPaire {
  if (paire.kappa !== null) return { kappa_paire_juges: paire.kappa };
  if (paire.motif_indefini === null) throw new JeuOrIncoherent("kappa de la paire absent sans motif.");
  return { motif_indefini_kappa_paire_juges: paire.motif_indefini };
}

function inscriptionsDesJuges(resultat: ResultatJeuOr, lues: number): readonly InscriptionJeuOr[] {
  return resultat.kappas.map((kappa) => {
    const comptes: ComptesJeuOr = {
      reponses: lues,
      comparees: kappa.n,
      renvois_ecartes: kappa.renvois_ecartes,
      indeterminees: resultat.indeterminees,
      non_classees: resultat.non_classees,
      refus_api: resultat.refus_api,
    };
    exigerComptesComplets(kappa.juge_id, comptes);
    return { juge_id: kappa.juge_id, ...valeurOuMotif(kappa), comptes_jeu_or: comptes };
  });
}

function valeurOuMotif(kappa: KappaJugeJeuOr): { readonly kappa_juge_humain: number } | { readonly motif_indefini_kappa_juge_humain: NonNullable<KappaJugeJeuOr["motif_indefini"]> } {
  if (kappa.kappa !== null) return { kappa_juge_humain: kappa.kappa };
  if (kappa.motif_indefini === null) throw new JeuOrIncoherent(`juge ${kappa.juge_id} : kappa absent sans motif.`);
  return { motif_indefini_kappa_juge_humain: kappa.motif_indefini };
}

function exigerComptesComplets(juge_id: string, c: ComptesJeuOr): void {
  const somme = c.comparees + c.renvois_ecartes + c.indeterminees + c.non_classees + c.refus_api;
  if (somme !== c.reponses) throw new JeuOrIncoherent(`juge ${juge_id} : les comptes rendent ${somme} réponse(s) sur ${c.reponses} lues.`);
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
  if (!calibrationsDivergent(premiere, seconde) && reponse.troisieme !== null) {
    throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : troisième humain (${reponse.troisieme.id}) alors que les deux premiers s'accordent.`);
  }
  exigerTroisiemeDistinct(reponse, premiere, seconde);
  const categorie = categorieHumaineRetenue(premiere, seconde, reponse.troisieme);
  // Invariant : `exigerArbitragesRendus` a déjà nommé toute divergence sans troisième.
  if (categorie === null) throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : les deux humains divergent et aucun troisième humain n'a noté (invariant).`);
  return categorie;
}

function deuxCalibrations(reponse: ReponseDuJeuOr): readonly [Notation, Notation] {
  const { calibration, reponse_id } = reponse;
  const [premiere, seconde] = calibration;
  if (premiere === undefined || seconde === undefined || calibration.length !== 2) {
    throw new JeuOrIncoherent(`réponse ${reponse_id} : ${calibration.length} notation(s) de calibration au lieu de deux.`);
  }
  const fautive = calibration.find((n) => n.notateur.type !== "humain" || n.motif_notation !== MOTIF_CALIBRATION_JEU_OR);
  if (fautive !== undefined) throw new JeuOrIncoherent(`réponse ${reponse_id} : la notation ${fautive.id} n'est pas une calibration humaine (calibration_jeu_or).`);
  if (premiere.notateur.id === seconde.notateur.id) throw new JeuOrIncoherent(`réponse ${reponse_id} : deux calibrations du même annotateur ${premiere.notateur.id}.`);
  return [premiere, seconde];
}

/** Le troisième est un humain distinct des deux premiers, qui note sous `arbitrage_jeu_or` (D93). */
function exigerTroisiemeDistinct(reponse: ReponseDuJeuOr, premiere: Notation, seconde: Notation): void {
  const troisieme = reponse.troisieme;
  if (troisieme === null) return;
  if (troisieme.notateur.type !== "humain" || [premiere, seconde].some((n) => n.notateur.id === troisieme.notateur.id)) {
    throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : le troisième (${troisieme.notateur.id}) n'est pas un troisième humain.`);
  }
  if (troisieme.motif_notation !== MOTIF_ARBITRAGE_JEU_OR) {
    throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : le troisième humain note sous le motif ${String(troisieme.motif_notation)}, pas arbitrage_jeu_or (D93).`);
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
  const categorie = categoriePourKappa(notation.categorie, `Réponse ${reponse.reponse_id} du jeu d'or, juge ${juge_id}`);
  if (categorie === "indeterminee") throw new JeuOrIncoherent(`réponse ${reponse.reponse_id} : le juge ${juge_id} a rendu « indeterminee », réservée aux humains (§7).`);
  return categorie;
}
