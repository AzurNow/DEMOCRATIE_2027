/**
 * Le dérangement des outils et le remplacement de leurs noms, pour le contrefactuel d'outil (§7,
 * protocole 0.24, D59 (13)) : « le test contrefactuel s'applique aussi à la comparaison entre
 * outils, en renotant un sous-ensemble après permutation des noms d'outils dans le texte des
 * réponses, seule trace de leur identité que voit le juge. Ce sous-ensemble compte 200 réponses
 * dont le texte nomme au moins un outil, tirées avec leur propre graine dérivée, comme celles du
 * test des candidats ; les noms permutés sont le libellé et l'éditeur de chaque outil déclarés au
 * périmètre, selon un dérangement des outils du run, qui n'est pas défini sous deux outils. »
 *
 * **Même moteur que les candidats.** Le remplacement est celui de `permutation.ts`
 * (`permuterParFormes`) : casse exacte, mot entier (« Le Chat » ne se trouve pas dans « Le
 * Chatelet »), toutes les occurrences cherchées dans le texte d'origine puis remplacées en une passe
 * (un échange A↔B donne B…A, jamais B…B ; une réponse qui nomme deux outils voit les deux
 * remplacés), la plus longue l'emportant sur un chevauchement (« Perplexity AI » sur
 * « Perplexity »), mentions résiduelles sans égard à la casse comptées, jamais remplacées. Le
 * libellé d'un outil devient le libellé de son image, son éditeur l'éditeur de son image.
 *
 * **Outils permutés et outils cherchés.** Comme pour les candidats (D55 (4)), deux listes : les
 * outils du dérangement (`permutes`), seuls à avoir une image, et tout le périmètre (`perimetre`),
 * dont les formes sont cherchées sans être remplacées hors du dérangement, pour qu'un nom d'outil qui
 * en contient un autre ne soit jamais réécrit en partie. Ce module ne décide pas lesquels des outils
 * du périmètre sont « les outils du run » : l'appelant les lui passe (question ouverte au rapport du
 * lot D59, assistants inclus seuls ou aussi comparateurs).
 *
 * **Formes.** Le libellé et l'éditeur de chaque outil du périmètre sont non blancs et deux à deux
 * distincts sur tout le périmètre, y compris entre le libellé et l'éditeur d'un même outil : une
 * forme partagée rendrait le remplaçant ambigu (libellé ou éditeur de l'image ? image de quel
 * outil ?). Elle est refusée (`FormesOutilsAmbigues`), jamais départagée. Identifiants en double :
 * erreur.
 *
 * **Tirage, pour le rejouer ailleurs.** Graine : `run.graines.contrefactuel` (générateur du tirage,
 * `verifierGraine`), clé `CLE_DERANGEMENT_OUTILS` ; texte haché
 * `<valeur>␀contrefactuel␀noms_outils␀derangement`. Les outils permutés sont rangés par `outil_id`
 * (`comparerChaines`), mélangés par Fisher-Yates du dernier au premier, un mélange à point fixe
 * rejeté et le rangement remélangé avec le même générateur (`derangement.ts:melangeSansPointFixe`).
 * L'outil de rang i a pour image l'outil de rang i du mélange retenu.
 *
 * **Test absent, jamais bloquant** (§7, protocole 0.31, D73 (15)) : « Quand deux outils du
 * dérangement ont le même éditeur, le test contrefactuel d'outil est publié absent, avec ce motif,
 * sans bloquer le run. » `derangementOutilsOuAbsence` est l'entrée de l'appelant : elle rend le
 * dérangement, ou l'absence et son motif — `moins_de_deux_outils` sous deux outils,
 * `outils_du_meme_editeur` dès que deux outils du dérangement partagent un éditeur (casse exacte,
 * comme les formes), avec les éditeurs partagés et leurs outils. Aucun dérangement partiel : le §7
 * rend le test absent dès que « deux outils du dérangement » ont le même éditeur, quel que soit le
 * nombre des autres. L'absence ne dépend ni de la graine ni de l'ordre des outils reçus. Restent des
 * refus nommés, parce qu'ils sont des incohérences et non le cas que le §7 prévoit : graine non
 * conforme, outil permuté hors du périmètre ou déclaré autrement, identifiant en double, forme
 * blanche, et toute autre forme partagée (un outil hors dérangement qui porte l'éditeur d'un outil
 * permuté compris : le §7 ne le règle pas). `tirerDerangementOutils` garde ses préconditions et
 * n'est appelée que sur un dérangement défini.
 */

import { graineDerivee } from "../../analysis/graines.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { generateur } from "../../validation/domaine/alea.ts";
import { verifierGraine } from "../questions/graine.ts";
import type { GraineTirage } from "../questions/types.ts";
import type { ReponseEcrite } from "../interrogation/types.ts";
import { melangeSansPointFixe } from "./derangement.ts";
import { nommeUneForme, permuterParFormes, type Forme, type TextePermute } from "./permutation.ts";

/** Ce que le périmètre déclare d'un outil et que le test lit (`config/perimetre.yaml`, §7 0.24). */
export interface OutilNomme {
  readonly outil_id: string;
  readonly libelle: string;
  readonly editeur: string;
}

/** Clé lisible de la graine du dérangement des outils, dérivée de `run.graines.contrefactuel`. */
export const CLE_DERANGEMENT_OUTILS: readonly string[] = ["contrefactuel", "noms_outils", "derangement"];

/** §7 0.24 : le dérangement des outils « n'est pas défini sous deux outils ». */
export const MINIMUM_OUTILS_DERANGEMENT = 2;

export class DerangementOutilsImpossible extends Error {
  readonly outils: number;

  constructor(outils: number) {
    super(`Dérangement des outils impossible : ${outils} outil(s) au run, il en faut au moins deux (§7 0.24) ; le contrefactuel d'outil est indéfini.`);
    this.name = "DerangementOutilsImpossible";
    this.outils = outils;
  }
}

export class FormesOutilsAmbigues extends Error {
  constructor(detail: string) {
    super(`Contrefactuel d'outil : ${detail}`);
    this.name = "FormesOutilsAmbigues";
  }
}

export interface PaireOutils {
  readonly source: OutilNomme;
  readonly image: OutilNomme;
}

export interface DerangementOutils {
  /** Une paire par outil permuté, dans l'ordre croissant des `outil_id` des sources. */
  readonly paires: readonly PaireOutils[];
  /** Les outils du périmètre hors dérangement, triés par `outil_id` : cherchés, jamais remplacés. */
  readonly hors_derangement: readonly OutilNomme[];
}

/** Un éditeur que portent plusieurs outils du dérangement, et ces outils, triés par `outil_id`. */
export interface EditeurPartage {
  readonly editeur: string;
  readonly outil_ids: readonly string[];
}

/**
 * Le contrefactuel d'outil publié absent, avec son motif (§7 0.24 et 0.31). `outils` : le nombre
 * d'outils du dérangement ; `editeurs_partages` : vide sous `moins_de_deux_outils`, triés par éditeur
 * sous `outils_du_meme_editeur`. Jamais 0 %, jamais de sous-ensemble ni de paire.
 */
export interface AbsenceContrefactuelOutils {
  readonly statut: "indefini";
  readonly motif: "moins_de_deux_outils" | "outils_du_meme_editeur";
  readonly outils: number;
  readonly editeurs_partages: readonly EditeurPartage[];
}

export type IssueDerangementOutils = { readonly statut: "tire"; readonly derangement: DerangementOutils } | AbsenceContrefactuelOutils;

/** L'entrée de l'appelant : le dérangement, ou le test absent avec son motif, sans exception (D73 (15)). */
export function derangementOutilsOuAbsence(permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[], graine: GraineTirage): IssueDerangementOutils {
  verifierIdentifiants(perimetre);
  perimetre.forEach(exigerFormesNonBlanches);
  exigerDansLePerimetre(permutes, perimetre);
  verifierGraine(graine, "du dérangement des outils");
  if (permutes.length < MINIMUM_OUTILS_DERANGEMENT) return absence("moins_de_deux_outils", permutes.length, []);
  const partages = editeursPartages(permutes);
  if (partages.length > 0) return absence("outils_du_meme_editeur", permutes.length, partages);
  return { statut: "tire", derangement: tirerDerangementOutils(permutes, perimetre, graine) };
}

export function tirerDerangementOutils(permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[], graine: GraineTirage): DerangementOutils {
  verifierOutils(perimetre);
  exigerDansLePerimetre(permutes, perimetre);
  if (permutes.length < MINIMUM_OUTILS_DERANGEMENT) throw new DerangementOutilsImpossible(permutes.length);
  verifierGraine(graine, "du dérangement des outils");
  const ids = new Set(permutes.map((outil) => outil.outil_id));
  const ranges = [...permutes].sort(parIdentifiant);
  const images = melangeSansPointFixe(ranges, generateur(graineDerivee(graine.valeur, CLE_DERANGEMENT_OUTILS)));
  return {
    paires: ranges.map((source, rang) => ({ source, image: imageAuRang(images, rang) })),
    hors_derangement: perimetre.filter((outil) => !ids.has(outil.outil_id)).sort(parIdentifiant),
  };
}

/** `reponse.schema.json#/properties/permutation/properties/correspondances` : source → image. */
export function correspondancesOutils(derangement: DerangementOutils): Readonly<Record<string, string>> {
  return Object.fromEntries(derangement.paires.map((paire) => [paire.source.outil_id, paire.image.outil_id]));
}

/** Libellés et éditeurs non blancs, deux à deux distincts sur tout le périmètre ; identifiants uniques. */
export function verifierOutils(perimetre: readonly OutilNomme[]): void {
  verifierIdentifiants(perimetre);
  const formes = new Map<string, string>();
  for (const outil of perimetre) {
    enregistrerForme(formes, outil.libelle, `libellé de ${outil.outil_id}`);
    enregistrerForme(formes, outil.editeur, `éditeur de ${outil.outil_id}`);
  }
}

/** Le texte, libellés et éditeurs des outils permutés remplacés par ceux de leurs images. */
export function permuterNomsOutils(texte: string, derangement: DerangementOutils): TextePermute {
  return permuterParFormes(texte, formesDe(derangement));
}

/**
 * « dont le texte nomme au moins un outil » : la réponse projetée (`normalise.texte`) nomme un outil
 * permuté, une fois retirées les occurrences qui reviennent à un outil hors dérangement. Une
 * réponse manquante ou un refus de l'API (sans texte à permuter, comme au test des candidats)
 * n'est jamais éligible ; une `ReponseEcrite` est, par son type, une réponse du run.
 */
export function estEligibleOutils(reponse: ReponseEcrite, permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[]): boolean {
  verifierOutils(perimetre);
  exigerDansLePerimetre(permutes, perimetre);
  if (reponse.statut_reponse !== "obtenue" || reponse.normalise.refus_api) return false;
  const ids = new Set(permutes.map((outil) => outil.outil_id));
  // Le remplaçant d'un outil permuté n'a pas d'importance ici : seule compte l'occurrence.
  const formes = perimetre.flatMap((outil) => formesDeLOutil(outil, ids.has(outil.outil_id) ? outil : null));
  return nommeUneForme([reponse.normalise.texte], formes);
}

/** Pour chaque paire, libellé → libellé de l'image, éditeur → éditeur de l'image ; puis les formes intactes. */
function formesDe(derangement: DerangementOutils): readonly Forme[] {
  return [
    ...derangement.paires.flatMap(({ source, image }) => formesDeLOutil(source, image)),
    ...derangement.hors_derangement.flatMap((outil) => formesDeLOutil(outil, null)),
  ];
}

function formesDeLOutil(outil: OutilNomme, image: OutilNomme | null): readonly Forme[] {
  return [
    { forme: outil.libelle, remplacant: image === null ? null : image.libelle },
    { forme: outil.editeur, remplacant: image === null ? null : image.editeur },
  ];
}

function verifierIdentifiants(perimetre: readonly OutilNomme[]): void {
  const identifiants = new Set<string>();
  for (const outil of perimetre) {
    if (identifiants.has(outil.outil_id)) throw new FormesOutilsAmbigues(`outil en double au périmètre : identifiant ${outil.outil_id}.`);
    identifiants.add(outil.outil_id);
  }
}

function exigerFormesNonBlanches(outil: OutilNomme): void {
  exigerNonBlanche(outil.libelle, `libellé de ${outil.outil_id}`);
  exigerNonBlanche(outil.editeur, `éditeur de ${outil.outil_id}`);
}

function exigerNonBlanche(forme: string, porteur: string): void {
  if (forme.trim().length === 0) throw new FormesOutilsAmbigues(`${porteur} vide ou blanc : il nommerait n'importe quel texte.`);
}

/** Les éditeurs portés par au moins deux outils, triés par éditeur, leurs outils par `outil_id`. */
function editeursPartages(permutes: readonly OutilNomme[]): readonly EditeurPartage[] {
  const parEditeur = new Map<string, string[]>();
  for (const outil of permutes) {
    const ids = parEditeur.get(outil.editeur);
    if (ids === undefined) parEditeur.set(outil.editeur, [outil.outil_id]);
    else ids.push(outil.outil_id);
  }
  return [...parEditeur]
    .filter(([, ids]) => ids.length > 1)
    .map(([editeur, ids]) => ({ editeur, outil_ids: [...ids].sort(comparerChaines) }))
    .sort((a, b) => comparerChaines(a.editeur, b.editeur));
}

function absence(motif: AbsenceContrefactuelOutils["motif"], outils: number, editeurs_partages: readonly EditeurPartage[]): AbsenceContrefactuelOutils {
  return { statut: "indefini", motif, outils, editeurs_partages };
}

function enregistrerForme(formes: Map<string, string>, forme: string, porteur: string): void {
  exigerNonBlanche(forme, porteur);
  const deja = formes.get(forme);
  if (deja !== undefined) throw new FormesOutilsAmbigues(`la forme « ${forme} » est le ${deja} et le ${porteur} : son remplacement serait ambigu.`);
  formes.set(forme, porteur);
}

function exigerDansLePerimetre(permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[]): void {
  const connus = new Map(perimetre.map((outil) => [outil.outil_id, outil]));
  const etrangers = permutes.filter((outil) => !memeDeclaration(connus.get(outil.outil_id), outil)).map((outil) => outil.outil_id);
  if (etrangers.length > 0) throw new FormesOutilsAmbigues(`outil(s) permuté(s) absent(s) du périmètre, ou déclaré(s) autrement : ${etrangers.join(", ")}.`);
  if (new Set(permutes.map((outil) => outil.outil_id)).size !== permutes.length) throw new FormesOutilsAmbigues("outil permuté en double.");
}

function memeDeclaration(connu: OutilNomme | undefined, outil: OutilNomme): boolean {
  return connu !== undefined && connu.libelle === outil.libelle && connu.editeur === outil.editeur;
}

function parIdentifiant(a: OutilNomme, b: OutilNomme): number {
  return comparerChaines(a.outil_id, b.outil_id);
}

function imageAuRang(images: readonly OutilNomme[], rang: number): OutilNomme {
  const image = images[rang];
  if (image === undefined) throw new Error(`Dérangement des outils incomplet : aucune image au rang ${rang}.`);
  return image;
}
