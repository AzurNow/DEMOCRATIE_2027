/**
 * Un petit run fictif, écrit sur disque dans un répertoire temporaire, pour les tests du stockage
 * de la notation, de la lecture d'un run et de `pnpm notation:controle` (lot notation, PR C).
 *
 * Disposition de `runs/README.md` sous `<bac>/runs/2026-12-01/`, avec `<bac>/data/items/` commité
 * dans un dépôt Git jetable : le run inscrit ce commit comme `versions.donnees_commit`. Le jeu
 * reprend celui de `tests/symmetry-cli.test.ts` : un candidat, un item P et un item F, toutes les
 * questions engendrées au gel, deux tirées (Q-DIR sur l'item P, Q-ORI sur l'item F). Le run part de
 * l'exemple valide de `schema/exemples/`. Deux réponses obtenues, une par question tirée, notées
 * par les deux juges du run ; l'échantillon humain (⌈2/10⌉ = 1 réponse) reçoit deux humains. Les
 * verdicts sont produits par `decider`. Aucun contenu réel.
 *
 * Jamais sous `runs/` du dépôt : `mkdtemp` sous `os.tmpdir()`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lireRunJson, runDeNotationDe } from "../../analysis/lecture-run.ts";
import { tableAliasCandidats } from "../../pipeline/notation/alias-candidats.ts";
import { decider } from "../../pipeline/notation/decision.ts";
import { tirerEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import type { Derangement } from "../../pipeline/notation/derangement.ts";
import { reponseContrefactuelle, type ReponseContrefactuelle } from "../../pipeline/notation/reponse-contrefactuelle.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import type { NotationIndividuelle, RunDeNotation, VerdictProduit } from "../../pipeline/notation/types.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { entreesPour } from "../../pipeline/questions/tirage.ts";
import type { CandidatNomme, GraineTirage, Item, Question, RunAuGel } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { GRILLE_TOUT_VRAI } from "../aides/fabriques.ts";
import { head, initialiserDepot, RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "../analysis/fabriques.ts";
import { completer, graine, identifiant, itemF, itemP, mesure, quotas } from "../questions/fabriques.ts";
import { CANDIDATS_DU_RUN, notationHumaine, notationJuge } from "./fabriques.ts";

export const GEL = "2026-12-01T06:00:00+01:00";
export const DATE_DU_RUN = "2026-12-01";
export const RUN_ID = identifiant("run:notation-es");
const CANDIDAT = "demo-alpha";
const JUGES = ["juge-1", "juge-2"] as const;
const DATE_VERDICT = "2026-12-06T12:00:00+01:00";

const HISTORIQUE = [{ date: "2026-09-03T10:00:00+02:00", changement: "création", commit: "a".repeat(40), version_resultante: 1 }];

function validation(annotateur_id: string) {
  return { annotateur_id, decision: "accepter", date: "2026-09-20T10:00:00+02:00", lot_id: "lot-003", reponses_grille: GRILLE_TOUT_VRAI };
}

function conforme(item: Item): Item {
  return { ...item, validations: [validation("a1"), validation("a2")], historique: HISTORIQUE };
}

const MESURE_P = { ...mesure({ cle: "es-p", libelle: "tarif de base" }), historique: HISTORIQUE };
const MESURE_F = {
  ...mesure({ cle: "es-f", libelle: "prime aux marcheurs", fictive: true }),
  origine_fictive: "Mesure inventée pour les tests, sans auteur réel.",
  verification_fictivite: { date: "2026-11-15T11:00:00+01:00", corpus_verifies: [CANDIDAT], operateur: "a2", resultat: "aucune_occurrence" },
  historique: HISTORIQUE,
};
export const ITEM_P = conforme(itemP({ cle: "es-p", candidat_id: CANDIDAT, mesure: MESURE_P }));
export const ITEM_F = conforme(itemF({ cle: "es-f", candidat_id: CANDIDAT, mesure: MESURE_F }));

/** alpha → beta → gamma → alpha, sur les candidats fictifs des fabriques de notation. */
export const CYCLE: Derangement = {
  paires: CANDIDATS_DU_RUN.map((source, rang) => ({ source, image: CANDIDATS_DU_RUN[(rang + 1) % CANDIDATS_DU_RUN.length] as (typeof CANDIDATS_DU_RUN)[number] })),
};

export interface RunFictif {
  readonly bac: string;
  readonly repertoire_run: string;
  readonly items: string;
  readonly commit: string;
  readonly run: Record<string, unknown>;
  readonly reponses: readonly ReponseObtenue[];
  readonly notations: readonly NotationIndividuelle[];
  readonly verdicts: readonly VerdictProduit[];
  readonly contrefactuelle: ReponseContrefactuelle;
  nettoyer(): void;
}

export function ecrireJson(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

function choisir(questions: readonly Question[], item: Item, gabarit: string): Question {
  const trouvee = questions.find((q) => q.grappe_id === item.id && q.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour l'item ${item.id}.`);
  return trouvee;
}

function lireExemple(chemin: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RACINE_PROJET, "schema", "exemples", chemin), "utf8")) as Record<string, unknown>;
}

function runDuJeu(commit: string, tirage_sha256: string): Record<string, unknown> {
  const exemple = lireExemple("run/valide-01-mensuel-publie.json") as Record<string, unknown> & {
    perimetre: { candidats: Record<string, unknown>[] };
    versions: Record<string, unknown>;
    graines: { alias_candidats: GraineTirage };
  };
  const candidat = { ...(exemple.perimetre.candidats[0] as Record<string, unknown>), candidat_id: CANDIDAT };
  // D55 (9) : un seul candidat ici, contre trois dans l'exemple ; la table se recalcule pour lui.
  const alias_candidats = tableAliasCandidats([{ candidat_id: CANDIDAT }], exemple.graines.alias_candidats);
  return {
    ...exemple,
    id: RUN_ID,
    date_gel: GEL,
    versions: { ...exemple.versions, donnees_commit: commit },
    alias_candidats,
    perimetre: { ...exemple.perimetre, candidats: [candidat] },
    tirage: { chemin: `runs/${DATE_DU_RUN}/tirage.json`, sha256: tirage_sha256, nombre_questions: 2 },
  };
}

function reponseObtenue(question: Question, rang: number): ReponseObtenue {
  const exemple = lireExemple("reponse/valide-01-api-obtenue.json");
  const formulation = question.formulations[0];
  if (formulation === undefined) throw new Error(`Question ${question.id} sans formulation.`);
  return valider<ReponseObtenue>(
    "reponse",
    { ...exemple, id: ulid(`es-reponse-${rang}`), run_id: RUN_ID, question_id: question.id, formulation_id: formulation.id },
    `réponse fictive ${rang}`,
  );
}

function surObjet(id: string) {
  return { objet_note: { type: "reponse" as const, id }, run_id: RUN_ID };
}

/** Les notations et le verdict d'une réponse, selon son appartenance à l'échantillon. */
function noter(run: RunDeNotation, reponse: ReponseObtenue, dans: boolean): { notations: NotationIndividuelle[]; verdict: VerdictProduit } {
  const notations = [
    ...JUGES.map((juge) => notationJuge(juge, surObjet(reponse.id))),
    ...(dans ? ["a1", "a2"].map((a) => notationHumaine(a, "echantillon_aleatoire_10", surObjet(reponse.id))) : []),
  ];
  const decision = decider({
    run,
    objet_note: { type: "reponse", id: reponse.id },
    notations,
    renvois: [],
    dans_echantillon_humain: dans,
    textes: { reponse: reponse.normalise.texte, citations_reference: [] },
    verdict_id: ulid(`es-verdict-${reponse.id}`),
    date: DATE_VERDICT,
  });
  if (decision.statut !== "verdict") throw new Error(`réponse ${reponse.id} en attente`);
  return { notations, verdict: decision.verdict };
}

/** Écrit run.json, tirage.json, questions.json et les items commités ; rien dans le volume. */
export function poserRunGele(): Omit<RunFictif, "reponses" | "notations" | "verdicts" | "contrefactuelle"> & { readonly tirees: readonly Question[] } {
  const bac = mkdtempSync(join(tmpdir(), "banc-essai-notation-es-"));
  const items = join(bac, "data", "items");
  mkdirSync(items, { recursive: true });
  for (const item of [ITEM_P, ITEM_F]) ecrireJson(join(items, `${item.id}.json`), item);
  initialiserDepot(bac);
  const commit = head(bac);

  const candidatNomme = { candidat_id: CANDIDAT, libelle: "Alix Martinez", nom: "Martinez" } as unknown as CandidatNomme;
  const questions = engendrer([ITEM_P, ITEM_F], [MESURE_P, MESURE_F], [candidatNomme]).map(completer);
  const tirees = [choisir(questions, ITEM_P, "Q-DIR"), choisir(questions, ITEM_F, "Q-ORI")];
  const repertoire_run = join(bac, "runs", DATE_DU_RUN);
  mkdirSync(repertoire_run, { recursive: true });
  const runProvisoire = runDuJeu(commit, "0".repeat(64));
  const tirage = {
    run_id: RUN_ID,
    date_gel: GEL,
    graine_tirage: graine(),
    parametres: quotas(),
    entrees: entreesPour(tirees, [ITEM_P, ITEM_F], [MESURE_P, MESURE_F], runProvisoire as unknown as RunAuGel),
    exclusions: [],
    contestes_au_gel: [],
    bilan_reprise: [],
    compensations: [],
  };
  ecrireJson(join(repertoire_run, "tirage.json"), tirage);
  const sha = createHash("sha256").update(readFileSync(join(repertoire_run, "tirage.json"))).digest("hex");
  const run = runDuJeu(commit, sha);
  ecrireJson(join(repertoire_run, "run.json"), run);
  ecrireJson(join(repertoire_run, "questions.json"), questions);
  return { bac, repertoire_run, items, commit, run, tirees, nettoyer: () => rmSync(bac, { recursive: true, force: true }) };
}

/** Le run gelé, puis interrogé (deux réponses), noté (notations, verdicts) et contrefactuel écrit. */
export function poserRunNote(): RunFictif {
  const gele = poserRunGele();
  const depotReponses = DepotReponses.ouvrir(join(gele.repertoire_run, "volume", "reponses"));
  const reponses = gele.tirees.map((question, rang) => reponseObtenue(question, rang));
  for (const reponse of reponses) depotReponses.ecrire(reponse);

  const run = runDeNotationDe(lireRunJson(gele.repertoire_run));
  const echantillon = new Set(tirerEchantillonHumain(reponses.map((r) => r.id), run.graines.echantillon_humain, run.taux_echantillon_humain));
  const notees = reponses.map((reponse) => noter(run, reponse, echantillon.has(reponse.id)));
  const depot = DepotNotation.ouvrir(gele.repertoire_run);
  const notations = notees.flatMap((n) => n.notations);
  const verdicts = notees.map((n) => n.verdict);
  for (const notation of notations) depot.ecrireNotation(notation);
  for (const verdict of verdicts) depot.ecrireVerdict(verdict);
  const premiere = reponses[0] as ReponseObtenue;
  const { reponse: contrefactuelle } = reponseContrefactuelle(premiere, ulid("es-contrefactuelle"), CYCLE);
  depot.ecrireReponseContrefactuelle(contrefactuelle);
  return { ...gele, reponses, notations, verdicts, contrefactuelle };
}
