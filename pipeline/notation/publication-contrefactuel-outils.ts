/**
 * Le contrefactuel d'outil, publié avec le run (§7 ; D75 (7), D90) : le bloc
 * `contrefactuel_outils` de `schema/run.schema.json`, sur le modèle de `contrefactuel_candidats`
 * (`publication-contrefactuel.ts`). Fonction pure : elle rend le bloc, l'appelant l'écrit dans le
 * run (`inscription-contrefactuel-outils.ts`).
 *
 * Trois formes :
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
 * Les deux formes ci-dessus n'ont ni 0 %, ni taux de juge : un test absent ou vide n'en a pas.
 *
 * - **Test joué et terminé** (`publierTermineOutils`, D90) : le sous-ensemble est non vide, chaque
 *   paire est notée ou renvoyée par chaque juge mesuré. Le bloc porte, en plus de ce qui rejoue le
 *   tirage, `juges` : les deux juges déclarés au run, triés par `juge_id`. Un juge mesuré publie son
 *   taux et ses effectifs (`changements`), ou `toutes_paires_ecartees` quand ses renvois écartent
 *   toutes ses paires ; ses paires écartées sont publiées dans les deux cas, 0 compris. Un juge
 *   retiré au test des candidats n'est pas mesuré (§7) : il figure avec `motif_non_mesure`, sans
 *   taux, pour que son absence de taux soit visible et motivée. Aucun seuil, aucun retrait.
 *
 * `publierContrefactuelOutilsJoue` aiguille un test joué vers l'une de ses deux formes ; un test en
 * attente (paire incomplète) ne se publie pas, comme au test des candidats. Ce module ne recalcule
 * rien : il recoupe le résultat avec le tirage et les juges du run, et refuse ce qui ne concorde pas
 * (`ContrefactuelOutilsNonPubliable`) plutôt que de le compléter.
 */

import { CLE_DERANGEMENT_OUTILS, correspondancesOutils, type AbsenceContrefactuelOutils, type DerangementOutils, type EditeurPartage, type MotifAbsenceContrefactuelOutils } from "./derangement-outils.ts";
import type { ResultatContrefactuelOutils, ResultatJugeOutils } from "./contrefactuel-outils.ts";
import { CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS, TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS, type SousEnsembleContrefactuel } from "./echantillons.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { RunDeNotation } from "../../analysis/types-notation.ts";

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

/** `run.schema.json#/$defs/juge_contrefactuel_outils` : mesuré, mesuré sans taux, ou non mesuré. */
export type JugeContrefactuelOutils =
  | {
      readonly juge_id: string;
      readonly taux_changement: number;
      readonly changements: { readonly numerateur: number; readonly denominateur: number };
      readonly paires_ecartees: number;
    }
  | { readonly juge_id: string; readonly motif_indefini: "toutes_paires_ecartees"; readonly paires_ecartees: number }
  | { readonly juge_id: string; readonly motif_non_mesure: "retire_au_test_des_candidats" };

/** `run.schema.json#/properties/contrefactuel_outils`, test joué et terminé (D90). */
export interface BlocContrefactuelOutilsTermine {
  readonly etat: "termine";
  readonly outils: number;
  readonly eligibles: number;
  readonly taille_visee: number;
  readonly taille: number;
  readonly sous_effectif: boolean;
  readonly correspondances: Readonly<Record<string, string>>;
  readonly cle_graine: readonly string[];
  readonly cle_graine_derangement: readonly string[];
  readonly mentions_residuelles: number;
  readonly juges: readonly JugeContrefactuelOutils[];
}

export type BlocContrefactuelOutils = BlocContrefactuelOutilsNonJoue | BlocContrefactuelOutilsSansEligible | BlocContrefactuelOutilsTermine;

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
 * parmi zéro éligible. Tout autre résultat se refuse : un test terminé se publie par `publierTermineOutils`.
 */
export function publierSansReponseEligible(
  resultat: ResultatContrefactuelOutils,
  sous_ensemble: SousEnsembleContrefactuel,
  derangement: DerangementOutils,
): BlocContrefactuelOutilsSansEligible {
  if (resultat.statut !== "indefini") throw new ContrefactuelOutilsNonPubliable(`test ${resultat.statut} : seul un test sans réponse éligible se publie sous aucune_reponse_eligible.`);
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

/**
 * Un test joué (dérangement tiré) : sans réponse éligible, le bloc `aucune_reponse_eligible`
 * (`publierSansReponseEligible`, inchangé) ; terminé, le bloc des taux (`publierTermineOutils`). Une
 * paire incomplète ne se publie pas : aucun taux sur un jeu incomplet (D16 (2)).
 */
export function publierContrefactuelOutilsJoue(
  resultat: ResultatContrefactuelOutils,
  sous_ensemble: SousEnsembleContrefactuel,
  derangement: DerangementOutils,
  run: RunDeNotation,
): BlocContrefactuelOutilsSansEligible | BlocContrefactuelOutilsTermine {
  if (resultat.statut === "en_attente") {
    throw new ContrefactuelOutilsNonPubliable(`${resultat.paires_incompletes.length} paire(s) incomplète(s) : aucun taux sur un jeu incomplet (D16 (2)).`);
  }
  if (resultat.statut === "indefini") return publierSansReponseEligible(resultat, sous_ensemble, derangement);
  return publierTermineOutils(resultat, sous_ensemble, derangement, run);
}

/**
 * D90 : le test terminé. Le résultat doit être celui du sous-ensemble reçu (même `sous_effectif`,
 * sous-ensemble non vide, dénominateur plus paires écartées égal à sa taille pour chaque juge
 * mesuré), et ses juges exactement les juges non retirés du run.
 */
export function publierTermineOutils(
  resultat: ResultatContrefactuelOutils,
  sous_ensemble: SousEnsembleContrefactuel,
  derangement: DerangementOutils,
  run: RunDeNotation,
): BlocContrefactuelOutilsTermine {
  if (resultat.statut !== "termine") throw new ContrefactuelOutilsNonPubliable(`test ${resultat.statut} : seul un test terminé publie des taux.`);
  const taille = sous_ensemble.reponse_ids.length;
  if (taille === 0) throw new ContrefactuelOutilsNonPubliable("test terminé sur un sous-ensemble vide.");
  if (resultat.sous_effectif !== sous_ensemble.sous_effectif) {
    throw new ContrefactuelOutilsNonPubliable(`sous_effectif ${String(resultat.sous_effectif)} au résultat, ${String(sous_ensemble.sous_effectif)} au tirage.`);
  }
  exigerJugesMesures(resultat.juges, run);
  const mesures = new Map(resultat.juges.map((juge) => [juge.juge_id, jugeMesure(juge, taille)]));
  return {
    etat: "termine",
    outils: derangement.paires.length,
    eligibles: sous_ensemble.eligibles,
    taille_visee: sous_ensemble.taille_visee,
    taille,
    sous_effectif: sous_ensemble.sous_effectif,
    correspondances: correspondancesOutils(derangement),
    cle_graine: [...CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS],
    cle_graine_derangement: [...CLE_DERANGEMENT_OUTILS],
    mentions_residuelles: resultat.mentions_residuelles,
    juges: [...run.juges].sort((a, b) => comparerChaines(a.juge_id, b.juge_id)).map((juge) => (juge.retire ? nonMesure(juge.juge_id) : exigerMesure(mesures, juge.juge_id))),
  };
}

function exigerMesure(mesures: ReadonlyMap<string, JugeContrefactuelOutils>, juge_id: string): JugeContrefactuelOutils {
  const mesure = mesures.get(juge_id);
  if (mesure === undefined) throw new ContrefactuelOutilsNonPubliable(`juge ${juge_id} non retiré sans résultat au test.`);
  return mesure;
}

/** Les juges du résultat sont exactement les juges non retirés du run (§7 : seuls eux sont mesurés). */
function exigerJugesMesures(juges: readonly ResultatJugeOutils[], run: RunDeNotation): void {
  const recus = juges.map((juge) => juge.juge_id).sort(comparerChaines);
  const attendus = run.juges.filter((juge) => !juge.retire).map((juge) => juge.juge_id).sort(comparerChaines);
  if (attendus.length === 0 || recus.join("\u0000") !== attendus.join("\u0000")) {
    throw new ContrefactuelOutilsNonPubliable(`juges mesurés (${recus.join(", ")}) différents des juges non retirés du run ${run.id} (${attendus.join(", ")}).`);
  }
}

/** §7 : dénominateur + paires écartées = taille du sous-ensemble ; tout écarté, aucun effectif. */
function jugeMesure(juge: ResultatJugeOutils, taille: number): JugeContrefactuelOutils {
  if ("motif_indefini" in juge) {
    if (juge.paires_ecartees !== taille) throw new ContrefactuelOutilsNonPubliable(`juge ${juge.juge_id} : taux indéfini avec ${juge.paires_ecartees} paire(s) écartée(s) sur ${taille}.`);
    return { juge_id: juge.juge_id, motif_indefini: juge.motif_indefini, paires_ecartees: juge.paires_ecartees };
  }
  if (juge.taux.denominateur + juge.paires_ecartees !== taille) {
    throw new ContrefactuelOutilsNonPubliable(`juge ${juge.juge_id} : dénominateur ${juge.taux.denominateur} et ${juge.paires_ecartees} paire(s) écartée(s) pour un sous-ensemble de ${taille} réponse(s).`);
  }
  return {
    juge_id: juge.juge_id,
    taux_changement: juge.taux.valeur,
    changements: { numerateur: juge.taux.numerateur, denominateur: juge.taux.denominateur },
    paires_ecartees: juge.paires_ecartees,
  };
}

function nonMesure(juge_id: string): JugeContrefactuelOutils {
  return { juge_id, motif_non_mesure: "retire_au_test_des_candidats" };
}
