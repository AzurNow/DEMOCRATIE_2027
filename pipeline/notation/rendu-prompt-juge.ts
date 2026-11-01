/**
 * Le texte envoyé à un juge automatique (§7, annexe D) : le bloc « Texte du prompt » d'un fichier
 * versionné de `prompts/` (règle 6), ses variables remplacées par les champs d'une charge
 * (`charge-juge.ts:construireCharge`). Ce module n'écrit aucun texte destiné au modèle : il lit
 * celui du fichier, jamais une copie, et n'appelle aucun modèle (l'adaptateur réseau est un lot
 * ultérieur).
 *
 * **Règles de rendu**, celles que déclare `prompts/judge-1.0.0.md` (« Variables d'entrée ») : chaque
 * variable `{nom.champ}` porte le nom exact d'un champ de la charge ; un scalaire est recopié tel
 * quel (`true`/`false` pour un booléen) ; un objet ou un tableau est rendu en JSON compact, champ
 * pour champ, dans l'ordre de la charge ; seuls ces noms entre accolades sont des variables.
 *
 * **Champ absent (décision du 2026-11-01, option a).** Le marqueur est lu dans le prompt, jamais
 * écrit ici : la phrase « Un champ absent de la charge est rendu par le mot `…` » de ses variables
 * d'entrée. Il n'est admis que sur les champs dont la ligne du tableau des variables le cite dans sa
 * colonne « Rendu » (dans 1.0.0 : `question.premisse_fausse` et `reponse.citations`) ; tout autre
 * champ absent est refusé. Un prompt sans cette phrase n'a aucun champ optionnel.
 *
 * **Marqueur et valeur réelle.** Les champs optionnels du prompt 1.0.0 portent, présents, un booléen
 * ou un tableau JSON : leur rendu ne peut pas s'écrire `ABSENT`. Un texte (réponse, question) égal à
 * « ABSENT » est recopié tel quel, et ce champ ne peut jamais être absent, donc il n'y a pas de
 * confusion. Une valeur présente d'un champ optionnel qui se rendrait comme le marqueur est refusée
 * (`valeur_confondue_avec_marqueur`).
 *
 * **Rien ne se perd en silence.** Tout écart est un refus nommé (`RenduPromptJugeRefuse`, `motif`) :
 * - le prompt annonce une autre version de charge que le code (`VERSION_CHARGE_JUGE`), ou la charge
 *   en porte une autre ; l'en-tête n'en annonce aucune, ou deux ;
 * - le fichier lu n'est pas celui que désigne la charge : chemin de sa ligne `| Version |` et version
 *   de son titre (`# … — version x.y.z`) comparés à `charge.prompt` ;
 * - le prompt emploie une variable qui n'est pas un champ rendable de la charge ;
 * - la charge porte un champ que le prompt n'emploie pas et que le prompt ne déclare pas exclu
 *   (`CHAMPS_NON_RENDUS`) : un champ ajouté à la charge sans mise à jour du rendu est refusé ;
 * - une variable employée désigne un champ absent que le prompt ne déclare pas optionnel.
 *
 * **Une seule passe.** Le gabarit est parcouru une fois ; une valeur substituée n'est jamais relue :
 * des accolades, une séquence `{date_run}` ou un motif `$&` dans le texte d'une réponse ou d'une
 * citation restent tels quels.
 *
 * **Déterminisme.** Même source et même charge donnent les mêmes octets. Aucune normalisation
 * Unicode n'est appliquée : la charge n'en applique pas (`charge-juge.ts`), et l'extrait justificatif
 * est contrôlé contre la réponse par la normalisation du test verbatim (`extrait.ts`), pas ici.
 */

import { readFileSync } from "node:fs";
import { VERSION_CHARGE_JUGE, type ChargeJuge, type PromptDeJuge } from "./charge-juge.ts";

/** Les champs de la charge qu'un prompt peut rendre, au grain des variables du prompt (14, annexe D). */
export const VARIABLES_DE_CHARGE: readonly string[] = [
  "date_run",
  "question.gabarit",
  "question.registre",
  "question.texte",
  "question.premisse_fausse",
  "reponse_attendue",
  "reponse.texte",
  "reponse.liens",
  "reponse.citations",
  "reponse.troncature",
  "reponse.refus_api",
  "pages_citees",
  "longueur_max_texte_page",
  "references",
];

/**
 * Les champs de la charge que le prompt déclare non rendus au modèle (`prompts/judge-1.0.0.md`,
 * « Ne sont pas rendus au modèle ») ; `reponse.normalisation`, qu'il cite aussi, a quitté la charge
 * en v5.
 */
export const CHAMPS_NON_RENDUS: readonly string[] = ["version_charge", "prompt", "reponse_id", "version_normalisation_verbatim"];

/** Les objets de la charge dont les champs sont des variables une à une (`question.texte`…). */
const GROUPES = new Set(VARIABLES_DE_CHARGE.filter((v) => v.includes(".")).map((v) => v.split(".")[0]));

const VARIABLE = /\{([a-z_]+(?:\.[a-z_]+)*)\}/g;
const LIGNE_CHARGE = /^\| Charge \| `([^`]+)`/gm;
const LIGNE_VERSION = /^\| Version \| `([^`]+)`/gm;
const TITRE_VERSIONNE = /^# .* — version (\S+)$/gm;
const PHRASE_MARQUEUR = /^Un champ absent de la charge est rendu par le mot `([^`]+)`/gm;
/** Une ligne du tableau des variables : `| \`{variable}\` | champ | rendu |`. */
const LIGNE_VARIABLE = /^\| `\{([a-z_]+(?:\.[a-z_]+)*)\}` \|[^|\n]*\|([^\n]*)\|$/gm;
/** Le premier bloc ```text de la section « ## Texte du prompt », avant tout autre bloc ou titre. */
const TEXTE_DU_PROMPT = /^## Texte du prompt\n(?:(?!```|#)[^\n]*\n)*```text\n([\s\S]*?)\n```$/m;

export type MotifRefusRendu =
  | "version_charge_discordante"
  | "en_tete_sans_version_charge"
  | "en_tete_sans_identite_prompt"
  | "prompt_discordant"
  | "texte_du_prompt_introuvable"
  | "marqueur_absence_ambigu"
  | "variable_inconnue"
  | "champ_non_rendu"
  | "champ_absent"
  | "valeur_confondue_avec_marqueur"
  | "valeur_non_rendable";

export class RenduPromptJugeRefuse extends Error {
  readonly motif: MotifRefusRendu;
  readonly champs: readonly string[];

  constructor(motif: MotifRefusRendu, champs: readonly string[], detail: string) {
    super(`Rendu du prompt de juge refusé (${motif}) : ${detail}${champs.length === 0 ? "" : ` [${champs.join(", ")}]`}`);
    this.name = "RenduPromptJugeRefuse";
    this.motif = motif;
    this.champs = champs;
  }
}

/** Ce que le prompt déclare sur les champs absents : son marqueur, et les champs qui l'admettent. */
interface RegleAbsence {
  readonly marqueur: string | undefined;
  readonly optionnels: readonly string[];
}

/** Le contenu du fichier de prompt, lu par son chemin, tel quel. */
export function lireSourcePromptJuge(chemin: string): string {
  return readFileSync(chemin, "utf8");
}

/** La version de charge qu'annonce l'en-tête du prompt (ligne `| Charge | \`…\``), unique. */
export function versionDeChargeDuPrompt(source: string): string {
  return captureUnique(source, LIGNE_CHARGE, "en_tete_sans_version_charge", "une version de charge");
}

/** Le texte du prompt de juge, variables remplacées par les champs de la charge. */
export function rendrePromptJuge(source: string, charge: ChargeJuge): string {
  exigerVersionsAlignees(versionDeChargeDuPrompt(source), charge.version_charge);
  exigerPromptDeLaCharge(source, charge.prompt);
  const gabarit = texteDuPrompt(source);
  const absence = regleAbsence(source);
  const variables = variablesDe(gabarit);
  exigerVariablesConnues(variables);
  exigerChampsRendus(charge, variables);
  exigerChampsPresents(charge, variables, absence.optionnels);
  const valeurs = new Map(variables.map((variable) => [variable, valeurRendue(charge, variable, absence)]));
  return gabarit.replace(VARIABLE, (_occurrence, variable: string) => valeurDe(valeurs, variable));
}

/** La capture unique de `motif` dans `source` ; aucune ou plusieurs : refus, jamais de valeur par défaut. */
function captureUnique(source: string, motif: RegExp, refus: MotifRefusRendu, quoi: string): string {
  const captures = capturesDe(source, motif);
  const [capture] = captures;
  if (captures.length !== 1 || capture === undefined) {
    throw new RenduPromptJugeRefuse(refus, [], `l'en-tête doit annoncer ${quoi} et une seule (${captures.length} trouvée(s))`);
  }
  return capture;
}

function capturesDe(source: string, motif: RegExp): string[] {
  return [...source.matchAll(motif)].map((m) => m[1] as string);
}

function exigerVersionsAlignees(duPrompt: string, deLaCharge: string): void {
  for (const version of [duPrompt, deLaCharge]) {
    if (version !== VERSION_CHARGE_JUGE) {
      throw new RenduPromptJugeRefuse("version_charge_discordante", [version, VERSION_CHARGE_JUGE], `version de charge ${version}, le code est en ${VERSION_CHARGE_JUGE}`);
    }
  }
}

/** Le fichier lu est celui que la charge désigne : `chemin@version`, comme `juge.ts:versionPromptDe`. */
function exigerPromptDeLaCharge(source: string, prompt: PromptDeJuge): void {
  const chemin = captureUnique(source, LIGNE_VERSION, "en_tete_sans_identite_prompt", "un chemin de prompt (ligne Version)");
  const version = captureUnique(source, TITRE_VERSIONNE, "en_tete_sans_identite_prompt", "une version de prompt (titre « — version x.y.z »)");
  const lu = `${chemin}@${version}`;
  const designe = `${prompt.chemin}@${prompt.version}`;
  if (lu !== designe) throw new RenduPromptJugeRefuse("prompt_discordant", [lu, designe], `le fichier lu n'est pas le prompt que désigne la charge`);
}

function texteDuPrompt(source: string): string {
  const bloc = TEXTE_DU_PROMPT.exec(source)?.[1];
  if (bloc === undefined) throw new RenduPromptJugeRefuse("texte_du_prompt_introuvable", [], "aucun bloc ```text fermé sous « ## Texte du prompt »");
  return bloc;
}

/** Le marqueur que déclare le prompt et les variables dont la colonne « Rendu » le cite. */
function regleAbsence(source: string): RegleAbsence {
  const marqueurs = capturesDe(source, PHRASE_MARQUEUR);
  if (marqueurs.length > 1) throw new RenduPromptJugeRefuse("marqueur_absence_ambigu", marqueurs, "le prompt déclare plusieurs marqueurs de champ absent");
  const [marqueur] = marqueurs;
  if (marqueur === undefined) return { marqueur, optionnels: [] };
  const optionnels = [...source.matchAll(LIGNE_VARIABLE)].filter((m) => (m[2] as string).includes(`\`${marqueur}\``)).map((m) => m[1] as string);
  return { marqueur, optionnels };
}

/** Les variables du gabarit, dans l'ordre de première apparition, sans doublon. */
function variablesDe(gabarit: string): string[] {
  return [...new Set(capturesDe(gabarit, VARIABLE))];
}

function exigerVariablesConnues(variables: readonly string[]): void {
  const inconnues = variables.filter((variable) => !VARIABLES_DE_CHARGE.includes(variable));
  if (inconnues.length > 0) throw new RenduPromptJugeRefuse("variable_inconnue", inconnues, "variable(s) du prompt qui ne sont pas des champs rendables de la charge");
}

/** Chaque champ présent de la charge est employé par le prompt ou déclaré non rendu. */
function exigerChampsRendus(charge: ChargeJuge, variables: readonly string[]): void {
  const perdus = champsPresents(charge).filter((champ) => !variables.includes(champ) && !CHAMPS_NON_RENDUS.includes(champ));
  if (perdus.length > 0) throw new RenduPromptJugeRefuse("champ_non_rendu", perdus, "champ(s) de la charge que le prompt n'emploie pas");
}

function champsPresents(charge: ChargeJuge): string[] {
  return Object.entries(charge).flatMap(([cle, valeur]) => (GROUPES.has(cle) ? sousChamps(cle, valeur) : [cle]));
}

function sousChamps(groupe: string, valeur: unknown): string[] {
  if (typeof valeur !== "object" || valeur === null) return [groupe];
  return Object.keys(valeur).map((cle) => `${groupe}.${cle}`);
}

/** Un champ absent n'est admis que si le prompt le déclare optionnel ; sinon refusé, jamais remplacé. */
function exigerChampsPresents(charge: ChargeJuge, variables: readonly string[], optionnels: readonly string[]): void {
  const presents = champsPresents(charge);
  const absents = variables.filter((variable) => !presents.includes(variable) && !optionnels.includes(variable));
  if (absents.length > 0) throw new RenduPromptJugeRefuse("champ_absent", absents, "champ(s) employé(s) par le prompt, absent(s) de la charge, que le prompt ne déclare pas optionnel(s)");
}

/** Le champ désigné rendu selon son type ; absent (optionnel, contrôlé plus haut) : le marqueur du prompt. */
function valeurRendue(charge: ChargeJuge, variable: string, absence: RegleAbsence): string {
  const valeur = variable.split(".").reduce<unknown>((objet, cle) => (objet as Record<string, unknown> | undefined)?.[cle], charge);
  if (valeur === undefined) return marqueurDe(absence, variable);
  const rendue = rendu(variable, valeur);
  if (rendue === absence.marqueur && absence.optionnels.includes(variable)) {
    throw new RenduPromptJugeRefuse("valeur_confondue_avec_marqueur", [variable], `valeur présente qui se rendrait comme le marqueur ${rendue}`);
  }
  return rendue;
}

function marqueurDe(absence: RegleAbsence, variable: string): string {
  if (absence.marqueur === undefined) throw new Error(`Rendu du prompt de juge : ${variable} absent après contrôle (incohérence interne).`);
  return absence.marqueur;
}

const RENDUS: Readonly<Record<string, (valeur: unknown) => string>> = {
  string: (valeur) => valeur as string,
  boolean: (valeur) => String(valeur),
  number: (valeur) => String(valeur),
  object: (valeur) => JSON.stringify(valeur),
};

function rendu(variable: string, valeur: unknown): string {
  const rendre = RENDUS[typeof valeur];
  if (rendre === undefined) throw new RenduPromptJugeRefuse("valeur_non_rendable", [variable], `valeur de type ${typeof valeur}`);
  return rendre(valeur);
}

function valeurDe(valeurs: ReadonlyMap<string, string>, variable: string): string {
  const valeur = valeurs.get(variable);
  if (valeur === undefined) throw new Error(`Rendu du prompt de juge : variable ${variable} non résolue (incohérence interne).`);
  return valeur;
}
