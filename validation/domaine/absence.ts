/**
 * Items d'absence : la recherche qui en fonde un, et les nouvelles sources T1 de sa revérification
 * (§4, protocole 0.24, D59 (10) et (11)). Fonctions pures : rien n'est lu ni écrit ici.
 *
 * (10) « Cette recherche ne trouve rien quand aucun item P ni O du candidat sur la mesure n'est
 * vérifié et que la double extraction, passée sur le corpus examiné, ne propose aucune position du
 * candidat sur la mesure. » Une proposition est un item P ou O que l'extraction a déposé, quel que
 * soit son accord : un « désaccord d'existence » (un seul extracteur l'a vu) est une proposition, et
 * la recherche n'est donc pas négative. Une source du corpus sans double extraction extraite (jamais
 * passée, ou refusée faute d'extraction double) laisse la recherche non faite : elle n'est jamais
 * lue comme « rien trouvé ».
 *
 * (0.27, D62 #233 (3) et D67) « La recherche ne voit une proposition sur la mesure que si elle y est
 * rattachée : un item A n'est promu qu'une fois rattachées à leur mesure les propositions de
 * position du candidat déposées sur le corpus examiné. Aucun item A n'est créé quand un item T3 du
 * candidat, « à confirmer », porte sur la mesure. » `rechercheAbsence` ne lit que le `mesure_id`
 * des propositions : son « rien trouvé » ne vaut que si `refusPromotionAbsence` ne refuse rien.
 * Cette seconde règle vit en un seul endroit, `refusPromotionAbsence`, appelée par `pnpm promote`.
 *
 * (11) « Une nouvelle source T1 est une source T1 du candidat collectée après la dernière
 * revérification de l'item, ou, s'il n'a jamais été revérifié, après la date d'examen de son
 * corpus. » « Après » est strict : une source collectée à l'instant même de la borne n'est pas
 * nouvelle. Les instants sont comparés comme instants (décalage horaire obligatoire), jamais comme
 * chaînes. La revérification est confirmée par un seul annotateur : `Reverification.confirme_par`.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { instantDe } from "../../pipeline/questions/reponse-attendue.ts";
import type { RegistreRattachementsItem } from "./rattachements-item.ts";
import type { RegistreRelecturesMesure } from "./relectures-mesure.ts";
import type { BlocAbsence, Item, Source } from "./types.ts";

/** Une règle propre aux items A, appelée sur un item d'un autre type : nommé, jamais ignoré. */
export class PasUnItemAbsence extends Error {
  constructor(item: Item, regle: string) {
    super(`Item ${item.id} de type ${item.type} : ${regle} ne s'applique qu'à un item A (§4).`);
    this.name = "PasUnItemAbsence";
  }
}

/* ------------------------------------------------------------------- (10) */

/** L'issue d'une double extraction sur une source (`journal-extraction.schema.json`, `issue.statut`). */
export interface ExtractionPassee {
  readonly sha256_source: string;
  readonly statut: "extraite" | "refusee";
}

export interface RechercheAbsence {
  readonly candidat_id: string;
  readonly mesure_id: string;
  /** `absence.corpus_examine` de l'item A envisagé. */
  readonly corpus_examine: readonly { readonly sha256: string }[];
  /** Le jeu de données publié (`data/items/`). */
  readonly items_publies: readonly Item[];
  /** Les items déposés par la double extraction (`staging/items/`), tels que déposés. */
  readonly propositions: readonly Item[];
  /** Les journaux d'extraction des sources du candidat. */
  readonly extractions: readonly ExtractionPassee[];
}

export type ResultatRecherche =
  | { readonly issue: "aucune_position" }
  | {
      readonly issue: "position_trouvee";
      readonly items_verifies: readonly string[];
      readonly propositions: readonly string[];
    }
  | { readonly issue: "extraction_incomplete"; readonly sources: readonly string[] };

const TYPES_POSITION: ReadonlySet<Item["type"]> = new Set(["P", "O"]);

function porteUnePosition(item: Item, recherche: RechercheAbsence): boolean {
  return (
    TYPES_POSITION.has(item.type) && item.candidat_id === recherche.candidat_id && item.mesure_id === recherche.mesure_id
  );
}

function identifiantsTries(items: readonly Item[]): readonly string[] {
  return items.map((item) => item.id).sort(comparerChaines);
}

function sourcesSansExtraction(recherche: RechercheAbsence): readonly string[] {
  const extraites = new Set(
    recherche.extractions.filter((extraction) => extraction.statut === "extraite").map((extraction) => extraction.sha256_source),
  );
  const manquantes = recherche.corpus_examine.map((source) => source.sha256).filter((sha256) => !extraites.has(sha256));
  return [...new Set(manquantes)].sort(comparerChaines);
}

/**
 * N'a pas encore d'appelant. Une proposition non rattachée à sa mesure lui est invisible :
 * `aucune_position` ne fonde un item A qu'avec `refusPromotionAbsence` vide (§4, 0.27).
 */
export function rechercheAbsence(recherche: RechercheAbsence): ResultatRecherche {
  const verifies = recherche.items_publies.filter(
    (item) => item.statut_validation === "verifie" && porteUnePosition(item, recherche),
  );
  const proposes = recherche.propositions.filter((item) => porteUnePosition(item, recherche));
  if (verifies.length > 0 || proposes.length > 0) {
    return { issue: "position_trouvee", items_verifies: identifiantsTries(verifies), propositions: identifiantsTries(proposes) };
  }
  const manquantes = sourcesSansExtraction(recherche);
  if (manquantes.length > 0) return { issue: "extraction_incomplete", sources: manquantes };
  return { issue: "aucune_position" };
}

/* ------------------------------------------------- promotion d'un item A (0.27) */

/**
 * Ce que la promotion d'un item A confronte à la règle du §4 (protocole 0.27, D62 #233 (3), D67).
 * `items` : les items connus, de `staging/items/` et de `data/items/`, chacun une seule fois.
 */
export interface PromotionAbsence {
  readonly item: Item;
  readonly items: readonly Item[];
  readonly relectures: RegistreRelecturesMesure;
  readonly rattachements: RegistreRattachementsItem;
}

/**
 * - `corpus_vide` : l'item A n'examine aucune source (`item.schema.json` exige `minItems: 1`) ;
 * - `propositions_non_rattachees` : des propositions de position du candidat sur le corpus examiné
 *   ne sont pas rattachées à leur mesure ;
 * - `item_t3_sur_la_mesure` : un item T3 du candidat, « à confirmer », porte sur la mesure.
 */
export type RefusPromotionAbsence =
  | { readonly motif: "corpus_vide" }
  | { readonly motif: "propositions_non_rattachees"; readonly items: readonly string[] }
  | { readonly motif: "item_t3_sur_la_mesure"; readonly items: readonly string[] };

/** Les empreintes des sources qui portent le contenu d'un item P ou O, telles qu'il les cite. */
function sourcesDuContenu(item: Item): readonly string[] {
  const etats = [item.assertion, item.obsolescence?.etat_anterieur, item.obsolescence?.etat_posterieur];
  return etats.flatMap((etat) => (etat === undefined ? [] : [etat.source.sha256]));
}

/**
 * Rattachée : l'auteur a arrêté la mesure que la proposition cite. Soit le registre des relectures
 * porte une relecture de cette mesure (`pnpm mesures --relire`, en quelque version que ce soit),
 * soit le registre des rattachements porte cet item vers cette mesure (`pnpm mesures --rattacher`).
 * Une proposition qui cite encore la mesure que l'extraction lui a créée, jamais relue, ne l'est pas.
 */
function estRattachee(item: Item, promotion: PromotionAbsence): boolean {
  return (
    promotion.relectures.some((relecture) => relecture.mesure_id === item.mesure_id) ||
    promotion.rattachements.some((entree) => entree.item_id === item.id && entree.mesure_apres === item.mesure_id)
  );
}

/** P ou O du candidat, dont une source au moins est dans le corpus examiné, quel que soit son statut. */
function propositionsSurLeCorpus(promotion: PromotionAbsence, absence: BlocAbsence): readonly Item[] {
  const corpus = new Set(absence.corpus_examine.map((source) => source.sha256));
  return promotion.items.filter(
    (item) =>
      TYPES_POSITION.has(item.type) &&
      item.candidat_id === promotion.item.candidat_id &&
      sourcesDuContenu(item).some((sha256) => corpus.has(sha256)),
  );
}

/** Un item T3 est un item « à confirmer » (§4 ; `pipeline/extraction/assemblage.ts:STATUT_INITIAL`). */
function itemsT3SurLaMesure(promotion: PromotionAbsence): readonly Item[] {
  const { item } = promotion;
  return promotion.items.filter(
    (autre) =>
      autre.id !== item.id &&
      autre.statut_validation === "a_confirmer" &&
      autre.candidat_id === item.candidat_id &&
      autre.mesure_id === item.mesure_id,
  );
}

/**
 * §4 (0.27) : « un item A n'est promu qu'une fois rattachées à leur mesure les propositions de
 * position du candidat déposées sur le corpus examiné. Aucun item A n'est créé quand un item T3 du
 * candidat, « à confirmer », porte sur la mesure. » Liste vide : l'item est promouvable au regard de
 * cette règle. Une proposition est un item déposé, quel que soit son statut ou son test verbatim :
 * une citation rejetée par le test verbatim n'est jamais déposée et n'y figure donc pas (D62
 * #233 (4), ouvert).
 */
export function refusPromotionAbsence(promotion: PromotionAbsence): readonly RefusPromotionAbsence[] {
  const absence = promotion.item.absence;
  if (promotion.item.type !== "A" || absence === undefined) throw new PasUnItemAbsence(promotion.item, "la règle de promotion d'un item d'absence");
  if (absence.corpus_examine.length === 0) return [{ motif: "corpus_vide" }];
  const refus: RefusPromotionAbsence[] = [];
  const orphelines = propositionsSurLeCorpus(promotion, absence).filter((item) => !estRattachee(item, promotion));
  if (orphelines.length > 0) refus.push({ motif: "propositions_non_rattachees", items: identifiantsTries(orphelines) });
  const t3 = itemsT3SurLaMesure(promotion);
  if (t3.length > 0) refus.push({ motif: "item_t3_sur_la_mesure", items: identifiantsTries(t3) });
  return refus;
}

/* ------------------------------------------------------------------- (11) */

/** Ce qu'il faut d'une source collectée (`fiche-source.schema.json`) pour dire si elle est nouvelle. */
export interface SourceCollectee {
  readonly candidat_id: string;
  readonly tier: Source["tier"];
  readonly sha256: string;
  readonly date_collecte: string;
}

/** La dernière revérification en instant, ou à défaut d'aucune, la date d'examen du corpus. */
function borne(absence: BlocAbsence): number {
  const instants = absence.reverifications.map((reverification) => instantDe(reverification.date));
  if (instants.length === 0) return instantDe(absence.date_examen);
  return Math.max(...instants);
}

export function nouvellesSourcesT1(item: Item, sources: readonly SourceCollectee[]): readonly SourceCollectee[] {
  const absence = item.absence;
  if (item.type !== "A" || absence === undefined) throw new PasUnItemAbsence(item, "la recherche de nouvelles sources T1");
  const depuis = borne(absence);
  return sources.filter(
    (source) =>
      source.tier === "T1" && source.candidat_id === item.candidat_id && instantDe(source.date_collecte) > depuis,
  );
}
