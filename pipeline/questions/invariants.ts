/**
 * Les invariants inter-fichiers que JSON Schema ne peut pas exprimer.
 *
 * `docs/DETTE.md`, entrée « JSON Schema », point 1 : JSON Schema valide un fichier à la fois.
 * Une divergence sur `grappe_id` fausse les grappes du bootstrap du §8, donc tous les
 * intervalles de confiance publiés, sans qu'aucune validation n'échoue. Un `contexte` mal
 * recopié fait entrer une réponse contrefactuelle dans une métrique primaire.
 *
 * Chaque fonction rend la LISTE des violations, jamais un booléen : un contrôle qui dit
 * seulement « non » oblige à relire tout le corpus pour trouver l'objet fautif.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { fictifsEnDouble, type ItemFictifCandidat } from "../../validation/domaine/fictif-unique.ts";
import { gabaritParCode } from "./gabarits.ts";
import {
  PremisseHorsEnsemble,
  PremisseNonNotee,
  positionAffirmee,
  positionsPossibles,
  verdictDePremisse,
} from "./reponse-attendue.ts";
import type { CodeGabarit, Item, Mesure, Position } from "./types.ts";

export interface Violation {
  readonly invariant: string;
  /** Identifiant de l'objet fautif, tel qu'il figure dans le fichier. */
  readonly objet: string;
  readonly detail: string;
}

/* ------------------------------------------------- 1. grappe et principal */

export interface PorteurDeGrappe {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly grappe_id: string;
  readonly items: readonly {
    readonly reference: { readonly item_id: string };
    readonly role: string;
  }[];
}

/** Ce que l'invariant lit d'un item : sa mesure, grappe d'une question d'attribution. */
export interface ItemDeMesure {
  readonly id: string;
  readonly mesure_id: string;
}

const INVARIANT_GRAPPE = "grappe_id est l'item principal, ou la mesure d'une question d'attribution";

/**
 * Vaut pour `question.items[]` comme pour `tirage.entrees[].items_au_gel[]`. §5 et §8 (protocole
 * 0.9) : la grappe d'une question qui nomme un candidat est son item principal, unique ; celle
 * d'une question d'attribution (donnée `nomme_candidat` de la table, jamais le code) est la mesure
 * commune de ses items, avec au plus un item principal (l'item F d'une mesure fictive).
 */
export function grappeSuitItemPrincipal(
  porteurs: readonly PorteurDeGrappe[],
  items: readonly ItemDeMesure[],
): readonly Violation[] {
  const mesures = new Map(items.map((item) => [item.id, item.mesure_id]));
  return porteurs.flatMap((porteur) =>
    gabaritParCode(porteur.gabarit).nomme_candidat
      ? violationDeGrappe(porteur)
      : violationDeGrappeAttribution(porteur, mesures),
  );
}

function violationDeGrappeAttribution(
  porteur: PorteurDeGrappe,
  mesures: ReadonlyMap<string, string>,
): readonly Violation[] {
  const violation = (detail: string): readonly Violation[] => [{ invariant: INVARIANT_GRAPPE, objet: porteur.id, detail }];
  const principaux = porteur.items.filter((entree) => entree.role === "principal").length;
  if (principaux > 1) return violation(`${principaux} items principaux sur une question d'attribution, au plus un.`);
  const definissants = porteur.items.filter((entree) => entree.role === "principal" || entree.role === "attendu_dans_liste");
  const introuvable = definissants.find((entree) => !mesures.has(entree.reference.item_id));
  if (introuvable !== undefined) {
    return violation(`item ${introuvable.reference.item_id} introuvable : la mesure de la grappe n'est pas vérifiable.`);
  }
  const trouvees = [...new Set(definissants.map((entree) => mesures.get(entree.reference.item_id)))];
  if (trouvees.length === 1 && trouvees[0] === porteur.grappe_id) return [];
  return violation(`grappe_id ${porteur.grappe_id} alors que les items portent les mesures ${trouvees.join(", ")}.`);
}

function violationDeGrappe(porteur: PorteurDeGrappe): readonly Violation[] {
  const principaux = porteur.items.filter((entree) => entree.role === "principal");
  const premier = principaux[0];
  if (principaux.length !== 1 || premier === undefined) {
    return [
      {
        invariant: INVARIANT_GRAPPE,
        objet: porteur.id,
        detail: `${principaux.length} items principaux au lieu d'un seul.`,
      },
    ];
  }
  if (premier.reference.item_id === porteur.grappe_id) return [];
  return [
    {
      invariant: INVARIANT_GRAPPE,
      objet: porteur.id,
      detail: `grappe_id ${porteur.grappe_id} alors que l'item principal est ${premier.reference.item_id}.`,
    },
  ];
}

/* ---------------------------------------------- 2. contexte de la notation */

export interface ObjetNote {
  readonly id: string;
  readonly contexte: string;
}

export interface ObjetNotant {
  readonly id: string;
  readonly contexte: string;
  readonly objet_note: { readonly type: string; readonly id: string };
}

const INVARIANT_CONTEXTE = "le contexte suit celui de l'objet noté";

/** Vaut pour `notation` comme pour `verdict` : tous deux recopient le contexte de l'objet noté. */
export function contexteSuitObjetNote(
  notants: readonly ObjetNotant[],
  objets: readonly ObjetNote[],
): readonly Violation[] {
  const parId = new Map(objets.map((objet) => [objet.id, objet]));
  return notants.flatMap((notant) => violationDeContexte(notant, parId));
}

function violationDeContexte(
  notant: ObjetNotant,
  parId: ReadonlyMap<string, ObjetNote>,
): readonly Violation[] {
  const objet = parId.get(notant.objet_note.id);
  if (objet === undefined) {
    return [
      {
        invariant: INVARIANT_CONTEXTE,
        objet: notant.id,
        detail: `objet noté ${notant.objet_note.id} introuvable : le contexte n'est pas vérifiable.`,
      },
    ];
  }
  if (objet.contexte === notant.contexte) return [];
  return [
    {
      invariant: INVARIANT_CONTEXTE,
      objet: notant.id,
      detail: `contexte ${notant.contexte} alors que l'objet noté ${objet.id} porte ${objet.contexte}.`,
    },
  ];
}

/* --------------------------------------------- 3. item fictif et mesure */

const INVARIANT_FICTIF = "un item F pointe une mesure fictive";

export function itemsFictifsPointentMesureFictive(
  items: readonly Item[],
  mesures: readonly Mesure[],
): readonly Violation[] {
  const parId = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  return items
    .filter((item) => item.type === "F")
    .flatMap((item) => violationDeFictivite(item, parId));
}

function violationDeFictivite(
  item: Item,
  parId: ReadonlyMap<string, Mesure>,
): readonly Violation[] {
  const mesure = parId.get(item.mesure_id);
  if (mesure === undefined) {
    return [
      {
        invariant: INVARIANT_FICTIF,
        objet: item.id,
        detail: `mesure ${item.mesure_id} introuvable : la fictivité n'est pas vérifiable.`,
      },
    ];
  }
  if (mesure.fictive) return [];
  return [
    {
      invariant: INVARIANT_FICTIF,
      objet: item.id,
      detail: `mesure ${mesure.id} déclarée fictive=false alors que l'item est de type F.`,
    },
  ];
}

/* ------------------------------------ 3 bis. un seul item F par mesure fictive */

const INVARIANT_FICTIF_UNIQUE = "une mesure fictive porte un seul item fictif";

/**
 * §5 (protocole 0.9) : « Une mesure fictive porte un seul item fictif. » La règle est celle de la
 * promotion (`validation/domaine/fictif-unique.ts`), lue ici sur le corpus entier, comme contrôle
 * a posteriori. Une violation par mesure fautive, qui nomme ses items.
 */
export function unSeulItemFictifParMesure(items: readonly ItemFictifCandidat[]): readonly Violation[] {
  return [...fictifsEnDouble(items)].map(([mesure_id, item_ids]) => ({
    invariant: INVARIANT_FICTIF_UNIQUE,
    objet: mesure_id,
    detail: `${item_ids.length} items fictifs vérifiés : ${item_ids.join(", ")}.`,
  }));
}

/* ------------------------------------ 4. versions des deux validations */

export interface DecisionValidation {
  readonly id: string;
  readonly item_id: string;
  readonly annotateur_id: string;
  readonly decision: string;
  readonly item_version: number;
  readonly item_empreinte: string;
}

const INVARIANT_VERSION = "les deux validations concordantes portent la même version";

/**
 * §4, règle de concordance : « un item est vérifié seulement avec deux décisions concordantes
 * portant sur la même version de l'item ; deux décisions sur des versions différentes partent en
 * arbitrage ». Seules les décisions qui peuvent vérifier un item — accepter et corriger —
 * entrent dans le contrôle : un rejet ne promeut rien.
 *
 * Le contrôle est ici post-hoc, sur le journal d'un corpus déjà promu. La même règle garde
 * l'entrée du pipeline dans `validation/domaine/promotion.ts`, au moment de la promotion.
 */
export function validationsConcordantesMemeVersion(
  decisions: readonly DecisionValidation[],
): readonly Violation[] {
  const retenues = decisions.filter(
    (decision) => decision.decision === "accepter" || decision.decision === "corriger",
  );
  const parItem = new Map<string, DecisionValidation[]>();
  for (const decision of retenues) {
    const groupe = parItem.get(decision.item_id);
    if (groupe === undefined) parItem.set(decision.item_id, [decision]);
    else groupe.push(decision);
  }
  return [...parItem.entries()]
    .sort(([a], [b]) => comparerChaines(a, b))
    .flatMap(([item_id, groupe]) => violationDeVersion(item_id, groupe));
}

function violationDeVersion(
  item_id: string,
  groupe: readonly DecisionValidation[],
): readonly Violation[] {
  const empreintes = new Set(
    groupe.map((decision) => `${decision.item_version}|${decision.item_empreinte}`),
  );
  if (groupe.length < 2 || empreintes.size === 1) return [];
  return [
    {
      invariant: INVARIANT_VERSION,
      objet: item_id,
      detail: `décisions retenues portant ${empreintes.size} versions différentes : ${[...empreintes].join(", ")}.`,
    },
  ];
}

/* ---------------------------------------- 5. prémisse fausse sur F ou O */

export interface PorteurDePremisse {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly items: readonly {
    readonly reference: { readonly item_id: string };
    readonly role: string;
  }[];
  readonly formulations: readonly {
    readonly id: string;
    readonly registre: string;
    readonly position_affirmee?: Position;
  }[];
}

const INVARIANT_PREMISSE = "une prémisse fausse ne porte que sur un item F ou O";

/**
 * §5 (protocole 0.11) : « Une formulation orientée ne porte une prémisse fausse que sur un item F
 * ou O : l'engendrement l'interdit sur un item P, dont la prémisse orientée est vraie par
 * construction. Sur un item O, […] le relecteur note sur la formulation la position que sa
 * prémisse affirme. » La vérité de la prémisse se résout au gel (`premisseFausseAuGel`) ; ce
 * contrôle garde, sur le corpus entier et avant tout tirage, ce qui ne dépend pas de la date. La
 * règle n'est pas réécrite ici : `verdictDePremisse` est appelée pour chaque position que l'item
 * peut avoir en vigueur (`positionsPossibles`), et chacun de ses refus devient une violation.
 */
export function premisseFausseSurItemFOuO(
  questions: readonly PorteurDePremisse[],
  items: readonly Item[],
): readonly Violation[] {
  const parId = new Map(items.map((item) => [item.id, item]));
  return questions
    .flatMap((question) => violationDePremisse(question, parId))
    .sort((a, b) => comparerChaines(a.objet, b.objet));
}

function violationDePremisse(question: PorteurDePremisse, parId: ReadonlyMap<string, Item>): readonly Violation[] {
  const orientees = question.formulations.filter((formulation) => formulation.registre === "oriente");
  const identifiants = orientees.map((formulation) => formulation.id).join(", ");
  const violation = (detail: string): readonly Violation[] => [
    { invariant: INVARIANT_PREMISSE, objet: question.id, detail: `formulation ${identifiants} : ${detail}` },
  ];
  const principaux = question.items.filter((entree) => entree.role === "principal");
  const premier = principaux[0];
  if (principaux.length > 1) return violation(`${principaux.length} items principaux, prémisse non vérifiable.`);
  if (premier === undefined) return refusDePremisse(question, undefined, [undefined], violation);
  const item = parId.get(premier.reference.item_id);
  if (item === undefined) return violation(`item principal ${premier.reference.item_id} introuvable, prémisse non vérifiable.`);
  return refusDePremisse(question, item, positionsPossibles(item), violation);
}

function refusDePremisse(
  question: PorteurDePremisse,
  item: Item | undefined,
  positions: readonly (Position | undefined)[],
  violation: (detail: string) => readonly Violation[],
): readonly Violation[] {
  const affirmee = positionAffirmee(question);
  for (const en_vigueur of positions) {
    try {
      verdictDePremisse(question, item, affirmee, en_vigueur);
    } catch (erreur) {
      if (erreur instanceof PremisseHorsEnsemble || erreur instanceof PremisseNonNotee) return violation(erreur.message);
      throw erreur;
    }
  }
  return [];
}

/* ------------------------------- 6. formulations relues (data/formulations/) */

/** Ce que les deux invariants suivants lisent de `data/formulations/<question_id>.json`. */
export interface PorteurDeFormulations {
  readonly question_id: string;
  readonly empreinte_texte_neutre: string;
  readonly version_gabarits: string;
  readonly formulations: readonly {
    readonly id: string;
    readonly registre: string;
    readonly texte: string;
    readonly empreinte_texte: string;
    readonly production: object;
  }[];
}

const INVARIANT_NEUTRE_GABARITS = "la neutre est produite par la version de gabarits de la question";

/**
 * Décision D42 (2) : la neutre est écrite par la table de gabarits, et sa production le dit
 * (`{gabarits}`). Sa version doit égaler `version_gabarits` du fichier, et celle-ci la version de
 * la question engendrée courante (`versions_courantes` : `question_id` → `version_gabarits`) : une
 * table de gabarits changée sans que le texte change ne fait pas passer une ancienne relecture
 * pour une relecture de la table courante. JSON Schema ne compare pas deux champs.
 */
export function neutreSuitVersionGabarits(
  porteurs: readonly PorteurDeFormulations[],
  versions_courantes: ReadonlyMap<string, string>,
): readonly Violation[] {
  return porteurs.flatMap((porteur) => {
    const detail = defautDeNeutre(porteur, versions_courantes.get(porteur.question_id));
    return detail === null ? [] : [{ invariant: INVARIANT_NEUTRE_GABARITS, objet: porteur.question_id, detail }];
  });
}

function versionDeProduction(production: object): string | null {
  const gabarits = (production as { readonly gabarits?: unknown }).gabarits;
  return typeof gabarits === "string" ? gabarits : null;
}

function defautDeNeutre(porteur: PorteurDeFormulations, courante: string | undefined): string | null {
  const neutres = porteur.formulations.filter((formulation) => formulation.registre === "neutre");
  const neutre = neutres[0];
  if (neutres.length !== 1 || neutre === undefined) return `${neutres.length} formulations neutres au lieu d'une.`;
  const produite = versionDeProduction(neutre.production);
  if (produite === null) return `la neutre ${neutre.id} ne nomme pas de table de gabarits.`;
  if (produite !== porteur.version_gabarits) {
    return `la neutre ${neutre.id} est produite par ${produite} alors que version_gabarits vaut ${porteur.version_gabarits}.`;
  }
  if (courante === undefined) return "aucune question engendrée courante de cet identifiant : la version n'est pas vérifiable.";
  if (courante !== porteur.version_gabarits) {
    return `version_gabarits ${porteur.version_gabarits} alors que la question engendrée courante porte ${courante}.`;
  }
  return null;
}

const INVARIANT_EMPREINTES = "chaque empreinte suit son texte, et la neutre est le texte de la clé";

/**
 * `empreinte_texte` est le sha256 du texte de chaque formulation (§8 : « question commune » = même
 * id et même empreinte), et la neutre est le texte dont `empreinte_texte_neutre`, clé de la
 * relecture (D39), est l'empreinte.
 */
export function empreintesSuiventTextes(porteurs: readonly PorteurDeFormulations[]): readonly Violation[] {
  return porteurs.flatMap((porteur) =>
    porteur.formulations.flatMap((formulation) => {
      const detail = defautDEmpreinte(porteur, formulation);
      return detail === null ? [] : [{ invariant: INVARIANT_EMPREINTES, objet: porteur.question_id, detail }];
    }),
  );
}

function defautDEmpreinte(
  porteur: PorteurDeFormulations,
  formulation: PorteurDeFormulations["formulations"][number],
): string | null {
  const calculee = sha256(formulation.texte);
  if (calculee !== formulation.empreinte_texte) {
    return `formulation ${formulation.id} : empreinte_texte ${formulation.empreinte_texte}, sha256 du texte ${calculee}.`;
  }
  if (formulation.registre === "neutre" && calculee !== porteur.empreinte_texte_neutre) {
    return `neutre ${formulation.id} d'empreinte ${calculee} alors que la clé porte ${porteur.empreinte_texte_neutre}.`;
  }
  return null;
}
