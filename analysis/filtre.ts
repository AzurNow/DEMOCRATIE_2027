/**
 * Le filtre du §8, et l'assemblage des unités d'analyse.
 *
 * `contexte == "run"` est « la seule barrière » entre les réponses permutées du test
 * contrefactuel (§7) et un chiffre publié (schema/README.md). Elle vit ici, une fois.
 *
 * Aucune métrique ne lit un verdict ou une réponse : elles lisent des `UniteAnalyse`, et le seul
 * constructeur d'`UniteAnalyse` est `assembler`, qui applique le filtre. La barrière est donc
 * portée par le type, pas par la discipline de l'appelant.
 *
 * Les unités partent des **réponses obtenues** du run, pas des verdicts : c'est le dénominateur
 * « réponses obtenues » du §8. Chaque réponse obtenue doit porter exactement un verdict du run ;
 * une réponse obtenue sans verdict lève `ReponsesNonNotees` (qui les liste toutes), deux verdicts
 * sur un même objet lèvent `VerdictEnDouble`. Sans cela, une notation interrompue ou réécrite
 * sortirait des réponses du dénominateur, ou les y compterait deux fois, sans que rien ne le dise.
 * Une réponse manquante n'a pas de verdict et ne forme pas d'unité (§6).
 *
 * Tout ce qui ne peut pas être résolu lève : réponse introuvable, question introuvable, verdict
 * du run portant sur une réponse hors run, note portée sur une réponse manquante. Une donnée
 * absente reste absente et visible — jamais un enregistrement ignoré en silence.
 */

import type {
  Canal,
  ObjetNote,
  CategorieRetenue,
  ContexteMesure,
  Drapeau,
  EntreeTirage,
  Formulation,
  Gabarit,
  IdentifiantCourt,
  Item,
  ItemDeQuestion,
  Mode,
  Question,
  Registre,
  Reponse,
  Run,
  SourcageRetenu,
  Theme,
  TypeItem,
  Ulid,
  Verdict,
} from "./types.ts";

/**
 * Une réponse du run, notée, avec tout ce dont les métriques du §8 ont besoin — et rien d'autre.
 * Les champs à `null` disent une absence réelle : un thème non tiré, une Q-ATT sans candidat
 * (§5), une réponse du canal application qui n'a pas de mode (§6).
 */
export interface UniteAnalyse {
  readonly verdict_id: Ulid;
  readonly reponse_id: Ulid;
  readonly outil_id: IdentifiantCourt;
  readonly mode: Mode | null;
  readonly canal: Canal;
  readonly question_id: string;
  /**
   * §8 : la grappe du bootstrap, « la grappe étant l'item […], et la mesure pour une question
   * d'attribution » (protocole 0.9). Lue, jamais recalculée.
   */
  readonly grappe_id: Ulid;
  /** `null` : question d'attribution sur une mesure réelle, sans item principal (§5, 0.9). */
  readonly item_principal_id: Ulid | null;
  /**
   * Tous les items de la question, quel que soit leur rôle (principal, attendu_dans_liste,
   * distracteur, contexte), dans l'ordre de la question. §8 (protocole 0.9) : le recalcul (b)
   * exclut la question dès que l'un d'eux est contesté à un run ultérieur.
   */
  readonly item_ids: readonly Ulid[];
  readonly type_item_principal: TypeItem | null;
  readonly gabarit: Gabarit;
  readonly candidat_id: IdentifiantCourt | null;
  readonly theme: Theme | null;
  readonly registre: Registre;
  /** Le numéro d'échantillon de la réponse (`reponse.echantillon`, à partir de 1), lu tel quel. */
  readonly echantillon: number;
  /**
   * Formulation orientée : la vérité de sa prémisse au gel, lue dans le tirage
   * (`entree.premisse_fausse`, protocole 0.11), jamais sur la question. `null` pour une formulation
   * neutre ou familière, qui ne porte aucune prémisse.
   */
  readonly premisse_fausse: boolean | null;
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly obsolescence_fraiche: boolean | null;
  readonly sourcage: SourcageRetenu;
  readonly dans_echantillon_humain: boolean;
  /**
   * `normalise.troncature` d'une réponse du canal API. `null` pour le canal application, qui n'a
   * pas de troncature (§6, protocole 0.31) : le recalcul (d) ne porte que sur le canal API.
   */
  readonly tronquee: boolean | null;
}

export interface EntreesAnalyse {
  readonly run: Run;
  readonly entrees_tirage: readonly EntreeTirage[];
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly reponses: readonly Reponse[];
  readonly verdicts: readonly Verdict[];
}

/** Deux verdicts du run sur un même objet noté : lequel compte n'est pas à deviner. */
export class VerdictEnDouble extends Error {
  readonly objet: ObjetNote;
  readonly verdicts: readonly Ulid[];

  constructor(objet: ObjetNote, verdicts: readonly Ulid[]) {
    super(`Objet noté ${objet.type} ${objet.id} portant ${verdicts.length} verdicts du run : ${verdicts.join(", ")}.`);
    this.name = "VerdictEnDouble";
    this.objet = objet;
    this.verdicts = verdicts;
  }
}

/**
 * Un identifiant présent deux fois dans une entrée de l'analyse : garder l'une des deux ferait
 * dépendre la mesure de l'ordre du fichier. Deux entrées de tirage d'une même question aux
 * `premisse_fausse` différentes déplaceraient le dénominateur de la confirmation de prémisse (§8).
 */
export class IdentifiantEnDouble extends Error {
  constructor(nature: string, id: string, occurrences: number) {
    super(`${nature} ${id} présente ${occurrences} fois dans les entrées de l'analyse : laquelle compte n'est pas à deviner.`);
    this.name = "IdentifiantEnDouble";
  }
}

/**
 * Conformité n° 64 (§7, §8) : `au_moins_un_lien_soutenant` dit qu'un MÊME lien est vivant et
 * soutient l'affirmation (schema/verdict.schema.json) ; un lien vivant est un lien cité. Un verdict
 * qui conclut au soutien sans lien existant, ou qui trouve un lien existant sans citation, se
 * contredit : le sourçage valide ne le lit pas, et ne le compte pas non plus en silence.
 */
export class SourcageIncoherent extends Error {
  readonly verdict_id: Ulid;

  constructor(verdict: Verdict, detail: string) {
    super(`Verdict ${verdict.id} : sourçage retenu incohérent, ${detail} (§7, sourçage).`);
    this.name = "SourcageIncoherent";
    this.verdict_id = verdict.id;
  }
}

function verifierSourcage(verdict: Verdict): void {
  const sourcage = verdict.sourcage_retenu;
  if (sourcage.au_moins_un_lien_soutenant && !sourcage.au_moins_un_lien_existant) {
    throw new SourcageIncoherent(verdict, "un lien soutenant est déclaré sans aucun lien existant");
  }
  if (sourcage.au_moins_un_lien_existant && !sourcage.cite) {
    throw new SourcageIncoherent(verdict, "un lien existant est déclaré sur une réponse qui ne cite rien");
  }
}

/** Réponses obtenues du run sans verdict : elles appartiennent au dénominateur, il manque leur note. */
export class ReponsesNonNotees extends Error {
  readonly reponses: readonly Ulid[];

  constructor(reponses: readonly Ulid[]) {
    super(`${reponses.length} réponse(s) obtenue(s) du run sans verdict : ${reponses.join(", ")}.`);
    this.name = "ReponsesNonNotees";
    this.reponses = reponses;
  }
}

/**
 * Les verdicts du run portant sur un objet du type donné, indexés par objet noté. Un doublon lève.
 * Partagé par les réponses (`assembler`) et les lectures de comparateur (`metriques.ts`).
 */
export function indexerVerdictsDuRun(
  verdicts: readonly Verdict[],
  type: ObjetNote["type"],
): ReadonlyMap<Ulid, Verdict> {
  const index = new Map<Ulid, Verdict>();
  for (const verdict of filtrerContexteRun(verdicts)) {
    if (verdict.objet_note.type !== type) continue;
    const deja = index.get(verdict.objet_note.id);
    if (deja !== undefined) throw new VerdictEnDouble(verdict.objet_note, [deja.id, verdict.id]);
    index.set(verdict.objet_note.id, verdict);
  }
  return index;
}

export function estDuRun(objet: { readonly contexte: ContexteMesure }): boolean {
  return objet.contexte === "run";
}

export function filtrerContexteRun<T extends { readonly contexte: ContexteMesure }>(
  objets: readonly T[],
): T[] {
  return objets.filter(estDuRun);
}

interface IndexEntrees {
  readonly reponses: ReadonlyMap<string, Reponse>;
  readonly questions: ReadonlyMap<string, Question>;
  readonly tirage: ReadonlyMap<string, EntreeTirage>;
  readonly items: ReadonlyMap<string, Item>;
}

export function assembler(entrees: EntreesAnalyse): UniteAnalyse[] {
  const index = indexer(entrees);
  const verdicts = indexerVerdictsDuRun(entrees.verdicts, "reponse");
  for (const verdict of verdicts.values()) reponseNotee(verdict, index);
  const obtenues = filtrerContexteRun(entrees.reponses).filter((r) => r.statut_reponse === "obtenue");
  const nonNotees = obtenues.filter((r) => !verdicts.has(r.id)).map((r) => r.id);
  if (nonNotees.length > 0) throw new ReponsesNonNotees(nonNotees);
  return obtenues.map((reponse) => uniteDepuis(exiger(verdicts, reponse.id, "verdict"), reponse, index));
}

function indexer(entrees: EntreesAnalyse): IndexEntrees {
  return {
    reponses: indexUnique(entrees.reponses, (r) => r.id, "réponse"),
    questions: indexUnique(entrees.questions, (q) => q.id, "question"),
    tirage: indexUnique(entrees.entrees_tirage, (e) => e.question_id, "entrée de tirage"),
    items: indexUnique(entrees.items, (i) => i.id, "item"),
  };
}

function indexUnique<T>(objets: readonly T[], cle: (objet: T) => string, nature: string): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (const objet of objets) {
    const id = cle(objet);
    if (index.has(id)) throw new IdentifiantEnDouble(nature, id, objets.filter((autre) => cle(autre) === id).length);
    index.set(id, objet);
  }
  return index;
}

/**
 * §8 (protocole 0.3) : une réponse tronquée « est notée sur ce qu'elle contient et entre dans les
 * métriques primaires ». Elle est donc toujours assemblée ; `tronquee` reste porté par l'unité,
 * parce que le recalcul de robustesse (d) l'exclut (`robustesse.ts`).
 */
function uniteDepuis(verdict: Verdict, reponse: Reponse, index: IndexEntrees): UniteAnalyse {
  verifierSourcage(verdict);
  return composer(verdict, reponse, contexteQuestion(reponse, index), tronqueeDe(reponse));
}

/**
 * §6 (protocole 0.31, D73 (12)) : la troncature est celle du canal API, lue telle quelle ; une
 * saisie de l'application « ne porte ni mode ni caractère tronqué », et son unité porte `null`.
 * Le schéma `reponse` impose déjà les deux règles à la lecture d'un run ; elles sont redites ici
 * parce qu'`assembler` reçoit aussi des objets construits en mémoire.
 */
function tronqueeDe(reponse: Reponse): boolean | null {
  const { troncature } = projection(reponse);
  if (reponse.canal === "application") {
    if (troncature !== undefined) {
      throw new Error(`Réponse ${reponse.id} du canal application avec une troncature : elle n'en porte pas (§6, 0.31).`);
    }
    return null;
  }
  if (troncature === undefined) {
    throw new Error(`Réponse ${reponse.id} du canal API sans troncature : le drapeau ne se devine pas (§6).`);
  }
  return troncature;
}

/** La réponse que ce verdict note, ou une erreur disant laquelle des trois règles est violée. */
function reponseNotee(verdict: Verdict, index: IndexEntrees): Reponse {
  const reponse = exiger(index.reponses, verdict.objet_note.id, "réponse notée");
  if (!estDuRun(reponse)) {
    throw new Error(
      `Verdict ${verdict.id} du run portant sur une réponse de contexte ${reponse.contexte} : incohérence.`,
    );
  }
  if (reponse.statut_reponse !== "obtenue") {
    throw new Error(`Verdict ${verdict.id} portant sur une réponse manquante ${reponse.id} (§6).`);
  }
  return reponse;
}

function projection(reponse: Reponse): { readonly troncature?: boolean } {
  if (reponse.normalise === undefined) {
    throw new Error(`Réponse obtenue ${reponse.id} sans projection normalisée.`);
  }
  return reponse.normalise;
}

interface ContexteQuestion {
  readonly question: Question;
  readonly entree: EntreeTirage;
  readonly formulation: Formulation;
  readonly item: Item | null;
}

function contexteQuestion(reponse: Reponse, index: IndexEntrees): ContexteQuestion {
  const question = exiger(index.questions, reponse.question_id, "question");
  const entree = exiger(index.tirage, reponse.question_id, "entrée de tirage de la question");
  verifierCoherenceTirage(question, entree);
  const formulation = question.formulations.find((f) => f.id === reponse.formulation_id);
  if (formulation === undefined) {
    throw new Error(`Formulation ${reponse.formulation_id} absente de la question ${question.id}.`);
  }
  return { question, entree, formulation, item: itemPrincipal(question, index) };
}

/**
 * §5 (protocole 0.9) : seule une question d'attribution — celle qui ne porte aucun candidat — peut
 * n'avoir aucun item principal. L'absence est rendue telle quelle (`null`), jamais comblée par un
 * autre item de la question.
 */
function itemPrincipal(question: Question, index: IndexEntrees): Item | null {
  const principal = question.items.find((i: ItemDeQuestion) => i.role === "principal");
  if (principal !== undefined) return exiger(index.items, principal.reference.item_id, "item principal");
  if (question.candidat_id === undefined) return null;
  throw new Error(`Question ${question.id} sans item principal alors qu'elle nomme un candidat.`);
}

function verifierCoherenceTirage(question: Question, entree: EntreeTirage): void {
  if (question.gabarit !== entree.gabarit) {
    throw new Error(`Gabarit divergent pour ${question.id} : ${question.gabarit} / ${entree.gabarit}.`);
  }
  if (question.candidat_id !== entree.candidat_id) {
    throw new Error(`Candidat divergent pour la question ${question.id} entre question et tirage.`);
  }
}

function composer(
  verdict: Verdict,
  reponse: Reponse,
  contexte: ContexteQuestion,
  tronquee: boolean | null,
): UniteAnalyse {
  const { question, entree, formulation, item } = contexte;
  return {
    verdict_id: verdict.id,
    reponse_id: reponse.id,
    outil_id: reponse.outil_id,
    mode: reponse.mode === undefined ? null : reponse.mode,
    canal: reponse.canal,
    question_id: question.id,
    grappe_id: question.grappe_id,
    item_principal_id: item === null ? null : item.id,
    item_ids: question.items.map((entree) => entree.reference.item_id),
    type_item_principal: item === null ? null : item.type,
    gabarit: question.gabarit,
    candidat_id: question.candidat_id === undefined ? null : question.candidat_id,
    theme: entree.theme === undefined ? null : entree.theme,
    registre: formulation.registre,
    echantillon: reponse.echantillon,
    premisse_fausse: formulation.registre === "oriente" ? entree.premisse_fausse : null,
    categorie: verdict.categorie_retenue,
    drapeaux: verdict.drapeaux_retenus,
    obsolescence_fraiche: verdict.obsolescence_fraiche === undefined ? null : verdict.obsolescence_fraiche,
    sourcage: verdict.sourcage_retenu,
    dans_echantillon_humain: verdict.dans_echantillon_humain,
    tronquee,
  };
}

function exiger<T>(index: ReadonlyMap<string, T>, cle: string, quoi: string): T {
  const valeur = index.get(cle);
  if (valeur === undefined) throw new Error(`${quoi} introuvable : ${cle}`);
  return valeur;
}
