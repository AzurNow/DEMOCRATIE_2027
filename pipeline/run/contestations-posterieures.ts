/**
 * Les contestations postérieures d'un run gelé (§8, recalcul (b) : « en excluant les questions
 * dont un item, quel que soit son rôle, est contesté à un run ultérieur » ; D72 (1), D73 (2) et (4)).
 *
 * `run.json#/contestations_posterieures` est l'entrée exacte de (b) (`analysis/robustesse.ts`,
 * `analysis/recalcul-b.ts`). Ce module la tient à jour depuis la seule source des contestations, les
 * items publiés (`data/items/*.json#/contestations`, écrits par `pnpm contester`) :
 *
 * - D73 (4) : tout run gelé non invalide la reçoit (`planifie`, `en_cours`, `publie`,
 *   `publie_provisoire`), et non plus les seuls runs publiés : elle doit y être avant `pnpm analyze`,
 *   pour que le (b) de `metriques.json` porte les contestations connues à son calcul
 *   (`exigerContestationsInscrites`). Un run `invalide` ne reçoit rien. Toute contestation y entre,
 *   que son item soit au tirage du run ou non ;
 * - D73 (2) : est postérieure toute contestation que ne porte pas le commit des données inscrit au
 *   gel (`run.json#/versions/donnees_commit`), quelle que soit sa date : reçue après le gel, à
 *   l'instant même du gel, ou avant lui sans figurer au commit gelé. Une contestation que ce commit
 *   porte n'est jamais postérieure. Le commit est relu en Git, en local, par le mécanisme de
 *   `analysis/lecture-run.ts` (`ouvrirDepotDesItems`, `lireItemAuCommit`) ;
 * - en ajout seul : les entrées déjà présentes restent telles quelles, à leur place ; les nouvelles
 *   s'ajoutent à la fin, dans l'ordre de leur réception puis de leur identifiant ;
 * - une contestation déjà présente (même `contestation_id`) n'est pas ajoutée une seconde fois. Si
 *   l'entrée présente diffère de la contestation de l'item (autre item ou autre date), rien n'est
 *   réécrit : `ContestationPosterieureDivergente` arrête tout.
 *
 * Partie pure : `contestationsRecues`, `contestationsAAjouter`. Partie lue et écrite :
 * `synchroniserContestationsPosterieures`, qui lit chaque `runs/<date>/run.json` (validé contre son
 * schéma par `lireRunJson`) et les items contestés à son commit des données, calcule tous les ajouts,
 * valide chaque run modifié, puis seulement l'écrit par renommage (`ecriture.ts`). L'empreinte de
 * `run.json` change avec l'ajout : c'est voulu (§9, D72 (2)), Git est le journal.
 *
 * Où se lisent les items d'un run (`repertoireDesItemsPourLeRun`), pour `pnpm analyze` comme pour
 * `pnpm contestations-posterieures` :
 *
 * - par défaut, dans le `data/items` de la racine du dépôt Git qui porte ce run
 *   (`repertoireDesItemsDuRun`), jamais dans un répertoire désigné à la main, qui pourrait être vide
 *   ou d'un autre dépôt et rendre le contrôle muet (DETTE 2026-11-04 n° 1, D75 (12)) ;
 * - pour un run hors de tout dépôt Git (archive Zenodo vérifiée par un tiers, D75 (13)), dans le
 *   `data/items` d'un clone désigné (`--depot-des-items`), sous trois conditions qui empêchent ce
 *   choix de rendre le contrôle muet (`repertoireDesItemsDesigne`) : le run n'est dans aucun dépôt
 *   (un run dans son clone lit toujours ce clone) ; le chemin désigné est la racine d'un dépôt Git
 *   dont `HEAD` descend du commit des données du gel (`versions.donnees_commit`), de sorte que ses
 *   items sont ceux du projet, à cet instant ou après ; et ce dépôt porte des items.
 */

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { dispositionRunNote, lireItemAuCommit, lireRunJson, ouvrirDepotDesItems, type RunLu } from "../../analysis/lecture-run.ts";
import type { ContestationPosterieure } from "../../analysis/types.ts";
import { executerGit } from "../../outils/executer-git.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { contestationsDe } from "../../validation/domaine/contestation-item.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { lireItemsData } from "../../validation/io/data-items.ts";
import { lireInstant } from "../../analysis/heure-paris.ts";
import { ecrireParRenommage } from "./ecriture.ts";
import { STATUT_INVALIDE, type StatutRun } from "../../analysis/types-run.ts";

/** La part d'un run que ce module lit. */
export interface RunEtSesContestations {
  readonly id: string;
  readonly statut: StatutRun;
  readonly contestations_posterieures?: readonly ContestationPosterieure[];
}

/** Une entrée présente diffère de la contestation de même identifiant : jamais réécrite. */
export class ContestationPosterieureDivergente extends Error {
  readonly run_id: string;
  readonly contestation_id: string;

  constructor(run_id: string, presente: ContestationPosterieure, recue: ContestationPosterieure) {
    super(
      `Run ${run_id} : la contestation ${presente.contestation_id} figure déjà dans contestations_posterieures ` +
        `(${JSON.stringify(presente)}), différente de celle des items (${JSON.stringify(recue)}). ` +
        `Une entrée publiée n'est jamais réécrite : rien n'est écrit.`,
    );
    this.name = "ContestationPosterieureDivergente";
    this.run_id = run_id;
    this.contestation_id = presente.contestation_id;
  }
}

/** D73 (4) : tout run gelé la reçoit, sauf un run invalide. */
function recoitLesContestations(run: RunEtSesContestations): boolean {
  return run.statut !== STATUT_INVALIDE;
}

/**
 * Les contestations que porte le commit des données du gel, chacune désignée par
 * `cleDeContestation` : celles-là ne sont jamais postérieures (D73 (2)).
 */
export type ContestationsAuGel = ReadonlySet<string>;

/** La clé d'une contestation : son item et son identifiant. */
export function cleDeContestation(item_id: string, contestation_id: string): string {
  return `${item_id}/${contestation_id}`;
}

/** Les contestations de `item`, sous la forme de leur clé. */
function clesDe(item: Item): readonly string[] {
  return item.contestations === undefined ? [] : contestationsDe(item).map((contestation) => cleDeContestation(item.id, contestation.id));
}

/** Toutes les contestations portées par les items, sous la forme d'une entrée de `contestations_posterieures`. */
export function contestationsRecues(items: Iterable<Item>): readonly ContestationPosterieure[] {
  return [...items].flatMap((item) =>
    item.contestations === undefined
      ? []
      : contestationsDe(item).map((contestation) => ({ item_id: item.id, contestation_id: contestation.id, date_reception: contestation.date_reception })),
  );
}

function identiques(a: ContestationPosterieure, b: ContestationPosterieure): boolean {
  return a.item_id === b.item_id && a.contestation_id === b.contestation_id && a.date_reception === b.date_reception;
}

function presentes(run: RunEtSesContestations): readonly ContestationPosterieure[] {
  return run.contestations_posterieures === undefined ? [] : run.contestations_posterieures;
}

function instant(contestation: ContestationPosterieure): number {
  return lireInstant(contestation.date_reception, `contestation ${contestation.contestation_id}, date_reception`);
}

function ordreDeReception(a: ContestationPosterieure, b: ContestationPosterieure): number {
  return instant(a) - instant(b) || comparerChaines(a.contestation_id, b.contestation_id);
}

/**
 * Les contestations à ajouter à `run` : absentes du commit des données de son gel (`auGel`), quelle
 * que soit leur date, absentes de sa liste, chacune une fois. Vide pour un run invalide. Lève
 * `ContestationPosterieureDivergente` si une entrée présente, ou une autre contestation reçue de
 * même identifiant, en diffère.
 */
export function contestationsAAjouter(
  run: RunEtSesContestations,
  recues: readonly ContestationPosterieure[],
  auGel: ContestationsAuGel,
): readonly ContestationPosterieure[] {
  if (!recoitLesContestations(run)) return [];
  const connues = new Map(presentes(run).map((entree) => [entree.contestation_id, entree]));
  const nouvelles = new Map<string, ContestationPosterieure>();
  for (const recue of recues) {
    const connue = connues.get(recue.contestation_id) ?? nouvelles.get(recue.contestation_id);
    if (connue !== undefined && !identiques(connue, recue)) throw new ContestationPosterieureDivergente(run.id, connue, recue);
    if (connue === undefined && !auGel.has(cleDeContestation(recue.item_id, recue.contestation_id))) nouvelles.set(recue.contestation_id, recue);
  }
  return [...nouvelles.values()].sort(ordreDeReception);
}

/* ---------------------------------------------------------------- lecture et écriture */

/** Ce qu'une synchronisation ajoute à un run. */
export interface AjoutAuRun {
  readonly repertoire: string;
  readonly run_id: string;
  readonly ajoutees: readonly ContestationPosterieure[];
}

interface AjoutPrepare extends AjoutAuRun {
  readonly run_json: string;
  readonly apres: unknown;
}

/** Les répertoires de `runs/`, triés : chacun doit porter un `run.json` lisible, sinon refus. */
function repertoiresDeRuns(runs: string): readonly string[] {
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((entree) => entree.isDirectory())
    .map((entree) => entree.name)
    .sort(comparerChaines)
    .map((nom) => join(runs, nom));
}

/**
 * Les contestations que portent, au commit `commit` du dépôt de `data`, les items contestés
 * aujourd'hui. Un item absent de ce commit n'en porte aucune. Aucune lecture Git sans contestation.
 */
export function contestationsAuCommit(data: string, commit: string, recues: readonly ContestationPosterieure[]): ContestationsAuGel {
  const item_ids = [...new Set(recues.map((recue) => recue.item_id))].sort(comparerChaines);
  if (item_ids.length === 0) return new Set();
  const depot = ouvrirDepotDesItems(data, commit);
  return new Set(
    item_ids.flatMap((item_id) => {
      const item = lireItemAuCommit<Item>(depot, item_id);
      return item === null ? [] : clesDe(item);
    }),
  );
}

/** Les contestations à ajouter au run `run`, lues contre le commit des données de son gel. */
function aAjouterAuRun(run: RunLu, data: string, recues: readonly ContestationPosterieure[]): readonly ContestationPosterieure[] {
  if (!recoitLesContestations(run)) return [];
  return contestationsAAjouter(run, recues, contestationsAuCommit(data, run.versions.donnees_commit, recues));
}

/** Les contestations reçues des items de `data`, lues une fois par répertoire d'items. */
function recuesDe(data: string, lues: Map<string, readonly ContestationPosterieure[]>): readonly ContestationPosterieure[] {
  const deja = lues.get(data);
  if (deja !== undefined) return deja;
  const recues = contestationsRecues(lireItemsData(data).values());
  lues.set(data, recues);
  return recues;
}

function preparer(repertoire: string, depot_designe: string | null, lues: Map<string, readonly ContestationPosterieure[]>): AjoutPrepare | null {
  const run: RunLu = lireRunJson(repertoire);
  const data = itemsDuRunLu(repertoire, run, depot_designe);
  const ajoutees = aAjouterAuRun(run, data, recuesDe(data, lues));
  if (ajoutees.length === 0) return null;
  const run_json = dispositionRunNote(repertoire).run_json;
  const apres = valider<unknown>("run", { ...run, contestations_posterieures: [...presentes(run), ...ajoutees] }, `${run_json} après ajout de contestations postérieures`);
  return { repertoire, run_id: run.id, ajoutees, run_json, apres };
}

/**
 * Ajoute à chaque run gelé non invalide de `runs` les contestations des items de son dépôt
 * (`repertoireDesItemsPourLeRun` : le `data/items` du dépôt du run sans dépôt désigné, `null` ; ou
 * celui du clone `depot_designe` pour un run hors de tout dépôt) que ne porte pas le commit des
 * données de son gel. Tout est lu, calculé et validé avant la première écriture : un refus n'écrit
 * rien. Sans `ecrire`, rien n'est écrit et le résultat dit ce qui le serait.
 */
export function synchroniserContestationsPosterieures(runs: string, depot_designe: string | null, ecrire: boolean): readonly AjoutAuRun[] {
  const lues = new Map<string, readonly ContestationPosterieure[]>();
  const ajouts = repertoiresDeRuns(runs)
    .map((repertoire) => preparer(repertoire, depot_designe, lues))
    .filter((ajout): ajout is AjoutPrepare => ajout !== null);
  if (ecrire) {
    for (const ajout of ajouts) ecrireParRenommage(ajout.run_json, ajout.apres, "contestations-posterieures");
  }
  return ajouts.map(({ repertoire, run_id, ajoutees }) => ({ repertoire, run_id, ajoutees }));
}

/* ---------------------------------------------------------------- avant pnpm analyze */

/** D73 (4) : une contestation postérieure connue manque au run à analyser ; l'analyse ne se lance pas. */
export class ContestationsPosterieuresNonInscrites extends Error {
  readonly run_id: string;
  readonly manquantes: readonly ContestationPosterieure[];

  constructor(run_id: string, repertoire: string, manquantes: readonly ContestationPosterieure[]) {
    super(
      `Run ${run_id} (${repertoire}) : ${manquantes.length} contestation(s) postérieure(s) connue(s) absente(s) de ` +
        `run.json#/contestations_posterieures (${manquantes.map((c) => `${c.contestation_id}, item ${c.item_id}`).join(" ; ")}). ` +
        `Le recalcul (b) de metriques.json doit porter les contestations connues à son calcul (§8, D73 (4)) : ` +
        `lancer d'abord pnpm contestations-posterieures --ecrire, commiter, puis relancer pnpm analyze.`,
    );
    this.name = "ContestationsPosterieuresNonInscrites";
    this.run_id = run_id;
    this.manquantes = manquantes;
  }
}

/** Le répertoire du run n'est dans aucun dépôt Git : ni ses items ni son commit des données ne se lisent. */
export class DepotDuRunIntrouvable extends Error {
  constructor(repertoire_run: string, cause: string) {
    super(
      `${repertoire_run} n'est dans aucun dépôt Git lisible (${cause}). Les contestations connues se lisent dans le ` +
        `data/items du dépôt qui porte le run, et son commit des données dans ce même dépôt (D73 (2) et (4)).`,
    );
    this.name = "DepotDuRunIntrouvable";
  }
}

/**
 * Le dépôt du run n'a pas de `data/items`, ou n'y porte aucun item. Aucune contestation n'y est
 * lisible : c'est une donnée absente, jamais « zéro contestation connue ».
 */
export class ItemsDuDepotAbsents extends Error {
  constructor(repertoire_items: string) {
    super(
      `${repertoire_items} est absent ou ne porte aucun item. Un run gelé épingle des items validés : sans eux, ` +
        `les contestations connues sont illisibles, et le recalcul (b) ne peut pas les porter (§8, D73 (4)).`,
    );
    this.name = "ItemsDuDepotAbsents";
  }
}

/**
 * D75 (13) : le dépôt désigné par `--depot-des-items` ne peut pas tenir lieu du dépôt du run. Il est
 * refusé si le run est déjà dans un dépôt Git (`run_dans_un_depot` : ses items se lisent là, jamais
 * ailleurs), si le chemin n'est pas la racine d'un dépôt Git (`pas_la_racine_d_un_depot`), ou si le
 * commit des données du gel n'est pas un ancêtre de son `HEAD` (`commit_du_gel_absent` : un autre
 * projet, ou un clone arrêté avant le gel, dont les items ne diraient rien des contestations connues).
 */
export type MotifDepotDesItemsRefuse = "run_dans_un_depot" | "pas_la_racine_d_un_depot" | "commit_du_gel_absent";

export class DepotDesItemsRefuse extends Error {
  readonly motif: MotifDepotDesItemsRefuse;

  constructor(depot: string, repertoire_run: string, motif: MotifDepotDesItemsRefuse, detail: string) {
    super(
      `--depot-des-items=${depot} refusé pour le run ${repertoire_run} (${motif}) : ${detail}. Le dépôt désigné ne sert ` +
        `qu'à un run hors de tout dépôt Git, et seulement si le commit des données du gel est dans l'historique de son ` +
        `HEAD : sinon il rendrait muet le contrôle des contestations postérieures (D73 (4), D75 (13)).`,
    );
    this.name = "DepotDesItemsRefuse";
    this.motif = motif;
  }
}

/** `repertoire_items`, s'il porte au moins un item ; sinon `ItemsDuDepotAbsents`, jamais « zéro contestation ». */
function exigerDesItems(repertoire_items: string): string {
  if (!existsSync(repertoire_items) || !readdirSync(repertoire_items).some((nom) => nom.endsWith(".json"))) {
    throw new ItemsDuDepotAbsents(repertoire_items);
  }
  return repertoire_items;
}

/**
 * La racine du dépôt Git qui porte `repertoire`, telle que Git la rend (liens symboliques résolus) ;
 * lève `DepotDuRunIntrouvable` hors d'un dépôt. `pnpm contestations-posterieures --ecrire` y exige
 * un arbre propre.
 */
export function racineDuDepotDuRun(repertoire: string): string {
  const racine = executerGit(repertoire, ["rev-parse", "--show-toplevel"]);
  if (!racine.ok) throw new DepotDuRunIntrouvable(repertoire, racine.erreur);
  return racine.sortie.trim();
}

/**
 * Le `data/items` de la racine du dépôt Git qui porte `repertoire_run` : le seul répertoire où se
 * lisent les contestations connues de ce run, et où son commit des données se relit. Il se déduit,
 * il ne se demande pas : un répertoire désigné à la main (vide, ou d'un autre dépôt) rendrait le
 * contrôle muet. Lève `DepotDuRunIntrouvable` hors d'un dépôt, `ItemsDuDepotAbsents` sans item.
 */
export function repertoireDesItemsDuRun(repertoire_run: string): string {
  return exigerDesItems(join(racineDuDepotDuRun(repertoire_run), "data", "items"));
}

function memeChemin(a: string, b: string): boolean {
  return realpathSync.native(a) === realpathSync.native(b);
}

/**
 * D75 (13) : le `data/items` du clone `depot`, désigné pour le run de `repertoire_run`, gelé au
 * commit des données `donnees_commit` et rangé hors de tout dépôt Git (archive Zenodo vérifiée par un
 * tiers). Lève `DepotDesItemsRefuse` (motifs ci-dessus), puis `ItemsDuDepotAbsents` si le clone ne
 * porte aucun item.
 */
export function repertoireDesItemsDesigne(depot: string, repertoire_run: string, donnees_commit: string): string {
  const du_run = executerGit(repertoire_run, ["rev-parse", "--show-toplevel"]);
  if (du_run.ok) throw new DepotDesItemsRefuse(depot, repertoire_run, "run_dans_un_depot", `le run est dans le dépôt ${du_run.sortie.trim()}, dont il lit les items`);
  const racine = executerGit(depot, ["rev-parse", "--show-toplevel"]);
  if (!racine.ok || !memeChemin(racine.sortie.trim(), depot)) {
    throw new DepotDesItemsRefuse(depot, repertoire_run, "pas_la_racine_d_un_depot", racine.ok ? `la racine de son dépôt est ${racine.sortie.trim()}` : racine.erreur);
  }
  if (!executerGit(depot, ["merge-base", "--is-ancestor", donnees_commit, "HEAD"], donnees_commit).ok) {
    throw new DepotDesItemsRefuse(depot, repertoire_run, "commit_du_gel_absent", `le commit des données du gel ${donnees_commit} n'est pas dans l'historique de HEAD`);
  }
  return exigerDesItems(join(depot, "data", "items"));
}

/** Les items du run lu `run` : déduits de son dépôt (`null`), ou ceux du clone désigné. */
function itemsDuRunLu(repertoire_run: string, run: RunLu, depot_designe: string | null): string {
  return depot_designe === null ? repertoireDesItemsDuRun(repertoire_run) : repertoireDesItemsDesigne(depot_designe, repertoire_run, run.versions.donnees_commit);
}

/**
 * Le répertoire des items du run de `repertoire_run` : `repertoireDesItemsDuRun` sans dépôt désigné
 * (`null`), `repertoireDesItemsDesigne` avec, contre le commit des données de son `run.json`.
 */
export function repertoireDesItemsPourLeRun(repertoire_run: string, depot_designe: string | null): string {
  return depot_designe === null ? repertoireDesItemsDuRun(repertoire_run) : itemsDuRunLu(repertoire_run, lireRunJson(repertoire_run), depot_designe);
}

/**
 * Lève `ContestationsPosterieuresNonInscrites` si le run de `repertoire_run` n'inscrit pas une
 * contestation postérieure que portent aujourd'hui les items de son dépôt
 * (`repertoireDesItemsPourLeRun` : le `data/items` du dépôt du run, ou, pour un run hors de tout
 * dépôt, celui du clone `depot_designe`), lue contre le commit des données de son gel (même règle
 * que `synchroniserContestationsPosterieures`, sans rien écrire). Une divergence lève
 * `ContestationPosterieureDivergente`.
 */
export function exigerContestationsInscrites(repertoire_run: string, depot_designe: string | null = null): void {
  const data = repertoireDesItemsPourLeRun(repertoire_run, depot_designe);
  const run = lireRunJson(repertoire_run);
  const manquantes = aAjouterAuRun(run, data, contestationsRecues(lireItemsData(data).values()));
  if (manquantes.length > 0) throw new ContestationsPosterieuresNonInscrites(run.id, repertoire_run, manquantes);
}
