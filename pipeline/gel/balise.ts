/**
 * La balise publique d'aléa du gel (§5, décisions D44 et D45 (1)) : le tour retenu, la lecture de deux
 * relais, leurs vérifications, et les dérivations des six graines et de l'identifiant du run.
 *
 * - **Chaîne** : quicknet, épinglée ici (`QUICKNET`) et vérifiée contre `/<empreinte>/info` de chaque
 *   relais au gel ; un écart est un refus.
 * - **Tour** : le premier émis à `date_gel` ou après, `r = ⌈(date_gel − genèse) / période⌉ + 1`, le
 *   tour r étant émis à genèse + (r − 1) × période. Un tour pas encore émis est refusé avant tout
 *   appel réseau.
 * - **Relais** : `RELAIS`, deux, lus l'un après l'autre (`/info`, puis `/public/<r>`). Tous deux doivent
 *   rendre le tour demandé et la même signature ; un relais injoignable, en erreur HTTP ou illisible
 *   est un refus, jamais un repli sur l'autre.
 * - **Aléa** : SHA-256 des octets de la signature, recalculé ici ; le `randomness` de chaque relais
 *   doit lui être égal. Aucune vérification BLS au gel (D44) : un tiers la fait sur les réponses
 *   archivées (`runs/README.md`).
 * - **Graines** : graine(clé) = les 8 premiers octets, lus gros-boutistes, de SHA-256(aléa en
 *   hexadécimal minuscule ‖ U+0000 ‖ clé, en UTF-8), décalés de 11 bits vers la droite, donc dans
 *   [0, 2^53 − 1]. La clé de chaque graine est son nom (`CLES_DES_GRAINES`), publiée dans
 *   `run.json#/balise/cles`.
 * - **Identifiant** (D45 (1)) : un ULID dont l'horodatage est `date_gel` en millisecondes et la partie
 *   aléatoire les 80 premiers bits (10 octets) de SHA-256(aléa hex ‖ U+0000 ‖ « run_id »). C'est la
 *   règle des graines appliquée à 10 octets au lieu de 8, sans décalage.
 *
 * Tout est pur sauf `lireBalise`, qui ne fait que composer ces vérifications autour du port réseau
 * injecté (`reseau.ts`).
 */

import { createHash } from "node:crypto";
import { ErreurSchema, validerFragment } from "../../outils/schemas/valider.ts";
import { ulidDe } from "../../validation/domaine/ulid.ts";
import { NOMS_GRAINES } from "./graines.ts";
import type { NomGraine, ValeursDesGraines } from "./graines.ts";
import { DelaiDepasse, jsonDesOctets, messageDErreur } from "./reseau.ts";
import type { LireHttp, ReponseHttp } from "./reseau.ts";

/** D44 : la chaîne quicknet de la League of Entropy. */
export const QUICKNET = Object.freeze({
  empreinte: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  /** En secondes depuis l'époque Unix. */
  genese: 1692803367,
  /** En secondes. */
  periode: 3,
  schema_id: "bls-unchained-g1-rfc9380",
});

export interface Relais {
  /** Le nom de l'archive, `runs/<date>/balise/<nom>.json`. */
  readonly nom: string;
  readonly base: string;
}

/** D44 : deux relais indépendants, tous deux exigés. */
export const RELAIS: readonly Relais[] = Object.freeze([
  { nom: "api.drand.sh", base: "https://api.drand.sh" },
  { nom: "drand.cloudflare.com", base: "https://drand.cloudflare.com" },
]);

/** La clé lisible de chaque graine : son nom (D44 ; `alias_candidats`, D55 (9), protocole 0.20). */
export const CLES_DES_GRAINES: Readonly<Record<NomGraine, string>> = Object.freeze({
  tirage: "tirage",
  echantillon_humain: "echantillon_humain",
  bootstrap: "bootstrap",
  permutation: "permutation",
  contrefactuel: "contrefactuel",
  alias_candidats: "alias_candidats",
});

/** La clé de la partie aléatoire de l'identifiant du run (D45 (1)). */
export const CLE_IDENTIFIANT = "run_id";

export type MotifBalise =
  | "avant_genese"
  | "pas_encore_emis"
  | "injoignable"
  | "delai_depasse"
  | "statut_http"
  | "illisible"
  | "chaine_differente"
  | "tour_different"
  | "alea_faux"
  | "relais_en_desaccord";

/** Tout refus de la balise : rien n'est écrit, aucun relais n'est retenu seul. */
export class BaliseRefusee extends Error {
  readonly motif: MotifBalise;
  /** Le relais en cause, `null` quand le refus n'en vise aucun. */
  readonly relais: string | null;

  constructor(motif: MotifBalise, relais: string | null, detail: string) {
    super(`Balise drand refusée (${motif}${relais === null ? "" : `, relais ${relais}`}) : ${detail} Rien n'est écrit.`);
    this.name = "BaliseRefusee";
    this.motif = motif;
    this.relais = relais;
  }
}

/* ------------------------------------------------------------------ tour */

const MS_GENESE = QUICKNET.genese * 1000;
const MS_PERIODE = QUICKNET.periode * 1000;

/** Le premier tour émis à `date_gel` ou après. */
export function tourAuGel(date_gel_ms: number): number {
  if (date_gel_ms < MS_GENESE) {
    throw new BaliseRefusee("avant_genese", null, `date_gel (${new Date(date_gel_ms).toISOString()}) précède la genèse de quicknet.`);
  }
  return Math.ceil((date_gel_ms - MS_GENESE) / MS_PERIODE) + 1;
}

/** L'instant d'émission d'un tour, en millisecondes. */
export function emissionDuTour(tour: number): number {
  return MS_GENESE + (tour - 1) * MS_PERIODE;
}

/** Un tour pas encore émis n'existe pas : refus, avant tout appel réseau. */
export function exigerTourEmis(tour: number, maintenant_ms: number): void {
  const emission = emissionDuTour(tour);
  if (maintenant_ms < emission) {
    throw new BaliseRefusee(
      "pas_encore_emis",
      null,
      `le tour ${tour} sera émis le ${new Date(emission).toISOString()} ; il est ${new Date(maintenant_ms).toISOString()}.`,
    );
  }
}

export function urlInfo(relais: Relais): string {
  return `${relais.base}/${QUICKNET.empreinte}/info`;
}

export function urlTour(relais: Relais, tour: number): string {
  return `${relais.base}/${QUICKNET.empreinte}/public/${tour}`;
}

/* --------------------------------------------------------------- réponses */

interface InfoDrand {
  readonly hash: string;
  readonly genesis_time: number;
  readonly period: number;
  readonly schemeID: string;
}

interface TourDrand {
  readonly round: number;
  readonly signature: string;
  readonly randomness: string;
}

function decoder(relais: Relais, reponse: ReponseHttp): unknown {
  try {
    return jsonDesOctets(reponse.octets);
  } catch (erreur) {
    throw new BaliseRefusee("illisible", relais.nom, `corps illisible (${messageDErreur(erreur)}).`);
  }
}

/** Statut 200, JSON, conforme à `run#/$defs/<forme>` ; un refus nommé sinon. */
function lireReponse<T>(relais: Relais, reponse: ReponseHttp, forme: "drand_info" | "drand_tour"): T {
  if (reponse.statut !== 200) throw new BaliseRefusee("statut_http", relais.nom, `réponse HTTP ${reponse.statut}.`);
  const valeur = decoder(relais, reponse);
  try {
    return validerFragment<T>("run", `#/$defs/${forme}`, valeur, `relais ${relais.nom}`);
  } catch (erreur) {
    if (!(erreur instanceof ErreurSchema)) throw erreur;
    throw new BaliseRefusee("illisible", relais.nom, erreur.message);
  }
}

/** `/info` d'un relais : empreinte, genèse, période et schéma égaux aux épinglés. */
export function verifierInfo(relais: Relais, reponse: ReponseHttp): void {
  const info = lireReponse<InfoDrand>(relais, reponse, "drand_info");
  const attendus: readonly (readonly [string, unknown, unknown])[] = [
    ["hash", info.hash, QUICKNET.empreinte],
    ["genesis_time", info.genesis_time, QUICKNET.genese],
    ["period", info.period, QUICKNET.periode],
    ["schemeID", info.schemeID, QUICKNET.schema_id],
  ];
  const ecarts = attendus.filter(([, lu, epingle]) => lu !== epingle).map(([champ, lu, epingle]) => `${champ} lu ${String(lu)}, épinglé ${String(epingle)}`);
  if (ecarts.length > 0) throw new BaliseRefusee("chaine_differente", relais.nom, `${ecarts.join(" ; ")}.`);
}

/** SHA-256 des octets de la signature, en hexadécimal minuscule. */
export function aleaDe(signature: string): string {
  return createHash("sha256").update(Buffer.from(signature, "hex")).digest("hex");
}

export interface TourLu {
  readonly relais: Relais;
  readonly url: string;
  /** La réponse telle que reçue, archivée telle quelle (règle 7). */
  readonly octets: Uint8Array;
  readonly tour: number;
  readonly signature: string;
  /** Recalculé : SHA-256(signature). */
  readonly alea: string;
}

/** `/public/<tour>` d'un relais : le tour demandé, et `randomness` = SHA-256(signature). */
export function verifierTour(relais: Relais, tour: number, reponse: ReponseHttp): TourLu {
  const lu = lireReponse<TourDrand>(relais, reponse, "drand_tour");
  if (lu.round !== tour) throw new BaliseRefusee("tour_different", relais.nom, `tour ${lu.round} rendu, tour ${tour} demandé.`);
  const alea = aleaDe(lu.signature);
  if (lu.randomness !== alea) {
    throw new BaliseRefusee("alea_faux", relais.nom, `randomness ${lu.randomness} ≠ SHA-256(signature) ${alea}.`);
  }
  return { relais, url: urlTour(relais, tour), octets: reponse.octets, tour, signature: lu.signature, alea };
}

/** Tous les relais rendent le même tour et la même signature ; un seul ne suffit jamais. */
function exigerAccord(lus: readonly TourLu[]): TourLu {
  const [premier, ...autres] = lus;
  if (premier === undefined || lus.length !== RELAIS.length) {
    throw new BaliseRefusee("relais_en_desaccord", null, `${lus.length} relais lu(s) sur ${RELAIS.length} exigés.`);
  }
  const discordants = autres.filter((lu) => lu.tour !== premier.tour || lu.signature !== premier.signature);
  if (discordants.length > 0) {
    const noms = [premier, ...discordants].map((lu) => `${lu.relais.nom} (tour ${lu.tour}, signature ${lu.signature})`);
    throw new BaliseRefusee("relais_en_desaccord", null, `les relais diffèrent : ${noms.join(" ; ")}.`);
  }
  return premier;
}

/* ---------------------------------------------------------------- lecture */

export interface BaliseLue {
  readonly tour: number;
  readonly signature: string;
  readonly alea: string;
  /** Une lecture par relais, dans l'ordre de `RELAIS`. */
  readonly lectures: readonly TourLu[];
}

async function lireAuRelais(lire: LireHttp, relais: Relais, url: string): Promise<ReponseHttp> {
  try {
    return await lire(url);
  } catch (erreur) {
    const motif = erreur instanceof DelaiDepasse ? "delai_depasse" : "injoignable";
    throw new BaliseRefusee(motif, relais.nom, `${url} : ${messageDErreur(erreur)}.`);
  }
}

/** Lit le tour sur chaque relais, l'un après l'autre ; le premier refus arrête tout. */
export async function lireBalise(tour: number, lire: LireHttp): Promise<BaliseLue> {
  const lectures: TourLu[] = [];
  for (const relais of RELAIS) {
    verifierInfo(relais, await lireAuRelais(lire, relais, urlInfo(relais)));
    lectures.push(verifierTour(relais, tour, await lireAuRelais(lire, relais, urlTour(relais, tour))));
  }
  const retenu = exigerAccord(lectures);
  return { tour: retenu.tour, signature: retenu.signature, alea: retenu.alea, lectures };
}

/* ------------------------------------------------------------- dérivations */

function empreinteDeCle(alea: string, cle: string): Buffer {
  return createHash("sha256").update(`${alea}\u0000${cle}`, "utf8").digest();
}

/** 8 octets lus gros-boutistes, décalés de 11 bits vers la droite : dans [0, 2^53 − 1]. */
export function graineDesOctets(octets: Uint8Array): number {
  if (octets.length !== 8) throw new Error(`Une graine se dérive de 8 octets exactement, pas de ${octets.length}.`);
  let valeur = 0n;
  for (const octet of octets) valeur = (valeur << 8n) | BigInt(octet);
  return Number(valeur >> 11n);
}

/** Les six graines du run, chacune dérivée de l'aléa par sa clé. */
export function valeursDesGraines(alea: string): ValeursDesGraines {
  const valeur = (nom: NomGraine): number => graineDesOctets(empreinteDeCle(alea, CLES_DES_GRAINES[nom]).subarray(0, 8));
  return Object.fromEntries(NOMS_GRAINES.map((nom) => [nom, valeur(nom)])) as Record<NomGraine, number>;
}

/** Les 10 octets de la partie aléatoire de l'identifiant. */
export function octetsDeLIdentifiant(alea: string): Uint8Array {
  return Uint8Array.from(empreinteDeCle(alea, CLE_IDENTIFIANT).subarray(0, 10));
}

/** L'ULID du run : `date_gel` en millisecondes, puis les 80 bits dérivés de l'aléa. */
export function identifiantDuRun(date_gel_ms: number, alea: string): string {
  return ulidDe(date_gel_ms, octetsDeLIdentifiant(alea));
}

/* ----------------------------------------------------------------- run.json */

export interface ArchiveDeRelais {
  /** Relatif au répertoire du run. */
  readonly chemin: string;
  readonly octets: Uint8Array;
}

/** `runs/<date>/balise/<relais>.json` : la réponse brute de chaque relais, octet pour octet. */
export function archivesDeLaBalise(balise: BaliseLue): readonly ArchiveDeRelais[] {
  return balise.lectures.map((lu) => ({ chemin: `balise/${lu.relais.nom}.json`, octets: lu.octets }));
}

/** `run.json#/balise` : de quoi tout recalculer, et vérifier la signature hors du dépôt. */
export function baliseDuRun(balise: BaliseLue, date_repertoire: string): unknown {
  return {
    chaine: { empreinte: QUICKNET.empreinte, genese: QUICKNET.genese, periode: QUICKNET.periode, schema_id: QUICKNET.schema_id },
    tour: balise.tour,
    signature: balise.signature,
    alea: balise.alea,
    relais: balise.lectures.map((lu) => ({
      base: lu.relais.base,
      url: lu.url,
      chemin: `runs/${date_repertoire}/balise/${lu.relais.nom}.json`,
      sha256: createHash("sha256").update(lu.octets).digest("hex"),
    })),
    cles: { ...CLES_DES_GRAINES },
    cle_identifiant: CLE_IDENTIFIANT,
  };
}
