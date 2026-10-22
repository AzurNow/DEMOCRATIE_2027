/** Appels au serveur local. Aucune URL absolue : tout est relatif à l'origine servie. */

import type {
  Brouillon,
  Correction,
  Decision,
  Diagnostic,
  ListeFormulations,
  Raccourcis,
  RelectureFormulations,
  Session,
  VueFormulations,
  VueItem,
  VueLot,
} from "./types.ts";

/**
 * Ce que `app.ts:soumettre()` construit et envoie à `/api/decisions` — pas ce que le serveur
 * accepterait dans l'absolu. Typer `charge` avec cette interface, au lieu de `unknown`, fait
 * échouer `pnpm check` si une clé est ajoutée ici sans l'être aussi dans `CHAMPS_DECISION`
 * (`validation/serveur/lecture-requetes.ts`) : sans ce garde-fou, une clé ajoutée d'un seul
 * côté ferait refuser chaque décision en 400 (relecture du Lot 8d). L'accord des deux listes de
 * clés est confronté par `tests/accord-decision-client-serveur.test.ts`, sur le modèle de
 * `tests/grille-client.test.ts` pour `CLES_GRILLE`.
 */
export interface RequeteDecision {
  readonly lot_id: string;
  readonly item_id: string;
  readonly decision: Decision;
  readonly reponses_grille?: Record<string, boolean | null>;
  readonly reponses_par_etat?: {
    readonly anterieur: Record<string, boolean | null>;
    readonly posterieur: Record<string, boolean | null>;
  };
  readonly questions_specifiques: Record<string, boolean>;
  readonly corrections: readonly Correction[];
  readonly commentaire: string | null;
  readonly duree_affichage_ms: number;
  readonly duree_active_ms: number;
}

/** Réponse HTTP en erreur : le statut et le corps renvoyés par le serveur, tels quels. */
export class EchecApi extends Error {
  readonly statut: number;
  readonly corps: unknown;

  constructor(statut: number, corps: unknown) {
    super(`HTTP ${statut}`);
    this.statut = statut;
    this.corps = corps;
  }
}

async function demander<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(chemin, options);
  const texte = await reponse.text();
  const corps: unknown = texte.length === 0 ? null : JSON.parse(texte);
  if (!reponse.ok) throw new EchecApi(reponse.status, corps);
  return corps as T;
}

export const api = {
  session: () => demander<Session>("/api/session"),
  raccourcis: () => demander<Raccourcis>("/api/raccourcis"),
  lot: (lot_id: string) => demander<VueLot>(`/api/lots/${encodeURIComponent(lot_id)}`),
  diagnostic: (lot_id: string) => demander<Diagnostic>(`/api/lots/${encodeURIComponent(lot_id)}/diagnostic`),
  item: (lot_id: string, item_id: string) =>
    demander<VueItem>(`/api/lots/${encodeURIComponent(lot_id)}/items/${encodeURIComponent(item_id)}`),
  decider: (charge: RequeteDecision) =>
    demander<{ ok: true; id: string }>("/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(charge),
    }),
  annuler: (lot_id: string) =>
    demander<{ ok: true; id: string; item_id: string }>("/api/annulations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lot_id }),
    }),
  formulations: () => demander<ListeFormulations>("/api/formulations"),
  formulation: (question_id: string) =>
    demander<VueFormulations>(`/api/formulations/${encodeURIComponent(question_id)}`),
  promouvoirFormulations: (relecture: RelectureFormulations) =>
    demander<{ ok: true; question_id: string }>("/api/formulations/promotions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(relecture),
    }),
  refuserFormulations: (relecture: RelectureFormulations) =>
    demander<{ ok: true; question_id: string }>("/api/formulations/refus", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(relecture),
    }),
  lireBrouillon: () => demander<Brouillon | null>("/api/brouillon"),
  ecrireBrouillon: (brouillon: Brouillon) =>
    demander<null>("/api/brouillon", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(brouillon),
    }),
};

export function urlSource(lot_id: string, item_id: string, cle: string): string {
  return `/api/lots/${encodeURIComponent(lot_id)}/items/${encodeURIComponent(item_id)}/source/${encodeURIComponent(cle)}`;
}
