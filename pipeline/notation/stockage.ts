/**
 * Le stockage de la notation d'un run : quatre écrivains, sur la disposition de `runs/README.md`.
 *
 *   verdicts/<id>.json                          Git        un verdict par objet noté, de contexte run
 *   volume/notations/<id>.json                  hors Git   une notation individuelle par fichier
 *   volume/reponses-contrefactuelles/<id>.json  hors Git   les réponses permutées du test (§7)
 *   volume/renvois/<id>.json                    hors Git   les renvois de juge vers l'humain (D30 (2))
 *
 * Mêmes garanties que `pipeline/interrogation/stockage.ts:DepotReponses` (règle 7) : chaque objet
 * est validé contre son schéma, puis écrit par ouverture exclusive (`wx`), synchronisé sur disque ;
 * un fichier existant n'est jamais remplacé (`FichierDejaEcrit`). Rien n'est écrit quand un
 * contrôle échoue. L'ouverture exclusive de `DepotReponses` n'est pas exportée et lève
 * `ReponseDejaEcrite` : la factoriser changerait l'erreur de l'interrogation, donc elle est
 * dupliquée ici au strict minimum.
 *
 * Contrôles propres à chaque dossier (`ObjetHorsDeSonDossier`) :
 *
 * - tout objet porte le `run_id` du run du répertoire (`run.json`) ;
 * - un verdict n'est écrit que pour un objet de contexte `run`, et un seul par objet noté (deux
 *   verdicts sur un même objet, `assembler()` les refuserait : on les refuse dès l'écriture) ;
 * - une réponse contrefactuelle n'est jamais de contexte `run` (elle n'a été produite par aucun
 *   outil, et le stockage de l'interrogation refuserait une seconde réponse pour la requête qu'elle
 *   partage avec sa réponse d'origine), et une seule par réponse d'origine et par contexte.
 *
 * À l'ouverture, les verdicts et les réponses contrefactuelles déjà écrits sont relus et validés
 * (`analysis/lecture-run.ts`) : c'est ce qui fait tenir les deux règles « un seul » après une relance.
 */

import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { dispositionRunNote, lireDossier, lireRunJson, lireVerdicts, type DispositionRunNote } from "../../analysis/lecture-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import type { ContexteMesure } from "../../analysis/types.ts";
import type { NotationIndividuelle, RenvoiHumain, VerdictProduit } from "../../analysis/types-notation.ts";

/**
 * Une réponse contrefactuelle telle que l'écrivain la contrôle : le reste de l'objet est validé
 * contre `schema/reponse.schema.json` (`reponse-contrefactuelle.ts:ReponseContrefactuelle` s'y
 * range). Le contexte est large ici parce qu'il est contrôlé, pas supposé.
 */
export interface ReponseAEcrire {
  readonly id: string;
  readonly run_id: string;
  readonly contexte: ContexteMesure;
  /** Exigé par le schéma hors du contexte run ; absent d'une réponse de contexte run. */
  readonly derive_de_reponse_id?: string;
}

export class FichierDejaEcrit extends Error {
  constructor(chemin: string) {
    super(`Fichier déjà écrit, jamais réécrit (règle 7) : ${chemin}`);
    this.name = "FichierDejaEcrit";
  }
}

export class ObjetHorsDeSonDossier extends Error {
  constructor(detail: string) {
    super(`Écriture refusée : ${detail}`);
    this.name = "ObjetHorsDeSonDossier";
  }
}

function ecrireExclusif(chemin: string, valeur: unknown): void {
  let descripteur: number;
  try {
    descripteur = openSync(chemin, "wx");
  } catch (erreur) {
    if (erreur instanceof Error && "code" in erreur && erreur.code === "EEXIST") throw new FichierDejaEcrit(chemin);
    throw erreur;
  }
  try {
    writeSync(descripteur, `${JSON.stringify(valeur, null, 2)}\n`);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
}

function cleObjet(objet: VerdictProduit["objet_note"]): string {
  return `${objet.type}\u0000${objet.id}`;
}

function cleContrefactuelle(reponse: ReponseAEcrire): string {
  if (reponse.derive_de_reponse_id === undefined) throw new ObjetHorsDeSonDossier(`réponse ${reponse.id} sans derive_de_reponse_id.`);
  return `${reponse.contexte}\u0000${reponse.derive_de_reponse_id}`;
}

export class DepotNotation {
  readonly disposition: DispositionRunNote;
  readonly run_id: string;
  private readonly verdicts: Map<string, string>;
  private readonly contrefactuelles: Map<string, string>;

  private constructor(disposition: DispositionRunNote, run_id: string) {
    this.disposition = disposition;
    this.run_id = run_id;
    this.verdicts = new Map();
    this.contrefactuelles = new Map();
  }

  /** Lit `run.json`, crée au besoin les quatre dossiers, relit et indexe ce qui est déjà écrit. */
  static ouvrir(repertoire_run: string): DepotNotation {
    const run = lireRunJson(repertoire_run);
    const disposition = dispositionRunNote(repertoire_run);
    for (const dossier of [disposition.verdicts, disposition.notations, disposition.reponses_contrefactuelles, disposition.renvois]) mkdirSync(dossier, { recursive: true });
    const depot = new DepotNotation(disposition, run.id);
    for (const verdict of lireVerdicts(repertoire_run, run.id)) depot.indexer(depot.verdicts, cleObjet(verdict.objet_note), verdict.id);
    for (const reponse of lireDossier<ReponseAEcrire>(disposition.reponses_contrefactuelles, "reponse", run.id)) {
      depot.verifierContexteContrefactuel(reponse);
      depot.indexer(depot.contrefactuelles, cleContrefactuelle(reponse), reponse.id);
    }
    return depot;
  }

  private indexer(index: Map<string, string>, cle: string, id: string): void {
    const deja = index.get(cle);
    if (deja !== undefined) throw new ObjetHorsDeSonDossier(`${id} et ${deja} portent sur le même objet (${cle.replace("\u0000", " ")}).`);
    index.set(cle, id);
  }

  private verifierRun(objet: { readonly id: string; readonly run_id: string }, quoi: string): void {
    if (objet.run_id !== this.run_id) throw new ObjetHorsDeSonDossier(`${quoi} ${objet.id} du run ${objet.run_id}, sous le run ${this.run_id}.`);
  }

  private verifierContexteContrefactuel(reponse: ReponseAEcrire): void {
    if (reponse.contexte === "run") {
      throw new ObjetHorsDeSonDossier(`réponse ${reponse.id} de contexte run : volume/reponses-contrefactuelles/ n'accueille que les réponses permutées.`);
    }
  }

  /** `volume/notations/<id>.json`. Lève `ErreurSchema`, `ObjetHorsDeSonDossier` ou `FichierDejaEcrit`. */
  ecrireNotation(notation: NotationIndividuelle): void {
    valider<NotationIndividuelle>("notation", notation, `notation ${notation.id} avant écriture`);
    this.verifierRun(notation, "notation");
    ecrireExclusif(join(this.disposition.notations, `${notation.id}.json`), notation);
  }

  /** `volume/renvois/<id>.json` (D30 (2)). Lève `ErreurSchema`, `ObjetHorsDeSonDossier` ou `FichierDejaEcrit`. */
  ecrireRenvoi(renvoi: RenvoiHumain): void {
    valider<RenvoiHumain>("renvoi-humain", renvoi, `renvoi ${renvoi.id} avant écriture`);
    this.verifierRun(renvoi, "renvoi");
    ecrireExclusif(join(this.disposition.renvois, `${renvoi.id}.json`), renvoi);
  }

  /** `verdicts/<id>.json`, pour un objet de contexte run, un seul par objet noté. */
  ecrireVerdict(verdict: VerdictProduit): void {
    valider<VerdictProduit>("verdict", verdict, `verdict ${verdict.id} avant écriture`);
    this.verifierRun(verdict, "verdict");
    if (verdict.contexte !== "run") {
      throw new ObjetHorsDeSonDossier(`verdict ${verdict.id} de contexte ${verdict.contexte} : seul un objet de contexte run reçoit un verdict.`);
    }
    const cle = cleObjet(verdict.objet_note);
    const deja = this.verdicts.get(cle);
    if (deja !== undefined) throw new ObjetHorsDeSonDossier(`l'objet ${verdict.objet_note.type} ${verdict.objet_note.id} a déjà son verdict ${deja}.`);
    ecrireExclusif(join(this.disposition.verdicts, `${verdict.id}.json`), verdict);
    this.verdicts.set(cle, verdict.id);
  }

  /** `volume/reponses-contrefactuelles/<id>.json`, jamais de contexte run, une par réponse d'origine. */
  ecrireReponseContrefactuelle(reponse: ReponseAEcrire): void {
    valider<ReponseAEcrire>("reponse", reponse, `réponse contrefactuelle ${reponse.id} avant écriture`);
    this.verifierRun(reponse, "réponse contrefactuelle");
    this.verifierContexteContrefactuel(reponse);
    const cle = cleContrefactuelle(reponse);
    const deja = this.contrefactuelles.get(cle);
    if (deja !== undefined) throw new ObjetHorsDeSonDossier(`la réponse ${reponse.derive_de_reponse_id} a déjà sa réponse ${reponse.contexte} ${deja}.`);
    ecrireExclusif(join(this.disposition.reponses_contrefactuelles, `${reponse.id}.json`), reponse);
    this.contrefactuelles.set(cle, reponse.id);
  }
}
