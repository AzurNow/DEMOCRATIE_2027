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
 * sur une seule grappe n'est plus établi, donc rend fragile un principal établi.
 */

import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import { filtrerContexteRun, type UniteAnalyse } from "./filtre.ts";
import { lireNote, memeNote, type NoteLue } from "./note-lue.ts";
import type { Notation, Run, Ulid } from "./types.ts";

/** Réexportée : sa définition vit dans `note-lue.ts`, avec l'égalité de deux notes. */
export { sourcageDeNotation } from "./note-lue.ts";

export type Recalcul =
  | "echantillon_humain"
  | "items_contestes"
  | "formulations_orientees"
  | "reponses_tronquees";

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

/** §8(d) : les réponses tronquées, lues sur `UniteAnalyse.tronquee` (`normalise.troncature`, §6). */
export function exclureReponsesTronquees(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => !u.tronquee);
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

function motifsDeFragilite(
  principal: DifferenceTaux,
  recalculs: readonly RecalculRobustesse[],
): Recalcul[] {
  if (principal.qualificatif !== "etablie") return [];
  return recalculs
    .filter((r) => r.difference.qualificatif !== "etablie")
    .map((r) => r.recalcul);
}
