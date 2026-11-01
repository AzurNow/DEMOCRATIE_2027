/**
 * Ce qu'une panne de l'API dit à l'écran, et l'unique point de gestion des promesses lancées sans
 * attente. Pur : aucun DOM, rien d'avalé, rien de reformulé, aucune valeur par défaut. L'affichage
 * lui-même (zone d'alerte) vit dans `signalement.ts`.
 */

import { EchecApi, PanneReseau, ReponseIllisible } from "./api.ts";

interface CorpsEchec {
  readonly refus?: unknown;
  readonly manquements?: unknown;
  readonly erreur?: unknown;
  readonly detail?: unknown;
}

function enTexte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur : JSON.stringify(valeur);
}

/** Ce que le serveur a répondu en échec, dit en clair : refus de correction, manquements, ou son `erreur`. */
function messagesDeLEchec(echec: EchecApi): readonly string[] {
  if (echec.corps === null || typeof echec.corps !== "object") return [`Échec HTTP ${echec.statut}.`];
  const corps = echec.corps as CorpsEchec;
  if (corps.refus !== undefined) return [`Correction refusée : ${enTexte(corps.refus)}`];
  if (corps.manquements !== undefined) return [`Décision incomplète : ${enTexte(corps.manquements)}`];
  if (corps.erreur === undefined) return [`HTTP ${echec.statut} — ${enTexte(echec.corps)}`];
  const detail = corps.detail === undefined ? "" : ` — ${enTexte(corps.detail)}`;
  return [`${enTexte(corps.erreur)}${detail}`];
}

/** Toute promesse rejetée du client : réseau, réponse non 2xx, JSON illisible, ou autre. */
export function messagesDErreur(erreur: unknown): readonly string[] {
  if (erreur instanceof EchecApi) return messagesDeLEchec(erreur);
  if (erreur instanceof PanneReseau) return [`Panne réseau : le serveur local ne répond pas (${erreur.message}).`];
  if (erreur instanceof ReponseIllisible) return [`Réponse illisible du serveur (HTTP ${erreur.statut}) : ${erreur.message}`];
  return [`Erreur inattendue : ${erreur instanceof Error ? erreur.message : String(erreur)}`];
}

/**
 * Attend une promesse que personne n'attend et montre son échec. Pas de nouvelle tentative : ce
 * qui a échoué reste dit tel quel. `contexte` précède chaque message (ex. « Brouillon non enregistré »).
 */
export async function lancerAvec(
  afficher: (messages: readonly string[]) => void,
  promesse: Promise<unknown>,
  contexte?: string,
): Promise<void> {
  try {
    await promesse;
  } catch (erreur) {
    const messages = messagesDErreur(erreur);
    afficher(contexte === undefined ? messages : messages.map((m) => `${contexte} : ${m}`));
  }
}
