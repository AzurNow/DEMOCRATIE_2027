/**
 * Le taux de changement du contrefactuel d'outil (§7, protocole 0.24, D59 (13)) : « Le taux de
 * changement est publié ; c'est un diagnostic, qui ne retire aucun juge. »
 *
 * Les règles 1 à 3 bis sont celles du test des candidats (`contrefactuel.ts:compterChangements`) :
 * incohérences nommées, paires incomplètes en attente, changement sur la catégorie, les drapeaux
 * et la fraîcheur (le sourçage n'y entre pas, les pages citées n'étant pas permutées), extrait
 * invalide d'un côté compté comme changement, paires renvoyées à l'humain écartées et comptées.
 * Le côté permuté porte le contexte `contrefactuel_outil`, sous le motif `contrefactuel`.
 *
 * Ce qui diffère : aucun seuil, aucun retrait, aucun taux d'échantillon humain, aucune invalidation
 * du run. Le résultat n'a pas de champ `retire` : un consommateur ne peut pas en tirer un retrait.
 *
 * **Juges mesurés.** Le run déclare deux juges (§7). Le test des candidats peut en avoir retiré
 * un ; « les notations déjà rendues par le juge retiré sont écartées de tout le run » : seuls les
 * juges non retirés sont mesurés ici, et une notation du juge retiré passée au test est une
 * incohérence nommée, jamais ignorée. Les deux juges retirés invalident le run (§7) : ce test ne
 * se joue pas, refus nommé.
 *
 * **Sous deux outils** au run, le dérangement n'est pas défini (§7 0.24) : l'appelant rend
 * `ContrefactuelOutilsFauteDOutils`, sans sous-ensemble ni paire, et n'appelle pas ce module.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { compterChangements, ContrefactuelIncoherent, mentionsResiduellesDes, type ComptesDuJuge, type EntreeContrefactuel, type PaireIncomplete, type TauxDeChangement } from "./contrefactuel.ts";
import type { RunDeNotation } from "./types.ts";

export type ResultatJugeOutils =
  | { readonly juge_id: string; readonly taux: TauxDeChangement; readonly paires_ecartees: number }
  | { readonly juge_id: string; readonly motif_indefini: "toutes_paires_ecartees"; readonly paires_ecartees: number };

interface CommunOutils {
  readonly sous_effectif: boolean;
  readonly mentions_residuelles: number;
}

export type ResultatContrefactuelOutils =
  | (CommunOutils & { readonly statut: "en_attente"; readonly paires_incompletes: readonly PaireIncomplete[] })
  | (CommunOutils & { readonly statut: "indefini"; readonly motif: "aucune_reponse_eligible" })
  | (CommunOutils & { readonly statut: "termine"; readonly juges: readonly ResultatJugeOutils[] });

/** §7 0.24 : sous deux outils au run, le dérangement, donc le test, n'est pas défini. Jamais 0 %. */
export interface ContrefactuelOutilsFauteDOutils {
  readonly statut: "indefini";
  readonly motif: "moins_de_deux_outils";
}

export function testerContrefactuelOutils(entree: EntreeContrefactuel): ResultatContrefactuelOutils {
  const comptage = compterChangements(entree, jugesMesures(entree.run), "contrefactuel_outil");
  const commun: CommunOutils = { sous_effectif: entree.sous_ensemble.sous_effectif, mentions_residuelles: mentionsResiduellesDes(entree.paires) };
  if (comptage.statut === "aucune_paire") return { ...commun, statut: "indefini", motif: "aucune_reponse_eligible" };
  if (comptage.statut === "en_attente") return { ...commun, statut: "en_attente", paires_incompletes: comptage.paires_incompletes };
  return { ...commun, statut: "termine", juges: comptage.juges.map(resultatDuJuge) };
}

/** Deux juges déclarés, distincts ; les non retirés, au moins un. */
function jugesMesures(run: RunDeNotation): readonly string[] {
  const ids = run.juges.map((juge) => juge.juge_id);
  if (ids.length !== 2 || new Set(ids).size !== 2) {
    throw new ContrefactuelIncoherent(`le run ${run.id} déclare ${ids.length} juge(s) distincts au lieu de deux (§7).`);
  }
  const actifs = run.juges.filter((juge) => !juge.retire).map((juge) => juge.juge_id);
  if (actifs.length === 0) throw new ContrefactuelIncoherent(`les deux juges du run ${run.id} sont retirés : le run est invalide, le contrefactuel d'outil ne se joue pas (§7).`);
  return actifs.sort(comparerChaines);
}

function resultatDuJuge({ juge_id, changements, comptees, paires_ecartees }: ComptesDuJuge): ResultatJugeOutils {
  if (comptees === 0) return { juge_id, motif_indefini: "toutes_paires_ecartees", paires_ecartees };
  return { juge_id, taux: { numerateur: changements, denominateur: comptees, valeur: changements / comptees }, paires_ecartees };
}
