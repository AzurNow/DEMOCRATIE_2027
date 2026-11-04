/**
 * Le sous-échantillon de l'application grand public (§6, QR8, exploratoire ; D59 (12), protocole 0.24).
 *
 * §6 : « deux testeurs saisissent à la main un sous-échantillon stratifié des questions du run, cinq
 * par candidat interrogé (60 pour 12 candidats), toutes ses questions tirées pour un candidat
 * interrogé qui en a moins de cinq […]. Les cinq questions d'un candidat sont réparties entre ses gabarits en
 * tourniquet, gabarits et questions pris dans l'ordre trié de leurs codes et identifiants ; chacune
 * est saisie dans sa formulation neutre, en un seul échantillon, numéroté 1. Chacun des deux testeurs
 * saisit tout le sous-échantillon. »
 *
 * **Le run désigné** (§6, protocole 0.31, D73 (11)) : « le premier run mensuel ou hebdomadaire du
 * mois civil, compté en UTC, ni le run pilote ni un run supplémentaire, et il est désigné à son gel ».
 * Le gel l'inscrit dans `run.json#/application_testee` (`pipeline/gel/application.ts`) ; le
 * sous-échantillon n'est calculé que d'un run désigné, et un `run.json` sans le champ est refusé
 * (`ApplicationNonDesignee`), jamais supposé désigné. Les dépôts des testeurs
 * (`depot-application.ts:bilanDesDepots`) ne se contrôlent que contre ce sous-échantillon : ils
 * héritent de la garde.
 *
 * **Aucune graine.** Le §6 fixe l'ordre — codes de gabarit, puis identifiants de question, triés
 * (`outils/ordre-chaines.ts`) — et rien n'y est tiré : le sous-échantillon se calcule des seuls
 * fichiers gelés du run (`tirage.json`, `questions.json`, `run.json#/perimetre/candidats`), et
 * quiconque les relit le retrouve. L'identifiant de question étant une empreinte, l'ordre trié mêle
 * les thèmes sans tirage. La graine dérivée de la clé `<outil>:api-application` est celle de
 * l'intervalle de l'écart (`analysis/ecart-api-application.ts`), pas celle de ce choix.
 *
 * **Le tourniquet.** Les questions tirées d'un candidat sont rangées en une file par gabarit ; on
 * prend la première question de chaque file, dans l'ordre des gabarits, puis la deuxième, et ainsi
 * de suite, en sautant une file épuisée, jusqu'à cinq. Un candidat qui a moins de cinq gabarits voit
 * le tourniquet repartir du premier.
 *
 * **Symétrie (§5).** Le calcul ne lit du candidat que son identifiant, pour regrouper ses questions,
 * et le fait qu'il soit interrogé (`analysis/candidats-interroges.ts`, seule lecture du drapeau) :
 * ni son seuil de couverture, ni son statut, ni son nom n'y entrent.
 *
 * **Ce qui n'est pas décidé ici.** Les questions d'attribution ne nomment aucun candidat (§5) et ne
 * sont « cinq par candidat » d'aucun : elles n'y entrent pas.
 *
 * **Moins de cinq questions tirées** (§6, 0.27, D62) : le candidat interrogé prend toutes ses
 * questions tirées, dans l'ordre du tourniquet ; rien n'est complété. Un candidat interrogé sans
 * aucune question tirée garde son bloc, vide, pour que l'absence reste visible.
 */

import { candidatsInterroges, type PorteInterroge } from "../../analysis/candidats-interroges.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import type { ApplicationTestee } from "../gel/application.ts";
import type { CodeGabarit, Registre } from "../questions/types.ts";

/** §6 : « cinq par candidat interrogé ». */
export const QUESTIONS_PAR_CANDIDAT = 5;
/** §6 : « en un seul échantillon, numéroté 1 ». */
export const ECHANTILLON_APPLICATION = 1;
/** §6 : « Chacun des deux testeurs saisit tout le sous-échantillon. » */
export const TESTEURS_APPLICATION = 2;
/** §6 : « chacune est saisie dans sa formulation neutre ». */
export const REGISTRE_APPLICATION = "neutre" satisfies Registre;

/** Ce que le calcul lit des fichiers gelés du run, et rien de plus. */
export interface EntreesSousEchantillon {
  readonly run_id: string;
  /**
   * `run.json#/application_testee` (§6, D73 (11)) : seul le run désigné au gel a un sous-échantillon.
   * `undefined` : son `run.json` ne porte pas le champ, et le calcul refuse plutôt que de supposer.
   */
  readonly application_testee: ApplicationTestee | undefined;
  /** `run.json#/perimetre/candidats`. */
  readonly candidats: readonly PorteInterroge[];
  /** `tirage.json#/entrees` : les questions tirées. */
  readonly entrees: readonly { readonly question_id: string; readonly candidat_id?: string; readonly gabarit: CodeGabarit }[];
  /** `questions.json` : pour la formulation neutre de chaque question tirée. */
  readonly questions: readonly {
    readonly id: string;
    readonly formulations: readonly { readonly id: string; readonly registre: Registre }[];
  }[];
}

export interface QuestionApplication {
  readonly rang: number;
  readonly question_id: string;
  readonly gabarit: CodeGabarit;
  readonly formulation_id: string;
}

export interface SousEchantillonCandidat {
  readonly candidat_id: string;
  readonly questions: readonly QuestionApplication[];
}

/** `schema/sous-echantillon-application.schema.json`. */
export interface SousEchantillonApplication {
  readonly run_id: string;
  readonly questions_par_candidat: typeof QUESTIONS_PAR_CANDIDAT;
  readonly registre: typeof REGISTRE_APPLICATION;
  readonly echantillon: typeof ECHANTILLON_APPLICATION;
  readonly testeurs: typeof TESTEURS_APPLICATION;
  readonly candidats: readonly SousEchantillonCandidat[];
}

/** Une question tirée sans formulation neutre unique dans `questions.json`. */
export class FormulationNeutreIntrouvable extends Error {
  constructor(question_id: string, trouvees: number) {
    super(
      `Question ${question_id} : ${trouvees} formulation(s) neutre(s) dans questions.json, une seule attendue ` +
        `(§5, §6) ; aucune autre formulation n'est saisie à sa place.`,
    );
    this.name = "FormulationNeutreIntrouvable";
  }
}

export type MotifNonDesignee = "champ_absent" | "non_designe";

/** §6, D73 (11) : un sous-échantillon demandé pour un run que le gel n'a pas désigné, ou sans le dire. */
export class ApplicationNonDesignee extends Error {
  readonly motif: MotifNonDesignee;

  constructor(motif: MotifNonDesignee, run_id: string, detail: string) {
    super(
      `Run ${run_id} : aucun sous-échantillon de l'application (${motif}, §6, D73 (11)) : ${detail} ` +
        `Seul le premier run mensuel ou hebdomadaire du mois civil UTC, désigné à son gel, est saisi dans l'application.`,
    );
    this.name = "ApplicationNonDesignee";
    this.motif = motif;
  }
}

function raisonNonDesigne(application: Exclude<ApplicationTestee, { readonly designe: true }>): string {
  if (application.motif === "mois_deja_servi") return `le run ${application.premier_run_id} est celui de l'application du mois ${application.mois_utc}.`;
  return `son type de run n'est ni mensuel ni hebdomadaire (mois ${application.mois_utc}).`;
}

/**
 * Lève si le run n'est pas désigné pour l'application : champ absent de `run.json` (rien n'est
 * supposé), ou désignation négative. La valeur est validée contre son fragment de `run.schema.json`
 * (frontière d'entrée) avant d'être lue.
 */
export function exigerApplicationTestee(run_id: string, application_testee: ApplicationTestee | undefined): void {
  if (application_testee === undefined) {
    throw new ApplicationNonDesignee("champ_absent", run_id, "son run.json ne porte pas application_testee.");
  }
  const lue = validerFragment<ApplicationTestee>("run", "#/properties/application_testee", application_testee, `run ${run_id}, application_testee`);
  if (lue.designe) return;
  throw new ApplicationNonDesignee("non_designe", run_id, raisonNonDesigne(lue));
}

export function sousEchantillonApplication(entrees: EntreesSousEchantillon): SousEchantillonApplication {
  exigerApplicationTestee(entrees.run_id, entrees.application_testee);
  const formulations = formulationsNeutres(entrees.questions);
  const ids = candidatsInterroges(entrees.candidats).map((c) => c.candidat_id).sort(comparerChaines);
  const choix = ids.map((candidat_id) => ({ candidat_id, retenues: tourniquet(filesParGabarit(entrees.entrees, candidat_id)) }));
  const sortie: SousEchantillonApplication = {
    run_id: entrees.run_id,
    questions_par_candidat: QUESTIONS_PAR_CANDIDAT,
    registre: REGISTRE_APPLICATION,
    echantillon: ECHANTILLON_APPLICATION,
    testeurs: TESTEURS_APPLICATION,
    candidats: choix.map(({ candidat_id, retenues }) => ({
      candidat_id,
      questions: retenues.map((entree, i) => ({
        rang: i + 1,
        question_id: entree.question_id,
        gabarit: entree.gabarit,
        formulation_id: formulationNeutre(formulations, entree.question_id),
      })),
    })),
  };
  return valider<SousEchantillonApplication>("sous-echantillon-application", sortie, `sous-échantillon de l'application du run ${entrees.run_id}`);
}

type EntreeTiree = EntreesSousEchantillon["entrees"][number];

/** Les questions tirées du candidat, une file par gabarit ; files et questions triées. */
function filesParGabarit(entrees: readonly EntreeTiree[], candidat_id: string): readonly (readonly EntreeTiree[])[] {
  const files = new Map<CodeGabarit, EntreeTiree[]>();
  for (const entree of entrees) {
    if (entree.candidat_id !== candidat_id) continue;
    const file = files.get(entree.gabarit);
    if (file === undefined) files.set(entree.gabarit, [entree]);
    else file.push(entree);
  }
  return [...files]
    .sort(([a], [b]) => comparerChaines(a, b))
    .map(([, file]) => [...file].sort((a, b) => comparerChaines(a.question_id, b.question_id)));
}

/** Une question de chaque file à tour de rôle, une file épuisée sautée, jusqu'à cinq ou jusqu'à épuisement de toutes. */
function tourniquet(files: readonly (readonly EntreeTiree[])[]): readonly EntreeTiree[] {
  const retenues: EntreeTiree[] = [];
  const longueur = Math.max(0, ...files.map((file) => file.length));
  for (let tour = 0; tour < longueur; tour += 1) {
    for (const file of files) {
      const entree = file[tour];
      if (entree !== undefined && retenues.length < QUESTIONS_PAR_CANDIDAT) retenues.push(entree);
    }
  }
  return retenues;
}

function formulationsNeutres(questions: EntreesSousEchantillon["questions"]): ReadonlyMap<string, readonly string[]> {
  return new Map(
    questions.map((question) => [
      question.id,
      question.formulations.filter((f) => f.registre === REGISTRE_APPLICATION).map((f) => f.id),
    ]),
  );
}

function formulationNeutre(formulations: ReadonlyMap<string, readonly string[]>, question_id: string): string {
  const neutres = formulations.get(question_id);
  if (neutres === undefined) throw new Error(`Question tirée ${question_id} absente de questions.json : rien à saisir (§5, §6).`);
  const [unique] = neutres;
  if (neutres.length !== 1 || unique === undefined) throw new FormulationNeutreIntrouvable(question_id, neutres.length);
  return unique;
}

/**
 * Les questions du sous-échantillon d'un run lu, dans l'ordre des candidats puis du tourniquet :
 * l'entrée de l'écart API / application (`analysis/analyse-du-run.ts:SousEchantillonDuRun`), injectée
 * par `outils/analyze.ts` pour qu'`analysis/` n'importe pas ce module. Le calcul est celui des
 * testeurs, sur les mêmes fichiers gelés : rien n'est recopié ailleurs.
 */
export function questionsDuSousEchantillonDuRun(fichiers: {
  readonly run: {
    readonly id: string;
    /** Absent d'un `run.json` gelé avant D73 (11) : refusé par `sousEchantillonApplication`. */
    readonly application_testee?: ApplicationTestee;
    readonly perimetre: { readonly candidats: readonly PorteInterroge[] };
  };
  readonly entrees_tirage: EntreesSousEchantillon["entrees"];
  readonly questions: EntreesSousEchantillon["questions"];
}): readonly string[] {
  const sous = sousEchantillonApplication({
    run_id: fichiers.run.id,
    application_testee: fichiers.run.application_testee,
    candidats: fichiers.run.perimetre.candidats,
    entrees: fichiers.entrees_tirage,
    questions: fichiers.questions,
  });
  return sous.candidats.flatMap((c) => c.questions.map((q) => q.question_id));
}
