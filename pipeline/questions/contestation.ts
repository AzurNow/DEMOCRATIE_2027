/**
 * Contestation et arbitrage du panel : quand un item contesté revient-il au tirage ?
 *
 * §5 (protocole 0.3) : « Un item sorti de l'arbitrage du panel (annexe E) revient au tirage au
 * run suivant si la décision vaut maintien ou correction ; un retrait ou une non-évaluabilité
 * l'en sort. » La règle vit ici une seule fois. Elle est sortie de `tirage.ts` pour que
 * l'engendrement et la symétrie l'appellent sans cycle d'import (tirage importe l'engendrement).
 */

import { instantDe } from "../../analysis/instants.ts";
import type { DecisionPanelAuGel, Item } from "./types.ts";

/** Un item arbitré dont aucune décision du panel n'est lisible : refus, jamais exclusion muette. */
export class ArbitrageSansDecision extends Error {
  readonly item_id: string;

  constructor(item_id: string, detail: string) {
    super(`Item ${item_id} arbitré sans décision du panel exploitable : ${detail}.`);
    this.name = "ArbitrageSansDecision";
    this.item_id = item_id;
  }
}

/** Deux décisions différentes au même instant : aucun ordre n'est inventé pour les départager. */
export class DecisionsPanelSimultanees extends Error {
  readonly item_id: string;

  constructor(item_id: string, date: string, decisions: readonly string[]) {
    super(
      `Item ${item_id} : décisions du panel ${decisions.join(", ")} au même instant (${date}). ` +
        `La dernière décision n'est pas déterminable.`,
    );
    this.name = "DecisionsPanelSimultanees";
    this.item_id = item_id;
  }
}

/**
 * Une décision du panel datée après le gel ne peut pas être celle du gel : les items passés au
 * tirage ne sont pas ceux du gel, et figer cette décision ferait mentir le tirage publié.
 */
export class DecisionPanelPosterieureAuGel extends Error {
  readonly item_id: string;

  constructor(item_id: string, date: string, date_gel: string) {
    super(
      `Item ${item_id} : dernière décision du panel datée ${date}, après le gel ${date_gel}. ` +
        `Le tirage doit être fait sur les items du gel.`,
    );
    this.name = "DecisionPanelPosterieureAuGel";
    this.item_id = item_id;
  }
}

/**
 * §5 et annexe E, point 6 : un item arbitré « revient au tirage au run suivant si la décision vaut
 * maintien ou correction ; un retrait ou une non-évaluabilité l'en sort ». Table fermée sur
 * l'énumération de `item.schema.json` (`contestations[].decision_panel.decision`).
 */
const REINTEGRATION_PAR_DECISION: ReadonlyMap<string, boolean> = new Map([
  ["maintien", true],
  ["correction", true],
  ["retrait", false],
  ["non_evaluabilite", false],
]);

interface DecisionDatee {
  readonly decision: string;
  readonly date: string;
  readonly instant: number;
}

function champObjet(valeur: unknown): Record<string, unknown> | undefined {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return undefined;
  return valeur as Record<string, unknown>;
}

/** Frontière d'entrée : `Item.contestations` est typé `unknown[]`, sa forme se vérifie ici. */
function decisionDe(contestation: unknown, item_id: string): DecisionDatee {
  const decisionPanel = champObjet(champObjet(contestation)?.["decision_panel"]);
  if (decisionPanel === undefined) {
    throw new ArbitrageSansDecision(item_id, "une contestation ne porte pas de decision_panel");
  }
  const decision = decisionPanel["decision"];
  const date = decisionPanel["date"];
  if (typeof decision !== "string" || typeof date !== "string") {
    throw new ArbitrageSansDecision(item_id, "decision_panel sans décision ou sans date textuelle");
  }
  return { decision, date, instant: instantDe(date) };
}

/**
 * « Dernière » s'entend sur `decision_panel.date`, instant horodaté avec décalage : c'est le seul
 * champ du schéma qui date la décision elle-même (`date_reception` date la contestation, pas son
 * issue). La comparaison porte sur l'instant, jamais sur la chaîne, ni sur l'ordre du tableau.
 */
export function derniereDecisionPanel(item: Item): string {
  return derniereDecisionPanelDatee(item).decision;
}

/** La dernière décision et sa date, telles que le tirage les fige dans `items_au_gel`. */
export function derniereDecisionPanelDatee(item: Item): DecisionPanelAuGel {
  const contestations = item.contestations;
  if (contestations === undefined || contestations.length === 0) {
    throw new ArbitrageSansDecision(item.id, "aucune contestation enregistrée");
  }
  const decisions = contestations.map((contestation) => decisionDe(contestation, item.id));
  const plusTardif = Math.max(...decisions.map((decision) => decision.instant));
  const dernieres = decisions.filter((decision) => decision.instant === plusTardif);
  const distinctes = [...new Set(dernieres.map((decision) => decision.decision))].sort();
  const derniere = dernieres[0];
  if (derniere === undefined) {
    throw new ArbitrageSansDecision(item.id, "aucune décision datée n'a pu être retenue");
  }
  if (distinctes.length !== 1) throw new DecisionsPanelSimultanees(item.id, derniere.date, distinctes);
  return { decision: derniere.decision, date: derniere.date };
}

/** Vrai si la décision est antérieure ou égale à l'instant du gel. */
export function decisionAvantGel(decision: DecisionPanelAuGel, date_gel: string): boolean {
  return instantDe(decision.date) <= instantDe(date_gel);
}

/**
 * La décision que le tirage fige dans `items_au_gel` pour un item arbitré. Levée si elle est
 * postérieure au gel, plutôt que de publier un tirage qui ne décrit pas l'état du gel.
 */
export function decisionPanelAuGel(item: Item, date_gel: string): DecisionPanelAuGel {
  const decision = derniereDecisionPanelDatee(item);
  if (!decisionAvantGel(decision, date_gel)) {
    throw new DecisionPanelPosterieureAuGel(item.id, decision.date, date_gel);
  }
  return decision;
}

/** Vrai si la décision réintègre l'item au tirage. Une décision hors énumération est un refus. */
export function decisionReintegre(decision: string, item_id: string): boolean {
  const reintegre = REINTEGRATION_PAR_DECISION.get(decision);
  if (reintegre === undefined) {
    throw new Error(
      `Décision du panel « ${decision} » de l'item ${item_id} hors de l'énumération du schéma.`,
    );
  }
  return reintegre;
}

function reintegreApresArbitrage(item: Item): boolean {
  return decisionReintegre(derniereDecisionPanel(item), item.id);
}

/**
 * §5 : un item contesté n'est jamais tiré ; un item arbitré l'est selon la dernière décision.
 * Seule définition de la règle : le tirage et l'engendrement l'appellent. La symétrie applique
 * `decisionReintegre` à la décision figée dans le tirage (`decisionPanelAuGel`), jamais aux items
 * courants : un tirage publié se revérifie seul.
 */
export function contestationPermetLeTirage(item: Item): boolean {
  if (item.statut_contestation === "aucune") return true;
  if (item.statut_contestation === "arbitree") return reintegreApresArbitrage(item);
  return false;
}
