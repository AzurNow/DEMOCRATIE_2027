/**
 * La file des notifications dues aux campagnes : `validation/notifications/dues.jsonl`, publiée en
 * ajout seul (protocole 0.10, §4 « Droit de réponse »).
 *
 * Écrite au même `--ecrire` que l'item publié, juste après lui, par `pnpm promote` (création),
 * `pnpm contester` (contestation) et `pnpm panel` (décision du panel, ou délibération sans majorité,
 * §10 et annexe E, D72 (12)). Chacune prépare ses
 * notifications et les passe à `controlerAjout` **avant** d'écrire dans `data/` : une file illisible
 * arrête la commande quand rien n'est encore publié, au lieu de laisser un item publié sans
 * notification, que la relance ne réparerait pas (revue du 2026-10-12, constat 8). Lue par `pnpm notifier`
 * (Python), qui résout l'adresse au moment de l'envoi et journalise dans `envois.jsonl`.
 *
 * Comme le journal des annotateurs : aucune fonction de modification ; chaque ligne est confrontée
 * à `notification-due.schema.json` à la lecture et avant l'ajout ; une ligne tronquée ou illisible
 * arrête la commande ; un identifiant déjà présent est refusé (l'identifiant rend l'envoi
 * idempotent, il ne peut pas désigner deux événements).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../domaine/ulid.ts";
import type { Item } from "../domaine/types.ts";

export const EVENEMENTS_NOTIFICATION = ["creation", "modification", "contestation", "decision_panel", "deliberation_sans_majorite"] as const;
export type EvenementNotification = (typeof EVENEMENTS_NOTIFICATION)[number];

export interface NotificationDue {
  readonly id: string;
  readonly item_id: string;
  readonly candidat_id: string;
  readonly evenement: EvenementNotification;
  readonly date: string;
  readonly commit: string;
}

export class FileNotificationsIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`File des notifications illisible : ${chemin}\n${detail}\nRien n'est réparé automatiquement.`);
    this.name = "FileNotificationsIllisible";
  }
}

export function cheminDues(repertoire: string): string {
  return join(repertoire, "dues.jsonl");
}

/**
 * La notification de ce qui vient d'être écrit sur un item : sa date et son commit sont ceux de la
 * dernière entrée d'historique, que l'écriture vient d'ajouter. Un item sans historique est non
 * conforme, et rien n'est inventé à sa place.
 */
export function notificationDue(item: Item, evenement: EvenementNotification): NotificationDue {
  const derniere = item.historique?.[item.historique.length - 1] as { date?: unknown; commit?: unknown } | undefined;
  if (typeof derniere?.date !== "string" || typeof derniere.commit !== "string") {
    throw new Error(`Item ${item.id} sans entrée d'historique datée : aucune notification ne se date à sa place.`);
  }
  return { id: ulid(), item_id: item.id, candidat_id: item.candidat_id, evenement, date: derniere.date, commit: derniere.commit };
}

function analyserLigne(ligne: string, provenance: string, chemin: string): NotificationDue {
  let valeur: unknown;
  try {
    valeur = JSON.parse(ligne);
  } catch (erreur) {
    throw new FileNotificationsIllisible(chemin, `${provenance} : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  return valider<NotificationDue>("notification-due", valeur, provenance);
}

export function lireDues(repertoire: string): readonly NotificationDue[] {
  const chemin = cheminDues(repertoire);
  if (!existsSync(chemin)) return [];
  const contenu = readFileSync(chemin, "utf8");
  if (contenu.length === 0) return [];
  if (!contenu.endsWith("\n")) throw new FileNotificationsIllisible(chemin, "dernière ligne interrompue.");
  return contenu
    .slice(0, -1)
    .split("\n")
    .map((ligne, rang) => analyserLigne(ligne, `${chemin}, ligne ${rang + 1}`, chemin));
}

/**
 * Lève si `ajouterDues` refuserait ces notifications : file illisible, notification non conforme,
 * identifiant déjà présent. N'écrit rien.
 */
export function controlerAjout(repertoire: string, dues: readonly NotificationDue[]): void {
  const chemin = cheminDues(repertoire);
  const connus = new Set(lireDues(repertoire).map((due) => due.id));
  for (const due of dues) {
    valider("notification-due", due, `notification à ajouter à ${chemin}`);
    if (connus.has(due.id)) throw new FileNotificationsIllisible(chemin, `identifiant déjà présent : ${due.id}`);
    connus.add(due.id);
  }
}

/** Ajoute des notifications en fin de file ; les lignes existantes ne sont jamais réécrites. */
export function ajouterDues(repertoire: string, dues: readonly NotificationDue[]): void {
  const chemin = cheminDues(repertoire);
  controlerAjout(repertoire, dues);
  if (dues.length === 0) return;
  mkdirSync(repertoire, { recursive: true });
  appendFileSync(chemin, dues.map((due) => `${JSON.stringify(due)}\n`).join(""), { encoding: "utf8", flag: "a" });
}
