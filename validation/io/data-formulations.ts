/**
 * `data/formulations/` sur disque : les formulations relues, un fichier par question
 * (`schema/formulations-validees.schema.json`, décisions D39 et D42). **Le seul module du dépôt qui
 * y écrit** (règle 3 de `CLAUDE.md`, vérifiée par `tests/ecriture-data.test.ts`) ; il n'est appelé
 * que par la relecture de l'interface de validation, après qu'un annotateur a coché les quatre cases.
 * C'est aussi le seul lecteur : l'interface, le gel et la reprise de `pnpm reformuler`
 * (`pipeline/reformulation/reprise.ts`) passent par ici.
 *
 * Calqué sur `data-mesures.ts` :
 *
 * - `lireFormulationsData` et `lireFormulationsQuestion` confrontent chaque fichier au schéma,
 *   exigent que son nom soit le `question_id` qu'il porte, et rendent l'empreinte des octets lus ;
 *   tout défaut est `FormulationValideeIllisible` ;
 * - `promouvoirFormulations` crée le fichier d'une question qui n'en a pas ; remplace celui d'une
 *   question promue sur un autre texte neutre ou une autre position affirmée (l'historique Git garde
 *   l'ancien) ; refuse une question déjà promue sur la même clé, et un fichier qui a changé depuis
 *   sa lecture.
 *
 * Toute écriture est atomique : un temporaire du même répertoire, puis un lien (création) ou un
 * renommage (remplacement). Un arrêt brutal laisse l'ancien fichier ou le nouveau, jamais un
 * fichier tronqué.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { clePromotion, clePromotionEgale, type FormulationsValidees } from "../../pipeline/reformulation/relecture.ts";
import { FichierModifieDepuisLecture } from "./data-items.ts";

export interface FormulationsLues {
  readonly formulations: FormulationsValidees;
  /** sha256 des octets du fichier au moment de la lecture : le remplacement le compare. */
  readonly empreinte_fichier: string;
}

/** Un fichier de `data/formulations/` illisible, non conforme au schéma ou mal nommé. */
export class FormulationValideeIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : formulations validées illisibles, ${detail} Rien n'est relu, promu ni rappelé.`);
    this.name = "FormulationValideeIllisible";
  }
}

export class FormulationsDejaPromues extends Error {
  constructor(chemin: string, empreinte: string, position: string) {
    super(
      `${chemin} porte déjà des formulations relues sur le texte neutre ${empreinte}, prémisse « ${position} ». ` +
        `Une question n'est promue qu'une fois par texte neutre et position affirmée.`,
    );
    this.name = "FormulationsDejaPromues";
  }
}

export class FormulationsCreeesEntreTemps extends Error {
  constructor(chemin: string) {
    super(`${chemin} a été créé entre la lecture de data/ et la promotion. Rien n'est écrit : relire l'état courant.`);
    this.name = "FormulationsCreeesEntreTemps";
  }
}

export function cheminFormulations(repertoire: string, question_id: string): string {
  return join(repertoire, `${question_id}.json`);
}

function empreinteOctets(octets: Buffer): string {
  return createHash("sha256").update(octets).digest("hex");
}

function analyser(chemin: string, texte: string): FormulationsValidees {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (erreur) {
    if (erreur instanceof SyntaxError) throw new FormulationValideeIllisible(chemin, `JSON illisible (${erreur.message}).`);
    throw erreur;
  }
  try {
    return valider<FormulationsValidees>("formulations-validees", brut, chemin);
  } catch (erreur) {
    if (erreur instanceof ErreurSchema) throw new FormulationValideeIllisible(chemin, `non conforme au schéma : ${erreur.message}`);
    throw erreur;
  }
}

function lireFichier(chemin: string, question_id: string): FormulationsLues {
  const octets = readFileSync(chemin);
  const formulations = analyser(chemin, octets.toString("utf8"));
  if (formulations.question_id !== question_id) {
    throw new FormulationValideeIllisible(chemin, `porte la question ${formulations.question_id}, pas celle de son nom.`);
  }
  return { formulations, empreinte_fichier: empreinteOctets(octets) };
}

/** Les formulations publiées d'une question, ou `null` si elle n'en a pas. */
export function lireFormulationsQuestion(repertoire: string, question_id: string): FormulationsLues | null {
  const chemin = cheminFormulations(repertoire, question_id);
  if (!existsSync(chemin)) return null;
  return lireFichier(chemin, question_id);
}

/** Toutes les formulations publiées, par `question_id`. Un répertoire absent est un `data/` sans formulation. */
export function lireFormulationsData(repertoire: string): ReadonlyMap<string, FormulationsLues> {
  const table = new Map<string, FormulationsLues>();
  if (!existsSync(repertoire)) return table;
  for (const nom of readdirSync(repertoire).sort()) {
    if (!nom.endsWith(".json")) continue;
    const question_id = nom.slice(0, -".json".length);
    table.set(question_id, lireFichier(join(repertoire, nom), question_id));
  }
  return table;
}

function ecrireAtomique(repertoire: string, valeur: FormulationsValidees, poser: (source: string, cible: string) => void): void {
  const chemin = cheminFormulations(repertoire, valeur.question_id);
  const conforme = valider<FormulationsValidees>("formulations-validees", valeur, `formulations à écrire dans ${chemin}`);
  const texte = `${JSON.stringify(conforme, null, 2)}\n`;
  mkdirSync(repertoire, { recursive: true });
  const tmp = join(repertoire, `.${valeur.question_id}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, texte, { encoding: "utf8", flag: "wx" });
  try {
    poser(tmp, chemin);
  } finally {
    rmSync(tmp, { force: true });
  }
}

function creer(repertoire: string, valeur: FormulationsValidees): void {
  ecrireAtomique(repertoire, valeur, (source, cible) => {
    try {
      linkSync(source, cible);
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new FormulationsCreeesEntreTemps(cible);
      throw erreur;
    }
  });
}

function exigerInchange(chemin: string, lu: FormulationsLues): void {
  if (!existsSync(chemin) || empreinteOctets(readFileSync(chemin)) !== lu.empreinte_fichier) {
    throw new FichierModifieDepuisLecture(chemin);
  }
}

function exigerAutreCle(chemin: string, lu: FormulationsLues, valeur: FormulationsValidees): void {
  const avant = clePromotion(lu.formulations);
  const apres = clePromotion(valeur);
  if (clePromotionEgale(avant, apres)) {
    throw new FormulationsDejaPromues(chemin, apres.empreinte_texte_neutre, apres.position);
  }
}

function remplacer(repertoire: string, lu: FormulationsLues, valeur: FormulationsValidees): void {
  const chemin = cheminFormulations(repertoire, valeur.question_id);
  exigerInchange(chemin, lu);
  exigerAutreCle(chemin, lu, valeur);
  ecrireAtomique(repertoire, valeur, (source, cible) => {
    // Revérifié au dernier moment : la fenêtre entre la lecture et le renommage reste minimale.
    exigerInchange(cible, lu);
    renameSync(source, cible);
  });
}

/**
 * Promeut les formulations d'une question. `lu` : ce que la lecture a rendu pour cette question
 * avant la relecture, ou `undefined` si elle n'en avait pas. Création si `lu` est absent (refus si
 * un fichier est apparu entre-temps), remplacement sinon.
 */
export function promouvoirFormulations(
  repertoire: string,
  lu: FormulationsLues | undefined,
  valeur: FormulationsValidees,
): void {
  if (lu === undefined) {
    creer(repertoire, valeur);
    return;
  }
  if (lu.formulations.question_id !== valeur.question_id) {
    throw new FormulationValideeIllisible(
      cheminFormulations(repertoire, valeur.question_id),
      `la lecture fournie porte la question ${lu.formulations.question_id}.`,
    );
  }
  remplacer(repertoire, lu, valeur);
}
