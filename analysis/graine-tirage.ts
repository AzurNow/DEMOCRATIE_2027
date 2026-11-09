/**
 * Déclaration du générateur aléatoire employé par les tirages (§5, §9).
 *
 * « Les questions sont tirées de façon aléatoire stratifiée avec une graine publiée, ce qui rend
 * le tirage reproductible. » Le générateur est celui du dépôt (`validation/domaine/alea.ts`,
 * SplitMix64 amorcé par sha256 d'une chaîne). Une graine qui déclare un autre générateur
 * (`GENERATEUR_DU_TIRAGE`) est refusée avant tout tirage (constat n° 24) : un tiers qui rejouerait
 * avec le générateur déclaré obtiendrait un autre tirage.
 *
 * Seule définition, partagée par le tirage (`pipeline/questions/tirage.ts:tirer`) et les tirages de
 * notation (`pipeline/notation/echantillons.ts`, `derangement.ts`, `analysis/alias-candidats.ts`), qui vérifient
 * chacun leur propre graine contre le même générateur (constat n° 18 de la revue du 2026-10-12),
 * et par l'analyse du §8, qui vérifie ainsi les graines `bootstrap` et `permutation` du run avant
 * tout calcul (`analysis/analyse-du-run.ts:grainesDeLAnalyse`).
 */

import { ALGORITHME_ALEA } from "../validation/domaine/alea.ts";

/** Une graine publiée (`schema/tirage.schema.json#/properties/graine_tirage`, `run.json#/graines`). */
export interface GraineTirage {
  readonly valeur: number;
  readonly algorithme: string;
  readonly bibliotheque: string;
  readonly version: string;
}

/**
 * Le générateur que les tirages emploient réellement, tel qu'une graine publiée doit le déclarer
 * (§5 : « une graine publiée, ce qui rend le tirage reproductible » ; constat n° 24). `algorithme`
 * vient du module lui-même ; `bibliotheque` et `version` désignent ce module du dépôt. Une graine
 * qui en nomme un autre (PCG64, numpy…) promettrait un tirage qu'un tiers ne pourrait pas rejouer.
 */
export const GENERATEUR_DU_TIRAGE: Omit<GraineTirage, "valeur"> = {
  algorithme: ALGORITHME_ALEA,
  bibliotheque: "banc-essai-2027/validation/domaine/alea.ts",
  version: "1",
};

/** Une graine dont la déclaration ne désigne pas le générateur employé. */
export class GraineNonConforme extends Error {
  constructor(objet: string, champ: keyof typeof GENERATEUR_DU_TIRAGE, declare: string, attendu: string) {
    super(
      `Graine ${objet} non conforme : ${champ} « ${declare} » déclaré, alors que le tirage emploie ` +
        `${attendu} (${GENERATEUR_DU_TIRAGE.algorithme}, ${GENERATEUR_DU_TIRAGE.bibliotheque}, ` +
        `version ${GENERATEUR_DU_TIRAGE.version}). Un tiers qui rejouerait avec le générateur déclaré ` +
        `obtiendrait un autre tirage (§5, §9).`,
    );
    this.name = "GraineNonConforme";
  }
}

/** Un champ de la déclaration d'une graine qui ne désigne pas le générateur du tirage. */
export interface ChampNonConforme {
  readonly champ: keyof typeof GENERATEUR_DU_TIRAGE;
  /** La valeur déclarée ; `undefined` : le champ manque, et aucune valeur n'est supposée à sa place. */
  readonly declare: string | undefined;
  readonly attendu: string;
}

const CHAMPS_DU_GENERATEUR = ["algorithme", "bibliotheque", "version"] as const;

/**
 * Les champs de `graine` qui ne désignent pas `GENERATEUR_DU_TIRAGE`, dans l'ordre algorithme,
 * bibliothèque, version ; vide si la graine est conforme. La règle de `verifierGraine`, sans lever :
 * l'analyse (`analyse-du-run.ts:grainesDeLAnalyse`) nomme toutes ses graines fautives à la fois.
 */
export function champsNonConformes(graine: Partial<GraineTirage>): readonly ChampNonConforme[] {
  return CHAMPS_DU_GENERATEUR.flatMap((champ) => {
    const attendu = GENERATEUR_DU_TIRAGE[champ];
    return graine[champ] === attendu ? [] : [{ champ, declare: graine[champ], attendu }];
  });
}

/**
 * Une graine qui déclare un autre générateur que celui du tirage promet un tirage non rejouable
 * (constat 18 de la revue du 2026-10-12 : seule définition, partagée par tous les tirages de
 * notation). `objet` nomme ce que la graine vérifiée désigne dans le message de refus — « du
 * tirage » pour celle de `tirer`, « de l'échantillon », « du dérangement » ou « de la table
 * d'alias » pour celles de `pipeline/notation/` — et est obligatoire : un message qui dirait
 * toujours « du tirage » pour une graine d'échantillon, de dérangement ou d'alias nommerait le
 * mauvais objet vérifié (relecture du 2026-10-21 du constat 18).
 */
export function verifierGraine(graine: GraineTirage, objet: string): void {
  const [premier] = champsNonConformes(graine);
  if (premier !== undefined) throw new GraineNonConforme(objet, premier.champ, graine[premier.champ], `« ${premier.attendu} »`);
}
