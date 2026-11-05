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
 * fichier définitif partiel. Si l'écriture ou la synchronisation du temporaire échoue et que ce
 * processus rattrape l'erreur (disque plein, par exemple), le temporaire qu'il vient de créer est
 * supprimé avant que l'erreur d'origine ne remonte : la relance qui suit écrit normalement. Seul un
 * arrêt brutal (processus tué, qui ne rattrape rien) laisse un `.partiel` orphelin. Comme
 * l'identifiant d'une réponse est opaque et neuf à chaque écriture, la relance n'écrit jamais sous le
 * même nom : `ecrire` ne rencontre donc pas cet orphelin (le `TemporaireOrphelin` de
 * `pipeline/run/ecriture.ts` n'y couvre qu'un identifiant rejoué). C'est `toutes()`, donc
 * `DepotReponses.ouvrir`, qui le trouve dans le répertoire et le refuse en `TemporaireOrphelin`,
 * plutôt que de l'écraser ou de le supprimer d'elle-même, car il peut aussi signaler un écrivain
 * concurrent. L'exclusivité du nom de fichier ne suffisant pas à empêcher deux réponses pour une même
 * requête, le dépôt tient aussi l'index des requêtes déjà écrites, et refuse la seconde.
 *
 * À l'ouverture, toutes les réponses déjà écrites sont relues et validées : c'est ce qui permet à
 * une relance de sauter ce qui est fait, et ce qui fait apparaître un fichier abîmé. Un `.partiel`
 * n'est jamais lu comme une réponse (il ne porte pas l'extension `.json`, jamais de `JSON.parse`) :
 * il lève `TemporaireOrphelin`. Tout autre fichier étranger du répertoire lève `FichierEtranger`.
 */

import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { ouvrirTemporaireExclusif, TemporaireOrphelin, type EcritureTemporaire } from "../run/ecriture.ts";
import { dateParis, lireInstant } from "../../analysis/heure-paris.ts";
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

/** `repertoire` contient un fichier qui n'est ni une réponse (`.json`) ni un temporaire `.partiel`. */
export class FichierEtranger extends Error {
  constructor(repertoire: string, noms: readonly string[]) {
    super(`${repertoire} : fichiers qui ne sont pas des réponses, ni lus ni ignorés : ${noms.join(", ")}`);
    this.name = "FichierEtranger";
  }
}

const SUFFIXE_PARTIEL = ".partiel";

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

const ECRITURE_REELLE: EcritureTemporaire = { writeSync, fsyncSync };

/** `ecriture` : point d'injection pour les tests d'interruption, jamais fourni par un appelant de production. */
function ecrireExclusif(chemin: string, contenu: string, ecriture: EcritureTemporaire = ECRITURE_REELLE): void {
  const temporaire = `${chemin}.partiel`;
  const descripteur = ouvrirTemporaireExclusif(temporaire, chemin, "reponse");
  try {
    ecriture.writeSync(descripteur, contenu);
    ecriture.fsyncSync(descripteur);
  } catch (erreur) {
    closeSync(descripteur);
    unlinkSync(temporaire);
    throw erreur;
  }
  closeSync(descripteur);
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

  /**
   * Valide, puis écrit une fois. Lève `ErreurSchema` ou `ReponseDejaEcrite`, n'écrit rien alors.
   * `ecriture` : point d'injection pour les tests d'interruption, jamais fourni en production.
   */
  ecrire(reponse: ReponseEcrite, ecriture?: EcritureTemporaire): void {
    const chemin = this.chemin(reponse.id);
    valider<ReponseEcrite>("reponse", reponse, `réponse ${reponse.id} avant écriture`);
    const cle = cleCanonique(reponse);
    const deja = this.ecrites.get(cle);
    if (deja !== undefined) throw new ReponseDejaEcrite(`la requête ${cle} a déjà sa réponse ${deja}`);
    ecrireExclusif(chemin, `${JSON.stringify(reponse, null, 2)}\n`, ecriture);
    this.ecrites.set(cle, reponse.id);
  }

  /** Toutes les réponses écrites, relues du disque et validées, dans l'ordre des noms de fichier. */
  toutes(): readonly ReponseEcrite[] {
    if (!existsSync(this.repertoire)) return [];
    const noms = readdirSync(this.repertoire).sort();
    const orphelin = noms.find((nom) => nom.endsWith(`.json${SUFFIXE_PARTIEL}`));
    if (orphelin !== undefined) {
      const temporaire = join(this.repertoire, orphelin);
      throw new TemporaireOrphelin(temporaire, temporaire.slice(0, -SUFFIXE_PARTIEL.length), "reponse");
    }
    const etrangers = noms.filter((nom) => !nom.endsWith(".json"));
    if (etrangers.length > 0) throw new FichierEtranger(this.repertoire, etrangers);
    return noms.map((nom) => lireReponse(join(this.repertoire, nom)));
  }
}
