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
 *
 * `ecrireUneFois` est l'autre écriture partagée : un fichier neuf, publié par lien dur, jamais
 * remplacé. Elle est définie dans `analysis/ecriture-une-fois.ts`, qui sert aussi `metriques.json` et
 * le recalcul (b) daté, et réexportée ici telle quelle (`pipeline/` importe `analysis/`, jamais
 * l'inverse) pour le journal des octets reçus de l'interrogation (`pipeline/interrogation/journal.ts`)
 * et le staging des reformulations (`pipeline/reformulation/staging.ts`) ; chacun fournit son refus
 * nommé.
 */

import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";

export { ecrireUneFois } from "../../analysis/ecriture-une-fois.ts";

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

/**
 * `cible` n'est plus celle que l'appelant a lue : une autre commande l'a réécrite entre la lecture et le
 * renommage (revue du 2026-11-09, constat 2). Rien n'est publié, le temporaire est supprimé, `cible`
 * reste telle que l'autre commande l'a laissée ; relancer la commande relit le fichier à jour.
 */
export class RunModifieEntreTemps extends Error {
  readonly cible: string;

  constructor(cible: string) {
    super(
      `${cible} a changé depuis que cette commande l'a lu : une autre commande l'a réécrit entre-temps. ` +
        `Rien n'est écrit et le fichier est intact ; relancer la commande, qui relira la version à jour.`,
    );
    this.name = "RunModifieEntreTemps";
    this.cible = cible;
  }
}

function ecrireTemporaireAvantRenommage(chemin: string, valeur: unknown, suffixe: string, ecriture: EcritureTemporaire, avant_renommage: () => void): void {
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
  try {
    avant_renommage();
  } catch (erreur) {
    unlinkSync(temporaire);
    throw erreur;
  }
  renameSync(temporaire, chemin);
}

export function ecrireParRenommage(chemin: string, valeur: unknown, suffixe: string, ecriture: EcritureTemporaire = ECRITURE_REELLE): void {
  ecrireTemporaireAvantRenommage(chemin, valeur, suffixe, ecriture, () => undefined);
}

/**
 * `ecrireParRenommage` pour un fichier que l'appelant a lu, fusionné puis réécrit (`run.json`) :
 * `texte_lu` est le texte exact lu au début ; il est relu juste avant le renommage et, s'il a changé,
 * `RunModifieEntreTemps`. La fenêtre restante est celle de la relecture au renommage.
 */
export function ecrireParRenommageSiInchange(chemin: string, valeur: unknown, suffixe: string, texte_lu: string, ecriture: EcritureTemporaire = ECRITURE_REELLE): void {
  ecrireTemporaireAvantRenommage(chemin, valeur, suffixe, ecriture, () => {
    if (readFileSync(chemin, "utf8") !== texte_lu) throw new RunModifieEntreTemps(chemin);
  });
}
