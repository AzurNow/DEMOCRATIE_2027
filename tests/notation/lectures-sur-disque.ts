/**
 * Aides des tests de l'écriture des verdicts de lecture (D87) : des lectures affichées de comparateur
 * et leurs notations humaines, écrites sur le disque d'un run comme la collecte et l'écran de notation
 * humaine les écriraient. Aucun contenu réel : l'exemple valide de `schema/exemples/`, réidentifié.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import type { LectureComparateur, MotifNotation, ReferenceItem } from "../../analysis/types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { MOTIF_ARBITRAGE_COMPARATEUR, MOTIF_DOUBLE_NOTATION_COMPARATEUR } from "../../pipeline/notation/lectures-comparateur.ts";
import type { DepotNotation } from "../../pipeline/notation/stockage.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "../analysis/fabriques.ts";
import { notationHumaine } from "./fabriques.ts";
import { ecrireJson } from "./run-fictif.ts";

type Surcharges = Parameters<typeof notationHumaine>[2];

/** Inexacte, motif et extrait fixés : deux humains qui la donnent ont une note commune. */
export const INEXACTE: Surcharges = {
  categorie: "inexacte",
  motif_inexactitude: "position_opposee",
  extrait_justificatif: { provenance: "reponse", texte: "position contraire", verifie_deterministe: true },
};
export const EXACTE: Surcharges = { categorie: "exacte" };

/** L'épingle d'un item imposé par le test, quand le run n'en fige pas : version 1, empreinte tirée de l'identifiant. */
function epingleImposee(item_id: string): ReferenceItem {
  return { item_id, item_version: 1, item_empreinte: createHash("sha256").update(item_id).digest("hex") };
}

/**
 * Les lectures affichées du run, rangées par identifiant : une par item P de référence (candidats
 * interrogés, à l'épingle que le run a figée, ou `items` quand le run n'en fige pas) et par
 * comparateur inclus.
 */
export function poserLecturesAffichees(repertoire_run: string, items_imposes?: readonly string[]): readonly LectureComparateur[] {
  const run = lireRunJson(repertoire_run);
  const exemple = JSON.parse(readFileSync(join(RACINE_PROJET, "schema", "exemples", "lecture-comparateur", "valide-01-position-affichee.json"), "utf8")) as object;
  const items = items_imposes?.map(epingleImposee) ?? run.perimetre.candidats.filter((c) => c.interroge).flatMap((c) => c.items_p_au_gel);
  const comparateurs = run.perimetre.outils.filter((o) => o.famille === "comparateur" && o.inclus).map((o) => o.outil_id);
  const dossier = dispositionRunNote(repertoire_run).lectures_comparateur;
  mkdirSync(dossier, { recursive: true });
  const lectures = comparateurs.flatMap((outil_id) =>
    items.map((reference_item) => {
      const item_id = reference_item.item_id;
      const lecture = { ...exemple, id: ulid(`d87-lecture-${outil_id}-${item_id}`), run_id: run.id, outil_id, reference_item };
      return valider<LectureComparateur>("lecture-comparateur", lecture, `lecture affichée ${item_id}`);
    }),
  );
  for (const lecture of lectures) ecrireJson(join(dossier, `${lecture.id}.json`), lecture);
  return [...lectures].sort((a, b) => comparerChaines(a.id, b.id));
}

/** Une notation humaine à l'aveugle d'une lecture, écrite par le dépôt de la notation (validée au schéma). */
function noter(depot: DepotNotation, lecture: LectureComparateur, annotateur: string, motif: MotifNotation, surcharges: Surcharges): NotationIndividuelle {
  const { version_charge: _sans, ...humaine } = notationHumaine(annotateur, motif, { run_id: lecture.run_id, objet_note: { type: "lecture_comparateur", id: lecture.id }, ...surcharges });
  const notation = { ...humaine, id: ulid(`d87-${annotateur}-${motif}-${lecture.id}`) };
  depot.ecrireNotation(notation);
  return notation;
}

export const doubleNotation = (depot: DepotNotation, lecture: LectureComparateur, annotateur: string, surcharges: Surcharges = EXACTE): NotationIndividuelle =>
  noter(depot, lecture, annotateur, MOTIF_DOUBLE_NOTATION_COMPARATEUR, surcharges);

export const arbitrage = (depot: DepotNotation, lecture: LectureComparateur, annotateur: string, surcharges: Surcharges = EXACTE): NotationIndividuelle =>
  noter(depot, lecture, annotateur, MOTIF_ARBITRAGE_COMPARATEUR, surcharges);
