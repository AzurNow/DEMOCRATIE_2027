/**
 * « La réponse ou l'item nomme au moins un candidat » : l'éligibilité au sous-ensemble du test
 * contrefactuel (décision D14 (2) de l'auteur du 2026-10-05, texte proposé pour la 0.16 : « Les
 * permutations sont un dérangement des candidats du run […] appliqué par remplacement exact du
 * libellé et du nom seul déclarés au périmètre ; les 200 réponses sont tirées parmi celles dont la
 * réponse ou l'item nomme au moins un candidat. »).
 *
 * Le prédicat (`permutation.ts:nommeUnInterroge`) et le remplacement de la PR B lisent la même
 * fonction, `occurrencesDeNom` : une réponse est éligible exactement quand la permutation y trouvera
 * quelque chose à permuter.
 *
 * Trois lectures de « remplacement exact », que le protocole ne précise pas, toutes restrictives :
 *
 * - **Casse exacte.** « MARTINEZ » ne nomme pas un candidat déclaré « Martinez ». Ignorer la casse
 *   serait un rapprochement, et la PR B devrait alors réécrire la casse du remplaçant.
 * - **Mot entier.** Une occurrence n'est retenue que si le caractère qui la précède et celui qui la
 *   suit ne sont ni une lettre, ni un chiffre, ni une marque combinante (`\p{L}`, `\p{N}`, `\p{M}`).
 *   « Martinezville » ne nomme pas Martinez : le remplacer fabriquerait un lieu qui n'existe pas.
 *   Une apostrophe, droite ou typographique (« d’Hollande »), un tiret ou une ponctuation bordent un
 *   mot : le nom qui suit est trouvé.
 * - **Aucune normalisation.** Le texte est lu tel quel, sans la normalisation du test verbatim : un
 *   remplacement se fait dans le texte, pas dans sa forme normalisée.
 *
 * Les textes de l'item sont la paraphrase et la citation de chacun de ses états positionnels
 * (l'assertion d'un item P, les deux états d'un item O) ; un item A ou F n'en porte aucun.
 */

import type { Item } from "../../validation/domaine/types.ts";
import { etatsPositionnels } from "./etats.ts";

/** Ce que le périmètre déclare d'un candidat (`run.perimetre.candidats[]`) et que le prédicat lit. */
export interface NomsDeCandidat {
  readonly libelle: string;
  readonly nom: string;
}

export interface Occurrence {
  /** Intervalle semi-ouvert [debut, fin), en unités UTF-16 du texte reçu. */
  readonly debut: number;
  readonly fin: number;
}

const CARACTERE_DE_MOT = /[\p{L}\p{N}\p{M}]/u;

/** Toutes les occurrences en mot entier de `nom` dans `texte`, casse exacte. */
export function occurrencesDeNom(texte: string, nom: string): readonly Occurrence[] {
  if (nom.trim().length === 0) throw new Error("Nom de candidat vide ou blanc : il nommerait n'importe quel texte.");
  const trouvees: Occurrence[] = [];
  let position = texte.indexOf(nom);
  while (position >= 0) {
    const fin = position + nom.length;
    if (estBordeeDeMot(texte, position, fin)) trouvees.push({ debut: position, fin });
    position = texte.indexOf(nom, position + 1);
  }
  return trouvees;
}

/** Les textes où chercher un nom : la réponse projetée, puis ceux de chaque item. */
export function textesNommables(texteReponse: string, items: readonly Item[]): readonly string[] {
  return [texteReponse, ...items.flatMap(textesDeLItem)];
}

function textesDeLItem(item: Item): readonly string[] {
  return etatsPositionnels(item).flatMap((etat) => [etat.paraphrase, etat.citation_verbatim]);
}

function estBordeeDeMot(texte: string, debut: number, fin: number): boolean {
  return !estCaractereDeMot(caractereAvant(texte, debut)) && !estCaractereDeMot(caractereApres(texte, fin));
}

/** Le point de code qui précède `index`, paire de substitution comprise ; vide en tête de texte. */
function caractereAvant(texte: string, index: number): string {
  const avant = Array.from(texte.slice(0, index)).at(-1);
  return avant === undefined ? "" : avant;
}

function caractereApres(texte: string, index: number): string {
  const point = texte.codePointAt(index);
  return point === undefined ? "" : String.fromCodePoint(point);
}

function estCaractereDeMot(caractere: string): boolean {
  return caractere.length > 0 && CARACTERE_DE_MOT.test(caractere);
}
