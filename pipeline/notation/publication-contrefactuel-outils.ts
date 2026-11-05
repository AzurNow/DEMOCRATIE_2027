/**
 * L'absence du contrefactuel d'outil, publiée avec le run (§7 ; D75 (7)) : le bloc
 * `contrefactuel_outils` de `schema/run.schema.json`, sur le modèle de `contrefactuel_candidats`
 * (`publication-contrefactuel.ts`). Fonction pure : elle rend le bloc, l'appelant l'écrit dans le
 * run (`inscription-contrefactuel-outils.ts`).
 *
 * Deux formes, comme au test des candidats :
 *
 * - **Test non joué** (`publierAbsenceContrefactuelOutils`) : le dérangement des outils n'est pas
 *   tiré (`derangement-outils.ts:derangementOutilsOuAbsence`) — moins de deux outils au dérangement
 *   (§7 0.24), deux outils du dérangement du même éditeur (§7 0.31, D73 (15)), ou un comparateur du
 *   même éditeur qu'un outil du dérangement (§7 0.33, D75 (6)). Le bloc porte l'état indéfini, le
 *   motif, le nombre d'outils du dérangement, les éditeurs en cause (sous les deux motifs d'éditeur
 *   seulement), la taille visée et une taille nulle ; ni éligibles, ni sous-ensemble, ni dérangement.
 * - **Test joué sans réponse éligible** (`publierSansReponseEligible`) : le dérangement est tiré,
 *   aucune réponse du run ne nomme un outil permuté (`estEligibleOutils`), le sous-ensemble est vide
 *   (`contrefactuel-outils.ts`, motif `aucune_reponse_eligible`). Le bloc porte en plus les
 *   éligibles (zéro), le sous-effectif, les correspondances du dérangement et les deux clés de graine,
 *   pour que le tirage se rejoue.
 *
 * Jamais 0 %, jamais de taux de juge : un test absent n'en a pas. Le test terminé (taux par juge) n'a
 * pas encore de forme publiée : il attend son branchement dans la chaîne, et ce module refuse tout ce
 * qui n'est pas une absence (`ContrefactuelOutilsNonPubliable`).
 */

import { CLE_DERANGEMENT_OUTILS, correspondancesOutils, type AbsenceContrefactuelOutils, type DerangementOutils, type EditeurPartage, type MotifAbsenceContrefactuelOutils } from "./derangement-outils.ts";
import type { ResultatContrefactuelOutils } from "./contrefactuel-outils.ts";
import { CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS, TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS, type SousEnsembleContrefactuel } from "./echantillons.ts";

/** `run.schema.json#/properties/contrefactuel_outils`, dérangement non tiré. */
export interface BlocContrefactuelOutilsNonJoue {
  readonly etat: "indefini";
  readonly motif_indefini: MotifAbsenceContrefactuelOutils;
  readonly outils: number;
  /** Sous `outils_du_meme_editeur` et `comparateur_du_meme_editeur` seulement, jamais vide. */
  readonly editeurs_partages?: readonly EditeurPartage[];
  readonly taille_visee: number;
  readonly taille: 0;
}

/** `run.schema.json#/properties/contrefactuel_outils`, dérangement tiré, aucune réponse éligible. */
export interface BlocContrefactuelOutilsSansEligible {
  readonly etat: "indefini";
  readonly motif_indefini: "aucune_reponse_eligible";
  readonly outils: number;
  readonly eligibles: 0;
  readonly taille_visee: number;
  readonly taille: 0;
  readonly sous_effectif: true;
  readonly correspondances: Readonly<Record<string, string>>;
  readonly cle_graine: readonly string[];
  readonly cle_graine_derangement: readonly string[];
  readonly mentions_residuelles: 0;
}

export type BlocContrefactuelOutils = BlocContrefactuelOutilsNonJoue | BlocContrefactuelOutilsSansEligible;

export class ContrefactuelOutilsNonPubliable extends Error {
  constructor(detail: string) {
    super(`Contrefactuel d'outil non publiable : ${detail}`);
    this.name = "ContrefactuelOutilsNonPubliable";
  }
}

/** Le test non joué : l'absence que rend `derangementOutilsOuAbsence`, telle quelle. */
export function publierAbsenceContrefactuelOutils(absence: AbsenceContrefactuelOutils): BlocContrefactuelOutilsNonJoue {
  const commun = { etat: absence.statut, motif_indefini: absence.motif, outils: absence.outils, taille_visee: TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS, taille: 0 } as const;
  if (absence.motif === "moins_de_deux_outils") {
    if (absence.editeurs_partages.length > 0) throw new ContrefactuelOutilsNonPubliable("éditeurs partagés publiés sous le motif moins_de_deux_outils.");
    return commun;
  }
  if (absence.editeurs_partages.length === 0) throw new ContrefactuelOutilsNonPubliable(`motif ${absence.motif} sans éditeur partagé.`);
  return { ...commun, editeurs_partages: absence.editeurs_partages };
}

/**
 * Le test joué sans réponse éligible : le résultat doit être celui d'un sous-ensemble vide, tiré
 * parmi zéro éligible. Tout autre résultat se refuse : un taux n'a pas encore de forme publiée.
 */
export function publierSansReponseEligible(
  resultat: ResultatContrefactuelOutils,
  sous_ensemble: SousEnsembleContrefactuel,
  derangement: DerangementOutils,
): BlocContrefactuelOutilsSansEligible {
  if (resultat.statut !== "indefini") throw new ContrefactuelOutilsNonPubliable(`test ${resultat.statut} : seule l'absence se publie aujourd'hui.`);
  if (sous_ensemble.eligibles !== 0 || sous_ensemble.reponse_ids.length > 0) {
    throw new ContrefactuelOutilsNonPubliable(`aucune réponse éligible au résultat, ${sous_ensemble.eligibles} éligible(s) et ${sous_ensemble.reponse_ids.length} réponse(s) au tirage.`);
  }
  if (!resultat.sous_effectif || !sous_ensemble.sous_effectif) throw new ContrefactuelOutilsNonPubliable("un sous-ensemble vide est en sous-effectif.");
  if (resultat.mentions_residuelles !== 0) throw new ContrefactuelOutilsNonPubliable(`${resultat.mentions_residuelles} mention(s) résiduelle(s) sans aucune paire.`);
  return {
    etat: "indefini",
    motif_indefini: resultat.motif,
    outils: derangement.paires.length,
    eligibles: 0,
    taille_visee: sous_ensemble.taille_visee,
    taille: 0,
    sous_effectif: true,
    correspondances: correspondancesOutils(derangement),
    cle_graine: [...CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS],
    cle_graine_derangement: [...CLE_DERANGEMENT_OUTILS],
    mentions_residuelles: 0,
  };
}
