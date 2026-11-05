/**
 * La chaîne de notation d'un run (§7) : des réponses obtenues aux verdicts, par deux juges.
 *
 * C'est l'orchestration du vrai run. Deux éléments seulement lui sont injectés : les juges (le port
 * `juge.ts`) et le fournisseur d'existences des liens (`fournisseur-existences.ts`). Elle ne sait
 * pas si l'un ou l'autre est simulé, et ne branche jamais là-dessus ; elle refuse seulement un juge
 * dont l'identité n'est pas celle que déclare `run.json` (`JugesNonConformes`), et un run qui déclare
 * deux juges de la même famille ou un juge sans famille (§7.12, `familles-juges.ts`).
 *
 * **Ordre du §7 (D14 (1)).** Le test contrefactuel passe avant la notation de masse :
 *
 * 0. **Moins de deux candidats interrogés** (§7, protocole 0.21) : le test est indéfini. Il est
 *    inscrit tel quel (`publierFauteDInterroges`), avant tout tirage, sans éligibilité ni appel de
 *    juge, et la notation de masse suit.
 * 1. **Sous-ensemble.** Les réponses éligibles (D55 (4), §7 (0.19) : la réponse ou l'item nomme un
 *    candidat interrogé au run, `candidats.ts`), hors refus de l'API, que `reponse-contrefactuelle.ts`
 *    refuse de permuter faute de texte, sont tirées (`tirerSousEnsembleContrefactuel`) ; le
 *    dérangement des candidats interrogés est tiré (`tirerDerangement`).
 * 2. **Paires.** Chaque réponse du sous-ensemble est notée par les deux juges (notation ordinaire du
 *    run, réutilisée ensuite par la règle de décision), puis sa réponse permutée (`demandePermutee`)
 *    est écrite et notée par les deux juges (contexte `contrefactuel_candidat`, motif `contrefactuel`).
 * 3. **Test et inscription.** `testerContrefactuel`, `publierContrefactuel`, puis l'inscription dans
 *    `run.json` (`inscription-contrefactuel.ts`) : retrait éventuel d'un juge, échantillon à 25 %.
 *    Deux juges retirés (D16 (3)) : le test est inscrit avec l'invalidation du run (la raison, la
 *    date ; statut inchangé, D51 (2)), et la chaîne s'arrête là.
 * 3 bis. **Contrefactuel d'outil** (§7, « Conflit d'intérêts » ; D75 (7)). Seuls les juges non
 *    retirés au test des candidats y sont mesurés : il le suit. Son absence se publie dans
 *    `run.json#/contrefactuel_outils` (`publication-contrefactuel-outils.ts`,
 *    `inscription-contrefactuel-outils.ts`), une fois. Aujourd'hui, la chaîne ne décide que
 *    l'absence que l'instantané du gel suffit à établir : moins de deux assistants inclus
 *    (`outilsDuDerangement`, `absenceFauteDOutils`). Au-delà, l'éditeur partagé et le test lui-même
 *    exigent le libellé et l'éditeur de chaque outil, que le §7 lit à l'instantané du gel et que
 *    `run.json` ne porte pas encore : rien n'est inscrit, et le résultat le dit
 *    (`libelles_et_editeurs_hors_du_gel`), jamais en silence. Un run invalide ou un test des
 *    candidats en attente ne le passe pas (`contrefactuel_candidats_non_conclu`).
 * 4. **Masse.** Le run est relu ; chaque réponse obtenue est notée par les juges non retirés (un juge
 *    retiré n'est plus appelé, ses notations du sous-ensemble restent écrites et sont écartées par
 *    `decider`, D13), puis décidée (`decider`) avec l'appartenance à l'échantillon humain
 *    (`tirerEchantillonHumain`, sur toutes les réponses obtenues). Un verdict est écrit ; une
 *    attente est rendue avec ses motifs, sans verdict inventé. **Refus de l'API (D32)** : aucun juge
 *    n'est appelé ; la règle inscrit la notation `non_reponse` que D12 fixe (`regle-refus.ts`), et
 *    `decider` en tire le verdict, sans humain hors échantillon, avec les deux humains dedans.
 *
 * **Liens.** Une réponse dont un lien n'a pas de verdict d'existence, ou dont la copie conservée d'un
 * lien n'a pas encore son texte extrait (`pnpm liens:textes`, D27 (E) : la charge v3 transmet le
 * texte de chaque page citée, `pages-citees.ts`), n'est ni notée ni décidée : elle est rendue en
 * attente `test_liens`. Si une réponse du sous-ensemble contrefactuel attend ainsi, le test ne peut
 * pas se faire, et la notation de masse n'a pas lieu (D14 (1)).
 *
 * **Reprise (règle 7).** Les identifiants sont dérivés du run, du rôle de l'objet et de l'objet
 * (`identifiantDerive`) : une relance retrouve les mêmes. Une notation de juge déjà écrite (même
 * contexte, même objet, même juge) n'est pas redemandée ; une réponse contrefactuelle ou un verdict
 * déjà écrits ne sont pas réécrits ; `run.json` n'est inscrit qu'une fois. Rien n'est jamais réécrit.
 *
 * **Run invalidé (D51 (2)).** Un `run.json` qui porte une `invalidation` est refusé avant toute
 * écriture (`RunInvalideRefuse`) : un run invalidé par `pnpm run:invalider` n'est plus noté. Seule
 * exception, la reprise d'un D16 (3) : le test contrefactuel est inscrit et ses deux juges retirés ;
 * la relance recalcule le test sans rien réécrire et s'arrête au même point.
 *
 * **Réponse en attente de l'opérateur (§6, 0.22, D57 (2)).** Tant qu'une requête du plan attend
 * l'opérateur, la chaîne refuse de commencer (`ReponsesEnAttenteOperateur`), avant toute écriture :
 * la stocker après coup changerait l'échantillon humain et le sous-ensemble contrefactuel.
 *
 * **Réponses obtenues (§5 « Tailles », 0.27).** Juste après cette garde et le contrôle des juges, le
 * nombre de réponses obtenues du canal API est inscrit dans `run.json#/reponses/obtenues`
 * (`inscription-reponses.ts`), une fois ; une relance le retrouve et ne le réécrit pas.
 *
 * **Juge défaillant (§7, 0.27).** Une réponse qu'un juge ne peut pas noter n'arrête pas la chaîne :
 * elle est renvoyée à un humain avec son motif (`juge.ts:noterOuRenvoyer`), comme une Q-ATT
 * indécidable.
 *
 * **Fraîcheur indéfinie (§7, 0.32, D74 (25)).** Un drapeau obsolescence posé sur des items de
 * plusieurs dates de changement est un défaut du banc (`juge.ts:FraicheurIndefinie`) : il remonte et
 * arrête la chaîne, sans notation ni renvoi pour ce juge et cette réponse, et sans invalidation du
 * run. Ce qui est déjà écrit le reste (notations des réponses et des juges précédents, test
 * contrefactuel inscrit) ; une relance après correction le retrouve et reprend (Reprise, ci-dessus).
 *
 * 5. **Lectures de comparateur** (§6 ; D87). Après la masse, et sous la même condition (test des
 *    candidats conclu, run valide), le verdict de chaque lecture affichée dont la note est retenue par
 *    ses seules notations humaines est écrit (`verdicts-de-lecture.ts`), sous un identifiant dérivé
 *    comme celui d'une réponse. Une lecture à noter ou à arbitrer est rendue sans verdict ; des
 *    lectures pas encore collectées le sont aussi (`lectures_non_collectees`), sans rien écrire.
 *
 * **Humains.** La chaîne n'en simule aucun. Elle lit les notations humaines déjà écrites (écran
 * `pnpm notation:humaine`) et les passe à `decider` : une relance après la saisie humaine résout les
 * attentes qui peuvent l'être, celles des lectures de comparateur comprises.
 */

import { createHash } from "node:crypto";
import { lireNotationsDuRun, lireRunJson, lireVerdicts, runDeNotationDe, type RunLu } from "../../analysis/lecture-run.ts";
import type { Instant, Ulid } from "../../analysis/types.ts";
import { exigerAucuneAttenteDuRun } from "../interrogation/attente-operateur.ts";
import type { ReponseObtenue } from "../interrogation/types.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { textesNommables } from "./candidats.ts";
import { construireCharge, type DemandeCharge, type QuestionPosee, type ReferenceSoumise, type ResoluAuGel } from "./charge-juge.ts";
import { testerContrefactuel, type ContrefactuelFauteDInterroges, type PaireContrefactuelle, type ResultatContrefactuel } from "./contrefactuel.ts";
import { decider, type MotifAttente } from "./decision.ts";
import { MINIMUM_INTERROGES_DERANGEMENT, tirerDerangement, type Derangement } from "./derangement.ts";
import { absenceFauteDOutils, outilsDuDerangement } from "./derangement-outils.ts";
import { inscrireContrefactuelOutils } from "./inscription-contrefactuel-outils.ts";
import { publierAbsenceContrefactuelOutils, type BlocContrefactuelOutils } from "./publication-contrefactuel-outils.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { tirerEchantillonHumain, tirerSousEnsembleContrefactuel } from "./echantillons.ts";
import { citationsDeReference, type TextesDeVerification } from "./extrait.ts";
import type { FournisseurExistences } from "./fournisseur-existences.ts";
import { inscrireContrefactuel, type IssueInscription } from "./inscription-contrefactuel.ts";
import { inscrireReponsesObtenuesDuRun } from "./inscription-reponses.ts";
import { exigerFamillesDistinctes } from "./familles-juges.ts";
import { noterOuRenvoyer, versionPromptDe, type IssueDeJuge, type Juge } from "./juge.ts";
import { pagesCitees, type PageCitee } from "./pages-citees.ts";
import { nommeUnInterroge } from "./permutation.ts";
import { publierContrefactuel, publierFauteDInterroges } from "./publication-contrefactuel.ts";
import { notationParRegle, REGLE_REFUS_API } from "./regle-refus.ts";
import { demandePermutee, type DemandePermutee } from "./reponse-contrefactuelle.ts";
import { DepotNotation } from "./stockage.ts";
import { ecrireVerdictsDeLecture, type EtatLecturesDuRun } from "./verdicts-de-lecture.ts";
import { TAUX_ECHANTILLON_SANS_RETRAIT } from "./taux-echantillon.ts";
import type { CandidatDuRun, NotationIndividuelle, RenvoiHumain, RunDeNotation } from "./types.ts";
import { indexerExistences, type ExistenceEtablie } from "./vue-annotateur.ts";
import { candidatsInterroges as candidatsInterrogesDuRun } from "../../analysis/candidats-interroges.ts";
import { candidatsElimines } from "./elimines.ts";

/** Une réponse obtenue du run, avec sa question posée, ses items épinglés et ce que le tirage a résolu au gel. */
export interface ReponseANoter {
  readonly reponse: ReponseObtenue;
  readonly question: QuestionPosee;
  readonly references: readonly ReferenceSoumise[];
  /** `tirage.entrees[]` de la question : réponse attendue et prémisse (D27 (F), (G)). */
  readonly resolu_au_gel: ResoluAuGel;
}

export interface EnvironnementChaine {
  readonly repertoire_run: string;
  readonly juges: readonly Juge[];
  readonly existences: FournisseurExistences;
  /** L'instant posé sur chaque notation et chaque verdict écrits. */
  maintenant(): Instant;
}

/** Les motifs d'attente de `decider`, plus ceux qui empêchent d'y arriver. */
export type MotifEnAttente = MotifAttente | "test_liens" | "contrefactuel_en_attente" | "run_invalide";

export interface Attente {
  readonly reponse_id: Ulid;
  readonly motifs: readonly MotifEnAttente[];
}

export type EtatContrefactuel =
  | { readonly statut: IssueInscription; readonly resultat: ResultatContrefactuel | ContrefactuelFauteDInterroges }
  | { readonly statut: "en_attente_test_liens"; readonly reponse_ids: readonly Ulid[] }
  | { readonly statut: "run_invalide"; readonly raison: string; readonly resultat: ResultatContrefactuel; readonly inscription: IssueInscription };

/** Le contrefactuel d'outil : son absence inscrite, ou la raison pour laquelle rien ne l'est (étape 3 bis). */
export type EtatContrefactuelOutils =
  | { readonly statut: IssueInscription; readonly bloc: BlocContrefactuelOutils }
  | { readonly statut: "non_joue"; readonly motif: "contrefactuel_candidats_non_conclu" | "libelles_et_editeurs_hors_du_gel" };

export interface ResultatChaine {
  readonly run_id: Ulid;
  readonly contrefactuel: EtatContrefactuel;
  readonly contrefactuel_outils: EtatContrefactuelOutils;
  /** Les réponses dont le verdict est écrit, maintenant ou par une exécution précédente. */
  readonly verdicts: readonly Ulid[];
  /** Les réponses sans verdict, chacune avec ses motifs. */
  readonly attentes: readonly Attente[];
  /** Étape 5 : les lectures de comparateur dont le verdict est écrit, celles qui l'attendent, ou pourquoi rien n'a été joué. */
  readonly lectures: EtatLecturesDuRun;
}

export class JugesNonConformes extends Error {
  constructor(detail: string) {
    super(`Juges refusés : ${detail}`);
    this.name = "JugesNonConformes";
  }
}

/** D51 (2) : un run qui porte une invalidation n'est plus noté. */
export class RunInvalideRefuse extends Error {
  constructor(run_id: Ulid, motif: string) {
    super(`Run ${run_id} refusé : il porte une invalidation (« ${motif} ») ; un run invalidé n'est plus noté (décision D51). Rien n'est écrit.`);
    this.name = "RunInvalideRefuse";
  }
}

export class ReponsesNonConformes extends Error {
  constructor(detail: string) {
    super(`Réponses à noter refusées : ${detail}`);
    this.name = "ReponsesNonConformes";
  }
}

/* ------------------------------------------------------------------ identifiants */

const ALPHABET_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Un identifiant au motif ULID du schéma, dérivé des composants (sha256, 128 premiers bits). */
export function identifiantDerive(composants: readonly string[]): Ulid {
  const octets = createHash("sha256").update(composants.join("\u0000"), "utf8").digest();
  let valeur = 0n;
  for (const octet of octets.subarray(0, 16)) valeur = (valeur << 8n) | BigInt(octet);
  const caracteres: string[] = [];
  for (let rang = 0; rang < 26; rang += 1) {
    caracteres.push(ALPHABET_CROCKFORD.charAt(Number(valeur % 32n)));
    valeur /= 32n;
  }
  return caracteres.reverse().join("");
}

/* ------------------------------------------------------------------ état de la chaîne */

/** Ce que le test des liens a établi pour une réponse : le verdict d'existence et la page de chaque lien. */
interface LiensEtablis {
  readonly existences: ReadonlyMap<string, ExistenceEtablie>;
  readonly pages: readonly PageCitee[];
}

interface Preparee extends ReponseANoter {
  readonly textes: TextesDeVerification;
  /** `null` : au moins un lien sans verdict d'existence, ou une copie sans texte extrait. */
  readonly liens: LiensEtablis | null;
}

interface Etat {
  readonly env: EnvironnementChaine;
  readonly run: RunLu;
  /** Les candidats du périmètre du run : les noms cités sur une Q-ATT s'y rattachent (D27 (D)). */
  readonly candidats: readonly CandidatDuRun[];
  /** Les candidats interrogés au run : la note d'une Q-ATT les distingue (D29 (1)). */
  readonly interroges: readonly string[];
  /** Les éliminés du premier tour : la note d'une Q-ATT les écarte (§7, D70 (7)). */
  readonly elimines: readonly string[];
  readonly depot: DepotNotation;
  /** Rangées par identifiant croissant. */
  readonly reponses: readonly Preparee[];
  readonly parId: ReadonlyMap<Ulid, Preparee>;
  /** Toutes les notations du run, lues puis écrites. */
  readonly notations: NotationIndividuelle[];
  /** Les renvois de juge du run (D30 (2)), lus puis écrits. */
  readonly renvois: RenvoiHumain[];
  /** Clés (contexte, objet, notateur) des notations de juge ou de règle (D32) déjà écrites. */
  readonly cles: Set<string>;
  /** Réponses contrefactuelles déjà écrites, par identifiant, sous forme canonique. */
  readonly contrefactuelles: Map<Ulid, string>;
  /** Objets qui ont déjà leur verdict. */
  readonly verdicts: Set<Ulid>;
}

type Cote = { readonly contexte: "run"; readonly motif: "notation_juge" } | { readonly contexte: "contrefactuel_candidat"; readonly motif: "contrefactuel" };

const COTE_RUN: Cote = { contexte: "run", motif: "notation_juge" };
const COTE_PERMUTE: Cote = { contexte: "contrefactuel_candidat", motif: "contrefactuel" };

/** Ce qu'un juge note : une demande de charge, d'un côté, et ce qu'il faut pour assembler la notation. */
interface Cible {
  readonly cote: Cote;
  readonly objet_id: Ulid;
  readonly demande: Omit<DemandeCharge, "prompt">;
  readonly textes: TextesDeVerification;
  readonly existences: ReadonlyMap<string, ExistenceEtablie>;
}

export async function noterRun(reponses: readonly ReponseANoter[], env: EnvironnementChaine): Promise<ResultatChaine> {
  const etat = ouvrir(reponses, env);
  const contrefactuel = await passerContrefactuel(etat);
  if (contrefactuel.statut === "en_attente_test_liens" || contrefactuel.statut === "run_invalide") {
    const contrefactuel_outils: EtatContrefactuelOutils = { statut: "non_joue", motif: "contrefactuel_candidats_non_conclu" };
    const lectures: EtatLecturesDuRun = { statut: "non_jouees", motif: "contrefactuel_candidats_non_conclu" };
    return { run_id: etat.run.id, contrefactuel, contrefactuel_outils, verdicts: [], attentes: etat.reponses.map((r) => attenteSansMasse(r, contrefactuel.statut)), lectures };
  }
  const contrefactuel_outils = passerContrefactuelOutils(etat);
  const run = runDeNotationDe(lireRunJson(env.repertoire_run));
  const masse = await noterEnMasse(etat, run);
  return { run_id: etat.run.id, contrefactuel, contrefactuel_outils, ...masse, lectures: passerLectures(etat) };
}

/** Étape 5 (D87) : le verdict de chaque lecture retenue, identifiant dérivé comme celui d'une réponse. */
function passerLectures(etat: Etat): EtatLecturesDuRun {
  return ecrireVerdictsDeLecture(etat.env.repertoire_run, etat.depot, (lecture_id) => ({
    verdict_id: identifiantDerive([etat.run.id, "verdict", lecture_id]),
    date: etat.env.maintenant(),
  }));
}

function ouvrir(reponses: readonly ReponseANoter[], env: EnvironnementChaine): Etat {
  const run = lireRunJson(env.repertoire_run);
  exigerNotable(run);
  exigerAucuneAttenteDuRun(env.repertoire_run, "notation");
  verifierJuges(run, env.juges);
  // §5 « Tailles » (0.27) : le nombre de réponses obtenues, canal API seul, est inscrit au début de la notation.
  inscrireReponsesObtenuesDuRun(env.repertoire_run);
  const depot = DepotNotation.ouvrir(env.repertoire_run);
  const lues = lireNotationsDuRun(env.repertoire_run, run.id);
  const preparees = [...reponses].sort((a, b) => comparerChaines(a.reponse.id, b.reponse.id)).map((r) => preparer(r, env.existences));
  return {
    env,
    run,
    candidats: runDeNotationDe(run).candidats,
    interroges: candidatsInterrogesDuRun(run.perimetre.candidats).map((candidat) => candidat.candidat_id),
    elimines: candidatsElimines(run.perimetre),
    depot,
    reponses: preparees,
    parId: indexerReponses(preparees, run.id),
    notations: [...lues.notations],
    renvois: [...lues.renvois],
    cles: new Set([...lues.notations.filter((n) => n.notateur.type !== "humain").map(cleDeNotation), ...lues.renvois.map(cleDeNotation)]),
    contrefactuelles: new Map(lues.reponses_contrefactuelles.map((r) => [r.id, canoniser(r)])),
    verdicts: new Set(lireVerdicts(env.repertoire_run, run.id).map((v) => v.objet_note.id)),
  };
}

/**
 * D16 (3) déjà inscrit : le test contrefactuel est dans `run.json` et ses deux juges sont retirés.
 * L'invalidation vient alors de la notation elle-même, et la relance est une reprise.
 */
function estRepriseD16(run: RunLu): boolean {
  return run.contrefactuel_candidats !== undefined && run.juges.every((juge) => juge.retire);
}

/**
 * D51 (2) : refus, avant toute écriture, d'un run qui porte une invalidation, sauf la reprise d'un
 * D16 (3). Exportée pour `notation-humaine/serveur/chargement.ts` : la même règle, le même refus,
 * jamais recopiés (constat 7, revue du 2026-10-17).
 */
export function exigerNotable(run: RunLu): void {
  if (run.invalidation === undefined || estRepriseD16(run)) return;
  throw new RunInvalideRefuse(run.id, run.invalidation.motif);
}

/** Ce que `run.schema.json` exige de chaque juge déclaré (`required`), et que `RunLu` ne type pas. */
interface JugeDeclare {
  readonly juge_id: string;
  readonly famille_modele: string;
  readonly modele: string;
  readonly version_prompt: string;
}

/**
 * Les juges que déclare `run.json` sont de familles différentes (§7.12, `familles-juges.ts`), et les
 * juges injectés sont exactement ceux du run, sous l'identité que `run.json` déclare.
 */
function verifierJuges(run: RunLu, juges: readonly Juge[]): void {
  // `lireRunJson` a validé run.json contre son schéma, qui exige ces quatre champs de chaque juge.
  const declares = run.juges as unknown as readonly JugeDeclare[];
  exigerFamillesDistinctes(declares);
  const recus = juges.map((juge) => juge.identite.juge_id).sort(comparerChaines);
  const ids = declares.map((juge) => juge.juge_id).sort(comparerChaines);
  if (recus.join("\u0000") !== ids.join("\u0000")) {
    throw new JugesNonConformes(`juges reçus (${recus.join(", ")}), juges du run ${run.id} (${ids.join(", ")}).`);
  }
  for (const juge of juges) {
    const declare = declares.find((j) => j.juge_id === juge.identite.juge_id);
    const recue = { famille_modele: juge.identite.famille_modele, modele: juge.identite.modele, version_prompt: versionPromptDe(juge.identite.prompt) };
    const attendue = { famille_modele: declare?.famille_modele, modele: declare?.modele, version_prompt: declare?.version_prompt };
    if (canoniser(recue) !== canoniser(attendue)) {
      throw new JugesNonConformes(`le juge ${juge.identite.juge_id} se présente comme ${canoniser(recue)}, le run le déclare ${canoniser(attendue)}.`);
    }
  }
}

function preparer(r: ReponseANoter, fournisseur: FournisseurExistences): Preparee {
  const items = r.references.map((reference) => reference.item);
  return {
    ...r,
    textes: { reponse: r.reponse.normalise.texte, citations_reference: citationsDeReference(items) },
    liens: liensEtablis(r.reponse, fournisseur),
  };
}

/** Le verdict d'existence et la page de chaque lien cité, ou `null` s'il en manque un : jamais supposé. */
function liensEtablis(reponse: ReponseObtenue, fournisseur: FournisseurExistences): LiensEtablis | null {
  const existences = existencesCompletes(reponse, fournisseur);
  if (existences === null) return null;
  const pages = pagesCitees(reponse.id, reponse.normalise.liens, existences, (sha256) => fournisseur.texteDeCopie(sha256));
  return pages === null ? null : { existences, pages };
}

function existencesCompletes(reponse: ReponseObtenue, fournisseur: FournisseurExistences): ReadonlyMap<string, ExistenceEtablie> | null {
  const liens = [...new Set(reponse.normalise.liens)];
  if (liens.length === 0) return new Map();
  const index = indexerExistences(reponse.id, liens, fournisseur.existencesDe(reponse.id, liens));
  return liens.every((lien) => index.has(lien)) ? index : null;
}

function indexerReponses(reponses: readonly Preparee[], run_id: Ulid): ReadonlyMap<Ulid, Preparee> {
  const index = new Map<Ulid, Preparee>();
  for (const r of reponses) {
    if (r.reponse.run_id !== run_id) {
      throw new ReponsesNonConformes(`la réponse ${r.reponse.id} est du run ${r.reponse.run_id}, pas du run ${run_id}.`);
    }
    if (index.has(r.reponse.id)) throw new ReponsesNonConformes(`la réponse ${r.reponse.id} figure deux fois.`);
    index.set(r.reponse.id, r);
  }
  return index;
}

function cleDeNotation(notation: Pick<NotationIndividuelle | RenvoiHumain, "contexte" | "objet_note" | "notateur">): string {
  return cle(notation.contexte, notation.objet_note.id, notation.notateur.id);
}

function cle(contexte: string, objet_id: Ulid, juge_id: string): string {
  return `${contexte}\u0000${objet_id}\u0000${juge_id}`;
}

function exigerPreparee(etat: Etat, reponse_id: Ulid): Preparee {
  const r = etat.parId.get(reponse_id);
  if (r === undefined) throw new ReponsesNonConformes(`la réponse ${reponse_id} n'est pas parmi les réponses à noter.`);
  return r;
}

/* ------------------------------------------------------------------ juges */

/** Fait noter la cible par chaque juge qui ne l'a pas déjà notée, et écrit chaque notation. */
async function noterParLesJuges(etat: Etat, juges: readonly Juge[], cible: Cible): Promise<void> {
  for (const juge of juges) {
    if (etat.cles.has(cle(cible.cote.contexte, cible.objet_id, juge.identite.juge_id))) continue;
    const charge = construireCharge({ ...cible.demande, prompt: juge.identite.prompt });
    // §7 (0.27) : un juge défaillant ou une sortie illisible donnent un renvoi humain motivé, et la chaîne continue.
    const issue = await noterOuRenvoyer(juge, charge, {
      id: identifiantDerive([etat.run.id, "notation", cible.cote.contexte, cible.objet_id, juge.identite.juge_id]),
      run_id: etat.run.id,
      contexte: cible.cote.contexte,
      motif_notation: cible.cote.motif,
      objet_id: cible.objet_id,
      gabarit: cible.demande.question.gabarit,
      references_item: cible.demande.references.map(({ item }) => ({ item_id: item.id, item_version: item.version, item_empreinte: item.empreinte })),
      date: etat.env.maintenant(),
      liens: charge.reponse.liens,
      existences: cible.existences,
      textes: cible.textes,
      date_gel: cible.demande.date_run,
      items: cible.demande.references.map(({ item }) => item),
      reponse_attendue: cible.demande.resolu_au_gel.reponse_attendue,
      candidats: etat.candidats,
      interroges: etat.interroges,
      elimines: etat.elimines,
      registre: cible.demande.question.registre,
      premisse_fausse: cible.demande.resolu_au_gel.premisse_fausse,
      version_charge: charge.version_charge,
    });
    consigner(etat, issue);
  }
}

/**
 * D30 (2), §7 (0.27) : un renvoi — Q-ATT indécidable ou juge défaillant — s'écrit à la place de la
 * notation, sous la même clé ; une relance ne redemande pas le juge.
 */
function consigner(etat: Etat, issue: IssueDeJuge): void {
  if (issue.type === "renvoi") {
    etat.depot.ecrireRenvoi(issue.renvoi);
    etat.renvois.push(issue.renvoi);
    etat.cles.add(cleDeNotation(issue.renvoi));
    return;
  }
  etat.depot.ecrireNotation(issue.notation);
  etat.notations.push(issue.notation);
  etat.cles.add(cleDeNotation(issue.notation));
}

/**
 * D32 : un refus de l'API n'est soumis à aucun juge ; la règle inscrit sa note (`regle-refus.ts`),
 * une fois. Une relance retrouve la notation sous la même clé et ne la recalcule pas.
 */
function noterParRegle(etat: Etat, r: Preparee): void {
  if (etat.cles.has(cle(COTE_RUN.contexte, r.reponse.id, REGLE_REFUS_API.id))) return;
  const gabarit = r.question.gabarit;
  const notation = notationParRegle({
    id: identifiantDerive([etat.run.id, "notation", COTE_RUN.contexte, r.reponse.id, REGLE_REFUS_API.id]),
    run_id: etat.run.id,
    reponse: r.reponse,
    gabarit,
    references_item: r.references.map(({ item }) => ({ item_id: item.id, item_version: item.version, item_empreinte: item.empreinte })),
    attribution: gabarit === "Q-ATT" ? { reponse_attendue: r.resolu_au_gel.reponse_attendue, candidats: etat.candidats } : null,
    date: etat.env.maintenant(),
  });
  consigner(etat, { type: "notation", notation });
}

function demandeDe(etat: Etat, r: Preparee, liens: LiensEtablis): Omit<DemandeCharge, "prompt"> {
  return {
    reponse: r.reponse,
    question: r.question,
    references: r.references,
    date_run: etat.run.date_gel,
    resolu_au_gel: r.resolu_au_gel,
    pages_citees: liens.pages,
    alias_candidats: etat.run.alias_candidats,
  };
}

function cibleOrigine(etat: Etat, r: Preparee, liens: LiensEtablis): Cible {
  return { cote: COTE_RUN, objet_id: r.reponse.id, demande: demandeDe(etat, r, liens), textes: r.textes, existences: liens.existences };
}

/* ------------------------------------------------------------------ test contrefactuel */

/** D14 (1) : le test précède tout retrait, donc il se joue sur le run tel qu'il était au gel. */
function runAvantLeTest(run: RunDeNotation): RunDeNotation {
  const { contrefactuel_candidats: _publie, ...gel } = run;
  return { ...gel, juges: run.juges.map((juge) => ({ juge_id: juge.juge_id, retire: false })), taux_echantillon_humain: 0.1 };
}

/**
 * D55 (4), §7 (0.19) : éligibilité restreinte aux candidats interrogés, ceux que le dérangement
 * permute ; les formes de tout le périmètre sont cherchées, pour qu'un nom de non-interrogé qui
 * contient celui d'un interrogé ne compte pas (`permutation.ts:nommeUnInterroge`). Exportée
 * (signature réduite à ce qu'elle lit) pour un test unitaire direct.
 */
export function estEligible(r: Pick<ReponseANoter, "reponse" | "references">, interroges: readonly CandidatDuRun[], perimetre: readonly CandidatDuRun[]): boolean {
  if (r.reponse.normalise.refus_api) return false;
  return nommeUnInterroge(textesNommables(r.reponse.normalise.texte, r.references.map((reference) => reference.item)), interroges, perimetre);
}

/** Les candidats du périmètre interrogés au run, ceux que le dérangement permute (D55 (4)). */
function candidatsInterroges(etat: Etat, run: RunDeNotation): readonly CandidatDuRun[] {
  return run.candidats.filter((candidat) => etat.interroges.includes(candidat.candidat_id));
}

async function passerContrefactuel(etat: Etat): Promise<EtatContrefactuel> {
  const run = runAvantLeTest(runDeNotationDe(etat.run));
  const interroges = candidatsInterroges(etat, run);
  if (interroges.length < MINIMUM_INTERROGES_DERANGEMENT) return inscrireFauteDInterroges(etat, run);
  const eligibles = etat.reponses.filter((r) => estEligible(r, interroges, run.candidats)).map((r) => r.reponse.id);
  const sous_ensemble = tirerSousEnsembleContrefactuel(eligibles, run.graines.contrefactuel);
  const attendent = sous_ensemble.reponse_ids.filter((id) => exigerPreparee(etat, id).liens === null);
  if (attendent.length > 0) return { statut: "en_attente_test_liens", reponse_ids: attendent };
  const derangement = tirerDerangement(interroges, run.candidats, run.graines.contrefactuel);
  const paires: PaireContrefactuelle[] = [];
  for (const id of sous_ensemble.reponse_ids) paires.push(await noterPaire(etat, exigerPreparee(etat, id), derangement));
  const resultat = testerContrefactuel({ run, sous_ensemble, paires, notations: notationsDesPaires(etat, paires), renvois: renvoisDesPaires(etat, paires) });
  const publication = publierContrefactuel(resultat, sous_ensemble, derangement, run);
  const inscription = inscrireContrefactuel(etat.env.repertoire_run, publication, () => etat.env.maintenant());
  if (resultat.statut === "run_invalide") return { statut: "run_invalide", raison: resultat.raison, resultat, inscription };
  return { statut: inscription, resultat };
}

/** §7 (0.21) : sous deux candidats interrogés, le test indéfini est inscrit, sans tirage ni juge. */
function inscrireFauteDInterroges(etat: Etat, run: RunDeNotation): EtatContrefactuel {
  const resultat: ContrefactuelFauteDInterroges = { statut: "indefini", motif: "moins_de_deux_interroges", taux_echantillon_humain: TAUX_ECHANTILLON_SANS_RETRAIT };
  const inscription = inscrireContrefactuel(etat.env.repertoire_run, publierFauteDInterroges(resultat, run), () => etat.env.maintenant());
  return { statut: inscription, resultat };
}

async function noterPaire(etat: Etat, r: Preparee, derangement: Derangement): Promise<PaireContrefactuelle> {
  const liens = exigerLiens(r);
  await noterParLesJuges(etat, etat.env.juges, cibleOrigine(etat, r, liens));
  const contrefactuelle_id = identifiantDerive([etat.run.id, "reponse_contrefactuelle", "noms_candidats", r.reponse.id]);
  const permutee = permuter(etat, r, liens, contrefactuelle_id, derangement);
  const cible: Cible = { cote: COTE_PERMUTE, objet_id: contrefactuelle_id, demande: permutee.demande, textes: permutee.textes, existences: liens.existences };
  await noterParLesJuges(etat, etat.env.juges, cible);
  return {
    reponse_id: r.reponse.id,
    contrefactuelle_id,
    textes_origine: r.textes,
    textes_permutes: permutee.textes,
    mentions_residuelles: permutee.mentions_residuelles,
  };
}

/** La demande permutée ; sa réponse est écrite une fois, et une relance la retrouve identique. */
function permuter(etat: Etat, r: Preparee, liens: LiensEtablis, contrefactuelle_id: Ulid, derangement: Derangement): DemandePermutee {
  const [premier] = etat.env.juges;
  if (premier === undefined) throw new JugesNonConformes("aucun juge.");
  // Le prompt ne touche ni la réponse ni les textes permutés ; chaque juge reçoit le sien (noterParLesJuges).
  const permutee = demandePermutee({ ...demandeDe(etat, r, liens), prompt: premier.identite.prompt }, contrefactuelle_id, derangement);
  const deja = etat.contrefactuelles.get(contrefactuelle_id);
  if (deja === undefined) {
    etat.depot.ecrireReponseContrefactuelle(permutee.reponse);
    etat.contrefactuelles.set(contrefactuelle_id, canoniser(permutee.reponse));
  } else if (deja !== canoniser(permutee.reponse)) {
    throw new ReponsesNonConformes(`la réponse contrefactuelle ${contrefactuelle_id} écrite diffère de celle que la permutation redonne.`);
  }
  return permutee;
}

function exigerLiens(r: Preparee): LiensEtablis {
  if (r.liens === null) throw new ReponsesNonConformes(`la réponse ${r.reponse.id} attend le test des liens.`);
  return r.liens;
}

/** D31 (1) : les renvois de juge portant sur un côté des paires ; ils écartent la paire du taux de ce juge. */
function renvoisDesPaires(etat: Etat, paires: readonly PaireContrefactuelle[]): readonly RenvoiHumain[] {
  const objets = new Set(paires.flatMap((p) => [p.reponse_id, p.contrefactuelle_id]));
  return etat.renvois.filter((r) => objets.has(r.objet_note.id));
}

/** Les notations de juge portant sur les deux côtés des paires, et elles seules. */
function notationsDesPaires(etat: Etat, paires: readonly PaireContrefactuelle[]): readonly NotationIndividuelle[] {
  const objets = new Set(paires.flatMap((p) => [p.reponse_id, p.contrefactuelle_id]));
  return etat.notations.filter((n) => n.notateur.type === "juge" && objets.has(n.objet_note.id));
}

/* ------------------------------------------------------------------ contrefactuel d'outil */

/**
 * Étape 3 bis : sous deux assistants inclus au gel, le test d'outil est absent et son absence est
 * inscrite, sans tirage ni juge. Au-delà, rien n'est inscrit : la suite exige le libellé et
 * l'éditeur de chaque outil, absents de l'instantané du gel (§7).
 */
function passerContrefactuelOutils(etat: Etat): EtatContrefactuelOutils {
  const absence = absenceFauteDOutils(outilsDuDerangement(etat.run.perimetre.outils).length);
  if (absence === null) return { statut: "non_joue", motif: "libelles_et_editeurs_hors_du_gel" };
  const bloc = publierAbsenceContrefactuelOutils(absence);
  return { statut: inscrireContrefactuelOutils(etat.env.repertoire_run, bloc), bloc };
}

/* ------------------------------------------------------------------ notation de masse */

function attenteSansMasse(r: Preparee, statut: "en_attente_test_liens" | "run_invalide"): Attente {
  if (r.liens === null) return { reponse_id: r.reponse.id, motifs: ["test_liens"] };
  return { reponse_id: r.reponse.id, motifs: [statut === "run_invalide" ? "run_invalide" : "contrefactuel_en_attente"] };
}

async function noterEnMasse(etat: Etat, run: RunDeNotation): Promise<Pick<ResultatChaine, "verdicts" | "attentes">> {
  const retires = new Set(run.juges.filter((juge) => juge.retire).map((juge) => juge.juge_id));
  const actifs = etat.env.juges.filter((juge) => !retires.has(juge.identite.juge_id));
  const echantillon = new Set(tirerEchantillonHumain(etat.reponses.map((r) => r.reponse.id), run.graines.echantillon_humain, run.taux_echantillon_humain));
  const verdicts: Ulid[] = [];
  const attentes: Attente[] = [];
  for (const r of etat.reponses) {
    const attente = await noterReponse(etat, run, actifs, r, echantillon.has(r.reponse.id));
    if (attente === null) verdicts.push(r.reponse.id);
    else attentes.push(attente);
  }
  return { verdicts, attentes };
}

/** `null` : la réponse a son verdict. */
async function noterReponse(etat: Etat, run: RunDeNotation, actifs: readonly Juge[], r: Preparee, dans: boolean): Promise<Attente | null> {
  if (r.reponse.normalise.refus_api) noterParRegle(etat, r);
  else if (r.liens === null) return { reponse_id: r.reponse.id, motifs: ["test_liens"] };
  else await noterParLesJuges(etat, actifs, cibleOrigine(etat, r, r.liens));
  if (etat.verdicts.has(r.reponse.id)) return null;
  const decision = decider({
    run,
    objet_note: { type: "reponse", id: r.reponse.id },
    notations: etat.notations.filter((n) => n.contexte === "run" && n.objet_note.id === r.reponse.id),
    renvois: etat.renvois.filter((n) => n.contexte === "run" && n.objet_note.id === r.reponse.id),
    dans_echantillon_humain: dans,
    textes: r.textes,
    verdict_id: identifiantDerive([etat.run.id, "verdict", r.reponse.id]),
    date: etat.env.maintenant(),
  });
  if (decision.statut === "en_attente") return { reponse_id: r.reponse.id, motifs: decision.motifs };
  etat.depot.ecrireVerdict(decision.verdict);
  etat.verdicts.add(r.reponse.id);
  return null;
}
