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
 * Réponse reçue, non stockée (§6, D55 (5)) : dès qu'une réponse HTTP est reçue, ses octets sont
 * gardés sous `volume/` avant toute interprétation (`journal.ts:garderOctets`). Si le décodage
 * (UTF-8, forme JSON attendue), la normalisation ou l'écriture de la réponse structurée échoue
 * ensuite, ce n'est pas une tentative de l'outil : le journal reçoit un événement
 * `recue_non_stockee` qui conclut la ligne, aucune réponse n'est écrite, et la requête n'est plus
 * jamais retentée — elle attend l'opérateur. Les autres requêtes, du même outil ou d'un autre,
 * continuent normalement. Si `garderOctets` échoue lui-même (collision, erreur disque), la réponse
 * est pourtant bien reçue : `garderOctetsOuSignaler` tente d'inscrire `recue_non_stockee` sans
 * octets (`chemin_octets: null`) avant de relever l'erreur d'origine, pour que la file s'arrête
 * bruyamment comme avant — mais sans jamais renvoyer cette requête à la relance.
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
import { entetesEnregistrables, type Adaptateur, type Contenu, type Editeur, type RequeteHttp } from "./editeur.ts";
import { tentativePeutDemarrer, type Fenetre } from "./fenetre.ts";
import { instantParis } from "./heure-paris.ts";
import type { Horloge } from "./horloge.ts";
import { JournalRequete } from "./journal.ts";
import type { PlanInterrogation } from "./plan.ts";
import type { DepotReponses } from "./stockage.ts";
import { conclure, envoyerSousDelai } from "./tentatives.ts";
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
interface Course {
  readonly requete: RequetePlanifiee;
  readonly http: RequeteHttp;
  readonly editeur: Editeur;
  readonly journal: JournalRequete;
  readonly contexte: ContexteRun;
}

/** Ce qu'une réponse reçue, mais que le banc n'a pas pu stocker, porte pour l'opérateur. */
interface RecueNonStockee {
  readonly genre: "recue_non_stockee";
  readonly numero: number;
  readonly chemin_octets: string;
  readonly cause: string;
}

type Aboutissement =
  | {
      readonly genre: "obtenue";
      readonly numero: number;
      readonly chemin_octets: string;
      readonly tentatives: readonly Tentative[];
      readonly contenu: Contenu;
      readonly refus_api: boolean;
      readonly brut_octets_sha256: string;
      readonly debut_ms: number;
      readonly fin_ms: number;
    }
  | { readonly genre: "manquante"; readonly motif: MotifManquante; readonly tentatives: readonly Tentative[] }
  | RecueNonStockee;

type Essai =
  | {
      readonly genre: "obtenue";
      readonly numero: number;
      readonly chemin_octets: string;
      readonly contenu: Contenu;
      readonly refus_api: boolean;
      readonly brut_octets_sha256: string;
      readonly debut_ms: number;
      readonly fin_ms: number;
    }
  | { readonly genre: "echec"; readonly tentative: Tentative }
  | RecueNonStockee;

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
 * Garde les octets reçus ; si la garde elle-même échoue (collision, erreur disque), la réponse a
 * pourtant été reçue : une inscription `recue_non_stockee` sans octets est tentée avant de relever
 * l'erreur d'origine, pour que la file s'arrête bruyamment comme avant (§6, D55 (5)). Si cette
 * inscription échoue à son tour, l'erreur d'origine remonte seule — limite connue, documentée en
 * tête de `journal.ts`.
 */
function garderOctetsOuSignaler(numero: number, course: Course, octets: Uint8Array): string {
  try {
    return course.journal.garderOctets(numero, octets);
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
 * Classe l'envoi reçu (`conclure`, `tentatives.ts`). Si la classification elle-même échoue
 * (décodage non UTF-8, forme inattendue) après qu'un corps a été reçu, les octets déjà gardés
 * (`chemin_octets`) permettent de conclure la ligne par `recue_non_stockee` plutôt que de laisser
 * remonter l'erreur (§6, D55 (5)). Une erreur avant toute réception (`chemin_octets` nul) reste une
 * incohérence de programme, non rattrapée ici.
 */
async function tenter(numero: number, course: Course): Promise<Essai> {
  const { horloge } = course.contexte;
  const debut_ms = horloge.maintenant();
  const horodatage = instantParis(debut_ms);
  course.journal.inscrireDebut(numero, horodatage, cleDe(course.requete));
  const envoi = await envoyerSousDelai(course.editeur, course.http, horloge);
  const chemin_octets = envoi.genre === "http" ? garderOctetsOuSignaler(numero, course, envoi.reponse.corps) : null;
  try {
    const conclusion = conclure(envoi, course.editeur.adaptateur);
    if (conclusion.genre === "echec") {
      course.journal.inscrireEchec(numero, conclusion.erreur);
      return { genre: "echec", tentative: { numero, horodatage, erreur: conclusion.erreur } };
    }
    // `chemin_octets` est non nul ici : seul un envoi "http" conclut "obtenue" (`conclureHttp`).
    return { ...conclusion, debut_ms, fin_ms: horloge.maintenant(), numero, chemin_octets: chemin_octets as string };
  } catch (erreur) {
    if (chemin_octets === null) throw erreur;
    const cause = causeDe(erreur);
    course.journal.inscrireRecueNonStockee(numero, chemin_octets, cause);
    return { genre: "recue_non_stockee", numero, chemin_octets, cause };
  }
}

async function poursuivre(course: Course, passees: readonly Tentative[]): Promise<Aboutissement> {
  const tentatives = [...passees];
  while (tentatives.length < TENTATIVES_MAX) {
    const numero = tentatives.length + 1;
    if (!(await attendreSonTour(numero, course.contexte))) return { genre: "manquante", motif: "hors_fenetre", tentatives };
    const essai = await tenter(numero, course);
    if (essai.genre === "obtenue") return { ...essai, tentatives };
    if (essai.genre === "recue_non_stockee") return essai;
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
  const { http, editeur } = course;
  return {
    corps: http.corps,
    entetes: entetesEnregistrables(http.entetes, editeur.adaptateur.entetes_authentification),
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

function reponseObtenue(course: Course, fin: Extract<Aboutissement, { genre: "obtenue" }>): ReponseObtenue {
  const { adaptateur } = course.editeur;
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
  return { genre: "en_attente_operateur", requete: cleDe(requete), ...info, chemin_octets };
}

/**
 * Écrit la réponse obtenue. Si l'écriture échoue (normalisation en échec, schéma refusé, écriture
 * de la réponse structurée en échec), les octets reçus à la tentative `fin.numero` sont déjà
 * gardés : la ligne ouverte par `inscrireDebut` est conclue par `recue_non_stockee` plutôt que
 * d'arrêter la file (§6, D55 (5)).
 */
function ecrireObtenue(course: Course, fin: Extract<Aboutissement, { genre: "obtenue" }>): IssueRequete {
  try {
    course.contexte.depot.ecrire(reponseObtenue(course, fin));
    return "ecrite";
  } catch (erreur) {
    const cause = causeDe(erreur);
    course.journal.inscrireRecueNonStockee(fin.numero, fin.chemin_octets, cause);
    return enAttente(course.requete, course.contexte.repertoire_tentatives, { numero: fin.numero, chemin_octets: fin.chemin_octets, cause });
  }
}

async function executerRequete(requete: RequetePlanifiee, editeur: Editeur, contexte: ContexteRun): Promise<IssueRequete> {
  if (contexte.depot.contient(requete)) return "deja_ecrite";
  const journal = new JournalRequete(contexte.repertoire_tentatives, cleDe(requete));
  const reprise = journal.reprise();
  if (reprise.genre === "recue_non_stockee") return enAttente(requete, contexte.repertoire_tentatives, reprise);
  const http = editeur.adaptateur.construireRequete({
    texte: requete.texte,
    mode: requete.mode,
    modele_demande: requete.modele_demande,
  });
  const course: Course = { requete, http, editeur, journal, contexte };
  const fin = await poursuivre(course, reprise.tentatives);
  if (fin.genre === "recue_non_stockee") return enAttente(requete, contexte.repertoire_tentatives, fin);
  if (fin.genre === "manquante") {
    contexte.depot.ecrire(reponseManquante(course, fin));
    return "ecrite";
  }
  return ecrireObtenue(course, fin);
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
