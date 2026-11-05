/**
 * Le remplacement des noms de candidats dans un texte, pour le test contrefactuel (§7, D14 (2) :
 * « appliqué par remplacement exact du libellé et du nom seul déclarés au périmètre »).
 *
 * **Remplacement.** Le libellé d'un candidat devient le libellé de son image, son nom seul le nom
 * seul de son image. Les occurrences sont celles de `candidats.ts:occurrencesDeNom` (casse exacte,
 * mot entier, aucune normalisation), la fonction même de l'éligibilité au sous-ensemble : une
 * réponse est éligible exactement quand ce module y trouve quelque chose à remplacer. Toutes les
 * occurrences de toutes les formes sont cherchées dans le texte d'ORIGINE, puis remplacées en une
 * passe : un nom substitué n'est jamais relu, donc jamais remplacé une seconde fois (un échange
 * A↔B donne B…A, jamais B…B). Quand deux occurrences se chevauchent (« Maxime Le Brun » contient
 * « Le Brun »), la plus longue gagne ; à longueur égale, la première dans le texte. Les positions
 * sont en unités UTF-16 du texte reçu, comme celles d'`occurrencesDeNom`.
 *
 * **Candidats non interrogés** (§7, D55 (4)). Ils n'ont pas d'image, mais leurs formes participent
 * à la recherche, avec la même règle de chevauchement : une occurrence qui leur revient (« Inès
 * Morel Le Brun », non interrogée, contient « Le Brun », interrogé) est laissée intacte, et n'est
 * comptée ni comme remplacement, ni comme mention résiduelle, ni pour l'éligibilité. Sans elles, le
 * nom d'un non-interrogé serait réécrit en partie (« Inès Morel Garnier »). Seul le remplacement
 * est restreint aux interrogés ; le dérangement lui-même n'en dépend pas.
 *
 * **Éligibilité** (`nommeUnInterroge`). Une réponse est éligible au sous-ensemble exactement quand
 * cette recherche y trouve une occurrence d'un interrogé, donc quelque chose à remplacer.
 *
 * **Mentions résiduelles** (`docs/DETTE.md`, 2026-10-05, point 3). Une mention que le remplacement
 * exact ne voit pas (« LE BRUN », « MAXIME Le Brun ») reste en clair dans le texte permuté. Elle est
 * comptée, pas remplacée : les formes sont recherchées sans tenir compte de la casse
 * (`toLocaleLowerCase("fr")` du texte et de chaque forme, mêmes bornes de mot), avec la même règle
 * de chevauchement ; une mention ainsi trouvée est résiduelle sauf si une occurrence remplacée
 * couvre exactement le même intervalle du texte d'origine, ou si elle revient à un non-interrogé
 * (la plus longue, sans égard à la casse, est la sienne). Ce compte est un diagnostic publié avec
 * le résultat du test : il ne change ni le texte permuté ni le taux de changement.
 */

import { occurrencesDeNom, type NomsDeCandidat, type Occurrence } from "./candidats.ts";
import { verifierCandidats, type Derangement } from "./derangement.ts";
import type { CandidatDuRun } from "../../analysis/types-notation.ts";

export interface TextePermute {
  readonly texte: string;
  /** Occurrences remplacées. */
  readonly remplacements: number;
  /** Mentions sans égard à la casse que le remplacement exact n'a pas couvertes. */
  readonly mentions_residuelles: number;
}

/**
 * Une forme cherchée dans le texte, et ce qui la remplace. Exportée pour le contrefactuel d'outil
 * (`derangement-outils.ts`, §7 0.24), qui applique la même recherche à d'autres formes.
 */
export interface Forme {
  readonly forme: string;
  /** `null` : forme cherchée, jamais remplacée (candidat non interrogé, D55 (4) ; outil hors dérangement). */
  readonly remplacant: string | null;
}

interface Trouvee extends Occurrence {
  readonly remplacant: string | null;
}

/** Une occurrence d'un candidat interrogé, la seule qui se remplace. */
interface Remplacee extends Occurrence {
  readonly remplacant: string;
}

export function permuterTexte(texte: string, derangement: Derangement): TextePermute {
  return permuterParFormes(texte, formesDe(derangement));
}

/**
 * Le remplacement, la règle de chevauchement et le compte des mentions résiduelles, sur des formes
 * quelconques : le seul moteur des deux tests contrefactuels (noms de candidats, noms d'outils).
 */
export function permuterParFormes(texte: string, formes: readonly Forme[]): TextePermute {
  const remplacees = occurrencesDInterroges(texte, formes);
  return {
    texte: remplacer(texte, remplacees),
    remplacements: remplacees.length,
    mentions_residuelles: mentionsResiduelles(texte, formes, remplacees),
  };
}

/**
 * Un des textes nomme-t-il un candidat interrogé, une fois retirées les occurrences qui reviennent
 * à un non-interrogé ? `perimetre` : tout le périmètre du run, interrogés compris, dont l'unicité
 * des formes est vérifiée comme au tirage du dérangement (`verifierCandidats`).
 */
export function nommeUnInterroge(textes: readonly string[], interroges: readonly CandidatDuRun[], perimetre: readonly CandidatDuRun[]): boolean {
  verifierCandidats(perimetre);
  const ids = new Set(interroges.map((candidat) => candidat.candidat_id));
  // Le remplaçant d'un interrogé n'a pas d'importance ici : seule compte l'occurrence.
  const formes = perimetre.flatMap((candidat) => (ids.has(candidat.candidat_id) ? formesIdentiques(candidat) : formesIntactes(candidat)));
  return nommeUneForme(textes, formes);
}

/** Un des textes porte-t-il une occurrence remplaçable, une fois retirées celles des formes intactes ? */
export function nommeUneForme(textes: readonly string[], formes: readonly Forme[]): boolean {
  return textes.some((texte) => occurrencesDInterroges(texte, formes).length > 0);
}

/**
 * Pour chaque paire, le libellé vers le libellé de l'image, le nom seul vers son nom seul ; puis les
 * formes des non-interrogés, sans remplaçant.
 */
function formesDe(derangement: Derangement): readonly Forme[] {
  const permutees = derangement.paires.flatMap(({ source, image }) => [
    { forme: source.libelle, remplacant: image.libelle },
    { forme: source.nom, remplacant: image.nom },
  ]);
  return [...permutees, ...derangement.hors_derangement.flatMap(formesIntactes)];
}

function formesIntactes(candidat: NomsDeCandidat): readonly Forme[] {
  return [
    { forme: candidat.libelle, remplacant: null },
    { forme: candidat.nom, remplacant: null },
  ];
}

function formesIdentiques(candidat: NomsDeCandidat): readonly Forme[] {
  return [
    { forme: candidat.libelle, remplacant: candidat.libelle },
    { forme: candidat.nom, remplacant: candidat.nom },
  ];
}

/** Toutes les formes cherchées, la plus longue gagne ; puis les seules occurrences d'interrogés. */
function occurrencesDInterroges(texte: string, formes: readonly Forme[]): Remplacee[] {
  return dInterroges(sansChevauchement(trouver(texte, formes)));
}

function trouver(texte: string, formes: readonly Forme[]): Trouvee[] {
  return formes.flatMap(({ forme, remplacant }) => occurrencesDeNom(texte, forme).map((o) => ({ ...o, remplacant })));
}

function dInterroges(trouvees: readonly Trouvee[]): Remplacee[] {
  return trouvees.flatMap(({ debut, fin, remplacant }) => (remplacant === null ? [] : [{ debut, fin, remplacant }]));
}

/** La plus longue d'abord, puis la première ; une occurrence qui chevauche une retenue est écartée. */
function sansChevauchement<T extends Occurrence>(occurrences: readonly T[]): T[] {
  const ordre = [...occurrences].sort(plusLonguePuisPremiere);
  const retenues: T[] = [];
  for (const occurrence of ordre) {
    if (!retenues.some((r) => seChevauchent(r, occurrence))) retenues.push(occurrence);
  }
  return retenues.sort((a, b) => a.debut - b.debut);
}

function plusLonguePuisPremiere(a: Occurrence, b: Occurrence): number {
  const ecart = b.fin - b.debut - (a.fin - a.debut);
  return ecart === 0 ? a.debut - b.debut : ecart;
}

function seChevauchent(a: Occurrence, b: Occurrence): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

/** Les occurrences sont rangées et disjointes : le texte se recompose d'un seul passage. */
function remplacer(texte: string, occurrences: readonly Remplacee[]): string {
  let sortie = "";
  let curseur = 0;
  for (const occurrence of occurrences) {
    sortie += texte.slice(curseur, occurrence.debut) + occurrence.remplacant;
    curseur = occurrence.fin;
  }
  return sortie + texte.slice(curseur);
}

/* ------------------------------------------------------------------ mentions résiduelles */

/**
 * Le texte en minuscules, et pour chaque unité UTF-16 de ce texte l'indice, dans le texte d'origine,
 * du point de code dont elle provient. Un point de code peut changer de longueur en minuscule
 * (« İ ») : l'index ramène chaque mention à son intervalle d'origine.
 */
interface Minuscules {
  readonly texte: string;
  /** Une entrée par unité, plus une sentinelle finale : la longueur du texte d'origine. */
  readonly origine: readonly number[];
}

function enMinuscules(texte: string): Minuscules {
  let bas = "";
  const origine: number[] = [];
  let position = 0;
  for (const point of texte) {
    const minuscule = point.toLocaleLowerCase("fr");
    bas += minuscule;
    for (let i = 0; i < minuscule.length; i += 1) origine.push(position);
    position += point.length;
  }
  origine.push(texte.length);
  return { texte: bas, origine };
}

function mentionsResiduelles(texte: string, formes: readonly Forme[], remplacees: readonly Occurrence[]): number {
  const bas = enMinuscules(texte);
  const mentions = formes.flatMap(({ forme, remplacant }) =>
    occurrencesDeNom(bas.texte, forme.toLocaleLowerCase("fr")).map((o) => ({ ...versOrigine(o, bas), remplacant })),
  );
  const couvertes = new Set(remplacees.map(cle));
  return dInterroges(sansChevauchement(mentions)).filter((mention) => !couvertes.has(cle(mention))).length;
}

function versOrigine(occurrence: Occurrence, bas: Minuscules): Occurrence {
  return { debut: indiceOrigine(bas, occurrence.debut), fin: indiceOrigine(bas, occurrence.fin) };
}

function indiceOrigine(bas: Minuscules, indice: number): number {
  const origine = bas.origine[indice];
  if (origine === undefined) throw new Error(`Indice ${indice} hors du texte en minuscules (${bas.texte.length} unités).`);
  return origine;
}

function cle(occurrence: Occurrence): string {
  return `${occurrence.debut}:${occurrence.fin}`;
}
