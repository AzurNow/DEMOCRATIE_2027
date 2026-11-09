/**
 * Les critères go/no-go du §12 et la décision qui en découle (D24 de l'auteur, 2026-10-09), plus le
 * seuil de publication du kappa de la paire de juges sur le jeu d'or, que le §7 pose à part
 * (« en dessous, les résultats sont publiés avec la mention « provisoire » » ; constat 1 de la
 * conformité du 2026-11-09).
 *
 * Les codes et leur ordre sont ceux de `schema/run.schema.json#/properties/go_no_go` : l'ordre fixe
 * celui des critères écrits dans `run.json` et celui des codes énumérés dans le motif d'une
 * décision provisoire. Les sept du §12 dans l'ordre du §12, puis celui du §7. Rien ne s'ajoute ici
 * sans amendement du protocole.
 */

export const CODES_CRITERES = [
  "kappa_juges_humains",
  "test_contrefactuel",
  "aucun_item_conteste_dans_le_tirage",
  "tests_symetrie",
  "reponses_manquantes",
  "erreurs_graves_revues",
  "analyses_preenregistrees_executees",
  "kappa_paire_jeu_or",
] as const;
export type CodeCritere = (typeof CODES_CRITERES)[number];

export type StatutCritere = "vert" | "rouge";

/** Un critère tel que `run.json#/go_no_go/criteres` le publie. */
export interface Critere {
  readonly code: CodeCritere;
  readonly statut: StatutCritere;
  readonly valeur: number | string;
  readonly seuil: number | string;
}

export type DecisionPublication = "publie" | "publie_provisoire";

export interface GoNoGo {
  readonly criteres: readonly Critere[];
  readonly decision: DecisionPublication;
  /** Présent si et seulement si la décision est provisoire : les codes rouges, dans l'ordre fixe. */
  readonly motif?: string;
}

/** Valeur publiée d'un critère quand aucun juge n'est retenu : une absence de mesure (D24 (2)). */
export const AUCUN_JUGE_RETENU = "aucun juge retenu";
