/**
 * Ce que `pnpm go-no-go` lit de `runs/<date>/metriques/metriques.json` (écrit par `pnpm analyze`,
 * `analysis/analyse-du-run.ts`), validé contre `schema/metriques.schema.json` avant toute lecture :
 *
 * - `graines` : chaque `{cle, graine}` publié, pour le critère du §12 « les analyses préenregistrées
 *   ont été exécutées avec la graine publiée » (`criteres-run.ts:critereAnalysesExecutees`) ;
 * - `robustesse.taux` et `robustesse.differences` : leur statut, pour la case 7 de l'annexe F,
 *   « robustesse calculée » (`checklist.ts:constatRobustesseCalculee`).
 *
 * `metriques/` absent : `null`, le run n'a pas été analysé (critère rouge, case non faite).
 * `metriques/` présent sans `metriques.json` : refus nommé, jamais lu comme « absent ». Un fichier
 * illisible lève `JsonIllisible`, un fichier non conforme `ErreurSchema`, un fichier d'un autre run
 * `MetriquesDUnAutreRun`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { cheminMetriques } from "../../analysis/analyse-du-run.ts";
import type { Ulid } from "../../analysis/types.ts";
import { jsonDe, valider } from "../../outils/schemas/valider.ts";
import type { GraineDeResultat } from "./criteres-run.ts";

/** Une section de `metriques.json`, réduite à ce que lit la checklist : calculée, ou sans objet avec son motif. */
export type SectionLue = { readonly statut: "calcule" } | { readonly statut: "sans_objet"; readonly motif: string };

export interface RobustesseLue {
  readonly taux: SectionLue;
  readonly differences: SectionLue;
}

export interface MetriquesLues {
  readonly graines: readonly GraineDeResultat[];
  readonly robustesse: RobustesseLue;
}

/** La part de `metriques.json` que lit le go/no-go, après validation contre son schéma. */
interface VueMetriques extends MetriquesLues {
  readonly run_id: Ulid;
}

export class MetriquesSansFichier extends Error {
  constructor(repertoire: string, chemin: string) {
    super(`${repertoire} existe sans ${chemin} : une analyse interrompue ou un fichier déplacé ne se lit pas comme « métriques absentes ». Rien n'est écrit.`);
    this.name = "MetriquesSansFichier";
  }
}

export class MetriquesDUnAutreRun extends Error {
  constructor(chemin: string, lu: string, attendu: string) {
    super(`${chemin} porte run_id ${lu}, et non celui du run (${attendu}) : ses graines ne sont pas celles de ce run. Rien n'est écrit.`);
    this.name = "MetriquesDUnAutreRun";
  }
}

/** Le statut d'une section, et son motif si elle est sans objet : rien d'autre n'est retenu. */
function sectionLue(section: SectionLue): SectionLue {
  return section.statut === "calcule" ? { statut: "calcule" } : { statut: "sans_objet", motif: section.motif };
}

export function lireMetriques(repertoire_run: string, run_id: Ulid): MetriquesLues | null {
  const chemin = cheminMetriques(repertoire_run);
  const repertoire = dirname(chemin);
  if (!existsSync(repertoire)) return null;
  if (!existsSync(chemin)) throw new MetriquesSansFichier(repertoire, chemin);
  const vue = valider<VueMetriques>("metriques", jsonDe(readFileSync(chemin, "utf8"), chemin), chemin);
  if (vue.run_id !== run_id) throw new MetriquesDUnAutreRun(chemin, vue.run_id, run_id);
  return { graines: vue.graines, robustesse: { taux: sectionLue(vue.robustesse.taux), differences: sectionLue(vue.robustesse.differences) } };
}
