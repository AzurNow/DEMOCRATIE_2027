/**
 * `pnpm analyze`, sous-lot A : l'assemblage des analyses préenregistrées du §8 sur un run, avec un
 * seul partage de la population, porté par un seul objet (docs/DETTE.md, 2026-11-02, n° 1).
 *
 * Ce module ne définit aucune métrique, aucun seuil ni aucune règle de décision : il appelle les
 * modules d'`analysis/` qui les portent, dans cet ordre, et rien d'autre.
 *
 * 1. `lireEntreesDuRun` lit le run (`lecture-run.ts:lireRun`, qui valide chaque fichier) et ses
 *    notations individuelles (`lireNotationsDuRun`). Le plan d'interrogation et le tirage de
 *    l'échantillon humain sont **injectés** par l'appelant (`outils/analyze.ts`) : `analysis/`
 *    n'importe pas le code d'interrogation ni de notation (flux à sens unique, CLAUDE.md).
 * 2. `assembler` (`filtre.ts`) construit les unités ; seules celles du canal API entrent ici (le
 *    canal application est exploratoire, QR8, et n'est pas de ce sous-lot).
 * 3. `contexteDuRun` calcule **une seule fois** le partage des couples (`seuils.ts:couplesComparables`),
 *    celui des candidats (`candidatsComparables`), les strates (`incertitude.ts:stratesDuCalculPrincipal`),
 *    les modes de tête, la strate de moins de 60 jours (`strate-recente.ts:unitesDeLaStrateRecente`)
 *    et les graines du run. Le résultat est figé (`Object.freeze`, en profondeur) et il est le seul
 *    porteur du partage : chaque section le reçoit, aucune ne le recalcule. §8, robustesse :
 *    « Chaque recalcul garde le partage des couples outil × mode et des candidats du calcul
 *    principal : les seuils de non-publication ne sont pas réappliqués à la population restreinte ».
 * 4. à 8. Les sections : taux, asymétrie (test par couple comparé, puis Holm), conditions (modes et
 *    formulations, strates `global` et `recents:60j`), robustesse (taux recalculés (a) à (d) ; la
 *    robustesse des différences est le sous-lot B), hypothèses (H1 à H5, protocole 0.27, D63 ; H5
 *    lit la tendance entre le premier run, lu avec son propre partage, et ce run ; D70 pour un outil
 *    à deux modes), variabilité entre échantillons (diagnostic par couple comparé, §8, D70 (12),
 *    `accord-echantillons.ts`, qui lit aussi le plan d'interrogation). Chaque section est
 *    `{statut: "calcule", …}` ou `{statut: "sans_objet", motif}` : jamais une section vide qui
 *    passerait pour un résultat. La population publie aussi le régime d'inclusion du run (§3, D68).
 * 9. `collecterGraines` relève chaque couple `{cle, graine}` publié dans le document.
 * 10. `validerEtEcrire` valide le document contre `schema/metriques.schema.json` avant toute écriture,
 *    puis écrit `runs/<date>/metriques/metriques.json` s'il est absent, ne fait rien s'il est
 *    identique à l'octet près, et lève `MetriquesDivergentes` s'il diffère : jamais d'écrasement.
 *
 * Les kappas et le test contrefactuel ne sont pas recopiés : ils vivent dans `run.json`, que
 * l'empreinte de `entrees.run_json_sha256` désigne.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { comparerChaines } from "../outils/ordre-chaines.ts";
import { valider } from "../outils/schemas/valider.ts";
import { canoniser } from "../validation/domaine/empreinte.ts";
import { variabiliteEntreEchantillons, type VariabiliteDuCouple } from "./accord-echantillons.ts";
import { REECHANTILLONNAGES_PRODUCTION } from "./bootstrap.ts";
import { comparerConditions, pairesDeH3, pairesParFormulation, pairesParMode, type ComparaisonCondition, type PaireExclue } from "./conditions.ts";
import { unitesParCoupleCompare } from "./couples-compares.ts";
import { assembler, estDuRun, type EntreesAnalyse, type UniteAnalyse } from "./filtre.ts";
import { decisionH1, decisionH2, decisionH3, decisionH4, decisionH5, STRATE_H3, type FabricationDuCouple } from "./hypotheses.ts";
import { STRATE_GLOBALE, stratesDuCalculPrincipal, tauxPubliesParCouple, type StratesPubliees, type TauxDuRun } from "./incertitude.ts";
import {
  dispositionRunNote,
  lireNotationsDuRun,
  lireRun,
  type EchantillonHumainDuRun,
  type PlanDuRun,
  type RunLu,
} from "./lecture-run.ts";
import { exactitude } from "./metriques.ts";
import { corrigerFamilleAsymetrie, PERMUTATIONS_PRODUCTION, testHomogeneiteCandidats, type FamilleAsymetrie, type ResultatCouple } from "./permutation.ts";
import { tauxRecalcules } from "./robustesse-taux.ts";
import type { SourcesRobustesse } from "./robustesse.ts";
import { candidatsComparables, cleCouple, couplesComparables, type PartageCandidats, type PartageCouples, type RequeteDuPlan } from "./seuils.ts";
import { STRATE_RECENTE, unitesDeLaStrateRecente, type ItemDate } from "./strate-recente.ts";
import { tendanceDuRun, type TendanceDuRun } from "./tendance.ts";
import type { CoupleOutilMode, IdentifiantCourt, Item, Mode, Notation, Question, Run, Ulid } from "./types.ts";

/* ------------------------------------------------------------------ entrées */

/** §3 (0.11 ; 0.27, D68) : « chaque run déclare son régime ». */
export type RegimeInclusion = "avant_liste_officielle" | "liste_officielle" | "entre_deux_tours";

/** La part de `run.json` que l'analyse lit en plus de `Run` (schema/run.schema.json l'exige). */
export interface RunAnalyse extends Run {
  readonly perimetre: Run["perimetre"] & { readonly regime_inclusion: RegimeInclusion };
  readonly versions: { readonly donnees_commit: string };
  readonly tirage: { readonly sha256: string };
  /** Lus seulement pour retirer de l'empreinte les champs que le go/no-go y écrit. */
  readonly juges: readonly object[];
  readonly graines: { readonly bootstrap: { readonly valeur: number }; readonly permutation: { readonly valeur: number } };
}

/** Tout ce que l'analyse d'un run lit, déjà validé : la sortie de `lireEntreesDuRun`. */
export interface EntreesDuRun extends Omit<EntreesAnalyse, "run" | "items"> {
  readonly run: RunAnalyse;
  /** Les items épinglés, validés contre `item.schema.json` : ils portent `valide_du` (strate de 60 jours). */
  readonly items: readonly (Item & ItemDate)[];
  readonly notations: readonly Notation[];
  readonly plan: readonly RequeteDuPlan[];
}

export interface OptionsLectureAnalyse {
  /** Le répertoire des items validés, lu en Git au commit `run.versions.donnees_commit` (`lireRun`). */
  readonly items: string;
  readonly plan_du_run: PlanDuRun;
  readonly echantillon_humain: EchantillonHumainDuRun;
}

/** 1. Le run lu et validé (`lireRun`), ses notations individuelles et son plan d'interrogation. */
export function lireEntreesDuRun(repertoire_run: string, options: OptionsLectureAnalyse): EntreesDuRun {
  const { entrees } = lireRun(repertoire_run, options);
  // run.schema.json exige versions, tirage et graines.bootstrap / permutation ; lireRun l'a validé.
  const run = entrees.run as RunLu & RunAnalyse;
  return {
    ...entrees,
    run,
    items: entrees.items as readonly (Item & ItemDate)[],
    notations: lireNotationsDuRun(repertoire_run, run.id).notations,
    plan: options.plan_du_run(repertoire_run, run),
  };
}

/* ------------------------------------------------------------------ contexte */

/** Le nombre de tirages : §8 en production (2 000 et 10 000), moins dans les tests. */
export interface ParametresAnalyse {
  readonly reechantillonnages: number;
  readonly permutations: number;
}

export const PARAMETRES_PRODUCTION: ParametresAnalyse = Object.freeze({
  reechantillonnages: REECHANTILLONNAGES_PRODUCTION,
  permutations: PERMUTATIONS_PRODUCTION,
});

export interface ModeDeTete {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
}

/**
 * Le seul porteur du partage de la population. Construit par `contexteDuRun`, figé, et passé tel
 * quel à chaque section : aucune section ne lit `sous_seuil`, ne compte de manquantes ni ne relève
 * de strates.
 */
export interface ContexteDuRun {
  /** Les unités du canal API du run, dans l'ordre d'assemblage. */
  readonly unites: readonly UniteAnalyse[];
  /** §2, H2 : les unités dont la question entre dans la strate de moins de 60 jours. */
  readonly unites_recentes: readonly UniteAnalyse[];
  /** Les questions du run : la tendance (H5) les compare à celles du premier run (§8). */
  readonly questions: readonly Question[];
  /** §3 (D68) : le régime déclaré au gel, publié avec la population. */
  readonly regime_inclusion: RegimeInclusion;
  readonly couples: PartageCouples;
  readonly candidats: PartageCandidats;
  readonly strates: StratesPubliees;
  readonly modes_de_tete: readonly ModeDeTete[];
  /** Les assistants inclus, dans l'ordre du périmètre : les outils des hypothèses. */
  readonly outils: readonly IdentifiantCourt[];
  readonly sources_robustesse: SourcesRobustesse;
  readonly graines: { readonly bootstrap: number; readonly permutation: number };
  readonly parametres: ParametresAnalyse;
}

/** Un assistant inclus sans mode de tête : run.schema.json l'exige, et aucun mode n'est choisi ici. */
export class ModeDeTeteNonDeclare extends Error {
  constructor(outil_id: IdentifiantCourt) {
    super(`Assistant inclus ${outil_id} sans mode_de_tete (§8, run.schema.json) : le mode de tête est lu, jamais choisi.`);
    this.name = "ModeDeTeteNonDeclare";
  }
}

type OutilDuRun = Run["perimetre"]["outils"][number];

function estAssistantInclus(outil: OutilDuRun): boolean {
  return outil.famille === "assistant" && outil.inclus;
}

function modeDeTete(outil: OutilDuRun): ModeDeTete {
  if (outil.mode_de_tete === undefined) throw new ModeDeTeteNonDeclare(outil.outil_id);
  return { outil_id: outil.outil_id, mode: outil.mode_de_tete };
}

function figer<T>(valeur: T): T {
  if (typeof valeur !== "object" || valeur === null || Object.isFrozen(valeur)) return valeur;
  for (const sous of Object.values(valeur)) figer(sous);
  return Object.freeze(valeur);
}

/** 3. Le partage de la population, calculé une fois, figé. */
export function contexteDuRun(entrees: EntreesDuRun, unites: readonly UniteAnalyse[], parametres: ParametresAnalyse): ContexteDuRun {
  const api = unites.filter((u) => u.canal === "api");
  const candidats = candidatsComparables(entrees.run);
  const assistants = entrees.run.perimetre.outils.filter(estAssistantInclus);
  // Le partage est figé en profondeur ; les unités et les sources, qui appartiennent à l'appelant,
  // sont seulement portées par des tableaux figés.
  return Object.freeze({
    unites: Object.freeze(api),
    unites_recentes: Object.freeze(unitesDeLaStrateRecente(api, entrees.items, entrees.run.date_gel)),
    questions: Object.freeze([...entrees.questions]),
    regime_inclusion: entrees.run.perimetre.regime_inclusion,
    couples: figer(couplesComparables(entrees.reponses, entrees.plan)),
    candidats: figer(candidats),
    strates: figer(stratesDuCalculPrincipal(api, candidats)),
    modes_de_tete: figer(assistants.map(modeDeTete)),
    outils: figer(assistants.map((outil) => outil.outil_id)),
    sources_robustesse: Object.freeze({ run: entrees.run, notations: entrees.notations }),
    graines: figer({ bootstrap: entrees.run.graines.bootstrap.valeur, permutation: entrees.run.graines.permutation.valeur }),
    parametres: figer({ ...parametres }),
  });
}

/* ------------------------------------------------------------------ sections */

export type MotifSansObjet = "aucun_couple_compare" | "calcul_a_venir" | "moins_de_deux_candidats" | "premier_run_absent";

export interface SansObjet {
  readonly statut: "sans_objet";
  readonly motif: MotifSansObjet;
}

export type Section<T> = ({ readonly statut: "calcule" } & T) | SansObjet;

function sansObjet(motif: MotifSansObjet): SansObjet {
  return { statut: "sans_objet", motif };
}

/** Une section par couple comparé n'a pas d'objet quand le partage n'en compte aucun. */
export function surCouplesCompares<T>(contexte: ContexteDuRun, contenu: () => T): Section<T> {
  if (contexte.couples.compares.length === 0) return sansObjet("aucun_couple_compare");
  return { statut: "calcule", ...contenu() };
}

export function optionsBootstrap(contexte: ContexteDuRun): { readonly reechantillonnages: number; readonly graine_du_run: number } {
  return { reechantillonnages: contexte.parametres.reechantillonnages, graine_du_run: contexte.graines.bootstrap };
}

/** 4. Les taux publiés de chaque couple comparé, chacun avec son intervalle. */
export function calculerTaux(contexte: ContexteDuRun): TauxDuRun {
  return tauxPubliesParCouple(contexte.unites, contexte.couples, contexte.strates, contexte.candidats, optionsBootstrap(contexte));
}

export function sectionTaux(contexte: ContexteDuRun, taux: TauxDuRun): Section<{ readonly couples: TauxDuRun["compares"]; readonly couples_incomplets: readonly CoupleOutilMode[] }> {
  return surCouplesCompares(contexte, () => ({ couples: taux.compares, couples_incomplets: taux.couples_incomplets }));
}

export interface AsymetrieCalculee {
  readonly resultats: readonly ResultatCouple[];
  readonly famille: FamilleAsymetrie;
}

/** 5. Le test d'homogénéité de chaque couple comparé, puis la correction de Holm sur leur famille. */
export function calculerAsymetrie(contexte: ContexteDuRun): AsymetrieCalculee {
  const resultats = unitesParCoupleCompare(contexte.unites, contexte.couples).map(({ couple, unites }) => ({
    couple,
    resultat: testHomogeneiteCandidats(
      unites,
      contexte.candidats,
      { permutations: contexte.parametres.permutations, graine_du_run: contexte.graines.permutation, cle: [couple.outil_id, couple.mode] },
      { ...optionsBootstrap(contexte), cle: [couple.outil_id, couple.mode] },
    ),
  }));
  return { resultats, famille: corrigerFamilleAsymetrie(resultats, contexte.couples) };
}

function testPublie(resultat: ResultatCouple, famille: FamilleAsymetrie): object {
  if (resultat.resultat === null) return sansObjet("moins_de_deux_candidats");
  const cle = cleCouple(resultat.couple);
  const corrigee = famille.corrigees.find((p) => p.cle === cle);
  if (corrigee === undefined) throw new Error(`Couple ${cle} testé, mais absent de la famille de Holm : valeur p corrigée indécidable.`);
  return { statut: "calcule", ...resultat.resultat, valeur_p_corrigee: corrigee.corrigee };
}

export function sectionAsymetrie(contexte: ContexteDuRun, asymetrie: AsymetrieCalculee): Section<object> {
  return surCouplesCompares(contexte, () => ({
    couples: asymetrie.resultats.map((r) => ({ couple: r.couple, test: testPublie(r, asymetrie.famille) })),
    couples_incomplets: asymetrie.famille.couples_incomplets,
    couples_sans_test: asymetrie.famille.couples_sans_test,
  }));
}

export interface ComparaisonsDUneFamille {
  readonly comparaisons: readonly ComparaisonCondition[];
  readonly paires_exclues: readonly PaireExclue[];
}

export interface ConditionsDUneStrate {
  readonly strate: string;
  readonly modes: ComparaisonsDUneFamille;
  readonly formulations: ComparaisonsDUneFamille;
}

/** §8, « Graines de l'analyse » : la clé d'une différence est la métrique et la strate, puis la paire. */
const METRIQUE_DES_CONDITIONS = "exactitude";

function comparerFamille(
  contexte: ContexteDuRun,
  paires: { readonly paires: Parameters<typeof comparerConditions>[0]; readonly paires_exclues: readonly PaireExclue[] },
  strate: string,
): ComparaisonsDUneFamille {
  const options = { ...optionsBootstrap(contexte), cle: [METRIQUE_DES_CONDITIONS, strate] };
  return { comparaisons: comparerConditions(paires.paires, exactitude, options), paires_exclues: paires.paires_exclues };
}

/** 6. Modes et formulations, sur la strate `global` puis sur `recents:60j`. */
export function calculerConditions(contexte: ContexteDuRun): readonly ConditionsDUneStrate[] {
  const strates = [
    { strate: STRATE_GLOBALE, unites: contexte.unites },
    { strate: STRATE_RECENTE, unites: contexte.unites_recentes },
  ];
  return strates.map(({ strate, unites }) => ({
    strate,
    modes: comparerFamille(contexte, pairesParMode(unites, contexte.couples), strate),
    formulations: comparerFamille(contexte, pairesParFormulation(unites, contexte.couples), strate),
  }));
}

export function sectionConditions(contexte: ContexteDuRun, conditions: readonly ConditionsDUneStrate[]): Section<{ readonly strates: readonly ConditionsDUneStrate[] }> {
  return surCouplesCompares(contexte, () => ({ strates: conditions }));
}

/** 7. Les taux recalculés (a) à (d), sur le partage et les strates du calcul principal. */
export function sectionRobustesse(contexte: ContexteDuRun): { readonly taux: Section<object>; readonly differences: SansObjet } {
  return {
    taux: surCouplesCompares(contexte, () => ({
      recalculs: tauxRecalcules(contexte.unites, contexte.sources_robustesse, contexte.couples, contexte.strates, contexte.candidats, optionsBootstrap(contexte)).map(
        ({ recalcul, taux }) => ({ recalcul, couples: taux.compares, couples_incomplets: taux.couples_incomplets }),
      ),
    })),
    // Sous-lot B : la fragilité des différences établies (`robustesse.ts:evaluerRobustesse`).
    differences: sansObjet("calcul_a_venir"),
  };
}

/**
 * La variabilité entre échantillons (§8, D70 (12)) : un diagnostic par couple comparé, sur le partage
 * du calcul principal. Le plan vient des entrées : il dit quelles paires étaient prévues.
 */
export function sectionVariabilite(contexte: ContexteDuRun, entrees: EntreesDuRun): Section<{ readonly couples: readonly VariabiliteDuCouple[] }> {
  return surCouplesCompares(contexte, () => ({
    couples: variabiliteEntreEchantillons({ couples: contexte.couples, plan: entrees.plan, reponses: entrees.reponses, unites: contexte.unites }),
  }));
}

/** Le taux de fabrication, strate `global`, de chaque couple comparé : l'entrée de H1, lue dans la section des taux. */
function fabricationsDe(taux: TauxDuRun): FabricationDuCouple[] {
  return taux.compares.map(({ couple, taux: publies }) => {
    const fabrication = publies.find((t) => t.metrique === "fabrication" && t.strate === STRATE_GLOBALE);
    if (fabrication === undefined) throw new Error(`Couple ${cleCouple(couple)} sans taux de fabrication global : H1 indécidable.`);
    return { couple, fabrication: fabrication.taux, intervalle: fabrication.intervalle.intervalle };
  });
}

function strateDesConditions(conditions: readonly ConditionsDUneStrate[], strate: string): ComparaisonsDUneFamille {
  const trouvee = conditions.find((c) => c.strate === strate);
  if (trouvee === undefined) throw new Error(`Strate ${strate} absente des conditions : H2 indécidable.`);
  return trouvee.modes;
}

/**
 * La différence de H3 (§2, 0.27, D63) : neutre moins orientée, sur les seules questions dont l'item
 * principal est F ou O, par couple comparé. Même calcul que la famille des formulations
 * (`comparerFamille`), sous la clé `exactitude / type_item:F+O / <outil>:<mode>:neutre-oriente`
 * (`hypotheses.ts:STRATE_H3`). Rendue telle quelle pour que la robustesse des différences (sous-lot
 * B, D69 : le recalcul (c) y est « sans objet ») la reprenne sans la recalculer.
 */
export function calculerH3(contexte: ContexteDuRun): ComparaisonsDUneFamille {
  return comparerFamille(contexte, pairesDeH3(contexte.unites, contexte.couples), STRATE_H3);
}

/** Le premier run de la tendance (H5) : ce run lui-même, ou un run gelé après, n'a pas de sens. */
export class PremierRunInvalide extends Error {
  constructor(detail: string) {
    super(`--premier : ${detail} La tendance (§8) compare le premier run au dernier.`);
    this.name = "PremierRunInvalide";
  }
}

/** Le premier run, avec le contexte calculé sur son propre partage (§8, seuil de 20 % de CE run). */
export interface PremierRun {
  readonly run_id: Ulid;
  readonly contexte: ContexteDuRun;
}

function verifierPremier(premier: RunAnalyse, dernier: RunAnalyse): void {
  if (premier.id === dernier.id) throw new PremierRunInvalide(`le premier run ${premier.id} est le run analysé.`);
  if (!(Date.parse(premier.date_gel) < Date.parse(dernier.date_gel))) {
    throw new PremierRunInvalide(`le premier run est gelé le ${premier.date_gel}, pas avant le run analysé (${dernier.date_gel}).`);
  }
}

/**
 * La tendance de l'exactitude (§8, QR7) entre le premier run et ce run, strate `global`. Clé
 * `exactitude / global`, à laquelle `tendance.ts` ajoute l'outil puis le mode (§8 : « pour la
 * tendance, l'outil puis le mode »). Chaque run garde son partage : celui du premier run est le sien.
 */
export function calculerTendance(contexte: ContexteDuRun, premier: PremierRun): TendanceDuRun {
  const etat = (c: ContexteDuRun) => ({ unites: c.unites, questions: c.questions, couples: c.couples });
  return tendanceDuRun(etat(premier.contexte), etat(contexte), exactitude, { ...optionsBootstrap(contexte), cle: [METRIQUE_DES_CONDITIONS, STRATE_GLOBALE] });
}

function sectionH5(contexte: ContexteDuRun, premier: PremierRun | null): object {
  if (premier === null) return sansObjet("premier_run_absent");
  return { statut: "calcule", premier_run_id: premier.run_id, ...decisionH5(contexte.outils, calculerTendance(contexte, premier)) };
}

/** 8. Les hypothèses lisent les sections déjà calculées, la différence de H3 et la tendance. */
export function sectionHypotheses(
  contexte: ContexteDuRun,
  calculs: { readonly taux: TauxDuRun; readonly asymetrie: AsymetrieCalculee; readonly conditions: readonly ConditionsDUneStrate[]; readonly h3: ComparaisonsDUneFamille },
  premier: PremierRun | null,
): Readonly<Record<"H1" | "H2" | "H3" | "H4" | "H5", object>> {
  const { taux, asymetrie, conditions, h3 } = calculs;
  return {
    H1: { statut: "calcule", ...decisionH1(contexte.outils, contexte.couples, fabricationsDe(taux)) },
    H2: {
      statut: "calcule",
      outils: decisionH2(contexte.outils, strateDesConditions(conditions, STRATE_GLOBALE), strateDesConditions(conditions, STRATE_RECENTE)),
    },
    H3: { statut: "calcule", strate: STRATE_H3, couples: decisionH3(contexte.couples, h3) },
    H4: { statut: "calcule", ...decisionH4(asymetrie.famille) },
    H5: sectionH5(contexte, premier),
  };
}

/* ------------------------------------------------------------------ graines */

export interface GrainePubliee {
  readonly cle: readonly string[];
  readonly graine: string;
}

function estGrainePubliee(valeur: object): valeur is GrainePubliee {
  const { cle, graine } = valeur as Partial<GrainePubliee>;
  return Array.isArray(cle) && cle.every((c) => typeof c === "string") && typeof graine === "string";
}

function releverGraines(valeur: unknown, relevees: Map<string, GrainePubliee>): void {
  if (typeof valeur !== "object" || valeur === null) return;
  if (!Array.isArray(valeur) && estGrainePubliee(valeur)) ranger({ cle: valeur.cle, graine: valeur.graine }, relevees);
  for (const sous of Object.values(valeur)) releverGraines(sous, relevees);
}

function ranger(graine: GrainePubliee, relevees: Map<string, GrainePubliee>): void {
  const cle = graine.cle.join("\0");
  const deja = relevees.get(cle);
  if (deja !== undefined && deja.graine !== graine.graine) {
    throw new Error(`Clé [${graine.cle.join(", ")}] publiée avec deux graines (${deja.graine}, ${graine.graine}) : graine non reproductible.`);
  }
  relevees.set(cle, graine);
}

/**
 * 9. Chaque `{cle, graine}` publié dans le document, une fois par clé, trié par clé. Les recalculs de
 * robustesse gardent la clé du calcul principal (§8) : ils ne rajoutent aucune entrée.
 */
export function collecterGraines(document: object): GrainePubliee[] {
  const relevees = new Map<string, GrainePubliee>();
  releverGraines(document, relevees);
  return [...relevees].sort(([a], [b]) => comparerChaines(a, b)).map(([, graine]) => graine);
}

/* ------------------------------------------------------------------ document */

/**
 * Les champs que `run.json` reçoit après l'analyse, hors de l'empreinte pour qu'une analyse relancée
 * ensuite reste identique : ceux que `pnpm go-no-go` y écrit (`pipeline/go-no-go/go-no-go.ts:
 * fusionner`), et le statut, la publication et le dépôt (§9, protocole 0.28, D70 (13) : « celle du
 * fichier du run étant calculée hors des champs de statut, de publication et de dépôt, que ce
 * fichier reçoit après l'analyse »).
 */
const CHAMPS_APRES_ANALYSE_DU_RUN = [
  "statut",
  "publication",
  "depot",
  "go_no_go",
  "motif_provisoire",
  "indeterminees_echantillon_humain",
  "non_classees_echantillon_humain",
  "renvois_attribution_indecidable",
  "refus_api_echantillon_humain",
  "accord_humains_echantillon",
] as const;
const CHAMPS_GO_NO_GO_DU_JUGE = ["kappa_echantillon_humain", "motif_indefini_kappa_echantillon_humain", "renvois_ecartes_kappa_echantillon"] as const;
const CHAMPS_GO_NO_GO_DE_L_OUTIL = ["par_mode"] as const;

type Objet = Readonly<Record<string, unknown>>;

function sans(objet: Objet, champs: readonly string[]): Objet {
  return Object.fromEntries(Object.entries(objet).filter(([cle]) => !champs.includes(cle)));
}

function chaqueSans(liste: unknown, champs: readonly string[]): unknown {
  if (!Array.isArray(liste)) throw new Error("run.json : liste attendue (juges, perimetre.outils).");
  return liste.map((element: Objet) => sans(element, champs));
}

/** SHA-256 de la forme canonique de `run.json`, sans les champs qu'il reçoit après l'analyse. */
export function empreinteDuRun(run: object): string {
  const brut = run as Objet;
  const perimetre = brut["perimetre"] as Objet;
  const reduit = {
    ...sans(brut, CHAMPS_APRES_ANALYSE_DU_RUN),
    juges: chaqueSans(brut["juges"], CHAMPS_GO_NO_GO_DU_JUGE),
    perimetre: { ...perimetre, outils: chaqueSans(perimetre["outils"], CHAMPS_GO_NO_GO_DE_L_OUTIL) },
  };
  return createHash("sha256").update(canoniser(reduit), "utf8").digest("hex");
}

export function entreesPubliees(entrees: EntreesDuRun): object {
  const duRun = entrees.reponses.filter(estDuRun);
  return {
    run_json_sha256: empreinteDuRun(entrees.run),
    tirage_sha256: entrees.run.tirage.sha256,
    donnees_commit: entrees.run.versions.donnees_commit,
    reponses_lues: entrees.reponses.length,
    reponses_obtenues: duRun.filter((r) => r.statut_reponse === "obtenue").length,
    reponses_manquantes: duRun.filter((r) => r.statut_reponse === "manquante").length,
    verdicts_lus: entrees.verdicts.length,
    notations_lues: entrees.notations.length,
  };
}

export function populationDe(contexte: ContexteDuRun): object {
  return {
    regime_inclusion: contexte.regime_inclusion,
    couples_compares: contexte.couples.compares,
    couples_incomplets: contexte.couples.incomplets,
    candidats_compares: contexte.candidats.compares,
    candidats_rapportes_a_part: contexte.candidats.rapportes_a_part,
    strates: contexte.strates,
    modes_de_tete: contexte.modes_de_tete,
  };
}

/** Le premier run de la tendance, sur son propre partage (§8) ; `null` : pas de `--premier`. */
function premierRunDe(premier: EntreesDuRun | null, dernier: EntreesDuRun, parametres: ParametresAnalyse): PremierRun | null {
  if (premier === null) return null;
  verifierPremier(premier.run, dernier.run);
  return { run_id: premier.run.id, contexte: contexteDuRun(premier, assembler(premier), parametres) };
}

/**
 * 2. à 9. Le document `metriques.json` d'un run, sans rien écrire. `premier` : les entrées du premier
 * run de la tendance (H5), ou `null` quand l'analyse n'en reçoit pas (H5 « sans objet »,
 * `premier_run_absent`).
 */
export function analyserRun(entrees: EntreesDuRun, parametres: ParametresAnalyse, premier: EntreesDuRun | null): object {
  const contexte = contexteDuRun(entrees, assembler(entrees), parametres);
  const taux = calculerTaux(contexte);
  const asymetrie = calculerAsymetrie(contexte);
  const conditions = calculerConditions(contexte);
  const h3 = calculerH3(contexte);
  const document = {
    run_id: entrees.run.id,
    entrees: entreesPubliees(entrees),
    parametres: contexte.parametres,
    population: populationDe(contexte),
    taux: sectionTaux(contexte, taux),
    asymetrie: sectionAsymetrie(contexte, asymetrie),
    conditions: sectionConditions(contexte, conditions),
    robustesse: sectionRobustesse(contexte),
    variabilite_echantillons: sectionVariabilite(contexte, entrees),
    hypotheses: sectionHypotheses(contexte, { taux, asymetrie, conditions, h3 }, premierRunDe(premier, entrees, parametres)),
  };
  return { ...document, graines: collecterGraines(document) };
}

/* ------------------------------------------------------------------ écriture */

/** `metriques.json` existe et diffère du recalcul : rien n'est écrit, jamais d'écrasement. */
export class MetriquesDivergentes extends Error {
  readonly chemin: string;

  constructor(chemin: string) {
    super(
      `${chemin} existe et diffère de l'analyse recalculée : rien n'est écrit (jamais d'écrasement). Un run analysé ` +
        `ne se réanalyse pas en silence ; comprendre l'écart avant toute autre action.`,
    );
    this.name = "MetriquesDivergentes";
    this.chemin = chemin;
  }
}

export type IssueMetriques = "ecrit" | "inchange";

export function cheminMetriques(repertoire_run: string): string {
  return join(dispositionRunNote(repertoire_run).run, "metriques", "metriques.json");
}

/** 10. Valide le document avant tout, puis l'écrit s'il est absent ; identique, rien ; différent, refus. */
export function validerEtEcrire(chemin: string, document: unknown): IssueMetriques {
  const texte = `${JSON.stringify(valider<object>("metriques", document, `${chemin} avant écriture`), null, 2)}\n`;
  if (existsSync(chemin)) {
    if (readFileSync(chemin, "utf8") === texte) return "inchange";
    throw new MetriquesDivergentes(chemin);
  }
  mkdirSync(join(chemin, ".."), { recursive: true });
  const provisoire = `${chemin}.${process.pid}.provisoire`;
  writeFileSync(provisoire, texte, "utf8");
  renameSync(provisoire, chemin);
  return "ecrit";
}

export interface ResultatAnalyse {
  readonly chemin: string;
  readonly issue: IssueMetriques;
  readonly document: object;
}

/**
 * `pnpm analyze` : lire, analyser, valider, écrire. `repertoire_premier` : le premier run de la
 * tendance (`--premier`), lu et validé comme le run analysé, ou `null`.
 */
export function analyserEtEcrire(
  repertoire_run: string,
  options: OptionsLectureAnalyse,
  parametres: ParametresAnalyse,
  repertoire_premier: string | null,
): ResultatAnalyse {
  const premier = repertoire_premier === null ? null : lireEntreesDuRun(repertoire_premier, options);
  const document = analyserRun(lireEntreesDuRun(repertoire_run, options), parametres, premier);
  const chemin = cheminMetriques(repertoire_run);
  return { chemin, issue: validerEtEcrire(chemin, document), document };
}
