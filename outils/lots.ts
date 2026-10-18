/**
 * `pnpm lots` — composition des lots de validation.
 *
 * Les lots sont **communs aux deux annotateurs** : sans items communs, il n'y a pas de kappa.
 * L'affectation des items aux lots est tirée à partir d'une graine enregistrée dans le
 * manifeste, comme l'exige le §5 pour tout tirage, et un manifeste n'est jamais réécrit.
 *
 * L'ordre d'affichage, lui, n'est pas stocké : il se recalcule pour chaque annotateur à partir
 * de la même graine. La commande le vérifie tout de même à la composition, pour qu'un lot
 * impossible à ordonner soit connu maintenant et non au milieu d'une séance d'annotation.
 *
 * Seuls des lots **pleins** sont composés : 50 items pour un lot réel, 30 pour un lot
 * d'entraînement (§4). La taille découle de la nature ; `--taille` n'est admis que s'il la
 * répète, toute autre valeur est refusée. Le reste de la réserve n'est jamais un lot : il reste
 * disponible pour une prochaine composition, et la commande annonce combien d'items attendent.
 * Une réserve plus petite qu'un lot ne produit aucun lot et sort avec le code 0 : attendre des
 * items n'est pas une erreur.
 *
 *   pnpm lots --nature=entrainement --annotateurs=a1,a2 --graine=lot-ent-2026-11
 *   pnpm lots --nature=reel --annotateurs=a1,a2 --graine=lots-2026-11
 *
 * Réannotation (§4) : un lot dont le kappa tombe strictement sous 0,80 est rejugé après une
 * séance de calibration, dont la date est exigée — sans elle, le kappa du nouveau lot n'est pas
 * interprétable. Le lot produit reprend les items du lot d'origine et le supersède.
 *
 *   pnpm lots --reannote=lot-003 --calibration=2026-11-24 --graine=reannotation-2026-11
 */

import { resolve } from "node:path";
import { DATE_CIVILE } from "../validation/domaine/validateurs-champ.ts";
import { analyserArguments, drapeau, obligatoire, texte, type Arguments } from "./arguments.ts";
import {
  adjacenceRespectee,
  annoncerComposition,
  composerLots,
  ordreAffichage,
  OrdreImpossible,
  numeroterLots,
  preparerReannotation,
  tailleDeComposition,
} from "../validation/domaine/lot.ts";
import { lotJugeEncore } from "../validation/domaine/renvoi-mesure.ts";
import type { Item, ItemDuLot, Lot, NatureLot } from "../validation/domaine/types.ts";
import { lireLots, ecrireLot, ecrireLots } from "../validation/io/lots-fichier.ts";
import { chargerItemsEffectifs } from "../validation/io/items-effectifs.ts";
import { chargerStaging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

const OPTIONS: readonly string[] = [
  "nature",
  "taille",
  "annotateurs",
  "graine",
  "prefixe",
  "ecrire",
  "staging",
  "data",
  "lots",
  "reannote",
  "calibration",
];

interface Options {
  readonly nature: NatureLot;
  /** Valeur de `--taille`, `null` si l'option est absente. Jamais une taille par défaut. */
  readonly taille_demandee: number | null;
  readonly annotateurs: readonly string[];
  readonly graine: string;
  readonly prefixe: string;
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  /** `data/items/`, lu pour l'état effectif (un item publié puis contesté n'entre dans aucun lot). */
  readonly data: string;
  readonly lots: string;
  /** Lot d'origine à réannoter. Chaîne vide : composition ordinaire. */
  readonly reannote: string;
  /** Date civile de la séance de calibration. `null` hors réannotation. */
  readonly calibration: string | null;
}

function lireOptions(bruts: readonly string[]): Options {
  const table = analyserArguments(bruts, OPTIONS);
  const racine = resolve(import.meta.dirname, "..");
  const nature = texte(table, "nature", "reel") as NatureLot;
  const entrainement = nature === "entrainement";
  const reannote = texte(table, "reannote", "");

  return {
    nature,
    taille_demandee: tailleDemandee(table),
    annotateurs: texte(table, "annotateurs", "").split(",").filter((nom) => nom.length > 0),
    graine: obligatoire(table, "graine", "c'est elle qui rend la composition reproductible."),
    prefixe: texte(table, "prefixe", entrainement ? "ent" : "lot"),
    ecrire: drapeau(table, "ecrire"),
    racine,
    staging: texte(table, "staging", resolve(racine, "staging")),
    data: texte(table, "data", resolve(racine, "data/items")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    reannote,
    calibration: reannote.length === 0 ? null : dateDeCalibration(table),
  };
}

/** `--taille` absent reste absent : la taille se déduira de la nature, pas d'un défaut ici. */
function tailleDemandee(table: Arguments): number | null {
  const valeur = table.get("taille");
  return valeur === undefined ? null : Number(valeur);
}

/** Sans date de séance, le kappa d'un lot de réannotation n'est pas interprétable (§4). */
function dateDeCalibration(table: Arguments): string {
  const valeur = obligatoire(
    table,
    "calibration",
    "un lot de réannotation porte la date de la séance de calibration, sans laquelle son kappa " +
      "n'est pas interprétable (§4).",
  );
  if (!DATE_CIVILE.test(valeur)) {
    throw new Error(`--calibration attend une date civile AAAA-MM-JJ : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

/**
 * Les items qu'un lot juge encore. Protocole 0.13, §4 : un item renvoyé en attente après une
 * correction de thème n'est plus jugé par le lot qui épingle son ancienne version ; il rentre dans
 * la réserve, et le prochain lot l'épinglera dans sa nouvelle version.
 */
function itemsPris(lots: readonly Lot[], items: ReadonlyMap<string, Item>): ReadonlySet<string> {
  const pris = new Set<string>();
  for (const lot of lots) {
    for (const entree of lot.items) {
      const item = items.get(entree.item_id);
      if (item === undefined || lotJugeEncore(item, entree)) pris.add(entree.item_id);
    }
  }
  return pris;
}

function itemsDisponibles(options: Options): readonly ItemDuLot[] {
  const staging = chargerStaging(options.staging);
  const effectifs = chargerItemsEffectifs(staging.items, options.data);
  const dejaPris = itemsPris(lireLots(options.lots), effectifs);

  const disponibles: ItemDuLot[] = [];
  for (const item of effectifs.values()) {
    if (dejaPris.has(item.id)) continue;
    if (item.statut_validation !== "en_attente") continue;
    if (item.statut_contestation !== "aucune") continue;
    disponibles.push({
      item_id: item.id,
      item_version: item.version,
      item_empreinte: item.empreinte,
      candidat_id: item.candidat_id,
    });
  }
  return disponibles;
}

function construireLots(
  options: Options,
  paquets: readonly (readonly ItemDuLot[])[],
): readonly Lot[] {
  const date = instantLocal(new Date());
  // La numérotation reprend après le plus grand numéro existant : recomposer le reste de la
  // réserve est le cas normal, et un manifeste existant n'est jamais réécrit.
  const identifiants = numeroterLots(lireLots(options.lots), options.prefixe, paquets.length);
  return paquets.map((items, index) => ({
    lot_id: identifiants[index] as string,
    nature: options.nature,
    graine_maitresse: options.graine,
    algorithme_ordre: "ordre-annotateur-v1",
    date_creation: date,
    annotateurs: options.annotateurs,
    items,
  }));
}

/** Un lot impossible à ordonner doit être connu maintenant, pas au milieu d'une séance. */
function verifierOrdres(lot: Lot): void {
  for (const annotateur of lot.annotateurs) {
    const ordre = ordreAffichage(lot, annotateur);
    if (!adjacenceRespectee(ordre)) {
      throw new Error(`Lot ${lot.lot_id} : ordre invalide pour ${annotateur}`);
    }
  }
}

/**
 * Un lot de réannotation reprend les items du lot d'origine **sans passer par la réserve** : ces
 * items appartiennent déjà à un lot, et ce sont précisément eux qu'il faut rejuger. Ses
 * annotateurs sont ceux du lot d'origine, sans quoi son kappa ne remplacerait pas le leur.
 */
function principalReannotation(options: Options): void {
  if (options.taille_demandee !== null) {
    throw new Error(
      "--taille ne s'emploie pas avec --reannote : un lot de réannotation reprend les items du " +
        "lot d'origine, donc sa taille.",
    );
  }
  if (options.annotateurs.length > 0) {
    throw new Error(
      "--annotateurs ne s'emploie pas avec --reannote : un lot de réannotation reprend les " +
        "annotateurs du lot d'origine, faute de quoi son kappa ne remplacerait pas le leur (§4).",
    );
  }

  const lot = preparerReannotation(lireLots(options.lots), {
    origine_id: options.reannote,
    graine_maitresse: options.graine,
    date_calibration: options.calibration as string,
    date_creation: instantLocal(new Date()),
  });
  verifierOrdres(lot);

  process.stdout.write(
    `${lot.lot_id} : réannotation de ${lot.reannote}, ${lot.items.length} item(s) repris,\n` +
      `  séance de calibration du ${lot.date_calibration}, annotateurs ${lot.annotateurs.join(", ")},\n` +
      `  ordre vérifié. Le lot d'origine reste publié ; ses décisions ne comptent plus pour ces items.\n`,
  );

  if (!options.ecrire) {
    process.stdout.write("\nSimulation. Ajouter --ecrire pour écrire le manifeste.\n");
    return;
  }
  ecrireLot(options.lots, lot);
  process.stdout.write(`\nManifeste écrit dans ${options.lots}\n`);
}

/** Vrai si chaque lot peut s'ordonner ; sinon, le premier échec est annoncé et la commande échoue. */
function lotsOrdonnables(lots: readonly Lot[]): boolean {
  for (const lot of lots) {
    try {
      verifierOrdres(lot);
    } catch (erreur) {
      if (erreur instanceof OrdreImpossible) {
        process.stdout.write(`  ${lot.lot_id} : ${erreur.message}\n`);
        process.exitCode = 1;
        return false;
      }
      throw erreur;
    }
    process.stdout.write(`  ${lot.lot_id} : ${lot.items.length} items, ordre vérifié\n`);
  }
  return true;
}

function principalComposition(options: Options): void {
  if (options.annotateurs.length !== 2) {
    throw new Error("--annotateurs attend exactement deux identifiants, séparés par une virgule.");
  }
  const taille = tailleDeComposition(options.nature, options.taille_demandee);

  const disponibles = itemsDisponibles(options);
  const composition = composerLots(disponibles, taille, options.graine);
  const lots = construireLots(options, composition.lots);

  process.stdout.write(
    `${disponibles.length} item(s) disponible(s). ${annoncerComposition(composition, taille)}\n`,
  );
  // Aucun lot plein : rien à écrire, et ce n'est pas une erreur (code de sortie 0).
  if (lots.length === 0) return;
  if (!lotsOrdonnables(lots)) return;

  if (!options.ecrire) {
    process.stdout.write("\nSimulation. Ajouter --ecrire pour écrire les manifestes.\n");
    return;
  }
  ecrireLots(options.lots, lots);
  process.stdout.write(`\n${lots.length} manifeste(s) écrit(s) dans ${options.lots}\n`);
}

function principal(): void {
  const options = lireOptions(process.argv.slice(2));
  if (options.reannote.length > 0) principalReannotation(options);
  else principalComposition(options);
}

principal();
