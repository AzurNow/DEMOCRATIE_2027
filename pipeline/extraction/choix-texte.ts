/**
 * Choix du texte canonique qu'une extraction lit (décision D52 (4) ; docs/DETTE.md, 2026-09-23,
 * point 1).
 *
 * Une source peut avoir plusieurs fiches d'extraction de texte
 * (`staging/extractions/<sha256_source>/<texte_sha256>.json`, docs/CONTRATS.md §1.1) : une montée de
 * version de pymupdf, ou une nouvelle règle de rendu HTML, ajoute un texte à côté du premier. La
 * règle : l'extraction lit la fiche produite par l'extracteur **épinglé par le code** — outil,
 * version et options comparés en entier, car une option différente peut rendre un autre texte.
 * L'épinglage est une entrée de cette fonction, jamais une constante cachée. Aucune fiche de cet
 * extracteur, ou plus d'une : la source est refusée par une erreur nommée, sans repli sur une
 * autre version ni sur la plus ancienne.
 *
 * Chaque fiche est confrontée à `extraction-texte.schema.json` à l'entrée.
 *
 * Que l'épinglage inscrit dans une entrée soit encore celui que le code a en service est vérifié
 * avant, par `entrees.ts` contre `pipeline/collecte/textes/epinglage.json` (D56 (3)) ; la date des
 * fiches n'entre dans aucun des deux contrôles.
 */

import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";

export interface ExtracteurEpingle {
  readonly outil: string;
  readonly version: string;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface PageFiche {
  readonly numero: number;
  readonly debut: number;
  readonly fin: number;
}

export interface FicheExtraction {
  readonly sha256_source: string;
  readonly texte_sha256: string;
  readonly longueur: number;
  readonly date_extraction: string;
  readonly extracteur: ExtracteurEpingle;
  readonly pages?: readonly PageFiche[];
  readonly encodage?: { readonly nom: string; readonly origine: string };
  readonly vtt_sha256?: string;
}

function decrire(extracteur: ExtracteurEpingle): string {
  return canoniser(extracteur);
}

export class AucunTexteEpingle extends Error {
  constructor(epingle: ExtracteurEpingle, trouves: readonly ExtracteurEpingle[]) {
    super(
      `Aucune fiche d'extraction produite par l'extracteur épinglé ${decrire(epingle)} ; fiches trouvées : ` +
        `${trouves.length === 0 ? "aucune" : trouves.map(decrire).join(", ")}. La source est refusée, sans repli ` +
        `(décision D52 (4)).`,
    );
    this.name = "AucunTexteEpingle";
  }
}

export class PlusieursTextesEpingles extends Error {
  constructor(epingle: ExtracteurEpingle, textes: readonly string[]) {
    super(
      `${textes.length} fiches d'extraction produites par l'extracteur épinglé ${decrire(epingle)} ` +
        `(textes ${textes.join(", ")}) : aucune n'est choisie, la source est refusée (décision D52 (4)).`,
    );
    this.name = "PlusieursTextesEpingles";
  }
}

export class FicheDUneAutreSource extends Error {
  constructor(fiche: FicheExtraction, sha256_source: string) {
    super(`Fiche d'extraction du texte ${fiche.texte_sha256} : elle décrit le document ${fiche.sha256_source}, pas ${sha256_source}.`);
    this.name = "FicheDUneAutreSource";
  }
}

function validerFiches(fiches: readonly unknown[], sha256_source: string): readonly FicheExtraction[] {
  const lues = fiches.map((fiche, rang) => valider<FicheExtraction>("extraction-texte", fiche, `fiche d'extraction n° ${rang + 1}`));
  const etrangere = lues.find((fiche) => fiche.sha256_source !== sha256_source);
  if (etrangere !== undefined) throw new FicheDUneAutreSource(etrangere, sha256_source);
  return lues;
}

export function choisirFiche(fiches: readonly unknown[], epingle: ExtracteurEpingle, sha256_source: string): FicheExtraction {
  const lues = validerFiches(fiches, sha256_source);
  const cle = canoniser(epingle);
  const retenues = lues.filter((fiche) => canoniser(fiche.extracteur) === cle);
  const [seule, ...autres] = retenues;
  if (seule === undefined) throw new AucunTexteEpingle(epingle, lues.map((fiche) => fiche.extracteur));
  if (autres.length > 0) throw new PlusieursTextesEpingles(epingle, retenues.map((fiche) => fiche.texte_sha256));
  return seule;
}
