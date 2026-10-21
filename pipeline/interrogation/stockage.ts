/**
 * Le stockage des réponses d'un run : un fichier `reponses/<id>.json` par réponse, écrit une fois.
 *
 * Règle 7 : « Les réponses brutes sont immuables. » Chaque réponse est validée contre
 * `schema/reponse.schema.json` au moment de l'écriture, puis écrite atomiquement : d'abord dans un
 * temporaire `<id>.json.partiel` du même répertoire, créé en exclusif (`wx`) et synchronisé, puis
 * publiée sous son nom définitif par lien dur (`linkSync`), qui échoue en `EEXIST` si ce nom existe
 * déjà (c'est l'exclusivité, traduite en `ReponseDejaEcrite` comme avant — le temporaire qu'on vient
 * de créer est alors supprimé pour ne laisser aucun déchet), puis le temporaire est supprimé dans
 * tous les cas. Un arrêt entre l'écriture du temporaire et sa publication ne laisse donc jamais de
 * fichier définitif partiel ; au pire un `.partiel` orphelin, que la relance refuse
 * (`TemporaireOrphelin`, `pipeline/run/ecriture.ts`) plutôt que d'écraser ou de supprimer d'elle-même,
 * car il peut aussi signaler un écrivain concurrent. Comme l'identifiant d'une réponse est opaque et
 * neuf à chaque écriture, l'exclusivité du nom de fichier ne suffit pas à empêcher deux réponses pour
 * une même requête : le dépôt tient aussi l'index des requêtes déjà écrites, et refuse la seconde.
 *
 * À l'ouverture, toutes les réponses déjà écrites sont relues et validées : c'est ce qui permet à
 * une relance de sauter ce qui est fait, et ce qui fait apparaître un fichier abîmé. Un `.partiel`
 * resté là n'est jamais lu comme une réponse : il ne porte pas l'extension `.json`, et tombe donc
 * dans le refus déjà en place pour tout fichier étranger du répertoire, jamais dans un `JSON.parse`.
 */

import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { ouvrirTemporaireExclusif } from "../run/ecriture.ts";
import { dateParis, lireInstant } from "./heure-paris.ts";
import { cleDe, type ReponseEcrite } from "./types.ts";

/** `runs/README.md` : où vivent les fichiers d'un run, sous une racine donnée (`runs/` ou autre). */
export interface DispositionRun {
  /** `<racine>/<AAAA-MM-JJ>`, la date de `date_gel` à Paris. */
  readonly run: string;
  /** Hors Git : ce qui part dans l'archive Zenodo (CLAUDE.md, « Ce que Git stocke »). */
  readonly volume: string;
  readonly reponses: string;
  readonly tentatives: string;
}

export function dispositionRun(racine: string, date_gel: string): DispositionRun {
  return dispositionDuRepertoire(join(racine, dateParis(lireInstant(date_gel, "date_gel"))));
}

/**
 * La même disposition sous un répertoire de run déjà nommé par sa date : celui qu'écrit
 * `pnpm geler` (`<sortie>/<date>/`, `pipeline/gel/destination.ts`), que `pnpm run:dry --run` reçoit.
 */
export function dispositionDuRepertoire(run: string): DispositionRun {
  const volume = join(run, "volume");
  return { run, volume, reponses: join(volume, "reponses"), tentatives: join(volume, "tentatives") };
}

export class ReponseDejaEcrite extends Error {
  constructor(detail: string) {
    super(`Réponse déjà écrite, jamais réécrite (règle 7) : ${detail}`);
    this.name = "ReponseDejaEcrite";
  }
}

function cleCanonique(reponse: ReponseEcrite): string {
  return canoniser(cleDe(reponse));
}

function lireReponse(chemin: string): ReponseEcrite {
  return valider<ReponseEcrite>("reponse", JSON.parse(readFileSync(chemin, "utf8")) as unknown, chemin);
}

/** Publie `temporaire` sous `chemin` par lien dur : exclusif (§7), sans jamais laisser `chemin` partiel. */
function publierParLien(temporaire: string, chemin: string): void {
  try {
    linkSync(temporaire, chemin);
  } catch (erreur) {
    unlinkSync(temporaire);
    if (erreur instanceof Error && "code" in erreur && erreur.code === "EEXIST") throw new ReponseDejaEcrite(chemin);
    throw erreur;
  }
  unlinkSync(temporaire);
}

function ecrireExclusif(chemin: string, contenu: string): void {
  const temporaire = `${chemin}.partiel`;
  const descripteur = ouvrirTemporaireExclusif(temporaire, chemin, "reponse");
  try {
    writeSync(descripteur, contenu);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
  publierParLien(temporaire, chemin);
}

export class DepotReponses {
  private readonly ecrites = new Map<string, string>();
  readonly repertoire: string;

  private constructor(repertoire: string) {
    this.repertoire = repertoire;
  }

  /** Ouvre (et crée au besoin) le répertoire, relit et valide chaque réponse déjà écrite. */
  static ouvrir(repertoire: string): DepotReponses {
    mkdirSync(repertoire, { recursive: true });
    const depot = new DepotReponses(repertoire);
    for (const reponse of depot.toutes()) depot.indexer(reponse);
    return depot;
  }

  private indexer(reponse: ReponseEcrite): void {
    const cle = cleCanonique(reponse);
    const deja = this.ecrites.get(cle);
    if (deja !== undefined) throw new ReponseDejaEcrite(`deux réponses pour la requête ${cle} : ${deja} et ${reponse.id}`);
    this.ecrites.set(cle, reponse.id);
  }

  contient(cle: Parameters<typeof cleDe>[0]): boolean {
    return this.ecrites.has(canoniser(cleDe(cle)));
  }

  chemin(id: string): string {
    return join(this.repertoire, `${id}.json`);
  }

  /** Valide, puis écrit une fois. Lève `ErreurSchema` ou `ReponseDejaEcrite`, n'écrit rien alors. */
  ecrire(reponse: ReponseEcrite): void {
    const chemin = this.chemin(reponse.id);
    valider<ReponseEcrite>("reponse", reponse, `réponse ${reponse.id} avant écriture`);
    const cle = cleCanonique(reponse);
    const deja = this.ecrites.get(cle);
    if (deja !== undefined) throw new ReponseDejaEcrite(`la requête ${cle} a déjà sa réponse ${deja}`);
    ecrireExclusif(chemin, `${JSON.stringify(reponse, null, 2)}\n`);
    this.ecrites.set(cle, reponse.id);
  }

  /** Toutes les réponses écrites, relues du disque et validées, dans l'ordre des noms de fichier. */
  toutes(): readonly ReponseEcrite[] {
    if (!existsSync(this.repertoire)) return [];
    const noms = readdirSync(this.repertoire).sort();
    const etrangers = noms.filter((nom) => !nom.endsWith(".json"));
    if (etrangers.length > 0) {
      throw new Error(`${this.repertoire} : fichiers qui ne sont pas des réponses, ni lus ni ignorés : ${etrangers.join(", ")}`);
    }
    return noms.map((nom) => lireReponse(join(this.repertoire, nom)));
  }
}
