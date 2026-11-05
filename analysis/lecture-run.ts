/**
 * Lecture d'un run enregistré, depuis la disposition de `runs/README.md`, vers l'`EntreesAnalyse`
 * d'`analysis/filtre.ts:assembler()` — sans couche intermédiaire, en suivant la table « Ce que
 * l'analyse lira » champ pour champ.
 *
 * Chaque fichier lu est validé contre son schéma (`outils/schemas/valider.ts`) et rien n'est ignoré
 * en silence : un JSON illisible, un fichier qui n'est pas un `.json` dans un dossier d'objets, un
 * nom de fichier différent de l'`id` de l'objet, un objet d'un autre run ou d'un contexte qui
 * n'est pas celui de son dossier lèvent `FichierDeRunRefuse`, qui cite le chemin. Un fichier non
 * conforme lève `ErreurSchema`, dont la provenance est le chemin.
 *
 * - `tirage.json` est lu au chemin de `run.json#/tirage/chemin`, qui doit désigner un fichier du
 *   répertoire du run (`runs/<date>/<fichier>`), et son SHA-256, pris sur les octets lus, doit être
 *   celui de `run.json#/tirage/sha256` : une divergence est une erreur dure (`EmpreinteDivergente`).
 * - Les items sont lus à la version qu'épingle chaque question (`reference.item_version`), dans
 *   `data/items/` tel qu'il était au commit du gel (`run.versions.donnees_commit`), comme le recoupe
 *   `outils/items-au-gel.ts` : la lecture passe par Git (`git show <commit>:<chemin>`), en local. Un
 *   item absent du commit, ou dont la version ou l'empreinte n'est pas celle épinglée, lève
 *   `ItemEpingleIntrouvable` : jamais une autre version à la place, ni la version courante.
 * - Le volume (`volume/`, hors Git) se reconstitue depuis l'archive Zenodo. Absent, ou sans son
 *   dossier `reponses/`, il lève `VolumeAbsent` : un run n'est jamais lu comme s'il n'avait aucune
 *   réponse. Un dossier `reponses/` présent mais vide est lu tel quel ; `assembler()` décide.
 * - L'archive Zenodo n'est vérifiée que si l'appelant en fournit le fichier : son SHA-256 est
 *   comparé à l'empreinte que `run.json#/depot/archives` déclare sous le même nom. Sans fichier,
 *   le résultat dit `non_verifiee`, jamais « vérifiée » par défaut.
 *
 * Les notations individuelles et les réponses contrefactuelles ne passent pas par `assembler()` :
 * `lireNotationsDuRun` les relit pour le contrôle croisé (`pnpm notation:controle`) et le recalcul
 * §8(a).
 */

import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync } from "node:fs";
import { basename, join } from "node:path";
import { executerGit } from "../outils/executer-git.ts";
import { comparerChaines } from "../outils/ordre-chaines.ts";
import { valider } from "../outils/schemas/valider.ts";
import type { NomSchema } from "../outils/schemas/noms.ts";
import { dateParis, lireInstant } from "./heure-paris.ts";
import { tableAliasCandidats, type TableAliasCandidats } from "./alias-candidats.ts";
import type { JugeDuRun, NotationIndividuelle, RenvoiHumain, RunDeNotation, TauxEchantillonHumain, VerdictProduit } from "./types-notation.ts";
import type { GraineTirage } from "./graine-tirage.ts";
import type { RegimeInclusion, StatutRun, TypeRun } from "./types-run.ts";
import { canoniser } from "../validation/domaine/empreinte.ts";
import { accordHumainsEchantillon, accordPublie, type AccordHumainsPublie } from "./accord-humains.ts";
import { estDuRun, type EntreesAnalyse } from "./filtre.ts";
import { parModeDuRun, type RequeteDuPlan } from "./seuils.ts";
import type { CandidatAuGel, EntreeTirage, Item, LectureComparateur, Mode, ParMode, Question, ReferenceItem, Reponse, Run, SeuilMode, Ulid } from "./types.ts";
import { candidatsInterroges as candidatsInterrogesAuRun } from "./candidats-interroges.ts";
import { comparateursDuRun } from "./reference-comparateurs.ts";

/* ------------------------------------------------------------------ disposition */

/** `runs/README.md` : les fichiers d'un run notés, sous son répertoire `runs/<date>/`. */
export interface DispositionRunNote {
  readonly run: string;
  readonly run_json: string;
  readonly questions: string;
  /** Git : un verdict par objet noté. */
  readonly verdicts: string;
  /** Hors Git : reconstitué depuis l'archive Zenodo. */
  readonly volume: string;
  readonly reponses: string;
  readonly notations: string;
  /** Réponses permutées du test contrefactuel : produites par aucun outil, jamais dans `reponses/`. */
  readonly reponses_contrefactuelles: string;
  /** Renvois d'un juge vers la notation humaine (D30 (2), `schema/renvoi-humain.schema.json`). */
  readonly renvois: string;
  /** §6, QR9 : les lectures des comparateurs inclus, une par item P de référence et par comparateur. */
  readonly lectures_comparateur: string;
}

export function dispositionRunNote(repertoire_run: string): DispositionRunNote {
  const volume = join(repertoire_run, "volume");
  return {
    run: repertoire_run,
    run_json: join(repertoire_run, "run.json"),
    questions: join(repertoire_run, "questions.json"),
    verdicts: join(repertoire_run, "verdicts"),
    volume,
    reponses: join(volume, "reponses"),
    notations: join(volume, "notations"),
    reponses_contrefactuelles: join(volume, "reponses-contrefactuelles"),
    renvois: join(volume, "renvois"),
    lectures_comparateur: join(volume, "lectures-comparateur"),
  };
}

/* ------------------------------------------------------------------ erreurs */

export type MotifRefus =
  | "json_illisible"
  | "pas_un_tableau"
  | "fichier_etranger"
  | "nom_different_de_l_id"
  | "autre_run"
  | "contexte_hors_dossier"
  | "hors_du_repertoire_du_run"
  | "epingles_divergents";

export class FichierDeRunRefuse extends Error {
  readonly chemin: string;
  readonly motif: MotifRefus;

  constructor(chemin: string, motif: MotifRefus, detail: string) {
    super(`${chemin} : ${detail} (${motif}).`);
    this.name = "FichierDeRunRefuse";
    this.chemin = chemin;
    this.motif = motif;
  }
}

export class VolumeAbsent extends Error {
  readonly chemin: string;

  constructor(chemin: string) {
    super(
      `${chemin} absent : le volume du run n'est pas reconstitué. Reconstituer volume/ depuis l'archive Zenodo ` +
        `(run.json#/depot), puis relancer ; un run n'est jamais lu comme s'il n'avait aucune réponse.`,
    );
    this.name = "VolumeAbsent";
    this.chemin = chemin;
  }
}

export class DossierAbsent extends Error {
  readonly chemin: string;

  constructor(chemin: string, quoi: string) {
    super(`${chemin} absent : ${quoi}. Un dossier manquant n'est pas lu comme vide.`);
    this.name = "DossierAbsent";
    this.chemin = chemin;
  }
}

export class EmpreinteDivergente extends Error {
  readonly chemin: string;

  constructor(chemin: string, declaree: string, calculee: string, ou: string) {
    super(`${chemin} : SHA-256 ${calculee}, alors que ${ou} déclare ${declaree}. Une divergence est une erreur dure.`);
    this.name = "EmpreinteDivergente";
    this.chemin = chemin;
  }
}

/** §7 (protocole 0.20), D55 (9) : la table publiée diverge de celle que la graine et les candidats interrogés recalculent. */
export class AliasCandidatsDivergent extends Error {
  readonly chemin: string;

  constructor(chemin: string, publiee: TableAliasCandidats, recalculee: TableAliasCandidats) {
    super(
      `${chemin}#/alias_candidats diverge de la table recalculée depuis graines.alias_candidats et les candidats ` +
        `interrogés : publiée ${JSON.stringify(publiee)}, recalculée ${JSON.stringify(recalculee)}. Rien n'est lu.`,
    );
    this.name = "AliasCandidatsDivergent";
    this.chemin = chemin;
  }
}

/** D55 (7), constat 17 : `par_mode` écrit dans `run.json` diverge du recalcul sur les réponses lues. */
export class ParModeDivergent extends Error {
  readonly chemin: string;

  constructor(chemin: string, outil_id: string, mode: Mode, ecrit: SeuilMode, recalcule: SeuilMode | undefined) {
    super(
      `${chemin}#/perimetre/outils (${outil_id}, ${mode}) : par_mode écrit ${JSON.stringify(ecrit)}, recalculé ` +
        `${JSON.stringify(recalcule)} depuis les réponses et le plan d'interrogation du run (D55 (7), §8). Rien n'est lu.`,
    );
    this.name = "ParModeDivergent";
    this.chemin = chemin;
  }
}

/** §7.30 : `accord_humains_echantillon` écrit dans `run.json` diverge du recalcul sur les notations lues. */
export class AccordHumainsDivergent extends Error {
  readonly chemin: string;

  constructor(chemin: string, ecrit: AccordHumainsPublie, recalcule: AccordHumainsPublie) {
    super(
      `${chemin}#/accord_humains_echantillon : écrit ${canoniser(ecrit)}, recalculé ${canoniser(recalcule)} depuis ` +
        `l'échantillon humain rejoué et les notations du volume (§7, analysis/accord-humains.ts). Rien n'est lu.`,
    );
    this.name = "AccordHumainsDivergent";
    this.chemin = chemin;
  }
}

/**
 * Lot 10 (a) : `par_mode` écrit pour un outil qui n'a aucun couple déclaré (comparateur, assistant
 * exclu) — `parModeDuRun` ne le calcule pas, il n'y a rien à quoi le recouper.
 */
export class ParModeHorsPerimetre extends Error {
  readonly chemin: string;

  constructor(chemin: string, outil_id: string) {
    super(
      `${chemin}#/perimetre/outils (${outil_id}) : par_mode écrit pour un outil qui n'est pas un assistant inclus ` +
        `(analysis/seuils.ts:couplesDeclares, D55 (7)) : aucun recalcul ne lui correspond. Rien n'est lu.`,
    );
    this.name = "ParModeHorsPerimetre";
    this.chemin = chemin;
  }
}

export class ArchiveInverifiable extends Error {
  readonly chemin: string;

  constructor(chemin: string, detail: string) {
    super(`${chemin} : archive non vérifiable, ${detail}.`);
    this.name = "ArchiveInverifiable";
    this.chemin = chemin;
  }
}

export class ItemsDuGelIllisibles extends Error {
  readonly chemin: string;

  constructor(chemin: string, detail: string) {
    super(`${chemin} : items du gel illisibles, ${detail}.`);
    this.name = "ItemsDuGelIllisibles";
    this.chemin = chemin;
  }
}

export class ItemEpingleIntrouvable extends Error {
  readonly reference: ReferenceItem;

  constructor(reference: ReferenceItem, detail: string) {
    super(
      `Item ${reference.item_id} à la version ${reference.item_version} (empreinte ${reference.item_empreinte}) ` +
        `introuvable : ${detail}. Aucune autre version n'est lue à sa place.`,
    );
    this.name = "ItemEpingleIntrouvable";
    this.reference = reference;
  }
}

/* ------------------------------------------------------------------ le run */

/** Un candidat au gel, avec ce que le test contrefactuel lit (libellé et nom seul). */
export interface CandidatDuRunLu extends CandidatAuGel {
  readonly libelle: string;
  readonly nom: string;
}

/** La part de `run.json` que lisent l'analyse, la notation et la lecture du run. */
export interface RunLu extends Run {
  readonly statut: StatutRun;
  /** `run.schema.json`, `type_run` : `pilote` désigne le run qui porte le jeu d'or (D18). */
  readonly type_run: TypeRun;
  readonly perimetre: {
    /** `run.schema.json#/properties/perimetre/properties/regime_inclusion`, exigé par le schéma ; lu par la notation (D70 (7)). */
    readonly regime_inclusion: RegimeInclusion;
    readonly candidats: readonly CandidatDuRunLu[];
    readonly outils: Run["perimetre"]["outils"];
  };
  readonly versions: { readonly donnees_commit: string };
  readonly tirage: { readonly chemin: string; readonly sha256: string };
  readonly depot?: { readonly archives: readonly { readonly nom: string; readonly sha256: string }[] };
  readonly juges: readonly JugeDuRun[];
  readonly taux_echantillon_humain: TauxEchantillonHumain;
  readonly graines: { readonly echantillon_humain: GraineTirage; readonly contrefactuel: GraineTirage; readonly alias_candidats: GraineTirage };
  /** §7 (protocole 0.20), D55 (9) : alias (« C1 » à « Cn ») → identifiant, un par candidat interrogé. */
  readonly alias_candidats: TableAliasCandidats;
  readonly contrefactuel_candidats?: { readonly taille: number };
  /** D51 (2) : posée par `pnpm run:invalider` ou par la notation en D16 (3) ; le run n'est alors plus noté ni décidé. */
  readonly invalidation?: { readonly motif: string; readonly date: string; readonly run_remplacant_id?: string };
  /** §7.30 : l'accord des deux humains de l'échantillon, écrit par `pnpm go-no-go`, recoupé par `lireRun`. */
  readonly accord_humains_echantillon?: AccordHumainsPublie;
}

export interface TirageLu {
  readonly run_id: string;
  readonly date_gel: string;
  /** Recopiée de `run.graines.tirage` (`tirage.schema.json`) : lue par la checklist de l'annexe F. */
  readonly graine_tirage: GraineTirage;
  readonly entrees: readonly EntreeTirage[];
}

interface Identifie {
  readonly id: string;
  readonly run_id: string;
}

function lireJson(chemin: string, texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch (erreur) {
    throw new FichierDeRunRefuse(chemin, "json_illisible", `JSON illisible (${erreur instanceof Error ? erreur.message : String(erreur)})`);
  }
}

function lireObjet<T>(nom: NomSchema, chemin: string): T {
  return valider<T>(nom, lireJson(chemin, readFileSync(chemin, "utf8")), chemin);
}

/** §7 (protocole 0.20), D55 (9) : les candidats interrogés au run, la même définition que le dérangement. */
function candidatsInterroges(run: RunLu): readonly { readonly candidat_id: string }[] {
  return candidatsInterrogesAuRun(run.perimetre.candidats);
}

/** La table publiée doit être exactement celle que la graine et les candidats interrogés recalculent. */
function verifierAliasCandidats(run: RunLu, chemin: string): void {
  const recalculee = tableAliasCandidats(candidatsInterroges(run), run.graines.alias_candidats);
  if (canoniser(run.alias_candidats) !== canoniser(recalculee)) {
    throw new AliasCandidatsDivergent(chemin, run.alias_candidats, recalculee);
  }
}

/** `run.json`, validé, rangé sous la date de son gel à Paris (`runs/README.md`). */
export function lireRunJson(repertoire_run: string): RunLu {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const run = lireObjet<RunLu>("run", chemin);
  const date = dateParis(lireInstant(run.date_gel, `${chemin}#/date_gel`));
  if (basename(repertoire_run) !== date) {
    throw new FichierDeRunRefuse(chemin, "hors_du_repertoire_du_run", `run gelé le ${date} (heure de Paris), rangé sous ${basename(repertoire_run)}`);
  }
  verifierAliasCandidats(run, chemin);
  return run;
}

/** La part du run que lit le noyau de notation (`analysis/types-notation.ts`). */
export function runDeNotationDe(run: RunLu): RunDeNotation {
  return {
    id: run.id,
    candidats: run.perimetre.candidats.map((c) => ({ candidat_id: c.candidat_id, libelle: c.libelle, nom: c.nom })),
    juges: run.juges,
    taux_echantillon_humain: run.taux_echantillon_humain,
    graines: { echantillon_humain: run.graines.echantillon_humain, contrefactuel: run.graines.contrefactuel, alias_candidats: run.graines.alias_candidats },
    alias_candidats: run.alias_candidats,
    ...(run.contrefactuel_candidats === undefined ? {} : { contrefactuel_candidats: { taille: run.contrefactuel_candidats.taille } }),
  };
}

/* ------------------------------------------------------------------ dossiers d'objets */

function exigerDossier(chemin: string, quoi: string): void {
  if (!existsSync(chemin)) throw new DossierAbsent(chemin, quoi);
}

function exigerVolume(repertoire_run: string): DispositionRunNote {
  const disposition = dispositionRunNote(repertoire_run);
  if (!existsSync(disposition.volume)) throw new VolumeAbsent(disposition.volume);
  if (!existsSync(disposition.reponses)) throw new VolumeAbsent(disposition.reponses);
  return disposition;
}

/**
 * Un dossier d'objets, un fichier `<id>.json` par objet, en ordre de nom : chaque fichier validé
 * contre `nom`, nommé par l'`id` de son objet, du run `run_id`. Rien n'est ignoré.
 */
export function lireDossier<T extends Identifie>(dossier: string, nom: NomSchema, run_id: string): readonly T[] {
  return readdirSync(dossier)
    .sort()
    .map((fichier) => lireDansDossier<T>(join(dossier, fichier), fichier, nom, run_id));
}

function lireDansDossier<T extends Identifie>(chemin: string, fichier: string, nom: NomSchema, run_id: string): T {
  if (!fichier.endsWith(".json")) throw new FichierDeRunRefuse(chemin, "fichier_etranger", `pas un fichier « ${nom} » (<id>.json)`);
  const objet = lireObjet<T>(nom, chemin);
  if (`${objet.id}.json` !== fichier) throw new FichierDeRunRefuse(chemin, "nom_different_de_l_id", `nom de fichier différent de l'id ${objet.id}`);
  if (objet.run_id !== run_id) throw new FichierDeRunRefuse(chemin, "autre_run", `objet du run ${objet.run_id}, rangé sous le run ${run_id}`);
  return objet;
}

function exigerContexte<T extends Identifie & { readonly contexte: string }>(
  objets: readonly T[],
  dossier: string,
  accepte: (contexte: string) => boolean,
  attendu: string,
): void {
  for (const objet of objets) {
    if (!accepte(objet.contexte)) {
      throw new FichierDeRunRefuse(join(dossier, `${objet.id}.json`), "contexte_hors_dossier", `contexte ${objet.contexte}, ${attendu}`);
    }
  }
}

/** `volume/reponses/*.json`, tels quels : `assembler()` applique le filtre `contexte == run`. */
export function lireReponses<T extends Reponse = Reponse>(repertoire_run: string, run_id: string): readonly T[] {
  return lireDossier<T>(exigerVolume(repertoire_run).reponses, "reponse", run_id);
}

/**
 * `volume/lectures-comparateur/*.json` (§6, QR9), chaque fichier validé contre
 * `lecture-comparateur.schema.json`. Le dossier n'est exigé que d'un run qui inclut un comparateur :
 * absent, il lève `DossierAbsent`, jamais lu comme vide. Un run sans comparateur inclus et sans ce
 * dossier n'a aucune lecture. Un dossier présent est toujours lu : une lecture hors des comparateurs
 * inclus lève ensuite (`reference-comparateurs.ts:lecturesParComparateur`), jamais ignorée.
 */
export function lireLecturesDuRun(repertoire_run: string, run: Run): readonly LectureComparateur[] {
  const dossier = exigerVolume(repertoire_run).lectures_comparateur;
  if (!existsSync(dossier) && comparateursDuRun(run).length === 0) return [];
  exigerDossier(dossier, "les lectures des comparateurs inclus du run (§6)");
  return lireDossier<LectureComparateur & Identifie>(dossier, "lecture-comparateur", run.id);
}

/** `verdicts/*.json` (Git) : un verdict n'est écrit que pour un objet de contexte `run`. */
export function lireVerdicts(repertoire_run: string, run_id: string): readonly VerdictProduit[] {
  const dossier = dispositionRunNote(repertoire_run).verdicts;
  exigerDossier(dossier, "les verdicts du run (Git)");
  const verdicts = lireDossier<VerdictProduit>(dossier, "verdict", run_id);
  exigerContexte(verdicts, dossier, (c) => c === "run", "seul le contexte run a un verdict");
  return verdicts;
}

/** Une réponse permutée du test contrefactuel : une réponse, avec la réponse dont elle dérive. */
export interface ReponseContrefactuelleLue extends Reponse {
  readonly derive_de_reponse_id: string;
}

export interface NotationsDuRun {
  readonly notations: readonly NotationIndividuelle[];
  readonly reponses_contrefactuelles: readonly ReponseContrefactuelleLue[];
  /** D30 (2) : les renvois de juge, publiés avec les notations. */
  readonly renvois: readonly RenvoiHumain[];
}

/** Les notations individuelles et les réponses contrefactuelles du volume, hors `assembler()`. */
export function lireNotationsDuRun(repertoire_run: string, run_id: string): NotationsDuRun {
  const disposition = exigerVolume(repertoire_run);
  exigerDossier(disposition.notations, "les notations individuelles du volume");
  exigerDossier(disposition.reponses_contrefactuelles, "les réponses contrefactuelles du volume");
  exigerDossier(disposition.renvois, "les renvois de juge du volume (D30 (2))");
  const reponses_contrefactuelles = lireDossier<ReponseContrefactuelleLue>(disposition.reponses_contrefactuelles, "reponse", run_id);
  exigerContexte(reponses_contrefactuelles, disposition.reponses_contrefactuelles, (c) => c !== "run", "une réponse contrefactuelle n'est jamais de contexte run");
  return {
    notations: lireDossier<NotationIndividuelle>(disposition.notations, "notation", run_id),
    reponses_contrefactuelles,
    renvois: lireDossier<RenvoiHumain>(disposition.renvois, "renvoi-humain", run_id),
  };
}

/* ------------------------------------------------------------------ tirage et questions */

function sha256Fichier(chemin: string): string {
  const empreinte = createHash("sha256");
  const tampon = Buffer.alloc(1 << 20);
  const descripteur = openSync(chemin, "r");
  try {
    for (let lus = readSync(descripteur, tampon); lus > 0; lus = readSync(descripteur, tampon)) empreinte.update(tampon.subarray(0, lus));
  } finally {
    closeSync(descripteur);
  }
  return empreinte.digest("hex");
}

/** `run.json#/tirage/chemin` : `runs/<date>/<fichier>`, un fichier du répertoire du run, et lui seul. */
export function cheminDuTirage(repertoire_run: string, run: RunLu): string {
  const prefixe = `runs/${basename(repertoire_run)}/`;
  const fichier = run.tirage.chemin.slice(prefixe.length);
  if (!run.tirage.chemin.startsWith(prefixe) || fichier.length === 0 || fichier.includes("/")) {
    throw new FichierDeRunRefuse(dispositionRunNote(repertoire_run).run_json, "hors_du_repertoire_du_run", `tirage/chemin ${run.tirage.chemin} hors de ${prefixe}`);
  }
  return join(repertoire_run, fichier);
}

export function lireTirage(repertoire_run: string, run: RunLu): TirageLu {
  const chemin = cheminDuTirage(repertoire_run, run);
  const octets = readFileSync(chemin);
  const calculee = createHash("sha256").update(octets).digest("hex");
  if (calculee !== run.tirage.sha256) throw new EmpreinteDivergente(chemin, run.tirage.sha256, calculee, "run.json#/tirage/sha256");
  const tirage = valider<TirageLu>("tirage", lireJson(chemin, octets.toString("utf8")), chemin);
  if (tirage.run_id !== run.id || tirage.date_gel !== run.date_gel) {
    throw new FichierDeRunRefuse(chemin, "autre_run", `tirage du run ${tirage.run_id} gelé le ${tirage.date_gel}, pour le run ${run.id} gelé le ${run.date_gel}`);
  }
  return tirage;
}

/**
 * `questions.json` : le jeu complet des questions engendrées au gel, un tableau, chaque question
 * validée contre `question.schema.json`. `T` : la vue qu'en prend l'appelant (le plan
 * d'interrogation lit aussi le texte des formulations, `pipeline/interrogation/plan-du-run.ts`).
 */
export function lireQuestions<T extends Question = Question>(repertoire_run: string): readonly T[] {
  const chemin = dispositionRunNote(repertoire_run).questions;
  const brut = lireJson(chemin, readFileSync(chemin, "utf8"));
  if (!Array.isArray(brut)) throw new FichierDeRunRefuse(chemin, "pas_un_tableau", "un tableau JSON de questions est attendu");
  return brut.map((valeur: unknown, rang) => valider<T>("question", valeur, `${chemin}, élément ${rang}`));
}

/* ------------------------------------------------------------------ items au gel */

interface ItemLu extends Item {
  readonly empreinte: string;
}

/** Une épingle par item ; deux questions qui épinglent deux versions d'un même item sont refusées. */
function epingles(questions: readonly Question[], chemin: string): readonly ReferenceItem[] {
  const parItem = new Map<string, ReferenceItem>();
  for (const reference of questions.flatMap((q) => q.items.map((i) => i.reference))) {
    const deja = parItem.get(reference.item_id);
    if (deja !== undefined && (deja.item_version !== reference.item_version || deja.item_empreinte !== reference.item_empreinte)) {
      throw new FichierDeRunRefuse(chemin, "epingles_divergents", `item ${reference.item_id} épinglé aux versions ${deja.item_version} et ${reference.item_version}`);
    }
    parItem.set(reference.item_id, reference);
  }
  return [...parItem.values()].sort((a, b) => comparerChaines(a.item_id, b.item_id));
}

/** Lit dans Git, au commit du gel : `<prefixe>` est le chemin de `repertoire_items` dans son dépôt. */
export interface DepotDesItems {
  readonly repertoire: string;
  readonly commit: string;
  readonly prefixe: string;
}

export function ouvrirDepotDesItems(repertoire_items: string, commit: string): DepotDesItems {
  const prefixe = executerGit(repertoire_items, ["rev-parse", "--show-prefix"], commit);
  if (!prefixe.ok) throw new ItemsDuGelIllisibles(repertoire_items, `répertoire hors d'un dépôt Git (${prefixe.erreur})`);
  if (!executerGit(repertoire_items, ["cat-file", "-e", `${commit}^{commit}`], commit).ok) {
    throw new ItemsDuGelIllisibles(repertoire_items, `le commit du gel ${commit} (run.versions.donnees_commit) est introuvable dans ce dépôt`);
  }
  return { repertoire: repertoire_items, commit, prefixe: prefixe.sortie.trim() };
}

function lireItemAuGel(depot: DepotDesItems, reference: ReferenceItem): Item {
  const chemin = `${depot.prefixe}${reference.item_id}.json`;
  const lu = executerGit(depot.repertoire, ["show", `${depot.commit}:${chemin}`], depot.commit);
  if (!lu.ok) throw new ItemEpingleIntrouvable(reference, `${chemin} absent du commit du gel ${depot.commit}`);
  const provenance = `${depot.commit}:${chemin}`;
  const item = valider<ItemLu>("item", lireJson(provenance, lu.sortie), provenance);
  if (item.id !== reference.item_id || item.version !== reference.item_version || item.empreinte !== reference.item_empreinte) {
    throw new ItemEpingleIntrouvable(reference, `${provenance} porte l'item ${item.id} à la version ${item.version} (empreinte ${item.empreinte})`);
  }
  return item;
}

/**
 * L'item `item_id` tel que le commit du dépôt le porte, validé contre `item.schema.json` ; `null`
 * s'il est absent de ce commit (D73 (2) : une contestation d'un item absent du commit du gel est
 * postérieure, `pipeline/run/contestations-posterieures.ts`). Un fichier présent mais illisible, ou
 * qui porte un autre item, lève `ItemsDuGelIllisibles`.
 */
export function lireItemAuCommit<T extends { readonly id: string }>(depot: DepotDesItems, item_id: string): T | null {
  const chemin = `${depot.prefixe}${item_id}.json`;
  const provenance = `${depot.commit}:${chemin}`;
  if (!executerGit(depot.repertoire, ["cat-file", "-e", provenance], depot.commit).ok) return null;
  const lu = executerGit(depot.repertoire, ["show", provenance], depot.commit);
  if (!lu.ok) throw new ItemsDuGelIllisibles(depot.repertoire, `${provenance} présent mais illisible (${lu.erreur})`);
  const item = valider<T>("item", lireJson(provenance, lu.sortie), provenance);
  if (item.id !== item_id) throw new ItemsDuGelIllisibles(depot.repertoire, `${provenance} porte l'item ${item.id}`);
  return item;
}

/** Les items épinglés par les questions, chacun à sa version, lus au commit `donnees_commit`. */
export function lireItemsEpingles(questions: readonly Question[], repertoire_items: string, donnees_commit: string, chemin_questions: string): readonly Item[] {
  const references = epingles(questions, chemin_questions);
  if (references.length === 0) return [];
  const depot = ouvrirDepotDesItems(repertoire_items, donnees_commit);
  return references.map((reference) => lireItemAuGel(depot, reference));
}

/* ------------------------------------------------------------------ archive Zenodo */

export type VerificationArchive =
  | { readonly statut: "non_verifiee" }
  | { readonly statut: "verifiee"; readonly nom: string; readonly sha256: string };

/**
 * `run.json#/depot/archives` : l'archive fournie est cherchée par son nom de fichier, et son
 * SHA-256 doit être l'empreinte déclarée. Sans fichier fourni : `non_verifiee`, explicitement.
 */
export function verifierArchive(run: RunLu, chemin: string | undefined): VerificationArchive {
  if (chemin === undefined) return { statut: "non_verifiee" };
  if (run.depot === undefined) throw new ArchiveInverifiable(chemin, `le run ${run.id} ne déclare aucun dépôt (run.json#/depot)`);
  const nom = basename(chemin);
  const declaree = run.depot.archives.find((archive) => archive.nom === nom);
  if (declaree === undefined) {
    throw new ArchiveInverifiable(chemin, `aucune archive nommée ${nom} dans run.json#/depot/archives (${run.depot.archives.map((a) => a.nom).join(", ")})`);
  }
  const calculee = sha256Fichier(chemin);
  if (calculee !== declaree.sha256) throw new EmpreinteDivergente(chemin, declaree.sha256, calculee, `run.json#/depot/archives (${nom})`);
  return { statut: "verifiee", nom, sha256: calculee };
}

/* ------------------------------------------------------------------ le run entier */

/**
 * Le plan d'interrogation d'un run lu, à plat (§8, protocole 0.21). Injecté par l'appelant —
 * `pipeline/interrogation/plan-du-run.ts:requetesDuPlanDuRun` — pour que `analysis/` n'importe rien
 * de `pipeline/` (CLAUDE.md, « Architecture » ; tenu par `eslint.config.js`) ; appelé après les lectures du
 * run, et seulement s'il y a un `par_mode` à recouper.
 */
export type PlanDuRun = (repertoire_run: string, run: RunLu) => readonly RequeteDuPlan[];

/**
 * Le tirage de l'échantillon humain d'un run lu, depuis ses réponses obtenues de contexte run (§7).
 * Injecté par l'appelant — `pipeline/notation/echantillons.ts:echantillonHumainDuRun` — comme
 * `PlanDuRun` ; appelé seulement s'il y a un `accord_humains_echantillon` à recouper.
 */
export type EchantillonHumainDuRun = (run: RunLu, obtenues: readonly Ulid[]) => readonly Ulid[];

export interface OptionsLectureRun {
  /** `data/items/`, dans le dépôt Git qui porte `run.versions.donnees_commit`. */
  readonly items: string;
  /** Un fichier d'archive Zenodo du run à vérifier ; absent, rien n'est vérifié. */
  readonly archive?: string;
  /** Le plan d'interrogation du run, sur lequel se recompte `par_mode` (D55 (7), protocole 0.21). */
  readonly plan_du_run: PlanDuRun;
  /** Le tirage de l'échantillon humain, sur lequel se recompte `accord_humains_echantillon` (§7.30). */
  readonly echantillon_humain: EchantillonHumainDuRun;
}

export interface RunPourAnalyse {
  readonly entrees: EntreesAnalyse;
  readonly archive: VerificationArchive;
}

/**
 * D55 (7), constat 17 : un `par_mode` présent dans `run.json` doit être celui que les réponses du
 * run recalculent, mode par mode, sur le plan d'interrogation du run (protocole 0.21). Un
 * `par_mode` absent (run en cours) n'est pas une erreur ici : le schéma l'exige déjà d'un run publié.
 */
function verifierParMode(repertoire_run: string, run: RunLu, reponses: readonly Reponse[], plan_du_run: PlanDuRun): void {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const declarent = run.perimetre.outils.filter((outil): outil is typeof outil & { par_mode: ParMode } => outil.par_mode !== undefined);
  if (declarent.length === 0) return;
  const recalcule = parModeDuRun(run.perimetre.outils, reponses, plan_du_run(repertoire_run, run));
  for (const outil of declarent) {
    const attendu = recalcule.get(outil.outil_id);
    if (attendu === undefined) throw new ParModeHorsPerimetre(chemin, outil.outil_id);
    for (const mode of Object.keys(outil.par_mode) as Mode[]) {
      const ecrit = outil.par_mode[mode];
      if (ecrit !== undefined && canoniser(ecrit) !== canoniser(attendu[mode])) {
        throw new ParModeDivergent(chemin, outil.outil_id, mode, ecrit, attendu[mode]);
      }
    }
  }
}

/**
 * §7.30 : un `accord_humains_echantillon` présent dans `run.json` doit être celui que recalculent
 * l'échantillon humain rejoué et les notations du volume (`analysis/accord-humains.ts`, seul calcul).
 * Absent (run sans go/no-go), rien n'est recoupé : le schéma l'exige déjà de tout go/no-go.
 */
function verifierAccordHumains(repertoire_run: string, run: RunLu, reponses: readonly Reponse[], echantillon_humain: EchantillonHumainDuRun): void {
  const ecrit = run.accord_humains_echantillon;
  if (ecrit === undefined) return;
  const obtenues = reponses.filter((r) => estDuRun(r) && r.statut_reponse === "obtenue").map((r) => r.id);
  const { notations } = lireNotationsDuRun(repertoire_run, run.id);
  const recalcule = accordPublie(accordHumainsEchantillon(echantillon_humain(run, obtenues), notations));
  if (canoniser(ecrit) !== canoniser(recalcule)) throw new AccordHumainsDivergent(dispositionRunNote(repertoire_run).run_json, ecrit, recalcule);
}

/** `runs/README.md`, « Ce que l'analyse lira » : l'`EntreesAnalyse` d'un run enregistré. */
export function lireRun(repertoire_run: string, options: OptionsLectureRun): RunPourAnalyse {
  const run = lireRunJson(repertoire_run);
  const archive = verifierArchive(run, options.archive);
  const tirage = lireTirage(repertoire_run, run);
  const questions = lireQuestions(repertoire_run);
  const items = lireItemsEpingles(questions, options.items, run.versions.donnees_commit, dispositionRunNote(repertoire_run).questions);
  const reponses = lireReponses(repertoire_run, run.id);
  verifierParMode(repertoire_run, run, reponses, options.plan_du_run);
  verifierAccordHumains(repertoire_run, run, reponses, options.echantillon_humain);
  return {
    entrees: {
      run,
      entrees_tirage: tirage.entrees,
      questions,
      items,
      reponses,
      verdicts: lireVerdicts(repertoire_run, run.id),
    },
    archive,
  };
}
