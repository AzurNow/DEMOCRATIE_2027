/**
 * Écart API / application (§6, QR8, exploratoire ; D59 (6), protocole 0.24).
 *
 * §6 : « L'écart est rapporté avec ses intervalles de confiance et l'étiquette « exploratoire »,
 * l'effectif étant faible : c'est la différence d'exactitude entre l'API, dans le mode de tête de
 * l'outil (section 8), et l'application, appariée par question sur les questions du
 * sous-échantillon, dont la graine dérive de la clé `<outil>:api-application` (section 8). »
 *
 * Ce que le module fait, et rien d'autre :
 *
 * - **Le mode de tête est lu** (`run.perimetre.outils[].mode_de_tete`), jamais choisi d'après les
 *   chiffres : deux modes d'exactitude égale ne se départagent pas ici. Un outil qui a des réponses
 *   de l'application sans mode de tête déclaré lève `ModeDeTeteAbsent`.
 * - **Le bras API** est l'ensemble des unités du canal API de l'outil, dans le mode de tête, sur
 *   les questions du sous-échantillon (toutes leurs formulations et tous leurs échantillons : le §6
 *   ne restreint que le mode et les questions). **Le bras application** est l'ensemble des unités du
 *   canal application de l'outil, les deux testeurs confondus. Une réponse de l'application hors du
 *   sous-échantillon lève `ApplicationHorsSousEchantillon` : elle n'a pas été tirée.
 * - **Appariement par question** (`appariement.ts:apparier`, sur `question_id`) : une question du
 *   sous-échantillon présente dans un seul bras — réponse API manquante, ou aucune saisie de
 *   l'application — sort de la comparaison et est nommée dans `questions_exclues`. Le bootstrap
 *   reste en grappes (l'item, ou la mesure d'une question d'attribution : §8, « Incertitude »).
 * - **La différence** est API moins application, sur l'exactitude (`metriques.ts:exactitude`, seule
 *   définition), par `bootstrap.ts:differenceAppariee`. Sa clé est celle du §8 : la famille, la
 *   métrique et la strate (`exactitude`, `global`), puis le composant `<outil>:api-application`.
 * - Un couple de tête marqué « run incomplet » (§8, seuil de 20 %) est exclu des comparaisons de
 *   ce run : l'outil est nommé dans `outils_exclus`, sans chiffre.
 *
 * Chaque ligne porte `exploratoire: true` : un lecteur ne peut pas la prendre pour une métrique
 * primaire (§8 : « tout autre chiffre porte l'étiquette « exploratoire » »).
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import { apparier } from "./appariement.ts";
import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap } from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { exactitude } from "./metriques.ts";
import { etatDesCouples, type PartageCouples } from "./seuils.ts";
import type { IdentifiantCourt, Mode, OutilAuGel } from "./types.ts";

/** §8 : le composant de clé de l'écart API / application, précédé de l'identifiant de l'outil. */
export const COMPOSANT_ECART = "api-application";

/** §8 : la métrique et la strate de la clé. D59 (6) : l'exactitude, sur l'ensemble des réponses. */
const METRIQUE = "exactitude";
const STRATE = "global";

export interface EntreesEcart {
  /** Les unités du run, des deux canaux (`filtre.ts:assembler`). */
  readonly unites: readonly UniteAnalyse[];
  /** `run.perimetre.outils` : le mode de tête y est lu. */
  readonly outils: readonly Pick<OutilAuGel, "outil_id" | "mode_de_tete">[];
  /** Le partage du seuil de 20 % du run (`seuils.ts:couplesComparables`). */
  readonly couples: PartageCouples;
  /** Les questions du sous-échantillon de l'application (`pipeline/application/sous-echantillon.ts`). */
  readonly questions_sous_echantillon: readonly string[];
}

/** Le bootstrap de l'écart : la clé est fixée ici, pas par l'appelant. */
export type OptionsEcart = Omit<OptionsBootstrap, "cle">;

export interface EcartApiApplication {
  readonly outil_id: IdentifiantCourt;
  readonly mode_de_tete: Mode;
  readonly exploratoire: true;
  /** Questions du sous-échantillon présentes dans les deux bras : l'effectif de la différence. */
  readonly questions_appariees: number;
  /** Questions du sous-échantillon présentes dans un seul bras : nommées, jamais complétées. */
  readonly questions_exclues: readonly string[];
  /** API (bras A) moins application (bras B). */
  readonly difference: DifferenceTaux;
}

export interface OutilExcluDeLEcart {
  readonly outil_id: IdentifiantCourt;
  readonly mode_de_tete: Mode;
  readonly motif: "run_incomplet";
}

export interface EcartsApiApplication {
  /** Une ligne par outil qui a des réponses de l'application, triée par identifiant. */
  readonly par_outil: readonly EcartApiApplication[];
  readonly outils_exclus: readonly OutilExcluDeLEcart[];
}

/** Un outil testé dans l'application dont le périmètre ne déclare pas le mode de tête. */
export class ModeDeTeteAbsent extends Error {
  constructor(outil_id: string) {
    super(
      `Outil ${outil_id} : réponses de l'application sans mode de tête déclaré au périmètre du run ` +
        `(§8, « Mode de tête ») ; l'écart API / application ne choisit aucun mode à sa place.`,
    );
    this.name = "ModeDeTeteAbsent";
  }
}

/** Une réponse de l'application sur une question que le sous-échantillon ne contient pas. */
export class ApplicationHorsSousEchantillon extends Error {
  readonly reponses: readonly string[];

  constructor(reponses: readonly string[]) {
    super(
      `${reponses.length} réponse(s) du canal application hors du sous-échantillon du run (§6) : ` +
        `${reponses.join(", ")}.`,
    );
    this.name = "ApplicationHorsSousEchantillon";
    this.reponses = reponses;
  }
}

export function ecartsApiApplication(entrees: EntreesEcart, options: OptionsEcart): EcartsApiApplication {
  const sousEchantillon = new Set(entrees.questions_sous_echantillon);
  const applications = entrees.unites.filter((u) => u.canal === "application");
  exigerDansSousEchantillon(applications, sousEchantillon);
  const etat = etatDesCouples(entrees.couples);
  const par_outil: EcartApiApplication[] = [];
  const outils_exclus: OutilExcluDeLEcart[] = [];
  for (const outil_id of outilsDeLApplication(applications)) {
    const mode_de_tete = modeDeTete(entrees.outils, outil_id);
    if (etat({ outil_id, mode: mode_de_tete }) === "incomplet") {
      outils_exclus.push({ outil_id, mode_de_tete, motif: "run_incomplet" });
      continue;
    }
    const bras_api = entrees.unites.filter(
      (u) => u.canal === "api" && u.outil_id === outil_id && u.mode === mode_de_tete && sousEchantillon.has(u.question_id),
    );
    const bras_application = applications.filter((u) => u.outil_id === outil_id);
    par_outil.push(ecartDeLOutil(outil_id, mode_de_tete, bras_api, bras_application, options));
  }
  return { par_outil, outils_exclus };
}

function ecartDeLOutil(
  outil_id: IdentifiantCourt,
  mode_de_tete: Mode,
  bras_api: readonly UniteAnalyse[],
  bras_application: readonly UniteAnalyse[],
  options: OptionsEcart,
): EcartApiApplication {
  const appariement = apparier(bras_api, bras_application, (u) => u.question_id);
  const cle = [METRIQUE, STRATE, `${outil_id}:${COMPOSANT_ECART}`];
  return {
    outil_id,
    mode_de_tete,
    exploratoire: true,
    questions_appariees: appariement.communes.length,
    questions_exclues: appariement.exclues,
    difference: differenceAppariee(appariement.a, appariement.b, exactitude, { ...options, cle }),
  };
}

function exigerDansSousEchantillon(applications: readonly UniteAnalyse[], sousEchantillon: ReadonlySet<string>): void {
  const hors = applications.filter((u) => !sousEchantillon.has(u.question_id)).map((u) => u.reponse_id);
  if (hors.length > 0) throw new ApplicationHorsSousEchantillon(hors);
}

function outilsDeLApplication(applications: readonly UniteAnalyse[]): readonly IdentifiantCourt[] {
  return [...new Set(applications.map((u) => u.outil_id))].sort(comparerChaines);
}

function modeDeTete(outils: EntreesEcart["outils"], outil_id: IdentifiantCourt): Mode {
  const mode = outils.find((outil) => outil.outil_id === outil_id)?.mode_de_tete;
  if (mode === undefined) throw new ModeDeTeteAbsent(outil_id);
  return mode;
}
