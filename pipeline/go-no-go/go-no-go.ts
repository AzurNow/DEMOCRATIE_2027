/**
 * `pnpm go-no-go <repertoire_run>` : les sept critères du §12 calculés depuis les fichiers du run,
 * la décision qui en découle (D24), le kappa de l'échantillon humain de chaque juge retenu, et la
 * checklist de l'annexe F.
 *
 * Ce qui est lu : `run.json`, `volume/reponses/`, `volume/notations/` (et les réponses
 * contrefactuelles, validées au passage), `verdicts/`, `tirage.json` et `questions.json` (le plan
 * d'interrogation du run, `plan-du-run.ts` : les manquantes se comptent sur lui, §8 et §12,
 * protocole 0.21), le journal `volume/tentatives/` des seules requêtes du plan sans réponse
 * (`attente-operateur.ts`), `metriques/metriques.json` s'il existe (`metriques.ts` : ses graines
 * pour le critère des analyses, ses sections de robustesse pour la case 7 de l'annexe F), et
 * `reverification-absence.json` s'il existe (`reverification-absence.ts`, case 2 ; absent ou non
 * conforme, la case le dit). Chaque fichier est validé contre son schéma (`analysis/lecture-run.ts`,
 * `metriques.ts`, `reverification-absence.ts`).
 *
 * Ce qui est écrit : dans `run.json`, `go_no_go`, `kappa_echantillon_humain` ou
 * `motif_indefini_kappa_echantillon_humain` de chaque juge retenu, `accord_humains_echantillon` (§7.30 :
 * l'accord des deux humains de l'échantillon, `analysis/accord-humains.ts`, seul calcul de ce champ),
 * `motif_provisoire` quand la décision est provisoire, et `perimetre.outils[].par_mode` de chaque assistant inclus (D55 (7),
 * `analysis/seuils.ts:parModeDuRun`, seul calcul de ce champ) ; `checklist.json`, sans contreseing.
 * `statut` n'est JAMAIS touché : le gel et la publication ne sont pas l'affaire de cette commande.
 *
 * Refus, avant toute écriture : symétrie rouge (le run est invalide ou ne part pas, et ne porte
 * aucun go/no-go), run `invalide`, run qui porte une `invalidation` (D51 (2) : enregistrée par
 * `pnpm run:invalider` ou par la notation en D16 (3), statut encore `planifie` ou `en_cours`), run
 * `planifie`, plan d'interrogation non reconstructible (`PlanNonReconstructible`), réponse API hors
 * plan (`ReponseHorsPlan`), requête en attente de l'opérateur (`ReponsesEnAttenteOperateur`, §6 et
 * §12 : le go/no-go ne se prononce pas). Un `run.json` qui porte déjà un go/no-go (ou un
 * kappa d'échantillon, un motif provisoire, ou un `par_mode`) différent du recalcul, ou une checklist
 * dont la part calculée diffère, lève : jamais d'écrasement silencieux. Identique : rien n'est
 * réécrit, et l'issue le dit. `run.json` et `checklist.json` sont validés contre leur schéma avant
 * d'être écrits.
 *
 * `metriques/` absent : le critère des analyses est rouge et la case 7 non faite. Présent sans
 * `metriques.json`, non conforme, ou d'un autre run : la commande s'arrête, rien n'est écrit. La
 * commande se lance après `pnpm analyze` ; l'empreinte `entrees.run_json_sha256` de `metriques.json`
 * ignore ce que le go/no-go écrit dans `run.json`, de sorte qu'une analyse relancée ensuite reste
 * identique (`analysis/analyse-du-run.ts:empreinteDuRun`).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { accordHumainsEchantillon, accordPublie, type AccordHumainsEchantillon } from "../../analysis/accord-humains.ts";
import { reponsesObtenuesDuRun } from "../../analysis/population-notation.ts";
import {
  cheminDuTirage,
  dispositionRunNote,
  lireNotationsDuRun,
  lireReponses,
  lireRunJson,
  lireTirage,
  lireVerdicts,
  type RunLu,
} from "../../analysis/lecture-run.ts";
import { parModeDuRun } from "../../analysis/seuils.ts";
import type { IdentifiantCourt, ParMode, Reponse, Ulid } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { tirerEchantillonHumain } from "../notation/echantillons.ts";
import type { Symetrie } from "../questions/types.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
import { CHAMPS_DU_GO_NO_GO, partDesChamps, retirerChamps } from "../../analysis/champs-posterieurs-au-gel.ts";
import { STATUT_INVALIDE, STATUT_PLANIFIE, type StatutRun, type TypeRun } from "../../analysis/types-run.ts";
import {
  constatGraineDuTirage,
  constatInterrogationDansLaFenetre,
  constatItemsAbsenceReverifies,
  constatNotationComplete,
  constatRobustesseCalculee,
  construireChecklist,
  partDuPipeline,
  type Checklist,
  type DemarragesDeReponse,
} from "./checklist.ts";
import { exigerAucuneAttenteSurPlan } from "../interrogation/attente-operateur.ts";
import { lireRunsDuDepot } from "../gel/precedent.ts";
import { critereKappaJugesHumains, critereTestContrefactuel } from "./criteres-juges.ts";
import {
  critereAnalysesExecutees,
  critereAucunItemConteste,
  critereErreursGravesRevues,
  critereReponsesManquantes,
  critereTestsSymetrie,
  type OutilDeclare,
} from "./criteres-run.ts";
import { deciderPublication } from "./decision.ts";
import { cheminChecklist, ecrireParRenommage, ecrireRunSiInchange, lireJson } from "./fichiers.ts";
import { kappasEchantillon, type KappaDeJuge } from "./kappa-echantillon.ts";
import { lireMetriques } from "./metriques.ts";
import { requetesDuPlanDuRun } from "../interrogation/plan-du-run.ts";
import { lireReverificationAbsence } from "./reverification-absence.ts";
import type { GoNoGo } from "./types.ts";

/** La part de `run.json` que lit le go/no-go, en plus de `RunLu`. */
interface VueGoNoGo {
  /** Typé par le schéma (`analysis/types-run.ts`) : un statut mal écrit ou renommé ne compile plus. */
  readonly statut: StatutRun;
  readonly invalidation?: { readonly motif: string };
  readonly fenetre: { readonly debut: string; readonly fin: string };
  /** §6 (0.32) : avec `date_gel` et `run_remplace_id`, la règle d'ouverture de la fenêtre (`fenetre.ts:ouvrirFenetre`). */
  readonly type_run: TypeRun;
  readonly date_gel: string;
  readonly run_remplace_id?: string;
  readonly symetrie: Symetrie;
  readonly graines: { readonly tirage: GraineTirage; readonly bootstrap: GraineTirage; readonly permutation: GraineTirage };
  readonly perimetre: { readonly outils: readonly OutilDeclare[] };
}

type Objet = Readonly<Record<string, unknown>>;

export class GoNoGoRefuse extends Error {
  constructor(detail: string) {
    super(`Go/no-go refusé : ${detail}`);
    this.name = "GoNoGoRefuse";
  }
}

export class GoNoGoDivergent extends Error {
  constructor(chemin: string, quoi: string) {
    super(`${chemin} porte déjà ${quoi} différent du recalcul : rien n'est écrit (jamais d'écrasement silencieux).`);
    this.name = "GoNoGoDivergent";
  }
}

export type IssueEcriture = "ecrit" | "inchange";

export interface ResultatGoNoGo {
  readonly go_no_go: GoNoGo;
  readonly kappas: readonly KappaDeJuge[];
  readonly indeterminees: number;
  /** D64, D70 : réponses de l'échantillon à note non classée, écartées du kappa. */
  readonly non_classees: number;
  readonly refus_api: number;
  /** §7.30 : l'accord des deux humains de l'échantillon (`analysis/accord-humains.ts`). */
  readonly accord_humains: AccordHumainsEchantillon;
  readonly checklist: Checklist;
  readonly par_mode: ReadonlyMap<IdentifiantCourt, ParMode>;
  readonly run_json: IssueEcriture;
  readonly checklist_json: IssueEcriture;
}

interface Calcul {
  readonly go_no_go: GoNoGo;
  readonly kappas: readonly KappaDeJuge[];
  /** D25 (1) : réponses de l'échantillon à note humaine indéterminée, écartées du kappa. */
  readonly indeterminees: number;
  /** D64, D70 : réponses de l'échantillon à note non classée (référence ou juge retenu), écartées du kappa. */
  readonly non_classees: number;
  /** D30 (2) : renvois de juge vers l'humain pour une Q-ATT indécidable, contexte run (motif `attribution_indecidable` seul). */
  readonly renvois: number;
  /** D32 : refus de l'API de l'échantillon, notés par règle, écartés du kappa de chaque juge. */
  readonly refus_api: number;
  /** §7.30 : l'accord des deux humains de l'échantillon (`analysis/accord-humains.ts`). */
  readonly accord_humains: AccordHumainsEchantillon;
  readonly checklist: Checklist;
  /** D55 (7) : `par_mode` de chaque assistant inclus, par `outil_id` (`analysis/seuils.ts:parModeDuRun`). */
  readonly par_mode: ReadonlyMap<IdentifiantCourt, ParMode>;
}

/* ------------------------------------------------------------------ refus */

function refuser(vue: VueGoNoGo): void {
  if (vue.symetrie.statut_global === "rouge") {
    throw new GoNoGoRefuse("symétrie rouge (§5, §12) : le run est invalide ou ne part pas, et un run invalide ne porte aucune décision de publication.");
  }
  if (vue.statut === STATUT_INVALIDE) throw new GoNoGoRefuse("run invalide (§12) : il ne porte aucune décision de publication.");
  if (vue.invalidation !== undefined) {
    throw new GoNoGoRefuse(`run invalidé (« ${vue.invalidation.motif} », D51 (2)) : il sera publié invalide, sans décision de publication (§12).`);
  }
  if (vue.statut === STATUT_PLANIFIE) throw new GoNoGoRefuse("run planifié : il n'a été ni interrogé ni noté.");
}

/* ------------------------------------------------------------------ calcul */

function graineDuFichierTirage(repertoire_run: string, run: RunLu): GraineTirage | undefined {
  if (!existsSync(cheminDuTirage(repertoire_run, run))) return undefined;
  return lireTirage(repertoire_run, run).graine_tirage;
}

function calculer(repertoire_run: string, run: RunLu, vue: VueGoNoGo): Calcul {
  const reponses = lireReponses<Reponse & DemarragesDeReponse>(repertoire_run, run.id);
  // §8, §12 (protocole 0.21) : les manquantes se comptent sur le plan d'interrogation du run, et le
  // go/no-go ne se prononce pas tant qu'une requête sans réponse attend l'opérateur (§6).
  const plan = requetesDuPlanDuRun(repertoire_run, run);
  exigerAucuneAttenteSurPlan(repertoire_run, reponses, plan, "go-no-go");
  const { notations, renvois } = lireNotationsDuRun(repertoire_run, run.id);
  const verdicts = lireVerdicts(repertoire_run, run.id);
  const metriques = lireMetriques(repertoire_run, run.id);
  const obtenues = reponsesObtenuesDuRun(reponses).map((r) => r.id);
  const echantillon = tirerEchantillonHumain(obtenues, run.graines.echantillon_humain, run.taux_echantillon_humain);
  const { kappas, indeterminees, non_classees, refus_api } = kappasEchantillon({ juges: run.juges, echantillon, notations, renvois });
  const go_no_go = deciderPublication([
    critereKappaJugesHumains(kappas),
    critereTestContrefactuel(run.juges),
    critereAucunItemConteste(vue.symetrie),
    critereTestsSymetrie(vue.symetrie),
    critereReponsesManquantes(vue.perimetre.outils, reponses, plan),
    critereErreursGravesRevues({ juges: run.juges, reponses_obtenues: obtenues, notations, verdicts }),
    critereAnalysesExecutees(metriques === null ? null : metriques.graines, { bootstrap: vue.graines.bootstrap.valeur, permutation: vue.graines.permutation.valeur }),
  ]);
  const constats = [
    constatItemsAbsenceReverifies(lireReverificationAbsence(repertoire_run), run.id),
    constatGraineDuTirage(vue.graines.tirage, graineDuFichierTirage(repertoire_run, run)),
    constatNotationComplete(obtenues, new Set<Ulid>(verdicts.map((v) => v.objet_note.id))),
    // D74 (19) : le run que remplace une réexécution est lu parmi ses voisins de `runs/`.
    constatInterrogationDansLaFenetre(vue, reponses, () => lireRunsDuDepot(dirname(repertoire_run))),
    constatRobustesseCalculee(metriques === null ? null : metriques.robustesse),
  ];
  return {
    go_no_go,
    kappas,
    indeterminees,
    non_classees,
    // Le champ publié ne compte que les Q-ATT indécidables ; un renvoi de juge défaillant (§7, 0.27) a son propre motif.
    renvois: renvois.filter((r) => r.contexte === "run" && r.motif === "attribution_indecidable").length,
    refus_api,
    accord_humains: accordHumainsEchantillon(echantillon, notations),
    checklist: construireChecklist(run.id, go_no_go.criteres, constats),
    par_mode: parModeDuRun(vue.perimetre.outils, reponses, plan),
  };
}

/* ------------------------------------------------------------------ run.json */

function jugeAvecKappa(juge: Objet, kappas: readonly KappaDeJuge[]): Objet {
  const kappa = kappas.find((k) => k.juge_id === juge["juge_id"]);
  if (kappa === undefined) return juge;
  // D31 (2) : le nombre de réponses écartées de ce kappa par les renvois du juge, 0 compris.
  const ecartes = { renvois_ecartes_kappa_echantillon: kappa.renvois_ecartes };
  if (kappa.kappa === null) return { ...juge, motif_indefini_kappa_echantillon_humain: kappa.motif_indefini, ...ecartes };
  return { ...juge, kappa_echantillon_humain: kappa.kappa, ...ecartes };
}

/** D55 (7) : le `par_mode` recalculé pour cet outil, ou l'outil tel quel s'il n'en a pas (comparateur, exclu). */
function outilAvecParMode(outil: Objet, par_mode: ReadonlyMap<IdentifiantCourt, ParMode>): Objet {
  const calcule = par_mode.get(outil["outil_id"] as IdentifiantCourt);
  return calcule === undefined ? outil : { ...outil, par_mode: calcule };
}

function outilsDe(run: Objet): readonly Objet[] | null {
  const perimetre = run["perimetre"];
  if (typeof perimetre !== "object" || perimetre === null) return null;
  const outils = (perimetre as Objet)["outils"];
  return Array.isArray(outils) ? (outils as Objet[]) : null;
}

function fusionner(brut: Objet, calcul: Calcul): Objet {
  const juges = brut["juges"];
  if (!Array.isArray(juges)) throw new GoNoGoRefuse("run.json sans tableau juges.");
  const perimetre = brut["perimetre"];
  const outils = outilsDe(brut);
  if (typeof perimetre !== "object" || perimetre === null || outils === null) {
    throw new GoNoGoRefuse("run.json sans tableau perimetre.outils.");
  }
  const motif = calcul.go_no_go.motif;
  return {
    ...brut,
    juges: juges.map((juge: Objet) => jugeAvecKappa(juge, calcul.kappas)),
    perimetre: { ...(perimetre as Objet), outils: outils.map((outil) => outilAvecParMode(outil, calcul.par_mode)) },
    ...(motif === undefined ? {} : { motif_provisoire: motif }),
    indeterminees_echantillon_humain: calcul.indeterminees,
    non_classees_echantillon_humain: calcul.non_classees,
    renvois_attribution_indecidable: calcul.renvois,
    refus_api_echantillon_humain: calcul.refus_api,
    accord_humains_echantillon: accordPublie(calcul.accord_humains),
    go_no_go: calcul.go_no_go,
  };
}

/**
 * Ce que la commande écrit dans `run.json`, et rien d'autre : la base de la comparaison au recalcul.
 * La liste de ces champs vit avec les autres champs écrits après le gel
 * (`analysis/champs-posterieurs-au-gel.ts:CHAMPS_DU_GO_NO_GO`).
 */
function partEcrite(run: Objet): string {
  return canoniser(partDesChamps(run, CHAMPS_DU_GO_NO_GO));
}

function issueRun(chemin: string, actuel: Objet, fusionne: Objet): IssueEcriture | null {
  const ecrite = partEcrite(actuel);
  if (ecrite === partEcrite(retirerChamps(actuel, CHAMPS_DU_GO_NO_GO))) return null;
  if (ecrite === partEcrite(fusionne)) return "inchange";
  throw new GoNoGoDivergent(chemin, "un go/no-go, un kappa d'échantillon, un accord des humains ou un motif provisoire");
}

/* ------------------------------------------------------------------ checklist.json */

function issueChecklist(chemin: string, nouvelle: Checklist): IssueEcriture | null {
  if (!existsSync(chemin)) return null;
  const existante = valider<Checklist>("checklist", lireJson(chemin), chemin);
  if (canoniser(partDuPipeline(existante)) === canoniser(nouvelle)) return "inchange";
  throw new GoNoGoDivergent(chemin, "une checklist dont la part calculée est");
}

/* ------------------------------------------------------------------ commande */

export function goNoGo(repertoire_run: string): ResultatGoNoGo {
  const chemin_run = dispositionRunNote(repertoire_run).run_json;
  const texte_lu = readFileSync(chemin_run, "utf8");
  const run = lireRunJson(repertoire_run);
  const brut = valider<Objet>("run", lireJson(chemin_run), chemin_run);
  const vue = valider<VueGoNoGo>("run", brut, chemin_run);
  refuser(vue);
  const calcul = calculer(repertoire_run, run, vue);
  const fusionne = valider<Objet>("run", fusionner(brut, calcul), `${chemin_run} après go/no-go`);
  const checklist = valider<Checklist>("checklist", calcul.checklist, "checklist.json avant écriture");
  const chemin_checklist = cheminChecklist(repertoire_run);
  const issue_run = issueRun(chemin_run, brut, fusionne);
  const issue_checklist = issueChecklist(chemin_checklist, checklist);
  if (issue_run === null) ecrireRunSiInchange(chemin_run, fusionne, texte_lu);
  if (issue_checklist === null) ecrireParRenommage(chemin_checklist, checklist);
  return {
    ...calcul,
    run_json: issue_run === null ? "ecrit" : issue_run,
    checklist_json: issue_checklist === null ? "ecrit" : issue_checklist,
  };
}
