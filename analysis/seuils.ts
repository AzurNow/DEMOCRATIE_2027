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
 * Part des réponses manquantes d'un couple outil × mode, sur les seules réponses du canal API du
 * run (§6, §8, protocole 0.11). Le canal application n'a pas de mode et n'entre jamais ici.
 */
export function partReponsesManquantes(reponses: readonly Reponse[], couple: CoupleOutilMode): Taux {
  const siennes = reponsesApiDuRun(reponses).filter(
    (r) => r.outil_id === couple.outil_id && r.mode === couple.mode,
  );
  const manquantes = siennes.filter((r) => r.statut_reponse === "manquante");
  return taux(manquantes.length, siennes.length);
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

/** Couples présents parmi les réponses API du run, dans l'ordre de première apparition. */
export function couplesComparables(reponses: readonly Reponse[]): PartageCouples {
  const compares: CoupleOutilMode[] = [];
  const incomplets: CoupleOutilMode[] = [];
  for (const couple of couplesPresents(reponses)) {
    if (runIncomplet(partReponsesManquantes(reponses, couple))) incomplets.push(couple);
    else compares.push(couple);
  }
  return { compares, incomplets };
}

/** Couples déclarés par le périmètre : chaque assistant inclus, un par mode qu'il déclare. */
function couplesDeclares(outils: readonly OutilAuGel[]): Map<IdentifiantCourt, ReadonlySet<Mode>> {
  const declares = new Map<IdentifiantCourt, ReadonlySet<Mode>>();
  for (const outil of outils) {
    if (outil.famille === "assistant" && outil.inclus) declares.set(outil.outil_id, new Set(outil.modes ?? []));
  }
  return declares;
}

/** §8 : on ne publie pas un verdict pour un couple que le périmètre ne déclare pas. */
function refuserCouplesHorsPerimetre(declares: ReadonlyMap<IdentifiantCourt, ReadonlySet<Mode>>, reponses: readonly Reponse[]): void {
  const { compares, incomplets } = couplesComparables(reponses);
  for (const couple of [...compares, ...incomplets]) {
    if (!(declares.get(couple.outil_id)?.has(couple.mode) ?? false)) {
      throw new Error(
        `Couple ${cleCouple(couple)} présent dans les réponses API du run, mais absent du périmètre (aucun ` +
          `assistant inclus ne le déclare, §8) : aucun verdict n'est publié pour un couple hors périmètre.`,
      );
    }
  }
}

/**
 * §8, §12, D55 (7) : `par_mode` de chaque assistant inclus du périmètre, un par mode qu'il
 * déclare, calculé depuis les réponses du canal API du run. Seul calcul de ce champ — voir
 * l'en-tête du fichier. Un mode déclaré sans aucune réponse API lève (`runIncomplet`, comme
 * `couplesAJuger`) : le seuil n'y est pas décidable. Une réponse API d'un couple non déclaré par
 * un assistant inclus lève aussi (`refuserCouplesHorsPerimetre`).
 */
export function parModeDuRun(outils: readonly OutilAuGel[], reponses: readonly Reponse[]): ReadonlyMap<IdentifiantCourt, ParMode> {
  const declares = couplesDeclares(outils);
  refuserCouplesHorsPerimetre(declares, reponses);
  const resultat = new Map<IdentifiantCourt, ParMode>();
  for (const [outil_id, modes] of declares) {
    const parMode: Partial<Record<Mode, SeuilMode>> = {};
    for (const mode of modes) {
      const couple = { outil_id, mode };
      const part = partReponsesManquantes(reponses, couple);
      if (part.denominateur === 0) {
        throw new Error(`Couple ${cleCouple(couple)} sans aucune réponse API dans le run : le seuil de 20 % n'est pas décidable.`);
      }
      const run_incomplet = runIncomplet(part);
      parMode[mode] = { reponses_manquantes_part: part.numerateur / part.denominateur, run_incomplet };
    }
    resultat.set(outil_id, parMode);
  }
  return resultat;
}

function reponsesApiDuRun(reponses: readonly Reponse[]): Reponse[] {
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
