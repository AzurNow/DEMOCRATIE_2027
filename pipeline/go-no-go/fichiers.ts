/**
 * Lecture et écriture des fichiers que le go/no-go touche : `run.json` et `checklist.json`.
 * L'écriture est celle, partagée, de `pipeline/run/ecriture.ts` (fichier temporaire créé en
 * exclusif, synchronisé, puis renommé ; `TemporaireOrphelin` si un arrêt brutal en a laissé un ;
 * temporaire retiré si l'écriture échoue et que l'erreur est rattrapée) : plus de copie locale.
 * Le temporaire se nomme `<fichier>.go-no-go`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ecrireParRenommage as ecrireParRenommagePartage, ecrireParRenommageSiInchange, type EcritureTemporaire } from "../run/ecriture.ts";

const SUFFIXE_TEMPORAIRE = "go-no-go";

export function cheminChecklist(repertoire_run: string): string {
  return join(repertoire_run, "checklist.json");
}

export function lireJson(chemin: string): unknown {
  return JSON.parse(readFileSync(chemin, "utf8"));
}

/** `run.json` réécrit après lecture : refus (`RunModifieEntreTemps`) s'il a changé depuis `texte_lu`. */
export function ecrireRunSiInchange(chemin: string, valeur: unknown, texte_lu: string): void {
  ecrireParRenommageSiInchange(chemin, valeur, SUFFIXE_TEMPORAIRE, texte_lu);
}

/** `ecriture` : point d'injection des tests d'interruption, jamais fourni par un appelant de production. */
export function ecrireParRenommage(chemin: string, valeur: unknown, ecriture?: EcritureTemporaire): void {
  ecrireParRenommagePartage(chemin, valeur, SUFFIXE_TEMPORAIRE, ecriture);
}
