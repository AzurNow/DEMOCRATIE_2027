/**
 * Tirage stratifié des questions d'un run (candidat × thème × gabarit), avec compensation des
 * strates déficitaires et reprise du run précédent.
 *
 * §5 : « les questions sont tirées de façon aléatoire stratifiée (candidat × thème × gabarit)
 * avec une graine publiée, ce qui rend le tirage reproductible. 80 % des questions sont reprises
 * du run précédent, 20 % sont neuves. »
 *
 * Ce module porte l'algorithme et son orchestration (`tirer`) ; trois responsabilités voisines
 * vivent dans leur propre module, importé ici sans cycle (constat 15 de la revue du 2026-10-12) :
 * la tirabilité au gel (`tirabilite.ts`), les entrées publiées et la reprise (`entrees-tirage.ts`),
 * et la déclaration du générateur (`graine.ts`).
 *
 * **La compensation** (§5, protocole 0.9), seule règle propre à ce module. Pour chaque strate
 * thème × gabarit, la cible d'un candidat comparé (interrogé, au-dessus du seuil) est `min(quota,
 * max des questions disponibles parmi les candidats comparés)`. Son déficit est comblé par des
 * questions du MÊME gabarit prises dans ses autres thèmes, parmi celles que les strates n'ont pas
 * tirées, choisies par la graine (voir `compenser`). Si le déficit ne peut pas être comblé, rien
 * n'est forcé : le total du candidat diffère, et `symetrie.ts:nombreQuestionsParCandidat` refuse
 * le run. Chaque compensation est inscrite dans `tirage.compensations`. Un candidat sous le seuil
 * ou non interrogé n'est ni cible ni source de cette égalisation.
 *
 * Les deux quotas (par strate candidat × thème × gabarit, et d'attribution par thème) n'ont aucune
 * valeur dans le protocole : ce sont des paramètres obligatoires de l'appel, sans valeur par
 * défaut. Ils sont recopiés dans `tirage.parametres` (conformité n° 59) : avec la graine, le fichier
 * de tirage porte tout ce que le tirage lit en dehors des questions, des items, des mesures et du run.
 */

import type { GenerateurAleatoire } from "../../validation/domaine/alea.ts";
import { generateur, graineDepuisTexte, melanger } from "../../validation/domaine/alea.ts";
import { itemsPContestesAuGel } from "./couverture.ts";
import { entreeDe, precedenteSiReprise } from "./entrees-tirage.ts";
import type { TiragePrecedent } from "./entrees-tirage.ts";
import { verifierGraine } from "./graine.ts";
import { estCompare, indexer, separer, themeDeQuestion } from "./tirabilite.ts";
import type { Index } from "./tirabilite.ts";
import type {
  BilanReprise,
  CandidatAuGel,
  CodeGabarit,
  CompensationTirage,
  ContestesAuGel,
  EntreeTirage,
  GraineTirage,
  Item,
  Mesure,
  ParametresTirage,
  Question,
  RunAuGel,
  Theme,
  Tirage,
} from "./types.ts";

/** §5 : 80 % des questions sont reprises du run précédent, 20 % sont neuves. */
export const PART_REPRISE = 0.8;

export type { ParametresTirage } from "./types.ts";

export interface StrateVide {
  /** `null` pour les questions d'attribution, qui ne sont attribuables à aucun candidat. */
  readonly candidat_id: string | null;
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

export interface RapportTirage {
  readonly strates_vides: readonly StrateVide[];
  /** §4 : candidats sous 10 items P vérifiés, tirés mais hors des comparaisons inter-candidats. */
  readonly candidats_a_part: readonly string[];
  /** §3 : candidat retiré, conservé dans le jeu de données mais plus interrogé. */
  readonly candidats_non_interroges: readonly string[];
}

export interface ResultatTirage {
  readonly tirage: Tirage;
  readonly rapport: RapportTirage;
}

export interface DemandeTirage {
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly run: RunAuGel;
  readonly graine: GraineTirage;
  readonly parametres: ParametresTirage;
  readonly tirage_precedent?: TiragePrecedent;
}

export {
  ArbitrageSansDecision,
  contestationPermetLeTirage,
  DecisionPanelPosterieureAuGel,
  DecisionsPanelSimultanees,
} from "./contestation.ts";

/** Identifiant conventionnel du groupe des questions d'attribution, sans candidat. */
const GROUPE_ATTRIBUTION = "";

/**
 * Amorce du flux aléatoire du groupe d'attribution (§5). Exportée pour que `charger-perimetre.ts`
 * refuse un `candidat_id` homonyme (D55 (10), constat 42 de la revue du 2026-10-12) : un tel
 * candidat partagerait sinon son flux aléatoire avec le groupe d'attribution, puisque `amorce` ne
 * voit que cette chaîne, jamais `GROUPE_ATTRIBUTION` qu'aucun `candidat_id` ne peut prendre.
 */
export const AMORCE_GROUPE_ATTRIBUTION = "attribution";

/* ------------------------------------------------------------- strates */

interface Couple {
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
}

interface Strate extends Couple {
  readonly cle: string;
  readonly questions: readonly Question[];
}

function cleStrate(theme: Theme, gabarit: CodeGabarit): string {
  return `${theme}|${gabarit}`;
}

function comparer(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Univers des strates : tous les couples thème × gabarit observés dans le groupe, tous candidats
 * confondus. Une strate absente chez un candidat mais présente chez un autre est donc une strate
 * VIDE rapportée, et non une strate qui n'existe pas.
 */
function universDesStrates(questions: readonly Question[], index: Index): readonly Couple[] {
  const couples = new Map<string, Couple>();
  for (const question of questions) {
    const theme = themeDeQuestion(question, index);
    couples.set(cleStrate(theme, question.gabarit), { theme, gabarit: question.gabarit });
  }
  // Les clés sont triées avant tout tirage : l'ordre d'itération d'une Map suit l'ordre
  // d'insertion, donc l'ordre des fichiers lus, ce qui rendrait le tirage non reproductible.
  return [...couples.entries()].sort(([a], [b]) => comparer(a, b)).map(([, couple]) => couple);
}

function strates(univers: readonly Couple[], questions: readonly Question[], index: Index): readonly Strate[] {
  const parCle = new Map<string, Question[]>();
  for (const question of questions) {
    const cle = cleStrate(themeDeQuestion(question, index), question.gabarit);
    const groupe = parCle.get(cle);
    if (groupe === undefined) parCle.set(cle, [question]);
    else groupe.push(question);
  }
  return univers.map((couple) => {
    const cle = cleStrate(couple.theme, couple.gabarit);
    const trouvees = parCle.get(cle);
    return { cle, ...couple, questions: trouvees === undefined ? [] : [...trouvees].sort(parIdentifiant) };
  });
}

function parIdentifiant(a: Question, b: Question): number {
  return comparer(a.id, b.id);
}

/**
 * §5 (protocole 0.9) : « au regard de ce que les autres candidats comparés y reçoivent ». Par
 * strate, la cible d'un candidat comparé est `min(quota, max des questions disponibles parmi les
 * candidats comparés)`. Seuls les candidats comparés comptent : un candidat sous le seuil ou non
 * interrogé n'élève la cible de personne.
 */
function ciblesDesCompares(
  groupes: ReadonlyMap<string, readonly Question[]>,
  compares: readonly CandidatAuGel[],
  quota: number,
  index: Index,
): ReadonlyMap<string, number> {
  const cibles = new Map<string, number>();
  for (const candidat of compares) {
    for (const [cle, nombre] of disponiblesParStrate(questionsDuGroupe(groupes, candidat.candidat_id), index)) {
      const courante = cibles.get(cle);
      const cible = Math.min(quota, nombre);
      cibles.set(cle, courante === undefined ? cible : Math.max(courante, cible));
    }
  }
  return cibles;
}

function disponiblesParStrate(questions: readonly Question[], index: Index): ReadonlyMap<string, number> {
  const nombres = new Map<string, number>();
  for (const question of questions) {
    const cle = cleStrate(themeDeQuestion(question, index), question.gabarit);
    const courant = nombres.get(cle);
    nombres.set(cle, courant === undefined ? 1 : courant + 1);
  }
  return nombres;
}

/* --------------------------------------------------------- tirage d'un groupe */

interface DemandeGroupe {
  readonly identifiant: string;
  readonly questions: readonly Question[];
  readonly univers: readonly Couple[];
  readonly quota: number;
  /** Cibles par strate d'un candidat comparé ; `undefined` : aucune compensation. */
  readonly cibles: ReadonlyMap<string, number> | undefined;
  readonly eligible_a_la_reprise: boolean;
  readonly index: Index;
  readonly rng: GenerateurAleatoire;
  readonly precedent: TiragePrecedent | undefined;
}

interface ResultatGroupe {
  readonly choisies: readonly Question[];
  readonly strates_vides: readonly StrateVide[];
  readonly compensations: readonly CompensationTirage[];
  readonly cible: number;
  readonly budget_reprise: number;
}

/** Une strate du groupe, ce qu'elle tire d'elle-même et ce qui lui manque pour atteindre sa cible. */
interface Plan {
  readonly strate: Strate;
  readonly propre: number;
  readonly deficit: number;
}

function planifier(strate: Strate, demande: DemandeGroupe): Plan {
  const propre = Math.min(demande.quota, strate.questions.length);
  const cible = demande.cibles?.get(strate.cle);
  const deficit = cible === undefined ? 0 : Math.max(0, cible - propre);
  return { strate, propre, deficit };
}

/**
 * Par gabarit, ce que la compensation peut effectivement apporter : le déficit total du gabarit,
 * borné par les questions de ce gabarit que les strates laissent. Connu avant tout tirage, il fixe
 * la cible du groupe, donc le budget de reprise (§5 : le budget porte sur le total tiré).
 */
function compensable(plans: readonly Plan[]): number {
  const parGabarit = new Map<CodeGabarit, { deficit: number; surplus: number }>();
  for (const plan of plans) {
    const courant = parGabarit.get(plan.strate.gabarit);
    const surplus = plan.strate.questions.length - plan.propre;
    if (courant === undefined) parGabarit.set(plan.strate.gabarit, { deficit: plan.deficit, surplus });
    else parGabarit.set(plan.strate.gabarit, { deficit: courant.deficit + plan.deficit, surplus: courant.surplus + surplus });
  }
  return [...parGabarit.values()].reduce((total, { deficit, surplus }) => total + Math.min(deficit, surplus), 0);
}

function tirerGroupe(demande: DemandeGroupe): ResultatGroupe {
  const plans = strates(demande.univers, demande.questions, demande.index).map((strate) => planifier(strate, demande));
  const cible = plans.reduce((total, plan) => total + plan.propre, 0) + compensable(plans);
  // Arrondi par le bas, par groupe : voir l'en-tête du module.
  const budget = demande.eligible_a_la_reprise ? Math.floor(PART_REPRISE * cible) : 0;

  const vides: StrateVide[] = [];
  const choisies: Question[] = [];
  let restant = budget;
  for (const plan of melanger(plans, demande.rng)) {
    if (plan.strate.questions.length === 0) vides.push(strateVide(plan.strate, demande));
    const tirees = tirerParmi(plan.strate.questions, plan.propre, demande, restant);
    restant -= tirees.reprises_budgetees;
    choisies.push(...tirees.questions);
  }
  const compensation = compenser(plans, new Set(choisies), demande, restant);
  return {
    choisies: [...choisies, ...compensation.questions],
    strates_vides: vides,
    compensations: compensation.inscrites,
    cible,
    budget_reprise: budget,
  };
}

function strateVide(strate: Strate, demande: DemandeGroupe): StrateVide {
  const candidat_id = demande.identifiant === GROUPE_ATTRIBUTION ? null : demande.identifiant;
  return { candidat_id, theme: strate.theme, gabarit: strate.gabarit };
}

interface Compensation {
  readonly questions: readonly Question[];
  readonly inscrites: readonly CompensationTirage[];
}

/**
 * §5 (protocole 0.9) : le déficit d'une strate est comblé par des questions du même gabarit prises
 * dans les autres thèmes du candidat, parmi celles qu'aucune strate n'a tirées. Ordre déterministe,
 * documenté : les strates déficitaires sont servies dans l'ordre de leur clé `thème|gabarit`, après
 * le tirage de toutes les strates ; pour chacune, le réservoir restant de son gabarit (trié par
 * identifiant) est tiré par `tirerParmi`, avec le générateur du groupe et le budget de reprise
 * restant. Quand le réservoir ne suffit pas à tous les déficits d'un gabarit, les premières strates
 * dans cet ordre sont servies d'abord. Une strate déficitaire a déjà tiré toutes ses questions : le
 * réservoir ne contient que d'autres thèmes.
 */
function compenser(
  plans: readonly Plan[],
  dejaTirees: ReadonlySet<Question>,
  demande: DemandeGroupe,
  budget: number,
): Compensation {
  const questions: Question[] = [];
  const inscrites: CompensationTirage[] = [];
  let restant = budget;
  const deficitaires = plans.filter((plan) => plan.deficit > 0);
  const reservoirs = reservoirsParGabarit(plans, dejaTirees);
  for (const plan of deficitaires) {
    const reservoir = reservoirs.get(plan.strate.gabarit);
    if (reservoir === undefined) continue;
    const tirees = tirerParmi(reservoir, Math.min(plan.deficit, reservoir.length), demande, restant);
    restant -= tirees.reprises_budgetees;
    reservoirs.set(plan.strate.gabarit, reservoir.filter((question) => !tirees.questions.includes(question)));
    questions.push(...tirees.questions);
    inscrites.push(...tirees.questions.map((question) => inscrire(question, plan.strate, demande)));
  }
  return { questions, inscrites };
}

/** Par gabarit, les questions que les strates n'ont pas tirées, triées par identifiant. */
function reservoirsParGabarit(
  plans: readonly Plan[],
  dejaTirees: ReadonlySet<Question>,
): Map<CodeGabarit, readonly Question[]> {
  const reservoirs = new Map<CodeGabarit, Question[]>();
  for (const plan of plans) {
    const restantes = plan.strate.questions.filter((question) => !dejaTirees.has(question));
    const courant = reservoirs.get(plan.strate.gabarit);
    if (courant === undefined) reservoirs.set(plan.strate.gabarit, [...restantes]);
    else courant.push(...restantes);
  }
  for (const reservoir of reservoirs.values()) reservoir.sort(parIdentifiant);
  return reservoirs;
}

function inscrire(question: Question, deficitaire: Strate, demande: DemandeGroupe): CompensationTirage {
  return {
    candidat_id: demande.identifiant,
    gabarit: deficitaire.gabarit,
    theme_deficitaire: deficitaire.theme,
    question_id: question.id,
    theme_origine: themeDeQuestion(question, demande.index),
  };
}

interface TirageStrate {
  readonly questions: readonly Question[];
  /** Reprises imputées au budget du groupe. Le complément de secours n'y est pas compté. */
  readonly reprises_budgetees: number;
}

/**
 * Parmi des questions (une strate, ou le réservoir d'une compensation), les reprises passent
 * d'abord, tant que le budget du groupe n'est pas épuisé ; le complément vient des questions
 * neuves. Si les neuves ne suffisent pas, on complète par des reprises plutôt que de rendre la
 * strate incomplète : la symétrie du §5 compte les questions, pas leur fraîcheur. Ce complément est
 * le dépassement que `bilan_reprise` publie.
 */
function tirerParmi(
  questions: readonly Question[],
  aTirer: number,
  demande: DemandeGroupe,
  budget: number,
): TirageStrate {
  const estReprise = (question: Question): boolean => precedenteSiReprise(question, demande.precedent) !== undefined;

  const reprises = melanger(questions.filter(estReprise), demande.rng);
  const neuves = melanger(
    questions.filter((question) => !estReprise(question)),
    demande.rng,
  );

  const nombreReprises = Math.max(0, Math.min(aTirer, budget, reprises.length));
  const choisies = [...reprises.slice(0, nombreReprises)];
  choisies.push(...neuves.slice(0, aTirer - nombreReprises));
  const complement = reprises.slice(nombreReprises, nombreReprises + (aTirer - choisies.length));
  return { questions: [...choisies, ...complement], reprises_budgetees: nombreReprises };
}

/* ------------------------------------------------------------------ tirage */

/** Un quota est un entier ≥ 1, fourni par l'appelant : le protocole n'en fixe aucun. */
function verifierQuota(valeur: unknown, nom: keyof ParametresTirage, libelle: string): void {
  if (typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 1) return;
  throw new Error(
    `Quota ${libelle} (${nom}) invalide : ${String(valeur)}. ` +
      `Le protocole n'en fixe aucun ; il est fourni par l'appelant, jamais deviné.`,
  );
}

/** Les deux quotas employés, et eux seuls : ce que `tirage.schema.json` publie (conformité n° 59). */
function quotasPublies(parametres: ParametresTirage): ParametresTirage {
  return {
    questions_par_strate: parametres.questions_par_strate,
    questions_attribution_par_theme: parametres.questions_attribution_par_theme,
  };
}

export function tirer(demande: DemandeTirage): ResultatTirage {
  verifierGraine(demande.graine, "du tirage");
  verifierQuota(demande.parametres.questions_par_strate, "questions_par_strate", "par strate");
  verifierQuota(
    demande.parametres.questions_attribution_par_theme,
    "questions_attribution_par_theme",
    "d'attribution par thème",
  );

  const index = indexer(demande.items, demande.mesures);
  const interroges = demande.run.perimetre.candidats.filter((candidat) => candidat.interroge);
  const separation = separer(
    demande.questions,
    demande.items,
    index,
    demande.run,
    new Set(interroges.map((candidat) => candidat.candidat_id)),
  );
  const contestes = contestesAuGel(demande, interroges);
  const groupes = grouperParCandidat(separation.tirables, interroges);
  const contexte: ContexteTirage = {
    demande,
    index,
    groupes,
    univers: universDesStrates(questionsNommantUnCandidat(groupes), index),
    cibles: ciblesDesCompares(groupes, interroges.filter(estCompare), demande.parametres.questions_par_strate, index),
  };

  const resultats = [
    ...interroges.map((candidat) => tirerGroupeCandidat(contexte, candidat)),
    tirerGroupeAttribution(contexte),
  ];
  return {
    tirage: {
      run_id: demande.run.id,
      date_gel: demande.run.date_gel,
      graine_tirage: demande.graine,
      parametres: quotasPublies(demande.parametres),
      entrees: resultats.flatMap((resultat) => resultat.entrees),
      exclusions: separation.exclusions,
      contestes_au_gel: contestes,
      bilan_reprise: resultats.map((resultat) => resultat.bilan),
      compensations: resultats.flatMap((resultat) => resultat.compensations),
    },
    rapport: {
      strates_vides: resultats.flatMap((resultat) => resultat.strates_vides),
      candidats_a_part: interroges.filter((c) => c.sous_seuil).map((c) => c.candidat_id),
      candidats_non_interroges: demande.run.perimetre.candidats
        .filter((candidat) => !candidat.interroge)
        .map((candidat) => candidat.candidat_id),
    },
  };
}

/**
 * Décision de l'auteur du 2026-09-29, n° 8 : par candidat interrogé, zéro compris, les items P
 * vérifiés que leur contestation tient hors du tirage au gel. Compte par item, pas par question :
 * une question qu'un item contesté n'a pas engendrée n'est pas inventée pour être comptée. La règle
 * est celle de `couverture.ts`, lue sur les items et le référentiel au gel, sans la graine.
 */
function contestesAuGel(demande: DemandeTirage, interroges: readonly CandidatAuGel[]): readonly ContestesAuGel[] {
  return interroges
    .map((candidat) => candidat.candidat_id)
    .sort(comparer)
    .map((candidat_id) => ({
      candidat_id,
      item_ids: itemsPContestesAuGel(demande.items, candidat_id, demande.run.date_gel, demande.mesures),
    }));
}

interface ContexteTirage {
  readonly demande: DemandeTirage;
  readonly index: Index;
  readonly groupes: ReadonlyMap<string, readonly Question[]>;
  /** Strates thème × gabarit observées chez les candidats interrogés. */
  readonly univers: readonly Couple[];
  /** Cibles des candidats comparés, par strate (`ciblesDesCompares`). */
  readonly cibles: ReadonlyMap<string, number>;
}

function grouperParCandidat(
  questions: readonly Question[],
  interroges: readonly CandidatAuGel[],
): ReadonlyMap<string, readonly Question[]> {
  const groupes = new Map<string, Question[]>();
  groupes.set(GROUPE_ATTRIBUTION, []);
  for (const candidat of interroges) groupes.set(candidat.candidat_id, []);

  for (const question of questions) {
    const cle = question.candidat_id === undefined ? GROUPE_ATTRIBUTION : question.candidat_id;
    const groupe = groupes.get(cle);
    if (groupe !== undefined) groupe.push(question);
  }
  return groupes;
}

function questionsDuGroupe(
  groupes: ReadonlyMap<string, readonly Question[]>,
  identifiant: string,
): readonly Question[] {
  const groupe = groupes.get(identifiant);
  return groupe === undefined ? [] : groupe;
}

function questionsNommantUnCandidat(groupes: ReadonlyMap<string, readonly Question[]>): readonly Question[] {
  return [...groupes.keys()]
    .filter((cle) => cle !== GROUPE_ATTRIBUTION)
    .flatMap((cle) => questionsDuGroupe(groupes, cle));
}

interface ResultatPublie {
  readonly entrees: readonly EntreeTirage[];
  readonly strates_vides: readonly StrateVide[];
  readonly compensations: readonly CompensationTirage[];
  readonly bilan: BilanReprise;
}

function tirerGroupeCandidat(contexte: ContexteTirage, candidat: CandidatAuGel): ResultatPublie {
  const { demande } = contexte;
  const resultat = tirerGroupe({
    identifiant: candidat.candidat_id,
    questions: questionsDuGroupe(contexte.groupes, candidat.candidat_id),
    univers: contexte.univers,
    quota: demande.parametres.questions_par_strate,
    cibles: estCompare(candidat) ? contexte.cibles : undefined,
    // §5 et schema/README.md : un candidat « nouveau » est hors du calcul du ratio 80/20.
    eligible_a_la_reprise: demande.tirage_precedent !== undefined && candidat.statut_au_gel !== "nouveau",
    index: contexte.index,
    rng: generateur(amorceDuGroupe(demande, candidat.candidat_id)),
    precedent: demande.tirage_precedent,
  });
  return publier(contexte, resultat, { candidat_id: candidat.candidat_id });
}

/**
 * Les questions d'attribution forment leur propre groupe : §5 interdit de les attribuer à un
 * candidat, elles ne peuvent donc pas entrer dans une strate candidat × thème × gabarit. Leur
 * strate est le thème seul, leur quota le leur (§5, protocole 0.9), et le budget de reprise porte
 * sur l'ensemble du groupe. Aucune compensation : aucun candidat n'y est comparé.
 */
function tirerGroupeAttribution(contexte: ContexteTirage): ResultatPublie {
  const { demande } = contexte;
  const attributions = questionsDuGroupe(contexte.groupes, GROUPE_ATTRIBUTION);
  const resultat = tirerGroupe({
    identifiant: GROUPE_ATTRIBUTION,
    questions: attributions,
    univers: universDesStrates(attributions, contexte.index),
    quota: demande.parametres.questions_attribution_par_theme,
    cibles: undefined,
    eligible_a_la_reprise: demande.tirage_precedent !== undefined,
    index: contexte.index,
    rng: generateur(amorceDuGroupe(demande, undefined)),
    precedent: demande.tirage_precedent,
  });
  return publier(contexte, resultat, {});
}

function publier(
  contexte: ContexteTirage,
  resultat: ResultatGroupe,
  groupe: { readonly candidat_id?: string },
): ResultatPublie {
  const { demande } = contexte;
  const entrees = resultat.choisies.map((question) =>
    entreeDe(question, contexte.index, demande.run, demande.tirage_precedent),
  );
  const reprises = entrees.filter((entree) => entree.reprise).length;
  return {
    entrees,
    strates_vides: resultat.strates_vides,
    compensations: resultat.compensations,
    bilan: {
      ...groupe,
      cible: resultat.cible,
      budget_reprise: resultat.budget_reprise,
      reprises,
      depassement: Math.max(0, reprises - resultat.budget_reprise),
    },
  };
}

/**
 * Amorce textuelle du générateur, bâtie sur les seuls champs publiés : un tiers qui a le fichier
 * de tirage rejoue le tirage sans rien d'autre.
 */
function amorce(demande: DemandeTirage, groupe: string): bigint {
  return graineDepuisTexte(
    String(demande.graine.valeur),
    demande.graine.algorithme,
    demande.run.id,
    groupe,
  );
}

/**
 * Amorce du groupe candidat ou du groupe d'attribution, selon `candidat_id` : seul point commun
 * aux deux sites de tirage (`tirerGroupeCandidat`, `tirerGroupeAttribution`), exporté pour que le
 * test de collision (D55 (10), constat 42 de la revue du 2026-10-12) passe par le code réellement
 * utilisé au tirage plutôt que par deux appels isolés de `amorce`.
 */
export function amorceDuGroupe(demande: DemandeTirage, candidat_id: string | undefined): bigint {
  return amorce(demande, candidat_id === undefined ? AMORCE_GROUPE_ATTRIBUTION : candidat_id);
}
