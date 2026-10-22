/**
 * Brouillons de saisie : la grille à moitié remplie au moment où l'annotateur ferme la fenêtre.
 *
 * Un brouillon n'est pas une décision. Il est donc **hors** du journal append-only, écrasable,
 * hors dépôt et hors publication. Les mélanger reviendrait à publier des hésitations comme des
 * actes, et à faire perdre au journal sa propriété la plus utile : chaque ligne est une
 * décision que quelqu'un a prise.
 *
 * Perdre un brouillon coûte une grille à ressaisir ; perdre une décision coûte le lot.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { erreurIdentifiant } from "../domaine/identifiant.ts";
import { CLES_GRILLE } from "../domaine/grille.ts";
import type { Grille, QuestionsSpecifiques } from "../domaine/types.ts";

export interface Brouillon {
  readonly item_id: string;
  readonly lot_id: string;
  /** Réponses déjà données. Une question absente est une question non répondue. */
  readonly reponses?: Partial<Grille>;
  readonly reponses_par_etat?: {
    readonly anterieur?: Partial<Grille>;
    readonly posterieur?: Partial<Grille>;
  };
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly commentaire?: string;
  /** Millisecondes déjà passées sur cet item avant la fermeture de la fenêtre. */
  readonly duree_affichage_ms: number;
  readonly duree_active_ms: number;
}

type Objet = Readonly<Record<string, unknown>>;

const CHAMPS_BROUILLON = [
  "item_id",
  "lot_id",
  "reponses",
  "reponses_par_etat",
  "questions_specifiques",
  "commentaire",
  "duree_affichage_ms",
  "duree_active_ms",
] as const;
const CLES_GRILLE_CONNUES = CLES_GRILLE as readonly string[];

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function champsInconnus(objet: Objet, connus: readonly string[], chemin: string): readonly string[] {
  return Object.keys(objet)
    .filter((cle) => !connus.includes(cle))
    .map((cle) => `${chemin}.${cle} : champ inconnu`);
}

/** Forme seule, comme `reponses_grille` d'une décision : un booléen ou `null` par clé connue. */
function erreursGrillePartielle(valeur: unknown, chemin: string): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return [`${chemin} : un objet est attendu`];
  return [
    ...champsInconnus(valeur, CLES_GRILLE_CONNUES, chemin),
    ...CLES_GRILLE_CONNUES.filter((cle) => valeur[cle] !== undefined && typeof valeur[cle] !== "boolean" && valeur[cle] !== null).map(
      (cle) => `${chemin}.${cle} : un booléen ou null est attendu`,
    ),
  ];
}

function erreursReponsesParEtat(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return ["reponses_par_etat : un objet est attendu"];
  return [
    ...champsInconnus(valeur, ["anterieur", "posterieur"], "reponses_par_etat"),
    ...erreursGrillePartielle(valeur["anterieur"], "reponses_par_etat.anterieur"),
    ...erreursGrillePartielle(valeur["posterieur"], "reponses_par_etat.posterieur"),
  ];
}

function erreursQuestionsSpecifiques(valeur: unknown): readonly string[] {
  if (valeur === undefined) return [];
  if (!estObjet(valeur)) return ["questions_specifiques : un objet est attendu"];
  return Object.entries(valeur)
    .filter(([, bit]) => typeof bit !== "boolean")
    .map(([cle]) => `questions_specifiques.${cle} : un booléen est attendu`);
}

function erreurDuree(objet: Objet, cle: string): string | null {
  const valeur = objet[cle];
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 ? null : `${cle} : un nombre non négatif est attendu`;
}

/**
 * Seule la forme est vérifiée, comme pour `/api/decisions` (`serveur/lecture-requetes.ts`) : un
 * brouillon n'est jamais écrit, et n'est plus jamais réinjecté dans le chronomètre à la lecture,
 * s'il ne la passe pas (revue du 2026-10-12, constat 12).
 */
export function erreursBrouillon(valeur: unknown): readonly string[] {
  if (!estObjet(valeur)) return ["le brouillon doit être un objet JSON"];
  const erreurs: string[] = [...champsInconnus(valeur, CHAMPS_BROUILLON, "brouillon")];
  const lot_id = erreurIdentifiant(valeur["lot_id"], "lot_id");
  if (lot_id !== null) erreurs.push(lot_id);
  const item_id = erreurIdentifiant(valeur["item_id"], "item_id");
  if (item_id !== null) erreurs.push(item_id);
  if (valeur["commentaire"] !== undefined && typeof valeur["commentaire"] !== "string") {
    erreurs.push("commentaire : une chaîne est attendue");
  }
  const dureeAffichage = erreurDuree(valeur, "duree_affichage_ms");
  if (dureeAffichage !== null) erreurs.push(dureeAffichage);
  const dureeActive = erreurDuree(valeur, "duree_active_ms");
  if (dureeActive !== null) erreurs.push(dureeActive);
  erreurs.push(...erreursGrillePartielle(valeur["reponses"], "reponses"));
  erreurs.push(...erreursReponsesParEtat(valeur["reponses_par_etat"]));
  erreurs.push(...erreursQuestionsSpecifiques(valeur["questions_specifiques"]));
  return erreurs;
}

export class Brouillons {
  readonly #chemin: string;

  constructor(racine: string, annotateur_id: string) {
    mkdirSync(resolve(racine), { recursive: true });
    this.#chemin = join(resolve(racine), `${annotateur_id}.json`);
  }

  /**
   * Un brouillon stocké mal formé n'est plus réinjecté dans le chronomètre (revue du 2026-10-12,
   * constat 12) : il est traité comme absent, et signalé sur la console du serveur avec le nom du
   * fichier. Le fichier n'est jamais supprimé automatiquement : c'est la trace de ce qui a été
   * écrit, à inspecter à la main.
   */
  lire(): Brouillon | null {
    if (!existsSync(this.#chemin)) return null;
    const contenu = readFileSync(this.#chemin, "utf8").trim();
    if (contenu.length === 0) return null;
    const brut = JSON.parse(contenu);
    const erreurs = erreursBrouillon(brut);
    if (erreurs.length > 0) {
      process.stderr.write(`Brouillon ignoré, mal formé (${this.#chemin}) : ${erreurs.join("; ")}\n`);
      return null;
    }
    return brut as Brouillon;
  }

  ecrire(brouillon: Brouillon): void {
    writeFileSync(this.#chemin, `${JSON.stringify(brouillon)}\n`, "utf8");
  }

  effacer(): void {
    if (existsSync(this.#chemin)) writeFileSync(this.#chemin, "", "utf8");
  }
}
