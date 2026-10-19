/**
 * Ce que `pnpm extraire` écrit sous sa sortie (`staging/` du dépôt en mode réel, un répertoire hors
 * du dépôt en mode simulé), et ce qu'il y relit pour reprendre. Règle 3 : le pipeline n'écrit que
 * dans `staging/` ; la promotion appartient à l'interface de validation.
 *
 * | Fichier | Schéma | Quand |
 * | --- | --- | --- |
 * | `reponses-extraction/<cle_source>/<sha256>/<modèle encodé>.<prompt_sha256>.json` | `reponse-extraction` | dès la réception, avant toute lecture du corps (règle 7) |
 * | `identifiants-extraction/<cle_source>/<sha256>.json` | aucun (tableau d'ULID validés individuellement) | avant le premier item ou la première mesure déposés |
 * | `items/<id>.json`, `mesures/<id>.json` | `item`, `mesure` | après l'extraction, lus par `validation/io/staging.ts:chargerStaging` |
 * | `journal-extraction/<cle_source>/<sha256>.json` | `journal-extraction` | en dernier : il marque la source traitée |
 *
 * Chaque fichier est validé contre son schéma avant l'écriture (une donnée non conforme est une
 * erreur de code, rien n'est écrit), puis écrit une fois, de façon atomique : un temporaire du même
 * répertoire, puis un lien vers le nom final, qui échoue si ce nom existe déjà
 * (`DejaEcrit`, calqué sur `pipeline/reformulation/staging.ts`). Rien n'est jamais réécrit, sauf les
 * items et les mesures à la relance (`ecrireItemRepris`, `ecrireMesureRepris`) : un fichier déjà
 * présent sous l'identifiant repris n'est alors ni comparé ni réécrit, simplement laissé tel quel
 * (constat 3 de la revue du 2026-10-17).
 *
 * La clé d'une réponse gardée est (source, modèle, empreinte du prompt rendu) : le nom du fichier la
 * porte, et `lireReponseGardee` vérifie que le contenu dit la même chose.
 *
 * Une réponse dont le statut est un échec de transport (408, 429, 5xx — `editeur.ts:
 * estEchecTransportHttp`, §4, D54 (2), constat 2 du 2026-10-17) est gardée elle aussi (règle 7),
 * mais sous un nom distinct, numéroté par un aléa (`.echec-transport-<hex>.json`), que
 * `lireReponseGardee` ne lit jamais : `lireReponseGardeeUtilisable` est la seule entrée que
 * `executer.ts` interroge pour savoir si un appel peut être évité, et elle ne rend jamais une telle
 * réponse. Une réponse d'un tel statut trouvée sous le nom propre (écrite par une version du code
 * antérieure à la révision 0.19, qui ne distinguait pas le statut) y est déplacée au premier
 * passage, pour libérer ce nom à la relance, sans jamais être ni réécrite ni effacée.
 */

import { randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NomSchema } from "../../outils/schemas/noms.ts";
import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import type { Item } from "../../validation/domaine/types.ts";
import type { ObjetJson } from "../interrogation/types.ts";
import type { MesureStaging } from "./assemblage.ts";
import { estEchecTransportHttp } from "./editeur.ts";
import type { Rejet } from "./rejets.ts";

export const REPERTOIRE_REPONSES = "reponses-extraction";
export const REPERTOIRE_JOURNAUX = "journal-extraction";
export const REPERTOIRE_IDENTIFIANTS = "identifiants-extraction";

export type CorpsGarde = { readonly brut: ObjetJson } | { readonly brut_texte: string };

/** `schema/reponse-extraction.schema.json`, champ pour champ. */
export type ReponseGardee = {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly modele: string;
  readonly version_prompt: string;
  readonly prompt_sha256: string;
  readonly date: string;
  readonly statut_http: number;
  readonly brut_octets_sha256: string;
} & CorpsGarde;

export type Lecture = { readonly lisible: true } | { readonly lisible: false; readonly raison: string };

export interface ReponseJournal {
  readonly modele: string;
  readonly statut_http: number;
  readonly brut_octets_sha256: string;
  readonly lecture: Lecture;
}

export type IssueJournal =
  | { readonly statut: "extraite"; readonly items: readonly string[]; readonly mesures: readonly string[]; readonly rejets: readonly Rejet[] }
  | { readonly statut: "refusee"; readonly rejets: readonly Rejet[] };

/** `schema/journal-extraction.schema.json`, champ pour champ. */
export interface JournalExtraction {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly texte_sha256: string;
  readonly date: string;
  readonly commit: string;
  readonly version_prompt: string;
  readonly prompt_sha256: string;
  readonly reponses: readonly ReponseJournal[];
  readonly issue: IssueJournal;
}

export interface CleReponse {
  readonly cle_source: string;
  readonly sha256_source: string;
  readonly modele: string;
  readonly prompt_sha256: string;
}

export class DejaEcrit extends Error {
  constructor(chemin: string) {
    super(`Fichier déjà écrit, jamais réécrit (règle 7) : ${chemin}.`);
    this.name = "DejaEcrit";
  }
}

export class StagingExtractionIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : ${detail} Rien n'est ignoré : corriger ou retirer ce fichier à la main.`);
    this.name = "StagingExtractionIllisible";
  }
}

/* ------------------------------------------------------------------- chemins */

export function cheminReponse(sortie: string, cle: CleReponse): string {
  return join(sortie, REPERTOIRE_REPONSES, cle.cle_source, cle.sha256_source, `${encodeURIComponent(cle.modele)}.${cle.prompt_sha256}.json`);
}

export function cheminJournal(sortie: string, cle_source: string, sha256_source: string): string {
  return join(sortie, REPERTOIRE_JOURNAUX, cle_source, `${sha256_source}.json`);
}

function cheminObjet(sortie: string, repertoire: "items" | "mesures", id: string): string {
  return join(sortie, repertoire, `${id}.json`);
}

/* ------------------------------------------------------------------ écriture */

/** Écrit une fois, atomiquement : un temporaire du même répertoire, puis un lien vers le nom final. */
function ecrireAtomique(chemin: string, texte: string): void {
  const repertoire = dirname(chemin);
  mkdirSync(repertoire, { recursive: true });
  const tmp = join(repertoire, `.ecriture.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, texte, { encoding: "utf8", flag: "wx" });
  try {
    linkSync(tmp, chemin);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new DejaEcrit(chemin);
    throw erreur;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Valide, puis écrit une fois ; lève `ErreurSchema` ou `DejaEcrit` sans rien laisser alors. */
function ecrireUneFois(schema: NomSchema, chemin: string, valeur: unknown): string {
  ecrireAtomique(chemin, `${JSON.stringify(valider(schema, valeur, `${schema} à écrire dans ${chemin}`), null, 2)}\n`);
  return chemin;
}

/**
 * Comme `ecrireUneFois`, sauf qu'un fichier déjà présent au même chemin n'est pas réécrit : la
 * relance après un arrêt entre les items et le journal (constat 3) retrouve ainsi l'item ou la
 * mesure qu'une tentative précédente avait déjà écrits sous l'identifiant repris
 * (`lireIdentifiantsRepris`), sans jamais comparer ni réécrire leur contenu.
 */
function ecrireSiAbsent(schema: NomSchema, chemin: string, valeur: unknown): string {
  if (existsSync(chemin)) return chemin;
  return ecrireUneFois(schema, chemin, valeur);
}

export function ecrireReponse(sortie: string, reponse: ReponseGardee): string {
  return ecrireUneFois("reponse-extraction", cheminReponse(sortie, reponse), reponse);
}

/** Le nom distinct d'une réponse en échec de transport, jamais celui que `lireReponseGardee` lit. */
function cheminEchecTransport(chemin: string): string {
  return `${chemin.slice(0, -".json".length)}.echec-transport-${randomBytes(6).toString("hex")}.json`;
}

/**
 * Garde une réponse dont le statut est un échec de transport (règle 7), sous son nom distinct : la
 * relance refait l'appel plutôt que de la relire (constat 2 du 2026-10-17, D54 (2)).
 */
export function ecrireReponseEchecTransport(sortie: string, reponse: ReponseGardee): string {
  return ecrireUneFois("reponse-extraction", cheminEchecTransport(cheminReponse(sortie, reponse)), reponse);
}

export function ecrireItemRepris(sortie: string, item: Item): string {
  return ecrireSiAbsent("item", cheminObjet(sortie, "items", item.id), item);
}

export function ecrireMesureRepris(sortie: string, mesure: MesureStaging): string {
  return ecrireSiAbsent("mesure", cheminObjet(sortie, "mesures", mesure.id), mesure);
}

export function ecrireJournal(sortie: string, journal: JournalExtraction): string {
  return ecrireUneFois("journal-extraction", cheminJournal(sortie, journal.cle_source, journal.sha256_source), journal);
}

/* ------------------------------------------------------------------- reprise */

export function journalPresent(sortie: string, cle_source: string, sha256_source: string): boolean {
  return existsSync(cheminJournal(sortie, cle_source, sha256_source));
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  } catch (erreur) {
    throw new StagingExtractionIllisible(chemin, `JSON illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
}

const CHAMPS_DE_LA_CLE: readonly (keyof CleReponse)[] = ["cle_source", "sha256_source", "modele", "prompt_sha256"];

/** La réponse gardée sous cette clé, ou `null` ; un fichier qui ne dit pas sa propre clé arrête tout. */
export function lireReponseGardee(sortie: string, cle: CleReponse): ReponseGardee | null {
  const chemin = cheminReponse(sortie, cle);
  if (!existsSync(chemin)) return null;
  const reponse = valider<ReponseGardee>("reponse-extraction", lireJson(chemin), chemin);
  const ecart = CHAMPS_DE_LA_CLE.find((champ) => reponse[champ] !== cle[champ]);
  if (ecart !== undefined) throw new StagingExtractionIllisible(chemin, `porte ${ecart} « ${reponse[ecart]} », son nom dit « ${cle[ecart]} ».`);
  return reponse;
}

/**
 * La réponse gardée sous cette clé, utilisable comme réponse d'un modèle ; `null` si aucune n'est
 * gardée, ou si celle qui l'est porte un statut d'échec de transport (408, 429, 5xx) — une telle
 * réponse n'est jamais rejouée (constat 2 du 2026-10-17, D54 (2)). Trouvée sous le nom propre (une
 * version du code antérieure à la révision 0.19 l'y aurait écrite, sans distinguer le statut), elle
 * est déplacée sous son nom d'échec pour libérer ce nom à la relance, sans être ni réécrite ni
 * effacée.
 */
export function lireReponseGardeeUtilisable(sortie: string, cle: CleReponse): ReponseGardee | null {
  const gardee = lireReponseGardee(sortie, cle);
  if (gardee === null || !estEchecTransportHttp(gardee.statut_http)) return gardee;
  const chemin = cheminReponse(sortie, cle);
  renameSync(chemin, cheminEchecTransport(chemin));
  return null;
}

export function cheminIdentifiants(sortie: string, cle_source: string, sha256_source: string): string {
  return join(sortie, REPERTOIRE_IDENTIFIANTS, cle_source, `${sha256_source}.json`);
}

function exigerTableauDeChaines(valeur: unknown, chemin: string): readonly string[] {
  if (!Array.isArray(valeur) || !valeur.every((entree): entree is string => typeof entree === "string")) {
    throw new StagingExtractionIllisible(chemin, "les identifiants repris devraient être un tableau de chaînes.");
  }
  return valeur;
}

/**
 * Les identifiants (mesure puis item, par paire déposée, dans l'ordre où `deposer` les tire) qu'une
 * tentative précédente a déjà tirés pour cette source, avant d'écrire le premier item ou la
 * première mesure ; `null` si aucune tentative n'en a encore tiré. Reconnu à la relance (constat 3) :
 * `deposer` réutilise alors exactement ces identifiants plutôt que d'en tirer de nouveaux, ce qui
 * déposerait les mêmes items une seconde fois sous un autre nom. Ce fichier n'est ni un item, ni
 * une mesure, ni un journal, et n'est jamais lu par la validation : pas de schéma JSON propre pour
 * lui, mais chaque identifiant qu'il porte est validé contre `commun#/$defs/ulid`.
 */
export function lireIdentifiantsRepris(sortie: string, cle_source: string, sha256_source: string): readonly string[] | null {
  const chemin = cheminIdentifiants(sortie, cle_source, sha256_source);
  if (!existsSync(chemin)) return null;
  const identifiants = exigerTableauDeChaines(lireJson(chemin), chemin);
  return identifiants.map((id, index) => validerFragment<string>("commun", "#/$defs/ulid", id, `${chemin}[${index}]`));
}

export function ecrireIdentifiantsRepris(sortie: string, cle_source: string, sha256_source: string, identifiants: readonly string[]): string {
  const chemin = cheminIdentifiants(sortie, cle_source, sha256_source);
  identifiants.forEach((id, index) => validerFragment<string>("commun", "#/$defs/ulid", id, `${chemin}[${index}] à écrire`));
  ecrireAtomique(chemin, `${JSON.stringify(identifiants, null, 2)}\n`);
  return chemin;
}
