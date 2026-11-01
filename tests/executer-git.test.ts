/**
 * `outils/executer-git.ts` (constat 37 de la revue du 2026-10-12) : avant ce module, `git` absent
 * du PATH rendait un `stderr` non défini, et `.trim()` levait une `TypeError` anonyme dans
 * `outils/items-au-gel.ts` et `analysis/lecture-run.ts`. Ici, l'appel lève `GitInaccessible` à la
 * place, et le comportement nominal (git présent) ne change pas.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeLancement, executerGit, GitEchecLancement, GitInaccessible } from "../outils/executer-git.ts";

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

function capter(appel: () => void): unknown {
  try {
    appel();
  } catch (erreur) {
    return erreur;
  }
  throw new Error("l'appel n'a pas levé");
}

describe("executerGit, erreurs de lancement autres que « git introuvable » (Lot 6 de la vague du 2026-11-01)", () => {
  it("un répertoire qui est un fichier (ENOTDIR) : GitEchecLancement avec le code et le message d'origine, jamais « git est inaccessible »", () => {
    const repertoire = mkdtempSync(join(tmpdir(), "banc-executer-git-"));
    try {
      const fichier = join(repertoire, "pas-un-repertoire");
      writeFileSync(fichier, "x", "utf8");
      const erreur = capter(() => executerGit(fichier, ["rev-parse", "--show-prefix"], "abcdef0"));
      expect((erreur as Error).constructor).toBe(GitEchecLancement);
      expect((erreur as Error).name).toBe("GitEchecLancement");
      expect((erreur as GitEchecLancement).code).toBe("ENOTDIR");
      expect((erreur as Error).message).toContain("ENOTDIR");
      expect((erreur as Error).message).toContain(fichier);
      expect((erreur as Error).message).toContain("au commit abcdef0");
      expect((erreur as Error).message).not.toContain("git est inaccessible");
    } finally {
      rmSync(repertoire, { recursive: true, force: true });
    }
  });

  it("sortie plus grande que maxBuffer (ENOBUFS) : GitEchecLancement, qui nomme le code, pas « git est inaccessible »", () => {
    const origine = Object.assign(new Error("spawnSync git ENOBUFS"), { code: "ENOBUFS" });
    const erreur = erreurDeLancement("/tmp", undefined, origine);
    expect(erreur.constructor).toBe(GitEchecLancement);
    expect((erreur as GitEchecLancement).code).toBe("ENOBUFS");
    expect(erreur.message).toContain("spawnSync git ENOBUFS");
    expect(erreur.message).not.toContain("git est inaccessible");
  });

  it("binaire sans droit d'exécution (EACCES) : GitInaccessible, comme git introuvable", () => {
    const repertoire = mkdtempSync(join(tmpdir(), "banc-executer-git-"));
    try {
      writeFileSync(join(repertoire, "git"), "#!/bin/sh\n", { mode: 0o644 });
      const erreur = (() => {
        const path_avant = process.env["PATH"];
        process.env["PATH"] = repertoire;
        try {
          return capter(() => executerGit("/tmp", ["rev-parse", "--show-prefix"]));
        } finally {
          process.env["PATH"] = path_avant;
        }
      })();
      expect((erreur as Error).constructor).toBe(GitInaccessible);
    } finally {
      rmSync(repertoire, { recursive: true, force: true });
    }
  });

  it("erreurDeLancement : ENOENT et EACCES du binaire donnent GitInaccessible", () => {
    for (const code of ["ENOENT", "EACCES"]) {
      const erreur = erreurDeLancement("/tmp", undefined, Object.assign(new Error(`spawnSync git ${code}`), { code }));
      expect(erreur.constructor).toBe(GitInaccessible);
    }
  });
});
