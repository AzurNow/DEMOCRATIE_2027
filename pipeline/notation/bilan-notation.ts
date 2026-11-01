/**
 * Le bilan d'une exécution de la chaîne de notation (`chaine.ts`), relu du disque.
 *
 * Il compte, il ne mesure pas : aucune métrique du §8 n'est calculée ici (elles vivent dans
 * `analysis/`). Ce qui est relu : `run.json` (le test contrefactuel inscrit, le retrait des juges,
 * le taux de l'échantillon humain), `verdicts/`, `volume/notations/` et
 * `volume/reponses-contrefactuelles/`, chaque fichier validé contre son schéma
 * (`analysis/lecture-run.ts`). Ce qui n'est sur aucun disque, et vient du résultat de la chaîne :
 * les attentes, que rien n'écrit puisqu'aucun verdict n'est inventé pour elles.
 *
 * **Aucune réponse perdue.** Chaque réponse obtenue a exactement une issue : un verdict écrit, ou
 * une attente avec ses motifs. Une réponse sans issue, ou avec les deux, lève `ReponsePerdue`.
 * Une attente peut porter plusieurs motifs (désaccord et drapeau grave) : `attentes_par_motif`
 * compte chaque motif, `reponses_en_attente` compte les réponses.
 */

import { readFileSync } from "node:fs";
import { dispositionRunNote, lireNotationsDuRun, lireRunJson, lireVerdicts } from "../../analysis/lecture-run.ts";
import type { Ulid } from "../../analysis/types.ts";
import type { Attente, MotifEnAttente, ResultatChaine } from "./chaine.ts";
import { MOTIFS_ATTENTE } from "./decision.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { ChangementsContrefactuel } from "./types.ts";

/** L'ordre d'impression des motifs : ceux de `decider`, puis ceux qui empêchent d'y arriver. */
export const MOTIFS_DU_BILAN: readonly MotifEnAttente[] = [...MOTIFS_ATTENTE, "test_liens", "contrefactuel_en_attente", "run_invalide"];

export interface JugeAuBilan {
  readonly juge_id: string;
  readonly retire: boolean;
  /** Absent tant que le test n'est pas inscrit, ou s'il est indéfini. */
  readonly changements_contrefactuel?: ChangementsContrefactuel;
  readonly notations_run: number;
  readonly notations_contrefactuel: number;
}

export interface BilanNotation {
  /** `inscrit` que l'inscription ait eu lieu à cette exécution ou à une précédente : le bilan dit l'état du disque. */
  readonly statut_contrefactuel: "inscrit" | "en_attente_test_liens" | "run_invalide";
  /** `run.json#/contrefactuel_candidats`, s'il est inscrit. */
  readonly contrefactuel_inscrit?: { readonly etat: string; readonly eligibles: number; readonly taille: number; readonly sous_effectif: boolean };
  readonly taux_echantillon_humain: number;
  readonly juges: readonly JugeAuBilan[];
  readonly reponses_obtenues: number;
  readonly verdicts: number;
  readonly verdicts_par_mode: Readonly<Record<string, number>>;
  readonly reponses_en_attente: number;
  readonly attentes_par_motif: Readonly<Partial<Record<MotifEnAttente, number>>>;
  readonly notations_humaines: number;
  /** D32 : notations inscrites par la règle d'un refus de l'API, sans juge. */
  readonly notations_par_regle: number;
  readonly reponses_contrefactuelles: number;
}

export class ReponsePerdue extends Error {
  constructor(detail: string) {
    super(`Bilan de notation : ${detail}`);
    this.name = "ReponsePerdue";
  }
}

interface ContrefactuelLu {
  readonly etat: string;
  readonly eligibles: number;
  readonly taille: number;
  readonly sous_effectif: boolean;
}

export function bilanNotation(repertoire_run: string, resultat: ResultatChaine, reponses_obtenues: readonly Ulid[]): BilanNotation {
  const run = lireRunJson(repertoire_run);
  const verdicts = lireVerdicts(repertoire_run, run.id).filter((v) => reponses_obtenues.includes(v.objet_note.id));
  const { notations, reponses_contrefactuelles } = lireNotationsDuRun(repertoire_run, run.id);
  exigerUneIssueParReponse(reponses_obtenues, verdicts.map((v) => v.objet_note.id), resultat.attentes);
  const brut = JSON.parse(readFileSync(dispositionRunNote(repertoire_run).run_json, "utf8")) as { readonly contrefactuel_candidats?: ContrefactuelLu };
  const inscrit = brut.contrefactuel_candidats;
  return {
    statut_contrefactuel: resultat.contrefactuel.statut === "deja_inscrit" ? "inscrit" : resultat.contrefactuel.statut,
    ...(inscrit === undefined
      ? {}
      : { contrefactuel_inscrit: { etat: inscrit.etat, eligibles: inscrit.eligibles, taille: inscrit.taille, sous_effectif: inscrit.sous_effectif } }),
    taux_echantillon_humain: run.taux_echantillon_humain,
    juges: run.juges.map((juge) => ({
      juge_id: juge.juge_id,
      retire: juge.retire,
      ...(juge.changements_contrefactuel === undefined ? {} : { changements_contrefactuel: juge.changements_contrefactuel }),
      notations_run: notations.filter((n) => n.notateur.id === juge.juge_id && n.contexte === "run").length,
      notations_contrefactuel: notations.filter((n) => n.notateur.id === juge.juge_id && n.contexte === "contrefactuel_candidat").length,
    })),
    reponses_obtenues: reponses_obtenues.length,
    verdicts: verdicts.length,
    verdicts_par_mode: compter(verdicts.map((v) => v.mode_resolution)),
    reponses_en_attente: resultat.attentes.length,
    attentes_par_motif: compter(resultat.attentes.flatMap((a) => a.motifs)),
    notations_humaines: notations.filter((n) => n.notateur.type === "humain").length,
    notations_par_regle: notations.filter((n) => n.notateur.type === "regle").length,
    reponses_contrefactuelles: reponses_contrefactuelles.length,
  };
}

function compter<T extends string>(valeurs: readonly T[]): Partial<Record<T, number>> {
  const comptes: Partial<Record<T, number>> = {};
  for (const valeur of [...valeurs].sort(comparerChaines)) {
    const deja = comptes[valeur];
    comptes[valeur] = deja === undefined ? 1 : deja + 1;
  }
  return comptes;
}

function exigerUneIssueParReponse(obtenues: readonly Ulid[], verdicts: readonly Ulid[], attentes: readonly Attente[]): void {
  const issues = [...verdicts, ...attentes.map((a) => a.reponse_id)].sort(comparerChaines);
  const attendues = [...obtenues].sort(comparerChaines);
  if (issues.join("\u0000") !== attendues.join("\u0000")) {
    throw new ReponsePerdue(
      `${obtenues.length} réponse(s) obtenue(s), ${verdicts.length} verdict(s) et ${attentes.length} attente(s) : chaque réponse doit avoir exactement une issue.`,
    );
  }
}
