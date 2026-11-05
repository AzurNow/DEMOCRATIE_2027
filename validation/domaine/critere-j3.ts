/**
 * Critère de passage du jalon J3 (§12, protocole 0.28, D70 (5) ; 0.29, D71 (9) ; 0.30, D72 (8)) : « Accord
 * suffisant […] lu sur l'effectif publié du lot, sur les deux derniers lots réels ou de
 * réannotation de taille conforme (50 items, hors entraînement), dans l'ordre de leur clôture, un
 * lot étant clos quand ses deux annotateurs l'ont terminé, ou, s'il est achevé par une
 * contestation qu'aucun journal d'annotation ne date, à la date de réception de cette
 * contestation, ou, s'il est achevé par plusieurs contestations, à la plus tardive des premières
 * réceptions de ses items contestés, la fin de ses journaux l'emportant si elle est plus tardive,
 * […] celui du lot de réannotation comptant seul quand un lot a été réannoté
 * (section 4) ».
 *
 * Rien n'est recalculé ici. L'accord suffisant d'un lot est le champ publié `accord_suffisant`
 * (`kappa.ts:accordSuffisant`, via `analyse-lot.ts:diagnostiquerLot`) ; les lots qui comptent sont
 * ceux de `diagnostic-publie.ts:kappasRetenusSection12` (dernier calcul, dernier maillon de la
 * chaîne de réannotation, taille conforme, hors entraînement) ; « terminé » est
 * `analyse-lot.ts:lesDeuxOntFini`. Ce module n'ajoute que l'ordre : l'instant de clôture de chaque
 * lot, puis le choix des deux derniers.
 *
 * **Instant de clôture.** Aucun champ ne l'enregistre : il se lit sur les journaux en ajout seul.
 * Un annotateur a terminé un lot à l'horodatage de l'entrée de son journal après laquelle chaque
 * item du lot porte une décision active ou un retrait journalisé (`retrait_item`), et le reste
 * jusqu'à la fin du journal ; le lot est clos au plus tardif des deux (`Date.parse`, décalages
 * comparés). Le verrou d'un lot terminé (`verrou-lot.ts`) interdit toute écriture après la
 * clôture : la dernière entrée qui achève est donc bien celle de la clôture. Un lot que
 * `lesDeuxOntFini` dit terminé sans que les journaux couvrent chaque item (un item contesté jamais
 * atteint ni journalisé, la contestation ayant achevé le lot après la dernière écriture) est clos,
 * au plus tard, à la date de réception de cette contestation (0.29) ; achevé par plusieurs, à la
 * plus tardive des premières réceptions de ses items contestés (0.30, voir `clotureDuLot`).
 *
 * **Ex aequo.** Deux lots clos au même instant sont départagés par leur identifiant
 * (`comparerChaines`), comme le §12 l'écrit depuis la 0.29.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { instantDe } from "../../analysis/instants.ts";
import { lesDeuxOntFini } from "./analyse-lot.ts";
import { derniersCalculs, kappasRetenusSection12, type DiagnosticPublie } from "./diagnostic-publie.ts";
import { rejouer, type EtatAnnotateur } from "./journal.ts";
import type { EntreeJournal, Lot } from "./types.ts";

/** Clôture d'un lot. `instant` est `null` quand le lot est clos sans qu'aucun journal ne le date. */
export type Cloture = { readonly clos: false } | { readonly clos: true; readonly instant: string | null };

export type MotifJ3NonAtteint =
  /** Un lot éligible est clos sans instant connu : l'ordre de clôture n'est pas décidable. */
  | "cloture_non_datee"
  /** Moins de deux lots éligibles clos. */
  | "moins_de_deux_lots_clos"
  /** Un des deux derniers lots n'a aucun item commun : son accord n'est pas observé. */
  | "accord_non_decidable"
  /** Un des deux derniers lots a un accord insuffisant (§4). */
  | "accord_insuffisant";

export type VerdictJ3 =
  | { readonly atteint: true; readonly lots: readonly [string, string] }
  | { readonly atteint: false; readonly motif: MotifJ3NonAtteint; readonly lots: readonly string[] };

/** Un lot clos (par les journaux) dont aucun diagnostic n'est publié : `pnpm diagnostics` d'abord. */
export class DiagnosticManquant extends Error {
  constructor(lot_id: string) {
    super(`Lot ${lot_id} : clos par ses deux annotateurs, sans diagnostic publié. Lancer pnpm diagnostics avant de lire J3.`);
    this.name = "DiagnosticManquant";
  }
}

/** Un lot des manifestes dont la clôture n'a pas été établie : aucun lot n'est présumé ouvert. */
export class ClotureInconnue extends Error {
  constructor(lot_id: string) {
    super(`Lot ${lot_id} : aucune clôture établie (ni close, ni ouverte). J3 n'est pas lu sur une liste incomplète.`);
    this.name = "ClotureInconnue";
  }
}

/* ---------------------------------------------------------------- clôture */

/** L'item porte, dans ce journal, une décision active ou un retrait journalisé. */
function journalCouvre(etat: EtatAnnotateur, item_id: string): boolean {
  return etat.decisions.has(item_id) || etat.retires.has(item_id);
}

/** Chaque item du lot est couvert par ce journal. */
function journalCouvreLeLot(lot: Lot, etat: EtatAnnotateur): boolean {
  return lot.items.every((reference) => journalCouvre(etat, reference.item_id));
}

/**
 * Horodatage de l'entrée après laquelle le journal de cet annotateur couvre le lot et le couvre
 * encore à la fin. `null` si le journal ne couvre pas le lot.
 */
export function finAnnotateur(lot: Lot, etat: EtatAnnotateur): string | null {
  let fin: string | null = null;
  for (let rang = 0; rang < etat.entrees.length; rang += 1) {
    const couvert = journalCouvreLeLot(lot, rejouer(etat.entrees.slice(0, rang + 1)));
    if (!couvert) fin = null;
    else if (fin === null) fin = (etat.entrees[rang] as EntreeJournal).horodatage;
  }
  return fin;
}

function plusTardif(a: string, b: string): string {
  return Date.parse(b) > Date.parse(a) ? b : a;
}

type EntreeCloture = Parameters<typeof lesDeuxOntFini>[0];

/** Les items du lot que le journal de cet annotateur ne couvre pas à la fin. */
function itemsNonCouverts(lot: Lot, etat: EtatAnnotateur): string[] {
  return lot.items.map((reference) => reference.item_id).filter((item_id) => !journalCouvre(etat, item_id));
}

/**
 * Fin de cet annotateur sur les items que son journal couvre à la fin ; aucune s'il n'en couvre
 * aucun (le reste du lot, contesté, n'est daté que par sa contestation).
 */
function finSurLesItemsCouverts(lot: Lot, etat: EtatAnnotateur): string[] {
  const nonCouverts = new Set(itemsNonCouverts(lot, etat));
  const couverts = lot.items.filter((reference) => !nonCouverts.has(reference.item_id));
  if (couverts.length === 0) return [];
  const fin = finAnnotateur({ ...lot, items: couverts }, etat);
  return fin === null ? [] : [fin];
}

/** Une contestation d'un item non couvert dont la date de réception n'est pas lisible. */
export class ContestationSansDateDeReception extends Error {
  constructor(item_id: string, detail: string) {
    super(`Item ${item_id} : ${detail}. La clôture du lot qu'elle achève n'est pas datée par défaut.`);
    this.name = "ContestationSansDateDeReception";
  }
}

function plusPrecoce(a: string, b: string): string {
  return Date.parse(b) < Date.parse(a) ? b : a;
}

/**
 * Frontière d'entrée : `Item.contestations` est typé `unknown[]`. Première réception (instant réel
 * le plus précoce) des contestations d'un item non couvert, que `lesDeuxOntFini` a donc sorti du
 * lot pour contestation (§12, 0.30) : une recontestation ne déplace pas la clôture.
 */
function premiereReceptionDe(items: EntreeCloture["items"], item_id: string): string {
  const contestations = items.get(item_id)?.contestations;
  if (contestations === undefined || contestations.length === 0) {
    throw new ContestationSansDateDeReception(item_id, "item sorti pour contestation sans contestation enregistrée");
  }
  return contestations.map((contestation) => receptionDe(contestation, item_id)).reduce(plusPrecoce);
}

function receptionDe(contestation: unknown, item_id: string): string {
  const date = typeof contestation === "object" && contestation !== null ? (contestation as Record<string, unknown>)["date_reception"] : undefined;
  if (typeof date !== "string") throw new ContestationSansDateDeReception(item_id, "contestation sans date_reception textuelle");
  instantDe(date);
  return date;
}

/**
 * Clôture d'un lot (§12, protocole 0.29, D71 (9) ; 0.30, D72 (8)) : « un lot étant clos quand ses
 * deux annotateurs l'ont terminé, ou, s'il est achevé par une contestation qu'aucun journal
 * d'annotation ne date, à la date de réception de cette contestation, ou, s'il est achevé par
 * plusieurs contestations, à la plus tardive des premières réceptions de ses items contestés, la
 * fin de ses journaux l'emportant si elle est plus tardive ».
 *
 * Pour chaque item qu'un journal ne couvre pas à la fin : sa première réception. L'instant est le
 * plus tardif de ces premières réceptions et des fins lues sur les journaux, chacune sur les items
 * que le journal couvre à la fin. Un lot que les journaux couvrent entièrement est daté par eux
 * seuls, même contesté ensuite. `instant` reste `null` si rien ne le date (aucun item couvert,
 * aucune réception) : jamais une date par défaut.
 */
export function clotureDuLot(entree: EntreeCloture): Cloture {
  if (!lesDeuxOntFini(entree)) return { clos: false };
  const etats = [...entree.etats.values()];
  const nonCouverts = [...new Set(etats.flatMap((etat) => itemsNonCouverts(entree.lot, etat)))];
  const receptions = nonCouverts.map((item_id) => premiereReceptionDe(entree.items, item_id));
  const instants = [...receptions, ...etats.flatMap((etat) => finSurLesItemsCouverts(entree.lot, etat))];
  return { clos: true, instant: instants.length === 0 ? null : instants.reduce(plusTardif) };
}

/* ---------------------------------------------------------------- verdict */

interface LotClos {
  readonly diagnostic: DiagnosticPublie;
  readonly instant: string | null;
}

function clotureDe(clotures: ReadonlyMap<string, Cloture>, lot_id: string): Cloture {
  const cloture = clotures.get(lot_id);
  if (cloture === undefined) throw new ClotureInconnue(lot_id);
  return cloture;
}

/** Tout lot clos a un dernier calcul publié ; tout lot des manifestes a une clôture établie. */
function controlerCompletude(
  diagnostics: readonly DiagnosticPublie[],
  lots: readonly Lot[],
  clotures: ReadonlyMap<string, Cloture>,
): void {
  const publies = new Set(derniersCalculs(diagnostics).map((diagnostic) => diagnostic.lot_id));
  for (const lot of lots) {
    if (clotureDe(clotures, lot.lot_id).clos && !publies.has(lot.lot_id)) throw new DiagnosticManquant(lot.lot_id);
  }
}

/** Les lots qui comptent pour le §12 et qui sont clos. Un lot ouvert n'est pas clos : il est ignoré. */
function lotsClosEligibles(
  diagnostics: readonly DiagnosticPublie[],
  lots: readonly Lot[],
  clotures: ReadonlyMap<string, Cloture>,
): readonly LotClos[] {
  const eligibles: LotClos[] = [];
  for (const diagnostic of kappasRetenusSection12(diagnostics, lots)) {
    const cloture = clotureDe(clotures, diagnostic.lot_id);
    if (cloture.clos) eligibles.push({ diagnostic, instant: cloture.instant });
  }
  return eligibles;
}

/** Ordre de clôture, instant réel croissant, puis identifiant du lot (§12, 0.29). */
function comparerClotures(a: { readonly instant: string; readonly lot_id: string }, b: typeof a): number {
  return Date.parse(a.instant) - Date.parse(b.instant) || comparerChaines(a.lot_id, b.lot_id);
}

function motifDesDeuxDerniers(derniers: readonly DiagnosticPublie[]): MotifJ3NonAtteint | null {
  if (derniers.some((diagnostic) => diagnostic.accord_suffisant === null)) return "accord_non_decidable";
  if (derniers.some((diagnostic) => diagnostic.accord_suffisant === false)) return "accord_insuffisant";
  return null;
}

/**
 * Verdict de J3. `diagnostics` : tous les diagnostics publiés ; `lots` : tous les manifestes ;
 * `clotures` : la clôture de chaque lot des manifestes (`clotureDuLot`). Jamais atteint par défaut :
 * sans deux lots éligibles clos et datés, il ne l'est pas, avec son motif.
 */
export function verdictJ3(
  diagnostics: readonly DiagnosticPublie[],
  lots: readonly Lot[],
  clotures: ReadonlyMap<string, Cloture>,
): VerdictJ3 {
  controlerCompletude(diagnostics, lots, clotures);
  const eligibles = lotsClosEligibles(diagnostics, lots, clotures);
  const nonDates = eligibles.filter((lot) => lot.instant === null).map((lot) => lot.diagnostic.lot_id);
  if (nonDates.length > 0) return { atteint: false, motif: "cloture_non_datee", lots: nonDates };

  const ordonnes = eligibles
    .map((lot) => ({ diagnostic: lot.diagnostic, instant: lot.instant as string, lot_id: lot.diagnostic.lot_id }))
    .sort(comparerClotures);
  const [avantDernier, dernier] = ordonnes.slice(-2);
  if (avantDernier === undefined || dernier === undefined) {
    return { atteint: false, motif: "moins_de_deux_lots_clos", lots: ordonnes.map((lot) => lot.lot_id) };
  }
  const paire: readonly [string, string] = [avantDernier.lot_id, dernier.lot_id];
  const motif = motifDesDeuxDerniers([avantDernier.diagnostic, dernier.diagnostic]);
  return motif === null ? { atteint: true, lots: paire } : { atteint: false, motif, lots: paire };
}
