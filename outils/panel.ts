/**
 * `pnpm panel` — enregistrer la décision motivée du panel sur une contestation (protocole 0.10,
 * §4 « Droit de réponse », §10 « Panel d'arbitrage », annexe E, points 4 à 6).
 *
 *   pnpm panel --item=<id> --contestation=<id> --decision=maintien|correction|retrait|non_evaluabilite \
 *     --version-jugee=<n> --motivation-fichier=<chemin> [--dissidence-fichier=<chemin>]... \
 *     [--arbitre-seul] [--corrections=<fichier JSON>] [--ecrire]
 *
 *   pnpm panel --item=<id> --contestation=<id> --version-jugee=<n> --sans-majorite=<fichier JSON> [--ecrire]
 *
 * La motivation et chaque opinion dissidente sont lues de fichiers rédigés par le panel. Une
 * décision « correction » porte ses corrections dans un fichier JSON (tableau de corrections
 * `{ cible: "item", chemin, ancienne_valeur, nouvelle_valeur }`) : liste blanche, test verbatim
 * rejoué sur le texte canonique de `staging/textes/`, version incrémentée. `--arbitre-seul` publie
 * que l'auteur a tranché seul, faute de panel constitué (§10).
 *
 * Sans majorité (§10 et annexe E, protocole 0.29, D71 (8)), `--sans-majorite` remplace `--decision`
 * et ses pièces : son fichier porte l'opinion motivée de chaque membre votant et les membres
 * déportés (`outils/deliberation-panel.ts`). Rien ne change : l'item reste contesté et hors du
 * tirage ; la délibération s'ajoute à la contestation qu'elle tranche, sans jamais réécrire une
 * délibération antérieure. La campagne en est notifiée (protocole 0.30, D72 (12)) : une ligne
 * « deliberation_sans_majorite » est mise en file au même --ecrire, comme une décision. Le
 * contestataire, dont aucune adresse n'entre dans le projet (§10), reçoit la réponse depuis la boîte
 * dédiée, comme pour la contestation et la décision.
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
import { lireDeliberation } from "./deliberation-panel.ts";
import { lireTexteAuteur } from "./texte-auteur.ts";
import {
  appliquerDecisionPanel,
  DECISIONS_PANEL,
  type DecisionDuPanel,
  type DecisionPanel,
  type ResultatPanel,
} from "../validation/domaine/contestation-item.ts";
import { enregistrerDeliberationSansMajorite } from "../validation/domaine/deliberation-sans-majorite.ts";
import type { Correction } from "../validation/domaine/types.ts";
import { lireItem, reecrireItem, type ItemLu } from "../validation/io/data-items.ts";
import { ajouterDues, controlerAjout, notificationDue, type EvenementNotification } from "../validation/io/notifications-dues.ts";
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
  "sans-majorite",
];

/** Les pièces d'une décision à la majorité : sans majorité, aucune n'a de sens. */
const PIECES_DE_DECISION: readonly string[] = ["decision", "motivation-fichier", "dissidence-fichier", "arbitre-seul", "corrections"];

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

interface Ecriture {
  readonly resultat: ResultatPanel;
  /** Ce qui est imprimé avant l'écriture. */
  readonly resume: object;
  /** L'événement notifié à la campagne : une décision comme une délibération sans majorité. */
  readonly evenement: EvenementNotification;
  readonly sujet: string;
  readonly detail: string;
}

function decisionMajoritaire(table: Arguments, bruts: readonly string[], options: Options, lu: ItemLu, date: string): Ecriture {
  const decision = construire(table, bruts, date);
  const acces = accesTexteCorrections(lu.item, (sha) => (sha === null ? null : lireTexteCanonique(options.staging, sha)));
  const resultat = appliquerDecisionPanel(lu.item, decision, { date, commit: commitCourant(options.racine) }, acces);
  const { item } = resultat;
  return {
    resultat,
    resume: { ...decision, statut_contestation: item.statut_contestation, statut_validation: item.statut_validation, version: item.version },
    evenement: "decision_panel",
    sujet: "décision du panel",
    detail: `${decision.decision}, contestation ${decision.contestation_id}`,
  };
}

function deliberationSansMajorite(table: Arguments, options: Options, lu: ItemLu, date: string): Ecriture {
  const fournies = PIECES_DE_DECISION.filter((cle) => table.has(cle));
  if (fournies.length > 0) {
    throw new Error(`--sans-majorite exclut les pièces d'une décision : ${fournies.map((cle) => `--${cle}`).join(", ")}.`);
  }
  const deliberation = {
    contestation_id: obligatoire(table, "contestation", "la contestation sur laquelle le panel a délibéré."),
    version_jugee: versionJugee(table),
    date,
    ...lireDeliberation(obligatoire(table, "sans-majorite", "le fichier de la délibération.")),
  };
  const resultat = enregistrerDeliberationSansMajorite(lu.item, deliberation, { date, commit: commitCourant(options.racine) });
  return {
    resultat,
    resume: { ...deliberation, statut_contestation: resultat.item.statut_contestation, version: resultat.item.version },
    evenement: "deliberation_sans_majorite",
    sujet: "délibération du panel sans majorité",
    detail: `contestation ${deliberation.contestation_id}, ${deliberation.opinions.length} votant(s)`,
  };
}

function ecrire(options: Options, lu: ItemLu, ecriture: Ecriture): void {
  const { item, autorisation } = ecriture.resultat;
  // §4 (0.10), §10 et annexe E (0.30) : la campagne est notifiée ; la file est écrite au même
  // --ecrire, juste après l'item, et contrôlée avant lui, pour qu'un item ne soit jamais publié sans
  // sa notification.
  const dues = [notificationDue(item, ecriture.evenement)];
  controlerAjout(options.notifications, dues);
  reecrireItem(options.data, lu, item, autorisation);
  ajouterDues(options.notifications, dues);
}

function principal(): void {
  const bruts = process.argv.slice(2);
  const table = analyserArguments(bruts, OPTIONS);
  const options = lireOptions(table);
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const item_id = obligatoire(table, "item", "seul un item publié porte une contestation.");
  const lu = lireItem(options.data, item_id);
  const date = instantLocal(new Date());
  const ecriture = table.has("sans-majorite") ? deliberationSansMajorite(table, options, lu, date) : decisionMajoritaire(table, bruts, options, lu, date);
  process.stdout.write(`${JSON.stringify(ecriture.resume, null, 2)}\n`);
  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire.\n");
    return;
  }
  ecrire(options, lu, ecriture);
  const sujet = ecriture.sujet.charAt(0).toUpperCase() + ecriture.sujet.slice(1);
  process.stdout.write(
    `\n${sujet} enregistrée sur l'item ${item_id}.\n\n` +
      commandeGit([`data/items/${item_id}.json`, "validation/notifications/dues.jsonl"], `data: ${ecriture.sujet} sur l'item ${item_id}`, [ecriture.detail]),
  );
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`${erreur.message}\n`);
  process.exitCode = 1;
}
