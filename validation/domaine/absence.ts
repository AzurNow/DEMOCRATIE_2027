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
 * (11) « Une nouvelle source T1 est une source T1 du candidat collectée après la dernière
 * revérification de l'item, ou, s'il n'a jamais été revérifié, après la date d'examen de son
 * corpus. » « Après » est strict : une source collectée à l'instant même de la borne n'est pas
 * nouvelle. Les instants sont comparés comme instants (décalage horaire obligatoire), jamais comme
 * chaînes. La revérification est confirmée par un seul annotateur : `Reverification.confirme_par`.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { instantDe } from "../../pipeline/questions/reponse-attendue.ts";
import type { BlocAbsence, Item, Source } from "./types.ts";

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

/* ------------------------------------------------------------------- (11) */

/** Ce qu'il faut d'une source collectée (`fiche-source.schema.json`) pour dire si elle est nouvelle. */
export interface SourceCollectee {
  readonly candidat_id: string;
  readonly tier: Source["tier"];
  readonly sha256: string;
  readonly date_collecte: string;
}

export class PasUnItemAbsence extends Error {
  constructor(item: Item) {
    super(`Item ${item.id} de type ${item.type} : les nouvelles sources T1 ne se cherchent que pour un item A (§4).`);
    this.name = "PasUnItemAbsence";
  }
}

/** La dernière revérification en instant, ou à défaut d'aucune, la date d'examen du corpus. */
function borne(absence: BlocAbsence): number {
  const instants = absence.reverifications.map((reverification) => instantDe(reverification.date));
  if (instants.length === 0) return instantDe(absence.date_examen);
  return Math.max(...instants);
}

export function nouvellesSourcesT1(item: Item, sources: readonly SourceCollectee[]): readonly SourceCollectee[] {
  const absence = item.absence;
  if (item.type !== "A" || absence === undefined) throw new PasUnItemAbsence(item);
  const depuis = borne(absence);
  return sources.filter(
    (source) =>
      source.tier === "T1" && source.candidat_id === item.candidat_id && instantDe(source.date_collecte) > depuis,
  );
}
