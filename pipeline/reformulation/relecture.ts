/**
 * Relecture des formulations : quelle proposition relire, ce que devient une relecture favorable,
 * ce que porte un refus (décisions D39 et D42 de l'auteur du 2026-10-15). Fonctions pures : la
 * lecture de `staging/formulations/`, l'écriture de `data/formulations/` et le journal des refus
 * vivent dans `validation/io/`, les routes dans `validation/serveur/formulations.ts`.
 *
 * §5 : « Les formulations sont produites par un modèle puis relues par un annotateur qui vérifie
 * qu'elles ne changent pas le sens. » D42 (2) : la neutre, écrite par le gabarit, est relue avec les
 * deux autres. D42 (3) : la position que la prémisse de l'orientée doit affirmer est fixée par une
 * règle (`position-affirmee.ts`) ; le relecteur la vérifie, il ne la choisit jamais.
 *
 * Règle 7 en esprit : les textes du modèle sont recopiés tels quels, octet pour octet. Une coquille
 * se refuse et appelle un nouvel appel ; elle ne se corrige pas ici.
 */

import { sha256 } from "../../validation/domaine/empreinte.ts";
import { neutreSuitVersionGabarits, empreintesSuiventTextes, type Violation } from "../questions/invariants.ts";
import { instantDe } from "../questions/reponse-attendue.ts";
import type { Formulation, QuestionEngendree, Registre } from "../questions/types.ts";
import { REGISTRES } from "../questions/types.ts";
import { AUCUNE, type PositionAffirmable, type PositionDemandee } from "./position-affirmee.ts";
import type { IssueProposition, PropositionFormulation } from "./staging.ts";

/* ------------------------------------------------------------------ types */

/** `schema/proposition-formulation.schema.json`, issue `acceptee`. Le type de la proposition est celui de `staging.ts`. */
export type IssueAcceptee = Extract<IssueProposition, { readonly statut: "acceptee" }>;

export interface PropositionAcceptee extends PropositionFormulation {
  readonly issue: IssueAcceptee;
}

/**
 * Une question engendrée et la position que sa prémisse doit affirmer AUJOURD'HUI, recalculée sur
 * l'item courant par `position-affirmee.ts:positionAffirmeeDemandee` (décision de l'auteur, Q1
 * option (a)). `entrees.ts:Tache` en est une : sa demande est construite sur l'item courant.
 */
export interface QuestionCourante {
  readonly question: QuestionEngendree;
  readonly demande: { readonly position_affirmee: PositionDemandee };
}

/** `schema/formulations-validees.schema.json` : `data/formulations/<question_id>.json`. */
export interface FormulationsValidees {
  readonly question_id: string;
  readonly empreinte_texte_neutre: string;
  readonly version_gabarits: string;
  readonly proposition_id: string;
  readonly formulations: readonly Formulation[];
}

/** `schema/refus-formulation.schema.json` : une ligne de `validation/formulations/refus.jsonl`. */
export interface RefusFormulation {
  readonly proposition_id: string;
  readonly question_id: string;
  readonly empreinte_texte_neutre: string;
  readonly annotateur_id: string;
  readonly date: string;
  readonly registres: readonly Registre[];
  readonly premisse_conforme: boolean;
  readonly commentaire: string;
}

/**
 * Les quatre cases de l'écran, telles que le relecteur les a laissées. Aucune n'a de valeur par
 * défaut : une case absente de la requête est refusée par le serveur avant d'arriver ici.
 */
export interface CasesRelecture {
  readonly sens_preserve: Readonly<Record<Registre, boolean>>;
  /** « La prémisse affirme bien : <position demandée> », ou « aucune position » si AUCUNE. */
  readonly premisse_conforme: boolean;
}

/** Ce qui identifie une relecture : qui, quand, et le commentaire s'il y en a un. */
export interface Relecteur {
  readonly annotateur_id: string;
  readonly date: string;
}

/* ---------------------------------------------------------------- erreurs */

export class PropositionHorsQuestion extends Error {
  constructor(proposition: PropositionFormulation, question_id: string, motif: string) {
    super(`Proposition ${proposition.id} (question ${proposition.question_id}) relue pour la question ${question_id} : ${motif}.`);
    this.name = "PropositionHorsQuestion";
  }
}

/** La sortie acceptée ne porte pas la position que la demande exigeait : le contrôle a laissé passer. */
export class PropositionIncoherente extends Error {
  constructor(proposition: PropositionFormulation, detail: string) {
    super(`Proposition ${proposition.id} incohérente : ${detail}. Rien n'est promu.`);
    this.name = "PropositionIncoherente";
  }
}

/**
 * Décision de l'auteur (Q1, option (a)) : la position demandée est recalculée sur l'item courant.
 * Un item corrigé sans que le texte neutre change (P passé de « pour » à « contre », état antérieur
 * d'un O modifié) rend périmée une proposition demandée sur l'ancienne position.
 */
export class PropositionPerimee extends Error {
  constructor(proposition: PropositionFormulation, courante: PositionDemandee) {
    super(
      `Proposition ${proposition.id} demandée avec la position « ${proposition.demande.position_affirmee} », alors ` +
        `que la règle de D42 (3) donne « ${courante} » sur l'item courant. Rien n'est promu.`,
    );
    this.name = "PropositionPerimee";
  }
}

/** Le schéma admet « sans_objet » sur une position ; aucune prémisse ne l'affirme (D42 (3)). */
export class PositionPromueNonAffirmable extends Error {
  constructor(question_id: string) {
    super(`data/formulations/${question_id}.json : l'orientée porte la position « sans_objet », qu'aucune prémisse n'affirme.`);
    this.name = "PositionPromueNonAffirmable";
  }
}

export class InvariantsFormulationsEnDefaut extends Error {
  readonly violations: readonly Violation[];

  constructor(violations: readonly Violation[]) {
    super(
      `Formulations non promouvables :\n${violations.map((violation) => `  ${violation.objet} — ${violation.invariant} : ${violation.detail}`).join("\n")}`,
    );
    this.name = "InvariantsFormulationsEnDefaut";
    this.violations = violations;
  }
}

export class PromotionAvecCaseNonCochee extends Error {
  constructor(cases: readonly string[]) {
    super(`Promotion refusée : case(s) non cochée(s) : ${cases.join(", ")}. Une relecture défavorable se refuse, avec un commentaire.`);
    this.name = "PromotionAvecCaseNonCochee";
  }
}

export class RefusSansCommentaire extends Error {
  constructor() {
    super("Refus sans commentaire : dire ce qui change le sens est obligatoire.");
    this.name = "RefusSansCommentaire";
  }
}

export class RefusSansMotif extends Error {
  constructor() {
    super("Refus alors que les quatre cases sont cochées : rien n'est en cause. Promouvoir, ou décocher ce qui change le sens.");
    this.name = "RefusSansMotif";
  }
}

/* ------------------------------------------------------- quoi relire */

export function estAcceptee(proposition: PropositionFormulation): proposition is PropositionAcceptee {
  return proposition.issue.statut === "acceptee";
}

/** Ordre de relecture : `appel.date` (instant, décalage compris), puis `id` à date égale. */
function plusRecente(a: PropositionAcceptee, b: PropositionAcceptee): PropositionAcceptee {
  const ecart = instantDe(a.appel.date) - instantDe(b.appel.date);
  if (ecart !== 0) return ecart > 0 ? a : b;
  return a.id > b.id ? a : b;
}

/**
 * D39 : la proposition à relire pour cette question, ou `null`. Seule une proposition acceptée,
 * faite sur le texte neutre courant (même empreinte), demandée avec la position que la règle de
 * D42 (3) donne sur l'item courant (Q1, option (a)), et jamais refusée, est relisible ; entre
 * plusieurs, la plus récente par `appel.date`, puis par `id`.
 */
export function propositionRelisible(
  courante: QuestionCourante,
  propositions: readonly PropositionFormulation[],
  refusees: ReadonlySet<string>,
): PropositionAcceptee | null {
  const { question } = courante;
  const empreinte = sha256(question.texte_neutre);
  const retenues = propositions
    .filter(estAcceptee)
    .filter((proposition) => proposition.question_id === question.id)
    .filter((proposition) => proposition.empreinte_texte_neutre === empreinte)
    .filter((proposition) => proposition.demande.position_affirmee === courante.demande.position_affirmee)
    .filter((proposition) => !refusees.has(proposition.id));
  if (retenues.length === 0) return null;
  return retenues.reduce(plusRecente);
}

/** La position que porte l'orientée promue : la sienne, ou AUCUNE quand elle n'en porte pas (D42 (3)). */
export function positionPromue(valeur: Pick<FormulationsValidees, "question_id" | "formulations">): PositionDemandee {
  const position = valeur.formulations.find((formulation) => formulation.registre === "oriente")?.position_affirmee;
  if (position === undefined) return AUCUNE;
  if (position === "sans_objet") throw new PositionPromueNonAffirmable(valeur.question_id);
  return position;
}

/** Clé d'une promotion : le texte neutre relu, et la position que la prémisse de l'orientée affirme. */
export interface ClePromotion {
  readonly empreinte_texte_neutre: string;
  readonly position: PositionDemandee;
}

export function clePromotion(valeur: FormulationsValidees): ClePromotion {
  return { empreinte_texte_neutre: valeur.empreinte_texte_neutre, position: positionPromue(valeur) };
}

/**
 * La seule égalité de `ClePromotion` du dépôt (constat 10, revue du 2026-10-17) : même texte
 * neutre relu, même position affirmée. Reprise, relecture, gel et écriture s'y appuient partout où
 * ils comparent deux clés de promotion, pour qu'une évolution ne les désaccorde pas en silence.
 */
export function clePromotionEgale(a: ClePromotion, b: ClePromotion): boolean {
  return a.empreinte_texte_neutre === b.empreinte_texte_neutre && a.position === b.position;
}

/** Vrai si la promotion porte sur le texte neutre courant ET sur la position demandée courante. */
export function promotionEnVigueur(cle: ClePromotion | undefined, courante: QuestionCourante): boolean {
  if (cle === undefined) return false;
  return clePromotionEgale(cle, { empreinte_texte_neutre: sha256(courante.question.texte_neutre), position: courante.demande.position_affirmee });
}

export interface ARelire {
  readonly question: QuestionEngendree;
  readonly proposition: PropositionAcceptee;
}

/**
 * Les questions à relire, triées par identifiant : une proposition relisible, et pas déjà promue
 * sur le texte neutre et la position courants (`promues` : `question_id` → clé de la promotion).
 * Une promotion dont la position est périmée (item corrigé, texte neutre inchangé) ne retient plus
 * la question : une proposition demandée sur la position courante se relit.
 */
export function questionsARelire(
  courantes: readonly QuestionCourante[],
  propositions: readonly PropositionFormulation[],
  refus: readonly Pick<RefusFormulation, "proposition_id">[],
  promues: ReadonlyMap<string, ClePromotion>,
): readonly ARelire[] {
  const refusees = new Set(refus.map((ligne) => ligne.proposition_id));
  return [...courantes]
    .filter((courante) => !promotionEnVigueur(promues.get(courante.question.id), courante))
    .sort((a, b) => (a.question.id < b.question.id ? -1 : 1))
    .flatMap((courante) => {
      const proposition = propositionRelisible(courante, propositions, refusees);
      return proposition === null ? [] : [{ question: courante.question, proposition }];
    });
}

/* ---------------------------------------------------- relecture favorable */

/** Les cases non cochées, nommées. Aucune case n'a de valeur par défaut. */
export function casesNonCochees(cases: CasesRelecture): readonly string[] {
  return [
    ...REGISTRES.filter((registre) => !cases.sens_preserve[registre]).map((registre) => `sens préservé (${registre})`),
    ...(cases.premisse_conforme ? [] : ["prémisse conforme à la position demandée"]),
  ];
}

function exigerMemeQuestion(courante: QuestionCourante, proposition: PropositionAcceptee): void {
  const { question } = courante;
  if (proposition.question_id !== question.id) throw new PropositionHorsQuestion(proposition, question.id, "autre question");
  if (proposition.empreinte_texte_neutre !== sha256(question.texte_neutre)) {
    throw new PropositionHorsQuestion(proposition, question.id, "faite sur un autre texte neutre que le texte courant");
  }
  if (sha256(proposition.texte_neutre) !== proposition.empreinte_texte_neutre) {
    throw new PropositionIncoherente(proposition, "empreinte_texte_neutre n'est pas le sha256 de texte_neutre");
  }
  if (proposition.demande.position_affirmee !== courante.demande.position_affirmee) {
    throw new PropositionPerimee(proposition, courante.demande.position_affirmee);
  }
}

/** D42 (3) : la position recopiée sur l'orientée est celle de la demande, ou aucune pour AUCUNE. */
function positionDeLOrientee(proposition: PropositionAcceptee): PositionAffirmable | undefined {
  const demandee = proposition.demande.position_affirmee;
  const portee = proposition.issue.oriente.position_affirmee;
  const attendue = demandee === AUCUNE ? undefined : demandee;
  if (portee !== attendue) {
    throw new PropositionIncoherente(
      proposition,
      `l'orientée porte la position « ${String(portee)} » alors que la demande était « ${demandee} »`,
    );
  }
  return attendue;
}

function formulation(
  id: string,
  registre: Registre,
  texte: string,
  production: Formulation["production"],
  relecture: Formulation["relecture"],
): Formulation {
  return { id, registre, texte, empreinte_texte: sha256(texte), production, relecture };
}

/**
 * Les trois formulations relues d'une question, prêtes pour `data/formulations/`. Les textes sont
 * ceux de la proposition, tels quels ; la neutre est produite par la table de gabarits (D42 (2)),
 * les deux autres par le modèle de la proposition. `identifiant` fournit les ULID des formulations.
 * Lève si une case n'est pas cochée, si la proposition ne porte pas sur le texte neutre courant de
 * la question ou n'a pas été demandée avec la position courante (`PropositionPerimee`), ou si un
 * invariant hors schéma est violé.
 */
export function formulationsValideesDe(
  courante: QuestionCourante,
  proposition: PropositionAcceptee,
  cases: CasesRelecture,
  relecture: Relecteur & { readonly commentaire: string | null },
  identifiant: () => string,
): FormulationsValidees {
  const manquantes = casesNonCochees(cases);
  if (manquantes.length > 0) throw new PromotionAvecCaseNonCochee(manquantes);
  exigerMemeQuestion(courante, proposition);
  const { question } = courante;
  const position_affirmee = positionDeLOrientee(proposition);
  const lue: Formulation["relecture"] = {
    annotateur_id: relecture.annotateur_id,
    date: relecture.date,
    sens_preserve: true,
    ...(relecture.commentaire === null ? {} : { commentaire: relecture.commentaire }),
  };
  const oriente = formulation(identifiant(), "oriente", proposition.issue.oriente.texte, proposition.production, lue);
  const valeur: FormulationsValidees = {
    question_id: question.id,
    empreinte_texte_neutre: proposition.empreinte_texte_neutre,
    version_gabarits: proposition.version_gabarits,
    proposition_id: proposition.id,
    formulations: [
      formulation(identifiant(), "neutre", proposition.texte_neutre, { gabarits: proposition.version_gabarits }, lue),
      formulation(identifiant(), "familier", proposition.issue.familier.texte, proposition.production, lue),
      position_affirmee === undefined ? oriente : { ...oriente, position_affirmee },
    ],
  };
  exigerInvariants(valeur, question);
  return valeur;
}

/** Les invariants que JSON Schema ne sait pas exprimer, vérifiés avant toute écriture. */
export function exigerInvariants(valeur: FormulationsValidees, question: Pick<QuestionEngendree, "id" | "version_gabarits">): void {
  const violations = [
    ...neutreSuitVersionGabarits([valeur], new Map([[question.id, question.version_gabarits]])),
    ...empreintesSuiventTextes([valeur]),
  ];
  if (violations.length > 0) throw new InvariantsFormulationsEnDefaut(violations);
}

/* ----------------------------------------------------- relecture défavorable */

/** Registres en cause : sens non préservé, et l'orientée quand sa prémisse n'est pas conforme. */
export function registresEnCause(cases: CasesRelecture): readonly Registre[] {
  return REGISTRES.filter(
    (registre) => !cases.sens_preserve[registre] || (registre === "oriente" && !cases.premisse_conforme),
  );
}

/** Une ligne du journal des refus. Commentaire obligatoire, au moins un registre en cause. */
export function refusDe(
  proposition: PropositionAcceptee,
  cases: CasesRelecture,
  relecteur: Relecteur,
  commentaire: string,
): RefusFormulation {
  if (commentaire.trim().length === 0) throw new RefusSansCommentaire();
  const registres = registresEnCause(cases);
  if (registres.length === 0) throw new RefusSansMotif();
  return {
    proposition_id: proposition.id,
    question_id: proposition.question_id,
    empreinte_texte_neutre: proposition.empreinte_texte_neutre,
    annotateur_id: relecteur.annotateur_id,
    date: relecteur.date,
    registres,
    premisse_conforme: cases.premisse_conforme,
    commentaire,
  };
}
