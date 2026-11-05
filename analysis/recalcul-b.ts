/**
 * Le recalcul (b) daté (§8 et §9, protocole 0.28, D70 (13)).
 *
 * §8 : « Le fichier des métriques d'un run, recalcul (b) compris sur les contestations connues à son
 * calcul, n'est jamais réécrit : après une contestation postérieure, le recalcul (b) mis à jour est
 * publié dans un fichier daté, à côté de lui (section 9). » §9 : le fichier des métriques « épingle
 * l'empreinte de ses entrées […], et un recalcul (b) mis à jour après une contestation postérieure
 * est publié dans un fichier daté, à côté ».
 *
 * Ce module ne définit aucune règle : la restriction (b) est `robustesse.ts:exclureItemsContestes`,
 * appelée par `robustesse-taux.ts:tauxRecalcule` ; le partage, les strates, les graines et la forme
 * de la section sont ceux d'`analyse-du-run.ts`. Il écrit
 * `runs/<date>/metriques/recalcul-b-<AAAA-MM-JJ>.json`, validé contre
 * `schema/recalcul-b.schema.json` avant toute écriture, et :
 *
 * - refuse sans `metriques.json` (`MetriquesDeReferenceAbsentes`) : un recalcul daté se publie à côté
 *   d'un fichier des métriques, jamais à sa place ;
 * - refuse si le fichier daté du jour existe déjà (`RecalculBDejaPublie`) : jamais réécrit non plus,
 *   même par un recalcul concurrent qui le publierait pendant celui-ci (publication par lien dur,
 *   `ecriture-une-fois.ts`) ;
 * - refuse si les entrées autres que les contestations ont changé depuis `metriques.json` (réponses,
 *   verdicts, notations, tirage, données, paramètres, partage de la population :
 *   `EntreesDuRecalculDivergentes`). §8 : « Chaque recalcul garde le partage […] du calcul
 *   principal » ; un (b) qui mêlerait une contestation et un autre changement ne serait plus le (b)
 *   mis à jour.
 *
 * Les contestations lues sont `run.json#/contestations_posterieures`, l'entrée exacte de (b), à
 * l'instant du calcul ; publiées en clair, triées, avec leur empreinte. Une liste absente de
 * `run.json` est publiée vide : c'est la lecture de `exclureItemsContestes` (aucune contestation
 * postérieure enregistrée), et l'empreinte du run, publiée à côté, désigne ce fichier tel quel.
 * `identique_a_la_reference` dit si le (b) mis à jour est égal, à la forme canonique près, au (b) de
 * `metriques.json` : constaté, jamais supposé.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { comparerChaines } from "../outils/ordre-chaines.ts";
import { jsonDe, valider } from "../outils/schemas/valider.ts";
import { canoniser, empreinteDe } from "../validation/domaine/empreinte.ts";
import {
  cheminMetriques,
  collecterGraines,
  contexteDuRun,
  entreesPubliees,
  lireEntreesDuRun,
  optionsBootstrap,
  populationDe,
  surCouplesCompares,
  type ContexteDuRun,
  type EntreesDuRun,
  type OptionsLectureAnalyse,
  type ParametresAnalyse,
} from "./analyse-du-run.ts";
import { ecrireUneFois } from "./ecriture-une-fois.ts";
import { assembler } from "./filtre.ts";
import type { Recalcul } from "./robustesse.ts";
import { tauxRecalcule } from "./robustesse-taux.ts";
import type { ContestationPosterieure } from "./types.ts";

const RECALCUL_B: Recalcul = "items_contestes";

/** Le fichier des métriques de référence, tel que lu sur disque. */
export interface MetriquesDeReference {
  readonly chemin: string;
  readonly texte: string;
}

/** La part de `metriques.json` que lit le recalcul daté, validée contre son schéma. */
interface MetriquesLues {
  readonly run_id: string;
  readonly entrees: Readonly<Record<string, unknown>> & { readonly run_json_sha256: string };
  readonly parametres: ParametresAnalyse;
  readonly population: object;
  readonly robustesse: { readonly taux: { readonly statut: "sans_objet" } | { readonly statut: "calcule"; readonly recalculs: readonly { readonly recalcul: string }[] } };
}

/* ------------------------------------------------------------------ erreurs */

export class MetriquesDeReferenceAbsentes extends Error {
  constructor(chemin: string) {
    super(`${chemin} absent : le recalcul (b) daté se publie à côté du fichier des métriques du run (§8), lancer d'abord pnpm analyze.`);
    this.name = "MetriquesDeReferenceAbsentes";
  }
}

export class RecalculBDejaPublie extends Error {
  constructor(chemin: string) {
    super(`${chemin} existe déjà : un recalcul (b) daté n'est jamais réécrit, rien n'est écrit.`);
    this.name = "RecalculBDejaPublie";
  }
}

export class EntreesDuRecalculDivergentes extends Error {
  constructor(chemin: string, divergentes: readonly string[]) {
    super(
      `${chemin} : ${divergentes.join(", ")} diffère(nt) des entrées actuelles du run. Le recalcul (b) daté ne change que ` +
        `les contestations ; rien n'est écrit, comprendre l'écart avant toute autre action.`,
    );
    this.name = "EntreesDuRecalculDivergentes";
  }
}

/* ------------------------------------------------------------------ calcul */

function lireReference(reference: MetriquesDeReference): MetriquesLues {
  return valider<MetriquesLues>("metriques", jsonDe(reference.texte, reference.chemin), reference.chemin);
}

function sansEmpreinteDuRun(entrees: object): object {
  return Object.fromEntries(Object.entries(entrees).filter(([cle]) => cle !== "run_json_sha256"));
}

/** Tout ce que le recalcul doit partager avec le calcul principal, hors des contestations. */
function verifierMemesEntrees(reference: MetriquesLues, chemin: string, actuelles: { readonly run_id: string; readonly entrees: object; readonly population: object }): void {
  const comparees: readonly (readonly [string, unknown, unknown])[] = [
    ["run_id", reference.run_id, actuelles.run_id],
    ["entrees (hors run_json_sha256)", sansEmpreinteDuRun(reference.entrees), sansEmpreinteDuRun(actuelles.entrees)],
    ["population", reference.population, actuelles.population],
  ];
  const divergentes = comparees.filter(([, avant, apres]) => canoniser(avant) !== canoniser(apres)).map(([nom]) => nom);
  if (divergentes.length > 0) throw new EntreesDuRecalculDivergentes(chemin, divergentes);
}

/** Le (b) de `metriques.json`, sous la forme de la section du recalcul daté. */
function bDeReference(reference: MetriquesLues, chemin: string): object {
  const taux = reference.robustesse.taux;
  if (taux.statut === "sans_objet") return taux;
  const b = taux.recalculs.filter((r) => r.recalcul === RECALCUL_B);
  if (b.length !== 1) throw new Error(`${chemin} : ${b.length} recalcul(s) ${RECALCUL_B} au lieu d'un.`);
  return { statut: "calcule", ...b[0] };
}

/** Le (b) seul, sur le partage et les strates du contexte, sous la forme de `metriques.json`. */
function sectionB(contexte: ContexteDuRun): object {
  return surCouplesCompares(contexte, () => {
    const { taux } = tauxRecalcule(RECALCUL_B, contexte.unites, contexte.sources_robustesse, contexte.couples, contexte.strates, contexte.candidats, optionsBootstrap(contexte));
    return { recalcul: RECALCUL_B, couples: taux.compares, couples_incomplets: taux.couples_incomplets };
  });
}

function contestationsLues(entrees: EntreesDuRun): ContestationPosterieure[] {
  const lues = entrees.run.contestations_posterieures;
  if (lues === undefined) return [];
  return lues
    .map((c) => ({ item_id: c.item_id, contestation_id: c.contestation_id, date_reception: c.date_reception }))
    .sort((a, b) => comparerChaines(a.contestation_id, b.contestation_id));
}

function empreinteOctets(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/**
 * Le document du recalcul (b) daté, sans rien écrire, validé contre son schéma. `date` : le jour du
 * calcul (AAAA-MM-JJ, heure de Paris), qui nomme le fichier.
 */
export function recalculB(entrees: EntreesDuRun, reference: MetriquesDeReference, date: string): object {
  const lue = lireReference(reference);
  const contexte = contexteDuRun(entrees, assembler(entrees), lue.parametres);
  const publiees = entreesPubliees(entrees);
  verifierMemesEntrees(lue, reference.chemin, { run_id: entrees.run.id, entrees: publiees, population: populationDe(contexte) });
  const recalcul = sectionB(contexte);
  const contestations = contestationsLues(entrees);
  const document = {
    run_id: entrees.run.id,
    date,
    reference: {
      fichier: basename(reference.chemin),
      metriques_json_sha256: empreinteOctets(reference.texte),
      run_json_sha256: lue.entrees.run_json_sha256,
    },
    entrees: { ...publiees, contestations_lues: contestations, contestations_sha256: empreinteDe(contestations) },
    parametres: lue.parametres,
    recalcul,
    identique_a_la_reference: canoniser(recalcul) === canoniser(bDeReference(lue, reference.chemin)),
  };
  return valider<object>("recalcul-b", { ...document, graines: collecterGraines(document.recalcul) }, `recalcul (b) du ${date}`);
}

/* ------------------------------------------------------------------ écriture */

/** `commun.schema.json#/$defs/date_civile`, vérifiée avant de nommer un fichier. */
const DATE_CIVILE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function cheminRecalculB(repertoire_run: string, date: string): string {
  return join(dirname(cheminMetriques(repertoire_run)), `recalcul-b-${date}.json`);
}

export interface ResultatRecalculB {
  readonly chemin: string;
  readonly document: object;
}

/**
 * `pnpm recalcul-b` : lire le run et `metriques.json`, recalculer (b), valider, écrire le fichier
 * daté. Rien n'est écrit sur un refus ; le fichier naît entier (temporaire, puis lien dur exclusif).
 * Le premier `existsSync` évite un calcul inutile ; c'est le lien qui tranche : un fichier daté
 * publié entre-temps par un autre recalcul lève `RecalculBDejaPublie` et reste intact.
 */
export function recalculerEtEcrireB(repertoire_run: string, options: OptionsLectureAnalyse, date: string): ResultatRecalculB {
  if (!DATE_CIVILE.test(date)) throw new Error(`Date du recalcul (b) mal formée : « ${date} » (AAAA-MM-JJ attendu).`);
  const chemin_reference = cheminMetriques(repertoire_run);
  if (!existsSync(chemin_reference)) throw new MetriquesDeReferenceAbsentes(chemin_reference);
  const chemin = cheminRecalculB(repertoire_run, date);
  if (existsSync(chemin)) throw new RecalculBDejaPublie(chemin);
  const reference = { chemin: chemin_reference, texte: readFileSync(chemin_reference, "utf8") };
  const document = recalculB(lireEntreesDuRun(repertoire_run, options), reference, date);
  const texte = `${JSON.stringify(document, null, 2)}\n`;
  mkdirSync(dirname(chemin), { recursive: true });
  ecrireUneFois(dirname(chemin), basename(chemin), texte, (deja) => new RecalculBDejaPublie(deja));
  return { chemin, document };
}
