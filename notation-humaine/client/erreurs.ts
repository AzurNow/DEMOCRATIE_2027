/** Ce qu'une panne de l'API dit à l'écran. Pur : rien d'avalé, rien de reformulé, aucune valeur par défaut. */

import { EchecApi, PanneReseau, ReponseIllisible } from "./api.ts";
import type { MotifRefus } from "./types.ts";

interface CorpsEchec {
  readonly motifs?: readonly MotifRefus[];
  readonly erreur?: string;
  readonly detail?: string | readonly string[];
}

/** Ce que le serveur a répondu en échec, dit en clair : un refus de grille liste tous ses motifs. */
function messagesDeLEchec(echec: EchecApi): readonly string[] {
  const corps = echec.corps as CorpsEchec | null;
  if (corps === null) return [`Échec HTTP ${echec.statut}.`];
  if (corps.motifs !== undefined) return corps.motifs.map((m) => `${m.code} — ${m.detail}`);
  const detail = corps.detail === undefined ? [] : [corps.detail].flat();
  return [`${corps.erreur === undefined ? `HTTP ${echec.statut}` : corps.erreur} — ${detail.join(" ; ")}`];
}

/** Toute promesse rejetée du client : réseau, réponse non 2xx, JSON illisible, ou autre. */
export function messagesDErreur(erreur: unknown): readonly string[] {
  if (erreur instanceof EchecApi) return messagesDeLEchec(erreur);
  if (erreur instanceof PanneReseau) return [`Panne réseau : le serveur local ne répond pas (${erreur.message}).`];
  if (erreur instanceof ReponseIllisible) return [`Réponse illisible du serveur (HTTP ${erreur.statut}) : ${erreur.message}`];
  return [`Erreur inattendue : ${erreur instanceof Error ? erreur.message : String(erreur)}`];
}
