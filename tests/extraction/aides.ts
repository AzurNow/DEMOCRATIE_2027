/**
 * Aides des tests du cœur de l'extraction double (`pipeline/extraction/`, décision D52).
 *
 * Tout est fictif : candidats `candidat-a` et `candidat-b`, textes inventés, URL en `.invalid`.
 * Aucun contenu de candidat réel. Les horloges et les identifiants sont des ports déterministes :
 * deux appels avec les mêmes entrées rendent des octets identiques.
 */

import { createHash } from "node:crypto";
import type { EntreeExtraction, Ports } from "../../pipeline/extraction/extraction.ts";
import type { ExtracteurEpingle } from "../../pipeline/extraction/choix-texte.ts";
import type { MotifSortieIllisible, SortieModele } from "../../pipeline/extraction/types.ts";
import { longueurPointsDeCode } from "../../validation/domaine/normalisation.ts";
import type { Source } from "../../validation/domaine/types.ts";

export const MODELE_A = "modele-alpha-test";
export const MODELE_B = "modele-beta-test";
export const CANDIDAT = "candidat-a";
export const INSTANT = "2026-10-16T12:00:00+02:00";
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const SHA_SOURCE = "a".repeat(64);

export function sha256Texte(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/** Identifiants opaques en base 32 de Crockford, numérotés dans l'ordre des appels. */
export function ports(): Ports {
  let rang = 0;
  return {
    maintenant: () => INSTANT,
    nouvelUlid: () => {
      rang += 1;
      return `01J${String(rang).padStart(23, "0")}`;
    },
  };
}

export const PYMUPDF: ExtracteurEpingle = {
  outil: "pymupdf",
  version: "1.26.4",
  options: { mode: "text", drapeaux: 1 | 4 | 64, separateur_pages: "\f" },
};
export const HTML: ExtracteurEpingle = { outil: "html.parser", version: "3.12.7", options: { regle: "blocs-1" } };
export const WEBVTT: ExtracteurEpingle = { outil: "webvtt", version: "3.12.7", options: { regle: "vtt-1" } };

/** Intervalles des pages d'un texte joint par U+000C, séparateur exclu (docs/CONTRATS.md §1.1). */
export function pagesDe(pages: readonly string[]): { numero: number; debut: number; fin: number }[] {
  let debut = 0;
  return pages.map((page, rang) => {
    const longueur = longueurPointsDeCode(page);
    const intervalle = { numero: rang + 1, debut, fin: debut + longueur };
    debut += longueur + 1;
    return intervalle;
  });
}

export function fiche(
  texte: string,
  extracteur: ExtracteurEpingle,
  enPlus: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sha256_source: SHA_SOURCE,
    texte_sha256: sha256Texte(texte),
    longueur: longueurPointsDeCode(texte),
    date_extraction: "2026-10-01T09:00:00+02:00",
    extracteur,
    ...enPlus,
  };
}

export function sourcePdf(texte: string): Source {
  return {
    tier: "T1",
    url: "https://demonstration.invalid/programme.pdf",
    type_document: "programme_pdf",
    format: "pdf",
    sha256: SHA_SOURCE,
    texte_sha256: sha256Texte(texte),
    archive_url: "https://archive.invalid/web/20261001000000/programme.pdf",
    date_source: "2026-09-01",
    date_collecte: "2026-10-01T09:00:00+02:00",
    chemin_local: "archives/aa/programme.pdf",
    publication: "publique",
  };
}

export function sourceHtml(texte: string): Source {
  return {
    ...sourcePdf(texte),
    url: "https://demonstration.invalid/propositions",
    type_document: "site_officiel",
    format: "html",
    archive_url: "https://archive.invalid/web/20261001000000/propositions",
  };
}

export function sourceArticle(texte: string): Source {
  return { ...sourceHtml(texte), tier: "T3", type_document: "article_presse" };
}

export function sourceVideo(texte: string): Source {
  return {
    ...sourcePdf(texte),
    tier: "T2",
    url: "https://demonstration.invalid/entretien",
    type_document: "enregistrement_video",
    format: "video",
    archive_url: "https://archive.invalid/web/20261001000000/entretien",
    publication: "interne",
  };
}

/** Un item tel que le prompt demande au modèle de le rendre, dans `{"items": [...]}`. */
export function propose(citation: string, enPlus: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "P",
    candidat_id: CANDIDAT,
    mesure_proposee: { libelle: "Ouvrir les centres de santé le dimanche", theme: "sante" },
    position: "pour",
    citation_verbatim: citation,
    paraphrase: "Ouvrir les centres de santé le dimanche.",
    ...enPlus,
  };
}

export function sortie(...items: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ items });
}

/** La sortie lisible d'un modèle : le texte reçu, tel quel. */
export function lisible(texte: string): SortieModele {
  return { lisible: true, texte };
}

/** La sortie d'un modèle dont la réponse ne donne aucun texte, avec son motif (défaut : `lecture_illisible`) et sa raison. */
export function illisible(raison: string, motif: MotifSortieIllisible = "lecture_illisible"): SortieModele {
  return { lisible: false, motif, raison };
}

/** Une chaîne est la sortie lisible d'un modèle ; une `SortieModele` passe telle quelle. */
function sortieModele(brut: string | SortieModele): SortieModele {
  return typeof brut === "string" ? lisible(brut) : brut;
}

/** Une entrée complète pour une source HTML ; chaque test remplace ce qu'il vise. */
export function entreeHtml(texte: string, brutA: string | SortieModele, brutB: string | SortieModele): EntreeExtraction {
  return {
    configuration: { modeles: [MODELE_A, MODELE_B], version_prompt: "prompts/extraction-1.0.0" },
    extracteur_epingle: HTML,
    candidat_id: CANDIDAT,
    source: sourceHtml(texte),
    fiches: [fiche(texte, HTML, { encodage: { nom: "utf-8", origine: "content-type" } })],
    texte,
    vtt: null,
    sorties: new Map([
      [MODELE_A, sortieModele(brutA)],
      [MODELE_B, sortieModele(brutB)],
    ]),
    commit: COMMIT,
  };
}

export function entreePdf(pages: readonly string[], brutA: string, brutB: string): EntreeExtraction {
  const texte = pages.join("\f");
  return {
    ...entreeHtml(texte, brutA, brutB),
    extracteur_epingle: PYMUPDF,
    source: sourcePdf(texte),
    fiches: [fiche(texte, PYMUPDF, { pages: pagesDe(pages) })],
  };
}

export interface CueTest {
  readonly debut: string;
  readonly fin: string;
  readonly texte: string;
}

export function vttDe(cues: readonly CueTest[]): string {
  return `WEBVTT\n\n${cues.map((cue) => `${cue.debut} --> ${cue.fin}\n${cue.texte}`).join("\n\n")}\n`;
}

export function entreeVideo(cues: readonly CueTest[], brutA: string, brutB: string): EntreeExtraction {
  const texte = cues.map((cue) => cue.texte).join("\n");
  const vtt = vttDe(cues);
  return {
    ...entreeHtml(texte, brutA, brutB),
    extracteur_epingle: WEBVTT,
    source: sourceVideo(texte),
    fiches: [fiche(texte, WEBVTT, { vtt_sha256: sha256Texte(vtt) })],
    vtt,
  };
}
