/**
 * §8 (protocole 0.28, D70 (12)), « Variabilité entre échantillons » : « L'accord entre les deux
 * échantillons d'une même question, dans une même formulation et un même mode, lu sur la catégorie
 * primaire de leur note retenue, est publié par couple outil × mode, en diagnostic : ce n'est pas une
 * métrique, et il ne reçoit aucun qualificatif. »
 *
 * **La paire.** Les requêtes du plan d'interrogation d'un couple comparé, regroupées par question et
 * par formulation : une paire par groupe, ses deux échantillons. La clé contient l'outil, le mode, la
 * question et la formulation : deux formulations ou deux modes ne sont jamais appariés. Partir du plan,
 * et non des réponses obtenues, rend visibles les paires dont un échantillon, ou les deux, manque. Une
 * question d'attribution a ses deux échantillons au plan comme toute question : même règle.
 *
 * **Ce qui est lu.** La catégorie retenue de chaque échantillon obtenu, lue dans son unité d'analyse
 * (`filtre.ts:assembler`, verdict du run). Un refus de l'API est une réponse obtenue que la règle note
 * non-réponse (§7) : il entre dans la paire comme toute non-réponse.
 *
 * **Paire comparable, paires écartées.** Une paire n'entre dans l'accord que si ses deux échantillons
 * ont une catégorie primaire comparable. Sinon elle est écartée, comptée sous un seul motif, dans cet
 * ordre : `aucun_echantillon_obtenu`, `un_seul_echantillon_obtenu`, `non_classee` (l'un au moins est
 * « non classé, référence incomplète », sans catégorie primaire, §7, D64), `indeterminee` (l'un au
 * moins est indéterminé, écarté comme des kappas sur la note retenue, §7). Les comptes sont publiés :
 * `paires_prevues` = `paires_comparables` + la somme des paires écartées.
 *
 * **Accord.** Part des paires comparables dont les deux catégories sont égales : un accord observé,
 * sans intervalle (le §8 n'en demande pas à un diagnostic) ni qualificatif. Sans paire comparable, il
 * est absent avec le motif `aucune_paire_comparable` : jamais 0, jamais `null`.
 *
 * **Partage.** Seuls les couples comparés du calcul principal (`seuils.ts:couplesComparables`) sont
 * publiés : un couple « run incomplet » n'a aucune statistique (§8, seuils de non-publication), ses
 * unités sont retirées par `couples-compares.ts:unitesParCoupleCompare` et ses requêtes ignorées.
 */

import { unitesParCoupleCompare } from "./couples-compares.ts";
import { estDuRun, type UniteAnalyse } from "./filtre.ts";
import { estNonClassee } from "./kappa-categorie-primaire.ts";
import { cleCouple, type PartageCouples, type RequeteDuPlan } from "./seuils.ts";
import type { CategorieRetenue, CoupleOutilMode, Reponse, Ulid } from "./types.ts";

/** Les motifs d'une paire écartée, dans l'ordre où ils sont décidés. */
export const MOTIFS_PAIRE_ECARTEE = ["aucun_echantillon_obtenu", "un_seul_echantillon_obtenu", "non_classee", "indeterminee"] as const;
export type MotifPaireEcartee = (typeof MOTIFS_PAIRE_ECARTEE)[number];

/** `schema/metriques.schema.json#/$defs/variabilite_du_couple` : l'accord, ou le motif de son absence. */
export type VariabiliteDuCouple = {
  readonly couple: CoupleOutilMode;
  readonly paires_prevues: number;
  readonly paires_comparables: number;
  readonly paires_concordantes: number;
  readonly paires_ecartees: Readonly<Record<MotifPaireEcartee, number>>;
} & ({ readonly accord: number } | { readonly motif_absence: "aucune_paire_comparable" });

export interface EntreesVariabilite {
  /** Le partage du calcul principal, jamais recalculé ici. */
  readonly couples: PartageCouples;
  /** Le plan d'interrogation du run : chaque question, formulation et échantillon de chaque couple. */
  readonly plan: readonly RequeteDuPlan[];
  /** Les réponses lues (tous contextes) : seules celles du run, canal API, obtenues, sont rapprochées du plan. */
  readonly reponses: readonly Reponse[];
  /** Les unités du canal API du run (`assembler`). */
  readonly unites: readonly UniteAnalyse[];
}

/** Le plan prévoit plus de deux échantillons, ou deux fois le même, pour une même paire. */
export class PaireDEchantillonsIncoherente extends Error {
  constructor(cle: string, detail: string) {
    super(`Paire ${cle} : ${detail} L'accord entre échantillons porte sur les deux échantillons d'une question (§8).`);
    this.name = "PaireDEchantillonsIncoherente";
  }
}

/** §6, §8 : deux échantillons par question, par formulation et par mode. */
const ECHANTILLONS_D_UNE_PAIRE = 2;

type IssuePaire = MotifPaireEcartee | "concordante" | "discordante";

/** Une catégorie retenue, ou `null` : l'échantillon prévu n'a pas de réponse obtenue. */
type CategorieObtenue = CategorieRetenue | null;

function cleRequete(r: Pick<RequeteDuPlan, "outil_id" | "mode" | "question_id" | "formulation_id">, echantillon: number): string {
  return [r.outil_id, r.mode, r.question_id, r.formulation_id, String(echantillon)].join("\0");
}

function clePaire(r: RequeteDuPlan): string {
  return [r.outil_id, r.mode, r.question_id, r.formulation_id].join("\0");
}

function estObtenueDuRunApi(reponse: Reponse): reponse is Reponse & { readonly mode: NonNullable<Reponse["mode"]> } {
  return estDuRun(reponse) && reponse.canal === "api" && reponse.statut_reponse === "obtenue" && reponse.mode !== undefined;
}

/** Les réponses obtenues du run, canal API, à la clé de leur requête du plan. */
function reponsesObtenuesParRequete(reponses: readonly Reponse[]): ReadonlyMap<string, Ulid> {
  const index = new Map<string, Ulid>();
  for (const reponse of reponses.filter(estObtenueDuRunApi)) {
    index.set(cleRequete({ ...reponse, mode: reponse.mode }, reponse.echantillon), reponse.id);
  }
  return index;
}

/** La catégorie retenue de l'échantillon prévu, `null` s'il n'a pas de réponse obtenue. */
function categorieDe(requete: RequeteDuPlan, reponses: ReadonlyMap<string, Ulid>, categories: ReadonlyMap<Ulid, CategorieRetenue>): CategorieObtenue {
  const reponse_id = reponses.get(cleRequete(requete, requete.echantillon));
  if (reponse_id === undefined) return null;
  const categorie = categories.get(reponse_id);
  if (categorie === undefined) throw new Error(`Réponse obtenue ${reponse_id} d'un couple comparé sans unité notée : elle n'est jamais lue comme manquante.`);
  return categorie;
}

/** Les requêtes du plan d'un couple, regroupées par paire (question × formulation), dans l'ordre du plan. */
function pairesDuCouple(plan: readonly RequeteDuPlan[], couple: CoupleOutilMode): readonly (readonly RequeteDuPlan[])[] {
  const cle = cleCouple(couple);
  const paires = new Map<string, RequeteDuPlan[]>();
  for (const requete of plan.filter((r) => cleCouple(r) === cle)) {
    const cle_paire = clePaire(requete);
    const siennes = paires.get(cle_paire);
    if (siennes === undefined) paires.set(cle_paire, [requete]);
    else siennes.push(requete);
  }
  for (const [clef, requetes] of paires) verifierPaire(clef, requetes);
  return [...paires.values()];
}

function verifierPaire(cle: string, requetes: readonly RequeteDuPlan[]): void {
  const lisible = cle.split("\0").join(" / ");
  if (requetes.length > ECHANTILLONS_D_UNE_PAIRE) throw new PaireDEchantillonsIncoherente(lisible, `${requetes.length} échantillons prévus au plan.`);
  if (new Set(requetes.map((r) => r.echantillon)).size !== requetes.length) throw new PaireDEchantillonsIncoherente(lisible, "un même échantillon prévu deux fois au plan.");
}

/** L'issue d'une paire : écartée sous un seul motif, ou comparable, concordante ou non. */
function issueDeLaPaire(categories: readonly CategorieObtenue[]): IssuePaire {
  const obtenues = categories.filter((c): c is CategorieRetenue => c !== null);
  if (obtenues.length === 0) return "aucun_echantillon_obtenu";
  if (obtenues.length === 1) return "un_seul_echantillon_obtenu";
  if (obtenues.some(estNonClassee)) return "non_classee";
  if (obtenues.some((c) => c === "indeterminee")) return "indeterminee";
  return obtenues[0] === obtenues[1] ? "concordante" : "discordante";
}

function compter(issues: readonly IssuePaire[], issue: IssuePaire): number {
  return issues.filter((i) => i === issue).length;
}

function variabiliteDuCouple(couple: CoupleOutilMode, issues: readonly IssuePaire[]): VariabiliteDuCouple {
  const concordantes = compter(issues, "concordante");
  const comparables = concordantes + compter(issues, "discordante");
  const ecartees = Object.fromEntries(MOTIFS_PAIRE_ECARTEE.map((motif) => [motif, compter(issues, motif)])) as Record<MotifPaireEcartee, number>;
  const effectifs = { couple, paires_prevues: issues.length, paires_comparables: comparables, paires_concordantes: concordantes, paires_ecartees: ecartees };
  if (comparables === 0) return { ...effectifs, motif_absence: "aucune_paire_comparable" };
  return { ...effectifs, accord: concordantes / comparables };
}

/** L'accord entre les deux échantillons de chaque paire, pour chaque couple comparé, trié par `cleCouple`. */
export function variabiliteEntreEchantillons(entrees: EntreesVariabilite): VariabiliteDuCouple[] {
  const reponses = reponsesObtenuesParRequete(entrees.reponses);
  return unitesParCoupleCompare(entrees.unites, entrees.couples).map(({ couple, unites }) => {
    const categories = new Map<Ulid, CategorieRetenue>(unites.map((u) => [u.reponse_id, u.categorie]));
    const issues = pairesDuCouple(entrees.plan, couple).map((paire) => issueDeLaPaire(paire.map((requete) => categorieDe(requete, reponses, categories))));
    return variabiliteDuCouple(couple, issues);
  });
}
