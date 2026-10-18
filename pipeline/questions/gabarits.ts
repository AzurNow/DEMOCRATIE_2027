/**
 * Les six gabarits de l'annexe B, comme données chargées depuis `prompts/`.
 *
 * §5 (protocole 0.3) : les gabarits sont « publiés en annexe et versionnés dans `prompts/` : ce
 * sont des données du protocole, pas du code, et une modification de gabarit se lit dans
 * l'historique du fichier comme une modification de prompt ». La table vit donc dans
 * `prompts/gabarits-1.0.0.json`, décrite par `schema/gabarits.schema.json`, et ce module ne fait
 * que la lire et en vérifier la forme à la frontière. Il n'existe aucune table de repli en dur :
 * un fichier absent ou mal formé arrête l'import, il ne se remplace pas.
 *
 * Le texte porté est la formulation NEUTRE, dérivée mot pour mot de l'annexe B. Les formulations
 * familière et orientée sont « produites par un modèle puis relues par un annotateur » (§5).
 *
 * `positions_exclues` porte en données la règle du §5 : « une position conditionnelle n'engendre
 * ni question fermée ni question négative […] La restriction vit dans la table des gabarits, en
 * données, jamais dans un cas particulier du code. » Q-ORI porte la même exclusion (décision de
 * l'auteur du 2026-09-22). L'engendrement l'applique sans connaître aucun code de gabarit.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CodeGabarit, Position, TypeItem } from "./types.ts";
import { CODES_GABARIT, POSITIONS } from "./types.ts";

export interface Gabarit {
  readonly code: CodeGabarit;
  /** Texte neutre à trous : `[candidat]` et `[mesure]`. */
  readonly texte_neutre: string;
  /** Types d'item pour lesquels l'annexe B admet ce gabarit. */
  readonly types_admis: readonly TypeItem[];
  /** §5 : seule Q-ATT ne nomme aucun candidat. */
  readonly nomme_candidat: boolean;
  /** Un item qui porte l'une de ces positions n'engendre pas ce gabarit (§5, protocole 0.3). */
  readonly positions_exclues: readonly Position[];
}

export interface TableGabarits {
  readonly version: string;
  readonly gabarits: readonly Gabarit[];
}

/** Version attendue du fichier : celle que porte son nom. Un écart est un refus, pas un choix. */
const VERSION_FICHIER = "1.0.0";
const FICHIER_GABARITS = new URL(`../../prompts/gabarits-${VERSION_FICHIER}.json`, import.meta.url);

export const EMPLACEMENT_CANDIDAT = "[candidat]";
export const EMPLACEMENT_MESURE = "[mesure]";

/* ------------------------------------------------------ frontière d'entrée */

/** Levée au chargement quand le fichier de gabarits n'a pas la forme du schéma. */
export class TableGabaritsInvalide extends Error {
  constructor(detail: string) {
    super(`Table de gabarits invalide (prompts/gabarits-${VERSION_FICHIER}.json) : ${detail}`);
    this.name = "TableGabaritsInvalide";
  }
}

/** Exhaustif par construction : un type ajouté à `TypeItem` sans être listé ici ne compile pas. */
const TYPES_ITEM: Readonly<Record<TypeItem, true>> = { P: true, A: true, O: true, F: true };
const CHAMPS_GABARIT = [
  "code",
  "texte_neutre",
  "types_admis",
  "nomme_candidat",
  "positions_exclues",
] as const;
const CHAMPS_TABLE = ["version", "gabarits"] as const;

function objetDe(valeur: unknown, contexte: string): Record<string, unknown> {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    throw new TableGabaritsInvalide(`${contexte} n'est pas un objet.`);
  }
  return valeur as Record<string, unknown>;
}

/** `additionalProperties: false` et `required` du schéma : un champ mal orthographié ne passe pas. */
function verifierChamps(
  objet: Record<string, unknown>,
  attendus: readonly string[],
  contexte: string,
): void {
  for (const cle of Object.keys(objet)) {
    if (!attendus.includes(cle)) throw new TableGabaritsInvalide(`${contexte}.${cle} inconnu.`);
  }
  for (const cle of attendus) {
    if (!(cle in objet)) throw new TableGabaritsInvalide(`${contexte}.${cle} manquant.`);
  }
}

function texteDe(valeur: unknown, contexte: string): string {
  if (typeof valeur !== "string" || valeur.length === 0) {
    throw new TableGabaritsInvalide(`${contexte} doit être un texte non vide.`);
  }
  return valeur;
}

/** Une liste sans doublon dont chaque élément appartient à l'énumération donnée. */
function listeDe<T extends string>(
  valeur: unknown,
  admis: (element: string) => element is T,
  contexte: string,
): readonly T[] {
  if (!Array.isArray(valeur)) throw new TableGabaritsInvalide(`${contexte} n'est pas une liste.`);
  const elements = valeur as readonly unknown[];
  for (const element of elements) {
    if (typeof element !== "string" || !admis(element)) {
      throw new TableGabaritsInvalide(`${contexte} : « ${String(element)} » hors énumération.`);
    }
  }
  if (new Set(elements).size !== elements.length) {
    throw new TableGabaritsInvalide(`${contexte} porte un doublon.`);
  }
  return elements as readonly T[];
}

function estCodeGabarit(valeur: string): valeur is CodeGabarit {
  return (CODES_GABARIT as readonly string[]).includes(valeur);
}

function estTypeItem(valeur: string): valeur is TypeItem {
  return Object.hasOwn(TYPES_ITEM, valeur);
}

function estPosition(valeur: string): valeur is Position {
  return (POSITIONS as readonly string[]).includes(valeur);
}

function codeDe(valeur: unknown, contexte: string): CodeGabarit {
  const code = texteDe(valeur, contexte);
  if (!estCodeGabarit(code)) throw new TableGabaritsInvalide(`${contexte} « ${code} » inconnu.`);
  return code;
}

function booleenDe(valeur: unknown, contexte: string): boolean {
  if (typeof valeur !== "boolean") throw new TableGabaritsInvalide(`${contexte} n'est pas booléen.`);
  return valeur;
}

/** Le schéma exige `[mesure]` partout, et `[candidat]` si et seulement si le gabarit nomme. */
function verifierEmplacements(gabarit: Gabarit, contexte: string): Gabarit {
  if (!gabarit.texte_neutre.includes(EMPLACEMENT_MESURE)) {
    throw new TableGabaritsInvalide(`${contexte}.texte_neutre sans ${EMPLACEMENT_MESURE}.`);
  }
  if (gabarit.texte_neutre.includes(EMPLACEMENT_CANDIDAT) !== gabarit.nomme_candidat) {
    throw new TableGabaritsInvalide(
      `${contexte}.texte_neutre et nomme_candidat se contredisent sur ${EMPLACEMENT_CANDIDAT}.`,
    );
  }
  return gabarit;
}

function gabaritDe(brut: unknown, rang: number): Gabarit {
  const contexte = `gabarits[${rang}]`;
  const objet = objetDe(brut, contexte);
  verifierChamps(objet, CHAMPS_GABARIT, contexte);
  const types_admis = listeDe(objet["types_admis"], estTypeItem, `${contexte}.types_admis`);
  if (types_admis.length === 0) throw new TableGabaritsInvalide(`${contexte}.types_admis vide.`);
  return verifierEmplacements(champsDe(objet, contexte, types_admis), contexte);
}

function champsDe(
  objet: Record<string, unknown>,
  contexte: string,
  types_admis: readonly TypeItem[],
): Gabarit {
  return {
    code: codeDe(objet["code"], `${contexte}.code`),
    texte_neutre: texteDe(objet["texte_neutre"], `${contexte}.texte_neutre`),
    types_admis,
    nomme_candidat: booleenDe(objet["nomme_candidat"], `${contexte}.nomme_candidat`),
    positions_exclues: listeDe(
      objet["positions_exclues"],
      estPosition,
      `${contexte}.positions_exclues`,
    ),
  };
}

/** Les six codes de l'annexe B, chacun exactement une fois : ni absent, ni en double. */
function verifierCodes(gabarits: readonly Gabarit[]): void {
  const presents = gabarits.map((gabarit) => gabarit.code).sort();
  const attendus = [...CODES_GABARIT].sort();
  if (presents.join("|") !== attendus.join("|")) {
    throw new TableGabaritsInvalide(
      `codes ${presents.join(", ")} au lieu des six de l'annexe B, une fois chacun.`,
    );
  }
}

/** Vérifie la forme de `schema/gabarits.schema.json` sur une valeur lue, et la rend typée. */
export function validerTableGabarits(brut: unknown): TableGabarits {
  const table = objetDe(brut, "la table");
  verifierChamps(table, CHAMPS_TABLE, "table");
  if (table["version"] !== VERSION_FICHIER) {
    throw new TableGabaritsInvalide(
      `version « ${String(table["version"])} » alors que le fichier chargé est la ${VERSION_FICHIER}.`,
    );
  }
  const liste = table["gabarits"];
  if (!Array.isArray(liste)) throw new TableGabaritsInvalide("table.gabarits n'est pas une liste.");
  const gabarits = (liste as readonly unknown[]).map(gabaritDe);
  verifierCodes(gabarits);
  return { version: VERSION_FICHIER, gabarits };
}

function chargerTableGabarits(fichier: URL): TableGabarits {
  const brut: unknown = JSON.parse(readFileSync(fileURLToPath(fichier), "utf8"));
  return validerTableGabarits(brut);
}

const TABLE = chargerTableGabarits(FICHIER_GABARITS);

/**
 * Version de la table, épinglée dans chaque question engendrée (`question.version_gabarits`).
 * Elle nomme le fichier de `prompts/` dont les gabarits sont tirés.
 */
export const VERSION_GABARITS = `prompts/gabarits-${TABLE.version}`;

export const GABARITS: readonly Gabarit[] = TABLE.gabarits;

/* ----------------------------------------------------------------- usages */

/** Levée plutôt que de substituer un libellé plausible : un nom inventé est un nom faux. */
export class LibelleCandidatAbsent extends Error {
  readonly gabarit: CodeGabarit;

  constructor(gabarit: CodeGabarit) {
    super(
      `Le gabarit ${gabarit} nomme un candidat et le candidat de l'item principal n'a pas de ` +
        `libellé dans le périmètre du run. Aucun libellé par défaut n'est substitué.`,
    );
    this.name = "LibelleCandidatAbsent";
    this.gabarit = gabarit;
  }
}

export function gabaritParCode(code: CodeGabarit): Gabarit {
  const trouve = GABARITS.find((gabarit) => gabarit.code === code);
  if (trouve === undefined) throw new Error(`Gabarit inconnu : ${code}`);
  return trouve;
}

export function gabaritsPourType(type: TypeItem): readonly Gabarit[] {
  return GABARITS.filter((gabarit) => gabarit.types_admis.includes(type));
}

export interface Substitutions {
  readonly libelle_candidat?: string;
  readonly formulation_mesure: string;
}

/**
 * Levée quand la mesure commence par « Le » ou « Les » juste après « à » : la contraction ne
 * s'applique qu'à l'article en minuscule, et une majuscule à cet endroit est presque certainement
 * une faute de saisie (décision de l'auteur du 2026-10-12). Ni contraction, ni texte brut.
 */
export class ArticleMajusculeApresA extends Error {
  readonly gabarit: CodeGabarit;
  readonly formulation_mesure: string;

  constructor(gabarit: CodeGabarit, formulation_mesure: string) {
    super(
      `Le gabarit ${gabarit} place « à » devant ${EMPLACEMENT_MESURE} et la formulation ` +
        `« ${formulation_mesure} » commence par un article en majuscule. Ni contraction ni ` +
        `substitution brute : la formulation canonique est à corriger.`,
    );
    this.name = "ArticleMajusculeApresA";
    this.gabarit = gabarit;
    this.formulation_mesure = formulation_mesure;
  }
}

/**
 * « à » mot entier, suivi d'une espace, en fin du texte qui précède l'emplacement. La majuscule
 * (« À », début de phrase) et l'espace insécable ou fine insécable après « à » comptent : une
 * reformulation qui les emploie devant « le »/« les » reste la forme interdite « à le » (constat 28,
 * revue du 2026-10-17), pas une forme nouvelle que la contraction laisserait passer.
 */
const PREPOSITION_A_EN_FIN = /(?:^|\s)[àÀ][\u0020\u00A0\u202F]$/u;
const PREPOSITION_A = "à ";
/** L'article doit être un mot entier suivi d'une espace : « lesdites », « leur », « l'… » ne bougent pas. */
const CONTRACTIONS: readonly (readonly [RegExp, string])[] = [
  [/^le /u, "au "],
  [/^les /u, "aux "],
];
const ARTICLE_MAJUSCULE = /^Les? /u;

/**
 * D35 (4) : la mesure telle qu'elle s'écrit derrière « à » une fois contractée (« le budget »
 * devient « au budget », « les retraites » devient « aux retraites »), ou `null` quand son article
 * ne se contracte pas. Seul endroit du dépôt où vit la règle de contraction : le remplissage du
 * texte neutre et le contrôle de la reformulation (D42 (4)) la lisent ici.
 */
function mesureContractee(gabarit: Gabarit, mesure: string): string | null {
  if (ARTICLE_MAJUSCULE.test(mesure)) throw new ArticleMajusculeApresA(gabarit.code, mesure);
  const contraction = CONTRACTIONS.find(([article]) => article.test(mesure));
  if (contraction === undefined) return null;
  const [article, contracte] = contraction;
  return mesure.replace(article, contracte);
}

/**
 * D35 (4) : « à le » devient « au », « à les » devient « aux ». La règle porte sur la
 * préposition qui précède l'emplacement, jamais sur un code de gabarit.
 */
function joindreMesure(avant: string, gabarit: Gabarit, mesure: string): string {
  if (!PREPOSITION_A_EN_FIN.test(avant)) return avant + mesure;
  const contractee = mesureContractee(gabarit, mesure);
  if (contractee === null) return avant + mesure;
  return avant.slice(0, -PREPOSITION_A.length) + contractee;
}

/** Chaque `[mesure]` est substitué à son tour, la contraction lisant le texte qui le précède. */
function substituerMesure(gabarit: Gabarit, mesure: string): string {
  const [tete, ...suites] = gabarit.texte_neutre.split(EMPLACEMENT_MESURE);
  if (tete === undefined) throw new Error(`Gabarit ${gabarit.code} : texte neutre illisible.`);
  return suites.reduce((avant, suite) => joindreMesure(avant, gabarit, mesure) + suite, tete);
}

/* --------------------------------------------- formes admises de la mesure */

/**
 * D42 (4) : les formes sous lesquelles la mesure peut figurer dans une reformulation de ce gabarit.
 * `canonique` est toujours admise ; `contractee` ne l'est que si le gabarit place « à » devant
 * `[mesure]` et que l'article de la mesure se contracte (`mesureContractee`), sinon `null`.
 */
export interface FormesDeMesure {
  readonly canonique: string;
  readonly contractee: string | null;
}

/** Vrai si l'un des emplacements `[mesure]` du gabarit suit « à » : là seulement la contraction s'applique. */
function placeAAvantMesure(gabarit: Gabarit): boolean {
  const avants = gabarit.texte_neutre.split(EMPLACEMENT_MESURE).slice(0, -1);
  return avants.some((avant) => PREPOSITION_A_EN_FIN.test(avant));
}

export function formesAdmisesDeMesure(gabarit: Gabarit, mesure: string): FormesDeMesure {
  if (!placeAAvantMesure(gabarit)) return { canonique: mesure, contractee: null };
  return { canonique: mesure, contractee: mesureContractee(gabarit, mesure) };
}

/** Les positions de début de chaque occurrence de `aiguille` dans `texte`, chevauchements compris. */
function occurrences(texte: string, aiguille: string): readonly number[] {
  if (aiguille.length === 0) throw new Error("Recherche d'une mesure vide : aucune occurrence n'a de sens.");
  const debuts: number[] = [];
  for (let debut = texte.indexOf(aiguille); debut !== -1; debut = texte.indexOf(aiguille, debut + 1)) {
    debuts.push(debut);
  }
  return debuts;
}

/**
 * D42 (4) : vrai si la mesure figure dans le texte, caractère pour caractère, sous une forme admise.
 * La forme contractée est admise partout où elle figure. La forme canonique l'est aussi, sauf
 * derrière « à » quand le gabarit la contracte : « à le budget » est la forme que la contraction
 * remplace, jamais une recopie admise. Comparaison exacte : ni casse, ni accent, ni apostrophe
 * typographique ne sont rapprochés.
 */
export function mesureFigureSousFormeAdmise(texte: string, gabarit: Gabarit, mesure: string): boolean {
  const { canonique, contractee } = formesAdmisesDeMesure(gabarit, mesure);
  const debuts = occurrences(texte, canonique);
  if (contractee === null) return debuts.length > 0;
  if (texte.includes(contractee)) return true;
  return debuts.some((debut) => !PREPOSITION_A_EN_FIN.test(texte.slice(0, debut)));
}

export function remplirTexteNeutre(gabarit: Gabarit, substitutions: Substitutions): string {
  const avecMesure = substituerMesure(gabarit, substitutions.formulation_mesure);
  if (!gabarit.nomme_candidat) return avecMesure;
  if (substitutions.libelle_candidat === undefined) throw new LibelleCandidatAbsent(gabarit.code);
  return avecMesure.replaceAll(EMPLACEMENT_CANDIDAT, substitutions.libelle_candidat);
}
