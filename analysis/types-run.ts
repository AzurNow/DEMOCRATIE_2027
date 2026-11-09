/**
 * Le statut, le type et le régime d'inclusion d'un run (`schema/run.schema.json#/properties/statut`,
 * `#/properties/type_run` et `#/properties/perimetre/properties/regime_inclusion`), recopiés une
 * seule fois : `tests/enumerations-schemas.test.ts` confronte `STATUTS_RUN`, `TYPES_RUN` et
 * `REGIMES_INCLUSION` à leur `enum` (constat 30, revue du 2026-10-17, avec le constat 38 du 2026-10-12).
 * Les constantes nommées ne couvrent que les valeurs effectivement écrites ailleurs que dans ce
 * fichier ou dans `schema/` : pas de valeur exportée sans lecteur.
 */

export const STATUTS_RUN = ["planifie", "en_cours", "publie", "publie_provisoire", "invalide"] as const;
export type StatutRun = (typeof STATUTS_RUN)[number];

export const STATUT_PLANIFIE = "planifie" satisfies StatutRun;
export const STATUT_EN_COURS = "en_cours" satisfies StatutRun;
export const STATUT_PUBLIE = "publie" satisfies StatutRun;
export const STATUT_PUBLIE_PROVISOIRE = "publie_provisoire" satisfies StatutRun;
export const STATUT_INVALIDE = "invalide" satisfies StatutRun;

export const TYPES_RUN = [
  "pilote",
  "mensuel",
  "hebdomadaire",
  "supplementaire_liste_officielle",
  "supplementaire_debat",
  "reexecution",
] as const;
export type TypeRun = (typeof TYPES_RUN)[number];

export const TYPE_PILOTE = "pilote" satisfies TypeRun;
export const TYPE_REEXECUTION = "reexecution" satisfies TypeRun;

/**
 * §3 (protocole 0.11 ; `entre_deux_tours` en 0.27, D68) : chaque run déclare son régime d'inclusion.
 * `schema/perimetre.schema.json#/properties/regime_inclusion` et
 * `schema/run.schema.json#/properties/perimetre/properties/regime_inclusion`.
 */
export const REGIMES_INCLUSION = ["avant_liste_officielle", "liste_officielle", "entre_deux_tours"] as const;
export type RegimeInclusion = (typeof REGIMES_INCLUSION)[number];

/**
 * `run.schema.json#/properties/reponses/properties/echantillons_par_question` : 2 au §6, 1 sous le
 * levier préenregistré du §12 (« nombre d'échantillons par question (2 → 1) »). Écrit ici seul
 * (revue du 2026-11-09, constat 18) : la lecture du run et l'interrogation (`pipeline/interrogation/`)
 * le lisent.
 */
export type EchantillonsParQuestion = 1 | 2;
