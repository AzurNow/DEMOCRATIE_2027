/**
 * Le run gelé que `pnpm run:dry --run=<répertoire>` interroge (lot gel, PR 4 ; décision D51 (1)) :
 * un répertoire écrit par `pnpm geler --sortie` (`<sortie>/<date>/`, `pipeline/gel/destination.ts`),
 * jamais un répertoire de `runs/` du dépôt — un run simulé n'est pas un run.
 *
 * Lecture, dans cet ordre, et rien n'est écrit tant qu'un contrôle peut échouer :
 *   1. le répertoire hors de `runs/` (`gardes-sortie.ts:exigerHorsDeRuns`), avant toute lecture ;
 *   2. `run.json`, validé en entier contre `schema/run.schema.json` (`ErreurSchema` sinon) ;
 *   3. `tirage.json` et `questions.json`, leurs octets vérifiés contre les SHA-256 que `run.json`
 *      déclare, par la vérification du gel (`pipeline/gel/precedent.ts:lireFichiersDuRun`), la seule
 *      du dépôt ; chacun de ses refus est repris sous son motif dans `RunGeleRefuse` ;
 *   4. le statut : `planifie` démarre, `en_cours` sans invalidation reprend, tout autre cas est
 *      refusé (`statut.ts:demarrerOuReprendre`) — calculé ici, écrit plus tard ;
 *   5. la fenêtre (`run.json#/fenetre`, rouverte par `fenetre.ts:ouvrirFenetre`, sa fin recoupée ;
 *      pour une réexécution, selon la règle du run qu'elle remplace, lu sous `runs/` du dépôt),
 *      les outils (`run.json#/perimetre/outils`), le nombre d'échantillons inscrit au gel
 *      (`run.json#/reponses/echantillons_par_question`, D75 (14)), l'identifiant (`run.json#/id`)
 *      et les questions des entrées du tirage, prises dans `questions.json` avec leurs formulations.
 *
 * `inscrireDemarrage` écrit ensuite `statut: en_cours`, une seule fois, par renommage
 * (`pipeline/run/ecriture.ts`) : l'appelant le fait avant la première tentative, après avoir
 * construit tout ce dont l'exécution a besoin.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { lireFichiersDuRun, messageAttendu, PrecedentRefuse, runDeRuns } from "../gel/precedent.ts";
import type { FichiersDuRun, MotifPrecedent } from "../gel/precedent.ts";
import { exigerHorsDeRuns } from "../gardes-sortie.ts";
import type { OutilDeRun } from "../questions/charger-perimetre.ts";
import type { EchantillonsParQuestion } from "./conditions.ts";
import type { Question } from "../questions/types.ts";
import { ecrireParRenommageSiInchange } from "../run/ecriture.ts";
import { demarrerOuReprendre } from "../run/statut.ts";
import type { IssueDemarrage, RunAvecStatut } from "../run/statut.ts";
import { ouvrirFenetre } from "./fenetre.ts";
import type { Fenetre, RunsDuDepot } from "./fenetre.ts";
import { lireInstant } from "../../analysis/heure-paris.ts";

export type MotifRunGele = "run_json_illisible" | "fenetre_incoherente" | MotifPrecedent;

export class RunGeleRefuse extends Error {
  readonly motif: MotifRunGele;
  readonly repertoire: string;

  constructor(motif: MotifRunGele, repertoire: string, detail: string) {
    super(`Run gelé refusé (${motif}, ${repertoire}) : ${detail} Rien n'est écrit.`);
    this.name = "RunGeleRefuse";
    this.motif = motif;
    this.repertoire = repertoire;
  }
}

/** Ce que l'interrogation lit d'un `run.json` validé ; tout autre champ est recopié tel quel. */
export interface RunJsonGele extends RunAvecStatut {
  readonly id: string;
  /** §6 (0.32) : règle l'ouverture de la fenêtre, avec `date_gel` et `run_remplace_id` (`fenetre.ts:ouvrirFenetre`). */
  readonly type_run: string;
  readonly run_remplace_id?: string;
  readonly fenetre: { readonly debut: string; readonly fin: string };
  readonly perimetre: { readonly outils: readonly OutilDeRun[] };
  readonly reponses: { readonly echantillons_par_question: EchantillonsParQuestion };
}

export interface RunGele {
  readonly repertoire: string;
  readonly chemin_run_json: string;
  /** Le texte exact de `run.json` lu par `lireRunGele` : `inscrireDemarrage` refuse si le fichier a changé depuis. */
  readonly texte_run_json: string;
  readonly run_id: string;
  readonly fenetre: Fenetre;
  readonly outils: readonly OutilDeRun[];
  /** D75 (14) : le nombre d'échantillons du plan, tel que le gel l'a inscrit ; jamais reconstruit. */
  readonly echantillons: EchantillonsParQuestion;
  /** Les questions des entrées du tirage, et elles seules. */
  readonly questions_tirees: readonly Question[];
  readonly demarrage: IssueDemarrage<RunJsonGele>;
}

function lireRunJson(repertoire: string, chemin: string): { readonly texte: string; readonly run: RunJsonGele } {
  let texte: string;
  let brut: unknown;
  try {
    texte = readFileSync(chemin, "utf8");
    brut = JSON.parse(texte);
  } catch (erreur) {
    throw new RunGeleRefuse("run_json_illisible", repertoire, messageAttendu(erreur));
  }
  return { texte, run: valider<RunJsonGele>("run", brut, chemin) };
}

/** La vérification du gel, ses refus repris sous leur motif. */
function fichiersVerifies(repertoire: string, chemin: string, texte: string): FichiersDuRun {
  try {
    return lireFichiersDuRun(repertoire, runDeRuns(basename(repertoire), texte, chemin));
  } catch (erreur) {
    if (erreur instanceof PrecedentRefuse) throw new RunGeleRefuse(erreur.motif, repertoire, erreur.detail);
    throw erreur;
  }
}

function fenetreDuGel(repertoire: string, run: RunJsonGele, runs_du_depot: RunsDuDepot): Fenetre {
  const fenetre = ouvrirFenetre(run.fenetre.debut, run, runs_du_depot);
  if (lireInstant(run.fenetre.fin, "run.json#/fenetre/fin") === fenetre.fin_ms) return fenetre;
  throw new RunGeleRefuse(
    "fenetre_incoherente",
    repertoire,
    `run.json#/fenetre/fin vaut ${run.fenetre.fin} ; une fenêtre ouverte le ${run.fenetre.debut} se ferme le ${fenetre.fin} (§6).`,
  );
}

/**
 * `fichiers` vient de `fichiersVerifies`, qui a déjà refusé (`PrecedentRefuse` « question_introuvable »,
 * repris en `RunGeleRefuse`) toute entrée du tirage dont la question manquerait à `questions.json` :
 * ce chemin est donc inatteignable depuis `lireRunGele` (constat 31, revue du 2026-10-17). Gardé
 * comme garde interne plutôt que supprimé, pour ne pas faire confiance en silence à un appelant
 * futur qui construirait `FichiersDuRun` sans passer par cette vérification ; une erreur d'invariant,
 * pas un motif de refus nommé et publié, puisque rien de légitime ne peut l'atteindre.
 */
export function questionsTirees(repertoire: string, fichiers: FichiersDuRun): readonly Question[] {
  const parId = new Map(fichiers.questions.map((question) => [question.id, question]));
  return fichiers.tirage.entrees.map((entree) => {
    const question = parId.get(entree.question_id);
    if (question === undefined) {
      throw new Error(
        `Invariant violé (run gelé ${repertoire}) : ${entree.question_id} est tirée mais absente de questions.json ; ` +
          `fichiersVerifies aurait dû refuser ce run avant (precedent.ts, question_introuvable).`,
      );
    }
    return question;
  });
}

/** `runs_du_depot` : les runs de `runs/` du dépôt, lus seulement pour la fenêtre d'une réexécution (D74 (19)). */
export function lireRunGele(repertoire: string, runs_du_depot: RunsDuDepot): RunGele {
  exigerHorsDeRuns(repertoire);
  const chemin_run_json = join(repertoire, "run.json");
  const { texte, run } = lireRunJson(repertoire, chemin_run_json);
  const fichiers = fichiersVerifies(repertoire, chemin_run_json, texte);
  const demarrage = demarrerOuReprendre(run);
  return {
    repertoire,
    chemin_run_json,
    texte_run_json: texte,
    run_id: run.id,
    fenetre: fenetreDuGel(repertoire, run, runs_du_depot),
    outils: run.perimetre.outils,
    echantillons: run.reponses.echantillons_par_question,
    questions_tirees: questionsTirees(repertoire, fichiers),
    demarrage,
  };
}

/**
 * D51 (1) : `en_cours`, validé puis écrit par renommage, si le run démarre ; rien s'il reprend.
 * Un temporaire `run.json.demarrage` laissé par une écriture interrompue lève `TemporaireOrphelin`
 * (`pipeline/run/ecriture.ts`), jamais écrasé.
 */
export function inscrireDemarrage(gele: RunGele): void {
  if (gele.demarrage.issue === "reprend") return;
  const chemin = gele.chemin_run_json;
  ecrireParRenommageSiInchange(chemin, valider<RunJsonGele>("run", gele.demarrage.run, `${chemin} au démarrage`), "demarrage", gele.texte_run_json);
}
