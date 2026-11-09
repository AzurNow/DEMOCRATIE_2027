/**
 * La population « réponses obtenues du run » (§7 : l'échantillon humain et le jeu d'or sont tirés
 * « parmi les réponses obtenues »), écrite une seule fois (revue du 2026-11-09, constat 1).
 *
 * Huit appelants la lisent : le jeu d'or (`pipeline/notation/inscription-jeu-or.ts`), le contrôle de
 * la notation (`outils/notation-controle.ts`), la notation simulée
 * (`pipeline/notation/notation-simulee.ts`), le recoupement de l'accord humains
 * (`analysis/lecture-run.ts`), le go/no-go (`pipeline/go-no-go/go-no-go.ts`), l'écran de notation
 * humaine (`notation-humaine/serveur/chargement.ts`), et, pour les métriques du §8, l'assemblage des
 * unités (`analysis/filtre.ts:assembler`) et le compte publié des entrées
 * (`analysis/analyse-du-run.ts:entreesPubliees`).
 *
 * **Ce qu'elle retient** : contexte `run` (`contexte-run.ts:estDuRun`) et statut `obtenue`, quel que
 * soit le canal. Une saisie de l'application (QR8, §6) y entre donc. Ce n'est pas la population de
 * `pipeline/run/reponses.ts:reponsesObtenues`, qui ne compte que le canal API (§5, « Tailles »). Le
 * §7 ne dit pas le canal : le restreindre à l'API est un amendement, pas une correction
 * (docs/DETTE.md, 2026-11-09). Le jour où il est écrit, la population se sépare en deux : celle que
 * les juges notent garde l'application (§6 : « les réponses notées comme celles de l'API »), celle de
 * l'échantillon humain, du jeu d'or et des kappas ne la garde pas. `filtre.ts:assembler` et
 * `analyse-du-run.ts:entreesPubliees` restent alors du côté de la population notée : les métriques
 * du §8 lisent les saisies de l'application (écart API/application, QR8).
 *
 * Pure : l'ordre reçu est gardé, rien n'est copié ni dédoublonné.
 */

import { estDuRun } from "./contexte-run.ts";
import type { ContexteMesure, StatutReponse } from "./types.ts";

interface ReponseFiltrable {
  readonly contexte: ContexteMesure;
  readonly statut_reponse: StatutReponse;
}

/** Une réponse dont le statut est connu pour `obtenue` : pour une union discriminée, sa seule branche obtenue. */
export type Obtenue<T extends ReponseFiltrable> = T & { readonly statut_reponse: "obtenue" };

function estObtenueDuRun<T extends ReponseFiltrable>(reponse: T): reponse is Obtenue<T> {
  return estDuRun(reponse) && reponse.statut_reponse === "obtenue";
}

export function reponsesObtenuesDuRun<T extends ReponseFiltrable>(reponses: readonly T[]): Obtenue<T>[] {
  return reponses.filter(estObtenueDuRun);
}
