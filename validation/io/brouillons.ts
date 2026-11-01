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
import { ecrireParRenommage, type EcritureTemporaire } from "../../pipeline/run/ecriture.ts";
import {
  champsInconnus,
  erreurDuree,
  erreursGrille,
  erreursGrilleParEtat,
  erreursQuestionsSpecifiques,
  estObjet,
} from "../domaine/forme-requetes.ts";
import { erreurIdentifiant, erreurIdentifiantLot } from "../domaine/identifiant.ts";
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

/**
 * Seule la forme est vérifiée, par les contrôles partagés avec `/api/decisions`
 * (`domaine/forme-requetes.ts`) : un
 * brouillon n'est jamais écrit, et n'est plus jamais réinjecté dans le chronomètre à la lecture,
 * s'il ne la passe pas (revue du 2026-10-12, constat 12).
 */
export function erreursBrouillon(valeur: unknown): readonly string[] {
  if (!estObjet(valeur)) return ["le brouillon doit être un objet JSON"];
  const erreurs: string[] = [...champsInconnus(valeur, CHAMPS_BROUILLON, "brouillon")];
  const lot_id = erreurIdentifiantLot(valeur["lot_id"], "lot_id");
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
  erreurs.push(...erreursGrille(valeur["reponses"], "reponses"));
  erreurs.push(...erreursGrilleParEtat(valeur["reponses_par_etat"]));
  erreurs.push(...erreursQuestionsSpecifiques(valeur["questions_specifiques"]));
  return erreurs;
}

export class Brouillons {
  readonly #chemin: string;
  readonly #ecriture: EcritureTemporaire | undefined;

  /** `ecriture` n'est fourni que par les tests d'interruption ; la production écrit sur le disque. */
  constructor(racine: string, annotateur_id: string, ecriture?: EcritureTemporaire) {
    mkdirSync(resolve(racine), { recursive: true });
    this.#chemin = join(resolve(racine), `${annotateur_id}.json`);
    this.#ecriture = ecriture;
  }

  /**
   * Un brouillon stocké illisible (JSON tronqué par un arrêt brutal) ou mal formé n'est plus
   * réinjecté dans le chronomètre (revue du 2026-10-12, constat 12) : il est traité comme absent,
   * et signalé sur la console du serveur avec le nom du fichier. Le fichier n'est jamais supprimé
   * automatiquement : c'est la trace de ce qui a été écrit, à inspecter à la main. Un brouillon
   * est une aide de saisie, pas une donnée publiée : le perdre coûte une grille à ressaisir.
   */
  lire(): Brouillon | null {
    if (!existsSync(this.#chemin)) return null;
    const contenu = readFileSync(this.#chemin, "utf8").trim();
    if (contenu.length === 0) return null;
    const lu = this.#analyser(contenu);
    if (!lu.ok) {
      process.stderr.write(`Brouillon ignoré, ${lu.nature} (${this.#chemin}) : ${lu.erreurs.join("; ")}\n`);
      return null;
    }
    return lu.brouillon;
  }

  #analyser(contenu: string):
    | { readonly ok: true; readonly brouillon: Brouillon }
    | { readonly ok: false; readonly erreurs: readonly string[]; readonly nature: string } {
    let brut: unknown;
    try {
      brut = JSON.parse(contenu);
    } catch (erreur) {
      return { ok: false, erreurs: [erreur instanceof Error ? erreur.message : String(erreur)], nature: "JSON illisible" };
    }
    const erreurs = erreursBrouillon(brut);
    if (erreurs.length > 0) return { ok: false, erreurs, nature: "mal formé" };
    return { ok: true, brouillon: brut as Brouillon };
  }

  /**
   * Par renommage (temporaire, synchronisation, renommage) : un arrêt brutal laisse l'ancien
   * brouillon ou le nouveau, jamais un fichier tronqué. Le suffixe porte le pid : le temporaire
   * d'un processus tué ne bloque pas le serveur suivant (`TemporaireOrphelin` ne vise que le même
   * processus, qui nettoie le sien).
   */
  ecrire(brouillon: Brouillon): void {
    ecrireParRenommage(this.#chemin, brouillon, `brouillon-${process.pid}`, this.#ecriture);
  }

  effacer(): void {
    if (existsSync(this.#chemin)) writeFileSync(this.#chemin, "", "utf8");
  }
}
