/**
 * Du résultat du test contrefactuel des noms de candidats (`contrefactuel.ts`) aux champs que le
 * run publie (`schema/run.schema.json`) : le bloc `contrefactuel_candidats`, pour chaque juge son
 * taux et ses effectifs (`taux_changement_contrefactuel`, `changements_contrefactuel`), son retrait
 * et son motif, le taux de l'échantillon humain, et, si les deux juges sont retirés, la raison dans
 * `invalidation.motif` (D16 (3) : aucun champ nouveau). Le `statut` du run n'est jamais touché ici :
 * `invalidation.motif` est lu par `inscription-contrefactuel.ts:avecInvalidation`, qui pose
 * l'invalidation par la transition pure de `pipeline/run/statut.ts:invalider`, qui ne touche pas
 * `statut` non plus (voir son en-tête) ; `invalide` s'écrit avec le dépôt (§12, protocole §6), hors
 * de tout ce qui précède.
 *
 * Fonction pure : elle rend les champs, l'appelant les écrit dans le run. Elle ne recalcule rien
 * et refuse ce qui ne se publie pas, plutôt que de le compléter :
 *
 * - un test `en_attente` (une paire incomplète) n'a pas de taux : `ContrefactuelNonPubliable` ;
 * - le résultat doit être celui du sous-ensemble reçu : même `sous_effectif`, dénominateur de
 *   chaque juge plus ses paires écartées égal à la taille du sous-ensemble (D31 (1)), sous-ensemble
 *   vide si et seulement si le test est indéfini ; et ses juges doivent être ceux du run.
 *
 * `cle_graine` est la clé lisible du sous-ensemble (`CLE_SOUS_ENSEMBLE_CONTREFACTUEL`), celle que
 * le §7 dit publiée avec le résultat ; `cle_graine_derangement` est celle du dérangement
 * (`CLE_DERANGEMENT_CANDIDATS`), publié aussi en clair (`correspondances`, D55 (4) : les seuls
 * candidats interrogés au run, un candidat non interrogé n'y figure pas).
 *
 * Un run invalide garde un taux d'échantillon humain stocké, que le schéma exige : 25 %, celui
 * qu'impose un retrait (§7), et celui que le contrôle croisé attend dès qu'un juge est retiré.
 */

import type { ResultatContrefactuel, ResultatJuge } from "./contrefactuel.ts";
import { CLE_DERANGEMENT_CANDIDATS, correspondancesDe, type Derangement } from "./derangement.ts";
import { CLE_SOUS_ENSEMBLE_CONTREFACTUEL, comparerChaines, type SousEnsembleContrefactuel } from "./echantillons.ts";
import { TAUX_ECHANTILLON_APRES_RETRAIT, TAUX_ECHANTILLON_SANS_RETRAIT } from "./taux-echantillon.ts";
import type { ChangementsContrefactuel, RunDeNotation, TauxEchantillonHumain } from "./types.ts";

/** `run.schema.json#/properties/contrefactuel_candidats`. */
export interface BlocContrefactuelCandidats {
  readonly etat: "termine" | "indefini";
  readonly eligibles: number;
  readonly taille_visee: number;
  readonly taille: number;
  readonly sous_effectif: boolean;
  readonly correspondances: Readonly<Record<string, string>>;
  readonly cle_graine: readonly string[];
  readonly cle_graine_derangement: readonly string[];
  readonly mentions_residuelles: number;
}

/** Les champs d'un juge du run que le test fixe ; les autres (famille, modèle, kappa) ne changent pas. */
export interface JugePublie {
  readonly juge_id: string;
  readonly retire: boolean;
  readonly motif_retrait?: string;
  readonly taux_changement_contrefactuel?: number;
  readonly changements_contrefactuel?: ChangementsContrefactuel;
  /** D31 (1) : présent pour chaque juge d'un test terminé, 0 compris. */
  readonly paires_ecartees_contrefactuel?: number;
  /** D31 (1) : toutes les paires écartées, taux indéfini. */
  readonly motif_indefini_contrefactuel?: "toutes_paires_ecartees";
}

export interface PublicationContrefactuel {
  readonly contrefactuel_candidats: BlocContrefactuelCandidats;
  readonly juges: readonly JugePublie[];
  readonly taux_echantillon_humain: TauxEchantillonHumain;
  /** Présente seulement quand les deux juges sont retirés (D16 (3)) ; lue par `inscription-contrefactuel.ts`. */
  readonly invalidation?: { readonly motif: string };
}

export class ContrefactuelNonPubliable extends Error {
  constructor(detail: string) {
    super(`Test contrefactuel non publiable : ${detail}`);
    this.name = "ContrefactuelNonPubliable";
  }
}

export function publierContrefactuel(
  resultat: ResultatContrefactuel,
  sous_ensemble: SousEnsembleContrefactuel,
  derangement: Derangement,
  run: RunDeNotation,
): PublicationContrefactuel {
  if (resultat.sous_effectif !== sous_ensemble.sous_effectif) {
    throw new ContrefactuelNonPubliable(`sous_effectif ${String(resultat.sous_effectif)} au résultat, ${String(sous_ensemble.sous_effectif)} au tirage.`);
  }
  switch (resultat.statut) {
    case "en_attente":
      throw new ContrefactuelNonPubliable(`${resultat.paires_incompletes.length} paire(s) incomplète(s) : aucun taux sur un jeu incomplet (D16 (2)).`);
    case "indefini":
      return publierIndefini(resultat, sous_ensemble, derangement, run);
    case "termine":
      return publierTermine(resultat.juges, resultat, sous_ensemble, derangement, run, resultat.taux_echantillon_humain);
    case "run_invalide":
      return {
        ...publierTermine(resultat.juges, resultat, sous_ensemble, derangement, run, TAUX_ECHANTILLON_APRES_RETRAIT),
        invalidation: { motif: resultat.raison },
      };
  }
}

interface Commun {
  readonly sous_effectif: boolean;
  readonly mentions_residuelles: number;
}

function bloc(etat: BlocContrefactuelCandidats["etat"], commun: Commun, sous_ensemble: SousEnsembleContrefactuel, derangement: Derangement): BlocContrefactuelCandidats {
  return {
    etat,
    eligibles: sous_ensemble.eligibles,
    taille_visee: sous_ensemble.taille_visee,
    taille: sous_ensemble.reponse_ids.length,
    sous_effectif: commun.sous_effectif,
    correspondances: correspondancesDe(derangement),
    cle_graine: [...CLE_SOUS_ENSEMBLE_CONTREFACTUEL],
    cle_graine_derangement: [...CLE_DERANGEMENT_CANDIDATS],
    mentions_residuelles: commun.mentions_residuelles,
  };
}

function publierIndefini(commun: Commun, sous_ensemble: SousEnsembleContrefactuel, derangement: Derangement, run: RunDeNotation): PublicationContrefactuel {
  if (sous_ensemble.reponse_ids.length > 0) {
    throw new ContrefactuelNonPubliable(`test indéfini alors que le sous-ensemble compte ${sous_ensemble.reponse_ids.length} réponse(s).`);
  }
  return {
    contrefactuel_candidats: bloc("indefini", commun, sous_ensemble, derangement),
    juges: run.juges.map((juge) => ({ juge_id: juge.juge_id, retire: false })),
    taux_echantillon_humain: TAUX_ECHANTILLON_SANS_RETRAIT,
  };
}

function publierTermine(
  juges: readonly ResultatJuge[],
  commun: Commun,
  sous_ensemble: SousEnsembleContrefactuel,
  derangement: Derangement,
  run: RunDeNotation,
  taux_echantillon_humain: TauxEchantillonHumain,
): PublicationContrefactuel {
  verifierJuges(juges, run);
  const taille = sous_ensemble.reponse_ids.length;
  return {
    contrefactuel_candidats: bloc("termine", commun, sous_ensemble, derangement),
    juges: juges.map((juge) => jugePublie(juge, taille)),
    taux_echantillon_humain,
  };
}

function verifierJuges(juges: readonly ResultatJuge[], run: RunDeNotation): void {
  const recus = juges.map((juge) => juge.juge_id).sort(comparerChaines);
  const attendus = run.juges.map((juge) => juge.juge_id).sort(comparerChaines);
  if (recus.join("\u0000") !== attendus.join("\u0000")) {
    throw new ContrefactuelNonPubliable(`juges du résultat (${recus.join(", ")}) différents de ceux du run ${run.id} (${attendus.join(", ")}).`);
  }
}

/** D31 (1) : dénominateur + paires écartées = taille du sous-ensemble ; tout écarté, aucun effectif. */
function jugePublie(juge: ResultatJuge, taille: number): JugePublie {
  if ("motif_indefini_contrefactuel" in juge) {
    if (juge.paires_ecartees_contrefactuel !== taille) throw new ContrefactuelNonPubliable(`juge ${juge.juge_id} : taux indéfini avec ${juge.paires_ecartees_contrefactuel} paire(s) écartée(s) sur ${taille}.`);
    return { juge_id: juge.juge_id, retire: false, paires_ecartees_contrefactuel: juge.paires_ecartees_contrefactuel, motif_indefini_contrefactuel: juge.motif_indefini_contrefactuel };
  }
  if (juge.taux.denominateur + juge.paires_ecartees_contrefactuel !== taille) {
    throw new ContrefactuelNonPubliable(`juge ${juge.juge_id} : dénominateur ${juge.taux.denominateur} et ${juge.paires_ecartees_contrefactuel} paire(s) écartée(s) pour un sous-ensemble de ${taille} réponse(s).`);
  }
  return {
    juge_id: juge.juge_id,
    retire: juge.retire,
    ...(juge.motif_retrait === undefined ? {} : { motif_retrait: juge.motif_retrait }),
    taux_changement_contrefactuel: juge.taux_changement_contrefactuel,
    changements_contrefactuel: { numerateur: juge.taux.numerateur, denominateur: juge.taux.denominateur },
    paires_ecartees_contrefactuel: juge.paires_ecartees_contrefactuel,
  };
}
