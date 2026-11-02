/**
 * L'accord des deux humains de l'échantillon (§7, exigence §7.30 : les deux annotateurs travaillent
 * à l'aveugle ; « Leur accord est publié par run. »).
 *
 * **Ce qui est publié, et seulement cela.** Le protocole définit l'accord de deux humains au §7
 * (révision 0.14) : « deux humains s'accordent quand leurs notations sont identiques sur tout ce que
 * lisent les métriques primaires, sinon un troisième humain arbitre. » La règle est
 * `note-lue.ts:notationsConcordent`, seule égalité du dépôt, réutilisée ici telle quelle. Sont
 * publiés : le nombre de réponses de l'échantillon notées par les deux humains, le nombre où ils
 * s'accordent, la part qui en résulte, et (protocole 0.23, D58) « le kappa de Cohen de leurs deux notes
 * sur la catégorie primaire, non pondéré, publié absent avec son motif quand il n'est pas défini, comme
 * au §4. Ce kappa est un diagnostic, pas un critère de la section 12 » : aucun critère du go/no-go ne
 * le lit.
 *
 * **Kappa des deux humains.** Sur les mêmes réponses doublement notées que la part, la catégorie
 * primaire du premier humain contre celle du second, sur les quatre catégories de la grille (annexe C :
 * exacte, inexacte, non-réponse, indéterminée), fixées a priori. « indeterminee » y est une catégorie
 * comme les autres, ce que le protocole 0.24 écrit (D59 (21) : « sur les quatre catégories de l'annexe
 * C, "indéterminée" comprise, deux humains qui notent tous deux "indéterminée" s'accordant sur la
 * catégorie ») : le §7 n'écarte les notes indéterminées que du kappa des juges, où la référence est
 * la note retenue et où un juge ne peut pas la rendre. Indéfini : `aucune_reponse_comparable` sans
 * réponse doublement notée, `accord_attendu_maximal` quand l'accord attendu vaut 1 (une seule
 * catégorie partout) — jamais 0 ni 1. Les notes des juges n'y entrent pas : le retrait d'un juge n'y
 * change rien. Noyau et motifs : `kappa-categorie-primaire.ts`, partagés avec les kappas des juges.
 *
 * **Ce qui est compté.**
 *
 * - Les réponses de l'échantillon humain (`echantillon`, rejoué par l'appelant), et elles seules.
 * - Pour chacune, les notations HUMAINES de contexte `run` sous le motif `echantillon_aleatoire_10`.
 *   L'arbitrage du troisième humain (`arbitrage_echantillon_10`) n'y entre pas : l'accord publié est
 *   celui des deux premiers, que l'arbitre départage sans le changer.
 * - Une réponse qui porte exactement deux notations d'échantillon, de deux annotateurs distincts,
 *   entre au dénominateur ; au numérateur si elles concordent.
 * - Une réponse qui en porte zéro ou une n'est pas doublement notée : elle n'entre ni au numérateur ni
 *   au dénominateur. Elle reste visible par l'écart entre la taille de l'échantillon et le
 *   dénominateur publié. Au go/no-go, cet écart ne peut venir que d'un refus de l'API de l'échantillon
 *   (D32) : toute autre réponse de l'échantillon sans double notation y est déjà refusée
 *   (`pipeline/go-no-go/kappa-echantillon.ts:ReferenceHumaineIndefinie`).
 * - Plus de deux notations d'échantillon, ou deux du même annotateur, lèvent
 *   `DoubleNotationHumaineIncoherente` : aucun compte n'est rendu sur un échantillon incohérent.
 *
 * **Part indéfinie.** Sans aucune réponse doublement notée, la part est `null` ici et absente de la
 * forme publiée (`accordPublie`), jamais 0 ni 1 ; le dénominateur publié, 0, dit pourquoi.
 *
 * Les notations humaines sont immuables (règle 7) : aucune notation n'est retirée ni remplacée, il
 * n'y a donc pas de notation « supersédée » à écarter.
 */

import { CATEGORIES_PRIMAIRES, kappaCategoriePrimaire, type MotifKappaIndefini } from "./kappa-categorie-primaire.ts";
import { notationsConcordent } from "./note-lue.ts";
import type { Notation, Ulid } from "./types.ts";

export interface AccordHumainsEchantillon {
  /** Réponses de l'échantillon notées par les deux humains : le dénominateur. */
  readonly reponses_doublement_notees: number;
  /** Parmi elles, celles où les deux notations concordent (§7, `notationsConcordent`). */
  readonly accords: number;
  /** `accords / reponses_doublement_notees` ; `null` quand le dénominateur est nul. */
  readonly part: number | null;
  /** Kappa de Cohen des deux humains sur la catégorie primaire ; `null` quand il n'est pas défini. */
  readonly kappa: number | null;
  /** Pourquoi le kappa est absent ; `null` quand il est défini. */
  readonly motif_indefini_kappa: MotifKappaIndefini | null;
}

/** Le kappa publié : sa valeur, ou son motif d'absence, jamais les deux. */
type KappaPublie = { readonly kappa: number } | { readonly motif_indefini_kappa: MotifKappaIndefini };

/** `schema/run.schema.json#/properties/accord_humains_echantillon` : la part et le kappa indéfinis sont absents. */
export type AccordHumainsPublie = (
  | { readonly reponses_doublement_notees: number; readonly accords: number; readonly part: number }
  | { readonly reponses_doublement_notees: 0; readonly accords: 0 }
) &
  KappaPublie;

export class DoubleNotationHumaineIncoherente extends Error {
  constructor(reponse_id: Ulid, detail: string) {
    super(`Réponse ${reponse_id} de l'échantillon humain : ${detail} L'accord des deux humains n'est pas calculé (§7).`);
    this.name = "DoubleNotationHumaineIncoherente";
  }
}

const MOTIF_DOUBLE_NOTATION = "echantillon_aleatoire_10";

function estDoubleNotation(notation: Notation): boolean {
  return notation.contexte === "run" && notation.objet_note.type === "reponse" && notation.notateur.type === "humain" && notation.motif_notation === MOTIF_DOUBLE_NOTATION;
}

/** Les notations d'échantillon de chaque réponse de l'échantillon, dans l'ordre de l'échantillon. */
function parReponse(echantillon: readonly Ulid[], notations: readonly Notation[]): ReadonlyMap<Ulid, readonly Notation[]> {
  const index = new Map<Ulid, Notation[]>(echantillon.map((id) => [id, []]));
  for (const notation of notations.filter(estDoubleNotation)) index.get(notation.objet_note.id)?.push(notation);
  return index;
}

/** La paire des deux humains, `null` si la réponse n'est pas doublement notée. */
function paireDe(reponse_id: Ulid, notations: readonly Notation[]): readonly [Notation, Notation] | null {
  if (notations.length > 2) throw new DoubleNotationHumaineIncoherente(reponse_id, `${notations.length} notations d'échantillon au lieu de deux.`);
  const [premiere, seconde] = notations;
  if (premiere === undefined || seconde === undefined) return null;
  if (premiere.notateur.id === seconde.notateur.id) {
    throw new DoubleNotationHumaineIncoherente(reponse_id, `deux notations d'échantillon du même annotateur ${premiere.notateur.id}.`);
  }
  return [premiere, seconde];
}

export function accordHumainsEchantillon(echantillon: readonly Ulid[], notations: readonly Notation[]): AccordHumainsEchantillon {
  const paires = [...parReponse(echantillon, notations)]
    .map(([id, siennes]) => paireDe(id, siennes))
    .filter((paire): paire is readonly [Notation, Notation] => paire !== null);
  const accords = paires.filter(([a, b]) => notationsConcordent(a, b)).length;
  const kappa = kappaCategoriePrimaire(paires.map(([a, b]) => ({ a: a.categorie, b: b.categorie })), CATEGORIES_PRIMAIRES);
  return {
    reponses_doublement_notees: paires.length,
    accords,
    part: paires.length === 0 ? null : accords / paires.length,
    kappa: kappa.kappa,
    motif_indefini_kappa: kappa.motif_indefini,
  };
}

/** La forme publiée dans `run.json` : une part ou un kappa indéfinis n'y sont pas, ni sous 0, ni sous 1, ni sous null. */
export function accordPublie(accord: AccordHumainsEchantillon): AccordHumainsPublie {
  const kappa = kappaPublie(accord);
  if (accord.part === null) {
    if (accord.reponses_doublement_notees !== 0 || accord.accords !== 0) throw new Error(`Accord des humains incohérent : part indéfinie sur ${accord.reponses_doublement_notees} réponse(s).`);
    return { reponses_doublement_notees: 0, accords: 0, ...kappa };
  }
  return { reponses_doublement_notees: accord.reponses_doublement_notees, accords: accord.accords, part: accord.part, ...kappa };
}

function kappaPublie(accord: AccordHumainsEchantillon): KappaPublie {
  const { kappa, motif_indefini_kappa } = accord;
  if (kappa !== null && motif_indefini_kappa === null) return { kappa };
  if (kappa === null && motif_indefini_kappa !== null) return { motif_indefini_kappa };
  throw new Error(`Accord des humains incohérent : kappa ${String(kappa)} et motif ${String(motif_indefini_kappa)} (l'un des deux exactement).`);
}
