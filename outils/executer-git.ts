/**
 * L'appel Git bas niveau partagé par `items-au-gel.ts` et `analysis/lecture-run.ts` (constat 37 de
 * la revue du 2026-10-12) : les deux relisent `data/items` au commit du gel, et duplicaient le même
 * `git()`, dont `stderr` est `undefined`, pas une chaîne vide, quand le binaire est introuvable —
 * `.trim()` levait alors une `TypeError` anonyme plutôt qu'un refus nommé.
 *
 * Git qui s'exécute et rend un code de sortie non nul (par exemple `cat-file -e` sur un commit
 * absent) n'est pas une panne : l'appelant le lit dans `ok` et décide. Seule l'impossibilité de
 * lancer `git` lui-même (binaire absent, droits refusés…) lève `GitInaccessible`, nommée, avec le
 * chemin interrogé, le commit visé s'il y en a un, et la cause rendue par Node.
 */

import { spawnSync } from "node:child_process";

export interface SortieGit {
  readonly ok: boolean;
  readonly sortie: string;
  readonly erreur: string;
}

/** `git` n'a pas pu être lancé du tout : ni code de sortie, ni `stderr` fiable à lire. */
export class GitInaccessible extends Error {
  constructor(repertoire: string, commit: string | undefined, cause: string) {
    super(
      `git est inaccessible pour ${repertoire}${commit === undefined ? "" : ` au commit ${commit}`} : ${cause}. ` +
        `La relecture au commit du gel ne peut pas continuer sans Git en local.`,
    );
    this.name = "GitInaccessible";
  }
}

/** `commit`, s'il est connu, ne nomme que le message d'erreur : il n'est jamais passé à Git ici. */
export function executerGit(repertoire: string, arguments_: readonly string[], commit?: string): SortieGit {
  const resultat = spawnSync("git", arguments_, { cwd: repertoire, encoding: "utf8", maxBuffer: 1 << 26 });
  if (resultat.error !== undefined) {
    const code = (resultat.error as NodeJS.ErrnoException).code;
    const cause = code === "ENOENT" ? "git introuvable" : `sortie d'erreur du lancement de git (${resultat.error.message})`;
    throw new GitInaccessible(repertoire, commit, cause);
  }
  return { ok: resultat.status === 0, sortie: resultat.stdout, erreur: resultat.stderr.trim() };
}
