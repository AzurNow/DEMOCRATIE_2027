/** Appels au serveur local. Aucune URL absolue : tout est relatif à l'origine servie. */

import type { FileDeTravail, Saisie, Session, Vue } from "./types.ts";

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

/** `fetch` a été rejeté : le serveur local est injoignable (ou la lecture du corps a échoué en route). */
export class PanneReseau extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "PanneReseau";
  }
}

/** Le corps de la réponse n'est pas du JSON : le statut reçu est gardé, le corps n'est pas deviné. */
export class ReponseIllisible extends Error {
  readonly statut: number;

  constructor(statut: number, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "ReponseIllisible";
    this.statut = statut;
  }
}

async function recevoir(chemin: string, options?: RequestInit): Promise<{ readonly statut: number; readonly ok: boolean; readonly texte: string }> {
  try {
    const reponse = await fetch(chemin, options);
    return { statut: reponse.status, ok: reponse.ok, texte: await reponse.text() };
  } catch (cause) {
    throw new PanneReseau(cause);
  }
}

function lireCorps(statut: number, texte: string): unknown {
  if (texte.length === 0) return null;
  try {
    return JSON.parse(texte);
  } catch (cause) {
    throw new ReponseIllisible(statut, cause);
  }
}

async function demander<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await recevoir(chemin, options);
  const corps = lireCorps(reponse.statut, reponse.texte);
  if (!reponse.ok) throw new EchecApi(reponse.statut, corps);
  return corps as T;
}

export const api = {
  session: () => demander<Session>("/api/session"),
  file: () => demander<FileDeTravail>("/api/file"),
  vue: (reponse_id: string) => demander<Vue>(`/api/vue/${encodeURIComponent(reponse_id)}`),
  noter: (reponse_id: string, saisie: Saisie) =>
    demander<{ ok: true; id: string }>("/api/notations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reponse_id, saisie }),
    }),
};
