/**
 * Le texte de chaque page citée, tel que la charge du juge le transmet (§7 : « la page citée contient
 * bien l'affirmation (juge, puis audit humain) » ; décision D27 (E) de l'auteur, 2026-10-09).
 *
 * **D'où vient le texte.** Le test des liens (`pipeline/liens`, D20, D21) conserve les octets d'une
 * copie : la page reçue pour un lien qui existe, la version brute de l'instantané téléchargé pour un
 * lien inaccessible ou non testable. `pnpm liens:textes` (`pipeline/liens/textes.py`) en extrait le
 * texte avec les extracteurs de la collecte (HTML : `html.parser`, PDF : `pymupdf`), versionnés dans
 * leur fiche (`schema/extraction-page-lien.schema.json`). Ce module lit ce texte par le fournisseur
 * d'existences (`FournisseurExistences.texteDeCopie`), et ne fait rien d'autre que le borner.
 *
 * **Une page par lien distinct**, dans l'ordre de première citation dans `normalise.liens`. Pour
 * chacune :
 *
 * - lien mort : pas de texte, raison `lien_mort` (D19 : il ne soutient jamais rien) ;
 * - lien qui n'est pas mort, sans copie tenue — sans `sha256_contenu`, ou, pour un lien inaccessible
 *   ou non testable, sans `archive_url` ET `sha256_contenu` (D21, la même condition que
 *   `juge.ts:soutienApresTestHttp`) : pas de texte, raison `sans_copie` ;
 * - copie dont l'extraction a été refusée (type non pris en charge, encodage non déclaré, PDF
 *   illisible…) : pas de texte, raison `extraction_refusee` ;
 * - sinon le texte extrait, avec son origine (`page_conservee` ou `copie_archivee`) et son empreinte.
 *
 * Une copie dont le texte n'a pas encore été extrait rend `null` pour toute la réponse : elle attend
 * l'extraction, comme une réponse attend le test des liens. Jamais un texte vide à la place.
 *
 * **Borne.** Un texte de plus de `LONGUEUR_MAX_TEXTE_PAGE` points de code est tronqué à ses
 * `LONGUEUR_MAX_TEXTE_PAGE` premiers points de code, et la page le dit (`tronque`, `longueur_totale`).
 * La borne est elle-même transmise dans la charge. Jamais une troncature silencieuse.
 *
 * Les règles D19 et D21 du soutien (`juge.ts:soutienApresTestHttp`) ne changent pas : un soutien
 * déclaré sur un lien sans texte reste forcé à `non_applicable` exactement comme avant.
 */

import type { VerdictExistence } from "../../analysis/types.ts";
import { LienSansVerdictExistence, type ExistenceEtablie } from "./vue-annotateur.ts";

/**
 * Borne du texte d'une page transmis au juge, en points de code (l'unité des offsets du dépôt).
 * Décision D29 (3) de l'auteur : 50 000 points de code, troncature signalée ; le prompt dit
 * « indéterminé » quand l'affirmation peut se trouver après la borne. Changer la borne change ce que
 * voit le juge.
 */
export const LONGUEUR_MAX_TEXTE_PAGE = 50_000;

/** Ce que le fournisseur sait du texte d'une copie conservée, par son empreinte (`sha256_contenu`). */
export type TexteDeCopie =
  | { readonly issue: "extrait"; readonly texte: string; readonly texte_sha256: string }
  | { readonly issue: "refuse"; readonly motif: string };

export type RaisonSansTexte = "lien_mort" | "sans_copie" | "extraction_refusee";

export type OrigineTexte = "page_conservee" | "copie_archivee";

export type PageCitee =
  | {
      readonly url_citee: string;
      readonly texte_disponible: true;
      readonly origine: OrigineTexte;
      readonly texte: string;
      /** Empreinte du texte extrait entier (avant troncature) : le fichier de `pages-citees/textes/` (hors de `volume/`, D83). */
      readonly texte_sha256: string;
      readonly tronque: boolean;
      /** Longueur du texte entier, en points de code. */
      readonly longueur_totale: number;
    }
  | { readonly url_citee: string; readonly texte_disponible: false; readonly raison: RaisonSansTexte };

export type LecteurTextes = (sha256_contenu: string) => TexteDeCopie | undefined;

/** Verdicts d'existence dont la copie est un instantané archivé (D21). */
const SUR_COPIE_ARCHIVEE: ReadonlySet<VerdictExistence> = new Set<VerdictExistence>(["inaccessible", "non_testable"]);

export function pagesCitees(
  reponse_id: string,
  liens: readonly string[],
  existences: ReadonlyMap<string, ExistenceEtablie>,
  lire: LecteurTextes,
): readonly PageCitee[] | null {
  const pages: PageCitee[] = [];
  for (const url of new Set(liens)) {
    const existence = existences.get(url);
    if (existence === undefined) throw new LienSansVerdictExistence(reponse_id, url);
    const page = pageDe(existence, lire);
    if (page === null) return null;
    pages.push(page);
  }
  return pages;
}

/** La copie tenue d'un lien et son origine, ou la raison de son absence. */
function copieDe(e: ExistenceEtablie): { readonly sha256: string; readonly origine: OrigineTexte } | RaisonSansTexte {
  if (e.verdict_existence === "mort") return "lien_mort";
  if (e.sha256_contenu === undefined) return "sans_copie";
  if (!SUR_COPIE_ARCHIVEE.has(e.verdict_existence)) return { sha256: e.sha256_contenu, origine: "page_conservee" };
  return e.archive_url === undefined ? "sans_copie" : { sha256: e.sha256_contenu, origine: "copie_archivee" };
}

function pageDe(e: ExistenceEtablie, lire: LecteurTextes): PageCitee | null {
  const copie = copieDe(e);
  if (typeof copie === "string") return { url_citee: e.url_citee, texte_disponible: false, raison: copie };
  const texte = lire(copie.sha256);
  if (texte === undefined) return null;
  if (texte.issue === "refuse") return { url_citee: e.url_citee, texte_disponible: false, raison: "extraction_refusee" };
  const points = Array.from(texte.texte);
  const tronque = points.length > LONGUEUR_MAX_TEXTE_PAGE;
  return {
    url_citee: e.url_citee,
    texte_disponible: true,
    origine: copie.origine,
    texte: tronque ? points.slice(0, LONGUEUR_MAX_TEXTE_PAGE).join("") : texte.texte,
    texte_sha256: texte.texte_sha256,
    tronque,
    longueur_totale: points.length,
  };
}
