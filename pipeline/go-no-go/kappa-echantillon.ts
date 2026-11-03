/**
 * Kappa juges-humains de l'échantillon humain (§7, « À chaque run, l'accord juges-humains sur
 * l'échantillon de 10 % est publié » ; §12, premier critère). Décision D24 (1) et (2) de l'auteur du
 * 2026-10-09 :
 *
 * - **un kappa par juge retenu** (`retire === false`) ; les notations d'un juge retiré n'entrent
 *   nulle part (D13) ;
 * - pour chaque réponse de l'échantillon, la catégorie primaire de la notation du juge est comparée
 *   à celle de la **note humaine retenue** : celle des deux humains quand ils s'accordent (au sens
 *   de `analysis/note-lue.ts:notationsConcordent`, seule égalité du dépôt), sinon celle de
 *   l'arbitre (`arbitrage_echantillon_10`) ;
 * - kappa de Cohen non pondéré sur `exacte`, `inexacte`, `non_reponse`, fixées a priori — le noyau
 *   est celui du §4 (`validation/domaine/kappa.ts`), jamais un second ;
 * - un kappa indéfini (accord attendu maximal, ou aucune réponse comparable) est publié absent
 *   avec son motif, jamais 0, 1 ni null.
 *
 * L'échantillon est rejoué par l'appelant (`pipeline/notation/echantillons.ts:tirerEchantillonHumain`),
 * comme le fait le contrôle croisé. Toute référence humaine qui manque (double notation incomplète,
 * désaccord sans arbitre) lève `ReferenceHumaineIndefinie` : aucune référence n'est inventée.
 *
 * D25 (1) de l'auteur : une réponse dont la note humaine retenue est « indeterminee » n'a pas de
 * place parmi les trois catégories ; elle est écartée du kappa de chaque juge, et leur nombre est
 * publié (`run.json#/indeterminees_echantillon_humain`) : l'échantillon n'est pas amputé en silence.
 * Toutes écartées : aucune réponse comparable, kappa indéfini, critère rouge.
 *
 * D31 (2) de l'auteur : une réponse de l'échantillon qu'un juge a renvoyée vers l'humain (D30 (2),
 * `volume/renvois/`) n'a pas de note de ce juge ; elle est écartée du kappa de CE juge seulement, et
 * leur nombre est publié par juge (`juges[].renvois_ecartes_kappa_echantillon`). Une note de juge
 * absente SANS renvoi reste une erreur (`NotationDeJugeIntrouvable`). Les renvois d'un juge retiré
 * n'entrent nulle part (D13) : il n'a pas de kappa. Tout écarté : `aucune_reponse_comparable`, rouge.
 *
 * D32 de l'auteur : un refus de l'API n'est soumis à aucun juge, la règle le note (`regle-refus.ts`).
 * Une réponse de l'échantillon qui porte cette notation par règle n'a de note d'aucun juge ; par la
 * raison de D31 (2) (aucun accord ne se mesure là où le juge n'a rendu aucune note), elle est
 * écartée du kappa de CHAQUE juge, avant toute lecture de sa référence humaine, et leur nombre est
 * publié une fois pour le run (`run.json#/refus_api_echantillon_humain`), comme D25 (1). Une
 * notation ou un renvoi de juge sur un tel refus lève `RefusNoteParUnJuge`.
 */

import {
  CATEGORIES_DE_JUGE,
  categorieHumaineRetenue,
  categoriePourKappa,
  ecarterNonClassees,
  kappaCategoriePrimaire,
  type CategorieDeJuge,
  type MotifKappaIndefini,
} from "../../analysis/kappa-categorie-primaire.ts";
import type { CategorieRetenue, MotifNotation, Ulid } from "../../analysis/types.ts";
import { comptesKappa, type PaireCategories } from "../../validation/domaine/kappa.ts";
import { JugeIndetermine } from "../notation/decision.ts";
import { estNotationParRegle } from "../notation/regle-refus.ts";
import type { JugeDuRun, NotationIndividuelle, RenvoiHumain } from "../notation/types.ts";

/** Les trois catégories primaires qu'un juge peut rendre (§7), dans un ordre figé : celles de `analysis/`. */
export const CATEGORIES_KAPPA_ECHANTILLON = CATEGORIES_DE_JUGE;
export type CategorieKappaEchantillon = CategorieDeJuge;

/** `schema/run.schema.json#/$defs/motif_kappa_echantillon_indefini`. */
export type MotifKappaEchantillonIndefini = MotifKappaIndefini;

/** §12 : « ≥ 0,75 », en fraction exacte ; 0,75 exactement passe. */
export const SEUIL_KAPPA_ECHANTILLON = { numerateur: 3, denominateur: 4 } as const;

export interface KappaDeJuge {
  readonly juge_id: string;
  /** `null` quand le kappa n'est pas défini : `motif_indefini` dit pourquoi. */
  readonly kappa: number | null;
  readonly motif_indefini: MotifKappaEchantillonIndefini | null;
  /** Décidé en entiers sur les comptes du kappa ; faux pour un kappa indéfini. */
  readonly atteint_seuil: boolean;
  readonly n: number;
  /** D31 (2) : réponses de l'échantillon écartées de ce kappa parce que ce juge les a renvoyées. */
  readonly renvois_ecartes: number;
}

export class ReferenceHumaineIndefinie extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid, detail: string) {
    super(`Réponse ${reponse_id} de l'échantillon humain : ${detail} Le kappa de l'échantillon n'est pas calculé (D24) ; aucune référence n'est inventée.`);
    this.name = "ReferenceHumaineIndefinie";
    this.reponse_id = reponse_id;
  }
}

export class NotationDeJugeIntrouvable extends Error {
  constructor(juge_id: string, reponse_id: Ulid, nombre: number) {
    super(`Réponse ${reponse_id} de l'échantillon humain : ${nombre} notation(s) du juge retenu ${juge_id} au lieu d'une. Le kappa de l'échantillon n'est pas calculé (D24).`);
    this.name = "NotationDeJugeIntrouvable";
  }
}

export class RefusNoteParUnJuge extends Error {
  constructor(reponse_id: Ulid, nombre: number) {
    super(`Réponse ${reponse_id} de l'échantillon humain : notée par règle comme refus de l'API (D32), elle porte aussi ${nombre} notation(s) ou renvoi(s) de juge. Le kappa de l'échantillon n'est pas calculé.`);
    this.name = "RefusNoteParUnJuge";
  }
}

export interface EntreeKappaEchantillon {
  readonly juges: readonly JugeDuRun[];
  /** Les réponses de l'échantillon humain, rejouées par l'appelant. */
  readonly echantillon: readonly Ulid[];
  /** Les notations individuelles du volume ; seules celles de contexte `run` sont lues. */
  readonly notations: readonly NotationIndividuelle[];
  /** Les renvois de juge du volume (D30 (2)) ; seuls ceux de contexte `run` sont lus. */
  readonly renvois: readonly RenvoiHumain[];
}

export interface ResultatEchantillon {
  /** Un kappa par juge retenu, dans l'ordre de `run.json#/juges`. Les juges retirés n'en ont pas. */
  readonly kappas: readonly KappaDeJuge[];
  /**
   * D25 (1) : réponses de l'échantillon dont la note humaine retenue est « indeterminee », écartées
   * du kappa de chaque juge, publiées dans `run.json#/indeterminees_echantillon_humain`.
   */
  readonly indeterminees: number;
  /**
   * D64, D70 : réponses de l'échantillon dont la note humaine retenue ou la note d'un juge retenu est
   * « non classée, référence incomplète », écartées du kappa de chaque juge, publiées dans
   * `run.json#/non_classees_echantillon_humain`. Comptées avant les indéterminées.
   */
  readonly non_classees: number;
  /**
   * D32 : réponses de l'échantillon refusées par l'API, notées par règle et par aucun juge, écartées
   * du kappa de chaque juge, publiées dans `run.json#/refus_api_echantillon_humain`.
   */
  readonly refus_api: number;
}

interface Reference {
  readonly id: Ulid;
  readonly notations: readonly NotationIndividuelle[];
  readonly categorie: CategorieKappaEchantillon;
}

/** D25 (1) : la note humaine retenue indéterminée est écartée ; une non classée l'a déjà été (D70). */
function estComparable(reference: { readonly id: Ulid; readonly categorie: CategorieRetenue }): reference is { readonly id: Ulid; readonly categorie: CategorieKappaEchantillon } {
  return categoriePourKappa(reference.categorie, `Réponse ${reference.id} de l'échantillon`) !== "indeterminee";
}

export function kappasEchantillon(entree: EntreeKappaEchantillon): ResultatEchantillon {
  const parReponse = [...notationsParReponse(entree.echantillon, entree.notations)];
  const refus = parReponse.filter(([, notations]) => notations.some(estNotationParRegle));
  for (const [id, notations] of refus) exigerSansJuge(id, notations, entree.renvois);
  const notees = parReponse.filter(([, notations]) => !notations.some(estNotationParRegle));
  const toutes = notees.map(([id, notations]) => ({ id, notations, categorie: referenceHumaine(id, notations) }));
  const retenus = entree.juges.filter((juge) => !juge.retire);
  // D64, D70 : une réponse dont la référence humaine ou un juge retenu est non classée sort de tout kappa, comptée à part.
  const { gardes, non_classees } = ecarterNonClassees(toutes, (r) => [r.categorie, ...categoriesDesJuges(r.notations, retenus)]);
  const references = gardes.filter((r): r is Reference => estComparable(r));
  const kappas = retenus.map((juge) => kappaAvecRenvois(juge.juge_id, references, renvoyesPar(juge.juge_id, entree.renvois)));
  return { kappas, indeterminees: gardes.length - references.length, non_classees, refus_api: refus.length };
}

/** Les catégories rendues par les juges retenus sur une réponse. */
function categoriesDesJuges(notations: readonly NotationIndividuelle[], retenus: readonly JugeDuRun[]): readonly CategorieRetenue[] {
  const ids = new Set(retenus.map((juge) => juge.juge_id));
  return notations.filter((n) => n.notateur.type === "juge" && ids.has(n.notateur.id)).map((n) => n.categorie);
}

/** D32 : un refus noté par règle n'a ni notation ni renvoi de juge, même d'un juge retiré. */
function exigerSansJuge(reponse_id: Ulid, notations: readonly NotationIndividuelle[], renvois: readonly RenvoiHumain[]): void {
  const juges = notations.filter((n) => n.notateur.type === "juge").length + renvois.filter((r) => r.contexte === "run" && r.objet_note.id === reponse_id).length;
  if (juges > 0) throw new RefusNoteParUnJuge(reponse_id, juges);
}

/** Les notations de contexte `run` de chaque réponse de l'échantillon, dans l'ordre de l'échantillon. */
function notationsParReponse(echantillon: readonly Ulid[], notations: readonly NotationIndividuelle[]): ReadonlyMap<Ulid, readonly NotationIndividuelle[]> {
  const index = new Map<Ulid, NotationIndividuelle[]>(echantillon.map((id) => [id, []]));
  for (const notation of notations) {
    if (notation.contexte !== "run" || notation.objet_note.type !== "reponse") continue;
    index.get(notation.objet_note.id)?.push(notation);
  }
  return index;
}

function humainesSous(notations: readonly NotationIndividuelle[], motif: MotifNotation): readonly NotationIndividuelle[] {
  return notations.filter((n) => n.notateur.type === "humain" && n.motif_notation === motif);
}

/**
 * La catégorie de la note humaine retenue d'une réponse de l'échantillon (D24 (1)) : celle des deux
 * humains s'ils s'accordent, sinon celle de l'arbitre. « indeterminee » est une référence lue comme
 * les autres ; c'est l'appelant qui l'écarte du kappa (D25 (1)). Exportée pour ses tests.
 */
export function referenceHumaine(reponse_id: Ulid, notations: readonly NotationIndividuelle[]): CategorieRetenue {
  const double = humainesSous(notations, "echantillon_aleatoire_10");
  const [premiere, seconde] = double;
  if (premiere === undefined || seconde === undefined || double.length !== 2) {
    throw new ReferenceHumaineIndefinie(reponse_id, `${double.length} notation(s) humaine(s) d'échantillon au lieu de deux (double notation incomplète).`);
  }
  const retenue = categorieHumaineRetenue(premiere, seconde, null);
  if (retenue !== null) return retenue;
  return arbitreDe(reponse_id, notations).categorie;
}

function arbitreDe(reponse_id: Ulid, notations: readonly NotationIndividuelle[]): NotationIndividuelle {
  const arbitrages = humainesSous(notations, "arbitrage_echantillon_10");
  const [arbitre] = arbitrages;
  if (arbitre === undefined || arbitrages.length !== 1) {
    throw new ReferenceHumaineIndefinie(reponse_id, `les deux humains divergent et ${arbitrages.length} arbitrage(s) au lieu d'un (§7 : le troisième humain tranche).`);
  }
  return arbitre;
}

/** Les réponses que ce juge a renvoyées vers l'humain, contexte `run`. */
function renvoyesPar(juge_id: string, renvois: readonly RenvoiHumain[]): ReadonlySet<Ulid> {
  return new Set(renvois.filter((r) => r.contexte === "run" && r.notateur.id === juge_id).map((r) => r.objet_note.id));
}

/** D31 (2) : les réponses renvoyées par ce juge sont écartées de son kappa, et comptées. */
function kappaAvecRenvois(juge_id: string, references: readonly Reference[], renvoyes: ReadonlySet<Ulid>): KappaDeJuge {
  const gardees = references.filter((r) => !renvoyes.has(r.id));
  for (const r of references.filter((ref) => renvoyes.has(ref.id))) exigerSansNotation(juge_id, r);
  const kappa = kappaDuJuge(juge_id, gardees.map((r) => ({ a: categorieDuJuge(juge_id, r.id, r.notations), b: r.categorie })));
  return { ...kappa, renvois_ecartes: references.length - gardees.length };
}

/** Un juge qui porte à la fois un renvoi et une notation sur la réponse : deux issues, aucune n'est choisie. */
function exigerSansNotation(juge_id: string, reference: Reference): void {
  const siennes = reference.notations.filter((n) => n.notateur.type === "juge" && n.notateur.id === juge_id);
  if (siennes.length > 0) throw new NotationDeJugeIntrouvable(juge_id, reference.id, siennes.length + 1);
}

/** La notation du juge retenu sur la réponse : exactement une, jamais « indeterminee » (§7). */
function categorieDuJuge(juge_id: string, reponse_id: Ulid, notations: readonly NotationIndividuelle[]): CategorieKappaEchantillon {
  const siennes = notations.filter((n) => n.notateur.type === "juge" && n.notateur.id === juge_id);
  const [notation] = siennes;
  if (notation === undefined || siennes.length !== 1) throw new NotationDeJugeIntrouvable(juge_id, reponse_id, siennes.length);
  const categorie = categoriePourKappa(notation.categorie, `Réponse ${reponse_id} de l'échantillon, juge ${juge_id}`);
  if (categorie === "indeterminee") throw new JugeIndetermine(notation);
  return categorie;
}

function kappaDuJuge(juge_id: string, paires: readonly PaireCategories<CategorieKappaEchantillon>[]): Omit<KappaDeJuge, "renvois_ecartes"> {
  const resultat = kappaCategoriePrimaire(paires, CATEGORIES_KAPPA_ECHANTILLON);
  return { juge_id, ...resultat, atteint_seuil: resultat.kappa !== null && atteintSeuil(paires) };
}

/**
 * κ ≥ 3/4 décidé en entiers : `κ = (A·n − B) / (n² − B)` avec `n² − B > 0` (kappa défini), donc
 * `κ ≥ 3/4 ⇔ 4·(A·n − B) ≥ 3·(n² − B)`. Le flottant de `kappaCohen` est publié, il ne décide pas.
 */
function atteintSeuil(paires: readonly PaireCategories<CategorieKappaEchantillon>[]): boolean {
  const { n, accords, attendus } = comptesKappa(paires, CATEGORIES_KAPPA_ECHANTILLON);
  const { numerateur, denominateur } = SEUIL_KAPPA_ECHANTILLON;
  return denominateur * (accords * n - attendus) >= numerateur * (n * n - attendus);
}
