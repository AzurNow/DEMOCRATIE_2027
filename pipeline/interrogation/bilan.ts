/**
 * Le bilan d'exécution d'un run, par couple outil × mode : ce qui a été obtenu, refusé par l'API,
 * et ce qui manque, par motif.
 *
 * Des comptes de fonctionnement, pas une métrique du §8. La seule métrique qui s'y lit — la part
 * de réponses manquantes, et le seuil de 20 % qui marque un « run incomplet » — n'est pas calculée
 * ici : elle vient de `analysis/seuils.ts`, où elle vit une fois. Comme le go/no-go, elle se compte
 * sur le plan d'interrogation du run (§8, protocole 0.21, D56 (2)) : une requête planifiée sans
 * réponse écrite (jamais tentée, ou en attente de l'opérateur) est manquante, et le bilan la montre
 * à part (`sans_reponse`). Une ligne par couple du plan, même sans aucune réponse enregistrée.
 */

import {
  partReponsesManquantesDuPlan,
  requetesSansReponse,
  runIncomplet,
  type RequeteDuPlan,
} from "../../analysis/seuils.ts";
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
  /** Requêtes du plan sans réponse écrite : jamais tentées, ou en attente de l'opérateur. */
  readonly sans_reponse: number;
  readonly part_manquantes: Taux;
  readonly run_incomplet: boolean;
}

function compter(reponses: readonly ReponseEcrite[], predicat: (r: ReponseEcrite) => boolean): number {
  return reponses.filter(predicat).length;
}

/** Ce que chaque ligne lit : les réponses écrites, le plan, et ses requêtes sans réponse. */
interface Entrees {
  readonly reponses: readonly ReponseEcrite[];
  readonly plan: readonly RequeteDuPlan[];
  readonly sans_reponse: readonly RequeteDuPlan[];
}

function ligne(entrees: Entrees, outil_id: string, mode: Mode): LigneBilan {
  const duCouple = (r: { readonly outil_id: string; readonly mode: Mode }): boolean => r.outil_id === outil_id && r.mode === mode;
  const siennes = entrees.reponses.filter(duCouple);
  const part_manquantes = partReponsesManquantesDuPlan(entrees.reponses, entrees.plan, { outil_id, mode });
  return {
    outil_id,
    mode,
    obtenues: compter(siennes, (r) => r.statut_reponse === "obtenue"),
    refus_api: compter(siennes, (r) => r.statut_reponse === "obtenue" && r.normalise.refus_api),
    manquantes_echecs: compter(siennes, (r) => r.statut_reponse === "manquante" && r.motif_manquante === "echecs"),
    manquantes_hors_fenetre: compter(siennes, (r) => r.statut_reponse === "manquante" && r.motif_manquante === "hors_fenetre"),
    sans_reponse: entrees.sans_reponse.filter(duCouple).length,
    part_manquantes,
    run_incomplet: runIncomplet(part_manquantes),
  };
}

/**
 * Une ligne par couple du plan d'interrogation, triée par outil puis par mode. Une réponse écrite
 * qu'aucune requête du plan n'attend lève (`ReponseHorsPlan`, `analysis/seuils.ts`).
 */
export function bilanParCouple(reponses: readonly ReponseEcrite[], plan: readonly RequeteDuPlan[]): readonly LigneBilan[] {
  const entrees: Entrees = { reponses, plan, sans_reponse: requetesSansReponse(reponses, plan) };
  const outils = [...new Set(plan.map((r) => r.outil_id))].sort(comparerChaines);
  return outils.flatMap((outil_id) =>
    MODES.filter((mode) => plan.some((r) => r.outil_id === outil_id && r.mode === mode)).map((mode) =>
      ligne(entrees, outil_id, mode),
    ),
  );
}
