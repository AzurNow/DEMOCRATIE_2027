/**
 * L'écriture des verdicts de lecture de comparateur (§6 ; D87, option 1) : dès que la note d'une
 * lecture affichée est retenue — accord des deux humains à l'aveugle, ou arbitrage du troisième —, son
 * verdict est écrit dans `verdicts/`, au même endroit et par le même écrivain que ceux des réponses
 * (`stockage.ts:DepotNotation.ecrireVerdict`). C'est ce verdict que `pnpm analyze` lit
 * (`analysis/analyse-du-run.ts:sectionComparateurs`) : une seule source de la note, celle que publie
 * la notation.
 *
 * Ce module ne décide rien : la règle est celle de l'échantillon, portée par
 * `lectures-comparateur.ts` (`etatsDesLectures`, qui contrôle toutes les notations reçues et appelle
 * `note-retenue.ts:humainsAArbitrer`), et le verdict est celui de `verdictDeLecture`. Il lit le run,
 * ses lectures, ses notations de lecture et les verdicts déjà écrits, puis écrit ce qui manque.
 *
 * **Sans verdict, et visible.** Une lecture à noter (moins de deux humains) ou à arbitrer (deux humains
 * qui divergent, en attente du troisième) n'a pas de verdict : elle est rendue dans `attentes` avec son
 * statut, jamais remplacée par une note prise ailleurs. Un run qui inclut un comparateur et dont les
 * lectures ne sont pas encore collectées (`volume/lectures-comparateur/` absent) n'écrit rien et le dit
 * (`lectures_non_collectees`) : la notation des réponses n'en dépend pas, et `pnpm analyze` exige
 * ensuite ce dossier (`analysis/lecture-run.ts:lireLecturesDuRun`).
 *
 * **Reprise (règle 7), comme les verdicts des réponses** (`chaine.ts:noterReponse`). Une lecture qui a
 * déjà son verdict n'est ni recalculée ni réécrite : relancer ne change rien sur le disque. Le
 * recoupement d'un verdict écrit avec les notations de sa lecture est celui de l'analyse
 * (`VerdictDeLectureIncoherent`) et du contrôle croisé, pas d'ici.
 *
 * L'identifiant et la date du verdict viennent de l'appelant (`CadreVerdictLecture`) : la chaîne les
 * dérive comme ceux des réponses (`chaine.ts:identifiantDerive`).
 */

import { existsSync } from "node:fs";
import { dispositionRunNote, lireLecturesDuRun, lireNotationsDuRun, lireRunJson, lireVerdicts, type RunLu } from "../../analysis/lecture-run.ts";
import { comparateursDuRun } from "../../analysis/reference-comparateurs.ts";
import type { LectureComparateur, Ulid } from "../../analysis/types.ts";
import { etatsDesLectures, verdictDeLecture, type CadreVerdictLecture, type RaisonSansVerdict } from "./lectures-comparateur.ts";
import type { DepotNotation } from "./stockage.ts";

/** Une lecture affichée sans verdict : moins de deux humains (`a_noter`), ou divergence sans arbitre (`a_arbitrer`). */
export interface AttenteLecture {
  readonly lecture_id: Ulid;
  readonly statut: RaisonSansVerdict;
}

export type EtatLecturesDuRun =
  | {
      readonly statut: "notees";
      /** Les lectures affichées dont le verdict est écrit, maintenant ou par une exécution précédente. */
      readonly verdicts: readonly Ulid[];
      /** Les lectures affichées sans verdict, chacune avec son statut. */
      readonly attentes: readonly AttenteLecture[];
    }
  | { readonly statut: "non_jouees"; readonly motif: "lectures_non_collectees" | "contrefactuel_candidats_non_conclu" };

/** Le cadre du verdict d'une lecture : identifiant et date, fournis par l'appelant. */
export type CadreDeLecture = (lecture_id: Ulid) => CadreVerdictLecture;

/**
 * Écrit le verdict de chaque lecture affichée du run dont la note est retenue et qui n'en a pas
 * encore. Lève ce que lèvent la règle (`NotationLectureRefusee`) et l'écrivain (`ErreurSchema`,
 * `ObjetHorsDeSonDossier`, `FichierDejaEcrit`) : rien n'est ignoré.
 */
export function ecrireVerdictsDeLecture(repertoire_run: string, depot: DepotNotation, cadre: CadreDeLecture): EtatLecturesDuRun {
  const run = lireRunJson(repertoire_run);
  const lectures = lecturesCollectees(repertoire_run, run);
  if (lectures === null) return { statut: "non_jouees", motif: "lectures_non_collectees" };
  const notations = lireNotationsDuRun(repertoire_run, run.id).notations.filter((n) => n.objet_note.type === "lecture_comparateur");
  const deja = new Set(lireVerdicts(repertoire_run, run.id).filter((v) => v.objet_note.type === "lecture_comparateur").map((v) => v.objet_note.id));
  const verdicts: Ulid[] = [];
  const attentes: AttenteLecture[] = [];
  for (const etat of etatsDesLectures(run.id, lectures, notations)) {
    if (deja.has(etat.lecture_id)) verdicts.push(etat.lecture_id);
    else if (etat.statut !== "retenue") attentes.push({ lecture_id: etat.lecture_id, statut: etat.statut });
    else {
      depot.ecrireVerdict(verdictDeLecture(run.id, lectures, notations, etat.lecture_id, cadre(etat.lecture_id)));
      verdicts.push(etat.lecture_id);
    }
  }
  return { statut: "notees", verdicts, attentes };
}

/** Les lectures du run ; `null` quand un comparateur est inclus et que son dossier n'existe pas encore. */
export function lecturesCollectees(repertoire_run: string, run: RunLu): readonly LectureComparateur[] | null {
  if (comparateursDuRun(run).length > 0 && !existsSync(dispositionRunNote(repertoire_run).lectures_comparateur)) return null;
  return lireLecturesDuRun(repertoire_run, run);
}
