/**
 * Le run de l'application du mois (§6, QR8, protocole 0.31 ; décision D73 (11)) : « Le run dont le
 * sous-échantillon est saisi est le premier run mensuel ou hebdomadaire du mois civil, compté en UTC,
 * ni le run pilote ni un run supplémentaire, et il est désigné à son gel. » Le gel l'inscrit dans
 * `run.json#/application_testee` ; l'interrogation ne prévoit le sous-échantillon de l'application
 * que d'un run désigné (`pipeline/interrogation/sous-echantillon-application.ts`).
 *
 * **L'instant qui situe un run dans le mois** est sa `date_gel` (D74 (11), recommandation « instant
 * de gel ») : l'instant de référence unique du run, inscrit dans `run.json`, que quiconque relit. Le
 * mois civil est celui de cet instant en UTC, jamais à Paris : un gel le 1er février à 00:30, heure
 * de Paris, est de janvier.
 *
 * **Ce qui est désigné.** Un run de `type_run` `mensuel` ou `hebdomadaire` est désigné si aucun autre
 * run de ces types, déjà gelé sous `runs/`, n'a sa `date_gel` dans le même mois UTC. Un pilote ou un
 * supplémentaire n'est jamais désigné, et ne prend jamais la place du suivant. Le `statut` des runs
 * déjà gelés n'est pas lu : la désignation est faite au gel et ne bouge plus ; un premier run du mois
 * invalidé ensuite reste le premier.
 *
 * **Réexécution** (§6, protocole 0.33 : « la réexécution qui le remplace hérite de sa désignation » ;
 * D75 (20)). Une `reexecution` recopie l'`application_testee` du run qu'elle remplace, tel qu'il le
 * porte, sous l'une quelconque des trois formes : désigné, `mois_deja_servi`, ou `type_run_exclu`
 * pour la réexécution d'un pilote ou d'un supplémentaire. La réexécution d'une réexécution recopie
 * ce qu'a hérité celle-ci : la désignation passe de proche en proche jusqu'au run d'origine. Elle
 * n'entre pas, en retour, dans le choix du premier run d'un mois (`TYPES_DESIGNABLES`).
 *
 * **Refus nommés** (`ApplicationRefusee`), jamais une désignation devinée :
 *   - `gel_hors_ordre` : un run désignable du même mois est déjà gelé à une `date_gel` strictement
 *     postérieure à la nôtre ; sa propre désignation, faite à son gel, serait fausse ;
 *   - `premier_ambigu` : deux runs désignables déjà gelés du mois partagent la plus petite `date_gel` ;
 *   - `run_remplace_sans_designation` : le `run.json` du run que remplace une réexécution ne porte pas
 *     `application_testee` ; rien n'est hérité par défaut.
 *
 * Un run déjà gelé à la **même** `date_gel` que la nôtre (possible seulement hors de `runs/`, avec
 * `--sortie`, puisque le répertoire porterait le même nom) a été gelé avant nous : il est le premier,
 * et ce gel n'est pas désigné (`mois_deja_servi`).
 */

import { join } from "node:path";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { TYPE_REEXECUTION, type TypeRun } from "../run/types.ts";
import { lireRunsDuDepot } from "./precedent.ts";

/** §6 : les seuls types qu'on désigne ; les autres sont nommés par leur exclusion. */
const TYPES_DESIGNABLES: ReadonlySet<string> = new Set<TypeRun>(["mensuel", "hebdomadaire"]);

/** `run.schema.json#/properties/application_testee`. */
export type ApplicationTestee =
  | { readonly designe: true; readonly mois_utc: string }
  | { readonly designe: false; readonly mois_utc: string; readonly motif: "type_run_exclu" }
  | { readonly designe: false; readonly mois_utc: string; readonly motif: "mois_deja_servi"; readonly premier_run_id: string };

/** Ce que le choix lit d'un run déjà gelé sous `runs/` (`precedent.ts:RunDeRuns` en est un). */
export interface RunGelePourApplication {
  readonly repertoire: string;
  readonly id: string;
  readonly type_run: string;
  readonly date_gel_ms: number;
  /** Sa propre désignation, quand son `run.json` la porte ; lue pour la réexécution qui le remplace. */
  readonly application_testee?: ApplicationTestee;
}

export type MotifApplication = "gel_hors_ordre" | "premier_ambigu" | "run_remplace_sans_designation";

export class ApplicationRefusee extends Error {
  readonly motif: MotifApplication;

  constructor(motif: MotifApplication, detail: string) {
    super(`Run de l'application du mois refusé (${motif}, §6, D73 (11)) : ${detail} Rien n'est écrit.`);
    this.name = "ApplicationRefusee";
    this.motif = motif;
  }
}

/** `AAAA-MM` de l'instant, en UTC. */
export function moisCivilUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function exigerAucunPosterieur(du_mois: readonly RunGelePourApplication[], date_gel_ms: number): void {
  const posterieur = du_mois.find((run) => run.date_gel_ms > date_gel_ms);
  if (posterieur === undefined) return;
  throw new ApplicationRefusee(
    "gel_hors_ordre",
    `runs/${posterieur.repertoire} (${posterieur.type_run}) est gelé à ${iso(posterieur.date_gel_ms)}, dans le même mois UTC, ` +
      `après la date_gel de ce gel (${iso(date_gel_ms)}) : sa désignation au gel serait fausse.`,
  );
}

function premierDuMois(anterieurs: readonly RunGelePourApplication[]): RunGelePourApplication {
  const tries = [...anterieurs].sort((a, b) => a.date_gel_ms - b.date_gel_ms || comparerChaines(a.repertoire, b.repertoire));
  const [premier, second] = tries;
  if (premier === undefined) throw new Error("Invariant violé (application) : aucun run antérieur du mois.");
  if (second !== undefined && second.date_gel_ms === premier.date_gel_ms) {
    throw new ApplicationRefusee(
      "premier_ambigu",
      `runs/${premier.repertoire} et runs/${second.repertoire} partagent la date_gel ${iso(premier.date_gel_ms)} : le premier du mois n'est pas à deviner.`,
    );
  }
  return premier;
}

/**
 * D75 (20) : la désignation que porte le run remplacé, telle quelle. Son existence et son invalidation
 * sont vérifiées avant (`remplacement.ts:lireRemplacement`) : un run introuvable ici est un invariant violé.
 */
function designationHeritee(runs: readonly RunGelePourApplication[], run_remplace_id: string | undefined): ApplicationTestee {
  const remplace = runs.find((run) => run.id === run_remplace_id);
  if (remplace === undefined) throw new Error(`Invariant violé (application) : réexécution sans run remplacé lu sous runs/ (${String(run_remplace_id)}).`);
  if (remplace.application_testee !== undefined) return remplace.application_testee;
  throw new ApplicationRefusee(
    "run_remplace_sans_designation",
    `runs/${remplace.repertoire} (id ${remplace.id}), que remplace cette réexécution, ne porte pas application_testee : sa désignation n'est pas à deviner.`,
  );
}

/**
 * La désignation d'un gel de `type_run` à `date_gel_ms`, d'après les runs déjà gelés sous `runs/` ;
 * `run_remplace_id`, celui que remplace une réexécution, et seulement elle. Pure : les runs sont lus
 * par l'appelant (`lireApplicationTestee`).
 */
export function applicationDuGel(runs: readonly RunGelePourApplication[], type_run: string, date_gel_ms: number, run_remplace_id?: string): ApplicationTestee {
  if (type_run === TYPE_REEXECUTION) return designationHeritee(runs, run_remplace_id);
  const mois_utc = moisCivilUtc(date_gel_ms);
  if (!TYPES_DESIGNABLES.has(type_run)) return { designe: false, mois_utc, motif: "type_run_exclu" };
  const du_mois = runs.filter((run) => TYPES_DESIGNABLES.has(run.type_run) && moisCivilUtc(run.date_gel_ms) === mois_utc);
  exigerAucunPosterieur(du_mois, date_gel_ms);
  if (du_mois.length === 0) return { designe: true, mois_utc };
  return { designe: false, mois_utc, motif: "mois_deja_servi", premier_run_id: premierDuMois(du_mois).id };
}

/**
 * Lit `runs/` sous `racine` (le dépôt, `--sortie` ou non, comme le précédent) et rend la désignation.
 * Un seul `run.json` illisible sous `runs/` : refus (`precedent.ts:PrecedentRefuse`, `run_illisible`).
 */
export function lireApplicationTestee(racine: string, type_run: string, date_gel_ms: number, run_remplace_id: string | undefined): ApplicationTestee {
  return applicationDuGel(lireRunsDuDepot(join(racine, "runs")), type_run, date_gel_ms, run_remplace_id);
}
