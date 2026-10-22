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

import { erreurIdentifiant } from "../domaine/identifiant.ts";
import type { SoumissionDecision } from "../domaine/decision.ts";
import { CLES_GRILLE } from "../domaine/grille.ts";

export type Lecture<T> =
  | { readonly ok: true; readonly requete: T }
  | { readonly ok: false; readonly erreurs: readonly string[] };

type Objet = Readonly<Record<string, unknown>>;

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function champsInconnus(objet: Objet, connus: readonly string[], chemin: string): readonly string[] {
  return Object.keys(objet)
    .filter((cle) => !connus.includes(cle))
    .map((cle) => `${chemin}.${cle} : champ inconnu`);
}

function exigerChaine(objet: Objet, cle: string, chemin: string): readonly string[] {
  return typeof objet[cle] === "string" ? [] : [`${chemin}.${cle} : une chaîne est attendue`];
}

function chaineOuNulleSiPresente(objet: Objet, cle: string, chemin: string): readonly string[] {
  if (objet[cle] === undefined || objet[cle] === null) return [];
  return typeof objet[cle] === "string" ? [] : [`${chemin}.${cle} : une chaîne ou null est attendue`];
}

function erreurDuree(objet: Objet, cle: string): string | null {
  const valeur = objet[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) ? null : `${cle} : un nombre est attendu`;
}

/* ------------------------------------------------------------------ grille */

const CLES_GRILLE_CONNUES = CLES_GRILLE as readonly string[];

/** Forme seule : chaque clé connue vaut un booléen ou `null` ; la complétude est au domaine. */
function erreursGrille(valeur: unknown, chemin: string): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return [`${chemin} : un objet est attendu`];
  return [
    ...champsInconnus(valeur, CLES_GRILLE_CONNUES, chemin),
    ...CLES_GRILLE_CONNUES.filter((cle) => valeur[cle] !== undefined && typeof valeur[cle] !== "boolean" && valeur[cle] !== null).map(
      (cle) => `${chemin}.${cle} : un booléen ou null est attendu`,
    ),
  ];
}

function erreursGrilleParEtat(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return ["reponses_par_etat : un objet est attendu"];
  return [
    ...champsInconnus(valeur, ["anterieur", "posterieur"], "reponses_par_etat"),
    ...erreursGrille(valeur["anterieur"], "reponses_par_etat.anterieur"),
    ...erreursGrille(valeur["posterieur"], "reponses_par_etat.posterieur"),
  ];
}

function erreursQuestionsSpecifiques(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return ["questions_specifiques : un objet est attendu"];
  return Object.entries(valeur)
    .filter(([, bit]) => typeof bit !== "boolean")
    .map(([cle]) => `questions_specifiques.${cle} : un booléen est attendu`);
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

const CHAMPS_DECISION = [
  "lot_id",
  "item_id",
  "decision",
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
  const lot_id = erreurIdentifiant(corps["lot_id"], "lot_id");
  if (lot_id !== null) erreurs.push(lot_id);
  const item_id = erreurIdentifiant(corps["item_id"], "item_id");
  if (item_id !== null) erreurs.push(item_id);
  erreurs.push(...exigerChaine(corps, "decision", "corps"));
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
  const lot_id = erreurIdentifiant(corps["lot_id"], "lot_id");
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
