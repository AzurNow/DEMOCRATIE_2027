/**
 * Une tentative : un envoi borné à 180 s, et ce que l'adaptateur de l'éditeur en conclut.
 *
 * L'envoi et la minuterie courent ensemble ; le premier arrivé l'emporte et l'autre est annulé.
 * Une minuterie écoulée est un échec « timeout » ; un échec de transport, « reseau » ; une réponse
 * HTTP est classée par l'adaptateur — réponse, refus de modération (réponse obtenue, jamais
 * retentée) ou échec « http » / « quota ».
 */

import { createHash } from "node:crypto";
import { DELAI_TENTATIVE_MS } from "./conditions.ts";
import { ErreurReseau, type Adaptateur, type Contenu, type Editeur, type ReponseHttp, type RequeteHttp } from "./editeur.ts";
import type { Horloge } from "./horloge.ts";
import type { ErreurTentative } from "./types.ts";

type Envoi =
  | { readonly genre: "http"; readonly reponse: ReponseHttp }
  | { readonly genre: "reseau"; readonly message: string }
  | { readonly genre: "timeout" }
  | { readonly genre: "abandonne" };

export type Conclusion =
  | {
      readonly genre: "obtenue";
      readonly contenu: Contenu;
      readonly refus_api: boolean;
      /** SHA-256 des octets exacts du corps reçu, pris avant toute lecture. */
      readonly brut_octets_sha256: string;
    }
  | { readonly genre: "echec"; readonly erreur: ErreurTentative };

export const MESSAGE_TIMEOUT = `Aucune réponse au bout de ${DELAI_TENTATIVE_MS / 1000} s : tentative abandonnée.`;

/**
 * L'envoi, ramené à une issue. Une fois l'envoi abandonné (minuterie écoulée), son rejet n'est plus
 * attendu par personne : il devient « abandonne ». Avant cela, toute erreur qui n'est pas un échec
 * de transport remonte telle quelle.
 */
function transporter(editeur: Editeur, requete: RequeteHttp, signal: AbortSignal): Promise<Envoi> {
  return editeur.transport.envoyer(requete, signal).then(
    (reponse): Envoi => ({ genre: "http", reponse }),
    (erreur: unknown): Envoi => {
      if (signal.aborted) return { genre: "abandonne" };
      if (erreur instanceof ErreurReseau) return { genre: "reseau", message: erreur.message };
      throw erreur;
    },
  );
}

export async function envoyerSousDelai(editeur: Editeur, requete: RequeteHttp, horloge: Horloge): Promise<Envoi> {
  const arretEnvoi = new AbortController();
  const arretMinuterie = new AbortController();
  const minuterie = horloge
    .attendre(DELAI_TENTATIVE_MS, arretMinuterie.signal)
    .then((issue): Envoi => (issue === "ecoulee" ? { genre: "timeout" } : { genre: "abandonne" }));
  try {
    return await Promise.race([transporter(editeur, requete, arretEnvoi.signal), minuterie]);
  } finally {
    arretMinuterie.abort();
    arretEnvoi.abort();
  }
}

/** Décision de l'auteur du 2026-10-02 : l'empreinte des octets reçus, avant toute lecture. */
export function empreinteOctets(octets: Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

/**
 * Ce que l'adaptateur conclut d'une réponse HTTP reçue : le seul classement, au run comme quand
 * l'opérateur stocke une réponse gardée (§6, 0.21, `stocker.ts`). Lève si le corps ne peut être lu
 * (`CorpsNonUtf8`, par exemple) : c'est alors une réponse reçue que le banc ne peut stocker.
 */
export function conclureHttp(reponse: ReponseHttp, adaptateur: Adaptateur): Conclusion {
  const brut_octets_sha256 = empreinteOctets(reponse.corps);
  const classement = adaptateur.classer(reponse);
  switch (classement.issue) {
    case "reponse":
      return { genre: "obtenue", contenu: classement.contenu, refus_api: false, brut_octets_sha256 };
    case "refus_api":
      return { genre: "obtenue", contenu: classement.contenu, refus_api: true, brut_octets_sha256 };
    case "echec":
      return { genre: "echec", erreur: classement.erreur };
  }
}

/** L'échec d'un envoi qui n'a reçu aucune réponse HTTP : réseau ou délai dépassé. */
export function erreurSansReponse(envoi: Exclude<Envoi, { readonly genre: "http" }>): ErreurTentative {
  switch (envoi.genre) {
    case "reseau":
      return { type: "reseau", message: envoi.message };
    case "timeout":
      return { type: "timeout", message: MESSAGE_TIMEOUT };
    case "abandonne":
      throw new Error("Envoi abandonné avant d'avoir été attendu : course entre envoi et minuterie incohérente.");
  }
}
