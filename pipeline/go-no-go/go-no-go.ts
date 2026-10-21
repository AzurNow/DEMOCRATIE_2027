/**
 * `pnpm go-no-go <repertoire_run>` : les sept critères du §12 calculés depuis les fichiers du run,
 * la décision qui en découle (D24), le kappa de l'échantillon humain de chaque juge retenu, et la
 * checklist de l'annexe F.
 *
 * Ce qui est lu : `run.json`, `volume/reponses/`, `volume/notations/` (et les réponses
 * contrefactuelles, validées au passage), `verdicts/`, `tirage.json` s'il est présent, et
 * l'existence de `metriques/`. Chaque fichier est validé contre son schéma (`analysis/lecture-run.ts`).
 *
 * Ce qui est écrit : dans `run.json`, `go_no_go`, `kappa_echantillon_humain` ou
 * `motif_indefini_kappa_echantillon_humain` de chaque juge retenu, `motif_provisoire` quand la
 * décision est provisoire, et `perimetre.outils[].par_mode` de chaque assistant inclus (D55 (7),
 * `analysis/seuils.ts:parModeDuRun`, seul calcul de ce champ) ; `checklist.json`, sans contreseing.
 * `statut` n'est JAMAIS touché : le gel et la publication ne sont pas l'affaire de cette commande.
 *
 * Refus, avant toute écriture : symétrie rouge (le run est invalide ou ne part pas, et ne porte
 * aucun go/no-go), run `invalide`, run qui porte une `invalidation` (D51 (2) : enregistrée par
 * `pnpm run:invalider` ou par la notation en D16 (3), statut encore `planifie` ou `en_cours`), run
 * `planifie`. Un `run.json` qui porte déjà un go/no-go (ou un
 * kappa d'échantillon, un motif provisoire, ou un `par_mode`) différent du recalcul, ou une checklist
 * dont la part calculée diffère, lève : jamais d'écrasement silencieux. Identique : rien n'est
 * réécrit, et l'issue le dit. `run.json` et `checklist.json` sont validés contre leur schéma avant
 * d'être écrits.
 *
 * `metriques/` n'a encore aucun écrivain ni aucun format (`runs/README.md`) : absent, le critère
 * des analyses est rouge ; présent, la commande s'arrête plutôt que d'inventer sa lecture.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { estDuRun } from "../../analysis/filtre.ts";
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
import type { GraineTirage, Symetrie } from "../questions/types.ts";
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
import { critereKappaJugesHumains, critereTestContrefactuel } from "./criteres-juges.ts";
import {
  critereAnalysesExecutees,
  critereAucunItemConteste,
  critereErreursGravesRevues,
  critereReponsesManquantes,
  critereTestsSymetrie,
  type GraineDeResultat,
  type OutilDeclare,
} from "./criteres-run.ts";
import { deciderPublication } from "./decision.ts";
import { cheminChecklist, ecrireParRenommage, lireJson } from "./fichiers.ts";
import { kappasEchantillon, type KappaDeJuge } from "./kappa-echantillon.ts";
import type { GoNoGo } from "./types.ts";

/** La part de `run.json` que lit le go/no-go, en plus de `RunLu`. */
interface VueGoNoGo {
  readonly statut: string;
  readonly invalidation?: { readonly motif: string };
  readonly fenetre: { readonly debut: string; readonly fin: string };
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

export class FormatMetriquesNonDefini extends Error {
  constructor(chemin: string) {
    super(
      `${chemin} existe, mais aucun format de fichier de métriques n'est défini (runs/README.md) : le critère ` +
        `« analyses préenregistrées exécutées avec la graine publiée » ne sait pas le lire. Rien n'est écrit.`,
    );
    this.name = "FormatMetriquesNonDefini";
  }
}

export type IssueEcriture = "ecrit" | "inchange";

export interface ResultatGoNoGo {
  readonly go_no_go: GoNoGo;
  readonly kappas: readonly KappaDeJuge[];
  readonly indeterminees: number;
  readonly refus_api: number;
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
  /** D30 (2) : renvois de juge vers l'humain pour une Q-ATT indécidable, contexte run. */
  readonly renvois: number;
  /** D32 : refus de l'API de l'échantillon, notés par règle, écartés du kappa de chaque juge. */
  readonly refus_api: number;
  readonly checklist: Checklist;
  /** D55 (7) : `par_mode` de chaque assistant inclus, par `outil_id` (`analysis/seuils.ts:parModeDuRun`). */
  readonly par_mode: ReadonlyMap<IdentifiantCourt, ParMode>;
}

/* ------------------------------------------------------------------ refus */

function refuser(vue: VueGoNoGo): void {
  if (vue.symetrie.statut_global === "rouge") {
    throw new GoNoGoRefuse("symétrie rouge (§5, §12) : le run est invalide ou ne part pas, et un run invalide ne porte aucune décision de publication.");
  }
  if (vue.statut === "invalide") throw new GoNoGoRefuse("run invalide (§12) : il ne porte aucune décision de publication.");
  if (vue.invalidation !== undefined) {
    throw new GoNoGoRefuse(`run invalidé (« ${vue.invalidation.motif} », D51 (2)) : il sera publié invalide, sans décision de publication (§12).`);
  }
  if (vue.statut === "planifie") throw new GoNoGoRefuse("run planifié : il n'a été ni interrogé ni noté.");
}

/* ------------------------------------------------------------------ calcul */

/** `metriques/` : absent, aucun résultat (`null`) ; présent, un format que rien ne définit encore. */
function resultatsDAnalyse(repertoire_run: string): readonly GraineDeResultat[] | null {
  const chemin = join(repertoire_run, "metriques");
  if (existsSync(chemin)) throw new FormatMetriquesNonDefini(chemin);
  return null;
}

function graineDuFichierTirage(repertoire_run: string, run: RunLu): GraineTirage | undefined {
  if (!existsSync(cheminDuTirage(repertoire_run, run))) return undefined;
  return lireTirage(repertoire_run, run).graine_tirage;
}

function calculer(repertoire_run: string, run: RunLu, vue: VueGoNoGo): Calcul {
  const reponses = lireReponses<Reponse & DemarragesDeReponse>(repertoire_run, run.id);
  const { notations, renvois } = lireNotationsDuRun(repertoire_run, run.id);
  const verdicts = lireVerdicts(repertoire_run, run.id);
  const obtenues = reponses.filter((r) => estDuRun(r) && r.statut_reponse === "obtenue").map((r) => r.id);
  const echantillon = tirerEchantillonHumain(obtenues, run.graines.echantillon_humain, run.taux_echantillon_humain);
  const { kappas, indeterminees, refus_api } = kappasEchantillon({ juges: run.juges, echantillon, notations, renvois });
  const go_no_go = deciderPublication([
    critereKappaJugesHumains(kappas),
    critereTestContrefactuel(run.juges),
    critereAucunItemConteste(vue.symetrie),
    critereTestsSymetrie(vue.symetrie),
    critereReponsesManquantes(vue.perimetre.outils, reponses),
    critereErreursGravesRevues({ juges: run.juges, reponses_obtenues: obtenues, notations, verdicts }),
    critereAnalysesExecutees(resultatsDAnalyse(repertoire_run), { bootstrap: vue.graines.bootstrap.valeur, permutation: vue.graines.permutation.valeur }),
  ]);
  const constats = [
    constatItemsAbsenceReverifies(),
    constatGraineDuTirage(vue.graines.tirage, graineDuFichierTirage(repertoire_run, run)),
    constatNotationComplete(obtenues, new Set<Ulid>(verdicts.map((v) => v.objet_note.id))),
    constatInterrogationDansLaFenetre(vue.fenetre, reponses),
    constatRobustesseCalculee(),
  ];
  return {
    go_no_go,
    kappas,
    indeterminees,
    renvois: renvois.filter((r) => r.contexte === "run").length,
    refus_api,
    checklist: construireChecklist(run.id, go_no_go.criteres, constats),
    par_mode: parModeDuRun(vue.perimetre.outils, reponses),
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
    renvois_attribution_indecidable: calcul.renvois,
    refus_api_echantillon_humain: calcul.refus_api,
    go_no_go: calcul.go_no_go,
  };
}

/** Ce que la commande écrit dans `run.json`, et rien d'autre : la base de la comparaison au recalcul. */
function partEcrite(run: Objet): string {
  const juges = run["juges"];
  const outils = outilsDe(run);
  return canoniser({
    go_no_go: run["go_no_go"],
    motif_provisoire: run["motif_provisoire"],
    indeterminees_echantillon_humain: run["indeterminees_echantillon_humain"],
    renvois_attribution_indecidable: run["renvois_attribution_indecidable"],
    refus_api_echantillon_humain: run["refus_api_echantillon_humain"],
    juges: Array.isArray(juges)
      ? juges.map((juge: Objet) => [juge["kappa_echantillon_humain"], juge["motif_indefini_kappa_echantillon_humain"], juge["renvois_ecartes_kappa_echantillon"]])
      : null,
    outils: outils === null ? null : outils.map((outil) => outil["par_mode"]),
  });
}

function partVide(run: Objet): string {
  const juges = run["juges"];
  const outils = outilsDe(run);
  return canoniser({
    juges: Array.isArray(juges) ? juges.map(() => [undefined, undefined, undefined]) : null,
    outils: outils === null ? null : outils.map(() => undefined),
  });
}

function issueRun(chemin: string, actuel: Objet, fusionne: Objet): IssueEcriture | null {
  const ecrite = partEcrite(actuel);
  if (ecrite === partVide(actuel)) return null;
  if (ecrite === partEcrite(fusionne)) return "inchange";
  throw new GoNoGoDivergent(chemin, "un go/no-go, un kappa d'échantillon ou un motif provisoire");
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
  const run = lireRunJson(repertoire_run);
  const chemin_run = dispositionRunNote(repertoire_run).run_json;
  const brut = valider<Objet>("run", lireJson(chemin_run), chemin_run);
  const vue = valider<VueGoNoGo>("run", brut, chemin_run);
  refuser(vue);
  const calcul = calculer(repertoire_run, run, vue);
  const fusionne = valider<Objet>("run", fusionner(brut, calcul), `${chemin_run} après go/no-go`);
  const checklist = valider<Checklist>("checklist", calcul.checklist, "checklist.json avant écriture");
  const chemin_checklist = cheminChecklist(repertoire_run);
  const issue_run = issueRun(chemin_run, brut, fusionne);
  const issue_checklist = issueChecklist(chemin_checklist, checklist);
  if (issue_run === null) ecrireParRenommage(chemin_run, fusionne);
  if (issue_checklist === null) ecrireParRenommage(chemin_checklist, checklist);
  return {
    ...calcul,
    run_json: issue_run === null ? "ecrit" : issue_run,
    checklist_json: issue_checklist === null ? "ecrit" : issue_checklist,
  };
}
