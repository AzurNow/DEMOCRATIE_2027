/**
 * Diagnostic de lot publié (§4, §9) et sélection du kappa qui compte pour le §12.
 *
 * Aucun kappa n'est calculé ici : `DiagnosticPublie` est une projection de `DiagnosticLot`, sortie
 * de `analyse-lot.ts:diagnostiquerLot`, seul calcul du projet. Ce module y ajoute ce que le calcul
 * ne sait pas : l'instant du calcul et le lien de réannotation lu dans les manifestes.
 *
 * La sélection du §12 (« le kappa retenu pour les critères de la section 12 est celui du lot de
 * réannotation ») filtre sur `supersede_par === null` et nulle part ailleurs (docs/DETTE.md,
 * 2026-09-19, point 1). Elle refuse de choisir quand le lien publié n'est plus celui des
 * manifestes : un lot réannoté après son dernier calcul porterait encore `supersede_par: null`,
 * et son kappa — celui qui a motivé la réannotation — serait retenu sans que rien ne tombe.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import type { DiagnosticLot } from "./analyse-lot.ts";
import { canoniser } from "./empreinte.ts";
import { CLES_GRILLE } from "./grille.ts";
import type { MotifIndefini, ResultatKappa } from "./kappa.ts";
import { supersediteurDe, trouverLot } from "./lot.ts";
import type { CleGrille, Lot, NatureLot } from "./types.ts";

/** Un kappa publié, du lot ou d'une question : même forme, même règle d'absence (§4). */
export interface KappaPublie {
  /** Absent quand le kappa n'est pas défini : jamais 0, jamais 1 (§4). */
  readonly kappa?: number;
  /** Présent si et seulement si `kappa` est absent. */
  readonly motif_indefini?: MotifIndefini;
  readonly accord_observe: number | null;
  readonly n: number;
}

export interface DiagnosticPublie {
  readonly lot_id: string;
  readonly nature: NatureLot;
  readonly date_calcul: string;
  /** Absent quand le kappa n'est pas défini : jamais 0, jamais 1 (§4). */
  readonly kappa?: number;
  /** Présent si et seulement si `kappa` est absent. */
  readonly motif_indefini?: MotifIndefini;
  readonly accord_observe: number | null;
  readonly n: number;
  /**
   * §4 : « Un kappa par question de la grille est publié comme diagnostic secondaire ». Une clé
   * par question de la grille ; la réponse à `position_univoque` y est publiée sans entrer dans
   * le sort de l'item.
   */
  readonly kappa_par_question: Readonly<Record<CleGrille, KappaPublie>>;
  readonly exclus_contestation: number;
  readonly taille_lot: number;
  readonly taille_attendue: number;
  readonly taille_conforme: boolean;
  readonly reannote: string | null;
  readonly date_calibration: string | null;
  readonly supersede_par: string | null;
}

/** Tant que les deux annotateurs n'ont pas fini, le kappa n'existe pas : rien n'est publié. */
export class DiagnosticPremature extends Error {
  constructor(lot_id: string) {
    super(`Lot ${lot_id} : les deux annotateurs n'ont pas fini, aucun kappa n'est publiable.`);
    this.name = "DiagnosticPremature";
  }
}

/** Le lien de réannotation publié n'est plus celui des manifestes : le lot doit être recalculé. */
export class DiagnosticPerime extends Error {
  constructor(lot_id: string, publie: string | null, attendu: string | null) {
    super(
      `Lot ${lot_id} : son dernier diagnostic publié porte supersede_par=${String(publie)}, les ` +
        `manifestes disent ${String(attendu)}. Relancer pnpm diagnostics avant de lire un kappa pour le §12.`,
    );
    this.name = "DiagnosticPerime";
  }
}

/** Deux calculs du même lot au même instant : lequel fait foi n'est pas décidable. */
export class CalculsSimultanes extends Error {
  constructor(lot_id: string, instant: string) {
    super(`Lot ${lot_id} : deux diagnostics calculés au même instant (${instant}).`);
    this.name = "CalculsSimultanes";
  }
}

function lienDeSupersession(lots: readonly Lot[], lot_id: string): string | null {
  const suivant = supersediteurDe(lots, lot_id);
  return suivant === null ? null : suivant.lot_id;
}

/** Le kappa d'un résultat de calcul, absent avec son motif quand il n'est pas défini (§4). */
function kappaPublie(resultat: ResultatKappa, contexte: string): KappaPublie {
  const { kappa, motif_indefini, accord_observe, n } = resultat;
  if (kappa !== null) return { kappa, accord_observe, n };
  if (motif_indefini === null) {
    throw new Error(`${contexte} : kappa absent sans motif, résultat de calcul incohérent.`);
  }
  return { motif_indefini, accord_observe, n };
}

function kappaParQuestionPublie(diagnostic: DiagnosticLot): Record<CleGrille, KappaPublie> {
  const publies: Partial<Record<CleGrille, KappaPublie>> = {};
  for (const cle of CLES_GRILLE) {
    publies[cle] = kappaPublie(diagnostic.kappa_par_question[cle], `Lot ${diagnostic.lot_id}, question ${cle}`);
  }
  return publies as Record<CleGrille, KappaPublie>;
}

function champsReannotation(lot: Lot): Pick<DiagnosticPublie, "reannote" | "date_calibration"> {
  return {
    reannote: lot.reannote === undefined ? null : lot.reannote,
    date_calibration: lot.date_calibration === undefined ? null : lot.date_calibration,
  };
}

/**
 * Projette le résultat de `diagnostiquerLot` en objet publié. `lots` est la liste complète des
 * manifestes : le lien `supersede_par` en est lu au moment du calcul.
 */
export function projeterDiagnostic(
  diagnostic: DiagnosticLot,
  lot: Lot,
  lots: readonly Lot[],
  date_calcul: string,
): DiagnosticPublie {
  if (!diagnostic.les_deux_ont_fini) throw new DiagnosticPremature(lot.lot_id);
  return {
    lot_id: lot.lot_id,
    nature: lot.nature,
    date_calcul,
    ...kappaPublie(diagnostic.kappa, `Lot ${diagnostic.lot_id}`),
    kappa_par_question: kappaParQuestionPublie(diagnostic),
    exclus_contestation: diagnostic.exclus_contestation,
    taille_lot: diagnostic.taille_lot,
    taille_attendue: diagnostic.taille_attendue,
    taille_conforme: diagnostic.taille_conforme,
    ...champsReannotation(lot),
    supersede_par: lienDeSupersession(lots, lot.lot_id),
  };
}

/** Deux calculs qui ne diffèrent que par leur instant disent la même chose. */
export function memeCalcul(a: DiagnosticPublie, b: DiagnosticPublie): boolean {
  const { date_calcul: _a, ...resteA } = a;
  const { date_calcul: _b, ...resteB } = b;
  return canoniser(resteA) === canoniser(resteB);
}

/** Le calcul le plus récent de chaque lot, par instant réel (les décalages sont comparés). */
export function derniersCalculs(diagnostics: readonly DiagnosticPublie[]): readonly DiagnosticPublie[] {
  const parLot = new Map<string, DiagnosticPublie>();
  for (const diagnostic of diagnostics) {
    const retenu = parLot.get(diagnostic.lot_id);
    if (retenu === undefined || plusRecent(diagnostic, retenu)) parLot.set(diagnostic.lot_id, diagnostic);
  }
  return [...parLot.values()].sort((x, y) => comparerChaines(x.lot_id, y.lot_id));
}

function plusRecent(candidat: DiagnosticPublie, retenu: DiagnosticPublie): boolean {
  const ecart = Date.parse(candidat.date_calcul) - Date.parse(retenu.date_calcul);
  if (ecart === 0) throw new CalculsSimultanes(candidat.lot_id, candidat.date_calcul);
  return ecart > 0;
}

/**
 * Kappas qui comptent pour le §12 : le dernier calcul de chaque lot (§4, 0.10 : « le calcul le
 * plus récent fait foi »), s'il n'est supersédé par aucun lot de réannotation, et seulement pour
 * les « lots réels ou de réannotation de taille conforme » (§12, 0.10). Un lot d'entraînement
 * ou sous l'effectif attendu reste publié, mais ne compte pas.
 */
export function kappasRetenusSection12(
  diagnostics: readonly DiagnosticPublie[],
  lots: readonly Lot[],
): readonly DiagnosticPublie[] {
  const derniers = derniersCalculs(diagnostics);
  for (const diagnostic of derniers) {
    trouverLot(lots, diagnostic.lot_id);
    const attendu = lienDeSupersession(lots, diagnostic.lot_id);
    if (diagnostic.supersede_par !== attendu) {
      throw new DiagnosticPerime(diagnostic.lot_id, diagnostic.supersede_par, attendu);
    }
  }
  return derniers.filter(compteSection12);
}

function compteSection12(diagnostic: DiagnosticPublie): boolean {
  return diagnostic.supersede_par === null && diagnostic.taille_conforme && diagnostic.nature !== "entrainement";
}
