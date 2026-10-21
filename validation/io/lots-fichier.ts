/**
 * Manifestes de lots. Écrits une fois par `pnpm lots`, lus ensuite ; jamais réécrits — un lot
 * dont la composition change après coup rend son kappa incomparable à celui du lot d'avant.
 *
 * Le manifeste est commun aux deux annotateurs : sans items communs, il n'y a pas de kappa.
 * Il ne contient aucune décision, sa lecture ne dit donc rien de ce que l'autre a fait.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ErreurSchema, jsonDe, valider } from "../../outils/schemas/valider.ts";
import type { Lot, NatureLot } from "../domaine/types.ts";

const NATURES_CONNUES: readonly NatureLot[] = ["entrainement", "reel", "reannotation"];

/**
 * Un manifeste de lot non conforme à `schema/lot.schema.json` (champ manquant ou inconnu, type
 * faux, `nature` hors des trois valeurs connues, réannotation sans `reannote` ni
 * `date_calibration`, moins ou plus de deux annotateurs, deux annotateurs identiques), ou dont
 * `items` porte deux fois le même `item_id` — la seule règle que le schéma ne peut pas exprimer
 * (revue du 2026-10-12, constat 4) : JSON Schema ne garantit l'unicité que d'un objet entier dans
 * un tableau (`uniqueItems`), pas d'une seule de ses clés, et deux entrées du même item à des
 * versions différentes ne seraient alors pas vues comme des doublons.
 */
export class ManifesteLotInvalide extends Error {
  constructor(chemin: string, detail: string) {
    super(`Manifeste de lot invalide (${chemin}) : ${detail}`);
    this.name = "ManifesteLotInvalide";
  }
}

function estNatureConnue(valeur: unknown): valeur is NatureLot {
  return typeof valeur === "string" && (NATURES_CONNUES as readonly string[]).includes(valeur);
}

/**
 * Message de `ManifesteLotInvalide` pour une violation du schéma. Repris de `ErreurSchema.message`
 * (sans répéter le chemin, déjà porté par `ManifesteLotInvalide`), sauf pour `nature` : l'erreur
 * `enum` d'ajv ne cite jamais la valeur reçue, alors que le nommer est ce qui rend le refus
 * immédiatement compréhensible (message gardé identique à celui d'avant ce schéma).
 */
function detailDuRefus(valeurBrute: unknown, erreur: ErreurSchema, chemin: string): string {
  const nature = estObjet(valeurBrute) ? valeurBrute["nature"] : undefined;
  if (nature !== undefined && !estNatureConnue(nature)) {
    return `nature "${String(nature)}" inconnue (attendu : ${NATURES_CONNUES.join(", ")}).`;
  }
  const prefixe = `${chemin} : `;
  return erreur.message.startsWith(prefixe) ? erreur.message.slice(prefixe.length) : erreur.message;
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Confronte un manifeste, lu ou à écrire, à `schema/lot.schema.json` puis à l'unicité des
 * `item_id`. Seule frontière du domaine qui parle à ajv : `lireLot`, `lireLots`, `ecrireLot` et
 * `ecrireLots` l'appellent tous, pour qu'aucun des deux écrivains (la composition, une
 * réannotation) ne puisse produire un manifeste que l'autre refuserait.
 */
function validerManifeste(valeurBrute: unknown, chemin: string): Lot {
  let lot: Lot;
  try {
    lot = valider<Lot>("lot", valeurBrute, chemin);
  } catch (erreur) {
    if (!(erreur instanceof ErreurSchema)) throw erreur;
    throw new ManifesteLotInvalide(chemin, detailDuRefus(valeurBrute, erreur, chemin));
  }
  validerItemsUniques(lot, chemin);
  return lot;
}

function validerItemsUniques(lot: Lot, chemin: string): void {
  const vus = new Set<string>();
  for (const item of lot.items) {
    if (vus.has(item.item_id)) {
      throw new ManifesteLotInvalide(
        chemin,
        `item_id "${item.item_id}" figure deux fois dans items : un doublon gonflerait le n du ` +
          "kappa (apparier produirait deux paires pour la même décision).",
      );
    }
    vus.add(item.item_id);
  }
}

function lireEtValiderLot(chemin: string): Lot {
  return validerManifeste(jsonDe(readFileSync(chemin, "utf8"), chemin), chemin);
}

export function lireLots(repertoire: string): readonly Lot[] {
  if (!existsSync(repertoire)) return [];
  return readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort()
    .map((nom) => lireEtValiderLot(join(repertoire, nom)));
}

export function lireLot(repertoire: string, lot_id: string): Lot | null {
  const chemin = join(repertoire, `${lot_id}.json`);
  if (!existsSync(chemin)) return null;
  return lireEtValiderLot(chemin);
}

export class LotDejaExistant extends Error {
  constructor(lot_id: string) {
    super(
      `Le lot ${lot_id} existe déjà. Un manifeste de lot n'est jamais réécrit : sa composition ` +
        `et sa graine sont ce qui rend son kappa reproductible.`,
    );
    this.name = "LotDejaExistant";
  }
}

export function ecrireLot(repertoire: string, lot: Lot): void {
  ecrireLots(repertoire, [lot]);
}

/**
 * Écrit une composition **tout ou rien** : chaque identifiant et chaque chemin sont vérifiés
 * avant la première écriture. Une collision découverte au troisième lot laisserait sinon deux
 * manifestes orphelins, dont les items ne seraient plus disponibles pour la composition suivante.
 */
export function ecrireLots(repertoire: string, lots: readonly Lot[]): void {
  const chemins = verifierAvantEcriture(repertoire, lots);
  mkdirSync(repertoire, { recursive: true });
  lots.forEach((lot, index) => {
    writeFileSync(chemins[index] as string, `${JSON.stringify(lot, null, 2)}\n`, "utf8");
  });
}

function verifierAvantEcriture(repertoire: string, lots: readonly Lot[]): readonly string[] {
  const vus = new Set<string>();
  return lots.map((lot) => {
    validerManifeste(lot, lot.lot_id);
    if (vus.has(lot.lot_id)) {
      throw new Error(
        `Composition refusée : l'identifiant ${lot.lot_id} y figure deux fois. Aucun manifeste écrit.`,
      );
    }
    vus.add(lot.lot_id);
    const chemin = join(repertoire, `${lot.lot_id}.json`);
    if (existsSync(chemin)) throw new LotDejaExistant(lot.lot_id);
    return chemin;
  });
}
