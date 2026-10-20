/**
 * Localisation d'une citation proposée par un modèle dans le texte canonique de sa source.
 *
 * - **Test verbatim** : `validation/domaine/verbatim.ts:testerVerbatim`, réutilisé tel quel (règle 5 :
 *   une comparaison de chaînes après la normalisation fixée du §4, jamais un jugement de modèle).
 *   Une citation qui échoue est rejetée : elle n'est jamais rapprochée de la source.
 * - **Saut de page** : le prompt interdit qu'une citation franchisse U+000C, et la normalisation le
 *   compte parmi les espaces — une citation qui le contient passerait le test verbatim. Le code le
 *   vérifie donc avant, sur la chaîne reçue.
 * - **Page** (PDF) : celle dont l'intervalle contient `[offset_debut, offset_fin)` (docs/CONTRATS.md
 *   §1.1), même règle que `pipeline/collecte/textes/pages.py:page_de`. Une citation à cheval sur deux
 *   pages n'a pas de page unique et est rejetée, jamais rattachée à la première.
 * - **Extrait** (audio, vidéo) : `source.extrait` est exigé d'une source T2. Le début est celui du cue
 *   qui contient le premier point de code de la citation, la fin celle du cue qui en contient le
 *   dernier, selon la règle de §2 (« un offset tombe dans le dernier cue dont le premier point de
 *   code le précède ou l'égale ») ; arrondis à la seconde, vers l'extérieur, au format `HH:MM:SS`
 *   du schéma. Règle tranchée par la décision D53 (4) ; à écrire dans docs/CONTRATS.md §2.
 * - **Citation ambiguë** : une citation qui figure plusieurs fois dans le texte (après
 *   normalisation, `testerVerbatim` compte les occurrences) n'a pas de localisation exacte (§4) :
 *   elle est rejetée, motif `citation_ambigue`, et n'entre pas dans l'appariement (décision D53 (3)).
 */

import type { Cue, DocumentVtt } from "../../validation/domaine/webvtt.ts";
import { testerVerbatim } from "../../validation/domaine/verbatim.ts";
import type { PageFiche } from "./choix-texte.ts";

export type MotifRejetCitation =
  | "saut_de_page"
  | "citation_vide"
  | "introuvable"
  | "citation_ambigue"
  | "citation_sans_page_unique";

export interface Extrait {
  readonly debut: string;
  readonly fin: string;
}

export interface Localisation {
  readonly offset_debut: number;
  readonly offset_fin: number;
  /** Version de la normalisation du test verbatim, rendue par `testerVerbatim`. */
  readonly version_normalisation: string;
  /** `null` : la source n'a pas de pages (HTML, audio, vidéo). */
  readonly page: number | null;
  /** `null` : la source n'a pas de transcription minutée. */
  readonly extrait: Extrait | null;
}

/** Ce que la fiche d'extraction et la transcription disent de la structure du texte. */
export interface Reperes {
  readonly pages: readonly PageFiche[] | null;
  readonly vtt: DocumentVtt | null;
}

export type ResultatLocalisation =
  | { readonly ok: true; readonly localisation: Localisation }
  | { readonly ok: false; readonly motif: MotifRejetCitation; readonly detail: string };

const SAUT_DE_PAGE = "\f";

function rejet(motif: MotifRejetCitation, detail: string): ResultatLocalisation {
  return { ok: false, motif, detail };
}

/** Page dont l'intervalle contient `[debut, fin)`, ou `null` s'il n'y en a pas d'unique. */
export function pageDe(pages: readonly PageFiche[], debut: number, fin: number): number | null {
  const page = pages.find((candidate) => candidate.debut <= debut && fin <= candidate.fin && debut < fin);
  return page === undefined ? null : page.numero;
}

/** Le dernier cue dont le premier point de code précède ou égale l'offset (docs/CONTRATS.md §2). */
function cueDe(document: DocumentVtt, offset: number): Cue {
  const cue = document.cues.findLast((candidat) => candidat.offset <= offset);
  if (cue === undefined) throw new Error(`Aucun cue ne couvre l'offset ${offset} : la transcription ne dérive pas ce texte.`);
  return cue;
}

function horodatage(secondes: number): string {
  const heures = Math.floor(secondes / 3600);
  const minutes = Math.floor((secondes % 3600) / 60);
  const reste = secondes % 60;
  return [heures, minutes, reste].map((partie) => String(partie).padStart(2, "0")).join(":");
}

/** Extrait minuté de la citation `[debut, fin)`, arrondi à la seconde vers l'extérieur. */
export function extraitDe(document: DocumentVtt, debut: number, fin: number): Extrait {
  return {
    debut: horodatage(Math.floor(cueDe(document, debut).debut)),
    fin: horodatage(Math.ceil(cueDe(document, fin - 1).fin)),
  };
}

function pageExigee(reperes: Reperes, debut: number, fin: number): number | null | "sans_page_unique" {
  if (reperes.pages === null) return null;
  const page = pageDe(reperes.pages, debut, fin);
  return page === null ? "sans_page_unique" : page;
}

export function localiser(citation: string, texte: string, reperes: Reperes): ResultatLocalisation {
  if (citation.includes(SAUT_DE_PAGE)) return rejet("saut_de_page", "la citation contient U+000C : elle franchit un saut de page.");
  const verbatim = testerVerbatim(citation, texte);
  if (verbatim.motif_echec === "citation_vide") return rejet("citation_vide", "test verbatim échoué : la citation est vide après normalisation.");
  if (verbatim.motif_echec !== null) return rejet(verbatim.motif_echec, "test verbatim échoué : la citation ne figure pas dans le texte canonique.");
  if (verbatim.offset_debut === null || verbatim.offset_fin === null) throw new Error("Test verbatim réussi sans offsets.");
  if (verbatim.occurrences > 1) {
    return rejet("citation_ambigue", `la citation figure ${verbatim.occurrences} fois dans le texte canonique : aucune localisation exacte.`);
  }
  const { offset_debut, offset_fin } = verbatim;
  const page = pageExigee(reperes, offset_debut, offset_fin);
  if (page === "sans_page_unique") {
    return rejet("citation_sans_page_unique", `[${offset_debut}, ${offset_fin}) n'est contenu dans aucune page unique.`);
  }
  const extrait = reperes.vtt === null ? null : extraitDe(reperes.vtt, offset_debut, offset_fin);
  return { ok: true, localisation: {
      offset_debut,
      offset_fin,
      version_normalisation: verbatim.version_normalisation,
      page,
      extrait,
    },
  };
}
