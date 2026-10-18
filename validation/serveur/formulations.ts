/**
 * Routes de la relecture des formulations (décisions D39 et D42 de l'auteur du 2026-10-15).
 *
 * Quatre routes, déclarées dans la table de `routes.ts` :
 *
 * - `GET /api/formulations` : les questions qui ont une proposition relisible ;
 * - `GET /api/formulations/<question_id>` : la proposition à relire, ses trois textes tels quels ;
 * - `POST /api/formulations/promotions` : relecture favorable, les quatre cases cochées ⇒ écriture
 *   de `data/formulations/<question_id>.json` par le seul `io/data-formulations.ts` ;
 * - `POST /api/formulations/refus` : relecture défavorable, commentaire obligatoire ⇒ une ligne de
 *   plus dans le journal des refus.
 *
 * Le texte neutre courant de chaque question est recalculé à chaque requête, en engendrant les
 * questions depuis `data/items`, `data/mesures` et les candidats du périmètre (`pipeline/reformulation/entrees.ts`, comme `pnpm reformuler`), avec la position demandée sur l'item courant : une proposition faite
 * sur un texte neutre qui a changé depuis n'est ni montrée ni promue. Le serveur revérifie tout ce
 * que le client envoie : une case non cochée refuse la promotion, même si le client l'a demandée.
 *
 * L'écran ne montre ni le modèle qui a reformulé, ni le corps brut de sa réponse : le relecteur juge
 * le sens des textes, pas leur auteur.
 */

import { join } from "node:path";
import { MesureIntrouvable } from "../../pipeline/questions/engendrement.ts";
import { gabaritParCode, LibelleCandidatAbsent } from "../../pipeline/questions/gabarits.ts";
import type { Registre } from "../../pipeline/questions/types.ts";
import { REGISTRES } from "../../pipeline/questions/types.ts";
import { EntreeAbsente, lireDonnees, QuestionIncoherente, tachesDe, type Tache } from "../../pipeline/reformulation/entrees.ts";
import {
  casesNonCochees,
  clePromotion,
  formulationsValideesDe,
  InvariantsFormulationsEnDefaut,
  propositionRelisible,
  PropositionHorsQuestion,
  PropositionIncoherente,
  PropositionPerimee,
  questionsARelire,
  RefusSansCommentaire,
  RefusSansMotif,
  refusDe,
  type ARelire,
  type CasesRelecture,
  type ClePromotion,
  type PropositionAcceptee,
  type RefusFormulation,
} from "../../pipeline/reformulation/relecture.ts";
import { lirePropositions, StagingFormulationsIllisible, type PropositionFormulation } from "../../pipeline/reformulation/staging.ts";
import { ulid } from "../domaine/ulid.ts";
import { FichierModifieDepuisLecture } from "../io/data-items.ts";
import {
  FormulationsCreeesEntreTemps,
  FormulationsDejaPromues,
  FormulationValideeIllisible,
  lireFormulationsData,
  promouvoirFormulations,
  type FormulationsLues,
} from "../io/data-formulations.ts";
import { ajouterRefusFormulation, JournalRefusIllisible, lireRefusFormulations } from "../io/refus-formulations.ts";
import type { Configuration, Contexte } from "./contexte.ts";
import type { Reponse } from "./routes.ts";

/* ------------------------------------------------------------- données */

interface Donnees {
  /** Les questions engendrées et leur demande sur l'item courant (`entrees.ts`, partagé avec `pnpm reformuler`). */
  readonly taches: readonly Tache[];
  readonly propositions: readonly PropositionFormulation[];
  readonly refus: readonly RefusFormulation[];
  readonly data: ReadonlyMap<string, FormulationsLues>;
}

/** Tout est relu à chaque requête : un refus, une promotion ou une correction d'item se voient aussitôt. */
function charger(configuration: Configuration): Donnees {
  const refus = lireRefusFormulations(configuration.journal_refus_formulations);
  const data = lireFormulationsData(configuration.repertoire_formulations_data);
  const taches = tachesDe(
    lireDonnees({
      items: configuration.repertoire_data,
      mesures: configuration.repertoire_mesures_data,
      perimetre: configuration.fichier_perimetre,
    }),
  );
  const staging = join(configuration.racine_staging, "formulations");
  const propositions = taches.flatMap((tache) => lirePropositions(staging, tache.question.id));
  return { taches, propositions, refus, data };
}

/**
 * Erreurs nommées qui disent pourquoi rien ne peut être relu ni écrit : renvoyées telles quelles à
 * l'écran (409), jamais avalées. Toute autre erreur remonte au serveur (500) — `ErreurSchema`
 * comprise (constat 25, revue du 2026-10-17) : elle signale un bogue d'assemblage de ce code, pas
 * une donnée externe indisponible, et ne s'affiche donc pas comme telle.
 */
const ERREURS_DE_DONNEES: readonly (abstract new (...args: never[]) => Error)[] = [
  EntreeAbsente,
  QuestionIncoherente,
  LibelleCandidatAbsent,
  MesureIntrouvable,
  JournalRefusIllisible,
  StagingFormulationsIllisible,
  FormulationValideeIllisible,
  PropositionPerimee,
  FormulationsDejaPromues,
  FormulationsCreeesEntreTemps,
  FichierModifieDepuisLecture,
  PropositionHorsQuestion,
  PropositionIncoherente,
  InvariantsFormulationsEnDefaut,
];

function avecDonnees(contexte: Contexte, traiter: (donnees: Donnees) => Reponse): Reponse {
  try {
    return traiter(charger(contexte.configuration));
  } catch (erreur) {
    if (!ERREURS_DE_DONNEES.some((classe) => erreur instanceof classe)) throw erreur;
    const { name, message } = erreur as Error;
    return { statut: 409, corps: { ok: false, disponible: false, erreur: message, nature: name } };
  }
}

/* -------------------------------------------------------------- lecture */

function candidatAffiche(proposition: PropositionAcceptee): string | null {
  return gabaritParCode(proposition.demande.gabarit).nomme_candidat ? proposition.demande.libelle_candidat : null;
}

function resume(proposition: PropositionAcceptee) {
  return {
    question_id: proposition.question_id,
    gabarit: proposition.demande.gabarit,
    candidat: candidatAffiche(proposition),
    mesure: proposition.demande.formulation_mesure,
  };
}

function promues(data: ReadonlyMap<string, FormulationsLues>): ReadonlyMap<string, ClePromotion> {
  return new Map([...data].map(([question_id, lue]) => [question_id, clePromotion(lue.formulations)]));
}

function aRelire(donnees: Donnees): readonly ARelire[] {
  return questionsARelire(donnees.taches, donnees.propositions, donnees.refus, promues(donnees.data));
}

function liste(contexte: Contexte): Reponse {
  return avecDonnees(contexte, (donnees) => ({
    statut: 200,
    corps: { disponible: true, questions: aRelire(donnees).map((entree) => resume(entree.proposition)) },
  }));
}

interface Cible {
  readonly courante: Tache;
  readonly proposition: PropositionAcceptee;
}

function erreur(statut: number, message: string): { readonly erreur: Reponse } {
  return { erreur: { statut, corps: { ok: false, erreur: message } } };
}

/**
 * La question, et sa proposition relisible : acceptée, non refusée, sur le texte neutre courant et
 * la position demandée sur l'item courant (Q1, option (a)).
 */
function cibleDe(donnees: Donnees, question_id: string): Cible | { readonly erreur: Reponse } {
  const courante = donnees.taches.find((tache) => tache.question.id === question_id);
  if (courante === undefined) return erreur(404, `Question ${question_id} absente des questions engendrées depuis data/.`);
  const relisible = aRelire(donnees).find((entree) => entree.question.id === question_id);
  if (relisible !== undefined) return { courante, proposition: relisible.proposition };
  const refusees = new Set(donnees.refus.map((ligne) => ligne.proposition_id));
  if (propositionRelisible(courante, donnees.propositions, refusees) === null) {
    return erreur(404, `Question ${question_id} : aucune proposition acceptée, non refusée, sur le texte neutre et la position courants.`);
  }
  return erreur(409, `Question ${question_id} : déjà promue sur le texte neutre et la position courants.`);
}

/** Le texte de chaque registre, tel que la proposition le porte. */
function texteDe(proposition: PropositionAcceptee, registre: Registre): string {
  const textes: Readonly<Record<Registre, string>> = {
    neutre: proposition.texte_neutre,
    familier: proposition.issue.familier.texte,
    oriente: proposition.issue.oriente.texte,
  };
  return textes[registre];
}

function detail(contexte: Contexte, params: readonly string[]): Reponse {
  const question_id = params[0];
  if (question_id === undefined) return { statut: 404, corps: { erreur: "Question non précisée." } };
  return avecDonnees(contexte, (donnees) => {
    const cible = cibleDe(donnees, question_id);
    if ("erreur" in cible) return cible.erreur;
    const { proposition } = cible;
    return {
      statut: 200,
      corps: {
        ...resume(proposition),
        proposition_id: proposition.id,
        position_demandee: proposition.demande.position_affirmee,
        // Dans l'ordre du §5 : le client n'a pas à connaître la liste des registres.
        textes: REGISTRES.map((registre) => ({ registre, texte: texteDe(proposition, registre) })),
      },
    };
  });
}

/* --------------------------------------------------------------- requête */

interface RequeteRelecture {
  readonly question_id: string;
  readonly proposition_id: string;
  readonly cases: CasesRelecture;
  readonly commentaire: string;
}

type Brut = Readonly<Record<string, unknown>>;

function objet(valeur: unknown): Brut | null {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null;
}

/** Les trois cases « sens préservé », toutes présentes et booléennes : aucune n'a de valeur par défaut. */
function sensPreserve(valeur: unknown): Readonly<Record<Registre, boolean>> | null {
  const brut = objet(valeur);
  if (brut === null || !REGISTRES.every((registre) => typeof brut[registre] === "boolean")) return null;
  return { neutre: brut["neutre"] as boolean, familier: brut["familier"] as boolean, oriente: brut["oriente"] as boolean };
}

function textes(brut: Brut): { question_id: string; proposition_id: string; commentaire: string } | null {
  const { question_id, proposition_id, commentaire } = brut;
  if (typeof question_id !== "string" || typeof proposition_id !== "string" || typeof commentaire !== "string") return null;
  return { question_id, proposition_id, commentaire };
}

/** La requête complète, ou `null` : chaque champ est exigé, aucun n'est complété. */
function lireRequete(corps: unknown): RequeteRelecture | null {
  const brut = objet(corps);
  if (brut === null) return null;
  const champs = textes(brut);
  const sens = sensPreserve(brut["sens_preserve"]);
  const premisse = brut["premisse_conforme"];
  if (champs === null || sens === null || typeof premisse !== "boolean") return null;
  return { ...champs, cases: { sens_preserve: sens, premisse_conforme: premisse } };
}

const REQUETE_INCOMPLETE: Reponse = {
  statut: 400,
  corps: {
    ok: false,
    erreur:
      "Requête incomplète : question_id, proposition_id, commentaire (chaîne, vide permise pour une promotion), " +
      "sens_preserve.{neutre,familier,oriente} et premisse_conforme (booléens) sont exigés.",
  },
};

/** La cible, si la proposition relisible est bien celle que l'écran a montrée. */
function cibleDeLaRequete(donnees: Donnees, requete: RequeteRelecture): Cible | { readonly erreur: Reponse } {
  const cible = cibleDe(donnees, requete.question_id);
  if ("erreur" in cible) return cible;
  if (cible.proposition.id === requete.proposition_id) return cible;
  return erreur(
    409,
    `La proposition relisible de ${requete.question_id} est ${cible.proposition.id}, pas ${requete.proposition_id} : rouvrir la question.`,
  );
}

/* ------------------------------------------------------------- écritures */

function promouvoir(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const requete = lireRequete(corps);
  if (requete === null) return REQUETE_INCOMPLETE;
  const manquantes = casesNonCochees(requete.cases);
  if (manquantes.length > 0) {
    return { statut: 422, corps: { ok: false, erreur: `Promotion refusée : case(s) non cochée(s) : ${manquantes.join(", ")}.` } };
  }
  return avecDonnees(contexte, (donnees) => {
    const cible = cibleDeLaRequete(donnees, requete);
    if ("erreur" in cible) return cible.erreur;
    const commentaire = requete.commentaire.trim().length === 0 ? null : requete.commentaire;
    const relecture = { annotateur_id: contexte.annotateur_id, date: contexte.maintenant(), commentaire };
    const valeur = formulationsValideesDe(cible.courante, cible.proposition, requete.cases, relecture, ulid);
    promouvoirFormulations(contexte.configuration.repertoire_formulations_data, donnees.data.get(valeur.question_id), valeur);
    return { statut: 201, corps: { ok: true, question_id: valeur.question_id } };
  });
}

function refuser(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const requete = lireRequete(corps);
  if (requete === null) return REQUETE_INCOMPLETE;
  return avecDonnees(contexte, (donnees) => {
    const cible = cibleDeLaRequete(donnees, requete);
    if ("erreur" in cible) return cible.erreur;
    const relecteur = { annotateur_id: contexte.annotateur_id, date: contexte.maintenant() };
    let refus: RefusFormulation;
    try {
      refus = refusDe(cible.proposition, requete.cases, relecteur, requete.commentaire);
    } catch (echec) {
      if (echec instanceof RefusSansCommentaire || echec instanceof RefusSansMotif) {
        return { statut: 422, corps: { ok: false, erreur: echec.message } };
      }
      throw echec;
    }
    ajouterRefusFormulation(contexte.configuration.journal_refus_formulations, refus);
    return { statut: 201, corps: { ok: true, question_id: refus.question_id } };
  });
}

export const GESTIONNAIRES_FORMULATIONS = { liste, detail, promouvoir, refuser };
