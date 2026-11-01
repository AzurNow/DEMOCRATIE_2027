/**
 * Le bilan d'exécution d'un run, par couple outil × mode : ce qui a été obtenu, refusé par l'API,
 * et ce qui manque, par motif.
 *
 * Des comptes de fonctionnement, pas une métrique du §8. La seule métrique qui s'y lit — la part
 * de réponses manquantes, et le seuil de 20 % qui marque un « run incomplet » — n'est pas calculée
 * ici : elle vient de `analysis/seuils.ts`, où elle vit une fois.
 */

import { partReponsesManquantes, runIncomplet } from "../../analysis/seuils.ts";
import type { Taux } from "../../analysis/types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { MODES, type Mode, type ReponseEcrite } from "./types.ts";

export interface LigneBilan {
  readonly outil_id: string;
  readonly mode: Mode;
  /** Réponses obtenues, refus de l'API compris. */
  readonly obtenues: number;
  readonly refus_api: number;
  readonly manquantes_echecs: number;
  readonly manquantes_hors_fenetre: number;
  readonly part_manquantes: Taux;
  readonly run_incomplet: boolean;
}

function compter(reponses: readonly ReponseEcrite[], predicat: (r: ReponseEcrite) => boolean): number {
  return reponses.filter(predicat).length;
}

function ligne(reponses: readonly ReponseEcrite[], outil_id: string, mode: Mode): LigneBilan {
  const siennes = reponses.filter((r) => r.outil_id === outil_id && r.mode === mode);
  const part_manquantes = partReponsesManquantes(reponses, { outil_id, mode });
  return {
    outil_id,
    mode,
    obtenues: compter(siennes, (r) => r.statut_reponse === "obtenue"),
    refus_api: compter(siennes, (r) => r.statut_reponse === "obtenue" && r.normalise.refus_api),
    manquantes_echecs: compter(siennes, (r) => r.statut_reponse === "manquante" && r.motif_manquante === "echecs"),
    manquantes_hors_fenetre: compter(siennes, (r) => r.statut_reponse === "manquante" && r.motif_manquante === "hors_fenetre"),
    part_manquantes,
    run_incomplet: runIncomplet(part_manquantes),
  };
}

/** Une ligne par couple présent parmi les réponses, triée par outil puis par mode. */
export function bilanParCouple(reponses: readonly ReponseEcrite[]): readonly LigneBilan[] {
  const outils = [...new Set(reponses.map((r) => r.outil_id))].sort(comparerChaines);
  return outils.flatMap((outil_id) =>
    MODES.filter((mode) => reponses.some((r) => r.outil_id === outil_id && r.mode === mode)).map((mode) =>
      ligne(reponses, outil_id, mode),
    ),
  );
}

