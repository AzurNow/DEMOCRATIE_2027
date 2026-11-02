/**
 * Contrôle des corrections avant écriture.
 *
 * La première question de la grille demande si la citation est fidèle à la source ;
 * l'annotateur doit donc pouvoir agir dessus. Mais `CLAUDE.md` interdit de « rapprocher » une
 * citation de sa source, et cette interdiction ne peut pas reposer sur la conscience
 * professionnelle de deux personnes fatiguées à la trentième heure.
 *
 * Elle repose donc sur une fonction : toute correction de citation **rejoue le test verbatim**
 * contre le texte canonique de la source, et la décision est refusée si le test échoue. Une
 * citation corrigée est nécessairement un intervalle contigu du texte de la source, et ses
 * offsets sont recalculés et journalisés à côté des anciens.
 *
 * Quand c'est le **texte extrait** qui est faux — OCR défaillant, transcription erronée — la
 * correction n'est pas la bonne issue : l'item se rejette sous le motif énuméré « texte extrait
 * erroné » (protocole 0.24, D59 (9)), qui renvoie la source à la réextraction
 * (`renvoi-reextraction.ts`). Personne ne corrige un texte de source depuis l'interface.
 */

import { cheminModifiable } from "./promotion.ts";
import type { Correction } from "./types.ts";
import { testerVerbatim } from "./verbatim.ts";

const CHEMINS_CITATION = new Set([
  "/assertion/citation_verbatim",
  "/obsolescence/etat_anterieur/citation_verbatim",
  "/obsolescence/etat_posterieur/citation_verbatim",
]);

export type MotifRefus =
  | "chemin_interdit"
  | "valeur_non_textuelle"
  | "texte_source_absent"
  | "citation_hors_source";

export interface RefusCorrection {
  readonly chemin: string;
  readonly motif: MotifRefus;
  readonly detail?: string;
}

export interface AccesTexte {
  /** Texte canonique de la source visée par ce chemin, ou `null` s'il manque. */
  texteSource(chemin: string): string | null;
  /** Offsets actuels de la citation visée, avant correction. */
  offsetsActuels(chemin: string): { readonly debut: number | null; readonly fin: number | null };
}

export type ResultatCorrections =
  | { readonly ok: true; readonly corrections: readonly Correction[] }
  | { readonly ok: false; readonly refus: readonly RefusCorrection[] };

export function validerCorrections(
  corrections: readonly Correction[],
  acces: AccesTexte,
): ResultatCorrections {
  const retenues: Correction[] = [];
  const refus: RefusCorrection[] = [];

  for (const correction of corrections) {
    const examen = examiner(correction, acces);
    if (examen.ok) retenues.push(examen.correction);
    else refus.push(examen.refus);
  }

  return refus.length > 0 ? { ok: false, refus } : { ok: true, corrections: retenues };
}

type Examen =
  | { readonly ok: true; readonly correction: Correction }
  | { readonly ok: false; readonly refus: RefusCorrection };

function examiner(correction: Correction, acces: AccesTexte): Examen {
  if (correction.cible === "mesure") return examinerMesure(correction);
  if (!cheminModifiable(correction.chemin)) {
    return { ok: false, refus: { chemin: correction.chemin, motif: "chemin_interdit" } };
  }
  if (!CHEMINS_CITATION.has(correction.chemin)) return { ok: true, correction };
  return examinerCitation(correction, acces);
}

/** Seul le thème d'une mesure est contestable depuis l'écran de validation. */
function examinerMesure(correction: Correction): Examen {
  if (correction.chemin !== "/theme") {
    return { ok: false, refus: { chemin: correction.chemin, motif: "chemin_interdit" } };
  }
  return { ok: true, correction };
}

function examinerCitation(correction: Correction, acces: AccesTexte): Examen {
  const nouvelle = correction.nouvelle_valeur;
  if (typeof nouvelle !== "string") {
    return { ok: false, refus: { chemin: correction.chemin, motif: "valeur_non_textuelle" } };
  }

  const texte = acces.texteSource(correction.chemin);
  if (texte === null) {
    return { ok: false, refus: { chemin: correction.chemin, motif: "texte_source_absent" } };
  }

  const resultat = testerVerbatim(nouvelle, texte);
  if (!resultat.passe) {
    return {
      ok: false,
      refus: {
        chemin: correction.chemin,
        motif: "citation_hors_source",
        detail:
          "La citation corrigée ne figure pas telle quelle dans le texte de la source. " +
          "Si c'est le texte extrait qui est faux, la décision attendue est « rejeter », " +
          "sous le motif « texte extrait erroné ».",
      },
    };
  }

  const anciens = acces.offsetsActuels(correction.chemin);
  return {
    ok: true,
    correction: {
      ...correction,
      offsets: {
        ancien_debut: anciens.debut,
        ancien_fin: anciens.fin,
        nouveau_debut: resultat.offset_debut as number,
        nouveau_fin: resultat.offset_fin as number,
      },
    },
  };
}
