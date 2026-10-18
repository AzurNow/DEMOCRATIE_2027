/**
 * `pnpm arbitrer` — trancher les désaccords d'annotation (§4, règle de concordance, protocole 0.10).
 *
 * Sans `--item`, la commande **liste** les items en arbitrage, recalculés comme `pnpm promote` les
 * calcule (lots, journaux, `staging/`, registres ; jamais `file.json`), avec leur motif, l'instance
 * qui tranche et leur ancienneté. Elle n'écrit rien.
 *
 * Avec `--item`, elle enregistre une décision dans le registre publié en ajout seul
 * `validation/arbitrage/decisions.json` :
 *
 *   pnpm arbitrer --item=<id> --issue=verifie --retenu=original --arbitre=auteur \
 *     --motivation-fichier=<chemin> [--ecrire]
 *   pnpm arbitrer --item=<id> --issue=non_evaluable --arbitre=auteur --arbitre-seul \
 *     --motivation-fichier=<chemin> [--ecrire]
 *
 * L'arbitre choisit un contenu proposé (`original`, `correction:<annotateur>`,
 * `paraphrase:<annotateur>`) et n'en rédige aucun ; la motivation, elle, est rédigée par lui, dans
 * un fichier. La décision est contrôlée contre l'item tel qu'il est en arbitrage avant d'être
 * écrite : une décision que `pnpm promote` n'appliquerait pas n'est pas enregistrée.
 *
 * La commande ne promeut rien : `pnpm promote` le fait ensuite, et c'est lui qui écrit dans `data/`.
 * Simulation par défaut ; `--ecrire` exige un arbre Git propre ; rien n'est commité.
 */

import { resolve } from "node:path";
import { analyserArguments, drapeau, obligatoire, texte, type Arguments } from "./arguments.ts";
import { evaluerLots, type Verdict } from "./evaluation-lots.ts";
import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";
import {
  instanceArbitrage,
  motifsInapplicable,
  type DecisionArbitrage,
} from "../validation/domaine/arbitrage.ts";
import { ancienneteEnJours } from "../validation/domaine/corrections-mesure.ts";
import type { IssueArbitrage } from "../validation/domaine/promotion.ts";
import { ARBITRES, ISSUES_ARBITRAGE, type Arbitre, type IssueDecisionArbitrage } from "../validation/domaine/types.ts";
import { ulid } from "../validation/domaine/ulid.ts";
import { ajouterDecisionArbitrage, cheminRegistreArbitrage, lireRegistreArbitrage } from "../validation/io/arbitrage-fichier.ts";
import { lireItemsData } from "../validation/io/data-items.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";
import { lireTexteAuteur } from "./texte-auteur.ts";

const OPTIONS: readonly string[] = [
  "racine",
  "ecrire",
  "staging",
  "lots",
  "decisions",
  "mesures",
  "arbitrage",
  "data",
  "item",
  "retenu",
  "issue",
  "arbitre",
  "arbitre-seul",
  "motivation-fichier",
];

interface Options {
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  readonly arbitrage: string;
  readonly data: string;
  readonly item: string;
}

function lireOptions(table: Arguments): Options {
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return {
    ecrire: drapeau(table, "ecrire"),
    racine,
    staging: texte(table, "staging", resolve(racine, "staging")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    decisions: texte(table, "decisions", resolve(racine, "validation/decisions")),
    mesures: texte(table, "mesures", resolve(racine, "validation/mesures")),
    arbitrage: texte(table, "arbitrage", resolve(racine, "validation/arbitrage")),
    data: texte(table, "data", resolve(racine, "data/items")),
    item: texte(table, "item", ""),
  };
}

function verdictsCourants(options: Options, maintenant: string): readonly Verdict[] {
  return evaluerLots({
    staging: chargerStaging(options.staging),
    data: lireItemsData(options.data),
    lots: lireLots(options.lots),
    repertoire_decisions: options.decisions,
    registre_mesures: lireRegistre(options.mesures),
    registre_arbitrage: lireRegistreArbitrage(options.arbitrage),
    // Rien n'est promu ici : le commit n'entre dans aucun fichier écrit par cette commande.
    commit: commitCourant(options.racine),
    horodatage: maintenant,
  }).verdicts;
}

/* ------------------------------------------------------------------- liste */

function depuis(verdict: Verdict): string {
  const dates = verdict.dossier.decisions.map((decision) => decision.horodatage).sort();
  const derniere = dates[dates.length - 1];
  if (derniere === undefined) throw new Error(`Item ${verdict.item.id} en arbitrage sans décision.`);
  return derniere;
}

function ligneArbitrage(verdict: Verdict, maintenant: string): string {
  const issue = verdict.issue as IssueArbitrage;
  const instance = instanceArbitrage(verdict.dossier.decisions);
  const age = ancienneteEnJours(depuis(verdict), maintenant);
  const entete = `  ${verdict.item.id}  ${issue.motif}  [${verdict.lot_id}]  tranché par : ${instance}  ${age} jour(s)\n`;
  if (issue.decision_inapplicable === undefined) return entete;
  const motifs = issue.decision_inapplicable.motifs.map((motif) => `      ${motif}\n`).join("");
  return `${entete}    décision ${issue.decision_inapplicable.decision_id} inapplicable :\n${motifs}`;
}

function lister(options: Options): void {
  const maintenant = instantLocal(new Date());
  const verdicts = verdictsCourants(options, maintenant);
  const enArbitrage = verdicts.filter((verdict) => verdict.issue.sort === "arbitrage");
  const tranches = verdicts.filter((verdict) => verdict.issue.sort === "promouvoir" && verdict.issue.item.arbitrage !== undefined);
  process.stdout.write(`Items en arbitrage : ${enArbitrage.length}\n`);
  for (const verdict of enArbitrage) process.stdout.write(ligneArbitrage(verdict, maintenant));
  process.stdout.write(`\nTranchés au registre, promus par la prochaine exécution de pnpm promote : ${tranches.length}\n`);
  for (const verdict of tranches) process.stdout.write(`  ${verdict.item.id}  [${verdict.lot_id}]\n`);
}

/* --------------------------------------------------------------- décision */

function dansListe<T extends string>(valeur: string, liste: readonly T[], cle: string): T {
  if (!(liste as readonly string[]).includes(valeur)) {
    throw new Error(`--${cle} vaut ${liste.map((element) => `« ${element} »`).join(", ")} : ${JSON.stringify(valeur)}`);
  }
  return valeur as T;
}

function verdictDeItem(verdicts: readonly Verdict[], item_id: string): Verdict {
  const trouves = verdicts.filter((verdict) => verdict.item.id === item_id && verdict.issue.sort === "arbitrage");
  const [seul] = trouves;
  if (seul === undefined || trouves.length > 1) {
    throw new Error(`Item ${item_id} : ${trouves.length} lot(s) le tiennent en arbitrage ; une décision en vise exactement un.`);
  }
  return seul;
}

function contenuEventuel(table: Arguments, issue: IssueDecisionArbitrage): { readonly contenu_retenu?: string } {
  if (issue !== "verifie") return {};
  return { contenu_retenu: obligatoire(table, "retenu", "vérifier un item, c'est retenir un contenu proposé (§4).") };
}

function construire(table: Arguments, verdict: Verdict, maintenant: string): DecisionArbitrage {
  const issue = dansListe(obligatoire(table, "issue", "l'issue de l'arbitrage n'est jamais implicite."), ISSUES_ARBITRAGE, "issue");
  const arbitre: Arbitre = dansListe(obligatoire(table, "arbitre", "« auteur » ou « panel »."), ARBITRES, "arbitre");
  return {
    id: ulid(),
    item_id: verdict.item.id,
    lot_id: verdict.lot_id,
    item_version: verdict.item.version,
    item_empreinte: verdict.item.empreinte,
    motif: (verdict.issue as IssueArbitrage).motif,
    issue,
    ...contenuEventuel(table, issue),
    arbitre,
    arbitre_seul: drapeau(table, "arbitre-seul"),
    motivation: lireTexteAuteur(obligatoire(table, "motivation-fichier", "§4 : la motivation est publiée."), "motivation"),
    date: maintenant,
  };
}

function enregistrer(table: Arguments, options: Options): void {
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const maintenant = instantLocal(new Date());
  const verdict = verdictDeItem(verdictsCourants(options, maintenant), options.item);
  const decision = construire(table, verdict, maintenant);
  const refus = motifsInapplicable(verdict.dossier, decision.motif, decision);
  if (refus.length > 0) {
    process.stderr.write(`Décision refusée, rien n'est écrit :\n${refus.map((motif) => `  ${motif}\n`).join("")}`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  if (!options.ecrire) {
    process.stdout.write(`\nSimulation : rien n'a été écrit dans ${cheminRegistreArbitrage(options.arbitrage)}. Ajouter --ecrire.\n`);
    return;
  }
  ajouterDecisionArbitrage(options.arbitrage, decision);
  process.stdout.write(
    `\nDécision ${decision.id} ajoutée au registre. pnpm promote promouvra l'item.\n\n` +
      commandeGit(["validation/arbitrage/decisions.json"], `validation: arbitrage de l'item ${decision.item_id}`, [
        `${decision.issue} (${decision.motif})`,
      ]),
  );
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const options = lireOptions(table);
  if (options.item.length === 0) lister(options);
  else enregistrer(table, options);
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`${erreur.message}\n`);
  process.exitCode = 1;
}
