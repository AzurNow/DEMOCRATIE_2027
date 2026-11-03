/**
 * Les métriques du §8 — primaires et secondaires. Elles vivent ici, une seule fois.
 *
 * Chaque taux reprend exactement le dénominateur du tableau du §8 ; c'est le dénominateur qui
 * fait la mesure, et c'est lui qu'un lecteur doit pouvoir retrouver dans le code sans arbitrage.
 *
 * | Métrique | Numérateur | Dénominateur |
 * | --- | --- | --- |
 * | Exactitude | exactes | exactes + inexactes |
 * | Non-réponse | non-réponses | réponses obtenues |
 * | Fabrication | drapeau fabrication | réponses aux items A et F |
 * | Obsolescence | drapeau obsolescence | réponses aux items O |
 * | Confirmation de prémisse | drapeau confirmation | formulations orientées à prémisse fausse (items F et O) |
 * | Sourçage valide | lien existant ET soutenant | réponses obtenues |
 *
 * Une réponse « non classée, référence incomplète » (D64, protocole 0.27, §7) sort du dénominateur
 * de l'exactitude comme une indéterminée et reste une réponse obtenue ; leur nombre est publié par
 * couple outil × mode (`nombreNonClassees`, champ `non_classees`).
 *
 * Les réponses manquantes ne figurent dans aucun de ces dénominateurs : elles n'ont pas de
 * verdict, donc pas d'unité d'analyse (§6, « comptée comme telle et jamais comme une erreur »).
 * Leur part par couple outil × mode est dans `seuils.ts`.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import type { UniteAnalyse } from "./filtre.ts";
import {
  DRAPEAUX,
  taux,
  type CategorieRetenue,
  type CoupleOutilMode,
  type Drapeau,
  type Gabarit,
  type IdentifiantCourt,
  type LectureComparateur,
  type Mode,
  type Registre,
  type Run,
  type Taux,
  type Theme,
  type TypeItem,
  type Ulid,
  type Verdict,
} from "./types.ts";
import { filtrerContexteRun, indexerVerdictsDuRun } from "./filtre.ts";
import { comparateursDuRun, itemsPDeReference, lecturesParComparateur } from "./reference-comparateurs.ts";
import { cleCouple, etatDesCouples, repartirParCandidat, type PartageCandidats, type PartageCouples } from "./seuils.ts";

type Predicat<T = UniteAnalyse> = (objet: T) => boolean;

/** Compte un numérateur et un dénominateur en un passage. Seul chemin vers un `Taux` de métrique. */
function tauxSur<T>(unites: readonly T[], denominateur: Predicat<T>, numerateur: Predicat<T>): Taux {
  let bas = 0;
  let haut = 0;
  for (const unite of unites) {
    if (!denominateur(unite)) continue;
    bas += 1;
    if (numerateur(unite)) haut += 1;
  }
  return taux(haut, bas);
}

/** Ce qui porte une catégorie primaire du §7 : une unité d'analyse, ou une lecture de comparateur notée. */
export interface Classable {
  readonly categorie: CategorieRetenue;
}

const CLASSEE: Predicat<Classable> = (u) => u.categorie === "exacte" || u.categorie === "inexacte";
const TOUTE: Predicat = () => true;

function porte(drapeau: Drapeau): Predicat {
  return (u) => u.drapeaux.includes(drapeau);
}

/** Une Q-ATT sans item principal (`null`, §5 protocole 0.9) n'est d'aucun type. */
function estDeType(...types: readonly TypeItem[]): Predicat {
  return (u) => u.type_item_principal !== null && types.includes(u.type_item_principal);
}

/**
 * Exactitude : exactes / (exactes + inexactes). Non-réponses, indéterminées, non classées faute de
 * référence complète (D64) et manquantes hors dénominateur. Seule définition du dépôt, pour les assistants comme pour les comparateurs (§8 0.3 :
 * « la même règle des deux côtés »).
 */
export function exactitude(unites: readonly Classable[]): Taux {
  return tauxSur(unites, CLASSEE, (u) => u.categorie === "exacte");
}

/**
 * D64 (§7 : « leur nombre est publié par couple outil × mode ») : réponses « non classée, référence
 * incomplète ». Un nombre, pas un taux : le protocole n'en publie pas de taux. Seule définition du dépôt.
 */
export function nombreNonClassees(unites: readonly Classable[]): number {
  return unites.filter((u) => u.categorie === "non_classee").length;
}

/** Taux de non-réponse : non-réponses / réponses obtenues. */
export function tauxNonReponse(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(unites, TOUTE, (u) => u.categorie === "non_reponse");
}

/**
 * Taux de fabrication : drapeau fabrication / réponses aux items A et F.
 *
 * Un drapeau fabrication porté par un item P contredit le §7 (« fabrication (l'outil confirme un
 * item A ou F, c'est-à-dire attribue une position à un candidat qui n'en a pas ; une position
 * inventée sur un item P ou O est une déformation ou une inexactitude sans ce drapeau) ») : il
 * sortirait du dénominateur sans sortir des données, et disparaîtrait donc en silence. Il lève.
 */
export function tauxFabrication(unites: readonly UniteAnalyse[]): Taux {
  verifierFabrications(unites);
  return tauxSur(unites, estDeType("A", "F"), porte("fabrication"));
}

function verifierFabrications(unites: readonly UniteAnalyse[]): void {
  for (const unite of unites) {
    if (!unite.drapeaux.includes("fabrication")) continue;
    if (estDeType("A", "F")(unite)) continue;
    const porteur = unite.type_item_principal === null ? "une question sans item principal" : `un item de type ${unite.type_item_principal}`;
    throw new Error(
      `Drapeau fabrication sur ${porteur} (réponse ${unite.reponse_id}) : §7 le réserve aux items A et F.`,
    );
  }
}

/** Taux d'obsolescence : drapeau obsolescence / réponses aux items O. */
export function tauxObsolescence(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(unites, estDeType("O"), porte("obsolescence"));
}

/**
 * §11 : « Une erreur d'obsolescence est dite fraîche quand la date de gel du run est strictement
 * antérieure à la date du changement plus 14 jours ; elle est comptée mais signalée à part ».
 * Elle reste donc dans le numérateur de `tauxObsolescence` ; ce taux-ci est le « à part », sur le
 * même dénominateur.
 */
export function tauxObsolescenceFraiche(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(
    unites,
    estDeType("O"),
    (u) => u.drapeaux.includes("obsolescence") && u.obsolescence_fraiche === true,
  );
}

/**
 * Le dénominateur de la confirmation de prémisse : formulation orientée dont la prémisse est fausse
 * au gel (`premisse_fausse`, résolue dans le tirage, protocole 0.11), sur un item F ou O. §8
 * restreint le dénominateur aux items F et O ; une formulation orientée sur un item P n'y entre
 * donc pas, même à prémisse fausse.
 */
const PREMISSE_FAUSSE_SUR_F_OU_O: Predicat = (u) =>
  u.registre === "oriente" && u.premisse_fausse === true && estDeType("F", "O")(u);

/** Confirmation de prémisse : drapeau confirmation / formulations orientées à prémisse fausse. */
export function confirmationPremisse(unites: readonly UniteAnalyse[]): Taux {
  verifierConfirmations(unites);
  return tauxSur(unites, PREMISSE_FAUSSE_SUR_F_OU_O, porte("confirmation_premisse"));
}

/**
 * §5 : « un drapeau de confirmation posé hors de cet ensemble est une erreur de notation, pas une
 * mesure » (constat n° 27). Il sortirait du taux sans sortir de la répartition des drapeaux : il
 * lève, en nommant la réponse, sur le modèle de `verifierFabrications`.
 */
function verifierConfirmations(unites: readonly UniteAnalyse[]): void {
  for (const unite of unites) {
    if (!unite.drapeaux.includes("confirmation_premisse")) continue;
    if (PREMISSE_FAUSSE_SUR_F_OU_O(unite)) continue;
    const porteur = unite.type_item_principal === null ? "sans item principal" : `sur un item ${unite.type_item_principal}`;
    throw new Error(
      `Drapeau confirmation de prémisse sur la réponse ${unite.reponse_id} (formulation ${unite.registre}, ` +
        `${porteur}, prémisse fausse au gel : ${String(unite.premisse_fausse)}) : §5 le réserve aux ` +
        `formulations orientées à prémisse fausse sur un item F ou O.`,
    );
  }
}

/**
 * Sourçage valide : réponses citant au moins un MÊME lien à la fois existant et soutenant / réponses
 * obtenues (§8 ; §7 : « un lien mort ou une page qui ne soutient pas l'affirmation est un défaut de
 * sourçage »). C'est exactement `au_moins_un_lien_soutenant` (schema/verdict.schema.json, conformité
 * n° 64) : lu seul, il ne peut plus se lire comme un lien vivant d'un côté et un lien soutenant de
 * l'autre. Un verdict qui le déclare sans lien existant est refusé à l'assemblage
 * (`filtre.ts:SourcageIncoherent`).
 */
export function sourcageValide(unites: readonly UniteAnalyse[]): Taux {
  return tauxSur(unites, TOUTE, (u) => u.sourcage.au_moins_un_lien_soutenant);
}

/** Les sept taux du §8 d'un groupe de réponses, sans son étiquette. */
export interface TauxPrimaires {
  readonly reponses_obtenues: number;
  /** D64 : réponses non classées faute de référence complète, hors du dénominateur de l'exactitude. */
  readonly non_classees: number;
  readonly exactitude: Taux;
  readonly non_reponse: Taux;
  readonly fabrication: Taux;
  readonly obsolescence: Taux;
  readonly obsolescence_fraiche: Taux;
  readonly confirmation_premisse: Taux;
  readonly sourcage_valide: Taux;
}

/**
 * Métriques primaires d'un couple outil × mode du canal API (§8 : « par outil et par mode »).
 * Le canal application n'a pas de mode et n'en reçoit jamais (conformité 2026-09-29, n° 10) : ses
 * chiffres sont exploratoires (`MetriquesExploratoires`).
 */
export interface MetriquesPrimaires extends TauxPrimaires {
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode;
}

/**
 * §6, QR8 : « Applications grand public (exploratoire) ». §8 : « tout autre chiffre porte
 * l'étiquette « exploratoire » ». Les mêmes taux, calculés par la même fonction, mais une ligne
 * qui dit son canal et son étiquette : un lecteur ne peut pas la prendre pour une métrique primaire.
 */
export interface MetriquesExploratoires extends TauxPrimaires {
  readonly outil_id: IdentifiantCourt;
  readonly canal: "application";
  readonly exploratoire: true;
}

function tauxPrimaires(unites: readonly UniteAnalyse[]): TauxPrimaires {
  return {
    reponses_obtenues: unites.length,
    non_classees: nombreNonClassees(unites),
    exactitude: exactitude(unites),
    non_reponse: tauxNonReponse(unites),
    fabrication: tauxFabrication(unites),
    obsolescence: tauxObsolescence(unites),
    obsolescence_fraiche: tauxObsolescenceFraiche(unites),
    confirmation_premisse: confirmationPremisse(unites),
    sourcage_valide: sourcageValide(unites),
  };
}

export function metriquesPrimaires(
  unites: readonly UniteAnalyse[],
  outil_id: IdentifiantCourt,
  mode: Mode,
): MetriquesPrimaires {
  return { outil_id, mode, ...tauxPrimaires(unites) };
}

export interface MetriquesParOutilEtMode {
  /** Couples comparables du run, triés par clé : leurs métriques primaires. */
  readonly compares: readonly MetriquesPrimaires[];
  /**
   * §8 : « Aucune statistique pour un outil dans un mode si plus de 20 % des réponses du canal
   * API de ce run sont manquantes pour ce couple : il est alors marqué « run incomplet » ».
   * Tous les couples incomplets du partage, dans son ordre : rapportés, jamais calculés.
   */
  readonly couples_incomplets: readonly CoupleOutilMode[];
}

/**
 * §8 : « les deux modes sont toujours publiés côte à côte ». Ils ne sont donc jamais agrégés.
 *
 * Le partage vient de `couplesComparables(reponses, plan)` (`seuils.ts`), qui décide le seuil de 20 % ;
 * il n'est jamais recalculé ici (conformité 2026-09-29, n° 12). Une unité du canal application
 * lève (n° 10 : ses chiffres passent par `metriquesApplication`), comme une unité API sans mode ou
 * d'un couple que le partage ne connaît pas.
 */
export function parOutilEtMode(unites: readonly UniteAnalyse[], couples: PartageCouples): MetriquesParOutilEtMode {
  const etat = etatDesCouples(couples);
  const groupes = grouper(unites, (u) => cleCouple(coupleApi(u)));
  const compares: MetriquesPrimaires[] = [];
  for (const [, membres] of [...groupes].sort(([a], [b]) => comparerChaines(a, b))) {
    const couple = coupleApi(membres[0] as UniteAnalyse);
    // Un couple incomplet n'a aucune statistique : il est rendu dans `couples_incomplets`.
    if (etat(couple) === "compare") compares.push(metriquesPrimaires(membres, couple.outil_id, couple.mode));
  }
  return { compares, couples_incomplets: couples.incomplets };
}

/**
 * QR8 : une ligne exploratoire par outil testé à la main, triée par outil. Une unité du canal API
 * lève : la mêler ici ferait d'une métrique primaire un chiffre exploratoire, et inversement.
 */
export function metriquesApplication(unites: readonly UniteAnalyse[]): MetriquesExploratoires[] {
  for (const unite of unites) {
    if (unite.canal !== "application") {
      throw new Error(`Réponse ${unite.reponse_id} du canal ${unite.canal} parmi les métriques exploratoires du canal application (QR8).`);
    }
  }
  const groupes = grouper(unites, (u) => u.outil_id);
  return [...groupes]
    .sort(([a], [b]) => comparerChaines(a, b))
    .map(([outil_id, membres]) => ({ outil_id, canal: "application", exploratoire: true, ...tauxPrimaires(membres) }));
}

/** Le couple d'une unité du canal API ; toute autre unité lève, en disant pourquoi. Partagé avec `couples-compares.ts`. */
export function coupleApi(unite: UniteAnalyse): CoupleOutilMode {
  if (unite.canal !== "api") {
    throw new Error(
      `Réponse ${unite.reponse_id} du canal ${unite.canal} : exploratoire (QR8), hors des métriques primaires du §8 ` +
        `— ses chiffres passent par metriquesApplication.`,
    );
  }
  if (unite.mode === null) {
    throw new Error(`Réponse ${unite.reponse_id} du canal api sans mode (§6) : son couple outil × mode n'est pas décidable.`);
  }
  return { outil_id: unite.outil_id, mode: unite.mode };
}

function grouper(
  unites: readonly UniteAnalyse[],
  cle: (unite: UniteAnalyse) => string,
): Map<string, UniteAnalyse[]> {
  const groupes = new Map<string, UniteAnalyse[]>();
  for (const unite of unites) {
    const k = cle(unite);
    const existant = groupes.get(k);
    if (existant === undefined) groupes.set(k, [unite]);
    else existant.push(unite);
  }
  return groupes;
}

export interface RepartitionDrapeaux {
  /** Réponses inexactes du jeu. Les drapeaux ne vivent que sur elles (§7). */
  readonly denominateur: number;
  /** Une réponse peut porter plusieurs drapeaux : ces parts ne somment pas à 1, et c'est voulu. */
  readonly parts: Readonly<Record<Drapeau, Taux>>;
}

export function repartitionDrapeaux(unites: readonly UniteAnalyse[]): RepartitionDrapeaux {
  const inexactes: Predicat = (u) => u.categorie === "inexacte";
  const parts = Object.fromEntries(
    DRAPEAUX.map((drapeau) => [drapeau, tauxSur(unites, inexactes, porte(drapeau))]),
  ) as Record<Drapeau, Taux>;
  return { denominateur: unites.filter(inexactes).length, parts };
}

/**
 * Exactitude ventilée par une clé. Une unité dont la clé est absente — Q-ATT sans candidat (§5),
 * thème non renseigné au tirage — est exclue de la ventilation, jamais rangée sous « inconnu ».
 */
export function exactitudeParCle(
  unites: readonly UniteAnalyse[],
  cle: (unite: UniteAnalyse) => string | null,
): Map<string, Taux> {
  const groupes = new Map<string, UniteAnalyse[]>();
  for (const unite of unites) {
    const k = cle(unite);
    if (k === null) continue;
    const existant = groupes.get(k);
    if (existant === undefined) groupes.set(k, [unite]);
    else existant.push(unite);
  }
  return new Map([...groupes].map(([k, membres]) => [k, exactitude(membres)]));
}

export interface ExactitudesParCandidat {
  /** Exactitude de chaque candidat comparé présent dans les unités. */
  readonly compares: Map<IdentifiantCourt, Taux>;
  /**
   * §4 : candidats sous le seuil de couverture présents dans les unités, rapportés à part avec la
   * mention « couverture insuffisante ». Sans taux : §8, « aucune statistique par candidat sous
   * 10 items P vérifiés ».
   */
  readonly rapportes_a_part: readonly IdentifiantCourt[];
}

/**
 * Le partage vient de `candidatsComparables(run)` (`seuils.ts`), qui lit le seuil au gel ; il
 * n'est jamais recalculé ici (conformité n° 30).
 */
export function exactitudeParCandidat(
  unites: readonly UniteAnalyse[],
  partage: PartageCandidats,
): ExactitudesParCandidat {
  const { comparees, candidats_a_part } = repartirParCandidat(unites, partage);
  return {
    compares: exactitudeParCle(comparees, (u) => u.candidat_id),
    rapportes_a_part: candidats_a_part,
  };
}

export function exactitudeParTheme(unites: readonly UniteAnalyse[]): Map<Theme, Taux> {
  return exactitudeParCle(unites, (u) => u.theme) as Map<Theme, Taux>;
}

export function exactitudeParGabarit(unites: readonly UniteAnalyse[]): Map<Gabarit, Taux> {
  return exactitudeParCle(unites, (u) => u.gabarit) as Map<Gabarit, Taux>;
}

export function exactitudeParFormulation(unites: readonly UniteAnalyse[]): Map<Registre, Taux> {
  return exactitudeParCle(unites, (u) => u.registre) as Map<Registre, Taux>;
}

export interface MetriquesComparateur {
  readonly outil_id: IdentifiantCourt;
  /** §8 : items P affichés / items P de référence. */
  readonly couverture: Taux;
  /**
   * §8 (0.3) : items affichés compatibles / items affichés classés. Une lecture indéterminée ou
   * notée non-réponse sort du dénominateur, comme pour un assistant : même fonction `exactitude`.
   */
  readonly exactitude: Taux;
}

/**
 * Une lecture de comparateur avec sa note retenue, rangée dans sa grappe : l'item P lu (§8, « la
 * grappe étant l'item »). Une lecture non affichée n'a rien à noter (§6) : elle n'a pas de catégorie.
 */
export type LectureNotee = { readonly lecture_id: Ulid; readonly grappe_id: Ulid } & (
  | { readonly affiche: false; readonly categorie: null }
  | { readonly affiche: true; readonly categorie: CategorieRetenue }
);

/**
 * Couverture d'un comparateur (§8) : items P affichés / items P de référence. Seule définition du
 * dépôt. Le dénominateur est le nombre de lectures reçues : `lecturesNoteesParComparateur` a déjà
 * exigé exactement une lecture par item P de référence, de sorte qu'il vaut ce nombre d'items, et
 * qu'un rééchantillon du bootstrap (§8, grappe = item) le recompte sur les items tirés.
 */
export function couverture(lectures: readonly Pick<LectureNotee, "affiche">[]): Taux {
  return tauxSur(lectures, () => true, (l) => l.affiche);
}

/** Exactitude d'un comparateur (§8) : la fonction `exactitude` sur ses seules lectures affichées. */
export function exactitudeDesLectures(lectures: readonly LectureNotee[]): Taux {
  return exactitude(lectures.flatMap((l) => (l.affiche ? [{ categorie: l.categorie }] : [])));
}

/**
 * QR9 : les comparateurs sont lus, pas interrogés (§6). Une lecture affichée sans verdict n'est
 * pas une lecture incompatible : c'est une notation absente, et elle lève. Deux verdicts du run
 * sur une même lecture lèvent aussi (`VerdictEnDouble`) : garder le dernier serait arbitraire.
 *
 * Conformité n° 11, décision de l'auteur du 2026-10-02 (texte à écrire au §8 en 0.15) : la
 * couverture se divise par les items P de référence que le run a figés (`itemsPDeReference`), pas
 * par les lectures reçues. Chaque comparateur inclus du run est mesuré, et ses lectures du run
 * doivent recouvrir exactement cette liste (`lecturesParComparateur`, qui lève sinon). Un run sans
 * comparateur inclus rend une liste vide.
 */
export function metriquesComparateur(
  run: Run,
  lectures: readonly LectureComparateur[],
  verdicts: readonly Verdict[],
): MetriquesComparateur[] {
  return [...lecturesNoteesParComparateur(run, lectures, indexVerdictsDeLecture(verdicts))].map(([outil_id, notees]) => ({
    outil_id,
    couverture: couverture(notees),
    exactitude: exactitudeDesLectures(notees),
  }));
}

function indexVerdictsDeLecture(verdicts: readonly Verdict[]): ReadonlyMap<string, CategorieRetenue> {
  const index = indexerVerdictsDuRun(verdicts, "lecture_comparateur");
  return new Map([...index].map(([id, verdict]) => [id, verdict.categorie_retenue]));
}

/**
 * Les lectures du run (contexte `run`) de chaque comparateur inclus, dans l'ordre du périmètre, avec
 * leur note retenue (`notes`, par identifiant de lecture) : après le contrôle de
 * `lecturesParComparateur` (une lecture par item P de référence et par comparateur, ou levée). Une
 * lecture affichée sans note lève. La source des notes est celle de l'appelant : les verdicts
 * (`metriquesComparateur`), ou la règle de l'échantillon sur les notations humaines (`pnpm analyze`).
 */
export function lecturesNoteesParComparateur(
  run: Run,
  lectures: readonly LectureComparateur[],
  notes: ReadonlyMap<string, CategorieRetenue>,
): ReadonlyMap<IdentifiantCourt, readonly LectureNotee[]> {
  const reference = itemsPDeReference(run);
  const groupes = lecturesParComparateur(filtrerContexteRun(lectures), reference, comparateursDuRun(run));
  return new Map([...groupes].map(([outil_id, membres]) => [outil_id, membres.map((lecture) => noterLecture(lecture, notes))]));
}

function noterLecture(lecture: LectureComparateur, notes: ReadonlyMap<string, CategorieRetenue>): LectureNotee {
  const base = { lecture_id: lecture.id, grappe_id: lecture.reference_item.item_id };
  if (!lecture.affiche) return { ...base, affiche: false, categorie: null };
  const categorie = notes.get(lecture.id);
  if (categorie === undefined) {
    throw new Error(`Lecture affichée ${lecture.id} sans note retenue (verdict) : la compatibilité n'a pas été notée.`);
  }
  return { ...base, affiche: true, categorie };
}
