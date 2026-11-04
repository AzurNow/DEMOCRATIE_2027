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
 * question d'attribution a ses deux échantillons au plan comme toute question : même règle. Le plan
 * en prévoit exactement deux, distincts, par paire (§6) ; tout autre nombre est une incohérence
 * refusée, jamais une paire lue à un échantillon (D72 (7)).
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
 * **Numéros contrôlés, levier « 2 → 1 »** (§8 et §12, protocole 0.31, D73 (6)). « Les deux échantillons
 * d'une paire sont ceux numérotés 1 et 2, et ces numéros sont contrôlés ; quand le plan d'interrogation
 * ne prévoit qu'un échantillon par question, le levier de la section 12 ayant été appliqué, la
 * variabilité est publiée absente, avec ce motif. » Le nombre d'échantillons est **lu** sur le plan du
 * run (l'ensemble des numéros qu'il porte), jamais pris d'une constante : `variabiliteDuRun` publie
 * `un_seul_echantillon_au_plan` quand le plan ne porte que le numéro 1. Sont refusés, jamais lus
 * autrement : un numéro autre que 1 ou 2 au plan ou dans une réponse API du run ; un plan à un
 * échantillon numéroté 2 ; une même requête deux fois au plan ; deux réponses API du run pour une même
 * requête, quel que soit leur statut ; sous un plan à un échantillon, une réponse API du run numérotée
 * 2 ; un couple comparé dont aucune réponse API du run ne porte l'un des deux numéros d'un plan à deux
 * échantillons — le plan dirait deux échantillons quand l'interrogation n'en a fait qu'un, et toutes
 * ses paires seraient écartées en silence au lieu de lever.
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

/** §8, §12 (D73 (6)) : le motif de la variabilité absente quand le plan ne prévoit qu'un échantillon par question. */
export const MOTIF_UN_SEUL_ECHANTILLON_AU_PLAN = "un_seul_echantillon_au_plan";

/** `schema/metriques.schema.json#/properties/variabilite_echantillons`, hors « aucun couple comparé » (l'appelant). */
export type VariabiliteDesEchantillons =
  | { readonly statut: "calcule"; readonly couples: readonly VariabiliteDuCouple[] }
  | { readonly statut: "sans_objet"; readonly motif: typeof MOTIF_UN_SEUL_ECHANTILLON_AU_PLAN };

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

/** Le plan ne prévoit pas exactement deux échantillons distincts pour une même paire (§6, D72 (7)). */
export class PaireDEchantillonsIncoherente extends Error {
  constructor(cle: string, detail: string) {
    super(`Paire ${cle} : ${detail} L'accord entre échantillons porte sur les deux échantillons d'une question (§8).`);
    this.name = "PaireDEchantillonsIncoherente";
  }
}

/** Les numéros, le plan ou les réponses du run contredisent les deux échantillons numérotés 1 et 2 (§8, D73 (6)). */
export class EchantillonsDuRunIncoherents extends Error {
  constructor(detail: string) {
    super(`Échantillons du run incohérents : ${detail}. Les deux échantillons d'une paire sont ceux numérotés 1 et 2, et ces numéros sont contrôlés (§8).`);
    this.name = "EchantillonsDuRunIncoherents";
  }
}

/** §6, §8 : deux échantillons par question, par formulation et par mode ; exactement deux au plan (D72 (7)). */
const ECHANTILLONS_D_UNE_PAIRE = 2;

/** §8 (D73 (6)) : les seuls numéros d'échantillon ; un plan à un échantillon (§12) ne porte que le premier. */
const NUMEROS_D_ECHANTILLON: readonly number[] = [1, 2];

function estNumeroDEchantillon(echantillon: number): boolean {
  return NUMEROS_D_ECHANTILLON.includes(echantillon);
}

type IssuePaire = MotifPaireEcartee | "concordante" | "discordante";

/** Une catégorie retenue, ou `null` : l'échantillon prévu n'a pas de réponse obtenue. */
type CategorieObtenue = CategorieRetenue | null;

function cleRequete(r: Pick<RequeteDuPlan, "outil_id" | "mode" | "question_id" | "formulation_id">, echantillon: number): string {
  return [r.outil_id, r.mode, r.question_id, r.formulation_id, String(echantillon)].join("\0");
}

function clePaire(r: RequeteDuPlan): string {
  return [r.outil_id, r.mode, r.question_id, r.formulation_id].join("\0");
}

type ReponseApiDuRun = Reponse & { readonly mode: NonNullable<Reponse["mode"]> };

function estDuRunApi(reponse: Reponse): reponse is ReponseApiDuRun {
  return estDuRun(reponse) && reponse.canal === "api" && reponse.mode !== undefined;
}

function lisible(cle: string): string {
  return cle.split("\0").join(" / ");
}

/**
 * Les réponses API du run, tous statuts, à la clé de leur requête : un numéro autre que 1 ou 2, ou deux
 * réponses pour une même requête, lèvent — jamais la dernière lue ne remplace l'autre (D73 (6)).
 */
function reponsesApiParRequete(reponses: readonly Reponse[]): ReadonlyMap<string, ReponseApiDuRun> {
  const index = new Map<string, ReponseApiDuRun>();
  for (const reponse of reponses.filter(estDuRunApi)) {
    const cle = cleRequete(reponse, reponse.echantillon);
    if (!estNumeroDEchantillon(reponse.echantillon)) throw new EchantillonsDuRunIncoherents(`réponse ${reponse.id} (${lisible(cle)}) numérotée ${reponse.echantillon}`);
    if (index.has(cle)) throw new EchantillonsDuRunIncoherents(`deux réponses du run pour la requête ${lisible(cle)}`);
    index.set(cle, reponse);
  }
  return index;
}

/** Les réponses obtenues du run, canal API, à la clé de leur requête du plan. */
function reponsesObtenuesParRequete(reponses: ReadonlyMap<string, ReponseApiDuRun>): ReadonlyMap<string, Ulid> {
  const index = new Map<string, Ulid>();
  for (const [cle, reponse] of reponses) if (reponse.statut_reponse === "obtenue") index.set(cle, reponse.id);
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
  const paire = lisible(cle);
  const horsNumeros = requetes.find((r) => !estNumeroDEchantillon(r.echantillon));
  if (horsNumeros !== undefined) throw new PaireDEchantillonsIncoherente(paire, `échantillon numéroté ${horsNumeros.echantillon} au plan, seuls 1 et 2 le sont.`);
  if (requetes.length !== ECHANTILLONS_D_UNE_PAIRE) {
    const pluriel = requetes.length > 1 ? "s" : "";
    throw new PaireDEchantillonsIncoherente(paire, `${requetes.length} échantillon${pluriel} prévu${pluriel} au plan, ${ECHANTILLONS_D_UNE_PAIRE} attendus.`);
  }
  if (new Set(requetes.map((r) => r.echantillon)).size !== requetes.length) throw new PaireDEchantillonsIncoherente(paire, "un même échantillon prévu deux fois au plan.");
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

/**
 * Un couple comparé dont aucune réponse API du run ne porte l'un des numéros 1 et 2 : le plan prévoit
 * deux échantillons que l'interrogation n'a pas faits (§12 appliqué sans que le plan le dise). Refus.
 */
function exigerLesDeuxNumeros(couple: CoupleOutilMode, reponses: ReadonlyMap<string, ReponseApiDuRun>): void {
  const cle = cleCouple(couple);
  const numeros = new Set([...reponses.values()].filter((r) => cleCouple(r) === cle).map((r) => r.echantillon));
  const absent = NUMEROS_D_ECHANTILLON.find((numero) => !numeros.has(numero));
  if (absent !== undefined) throw new EchantillonsDuRunIncoherents(`couple ${cle} : le plan prévoit deux échantillons, mais aucune réponse du run numérotée ${absent}`);
}

/** L'accord entre les deux échantillons de chaque paire, pour chaque couple comparé, trié par `cleCouple`. */
export function variabiliteEntreEchantillons(entrees: EntreesVariabilite): VariabiliteDuCouple[] {
  const reponses_api = reponsesApiParRequete(entrees.reponses);
  const reponses = reponsesObtenuesParRequete(reponses_api);
  return unitesParCoupleCompare(entrees.unites, entrees.couples).map(({ couple, unites }) => {
    const paires = pairesDuCouple(entrees.plan, couple);
    exigerLesDeuxNumeros(couple, reponses_api);
    const categories = new Map<Ulid, CategorieRetenue>(unites.map((u) => [u.reponse_id, u.categorie]));
    const issues = paires.map((paire) => issueDeLaPaire(paire.map((requete) => categorieDe(requete, reponses, categories))));
    return variabiliteDuCouple(couple, issues);
  });
}

/** Une même requête deux fois au plan : aucun nombre d'échantillons ne s'en lit. */
function exigerRequetesUniques(plan: readonly RequeteDuPlan[]): void {
  const vues = new Set<string>();
  for (const requete of plan) {
    const cle = cleRequete(requete, requete.echantillon);
    if (vues.has(cle)) throw new EchantillonsDuRunIncoherents(`la requête ${lisible(cle)} figure deux fois au plan`);
    vues.add(cle);
  }
}

/**
 * Le nombre d'échantillons par question que prévoit le plan, lu sur les numéros qu'il porte : 2 s'il
 * porte 1 et 2, 1 s'il ne porte que 1 (levier du §12). Un numéro hors de 1 et 2, ou un plan vide, lève.
 */
function echantillonsPrevusAuPlan(plan: readonly RequeteDuPlan[]): 1 | 2 {
  if (plan.length === 0) throw new EchantillonsDuRunIncoherents("plan d'interrogation vide");
  const horsNumeros = plan.find((r) => !estNumeroDEchantillon(r.echantillon));
  if (horsNumeros !== undefined) throw new EchantillonsDuRunIncoherents(`requête du plan ${lisible(clePaire(horsNumeros))} à l'échantillon numéroté ${horsNumeros.echantillon}`);
  exigerRequetesUniques(plan);
  const numeros = new Set(plan.map((r) => r.echantillon));
  if (numeros.size === ECHANTILLONS_D_UNE_PAIRE) return 2;
  if (numeros.has(1)) return 1;
  throw new EchantillonsDuRunIncoherents("plan à un seul échantillon par question, numéroté 2 : le seul échantillon d'un tel plan est numéroté 1");
}

/** Sous un plan à un échantillon, une réponse API du run d'un autre numéro n'a pas de requête au plan. */
function exigerReponsesAuPremierNumero(reponses: ReadonlyMap<string, ReponseApiDuRun>): void {
  const autre = [...reponses.values()].find((r) => r.echantillon !== 1);
  if (autre !== undefined) throw new EchantillonsDuRunIncoherents(`plan à un seul échantillon par question, mais la réponse ${autre.id} est numérotée ${autre.echantillon}`);
}

/**
 * §8 (D73 (6)) : la variabilité entre échantillons du run. Le plan ne prévoit qu'un échantillon par
 * question (§12, « 2 → 1 ») : publiée absente avec `un_seul_echantillon_au_plan`. Sinon, l'accord de
 * chaque couple comparé (`variabiliteEntreEchantillons`), calcul inchangé.
 */
export function variabiliteDuRun(entrees: EntreesVariabilite): VariabiliteDesEchantillons {
  if (echantillonsPrevusAuPlan(entrees.plan) === 2) return { statut: "calcule", couples: variabiliteEntreEchantillons(entrees) };
  exigerReponsesAuPremierNumero(reponsesApiParRequete(entrees.reponses));
  return { statut: "sans_objet", motif: MOTIF_UN_SEUL_ECHANTILLON_AU_PLAN };
}
