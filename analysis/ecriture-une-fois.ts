/**
 * L'écriture « une fois » du dépôt : un fichier neuf, publié par lien dur, jamais remplacé. Seule
 * implémentation, partagée par les écrivains de `analysis/` (`metriques.json` dans
 * `analyse-du-run.ts`, le recalcul (b) daté dans `recalcul-b.ts`) et ceux de `pipeline/` (journal
 * des octets reçus de l'interrogation, staging des reformulations), qui l'importent par
 * `pipeline/run/ecriture.ts` (sens admis par CLAUDE.md : `pipeline/` importe `analysis/`, jamais
 * l'inverse).
 *
 * Le lien dur est ce qui ferme la course entre « la cible est-elle là ? » et « je l'écris » : un
 * renommage remplacerait en silence un fichier publié entre-temps par une commande concurrente, un
 * lien exclusif échoue (`EEXIST`) et laisse ce fichier intact. Et comme le fichier concurrent n'a
 * été lié qu'après avoir été écrit et synchronisé en entier, le relire au moment du refus le lit
 * entier.
 */

import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, linkSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";

/** Écrit la totalité du tampon : `writeSync` peut n'en écrire qu'une partie en un seul appel. */
function ecrireIntegralement(descripteur: number, octets: Uint8Array): void {
  let ecrit = 0;
  while (ecrit < octets.length) {
    ecrit += writeSync(descripteur, octets, ecrit, octets.length - ecrit);
  }
}

/** Lie `temporaire` sous `chemin`, exclusif : `true` si lié, `false` si le nom était déjà pris ; tout autre refus remonte. */
function lierExclusif(temporaire: string, chemin: string): boolean {
  try {
    linkSync(temporaire, chemin);
    return true;
  } catch (erreur) {
    if (erreur instanceof Error && "code" in erreur && erreur.code === "EEXIST") return false;
    throw erreur;
  }
}

const octetsDe = (contenu: string | Uint8Array): Uint8Array => (typeof contenu === "string" ? new TextEncoder().encode(contenu) : contenu);

/**
 * Le cœur commun : un temporaire caché et unique du même répertoire, créé en exclusif (`wx`), écrit
 * intégralement puis synchronisé (`fsync`), lié sous `<repertoire>/<nom>` (exclusif), puis supprimé
 * dans tous les cas, échec compris. Rend `false` si le nom était déjà pris, fichier existant intact.
 */
function publierParLien(repertoire: string, nom: string, octets: Uint8Array): boolean {
  const temporaire = join(repertoire, `.${nom}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const descripteur = openSync(temporaire, "wx");
  try {
    try {
      ecrireIntegralement(descripteur, octets);
      fsyncSync(descripteur);
    } finally {
      closeSync(descripteur);
    }
    return lierExclusif(temporaire, join(repertoire, nom));
  } finally {
    rmSync(temporaire, { force: true });
  }
}

/**
 * Écrit `contenu` (texte en UTF-8, ou octets exacts) sous `<repertoire>/<nom>`, une fois, en entier
 * ou pas du tout. Un arrêt pendant l'écriture laisse au plus le temporaire, jamais le nom final
 * tronqué. Nom déjà pris ⇒ `dejaEcrit(chemin)`, fichier existant intact. Le répertoire n'est pas
 * créé ici : c'est à l'appelant de le vouloir. Rend le chemin écrit.
 */
export function ecrireUneFois(repertoire: string, nom: string, contenu: string | Uint8Array, dejaEcrit: (chemin: string) => Error): string {
  const chemin = join(repertoire, nom);
  if (!publierParLien(repertoire, nom, octetsDe(contenu))) throw dejaEcrit(chemin);
  return chemin;
}

export type IssueEcritureUneFois = "ecrit" | "inchange";

/**
 * Comme `ecrireUneFois`, sauf qu'un nom déjà pris — avant l'appel ou par un écrivain concurrent
 * pendant celui-ci — n'est pas un refus d'office : le fichier en place est relu et comparé à
 * l'octet. Identique ⇒ `"inchange"`, rien n'est touché ; différent ⇒ `divergent(chemin)`, fichier
 * en place intact. Jamais de remplacement.
 */
export function ecrireUneFoisOuComparer(
  repertoire: string,
  nom: string,
  contenu: string | Uint8Array,
  divergent: (chemin: string) => Error,
): IssueEcritureUneFois {
  const octets = octetsDe(contenu);
  if (publierParLien(repertoire, nom, octets)) return "ecrit";
  const chemin = join(repertoire, nom);
  if (Buffer.from(octets).equals(readFileSync(chemin))) return "inchange";
  throw divergent(chemin);
}
