/**
 * `pnpm panel` — enregistrer la décision motivée du panel sur une contestation (protocole 0.10,
 * §4 « Droit de réponse », §10 « Panel d'arbitrage », annexe E, points 4 à 6).
 *
 *   pnpm panel --item=<id> --contestation=<id> --decision=maintien|correction|retrait|non_evaluabilite \
 *     --version-jugee=<n> --motivation-fichier=<chemin> [--dissidence-fichier=<chemin>]... \
 *     [--arbitre-seul] [--corrections=<fichier JSON>] [--ecrire]
 *
 * La motivation et chaque opinion dissidente sont lues de fichiers rédigés par le panel. Une
 * décision « correction » porte ses corrections dans un fichier JSON (tableau de corrections
 * `{ cible: "item", chemin, ancienne_valeur, nouvelle_valeur }`) : liste blanche, test verbatim
 * rejoué sur le texte canonique de `staging/textes/`, version incrémentée. `--arbitre-seul` publie
 * que l'auteur a tranché seul, faute de panel constitué (§10).
 *
 * Une décision rendue après 14 jours est acceptée ; son délai est imprimé et se calcule depuis
 * les deux dates publiées. Simulation par défaut ; `--ecrire` exige un arbre Git propre ; rien
 * n'est commité.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyserArguments, drapeau, multiples, obligatoire, texte, type Arguments } from "./arguments.ts";
import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";
import { lireTexteAuteur } from "./texte-auteur.ts";
import {
  appliquerDecisionPanel,
  DECISIONS_PANEL,
  type DecisionDuPanel,
  type DecisionPanel,
} from "../validation/domaine/contestation-item.ts";
import type { Correction } from "../validation/domaine/types.ts";
import { lireItem, reecrireItem } from "../validation/io/data-items.ts";
import { ajouterDues, controlerAjout, notificationDue } from "../validation/io/notifications-dues.ts";
import { lireTexteCanonique } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";
import { accesTexteCorrections } from "../validation/serveur/emplacements.ts";

const OPTIONS: readonly string[] = [
  "racine",
  "ecrire",
  "data",
  "notifications",
  "staging",
  "item",
  "contestation",
  "decision",
  "version-jugee",
  "corrections",
  "motivation-fichier",
  "dissidence-fichier",
  "arbitre-seul",
];

interface Options {
  readonly ecrire: boolean;
  readonly racine: string;
  readonly data: string;
  readonly notifications: string;
  readonly staging: string;
}

function lireOptions(table: Arguments): Options {
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return {
    ecrire: drapeau(table, "ecrire"),
    racine,
    data: texte(table, "data", resolve(racine, "data/items")),
    notifications: texte(table, "notifications", resolve(racine, "validation/notifications")),
    staging: texte(table, "staging", resolve(racine, "staging")),
  };
}

function decisionDemandee(table: Arguments): DecisionPanel {
  const valeur = obligatoire(table, "decision", `l'une de ${DECISIONS_PANEL.join(", ")} (annexe E).`);
  if (!(DECISIONS_PANEL as readonly string[]).includes(valeur)) {
    throw new Error(`--decision vaut ${DECISIONS_PANEL.join(", ")} : ${JSON.stringify(valeur)}`);
  }
  return valeur as DecisionPanel;
}

function versionJugee(table: Arguments): number {
  const valeur = Number(obligatoire(table, "version-jugee", "la version de l'item que le panel a jugée."));
  if (!Number.isInteger(valeur) || valeur < 1) throw new Error("--version-jugee attend un entier ≥ 1.");
  return valeur;
}

function corrections(table: Arguments): readonly Correction[] {
  const chemin = texte(table, "corrections", "");
  if (chemin.length === 0) return [];
  const valeur: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!Array.isArray(valeur)) throw new Error(`--corrections : ${chemin} doit contenir un tableau JSON.`);
  return valeur as Correction[];
}

function construire(table: Arguments, bruts: readonly string[], date: string): DecisionDuPanel {
  return {
    contestation_id: obligatoire(table, "contestation", "la contestation décidée."),
    decision: decisionDemandee(table),
    version_jugee: versionJugee(table),
    motivation: lireTexteAuteur(obligatoire(table, "motivation-fichier", "le panel publie sa motivation."), "motivation"),
    opinions_dissidentes: multiples(bruts, "dissidence-fichier").map((chemin) => lireTexteAuteur(chemin, "opinion dissidente")),
    arbitre_seul: drapeau(table, "arbitre-seul"),
    corrections: corrections(table),
    date,
  };
}

function principal(): void {
  const bruts = process.argv.slice(2);
  const table = analyserArguments(bruts, OPTIONS);
  const options = lireOptions(table);
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const item_id = obligatoire(table, "item", "seul un item publié porte une contestation.");
  const lu = lireItem(options.data, item_id);
  const date = instantLocal(new Date());
  const decision = construire(table, bruts, date);
  const acces = accesTexteCorrections(lu.item, (sha) => (sha === null ? null : lireTexteCanonique(options.staging, sha)));
  const { item, autorisation } = appliquerDecisionPanel(lu.item, decision, { date, commit: commitCourant(options.racine) }, acces);
  process.stdout.write(`${JSON.stringify({ ...decision, statut_contestation: item.statut_contestation, statut_validation: item.statut_validation, version: item.version }, null, 2)}\n`);
  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire.\n");
    return;
  }
  // §4 (0.10) : la campagne est notifiée ; la file est écrite au même --ecrire, juste après l'item,
  // et contrôlée avant lui, pour qu'un item ne soit jamais publié sans sa notification.
  const dues = [notificationDue(item, "decision_panel")];
  controlerAjout(options.notifications, dues);
  reecrireItem(options.data, lu, item, autorisation);
  ajouterDues(options.notifications, dues);
  process.stdout.write(
    `\nDécision du panel enregistrée sur l'item ${item_id}.\n\n` +
      commandeGit([`data/items/${item_id}.json`, "validation/notifications/dues.jsonl"], `data: décision du panel sur l'item ${item_id}`, [
        `${decision.decision}, contestation ${decision.contestation_id}`,
      ]),
  );
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`${erreur.message}\n`);
  process.exitCode = 1;
}
