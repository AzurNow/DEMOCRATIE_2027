/**
 * L'appel Git bas niveau partagé par `items-au-gel.ts` et `analysis/lecture-run.ts` (constat 37 de
 * la revue du 2026-10-12) : les deux relisent `data/items` au commit du gel, et duplicaient le même
 * `git()`, dont `stderr` est `undefined`, pas une chaîne vide, quand le binaire est introuvable —
 * `.trim()` levait alors une `TypeError` anonyme plutôt qu'un refus nommé. `maxBuffer` passe ici à
 * `1 << 26` (64 Mio) pour les deux appelants, au lieu de la limite par défaut de `spawnSync` (1 Mio),
 * qu'un grand `data/items/` au gel pouvait dépasser.
 *
 * Git qui s'exécute et rend un code de sortie non nul (par exemple `cat-file -e` sur un commit
 * absent) n'est pas une panne : l'appelant le lit dans `ok` et décide. Seule l'impossibilité de
 * lancer `git` lui-même (binaire absent, droits refusés…) lève `GitInaccessible`, nommée, avec le
 * chemin interrogé, le commit visé s'il y en a un, et la cause rendue par Node.
 *
 * `spawnSync` rend aussi `ENOENT`, indistinguable de « git introuvable » dans son `error`, quand
 * `repertoire` lui-même n'existe pas (relecture du 2026-10-21 du constat 37) : la vérification
 * d'existence précède l'appel pour rendre la vraie cause, sans tenter de lancer `git` pour rien.
 * Un répertoire absent n'est alors plus une panne de l'outil Git, mais une sortie `ok: false`
 * ordinaire, que l'appelant refuse nommément comme n'importe quel autre écart au gel.
 */

import { existsSync } from "node:fs";
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

function causeDuLancement(erreur: NodeJS.ErrnoException): string {
  return erreur.code === "ENOENT" ? "git introuvable" : `sortie d'erreur du lancement de git (${erreur.message})`;
}

/** `commit`, s'il est connu, ne nomme que le message d'erreur : il n'est jamais passé à Git ici. */
export function executerGit(repertoire: string, arguments_: readonly string[], commit?: string): SortieGit {
  if (!existsSync(repertoire)) return { ok: false, sortie: "", erreur: `répertoire ${repertoire} inexistant` };
  const resultat = spawnSync("git", arguments_, { cwd: repertoire, encoding: "utf8", maxBuffer: 1 << 26 });
  if (resultat.error !== undefined) throw new GitInaccessible(repertoire, commit, causeDuLancement(resultat.error));
  return { ok: resultat.status === 0, sortie: resultat.stdout, erreur: resultat.stderr.trim() };
}
