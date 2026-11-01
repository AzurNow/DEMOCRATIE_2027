/**
 * L'opérateur stocke une réponse en attente depuis ses octets gardés (§6, 0.21) : « Une réponse
 * reçue que le banc ne peut stocker est gardée telle quelle et n'est pas renvoyée […]. L'opérateur
 * la stocke depuis ses octets gardés, tels que reçus, une fois la cause corrigée ; elle est alors
 * une réponse obtenue dans la fenêtre. » Commande : `pnpm interrogation:stocker`.
 *
 * Une requête attend l'opérateur quand son journal porte `recue_non_stockee`, ou une tentative
 * ouverte dont les octets sont gardés (`octets_sans_suite`, arrêt brutal après la garde). Pour
 * chacune, les octets et la réception gardés (`journal.ts`) sont relus et passent par le chemin du
 * run lui-même, `executer.ts:stockerRecue` : classement par l'adaptateur, réponse obtenue écrite
 * atomiquement avec l'instant de réception d'origine — donc dans la fenêtre —, ou, si l'adaptateur
 * classe la réponse en échec (un 503 gardé, par exemple), échec inscrit au journal comme au chemin
 * normal : la tentative est comptée et la relance ordinaire retente la requête si le §6 le permet
 * (troisième tentative épuisée ⇒ la relance écrit la manquante « echecs »). Le journal ne consigne
 * pas une réponse stockée, au run comme ici : c'est la réponse écrite qui fait sauter la requête.
 *
 * Refus nommés, par requête, sans rien écrire — la requête reste en attente :
 *   - `sans_octets` : la garde des octets a elle-même échoué, il n'y a rien à stocker ;
 *   - `sans_metadonnees` : octets gardés sans leur réception (volume antérieur à cette garde, ou
 *     intervention extérieure) — les stocker exigerait d'inventer statut et instants ;
 *   - `adaptateur_different` : l'adaptateur donné n'est pas celui qui a reçu les octets (fonction
 *     ou version de normalisation autre que celle de la réception) — des octets d'un éditeur ne sont
 *     jamais classés par l'adaptateur d'un autre, simulé compris ;
 *   - `reception_incoherente` : les octets n'ont pas l'empreinte que leur réception déclare ;
 *   - `stockage_impossible` : le chemin du run lève encore (la cause n'est pas corrigée).
 * Les octets et la réception gardés ne sont jamais modifiés (règle 7). Relancer ne refait rien :
 * une requête dont la réponse est écrite est comptée « déjà écrite ».
 */

import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import type { Adaptateur } from "./editeur.ts";
import { courseDe, stockerRecue, type ContexteEcriture, type Recue } from "./executer.ts";
import { JournalRequete, type Reprise } from "./journal.ts";
import type { PlanInterrogation } from "./plan.ts";
import { empreinteOctets } from "./tentatives.ts";
import { cleDe, type CleRequete, type ErreurTentative, type RequetePlanifiee } from "./types.ts";

export interface ContexteStockage extends ContexteEcriture {
  /** L'adaptateur de chaque outil du plan, celui de l'éditeur interrogé au run. */
  readonly adaptateurs: ReadonlyMap<string, Adaptateur>;
}

export type MotifRefusStockage =
  | "sans_octets"
  | "sans_metadonnees"
  | "adaptateur_different"
  | "reception_incoherente"
  | "stockage_impossible";

export type IssueStockage =
  | { readonly genre: "stockee"; readonly requete: CleRequete; readonly numero: number }
  /** `tentatives` : les tentatives de l'outil désormais comptées pour cette requête (§6, trois au plus). */
  | { readonly genre: "echec_conclu"; readonly requete: CleRequete; readonly numero: number; readonly erreur: ErreurTentative; readonly tentatives: number }
  | { readonly genre: "refusee"; readonly requete: CleRequete; readonly numero: number; readonly motif: MotifRefusStockage; readonly cause: string };

export interface BilanStockage {
  readonly deja_ecrites: number;
  /** Requêtes visées qui n'attendent pas l'opérateur (ni réponse écrite, ni réponse gardée en attente). */
  readonly sans_attente: number;
  readonly issues: readonly IssueStockage[];
}

/** `--requete=<clé>` ne désigne aucune requête du plan du run. */
export class RequeteInconnue extends Error {
  constructor(cle: string) {
    super(`Aucune requête du plan n'a la clé ${cle} (empreinte de la clé canonique, nom du journal sans .jsonl). Rien n'est écrit.`);
    this.name = "RequeteInconnue";
  }
}

/** Un outil du plan sans adaptateur : sa réponse ne sera pas classée par un autre. */
export class AdaptateurAbsent extends Error {
  constructor(outil_id: string) {
    super(`Aucun adaptateur pour l'outil ${outil_id} : ses réponses gardées ne seront pas stockées. Rien n'est écrit.`);
    this.name = "AdaptateurAbsent";
  }
}

/** Code de sortie de `pnpm interrogation:stocker` quand une requête au moins reste en attente. */
export const CODE_STOCKAGE_REFUSE = 2;

export function codeSortieStockage(bilan: BilanStockage): number {
  return bilan.issues.some((issue) => issue.genre === "refusee") ? CODE_STOCKAGE_REFUSE : 0;
}

/** La clé que l'opérateur passe à `--requete` : celle qui nomme le journal et les octets gardés. */
export function cleDeRequete(requete: CleRequete): string {
  return sha256(canoniser(cleDe(requete)));
}

type Attente = Exclude<Reprise, { readonly genre: "tentatives" }>;

type LectureGardee =
  | { readonly genre: "recue"; readonly recue: Recue }
  | { readonly genre: "refus"; readonly motif: MotifRefusStockage; readonly cause: string };

function causeDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

type Normalisation = Adaptateur["normalisation"];

function memeNormalisation(a: Normalisation, b: Normalisation): boolean {
  return a.fonction === b.fonction && a.version === b.version;
}

/** Relit octets et réception gardés ; tout manque est un refus nommé, jamais une valeur supposée. */
function lireGardee(journal: JournalRequete, attente: Attente, adaptateur: Adaptateur): LectureGardee {
  if (attente.chemin_octets === null) {
    return { genre: "refus", motif: "sans_octets", cause: "la garde des octets a elle-même échoué : il n'y a rien à stocker" };
  }
  const reception = journal.lireReception(attente.numero);
  if (reception === null) {
    return {
      genre: "refus",
      motif: "sans_metadonnees",
      cause: "octets gardés sans leur réception (statut HTTP, instants) : les stocker exigerait d'en inventer",
    };
  }
  const recu_par = reception.normalisation;
  if (!memeNormalisation(recu_par, adaptateur.normalisation)) {
    return {
      genre: "refus",
      motif: "adaptateur_different",
      cause:
        `octets reçus par l'adaptateur ${recu_par.fonction} ${recu_par.version}, ` +
        `adaptateur donné ${adaptateur.normalisation.fonction} ${adaptateur.normalisation.version}`,
    };
  }
  const corps = journal.lireOctets(attente.chemin_octets);
  const empreinte = empreinteOctets(corps);
  if (empreinte !== reception.octets_sha256) {
    return { genre: "refus", motif: "reception_incoherente", cause: `octets d'empreinte ${empreinte}, réception qui déclare ${reception.octets_sha256}` };
  }
  const reponse = { statut: reception.statut_http, corps };
  return { genre: "recue", recue: { numero: attente.numero, debut_ms: reception.debut_ms, fin_ms: reception.reception_ms, reponse } };
}

function stockerAttente(requete: RequetePlanifiee, journal: JournalRequete, attente: Attente, contexte: ContexteStockage): IssueStockage {
  const cle = cleDe(requete);
  const { numero } = attente;
  const adaptateur = adaptateurDe(contexte, requete.outil_id);
  const lue = lireGardee(journal, attente, adaptateur);
  if (lue.genre === "refus") return { genre: "refusee", requete: cle, numero, motif: lue.motif, cause: lue.cause };
  const course = courseDe(requete, adaptateur, journal, contexte);
  try {
    const issue = stockerRecue(course, lue.recue, attente.tentatives);
    if (issue.genre === "ecrite") return { genre: "stockee", requete: cle, numero };
    return { genre: "echec_conclu", requete: cle, numero, erreur: issue.tentative.erreur, tentatives: attente.tentatives.length + 1 };
  } catch (erreur) {
    return { genre: "refusee", requete: cle, numero, motif: "stockage_impossible", cause: causeDe(erreur) };
  }
}

type Traitement = "deja_ecrite" | "sans_attente" | IssueStockage;

function traiter(requete: RequetePlanifiee, contexte: ContexteStockage): Traitement {
  if (contexte.depot.contient(requete)) return "deja_ecrite";
  const journal = new JournalRequete(contexte.repertoire_tentatives, cleDe(requete));
  const reprise = journal.reprise();
  if (reprise.genre === "tentatives") return "sans_attente";
  return stockerAttente(requete, journal, reprise, contexte);
}

function adaptateurDe(contexte: ContexteStockage, outil_id: string): Adaptateur {
  const adaptateur = contexte.adaptateurs.get(outil_id);
  if (adaptateur === undefined) throw new AdaptateurAbsent(outil_id);
  return adaptateur;
}

/** Les requêtes du plan, ou la seule que `cle` désigne ; `RequeteInconnue` si aucune. */
function requetesVisees(plan: PlanInterrogation, cle: string | undefined): readonly RequetePlanifiee[] {
  const toutes = [...plan.values()].flat();
  if (cle === undefined) return toutes;
  const visees = toutes.filter((requete) => cleDeRequete(requete) === cle);
  if (visees.length === 0) throw new RequeteInconnue(cle);
  return visees;
}

function estIssue(traitement: Traitement): traitement is IssueStockage {
  return typeof traitement !== "string";
}

/**
 * Stocke chaque réponse en attente des requêtes visées (toutes celles du plan, ou celle de clé
 * `cle`). Requête inconnue ou outil sans adaptateur : refus avant toute écriture.
 */
export function stockerEnAttente(plan: PlanInterrogation, contexte: ContexteStockage, cle?: string): BilanStockage {
  const visees = requetesVisees(plan, cle);
  for (const requete of visees) adaptateurDe(contexte, requete.outil_id);
  const traitements = visees.map((requete) => traiter(requete, contexte));
  return {
    deja_ecrites: traitements.filter((t) => t === "deja_ecrite").length,
    sans_attente: traitements.filter((t) => t === "sans_attente").length,
    issues: traitements.filter(estIssue),
  };
}
