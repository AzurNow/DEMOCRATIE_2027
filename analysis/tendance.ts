/**
 * Tendance (§8, QR7/H5).
 *
 * « Comparaison du premier et du dernier run par outil et par mode, sur le seul canal API, sur les
 * questions communes aux deux runs, avec intervalle par bootstrap. […] Toute autre analyse
 * temporelle est exploratoire. » (0.9)
 *
 * Une question est commune quand son identifiant ET l'empreinte de ses trois formulations sont
 * identiques dans les deux runs (schema/question.schema.json : « même identifiant ET même
 * empreinte : une correction d'item qui change le texte casse la reprise explicitement au lieu
 * de faire passer une mesure d'amélioration pour une mesure de notre propre correction »).
 *
 * La différence est orientée dernier − premier : un chiffre positif dit que le taux a monté
 * entre les deux runs, et rien d'autre. Ni « meilleur », ni « pire » (§8).
 *
 * **Appariement par question** (décision de l'auteur du 2026-10-02, conformité n° 21, texte en
 * 0.15). Pour un couple outil × mode, une question commune dont l'outil n'a de réponse obtenue
 * qu'à l'un des deux runs sort de la comparaison, comme l'item absent d'un bras sort d'un effet de
 * condition : même fonction, `appariement.ts:apparier`, sur `question_id`. Elle est nommée dans
 * `questions_exclues`, et `questions_communes` compte les seules questions sur lesquelles porte la
 * différence. Le bootstrap reste en grappes (l'item) : après appariement, chaque grappe tirée
 * porte des questions présentes aux deux runs.
 */

import { apparier } from "./appariement.ts";
import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { cleCouple, etatDesCouples, type EtatCouple, type PartageCouples } from "./seuils.ts";
import type { IdentifiantCourt, Mode, Question } from "./types.ts";
import { questionsAuTexteChange, signatureQuestion } from "../pipeline/questions/signature.ts";

export interface EtatRun {
  readonly unites: readonly UniteAnalyse[];
  readonly questions: readonly Question[];
  /** Le partage du seuil de 20 % de CE run, par `couplesComparables(reponses, plan)` (`seuils.ts`). */
  readonly couples: PartageCouples;
}

export interface TendanceOutilEtMode {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
  /**
   * Effectif de la différence : questions communes aux deux runs (§8) dont l'outil a une réponse
   * obtenue dans ce mode aux deux runs (conformité n° 21).
   */
  readonly questions_communes: number;
  /**
   * Questions communes aux deux runs dont l'outil n'a de réponse obtenue dans ce mode qu'à l'un
   * des deux : sorties de la comparaison, nommées, jamais complétées (conformité n° 21).
   */
  readonly questions_exclues: readonly string[];
  /** Dernier run moins premier run, sur les seules questions appariées. */
  readonly difference: DifferenceTaux;
}

/**
 * Un couple que la tendance ne compare pas parce qu'il est « run incomplet » à l'un des deux runs
 * au moins (§8 ; conformité 2026-09-29, n° 12). Le protocole ne dit pas lequel des deux runs
 * compte : un couple incomplet à l'un ou à l'autre sort, et les deux drapeaux disent où.
 */
export interface CoupleExcluDeLaTendance {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
  readonly incomplet_au_premier: boolean;
  readonly incomplet_au_dernier: boolean;
}

export interface TendanceParCouple {
  readonly par_outil_et_mode: readonly TendanceOutilEtMode[];
  readonly couples_exclus: readonly CoupleExcluDeLaTendance[];
}

export function questionsCommunes(
  premier: readonly Question[],
  dernier: readonly Question[],
): Set<string> {
  const signaturesDernier = new Set(dernier.map(signatureQuestion));
  const communes = new Set<string>();
  for (const question of premier) {
    if (signaturesDernier.has(signatureQuestion(question))) communes.add(question.id);
  }
  return communes;
}

/**
 * Une ligne par couple (outil, mode) rencontré dans l'un des deux runs, sur le seul canal API :
 * le canal application est exploratoire (QR8) et n'a pas de mode (§6). Un couple présent à un
 * seul run garde sa ligne, sans différence ni qualificatif — jamais une valeur plausible. Un
 * couple « run incomplet » à l'un des deux runs n'a pas de ligne : il est rendu dans
 * `couples_exclus` (§8, conformité 2026-09-29, n° 12).
 */
export function tendanceParOutilEtMode(
  premier: EtatRun,
  dernier: EtatRun,
  statistique: Statistique,
  options: OptionsBootstrap,
): TendanceParCouple {
  const etatPremier = etatDuRun(premier);
  const etatDernier = etatDuRun(dernier);
  const communes = questionsCommunes(premier.questions, dernier.questions);
  const unitesPremier = unitesComparables(premier.unites, communes);
  const unitesDernier = unitesComparables(dernier.unites, communes);
  const par_outil_et_mode: TendanceOutilEtMode[] = [];
  const couples_exclus: CoupleExcluDeLaTendance[] = [];
  for (const { outil_id, mode } of cellules([...unitesPremier, ...unitesDernier])) {
    const incomplet_au_premier = etatPremier({ outil_id, mode }) === "incomplet";
    const incomplet_au_dernier = etatDernier({ outil_id, mode }) === "incomplet";
    if (incomplet_au_premier || incomplet_au_dernier) {
      couples_exclus.push({ outil_id, mode, incomplet_au_premier, incomplet_au_dernier });
      continue;
    }
    const avant = unitesPremier.filter((u) => u.outil_id === outil_id && u.mode === mode);
    const apres = unitesDernier.filter((u) => u.outil_id === outil_id && u.mode === mode);
    // Premier run en bras A : les questions exclues sont nommées celles du premier run d'abord.
    const appariement = apparier(avant, apres, (u) => u.question_id);
    par_outil_et_mode.push({
      outil_id,
      mode,
      questions_communes: appariement.communes.length,
      questions_exclues: appariement.exclues,
      // Graine propre au couple (`graines.ts`) : la clé de l'appelant, suivie de l'outil puis du mode.
      difference: differenceAppariee(appariement.b, appariement.a, statistique, {
        ...options,
        cle: [...options.cle, outil_id, mode],
      }),
    });
  }
  return { par_outil_et_mode, couples_exclus };
}

/**
 * La tendance d'un run : les lignes par outil et mode, et le nombre, publié au niveau du run, des
 * questions sorties de la comparaison parce qu'un de leurs textes a changé (§8, protocole 0.9).
 */
export interface TendanceDuRun extends TendanceParCouple {
  readonly questions_texte_change: number;
}

export function tendanceDuRun(
  premier: EtatRun,
  dernier: EtatRun,
  statistique: Statistique,
  options: OptionsBootstrap,
): TendanceDuRun {
  return {
    questions_texte_change: questionsAuTexteChange(premier.questions, dernier.questions).length,
    ...tendanceParOutilEtMode(premier, dernier, statistique, options),
  };
}

interface Cellule {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
}

/**
 * L'état d'un couple dans un run. Toute unité API du run, commune ou non, doit avoir son couple au
 * partage. Un couple sans aucune unité dans ce run (outil absent de ce run) n'y est pas : il n'est
 * ni comparé ni incomplet, et garde sa ligne sans différence, comme avant.
 */
function etatDuRun(run: EtatRun): (couple: Cellule) => EtatCouple | "absent" {
  const etat = etatDesCouples(run.couples);
  const presents = new Set<string>();
  for (const unite of run.unites) {
    if (unite.canal !== "api") continue;
    const couple = { outil_id: unite.outil_id, mode: modeExige(unite) };
    etat(couple);
    presents.add(cleCouple(couple));
  }
  return (couple) => (presents.has(cleCouple(couple)) ? etat(couple) : etatSiConnu(run.couples, couple));
}

/** Un couple sans unité dans le run : incomplet s'il est au partage comme tel, absent sinon. */
function etatSiConnu(couples: PartageCouples, couple: Cellule): EtatCouple | "absent" {
  return couples.incomplets.some((c) => cleCouple(c) === cleCouple(couple)) ? "incomplet" : "absent";
}

/** Unités du canal API portant sur une question commune. */
function unitesComparables(unites: readonly UniteAnalyse[], communes: ReadonlySet<string>): UniteAnalyse[] {
  return unites.filter((u) => u.canal === "api" && communes.has(u.question_id));
}

/** Couples (outil, mode) dans l'ordre de première apparition. */
function cellules(unites: readonly UniteAnalyse[]): Cellule[] {
  const vues = new Map<string, Cellule>();
  for (const unite of unites) {
    const mode = modeExige(unite);
    const cle = `${unite.outil_id}\0${mode}`;
    if (!vues.has(cle)) vues.set(cle, { outil_id: unite.outil_id, mode });
  }
  return [...vues.values()];
}

/** §6 : le mode est obligatoire au canal api. Son absence est une donnée corrompue, pas un mode. */
function modeExige(unite: UniteAnalyse): Mode {
  if (unite.mode === null) {
    throw new Error(`Réponse ${unite.reponse_id} du canal api sans mode (§6) : tendance incalculable.`);
  }
  return unite.mode;
}

