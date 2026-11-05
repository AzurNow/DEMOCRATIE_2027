/**
 * L'exécution d'un run d'interrogation (§6) : chaque outil a sa file, les files avancent en
 * parallèle, chaque requête a au plus trois tentatives dans la fenêtre du run, et chaque requête
 * finit en une réponse écrite une fois — obtenue, manquante avec son motif, ou, si une réponse
 * reçue n'a pas pu être stockée, en attente de l'opérateur.
 *
 * Reprise : une requête dont la réponse est écrite est sautée ; sinon ses tentatives déjà
 * journalisées comptent (`journal.ts`), et l'exécution reprend à la suivante, après l'attente qui
 * la précède. Relancer un run complet ne fait donc rien.
 *
 * Réponse reçue, non stockée (§6, D55 (5)) : dès qu'une réponse HTTP est reçue, sa réception
 * (statut, instants, empreinte : `journal.ts:garderReception`) puis ses octets sont gardés sous
 * `volume/` avant toute interprétation (`journal.ts:garderOctets`). Si le décodage
 * (UTF-8, forme JSON attendue), la normalisation ou l'écriture de la réponse structurée échoue
 * ensuite, ce n'est pas une tentative de l'outil : le journal reçoit un événement
 * `recue_non_stockee` qui conclut la ligne, aucune réponse n'est écrite, et la requête n'est plus
 * jamais retentée — elle attend l'opérateur. Les autres requêtes, du même outil ou d'un autre,
 * continuent normalement. Si `garderOctets` échoue lui-même (collision, erreur disque), la réponse
 * est pourtant bien reçue : `garderOctetsOuSignaler` tente d'inscrire `recue_non_stockee` sans
 * octets (`chemin_octets: null`) avant de relever l'erreur d'origine, pour que la file s'arrête
 * bruyamment comme avant — mais sans jamais renvoyer cette requête à la relance. Un arrêt brutal
 * après la garde des octets, avant toute suite au journal, n'est pas non plus une tentative
 * interrompue : la relance conclut la ligne par `recue_non_stockee` sans rien renvoyer
 * (`conclureOctetsSansSuite`, §6, 0.19).
 *
 * Une réponse reçue, au run comme quand l'opérateur la stocke depuis ses octets gardés (§6, 0.21,
 * `stocker.ts`), suit un seul chemin, `stockerRecue` : classement par l'adaptateur, puis réponse
 * obtenue écrite, ou échec inscrit au journal. Seule diffère la suite d'une erreur de ce chemin :
 * le run conclut la ligne par `recue_non_stockee`, l'opérateur laisse la requête en attente.
 *
 * Une erreur qui n'est pas un échec de tentative ni une réponse reçue non stockée (par exemple une
 * incohérence de programme pendant l'envoi lui-même) arrête la file de son outil ; les autres
 * files vont au bout, puis l'erreur remonte. Sa tentative reste journalisée sans résultat.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { empreinteDe } from "../../validation/domaine/empreinte.ts";
import { ulid } from "../../validation/domaine/ulid.ts";
import { attenteAvantTentative, TENTATIVES_MAX } from "./conditions.ts";
import { entetesEnregistrables, type Adaptateur, type Contenu, type Editeur, type ReponseHttp, type RequeteHttp } from "./editeur.ts";
import { tentativePeutDemarrer, type Fenetre } from "./fenetre.ts";
import { instantParis } from "../../analysis/heure-paris.ts";
import type { Horloge } from "./horloge.ts";
import { JournalRequete, MESSAGE_OCTETS_SANS_SUITE, type Reprise } from "./journal.ts";
import type { PlanInterrogation } from "./plan.ts";
import type { DepotReponses } from "./stockage.ts";
import { conclureHttp, empreinteOctets, envoyerSousDelai, erreurSansReponse } from "./tentatives.ts";
import {
  cleDe,
  type BrutStocke,
  type CleRequete,
  type MotifManquante,
  type ProjectionNormalisee,
  type ReponseEcrite,
  type ReponseManquante,
  type ReponseObtenue,
  type RequetePlanifiee,
  type Tentative,
} from "./types.ts";

export interface ContexteRun {
  readonly run_id: string;
  readonly fenetre: Fenetre;
  readonly horloge: Horloge;
  readonly depot: DepotReponses;
  /** Répertoire des journaux de tentatives et des octets gardés (`volume/tentatives/`). */
  readonly repertoire_tentatives: string;
  /** L'éditeur de chaque outil du plan. Un outil sans éditeur lève avant tout envoi. */
  readonly editeurs: ReadonlyMap<string, Editeur>;
}

/** Ce qu'écrire une réponse exige, au run comme chez l'opérateur (`stocker.ts`) : ni fenêtre ni transport. */
export type ContexteEcriture = Pick<ContexteRun, "run_id" | "horloge" | "depot" | "repertoire_tentatives">;

/**
 * Une requête dont la réponse reçue n'a pas pu être stockée : elle attend l'opérateur (§6).
 * `chemin_octets` est résolu en chemin complet (le journal, lui, ne garde qu'un nom relatif) ;
 * `null` si la garde des octets a elle-même échoué (`garderOctetsOuSignaler`).
 */
export interface EnAttenteOperateur {
  readonly genre: "en_attente_operateur";
  readonly requete: CleRequete;
  readonly numero: number;
  readonly chemin_octets: string | null;
  readonly cause: string;
}

export interface BilanExecution {
  readonly ecrites: number;
  readonly deja_ecrites: number;
  /** Réponses reçues non stockées, nouvelles ou déjà connues du journal : jamais retentées. */
  readonly en_attente_operateur: readonly EnAttenteOperateur[];
}

export class RunHorsFenetre extends Error {
  constructor(maintenant: string, fenetre: Fenetre) {
    super(`Exécution lancée le ${maintenant}, avant l'ouverture de la fenêtre ${fenetre.debut} (§6).`);
    this.name = "RunHorsFenetre";
  }
}

/** Ce qu'une requête traverse, de son premier envoi à sa réponse écrite. */
export interface Course {
  readonly requete: RequetePlanifiee;
  readonly http: RequeteHttp;
  readonly adaptateur: Adaptateur;
  readonly journal: JournalRequete;
  readonly contexte: ContexteEcriture;
}

/** La course d'une requête : sa requête HTTP, construite par l'adaptateur de son éditeur. */
export function courseDe(requete: RequetePlanifiee, adaptateur: Adaptateur, journal: JournalRequete, contexte: ContexteEcriture): Course {
  const http = adaptateur.construireRequete({ texte: requete.texte, mode: requete.mode, modele_demande: requete.modele_demande });
  return { requete, http, adaptateur, journal, contexte };
}

/** Une réponse HTTP reçue à la tentative `numero`, avec les instants d'envoi et de réception. */
export interface Recue {
  readonly numero: number;
  readonly debut_ms: number;
  readonly fin_ms: number;
  readonly reponse: ReponseHttp;
}

/** Ce que devient une réponse reçue et stockée : obtenue et écrite, ou tentative en échec journalisée. */
export type IssueRecue = { readonly genre: "ecrite" } | { readonly genre: "echec"; readonly tentative: Tentative };

/** Ce qu'une réponse reçue, mais que le banc n'a pas pu stocker, porte pour l'opérateur. */
interface RecueNonStockee {
  readonly genre: "recue_non_stockee";
  readonly numero: number;
  readonly chemin_octets: string;
  readonly cause: string;
}

type Aboutissement =
  | { readonly genre: "ecrite" }
  | { readonly genre: "manquante"; readonly motif: MotifManquante; readonly tentatives: readonly Tentative[] }
  | RecueNonStockee;

type Essai = IssueRecue | RecueNonStockee;

/** Le message d'une erreur, sans secret : celle-ci vient du code du banc, jamais du corps reçu. */
function causeDe(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/* ----------------------------------------------------------------- tentatives */

/** Attend l'heure de la tentative `numero` ; faux si elle tomberait à la fin de la fenêtre ou après. */
async function attendreSonTour(numero: number, contexte: ContexteRun): Promise<boolean> {
  const { horloge, fenetre } = contexte;
  const attente = numero === 1 ? 0 : attenteAvantTentative(numero);
  if (!tentativePeutDemarrer(fenetre, horloge.maintenant() + attente)) return false;
  if (attente > 0) await horloge.attendre(attente, new AbortController().signal);
  return tentativePeutDemarrer(fenetre, horloge.maintenant());
}

/**
 * Garde la réception puis les octets reçus (§6, 0.21 : jamais des octets sans leur réception) ; si
 * la garde elle-même échoue (collision, erreur disque), la réponse a pourtant été reçue : une
 * inscription `recue_non_stockee` sans octets est tentée avant de relever l'erreur d'origine, pour
 * que la file s'arrête bruyamment comme avant (§6, D55 (5)). Si cette inscription échoue à son tour,
 * l'erreur d'origine remonte seule — limite connue, documentée en tête de `journal.ts`.
 */
function garderOctetsOuSignaler(course: Course, recue: Recue): string {
  const { numero, reponse } = recue;
  try {
    course.journal.garderReception({
      numero,
      statut_http: reponse.statut,
      debut_ms: recue.debut_ms,
      reception_ms: recue.fin_ms,
      octets_sha256: empreinteOctets(reponse.corps),
      normalisation: { fonction: course.adaptateur.normalisation.fonction, version: course.adaptateur.normalisation.version },
    });
    return course.journal.garderOctets(numero, reponse.corps);
  } catch (erreurGarde) {
    try {
      course.journal.inscrireRecueNonStockee(numero, null, `octets non gardés : ${causeDe(erreurGarde)}`);
    } catch {
      // L'inscription échoue aussi : l'erreur d'origine remonte seule (limite documentée, journal.ts).
    }
    throw erreurGarde;
  }
}

/**
 * Le chemin unique d'une réponse reçue (§6) : classée par l'adaptateur (`conclureHttp`), elle est
 * écrite comme réponse obtenue, ou sa tentative est inscrite en échec au journal. `passees` : les
 * tentatives closes qui la précèdent, gardées dans la réponse obtenue. Lève si le banc ne peut la
 * stocker (corps illisible, normalisation ou écriture en échec) ; l'appelant décide de la suite —
 * `recue_non_stockee` au run, requête laissée en attente chez l'opérateur (`stocker.ts`).
 */
export function stockerRecue(course: Course, recue: Recue, passees: readonly Tentative[]): IssueRecue {
  const conclusion = conclureHttp(recue.reponse, course.adaptateur);
  if (conclusion.genre === "echec") {
    course.journal.inscrireEchec(recue.numero, conclusion.erreur);
    return { genre: "echec", tentative: { numero: recue.numero, horodatage: instantParis(recue.debut_ms), erreur: conclusion.erreur } };
  }
  course.contexte.depot.ecrire(reponseObtenue(course, { ...conclusion, debut_ms: recue.debut_ms, fin_ms: recue.fin_ms, tentatives: passees }));
  return { genre: "ecrite" };
}

/**
 * Un envoi sans réponse HTTP (réseau, délai) est un échec de tentative. Une réponse reçue est
 * gardée, puis stockée par `stockerRecue` ; si ce stockage lève, les octets déjà gardés permettent
 * de conclure la ligne par `recue_non_stockee` plutôt que de laisser remonter l'erreur (§6, D55 (5)).
 * L'instant de réception est pris dès la réponse rendue, avant la garde et le classement.
 */
async function tenter(numero: number, course: Course, editeur: Editeur, passees: readonly Tentative[]): Promise<Essai> {
  const { horloge } = course.contexte;
  const debut_ms = horloge.maintenant();
  const horodatage = instantParis(debut_ms);
  course.journal.inscrireDebut(numero, horodatage, cleDe(course.requete));
  const envoi = await envoyerSousDelai(editeur, course.http, horloge);
  const fin_ms = horloge.maintenant();
  if (envoi.genre !== "http") {
    const erreur = erreurSansReponse(envoi);
    course.journal.inscrireEchec(numero, erreur);
    return { genre: "echec", tentative: { numero, horodatage, erreur } };
  }
  const recue: Recue = { numero, debut_ms, fin_ms, reponse: envoi.reponse };
  const chemin_octets = garderOctetsOuSignaler(course, recue);
  try {
    return stockerRecue(course, recue, passees);
  } catch (erreur) {
    const cause = causeDe(erreur);
    course.journal.inscrireRecueNonStockee(numero, chemin_octets, cause);
    return { genre: "recue_non_stockee", numero, chemin_octets, cause };
  }
}

async function poursuivre(course: Course, editeur: Editeur, contexte: ContexteRun, passees: readonly Tentative[]): Promise<Aboutissement> {
  const tentatives = [...passees];
  while (tentatives.length < TENTATIVES_MAX) {
    const numero = tentatives.length + 1;
    if (!(await attendreSonTour(numero, contexte))) return { genre: "manquante", motif: "hors_fenetre", tentatives };
    const essai = await tenter(numero, course, editeur, [...tentatives]);
    if (essai.genre !== "echec") return essai;
    tentatives.push(essai.tentative);
  }
  return { genre: "manquante", motif: "echecs", tentatives };
}

/* ------------------------------------------------------------------ réponse */

/** Décision de l'auteur du 2026-10-02 : la projection d'un refus de l'API est fixée. */
const PROJECTION_REFUS: ProjectionNormalisee = { texte: "", liens: [], troncature: false, refus_api: true };

function projection(adaptateur: Adaptateur, contenu: Contenu, refus_api: boolean): ProjectionNormalisee {
  return refus_api ? PROJECTION_REFUS : { ...adaptateur.normaliser(contenu), refus_api: false };
}

/** `brut` et son empreinte canonique pour un objet JSON ; `brut_texte` seul sinon. */
function brutStocke(contenu: Contenu): BrutStocke {
  if (contenu.forme === "objet") return { brut: contenu.brut, brut_sha256: empreinteDe(contenu.brut) };
  return { brut_texte: contenu.brut_texte };
}

/**
 * La requête telle qu'enregistrée : son corps, et ses en-têtes moins ceux d'authentification (seul
 * retrait autorisé). `sha256` couvre la forme canonique du corps seul.
 */
function requeteEnregistree(course: Course, horodatage: string): ReponseEcrite["requete"] {
  const { http, adaptateur } = course;
  return {
    corps: http.corps,
    entetes: entetesEnregistrables(http.entetes, adaptateur.entetes_authentification),
    sha256: empreinteDe(http.corps),
    endpoint: http.endpoint,
    horodatage,
  };
}

function commun(course: Course, horodatage_requete: string) {
  const { requete, contexte } = course;
  return {
    id: ulid(contexte.horloge.maintenant()),
    run_id: contexte.run_id,
    contexte: "run",
    canal: "api",
    alias_aveugle: requete.alias_aveugle,
    outil_id: requete.outil_id,
    mode: requete.mode,
    question_id: requete.question_id,
    formulation_id: requete.formulation_id,
    echantillon: requete.echantillon,
    requete: requeteEnregistree(course, horodatage_requete),
  } as const;
}

/** Une réponse classée obtenue, avec ses instants et les tentatives closes qui la précèdent. */
interface Obtenue {
  readonly contenu: Contenu;
  readonly refus_api: boolean;
  readonly brut_octets_sha256: string;
  readonly debut_ms: number;
  readonly fin_ms: number;
  readonly tentatives: readonly Tentative[];
}

function reponseObtenue(course: Course, fin: Obtenue): ReponseObtenue {
  const { adaptateur } = course;
  const renvoyees = adaptateur.metadonnees(fin.contenu);
  const tokens = renvoyees.tokens === undefined ? {} : { tokens: renvoyees.tokens };
  const tentatives = fin.tentatives.length === 0 ? {} : { tentatives: fin.tentatives };
  const premiere = fin.tentatives[0];
  return {
    ...commun(course, premiere === undefined ? instantParis(fin.debut_ms) : premiere.horodatage),
    statut_reponse: "obtenue",
    ...brutStocke(fin.contenu),
    brut_octets_sha256: fin.brut_octets_sha256,
    normalise: projection(adaptateur, fin.contenu, fin.refus_api),
    normalisation: adaptateur.normalisation,
    metadonnees: {
      modele_demande: course.requete.modele_demande,
      modele_renvoye: renvoyees.modele_renvoye,
      horodatage_requete: instantParis(fin.debut_ms),
      horodatage_reponse: instantParis(fin.fin_ms),
      latence_ms: fin.fin_ms - fin.debut_ms,
      stop_reason: renvoyees.stop_reason,
      parametres_effectifs: adaptateur.parametresEffectifs(course.http),
      ...tokens,
    },
    ...tentatives,
  };
}

/**
 * Une manquante sans aucune tentative n'a jamais été envoyée : son horodatage de requête est
 * l'instant où elle a été constituée et déclarée hors fenêtre (`motif_manquante`, schéma).
 */
function reponseManquante(course: Course, fin: Extract<Aboutissement, { genre: "manquante" }>): ReponseManquante {
  const premiere = fin.tentatives[0];
  const horodatage = premiere === undefined ? instantParis(course.contexte.horloge.maintenant()) : premiere.horodatage;
  return {
    ...commun(course, horodatage),
    statut_reponse: "manquante",
    motif_manquante: fin.motif,
    tentatives: fin.tentatives,
  };
}

/* ------------------------------------------------------------------- files */

type IssueRequete = "ecrite" | "deja_ecrite" | EnAttenteOperateur;

/**
 * Construit l'item public : `info.chemin_octets` est le nom relatif que porte le journal, résolu
 * ici en chemin complet (l'opérateur a besoin d'un chemin utilisable, le journal non — règle 2).
 */
function enAttente(
  requete: RequetePlanifiee,
  repertoire_tentatives: string,
  info: Pick<EnAttenteOperateur, "numero" | "cause"> & { readonly chemin_octets: string | null },
): EnAttenteOperateur {
  const chemin_octets = info.chemin_octets === null ? null : join(repertoire_tentatives, info.chemin_octets);
  // Champs nommés un à un : étaler `info` y recopierait le `genre` de l'appelant (« recue_non_stockee »).
  return { genre: "en_attente_operateur", requete: cleDe(requete), numero: info.numero, chemin_octets, cause: info.cause };
}

/**
 * Une réponse reçue et gardée avant un arrêt brutal, sans suite au journal (§6, 0.19) : la ligne est
 * conclue par `recue_non_stockee`, comme au chemin normal, et la requête attend l'opérateur. La
 * relance suivante relit cet événement : rien n'est renvoyé ni réinscrit.
 */
function conclureOctetsSansSuite(
  requete: RequetePlanifiee,
  journal: JournalRequete,
  repertoire_tentatives: string,
  reprise: Extract<Reprise, { genre: "octets_sans_suite" }>,
): EnAttenteOperateur {
  journal.inscrireRecueNonStockee(reprise.numero, reprise.chemin_octets, MESSAGE_OCTETS_SANS_SUITE);
  return enAttente(requete, repertoire_tentatives, { numero: reprise.numero, chemin_octets: reprise.chemin_octets, cause: MESSAGE_OCTETS_SANS_SUITE });
}

async function executerRequete(requete: RequetePlanifiee, editeur: Editeur, contexte: ContexteRun): Promise<IssueRequete> {
  if (contexte.depot.contient(requete)) return "deja_ecrite";
  const journal = new JournalRequete(contexte.repertoire_tentatives, cleDe(requete));
  const reprise = journal.reprise();
  if (reprise.genre === "recue_non_stockee") return enAttente(requete, contexte.repertoire_tentatives, reprise);
  if (reprise.genre === "octets_sans_suite") return conclureOctetsSansSuite(requete, journal, contexte.repertoire_tentatives, reprise);
  const course = courseDe(requete, editeur.adaptateur, journal, contexte);
  const fin = await poursuivre(course, editeur, contexte, reprise.tentatives);
  if (fin.genre === "recue_non_stockee") return enAttente(requete, contexte.repertoire_tentatives, fin);
  if (fin.genre === "manquante") contexte.depot.ecrire(reponseManquante(course, fin));
  return "ecrite";
}

async function executerFile(requetes: readonly RequetePlanifiee[], editeur: Editeur, contexte: ContexteRun): Promise<IssueRequete[]> {
  const issues: IssueRequete[] = [];
  for (const requete of requetes) issues.push(await executerRequete(requete, editeur, contexte));
  return issues;
}

function editeurDe(contexte: ContexteRun, outil_id: string): Editeur {
  const editeur = contexte.editeurs.get(outil_id);
  if (editeur === undefined) throw new Error(`Aucun éditeur pour l'outil ${outil_id} : il ne sera pas interrogé en silence.`);
  return editeur;
}

/** La première file arrêtée, dans l'ordre du plan ; sa raison telle quelle quand c'est une erreur. */
function premierRejet(resultats: readonly PromiseSettledResult<IssueRequete[]>[]): Error | null {
  const rejet = resultats.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejet === undefined) return null;
  const raison: unknown = rejet.reason;
  return raison instanceof Error ? raison : new Error(`File d'outil arrêtée : ${String(raison)}`);
}

function estEnAttente(issue: IssueRequete): issue is EnAttenteOperateur {
  return typeof issue !== "string";
}

export async function executerRun(plan: PlanInterrogation, contexte: ContexteRun): Promise<BilanExecution> {
  const maintenant = contexte.horloge.maintenant();
  if (maintenant < contexte.fenetre.debut_ms) throw new RunHorsFenetre(instantParis(maintenant), contexte.fenetre);
  const files = [...plan].map(([outil_id, requetes]) => ({ requetes, editeur: editeurDe(contexte, outil_id) }));
  mkdirSync(contexte.repertoire_tentatives, { recursive: true });
  const resultats = await Promise.allSettled(files.map((f) => executerFile(f.requetes, f.editeur, contexte)));
  const rejet = premierRejet(resultats);
  if (rejet !== null) throw rejet;
  const issues = resultats.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return {
    ecrites: issues.filter((i) => i === "ecrite").length,
    deja_ecrites: issues.filter((i) => i === "deja_ecrite").length,
    en_attente_operateur: issues.filter(estEnAttente),
  };
}
