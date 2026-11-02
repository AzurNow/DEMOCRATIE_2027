/**
 * Strate « moins de 60 jours » de H2 (§2, protocole 0.24, D59 (1)).
 *
 * « La même différence, restreinte aux questions dont l'item principal date de moins de 60 jours,
 * est publiée comme résultat secondaire. La date d'un item est son début de validité (`valide_du`),
 * et celle d'un item O la date de son changement ; une question entre dans cette strate quand la
 * date de son item principal est comprise entre l'instant de gel moins 60 jours et l'instant de
 * gel, bornes comprises, une date civile se lisant à minuit UTC, comme aux sections 3 et 4. Les
 * questions sur un item F et les questions d'attribution sont hors de cette strate. »
 *
 * La comparaison se fait sur des instants, comme la fenêtre des sondages du §3
 * (`pipeline/questions/perimetre.ts:sondageDansLaFenetre`) : la lecture des dates vit une seule
 * fois, dans `pipeline/questions/reponse-attendue.ts`. Un gel qui n'est pas à minuit UTC décale
 * donc la borne basse dans la journée : la date civile qui tombe 60 jours avant le jour du gel
 * n'entre que si le gel est à minuit UTC.
 *
 * Ce module ne fait que sélectionner des unités. La différence de modes se calcule sur elles par
 * `conditions.ts`, comme pour la strate `global`, et sa décision vit dans `hypotheses.ts`.
 */

import { instantDe, instantDeDateCivile } from "../pipeline/questions/reponse-attendue.ts";
import type { UniteAnalyse } from "./filtre.ts";
import type { TypeItem, Ulid } from "./types.ts";

/** §2, H2 : « moins de 60 jours ». */
export const FENETRE_STRATE_RECENTE_JOURS = 60;

const MILLISECONDES_PAR_JOUR = 86_400_000;

/**
 * La part d'un item (`schema/item.schema.json`) que la strate lit, aux noms du schéma. Les items
 * épinglés d'un run, validés contre ce schéma par `lecture-run.ts:lireItemsEpingles`, la portent.
 */
export interface ItemDate {
  readonly id: Ulid;
  readonly type: TypeItem;
  readonly valide_du: string;
  readonly obsolescence?: { readonly date_changement: string };
}

/** Un item O sans bloc d'obsolescence : sa date n'est pas `valide_du`, et elle manque. */
export class ItemOSansDateChangement extends Error {
  readonly item_id: Ulid;

  constructor(item_id: Ulid) {
    super(`Item O ${item_id} sans obsolescence.date_changement : sa date pour la strate de moins de 60 jours (§2, H2) est indéfinie.`);
    this.name = "ItemOSansDateChangement";
    this.item_id = item_id;
  }
}

/** Une unité dont l'item principal manque aux items fournis : ni dedans ni dehors. */
export class ItemPrincipalHorsDesItems extends Error {
  readonly item_id: Ulid;

  constructor(item_id: Ulid) {
    super(`Item principal ${item_id} absent des items du run : sa date est inconnue, la strate de moins de 60 jours n'est pas décidable.`);
    this.name = "ItemPrincipalHorsDesItems";
    this.item_id = item_id;
  }
}

/** Une question qui n'est pas d'attribution et n'a pas d'item principal : incohérence d'assemblage. */
export class QuestionSansItemPrincipal extends Error {
  readonly question_id: string;

  constructor(question_id: string) {
    super(`Question ${question_id} sans item principal hors d'une question d'attribution : sa date est indéfinie.`);
    this.name = "QuestionSansItemPrincipal";
    this.question_id = question_id;
  }
}

/** Le type d'item lu sur l'unité diverge de celui de l'item fourni : l'un des deux est faux. */
export class TypeItemDivergent extends Error {
  constructor(item_id: Ulid, sur_unite: TypeItem | null, sur_item: TypeItem) {
    super(`Item ${item_id} de type ${sur_item}, mais l'unité d'analyse le dit de type ${String(sur_unite)}.`);
    this.name = "TypeItemDivergent";
  }
}

/** §2, H2 : `valide_du`, ou `date_changement` pour un item O. Jamais l'un à la place de l'autre. */
export function dateDeLItem(item: ItemDate): string {
  if (item.type !== "O") return item.valide_du;
  if (item.obsolescence === undefined) throw new ItemOSansDateChangement(item.id);
  return item.obsolescence.date_changement;
}

/** Vrai si la date civile, lue à minuit UTC, est dans [gel − 60 jours, gel], bornes comprises. */
export function dateDansStrateRecente(date: string, date_gel: string): boolean {
  const gel = instantDe(date_gel);
  const instant = instantDeDateCivile(date);
  const debut = gel - FENETRE_STRATE_RECENTE_JOURS * MILLISECONDES_PAR_JOUR;
  return debut <= instant && instant <= gel;
}

/**
 * Les unités dont la question entre dans la strate de moins de 60 jours, dans l'ordre d'entrée.
 * `items` contient au moins les items principaux des unités hors attribution et hors item F.
 */
export function unitesDeLaStrateRecente(
  unites: readonly UniteAnalyse[],
  items: readonly ItemDate[],
  date_gel: string,
): UniteAnalyse[] {
  const parId = indexerItems(items);
  return unites.filter((unite) => uniteDansStrateRecente(unite, parId, date_gel));
}

function uniteDansStrateRecente(unite: UniteAnalyse, parId: ReadonlyMap<Ulid, ItemDate>, date_gel: string): boolean {
  if (unite.gabarit === "Q-ATT") return false;
  if (unite.item_principal_id === null) throw new QuestionSansItemPrincipal(unite.question_id);
  const item = parId.get(unite.item_principal_id);
  if (item === undefined) throw new ItemPrincipalHorsDesItems(unite.item_principal_id);
  if (item.type !== unite.type_item_principal) throw new TypeItemDivergent(item.id, unite.type_item_principal, item.type);
  if (item.type === "F") return false;
  return dateDansStrateRecente(dateDeLItem(item), date_gel);
}

function indexerItems(items: readonly ItemDate[]): Map<Ulid, ItemDate> {
  const parId = new Map<Ulid, ItemDate>();
  for (const item of items) {
    if (parId.has(item.id)) throw new Error(`Item ${item.id} en double parmi les items de la strate de moins de 60 jours.`);
    parId.set(item.id, item);
  }
  return parId;
}
