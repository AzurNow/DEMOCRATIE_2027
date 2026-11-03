/**
 * L'intervalle de chaque taux publié, sur chacune de ses strates (§8, « Incertitude » et « Graines de
 * l'analyse », protocole 0.24, D59 (7)).
 *
 * « Tous les taux, ceux des métriques secondaires compris, sur chacune de leurs strates, sont
 * accompagnés d'un intervalle de confiance à 95 % par bootstrap en grappes ». La clé d'un taux est
 * « la famille (`bootstrap` […]), puis l'outil, le mode, la métrique et la strate. […] La strate
 * s'écrit `global` pour l'ensemble des réponses du couple, et `candidat:<id>`, `theme:<t>`,
 * `gabarit:<g>` ou `registre:<r>` pour un candidat, un thème, un gabarit ou une formulation. »
 *
 * Ce module ne définit aucune métrique : chaque taux est calculé par sa fonction de `metriques.ts`,
 * l'intervalle par `bootstrap.ts:intervalleNomme`. Il ne fait que dire quel taux est publié sur
 * quelle strate, et sous quelle clé.
 *
 * **Quels taux, sur quelles strates.** Les taux primaires du §8 et la répartition des drapeaux parmi
 * les inexactes sont publiés par couple outil × mode : strate `global`. L'exactitude l'est aussi par
 * candidat, par thème, par gabarit et par formulation (métriques secondaires du §8) : strates
 * `candidat:`, `theme:`, `gabarit:`, `registre:`. Les candidats sous le seuil de couverture n'ont
 * pas de strate (§8 : aucune statistique) ; leurs réponses restent dans la strate `global`, comme
 * dans `metriques.ts:metriquesPrimaires`.
 *
 * **Quelles strates.** Celles relevées une fois sur les unités du calcul principal
 * (`stratesDuCalculPrincipal`), puis données telles quelles à chaque couple et à chaque recalcul de
 * robustesse : une strate vide pour un couple, ou vidée par une restriction, est publiée absente
 * avec le motif `strate_vide`, jamais retirée ni mise à 0.
 *
 * **Le taux absent.** Sur une strate vide, le taux n'a pas de valeur (`strate_vide`) ; sur une strate
 * non vide dont le dénominateur est nul, non plus (`denominateur_nul`). L'intervalle est alors
 * lui-même absent, avec la raison que donne `bootstrap.ts` (`aucune_grappe`,
 * `aucun_reechantillon_defini`).
 *
 * **Les comparateurs** (§8, protocole 0.27, D62 : « Un taux qui n'a pas de mode, celui d'un
 * comparateur ou du canal application, porte à la place du mode le composant `lecture` ou
 * `application` ») : couverture et exactitude de chaque comparateur inclus, strate `global`, l'ensemble
 * de ses lectures, une par item P de référence (`tauxPubliesDuComparateur`). La grappe est l'item lu.
 *
 * **Hors de ce module** : le canal application, exploratoire, attend son lot.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import { intervalleNomme, tauxDegenere, valeurDuTaux, type Grappee, type IntervalleNomme, type Statistique, type TauxDegenere } from "./bootstrap.ts";
import { exigerDuCouple, unitesParCoupleCompare } from "./couples-compares.ts";
import type { UniteAnalyse } from "./filtre.ts";
import {
  confirmationPremisse,
  couverture,
  exactitude,
  exactitudeDesLectures,
  repartitionDrapeaux,
  sourcageValide,
  tauxFabrication,
  tauxNonReponse,
  tauxObsolescence,
  tauxObsolescenceFraiche,
  type LectureNotee,
  type TauxPrimaires,
} from "./metriques.ts";
import { repartirParCandidat, type PartageCandidats, type PartageCouples } from "./seuils.ts";
import { DRAPEAUX, type CoupleOutilMode, type Gabarit, type IdentifiantCourt, type Registre, type Taux, type Theme } from "./types.ts";

/** §8 : la strate de l'ensemble des réponses d'un couple. */
export const STRATE_GLOBALE = "global";

/**
 * Le nom publié de chaque taux primaire, dans la clé de sa graine : le nom de son champ dans
 * `TauxPrimaires`. Le type exige qu'aucun taux primaire ne manque ici. Les deux effectifs
 * (`reponses_obtenues`, `non_classees`, D64) sont des nombres, pas des taux : sans intervalle.
 */
const TAUX_PRIMAIRES: Readonly<Record<Exclude<keyof TauxPrimaires, "reponses_obtenues" | "non_classees">, Statistique>> = {
  exactitude,
  non_reponse: tauxNonReponse,
  fabrication: tauxFabrication,
  obsolescence: tauxObsolescence,
  obsolescence_fraiche: tauxObsolescenceFraiche,
  confirmation_premisse: confirmationPremisse,
  sourcage_valide: sourcageValide,
};

/** Préfixe des parts de la répartition des drapeaux parmi les inexactes (§8, métriques secondaires). */
const PREFIXE_REPARTITION = "repartition_drapeaux";

const TAUX_GLOBAUX: readonly (readonly [string, Statistique])[] = [
  ...Object.entries(TAUX_PRIMAIRES),
  ...DRAPEAUX.map((drapeau): [string, Statistique] => [
    `${PREFIXE_REPARTITION}:${drapeau}`,
    (unites) => repartitionDrapeaux(unites).parts[drapeau],
  ]),
];

/** Les métriques publiées sur la strate `global`, dans l'ordre de publication. */
export const METRIQUES_GLOBALES: readonly string[] = TAUX_GLOBAUX.map(([metrique]) => metrique);

/** La seule métrique publiée sur les strates candidat, thème, gabarit et formulation (§8). */
const METRIQUE_STRATIFIEE = "exactitude";

export interface StratesPubliees {
  readonly candidats: readonly IdentifiantCourt[];
  readonly themes: readonly Theme[];
  readonly gabarits: readonly Gabarit[];
  readonly registres: readonly Registre[];
}

/**
 * Les strates du run, relevées sur les unités du calcul principal (tous couples compris), chaque
 * liste triée (`comparerChaines`). Candidats : les seuls comparés du partage du seuil de couverture,
 * lu au gel ; un candidat inconnu du partage lève (`repartirParCandidat`). Une question
 * d'attribution n'ouvre aucune strate candidat, un thème non renseigné aucune strate thème.
 */
export function stratesDuCalculPrincipal(unites: readonly UniteAnalyse[], partage: PartageCandidats): StratesPubliees {
  const { comparees } = repartirParCandidat(unites, partage);
  return {
    candidats: distincts(comparees.map((u) => u.candidat_id as IdentifiantCourt)),
    themes: distincts(unites.flatMap((u) => (u.theme === null ? [] : [u.theme]))),
    gabarits: distincts(unites.map((u) => u.gabarit)),
    registres: distincts(unites.map((u) => u.registre)),
  };
}

function distincts<T extends string>(valeurs: readonly T[]): T[] {
  return [...new Set(valeurs)].sort(comparerChaines);
}

/** Pourquoi un taux publié n'a pas de valeur. Jamais 0 à sa place. */
export type MotifTauxAbsent = "strate_vide" | "denominateur_nul";

export interface TauxPublie {
  readonly metrique: string;
  readonly strate: string;
  readonly taux: Taux;
  /** `null` quand le taux a une valeur. */
  readonly motif_absence: MotifTauxAbsent | null;
  readonly intervalle: IntervalleNomme;
  /**
   * §8 (0.27, 0.28) : « aucun événement observé sur n grappes » (`aucun_evenement`, intervalle
   * [0 ; 0]) ou « aucun non-événement observé sur n grappes » (`aucun_non_evenement`, [1 ; 1]), n
   * étant `intervalle.intervalle.nombre_grappes`. `null` pour un taux ni nul ni égal à 1, et pour un
   * taux absent (`motif_absence`). Lu sur les effectifs du taux (`bootstrap.ts:tauxDegenere`).
   */
  readonly taux_degenere: TauxDegenere | null;
}

/** `run.graines.bootstrap.valeur` et le nombre de rééchantillonnages ; la clé est écrite ici. */
export interface OptionsIncertitude {
  readonly reechantillonnages: number;
  readonly graine_du_run: number;
}

interface StrateDeCalcul<U extends Grappee = UniteAnalyse> {
  readonly strate: string;
  readonly unites: readonly U[];
}

/**
 * Tous les taux publiés d'un couple comparé, chacun avec son intervalle : d'abord ceux de la strate
 * `global` (`METRIQUES_GLOBALES`), puis l'exactitude par candidat, thème, gabarit et formulation,
 * dans l'ordre de `strates`.
 */
export function tauxPublies(
  unitesDuCouple: readonly UniteAnalyse[],
  couple: CoupleOutilMode,
  strates: StratesPubliees,
  partage: PartageCandidats,
  options: OptionsIncertitude,
): TauxPublie[] {
  exigerDuCouple(unitesDuCouple, couple);
  const globale: StrateDeCalcul = { strate: STRATE_GLOBALE, unites: unitesDuCouple };
  return [
    ...TAUX_GLOBAUX.map(([metrique, statistique]) => publier(couple, metrique, statistique, globale, options)),
    ...stratesSecondaires(unitesDuCouple, strates, partage).map((s) => publier(couple, METRIQUE_STRATIFIEE, exactitude, s, options)),
  ];
}

function stratesSecondaires(
  unites: readonly UniteAnalyse[],
  strates: StratesPubliees,
  partage: PartageCandidats,
): StrateDeCalcul[] {
  const { comparees } = repartirParCandidat(unites, partage);
  return [
    ...strates.candidats.map((id) => ({ strate: `candidat:${id}`, unites: comparees.filter((u) => u.candidat_id === id) })),
    ...strates.themes.map((t) => ({ strate: `theme:${t}`, unites: unites.filter((u) => u.theme === t) })),
    ...strates.gabarits.map((g) => ({ strate: `gabarit:${g}`, unites: unites.filter((u) => u.gabarit === g) })),
    ...strates.registres.map((r) => ({ strate: `registre:${r}`, unites: unites.filter((u) => u.registre === r) })),
  ];
}

function publier(
  couple: CoupleOutilMode,
  metrique: string,
  statistique: Statistique,
  strate: StrateDeCalcul,
  options: OptionsIncertitude,
): TauxPublie {
  return publierSousCle([couple.outil_id, couple.mode], metrique, statistique, strate, options);
}

/** `tete` : l'outil, puis le mode ou, pour un taux sans mode, le composant qui le remplace (§8). */
function publierSousCle<U extends Grappee>(
  tete: readonly [string, string],
  metrique: string,
  statistique: Statistique<U>,
  strate: StrateDeCalcul<U>,
  options: OptionsIncertitude,
): TauxPublie {
  const t = statistique(strate.unites);
  const intervalle = intervalleNomme(strate.unites, valeurDuTaux(statistique), {
    ...options,
    cle: [...tete, metrique, strate.strate],
  });
  return { metrique, strate: strate.strate, taux: t, motif_absence: motifAbsence(strate.unites, t), intervalle, taux_degenere: tauxDegenere(t) };
}

function motifAbsence(unites: readonly unknown[], t: Taux): MotifTauxAbsent | null {
  if (t.valeur !== undefined) return null;
  return unites.length === 0 ? "strate_vide" : "denominateur_nul";
}

export interface TauxDuCouple {
  readonly couple: CoupleOutilMode;
  readonly taux: readonly TauxPublie[];
}

export interface TauxDuRun {
  /** Chaque couple comparé du partage, trié par `cleCouple`, même sans unité. */
  readonly compares: readonly TauxDuCouple[];
  /** §8 : couples « run incomplet », sans aucune statistique. */
  readonly couples_incomplets: readonly CoupleOutilMode[];
}

/**
 * Les taux publiés de chaque couple comparé. Le partage des couples et celui des candidats sont
 * reçus, jamais recalculés : un recalcul de robustesse qui les reçoit tels quels ne réapplique
 * aucun seuil (§8, D59 (8) ; `robustesse-taux.ts`).
 */
export function tauxPubliesParCouple(
  unites: readonly UniteAnalyse[],
  couples: PartageCouples,
  strates: StratesPubliees,
  partage: PartageCandidats,
  options: OptionsIncertitude,
): TauxDuRun {
  return {
    compares: unitesParCoupleCompare(unites, couples).map(({ couple, unites: membres }) => ({
      couple,
      taux: tauxPublies(membres, couple, strates, partage, options),
    })),
    couples_incomplets: couples.incomplets,
  };
}

/** §8 : le composant qui tient la place du mode dans la clé d'un taux de comparateur. */
export const COMPOSANT_LECTURE = "lecture";

/**
 * §8 : le nom de la couverture dans la clé de sa graine. Le §8 nomme la métrique (« couverture
 * (items P affichés / items P de référence) ») sans l'écrire dans la liste des noms de métrique de
 * la clé : question ouverte à l'auteur, ce nom est le seul endroit à changer.
 */
export const METRIQUE_COUVERTURE = "couverture";

export interface TauxDuComparateur {
  readonly outil_id: IdentifiantCourt;
  readonly couverture: TauxPublie;
  readonly exactitude: TauxPublie;
}

/**
 * Couverture et exactitude d'un comparateur, strate `global` (toutes ses lectures), chacune avec son
 * intervalle sous la clé `<outil> / lecture / <métrique> / global`. Une lecture non affichée est
 * dans les grappes de l'exactitude et hors de son dénominateur, comme une non-réponse d'assistant
 * (§8 : « la même règle des deux côtés »).
 */
export function tauxPubliesDuComparateur(outil_id: IdentifiantCourt, lectures: readonly LectureNotee[], options: OptionsIncertitude): TauxDuComparateur {
  const globale: StrateDeCalcul<LectureNotee> = { strate: STRATE_GLOBALE, unites: lectures };
  const tete = [outil_id, COMPOSANT_LECTURE] as const;
  return {
    outil_id,
    couverture: publierSousCle(tete, METRIQUE_COUVERTURE, couverture, globale, options),
    exactitude: publierSousCle(tete, METRIQUE_STRATIFIEE, exactitudeDesLectures, globale, options),
  };
}
