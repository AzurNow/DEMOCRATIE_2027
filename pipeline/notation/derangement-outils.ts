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
 * en contient un autre ne soit jamais réécrit en partie. « Les outils du dérangement sont les
 * assistants du run » (§7, 0.27) : `outilsDuDerangement` les lit au périmètre du gel, et l'appelant
 * les passe.
 *
 * **Formes.** Le libellé et l'éditeur de chaque outil du périmètre sont non blancs. Une forme que
 * porte un outil permuté n'est portée qu'une fois sur tout le périmètre, y compris entre le libellé
 * et l'éditeur de cet outil : partagée, elle rendrait le remplaçant ambigu (libellé ou éditeur de
 * l'image ? image de quel outil ?). Elle est refusée (`FormesOutilsAmbigues`), jamais départagée.
 * Une forme qu'aucun outil permuté ne porte (deux comparateurs du même éditeur, par exemple) est
 * cherchée, jamais remplacée : partagée, elle n'a pas de remplaçant à départager et n'est pas
 * refusée (D86, option 1, décision de l'auteur du 2026-11-06) ; le texte permuté, l'éligibilité et
 * les mentions résiduelles sont ceux que donnerait cette forme portée une seule fois. Identifiants
 * en double : erreur.
 *
 * **Tirage, pour le rejouer ailleurs.** Graine : `run.graines.contrefactuel` (générateur du tirage,
 * `verifierGraine`), clé `CLE_DERANGEMENT_OUTILS` ; texte haché
 * `<valeur>␀contrefactuel␀noms_outils␀derangement`. Les outils permutés sont rangés par `outil_id`
 * (`comparerChaines`), mélangés par Fisher-Yates du dernier au premier, un mélange à point fixe
 * rejeté et le rangement remélangé avec le même générateur (`derangement.ts:melangeSansPointFixe`).
 * L'outil de rang i a pour image l'outil de rang i du mélange retenu.
 *
 * **Test absent, jamais bloquant** (§7, protocole 0.31, D73 (15) ; 0.33, D75 (6)) : « Quand deux
 * outils du dérangement ont le même éditeur, le test contrefactuel d'outil est publié absent, avec
 * ce motif, sans bloquer le run ; il en va de même quand un comparateur du périmètre a le même
 * éditeur qu'un outil du dérangement. » `derangementOutilsOuAbsence` est l'entrée de l'appelant :
 * elle rend le dérangement, ou l'absence et son motif — `moins_de_deux_outils` sous deux outils
 * (`absenceFauteDOutils`), `outils_du_meme_editeur` dès que deux outils du dérangement partagent un
 * éditeur, `comparateur_du_meme_editeur` sinon, dès qu'un comparateur du périmètre porte l'éditeur
 * d'un outil du dérangement (casse exacte, comme les formes). `editeurs_partages` nomme chaque
 * éditeur en cause avec ses outils, permutés et comparateurs confondus. Aucun dérangement partiel :
 * le §7 rend le test absent dès que l'un de ces cas se présente, quel que soit le nombre des autres
 * outils. L'absence ne dépend ni de la graine ni de l'ordre des outils reçus. Les comparateurs sont
 * désignés par l'appelant (`comparateurs`, identifiants du périmètre hors dérangement) : ce module ne
 * lit pas les familles. Restent des refus nommés, parce qu'ils sont des incohérences et non les cas
 * que le §7 prévoit : graine non conforme, outil permuté hors du périmètre ou déclaré autrement,
 * comparateur hors du périmètre, permuté ou en double, identifiant en double, forme blanche, et
 * toute autre forme partagée que porte un outil permuté (un outil hors dérangement qui n'est pas un
 * comparateur et porte l'éditeur d'un outil permuté, D85 ; un libellé d'outil permuté égal à un
 * éditeur, ou l'inverse : le §7 ne les règle pas). Une forme partagée qu'aucun outil permuté ne
 * porte n'est pas refusée (D86).
 * `tirerDerangementOutils` garde ses préconditions et n'est appelée que sur un dérangement défini.
 */

import { graineDerivee } from "../../analysis/graines.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { generateur } from "../../validation/domaine/alea.ts";
import { verifierGraine } from "../../analysis/graine-tirage.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
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

/** §7 0.24, 0.31 et 0.33 : pourquoi le dérangement des outils n'est pas tiré. */
export const MOTIFS_ABSENCE_CONTREFACTUEL_OUTILS = ["moins_de_deux_outils", "outils_du_meme_editeur", "comparateur_du_meme_editeur"] as const;

export type MotifAbsenceContrefactuelOutils = (typeof MOTIFS_ABSENCE_CONTREFACTUEL_OUTILS)[number];

/**
 * Le contrefactuel d'outil publié absent, avec son motif (§7 0.24, 0.31 et 0.33). `outils` : le
 * nombre d'outils du dérangement ; `editeurs_partages` : vide sous `moins_de_deux_outils`, triés par
 * éditeur sous les deux autres motifs. Jamais 0 %, jamais de sous-ensemble ni de paire.
 */
export interface AbsenceContrefactuelOutils {
  readonly statut: "indefini";
  readonly motif: MotifAbsenceContrefactuelOutils;
  readonly outils: number;
  readonly editeurs_partages: readonly EditeurPartage[];
}

export type IssueDerangementOutils = { readonly statut: "tire"; readonly derangement: DerangementOutils } | AbsenceContrefactuelOutils;

/** Ce que `run.json#/perimetre/outils[]` dit de la famille d'un outil. */
export interface OutilDeFamille {
  readonly outil_id: string;
  readonly famille: "assistant" | "comparateur";
  readonly inclus: boolean;
}

/**
 * §7 (0.27) : « Les outils du dérangement sont les assistants du run » — les assistants inclus du
 * périmètre au gel, dans l'ordre du périmètre. Les comparateurs n'y entrent pas.
 */
export function outilsDuDerangement(outils: readonly OutilDeFamille[]): readonly string[] {
  return outils.filter((outil) => outil.famille === "assistant" && outil.inclus).map((outil) => outil.outil_id);
}

/** Ce que `run.json#/perimetre/outils[]` porte d'un outil au gel : sa famille et ses noms (D84). */
export interface OutilAuGelNomme extends OutilDeFamille {
  readonly libelle: string;
  readonly editeur: string;
}

/** Les trois listes que `derangementOutilsOuAbsence` reçoit de l'appelant. */
export interface OutilsDuContrefactuel {
  readonly permutes: readonly OutilNomme[];
  readonly perimetre: readonly OutilNomme[];
  readonly comparateurs: readonly string[];
}

/**
 * Les outils du contrefactuel d'outil, lus à l'instantané du périmètre inscrit au gel (§7 : « Le
 * libellé et l'éditeur de chaque outil sont ceux de l'instantané du périmètre inscrit au gel » ; D84),
 * jamais au périmètre courant : les assistants inclus, permutés (`outilsDuDerangement`), tout le
 * périmètre, dont les noms sont cherchés, et ses comparateurs (« un comparateur du périmètre »,
 * famille `comparateur`, inclus ou non : leurs noms sont cherchés de même), dans l'ordre du périmètre.
 */
export function outilsDuContrefactuel(outils: readonly OutilAuGelNomme[]): OutilsDuContrefactuel {
  const perimetre = outils.map(({ outil_id, libelle, editeur }) => ({ outil_id, libelle, editeur }));
  const derangement = new Set(outilsDuDerangement(outils));
  return {
    permutes: perimetre.filter((outil) => derangement.has(outil.outil_id)),
    perimetre,
    comparateurs: outils.filter((outil) => outil.famille === "comparateur").map((outil) => outil.outil_id),
  };
}

/** §7 0.24 : sous deux outils au dérangement, le test est absent ; sinon `null`, rien n'est encore décidé. */
export function absenceFauteDOutils(outils: number): AbsenceContrefactuelOutils | null {
  return outils < MINIMUM_OUTILS_DERANGEMENT ? absence("moins_de_deux_outils", outils, []) : null;
}

/**
 * L'entrée de l'appelant : le dérangement, ou le test absent avec son motif, sans exception (D73 (15),
 * D75 (6)). `comparateurs` : les identifiants des comparateurs du périmètre (§7 0.33), tous hors du
 * dérangement.
 */
export function derangementOutilsOuAbsence(
  permutes: readonly OutilNomme[],
  perimetre: readonly OutilNomme[],
  graine: GraineTirage,
  comparateurs: readonly string[],
): IssueDerangementOutils {
  verifierIdentifiants(perimetre);
  perimetre.forEach(exigerFormesNonBlanches);
  exigerDansLePerimetre(permutes, perimetre);
  const outils_comparateurs = comparateursDuPerimetre(comparateurs, permutes, perimetre);
  verifierGraine(graine, "du dérangement des outils");
  const faute = absenceFauteDOutils(permutes.length);
  if (faute !== null) return faute;
  const partages = editeursPartages(permutes, outils_comparateurs);
  if (partages.length > 0) return absence(motifDesPartages(partages, permutes), permutes.length, partages);
  return { statut: "tire", derangement: tirerDerangementOutils(permutes, perimetre, graine) };
}

export function tirerDerangementOutils(permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[], graine: GraineTirage): DerangementOutils {
  verifierOutils(permutes, perimetre);
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

/**
 * Identifiants uniques, libellés et éditeurs non blancs sur tout le périmètre ; une forme que porte
 * un outil permuté n'y est portée qu'une fois. Une forme qu'aucun outil permuté ne porte peut être
 * partagée : elle est cherchée, jamais remplacée (D86).
 */
export function verifierOutils(permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[]): void {
  verifierIdentifiants(perimetre);
  perimetre.forEach(exigerFormesNonBlanches);
  const ids = new Set(permutes.map((outil) => outil.outil_id));
  for (const [forme, porteurs] of porteursParForme(perimetre)) {
    if (porteurs.length > 1 && porteurs.some((porteur) => ids.has(porteur.outil_id))) {
      throw new FormesOutilsAmbigues(`la forme « ${forme} » est le ${porteurs.map((porteur) => porteur.role).join(" et le ")}, dont un outil permuté : son remplacement serait ambigu.`);
    }
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
  verifierOutils(permutes, perimetre);
  exigerDansLePerimetre(permutes, perimetre);
  if (reponse.statut_reponse !== "obtenue" || reponse.normalise.refus_api) return false;
  return nommeUnOutilPermute(reponse.normalise.texte, permutes, perimetre);
}

/**
 * La règle de texte de `estEligibleOutils`, seule : le texte projeté d'une réponse obtenue, hors
 * refus de l'API, nomme-t-il un outil permuté ? Le contrôle croisé (`controle-croise-outils.ts`) la
 * rejoue sur les textes stockés, qui ne sont pas des `ReponseEcrite` ; l'exclusion du refus reste à
 * l'appelant.
 */
export function texteNommeUnOutilPermute(texte: string, permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[]): boolean {
  verifierOutils(permutes, perimetre);
  exigerDansLePerimetre(permutes, perimetre);
  return nommeUnOutilPermute(texte, permutes, perimetre);
}

function nommeUnOutilPermute(texte: string, permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[]): boolean {
  const ids = new Set(permutes.map((outil) => outil.outil_id));
  // Le remplaçant d'un outil permuté n'a pas d'importance ici : seule compte l'occurrence.
  const formes = perimetre.flatMap((outil) => formesDeLOutil(outil, ids.has(outil.outil_id) ? outil : null));
  return nommeUneForme([texte], formes);
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

/**
 * Les éditeurs d'un outil permuté que portent au moins deux outils, permutés ou comparateurs, triés
 * par éditeur, leurs outils par `outil_id`. Un éditeur que ne portent que des comparateurs n'en est
 * pas : ses formes sont cherchées sans être remplacées, ni absence ni refus (D86).
 */
function editeursPartages(permutes: readonly OutilNomme[], comparateurs: readonly OutilNomme[]): readonly EditeurPartage[] {
  const editeurs_permutes = new Set(permutes.map((outil) => outil.editeur));
  const parEditeur = new Map<string, string[]>();
  for (const outil of [...permutes, ...comparateurs.filter((comparateur) => editeurs_permutes.has(comparateur.editeur))]) {
    const ids = parEditeur.get(outil.editeur);
    if (ids === undefined) parEditeur.set(outil.editeur, [outil.outil_id]);
    else ids.push(outil.outil_id);
  }
  return [...parEditeur]
    .filter(([, ids]) => ids.length > 1)
    .map(([editeur, ids]) => ({ editeur, outil_ids: [...ids].sort(comparerChaines) }))
    .sort((a, b) => comparerChaines(a.editeur, b.editeur));
}

/** Deux outils du dérangement sous un même éditeur l'emportent ; sinon, c'est un comparateur qui le partage. */
function motifDesPartages(partages: readonly EditeurPartage[], permutes: readonly OutilNomme[]): MotifAbsenceContrefactuelOutils {
  const ids = new Set(permutes.map((outil) => outil.outil_id));
  const entre_permutes = partages.some((partage) => partage.outil_ids.filter((id) => ids.has(id)).length > 1);
  return entre_permutes ? "outils_du_meme_editeur" : "comparateur_du_meme_editeur";
}

/** Les comparateurs désignés, lus au périmètre : chacun y figure, une fois, hors du dérangement. */
function comparateursDuPerimetre(comparateurs: readonly string[], permutes: readonly OutilNomme[], perimetre: readonly OutilNomme[]): readonly OutilNomme[] {
  if (new Set(comparateurs).size !== comparateurs.length) throw new FormesOutilsAmbigues("comparateur en double.");
  const permutes_ids = new Set(permutes.map((outil) => outil.outil_id));
  const permutes_aussi = comparateurs.filter((id) => permutes_ids.has(id));
  if (permutes_aussi.length > 0) throw new FormesOutilsAmbigues(`comparateur(s) au dérangement : ${permutes_aussi.join(", ")}.`);
  const connus = new Map(perimetre.map((outil) => [outil.outil_id, outil]));
  const etrangers = comparateurs.filter((id) => !connus.has(id));
  if (etrangers.length > 0) throw new FormesOutilsAmbigues(`comparateur(s) absent(s) du périmètre : ${etrangers.join(", ")}.`);
  return perimetre.filter((outil) => comparateurs.includes(outil.outil_id));
}

function absence(motif: MotifAbsenceContrefactuelOutils, outils: number, editeurs_partages: readonly EditeurPartage[]): AbsenceContrefactuelOutils {
  return { statut: "indefini", motif, outils, editeurs_partages };
}

/** Qui porte une forme : l'outil, et à quel titre (« libellé de alpha », « éditeur de beta »). */
interface PorteurDeForme {
  readonly outil_id: string;
  readonly role: string;
}

/** Chaque forme du périmètre et ses porteurs, dans l'ordre du périmètre, libellé avant éditeur. */
function porteursParForme(perimetre: readonly OutilNomme[]): ReadonlyMap<string, readonly PorteurDeForme[]> {
  const parForme = new Map<string, PorteurDeForme[]>();
  for (const outil of perimetre) {
    ajouterPorteur(parForme, outil.libelle, { outil_id: outil.outil_id, role: `libellé de ${outil.outil_id}` });
    ajouterPorteur(parForme, outil.editeur, { outil_id: outil.outil_id, role: `éditeur de ${outil.outil_id}` });
  }
  return parForme;
}

function ajouterPorteur(parForme: Map<string, PorteurDeForme[]>, forme: string, porteur: PorteurDeForme): void {
  const porteurs = parForme.get(forme);
  if (porteurs === undefined) parForme.set(forme, [porteur]);
  else porteurs.push(porteur);
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
