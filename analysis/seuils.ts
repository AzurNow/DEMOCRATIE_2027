/**
 * Seuils de non-publication du §8.
 *
 * Deux règles, deux sources différentes, et c'est voulu :
 *
 * - le seuil de couverture par candidat est **lu** dans `run.perimetre.candidats[].sous_seuil`,
 *   compté au gel et stocké (§4). Le recalculer ici ferait vivre le seuil à deux endroits ;
 * - la part de réponses manquantes par couple outil × mode est **calculée** ici, à partir des
 *   réponses du canal API du run (§8, protocole 0.11), parce que c'est la mesure elle-même.
 *   `run.perimetre.outils[].par_mode.<mode>.run_incomplet` est alors le report de ce calcul, jamais
 *   un second calcul : `parModeDuRun` l'assemble par outil, `pipeline/go-no-go/go-no-go.ts` l'écrit
 *   dans `run.json` (D55 (7)), `analysis/lecture-run.ts:lireRun` le recoupe à la lecture.
 *
 * Protocole 0.21 (D56 (2)) : la part est « comptée sur les requêtes que prévoit le plan
 * d'interrogation du run pour ce couple […], et non sur les réponses enregistrées ». Le plan
 * (`pipeline/interrogation/plan.ts:planifier`) est **reçu** en paramètre (`RequeteDuPlan`), construit
 * par l'appelant du pipeline (`pipeline/interrogation/plan-du-run.ts`) : `analysis/` n'importe rien de
 * `pipeline/` (CLAUDE.md, « Architecture » ; tenu par `eslint.config.js`). Une requête du plan sans réponse API enregistrée
 * de contexte run compte comme manquante ; une réponse enregistrée hors plan, ou deux pour une même
 * requête, lève (`ReponseHorsPlan`) ; un couple déclaré sans requête planifiée lève
 * (`CoupleSansRequetePlanifiee`). Le bilan d'interrogation (`pipeline/interrogation/bilan.ts`) lit la
 * même part, sur le même plan (`partReponsesManquantesDuPlan`) : aucune autre définition n'existe.
 */

import { filtrerContexteRun, type UniteAnalyse } from "./filtre.ts";
import {
  taux,
  type CoupleOutilMode,
  type IdentifiantCourt,
  type Mode,
  type OutilAuGel,
  type ParMode,
  type Reponse,
  type Run,
  type SeuilMode,
  type Taux,
} from "./types.ts";

export interface PartageCandidats {
  /** Candidats entrant dans les comparaisons inter-candidats. */
  readonly compares: readonly IdentifiantCourt[];
  /** §4 : « rapporté à part, mention couverture insuffisante ». Rapporté, jamais effacé. */
  readonly rapportes_a_part: readonly IdentifiantCourt[];
}

export function candidatsComparables(run: Run): PartageCandidats {
  const compares: IdentifiantCourt[] = [];
  const rapportes_a_part: IdentifiantCourt[] = [];
  for (const candidat of run.perimetre.candidats) {
    if (candidat.sous_seuil) rapportes_a_part.push(candidat.candidat_id);
    else compares.push(candidat.candidat_id);
  }
  return { compares, rapportes_a_part };
}

export interface RepartitionCandidats {
  /** Unités des seuls candidats comparés, dans l'ordre d'entrée. */
  readonly comparees: readonly UniteAnalyse[];
  /** Candidats sous le seuil présents dans les unités, dans l'ordre de première apparition. */
  readonly candidats_a_part: readonly IdentifiantCourt[];
}

/**
 * Seule porte des statistiques par candidat vers le seuil de couverture (conformité n° 30). Une
 * question d'attribution (`candidat_id` nul, §5) n'est d'aucun candidat : elle ne sort ni d'un
 * côté ni de l'autre. Un candidat inconnu du partage lève — le ranger d'un côté serait décider
 * de son seuil ici.
 */
export function repartirParCandidat(
  unites: readonly UniteAnalyse[],
  partage: PartageCandidats,
): RepartitionCandidats {
  const comparees: UniteAnalyse[] = [];
  const candidats_a_part: IdentifiantCourt[] = [];
  for (const unite of unites) {
    if (unite.candidat_id === null) continue;
    if (partage.compares.includes(unite.candidat_id)) comparees.push(unite);
    else if (partage.rapportes_a_part.includes(unite.candidat_id)) ajouterUnique(candidats_a_part, unite.candidat_id);
    else throw new Error(`Candidat ${unite.candidat_id} absent du partage du seuil de couverture (§4) : non classable.`);
  }
  return { comparees, candidats_a_part };
}

/**
 * Clé publiée d'un couple. « / » n'appartient pas à l'alphabet d'un identifiant court
 * (`commun.schema.json`), ni à celui d'un mode : deux couples distincts ne partagent pas une clé.
 */
export function cleCouple(couple: CoupleOutilMode): string {
  return `${couple.outil_id}/${couple.mode}`;
}

/**
 * §8 : « plus de 20 % », en fraction exacte (constat 16 de la revue du 2026-10-12). Forme entière,
 * cohérente avec le test de `runIncomplet` (`5 × manquantes > total`) : `numerateur / denominateur`
 * vaut exactement 0,2, publié tel quel par `pipeline/go-no-go/criteres-run.ts`.
 */
export const SEUIL_RUN_INCOMPLET = { numerateur: 1, denominateur: 5 } as const;

/**
 * §8 : « plus de 20 % ». Le test est entier — `5 × manquantes > total` — pour que l'égalité à un
 * cinquième soit décidée par l'arithmétique et non par la représentation flottante de 0,2.
 * Un couple sans aucune réponse API n'est pas « complet » : il n'est pas qualifiable, donc il lève.
 */
export function runIncomplet(part: Taux): boolean {
  if (part.denominateur === 0) {
    throw new Error("Couple outil × mode sans aucune réponse API dans le run : le seuil de 20 % n'est pas décidable.");
  }
  return part.numerateur * SEUIL_RUN_INCOMPLET.denominateur > SEUIL_RUN_INCOMPLET.numerateur * part.denominateur;
}

export interface PartageCouples {
  readonly compares: readonly CoupleOutilMode[];
  /**
   * §8 : « marqué run incomplet et exclu des comparaisons de ce run, l'autre mode de l'outil
   * restant publié s'il passe le seuil ».
   */
  readonly incomplets: readonly CoupleOutilMode[];
}

/** Le sort d'un couple au seuil de 20 % du §8, lu dans le partage du run. */
export type EtatCouple = "compare" | "incomplet";

/**
 * Seule porte des statistiques par couple outil × mode vers le seuil de réponses manquantes
 * (conformité 2026-09-29, n° 12), comme `repartirParCandidat` l'est pour le seuil de couverture.
 * Un couple inconnu du partage lève : le ranger d'un côté serait décider de son seuil ici.
 */
export function etatDesCouples(couples: PartageCouples): (couple: CoupleOutilMode) => EtatCouple {
  const compares = new Set(couples.compares.map(cleCouple));
  const incomplets = new Set(couples.incomplets.map(cleCouple));
  return (couple) => {
    const cle = cleCouple(couple);
    if (compares.has(cle)) return "compare";
    if (incomplets.has(cle)) return "incomplet";
    throw new Error(`Couple ${cle} absent du partage des couples du run (§8) : seuil de 20 % non décidé, non classable.`);
  };
}

/**
 * Couples du plan d'interrogation du run, dans l'ordre de première apparition, partagés au seuil
 * de 20 % compté sur le plan (§8, protocole 0.21). Une réponse API hors plan lève (`ReponseHorsPlan`).
 */
export function couplesComparables(reponses: readonly Reponse[], plan: readonly RequeteDuPlan[]): PartageCouples {
  const rapprochement = rapprocher(reponses, plan);
  const compares: CoupleOutilMode[] = [];
  const incomplets: CoupleOutilMode[] = [];
  for (const couple of couplesDuPlan(plan)) {
    if (runIncomplet(partDuCouple(rapprochement, plan, couple))) incomplets.push(couple);
    else compares.push(couple);
  }
  return { compares, incomplets };
}

/* ------------------------------------------------------------------ plan d'interrogation */

/**
 * Une requête du plan d'interrogation du run (`pipeline/interrogation/plan.ts:RequetePlanifiee`),
 * réduite à ce que le seuil en lit : sa clé. `RequetePlanifiee` s'y conforme telle quelle.
 */
export interface RequeteDuPlan {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
  readonly question_id: string;
  readonly formulation_id: string;
  readonly echantillon: number;
}

/** §8 (0.21) : un couple déclaré dont le plan ne prévoit aucune requête n'a pas de dénominateur. */
export class CoupleSansRequetePlanifiee extends Error {
  constructor(couple: CoupleOutilMode) {
    super(
      `Couple ${cleCouple(couple)} déclaré, mais sans aucune requête au plan d'interrogation du run, donc sans aucune ` +
        `réponse API attendue : le seuil de 20 % n'est pas décidable (§8, aucune division par zéro).`,
    );
    this.name = "CoupleSansRequetePlanifiee";
  }
}

/** §8 (0.21) : une réponse API du run qu'aucune requête du plan n'attend, ou la seconde d'une même requête. */
export class ReponseHorsPlan extends Error {
  constructor(reponse: Reponse, raison: string) {
    super(
      `Réponse API ${reponse.id} (${reponse.outil_id}, ${String(reponse.mode)}, question ${reponse.question_id}, formulation ` +
        `${reponse.formulation_id}, échantillon ${reponse.echantillon}) : ${raison}. La part de manquantes, comptée sur ` +
        `le plan d'interrogation du run (§8), n'est pas décidable.`,
    );
    this.name = "ReponseHorsPlan";
  }
}

/** Le plan reçu contredit le périmètre ou se répète : aucun dénominateur n'en est tiré. */
export class PlanIncoherent extends Error {
  constructor(detail: string) {
    super(`Plan d'interrogation du run incohérent (§6, §8) : ${detail}. Aucun dénominateur n'en est tiré.`);
    this.name = "PlanIncoherent";
  }
}

function cleRequete(requete: RequeteDuPlan): string {
  return JSON.stringify([requete.outil_id, requete.mode, requete.question_id, requete.formulation_id, requete.echantillon]);
}

function duCouple(couple: CoupleOutilMode): (requete: RequeteDuPlan) => boolean {
  return (requete) => requete.outil_id === couple.outil_id && requete.mode === couple.mode;
}

interface Rapprochement {
  /** Requêtes du plan sans réponse API de contexte run enregistrée, dans l'ordre du plan. */
  readonly sans_reponse: readonly RequeteDuPlan[];
  /** Requêtes du plan dont la réponse enregistrée est une manquante écrite. */
  readonly manquantes_ecrites: readonly RequeteDuPlan[];
}

function indexerPlan(plan: readonly RequeteDuPlan[]): ReadonlyMap<string, RequeteDuPlan> {
  const index = new Map<string, RequeteDuPlan>();
  for (const requete of plan) {
    const cle = cleRequete(requete);
    if (index.has(cle)) throw new PlanIncoherent(`la requête ${cle} y figure deux fois`);
    index.set(cle, requete);
  }
  return index;
}

function requeteDe(reponse: Reponse): RequeteDuPlan {
  const { outil_id, question_id, formulation_id, echantillon } = reponse;
  return { outil_id, mode: modeExige(reponse), question_id, formulation_id, echantillon };
}

/** Chaque réponse API de contexte run rapprochée de sa requête du plan, une au plus par requête. */
function rapprocher(reponses: readonly Reponse[], plan: readonly RequeteDuPlan[]): Rapprochement {
  const index = indexerPlan(plan);
  const couvertes = new Set<string>();
  const manquantes_ecrites: RequeteDuPlan[] = [];
  for (const reponse of reponsesApiDuRun(reponses)) {
    const cle = cleRequete(requeteDe(reponse));
    const requete = index.get(cle);
    if (requete === undefined) throw new ReponseHorsPlan(reponse, "aucune requête du plan d'interrogation du run ne l'attend");
    if (couvertes.has(cle)) throw new ReponseHorsPlan(reponse, "deux réponses enregistrées pour une même requête du plan");
    couvertes.add(cle);
    if (reponse.statut_reponse === "manquante") manquantes_ecrites.push(requete);
  }
  return { sans_reponse: plan.filter((requete) => !couvertes.has(cleRequete(requete))), manquantes_ecrites };
}

/** §8 (0.21) : (requêtes sans réponse + manquantes écrites) / requêtes planifiées, pour ce couple. */
function partDuCouple(rapprochement: Rapprochement, plan: readonly RequeteDuPlan[], couple: CoupleOutilMode): Taux {
  const planifiees = plan.filter(duCouple(couple)).length;
  if (planifiees === 0) throw new CoupleSansRequetePlanifiee(couple);
  const absentes = rapprochement.sans_reponse.filter(duCouple(couple)).length;
  const ecrites = rapprochement.manquantes_ecrites.filter(duCouple(couple)).length;
  return taux(absentes + ecrites, planifiees);
}

function couplesDuPlan(plan: readonly RequeteDuPlan[]): CoupleOutilMode[] {
  const vus = new Map<string, CoupleOutilMode>();
  for (const requete of plan) {
    const couple = { outil_id: requete.outil_id, mode: requete.mode };
    if (!vus.has(cleCouple(couple))) vus.set(cleCouple(couple), couple);
  }
  return [...vus.values()];
}

/**
 * Les requêtes du plan sans réponse API de contexte run enregistrée, dans l'ordre du plan : celles
 * que le seuil compte manquantes, et parmi lesquelles le go/no-go cherche les requêtes en attente
 * de l'opérateur (§6, §12). Une réponse hors plan lève (`ReponseHorsPlan`).
 */
export function requetesSansReponse(reponses: readonly Reponse[], plan: readonly RequeteDuPlan[]): readonly RequeteDuPlan[] {
  return rapprocher(reponses, plan).sans_reponse;
}

/**
 * §8 (protocole 0.21) : part des réponses manquantes d'un couple outil × mode, comptée sur les
 * requêtes que le plan d'interrogation du run prévoit pour lui. Une requête planifiée sans réponse
 * API de contexte run enregistrée compte comme manquante, au même titre qu'une manquante écrite.
 */
export function partReponsesManquantesDuPlan(reponses: readonly Reponse[], plan: readonly RequeteDuPlan[], couple: CoupleOutilMode): Taux {
  return partDuCouple(rapprocher(reponses, plan), plan, couple);
}

/** Ce que la définition des couples déclarés lit d'un outil du périmètre au gel. */
export type OutilDeclarable = Pick<OutilAuGel, "outil_id" | "famille" | "inclus" | "modes">;

/** `run.schema.json` exige `modes` d'un assistant inclus : absent, ses couples ne sont pas connus. */
export class AssistantInclusSansModes extends Error {
  constructor(outil_id: IdentifiantCourt) {
    super(
      `Assistant inclus ${outil_id} sans modes déclarés (§6, run.schema.json) : ses couples outil × mode ne sont ` +
        `pas connus, et aucune liste vide n'en tient lieu.`,
    );
    this.name = "AssistantInclusSansModes";
  }
}

/** §8 : une réponse API d'un couple que le périmètre ne déclare pas. */
export class CoupleHorsPerimetre extends Error {
  constructor(couple: CoupleOutilMode) {
    super(
      `Couple ${cleCouple(couple)} présent dans les réponses API du run, mais absent du périmètre (aucun ` +
        `assistant inclus ne le déclare, §8) : aucun verdict n'est publié pour un couple hors périmètre.`,
    );
    this.name = "CoupleHorsPerimetre";
  }
}

function estAssistantInclus(outil: OutilDeclarable): boolean {
  return outil.famille === "assistant" && outil.inclus;
}

function modesDeclares(outil: OutilDeclarable): readonly Mode[] {
  if (outil.modes === undefined) throw new AssistantInclusSansModes(outil.outil_id);
  return outil.modes;
}

/**
 * Seule définition des couples déclarés par le périmètre (Lot 10 (a)) : chaque assistant inclus,
 * un couple par mode qu'il déclare, dans l'ordre du périmètre. Lue par `parModeDuRun`, par
 * `pipeline/go-no-go/criteres-run.ts` et, à travers `parModeDuRun`, par `analysis/lecture-run.ts`.
 */
export function couplesDeclares(outils: readonly OutilDeclarable[]): readonly CoupleOutilMode[] {
  return outils
    .filter(estAssistantInclus)
    .flatMap((outil) => modesDeclares(outil).map((mode) => ({ outil_id: outil.outil_id, mode })));
}

/**
 * Les couples déclarés, après refus de toute réponse API d'un couple hors périmètre
 * (`CoupleHorsPerimetre`, §8). Un couple déclaré sans réponse reste dans la liste : c'est le seuil,
 * compté sur le plan (`partsDuRun`), qui le décide ou refuse de le décider, pas cette fonction.
 */
export function couplesDuRun(outils: readonly OutilDeclarable[], reponses: readonly Reponse[]): readonly CoupleOutilMode[] {
  const declares = couplesDeclares(outils);
  const cles = new Set(declares.map(cleCouple));
  const hors = couplesPresents(reponses).find((couple) => !cles.has(cleCouple(couple)));
  if (hors !== undefined) throw new CoupleHorsPerimetre(hors);
  return declares;
}

function exigerPlanDansLePerimetre(declares: readonly CoupleOutilMode[], plan: readonly RequeteDuPlan[]): void {
  const cles = new Set(declares.map(cleCouple));
  const hors = plan.find((requete) => !cles.has(cleCouple(requete)));
  if (hors !== undefined) throw new PlanIncoherent(`requête planifiée pour le couple ${cleCouple(hors)}, qu'aucun assistant inclus ne déclare`);
}

export interface PartDuCouple {
  readonly couple: CoupleOutilMode;
  readonly part: Taux;
}

/**
 * §8, §12 (protocole 0.21) : la part de manquantes de chaque couple déclaré, comptée sur le plan
 * d'interrogation du run, dans l'ordre du périmètre. Lue par `parModeDuRun` et par
 * `pipeline/go-no-go/criteres-run.ts:critereReponsesManquantes` — un seul calcul. Lève, dans cet
 * ordre : `CoupleHorsPerimetre` (réponse d'un couple non déclaré), `PlanIncoherent` (requête
 * planifiée hors périmètre ou répétée), `ReponseHorsPlan`, `CoupleSansRequetePlanifiee`.
 */
export function partsDuRun(outils: readonly OutilDeclarable[], reponses: readonly Reponse[], plan: readonly RequeteDuPlan[]): readonly PartDuCouple[] {
  const couples = couplesDuRun(outils, reponses);
  exigerPlanDansLePerimetre(couples, plan);
  const rapprochement = rapprocher(reponses, plan);
  return couples.map((couple) => ({ couple, part: partDuCouple(rapprochement, plan, couple) }));
}

function seuilDe(part: Taux): SeuilMode {
  return { reponses_manquantes_part: part.numerateur / part.denominateur, run_incomplet: runIncomplet(part) };
}

/**
 * §8, §12, D55 (7) : `par_mode` de chaque assistant inclus du périmètre, un par mode qu'il
 * déclare, la part de manquantes comptée sur le plan d'interrogation du run (`partsDuRun`,
 * protocole 0.21). Seul calcul de ce champ — voir l'en-tête du fichier. Un mode déclaré sans
 * requête planifiée lève (`CoupleSansRequetePlanifiee`) ; une réponse API d'un couple non déclaré
 * par un assistant inclus lève aussi (`CoupleHorsPerimetre`, par `couplesDuRun`).
 */
export function parModeDuRun(
  outils: readonly OutilDeclarable[],
  reponses: readonly Reponse[],
  plan: readonly RequeteDuPlan[],
): ReadonlyMap<IdentifiantCourt, ParMode> {
  const parts = partsDuRun(outils, reponses, plan);
  const resultat = new Map<IdentifiantCourt, ParMode>();
  for (const outil of outils.filter(estAssistantInclus)) {
    const parMode: Partial<Record<Mode, SeuilMode>> = {};
    for (const { couple, part } of parts.filter((p) => p.couple.outil_id === outil.outil_id)) parMode[couple.mode] = seuilDe(part);
    resultat.set(outil.outil_id, parMode);
  }
  return resultat;
}

/** Les réponses API de contexte run ; exportée pour le compte des réponses obtenues (`pipeline/run/reponses.ts`, D59 (17)). */
export function reponsesApiDuRun(reponses: readonly Reponse[]): Reponse[] {
  return filtrerContexteRun(reponses).filter((r) => r.canal === "api");
}

function couplesPresents(reponses: readonly Reponse[]): CoupleOutilMode[] {
  const vus = new Map<string, CoupleOutilMode>();
  for (const reponse of reponsesApiDuRun(reponses)) {
    const couple = { outil_id: reponse.outil_id, mode: modeExige(reponse) };
    if (!vus.has(cleCouple(couple))) vus.set(cleCouple(couple), couple);
  }
  return [...vus.values()];
}

/** §6 : le mode est obligatoire sur le canal API. Absent, le couple n'est pas décidable. */
function modeExige(reponse: Reponse): Mode {
  if (reponse.mode === undefined) {
    throw new Error(`Réponse API ${reponse.id} sans mode (§6) : son couple outil × mode n'est pas décidable.`);
  }
  return reponse.mode;
}

function ajouterUnique(liste: IdentifiantCourt[], valeur: IdentifiantCourt): void {
  if (!liste.includes(valeur)) liste.push(valeur);
}
