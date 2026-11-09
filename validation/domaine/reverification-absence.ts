/**
 * Revérification des items d'absence d'un run (§4, protocole 0.24, D59 (11) ; annexe F, case 2) :
 * la logique, sans le disque. `outils/reverifier-absence.ts` lit et écrit ; la checklist relit le
 * fichier du run (`pipeline/go-no-go/checklist.ts:constatItemsAbsenceReverifies`).
 *
 * §4 : « Les items A sont revérifiés à chaque run par recherche automatique de nouvelles sources T1
 * sur le thème, puis confirmation humaine. […] la revérification est confirmée par un seul
 * annotateur. » La recherche automatique est `absence.ts:nouvellesSourcesT1` ; la confirmation est
 * saisie par l'annotateur, nommé par `ANNOTATEUR_ID`, et rien ne se confirme à sa place :
 *
 * - un item sans nouvelle source T1 n'est confirmé que si l'annotateur le nomme, ou confirme d'un
 *   geste tous les items sans nouvelle source (`sans_nouvelle_source`) ;
 * - un item avec une nouvelle source T1 n'est confirmé que si l'annotateur le nomme ;
 * - seule l'issue « absence confirmée » s'enregistre : la conséquence d'une position trouvée sur un
 *   item déjà tiré n'est pas écrite au protocole, et l'item reste alors sans confirmation.
 *
 * Choix de code, nommés (aucun n'est une règle de mesure) :
 *
 * - les items revérifiés sont les items A du tirage du run, tout rôle confondu, épinglés comme le
 *   tirage les épingle (`itemsAbsenceDuTirage`) ;
 * - une confirmation porte la version revérifiée, et ne vaut pour le run que si c'est celle que le
 *   tirage épingle : un item modifié depuis le gel n'est pas confirmable ici ;
 * - ajout seul et idempotence : une confirmation écrite n'est jamais remplacée, et un item ne reçoit
 *   jamais deux revérifications pour le même run.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { nouvellesSourcesT1, type SourceCollectee } from "./absence.ts";
import type { Item, Reverification } from "./types.ts";

/** `commun#/$defs/reference_item` : un item épinglé. */
export interface ReferenceItem {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
}

/** `reverification-absence.schema.json#/$defs/confirmation`. */
export interface ConfirmationAbsence {
  readonly date: string;
  readonly resultat: "absence_confirmee";
  readonly confirme_par: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly nouvelles_sources_t1: readonly string[];
}

export interface EntreeReverification {
  readonly reference: ReferenceItem;
  readonly confirmation?: ConfirmationAbsence;
}

/** `runs/<date>/reverification-absence.json` (`reverification-absence.schema.json`). */
export interface FichierReverification {
  readonly run_id: string;
  readonly items: readonly EntreeReverification[];
}

/** Ce qu'il faut d'une entrée du tirage : les items qu'elle épingle. */
export interface EntreeDuTirage {
  readonly items_au_gel: readonly { readonly reference: ReferenceItem }[];
}

/* ------------------------------------------------------------------ erreurs */

export class ItemDuTirageIntrouvable extends Error {
  constructor(item_id: string) {
    super(`L'item ${item_id} du tirage est absent de data/items : son type ne peut pas être lu, rien n'est revérifié.`);
    this.name = "ItemDuTirageIntrouvable";
  }
}

export class EpinglagesDivergents extends Error {
  constructor(item_id: string) {
    super(`Le tirage épingle l'item ${item_id} sur deux versions ou deux empreintes : la version mesurée par le run est indécidable.`);
    this.name = "EpinglagesDivergents";
  }
}

/** Le fichier déjà écrit ne porte pas les items A que le tirage et `data/items` désignent aujourd'hui. */
export class FichierReverificationDivergent extends Error {
  constructor(detail: string) {
    super(`reverification-absence.json diverge du recalcul : ${detail}. Rien n'est écrit (jamais d'écrasement silencieux).`);
    this.name = "FichierReverificationDivergent";
  }
}

/** Un item porte une revérification de ce run que le fichier du run ne connaît pas : écrite hors de cette commande. */
export class ReverificationHorsFichier extends Error {
  constructor(item_id: string, run_id: string) {
    super(
      `L'item ${item_id} porte une revérification du run ${run_id} absente de reverification-absence.json : ` +
        `elle n'a pas été écrite par cette commande. Rien n'est écrit ; à examiner à la main.`,
    );
    this.name = "ReverificationHorsFichier";
  }
}

export class ConfirmationRefusee extends Error {
  constructor(detail: string) {
    super(`Confirmation refusée : ${detail}. Rien n'est écrit.`);
    this.name = "ConfirmationRefusee";
  }
}

/* -------------------------------------------------------- items A du tirage */

function memeEpinglage(a: ReferenceItem, b: ReferenceItem): boolean {
  return a.item_version === b.item_version && a.item_empreinte === b.item_empreinte;
}

/** Les items A que le tirage épingle, un par item, triés par identifiant. */
export function itemsAbsenceDuTirage(entrees: readonly EntreeDuTirage[], items: ReadonlyMap<string, Item>): readonly ReferenceItem[] {
  const retenues = new Map<string, ReferenceItem>();
  for (const { reference } of entrees.flatMap((entree) => entree.items_au_gel)) {
    const item = items.get(reference.item_id);
    if (item === undefined) throw new ItemDuTirageIntrouvable(reference.item_id);
    if (item.type !== "A") continue;
    const deja = retenues.get(reference.item_id);
    if (deja !== undefined && !memeEpinglage(deja, reference)) throw new EpinglagesDivergents(reference.item_id);
    retenues.set(reference.item_id, { item_id: reference.item_id, item_version: reference.item_version, item_empreinte: reference.item_empreinte });
  }
  return [...retenues.values()].sort((a, b) => comparerChaines(a.item_id, b.item_id));
}

/* ------------------------------------------------------------ état des items */

export type EtatItemAbsence =
  /** Confirmé dans le fichier et dans l'item : rien à faire. */
  | { readonly etat: "confirme"; readonly reference: ReferenceItem; readonly confirmation: ConfirmationAbsence }
  /** Confirmé dans le fichier, pas encore dans l'item (écriture interrompue) : l'item est complété. */
  | { readonly etat: "a_completer"; readonly reference: ReferenceItem; readonly confirmation: ConfirmationAbsence }
  /** La version courante de l'item n'est pas celle que le tirage épingle : pas confirmable. */
  | { readonly etat: "modifie_depuis_le_gel"; readonly reference: ReferenceItem; readonly version_courante: number }
  /** Attend la confirmation de l'annotateur, avec les nouvelles sources T1 à examiner. */
  | { readonly etat: "a_confirmer"; readonly reference: ReferenceItem; readonly nouvelles_sources: readonly SourceCollectee[] };

export interface EntreesEtat {
  readonly run_id: string;
  readonly references: readonly ReferenceItem[];
  readonly items: ReadonlyMap<string, Item>;
  readonly sources: readonly SourceCollectee[];
  /** Le fichier du run déjà écrit, ou `null` s'il n'existe pas encore. */
  readonly existant: FichierReverification | null;
}

function cleEpinglage(reference: ReferenceItem): string {
  return `${reference.item_id}@${reference.item_version}:${reference.item_empreinte}`;
}

/** Le fichier déjà écrit porte exactement les items que le recalcul désigne, sur les mêmes épinglages. */
function exigerFichierConforme(entrees: EntreesEtat): void {
  const { existant } = entrees;
  if (existant === null) return;
  if (existant.run_id !== entrees.run_id) throw new FichierReverificationDivergent(`run ${existant.run_id}, et non ${entrees.run_id}`);
  const ecrits = existant.items.map((entree) => cleEpinglage(entree.reference)).join(" ");
  const recalcules = entrees.references.map(cleEpinglage).join(" ");
  if (ecrits !== recalcules) throw new FichierReverificationDivergent("les items A ou leurs épinglages ont changé depuis son écriture");
}

function itemExistant(entrees: EntreesEtat, item_id: string): Item {
  const item = entrees.items.get(item_id);
  if (item === undefined) throw new ItemDuTirageIntrouvable(item_id);
  return item;
}

function reverifiePourLeRun(item: Item, run_id: string): boolean {
  const absence = item.absence;
  if (absence === undefined) throw new Error(`Item A ${item.id} sans bloc absence : non conforme à item.schema.json.`);
  return absence.reverifications.some((reverification) => reverification.run_id === run_id);
}

function confirmationEcrite(entrees: EntreesEtat, item_id: string): ConfirmationAbsence | undefined {
  return entrees.existant?.items.find((entree) => entree.reference.item_id === item_id)?.confirmation;
}

function etatDe(entrees: EntreesEtat, reference: ReferenceItem): EtatItemAbsence {
  const item = itemExistant(entrees, reference.item_id);
  const confirmation = confirmationEcrite(entrees, reference.item_id);
  const dansItem = reverifiePourLeRun(item, entrees.run_id);
  if (confirmation !== undefined) return { etat: dansItem ? "confirme" : "a_completer", reference, confirmation };
  if (dansItem) throw new ReverificationHorsFichier(item.id, entrees.run_id);
  if (item.version !== reference.item_version || item.empreinte !== reference.item_empreinte) {
    return { etat: "modifie_depuis_le_gel", reference, version_courante: item.version };
  }
  const nouvelles = [...nouvellesSourcesT1(item, entrees.sources)].sort((a, b) => comparerChaines(a.sha256, b.sha256));
  return { etat: "a_confirmer", reference, nouvelles_sources: nouvelles };
}

/** L'état de chaque item A du tirage, dans l'ordre des références. */
export function etatsDesItems(entrees: EntreesEtat): readonly EtatItemAbsence[] {
  exigerFichierConforme(entrees);
  return entrees.references.map((reference) => etatDe(entrees, reference));
}

/* --------------------------------------------------------------- confirmation */

/** Ce que l'annotateur a saisi. */
export interface DemandeConfirmation {
  /** Les items nommés un à un : seul moyen de confirmer un item qui a une nouvelle source T1. */
  readonly confirmer: ReadonlySet<string>;
  /** Confirme d'un geste tous les items à confirmer sans nouvelle source T1. */
  readonly sans_nouvelle_source: boolean;
  readonly annotateur: string;
  readonly date: string;
}

function exigerNommesConfirmables(etats: readonly EtatItemAbsence[], demande: DemandeConfirmation): void {
  for (const item_id of demande.confirmer) {
    const etat = etats.find((candidat) => candidat.reference.item_id === item_id);
    if (etat === undefined) throw new ConfirmationRefusee(`${item_id} n'est pas un item A du tirage de ce run`);
    if (etat.etat === "modifie_depuis_le_gel") {
      throw new ConfirmationRefusee(
        `l'item ${item_id} est en version ${etat.version_courante} dans data/items, le tirage épingle la version ${etat.reference.item_version}`,
      );
    }
  }
}

function estDemande(etat: EtatItemAbsence & { readonly etat: "a_confirmer" }, demande: DemandeConfirmation): boolean {
  if (demande.confirmer.has(etat.reference.item_id)) return true;
  return demande.sans_nouvelle_source && etat.nouvelles_sources.length === 0;
}

function confirmationDe(etat: EtatItemAbsence & { readonly etat: "a_confirmer" }, demande: DemandeConfirmation): ConfirmationAbsence {
  return {
    date: demande.date,
    resultat: "absence_confirmee",
    confirme_par: demande.annotateur,
    item_version: etat.reference.item_version,
    item_empreinte: etat.reference.item_empreinte,
    nouvelles_sources_t1: etat.nouvelles_sources.map((source) => source.sha256),
  };
}

/**
 * Les confirmations nouvelles, par item. Un item déjà confirmé pour ce run, même nommé, n'en reçoit
 * pas une seconde ; un item nommé qui n'est pas un item A du tirage, ou qui a changé depuis le gel,
 * fait refuser toute la saisie.
 */
export function confirmationsNouvelles(etats: readonly EtatItemAbsence[], demande: DemandeConfirmation): ReadonlyMap<string, ConfirmationAbsence> {
  exigerNommesConfirmables(etats, demande);
  const nouvelles = new Map<string, ConfirmationAbsence>();
  for (const etat of etats) {
    if (etat.etat === "a_confirmer" && estDemande(etat, demande)) nouvelles.set(etat.reference.item_id, confirmationDe(etat, demande));
  }
  return nouvelles;
}

function confirmationApres(etat: EtatItemAbsence, nouvelles: ReadonlyMap<string, ConfirmationAbsence>): ConfirmationAbsence | undefined {
  if (etat.etat === "confirme" || etat.etat === "a_completer") return etat.confirmation;
  return nouvelles.get(etat.reference.item_id);
}

/** Le fichier du run après la saisie : les confirmations écrites gardées telles quelles, les nouvelles ajoutées. */
export function fichierApres(run_id: string, etats: readonly EtatItemAbsence[], nouvelles: ReadonlyMap<string, ConfirmationAbsence>): FichierReverification {
  return {
    run_id,
    items: etats.map((etat) => {
      const confirmation = confirmationApres(etat, nouvelles);
      return confirmation === undefined ? { reference: etat.reference } : { reference: etat.reference, confirmation };
    }),
  };
}

/** Les items à réécrire dans `data/items` : les confirmations nouvelles et celles à compléter. */
export function reverificationsAEcrire(
  etats: readonly EtatItemAbsence[],
  nouvelles: ReadonlyMap<string, ConfirmationAbsence>,
): ReadonlyMap<string, ConfirmationAbsence> {
  const a_ecrire = new Map(nouvelles);
  for (const etat of etats) if (etat.etat === "a_completer") a_ecrire.set(etat.reference.item_id, etat.confirmation);
  return a_ecrire;
}

/* -------------------------------------------------------------- réécriture */

export interface TraceReverification {
  readonly run_id: string;
  readonly commit: string;
}

/**
 * L'item publié avec sa revérification : une entrée ajoutée à `absence.reverifications[]` et une à
 * l'historique, version et empreinte inchangées (la revérification n'est pas du contenu notant).
 * `validation/domaine/ajout-seul.ts` le vérifie à l'écriture.
 */
export function itemAvecReverification(item: Item, confirmation: ConfirmationAbsence, trace: TraceReverification): Item {
  const absence = item.absence;
  if (item.type !== "A" || absence === undefined) throw new Error(`Item ${item.id} de type ${item.type} : seul un item A se revérifie (§4).`);
  if (item.historique === undefined) throw new Error(`Item ${item.id} sans historique[] : non conforme à item.schema.json.`);
  if (reverifiePourLeRun(item, trace.run_id)) throw new Error(`Item ${item.id} déjà revérifié pour le run ${trace.run_id} : aucune seconde revérification.`);
  const reverification: Reverification = {
    run_id: trace.run_id,
    date: confirmation.date,
    resultat: confirmation.resultat,
    confirme_par: confirmation.confirme_par,
  };
  const entree = {
    date: confirmation.date,
    changement: `revérification de l'absence pour le run ${trace.run_id} : absence confirmée par ${confirmation.confirme_par}`,
    commit: trace.commit,
    version_resultante: item.version,
  };
  return {
    ...item,
    absence: { ...absence, reverifications: [...absence.reverifications, reverification] },
    historique: [...item.historique, entree],
  };
}
