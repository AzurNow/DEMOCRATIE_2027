/**
 * `outils/executer-git.ts` (constat 37 de la revue du 2026-10-12) : avant ce module, `git` absent
 * du PATH rendait un `stderr` non défini, et `.trim()` levait une `TypeError` anonyme dans
 * `outils/items-au-gel.ts` et `analysis/lecture-run.ts`. Ici, l'appel lève `GitInaccessible` à la
 * place, et le comportement nominal (git présent) ne change pas.
 */

import { describe, expect, it } from "vitest";
import { executerGit, GitInaccessible } from "../outils/executer-git.ts";

function sansGit<T>(appel: () => T): T {
  const path_avant = process.env["PATH"];
  process.env["PATH"] = "";
  try {
    return appel();
  } finally {
    process.env["PATH"] = path_avant;
  }
}

describe("executerGit", () => {
  it("git introuvable : GitInaccessible nommée, pas de TypeError, avec le chemin et le commit", () => {
    const erreur = sansGit(() => {
      try {
        executerGit("/tmp", ["rev-parse", "--show-prefix"], "abcdef0");
        throw new Error("executerGit n'a pas levé");
      } catch (e) {
        return e;
      }
    });
    expect(erreur).toBeInstanceOf(GitInaccessible);
    expect((erreur as Error).name).toBe("GitInaccessible");
    expect((erreur as Error).message).toContain("/tmp");
    expect((erreur as Error).message).toContain("au commit abcdef0");
    expect((erreur as Error).message).toContain("git introuvable");
  });

  it("git introuvable sans commit connu : le message ne nomme aucun commit", () => {
    const erreur = sansGit(() => {
      try {
        executerGit("/tmp", ["rev-parse", "--show-prefix"]);
        throw new Error("executerGit n'a pas levé");
      } catch (e) {
        return e;
      }
    });
    expect(erreur).toBeInstanceOf(GitInaccessible);
    expect((erreur as Error).message).toMatch(/^git est inaccessible pour \/tmp : git introuvable\./);
  });

  it("comportement nominal inchangé : un appel qui réussit rend ok, sortie et erreur", () => {
    const resultat = executerGit(".", ["rev-parse", "--show-prefix"]);
    expect(resultat.ok).toBe(true);
    expect(resultat.erreur).toBe("");
  });

  it("comportement nominal inchangé : un code de sortie non nul n'est pas une panne Git", () => {
    const resultat = executerGit(".", ["cat-file", "-e", "0000000000000000000000000000000000000000^{commit}"]);
    expect(resultat.ok).toBe(false);
  });
});
