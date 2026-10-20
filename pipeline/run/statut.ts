/**
 * Les transitions du statut d'un run (décision D51, §6, §12), pures : elles reçoivent le `run.json`
 * déjà lu et rendent le nouveau, ou lèvent `TransitionRefusee` avec un motif nommé. Elles n'écrivent
 * rien ; l'écriture est à l'appelant (`invalidation.ts`, `pipeline/notation/inscription-contrefactuel.ts`).
 *
 * - `demarrer` (D51 (1)) : `planifie` ⇒ `en_cours`. Tout autre statut de départ est refusé, et un
 *   run qui porte une `invalidation` aussi : il ne part pas. L'interrogation (`pipeline/interrogation/run-gele.ts`)
 *   l'appelle avant la première tentative (lot gel, PR 4), par `demarrerOuReprendre`, qui admet aussi la reprise d'un run
 *   `en_cours` sans invalidation.
 * - `invalider` (D51 (2), (4)) : pose `invalidation { motif, date }` et laisse le statut inchangé.
 *   Le passage au statut `invalide` se fait avec le dépôt (§12 : un run invalide déclare sa
 *   publication et son dépôt), hors d'ici. Admis depuis `planifie` ou `en_cours` seulement : après
 *   publication, un défaut serait un erratum, que le protocole ne prévoit pas.
 *
 * **Règle 7.** Une `invalidation` déjà présente n'est jamais écrasée. D54 (5) : même `motif`, l'issue
 * est `deja_inscrite`, quelle que soit la date reçue (jamais comparée à `date_gel` dans ce cas) — la
 * date rendue est celle déjà inscrite, jamais celle de l'appel qui ne réécrit rien ; `motif`
 * différent, refus `invalidation_differente`.
 *
 * **Date.** Celle de l'horloge au moment de la commande, reçue de l'appelant. Elle est refusée si
 * elle précède `date_gel` ; exactement à `date_gel`, elle est admise : le run existe dès son gel
 * (convention semi-ouverte du dépôt, comme le gel exécuté à `date_gel`, `pipeline/gel/instants.ts`).
 */

import { canoniser } from "../../validation/domaine/empreinte.ts";
import { lireInstant } from "../interrogation/heure-paris.ts";
import { STATUT_EN_COURS, STATUT_PLANIFIE } from "./types.ts";
import type { StatutRun } from "./types.ts";

export interface Invalidation {
  readonly motif: string;
  readonly date: string;
  readonly run_remplacant_id?: string;
}

/** Ce que les transitions lisent d'un `run.json` ; tout autre champ est recopié tel quel. */
export interface RunAvecStatut {
  readonly statut: string;
  readonly date_gel: string;
  readonly invalidation?: Invalidation;
}

export type TransitionRun = "demarrer" | "invalider";

export type MotifTransition =
  | "statut_de_depart"
  | "porte_une_invalidation"
  | "motif_vide"
  | "date_illisible"
  | "date_avant_gel"
  | "invalidation_differente";

export class TransitionRefusee extends Error {
  readonly transition: TransitionRun;
  readonly motif: MotifTransition;

  constructor(transition: TransitionRun, motif: MotifTransition, detail: string) {
    super(`Transition « ${transition} » refusée (${motif}, décision D51) : ${detail} Rien n'est écrit.`);
    this.name = "TransitionRefusee";
    this.transition = transition;
    this.motif = motif;
  }
}

/** D51 (4) : les seuls statuts depuis lesquels un run s'invalide. */
const INVALIDABLES: ReadonlySet<string> = new Set<StatutRun>([STATUT_PLANIFIE, STATUT_EN_COURS]);

export function demarrer<T extends RunAvecStatut>(run: T): T {
  if (run.statut !== STATUT_PLANIFIE) {
    throw new TransitionRefusee("demarrer", "statut_de_depart", `le run est au statut « ${run.statut} » ; seul un run planifie démarre.`);
  }
  if (run.invalidation !== undefined) {
    throw new TransitionRefusee("demarrer", "porte_une_invalidation", `le run porte une invalidation (« ${run.invalidation.motif} ») ; il ne part pas.`);
  }
  return { ...run, statut: STATUT_EN_COURS };
}

export type IssueDemarrage<T> = { readonly issue: "demarre"; readonly run: T } | { readonly issue: "reprend" };

/**
 * Ce que l'interrogation fait du statut avant la première tentative (D51 (1), lot gel, PR 4) :
 * `planifie` démarre (`demarrer`) ; `en_cours` reprend, sans nouvelle transition ni rien à écrire,
 * sauf s'il porte une `invalidation` (posée pendant la fenêtre) : refus, il ne repart pas. Tout autre
 * statut est refusé par `demarrer`.
 */
export function demarrerOuReprendre<T extends RunAvecStatut>(run: T): IssueDemarrage<T> {
  if (run.statut !== STATUT_EN_COURS) return { issue: "demarre", run: demarrer(run) };
  if (run.invalidation !== undefined) {
    throw new TransitionRefusee("demarrer", "porte_une_invalidation", `le run en_cours porte une invalidation (« ${run.invalidation.motif} ») ; il ne reprend pas.`);
  }
  return { issue: "reprend" };
}

export type IssueInvalidation<T> =
  | { readonly issue: "inscrite"; readonly run: T }
  | { readonly issue: "deja_inscrite"; readonly date: string };

function exigerInvalidable(run: RunAvecStatut): void {
  if (INVALIDABLES.has(run.statut)) return;
  throw new TransitionRefusee(
    "invalider",
    "statut_de_depart",
    `le run est au statut « ${run.statut} » ; seul un run planifie ou en_cours s'invalide (D51 (4)).`,
  );
}

function exigerMotif(motif: string): void {
  if (motif.trim().length > 0) return;
  throw new TransitionRefusee("invalider", "motif_vide", "le motif de l'invalidation est vide ; il est obligatoire (§6 : « avec la raison »).");
}

function lireDate(date: string, contexte: string): number {
  try {
    return lireInstant(date, contexte);
  } catch (erreur) {
    if (!(erreur instanceof Error)) throw erreur;
    throw new TransitionRefusee("invalider", "date_illisible", erreur.message);
  }
}

function exigerDateApresGel(run: RunAvecStatut, date: string): void {
  if (lireDate(date, "date d'invalidation") >= lireDate(run.date_gel, "date_gel du run")) return;
  throw new TransitionRefusee("invalider", "date_avant_gel", `l'invalidation daterait de ${date}, avant date_gel (${run.date_gel}).`);
}

export function invalider<T extends RunAvecStatut>(run: T, motif: string, date: string): IssueInvalidation<T> {
  exigerInvalidable(run);
  exigerMotif(motif);
  // D54 (5) : même motif déjà inscrit ⇒ deja_inscrite quelle que soit la date reçue, jamais comparée
  // à date_gel dans ce cas ; la date rendue est celle déjà inscrite, rien n'est réécrit (règle 7).
  if (run.invalidation !== undefined && run.invalidation.motif === motif) {
    return { issue: "deja_inscrite", date: run.invalidation.date };
  }
  exigerDateApresGel(run, date);
  if (run.invalidation === undefined) return { issue: "inscrite", run: { ...run, invalidation: { motif, date } } };
  throw new TransitionRefusee(
    "invalider",
    "invalidation_differente",
    `le run porte déjà une invalidation différente (${canoniser(run.invalidation)}) ; elle n'est jamais réécrite (règle 7).`,
  );
}
