/**
 * Les unités de chaque couple outil × mode comparé du run, une entrée par couple du partage.
 *
 * Porte commune des calculs « par couple comparé » écrits par la 0.24 (D59 (5), (7), (8)) : les
 * intervalles de tous les taux (`incertitude.ts`), leurs recalculs de robustesse
 * (`robustesse-taux.ts`) et la corrélation exploratoire (`correlation-couverture.ts`). Le partage
 * vient de `seuils.ts:couplesComparables`, calculé une fois au calcul principal, et n'est jamais
 * recalculé ici : un recalcul qui reçoit le même partage garde les mêmes couples (§8, « Chaque
 * recalcul garde le partage des couples outil × mode […] du calcul principal »).
 *
 * Contrairement à `metriques.ts:parOutilEtMode`, qui ne rend que les couples présents dans les
 * unités, chaque couple comparé du partage a ici son entrée, même sans unité : un recalcul qui vide
 * un couple le publie avec des taux absents, il ne le fait pas disparaître.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { coupleApi } from "./metriques.ts";
import { cleCouple, etatDesCouples, type PartageCouples } from "./seuils.ts";
import type { CoupleOutilMode } from "./types.ts";

export interface UnitesDuCouple {
  readonly couple: CoupleOutilMode;
  readonly unites: readonly UniteAnalyse[];
}

/**
 * Chaque couple comparé, trié par `cleCouple`, avec ses unités dans l'ordre d'entrée. Les unités
 * d'un couple incomplet sont retirées (§8 : aucune statistique) ; une unité d'un couple inconnu du
 * partage, du canal application ou sans mode lève (`etatDesCouples`, `coupleApi`).
 */
export function unitesParCoupleCompare(unites: readonly UniteAnalyse[], couples: PartageCouples): UnitesDuCouple[] {
  const etat = etatDesCouples(couples);
  const parCle = new Map<string, UniteAnalyse[]>(couples.compares.map((couple) => [cleCouple(couple), []]));
  for (const unite of unites) {
    const couple = coupleApi(unite);
    if (etat(couple) === "incomplet") continue;
    parCle.get(cleCouple(couple))?.push(unite);
  }
  return [...couples.compares]
    .sort((a, b) => comparerChaines(cleCouple(a), cleCouple(b)))
    .map((couple) => ({ couple, unites: parCle.get(cleCouple(couple)) as UniteAnalyse[] }));
}

/** Lève sur une unité qui n'appartient pas au couple annoncé : la mesurer ici la compterait ailleurs. */
export function exigerDuCouple(unites: readonly UniteAnalyse[], couple: CoupleOutilMode): void {
  for (const unite of unites) {
    const sien = coupleApi(unite);
    if (cleCouple(sien) !== cleCouple(couple)) {
      throw new Error(`Réponse ${unite.reponse_id} du couple ${cleCouple(sien)} parmi les unités du couple ${cleCouple(couple)}.`);
    }
  }
}
