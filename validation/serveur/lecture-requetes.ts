/**
 * Lecteurs des corps POST de `/api/decisions` et `/api/annulations`, sur le modèle de
 * `notation-humaine/serveur/saisie.ts` : seule la **forme** est vérifiée ici (présence, types,
 * identifiants sans séparateur de chemin). Les valeurs d'énumération, la complétude de la
 * grille et le test verbatim restent ceux du domaine (`domaine/decision.ts`,
 * `domaine/corrections.ts`), qui répond 422 avec ses propres motifs. Un corps qui ne passe pas
 * ce lecteur n'est jamais écrit : 400, la liste des champs en cause, sans aucune valeur par
 * défaut (revue du 2026-10-12, constat 12 : `corps as Partial<RequeteDecision>` puis
 * `requete.lot_id ?? ""` transformait un corps vide en `TypeError` ou en « lot inconnu »).
 */

import { erreurIdentifiant, erreurIdentifiantLot } from "../domaine/identifiant.ts";
import type { SoumissionDecision } from "../domaine/decision.ts";
import {
  champsInconnus,
  erreurDuree,
  erreursGrille,
  erreursGrilleParEtat,
  erreursQuestionsSpecifiques,
  estObjet,
  type Objet,
} from "../domaine/forme-requetes.ts";

export type Lecture<T> =
  | { readonly ok: true; readonly requete: T }
  | { readonly ok: false; readonly erreurs: readonly string[] };

function exigerChaine(objet: Objet, cle: string, chemin: string): readonly string[] {
  return typeof objet[cle] === "string" ? [] : [`${chemin}.${cle} : une chaîne est attendue`];
}

/** Une absence s'écrit en omettant le champ : null n'est pas une valeur admise. */
function chaineSiPresente(objet: Objet, cle: string, chemin: string): readonly string[] {
  if (objet[cle] === undefined) return [];
  return typeof objet[cle] === "string" ? [] : [`${chemin}.${cle} : une chaîne est attendue (champ omis s'il est absent)`];
}

function chaineOuNulleSiPresente(objet: Objet, cle: string, chemin: string): readonly string[] {
  if (objet[cle] === undefined || objet[cle] === null) return [];
  return typeof objet[cle] === "string" ? [] : [`${chemin}.${cle} : une chaîne ou null est attendue`];
}

/* --------------------------------------------------------------- corrections */

/** Seule la forme de chaque correction est vérifiée : `cible` et `chemin` typés, rien d'autre — le
 * reste (chemin autorisé, test verbatim, empreintes) est le travail de `domaine/corrections.ts`. */
function erreursCorrection(correction: unknown, rang: number): readonly string[] {
  const chemin = `corrections[${rang}]`;
  if (!estObjet(correction)) return [`${chemin} : un objet est attendu`];
  const erreurs: string[] = [];
  if (correction["cible"] !== "item" && correction["cible"] !== "mesure") {
    erreurs.push(`${chemin}.cible : "item" ou "mesure" est attendu`);
  }
  if (typeof correction["chemin"] !== "string") erreurs.push(`${chemin}.chemin : une chaîne est attendue`);
  return erreurs;
}

function erreursCorrections(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!Array.isArray(valeur)) return ["corrections : une liste est attendue"];
  return valeur.flatMap((correction, rang) => erreursCorrection(correction, rang));
}

/* -------------------------------------------------------------- /api/decisions */

export const CHAMPS_DECISION = [
  "lot_id",
  "item_id",
  "decision",
  "motif_rejet",
  "reponses_grille",
  "reponses_par_etat",
  "questions_specifiques",
  "corrections",
  "commentaire",
  "duree_affichage_ms",
  "duree_active_ms",
] as const;

export interface RequeteDecisionLue extends SoumissionDecision {
  readonly lot_id: string;
}

function erreursRequeteDecision(corps: Objet): readonly string[] {
  const erreurs: string[] = [...champsInconnus(corps, CHAMPS_DECISION, "corps")];
  const lot_id = erreurIdentifiantLot(corps["lot_id"], "lot_id");
  if (lot_id !== null) erreurs.push(lot_id);
  const item_id = erreurIdentifiant(corps["item_id"], "item_id");
  if (item_id !== null) erreurs.push(item_id);
  erreurs.push(...exigerChaine(corps, "decision", "corps"));
  erreurs.push(...chaineSiPresente(corps, "motif_rejet", "corps"));
  erreurs.push(...erreursGrille(corps["reponses_grille"], "reponses_grille"));
  erreurs.push(...erreursGrilleParEtat(corps["reponses_par_etat"]));
  erreurs.push(...erreursQuestionsSpecifiques(corps["questions_specifiques"]));
  erreurs.push(...erreursCorrections(corps["corrections"]));
  erreurs.push(...chaineOuNulleSiPresente(corps, "commentaire", "corps"));
  const dureeAffichage = erreurDuree(corps, "duree_affichage_ms");
  if (dureeAffichage !== null) erreurs.push(dureeAffichage);
  const dureeActive = erreurDuree(corps, "duree_active_ms");
  if (dureeActive !== null) erreurs.push(dureeActive);
  return erreurs;
}

export function lireRequeteDecision(corps: unknown): Lecture<RequeteDecisionLue> {
  if (!estObjet(corps)) return { ok: false, erreurs: ["le corps de la requête doit être un objet JSON"] };
  const erreurs = erreursRequeteDecision(corps);
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, requete: corps as unknown as RequeteDecisionLue };
}

/* ----------------------------------------------------------- /api/annulations */

const CHAMPS_ANNULATION = ["lot_id", "commentaire"] as const;

export interface RequeteAnnulationLue {
  readonly lot_id: string;
  readonly commentaire?: string | null;
}

function erreursRequeteAnnulation(corps: Objet): readonly string[] {
  const erreurs: string[] = [...champsInconnus(corps, CHAMPS_ANNULATION, "corps")];
  const lot_id = erreurIdentifiantLot(corps["lot_id"], "lot_id");
  if (lot_id !== null) erreurs.push(lot_id);
  erreurs.push(...chaineOuNulleSiPresente(corps, "commentaire", "corps"));
  return erreurs;
}

export function lireRequeteAnnulation(corps: unknown): Lecture<RequeteAnnulationLue> {
  if (!estObjet(corps)) return { ok: false, erreurs: ["le corps de la requête doit être un objet JSON"] };
  const erreurs = erreursRequeteAnnulation(corps);
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, requete: corps as unknown as RequeteAnnulationLue };
}
