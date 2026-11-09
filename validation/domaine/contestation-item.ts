/**
 * Contestation d'un item publié et décision du panel : la logique, sans le disque (protocole 0.10,
 * §4 « Droit de réponse », §10 « Panel d'arbitrage », annexe E).
 *
 * - `ajouterContestation` : l'item passe en « contestee » (y compris depuis « arbitree ») et sort
 *   du tirage suivant ; son contenu notant ne bouge pas.
 * - `appliquerDecisionPanel` : pose une décision motivée sur une contestation qui n'en a pas.
 *   L'item est « arbitree » seulement quand toutes ses contestations sont décidées ; un retrait le
 *   rend « retire_par_panel », une non-évaluabilité « non_evaluable », sans toucher aux sources :
 *   l'attestation d'écoute d'une source T2 est conservée dans les deux cas (§4 pour le retrait ;
 *   pour la non-évaluabilité, décision de l'auteur du 2026-10-02, conformité n° 6, texte à écrire
 *   au §4 en 0.15 ; `item.schema.json` l'admet alors) ; une correction passe par la
 *   liste blanche des corrections et **rejoue le test verbatim** sur le texte canonique, incrémente
 *   la version et recalcule l'empreinte. Un maintien ou une correction sur un item que le panel
 *   avait sorti (retrait ou non-évaluabilité) lui rend le statut qu'il avait avant cette sortie
 *   (§4, annexe E point 6, décision de l'auteur du 2026-09-29) : chaque décision publiée porte
 *   `statut_validation_anterieur`, et c'est lui qui est rendu, jamais un statut deviné.
 *
 * Décisions du protocole 0.10 tenues ici : un texte de plus de 1 000 caractères (points de code
 * après NFC) est **refusé**, jamais tronqué ni résumé ; un texte vide est refusé ; une décision
 * rendue après 14 jours reste valable et son délai se calcule depuis les deux dates publiées.
 * Aucune adresse de contestataire n'entre ici : aucun champ ne la reçoit.
 */

import { DecisionsPanelSimultanees } from "../../pipeline/questions/contestation.ts";
import { instantDe } from "../../analysis/instants.ts";
import { ancienneteEnJours } from "./corrections-mesure.ts";
import { validerCorrections, type AccesTexte, type RefusCorrection } from "./corrections.ts";
import { canoniser, empreinteApresModification } from "./empreinte.ts";
import { appliquerCorrections } from "./promotion.ts";
import type { AutorisationReecriture } from "./ajout-seul.ts";
import type { Correction, Item, Source } from "./types.ts";

import { LONGUEUR_MAX_CONTESTATION } from "../../analysis/parametres-protocole.ts";

export { LONGUEUR_MAX_CONTESTATION };

export const TYPES_CONTESTATAIRE = ["campagne", "parti", "citoyen", "media", "autre"] as const;
export type TypeContestataire = (typeof TYPES_CONTESTATAIRE)[number];

export const DECISIONS_PANEL = ["maintien", "correction", "retrait", "non_evaluabilite"] as const;
export type DecisionPanel = (typeof DECISIONS_PANEL)[number];

export interface Contestation {
  readonly id: string;
  readonly date_reception: string;
  readonly texte: string;
  readonly contestataire_type: TypeContestataire;
  readonly caviardage: boolean;
  readonly sources_nouvelles?: readonly Source[];
}

interface DecisionPanelPubliee {
  readonly date: string;
  readonly decision: DecisionPanel;
  readonly motivation: string;
  readonly opinions_dissidentes: readonly string[];
  readonly arbitre_seul: boolean;
  /** Le `statut_validation` de l'item juste avant cette décision : ce qu'une réintégration rend. */
  readonly statut_validation_anterieur: string;
}

/** §10 et annexe E (0.29, D71 (8)) : délibération sans majorité, publiée en ajout seul. */
export interface DeliberationPubliee {
  readonly date: string;
  readonly version_jugee: number;
  /** Une opinion par membre votant, désigné par son nom publié (§10) ; les déportés n'en ont pas. */
  readonly opinions: readonly { readonly membre: string; readonly vote: DecisionPanel; readonly motivation: string }[];
  readonly deportes: readonly string[];
}

export interface ContestationPubliee extends Contestation {
  readonly decision_panel?: DecisionPanelPubliee;
  readonly deliberations_sans_majorite?: readonly DeliberationPubliee[];
}

export interface DecisionDuPanel {
  readonly contestation_id: string;
  readonly decision: DecisionPanel;
  /** La version de l'item que le panel a jugée : une version dépassée est refusée. */
  readonly version_jugee: number;
  readonly motivation: string;
  readonly opinions_dissidentes: readonly string[];
  readonly arbitre_seul: boolean;
  /** Non vide si et seulement si la décision est « correction ». */
  readonly corrections: readonly Correction[];
  readonly date: string;
}

export interface TraceEcriture {
  readonly date: string;
  readonly commit: string;
}

/* ------------------------------------------------------------------ erreurs */

export class TexteContestationRefuse extends Error {
  constructor(detail: string) {
    super(`Texte de contestation refusé : ${detail}`);
    this.name = "TexteContestationRefuse";
  }
}

export class ContestationEnDouble extends Error {
  constructor(item_id: string, id: string) {
    super(`Item ${item_id} : la contestation ${id} est déjà enregistrée.`);
    this.name = "ContestationEnDouble";
  }
}

export class ContestationInexistante extends Error {
  constructor(item_id: string, id: string) {
    super(`Item ${item_id} : aucune contestation ${id}.`);
    this.name = "ContestationInexistante";
  }
}

export class ContestationDejaDecidee extends Error {
  constructor(item_id: string, id: string) {
    super(`Item ${item_id} : la contestation ${id} porte déjà une décision du panel, qui n'est jamais remplacée.`);
    this.name = "ContestationDejaDecidee";
  }
}

export class VersionJugeePerimee extends Error {
  constructor(item_id: string, jugee: number, courante: number) {
    super(`Item ${item_id} : le panel a jugé la version ${jugee}, l'item publié est en version ${courante}.`);
    this.name = "VersionJugeePerimee";
  }
}

export class CorrectionsDuPanelRefusees extends Error {
  constructor(item_id: string, motifs: readonly string[]) {
    super(`Item ${item_id} : corrections du panel refusées :\n${motifs.map((motif) => `  ${motif}`).join("\n")}`);
    this.name = "CorrectionsDuPanelRefusees";
  }
}

/**
 * L'item porte un statut de sortie (« retire_par_panel », « non_evaluable ») que ses décisions du
 * panel publiées n'expliquent pas : aucun statut n'est deviné pour le réintégrer.
 */
export class StatutPanelIncoherent extends Error {
  constructor(item_id: string, detail: string) {
    super(`Item ${item_id} : statut de validation incohérent avec les décisions du panel publiées : ${detail}.`);
    this.name = "StatutPanelIncoherent";
  }
}

/* -------------------------------------------------------------------- texte */

/**
 * Le texte publié d'une contestation : normalisé NFC (docs/CONTRATS.md), compté en points de
 * code. Au-delà de 1 000, refusé ; jamais tronqué (§4, 0.10).
 */
export function texteDeContestation(brut: string): string {
  const texte = brut.normalize("NFC");
  if (texte.trim().length === 0) throw new TexteContestationRefuse("texte vide.");
  const longueur = [...texte].length;
  if (longueur > LONGUEUR_MAX_CONTESTATION) {
    throw new TexteContestationRefuse(
      `${longueur} caractères, ${LONGUEUR_MAX_CONTESTATION} au plus (§4). Il n'est ni tronqué ni résumé : ` +
        `le contestataire est invité à envoyer une version de 1 000 caractères au plus ; le texte intégral va au dossier du panel.`,
    );
  }
  return texte;
}

/* ------------------------------------------------------------- contestation */

function requis<T>(valeur: readonly T[] | undefined, item: Item, cle: string): readonly T[] {
  if (valeur === undefined) throw new Error(`Item ${item.id} sans ${cle}[] : non conforme à item.schema.json`);
  return valeur;
}

export function contestationsDe(item: Item): readonly ContestationPubliee[] {
  return requis(item.contestations, item, "contestations") as readonly ContestationPubliee[];
}

export function entreeHistorique(item: Item, version: number, trace: TraceEcriture, changement: string, motif: string) {
  return [
    ...requis(item.historique, item, "historique"),
    { date: trace.date, changement, motif, commit: trace.commit, version_resultante: version },
  ];
}

export function ajouterContestation(item: Item, contestation: Contestation, trace: TraceEcriture): Item {
  const texte = texteDeContestation(contestation.texte);
  if (texte !== contestation.texte) throw new TexteContestationRefuse("texte non normalisé NFC par l'appelant.");
  const existantes = contestationsDe(item);
  if (existantes.some((existante) => existante.id === contestation.id)) throw new ContestationEnDouble(item.id, contestation.id);
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [...existantes, contestation],
    historique: entreeHistorique(item, item.version, trace, "contestation reçue", `contestation ${contestation.id}`),
  };
}

/** Délai de la décision, en jours entiers depuis la réception : publié, jamais une cause de refus. */
export function delaiDecisionJours(contestation: Contestation, date_decision: string): number {
  return ancienneteEnJours(contestation.date_reception, date_decision);
}

/* -------------------------------------------------------------------- panel */

const STATUT_VALIDATION_PAR_DECISION: ReadonlyMap<DecisionPanel, string | null> = new Map([
  ["maintien", null],
  ["correction", null],
  ["retrait", "retire_par_panel"],
  ["non_evaluabilite", "non_evaluable"],
]);

function controlerCible(item: Item, decision: DecisionDuPanel): ContestationPubliee {
  const cible = contestationsDe(item).find((contestation) => contestation.id === decision.contestation_id);
  if (cible === undefined) throw new ContestationInexistante(item.id, decision.contestation_id);
  if (cible.decision_panel !== undefined) throw new ContestationDejaDecidee(item.id, decision.contestation_id);
  if (decision.version_jugee !== item.version) throw new VersionJugeePerimee(item.id, decision.version_jugee, item.version);
  return cible;
}

/** Deux décisions différentes au même instant rendraient la dernière indéterminable (§5, tirage). */
function controlerSimultaneite(item: Item, decision: DecisionDuPanel): void {
  const instant = Date.parse(decision.date);
  for (const contestation of contestationsDe(item)) {
    const autre = contestation.decision_panel;
    if (autre === undefined || Date.parse(autre.date) !== instant || autre.decision === decision.decision) continue;
    throw new DecisionsPanelSimultanees(item.id, decision.date, [autre.decision, decision.decision].sort());
  }
}

function lirePointeur(item: Item, chemin: string): unknown {
  return chemin
    .split("/")
    .slice(1)
    .reduce<unknown>((noeud, segment) => (noeud as Record<string, unknown> | undefined)?.[segment], item);
}

function motifsCorrections(item: Item, decision: DecisionDuPanel, acces: AccesTexte): readonly string[] {
  const attendues = decision.decision === "correction";
  if (attendues !== decision.corrections.length > 0) {
    return ["une décision « correction » porte au moins une correction, et seule elle en porte"];
  }
  const motifs = decision.corrections
    .filter((correction) => correction.cible !== "item")
    .map((correction) => `${correction.chemin} : seul le contenu de l'item se corrige ici, pas la mesure`);
  const perimees = decision.corrections
    .filter((correction) => canoniser(lirePointeur(item, correction.chemin)) !== canoniser(correction.ancienne_valeur))
    .map((correction) => `${correction.chemin} : ancienne_valeur ne correspond plus à l'item publié`);
  const resultat = validerCorrections(decision.corrections.filter((correction) => correction.cible === "item"), acces);
  const refus: readonly RefusCorrection[] = resultat.ok ? [] : resultat.refus;
  return [...motifs, ...perimees, ...refus.map((un) => `${un.chemin} : ${un.motif}`)];
}

function contenuDecide(item: Item, decision: DecisionDuPanel): Item {
  if (decision.decision !== "correction") return item;
  const corrige = appliquerCorrections(item, decision.corrections);
  return { ...corrige, version: item.version + 1, empreinte: empreinteApresModification(item, corrige) };
}

/**
 * Le statut que pose une décision de sortie ; `null` pour une décision qui réintègre (maintien,
 * correction). Une décision hors énumération est un refus.
 */
function statutDeSortie(decision: string): string | null {
  const statut = STATUT_VALIDATION_PAR_DECISION.get(decision as DecisionPanel);
  if (statut === undefined) throw new Error(`Décision du panel hors énumération : ${decision}`);
  return statut;
}

interface DecisionAnterieure {
  readonly decision: string;
  readonly date: string;
  readonly statut_validation_anterieur: string;
  readonly instant: number;
}

/**
 * Frontière d'entrée : `Item.contestations` est lu du disque. Une décision publiée sans
 * `statut_validation_anterieur` ne permet pas de savoir ce qu'une réintégration rendrait.
 */
function decisionAnterieure(item: Item, publiee: DecisionPanelPubliee): DecisionAnterieure {
  const anterieur: unknown = publiee.statut_validation_anterieur;
  if (typeof anterieur !== "string") {
    throw new StatutPanelIncoherent(item.id, `décision « ${publiee.decision} » du ${publiee.date} sans statut_validation_anterieur`);
  }
  return { decision: publiee.decision, date: publiee.date, statut_validation_anterieur: anterieur, instant: instantDe(publiee.date) };
}

/**
 * Les décisions déjà publiées, de la plus récente à la plus ancienne. « Récente » s'entend sur
 * `decision_panel.date`, comme pour le tirage ; à instant égal, l'ordre du tableau départage.
 */
function decisionsAnterieures(item: Item): readonly DecisionAnterieure[] {
  return contestationsDe(item)
    .flatMap((contestation) => (contestation.decision_panel === undefined ? [] : [decisionAnterieure(item, contestation.decision_panel)]))
    .map((decision, rang) => ({ decision, rang }))
    .sort((a, b) => b.decision.instant - a.decision.instant || b.rang - a.rang)
    .map(({ decision }) => decision);
}

/**
 * Le statut d'avant la sortie `sortie`, `plusAnciennes` étant les décisions qui la précèdent, de
 * la plus récente à la plus ancienne. Des sorties consécutives (retrait puis non-évaluabilité) se
 * remontent : le statut antérieur de la seconde est celui que la première a posé, et c'est le
 * statut d'avant la première qui est rendu.
 */
function statutAvantLaSortie(sortie: DecisionAnterieure, plusAnciennes: readonly DecisionAnterieure[]): string {
  const [precedente, ...reste] = plusAnciennes;
  if (precedente === undefined) return sortie.statut_validation_anterieur;
  if (statutDeSortie(precedente.decision) !== sortie.statut_validation_anterieur) return sortie.statut_validation_anterieur;
  return statutAvantLaSortie(precedente, reste);
}

/**
 * Un statut que seule une décision du panel pose : le trouver sans décision de sortie qui l'explique
 * est une incohérence. « non_evaluable » n'en est pas : la promotion le pose aussi.
 */
const STATUTS_POSES_PAR_LE_SEUL_PANEL: ReadonlySet<string> = new Set(["retire_par_panel"]);

function statutHorsSortieDuPanel(item: Item): string {
  if (STATUTS_POSES_PAR_LE_SEUL_PANEL.has(item.statut_validation)) {
    throw new StatutPanelIncoherent(item.id, `« ${item.statut_validation} » sans décision de sortie du panel qui le pose`);
  }
  return item.statut_validation;
}

/**
 * Maintien ou correction : si le statut courant vient d'une sortie décidée par le panel (la
 * dernière décision publiée en est une), il est rendu tel qu'avant cette sortie ; sinon il reste.
 * Un « non_evaluable » posé par la promotion, sans sortie du panel, ne bouge donc pas.
 */
function statutReintegre(item: Item): string {
  const [derniere, ...plusAnciennes] = decisionsAnterieures(item);
  if (derniere === undefined) return statutHorsSortieDuPanel(item);
  const pose = statutDeSortie(derniere.decision);
  if (pose === null) return statutHorsSortieDuPanel(item);
  if (pose !== item.statut_validation) {
    throw new StatutPanelIncoherent(
      item.id,
      `« ${item.statut_validation} » alors que la dernière décision du panel (${derniere.decision}, ${derniere.date}) pose « ${pose} »`,
    );
  }
  return statutAvantLaSortie(derniere, plusAnciennes);
}

function statutValidation(item: Item, decision: DecisionPanel): string {
  const sortie = statutDeSortie(decision);
  return sortie === null ? statutReintegre(item) : sortie;
}

function publier(decision: DecisionDuPanel, item: Item): DecisionPanelPubliee {
  return {
    date: decision.date,
    decision: decision.decision,
    motivation: decision.motivation,
    opinions_dissidentes: decision.opinions_dissidentes,
    arbitre_seul: decision.arbitre_seul,
    statut_validation_anterieur: item.statut_validation,
  };
}

export interface ResultatPanel {
  readonly item: Item;
  /** À passer à `reecrireItem` : une correction du panel autorise la liste blanche, rien d'autre. */
  readonly autorisation: AutorisationReecriture;
}

export function appliquerDecisionPanel(
  item: Item,
  decision: DecisionDuPanel,
  trace: TraceEcriture,
  acces: AccesTexte,
): ResultatPanel {
  const cible = controlerCible(item, decision);
  controlerSimultaneite(item, decision);
  const motifs = motifsCorrections(item, decision, acces);
  if (motifs.length > 0) throw new CorrectionsDuPanelRefusees(item.id, motifs);

  const contenu = contenuDecide(item, decision);
  const contestations = contestationsDe(item).map((contestation) =>
    contestation.id === cible.id ? { ...contestation, decision_panel: publier(decision, item) } : contestation,
  );
  const toutesDecidees = contestations.every((contestation) => contestation.decision_panel !== undefined);
  return {
    item: {
      ...contenu,
      statut_validation: statutValidation(item, decision.decision),
      statut_contestation: toutesDecidees ? "arbitree" : "contestee",
      contestations,
      historique: entreeHistorique(
        item,
        contenu.version,
        trace,
        `décision du panel : ${decision.decision}`,
        `contestation ${cible.id}, délai ${delaiDecisionJours(cible, decision.date)} jour(s)`,
      ),
    },
    autorisation: { corrections: decision.decision === "correction" },
  };
}
