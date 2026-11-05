/**
 * Le réseau SIMULÉ du gel : les deux relais drand et l'API de disponibilité de la Wayback Machine,
 * rejoués en mémoire derrière le port réseau du gel (`reseau.ts:LireHttp`). Deux usages, et
 * seulement eux : `pnpm geler --simule` (`gel-simule.ts`, D80) et les tests du gel. Aucun appel ne
 * sort de la machine ; une URL que la simulation ne connaît pas lève, et chaque appel est enregistré.
 *
 * Les réponses ont la forme de celles des services réels (`/info` et `/public/<tour>` de quicknet,
 * `archive.org/wayback/available`), avec des valeurs simulées : la signature d'un tour est le
 * SHA-384 de « fixture:<tour> » (96 caractères hexadécimaux, la longueur d'une signature G1 ; le
 * préfixe est celui des doubles de test d'où vient ce module, gardé pour que les tirages des tests
 * du gel ne changent pas), son
 * `randomness` le SHA-256 de ses octets. Aucune n'est une vraie signature de la chaîne : un tiers
 * qui la vérifie contre la clé publique de quicknet (`runs/README.md`, « Vérifier par un tiers ») la
 * voit fausse, et c'est voulu. Un gel qui les lit inscrit `simule: true` dans son `run.json`.
 */

import { createHash } from "node:crypto";
import { QUICKNET, RELAIS } from "./balise.ts";
import type { LireHttp, ReponseHttp } from "./reseau.ts";

export const INFO_QUICKNET = {
  period: QUICKNET.periode,
  genesis_time: QUICKNET.genese,
  hash: QUICKNET.empreinte,
  schemeID: QUICKNET.schema_id,
  metadata: { beaconID: "quicknet" },
};

export function octetsJson(valeur: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(valeur));
}

export function reponseJson(valeur: unknown, statut = 200): ReponseHttp {
  return { statut, octets: octetsJson(valeur) };
}

export function signatureSimulee(tour: number): string {
  return createHash("sha384").update(`fixture:${tour}`, "utf8").digest("hex");
}

export function reponseTour(tour: number): { round: number; signature: string; randomness: string } {
  const signature = signatureSimulee(tour);
  return { round: tour, signature, randomness: createHash("sha256").update(Buffer.from(signature, "hex")).digest("hex") };
}

/** Rend une réponse (ou une erreur à lever) pour une URL, ou `undefined` pour la réponse nominale. */
export type Alteration = (url: string) => ReponseHttp | Error | undefined;

export interface PortEnregistre {
  readonly lire: LireHttp;
  readonly appels: string[];
}

const SANS_ALTERATION: Alteration = () => undefined;

function port(nominale: (url: string) => ReponseHttp | undefined, alterer: Alteration): PortEnregistre {
  const appels: string[] = [];
  const lire: LireHttp = (url) => {
    appels.push(url);
    const reponse = alterer(url) ?? nominale(url);
    if (reponse === undefined) return Promise.reject(new Error(`URL inconnue du réseau simulé : ${url}`));
    if (reponse instanceof Error) return Promise.reject(reponse);
    return Promise.resolve(reponse);
  };
  return { lire, appels };
}

function nominaleDrand(url: string): ReponseHttp | undefined {
  for (const relais of RELAIS) {
    const prefixe = `${relais.base}/${QUICKNET.empreinte}/`;
    if (!url.startsWith(prefixe)) continue;
    const reste = url.slice(prefixe.length);
    if (reste === "info") return reponseJson(INFO_QUICKNET);
    const tour = /^public\/([0-9]+)$/.exec(reste)?.[1];
    if (tour !== undefined) return reponseJson(reponseTour(Number(tour)));
  }
  return undefined;
}

/** Les deux relais simulés, d'accord, sur quicknet, pour n'importe quel tour. */
export function relaisSimules(alterer: Alteration = SANS_ALTERATION): PortEnregistre {
  return port(nominaleDrand, alterer);
}

const DISPONIBILITE = "https://archive.org/wayback/available?";

/** La capture demandée existe exactement, de statut 200. */
export function capturePresente(page: string, horodatage: string): unknown {
  return {
    url: page,
    archived_snapshots: {
      closest: { status: "200", available: true, url: `http://web.archive.org/web/${horodatage}/${page}`, timestamp: horodatage },
    },
    timestamp: horodatage,
  };
}

function nominaleWayback(url: string): ReponseHttp | undefined {
  if (!url.startsWith(DISPONIBILITE)) return undefined;
  const parametres = new URLSearchParams(url.slice(DISPONIBILITE.length));
  const page = parametres.get("url");
  const horodatage = parametres.get("timestamp");
  if (page === null || horodatage === null) return undefined;
  return reponseJson(capturePresente(page, horodatage));
}

/** La Wayback Machine simulée sert toute capture demandée. */
export function waybackSimulee(alterer: Alteration = SANS_ALTERATION): PortEnregistre {
  return port(nominaleWayback, alterer);
}
