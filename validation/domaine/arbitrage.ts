/**
 * Arbitrage des désaccords d'annotation (§4, règle de concordance) : la logique, sans le disque.
 *
 * Un item que la règle de concordance envoie en arbitrage n'en sort que par une **décision
 * enregistrée** dans le registre publié `validation/arbitrage/decisions.json` (`pnpm arbitrer`).
 * La promotion reste l'affaire de `pnpm promote` : `evaluerAvecArbitrage` recalcule le sort de
 * l'item exactement comme `evaluerPromotion`, puis, s'il est en arbitrage, cherche la décision qui
 * le vise et ne l'applique que si elle porte sur la même version, la même empreinte, le même lot
 * et le même désaccord — sinon l'item reste en arbitrage, et le rapport dit pourquoi.
 *
 * Trois règles du §4 tenues ici :
 *
 * - **Qui tranche.** Un désaccord ordinaire est tranché par l'auteur ; la paire « non évaluable »
 *   face à « rejeter » l'est par le panel, et par l'auteur marqué `arbitre_seul` tant que le panel
 *   n'est pas constitué (§10).
 * - **L'arbitre ne rédige rien.** Il choisit un contenu proposé par un annotateur : `original`
 *   (proposé par un « accepter »), `correction:<annotateur>` ou `paraphrase:<annotateur>` (la
 *   seconde pour un arbitrage « paraphrase seule », seulement). Un contenu proposé sur une autre
 *   version de l'item n'est pas proposé pour celle-ci. Si aucun ne convient, il rejette.
 * - **Un item A n'est vérifié que si les deux annotateurs ont confirmé l'absence**, arbitrage ou non ;
 *   un item F, que s'ils ont tous deux confirmé la fictivité (§4, conformité 2026-11-03 n° 2).
 *   De même, un item dont une source de contenu est T2 n'est vérifié que si les deux ont écouté
 *   l'extrait et jugé la transcription fidèle (conformité n° 12) : l'arbitre ne l'écoute pas à leur place.
 */

import { porteUneSourceT2, sourcesDuContenu, transcriptionEcouteeParLesDeux } from "./ecoute-t2.ts";
import { canoniser } from "./empreinte.ts";
import {
  appliquerCorrections,
  appliquerValidations,
  evaluerPromotion,
  type Dossier,
  type Issue,
  type IssueArbitrage,
  type IssuePromouvoir,
  type MotifArbitrage,
  type OptionsPromotion,
} from "./promotion.ts";
import type { Arbitre, BlocArbitrage, EntreeDecision, IssueDecisionArbitrage, Item, MotifRejet } from "./types.ts";

export interface DecisionArbitrage {
  readonly id: string;
  readonly item_id: string;
  readonly lot_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly motif: MotifArbitrage;
  readonly issue: IssueDecisionArbitrage;
  /** Présent si et seulement si l'issue est `verifie`. */
  readonly contenu_retenu?: string;
  /**
   * §4 (protocole 0.27) : « quand le rejet est tranché par l'arbitre, sa décision porte le motif
   * comme celle d'un annotateur ». Sur l'issue `rejete` seulement ; renvoie les sources de contenu
   * de l'item à la réextraction (`renvoi-reextraction.ts`).
   */
  readonly motif_rejet?: MotifRejet;
  readonly arbitre: Arbitre;
  readonly arbitre_seul: boolean;
  readonly motivation: string;
  readonly date: string;
}

export type RegistreArbitrage = readonly DecisionArbitrage[];

export type InstanceArbitrage = "auteur" | "panel";

export class DecisionArbitrageRefusee extends Error {
  readonly motifs: readonly string[];

  constructor(item_id: string, motifs: readonly string[]) {
    super(`Décision d'arbitrage refusée pour l'item ${item_id} :\n${motifs.map((motif) => `  ${motif}`).join("\n")}`);
    this.name = "DecisionArbitrageRefusee";
    this.motifs = motifs;
  }
}

/* --------------------------------------------------------------- qui tranche */

/** §4 : « la paire « non évaluable » face à « rejeter » l'est par le panel ». */
export function instanceArbitrage(decisions: readonly EntreeDecision[]): InstanceArbitrage {
  const sens = new Set(decisions.map((decision) => decision.decision));
  return sens.size === 2 && sens.has("non_evaluable") && sens.has("rejeter") ? "panel" : "auteur";
}

function arbitreAdmis(instance: InstanceArbitrage, decision: DecisionArbitrage): boolean {
  if (instance === "auteur") return decision.arbitre === "auteur" && !decision.arbitre_seul;
  if (decision.arbitre === "panel") return !decision.arbitre_seul;
  return decision.arbitre_seul;
}

function motifArbitre(instance: InstanceArbitrage, decision: DecisionArbitrage): readonly string[] {
  if (arbitreAdmis(instance, decision)) return [];
  return instance === "auteur"
    ? ["désaccord ordinaire : tranché par l'auteur (arbitre = auteur, sans arbitre_seul)"]
    : ["paire « non évaluable » / « rejeter » : tranchée par le panel, ou par l'auteur marqué arbitre_seul (§10)"];
}

/* ---------------------------------------------------------- contenu retenu */

function jugeVersionCourante(decision: EntreeDecision, item: Item): boolean {
  return decision.item_version === item.version && decision.item_empreinte === item.empreinte;
}

type ContenuResolu = { readonly item: Item } | { readonly refus: string };

const FORME_RETENU = /^(original|correction|paraphrase)(?::([a-z0-9][a-z0-9_-]*))?$/;

function contenuOriginal(dossier: Dossier): ContenuResolu {
  const propose = dossier.decisions.some(
    (decision) => decision.decision === "accepter" && jugeVersionCourante(decision, dossier.item),
  );
  if (propose) return { item: dossier.item };
  return { refus: "contenu « original » proposé par aucun « accepter » sur la version courante de l'item" };
}

function refusCorrection(genre: string, motif: MotifArbitrage): string | null {
  if (genre === "paraphrase" && motif !== "paraphrase_seule") {
    return "« paraphrase:<annotateur> » ne se retient que pour un arbitrage « paraphrase seule »";
  }
  if (genre === "correction" && motif === "paraphrase_seule") {
    return "arbitrage « paraphrase seule » : le contenu se retient par « paraphrase:<annotateur> »";
  }
  return null;
}

function contenuCorrige(dossier: Dossier, motif: MotifArbitrage, genre: string, annotateur: string): ContenuResolu {
  const incompatible = refusCorrection(genre, motif);
  if (incompatible !== null) return { refus: incompatible };
  const decision = dossier.decisions.find((candidate) => candidate.annotateur_id === annotateur);
  if (decision === undefined) return { refus: `aucune décision de l'annotateur ${annotateur} sur cet item` };
  if (decision.decision !== "corriger") return { refus: `l'annotateur ${annotateur} n'a proposé aucune correction` };
  if (!jugeVersionCourante(decision, dossier.item)) {
    return { refus: `la correction de ${annotateur} porte sur une autre version de l'item` };
  }
  return { item: appliquerCorrections(dossier.item, decision.corrections) };
}

/** Le contenu que l'arbitre retient, tel qu'un annotateur l'a proposé ; jamais un contenu rédigé. */
export function contenuRetenu(dossier: Dossier, motif: MotifArbitrage, retenu: string): ContenuResolu {
  const forme = FORME_RETENU.exec(retenu);
  if (forme === null) return { refus: `contenu retenu illisible : ${JSON.stringify(retenu)}` };
  const [, genre, annotateur] = forme as unknown as [string, string, string | undefined];
  if (genre === "original") {
    return annotateur === undefined ? contenuOriginal(dossier) : { refus: "« original » ne nomme aucun annotateur" };
  }
  if (annotateur === undefined) return { refus: `« ${genre} » doit nommer un annotateur : ${genre}:<annotateur>` };
  return contenuCorrige(dossier, motif, genre, annotateur);
}

/* ------------------------------------------------------------ applicabilité */

function motifsEpinglage(dossier: Dossier, motif: MotifArbitrage, decision: DecisionArbitrage): readonly string[] {
  const motifs: string[] = [];
  if (decision.item_id !== dossier.item.id) motifs.push(`décision prise pour l'item ${decision.item_id}`);
  if (decision.lot_id !== dossier.lot_id) motifs.push(`décision prise dans le lot ${decision.lot_id}, pas ${dossier.lot_id}`);
  if (decision.item_version !== dossier.item.version || decision.item_empreinte !== dossier.item.empreinte) {
    motifs.push(`décision prise sur la version ${decision.item_version} de l'item, dépassée (version courante ${dossier.item.version})`);
  }
  if (decision.motif !== motif) motifs.push(`décision prise sur le motif « ${decision.motif} », l'item est en « ${motif} »`);
  return motifs;
}

function absenceConfirmeeParLesDeux(dossier: Dossier): boolean {
  return dossier.decisions.every((decision) => decision.questions_specifiques?.confirmation_absence === true);
}

function fictiviteConfirmeeParLesDeux(dossier: Dossier): boolean {
  return dossier.decisions.every((decision) => decision.questions_specifiques?.fictivite_verifiee === true);
}

/**
 * §4 (protocole 0.27) : le motif de rejet de l'arbitre est celui d'un annotateur, avec les mêmes
 * bornes (`decision.ts:controlerMotifRejet`) : un rejet seulement, sur un item qui a une source de
 * contenu.
 */
function motifsRejet(dossier: Dossier, decision: DecisionArbitrage): readonly string[] {
  if (decision.motif_rejet === undefined) return [];
  if (decision.issue !== "rejete") return ["un motif de rejet ne se porte que sur l'issue « rejete »"];
  if (sourcesDuContenu(dossier.item).length === 0) {
    return ["motif « texte extrait erroné » sans objet : l'item n'a aucune source de contenu (§4)"];
  }
  return [];
}

/** Ce que les deux annotateurs doivent avoir confirmé pour que l'arbitre puisse vérifier l'item. */
function confirmationsManquantes(dossier: Dossier): readonly string[] {
  if (dossier.item.type === "A" && !absenceConfirmeeParLesDeux(dossier)) {
    return ["item A : vérifié seulement si les deux annotateurs ont confirmé l'absence (§4)"];
  }
  if (dossier.item.type === "F" && !fictiviteConfirmeeParLesDeux(dossier)) {
    return ["item F : vérifié seulement si les deux annotateurs ont confirmé la fictivité (§4)"];
  }
  if (porteUneSourceT2(dossier.item) && !transcriptionEcouteeParLesDeux(dossier.decisions)) {
    return ["source T2 : vérifié seulement si les deux annotateurs ont écouté l'extrait et jugé la transcription fidèle (§4, §9)"];
  }
  return [];
}

function motifsIssue(dossier: Dossier, motif: MotifArbitrage, decision: DecisionArbitrage): readonly string[] {
  if (decision.issue !== "verifie") {
    return decision.contenu_retenu === undefined ? [] : ["un contenu ne se retient que pour l'issue « verifie »"];
  }
  const manquantes = confirmationsManquantes(dossier);
  if (manquantes.length > 0) return manquantes;
  if (decision.contenu_retenu === undefined) return ["l'issue « verifie » exige un contenu retenu"];
  const resolu = contenuRetenu(dossier, motif, decision.contenu_retenu);
  return "refus" in resolu ? [resolu.refus] : [];
}

/**
 * Pourquoi une décision ne s'applique pas à l'item tel qu'il est en arbitrage ; vide si elle
 * s'applique. Sert à l'enregistrement (`pnpm arbitrer`) comme à la promotion (`pnpm promote`).
 */
export function motifsInapplicable(dossier: Dossier, motif: MotifArbitrage, decision: DecisionArbitrage): readonly string[] {
  return [
    ...motifsEpinglage(dossier, motif, decision),
    ...motifArbitre(instanceArbitrage(dossier.decisions), decision),
    ...motifsIssue(dossier, motif, decision),
    ...motifsRejet(dossier, decision),
  ];
}

/** La décision qui fait foi pour un item : la dernière du registre, dans l'ordre d'ajout. */
export function decisionEnVigueur(registre: RegistreArbitrage, item_id: string): DecisionArbitrage | null {
  const visant = registre.filter((decision) => decision.item_id === item_id);
  const derniere = visant[visant.length - 1];
  return derniere === undefined ? null : derniere;
}

/* --------------------------------------------------------------- promotion */

function blocArbitrage(decision: DecisionArbitrage): BlocArbitrage {
  return {
    decision_id: decision.id,
    date: decision.date,
    arbitre: decision.arbitre,
    arbitre_seul: decision.arbitre_seul,
    motif: decision.motif,
    issue: decision.issue,
    ...(decision.motif_rejet === undefined ? {} : { motif_rejet: decision.motif_rejet }),
    motivation: decision.motivation,
  };
}

function contenuFinal(dossier: Dossier, motif: MotifArbitrage, decision: DecisionArbitrage): Item {
  if (decision.contenu_retenu === undefined) return dossier.item;
  const resolu = contenuRetenu(dossier, motif, decision.contenu_retenu);
  if ("refus" in resolu) throw new DecisionArbitrageRefusee(dossier.item.id, [resolu.refus]);
  return resolu.item;
}

function promouvoirParArbitrage(
  dossier: Dossier,
  motif: MotifArbitrage,
  decision: DecisionArbitrage,
  options: OptionsPromotion,
): IssuePromouvoir {
  const contenu = contenuFinal(dossier, motif, decision);
  const modifie = canoniser(contenu) !== canoniser(dossier.item);
  const trace = {
    changement: "promotion vers data/ après arbitrage",
    motif: `lot ${dossier.lot_id}, décision d'arbitrage ${decision.id} (${motif})`,
    arbitrage: blocArbitrage(decision),
  };
  return {
    sort: "promouvoir",
    statut: decision.issue,
    item: appliquerValidations(dossier, contenu, decision.issue, options, modifie, trace),
    corrections_appliquees: modifie,
  };
}

/**
 * Le sort d'un item, arbitrage compris : celui de `evaluerPromotion`, sauf pour un item en
 * arbitrage que vise une décision applicable du registre, qui est alors promu selon elle.
 */
export function evaluerAvecArbitrage(dossier: Dossier, registre: RegistreArbitrage, options: OptionsPromotion): Issue {
  const issue = evaluerPromotion(dossier, options);
  if (issue.sort !== "arbitrage") return issue;
  const decision = decisionEnVigueur(registre, dossier.item.id);
  if (decision === null) return issue;
  const motifs = motifsInapplicable(dossier, issue.motif, decision);
  if (motifs.length > 0) return { ...issue, decision_inapplicable: { decision_id: decision.id, motifs } } satisfies IssueArbitrage;
  return promouvoirParArbitrage(dossier, issue.motif, decision, options);
}
