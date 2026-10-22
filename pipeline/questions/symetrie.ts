/**
 * Garanties de symétrie du §5, vérifiées sur un tirage gelé.
 *
 * « Le pipeline refuse de lancer un run si l'une de ces conditions échoue. » Le refus remonte
 * donc intact jusqu'à `statut_global`, et aucune condition rouge ne se perd dans un agrégat
 * permissif : une seule suffit à rendre le tout rouge.
 *
 * Une condition n'est pas binaire : la répartition par thème, dont le §5 dit « répartition par
 * thème identique par candidat quand les items le permettent ; sinon, l'écart est imprimé dans
 * le rapport du run ». Un écart que les items permettaient d'éviter est rouge (constat n° 23) ;
 * un écart que les items imposaient vaut `ecart_tolere`, et il est écrit dans les données — un
 * écart imprimé dans un rapport mais absent des données serait un chiffre du site sans fichier
 * source.
 *
 * `nombre_questions_par_candidat` porte sur les cinq gabarits hors Q-ATT : le même §5 interdit
 * d'attribuer une question d'attribution à un candidat (`schema/README.md`, point ouvert 2).
 */

import { exigerJeuComplet, exigerTirageDuRun } from "./completude.ts";
import { decisionAvantGel, decisionReintegre } from "./contestation.ts";
import { gabaritParCode } from "./gabarits.ts";
import { nomsCherchesEnAttribution, trouverLibelle } from "./libelles.ts";
import type {
  CodeCondition,
  CompensationTirage,
  ConditionSymetrie,
  DetailCandidat,
  EntreeTirage,
  Item,
  ItemAuGel,
  Question,
  Registre,
  RunAuGel,
  StatutSymetrie,
  Symetrie,
  Tirage,
} from "./types.ts";
import { REGISTRES } from "./types.ts";
import type { CodeGabarit, Mesure, Theme } from "./types.ts";
import { cleStrateCandidat, estCompare, tirablesParStrate } from "./tirabilite.ts";

/** §5 : les items d'absence et fictifs constituent au moins 20 % des questions de chaque run. */
export const PART_MINIMALE_ITEMS_A_F = 0.2;

/** §5 : « même répartition des gabarits et des formulations par candidat, à une question près ». */
export const ECART_MAXIMAL_GABARITS = 1;

interface Contexte {
  readonly entrees: readonly EntreeTirage[];
  /** L'instant du gel du tirage : borne des décisions du panel qu'il a figées. */
  readonly date_gel: string;
  readonly questions: ReadonlyMap<string, Question>;
  readonly items: ReadonlyMap<string, Item>;
  /** Candidats comparés : interrogés et au-dessus du seuil de couverture (§4). */
  readonly compares: readonly string[];
  readonly libelles: readonly string[];
  /** Les compensations inscrites dans le tirage (§5, protocole 0.9), jugées par `repartition_themes`. */
  readonly compensations: readonly CompensationTirage[];
  /** Les questions compensatrices, clé `candidat|question` : elles ne comptent pas dans leur strate d'origine. */
  readonly compensatrices: ReadonlySet<string>;
  /** Quota de questions par strate candidat × thème × gabarit, publié avec le tirage. */
  readonly quota: number;
  /**
   * Questions tirables au gel par strate candidat × thème × gabarit (constat n° 23), calculées à la
   * demande : seule `repartition_themes` les lit.
   */
  readonly tirables: () => ReadonlyMap<string, number>;
}

/**
 * `questions` : le jeu complet des questions engendrées au gel, pas seulement les tirées — la
 * répartition par thème juge le tirage contre ce que les items permettaient (constat n° 23). Un jeu
 * incomplet lève `JeuDeQuestionsIncomplet` avant tout verdict (§5, protocole 0.13 ; `completude.ts`), et un
 * tirage d'un autre run, ou d'une autre date de gel, `TirageDUnAutreRun` (conformité n° 9).
 * `items` : les items au gel. `mesures` : le référentiel, qui porte le thème d'une question non tirée.
 */
export function verifierSymetrie(
  tirage: Tirage,
  questions: readonly Question[],
  items: readonly Item[],
  mesures: readonly Mesure[],
  run: RunAuGel,
): Symetrie {
  exigerTirageDuRun(tirage, run);
  const contexte = construireContexte(tirage, { questions, items, mesures }, run);
  exigerJeuComplet(tirage, questions, items, run);
  const conditions: readonly ConditionSymetrie[] = [
    nombreQuestionsParCandidat(contexte),
    repartitionGabaritsFormulations(contexte),
    repartitionThemes(contexte),
    aucunItemContesteOuEnAttente(contexte),
    aucunNomCandidatDansQAtt(contexte),
    partItemsAFMinimale(contexte),
    quotaParStrateRespecte(contexte),
  ];
  return { statut_global: agreger(conditions), conditions };
}

interface Corpus {
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
}

function construireContexte(tirage: Tirage, corpus: Corpus, run: RunAuGel): Contexte {
  const { questions, items } = corpus;
  const parId = new Map(questions.map((question) => [question.id, question]));
  for (const entree of tirage.entrees) {
    if (!parId.has(entree.question_id)) {
      throw new Error(`Question ${entree.question_id} du tirage introuvable dans les questions.`);
    }
  }
  const perimetre = run.perimetre.candidats;
  return {
    entrees: tirage.entrees,
    date_gel: tirage.date_gel,
    questions: parId,
    items: new Map(items.map((item) => [item.id, item])),
    compares: perimetre
      .filter((candidat) => estCompare(candidat))
      .map((candidat) => candidat.candidat_id),
    libelles: nomsCherchesEnAttribution(perimetre),
    compensations: tirage.compensations,
    compensatrices: new Set(tirage.compensations.map((c) => `${c.candidat_id}|${c.question_id}`)),
    quota: tirage.parametres.questions_par_strate,
    tirables: memoriser(() => tirablesParStrate(questions, items, corpus.mesures, run)),
  };
}

/** Calcule une fois, à la première demande : sur un tirage sans retard ni compensation, jamais. */
function memoriser<T>(calcul: () => T): () => T {
  let valeur: { readonly resultat: T } | undefined;
  return () => {
    valeur ??= { resultat: calcul() };
    return valeur.resultat;
  };
}

function agreger(conditions: readonly ConditionSymetrie[]): StatutSymetrie {
  if (conditions.some((condition) => condition.statut === "rouge")) return "rouge";
  if (conditions.some((condition) => condition.statut === "ecart_tolere")) return "ecart_tolere";
  return "vert";
}

/* ------------------------------------------------------------- comptages */

function questionDe(contexte: Contexte, entree: EntreeTirage): Question {
  const question = contexte.questions.get(entree.question_id);
  if (question === undefined) {
    throw new Error(`Question ${entree.question_id} du tirage introuvable dans les questions.`);
  }
  return question;
}

/** Entrées attribuables à un candidat comparé, donc hors Q-ATT par construction. */
function entreesComparees(contexte: Contexte): readonly EntreeTirage[] {
  return contexte.entrees.filter(
    (entree) =>
      entree.candidat_id !== undefined && contexte.compares.includes(entree.candidat_id),
  );
}

/**
 * Table candidat → clé → effectif. Une entrée peut compter dans plusieurs clés : une question
 * porte trois formulations, donc trois couples gabarit × registre.
 */
function compterPar(
  entrees: readonly EntreeTirage[],
  compares: readonly string[],
  cles: (entree: EntreeTirage) => readonly string[],
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const table = new Map<string, Map<string, number>>();
  for (const candidat of compares) table.set(candidat, new Map());
  for (const entree of entrees) {
    if (entree.candidat_id === undefined) continue;
    const parCandidat = table.get(entree.candidat_id);
    if (parCandidat === undefined) continue;
    for (const cle of cles(entree)) incrementer(parCandidat, cle);
  }
  return table;
}

function incrementer(compteur: Map<string, number>, cle: string): void {
  const courant = compteur.get(cle);
  compteur.set(cle, courant === undefined ? 1 : courant + 1);
}

function effectif(table: ReadonlyMap<string, ReadonlyMap<string, number>>, candidat: string, cle: string): number {
  const parCandidat = table.get(candidat);
  if (parCandidat === undefined) return 0;
  const valeur = parCandidat.get(cle);
  return valeur === undefined ? 0 : valeur;
}

function clesObservees(table: ReadonlyMap<string, ReadonlyMap<string, number>>): readonly string[] {
  const cles = new Set<string>();
  for (const parCandidat of table.values()) for (const cle of parCandidat.keys()) cles.add(cle);
  return [...cles].sort();
}

function ecartMaximal(
  table: ReadonlyMap<string, ReadonlyMap<string, number>>,
  compares: readonly string[],
): number {
  let maximum = 0;
  for (const cle of clesObservees(table)) {
    const effectifs = compares.map((candidat) => effectif(table, candidat, cle));
    maximum = Math.max(maximum, Math.max(...effectifs) - Math.min(...effectifs));
  }
  return maximum;
}

/* ------------------------------------------------------------ conditions */

function nombreQuestionsParCandidat(contexte: Contexte): ConditionSymetrie {
  const comparees = entreesComparees(contexte);
  const comptes = contexte.compares.map(
    (candidat) => comparees.filter((entree) => entree.candidat_id === candidat).length,
  );
  const ecart = comptes.length < 2 ? 0 : Math.max(...comptes) - Math.min(...comptes);
  return {
    code: "nombre_questions_par_candidat",
    statut: ecart === 0 ? "vert" : "rouge",
    mesure: ecart,
    seuil: 0,
  };
}

function repartitionGabaritsFormulations(contexte: Contexte): ConditionSymetrie {
  const table = compterPar(entreesComparees(contexte), contexte.compares, (entree) =>
    clesGabaritRegistre(contexte, entree),
  );
  const ecart = ecartMaximal(table, contexte.compares);
  return {
    code: "repartition_gabarits_formulations",
    statut: ecart <= ECART_MAXIMAL_GABARITS ? "vert" : "rouge",
    mesure: ecart,
    seuil: ECART_MAXIMAL_GABARITS,
  };
}

/**
 * Une entrée compte une fois par registre effectivement porté par sa question : un registre
 * manquant creuse l'écart au lieu de passer inaperçu. §5 traite gabarits et formulations dans
 * la même phrase, d'où une clé par couple.
 */
function clesGabaritRegistre(contexte: Contexte, entree: EntreeTirage): readonly string[] {
  const question = questionDe(contexte, entree);
  return REGISTRES.filter((registre: Registre) =>
    question.formulations.some((formulation) => formulation.registre === registre),
  ).map((registre) => `${entree.gabarit}|${registre}`);
}

/**
 * §5 (protocole 0.13) : « La condition se juge strate par strate (thème × gabarit), sans compter dans
 * leur thème d'origine les questions reçues par compensation. » Le jugement des retards, sur les
 * questions propres, et le contrôle des compensations inscrites ont lieu quel que soit l'écart des
 * totaux par thème : deux compensations croisées rendent ces totaux égaux sans rien réparer
 * (conformité 2026-09-29, n° 8). L'écart imprimé (`mesure`, `detail_par_candidat`) reste celui des
 * totaux par thème du tirage.
 */
function repartitionThemes(contexte: Contexte): ConditionSymetrie {
  const table = compterPar(entreesComparees(contexte), contexte.compares, (entree) => [entree.theme]);
  const ecart = ecartMaximal(table, contexte.compares);
  const socle = {
    code: "repartition_themes" as const,
    mesure: ecart,
    seuil: 0,
    detail_par_candidat: detailParTheme(table, contexte.compares),
  };
  const fautes = fautesDeRepartition(contexte);
  if (fautes.length > 0) return { ...socle, statut: "rouge", commentaire: fautes.join(" ") };
  if (ecart === 0) return { code: "repartition_themes", statut: "vert", mesure: 0, seuil: 0 };
  return {
    ...socle,
    statut: "ecart_tolere",
    commentaire:
      "Écart imprimé dans le rapport du run : les items disponibles ne permettent pas une " +
      `répartition identique (§5). ${contexte.compensations.length} compensation(s) inscrite(s) dans ` +
      "le tirage (même gabarit, autre thème, §5, protocole 0.9).",
  };
}

/** Les deux motifs de rouge de la condition, chacun en une phrase ; vide si aucun. */
function fautesDeRepartition(contexte: Contexte): readonly string[] {
  const retards = retardsEvitables(contexte);
  const compensations = compensationsInjustifiees(contexte);
  return [
    ...(retards.length === 0
      ? []
      : [
          "Répartition par thème non identique alors que les items le permettaient (§5, constats " +
            `n° 23 et 8) : ${retards.join(" ; ")}.`,
        ]),
    ...(compensations.length === 0
      ? []
      : [`Compensation(s) inscrite(s) sans déficit qui les justifie (§5, protocole 0.9) : ${compensations.join(" ; ")}.`]),
  ];
}

/**
 * Constat n° 23. Le §5 tire par strate candidat × thème × gabarit, et comble une strate déficitaire
 * par le même gabarit sur un autre thème (protocole 0.9). « Les items le permettent » se juge donc
 * strate par strate, sur les questions PROPRES de chaque strate (hors questions compensatrices, qui
 * comptent dans leur thème d'origine sans y avoir été tirées pour lui) : un candidat en retard sur
 * un thème est fautif si, dans une strate de ce thème, il a reçu moins de questions propres que le
 * mieux servi des candidats comparés alors que ses questions tirables de cette strate auraient suffi
 * à l'égaler. Le retard sur un thème se lit lui aussi sur les questions propres (décision de
 * l'auteur du 2026-10-01, conformité n° 8) : deux compensations croisées ne le masquent plus, et un
 * échange de gabarit sur un même item, que la répartition des gabarits tolère à une question près,
 * ne le crée pas. Un retard que seules des questions non tirables (contestées, hors validité…) auraient
 * comblé, ou qu'impose la compensation d'un autre candidat, reste toléré.
 */
function retardsEvitables(contexte: Contexte): readonly string[] {
  const entrees = entreesPropres(contexte);
  const parTheme = compterPar(entrees, contexte.compares, (entree) => [entree.theme]);
  const enRetard = (candidat: string, theme: Theme) => estEnRetard(parTheme, contexte.compares, candidat, theme);
  const propres = compterPar(entrees, contexte.compares, (entree) => [`${entree.theme}|${entree.gabarit}`]);
  const strates = clesObservees(propres).map((cle) => {
    const [theme, gabarit] = cle.split("|") as [Theme, CodeGabarit];
    const strate: StrateJugee = { theme, gabarit, plafond: plafondDe(propres, contexte.compares, cle) };
    return { cle, strate, candidats: contexte.compares.filter((candidat) => enRetard(candidat, theme)) };
  });
  if (strates.every(({ candidats }) => candidats.length === 0)) return [];
  const tirables = contexte.tirables();
  return strates.flatMap(({ cle, strate, candidats }) =>
    candidats.flatMap((candidat) =>
      retardDansStrate(strate, effectif(propres, candidat, cle), tirablesDe(tirables, candidat, strate), candidat),
    ),
  );
}

/** En retard sur un thème : moins de questions PROPRES que le mieux servi des candidats comparés. */
function estEnRetard(
  parTheme: ReadonlyMap<string, ReadonlyMap<string, number>>,
  compares: readonly string[],
  candidat: string,
  theme: Theme,
): boolean {
  return effectif(parTheme, candidat, theme) < plafondDe(parTheme, compares, theme);
}

interface StrateJugee {
  readonly theme: Theme;
  readonly gabarit: CodeGabarit;
  /** Le plus grand nombre de questions propres reçu dans la strate par un candidat comparé. */
  readonly plafond: number;
}

function retardDansStrate(strate: StrateJugee, recues: number, tirables: number, candidat: string): readonly string[] {
  if (recues >= strate.plafond || tirables < strate.plafond) return [];
  return [
    `${candidat}, ${strate.theme} × ${strate.gabarit} : ${recues} question(s) reçue(s) contre ${strate.plafond}, ` +
      `${tirables} tirable(s)`,
  ];
}

/** Entrées comparées tirées pour leur propre strate : les questions compensatrices en sont retirées. */
function entreesPropres(contexte: Contexte): readonly EntreeTirage[] {
  return entreesComparees(contexte).filter(
    (entree) => !contexte.compensatrices.has(`${String(entree.candidat_id)}|${entree.question_id}`),
  );
}

function plafondDe(table: ReadonlyMap<string, ReadonlyMap<string, number>>, compares: readonly string[], cle: string): number {
  return Math.max(...compares.map((candidat) => effectif(table, candidat, cle)));
}

function tirablesDe(tirables: ReadonlyMap<string, number>, candidat: string, strate: StrateJugee): number {
  const nombre = tirables.get(cleStrateCandidat(candidat, strate.theme, strate.gabarit));
  return nombre === undefined ? 0 : nombre;
}

/* ------------------------------------------------- compensations inscrites */

/**
 * §5 (protocole 0.9) : « Une strate vide ou incomplète chez un candidat comparé, au regard de ce que
 * les autres candidats comparés y reçoivent, est compensée par des questions du même gabarit sur
 * d'autres thèmes de ce candidat. » Une compensation inscrite est donc refusée si elle ne désigne pas
 * une entrée du candidat, du même gabarit, venue d'un autre thème, ou si la strate qu'elle compense
 * n'avait pas de déficit à combler — ou moins qu'elle n'en reçoit. Le déficit se recalcule ici depuis
 * les questions tirables, sans relire les compensations que `tirage.ts` a inscrites : la barrière
 * doit attraper un tirage fautif d'où qu'il vienne (conformité 2026-09-29, n° 8).
 */
function compensationsInjustifiees(contexte: Contexte): readonly string[] {
  if (contexte.compensations.length === 0) return [];
  const tirables = contexte.tirables();
  const parStrate = new Map<string, CompensationTirage[]>();
  for (const compensation of contexte.compensations) {
    const cle = cleStrateCandidat(compensation.candidat_id, compensation.theme_deficitaire, compensation.gabarit);
    const groupe = parStrate.get(cle);
    if (groupe === undefined) parStrate.set(cle, [compensation]);
    else groupe.push(compensation);
  }
  return [
    ...contexte.compensations.flatMap((compensation) => defautDeCompensation(contexte, compensation)),
    ...[...parStrate.values()].flatMap((groupe) => excesDeCompensation(contexte, tirables, groupe)),
  ];
}

function nommer(compensation: CompensationTirage): string {
  return (
    `compensation de ${compensation.candidat_id} en ${compensation.theme_deficitaire} × ${compensation.gabarit} ` +
    `(${compensation.question_id})`
  );
}

/** Ce qu'une compensation affirme de son entrée, confronté au tirage. */
function defautDeCompensation(contexte: Contexte, compensation: CompensationTirage): readonly string[] {
  if (!contexte.compares.includes(compensation.candidat_id)) return [`${nommer(compensation)} : candidat non comparé`];
  if (compensation.theme_origine === compensation.theme_deficitaire) {
    return [`${nommer(compensation)} : thème d'origine égal au thème déficitaire`];
  }
  const entree = contexte.entrees.find(
    (candidate) => candidate.question_id === compensation.question_id && candidate.candidat_id === compensation.candidat_id,
  );
  if (entree === undefined) return [`${nommer(compensation)} : aucune entrée de ce candidat pour cette question`];
  if (entree.gabarit !== compensation.gabarit || entree.theme !== compensation.theme_origine) {
    return [
      `${nommer(compensation)} : l'entrée est ${entree.theme} × ${entree.gabarit}, ` +
        `pas ${compensation.theme_origine} × ${compensation.gabarit}`,
    ];
  }
  return [];
}

/**
 * Le déficit d'une strate du candidat : sa cible, `min(quota, max des tirables parmi les comparés)`,
 * moins ce que ses propres tirables lui donnaient, `min(quota, tirables)`. Les compensations d'une
 * strate sans déficit sont nommées une à une ; celles qui dépassent un déficit, comptées.
 */
function excesDeCompensation(
  contexte: Contexte,
  tirables: ReadonlyMap<string, number>,
  groupe: readonly CompensationTirage[],
): readonly string[] {
  const [premiere] = groupe;
  if (premiere === undefined) return [];
  const strate: StrateJugee = { theme: premiere.theme_deficitaire, gabarit: premiere.gabarit, plafond: 0 };
  const disponibles = contexte.compares.map((candidat) => tirablesDe(tirables, candidat, strate));
  const cible = Math.min(contexte.quota, Math.max(0, ...disponibles));
  const siennes = tirablesDe(tirables, premiere.candidat_id, strate);
  const deficit = Math.max(0, cible - Math.min(contexte.quota, siennes));
  if (deficit === 0) {
    return groupe.map((compensation) => `${nommer(compensation)} sans déficit : cible ${cible}, ${siennes} tirable(s)`);
  }
  if (groupe.length <= deficit) return [];
  return [
    `${groupe.length} compensations de ${premiere.candidat_id} en ${strate.theme} × ${strate.gabarit}, ` +
      `au-delà du déficit (${deficit})`,
  ];
}

/** Par candidat, son plus grand excédent sur le candidat le moins fourni d'un même thème. */
function detailParTheme(
  table: ReadonlyMap<string, ReadonlyMap<string, number>>,
  compares: readonly string[],
): readonly DetailCandidat[] {
  const themes = clesObservees(table);
  const planchers = new Map(
    themes.map((theme) => [theme, Math.min(...compares.map((c) => effectif(table, c, theme)))]),
  );
  return compares.map((candidat) => ({
    candidat_id: candidat,
    valeur: Math.max(
      0,
      ...themes.map((theme) => effectif(table, candidat, theme) - (planchers.get(theme) as number)),
    ),
  }));
}

function aucunItemContesteOuEnAttente(contexte: Contexte): ConditionSymetrie {
  for (const entree of contexte.entrees) {
    for (const item of entree.items_au_gel) {
      const motif = motifDExclusion(item, contexte.date_gel);
      if (motif === null) continue;
      return {
        code: "aucun_item_conteste_ou_en_attente",
        statut: "rouge",
        commentaire: `Item ${item.reference.item_id} dans la question ${entree.question_id} : ${motif}.`,
      };
    }
  }
  return { code: "aucun_item_conteste_ou_en_attente", statut: "vert" };
}

/**
 * §5 : « aucun item contesté ou en attente dans le tirage ». Tout se lit dans le tirage, figé au
 * gel, et rien dans les items courants : une contestation ou une décision postérieure au gel ne
 * rend pas rétroactivement le tirage fautif (`tirage.schema.json`). Un item `arbitree` au gel
 * n'est ni contesté ni en attente si la décision figée le réintègre (§5, protocole 0.3 ; annexe E,
 * point 6), selon la règle unique de `contestation.ts`.
 */
function motifDExclusion(item: ItemAuGel, date_gel: string): string | null {
  const validation = item.statut_validation_au_gel;
  const contestation = item.statut_contestation_au_gel;
  if (validation !== "verifie") return `statut de validation « ${validation} »`;
  if (contestation === "arbitree") return motifDArbitrage(item, date_gel);
  if (item.decision_panel_au_gel !== undefined) return "décision du panel figée sur un item non arbitré";
  if (contestation === "aucune") return null;
  return `statut de contestation « ${contestation} »`;
}

function motifDArbitrage(item: ItemAuGel, date_gel: string): string | null {
  const decision = item.decision_panel_au_gel;
  if (decision === undefined) return "arbitré sans décision du panel figée au gel";
  if (!decisionAvantGel(decision, date_gel)) {
    return `arbitré, décision du panel datée ${decision.date}, postérieure au gel`;
  }
  if (decisionReintegre(decision.decision, item.reference.item_id)) return null;
  return `arbitré, dernière décision du panel « ${decision.decision} »`;
}

/**
 * Les questions d'attribution se reconnaissent à la donnée `nomme_candidat` de la table des
 * gabarits, jamais à leur code : ce sont les seules dont le texte ne doit nommer personne.
 */
function aucunNomCandidatDansQAtt(contexte: Contexte): ConditionSymetrie {
  const attributions = contexte.entrees.filter(
    (entree) => !gabaritParCode(entree.gabarit).nomme_candidat,
  );
  for (const entree of attributions) {
    const question = questionDe(contexte, entree);
    for (const formulation of question.formulations) {
      const libelle = trouverLibelle(formulation.texte, contexte.libelles);
      if (libelle === null) continue;
      return {
        code: "aucun_nom_candidat_dans_q_att",
        statut: "rouge",
        commentaire: `Question ${question.id}, formulation ${formulation.registre} : « ${libelle} ».`,
      };
    }
  }
  return { code: "aucun_nom_candidat_dans_q_att", statut: "vert" };
}

/**
 * §5 : « Tirage stratifié par candidat × thème × gabarit », le quota par strate étant publié avec le
 * tirage (`parametres.questions_par_strate`). Décision de l'auteur du 2026-10-01 : aucune strate ne
 * reçoit plus de questions propres que ce quota. Sans ce contrôle, un tirage qui déplace une question
 * d'une strate à l'autre au sein d'un thème garde des totaux égaux par thème, par gabarit et par
 * candidat, et passe `repartition_themes` (`docs/DETTE.md`, 2026-10-01, point 1). Les questions
 * compensatrices sont hors de leur strate d'origine : elles ont été prises sur son surplus, et
 * `repartition_themes` vérifie qu'elles répondent à un déficit. Tous les candidats du tirage sont
 * comptés, comparés ou non : le quota vaut pour chacun. Les questions d'attribution, sans candidat,
 * ont leur propre quota par thème et ne sont pas jugées ici.
 */
function quotaParStrateRespecte(contexte: Contexte): ConditionSymetrie {
  const comptes = new Map<string, number>();
  for (const entree of contexte.entrees) {
    if (entree.candidat_id === undefined) continue;
    if (contexte.compensatrices.has(`${entree.candidat_id}|${entree.question_id}`)) continue;
    incrementer(comptes, cleStrateCandidat(entree.candidat_id, entree.theme, entree.gabarit));
  }
  const depassements = [...comptes]
    .filter(([, nombre]) => nombre > contexte.quota)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([cle, nombre]) => {
      const [candidat, theme, gabarit] = cle.split("|");
      return `${String(candidat)}, ${String(theme)} × ${String(gabarit)} : ${nombre} question(s) propre(s)`;
    });
  const mesure = Math.max(0, ...comptes.values());
  const socle = { code: "quota_par_strate_respecte" as const, mesure, seuil: contexte.quota };
  if (depassements.length === 0) return { ...socle, statut: "vert" };
  return {
    ...socle,
    statut: "rouge",
    commentaire:
      `Strate(s) au-delà du quota de ${contexte.quota} question(s) par candidat × thème × gabarit ` +
      `(§5, décision de l'auteur du 2026-10-01) : ${depassements.join(" ; ")}.`,
  };
}

/**
 * §5 : les items A et F « constituent au moins 20 % des questions de chaque run ». Un tirage vide
 * n'a pas de part : 0/0 n'est pas une part atteinte, et un run sans question n'est pas un run
 * (conformité n° 60). La condition est rouge, sans mesure, et le refus ne dépend plus du seul
 * `tirage.schema.json`, que `verifierSymetrie` ne lit pas.
 */
function partItemsAFMinimale(contexte: Contexte): ConditionSymetrie {
  const total = contexte.entrees.length;
  if (total === 0) {
    return {
      code: "part_items_a_f_minimale",
      statut: "rouge",
      seuil: PART_MINIMALE_ITEMS_A_F,
      commentaire: "tirage vide : la part des items A et F n'est pas définie, et un run sans question ne part pas.",
    };
  }
  const absencesEtFictifs = contexte.entrees.filter((entree) => {
    const type = typePrincipal(contexte, entree);
    return type !== null && ["A", "F"].includes(type);
  }).length;
  // Comparaison en entiers : 0,2 n'est pas représentable exactement en binaire, et la frontière
  // du §5 est justement ce qui est testé.
  const atteint = absencesEtFictifs * 5 >= total;
  return {
    code: "part_items_a_f_minimale",
    statut: atteint ? "vert" : "rouge",
    mesure: absencesEtFictifs / total,
    seuil: PART_MINIMALE_ITEMS_A_F,
  };
}

/**
 * Le type de l'item principal, lu dans `items_au_gel` et non dans `grappe_id`, qui désigne la
 * mesure pour une question d'attribution (§5, protocole 0.9). Une Q-ATT sans principal (mesure
 * réelle) porte des items P et O : elle n'est ni une question d'absence ni une question de
 * fabrication, et vaut `null` ici, comme valait « P » son item principal avant la 0.9.
 */
function typePrincipal(contexte: Contexte, entree: EntreeTirage): string | null {
  const principal = entree.items_au_gel.find((item) => item.role === "principal");
  if (principal === undefined) return null;
  const item = contexte.items.get(principal.reference.item_id);
  if (item === undefined) {
    throw new Error(`Item ${principal.reference.item_id} de la question ${entree.question_id} introuvable.`);
  }
  return item.type;
}

/* --------------------------------------------------------------- lecture */

export function conditionDeSymetrie(
  symetrie: Symetrie,
  code: CodeCondition,
): ConditionSymetrie | undefined {
  return symetrie.conditions.find((condition) => condition.code === code);
}
