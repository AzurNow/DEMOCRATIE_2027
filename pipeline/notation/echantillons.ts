/**
 * Les tirages de la notation (§7) : l'échantillon humain, le sous-ensemble du test contrefactuel, le
 * jeu d'or, et l'ordre de la file des annotateurs humains.
 *
 * §7 (protocole 0.13) : « L'échantillon humain et ce sous-ensemble sont tirés avec le générateur du
 * tirage (SplitMix64, `splitmix64-sha256-v1`), chacun avec sa graine dérivée de la graine publiée et
 * d'une clé lisible, comme en section 8. » La dérivation est celle d'`analysis/graines.ts`
 * (`graineDerivee`) : l'entier publié du run (`run.graines.echantillon_humain.valeur` ou
 * `run.graines.contrefactuel.valeur`) en décimal, puis chaque composant de la clé, joints par
 * U+0000, hachés en sha256 ; les huit premiers octets, en gros-boutiste, amorcent SplitMix64.
 *
 * Consommation du générateur, pour rejouer ailleurs : les identifiants reçus sont rangés dans
 * l'ordre croissant des chaînes (unités UTF-16, comme `<` en JavaScript), quel que soit l'ordre
 * reçu ; ils sont mélangés par Fisher-Yates du dernier au premier (`validation/domaine/alea.ts`,
 * `melanger`) ; le tirage est un préfixe de cet ordre.
 *
 * **Échantillon humain** (décision D14 (1) de l'auteur du 2026-10-05, texte proposé pour la 0.16).
 * Le test contrefactuel précède la notation des autres réponses, donc un retrait de juge est connu
 * avant ce tirage. L'échantillon de 25 % prolonge l'ordre de tirage de celui de 10 %, avec la même
 * graine, et le contient : c'est un seul ordre, dont on prend un préfixe plus ou moins long. Le
 * taux est lu dans `run.taux_echantillon_humain`, jamais supposé.
 *
 * **Taille de l'échantillon** : `⌈taux × n⌉`, calculée en entiers (`⌈n / 10⌉`, `⌈n / 4⌉`). Le §7 dit
 * « 10 % des réponses » sans arrondi ; l'arrondi au supérieur garantit au moins 10 % (resp. 25 %),
 * jamais moins, ce qui est le choix le plus restrictif pour une mesure de fiabilité. Une réponse
 * seule donne donc un échantillon d'une réponse ; zéro réponse, un échantillon vide. Le calcul en
 * entiers évite qu'un `0.1 × n` flottant tombe juste sous un entier.
 *
 * **Sous-ensemble contrefactuel** (D14 (2)) : 200 réponses tirées parmi celles dont la réponse ou
 * l'item nomme au moins un candidat interrogé (D55 (4) : `chaine.ts:estEligible`,
 * `permutation.ts:nommeUnInterroge`). Ce module ne reçoit que les éligibles, déjà filtrés. S'il y
 * en a moins de 200, toutes sont prises et le résultat le dit (`sous_effectif`), jamais en silence.
 *
 * **Jeu d'or** (§7, calibration ; D18 de l'auteur du 2026-10-06, texte proposé pour la 0.16) : 300
 * réponses tirées parmi les réponses obtenues du run pilote, avec la graine dérivée de
 * `run.graines.echantillon_humain` et de la clé `["jeu_or"]`, indépendamment de l'échantillon
 * humain (même entier publié, autre clé, donc autre suite aléatoire). Consommation identique à celle
 * des deux autres tirages : tri croissant des identifiants reçus, Fisher-Yates du dernier au premier,
 * préfixe de 300. Moins de 300 réponses obtenues : toutes sont prises, et `sous_effectif` le dit.
 * Texte haché : `<valeur>␀jeu_or`.
 *
 * **Ordre de la file humaine** (§7 ; D79 de l'auteur du 2026-11-05, texte proposé pour la 0.34) :
 * « L'ordre dans lequel les réponses sont présentées à un annotateur ne dépend pas du motif qui les
 * lui envoie : il est tiré parmi les réponses obtenues du run, avec une graine dérivée de la graine
 * publiée de l'échantillon humain et de la clé « ordre_file_humaine ». » Toutes les réponses obtenues
 * sont rangées (aucun préfixe), même consommation que les autres tirages. Un seul ordre par run,
 * commun à tous les annotateurs. Texte haché : `<valeur>␀ordre_file_humaine`.
 */

import { TAILLE_JEU_OR, TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL } from "../../analysis/parametres-protocole.ts";
import { graineDerivee } from "../../analysis/graines.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { verifierGraine } from "../../analysis/graine-tirage.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
import type { TauxEchantillonHumain } from "../../analysis/types-notation.ts";

/**
 * Clé lisible de la graine de l'échantillon humain, dérivée de `run.graines.echantillon_humain`.
 * Une seule clé pour 10 % et 25 % : c'est ce qui rend l'échantillon de 25 % emboîté sur celui de
 * 10 % (D14 (1)). Texte haché : `<valeur>␀echantillon_humain`.
 */
export const CLE_ECHANTILLON_HUMAIN: readonly string[] = ["echantillon_humain"];

/**
 * Clé lisible de la graine du sous-ensemble contrefactuel des candidats, dérivée de
 * `run.graines.contrefactuel`. Le troisième composant nomme l'usage : le dérangement des candidats
 * (PR B) et un éventuel sous-ensemble du contrefactuel outil auront chacun le leur, sans partager
 * de suite aléatoire. `noms_candidats` est la valeur de `reponse.permutation.type`.
 * Texte haché : `<valeur>␀contrefactuel␀noms_candidats␀sous_ensemble`.
 */
export const CLE_SOUS_ENSEMBLE_CONTREFACTUEL: readonly string[] = ["contrefactuel", "noms_candidats", "sous_ensemble"];

/**
 * Clé lisible de la graine du sous-ensemble du contrefactuel d'outil (§7 0.24, D59 (13) : « tirées
 * avec leur propre graine dérivée, comme celles du test des candidats »), dérivée de
 * `run.graines.contrefactuel`. §7 0.25 (D60) : « leur propre graine dérivée de la clé
 * `contrefactuel_outil` » : un seul composant, comme `jeu_or`.
 * Texte haché : `<valeur>␀contrefactuel_outil`.
 */
export const CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS: readonly string[] = ["contrefactuel_outil"];

/** §7 0.24 : « Ce sous-ensemble compte 200 réponses dont le texte nomme au moins un outil ». */
export const TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS = 200;

/**
 * Clé lisible de la graine du jeu d'or, dérivée de `run.graines.echantillon_humain` (D18).
 * Texte haché : `<valeur>␀jeu_or`.
 */
export const CLE_JEU_OR: readonly string[] = ["jeu_or"];

/**
 * Clé lisible de la graine de l'ordre de la file humaine, dérivée de `run.graines.echantillon_humain`
 * (D79) : distincte de celles de l'échantillon et du jeu d'or, donc une autre suite aléatoire.
 * Texte haché : `<valeur>␀ordre_file_humaine`.
 */
export const CLE_ORDRE_FILE_HUMAINE: readonly string[] = ["ordre_file_humaine"];

/** Le taux publié, écrit en fraction exacte : la taille se calcule en entiers. */
const FRACTION_DU_TAUX: ReadonlyMap<number, { readonly numerateur: number; readonly denominateur: number }> = new Map([
  [0.1, { numerateur: 1, denominateur: 10 }],
  [0.25, { numerateur: 1, denominateur: 4 }],
]);

export interface SousEnsembleContrefactuel {
  /** Les réponses tirées, dans l'ordre du tirage. */
  readonly reponse_ids: readonly string[];
  readonly eligibles: number;
  readonly taille_visee: number;
  /** Moins d'éligibles que la taille visée : tous sont pris, et c'est dit. */
  readonly sous_effectif: boolean;
}

export interface JeuOr {
  /** Les réponses tirées, dans l'ordre du tirage. */
  readonly reponse_ids: readonly string[];
  /** Nombre de réponses obtenues du run pilote parmi lesquelles le tirage a eu lieu. */
  readonly obtenues: number;
  readonly taille_visee: number;
  /** Moins de réponses obtenues que la taille visée : toutes sont prises, et c'est dit. */
  readonly sous_effectif: boolean;
}

/** `⌈taux × n⌉`, en entiers. */
export function tailleEchantillonHumain(nombreReponses: number, taux: TauxEchantillonHumain): number {
  if (!Number.isInteger(nombreReponses) || nombreReponses < 0) {
    throw new Error(`Nombre de réponses invalide : ${nombreReponses}.`);
  }
  const fraction = FRACTION_DU_TAUX.get(taux);
  if (fraction === undefined) {
    throw new Error(`Taux d'échantillon humain ${String(taux)} hors de run.schema.json (0.1 ou 0.25).`);
  }
  const produit = nombreReponses * fraction.numerateur;
  return Math.floor((produit + fraction.denominateur - 1) / fraction.denominateur);
}

/**
 * L'ordre de tirage de l'échantillon humain : un mélange des réponses, dont l'échantillon est un
 * préfixe. Exporté pour que le contrôle croisé et un tiers rejouent le même ordre.
 */
export function ordreEchantillonHumain(reponse_ids: readonly string[], graine: GraineTirage): readonly string[] {
  return ordreTire(reponse_ids, graine, CLE_ECHANTILLON_HUMAIN);
}

/** Les réponses de l'échantillon humain, dans l'ordre du tirage. */
export function tirerEchantillonHumain(
  reponse_ids: readonly string[],
  graine: GraineTirage,
  taux: TauxEchantillonHumain,
): readonly string[] {
  const taille = tailleEchantillonHumain(reponse_ids.length, taux);
  return ordreEchantillonHumain(reponse_ids, graine).slice(0, taille);
}

/**
 * L'échantillon humain d'un run, sous sa graine et son taux publiés : l'`EchantillonHumainDuRun` que
 * `analysis/lecture-run.ts:lireRun` reçoit pour recouper `accord_humains_echantillon` (§7.30).
 */
export function echantillonHumainDuRun(
  run: { readonly graines: { readonly echantillon_humain: GraineTirage }; readonly taux_echantillon_humain: TauxEchantillonHumain },
  obtenues: readonly string[],
): readonly string[] {
  return tirerEchantillonHumain(obtenues, run.graines.echantillon_humain, run.taux_echantillon_humain);
}

/** Le sous-ensemble contrefactuel, tiré parmi les réponses éligibles reçues. */
export function tirerSousEnsembleContrefactuel(
  eligibles: readonly string[],
  graine: GraineTirage,
): SousEnsembleContrefactuel {
  return sousEnsemble(eligibles, graine, CLE_SOUS_ENSEMBLE_CONTREFACTUEL, TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL);
}

/**
 * Le sous-ensemble du contrefactuel d'outil, tiré parmi les réponses éligibles reçues (celles dont
 * le texte nomme un outil : `derangement-outils.ts:estEligibleOutils`). Même consommation que celui
 * des candidats, autre clé ; moins de 200 éligibles : toutes, et `sous_effectif` le dit (« comme
 * celles du test des candidats », D14 (2)).
 */
export function tirerSousEnsembleContrefactuelOutils(eligibles: readonly string[], graine: GraineTirage): SousEnsembleContrefactuel {
  return sousEnsemble(eligibles, graine, CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS, TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS);
}

function sousEnsemble(eligibles: readonly string[], graine: GraineTirage, cle: readonly string[], taille: number): SousEnsembleContrefactuel {
  const ordre = ordreTire(eligibles, graine, cle);
  return {
    reponse_ids: ordre.slice(0, taille),
    eligibles: eligibles.length,
    taille_visee: taille,
    sous_effectif: eligibles.length < taille,
  };
}

/**
 * Le jeu d'or, tiré parmi les réponses obtenues du run pilote. `graine` est
 * `run.graines.echantillon_humain` du run pilote (D18).
 */
export function tirerJeuOr(reponse_ids: readonly string[], graine: GraineTirage): JeuOr {
  const ordre = ordreTire(reponse_ids, graine, CLE_JEU_OR);
  return {
    reponse_ids: ordre.slice(0, TAILLE_JEU_OR),
    obtenues: reponse_ids.length,
    taille_visee: TAILLE_JEU_OR,
    sous_effectif: reponse_ids.length < TAILLE_JEU_OR,
  };
}

/**
 * L'ordre de présentation des réponses obtenues du run aux annotateurs humains (D79), toutes
 * rangées. `graine` est `run.graines.echantillon_humain`.
 */
export function ordreFileHumaine(reponse_ids: readonly string[], graine: GraineTirage): readonly string[] {
  return ordreTire(reponse_ids, graine, CLE_ORDRE_FILE_HUMAINE);
}

function ordreTire(ids: readonly string[], graine: GraineTirage, cle: readonly string[]): readonly string[] {
  verifierGraine(graine, "de l'échantillon");
  const ranges = rangerSansDoublon(ids);
  return melanger(ranges, generateur(graineDerivee(graine.valeur, cle)));
}

/** Ordre croissant des chaînes ; un identifiant en double est une donnée corrompue, pas un poids. */
function rangerSansDoublon(ids: readonly string[]): string[] {
  const ranges = [...ids].sort(comparerChaines);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i] === ranges[i - 1]) throw new Error(`Identifiant en double dans un tirage de notation : ${String(ranges[i])}.`);
  }
  return ranges;
}
