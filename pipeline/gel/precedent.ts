/**
 * Le run précédent d'un gel (décisions D45 (3), D48 (4) et (5), D49, §5 : « 80 % des questions
 * sont reprises du run précédent »). C'est le plus récent des runs de `runs/` dont la `date_gel` est
 * strictement avant la nôtre, de `statut` `publie` ou `publie_provisoire`, hors `type_run` `pilote`.
 * Tout autre statut (`planifie`, `en_cours`, `invalide`) est sauté, comme un pilote (D49 : un run
 * supplémentaire à 72 h, §6, doit pouvoir geler pendant qu'un run est en cours de notation). Il est
 * inscrit dans `run.json#/run_precedent` ; son absence y est déclarée par `null`, jamais omise.
 *
 * Partie pure : `choisirPrecedent` (le choix, sur des `run.json` déjà lus) et `tiragePrecedentVerifie`
 * (des octets de son `tirage.json` et de son `questions.json` au `TiragePrecedent` que
 * `tirage.ts:tirer` reçoit, par `fichiersDuRunVerifies`). Partie lue, mince : `lirePrecedent`, par
 * `lireFichiersDuRun`. Ces deux-là vérifient aussi le run gelé que `pnpm run:dry --run` interroge
 * (`pipeline/interrogation/run-gele.ts`) : une seule vérification dans le dépôt.
 *
 * Chaque répertoire de `runs/` doit porter un `run.json` lisible : un seul illisible, et le gel ne
 * peut plus dire quel run est le précédent. Tout défaut est un refus nommé (`PrecedentRefuse`),
 * jamais « pas de précédent » :
 *   - `run_illisible` : un `run.json` absent, qui n'est pas du JSON, ou dont un champ lu n'est pas
 *     conforme à `run.schema.json` ;
 *   - `precedent_ambigu` : deux runs retenables à la même `date_gel` ;
 *   - `chemin_incoherent` : le tirage ou les questions déclarés ne sont pas
 *     `runs/<son répertoire>/tirage.json` ou `questions.json` ;
 *   - `tirage_illisible` : le tirage absent, illisible ou non conforme à `tirage.schema.json` ;
 *   - `empreinte_differente` : le SHA-256 des octets du tirage n'est pas celui que son `run.json`
 *     déclare ;
 *   - `tirage_d_un_autre_run` : `tirage.run_id` n'est pas l'`id` de son `run.json` ;
 *   - `questions_empreinte` (D48 (4)) : son `run.json` ne déclare pas l'empreinte de `questions.json`,
 *     ou le SHA-256 de ses octets n'est pas celle qu'il déclare ;
 *   - `questions_illisibles` : `questions.json` absent, illisible, ou une question non conforme ;
 *   - `question_introuvable` : une question tirée absente de `questions.json`.
 *
 * Seuls les champs que le choix lit sont validés dans chaque `run.json` (fragments de
 * `run.schema.json`) : un run gelé sous un schéma plus ancien reste lisible pour ce qu'on en lit.
 * `questions`, exigé depuis D48 (4), n'est lu que s'il est présent ; son absence n'est refusée que
 * pour le précédent retenu, qui en a besoin (`questions_empreinte`).
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ErreurSchema, validerFragment, valider } from "../../outils/schemas/valider.ts";
import type { PointeurDeSchema } from "../../outils/schemas/valider.ts";
import { lireInstant } from "../interrogation/heure-paris.ts";
import { tiragePrecedentDepuis } from "../questions/tirage.ts";
import type { TiragePrecedent } from "../questions/tirage.ts";
import type { Question, Tirage } from "../questions/types.ts";
import { STATUT_PUBLIE, STATUT_PUBLIE_PROVISOIRE, TYPE_PILOTE } from "../run/types.ts";
import type { StatutRun, TypeRun } from "../run/types.ts";

export type MotifPrecedent =
  | "run_illisible"
  | "precedent_ambigu"
  | "chemin_incoherent"
  | "tirage_illisible"
  | "empreinte_differente"
  | "tirage_d_un_autre_run"
  | "questions_empreinte"
  | "questions_illisibles"
  | "question_introuvable";

export class PrecedentRefuse extends Error {
  readonly motif: MotifPrecedent;
  /** Le répertoire de `runs/` en cause. */
  readonly run: string;
  /** Le défaut seul, sans le cadre du précédent : `pipeline/interrogation/run-gele.ts` le reprend. */
  readonly detail: string;

  constructor(motif: MotifPrecedent, run: string, detail: string) {
    super(`Run précédent refusé (${motif}, runs/${run}, décisions D45 (3), D48) : ${detail} Rien n'est écrit.`);
    this.name = "PrecedentRefuse";
    this.motif = motif;
    this.run = run;
    this.detail = detail;
  }
}

/** Un fichier du run déclaré dans son `run.json` : chemin dans le dépôt et SHA-256 de ses octets. */
export interface FichierDeclare {
  readonly chemin: string;
  readonly sha256: string;
}

/** Ce que le choix lit d'un `run.json` de `runs/`, chaque champ validé contre son fragment. */
export interface RunDeRuns {
  /** Le nom du répertoire sous `runs/`, `AAAA-MM-JJ`. */
  readonly repertoire: string;
  readonly id: string;
  readonly date_gel_ms: number;
  readonly type_run: string;
  readonly statut: string;
  readonly tirage: FichierDeclare;
  /** D48 (4) ; `undefined` : son `run.json` ne le déclare pas, refusé s'il est le précédent. */
  readonly questions: FichierDeclare | undefined;
  /** D51 (2) : présente si le run a été invalidé ; lue pour `pnpm geler --remplace` (`remplacement.ts`). */
  readonly invalidation?: { readonly motif: string; readonly date: string };
}

/** `run.json#/run_precedent` quand un précédent existe. */
export interface RunPrecedent {
  readonly id: string;
  readonly tirage: FichierDeclare;
  readonly questions: FichierDeclare;
}

/** Ce que le gel retient : l'inscription de `run.json` et l'entrée du tirage, ensemble. */
export interface PrecedentDuGel {
  readonly run_precedent: RunPrecedent | null;
  readonly tirage_precedent: TiragePrecedent | undefined;
}

/** Aucun précédent : déclaré dans `run.json`, tirage sans reprise. */
export const SANS_PRECEDENT: PrecedentDuGel = { run_precedent: null, tirage_precedent: undefined };

/**
 * D48 (5), D49 : les seuls statuts admis pour le précédent. Tout autre statut (`planifie`,
 * `en_cours`, `invalide`) est sauté : un run supplémentaire à 72 h (§6) doit pouvoir geler pendant
 * qu'un run est en cours de notation.
 */
const STATUTS_ADMIS: ReadonlySet<string> = new Set<StatutRun>([STATUT_PUBLIE, STATUT_PUBLIE_PROVISOIRE]);
/** D45 (3) : un pilote ne sert jamais de précédent ; il est sauté. */
const TYPES_SAUTES: ReadonlySet<string> = new Set<TypeRun>([TYPE_PILOTE]);

function retenable(run: RunDeRuns, date_gel_ms: number): boolean {
  return run.date_gel_ms < date_gel_ms && STATUTS_ADMIS.has(run.statut) && !TYPES_SAUTES.has(run.type_run);
}

/**
 * Le run retenable de `date_gel` la plus récente strictement avant `date_gel_ms`, ou `null`. Deux
 * runs retenables à cette même `date_gel` : refus, aucun n'est choisi au hasard.
 */
export function choisirPrecedent(runs: readonly RunDeRuns[], date_gel_ms: number): RunDeRuns | null {
  const candidats = runs.filter((run) => retenable(run, date_gel_ms));
  if (candidats.length === 0) return null;
  const plus_recent = Math.max(...candidats.map((run) => run.date_gel_ms));
  // Tri par code-unit (comme le `.sort()` sans comparateur ailleurs dans le dépôt), jamais
  // `localeCompare` : le nom retenu dans le message d'ambiguïté ne doit pas dépendre de la locale
  // du processus (constat 21, revue du 2026-10-17).
  const retenus = candidats.filter((run) => run.date_gel_ms === plus_recent).sort((a, b) => (a.repertoire < b.repertoire ? -1 : a.repertoire > b.repertoire ? 1 : 0));
  const [premier, second] = retenus;
  if (premier === undefined) return null;
  if (second !== undefined) {
    throw new PrecedentRefuse("precedent_ambigu", premier.repertoire, `runs/${second.repertoire} a la même date_gel.`);
  }
  return premier;
}

/* -------------------------------------------------------- lecture d'un run */

/**
 * Le message d'une erreur de lecture attendue (JSON, schéma, fichier) ; toute autre est relevée.
 * Partagée avec `pipeline/interrogation/run-gele.ts`, seul autre lecteur d'un `run.json` de ce genre
 * (constat 31, revue du 2026-10-17).
 */
export function messageAttendu(erreur: unknown): string {
  if (erreur instanceof SyntaxError || erreur instanceof ErreurSchema) return erreur.message;
  if (erreur instanceof Error && "code" in erreur && erreur.code === "ENOENT") return erreur.message;
  throw erreur;
}

function ou<T>(motif: MotifPrecedent, repertoire: string, lire: () => T): T {
  try {
    return lire();
  } catch (erreur) {
    throw new PrecedentRefuse(motif, repertoire, messageAttendu(erreur));
  }
}

function fragment<T>(objet: Record<string, unknown>, cle: string, provenance: string): T {
  const pointeur: PointeurDeSchema = `#/properties/${cle}`;
  return validerFragment<T>("run", pointeur, objet[cle], `${provenance}, ${cle}`);
}

/** Un champ que le schéma exige mais qu'un `run.json` plus ancien peut ne pas porter : absent, `undefined`. */
function fragmentSiPresent<T>(objet: Record<string, unknown>, cle: string, provenance: string): T | undefined {
  return objet[cle] === undefined ? undefined : fragment<T>(objet, cle, provenance);
}

function objetJson(texte: string): Record<string, unknown> {
  const valeur: unknown = JSON.parse(texte);
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new SyntaxError("run.json n'est pas un objet JSON.");
  }
  return valeur as Record<string, unknown>;
}

/** Le `run.json` d'un répertoire de `runs/`, lu dans ses seuls champs utiles. */
export function runDeRuns(repertoire: string, texte: string, provenance: string): RunDeRuns {
  return ou("run_illisible", repertoire, () => {
    const objet = objetJson(texte);
    const date_gel = fragment<string>(objet, "date_gel", provenance);
    const invalidation = fragmentSiPresent<NonNullable<RunDeRuns["invalidation"]>>(objet, "invalidation", provenance);
    return {
      repertoire,
      id: fragment<string>(objet, "id", provenance),
      date_gel_ms: lireInstant(date_gel, `${provenance}, date_gel`),
      type_run: fragment<string>(objet, "type_run", provenance),
      statut: fragment<string>(objet, "statut", provenance),
      tirage: fragment<FichierDeclare>(objet, "tirage", provenance),
      questions: fragmentSiPresent<FichierDeclare>(objet, "questions", provenance),
      ...(invalidation === undefined ? {} : { invalidation }),
    };
  });
}

/* ------------------------------------------------- du précédent au tirage */

function sha256(octets: Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

export function cheminDuTirage(repertoire: string): string {
  return `runs/${repertoire}/tirage.json`;
}

export function cheminDesQuestions(repertoire: string): string {
  return `runs/${repertoire}/questions.json`;
}

function exigerChemin(run: RunDeRuns, champ: string, declare: string, attendu: string): void {
  if (declare === attendu) return;
  throw new PrecedentRefuse("chemin_incoherent", run.repertoire, `${champ}.chemin vaut « ${declare} », attendu « ${attendu} ».`);
}

function exigerCheminCoherent(run: RunDeRuns): void {
  exigerChemin(run, "tirage", run.tirage.chemin, cheminDuTirage(run.repertoire));
}

/** D48 (4) : la déclaration de `questions.json`, présente et à son chemin, ou refus. */
function questionsDeclarees(run: RunDeRuns): FichierDeclare {
  const declarees = run.questions;
  if (declarees === undefined) {
    throw new PrecedentRefuse(
      "questions_empreinte",
      run.repertoire,
      `son run.json ne déclare pas questions (chemin et SHA-256 de ${cheminDesQuestions(run.repertoire)}, D48 (4)).`,
    );
  }
  exigerChemin(run, "questions", declarees.chemin, cheminDesQuestions(run.repertoire));
  return declarees;
}

function exigerEmpreinte(run: RunDeRuns, octets: Uint8Array): void {
  const lue = sha256(octets);
  if (lue === run.tirage.sha256) return;
  throw new PrecedentRefuse(
    "empreinte_differente",
    run.repertoire,
    `SHA-256 de ${run.tirage.chemin} : ${lue} ; son run.json déclare ${run.tirage.sha256}.`,
  );
}

function exigerEmpreinteDesQuestions(run: RunDeRuns, declarees: FichierDeclare, octets: Uint8Array): void {
  const lue = sha256(octets);
  if (lue === declarees.sha256) return;
  throw new PrecedentRefuse(
    "questions_empreinte",
    run.repertoire,
    `SHA-256 de ${declarees.chemin} : ${lue} ; son run.json déclare ${declarees.sha256}.`,
  );
}

function tirageLu(run: RunDeRuns, octets: Uint8Array): Tirage {
  const tirage = ou("tirage_illisible", run.repertoire, () =>
    valider<Tirage>("tirage", JSON.parse(new TextDecoder().decode(octets)), run.tirage.chemin),
  );
  if (tirage.run_id === run.id) return tirage;
  throw new PrecedentRefuse("tirage_d_un_autre_run", run.repertoire, `tirage.run_id vaut ${tirage.run_id}, run.json#/id vaut ${run.id}.`);
}

function questionsLues(run: RunDeRuns, octets: Uint8Array): readonly Question[] {
  const provenance = cheminDesQuestions(run.repertoire);
  return ou("questions_illisibles", run.repertoire, () => {
    const questions_brutes: unknown = JSON.parse(new TextDecoder().decode(octets));
    if (!Array.isArray(questions_brutes)) throw new SyntaxError(`${provenance} n'est pas un tableau.`);
    return questions_brutes.map((question: unknown, rang) => valider<Question>("question", question, `${provenance}[${rang}]`));
  });
}

function exigerQuestionsTirees(run: RunDeRuns, tirage: Tirage, questions: readonly Question[]): void {
  const connues = new Set(questions.map((question) => question.id));
  const absentes = tirage.entrees.map((entree) => entree.question_id).filter((id) => !connues.has(id));
  if (absentes.length === 0) return;
  throw new PrecedentRefuse("question_introuvable", run.repertoire, `question(s) tirée(s) absente(s) de questions.json : ${absentes.join(", ")}.`);
}

/** Le tirage et les questions d'un run gelé, lus et vérifiés contre son `run.json`. */
export interface FichiersDuRun {
  readonly tirage: Tirage;
  readonly questions: readonly Question[];
}

/**
 * Des octets du tirage d'un run et de son `questions.json` aux deux fichiers lus : chemins
 * cohérents, empreintes égales à celles que son `run.json` déclare (D48 (4) pour les questions),
 * tirage conforme et de ce run, chaque question tirée présente. Seule vérification du dépôt : le gel
 * l'applique au précédent, `pnpm run:dry --run` au run qu'il interroge (`run-gele.ts`).
 */
export function fichiersDuRunVerifies(run: RunDeRuns, octets_tirage: Uint8Array, octets_questions: Uint8Array): FichiersDuRun {
  exigerCheminCoherent(run);
  exigerEmpreinte(run, octets_tirage);
  const tirage = tirageLu(run, octets_tirage);
  exigerEmpreinteDesQuestions(run, questionsDeclarees(run), octets_questions);
  const questions = questionsLues(run, octets_questions);
  exigerQuestionsTirees(run, tirage, questions);
  return { tirage, questions };
}

/**
 * Des octets du tirage précédent et de son `questions.json` au `TiragePrecedent`, après
 * `fichiersDuRunVerifies`. La signature de chaque question (`signature.ts`) est calculée sur la
 * question telle que le run précédent l'a posée.
 */
export function tiragePrecedentVerifie(run: RunDeRuns, octets_tirage: Uint8Array, octets_questions: Uint8Array): TiragePrecedent {
  const { tirage, questions } = fichiersDuRunVerifies(run, octets_tirage, octets_questions);
  return tiragePrecedentDepuis(tirage, questions);
}

/* ---------------------------------------------------------------- lecture */

/** Chaque run de `runs/` (le répertoire reçu), lu dans ses seuls champs utiles ; un seul illisible, refus. */
export function lireRunsDuDepot(runs: string): readonly RunDeRuns[] {
  if (!existsSync(runs)) return [];
  // Trié par code-unit (constat 21) : `readdirSync` ne garantit aucun ordre, qui varierait sinon
  // avec le système de fichiers et rendrait non reproductible le nom retenu par `choisirPrecedent`
  // en cas d'ambiguïté.
  return readdirSync(runs, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entree) => {
      const chemin = join(runs, entree.name, "run.json");
      const texte = ou("run_illisible", entree.name, () => readFileSync(chemin, "utf8"));
      return runDeRuns(entree.name, texte, chemin);
    });
}

function octetsDe(motif: MotifPrecedent, run: RunDeRuns, chemin: string): Uint8Array {
  return ou(motif, run.repertoire, () => new Uint8Array(readFileSync(chemin)));
}

/**
 * Lit sous `repertoire` (le répertoire du run, où qu'il soit) le tirage et les questions que `run`
 * déclare, et les vérifie (`fichiersDuRunVerifies`). Les déclarations (chemins, présence de
 * `questions`) sont contrôlées avant toute lecture des deux fichiers.
 */
export function lireFichiersDuRun(repertoire: string, run: RunDeRuns): FichiersDuRun {
  exigerCheminCoherent(run);
  questionsDeclarees(run);
  const octets_tirage = octetsDe("tirage_illisible", run, join(repertoire, "tirage.json"));
  const octets_questions = octetsDe("questions_illisibles", run, join(repertoire, "questions.json"));
  return fichiersDuRunVerifies(run, octets_tirage, octets_questions);
}

/**
 * Lit `runs/` sous `racine`, choisit le précédent, vérifie et lit son tirage et ses questions. Le
 * gel lit toujours `runs/` du dépôt, `--sortie` ou non : le précédent d'un essai est celui qu'aurait
 * le vrai run. Les déclarations du `run.json` (chemins, présence de `questions`) sont contrôlées
 * avant toute lecture des deux fichiers.
 */
export function lirePrecedent(racine: string, date_gel_ms: number): PrecedentDuGel {
  const run = choisirPrecedent(lireRunsDuDepot(join(racine, "runs")), date_gel_ms);
  if (run === null) return SANS_PRECEDENT;
  const { tirage, questions } = lireFichiersDuRun(join(racine, "runs", run.repertoire), run);
  const declarees = questionsDeclarees(run);
  return {
    run_precedent: {
      id: run.id,
      tirage: { chemin: run.tirage.chemin, sha256: run.tirage.sha256 },
      questions: { chemin: declarees.chemin, sha256: declarees.sha256 },
    },
    tirage_precedent: tiragePrecedentDepuis(tirage, questions),
  };
}
