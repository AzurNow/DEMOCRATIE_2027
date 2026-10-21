/**
 * L'écriture d'un `run.json` déjà fusionné et validé par l'appelant : un fichier temporaire créé en
 * exclusif, synchronisé, puis renommé. `run.json` n'est jamais à moitié écrit : si l'écriture ou la
 * synchronisation du temporaire échoue et que ce processus rattrape l'erreur, le temporaire qu'il
 * vient de créer est supprimé avant que l'erreur d'origine ne remonte, pour que la relance qui suit
 * écrive normalement. Seul un arrêt brutal (processus tué, qui ne rattrape rien) laisse un
 * temporaire ; c'est ce temporaire-là, et seulement lui, que `TemporaireOrphelin` refuse plutôt que
 * d'écraser ou de supprimer automatiquement, puisqu'il peut aussi signaler un écrivain concurrent.
 *
 * Partagée par l'inscription du test contrefactuel (`pipeline/notation/inscription-contrefactuel.ts`)
 * et l'invalidation (`invalidation.ts`) ; `suffixe` nomme le temporaire de chacune. `ouvrirTemporaireExclusif`
 * est repris tel quel par le stockage des réponses (`pipeline/interrogation/stockage.ts`), même refus.
 *
 * `EcritureTemporaire` est un point d'injection pour les tests d'interruption : il remplace
 * `writeSync`/`fsyncSync` par une version qui échoue au milieu de l'écriture. Son paramètre par
 * défaut est la vraie écriture disque ; aucun appelant de production ne fournit autre chose.
 */

import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";

/**
 * `temporaire` existait déjà à l'ouverture en exclusif : une écriture précédente, celle que `suffixe`
 * nomme, a été interrompue avant d'avoir publié `cible`, qui reste intact. Le temporaire n'est ni
 * supprimé ni modifié ici. À l'opérateur de vérifier qu'aucune autre commande n'écrit `cible` en ce
 * moment, puis de supprimer `temporaire` et de relancer.
 */
export class TemporaireOrphelin extends Error {
  readonly temporaire: string;
  readonly cible: string;
  readonly suffixe: string;

  constructor(temporaire: string, cible: string, suffixe: string) {
    super(
      `${temporaire} existe déjà : une écriture précédente (${suffixe}) a été interrompue avant de publier ` +
        `${cible}, qui reste intact. Vérifier qu'aucune autre commande n'écrit ${cible} en ce moment, puis ` +
        `supprimer ${temporaire} et relancer.`,
    );
    this.name = "TemporaireOrphelin";
    this.temporaire = temporaire;
    this.cible = cible;
    this.suffixe = suffixe;
  }
}

/** Ouvre `temporaire` en exclusif (`wx`) ; un `EEXIST` devient `TemporaireOrphelin`, tout autre refus remonte tel quel. */
export function ouvrirTemporaireExclusif(temporaire: string, cible: string, suffixe: string): number {
  try {
    return openSync(temporaire, "wx");
  } catch (erreur) {
    if (erreur instanceof Error && "code" in erreur && erreur.code === "EEXIST") throw new TemporaireOrphelin(temporaire, cible, suffixe);
    throw erreur;
  }
}

/** Point d'injection pour les tests d'interruption (non fourni par les appelants de production). */
export interface EcritureTemporaire {
  readonly writeSync: (descripteur: number, contenu: string) => number;
  readonly fsyncSync: (descripteur: number) => void;
}

const ECRITURE_REELLE: EcritureTemporaire = { writeSync, fsyncSync };

export function ecrireParRenommage(chemin: string, valeur: unknown, suffixe: string, ecriture: EcritureTemporaire = ECRITURE_REELLE): void {
  const temporaire = `${chemin}.${suffixe}`;
  const descripteur = ouvrirTemporaireExclusif(temporaire, chemin, suffixe);
  try {
    ecriture.writeSync(descripteur, `${JSON.stringify(valeur, null, 2)}\n`);
    ecriture.fsyncSync(descripteur);
  } catch (erreur) {
    closeSync(descripteur);
    unlinkSync(temporaire);
    throw erreur;
  }
  closeSync(descripteur);
  renameSync(temporaire, chemin);
}
