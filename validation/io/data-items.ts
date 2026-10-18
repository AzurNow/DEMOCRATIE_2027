/**
 * `data/items/` sur disque : **le seul module du dépôt qui y écrit** (règle 3 de `CLAUDE.md`).
 *
 * `tests/ecriture-data.test.ts` le vérifie : aucun autre fichier de `outils/`, `pipeline/`,
 * `validation/` ni `analysis/` ne combine une écriture disque et le chemin `data/items`. Les
 * commandes qui écrivent (`pnpm promote`, `pnpm arbitrer` par la promotion, `pnpm contester`,
 * `pnpm panel`) passent toutes par ici, derrière leurs garde-fous : simulation par défaut,
 * `--ecrire`, arbre Git propre (`outils/garde-fous-git.ts`).
 *
 * Trois opérations, et pas une de plus :
 *
 * - `lireItem` confronte l'item à `item.schema.json` et rend aussi l'empreinte des octets lus ;
 * - `creerItem` écrit un item nouveau, et refuse s'il existe déjà : un item publié ne se recrée pas ;
 * - `reecrireItem` refuse si le fichier a changé depuis sa lecture, valide l'item à écrire contre
 *   le schéma, puis contre la règle d'ajout seul (`domaine/ajout-seul.ts`).
 *
 * Toute écriture est atomique : un fichier temporaire du même répertoire, puis un lien (création,
 * qui échoue si la cible existe) ou un renommage (réécriture). Un arrêt brutal laisse l'ancien
 * fichier ou le nouveau, jamais un fichier tronqué.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonDe, valider } from "../../outils/schemas/valider.ts";
import { verifierAjoutSeul, type AutorisationReecriture } from "../domaine/ajout-seul.ts";
import type { Item } from "../domaine/types.ts";

export interface ItemLu {
  readonly item: Item;
  /** sha256 des octets du fichier au moment de la lecture : la réécriture le compare. */
  readonly empreinte_fichier: string;
}

export class ItemAbsentDeData extends Error {
  constructor(chemin: string) {
    super(`Item absent de data/ : ${chemin}. Seul un item publié se conteste ou se réécrit.`);
    this.name = "ItemAbsentDeData";
  }
}

export class ItemDejaDansData extends Error {
  constructor(chemin: string) {
    super(`Item déjà présent dans data/ : ${chemin}. Un item publié n'est jamais recréé.`);
    this.name = "ItemDejaDansData";
  }
}

export class FichierModifieDepuisLecture extends Error {
  constructor(chemin: string) {
    super(
      `${chemin} a changé entre sa lecture et sa réécriture. Rien n'est écrit : relancer la ` +
        `commande, qui relira l'état courant.`,
    );
    this.name = "FichierModifieDepuisLecture";
  }
}

export function cheminItem(repertoire: string, item_id: string): string {
  return join(repertoire, `${item_id}.json`);
}

function empreinteOctets(octets: Buffer): string {
  return createHash("sha256").update(octets).digest("hex");
}

function lireFichier(chemin: string): ItemLu {
  const octets = readFileSync(chemin);
  const item = valider<Item>("item", jsonDe(octets.toString("utf8"), chemin), chemin);
  return { item, empreinte_fichier: empreinteOctets(octets) };
}

export function lireItem(repertoire: string, item_id: string): ItemLu {
  const chemin = cheminItem(repertoire, item_id);
  if (!existsSync(chemin)) throw new ItemAbsentDeData(chemin);
  const lu = lireFichier(chemin);
  if (lu.item.id !== item_id) throw new Error(`${chemin} porte l'item ${lu.item.id}, pas ${item_id}.`);
  return lu;
}

/** Tous les items publiés, chacun validé. Un répertoire absent est un `data/` encore vide. */
export function lireItemsData(repertoire: string): ReadonlyMap<string, Item> {
  const table = new Map<string, Item>();
  if (!existsSync(repertoire)) return table;
  for (const nom of readdirSync(repertoire).sort()) {
    if (!nom.endsWith(".json")) continue;
    const { item } = lireFichier(join(repertoire, nom));
    table.set(item.id, item);
  }
  return table;
}

function contenu(item: Item, chemin: string): string {
  return `${JSON.stringify(valider<Item>("item", item, `item à écrire dans ${chemin}`), null, 2)}\n`;
}

function temporaire(repertoire: string, item_id: string): string {
  return join(repertoire, `.${item_id}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
}

/** Écrit dans un temporaire, puis le pose : `poser` crée (lien) ou remplace (renommage). */
function ecrireAtomique(repertoire: string, item: Item, poser: (source: string, cible: string) => void): void {
  const chemin = cheminItem(repertoire, item.id);
  const texte = contenu(item, chemin);
  mkdirSync(repertoire, { recursive: true });
  const tmp = temporaire(repertoire, item.id);
  writeFileSync(tmp, texte, { encoding: "utf8", flag: "wx" });
  try {
    poser(tmp, chemin);
  } finally {
    rmSync(tmp, { force: true });
  }
}

export function creerItem(repertoire: string, item: Item): void {
  const chemin = cheminItem(repertoire, item.id);
  if (existsSync(chemin)) throw new ItemDejaDansData(chemin);
  ecrireAtomique(repertoire, item, (source, cible) => {
    try {
      linkSync(source, cible);
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new ItemDejaDansData(cible);
      throw erreur;
    }
  });
}

/**
 * Réécrit un item publié, lu par `lireItem` : `lu` est ce qui a été lu, `apres` ce qui doit
 * l'être. Refus si les octets ont changé depuis, si `apres` n'est pas conforme au schéma, ou si
 * la réécriture n'est pas un ajout (`verifierAjoutSeul`).
 */
export function reecrireItem(repertoire: string, lu: ItemLu, apres: Item, autorisation: AutorisationReecriture): void {
  const chemin = cheminItem(repertoire, lu.item.id);
  if (!existsSync(chemin)) throw new ItemAbsentDeData(chemin);
  if (empreinteOctets(readFileSync(chemin)) !== lu.empreinte_fichier) throw new FichierModifieDepuisLecture(chemin);
  valider("item", apres, `item à réécrire dans ${chemin}`);
  verifierAjoutSeul(lu.item, apres, autorisation);
  ecrireAtomique(repertoire, apres, (source, cible) => {
    // Revérifié au dernier moment : la fenêtre entre la lecture et le renommage reste minimale.
    if (empreinteOctets(readFileSync(cible)) !== lu.empreinte_fichier) throw new FichierModifieDepuisLecture(cible);
    renameSync(source, cible);
  });
}
