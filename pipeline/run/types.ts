/**
 * Le statut et le type d'un run (`schema/run.schema.json#/properties/statut` et `#/properties/type_run`),
 * recopiés une seule fois : `tests/enumerations-schemas.test.ts` confronte `STATUTS_RUN` et
 * `TYPES_RUN` à leur `enum` (constat 30, revue du 2026-10-17, avec le constat 38 du 2026-10-12).
 * Les constantes nommées ne couvrent que les valeurs effectivement écrites ailleurs que dans ce
 * fichier ou dans `schema/` : pas de valeur exportée sans lecteur.
 */

export const STATUTS_RUN = ["planifie", "en_cours", "publie", "publie_provisoire", "invalide"] as const;
export type StatutRun = (typeof STATUTS_RUN)[number];

export const STATUT_PLANIFIE: StatutRun = "planifie";
export const STATUT_EN_COURS: StatutRun = "en_cours";
export const STATUT_PUBLIE: StatutRun = "publie";
export const STATUT_PUBLIE_PROVISOIRE: StatutRun = "publie_provisoire";

export const TYPES_RUN = [
  "pilote",
  "mensuel",
  "hebdomadaire",
  "supplementaire_liste_officielle",
  "supplementaire_debat",
  "reexecution",
] as const;
export type TypeRun = (typeof TYPES_RUN)[number];

export const TYPE_PILOTE: TypeRun = "pilote";
export const TYPE_REEXECUTION: TypeRun = "reexecution";
