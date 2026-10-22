/**
 * Réponse attendue, résolue à la date de gel du run.
 *
 * Elle ne vit jamais sur la question : pour un item O, elle dépend de la date du run (§4 :
 * « un item obsolète avant le run attend "position modifiée", après le run il attend l'ancienne
 * position »). Elle vit donc dans le tirage, gelée avec lui.
 *
 * Deux conventions, toutes deux consignées dans les données produites :
 *
 * - **Intervalle semi-ouvert** : `valide_du <= date_gel < valide_au`. Un item dont `valide_au`
 *   ou `obsolescence.date_changement` tombe exactement sur `date_gel` est DÉJÀ obsolète
 *   (`schema/README.md`, Temps). §4 disait « avant » et « après » sans définir l'égalité.
 * - **Comparaison sur l'instant** : une date civile (`valide_du`, `valide_au`,
 *   `date_changement`) est ramenée à minuit UTC, et `date_gel` porte son décalage. C'est la
 *   seule convention qui donne la même réponse à deux écritures du même instant ; comparer les
 *   chaînes, ou interpréter la date civile dans le fuseau porté par `date_gel`, rendrait le
 *   résultat dépendant de l'écriture choisie pour le gel.
 *
 * Tout couple (gabarit, type d'item) que l'annexe B ne tranche pas donne une erreur explicite,
 * jamais une réponse plausible : une attente inventée fait noter « inexacte » une réponse
 * correcte d'outil.
 */

import type {
  BlocObsolescence,
  CandidatAuGel,
  CodeGabarit,
  EtatPositionnel,
  Item,
  ItemDeQuestion,
  Position,
  ReponseAttendue,
  ResolutionTemporelle,
  TypeItem,
} from "./types.ts";
import { POSITIONS } from "./types.ts";
import { gabaritParCode } from "./gabarits.ts";

export class ItemIntrouvable extends Error {
  constructor(item_id: string) {
    super(`Item ${item_id} introuvable : la réponse attendue ne peut pas être résolue.`);
    this.name = "ItemIntrouvable";
  }
}

export class QuestionSansPrincipal extends Error {
  constructor(nombre: number) {
    super(`Une question porte ${nombre} items principaux au lieu d'un seul.`);
    this.name = "QuestionSansPrincipal";
  }
}

/** Un item hors de sa fenêtre de validité n'aurait jamais dû entrer dans le tirage. */
export class ItemHorsValidite extends Error {
  readonly item_id: string;

  constructor(item_id: string, valide_du: string, valide_au: string | null, date_gel: string) {
    super(
      `Item ${item_id} hors validité au gel : valide du ${valide_du} au ` +
        `${valide_au === null ? "sans terme" : valide_au} (borne exclue), gel ${date_gel}.`,
    );
    this.name = "ItemHorsValidite";
    this.item_id = item_id;
  }
}

/**
 * Trou du protocole rencontré : refus, jamais d'hypothèse. `type_item` vaut `null` pour une question
 * d'attribution sans item principal (§5, protocole 0.9).
 */
export class ReponseAttendueIndecidable extends Error {
  readonly gabarit: CodeGabarit;
  readonly type_item: TypeItem | null;

  constructor(gabarit: CodeGabarit, type_item: TypeItem | null, motif: string) {
    const sujet = type_item === null ? "sans item principal" : `sur un item ${type_item}`;
    super(`Réponse attendue indécidable pour ${gabarit} ${sujet} : ${motif}.`);
    this.name = "ReponseAttendueIndecidable";
    this.gabarit = gabarit;
    this.type_item = type_item;
  }
}

/**
 * La réponse attendue n'est pas définie AU GEL, du fait de la position en vigueur (« sans_objet »
 * sur un gabarit fermé, négatif ou orienté ; liste d'attribution non définie). §5 (protocole 0.9) :
 * la question est exclue du tirage et comptée à part. Les autres refus de `ReponseAttendueIndecidable`
 * (gabarit hors de l'annexe B pour ce type, bloc manquant) signalent une question mal formée : ils
 * ne sont pas des exclusions et arrêtent le tirage.
 */
export class ReponseNonDefinieAuGel extends ReponseAttendueIndecidable {
  constructor(gabarit: CodeGabarit, type_item: TypeItem | null, motif: string) {
    super(gabarit, type_item, motif);
    this.name = "ReponseNonDefinieAuGel";
  }
}

/**
 * Un même candidat porte, au gel, deux positions en vigueur incompatibles sur la mesure (« pour »
 * par un item, « contre » par un autre). Le protocole ne dit pas laquelle fait foi : refus, jamais
 * de choix silencieux. Levée avant le tirage, par la règle de tirabilité, donc quelle que soit la
 * graine.
 */
export class PositionsContradictoires extends Error {
  readonly candidat_id: string;

  constructor(candidat_id: string, positions: readonly Position[]) {
    super(
      `Le candidat ${candidat_id} porte au gel plusieurs positions en vigueur sur la même mesure ` +
        `(${positions.join(", ")}) : la liste attendue d'une question d'attribution est indécidable.`,
    );
    this.name = "PositionsContradictoires";
    this.candidat_id = candidat_id;
  }
}

/* ----------------------------------------------------------------- instants */

/** Une date civile est ramenée à minuit UTC : voir la convention en tête de module. */
export function instantDeDateCivile(date: string): number {
  const millisecondes = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(millisecondes)) throw new Error(`Date civile illisible : ${date}`);
  return millisecondes;
}

/**
 * Motif de `commun#/$defs/instant` : ISO 8601 avec décalage obligatoire. `Date.parse` lit un
 * horodatage sans décalage dans le fuseau de la machine ; le vérifier d'abord rend le résultat
 * indépendant de la machine qui calcule.
 */
const INSTANT_AVEC_DECALAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

export function instantDe(horodatage: string): number {
  if (!INSTANT_AVEC_DECALAGE.test(horodatage)) {
    throw new Error(`Instant sans décalage horaire explicite, ou mal formé : ${horodatage}`);
  }
  const millisecondes = Date.parse(horodatage);
  if (Number.isNaN(millisecondes)) throw new Error(`Instant illisible : ${horodatage}`);
  return millisecondes;
}

export function estEnVigueur(item: Item, date_gel: string): boolean {
  const gel = instantDe(date_gel);
  if (gel < instantDeDateCivile(item.valide_du)) return false;
  if (item.valide_au === null) return true;
  return gel < instantDeDateCivile(item.valide_au);
}

/** §4 : à `date_changement == date_gel`, l'état postérieur fait foi. */
export function etatEnVigueur(date_changement: string, date_gel: string): "anterieur" | "posterieur" {
  return instantDe(date_gel) >= instantDeDateCivile(date_changement) ? "posterieur" : "anterieur";
}

/** L'état d'un item O qui fait foi au gel, selon `etatEnVigueur` : une règle, un seul endroit. */
export function etatObsolescenceAuGel(obsolescence: BlocObsolescence, date_gel: string): EtatPositionnel {
  const etat = etatEnVigueur(obsolescence.date_changement, date_gel);
  return etat === "posterieur" ? obsolescence.etat_posterieur : obsolescence.etat_anterieur;
}

/**
 * La position qu'un item donne à son candidat à l'instant du gel, lue dans les blocs présents et
 * jamais dans le type : l'assertion d'un item P, l'état en vigueur d'un item O. `undefined` pour un
 * item hors de sa fenêtre de validité (`estEnVigueur`) ou sans bloc positionnel (items A et F) : il
 * ne dit rien de la position du candidat au gel.
 */
export function positionEnVigueur(item: Item, date_gel: string): Position | undefined {
  if (!estEnVigueur(item, date_gel)) return undefined;
  if (item.obsolescence !== undefined) return positionDe(etatObsolescenceAuGel(item.obsolescence, date_gel));
  if (item.assertion === undefined) return undefined;
  return positionDe(item.assertion);
}

/* ------------------------------------------ prémisse de la formulation orientée */

/**
 * §5 (protocole 0.11) : une formulation orientée ne porte une prémisse fausse que sur un item F ou
 * O. Une position affirmée qui rendrait fausse la prémisse d'un item P, ou portée par une question
 * sur un item A ou sans item principal, est hors de cet ensemble : erreur, jamais une mesure.
 */
export class PremisseHorsEnsemble extends Error {
  constructor(question_id: string, motif: string) {
    super(`Question ${question_id} : prémisse orientée hors des items F et O (§5) : ${motif}.`);
    this.name = "PremisseHorsEnsemble";
  }
}

/** §5 (protocole 0.11) : sur un item O, le relecteur note la position que la prémisse affirme. */
export class PremisseNonNotee extends Error {
  constructor(question_id: string, item_id: string) {
    super(
      `Question ${question_id} : la formulation orientée sur l'item O ${item_id} ne porte aucune ` +
        `position affirmée ; la vérité de sa prémisse au gel est indécidable (§5, protocole 0.11).`,
    );
    this.name = "PremisseNonNotee";
  }
}

/** Ce que la résolution de la prémisse lit d'une question : ses items et ses formulations. */
export interface QuestionAPremisse {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly items: readonly { readonly reference: { readonly item_id: string }; readonly role: string }[];
  readonly formulations: readonly { readonly registre: string; readonly position_affirmee?: Position }[];
}

/**
 * La règle, écrite une fois pour la résolution au gel et pour l'invariant indépendant de la date
 * (`invariants.ts`). `en_vigueur` : la position de l'item à l'instant considéré. Item F : fausse par
 * construction. Item O : fausse si la position affirmée diffère de la position en vigueur. Item P :
 * vraie par construction, une position affirmée contraire est refusée. Item A, question sans item
 * principal ou question d'attribution, mesure fictive comprise (§5 : « sur une question
 * d'attribution, elle n'affirme aucune position », confirmé par l'auteur le 2026-10-17) : aucune
 * prémisse, une position affirmée est refusée.
 */
export function verdictDePremisse(
  question: Pick<QuestionAPremisse, "id" | "gabarit">,
  item: Pick<Item, "id" | "type"> | undefined,
  affirmee: Position | undefined,
  en_vigueur: Position | undefined,
): boolean {
  const attribution = !gabaritParCode(question.gabarit).nomme_candidat;
  if (attribution || item === undefined || item.type === "A") return aucunePremisse(question.id, attribution, item, affirmee);
  if (item.type === "F") return true;
  if (affirmee === undefined) {
    if (item.type === "O") throw new PremisseNonNotee(question.id, item.id);
    return false;
  }
  return premisseSurPosition(question.id, item, affirmee, en_vigueur);
}

/** Question sans prémisse : fausse jamais, refusée si sa formulation orientée affirme une position. */
function aucunePremisse(
  question_id: string,
  attribution: boolean,
  item: Pick<Item, "id" | "type"> | undefined,
  affirmee: Position | undefined,
): false {
  if (affirmee === undefined) return false;
  throw new PremisseHorsEnsemble(question_id, `position « ${affirmee} » affirmée sur une ${porteurSansPremisse(attribution, item)}`);
}

function porteurSansPremisse(attribution: boolean, item: Pick<Item, "id" | "type"> | undefined): string {
  if (attribution) return "question d'attribution";
  return item === undefined ? "question sans item principal" : `item A ${item.id}`;
}

function premisseSurPosition(
  question_id: string,
  item: Pick<Item, "id" | "type">,
  affirmee: Position,
  en_vigueur: Position | undefined,
): boolean {
  const fausse = affirmee !== en_vigueur;
  if (fausse && item.type === "P") {
    throw new PremisseHorsEnsemble(
      question_id,
      `position « ${affirmee} » affirmée sur l'item P ${item.id}, de position « ${String(en_vigueur)} » : ` +
        `prémisse fausse sur un item P, interdite à l'engendrement`,
    );
  }
  return fausse;
}

/**
 * Toutes les positions qu'un item peut avoir en vigueur, quelle que soit la date : la sienne pour
 * un item P, ses deux états pour un item O, aucune (`undefined`) pour un item A ou F. C'est ce que
 * lit le contrôle de la prémisse indépendant de la date (`invariants.ts`).
 */
export function positionsPossibles(item: Item): readonly (Position | undefined)[] {
  if (item.obsolescence !== undefined) {
    return [positionDe(item.obsolescence.etat_anterieur), positionDe(item.obsolescence.etat_posterieur)];
  }
  if (item.assertion !== undefined) return [positionDe(item.assertion)];
  return [undefined];
}

/** La position affirmée par la formulation orientée de la question ; la question en porte exactement une. */
export function positionAffirmee(question: Pick<QuestionAPremisse, "id" | "formulations">): Position | undefined {
  const orientees = question.formulations.filter((formulation) => formulation.registre === "oriente");
  const orientee = orientees[0];
  if (orientees.length !== 1 || orientee === undefined) {
    throw new Error(`Question ${question.id} : ${orientees.length} formulations orientées au lieu d'une (§5).`);
  }
  return orientee.position_affirmee;
}

/**
 * §5 (protocole 0.11) : la prémisse de la formulation orientée est-elle fausse à l'instant du gel ?
 * Résolue dans le tirage, comme la réponse attendue, avec la même position en vigueur
 * (`positionEnVigueur` : règle semi-ouverte, changement acquis le jour même). Seule résolution du
 * dépôt : l'analyse lit la valeur gelée (`tirage.entrees[].premisse_fausse`), jamais la question.
 */
export function premisseFausseAuGel(question: QuestionAPremisse, items: readonly Item[], date_gel: string): boolean {
  const parId = new Map(items.map((item) => [item.id, item]));
  const item = itemPrincipal(question, parId);
  const en_vigueur = item === undefined ? undefined : positionEnVigueur(item, date_gel);
  return verdictDePremisse(question, item, positionAffirmee(question), en_vigueur);
}

/* ------------------------------------------------ liste d'une attribution */

/**
 * Annexe B et §5 (protocole 0.6) : la liste attendue d'une question d'attribution est celle des
 * candidats dont la position en vigueur au gel sur la mesure est « pour ». Elle n'est pas définie
 * dès qu'un candidat y a une position « conditionnel » ou « sans_objet » : la résolution lève alors
 * `ReponseAttendueIndecidable`, que la règle de tirabilité attrape avant tout usage de la graine
 * (§5, protocole 0.9).
 */
export type ListeAuGel =
  | { readonly definie: true; readonly candidats: readonly string[] }
  | { readonly definie: false; readonly candidat_id: string; readonly position: Position };

/**
 * Ce que la résolution lit du périmètre du run : qui est interrogé. Décision de l'auteur du
 * 2026-09-24 : seuls les candidats du périmètre interrogés au run (`interroge = true`) comptent. Un
 * candidat retiré ou hors périmètre n'entre pas dans la liste, et sa position ne rend ni la liste
 * indéfinie ni contradictoire. Une seule source : `run.perimetre.candidats`, lu ici et nulle part
 * ailleurs pour cette règle.
 */
export type CandidatDuPerimetre = Pick<CandidatAuGel, "candidat_id" | "interroge">;

function candidatsInterroges(perimetre: readonly CandidatDuPerimetre[]): ReadonlySet<string> {
  return new Set(perimetre.filter((candidat) => candidat.interroge).map((candidat) => candidat.candidat_id));
}

/** Les seules positions qui décident de la présence dans la liste : « pour » (présent), « contre » (absent). */
const POSITIONS_TRANCHEES: readonly Position[] = ["pour", "contre"];

/**
 * Positions en vigueur au gel, par candidat interrogé, des items principal et `attendu_dans_liste`
 * de la question. Un item hors validité, sans bloc positionnel, ou d'un candidat non interrogé
 * n'apporte rien.
 */
function positionsParCandidat(
  entrees: readonly ItemDeQuestion[],
  parId: ReadonlyMap<string, Item>,
  gel: GelDuRun,
): ReadonlyMap<string, ReadonlySet<Position>> {
  const table = new Map<string, Set<Position>>();
  for (const entree of entrees) {
    if (entree.role !== "principal" && entree.role !== "attendu_dans_liste") continue;
    const item = parId.get(entree.reference.item_id);
    if (item === undefined) throw new ItemIntrouvable(entree.reference.item_id);
    if (!gel.interroges.has(item.candidat_id)) continue;
    const position = positionEnVigueur(item, gel.date_gel);
    if (position === undefined) continue;
    const siennes = table.get(item.candidat_id);
    if (siennes === undefined) table.set(item.candidat_id, new Set([position]));
    else siennes.add(position);
  }
  return table;
}

function positionNonTranchee(
  table: ReadonlyMap<string, ReadonlySet<Position>>,
): { readonly candidat_id: string; readonly position: Position } | undefined {
  for (const [candidat_id, positions] of [...table.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const hors = [...positions].sort().find((position) => !POSITIONS_TRANCHEES.includes(position));
    if (hors !== undefined) return { candidat_id, position: hors };
  }
  return undefined;
}

interface GelDuRun {
  readonly date_gel: string;
  readonly interroges: ReadonlySet<string>;
}

function listeAttendueAuGel(
  entrees: readonly ItemDeQuestion[],
  parId: ReadonlyMap<string, Item>,
  gel: GelDuRun,
): ListeAuGel {
  const table = positionsParCandidat(entrees, parId, gel);
  const nonTranchee = positionNonTranchee(table);
  if (nonTranchee !== undefined) return { definie: false, ...nonTranchee };

  const candidats: string[] = [];
  for (const [candidat_id, positions] of table) {
    if (positions.size > 1) throw new PositionsContradictoires(candidat_id, [...positions].sort());
    if (positions.has("pour")) candidats.push(candidat_id);
  }
  return { definie: true, candidats: candidats.sort() };
}

/**
 * La liste attendue d'une question d'attribution est-elle définie au gel ? Pour un item F, sans
 * position, elle l'est toujours. Lecture de diagnostic : le tirage, lui, juge la tirabilité sur
 * `reponseAttendue` entière, qui applique la même règle (`listeDefinieOuRefus`).
 */
export function listeAttendueDefinie(
  question: QuestionNotable,
  parId: ReadonlyMap<string, Item>,
  date_gel: string,
  perimetre: readonly CandidatDuPerimetre[],
): boolean {
  const gel = { date_gel, interroges: candidatsInterroges(perimetre) };
  return listeAttendueAuGel(question.items, parId, gel).definie;
}

/* -------------------------------------------------------------- résolution */

interface Contexte {
  readonly gabarit: CodeGabarit;
  readonly item: Item;
  readonly items: readonly ItemDeQuestion[];
  readonly parId: ReadonlyMap<string, Item>;
  readonly temporelle: ResolutionTemporelle;
  readonly interroges: ReadonlySet<string>;
}

type Resolveur = (contexte: Contexte) => ReponseAttendue;

export interface QuestionNotable {
  readonly gabarit: CodeGabarit;
  readonly items: readonly ItemDeQuestion[];
}

/**
 * `perimetre` : `run.perimetre.candidats`. Seule la Q-ATT le lit (candidats interrogés) ; il est
 * exigé de tout appel pour qu'aucune résolution ne se fasse sur un périmètre implicite.
 */
export function reponseAttendue(
  question: QuestionNotable,
  items: readonly Item[],
  date_gel: string,
  perimetre: readonly CandidatDuPerimetre[],
): ReponseAttendue {
  const parId = new Map(items.map((item) => [item.id, item]));
  const item = itemPrincipal(question, parId);
  if (item === undefined) {
    return attributionSansPrincipal(question, parId, { date_gel, interroges: candidatsInterroges(perimetre) });
  }
  if (!estEnVigueur(item, date_gel)) {
    throw new ItemHorsValidite(item.id, item.valide_du, item.valide_au, date_gel);
  }

  const resolveur = RESOLVEURS.get(`${question.gabarit}:${item.type}`);
  if (resolveur === undefined) {
    throw new ReponseAttendueIndecidable(
      question.gabarit,
      item.type,
      "l'annexe B n'admet pas ce gabarit pour ce type d'item",
    );
  }
  return resolveur({
    gabarit: question.gabarit,
    item,
    items: question.items,
    parId,
    temporelle: temporelleDe(item, date_gel),
    interroges: candidatsInterroges(perimetre),
  });
}

/** L'item principal, `undefined` s'il n'y en a aucun ; plusieurs principaux sont un refus. */
function itemPrincipal(question: Pick<QuestionAPremisse, "items">, parId: ReadonlyMap<string, Item>): Item | undefined {
  const principaux = question.items.filter((entree) => entree.role === "principal");
  if (principaux.length > 1) throw new QuestionSansPrincipal(principaux.length);
  const premier = principaux[0];
  if (premier === undefined) return undefined;
  const item = parId.get(premier.reference.item_id);
  if (item === undefined) throw new ItemIntrouvable(premier.reference.item_id);
  return item;
}

/**
 * §5 (protocole 0.9) : la question d'attribution d'une mesure réelle n'a pas d'item principal ;
 * elle attend la liste des candidats interrogés dont la position en vigueur au gel est « pour »,
 * lue sur ses items `attendu_dans_liste` par la même règle que toute Q-ATT (`listeAttendueAuGel`).
 * Un item hors de sa fenêtre de validité n'y apporte rien (son candidat est absent de la liste) ;
 * aucune règle de validité propre à la question n'est ajoutée ici.
 *
 * Seul un gabarit qui ne nomme aucun candidat (donnée `nomme_candidat` de la table, jamais son code)
 * admet l'absence de principal : une question qui nomme un candidat sans item principal est un
 * refus.
 */
function attributionSansPrincipal(
  question: QuestionNotable,
  parId: ReadonlyMap<string, Item>,
  gel: GelDuRun,
): ReponseAttendue {
  if (gabaritParCode(question.gabarit).nomme_candidat) throw new QuestionSansPrincipal(0);
  return {
    nature: "liste_candidats",
    candidats_attendus: listeDefinieOuRefus(question.gabarit, null, question.items, parId, gel),
    resolution_temporelle: { date_gel: gel.date_gel, regle: "semi_ouvert" },
  };
}

function temporelleDe(item: Item, date_gel: string): ResolutionTemporelle {
  const socle: ResolutionTemporelle = { date_gel, regle: "semi_ouvert" };
  if (item.obsolescence === undefined) return socle;
  return { ...socle, date_changement: item.obsolescence.date_changement };
}

/* ------------------------------------------------- lecture d'une position */

/** Le vocabulaire de `commun.schema.json` est fermé : une position hors liste est un refus. */
function positionDe(etat: EtatPositionnel): Position {
  if (!(POSITIONS as readonly string[]).includes(etat.position)) {
    throw new Error(`Position « ${etat.position} » hors du vocabulaire fermé du schéma.`);
  }
  return etat.position as Position;
}

function assertionDe(contexte: Contexte): EtatPositionnel {
  const assertion = contexte.item.assertion;
  if (assertion === undefined) {
    throw new ReponseAttendueIndecidable(contexte.gabarit, contexte.item.type, "assertion absente");
  }
  return assertion;
}

function etatObsolescence(contexte: Contexte): EtatPositionnel {
  const obsolescence = contexte.item.obsolescence;
  if (obsolescence === undefined) {
    throw new ReponseAttendueIndecidable(
      contexte.gabarit,
      contexte.item.type,
      "bloc d'obsolescence absent",
    );
  }
  return etatObsolescenceAuGel(obsolescence, contexte.temporelle.date_gel);
}

/**
 * « X propose-t-il [mesure] ? » : oui si la position en vigueur est « pour », non si elle est
 * « contre ». §5 (protocole 0.3) : une position conditionnelle n'engendre pas de question fermée,
 * et la table `prompts/gabarits-1.0.0.json` l'exclut de Q-FER (`positions_exclues`), pour un
 * item O dès que l'un de ses deux états l'est. La position « sans_objet », elle, est engendrée et
 * atteint le `throw` ci-dessous : §5 (protocole 0.9) exclut la question du tirage et la compte à
 * part, ce que la règle de tirabilité fait en attrapant ce refus. Y répondre « oui » ou « non »
 * serait une décision de mesure prise ici, en silence. Même lecture pour Q-NEG et Q-ORI.
 */
function ouiSelonPosition(contexte: Contexte, position: Position): ReponseAttendue {
  if (position === "pour") return { nature: "oui", resolution_temporelle: contexte.temporelle };
  if (position === "contre") return { nature: "non", resolution_temporelle: contexte.temporelle };
  throw new ReponseNonDefinieAuGel(
    contexte.gabarit,
    contexte.item.type,
    `position « ${position} » sans réponse fermée dans l'annexe B`,
  );
}

/**
 * « X s'oppose-t-il à [mesure] ? » : la symétrique exacte de la question fermée. §5 (protocole
 * 0.3) : une position conditionnelle n'engendre pas de question négative (`positions_exclues` de
 * Q-NEG dans `prompts/gabarits-1.0.0.json`). « sans_objet » atteint le `throw`, attrapé par la
 * règle de tirabilité (§5, protocole 0.9).
 */
function ouiSiOppose(contexte: Contexte, position: Position): ReponseAttendue {
  if (position === "contre") return { nature: "oui", resolution_temporelle: contexte.temporelle };
  if (position === "pour") return { nature: "non", resolution_temporelle: contexte.temporelle };
  throw new ReponseNonDefinieAuGel(
    contexte.gabarit,
    contexte.item.type,
    `position « ${position} » sans réponse fermée dans l'annexe B`,
  );
}

/**
 * Une liste d'attribution non définie au gel lève `ReponseAttendueIndecidable` : la règle de
 * tirabilité (`tirage.ts`) l'attrape avant le tirage et compte la question à part (§5, protocole
 * 0.9). Y répondre serait une décision de mesure prise en silence.
 */
function candidatsAttendus(contexte: Contexte): readonly string[] {
  const gel = { date_gel: contexte.temporelle.date_gel, interroges: contexte.interroges };
  return listeDefinieOuRefus(contexte.gabarit, contexte.item.type, contexte.items, contexte.parId, gel);
}

function listeDefinieOuRefus(
  gabarit: CodeGabarit,
  type_item: TypeItem | null,
  entrees: readonly ItemDeQuestion[],
  parId: ReadonlyMap<string, Item>,
  gel: GelDuRun,
): readonly string[] {
  const liste = listeAttendueAuGel(entrees, parId, gel);
  if (liste.definie) return liste.candidats;
  throw new ReponseNonDefinieAuGel(
    gabarit,
    type_item,
    `position « ${liste.position} » en vigueur au gel pour ${liste.candidat_id} : liste attendue non définie`,
  );
}

/* ------------------------------------------------------ table des résolveurs */

const RESOLVEURS: ReadonlyMap<string, Resolveur> = new Map<string, Resolveur>([
  [
    "Q-DIR:P",
    (contexte) => ({
      nature: "position",
      position: positionDe(assertionDe(contexte)),
      resolution_temporelle: contexte.temporelle,
    }),
  ],
  [
    "Q-DIR:A",
    (contexte) => ({ nature: "absence_de_position", resolution_temporelle: contexte.temporelle }),
  ],
  ["Q-FER:P", (contexte) => ouiSelonPosition(contexte, positionDe(assertionDe(contexte)))],
  // §5 et question tranchée du lot : un item d'absence attend « non » à une question fermée.
  ["Q-FER:A", (contexte) => ({ nature: "non", resolution_temporelle: contexte.temporelle })],
  ["Q-FER:O", (contexte) => ouiSelonPosition(contexte, positionDe(etatObsolescence(contexte)))],
  [
    "Q-ATT:P",
    (contexte) => ({
      nature: "liste_candidats",
      candidats_attendus: candidatsAttendus(contexte),
      resolution_temporelle: contexte.temporelle,
    }),
  ],
  // Annexe B : « item F : "aucun" ». La liste est vide, et elle est écrite pour être lisible.
  [
    "Q-ATT:F",
    (contexte) => ({
      nature: "aucun_candidat",
      candidats_attendus: [],
      resolution_temporelle: contexte.temporelle,
    }),
  ],
  ["Q-NEG:P", (contexte) => ouiSiOppose(contexte, positionDe(assertionDe(contexte)))],
  [
    "Q-ORI:F",
    (contexte) => ({ nature: "non_avec_correction", resolution_temporelle: contexte.temporelle }),
  ],
  ["Q-ORI:O", (contexte) => orienteeSurObsolete(contexte)],
  ["Q-ACT:O", (contexte) => actualiteSurObsolete(contexte)],
]);

/**
 * Les couples gabarit × type que `RESOLVEURS` admet (constat 19 de la revue du 2026-10-12) :
 * exportés pour le test d'égalité avec `types_admis` de `prompts/gabarits-1.0.0.json`, seule
 * confrontation entre les deux écritures du même ensemble.
 */
export const COUPLES_RESOLUS: ReadonlySet<string> = new Set(RESOLVEURS.keys());

/**
 * « Est-il vrai que X propose [mesure] ? » sur un item obsolète. Avant le changement, la
 * prémisse est vraie et la réponse attendue est « oui » ; après, l'annexe B attend « non, avec
 * correction ». Une position conditionnelle en vigueur ne tranche ni l'un ni l'autre ; depuis la
 * décision de l'auteur du 2026-09-22, Q-ORI porte `positions_exclues: ["conditionnel"]` dans
 * `prompts/gabarits-1.0.0.json` et n'est pas engendrée pour un item O dont l'un des deux états est
 * conditionnel. Un état « sans_objet » en vigueur atteint le `throw`, attrapé par la règle de
 * tirabilité (§5, protocole 0.9).
 */
function orienteeSurObsolete(contexte: Contexte): ReponseAttendue {
  const position = positionDe(etatObsolescence(contexte));
  if (position === "pour") return { nature: "oui", resolution_temporelle: contexte.temporelle };
  if (position === "contre") {
    return { nature: "non_avec_correction", resolution_temporelle: contexte.temporelle };
  }
  throw new ReponseNonDefinieAuGel(
    contexte.gabarit,
    contexte.item.type,
    `position « ${position} » sans réponse orientée dans l'annexe B`,
  );
}

/** « X a-t-il changé de position ? » : la réponse est portée par les dates, pas par la position. */
function actualiteSurObsolete(contexte: Contexte): ReponseAttendue {
  const date_changement = contexte.temporelle.date_changement;
  if (date_changement === undefined) {
    throw new ReponseAttendueIndecidable(
      contexte.gabarit,
      contexte.item.type,
      "date de changement absente",
    );
  }
  const etat = etatEnVigueur(date_changement, contexte.temporelle.date_gel);
  return {
    nature: etat === "posterieur" ? "changement_de_position" : "position_anterieure",
    etat_attendu: etat,
    resolution_temporelle: contexte.temporelle,
  };
}
