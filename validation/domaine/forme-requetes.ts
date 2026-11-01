/**
 * Contrôles de **forme** partagés par les corps POST de `/api/decisions` et `/api/brouillon`
 * (`serveur/lecture-requetes.ts`, `io/brouillons.ts`) : une seule définition, la plus stricte
 * (revue du 2026-10-12, constat 12 : deux copies avaient divergé, la durée négative était refusée
 * pour le brouillon et laissée au domaine, en 422, pour la décision). Seule la forme est vérifiée ;
 * les valeurs d'énumération et la complétude de la grille restent au domaine.
 */

import { CLES_GRILLE } from "./grille.ts";

export type Objet = Readonly<Record<string, unknown>>;

const CLES_GRILLE_CONNUES = CLES_GRILLE as readonly string[];

export function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

export function champsInconnus(objet: Objet, connus: readonly string[], chemin: string): readonly string[] {
  return Object.keys(objet)
    .filter((cle) => !connus.includes(cle))
    .map((cle) => `${chemin}.${cle} : champ inconnu`);
}

/** Forme seule : chaque clé connue vaut un booléen ou `null` ; la complétude est au domaine. */
export function erreursGrille(valeur: unknown, chemin: string): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return [`${chemin} : un objet est attendu`];
  return [
    ...champsInconnus(valeur, CLES_GRILLE_CONNUES, chemin),
    ...CLES_GRILLE_CONNUES.filter((cle) => valeur[cle] !== undefined && typeof valeur[cle] !== "boolean" && valeur[cle] !== null).map(
      (cle) => `${chemin}.${cle} : un booléen ou null est attendu`,
    ),
  ];
}

export function erreursGrilleParEtat(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return ["reponses_par_etat : un objet est attendu"];
  return [
    ...champsInconnus(valeur, ["anterieur", "posterieur"], "reponses_par_etat"),
    ...erreursGrille(valeur["anterieur"], "reponses_par_etat.anterieur"),
    ...erreursGrille(valeur["posterieur"], "reponses_par_etat.posterieur"),
  ];
}

export function erreursQuestionsSpecifiques(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return ["questions_specifiques : un objet est attendu"];
  return Object.entries(valeur)
    .filter(([, bit]) => typeof bit !== "boolean")
    .map(([cle]) => `questions_specifiques.${cle} : un booléen est attendu`);
}

/** Une durée en millisecondes : un nombre fini, jamais négatif. */
export function erreurDuree(objet: Objet, cle: string): string | null {
  const valeur = objet[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 ? null : `${cle} : un nombre non négatif est attendu`;
}
