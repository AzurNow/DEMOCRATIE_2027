/**
 * La fenêtre d'un run (§6) : semi-ouverte [debut, fin), fin = debut + 48 h en heures absolues.
 *
 * Le début dépend du type du run (§6, protocole 0.32, D67, D74 (19) et (20)) : « ouverte le mardi
 * à 6 h, heure de Paris, pour un run régulier ; un run supplémentaire ouvre sa fenêtre à 6 h, heure
 * de Paris, le premier jour qui suit son instant de gel ; une réexécution ouvre la sienne selon la
 * règle du run invalidé qu'elle remplace, lue sur le run qu'elle désigne à son gel ». Le run
 * régulier (pilote, mensuel, hebdomadaire) ouvre un mardi à 06:00:00.000 heure de Paris (décision
 * de l'auteur du 2026-10-02). Le run supplémentaire (`supplementaire_*`) ouvre à 06:00:00.000 heure
 * de Paris le jour civil de Paris qui suit celui de son instant de gel (`run.json#/date_gel`), et
 * aucun autre : le jour du gel se lit à Paris, jamais en UTC. La règle de chaque type est une
 * donnée (`REGLE_PAR_TYPE`), pas une branche par type ; un type hors de `run.schema.json` est
 * refusé, jamais traité par défaut.
 *
 * La réexécution n'a pas de règle propre : elle prend celle du run que désigne son
 * `run_remplace_id`, lu parmi les runs du dépôt, et, si ce run est lui-même une réexécution, de
 * proche en proche jusqu'au run d'origine (`typeDOrigine`, recommandation de D75 (1), non encore
 * tranchée). La règle s'applique à la réexécution elle-même : pour celle d'un run supplémentaire,
 * le lendemain de l'instant de gel de la réexécution. Un run désigné introuvable, désigné deux
 * fois, ou une chaîne qui revient sur elle-même est une erreur nommée, jamais un repli sur le mardi.
 * Les runs du dépôt ne sont lus que si la règle en dépend (`RunsDuDepot`, appelée paresseusement).
 *
 * « Heures absolues » : la fin se calcule en millisecondes, jamais en heure civile. Une fenêtre
 * de mardi 6 h ne peut pas contenir un changement d'heure français (toujours un dimanche), mais
 * celle d'un run supplémentaire ouverte un samedi le contient : elle dure 48 heures réelles.
 */

import { TYPE_REEXECUTION, TYPES_RUN, type TypeRun } from "../run/types.ts";
import {
  DUREE_FENETRE_MS,
  HEURE_OUVERTURE_FENETRE,
  JOUR_OUVERTURE_FENETRE,
} from "./conditions.ts";
import { dateParis, heureParis, instantParis, lireInstant } from "./heure-paris.ts";

export interface Fenetre {
  readonly debut: string;
  readonly fin: string;
  readonly debut_ms: number;
  readonly fin_ms: number;
}

/** Ce que l'ouverture lit du run : son type, son instant de gel et, pour une réexécution, le run qu'elle remplace (`run.json`). */
export interface RunDeLaFenetre {
  readonly type_run: string;
  readonly date_gel: string;
  readonly run_remplace_id?: string;
}

/** Ce que la chaîne des remplacements lit d'un run du dépôt (`runs/<date>/run.json`). */
export interface MaillonDeRemplacement {
  readonly id: string;
  readonly type_run: string;
  readonly run_remplace_id?: string;
}

/** Les runs du dépôt, lus seulement quand l'ouverture en dépend (une réexécution). */
export type RunsDuDepot = () => readonly MaillonDeRemplacement[];

/** Un début de fenêtre qui ne respecte pas la règle d'ouverture du §6 pour son type de run. */
export class FenetreRefusee extends Error {
  constructor(debut: string, raison: string) {
    super(`Fenêtre refusée : « ${debut} » ${raison}.`);
    this.name = "FenetreRefusee";
  }
}

/** Un `type_run` hors de `run.schema.json#/properties/type_run` : aucune règle d'ouverture. */
export class TypeRunInconnu extends Error {
  constructor(type_run: string) {
    super(`Type de run « ${type_run} » inconnu (run.schema.json#/properties/type_run) : aucune règle d'ouverture de fenêtre (§6).`);
    this.name = "TypeRunInconnu";
  }
}

/** La chaîne des remplacements d'une réexécution ne mène à aucun run d'origine lisible (§6, D74 (19)). */
export class RemplacementIntrouvable extends Error {
  constructor(detail: string) {
    super(`Fenêtre d'une réexécution : ${detail} Aucune règle d'ouverture n'est supposée (§6, D74 (19)).`);
    this.name = "RemplacementIntrouvable";
  }
}

/** La chaîne des remplacements revient sur un run déjà parcouru : aucun run d'origine. */
export class RemplacementsEnCycle extends Error {
  constructor(parcourus: readonly string[]) {
    super(`Fenêtre d'une réexécution : la chaîne des remplacements boucle (${parcourus.join(" → ")}), aucun run d'origine (§6, D74 (19), D75 (1)).`);
    this.name = "RemplacementsEnCycle";
  }
}

type RegleOuverture = "mardi" | "lendemain_du_gel";
type TypeAvecRegle = Exclude<TypeRun, typeof TYPE_REEXECUTION>;

/** §6 (0.32) : la règle d'ouverture de chaque type de run qui en a une ; la réexécution prend celle du run remplacé. */
const REGLE_PAR_TYPE: Readonly<Record<TypeAvecRegle, RegleOuverture>> = {
  pilote: "mardi",
  mensuel: "mardi",
  hebdomadaire: "mardi",
  supplementaire_liste_officielle: "lendemain_du_gel",
  supplementaire_debat: "lendemain_du_gel",
};

function estTypeAvecRegle(type_run: string): type_run is TypeAvecRegle {
  return type_run !== TYPE_REEXECUTION && (TYPES_RUN as readonly string[]).includes(type_run);
}

/** Le run du dépôt qui porte `id`, seul de son `id` ; sinon une erreur nommée. */
function maillon(runs: readonly MaillonDeRemplacement[], id: string): MaillonDeRemplacement {
  const trouves = runs.filter((run) => run.id === id);
  const [trouve, second] = trouves;
  if (trouve === undefined) throw new RemplacementIntrouvable(`le run remplacé ${id} est introuvable parmi les runs du dépôt.`);
  if (second !== undefined) throw new RemplacementIntrouvable(`plusieurs runs du dépôt portent l'id ${id}.`);
  return trouve;
}

function remplaceDe(run: { readonly type_run: string; readonly run_remplace_id?: string }, nom: string): string {
  if (run.run_remplace_id !== undefined) return run.run_remplace_id;
  throw new RemplacementIntrouvable(`${nom} est une réexécution sans run_remplace_id.`);
}

/**
 * D75 (1), recommandation non encore tranchée : le type du run d'origine d'une réexécution, lu de
 * proche en proche sur `run_remplace_id` jusqu'au premier run qui n'est pas une réexécution. Un run
 * qui n'est pas une réexécution est son propre run d'origine, et les runs du dépôt ne sont pas lus.
 */
export function typeDOrigine(run: RunDeLaFenetre, runsDuDepot: RunsDuDepot): string {
  if (run.type_run !== TYPE_REEXECUTION) return run.type_run;
  const runs = runsDuDepot();
  const parcourus: string[] = [];
  let courant: { readonly type_run: string; readonly run_remplace_id?: string } = run;
  let nom = "la réexécution";
  while (courant.type_run === TYPE_REEXECUTION) {
    const id = remplaceDe(courant, nom);
    if (parcourus.includes(id)) throw new RemplacementsEnCycle([...parcourus, id]);
    parcourus.push(id);
    courant = maillon(runs, id);
    nom = `le run ${id}`;
  }
  return courant.type_run;
}

function regleDe(run: RunDeLaFenetre, runsDuDepot: RunsDuDepot): RegleOuverture {
  const type_run = typeDOrigine(run, runsDuDepot);
  if (!estTypeAvecRegle(type_run)) throw new TypeRunInconnu(type_run);
  return REGLE_PAR_TYPE[type_run];
}

/** 06:00:00.000 pile, heure de Paris. */
function estSixHeuresPile(ms: number): boolean {
  const civile = heureParis(ms);
  return civile.heure === HEURE_OUVERTURE_FENETRE && civile.minute === 0 && civile.seconde === 0 && ms % 1000 === 0;
}

/** `AAAA-MM-JJ` du jour civil de Paris qui suit celui de l'instant `ms`. */
function lendemainParis(ms: number): string {
  const civile = heureParis(ms);
  const lendemain = new Date(Date.UTC(civile.annee, civile.mois - 1, civile.jour + 1));
  return lendemain.toISOString().slice(0, 10);
}

/** La raison du refus d'un début `debut_ms` selon la règle, ou `null` s'il est conforme. */
function defautDOuverture(regle: RegleOuverture, debut_ms: number, date_gel_ms: number): string | null {
  const constate = `tombe le ${instantParis(debut_ms)} à Paris`;
  if (regle === "mardi") {
    const conforme = heureParis(debut_ms).jour_semaine === JOUR_OUVERTURE_FENETRE && estSixHeuresPile(debut_ms);
    return conforme ? null : `${constate}, pas un mardi à 06:00:00 (§6 : un run régulier ouvre le mardi à 6 h, heure de Paris)`;
  }
  const attendu = lendemainParis(date_gel_ms);
  const conforme = dateParis(debut_ms) === attendu && estSixHeuresPile(debut_ms);
  return conforme
    ? null
    : `${constate}, pas le ${attendu} à 06:00:00, premier jour qui suit le gel du ${instantParis(date_gel_ms)} ` +
        `(§6 : un run supplémentaire ouvre à 6 h, heure de Paris, le premier jour qui suit son gel)`;
}

export function ouvrirFenetre(debut: string, run: RunDeLaFenetre, runsDuDepot: RunsDuDepot): Fenetre {
  const regle = regleDe(run, runsDuDepot);
  const date_gel_ms = lireInstant(run.date_gel, "date_gel");
  const debut_ms = lireInstant(debut, "fenetre.debut");
  const defaut = defautDOuverture(regle, debut_ms, date_gel_ms);
  if (defaut !== null) throw new FenetreRefusee(debut, defaut);
  const fin_ms = debut_ms + DUREE_FENETRE_MS;
  return { debut, fin: instantParis(fin_ms), debut_ms, fin_ms };
}

/** Une tentative peut démarrer à `ms` si et seulement si debut ≤ ms < fin. */
export function tentativePeutDemarrer(fenetre: Fenetre, ms: number): boolean {
  return fenetre.debut_ms <= ms && ms < fenetre.fin_ms;
}
