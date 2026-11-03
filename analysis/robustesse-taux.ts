/**
 * Les taux recalculés des analyses de robustesse (§8, protocole 0.24, D59 (8)).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les questions dont un item, quel que soit son rôle, est contesté à un run
 * ultérieur, (c) en excluant les formulations orientées, (d) en excluant les réponses tronquées.
 * […] Les taux sont publiés recalculés sans qualificatif de fragilité. Chaque recalcul garde le
 * partage des couples outil × mode et des candidats du calcul principal : les seuils de
 * non-publication ne sont pas réappliqués à la population restreinte, et un couple ou un candidat
 * exclu du calcul principal l'est aussi de chaque recalcul. »
 *
 * La fragilité d'une différence vit dans `robustesse.ts:evaluerRobustesse` ; ici, les taux seuls,
 * sans qualificatif. Les restrictions sont celles de `robustesse.ts:restrictions`, dans le même
 * ordre ; les taux et leurs intervalles sont ceux de `incertitude.ts:tauxPubliesParCouple`, avec la
 * clé du calcul principal (§8 : « Les recalculs de robustesse gardent la clé de la comparaison
 * principale »).
 *
 * **Aucun seuil réappliqué, par construction.** Le partage des couples, celui des candidats et les
 * strates sont ceux du calcul principal, reçus en paramètre : rien ici ne lit `sous_seuil` ni ne
 * compte de réponses manquantes. Un candidat comparé que la restriction réduit à une réponse garde sa
 * strate ; un couple comparé que la restriction vide est publié avec des taux absents (`strate_vide`) ;
 * un candidat sous le seuil ou un couple incomplet au principal n'a de taux dans aucun recalcul.
 */

import type { UniteAnalyse } from "./filtre.ts";
import { tauxPubliesParCouple, type OptionsIncertitude, type StratesPubliees, type TauxDuRun } from "./incertitude.ts";
import { restrictions, type Recalcul, type SourcesRobustesse } from "./robustesse.ts";
import type { PartageCandidats, PartageCouples } from "./seuils.ts";

export interface TauxRecalcules {
  readonly recalcul: Recalcul;
  readonly taux: TauxDuRun;
}

/**
 * Les quatre recalculs, dans l'ordre (a), (b), (c), (d). `couples`, `strates` et `partage` sont ceux
 * du calcul principal (`seuils.ts:couplesComparables`, `incertitude.ts:stratesDuCalculPrincipal`,
 * `seuils.ts:candidatsComparables`), jamais recalculés sur la population restreinte.
 */
export function tauxRecalcules(
  unites: readonly UniteAnalyse[],
  sources: SourcesRobustesse,
  couples: PartageCouples,
  strates: StratesPubliees,
  partage: PartageCandidats,
  options: OptionsIncertitude,
): TauxRecalcules[] {
  return restrictions(sources).map(({ recalcul, restreindre }) => ({
    recalcul,
    taux: tauxPubliesParCouple(restreindre(unites), couples, strates, partage, options),
  }));
}

/**
 * Un seul des quatre recalculs, sur la même restriction et le même partage que `tauxRecalcules` :
 * le recalcul (b) daté publié après une contestation postérieure (§8, §9, protocole 0.28, D70 (13) ;
 * `recalcul-b.ts`) ne recalcule que lui.
 */
export function tauxRecalcule(
  recalcul: Recalcul,
  unites: readonly UniteAnalyse[],
  sources: SourcesRobustesse,
  couples: PartageCouples,
  strates: StratesPubliees,
  partage: PartageCandidats,
  options: OptionsIncertitude,
): TauxRecalcules {
  const restriction = restrictions(sources).find((r) => r.recalcul === recalcul);
  if (restriction === undefined) throw new Error(`Recalcul de robustesse inconnu : ${recalcul}.`);
  return { recalcul, taux: tauxPubliesParCouple(restriction.restreindre(unites), couples, strates, partage, options) };
}
