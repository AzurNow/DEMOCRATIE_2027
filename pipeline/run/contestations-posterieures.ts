/**
 * Les contestations postérieures d'un run publié (§8, recalcul (b) : « en excluant les questions
 * dont un item, quel que soit son rôle, est contesté à un run ultérieur » ; protocole 0.30, D72 (1)).
 *
 * `run.json#/contestations_posterieures` est l'entrée exacte de (b) (`analysis/robustesse.ts`,
 * `analysis/recalcul-b.ts`). Ce module la tient à jour depuis la seule source des contestations, les
 * items publiés (`data/items/*.json#/contestations`, écrits par `pnpm contester`) :
 *
 * - seul un run publié la reçoit (`publie` ou `publie_provisoire`) : un run planifié, en cours ou
 *   invalide ne reçoit rien ;
 * - seule une contestation reçue **strictement après** `date_gel` y entre. Une contestation reçue à
 *   l'instant même du gel est du gel, comme une décision du panel datée de cet instant
 *   (`pipeline/questions/contestation.ts:decisionAvantGel`, `<=`) et comme le dit le schéma (« reçues
 *   APRÈS date_gel ») ;
 * - en ajout seul : les entrées déjà présentes restent telles quelles, à leur place ; les nouvelles
 *   s'ajoutent à la fin, dans l'ordre de leur réception puis de leur identifiant ;
 * - une contestation déjà présente (même `contestation_id`) n'est pas ajoutée une seconde fois. Si
 *   l'entrée présente diffère de la contestation de l'item (autre item ou autre date), rien n'est
 *   réécrit : `ContestationPosterieureDivergente` arrête tout.
 *
 * Partie pure : `contestationsRecues`, `contestationsAAjouter`. Partie lue et écrite :
 * `synchroniserContestationsPosterieures`, qui lit chaque `runs/<date>/run.json` (validé contre son
 * schéma par `lireRunJson`), calcule tous les ajouts, valide chaque run modifié, puis seulement
 * l'écrit par renommage (`ecriture.ts`). L'empreinte de `run.json` change avec l'ajout : c'est voulu
 * (§9, D72 (2)), Git est le journal.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { dispositionRunNote, lireRunJson, type RunLu } from "../../analysis/lecture-run.ts";
import type { ContestationPosterieure } from "../../analysis/types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { contestationsDe } from "../../validation/domaine/contestation-item.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { lireInstant } from "../interrogation/heure-paris.ts";
import { ecrireParRenommage } from "./ecriture.ts";
import { STATUT_PUBLIE, STATUT_PUBLIE_PROVISOIRE, type StatutRun } from "./types.ts";

/** La part d'un run que ce module lit. */
export interface RunEtSesContestations {
  readonly id: string;
  readonly date_gel: string;
  readonly statut: StatutRun;
  readonly contestations_posterieures?: readonly ContestationPosterieure[];
}

/** Une entrée présente diffère de la contestation de même identifiant : jamais réécrite. */
export class ContestationPosterieureDivergente extends Error {
  readonly run_id: string;
  readonly contestation_id: string;

  constructor(run_id: string, presente: ContestationPosterieure, recue: ContestationPosterieure) {
    super(
      `Run ${run_id} : la contestation ${presente.contestation_id} figure déjà dans contestations_posterieures ` +
        `(${JSON.stringify(presente)}), différente de celle des items (${JSON.stringify(recue)}). ` +
        `Une entrée publiée n'est jamais réécrite : rien n'est écrit.`,
    );
    this.name = "ContestationPosterieureDivergente";
    this.run_id = run_id;
    this.contestation_id = presente.contestation_id;
  }
}

const STATUTS_PUBLIES: ReadonlySet<StatutRun> = new Set([STATUT_PUBLIE, STATUT_PUBLIE_PROVISOIRE]);

/** Toutes les contestations portées par les items, sous la forme d'une entrée de `contestations_posterieures`. */
export function contestationsRecues(items: Iterable<Item>): readonly ContestationPosterieure[] {
  return [...items].flatMap((item) =>
    item.contestations === undefined
      ? []
      : contestationsDe(item).map((contestation) => ({ item_id: item.id, contestation_id: contestation.id, date_reception: contestation.date_reception })),
  );
}

function identiques(a: ContestationPosterieure, b: ContestationPosterieure): boolean {
  return a.item_id === b.item_id && a.contestation_id === b.contestation_id && a.date_reception === b.date_reception;
}

function presentes(run: RunEtSesContestations): readonly ContestationPosterieure[] {
  return run.contestations_posterieures === undefined ? [] : run.contestations_posterieures;
}

function instant(contestation: ContestationPosterieure): number {
  return lireInstant(contestation.date_reception, `contestation ${contestation.contestation_id}, date_reception`);
}

function ordreDeReception(a: ContestationPosterieure, b: ContestationPosterieure): number {
  return instant(a) - instant(b) || comparerChaines(a.contestation_id, b.contestation_id);
}

/**
 * Les contestations à ajouter à `run` : reçues strictement après son gel, absentes de sa liste,
 * chacune une fois. Vide pour un run qui n'est pas publié. Lève `ContestationPosterieureDivergente`
 * si une entrée présente, ou une autre contestation reçue de même identifiant, en diffère.
 */
export function contestationsAAjouter(run: RunEtSesContestations, recues: readonly ContestationPosterieure[]): readonly ContestationPosterieure[] {
  if (!STATUTS_PUBLIES.has(run.statut)) return [];
  const gel = lireInstant(run.date_gel, `run ${run.id}, date_gel`);
  const connues = new Map(presentes(run).map((entree) => [entree.contestation_id, entree]));
  const nouvelles = new Map<string, ContestationPosterieure>();
  for (const recue of recues) {
    const connue = connues.get(recue.contestation_id) ?? nouvelles.get(recue.contestation_id);
    if (connue !== undefined && !identiques(connue, recue)) throw new ContestationPosterieureDivergente(run.id, connue, recue);
    if (connue === undefined && instant(recue) > gel) nouvelles.set(recue.contestation_id, recue);
  }
  return [...nouvelles.values()].sort(ordreDeReception);
}

/* ---------------------------------------------------------------- lecture et écriture */

/** Ce qu'une synchronisation ajoute à un run. */
export interface AjoutAuRun {
  readonly repertoire: string;
  readonly run_id: string;
  readonly ajoutees: readonly ContestationPosterieure[];
}

interface AjoutPrepare extends AjoutAuRun {
  readonly run_json: string;
  readonly apres: unknown;
}

/** Les répertoires de `runs/`, triés : chacun doit porter un `run.json` lisible, sinon refus. */
function repertoiresDeRuns(runs: string): readonly string[] {
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
    .sort(comparerChaines)
    .map((nom) => join(runs, nom));
}

function preparer(repertoire: string, recues: readonly ContestationPosterieure[]): AjoutPrepare | null {
  const run: RunLu = lireRunJson(repertoire);
  const ajoutees = contestationsAAjouter(run, recues);
  if (ajoutees.length === 0) return null;
  const run_json = dispositionRunNote(repertoire).run_json;
  const apres = valider<unknown>("run", { ...run, contestations_posterieures: [...presentes(run), ...ajoutees] }, `${run_json} après ajout de contestations postérieures`);
  return { repertoire, run_id: run.id, ajoutees, run_json, apres };
}

/**
 * Ajoute à chaque run publié de `runs` les contestations des items reçues après son gel. Tout est
 * lu, calculé et validé avant la première écriture : un refus n'écrit rien. Sans `ecrire`, rien
 * n'est écrit et le résultat dit ce qui le serait.
 */
export function synchroniserContestationsPosterieures(runs: string, items: Iterable<Item>, ecrire: boolean): readonly AjoutAuRun[] {
  const recues = contestationsRecues(items);
  const ajouts = repertoiresDeRuns(runs)
    .map((repertoire) => preparer(repertoire, recues))
    .filter((ajout): ajout is AjoutPrepare => ajout !== null);
  if (ecrire) {
    for (const ajout of ajouts) ecrireParRenommage(ajout.run_json, ajout.apres, "contestations-posterieures");
  }
  return ajouts.map(({ repertoire, run_id, ajoutees }) => ({ repertoire, run_id, ajoutees }));
}
