/**
 * Les entrées de `pnpm extraire` (§4, décision D52, PR 3 du lot extraction).
 *
 * - `listerEntrees` : les fichiers `<staging>/entrees-extraction/<cle_source>/<sha256>.json` écrits
 *   par `pnpm extraction:entrees` (Python, `pipeline/collecte/entrees_extraction.py`), triés sur leur
 *   chemin : deux lancements sur les mêmes fichiers les traitent dans le même ordre.
 * - `lireEntree` : un fichier, validé contre `schema/entree-extraction.schema.json`, et dont le
 *   chemin nomme bien la source qu'il décrit.
 * - `materiauDe` : tout ce que le cœur lit pour cette source. Les fiches d'extraction du contenu
 *   (`<staging>/extractions/<sha256>/*.json`, telles que lues), la fiche choisie par la seule règle
 *   `choix-texte.ts:choisirFiche` (D52 (4), extracteur épinglé inscrit dans l'entrée), le bloc
 *   `source` de son texte, le texte canonique relu sous son empreinte, et le `.vtt` d'un
 *   enregistrement. Toute incohérence est une erreur nommée : la source n'est pas traitée, rien
 *   n'est écrit pour elle. Avant tout, l'épinglage de l'entrée est comparé à celui que le code a
 *   en service (`epinglage-en-service.ts`, D56 (3)) : différent, l'entrée est périmée
 *   (`EpinglageExtracteurPerime`) et refusée plutôt que lue avec l'ancien texte.
 *
 * Lecture seule ; les textes et transcriptions passent par les lecteurs de l'interface de validation
 * (`validation/io/staging.ts`), qui revérifient l'empreinte d'un texte à chaque lecture.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import type { Source } from "../../validation/domaine/types.ts";
import { lireTexteCanonique, lireTranscription } from "../../validation/io/staging.ts";
import { choisirFiche, type ExtracteurEpingle, type FicheExtraction } from "./choix-texte.ts";
import { decrireEnService, estEnService, type EpinglageEnService } from "./epinglage-en-service.ts";
import type { TexteDesigne } from "./renvoi.ts";

export const REPERTOIRE_ENTREES = "entrees-extraction";
const REPERTOIRE_FICHES = "extractions";

/** `schema/entree-extraction.schema.json`, champ pour champ. */
export interface EntreeFichier {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly candidat_id: string;
  readonly extracteur_epingle: ExtracteurEpingle;
  readonly sources: Readonly<Record<string, Source>>;
}

/** Une entrée lue, et la clé qui la désigne dans `--source` et dans le bilan. */
export interface EntreeLue {
  readonly cle: string;
  readonly entree: EntreeFichier;
}

/** Ce que le cœur lit pour une source, la fiche déjà choisie. */
export interface Materiau {
  readonly fiche: FicheExtraction;
  readonly fiches: readonly unknown[];
  readonly source: Source;
  readonly texte: string;
  readonly vtt: string | null;
}

/** Une incohérence des entrées d'une source : nommée, la source n'est pas traitée. */
export class EntreeExtractionIncoherente extends Error {
  constructor(cle: string, detail: string) {
    super(`Source ${cle} : ${detail}`);
    this.name = "EntreeExtractionIncoherente";
  }
}

/**
 * L'entrée épingle un extracteur de texte qui n'est pas celui que le code a en service
 * (`pipeline/collecte/textes/epinglage.json`, D56 (3), constat 4 de la revue du 2026-10-17) :
 * autre outil, version ou jeu d'options, que la version en service soit plus récente (montée de
 * version, `pnpm textes` relancé ou non) ou plus ancienne (retour arrière). Lire l'ancien texte
 * contredirait le §4. `pnpm extraction:entrees` ne réécrit jamais une entrée déjà présente
 * (`EntreeDivergente`, `pipeline/collecte/entrees_extraction.py`), relancer cette commande ne suffit
 * donc pas ; l'entrée se régénère en supprimant le fichier périmé sous `entrees-extraction/`, à la main.
 */
export class EpinglageExtracteurPerime extends Error {
  constructor(cle: string, inscrit: ExtracteurEpingle, enService: string) {
    super(
      `Source ${cle} : l'entrée épingle ${JSON.stringify(inscrit)}, mais l'extracteur de texte en service ` +
        `dans le code est ${enService} (pipeline/collecte/textes/epinglage.json, §4, D56 (3)). Relancer ` +
        `pnpm textes si besoin, puis pnpm extraction:entrees après avoir supprimé l'entrée périmée.`,
    );
    this.name = "EpinglageExtracteurPerime";
  }
}

/** Les clés `<cle_source>/<sha256>` des entrées présentes, triées. */
export function listerEntrees(staging: string): readonly string[] {
  const racine = join(staging, REPERTOIRE_ENTREES);
  if (!existsSync(racine)) return [];
  return readdirSync(racine)
    .sort()
    .flatMap((cle_source) =>
      readdirSync(join(racine, cle_source))
        .filter((nom) => nom.endsWith(".json"))
        .sort()
        .map((nom) => `${cle_source}/${nom.slice(0, -".json".length)}`),
    );
}

function lireJson(chemin: string, cle: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  } catch (erreur) {
    throw new EntreeExtractionIncoherente(cle, `${chemin} illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
}

export function lireEntree(staging: string, cle: string): EntreeLue {
  const chemin = join(staging, REPERTOIRE_ENTREES, `${cle}.json`);
  const entree = valider<EntreeFichier>("entree-extraction", lireJson(chemin, cle), chemin);
  const attendue = `${entree.cle_source}/${entree.sha256_source}`;
  if (attendue !== cle) throw new EntreeExtractionIncoherente(cle, `le fichier décrit la source ${attendue}, pas celle de son chemin.`);
  return { cle, entree };
}

/* ------------------------------------------------------------------ matériau */

/** Formats dont le texte est dérivé d'une transcription minutée (docs/CONTRATS.md §2). */
export const FORMATS_MINUTES: ReadonlySet<Source["format"]> = new Set(["audio", "video"]);

function fichesDe(staging: string, lue: EntreeLue): readonly unknown[] {
  const repertoire = join(staging, REPERTOIRE_FICHES, lue.entree.sha256_source);
  if (!existsSync(repertoire)) throw new EntreeExtractionIncoherente(lue.cle, `aucune fiche d'extraction sous ${repertoire}.`);
  return readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort()
    .map((nom) => lireJson(join(repertoire, nom), lue.cle));
}

function blocDe(lue: EntreeLue, fiche: FicheExtraction): Source {
  const bloc = lue.entree.sources[fiche.texte_sha256];
  if (bloc === undefined) {
    throw new EntreeExtractionIncoherente(
      lue.cle,
      `l'entrée ne porte aucun bloc source pour le texte ${fiche.texte_sha256} de l'extracteur épinglé (relancer pnpm extraction:entrees).`,
    );
  }
  return bloc;
}

function texteDe(staging: string, lue: EntreeLue, texte_sha256: string): string {
  const texte = lireTexteCanonique(staging, texte_sha256);
  if (texte === null) throw new EntreeExtractionIncoherente(lue.cle, `texte canonique ${texte_sha256} absent de ${join(staging, "textes")}.`);
  return texte;
}

function vttDe(staging: string, lue: EntreeLue, source: Source): string | null {
  if (!FORMATS_MINUTES.has(source.format)) return null;
  const vtt = lireTranscription(staging, lue.entree.sha256_source);
  if (vtt === null) throw new EntreeExtractionIncoherente(lue.cle, `transcription ${lue.entree.sha256_source}.vtt absente pour une source ${source.format}.`);
  return vtt;
}

/** L'entrée épingle un autre extracteur que celui en service : elle est périmée (D56 (3)). */
function exigerEpinglageEnService(lue: EntreeLue, enService: EpinglageEnService): void {
  const inscrit = lue.entree.extracteur_epingle;
  if (!estEnService(enService, inscrit)) throw new EpinglageExtracteurPerime(lue.cle, inscrit, decrireEnService(enService, inscrit.outil));
}

/**
 * Le texte que l'entrée désigne, par la seule règle `choisirFiche` sur l'extracteur qu'elle épingle,
 * et l'URL de son bloc source (D73 (9)) : lu avant le journal, qui est indexé par texte. L'épinglage
 * en service n'est pas comparé ici : une entrée journalisée sous un épinglage abandonné reste
 * sautée, comme avant, et n'est refusée par `materiauDe` que si elle doit être extraite.
 */
export function texteDesigne(staging: string, lue: EntreeLue): TexteDesigne {
  const fiche = choisirFiche(fichesDe(staging, lue), lue.entree.extracteur_epingle, lue.entree.sha256_source);
  return { sha256_source: lue.entree.sha256_source, texte_sha256: fiche.texte_sha256, url: blocDe(lue, fiche).url };
}

/**
 * Lève `EpinglageExtracteurPerime`, `AucunTexteEpingle`, `PlusieursTextesEpingles`,
 * `TexteCanoniqueAltere` ou `EntreeExtractionIncoherente`. L'épinglage est comparé à celui en
 * service avant toute lecture de fiche : une entrée périmée est refusée qu'une fiche plus récente
 * existe ou non, et une fiche plus récente d'un autre épinglage ne fait pas refuser une entrée à
 * jour (retour arrière de version).
 */
export function materiauDe(staging: string, lue: EntreeLue, enService: EpinglageEnService): Materiau {
  exigerEpinglageEnService(lue, enService);
  const fiches = fichesDe(staging, lue);
  const fiche = choisirFiche(fiches, lue.entree.extracteur_epingle, lue.entree.sha256_source);
  const source = blocDe(lue, fiche);
  return { fiche, fiches, source, texte: texteDe(staging, lue, fiche.texte_sha256), vtt: vttDe(staging, lue, source) };
}
