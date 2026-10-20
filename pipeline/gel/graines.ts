/**
 * Les six graines d'un run (`run.graines` : tirage, échantillon humain, bootstrap, permutation,
 * contrefactuel, alias des candidats).
 *
 * §5 (protocole 0.16), D44 : les valeurs sont dérivées de la balise drand quicknet, au premier tour
 * émis à l'instant de gel ou après, chacune par sa clé lisible (`balise.ts:valeursDesGraines`,
 * `run.json#/balise/cles`). Nul ne les choisit, et aucun chemin de `pnpm geler` n'en accepte d'autres.
 * La sixième, `alias_candidats` (protocole 0.20, D55 (9)), amorce la table alias aveugle de candidat
 * (`pipeline/notation/alias-candidats.ts`).
 *
 * Les six graines déclarent le générateur du tirage (`tirage.ts:GENERATEUR_DU_TIRAGE`,
 * SplitMix64 amorcé par sha256) : `run.schema.json` l'impose à l'échantillon humain, au
 * contrefactuel et à l'alias des candidats, `tirage.ts` le vérifie pour le tirage, et
 * `analysis/graines.ts` dérive les graines du bootstrap et de la permutation avec le même
 * algorithme.
 */

import { GENERATEUR_DU_TIRAGE } from "../questions/tirage.ts";
import type { GraineTirage } from "../questions/types.ts";

export const NOMS_GRAINES = ["tirage", "echantillon_humain", "bootstrap", "permutation", "contrefactuel", "alias_candidats"] as const;
export type NomGraine = (typeof NOMS_GRAINES)[number];

/** Les six valeurs entières, de 0 à 2^53 − 1 (`run.schema.json#/$defs/graine`). */
export type ValeursDesGraines = Readonly<Record<NomGraine, number>>;

/** `run.graines`. */
export type GrainesDuRun = Readonly<Record<NomGraine, GraineTirage>>;

/** `run.graines` : chaque valeur, avec la déclaration du générateur qui l'emploie. */
export function grainesDuRun(valeurs: ValeursDesGraines): GrainesDuRun {
  const graine = (nom: NomGraine): GraineTirage => ({ valeur: valeurs[nom], ...GENERATEUR_DU_TIRAGE });
  return {
    tirage: graine("tirage"),
    echantillon_humain: graine("echantillon_humain"),
    bootstrap: graine("bootstrap"),
    permutation: graine("permutation"),
    contrefactuel: graine("contrefactuel"),
    alias_candidats: graine("alias_candidats"),
  };
}
