/**
 * Les items reçus par `pnpm symmetry` sont-ils ceux du gel ? (conformité du 2026-09-29, n° 9 ;
 * `docs/DETTE.md`, 2026-09-28, point 2.)
 *
 * La barrière recalcule la référence de complétude — les questions engendrées au gel — sur les items
 * qu'on lui passe. Un sous-ensemble d'items réduirait cette référence dans la même proportion, et un
 * tirage fautif repasserait au vert. Décision de l'auteur du 2026-10-01 : le répertoire `--items` est
 * recoupé, fichier par fichier, avec ce même répertoire tel qu'il était au commit que le run inscrit au
 * gel (`run.versions.donnees_commit`). Le run doit donc porter ce commit dès le gel.
 *
 * La comparaison passe par les empreintes Git des fichiers (`git hash-object`, filtres du dépôt
 * appliqués, contre `git ls-tree` au commit) : mêmes noms, mêmes contenus, ni plus ni moins. Git est
 * lu en local ; rien ne sort de la machine.
 *
 * Lot gel (dette du 2026-10-15, PR #118) : `--mesures` est recoupé de la même façon, par le même
 * mécanisme (`exigerMesuresDuGel`). Les mesures portent le thème de chaque question, la version
 * courante qu'un item doit épingler pour entrer au tirage, et le caractère fictif que l'invariant
 * « item F ⇒ mesure fictive » contrôle : une mesure modifiée après le gel ferait juger la barrière
 * sur un référentiel que le run n'a pas lu. Les mesures ne sont pas copiées dans `runs/<date>/` :
 * elles sont lues dans `data/mesures/` au commit `donnees_commit`, comme les items.
 */

import { readdirSync } from "node:fs";
import { executerGit } from "./executer-git.ts";

/** Un répertoire reçu n'est pas celui du gel, ou le gel ne peut pas être relu : la barrière ne juge pas. */
export class RepertoireHorsDuGel extends Error {
  readonly ecarts: readonly string[];

  constructor(message: string, ecarts: readonly string[]) {
    super(message);
    this.name = "RepertoireHorsDuGel";
    this.ecarts = ecarts;
  }
}

/** Les items reçus ne sont pas ceux du gel, ou le gel ne peut pas être relu : la barrière ne juge pas. */
export class ItemsHorsDuGel extends RepertoireHorsDuGel {
  constructor(repertoire: string, ecarts: readonly string[]) {
    super(
      `Les items de ${repertoire} ne sont pas ceux du gel : ${ecarts.join(" ; ")}. La référence des ` +
        `questions engendrées au gel se calcule sur les items du gel, et sur eux seuls (§5).`,
      ecarts,
    );
    this.name = "ItemsHorsDuGel";
  }
}

/** Les mesures reçues ne sont pas celles du gel, ou le gel ne peut pas être relu : la barrière ne juge pas. */
export class MesuresHorsDuGel extends RepertoireHorsDuGel {
  constructor(repertoire: string, ecarts: readonly string[]) {
    super(
      `Les mesures de ${repertoire} ne sont pas celles du gel : ${ecarts.join(" ; ")}. Le thème des ` +
        `questions, la version courante de chaque mesure et l'invariant « item F ⇒ mesure fictive » se ` +
        `jugent sur le référentiel du gel, et sur lui seul (§5).`,
      ecarts,
    );
    this.name = "MesuresHorsDuGel";
  }
}

/**
 * Ce que le recoupement compare, en données : le libellé des écarts et le refus nommé. Aucun `if`
 * par répertoire : les items et les mesures suivent le même chemin.
 */
interface Nature {
  /** « items reçus », « mesures reçues » : dans « absent des <recus> ». */
  readonly recus: string;
  readonly refus: (repertoire: string, ecarts: readonly string[]) => RepertoireHorsDuGel;
}

const ITEMS: Nature = { recus: "items reçus", refus: (repertoire, ecarts) => new ItemsHorsDuGel(repertoire, ecarts) };
const MESURES: Nature = { recus: "mesures reçues", refus: (repertoire, ecarts) => new MesuresHorsDuGel(repertoire, ecarts) };

/** Nom de fichier → empreinte Git, pour les `*.json` directement sous le répertoire. */
export type Empreintes = ReadonlyMap<string, string>;

/** Le chemin du répertoire dans son dépôt (`data/items/`), ou le refus nommé s'il est hors d'un dépôt. */
function prefixeDansLeDepot(repertoire: string, nature: Nature): string {
  const prefixe = executerGit(repertoire, ["rev-parse", "--show-prefix"]);
  if (!prefixe.ok) throw nature.refus(repertoire, [`répertoire hors d'un dépôt Git (${prefixe.erreur})`]);
  return prefixe.sortie.trim();
}

function exigerCommit(repertoire: string, commit: string, nature: Nature): void {
  if (executerGit(repertoire, ["cat-file", "-e", `${commit}^{commit}`], commit).ok) return;
  throw nature.refus(repertoire, [`le commit ${commit} inscrit au gel est introuvable dans ce dépôt`]);
}

/** `git ls-tree -z --full-tree <commit> -- <prefixe>` : `mode type empreinte\tchemin`, séparés par NUL. */
function empreintesAuGel(repertoire: string, commit: string, prefixe: string, nature: Nature): Empreintes {
  // --full-tree : le chemin passé et les chemins rendus partent de la racine du dépôt, pas du répertoire.
  const liste = executerGit(repertoire, ["ls-tree", "-z", "--full-tree", commit, "--", prefixe.length === 0 ? "." : prefixe], commit);
  if (!liste.ok) throw nature.refus(repertoire, [`lecture du commit ${commit} impossible (${liste.erreur})`]);
  const empreintes = new Map<string, string>();
  for (const ligne of liste.sortie.split("\0")) {
    const [entete, chemin] = ligne.split("\t");
    if (entete === undefined || chemin === undefined) continue;
    const [, type, empreinte] = entete.split(" ");
    const nom = chemin.slice(prefixe.length);
    if (type === "blob" && empreinte !== undefined && nom.endsWith(".json")) empreintes.set(nom, empreinte);
  }
  return empreintes;
}

/** Les empreintes des fichiers reçus, calculées comme Git les aurait commités. */
function empreintesRecues(repertoire: string, nature: Nature): Empreintes {
  const noms = readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".json"))
    .sort();
  if (noms.length === 0) return new Map();
  const calcul = executerGit(repertoire, ["hash-object", "--", ...noms]);
  if (!calcul.ok) throw nature.refus(repertoire, [`empreintes des fichiers reçus incalculables (${calcul.erreur})`]);
  const empreintes = calcul.sortie.trim().split("\n");
  if (empreintes.length !== noms.length) {
    throw nature.refus(repertoire, [`${empreintes.length} empreinte(s) rendue(s) pour ${noms.length} fichier(s)`]);
  }
  return new Map(noms.map((nom, rang) => [nom, empreintes[rang] as string]));
}

/** Les écarts entre le répertoire d'items reçu et le même répertoire au commit du gel, triés par nom. */
export function ecartsAuGel(gel: Empreintes, recues: Empreintes): readonly string[] {
  return ecartsDe(gel, recues, ITEMS);
}

function ecartsDe(gel: Empreintes, recues: Empreintes, nature: Nature): readonly string[] {
  const noms = [...new Set([...gel.keys(), ...recues.keys()])].sort();
  return noms.flatMap((nom) => {
    const auGel = gel.get(nom);
    const recue = recues.get(nom);
    if (recue === undefined) return [`${nom} absent des ${nature.recus}`];
    if (auGel === undefined) return [`${nom} absent du gel`];
    return auGel === recue ? [] : [`${nom} modifié depuis le gel`];
  });
}

function exigerDuGel(repertoire: string, donnees_commit: string | undefined, nature: Nature): void {
  if (donnees_commit === undefined) {
    throw nature.refus(repertoire, [
      "le run n'inscrit pas versions.donnees_commit, le commit de data/ lu au gel, auquel les comparer",
    ]);
  }
  const prefixe = prefixeDansLeDepot(repertoire, nature);
  exigerCommit(repertoire, donnees_commit, nature);
  const auGel = empreintesAuGel(repertoire, donnees_commit, prefixe, nature);
  const ecarts = ecartsDe(auGel, empreintesRecues(repertoire, nature), nature);
  if (ecarts.length > 0) throw nature.refus(repertoire, ecarts);
}

/**
 * Lève `ItemsHorsDuGel` si `repertoire` diffère de lui-même au commit `donnees_commit`, ou si ce
 * commit manque : un run sans commit du gel ne peut pas prouver que ses items sont ceux du gel.
 */
export function exigerItemsDuGel(repertoire: string, donnees_commit: string | undefined): void {
  exigerDuGel(repertoire, donnees_commit, ITEMS);
}

/** Même contrôle pour le répertoire des mesures (D38) : lève `MesuresHorsDuGel`. */
export function exigerMesuresDuGel(repertoire: string, donnees_commit: string | undefined): void {
  exigerDuGel(repertoire, donnees_commit, MESURES);
}
