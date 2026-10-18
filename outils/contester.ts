/**
 * `pnpm contester` — enregistrer une contestation reçue à l'adresse dédiée (protocole 0.10, §4
 * « Droit de réponse », annexe E, points 1 et 2).
 *
 *   pnpm contester --item=<id> --texte-fichier=<chemin> --recu-le=<instant ISO> --type=campagne \
 *     [--sources=<fichier JSON de sources>] [--caviardage] [--ecrire]
 *
 * L'item publié passe en « contestee » : il sort du tirage du run suivant jusqu'à la décision du
 * panel (`pnpm panel`). Le texte est lu d'un fichier préparé par l'auteur ; s'il contient les
 * coordonnées d'une personne physique, l'auteur les masque dans ce fichier avec une marque visible
 * et passe `--caviardage`, qui est publié. Un texte de plus de 1 000 caractères est refusé, jamais
 * tronqué.
 *
 * **Aucun paramètre ne reçoit l'adresse du contestataire** (§10) : la réponse part de la boîte
 * dédiée, et cette adresse n'entre dans aucun fichier du projet.
 *
 * Simulation par défaut ; `--ecrire` exige un arbre Git propre et écrit par `reecrireItem`, seul
 * chemin vers `data/items/` ; rien n'est commité.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyserArguments, drapeau, obligatoire, texte, type Arguments } from "./arguments.ts";
import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";
import { sansSautFinal } from "./texte-auteur.ts";
import {
  ajouterContestation,
  texteDeContestation,
  TYPES_CONTESTATAIRE,
  type Contestation,
  type TypeContestataire,
} from "../validation/domaine/contestation-item.ts";
import type { Source } from "../validation/domaine/types.ts";
import { ulid } from "../validation/domaine/ulid.ts";
import { lireItem, reecrireItem } from "../validation/io/data-items.ts";
import { ajouterDues, controlerAjout, notificationDue } from "../validation/io/notifications-dues.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

const OPTIONS: readonly string[] = [
  "racine",
  "ecrire",
  "data",
  "notifications",
  "item",
  "type",
  "sources",
  "texte-fichier",
  "recu-le",
  "caviardage",
];

interface Options {
  readonly ecrire: boolean;
  readonly racine: string;
  readonly data: string;
  readonly notifications: string;
}

function lireOptions(table: Arguments): Options {
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return { ecrire: drapeau(table, "ecrire"), racine, data: texte(table, "data", resolve(racine, "data/items")),
    notifications: texte(table, "notifications", resolve(racine, "validation/notifications")) };
}

function typeContestataire(table: Arguments): TypeContestataire {
  const valeur = obligatoire(table, "type", `l'un de ${TYPES_CONTESTATAIRE.join(", ")}.`);
  if (!(TYPES_CONTESTATAIRE as readonly string[]).includes(valeur)) {
    throw new Error(`--type vaut ${TYPES_CONTESTATAIRE.join(", ")} : ${JSON.stringify(valeur)}`);
  }
  return valeur as TypeContestataire;
}

/** Les sources nouvelles jointes, validées avec l'item entier contre `item.schema.json` à l'écriture. */
function sourcesNouvelles(table: Arguments): { readonly sources_nouvelles?: readonly Source[] } {
  const chemin = texte(table, "sources", "");
  if (chemin.length === 0) return {};
  const valeur: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!Array.isArray(valeur)) throw new Error(`--sources : ${chemin} doit contenir un tableau JSON de sources.`);
  return { sources_nouvelles: valeur as Source[] };
}

function construire(table: Arguments): Contestation {
  const brut = readFileSync(obligatoire(table, "texte-fichier", "le texte est publié tel quel (§4)."), "utf8");
  return {
    id: ulid(),
    date_reception: obligatoire(table, "recu-le", "la date de réception décide si l'item était contesté au gel."),
    texte: texteDeContestation(sansSautFinal(brut)),
    contestataire_type: typeContestataire(table),
    caviardage: drapeau(table, "caviardage"),
    ...sourcesNouvelles(table),
  };
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const options = lireOptions(table);
  if (options.ecrire && !ecriturePermise(options.racine)) return;
  const item_id = obligatoire(table, "item", "seul un item publié se conteste.");
  const lu = lireItem(options.data, item_id);
  const contestation = construire(table);
  const apres = ajouterContestation(lu.item, contestation, { date: instantLocal(new Date()), commit: commitCourant(options.racine) });
  process.stdout.write(`${JSON.stringify(contestation, null, 2)}\n`);
  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire.\n");
    return;
  }
  // §4 (0.10) : la campagne est notifiée ; la file est écrite au même --ecrire, juste après l'item,
  // et contrôlée avant lui, pour qu'un item ne soit jamais publié sans sa notification.
  const dues = [notificationDue(apres, "contestation")];
  controlerAjout(options.notifications, dues);
  reecrireItem(options.data, lu, apres, { corrections: false });
  ajouterDues(options.notifications, dues);
  process.stdout.write(
    `\nItem ${item_id} contesté : il sort du tirage du run suivant jusqu'à la décision du panel.\n\n` +
      commandeGit([`data/items/${item_id}.json`, "validation/notifications/dues.jsonl"], `data: contestation de l'item ${item_id}`, [`contestation ${contestation.id}`]),
  );
}

try {
  principal();
} catch (erreur) {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`${erreur.message}\n`);
  process.exitCode = 1;
}
