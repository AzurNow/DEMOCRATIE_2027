/**
 * Analyses de robustesse préenregistrées (§8, protocole 0.3).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les items contestés à un run ultérieur, (c) en excluant les formulations
 * orientées, (d) en excluant les réponses tronquées. Un résultat qui ne survit pas à ces quatre
 * recalculs est signalé comme fragile. » Depuis la 0.9, (b) exclut « les questions dont un item,
 * quel que soit son rôle, est contesté à un run ultérieur ».
 *
 * Les réponses tronquées entrent toujours dans le calcul principal (§8 : elles sont « notée[s]
 * sur ce qu'elle[s] contien[nent] et entre[nt] dans les métriques primaires ») ; leur exclusion
 * n'existe qu'ici, comme recalcul (d).
 *
 * **Le recalcul (a) lit les notations individuelles, jamais le verdict.** §7 (0.7) : « Pour une
 * réponse de l'échantillon, la note humaine prévaut sur celle des juges. Quand les deux humains
 * s'accordent, leur note est retenue ; quand ils divergent, la réponse est arbitrée par un
 * troisième humain, et c'est cette note que retient le recalcul (a) du §8. » Sont lues les seules
 * notations du run, portant sur une réponse, dont le notateur est humain et le motif
 * `echantillon_aleatoire_10` (les deux notations à l'aveugle) ou `arbitrage_echantillon_10` (le
 * troisième humain). Une notation de juge n'est jamais lue, quel que soit son motif ; un humain
 * appelé pour un désaccord de juges ou une erreur grave non plus, puisqu'il n'est pas tiré au sort.
 *
 * « S'accorder » se lit strictement : les deux notes sont identiques sur tout ce que lisent les
 * métriques primaires — catégorie, ensemble des drapeaux, fraîcheur d'obsolescence, et, du
 * sourçage, le seul booléen que lit `metriques.ts:sourcageValide`, `au_moins_un_lien_soutenant`
 * (décision de l'auteur du 2026-10-02, conformité n° 43, texte en 0.15). Un désaccord sur « cite »
 * ou « lien existant » seuls ne change aucune métrique primaire : ce n'est pas un désaccord. Sinon
 * il n'existe pas de « leur note » à retenir sans inventer une règle de fusion, et la réponse doit
 * passer par le troisième humain. Une divergence sans troisième
 * notation lève `DivergenceSansArbitrage` : jamais la note des juges en repli.
 *
 * Deux lectures assumées, toutes deux visibles dans la sortie :
 *
 * - « Ne pas survivre » se dit d'un résultat **établi** au calcul principal qui cesse de l'être
 *   dans l'un des quatre recalculs. Une différence déjà non établie n'avait rien à faire
 *   survivre ; la marquer fragile laisserait croire à un résultat rabaissé.
 * - Un recalcul **qui ne peut plus être calculé** (plus aucune réponse après restriction) ne
 *   confirme rien : il rend le résultat fragile, avec son motif. Une absence de confirmation
 *   n'est pas une confirmation.
 *
 * La 0.9 écrit ces deux lectures (§8 : « Un résultat est une différence qualifiée d'établie. Il
 * est fragile si, dans l'un des quatre recalculs, sa différence n'est plus établie ou ne peut plus
 * être calculée. ») et y ajoute la grappe unique, sans qualificatif (`bootstrap.ts:qualifier`) :
 * un principal sur une seule grappe n'est pas établi, donc jamais fragile ; un recalcul qui tombe
 * sur une seule grappe n'est plus établi, donc rend fragile un principal établi. Il en va de même
 * d'un recalcul dont l'un des deux taux devient dégénéré, [0 ; 0] ou [1 ; 1] (§8, 0.27 et 0.28 ;
 * `bootstrap.ts:qualifierDifference`, motif `taux_degenere`) : sans qualificatif, il rend fragile.
 */

import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import { filtrerContexteRun, type UniteAnalyse } from "./filtre.ts";
import { lireNote, memeNote, type NoteLue } from "./note-lue.ts";
import type { Notation, Run, Ulid } from "./types.ts";

/** Réexportée : sa définition vit dans `note-lue.ts`, avec l'égalité de deux notes. */
export { sourcageDeNotation } from "./note-lue.ts";

/** Les quatre recalculs du §8, dans l'ordre (a), (b), (c), (d) : l'ordre publié, d'un run à l'autre. */
export const RECALCULS = ["echantillon_humain", "items_contestes", "formulations_orientees", "reponses_tronquees"] as const;

export type Recalcul = (typeof RECALCULS)[number];

export interface RecalculRobustesse {
  readonly recalcul: Recalcul;
  readonly difference: DifferenceTaux;
}

export interface ResultatRobustesse {
  readonly principal: DifferenceTaux;
  readonly recalculs: readonly RecalculRobustesse[];
  readonly fragile: boolean;
  readonly motifs_fragilite: readonly Recalcul[];
}

/** Ce que lit le recalcul (a), en plus des unités : le run et les notations individuelles. */
export interface SourcesRobustesse {
  readonly run: Run;
  readonly notations: readonly Notation[];
}

/** Réponse de l'échantillon dont les deux humains divergent, sans troisième notation humaine. */
export class DivergenceSansArbitrage extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid) {
    super(
      `Réponse ${reponse_id} de l'échantillon humain : les deux notations divergent et aucun troisième humain n'a arbitré (§7).`,
    );
    this.name = "DivergenceSansArbitrage";
    this.reponse_id = reponse_id;
  }
}

/** Notations humaines de l'échantillon qui ne forment pas la double notation (+ arbitrage) du §7. */
export class EchantillonHumainIncoherent extends Error {
  readonly reponse_id: Ulid;

  constructor(reponse_id: Ulid, detail: string) {
    super(`Réponse ${reponse_id}, échantillon humain de 10 % : ${detail}`);
    this.name = "EchantillonHumainIncoherent";
    this.reponse_id = reponse_id;
  }
}

const MOTIF_ECHANTILLON = "echantillon_aleatoire_10";
const MOTIF_ARBITRAGE = "arbitrage_echantillon_10";

interface NotationsHumaines {
  readonly echantillon: Notation[];
  readonly arbitrages: Notation[];
}

/**
 * §8(a) : les réponses de l'échantillon (`dans_echantillon_humain`, §7), chacune portant la note
 * humaine retenue par la règle du §7 au lieu de la note retenue du verdict.
 */
export function recalculEchantillonHumain(
  unites: readonly UniteAnalyse[],
  notations: readonly Notation[],
): UniteAnalyse[] {
  const parReponse = notationsHumainesParReponse(notations);
  verifierHorsEchantillon(unites, parReponse);
  return unites
    .filter((u) => u.dans_echantillon_humain)
    .map((u) => ({ ...u, ...noteHumaineRetenue(u.reponse_id, parReponse.get(u.reponse_id)) }));
}

function estLueParRecalculA(notation: Notation): boolean {
  if (notation.objet_note.type !== "reponse" || notation.notateur.type !== "humain") return false;
  return notation.motif_notation === MOTIF_ECHANTILLON || notation.motif_notation === MOTIF_ARBITRAGE;
}

function notationsHumainesParReponse(notations: readonly Notation[]): Map<Ulid, NotationsHumaines> {
  const parReponse = new Map<Ulid, NotationsHumaines>();
  for (const notation of filtrerContexteRun(notations).filter(estLueParRecalculA)) {
    const connues = parReponse.get(notation.objet_note.id);
    const humaines = connues === undefined ? { echantillon: [], arbitrages: [] } : connues;
    if (notation.motif_notation === MOTIF_ARBITRAGE) humaines.arbitrages.push(notation);
    else humaines.echantillon.push(notation);
    parReponse.set(notation.objet_note.id, humaines);
  }
  return parReponse;
}

function verifierHorsEchantillon(
  unites: readonly UniteAnalyse[],
  parReponse: ReadonlyMap<Ulid, NotationsHumaines>,
): void {
  for (const unite of unites) {
    if (unite.dans_echantillon_humain || !parReponse.has(unite.reponse_id)) continue;
    throw new EchantillonHumainIncoherent(
      unite.reponse_id,
      "notée au titre de l'échantillon alors que son verdict la dit hors échantillon.",
    );
  }
}

function noteHumaineRetenue(reponse_id: Ulid, humaines: NotationsHumaines | undefined): NoteLue {
  if (humaines === undefined) {
    throw new EchantillonHumainIncoherent(reponse_id, "aucune notation humaine de l'échantillon.");
  }
  const [premiere, seconde] = doubleNotation(reponse_id, humaines.echantillon);
  const notePremiere = lireNote(premiere);
  if (memeNote(notePremiere, lireNote(seconde))) {
    if (humaines.arbitrages.length > 0) {
      throw new EchantillonHumainIncoherent(reponse_id, "arbitrage d'un troisième humain alors que les deux s'accordent.");
    }
    return notePremiere;
  }
  return lireNote(arbitrage(reponse_id, humaines.arbitrages, [premiere, seconde]));
}

function doubleNotation(reponse_id: Ulid, echantillon: readonly Notation[]): readonly [Notation, Notation] {
  const [premiere, seconde] = echantillon;
  if (echantillon.length !== 2 || premiere === undefined || seconde === undefined) {
    throw new EchantillonHumainIncoherent(reponse_id, `${echantillon.length} notation(s) humaine(s) au lieu de deux.`);
  }
  if (premiere.notateur.id === seconde.notateur.id) {
    throw new EchantillonHumainIncoherent(reponse_id, `deux notations du même annotateur ${premiere.notateur.id}.`);
  }
  return [premiere, seconde];
}

function arbitrage(reponse_id: Ulid, arbitrages: readonly Notation[], notees: readonly Notation[]): Notation {
  const [arbitre] = arbitrages;
  if (arbitre === undefined) throw new DivergenceSansArbitrage(reponse_id);
  if (arbitrages.length > 1) {
    throw new EchantillonHumainIncoherent(reponse_id, `${arbitrages.length} arbitrages au lieu d'un.`);
  }
  if (notees.some((n) => n.notateur.id === arbitre.notateur.id)) {
    throw new EchantillonHumainIncoherent(reponse_id, `l'arbitre ${arbitre.notateur.id} n'est pas un troisième humain.`);
  }
  return arbitre;
}

/**
 * §8(b) (protocole 0.9) : « en excluant les questions dont un item, quel que soit son rôle, est
 * contesté à un run ultérieur ». Les contestations sont `run.contestations_posterieures[]`, reçues
 * APRÈS le gel du run ; les items d'une question sont `UniteAnalyse.item_ids`, tous rôles compris :
 * une Q-ATT sans principal sort dès qu'un de ses `attendu_dans_liste` est contesté, une question
 * directe dès que son distracteur l'est.
 */
export function exclureItemsContestes(unites: readonly UniteAnalyse[], run: Run): UniteAnalyse[] {
  const contestations = run.contestations_posterieures;
  if (contestations === undefined) return [...unites];
  const contestes = new Set<Ulid>(contestations.map((c) => c.item_id));
  return unites.filter((u) => !u.item_ids.some((item_id) => contestes.has(item_id)));
}

/** §8(c) : les formulations orientées du §5. */
export function exclureFormulationsOrientees(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => u.registre !== "oriente");
}

/** §6 (protocole 0.31, D73 (12)) : « le recalcul (d) […] ne porte que sur le canal API ». */
export class RecalculDHorsCanalApi extends Error {
  constructor(unite: UniteAnalyse) {
    super(
      `Réponse ${unite.reponse_id} du canal ${unite.canal} reçue par le recalcul (d) : il ne porte que sur le canal API ` +
        `(§6, protocole 0.31). Une saisie de l'application n'a pas de troncature et n'entre pas dans la robustesse.`,
    );
    this.name = "RecalculDHorsCanalApi";
  }
}

/**
 * §8(d) : les réponses tronquées, lues sur `UniteAnalyse.tronquee` (`normalise.troncature`, §6).
 * Une unité qui n'est pas du canal API lève `RecalculDHorsCanalApi` : ni gardée, ni retirée en silence.
 */
export function exclureReponsesTronquees(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  const horsApi = unites.find((u) => u.canal !== "api");
  if (horsApi !== undefined) throw new RecalculDHorsCanalApi(horsApi);
  return unites.filter((u) => u.tronquee !== true);
}

export function evaluerRobustesse(
  unitesA: readonly UniteAnalyse[],
  unitesB: readonly UniteAnalyse[],
  sources: SourcesRobustesse,
  statistique: Statistique,
  options: OptionsBootstrap,
): ResultatRobustesse {
  const principal = differenceAppariee(unitesA, unitesB, statistique, options);
  const recalculs = restrictions(sources).map(({ recalcul, restreindre }) => ({
    recalcul,
    difference: differenceAppariee(restreindre(unitesA), restreindre(unitesB), statistique, options),
  }));
  const motifs = motifsDeFragilite(principal, recalculs);
  return { principal, recalculs, fragile: motifs.length > 0, motifs_fragilite: motifs };
}

export interface Restriction {
  readonly recalcul: Recalcul;
  readonly restreindre: (unites: readonly UniteAnalyse[]) => UniteAnalyse[];
}

/**
 * Ordre figé : (a), (b), (c), (d) du §8, dans cet ordre, pour que le rapport soit comparable d'un run à l'autre.
 * Partagé avec `robustesse-taux.ts`, qui recalcule les taux sur les mêmes restrictions.
 */
export function restrictions(sources: SourcesRobustesse): readonly Restriction[] {
  return [
    { recalcul: "echantillon_humain", restreindre: (unites) => recalculEchantillonHumain(unites, sources.notations) },
    { recalcul: "items_contestes", restreindre: (unites) => exclureItemsContestes(unites, sources.run) },
    { recalcul: "formulations_orientees", restreindre: exclureFormulationsOrientees },
    { recalcul: "reponses_tronquees", restreindre: exclureReponsesTronquees },
  ];
}

/** La restriction d'un seul recalcul, celle de `restrictions` : jamais une seconde définition. */
export function restrictionDe(sources: SourcesRobustesse, recalcul: Recalcul): Restriction {
  const restriction = restrictions(sources).find((r) => r.recalcul === recalcul);
  if (restriction === undefined) throw new Error(`Recalcul de robustesse inconnu : ${recalcul}.`);
  return restriction;
}

/** §8 : une différence est un résultat seulement si elle est établie ; un recalcul la confirme s'il l'est encore. */
function estEtablie(difference: DifferenceTaux): boolean {
  return difference.qualificatif === "etablie";
}

function motifsDeFragilite(
  principal: DifferenceTaux,
  recalculs: readonly RecalculRobustesse[],
): Recalcul[] {
  if (!estEtablie(principal)) return [];
  return recalculs
    .filter((r) => !estEtablie(r.difference))
    .map((r) => r.recalcul);
}

/* ------------------------------------------------- fragilité des différences d'un run */

/**
 * Les différences dont la fragilité est publiée (§8, protocole 0.27, D69 ; texte de la 0.30) :
 * « toute différence que la section 2 ou la présente section qualifie d'« établie » hors des
 * analyses exploratoires, celles des modes, des formulations et de la tendance, et la différence de
 * H3 ». L'écart API / application, l'écart d'un juge sur l'outil de son éditeur et la corrélation de
 * Spearman sont exploratoires : ils ne sont pas des familles de résultats et n'ont pas de fragilité.
 */
export type FamilleDeResultats = "modes" | "formulations" | "h3" | "tendance";

/** Une différence du calcul principal, telle que sa section la publie. */
export interface DifferencePrincipale {
  /** L'identifiant de la comparaison dans sa famille : clé de paire, ou `cleCouple` pour la tendance. */
  readonly comparaison: string;
  readonly difference: DifferenceTaux;
  /**
   * §8 (D69) : la différence compare le registre orienté lui-même (paire de formulations qui comprend
   * l'orientée, différence de H3). Le recalcul (c) en retirerait le terme comparé : il y est « sans
   * objet » et ne rend pas le résultat fragile.
   */
  readonly compare_le_registre_oriente: boolean;
}

/**
 * Une famille de différences : ses différences principales, et leur recalcul sous l'une des quatre
 * restrictions, par le même calcul que le principal (même appariement, même partage, même clé).
 * `recalculer` rend la différence recalculée de chaque comparaison demandée qui se forme encore ;
 * une comparaison qui ne se forme plus (un bras vidé par la restriction) est absente du résultat.
 */
export interface FamilleDeDifferences {
  readonly famille: FamilleDeResultats;
  readonly strate: string;
  readonly principales: readonly DifferencePrincipale[];
  readonly recalculer: (recalcul: Recalcul, comparaisons: ReadonlySet<string>) => ReadonlyMap<string, DifferenceTaux>;
}

/** §8 : pourquoi un recalcul n'a pas de différence à publier. */
export type RecalculDeLaDifference =
  | { readonly recalcul: Recalcul; readonly statut: "calcule"; readonly difference: DifferenceTaux }
  | { readonly recalcul: Recalcul; readonly statut: "incalculable"; readonly motif: "comparaison_absente" }
  | { readonly recalcul: Recalcul; readonly statut: "sans_objet"; readonly motif: "registre_oriente_compare" };

/** Le qualificatif de fragilité d'un résultat, avec ses quatre recalculs. */
export interface FragiliteDUneDifference {
  readonly famille: FamilleDeResultats;
  readonly strate: string;
  readonly comparaison: string;
  /** La clé et la graine du calcul principal, que chaque recalcul garde (§8, « Graines de l'analyse »). */
  readonly cle: readonly string[];
  readonly graine: string;
  readonly recalculs: readonly RecalculDeLaDifference[];
  readonly fragile: boolean;
  readonly motifs_fragilite: readonly Recalcul[];
}

/** §8 (D69) : le recalcul qui retire les formulations orientées. */
const RECALCUL_SANS_ORIENTEES: Recalcul = "formulations_orientees";

/**
 * La fragilité de chaque différence établie au calcul principal, famille par famille, dans l'ordre
 * des familles puis des différences principales. Une différence non établie au principal n'est pas
 * un résultat : elle n'a ni recalcul ni qualificatif, et n'est pas publiée ici.
 */
export function fragiliteDesDifferences(familles: readonly FamilleDeDifferences[]): FragiliteDUneDifference[] {
  return familles.flatMap(fragiliteDeLaFamille);
}

function fragiliteDeLaFamille(famille: FamilleDeDifferences): FragiliteDUneDifference[] {
  const etablies = famille.principales.filter((p) => estEtablie(p.difference));
  if (etablies.length === 0) return [];
  const comparaisons = new Set(etablies.map((p) => p.comparaison));
  const recalculees = RECALCULS.map((recalcul) => ({ recalcul, differences: famille.recalculer(recalcul, comparaisons) }));
  return etablies.map((principale) => {
    const recalculs = recalculees.map(({ recalcul, differences }) => recalculDe(principale, recalcul, differences));
    const motifs = recalculs.filter(rendFragile).map((r) => r.recalcul);
    const { cle, graine } = principale.difference;
    return { famille: famille.famille, strate: famille.strate, comparaison: principale.comparaison, cle, graine, recalculs, fragile: motifs.length > 0, motifs_fragilite: motifs };
  });
}

function recalculDe(principale: DifferencePrincipale, recalcul: Recalcul, differences: ReadonlyMap<string, DifferenceTaux>): RecalculDeLaDifference {
  if (recalcul === RECALCUL_SANS_ORIENTEES && principale.compare_le_registre_oriente) {
    return { recalcul, statut: "sans_objet", motif: "registre_oriente_compare" };
  }
  const difference = differences.get(principale.comparaison);
  if (difference === undefined) return { recalcul, statut: "incalculable", motif: "comparaison_absente" };
  verifierMemeCle(principale, recalcul, difference);
  return { recalcul, statut: "calcule", difference };
}

/** §8 : « Les recalculs de robustesse gardent la clé de la comparaison principale », donc sa graine. */
function verifierMemeCle(principale: DifferencePrincipale, recalcul: Recalcul, difference: DifferenceTaux): void {
  if (difference.cle.join("\0") === principale.difference.cle.join("\0")) return;
  throw new Error(
    `Recalcul ${recalcul} de ${principale.comparaison} sous la clé [${difference.cle.join(", ")}], et non celle du calcul principal [${principale.difference.cle.join(", ")}] : graine non reproductible (§8).`,
  );
}

/** Fragile : le recalcul ne peut plus être calculé, ou sa différence n'est plus établie. « Sans objet » ne compte pas. */
function rendFragile(recalcul: RecalculDeLaDifference): boolean {
  if (recalcul.statut === "sans_objet") return false;
  return recalcul.statut === "incalculable" || !estEtablie(recalcul.difference);
}
