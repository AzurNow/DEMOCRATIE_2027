/**
 * Composition des lots et ordre d'affichage.
 *
 * Deux exigences se croisent ici. Le §4 impose des lots de 50 items communs aux deux
 * annotateurs — sans items communs, aucun kappa. Et l'ordre d'affichage doit être aléatoire,
 * à graine enregistrée, **sans jamais enchaîner deux items du même candidat** : si la fatigue
 * de fin de lot tombe toujours sur le même candidat, l'erreur de mesure devient une asymétrie
 * entre candidats, exactement ce que le projet prétend mesurer chez les autres.
 *
 * L'ordre est propre à chaque annotateur (graine dérivée de son identifiant), ce qui supprime
 * en plus tout effet d'ordre partagé. Il n'est pas stocké : il se recalcule à partir de la
 * graine maîtresse du lot, qui, elle, est enregistrée.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { GenerateurAleatoire } from "./alea.ts";
import { ALGORITHME_ALEA, generateur, graineDepuisTexte, melanger } from "./alea.ts";
import type { ItemDuLot, Lot, NatureLot } from "./types.ts";

export const ALGORITHME_ORDRE = `ordre-annotateur-v1(${ALGORITHME_ALEA})`;

export const TAILLE_LOT_REEL = 50;
export const TAILLE_LOT_ENTRAINEMENT = 30;

/**
 * Levée quand aucun ordre ne peut respecter la contrainte d'adjacence : c'est le cas si et
 * seulement si un candidat occupe plus de la moitié (arrondie au supérieur) du lot. Une
 * dégradation silencieuse — « on fait au mieux » — produirait des séries invisibles.
 */
export class OrdreImpossible extends Error {
  readonly candidat_id: string;
  readonly effectif: number;
  readonly taille: number;

  constructor(candidat_id: string, effectif: number, taille: number) {
    super(
      `Ordre impossible : le candidat ${candidat_id} occupe ${effectif} des ${taille} items du lot, ` +
        `soit plus de la moitié. Aucune disposition n'évite deux items consécutifs du même candidat.`,
    );
    this.name = "OrdreImpossible";
    this.candidat_id = candidat_id;
    this.effectif = effectif;
    this.taille = taille;
  }
}

/**
 * Ordre d'affichage d'un lot pour un annotateur donné.
 *
 * Méthode : les items sont groupés par candidat et mélangés à l'intérieur de chaque groupe,
 * les groupes sont ordonnés du plus fourni au moins fourni (à effectif égal, l'ordre est tiré),
 * puis la suite obtenue est distribuée sur les positions paires, puis sur les impaires. Deux
 * items voisins viennent alors nécessairement de deux groupes différents, sauf si un groupe
 * dépasse la moitié du lot — cas où l'on lève.
 */
export function ordreAffichage(lot: Lot, annotateur_id: string): readonly ItemDuLot[] {
  const rng = generateur(graineDepuisTexte(lot.graine_maitresse, lot.lot_id, annotateur_id));
  const groupes = grouperParCandidat(lot.items, rng);
  verifierFaisabilite(groupes, lot.items.length);

  const suite = groupes.flatMap((groupe) => groupe.items);
  return distribuerEnAlternance(suite);
}

interface GroupeCandidat {
  readonly candidat_id: string;
  readonly items: readonly ItemDuLot[];
  readonly cle_tri: number;
}

function grouperParCandidat(
  items: readonly ItemDuLot[],
  rng: GenerateurAleatoire,
): readonly GroupeCandidat[] {
  const parCandidat = new Map<string, ItemDuLot[]>();
  for (const item of items) {
    const groupe = parCandidat.get(item.candidat_id);
    if (groupe === undefined) parCandidat.set(item.candidat_id, [item]);
    else groupe.push(item);
  }

  const groupes: GroupeCandidat[] = [];
  // Les clés sont triées avant tout tirage : l'ordre d'itération d'une Map dépend de l'ordre
  // d'insertion, donc du fichier lu, ce qui rendrait le résultat non reproductible.
  for (const candidat_id of [...parCandidat.keys()].sort()) {
    groupes.push({
      candidat_id,
      items: melanger(parCandidat.get(candidat_id) as ItemDuLot[], rng),
      cle_tri: rng.flottant(),
    });
  }

  return [...groupes].sort(comparerGroupes);
}

function comparerGroupes(a: GroupeCandidat, b: GroupeCandidat): number {
  if (a.items.length !== b.items.length) return b.items.length - a.items.length;
  return a.cle_tri - b.cle_tri;
}

function verifierFaisabilite(groupes: readonly GroupeCandidat[], taille: number): void {
  const plusGros = groupes[0];
  if (plusGros === undefined) return;
  if (plusGros.items.length > Math.ceil(taille / 2)) {
    throw new OrdreImpossible(plusGros.candidat_id, plusGros.items.length, taille);
  }
}

function distribuerEnAlternance(suite: readonly ItemDuLot[]): readonly ItemDuLot[] {
  const resultat = new Array<ItemDuLot>(suite.length);
  let position = 0;
  for (const item of suite) {
    resultat[position] = item;
    position += 2;
    if (position >= suite.length) position = 1;
  }
  return resultat;
}

/* ------------------------------------------------------------- composition */

/**
 * Levée quand la taille demandée pour une composition n'est pas celle du §4 : un kappa calculé
 * sur un lot d'une autre taille n'a pas la variance de celui d'un lot de 50, et il déciderait
 * pourtant du §12 comme lui.
 */
export class TailleDeLotNonConforme extends Error {
  readonly nature: NatureLot;
  readonly demandee: number;
  readonly attendue: number;

  constructor(nature: NatureLot, demandee: number, attendue: number) {
    super(
      `Taille de lot refusée : ${demandee} demandée pour un lot de nature « ${nature} », dont la ` +
        `taille est fixée à ${attendue} par le §4. Omettre --taille : elle découle de la nature.`,
    );
    this.name = "TailleDeLotNonConforme";
    this.nature = nature;
    this.demandee = demandee;
    this.attendue = attendue;
  }
}

/** §4 : cinquante items par lot réel, trente items d'entraînement communs. */
const TAILLE_PAR_NATURE: Readonly<Record<Exclude<NatureLot, "reannotation">, number>> = {
  reel: TAILLE_LOT_REEL,
  entrainement: TAILLE_LOT_ENTRAINEMENT,
};

/**
 * Taille réglementaire d'un lot composé depuis la réserve. Un lot de réannotation ne se compose
 * pas depuis la réserve : il reprend les items d'un lot existant, donc sa taille.
 */
function tailleReglementaire(nature: NatureLot): number {
  if (nature === "reannotation") {
    throw new Error(
      "Un lot de réannotation ne se compose pas depuis la réserve : il reprend les items d'un " +
        "lot existant. Employer --reannote=<lot> --calibration=<date>.",
    );
  }
  const taille = TAILLE_PAR_NATURE[nature] as number | undefined;
  if (taille === undefined) throw new Error(`Nature de lot inconnue : ${JSON.stringify(nature)}`);
  return taille;
}

/**
 * Taille des lots d'une composition : celle de la nature. Une taille demandée n'est admise que
 * si elle la répète ; toute autre valeur est refusée, jamais ajustée.
 */
export function tailleDeComposition(nature: NatureLot, demandee: number | null): number {
  const attendue = tailleReglementaire(nature);
  if (demandee !== null && demandee !== attendue) {
    throw new TailleDeLotNonConforme(nature, demandee, attendue);
  }
  return attendue;
}

/**
 * Taille qu'un lot existant devrait compter : celle de sa nature, ou, pour une réannotation,
 * celle du premier maillon de sa chaîne, dont il reprend les items.
 */
export function tailleAttendue(lots: readonly Lot[], lot: Lot): number {
  const tete = chaineAvant(lots, lot)[0] as Lot;
  return tailleReglementaire(tete.nature);
}

export interface CompositionLots {
  /** Lots pleins, tous exactement de la taille demandée. */
  readonly lots: readonly (readonly ItemDuLot[])[];
  /** Reste de la réserve : il n'est pas un lot, il attend la prochaine composition. */
  readonly en_attente: readonly ItemDuLot[];
}

/**
 * Découpe une réserve d'items en lots **pleins** de taille fixe. L'affectation aux lots est
 * elle aussi tirée : composer les lots dans l'ordre du répertoire regrouperait les items d'un
 * même candidat dans un même lot, ce qui rendrait la contrainte d'adjacence infaisable et,
 * surtout, ferait porter le kappa d'un lot sur un seul candidat.
 *
 * Le reste de la réserve n'est jamais un lot : un kappa sur 17 items n'a pas la variance d'un
 * kappa sur 50 (§4, §12). Il reste disponible et sera retiré au sort avec les items suivants.
 */
export function composerLots(
  items: readonly ItemDuLot[],
  taille: number,
  graine_maitresse: string,
): CompositionLots {
  if (!Number.isInteger(taille) || taille < 1) throw new Error(`Taille de lot invalide : ${taille}`);
  const rng = generateur(graineDepuisTexte(graine_maitresse, "composition"));
  const melanges = melanger([...items].sort(comparerParIdentifiant), rng);

  const pleins = melanges.length - (melanges.length % taille);
  const lots: ItemDuLot[][] = [];
  for (let debut = 0; debut < pleins; debut += taille) {
    lots.push(melanges.slice(debut, debut + taille));
  }
  return { lots, en_attente: melanges.slice(pleins) };
}

/**
 * Identifiants des lots d'une nouvelle composition : ils reprennent après le plus grand numéro
 * existant pour ce préfixe. Recomposer le reste de la réserve est le cas normal ; repartir à 001
 * heurterait un manifeste existant, qui n'est jamais réécrit. Les réannotations (`lot-002-r1`)
 * n'entrent pas dans le calcul : elles prolongent un numéro, elles n'en prennent pas un.
 */
export function numeroterLots(existants: readonly Lot[], prefixe: string, nombre: number): readonly string[] {
  const depart = plusGrandNumero(existants, prefixe);
  return Array.from({ length: nombre }, (_, index) => `${prefixe}-${String(depart + index + 1).padStart(3, "0")}`);
}

const NUMERO = /^\d+$/;

function plusGrandNumero(existants: readonly Lot[], prefixe: string): number {
  const tete = `${prefixe}-`;
  let maximum = 0;
  for (const lot of existants) {
    if (!lot.lot_id.startsWith(tete)) continue;
    const suffixe = lot.lot_id.slice(tete.length);
    if (NUMERO.test(suffixe)) maximum = Math.max(maximum, Number(suffixe));
  }
  return maximum;
}

/** Ce que la commande annonce : les lots pleins, et le reste en clair. */
export function annoncerComposition(composition: CompositionLots, taille: number): string {
  const attente = composition.en_attente.length;
  const reste =
    attente === 0
      ? "aucun item en attente"
      : `${attente} items en attente d'un lot complet de ${taille}, disponibles pour une prochaine composition`;
  if (composition.lots.length === 0) return `Aucun lot composé : ${reste}.`;
  return `${composition.lots.length} lot(s) de ${taille}, ${reste}.`;
}

function comparerParIdentifiant(a: ItemDuLot, b: ItemDuLot): number {
  return comparerChaines(a.item_id, b.item_id);
}

/** Vrai si aucun item n'est immédiatement suivi d'un item du même candidat. */
export function adjacenceRespectee(ordre: readonly ItemDuLot[]): boolean {
  for (let i = 1; i < ordre.length; i += 1) {
    if ((ordre[i] as ItemDuLot).candidat_id === (ordre[i - 1] as ItemDuLot).candidat_id) {
      return false;
    }
  }
  return true;
}

/* ----------------------------------------------------------- réannotation (§4) */

/**
 * Réannotation et supersession.
 *
 * Un lot dont l'accord n'est pas suffisant (`kappa.ts:accordSuffisant`, §4) est réannoté après séance de calibration.
 * Le lot de réannotation porte **les mêmes items**, la référence du lot d'origine et la date de
 * la séance, sans laquelle son kappa n'est pas interprétable. Il supersède le lot d'origine :
 * ses décisions remplacent celles du lot d'origine pour les items concernés. Le lot d'origine
 * reste publié — son kappa est toujours calculé — mais il ne compte plus pour le §12.
 *
 * La chaîne est strictement linéaire : un lot n'est supersédé qu'une fois. Deux réannotations
 * concurrentes du même lot rendraient indécidable la paire de décisions qui fait foi, donc le
 * kappa publié ; c'est refusé plutôt qu'arbitré.
 */

export class LotIntrouvable extends Error {
  readonly lot_id: string;

  constructor(lot_id: string) {
    super(`Lot introuvable : ${lot_id}. Aucun manifeste de ce nom parmi les lots lus.`);
    this.name = "LotIntrouvable";
    this.lot_id = lot_id;
  }
}

export class LotDejaSupersede extends Error {
  readonly lot_id: string;
  readonly supersede_par: string;

  constructor(lot_id: string, supersede_par: string) {
    super(
      `Le lot ${lot_id} est déjà supersédé par ${supersede_par}. Le réannoter une seconde fois ` +
        `rendrait la chaîne de supersession ambiguë : deux lots prétendraient remplacer les mêmes ` +
        `décisions. Réannoter ${supersede_par}, qui est le dernier maillon.`,
    );
    this.name = "LotDejaSupersede";
    this.lot_id = lot_id;
    this.supersede_par = supersede_par;
  }
}

export class ChaineDeSupersessionCirculaire extends Error {
  constructor(lot_id: string) {
    super(
      `Chaîne de réannotation circulaire au niveau du lot ${lot_id}. Un lot ne peut pas se ` +
        `superséder, directement ou non : la paire de décisions qui fait foi serait indécidable.`,
    );
    this.name = "ChaineDeSupersessionCirculaire";
  }
}

export function trouverLot(lots: readonly Lot[], lot_id: string): Lot {
  const lot = lots.find((candidat) => candidat.lot_id === lot_id);
  if (lot === undefined) throw new LotIntrouvable(lot_id);
  return lot;
}

/** Le lot de réannotation qui supersède directement celui-ci, s'il existe. */
export function supersediteurDe(lots: readonly Lot[], lot_id: string): Lot | null {
  const candidats = lots.filter((lot) => lot.reannote === lot_id);
  const premier = candidats[0];
  if (premier === undefined) return null;
  const second = candidats[1];
  if (second !== undefined) throw new LotDejaSupersede(lot_id, premier.lot_id);
  return premier;
}

/** Les maillons qui suivent ce lot dans la chaîne de réannotation, du plus proche au dernier. */
export function chaineApres(lots: readonly Lot[], depart: Lot): readonly Lot[] {
  const suite: Lot[] = [];
  const vus = new Set<string>([depart.lot_id]);
  let courant = supersediteurDe(lots, depart.lot_id);
  while (courant !== null) {
    if (vus.has(courant.lot_id)) throw new ChaineDeSupersessionCirculaire(courant.lot_id);
    vus.add(courant.lot_id);
    suite.push(courant);
    courant = supersediteurDe(lots, courant.lot_id);
  }
  return suite;
}

/** Les maillons qui précèdent ce lot, du plus ancien au lot lui-même. */
export function chaineAvant(lots: readonly Lot[], arrivee: Lot): readonly Lot[] {
  const suite: Lot[] = [arrivee];
  const vus = new Set<string>([arrivee.lot_id]);
  let courant = arrivee;
  while (courant.reannote !== undefined) {
    const precedent = trouverLot(lots, courant.reannote);
    if (vus.has(precedent.lot_id)) throw new ChaineDeSupersessionCirculaire(precedent.lot_id);
    vus.add(precedent.lot_id);
    suite.unshift(precedent);
    courant = precedent;
  }
  return suite;
}

export interface LotEffectif {
  readonly lot: Lot;
  /** Items que ce lot juge encore : ceux qu'aucun maillon postérieur ne reprend. */
  readonly items: readonly ItemDuLot[];
  /** Lot qui supersède celui-ci, `null` s'il est le dernier maillon. */
  readonly supersede_par: string | null;
}

/**
 * Répartit les items entre les lots après supersession : un item repris par un lot postérieur
 * n'est plus jugé par le lot d'origine, **quel que soit** l'état de sa réannotation. Un item
 * décidé une seule fois dans le lot de réannotation vaut « décisions insuffisantes » ; il ne se
 * complète jamais avec une décision du lot supersédé, car on ne saurait plus de quel lot vient
 * la paire, ni quel kappa la couvre.
 *
 * Un item **absent** du lot de réannotation reste jugé par le lot d'origine : la supersession
 * porte sur les items repris, pas sur le lot en bloc.
 */
export function lotsApresSupersession(lots: readonly Lot[]): readonly LotEffectif[] {
  return lots.map((lot) => {
    const posterieurs = chaineApres(lots, lot);
    const repris = new Set<string>();
    for (const maillon of posterieurs) {
      for (const item of maillon.items) repris.add(item.item_id);
    }
    const premier = posterieurs[0];
    return {
      lot,
      items: lot.items.filter((item) => !repris.has(item.item_id)),
      supersede_par: premier === undefined ? null : premier.lot_id,
    };
  });
}

export interface DemandeReannotation {
  readonly origine_id: string;
  readonly graine_maitresse: string;
  /** Date civile de la séance de calibration, `AAAA-MM-JJ`. */
  readonly date_calibration: string;
  readonly date_creation: string;
}

/**
 * Compose le lot de réannotation d'un lot existant. Les items sont **repris tels quels**, sans
 * passer par la réserve des items disponibles : ils appartiennent déjà à un lot, et c'est
 * précisément ceux-là qu'il faut rejuger.
 *
 * Les annotateurs sont ceux du lot d'origine : le kappa du lot de réannotation remplace celui
 * du lot d'origine pour le §12, et deux kappas portés par des paires d'annotateurs différentes
 * ne se remplacent pas l'un l'autre.
 */
export function preparerReannotation(lots: readonly Lot[], demande: DemandeReannotation): Lot {
  const source = trouverLot(lots, demande.origine_id);
  const dejaSupersede = supersediteurDe(lots, source.lot_id);
  if (dejaSupersede !== null) throw new LotDejaSupersede(source.lot_id, dejaSupersede.lot_id);

  return {
    lot_id: identifiantReannotation(lots, source),
    nature: "reannotation",
    graine_maitresse: demande.graine_maitresse,
    algorithme_ordre: source.algorithme_ordre,
    date_creation: demande.date_creation,
    annotateurs: source.annotateurs,
    items: source.items,
    reannote: source.lot_id,
    date_calibration: demande.date_calibration,
  };
}

/** `lot-003` → `lot-003-r1` → `lot-003-r2` : le rang se lit dans le nom, la chaîne aussi. */
function identifiantReannotation(lots: readonly Lot[], source: Lot): string {
  const chaine = chaineAvant(lots, source);
  const tete = chaine[0] as Lot;
  return `${tete.lot_id}-r${chaine.length}`;
}
