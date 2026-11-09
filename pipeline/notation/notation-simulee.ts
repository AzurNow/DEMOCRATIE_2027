/**
 * La notation simulée de `pnpm notation:dry` : la chaîne de notation du §7 (`chaine.ts`), la vraie,
 * de bout en bout, sur le run d'interrogation simulé de `pnpm run:dry`, avec les deux seuls
 * éléments simulés : les juges (`juge-simule.ts`) et le fournisseur d'existences des liens
 * (`fournisseur-simule.ts`). Aucun modèle, aucun appel réseau.
 *
 * Étapes :
 *
 * 1. **Garde-fou.** Une sortie sous `runs/` est refusée avant toute écriture (`gardes-sortie.ts`).
 * 2. **Interrogation simulée.** `lancerRunSimule` (celle de `pnpm run:dry`) écrit le run, ou le
 *    reprend sans rien réécrire s'il est déjà là : `pnpm run:dry --sortie=X` puis
 *    `pnpm notation:dry --sortie=X` notent le même run.
 * 3. **Gel simulé.** `pnpm run:dry` n'écrit que le volume ; la notation lit aussi `run.json`,
 *    `questions.json` et `tirage.json` (réponse attendue et prémisse résolues au gel, que la charge
 *    v3 transmet, D27). Ils sont posés depuis les fixtures, par ouverture exclusive : un fichier déjà
 *    là n'est jamais réécrit, et il doit être celui des fixtures (pour `run.json`, aux champs écrits
 *    après le gel près, `analysis/champs-posterieurs-au-gel.ts`), sinon `GelDivergent`.
 * 4. **Lecture.** Le run, les questions, les réponses obtenues du contexte `run`, chaque fichier
 *    validé contre son schéma (`analysis/lecture-run.ts`), et les items épinglés. Les items d'un run
 *    simulé ne sont pas dans `data/` (aucun item fictif n'y entre, règle 3) : ils sont lus dans les
 *    fixtures, validés contre `schema/item.schema.json`, et chacun doit porter l'identifiant, la
 *    version et l'empreinte qu'épingle sa question (`ItemEpingleIntrouvable` sinon), comme
 *    `lireItemsEpingles` l'exige au commit du gel pour un vrai run.
 *    Chaque réponse est préparée par `preparation.ts:preparerANoter`, la fonction que la notation
 *    humaine emploie aussi (constat 21, D18).
 * 5. **Notation** (`noterRun`), puis **bilan** relu du disque (`bilan-notation.ts`).
 *
 * **Run gelé simulé** (`lancerNotationDuGelSimule`, `pnpm notation:dry --run`, D80). Le run gelé par
 * `pnpm geler --simule` et interrogé par `pnpm run:dry --run` est noté dans son propre répertoire,
 * sans étape 2 ni 3 : `run.json`, `questions.json` et `tirage.json` sont ceux du gel. Un run réel
 * (sans `simule: true`) est refusé avant toute écriture (`pipeline/run/simulation.ts:GelNonSimule`),
 * et ses items ne se lisent que dans le dépôt simulé désigné, au commit des données du gel, par la
 * lecture d'un vrai run (`lireItemsEpingles`), jamais dans les fixtures.
 *
 * Les paramètres (`notation-simulee.json` des fixtures) sont lus et contrôlés à la frontière :
 * l'instant posé sur les notations et les verdicts, les juges simulés et leur répartition, la table
 * des existences.
 */

import { constants, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dispositionRunNote, ItemEpingleIntrouvable, lireDossier, lireItemsEpingles, lireRunJson, lireTirage, type RunLu } from "../../analysis/lecture-run.ts";
import { reponsesObtenuesDuRun } from "../../analysis/population-notation.ts";
import type { Instant } from "../../analysis/types.ts";
import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { lancerRunSimule, type ResultatRunSimule } from "../interrogation/run-simule.ts";
import type { ReponseEcrite } from "../interrogation/types.ts";
import type { EntreeTirage, Question } from "../questions/types.ts";
import { bilanNotation, type BilanNotation } from "./bilan-notation.ts";
import { noterRun, type EnvironnementChaine, type ReponseANoter, type ResultatChaine } from "./chaine.ts";
import { resolusAuGel } from "./charge-juge.ts";
import { fournisseurSimule, type TexteSimule } from "./fournisseur-simule.ts";
import { exigerHorsDeRuns } from "../gardes-sortie.ts";
import { repertoireDesItemsDuRunSimule } from "../run/simulation.ts";
import { memeGel } from "../../analysis/champs-posterieurs-au-gel.ts";
import { interrogesDuRun, preparerANoter, type GelDeNotation } from "./preparation.ts";
import { jugesSimules, type BiaisSimule, type JugeSimuleDeclare, type ParametresJugeSimule } from "./juge-simule.ts";
import type { ExistenceEtablie } from "./vue-annotateur.ts";

export interface ParametresNotationSimulee {
  /** L'instant posé sur chaque notation et chaque verdict : fixe, pour que deux exécutions se rejouent. */
  readonly date_notation: Instant;
  readonly juge_simule: ParametresJugeSimule;
  readonly existences: readonly ExistenceEtablie[];
  /** Texte extrait (ou refus) de chaque copie conservée, par empreinte (D27 (E)). */
  readonly textes_copies: readonly TexteSimule[];
}

export interface OptionsNotationSimulee {
  /** Racine sous laquelle le run est disposé (`<racine>/<date>/…`), jamais sous `runs/`. */
  readonly sortie: string;
  /** Fixtures de `pnpm run:dry` : `perimetre.yaml`, `questions.json`, `run-simule.json`. */
  readonly fixtures_interrogation: string;
  /** Fixtures de la notation : `run.json`, `items/`. */
  readonly fixtures_notation: string;
}

export interface RunSimulePrepare {
  readonly interrogation: ResultatRunSimule;
  readonly repertoire_run: string;
  readonly reponses: readonly ReponseANoter[];
}

/** Ce que rend toute notation simulée, quel que soit son mode. */
export interface NotationSimuleeFaite {
  readonly repertoire_run: string;
  readonly reponses: readonly ReponseANoter[];
  readonly resultat: ResultatChaine;
  readonly bilan: BilanNotation;
}

export interface ResultatNotationSimulee extends RunSimulePrepare, NotationSimuleeFaite {}

export class GelDivergent extends Error {
  constructor(chemin: string) {
    super(`${chemin} existe et n'est pas celui des fixtures du run simulé : rien n'est réécrit.`);
    this.name = "GelDivergent";
  }
}

export class ParametresSimulesInvalides extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : ${detail}`);
    this.name = "ParametresSimulesInvalides";
  }
}

/* ------------------------------------------------------------------ enchaînement */

export async function lancerNotationSimulee(options: OptionsNotationSimulee, parametres: ParametresNotationSimulee): Promise<ResultatNotationSimulee> {
  const prepare = await preparerNotationSimulee(options);
  const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametres));
  const bilan = bilanNotation(prepare.repertoire_run, resultat, prepare.reponses.map((r) => r.reponse.id));
  return { ...prepare, resultat, bilan };
}

/** Étapes 1 à 4 : le run simulé interrogé, gelé, lu ; rien n'est encore noté. */
export async function preparerNotationSimulee(options: OptionsNotationSimulee): Promise<RunSimulePrepare> {
  exigerHorsDeRuns(options.sortie);
  const interrogation = await lancerRunSimule({ sortie: options.sortie, fixtures: options.fixtures_interrogation });
  const repertoire_run = interrogation.disposition.run;
  poserGel(repertoire_run, options);
  const items = join(options.fixtures_notation, "items");
  return { interrogation, repertoire_run, reponses: lireReponsesANoter(repertoire_run, (questions) => lireItemsDesFixtures(questions, items)) };
}

export interface OptionsNotationDuGelSimule {
  /** Le répertoire `<sortie>/<date>/` gelé par `pnpm geler --simule`, interrogé par `pnpm run:dry --run`. */
  readonly repertoire_run: string;
  /** `--depot-des-items` : la racine du dépôt simulé (`<sortie>/depot-simule/`) ; `null` est refusé. */
  readonly depot_des_items: string | null;
}

/**
 * D80 : la notation simulée d'un run gelé simulé, dans son propre répertoire. Refuse, avant toute
 * écriture, un répertoire sous `runs/`, un run réel (`GelNonSimule`), un run sans dépôt des items
 * désigné (`ItemsDuRunSimuleNonDesignes`) et un dépôt que D75 (13) refuse.
 */
export async function lancerNotationDuGelSimule(options: OptionsNotationDuGelSimule, parametres: ParametresNotationSimulee): Promise<NotationSimuleeFaite> {
  const { repertoire_run } = options;
  exigerHorsDeRuns(repertoire_run);
  const { items } = repertoireDesItemsDuRunSimule(repertoire_run, options.depot_des_items, "pnpm notation:dry --run");
  const reponses = lireReponsesANoter(repertoire_run, itemsAuCommitDuGel(items));
  const resultat = await noterRun(reponses, environnementSimule(repertoire_run, parametres));
  const bilan = bilanNotation(repertoire_run, resultat, reponses.map((r) => r.reponse.id));
  return { repertoire_run, reponses, resultat, bilan };
}

/** Les deux éléments simulés, et l'horloge figée. */
export function environnementSimule(repertoire_run: string, parametres: ParametresNotationSimulee): EnvironnementChaine {
  return {
    repertoire_run,
    juges: jugesSimules(parametres.juge_simule, repertoire_run),
    existences: fournisseurSimule(parametres.existences, parametres.textes_copies, repertoire_run),
    maintenant: () => parametres.date_notation,
  };
}

/* ------------------------------------------------------------------ gel simulé */

function poserGel(repertoire_run: string, options: OptionsNotationSimulee): void {
  const disposition = dispositionRunNote(repertoire_run);
  poserFichier(join(options.fixtures_interrogation, "questions.json"), disposition.questions, (lu, source) => lu === source);
  // D27 : la charge v3 recopie la réponse attendue et la prémisse que le tirage a résolues au gel.
  poserFichier(join(options.fixtures_notation, "tirage.json"), join(repertoire_run, "tirage.json"), (lu, source) => lu === source);
  poserFichier(join(options.fixtures_notation, "run.json"), disposition.run_json, memeRunAuGel);
}

function poserFichier(source: string, cible: string, identiques: (lu: string, source: string) => boolean): void {
  if (!existsSync(cible)) {
    copyFileSync(source, cible, constants.COPYFILE_EXCL);
    return;
  }
  if (!identiques(readFileSync(cible, "utf8"), readFileSync(source, "utf8"))) throw new GelDivergent(cible);
}

/**
 * `run.json` est celui des fixtures hors de tout ce qui s'écrit après le gel (notation, go/no-go,
 * statut, publication, dépôt, invalidation, contestations postérieures) : la liste vit dans
 * `analysis/champs-posterieurs-au-gel.ts`, une seule fois.
 */
function memeRunAuGel(lu: string, source: string): boolean {
  return memeGel(JSON.parse(lu) as object, JSON.parse(source) as object);
}

/* ------------------------------------------------------------------ lecture */

/** Les items épinglés par les questions du run, indexés par identifiant : où ils se lisent dépend du mode. */
type LireItems = (questions: readonly Question[], run: RunLu, chemin_questions: string) => ReadonlyMap<string, Item>;

function lireReponsesANoter(repertoire_run: string, lireItems: LireItems): readonly ReponseANoter[] {
  const run = lireRunJson(repertoire_run);
  const disposition = dispositionRunNote(repertoire_run);
  const questions = lireQuestions(disposition.questions);
  const items = lireItems(questions, run, disposition.questions);
  // `lireTirage` a validé tirage.json contre son schéma, qui exige reponse_attendue et premisse_fausse de chaque entrée.
  const resolus = resolusAuGel(lireTirage(repertoire_run, run).entrees as unknown as readonly EntreeTirage[]);
  const gel: GelDeNotation = { questions: new Map(questions.map((q) => [q.id, q])), items, resolus, interroges: interrogesDuRun(run) };
  // La préparation partagée avec la notation humaine (constat 21, D18) : items des seuls interrogés (§7, D56 (1)).
  return reponsesObtenuesDuRun(lireDossier<ReponseEcrite>(disposition.reponses, "reponse", run.id)).map((reponse) => preparerANoter(reponse, gel));
}

function lireQuestions(chemin: string): readonly Question[] {
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!Array.isArray(brut)) throw new ParametresSimulesInvalides(chemin, "un tableau de questions est attendu.");
  return brut.map((question: unknown, rang) => valider<Question>("question", question, `${chemin}, élément ${rang}`));
}

/**
 * D80 : les items d'un run gelé simulé, lus au commit des données du gel dans le dépôt simulé, par la
 * lecture d'un vrai run (`lireItemsEpingles` : identifiant, version et empreinte épinglés vérifiés).
 */
function itemsAuCommitDuGel(repertoire_items: string): LireItems {
  // `lireItemsEpingles` valide chaque item contre `item.schema.json` : l'objet lu est un item complet.
  return (questions, run, chemin_questions) =>
    new Map(lireItemsEpingles(questions, repertoire_items, run.versions.donnees_commit, chemin_questions).map((item) => [item.id, item as unknown as Item]));
}

function lireItemsDesFixtures(questions: readonly Question[], repertoire_items: string): ReadonlyMap<string, Item> {
  const items = new Map<string, Item>();
  for (const { reference } of questions.flatMap((q) => q.items)) {
    if (items.has(reference.item_id)) continue;
    const chemin = join(repertoire_items, `${reference.item_id}.json`);
    if (!existsSync(chemin)) throw new ItemEpingleIntrouvable(reference, `${chemin} absent des fixtures`);
    const item = valider<Item>("item", JSON.parse(readFileSync(chemin, "utf8")), chemin);
    if (item.id !== reference.item_id || item.version !== reference.item_version || item.empreinte !== reference.item_empreinte) {
      throw new ItemEpingleIntrouvable(reference, `${chemin} porte l'item ${item.id} à la version ${item.version} (empreinte ${item.empreinte})`);
    }
    items.set(item.id, item);
  }
  return items;
}

/* ------------------------------------------------------------------ paramètres */

type Objet = Readonly<Record<string, unknown>>;

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function exigerObjet(valeur: unknown, chemin: string, quoi: string): Objet {
  if (!estObjet(valeur)) throw new ParametresSimulesInvalides(chemin, `« ${quoi} » n'est pas un objet.`);
  return valeur;
}

function exigerTexte(objet: Objet, cle: string, chemin: string): string {
  const valeur = objet[cle];
  if (typeof valeur !== "string" || valeur.length === 0) throw new ParametresSimulesInvalides(chemin, `« ${cle} » absent ou vide.`);
  return valeur;
}

function exigerNombre(objet: Objet, cle: string, chemin: string): number {
  const valeur = objet[cle];
  if (typeof valeur !== "number" || !Number.isFinite(valeur)) throw new ParametresSimulesInvalides(chemin, `« ${cle} » n'est pas un nombre.`);
  return valeur;
}

function exigerListe(objet: Objet, cle: string, chemin: string): readonly unknown[] {
  const valeur = objet[cle];
  if (!Array.isArray(valeur)) throw new ParametresSimulesInvalides(chemin, `« ${cle} » n'est pas une liste.`);
  return valeur;
}

export function lireParametresNotationSimulee(chemin: string): ParametresNotationSimulee {
  const brut = exigerObjet(JSON.parse(readFileSync(chemin, "utf8")), chemin, "racine");
  const date_notation = exigerTexte(brut, "date_notation", chemin);
  validerFragment("notation", "#/properties/date", date_notation, `${chemin}#/date_notation`);
  return {
    date_notation,
    juge_simule: lireJugeSimule(exigerObjet(brut["juge_simule"], chemin, "juge_simule"), chemin),
    existences: exigerListe(brut, "existences", chemin).map((e) => exigerObjet(e, chemin, "existences[]") as unknown as ExistenceEtablie),
    textes_copies: exigerListe(brut, "textes_copies", chemin).map((t) => lireTexteSimule(exigerObjet(t, chemin, "textes_copies[]"), chemin)),
  };
}

function lireTexteSimule(objet: Objet, chemin: string): TexteSimule {
  const sha256_contenu = exigerTexte(objet, "sha256_contenu", chemin);
  const issue = exigerTexte(objet, "issue", chemin);
  if (issue === "extrait") return { sha256_contenu, issue, texte: exigerTexte(objet, "texte", chemin) };
  if (issue === "refuse") return { sha256_contenu, issue, motif: exigerTexte(objet, "motif", chemin) };
  throw new ParametresSimulesInvalides(chemin, `textes_copies[] : issue « ${issue} », « extrait » ou « refuse » attendu.`);
}

function lireJugeSimule(objet: Objet, chemin: string): ParametresJugeSimule {
  return {
    graine: exigerNombre(objet, "graine", chemin),
    repartition: lirePoids(objet["repartition"], chemin),
    repartition_par_item: lirePoidsParItem(exigerObjet(objet["repartition_par_item"], chemin, "juge_simule.repartition_par_item"), chemin),
    juges: exigerListe(objet, "juges", chemin).map((j) => lireJugeDeclare(exigerObjet(j, chemin, "juge_simule.juges[]"), chemin)),
  };
}

function lirePoidsParItem(objet: Objet, chemin: string): Readonly<Record<string, Readonly<Record<string, number>>>> {
  return Object.fromEntries(Object.keys(objet).map((item_id) => [item_id, lirePoids(objet[item_id], chemin)]));
}

function lirePoids(valeur: unknown, chemin: string): Readonly<Record<string, number>> {
  const poids = exigerObjet(valeur, chemin, "juge_simule.repartition");
  return Object.fromEntries(Object.keys(poids).map((nom) => [nom, exigerNombre(poids, nom, chemin)]));
}

function lireJugeDeclare(objet: Objet, chemin: string): JugeSimuleDeclare {
  const role = exigerTexte(objet, "role", chemin);
  if (role !== "a" && role !== "b") throw new ParametresSimulesInvalides(chemin, `rôle « ${role} » : « a » ou « b » attendu.`);
  if (!("biais" in objet)) throw new ParametresSimulesInvalides(chemin, "« biais » absent : null pour aucun biais, jamais par défaut.");
  return {
    juge_id: exigerTexte(objet, "juge_id", chemin),
    famille_modele: exigerTexte(objet, "famille_modele", chemin),
    modele: exigerTexte(objet, "modele", chemin),
    role,
    biais: objet["biais"] === null ? null : lireBiais(exigerObjet(objet["biais"], chemin, "biais"), chemin),
  };
}

function lireBiais(objet: Objet, chemin: string): BiaisSimule {
  const candidats = exigerListe(objet, "candidats", chemin);
  if (!candidats.every((c): c is string => typeof c === "string")) throw new ParametresSimulesInvalides(chemin, "« biais.candidats » : des identifiants attendus.");
  return { candidats, taux: exigerNombre(objet, "taux", chemin) };
}
