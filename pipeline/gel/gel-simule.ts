/**
 * `pnpm geler --simule` (décision D80) : la répétition générale d'un gel, sans clé ni réseau. Le
 * vrai gel (`geler.ts`), de bout en bout, avec trois substitutions et seulement elles, toutes faites
 * ici et nulle part ailleurs :
 *
 * 1. **Le dépôt.** Le dépôt réel n'a pas de `data/` dans un clone, et son `config/gel.json` est livré
 *    à `null` : le gel simulé lit un dépôt Git jetable, posé sous `<sortie>/depot-simule/` depuis le
 *    jeu ouvertement fictif de `tests/gel/depot-simule/`, qui a déjà la disposition du dépôt réel et
 *    se copie tel quel, d'un geste ; commité à une date fixe pour que deux gels simulés donnent le
 *    même commit. Il n'écrit jamais dans `data/` ni dans `config/` du projet (règle 3) : la sortie est
 *    vérifiée hors de tout dépôt Git avant la copie (`exigerSortieSimulee`), donc hors du clone.
 * 2. **Le réseau.** Les deux relais drand et la Wayback Machine sont ceux de `reseau-simule.ts`,
 *    construits ici : un gel simulé n'a aucun moyen d'atteindre le réseau, et l'engagement est la
 *    capture simulée du commit du dépôt simulé.
 * 3. **L'horloge.** L'instant présent est celui des paramètres (`tests/gel/gel-simule.json`), après
 *    `date_gel` et avant l'ouverture de la fenêtre.
 *
 * Le `run.json` écrit porte `simule: true` (`run.schema.json#/properties/simule`) : aucune commande
 * ne peut le prendre pour un vrai run (`pipeline/run/simulation.ts`), et le schéma lui interdit toute
 * publication.
 *
 * Refus, avant toute écriture (`GelSimuleRefuse`, sauf le premier) : une sortie sous `runs/` du projet
 * (`SimuleSousRuns`, `gardes-sortie.ts`) ; une sortie absente (`sans_sortie` : un gel simulé n'a pas
 * de destination par défaut) ; une sortie dans un dépôt Git (`sortie_dans_un_depot` : `pnpm analyze`
 * ne lit les items d'un run simulé que dans le dépôt simulé désigné, ce qu'il refuse pour un run rangé
 * dans un dépôt, D75 (13)) ; un dépôt simulé déjà posé sous la sortie (`depot_deja_pose`). Un gel
 * refusé ensuite (barrière, instants…) retire le dépôt simulé qu'il vient de poser : rien ne reste.
 */

import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { lireInstant } from "../../analysis/heure-paris.ts";
import { executerGit } from "../../outils/executer-git.ts";
import { commitCourant } from "../../outils/garde-fous-git.ts";
import { exigerHorsDeRuns } from "../gardes-sortie.ts";
import type { EcrireFichier } from "./ecriture.ts";
import { DEPOT_PUBLIC } from "./engagement.ts";
import { geler, type ResultatGel } from "./geler.ts";
import { relaisSimules, waybackSimulee } from "./reseau-simule.ts";

/** Le nom du dépôt simulé sous la sortie, à côté du répertoire du run (`<sortie>/<date>/`). */
export const NOM_DEPOT_SIMULE = "depot-simule";

export interface ParametresGelSimule {
  /** L'horloge figée du gel, en millisecondes. */
  readonly maintenant_ms: number;
  /** La capture Wayback simulée du commit du dépôt simulé (14 chiffres UTC). */
  readonly horodatage_engagement: string;
  /** La date d'auteur et de commit du dépôt simulé, telle que Git la lit. */
  readonly date_commit: string;
}

export type MotifGelSimuleRefuse = "sans_sortie" | "sortie_dans_un_depot" | "depot_deja_pose" | "parametres_invalides" | "depot_non_pose";

export class GelSimuleRefuse extends Error {
  readonly motif: MotifGelSimuleRefuse;

  constructor(motif: MotifGelSimuleRefuse, detail: string) {
    super(`Gel simulé refusé (${motif}) : ${detail} Rien n'est écrit.`);
    this.name = "GelSimuleRefuse";
    this.motif = motif;
  }
}

/* ------------------------------------------------------------------ paramètres */

function texteDe(objet: Readonly<Record<string, unknown>>, cle: string, chemin: string): string {
  const valeur = objet[cle];
  if (typeof valeur !== "string" || valeur.length === 0) throw new GelSimuleRefuse("parametres_invalides", `${chemin} : « ${cle} » absent ou vide.`);
  return valeur;
}

/** Le JSON du fichier ; un fichier mal formé est un refus nommé, pas une pile d'erreur. */
function jsonDe(chemin: string): unknown {
  const texte = readFileSync(chemin, "utf8");
  try {
    return JSON.parse(texte);
  } catch (erreur) {
    if (erreur instanceof SyntaxError) throw new GelSimuleRefuse("parametres_invalides", `${chemin} : JSON mal formé (${erreur.message}).`);
    throw erreur;
  }
}

/** `tests/gel/gel-simule.json`, contrôlé à la frontière : aucun champ n'a de valeur par défaut. */
export function lireParametresGelSimule(chemin: string): ParametresGelSimule {
  const brut = jsonDe(chemin);
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw new GelSimuleRefuse("parametres_invalides", `${chemin} : un objet est attendu.`);
  const objet = brut as Readonly<Record<string, unknown>>;
  const horodatage_engagement = texteDe(objet, "horodatage_engagement", chemin);
  if (!/^[0-9]{14}$/.test(horodatage_engagement)) throw new GelSimuleRefuse("parametres_invalides", `${chemin} : « horodatage_engagement » n'a pas 14 chiffres.`);
  const date_commit = texteDe(objet, "date_commit", chemin);
  lireInstant(date_commit, `${chemin}#/date_commit`);
  return { maintenant_ms: lireInstant(texteDe(objet, "maintenant", chemin), `${chemin}#/maintenant`), horodatage_engagement, date_commit };
}

/* ------------------------------------------------------------------ sortie */

/** Le plus proche parent existant de `chemin` (lui-même s'il existe). */
function parentExistant(chemin: string): string {
  let courant = chemin;
  while (!existsSync(courant)) courant = dirname(courant);
  return courant;
}

/** La sortie d'un gel simulé : donnée, hors de `runs/` du projet, hors de tout dépôt Git. */
export function exigerSortieSimulee(sortie: string | undefined): string {
  if (sortie === undefined) {
    throw new GelSimuleRefuse("sans_sortie", "--sortie est obligatoire avec --simule : un gel simulé n'a pas de destination par défaut, et jamais runs/.");
  }
  const absolue = resolve(sortie);
  exigerHorsDeRuns(absolue);
  const depot = executerGit(parentExistant(absolue), ["rev-parse", "--show-toplevel"]);
  if (depot.ok) {
    throw new GelSimuleRefuse(
      "sortie_dans_un_depot",
      `${absolue} est dans le dépôt Git ${depot.sortie.trim()}. pnpm analyze ne lit les items d'un run simulé que dans le dépôt simulé ` +
        `désigné, et refuse cette désignation pour un run rangé dans un dépôt (D75 (13)) : choisir une sortie hors de tout dépôt (mktemp -d).`,
    );
  }
  return absolue;
}

/* ------------------------------------------------------------------ dépôt simulé */

function git(racine: string, arguments_: readonly string[], date: string): void {
  const resultat = executerGit(
    racine,
    ["-c", "user.name=Banc simule", "-c", "user.email=simule@banc.invalid", "-c", "commit.gpgsign=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false", ...arguments_],
    undefined,
    { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  );
  if (!resultat.ok) throw new GelSimuleRefuse("depot_non_pose", `git ${arguments_.join(" ")} dans ${racine} : ${resultat.erreur}`);
}

/**
 * Copie le jeu simulé, qui a déjà la disposition du dépôt réel, d'un geste sous `depot`, qui ne doit
 * pas exister, puis le commite : un dépôt propre. Rend son commit.
 */
function poserDepotSimule(source: string, depot: string, date_commit: string): string {
  cpSync(source, depot, { recursive: true, errorOnExist: true, force: false });
  git(depot, ["init", "--quiet"], date_commit);
  git(depot, ["add", "--all"], date_commit);
  git(depot, ["commit", "--quiet", "--no-verify", "-m", "Dépôt simulé de pnpm geler --simule (D80)"], date_commit);
  return commitCourant(depot);
}

/* ------------------------------------------------------------------ gel */

export interface OptionsGelSimule {
  readonly sortie: string | undefined;
  readonly type_run: string;
  readonly remplace: string | undefined;
  /** Le jeu simulé : `tests/gel/depot-simule/`. */
  readonly source: string;
  readonly parametres: ParametresGelSimule;
  readonly ecrire: EcrireFichier;
}

export interface ResultatGelSimule extends ResultatGel {
  /** La racine du dépôt simulé, à désigner par `--depot-des-items` à la notation et à l'analyse. */
  readonly depot: string;
}

export async function gelerSimule(options: OptionsGelSimule): Promise<ResultatGelSimule> {
  const sortie = exigerSortieSimulee(options.sortie);
  const depot = join(sortie, NOM_DEPOT_SIMULE);
  if (existsSync(depot)) throw new GelSimuleRefuse("depot_deja_pose", `${depot} existe déjà : un gel simulé pose son propre dépôt, dans une sortie neuve.`);
  try {
    const commit = poserDepotSimule(options.source, depot, options.parametres.date_commit);
    const resultat = await geler({
      racine: depot,
      sortie,
      type_run: options.type_run,
      remplace: options.remplace,
      engagement: `https://web.archive.org/web/${options.parametres.horodatage_engagement}/${DEPOT_PUBLIC}/commit/${commit}`,
      relais: relaisSimules().lire,
      wayback: waybackSimulee().lire,
      maintenant: () => options.parametres.maintenant_ms,
      ecrire: options.ecrire,
      simule: true,
    });
    return { ...resultat, depot };
  } catch (erreur) {
    rmSync(depot, { recursive: true, force: true });
    throw erreur;
  }
}
