/**
 * `pnpm geler` sans la ligne de commande : lit, assemble, passe la barrière, écrit — dans cet
 * ordre, et rien n'est écrit tant qu'un contrôle peut encore échouer.
 *
 * 1. Dépôt propre, ou refus avant toute lecture coûteuse (`depot.ts`) ; HEAD est le commit inscrit.
 * 2. Lectures : `config/gel.json`, `data/items/` et `data/mesures/` (les lecteurs de la barrière,
 *    chaque fichier validé contre son schéma), `data/formulations/` (son seul lecteur,
 *    `validation/io/data-formulations.ts`), `config/perimetre.yaml`.
 * 3. Pour une réexécution, le run qu'elle remplace (D51 (3), `remplacement.ts`) : `--remplace` et
 *    `--type-run=reexecution` vont ensemble, et le run désigné est sous `runs/`, invalidé ; il n'est
 *    jamais réécrit. Puis périmètre, fenêtre, questions (`assemblage.ts:preparer`), dont une fenêtre
 *    ouverte avant `date_gel`, refusée (D45 (4)), et celle d'une réexécution ouverte selon la règle
 *    du run qu'elle remplace (D74 (19)) ; destination libre, ou refus (`destination.ts`) ; l'empreinte des
 *    octets de `docs/PROTOCOLE.md` (`versions.protocole_sha256` ; le dépôt est propre, le fichier sur
 *    disque est celui du commit).
 * 4. L'ordre des instants (D45 (4), D48 (1), `instants.ts`) : un gel exécuté avant `date_gel`, ou à
 *    l'ouverture de sa fenêtre ou après, est refusé. Puis le run précédent (D45 (3), D48 (4) et (5),
 *    `precedent.ts`) : lu sous `runs/` du dépôt, publié, son tirage et son `questions.json` vérifiés
 *    sur les empreintes que son `run.json` déclare, ou son absence déclarée ; tout défaut est refusé.
 *    Puis le run de l'application du mois (§6, D73 (11), `application.ts`) : désigné
 *    d'après les runs déjà gelés sous `runs/`, ou refusé si leur ordre ne permet pas de le dire. Puis le tour drand de `date_gel` (`balise.ts:tourAuGel`) : pas encore émis, refus. Rien de tout
 *    cela n'appelle le réseau. Puis l'engagement archivé (D46, `engagement.ts`) : capture du commit HEAD, antérieure à
 *    `date_gel`, servie par la Wayback Machine. Puis la balise, lue sur les deux relais (D44,
 *    `balise.ts:lireBalise`). Chaque refus est nommé ; aucun repli.
 * 5. Graines et identifiant du run, dérivés de l'aléa (D44, D45 (1)) ; tirage, avec les reprises du
 *    run précédent (§5).
 * 6. La barrière de `pnpm symmetry`, les mêmes fonctions (`barriere.ts:jugerBarriere`), items et
 *    mesures recoupés avec le commit inscrit. Bloquée — refus nommé, symétrie rouge, invariant
 *    violé — : `GelBloque`, rien n'est écrit (règle 4). `ecart_tolere` : le gel continue, l'écart
 *    est inscrit dans `run.json#/symetrie`.
 * 7. Les trois fichiers et les réponses brutes des relais et de la Wayback Machine, écrits tout ou
 *    rien (`ecriture.ts`).
 *
 * Le gel lit `data/` et n'y écrit jamais (règle 3) : il écrit sous `runs/` ou sous la sortie demandée.
 * Le réseau ne passe que par les ports `relais` et `wayback` ; l'heure, que par `maintenant`.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { lireInstant } from "../../analysis/heure-paris.ts";
import { lireFormulationsData } from "../../validation/io/data-formulations.ts";
import type { Violation } from "../questions/invariants.ts";
import type { PositionsIncompatibles } from "../questions/tirabilite.ts";
import type { Item, Mesure, Question, Symetrie, Tirage } from "../questions/types.ts";
import type { FormulationsValidees } from "../reformulation/relecture.ts";
import { lireApplicationTestee } from "./application.ts";
import { fichiersDuGel, preparer, runAuGel, tirerAuGel } from "./assemblage.ts";
import type { EntreesGel } from "./assemblage.ts";
import { exigerTourEmis, identifiantDuRun, lireBalise, tourAuGel, valeursDesGraines } from "./balise.ts";
import type { BaliseLue } from "./balise.ts";
import { estUnRefus, jugerBarriere, lireRepertoire } from "./barriere.ts";
import type { Refus, VerdictBarriere } from "./barriere.ts";
import { lireConfigurationGel } from "./configuration.ts";
import { exigerDepotPropre } from "./depot.ts";
import { destinationDuRun } from "./destination.ts";
import { ecrireToutOuRien } from "./ecriture.ts";
import type { EcrireFichier } from "./ecriture.ts";
import { verifierEngagement } from "./engagement.ts";
import type { EngagementVerifie } from "./engagement.ts";
import { exigerGelApresDateGel, exigerGelAvantFenetre } from "./instants.ts";
import { lirePrecedent, lireRunsDuDepot } from "./precedent.ts";
import { lireRemplacement } from "./remplacement.ts";
import type { LireHttp } from "./reseau.ts";

export interface OptionsGel {
  /** La racine du dépôt lu : `data/`, `config/`, `docs/PROTOCOLE.md`, et `runs/` quand `sortie` est absente. */
  readonly racine: string;
  /** Absente : `runs/` du dépôt (gel réel, l'auteur seul). Présente : hors de `runs/`. */
  readonly sortie: string | undefined;
  readonly type_run: string;
  /** D51 (3) : l'`id` du run invalidé que remplace une `reexecution` ; `undefined` pour tout autre type. */
  readonly remplace: string | undefined;
  /** L'URL de la capture Wayback du commit gelé (D46) ; absente, le gel est refusé. */
  readonly engagement: string | undefined;
  /** Le port des deux relais drand. */
  readonly relais: LireHttp;
  /** Le port de l'API de disponibilité de la Wayback Machine. */
  readonly wayback: LireHttp;
  /**
   * L'instant présent, en millisecondes : un gel avant `date_gel`, à l'ouverture de sa fenêtre ou
   * après, ou dont le tour n'est pas encore émis, est refusé sans appel réseau.
   */
  readonly maintenant: () => number;
  readonly ecrire: EcrireFichier;
}

export interface ResultatGel {
  readonly repertoire: string;
  readonly run_id: string;
  readonly commit: string;
  readonly tour: number;
  readonly symetrie: Symetrie;
  readonly questions: readonly Question[];
  readonly tirage: Tirage;
  /**
   * §5 (protocole 0.27, D67) : les items aux positions en vigueur incompatibles, exclus du tirage
   * (motif `positions_incompatibles`), que l'auteur conteste dès le gel. `pnpm geler` les imprime.
   */
  readonly items_a_contester: readonly PositionsIncompatibles[];
}

/**
 * §5 (protocole 0.27, D67) : ce que `pnpm geler` imprime des items à contester dès le gel, une ligne
 * par candidat et mesure, chaque item avec sa position en vigueur. Chaîne vide sans conflit : la
 * sortie du gel est alors celle d'avant ce lot.
 */
export function texteItemsAContester(conflits: readonly PositionsIncompatibles[]): string {
  if (conflits.length === 0) return "";
  const lignes = conflits.map((conflit) => {
    const items = conflit.items.map((entree) => `${entree.item_id} (${entree.position})`).join(", ");
    return `    candidat ${conflit.candidat_id}, mesure ${conflit.mesure_id} : ${items}\n`;
  });
  return `  ${conflits.length} groupe(s) d'items aux positions incompatibles, exclus du tirage, à contester dès le gel (§5) :\n${lignes.join("")}`;
}

/** La barrière refuse le run : rien n'est écrit. */
export class GelBloque extends Error {
  readonly verdict: VerdictBarriere;

  constructor(verdict: VerdictBarriere) {
    super(`Gel refusé par la barrière de symétrie (§5, règle 4) ; rien n'est écrit.\n${motifsDuBlocage(verdict).join("\n")}`);
    this.name = "GelBloque";
    this.verdict = verdict;
  }
}

function motifsDeSymetrie(symetrie: Symetrie | Refus): readonly string[] {
  if (estUnRefus(symetrie)) return [`  symétrie non évaluée — ${symetrie.name} : ${symetrie.message}`];
  return symetrie.conditions
    .filter((condition) => condition.statut === "rouge")
    .map((condition) => `  rouge ${condition.code}${condition.commentaire === undefined ? "" : ` : ${condition.commentaire}`}`);
}

function motifDeViolation(violation: Violation): string {
  return `  invariant ${violation.invariant} — ${violation.objet} : ${violation.detail}`;
}

function motifsDuBlocage(verdict: VerdictBarriere): readonly string[] {
  return [...motifsDeSymetrie(verdict.symetrie), ...verdict.violations.map(motifDeViolation)];
}

interface Disposition {
  readonly items: string;
  readonly mesures: string;
  readonly formulations: string;
  readonly perimetre: string;
  readonly configuration: string;
  readonly protocole: string;
}

function disposition(racine: string): Disposition {
  return {
    items: join(racine, "data", "items"),
    mesures: join(racine, "data", "mesures"),
    formulations: join(racine, "data", "formulations"),
    perimetre: join(racine, "config", "perimetre.yaml"),
    configuration: join(racine, "config", "gel.json"),
    protocole: join(racine, "docs", "PROTOCOLE.md"),
  };
}

function lireFormulations(repertoire: string): ReadonlyMap<string, FormulationsValidees> {
  return new Map([...lireFormulationsData(repertoire)].map(([question_id, lues]) => [question_id, lues.formulations]));
}

function lireEntrees(chemins: Disposition): EntreesGel {
  const configuration = lireConfigurationGel(chemins.configuration);
  const items = lireRepertoire<Item>("item", chemins.items, "d'item");
  const mesures = lireRepertoire<Mesure>("mesure", chemins.mesures, "de mesure");
  const formulations = lireFormulations(chemins.formulations);
  const perimetre_brut: unknown = parse(readFileSync(chemins.perimetre, "utf8"));
  return { perimetre_brut, provenance_perimetre: chemins.perimetre, configuration, items, mesures, formulations };
}

function sha256DuFichier(chemin: string): string {
  return createHash("sha256").update(readFileSync(chemin)).digest("hex");
}

interface Alea {
  readonly engagement: EngagementVerifie;
  readonly balise: BaliseLue;
}

/** Tour émis, puis engagement, puis balise : le premier refus arrête tout, rien n'est écrit. */
async function lireAlea(options: OptionsGel, commit: string, date_gel_ms: number): Promise<Alea> {
  const tour = tourAuGel(date_gel_ms);
  exigerTourEmis(tour, options.maintenant());
  const engagement = await verifierEngagement(options.engagement, commit, date_gel_ms, options.wayback);
  const balise = await lireBalise(tour, options.relais);
  return { engagement, balise };
}

export async function geler(options: OptionsGel): Promise<ResultatGel> {
  const commit = exigerDepotPropre(options.racine);
  const chemins = disposition(options.racine);
  const entrees = lireEntrees(chemins);
  const run_remplace_id = lireRemplacement(options.racine, options.type_run, options.remplace);
  const runs_du_depot = () => lireRunsDuDepot(join(options.racine, "runs"));
  const prepare = preparer(entrees, { type_run: options.type_run, run_remplace_id, runs_du_depot });
  const destination = destinationDuRun(options.racine, options.sortie, prepare.date_repertoire);
  const protocole_sha256 = sha256DuFichier(chemins.protocole);

  const date_gel_ms = lireInstant(prepare.perimetre.date_gel, `${chemins.perimetre}, date_gel`);
  const maintenant_ms = options.maintenant();
  exigerGelApresDateGel(maintenant_ms, date_gel_ms);
  exigerGelAvantFenetre(maintenant_ms, prepare.fenetre.debut_ms);
  const precedent = lirePrecedent(options.racine, date_gel_ms);
  const application_testee = lireApplicationTestee(options.racine, options.type_run, date_gel_ms);
  const { engagement, balise } = await lireAlea(options, commit, date_gel_ms);
  const run_id = identifiantDuRun(date_gel_ms, balise.alea);
  const tire = tirerAuGel(prepare, entrees, run_id, valeursDesGraines(balise.alea), precedent);
  const verdict = jugerBarriere({
    repertoire_items: chemins.items,
    repertoire_mesures: chemins.mesures,
    tirage: tire.resultat.tirage,
    questions: prepare.questions,
    items: entrees.items,
    mesures: entrees.mesures,
    run: { ...runAuGel(prepare, run_id), versions: { donnees_commit: commit } },
  });
  if (verdict.bloque || estUnRefus(verdict.symetrie)) throw new GelBloque(verdict);

  const symetrie = verdict.symetrie;
  const meta = { type_run: options.type_run, commit, symetrie, protocole_sha256, balise, engagement, run_remplace_id, application_testee };
  const repertoire = ecrireToutOuRien(destination, fichiersDuGel(prepare, entrees, tire, meta), options.ecrire);
  return {
    repertoire,
    run_id,
    commit,
    tour: balise.tour,
    symetrie,
    questions: prepare.questions,
    tirage: tire.resultat.tirage,
    items_a_contester: tire.resultat.rapport.positions_incompatibles,
  };
}
