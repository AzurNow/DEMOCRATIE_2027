/**
 * L'exécution de `pnpm reformuler` : pour chaque question à appeler, un appel au modèle, et pour
 * chaque réponse HTTP reçue, une proposition écrite dans `staging/formulations/` (D39, D42).
 *
 * Par appel :
 * 1. le prompt est rendu depuis `prompts/reformulation-1.0.1.md` (règle 6, `prompt.ts`) ;
 * 2. le transport envoie la requête, sous le délai d'abandon de la configuration
 *    (`delai_abandon_ms`) : l'envoi et la minuterie courent ensemble, le premier arrivé l'emporte
 *    et l'autre est annulé. Un échec de transport, ou un délai écoulé sans réponse (l'envoi est
 *    alors interrompu), n'écrit rien et compte comme échec de transport : seule une réponse HTTP
 *    reçue s'écrit (règle 7) ;
 * 3. les octets du corps sont gardés tels quels, avant toute lecture, sous
 *    `octets-recus/<question_id>/<id>.octets` (`staging.ts:garderOctetsRecus`, D55 (5), constat 24
 *    du 2026-10-17) ; leur empreinte est prise, puis le corps est lu tel quel — objet JSON dans
 *    `brut`, sinon texte UTF-8 dans `brut_texte` ;
 * 4. issue : statut hors 2xx ⇒ `echec_http`, rien contrôlé ; 2xx dont l'enveloppe ne donne pas le
 *    texte du modèle ⇒ `rejetee`, `corps_illisible` ; sinon le texte du modèle passe le contrôle
 *    déterministe (`controle.ts`) ⇒ `acceptee`, sortie recopiée, ou `rejetee` avec son motif ;
 * 5. la proposition est validée contre son schéma, puis écrite une fois.
 *
 * Une réponse reçue (donc payée) que le banc ne peut pas stocker — corps qui n'est pas de l'UTF-8
 * valide (`CorpsNonUtf8`), proposition hors schéma (`ErreurSchema`), toute autre erreur entre la
 * garde des octets et l'écriture — n'est pas réparée : aucune proposition n'est écrite, la cause est
 * consignée à côté des octets (`consignerNonStockee`) et signalée, et la commande passe à la question
 * suivante (même règle que l'interrogation, `recue_non_stockee`). À la relance, des octets gardés
 * sans proposition du même identifiant (`recuesNonStockees`) retirent la question des appels : elle
 * attend l'opérateur, jamais un second paiement.
 *
 * Le plafond borne le nombre d'envois, échecs de transport compris : atteint, la commande s'arrête
 * proprement et compte les questions restées sans appel.
 */

import { createHash } from "node:crypto";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { ulid } from "../../validation/domaine/ulid.ts";
import { ErreurReseau, lireContenu, type Contenu, type ReponseHttp, type RequeteHttp } from "../interrogation/editeur.ts";
import { instantParis } from "../interrogation/heure-paris.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import type { CandidatNomme } from "../questions/types.ts";
import { controlerSortie, SortieRejetee } from "./controle.ts";
import { variablesDuPrompt } from "./demande.ts";
import type { DemandeReformulation } from "./demande.ts";
import type { AdaptateurReformulation, EditeurReformulation } from "./editeur.ts";
import type { Tache } from "./entrees.ts";
import { rendrePrompt, VERSION_PROMPT_REFORMULATION } from "./prompt.ts";
import type { ClePromotion } from "./relecture.ts";
import { deciderReprise, type DecisionReprise, type EtatQuestion } from "./reprise.ts";
import { consignerNonStockee, ecrireProposition, garderOctetsRecus, lirePropositions, recuesNonStockees } from "./staging.ts";
import type { CorpsStocke, IssueProposition, MotifProposition, PropositionFormulation } from "./staging.ts";

export interface ContexteExecution {
  readonly editeur: EditeurReformulation;
  /** Le texte du prompt (`chargerPromptReformulation`), variables non remplacées. */
  readonly texte_prompt: string;
  /** Les candidats du périmètre, cherchés dans une Q-ATT par le contrôle. */
  readonly perimetre: readonly CandidatNomme[];
  /** `staging/formulations/`, ou un répertoire de test. */
  readonly staging: string;
  /** Nombre maximal d'envois ; `null` : aucun plafond (mode simulé seulement, décidé par la commande). */
  readonly plafond: number | null;
  readonly maintenant: () => number;
  /**
   * Délai d'abandon de chaque appel, en millisecondes (`config/reformulation.json`) ; `null` : aucun
   * délai (mode simulé seulement, sans réseau, décidé par la commande).
   */
  readonly delai_abandon_ms: number | null;
  /** L'attente de la minuterie, injectée : `horlogeSysteme.attendre` en réel, une attente simulée en test. */
  readonly attendre: Horloge["attendre"];
  /** Reçoit un message par échec de transport ou appel abandonné. */
  readonly signaler: (message: string) => void;
}

export interface Bilan {
  readonly appels: number;
  readonly acceptees: number;
  readonly rejetees: ReadonlyMap<MotifProposition, number>;
  readonly echecs_http: number;
  readonly echecs_transport: number;
  readonly sautees_deja_acceptees: number;
  readonly sautees_deja_validees: number;
  readonly non_appelees_plafond: number;
  /** Réponses reçues dans ce passage, octets gardés, sans proposition écrite. */
  readonly recues_non_stockees: number;
  /** Questions non appelées : une réponse déjà reçue n'a pas été stockée, elle attend l'opérateur. */
  readonly en_attente_operateur: number;
  /** Chemins écrits, dans l'ordre. */
  readonly ecrits: readonly string[];
}

/* ----------------------------------------------------------------- reprise */

export interface EtatReprise {
  /** `data/formulations/` : question_id → clé validée (empreinte, position affirmée), ou null. */
  readonly validee: (question_id: string) => ClePromotion | null;
  readonly refus: ReadonlySet<string>;
}

/** Une question dont une réponse reçue n'a pas été stockée : ses octets gardés, à examiner. */
export interface EnAttenteOperateur {
  readonly question_id: string;
  readonly octets: readonly string[];
}

export interface Triage {
  readonly a_appeler: readonly Tache[];
  readonly deja_acceptees: number;
  readonly deja_validees: number;
  readonly en_attente_operateur: readonly EnAttenteOperateur[];
}

function decisionPour(tache: Tache, staging: string, reprise: EtatReprise): DecisionReprise {
  const etat: EtatQuestion = {
    courante: tache,
    validee: reprise.validee(tache.question.id),
    propositions: lirePropositions(staging, tache.question.id),
    refus: reprise.refus,
  };
  return deciderReprise(etat);
}

/** Lit tout l'état de reprise avant le premier appel : un fichier illisible arrête tout ici. */
export function trier(taches: readonly Tache[], staging: string, reprise: EtatReprise): Triage {
  const decisions = taches.map((tache) => ({ tache, decision: decisionPour(tache, staging, reprise) }));
  const a_reprendre = decisions.filter((entree) => entree.decision === "a_appeler").map((entree) => entree.tache);
  const attentes = a_reprendre.map((tache) => ({ tache, octets: recuesNonStockees(staging, tache.question.id) }));
  return {
    a_appeler: attentes.filter((entree) => entree.octets.length === 0).map((entree) => entree.tache),
    deja_acceptees: decisions.filter((entree) => entree.decision === "deja_acceptee").length,
    deja_validees: decisions.filter((entree) => entree.decision === "deja_validee").length,
    en_attente_operateur: attentes
      .filter((entree) => entree.octets.length > 0)
      .map((entree) => ({ question_id: entree.tache.question.id, octets: entree.octets })),
  };
}

/* ------------------------------------------------------------------- issue */

function issueDuTexte(texte: string, demande: DemandeReformulation, perimetre: readonly CandidatNomme[]): IssueProposition {
  try {
    const sortie = controlerSortie(texte, demande, perimetre);
    return { statut: "acceptee", familier: sortie.familier, oriente: sortie.oriente };
  } catch (erreur) {
    if (erreur instanceof SortieRejetee) return { statut: "rejetee", motif: erreur.motif, detail: erreur.message };
    throw erreur;
  }
}

function estSucces(statut: number): boolean {
  return statut >= 200 && statut < 300;
}

function issueDe(statut: number, contenu: Contenu, demande: DemandeReformulation, contexte: ContexteExecution): IssueProposition {
  if (!estSucces(statut)) return { statut: "echec_http" };
  const lecture = contexte.editeur.adaptateur.texteDuModele(contenu);
  if (!lecture.lisible) return { statut: "rejetee", motif: "corps_illisible", detail: lecture.raison };
  return issueDuTexte(lecture.texte, demande, contexte.perimetre);
}

function corpsStocke(contenu: Contenu): CorpsStocke {
  return contenu.forme === "objet" ? { brut: contenu.brut } : { brut_texte: contenu.brut_texte };
}

/* ------------------------------------------------------------ proposition */

interface Reception {
  readonly reponse: ReponseHttp;
  readonly instant: number;
  /** L'identifiant de la proposition, et le nom des octets gardés. */
  readonly id: string;
}

function propositionDe(tache: Tache, reception: Reception, adaptateur: AdaptateurReformulation, contexte: ContexteExecution): PropositionFormulation {
  const brut_octets_sha256 = createHash("sha256").update(reception.reponse.corps).digest("hex");
  const contenu = lireContenu(reception.reponse);
  const { texte_neutre: _envoye_a_part, ...demande } = variablesDuPrompt(tache.demande);
  return {
    id: reception.id,
    question_id: tache.question.id,
    texte_neutre: tache.question.texte_neutre,
    empreinte_texte_neutre: sha256(tache.question.texte_neutre),
    version_gabarits: tache.question.version_gabarits,
    demande: { ...demande, gabarit: tache.demande.gabarit.code, position_affirmee: tache.demande.position_affirmee },
    production: { modele: adaptateur.modele, version_prompt: VERSION_PROMPT_REFORMULATION },
    appel: {
      date: instantParis(reception.instant),
      statut_http: reception.reponse.statut,
      brut_octets_sha256,
      ...corpsStocke(contenu),
    },
    issue: issueDe(reception.reponse.statut, contenu, tache.demande, contexte),
  };
}

/* ------------------------------------------------------------------ appels */

type IssueAppel =
  | { readonly genre: "ecrite"; readonly chemin: string; readonly issue: IssueProposition }
  | { readonly genre: "transport" }
  | { readonly genre: "non_stockee" };

type Envoi =
  | { readonly genre: "http"; readonly reponse: ReponseHttp }
  | { readonly genre: "transport"; readonly message: string }
  | { readonly genre: "delai"; readonly delai_ms: number }
  | { readonly genre: "abandonne" };

/**
 * L'envoi, ramené à une issue. Une fois l'envoi interrompu (minuterie écoulée), son rejet n'est plus
 * attendu par personne : il devient « abandonne ». Avant cela, toute erreur qui n'est pas un échec de
 * transport remonte telle quelle.
 */
function transporter(contexte: ContexteExecution, requete: RequeteHttp, signal: AbortSignal): Promise<Envoi> {
  return contexte.editeur.transport.envoyer(requete, signal).then(
    (reponse): Envoi => ({ genre: "http", reponse }),
    (erreur: unknown): Envoi => {
      if (signal.aborted) return { genre: "abandonne" };
      if (erreur instanceof ErreurReseau) return { genre: "transport", message: erreur.message };
      throw erreur;
    },
  );
}

/** L'envoi et la minuterie courent ensemble ; le premier arrivé l'emporte, l'autre est annulé. */
async function envoyerSousDelai(contexte: ContexteExecution, requete: RequeteHttp, delai_ms: number): Promise<Envoi> {
  const arretEnvoi = new AbortController();
  const arretMinuterie = new AbortController();
  const minuterie = contexte
    .attendre(delai_ms, arretMinuterie.signal)
    .then((issue): Envoi => (issue === "ecoulee" ? { genre: "delai", delai_ms } : { genre: "abandonne" }));
  try {
    return await Promise.race([transporter(contexte, requete, arretEnvoi.signal), minuterie]);
  } finally {
    arretMinuterie.abort();
    arretEnvoi.abort();
  }
}

function envoyer(contexte: ContexteExecution, requete: RequeteHttp): Promise<Envoi> {
  const delai = contexte.delai_abandon_ms;
  if (delai === null) return transporter(contexte, requete, new AbortController().signal);
  return envoyerSousDelai(contexte, requete, delai);
}

/** Le motif signalé d'un appel sans réponse HTTP, ou la réponse reçue. */
function issueEnvoi(envoi: Envoi): ReponseHttp | string {
  switch (envoi.genre) {
    case "http":
      return envoi.reponse;
    case "transport":
      return envoi.message;
    case "delai":
      return `Aucune réponse au bout de ${envoi.delai_ms} ms : appel abandonné.`;
    case "abandonne":
      throw new Error("Envoi abandonné sans minuterie écoulée : état impossible, la commande s'arrête.");
  }
}

async function recevoir(tache: Tache, contexte: ContexteExecution): Promise<Reception | null> {
  const requete = contexte.editeur.adaptateur.construireRequete(rendrePrompt(contexte.texte_prompt, variablesDuPrompt(tache.demande)));
  const issue = issueEnvoi(await envoyer(contexte, requete));
  if (typeof issue === "string") {
    contexte.signaler(`Question ${tache.question.id} : ${issue} Aucun fichier écrit.`);
    return null;
  }
  const instant = contexte.maintenant();
  return { reponse: issue, instant, id: ulid(instant) };
}

/** Lit, contrôle et écrit la proposition d'une réponse dont les octets sont déjà gardés. */
function stocker(tache: Tache, reception: Reception, contexte: ContexteExecution): IssueAppel {
  const proposition = propositionDe(tache, reception, contexte.editeur.adaptateur, contexte);
  return { genre: "ecrite", chemin: ecrireProposition(contexte.staging, proposition), issue: proposition.issue };
}

/**
 * La réponse est reçue et ses octets gardés, mais elle n'a pas pu être stockée : rien n'est réparé,
 * la cause est consignée à côté des octets et signalée (D55 (5)). La question attend l'opérateur.
 */
function signalerNonStockee(tache: Tache, reception: Reception, chemin_octets: string, erreur: unknown, contexte: ContexteExecution): IssueAppel {
  const cause = erreur instanceof Error ? `${erreur.name} : ${erreur.message}` : String(erreur);
  consignerNonStockee(contexte.staging, tache.question.id, reception.id, cause);
  contexte.signaler(
    `Question ${tache.question.id} : réponse HTTP ${reception.reponse.statut} reçue et non stockée (${cause}). ` +
      `Octets gardés tels quels sous ${chemin_octets} ; aucune proposition écrite, la question ne sera pas rappelée.`,
  );
  return { genre: "non_stockee" };
}

async function appeler(tache: Tache, contexte: ContexteExecution): Promise<IssueAppel> {
  const reception = await recevoir(tache, contexte);
  if (reception === null) return { genre: "transport" };
  const chemin_octets = garderOctetsRecus(contexte.staging, tache.question.id, reception.id, reception.reponse.corps);
  try {
    return stocker(tache, reception, contexte);
  } catch (erreur) {
    return signalerNonStockee(tache, reception, chemin_octets, erreur, contexte);
  }
}

/* ------------------------------------------------------------------- bilan */

interface Compteurs {
  appels: number;
  acceptees: number;
  readonly rejetees: Map<MotifProposition, number>;
  echecs_http: number;
  echecs_transport: number;
  recues_non_stockees: number;
  readonly ecrits: string[];
}

function compterIssue(compteurs: Compteurs, issue: IssueProposition): void {
  switch (issue.statut) {
    case "acceptee":
      compteurs.acceptees += 1;
      return;
    case "echec_http":
      compteurs.echecs_http += 1;
      return;
    case "rejetee": {
      const avant = compteurs.rejetees.get(issue.motif);
      compteurs.rejetees.set(issue.motif, avant === undefined ? 1 : avant + 1);
      return;
    }
  }
}

function compter(compteurs: Compteurs, issue: IssueAppel): void {
  compteurs.appels += 1;
  switch (issue.genre) {
    case "transport":
      compteurs.echecs_transport += 1;
      return;
    case "non_stockee":
      compteurs.recues_non_stockees += 1;
      return;
    case "ecrite":
      compteurs.ecrits.push(issue.chemin);
      compterIssue(compteurs, issue.issue);
  }
}

/** Ce que l'opérateur doit faire d'une question dont une réponse reçue n'a pas été stockée. */
function messageAttente(attente: EnAttenteOperateur): string {
  return (
    `Question ${attente.question_id} : non appelée, une réponse déjà reçue (et payée) n'a pas été stockée — ` +
    `octets gardés : ${attente.octets.join(", ")}. Action de l'opérateur requise : examiner ces octets et leur ` +
    `cause (.cause.txt à côté) ; pour autoriser un nouvel appel, déplacer ces fichiers hors du staging, à la main.`
  );
}

function plafondAtteint(compteurs: Compteurs, plafond: number | null): boolean {
  return plafond !== null && compteurs.appels >= plafond;
}

/** Appelle chaque question triée, dans l'ordre, jusqu'au plafond. */
export async function executer(triage: Triage, contexte: ContexteExecution): Promise<Bilan> {
  const compteurs: Compteurs = { appels: 0, acceptees: 0, rejetees: new Map(), echecs_http: 0, echecs_transport: 0, recues_non_stockees: 0, ecrits: [] };
  triage.en_attente_operateur.forEach((attente) => contexte.signaler(messageAttente(attente)));
  let rang = 0;
  for (const tache of triage.a_appeler) {
    if (plafondAtteint(compteurs, contexte.plafond)) break;
    compter(compteurs, await appeler(tache, contexte));
    rang += 1;
  }
  return {
    ...compteurs,
    sautees_deja_acceptees: triage.deja_acceptees,
    sautees_deja_validees: triage.deja_validees,
    non_appelees_plafond: triage.a_appeler.length - rang,
    en_attente_operateur: triage.en_attente_operateur.length,
  };
}
