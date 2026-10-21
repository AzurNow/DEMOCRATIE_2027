/**
 * La table alias aveugle de candidat du test de notation (§7, protocole 0.20, D55 (9)).
 *
 * « Dans ce que reçoit le juge, chaque candidat est désigné par un alias aveugle stable du run,
 * jamais par son identifiant. L'alias d'un candidat est formé de la lettre « C » suivie d'un rang,
 * de 1 à n, n étant le nombre de candidats interrogés au run. L'ordre des rangs est tiré avec une
 * graine dérivée de l'aléa par la clé « alias_candidats », comme les autres graines du run, sans
 * aucune saisie de l'auteur. La table qui associe chaque alias à son candidat est publiée avec le
 * run. »
 *
 * **Candidats.** Seuls les candidats interrogés au run (`run.perimetre.candidats[].interroge`,
 * la même définition que celle du dérangement du test contrefactuel, `derangement.ts`) reçoivent
 * un alias : un candidat retiré ou sous le seuil, non interrogé, n'en a pas besoin, puisque le juge
 * ne note jamais de référence à lui par cette voie.
 *
 * **Tirage, pour le rejouer ailleurs.** Graine : `run.graines.alias_candidats`, dont le générateur
 * déclaré doit être celui du tirage (`splitmix64-sha256-v1`, sinon `GraineNonConforme`). Clé
 * lisible : `CLE_ALIAS_CANDIDATS`. La dérivation est celle d'`analysis/graines.ts`
 * (`graineDerivee`) : l'entier publié en décimal, puis chaque composant de la clé, joints par
 * U+0000, hachés en sha256 ; les huit premiers octets, en gros-boutiste, amorcent SplitMix64.
 * Texte haché : `<valeur>␀alias_candidats`.
 *
 * Consommation du générateur : les identifiants des candidats interrogés sont rangés par
 * `candidat_id` dans l'ordre croissant des chaînes (unités UTF-16, comme `<` en JavaScript,
 * `echantillons.ts:comparerChaines`), quel que soit l'ordre reçu, puis mélangés par Fisher-Yates du
 * dernier au premier (`validation/domaine/alea.ts`, `melanger`). Le candidat au rang k (0 fondé) du
 * mélange reçoit l'alias `C{k+1}`.
 */

import { graineDerivee } from "../../analysis/graines.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { verifierGraine } from "../questions/tirage.ts";
import type { GraineTirage } from "../questions/types.ts";
import { comparerChaines } from "./echantillons.ts";

/**
 * Clé lisible de la graine de l'alias des candidats, dérivée de `run.graines.alias_candidats`.
 * Texte haché : `<valeur>␀alias_candidats`.
 */
export const CLE_ALIAS_CANDIDATS: readonly string[] = ["alias_candidats"];

/** `run.json#/alias_candidats` : alias (« C1 » à « Cn ») → identifiant du candidat. */
export type TableAliasCandidats = Readonly<Record<string, string>>;

/** Un candidat retiré ou sous le seuil peut être nommé en clair dans une réponse sans être interrogé : erreur si en double. */
export class CandidatEnDouble extends Error {
  constructor(candidat_id: string) {
    super(`Candidat en double parmi les candidats interrogés au run : ${candidat_id}.`);
    this.name = "CandidatEnDouble";
  }
}

/** Le candidat est absent de la table publiée (hors des candidats interrogés) : refus. */
export class CandidatSansAlias extends Error {
  constructor(candidat_id: string) {
    super(`Candidat ${candidat_id} absent de run.json#/alias_candidats : il n'est pas interrogé au run, ou la table est incomplète.`);
    this.name = "CandidatSansAlias";
  }
}

function rangerSansDoublon(identifiants: readonly string[]): string[] {
  const ranges = [...identifiants].sort(comparerChaines);
  for (let rang = 1; rang < ranges.length; rang += 1) {
    if (ranges[rang] === ranges[rang - 1]) throw new CandidatEnDouble(ranges[rang] as string);
  }
  return ranges;
}

/**
 * La table, calculée de façon déterministe à partir des candidats interrogés et de la graine du
 * run : même graine et même liste ⇒ même table, recalculable par un tiers sans aucune saisie de
 * l'auteur.
 */
export function tableAliasCandidats(interroges: readonly { readonly candidat_id: string }[], graine: GraineTirage): TableAliasCandidats {
  verifierGraine(graine, "de la table d'alias");
  const ranges = rangerSansDoublon(interroges.map((candidat) => candidat.candidat_id));
  const ordre = melanger(ranges, generateur(graineDerivee(graine.valeur, CLE_ALIAS_CANDIDATS)));
  return Object.fromEntries(ordre.map((candidat_id, rang) => [`C${rang + 1}`, candidat_id]));
}

/** candidat_id → alias, l'inverse de la table publiée : construite une fois par run. */
export function inverserTable(table: TableAliasCandidats): ReadonlyMap<string, string> {
  return new Map(Object.entries(table).map(([alias, candidat_id]) => [candidat_id, alias]));
}

/** L'alias d'un candidat interrogé ; refus si la table ne le porte pas (D55 (9)). */
export function aliasDeCandidat(index: ReadonlyMap<string, string>, candidat_id: string): string {
  const alias = index.get(candidat_id);
  if (alias === undefined) throw new CandidatSansAlias(candidat_id);
  return alias;
}
