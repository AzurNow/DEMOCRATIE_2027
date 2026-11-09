/**
 * `pnpm reverifier-absence` — revérifier les items d'absence d'un run (§4, protocole 0.24,
 * D59 (11) ; annexe F, case 2). Lancée par l'auteur ou un annotateur, jamais par un agent.
 *
 *   ANNOTATEUR_ID=a1 pnpm reverifier-absence runs/2026-12-01
 *   ANNOTATEUR_ID=a1 pnpm reverifier-absence runs/2026-12-01 --confirmer-sans-nouvelle-source [--ecrire]
 *   ANNOTATEUR_ID=a1 pnpm reverifier-absence runs/2026-12-01 --confirmer=<item_id> [--confirmer=<item_id>…] [--ecrire]
 *
 * Pour chaque item A du tirage du run, la recherche automatique des nouvelles sources T1
 * (`validation/domaine/absence.ts:nouvellesSourcesT1`, sur les fiches de
 * `staging/sources/par-source/`) est imprimée ; l'annotateur l'examine, puis confirme l'absence :
 * d'un geste pour les items sans nouvelle source (`--confirmer-sans-nouvelle-source`), item par item
 * pour les autres (`--confirmer=<item_id>`, répétable). Rien n'est confirmé sans lui.
 *
 * Simulation par défaut ; `--ecrire` exige un arbre Git propre, écrit d'abord
 * `runs/<date>/reverification-absence.json` (lu par `pnpm go-no-go`), puis ajoute la revérification à
 * `absence.reverifications[]` de chaque item par `reecrireItem`, seul chemin vers `data/items/`
 * (règle 3). Une relance complète un item que l'écriture interrompue n'a pas atteint, et n'ajoute
 * jamais une seconde revérification pour le même run. Rien n'est commité.
 *
 * Code de sortie 1 : `ANNOTATEUR_ID` absent ou invalide, arbre sale avec `--ecrire`, item nommé hors
 * du tirage ou modifié depuis le gel, fiches des sources absentes, fichier du run divergent du
 * recalcul. Rien n'est alors écrit.
 */

import { relative, resolve } from "node:path";
import { lireRunJson, lireTirage } from "../analysis/lecture-run.ts";
import { cheminReverificationAbsence, ecrireReverificationAbsence, lireReverificationExistante } from "../pipeline/go-no-go/reverification-absence.ts";
import {
  confirmationsNouvelles,
  etatsDesItems,
  fichierApres,
  itemAvecReverification,
  itemsAbsenceDuTirage,
  reverificationsAEcrire,
  type ConfirmationAbsence,
  type EntreeDuTirage,
  type EtatItemAbsence,
} from "../validation/domaine/reverification-absence.ts";
import { cheminItem, lireItem, lireItemsData, reecrireItem } from "../validation/io/data-items.ts";
import { lireFichesSource } from "../validation/io/fiches-source.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";
import { canoniser } from "../validation/domaine/empreinte.ts";
import { analyserArguments, drapeau, multiples, texte, type Arguments } from "./arguments.ts";
import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";
import { validerFragment } from "./schemas/valider.ts";

const USAGE = "usage : ANNOTATEUR_ID=<pseudonyme> pnpm reverifier-absence <repertoire_run> [--confirmer=<item_id>]… [--confirmer-sans-nouvelle-source] [--ecrire]";
const OPTIONS: readonly string[] = ["racine", "data", "sources", "confirmer", "confirmer-sans-nouvelle-source", "ecrire"];

interface Options {
  readonly repertoire_run: string;
  readonly annotateur: string;
  readonly ecrire: boolean;
  readonly racine: string;
  readonly data: string;
  readonly sources: string;
  readonly confirmer: ReadonlySet<string>;
  readonly sans_nouvelle_source: boolean;
}

/** Comme `pnpm validate` : l'identité de l'annotateur est une variable d'environnement, jamais un défaut. */
function annotateurRequis(env: NodeJS.ProcessEnv): string {
  const annotateur = env["ANNOTATEUR_ID"];
  if (annotateur === undefined || annotateur.length === 0) {
    throw new Error(`ANNOTATEUR_ID n'est pas défini : la revérification est confirmée par un annotateur nommé (§4). ${USAGE}`);
  }
  return validerFragment<string>("reverification-absence", "#/$defs/confirmation/properties/confirme_par", annotateur, "ANNOTATEUR_ID");
}

function repertoireDemande(bruts: readonly string[]): string {
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return resolve(repertoire);
}

/** `--confirmer=<item_id>`, répétable ; `--confirmer` sans identifiant est refusé, jamais ignoré. */
function itemsNommes(bruts: readonly string[]): ReadonlySet<string> {
  const nommes = multiples(bruts, "confirmer");
  if (bruts.includes("--confirmer") || nommes.some((item_id) => item_id.length === 0)) {
    throw new Error(`--confirmer attend un identifiant d'item : --confirmer=<item_id>. ${USAGE}`);
  }
  return new Set(nommes);
}

function lireOptions(bruts: readonly string[], table: Arguments): Options {
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return {
    repertoire_run: repertoireDemande(bruts),
    annotateur: annotateurRequis(process.env),
    ecrire: drapeau(table, "ecrire"),
    racine,
    data: texte(table, "data", resolve(racine, "data/items")),
    sources: texte(table, "sources", resolve(racine, "staging/sources/par-source")),
    confirmer: itemsNommes(bruts),
    sans_nouvelle_source: drapeau(table, "confirmer-sans-nouvelle-source"),
  };
}

/* ------------------------------------------------------------------ affichage */

function ligneEtat(etat: EtatItemAbsence): readonly string[] {
  const tete = `  ${etat.reference.item_id} (version ${etat.reference.item_version})`;
  if (etat.etat === "confirme") return [`${tete} : déjà revérifié pour ce run (${etat.confirmation.confirme_par}, ${etat.confirmation.date})`];
  if (etat.etat === "a_completer") return [`${tete} : confirmé dans le fichier du run, revérification à reporter dans l'item`];
  if (etat.etat === "modifie_depuis_le_gel") return [`${tete} : modifié depuis le gel (version ${etat.version_courante}), non confirmable`];
  if (etat.nouvelles_sources.length === 0) return [`${tete} : aucune nouvelle source T1`];
  return [
    `${tete} : ${etat.nouvelles_sources.length} nouvelle(s) source(s) T1 à examiner avant de confirmer (--confirmer=${etat.reference.item_id})`,
    ...etat.nouvelles_sources.map((source) => `      ${source.sha256}  collectée le ${source.date_collecte}`),
  ];
}

function imprimerEtats(options: Options, etats: readonly EtatItemAbsence[]): void {
  const lignes = [`Revérification des items d'absence (§4) — ${options.repertoire_run}`, `  ${etats.length} item(s) A au tirage`, ...etats.flatMap(ligneEtat)];
  process.stdout.write(`${lignes.join("\n")}\n`);
}

/* ------------------------------------------------------------------ écriture */

function reecrireItems(options: Options, run_id: string, a_ecrire: ReadonlyMap<string, ConfirmationAbsence>): void {
  const commit = commitCourant(options.racine);
  for (const [item_id, confirmation] of a_ecrire) {
    const lu = lireItem(options.data, item_id);
    reecrireItem(options.data, lu, itemAvecReverification(lu.item, confirmation, { run_id, commit }), { corrections: false });
  }
}

function principal(): void {
  const bruts = process.argv.slice(2);
  const table = analyserArguments(bruts, OPTIONS);
  const options = lireOptions(bruts, table);
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const run = lireRunJson(options.repertoire_run);
  const items = lireItemsData(options.data);
  // `tirage.schema.json` exige `items_au_gel` de chaque entrée ; `TirageLu` ne le type pas (même lecture que `notation-simulee.ts`).
  const entrees = lireTirage(options.repertoire_run, run).entrees as unknown as readonly EntreeDuTirage[];
  const references = itemsAbsenceDuTirage(entrees, items);
  const existant = lireReverificationExistante(options.repertoire_run);
  const etats = etatsDesItems({ run_id: run.id, references, items, sources: lireFichesSource(options.sources), existant });
  imprimerEtats(options, etats);
  const demande = { confirmer: options.confirmer, sans_nouvelle_source: options.sans_nouvelle_source, annotateur: options.annotateur, date: instantLocal(new Date()) };
  const nouvelles = confirmationsNouvelles(etats, demande);
  const fichier = fichierApres(run.id, etats, nouvelles);
  const a_ecrire = reverificationsAEcrire(etats, nouvelles);
  process.stdout.write(`\n${nouvelles.size} confirmation(s) nouvelle(s), ${a_ecrire.size} item(s) à réécrire.\n`);
  if (!options.ecrire) {
    process.stdout.write("Simulation : rien n'a été écrit. Ajouter --ecrire.\n");
    return;
  }
  if (existant === null || canoniser(existant) !== canoniser(fichier)) ecrireReverificationAbsence(options.repertoire_run, fichier);
  reecrireItems(options, run.id, a_ecrire);
  process.stdout.write(
    `\n${commandeGit(
      [relative(options.racine, cheminReverificationAbsence(options.repertoire_run)), ...[...a_ecrire.keys()].map((item_id) => relative(options.racine, cheminItem(options.data, item_id)))],
      `data: revérification des items d'absence du run ${run.id}`,
      [`${nouvelles.size} confirmation(s) par ${options.annotateur}`],
    )}`,
  );
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`Revérification non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
  process.exitCode = 1;
}
