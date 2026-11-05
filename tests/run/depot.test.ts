/**
 * Constat n° 10 de la conformité du 2026-11-03 (§9 et §10) : ni les pages citées par les réponses, ni
 * les copies de sources non republiables n'entrent dans une archive du dépôt Zenodo
 * (`pipeline/run/depot.ts`). Chaque cas limite du brief a son test. D75 (4) : les pages citées vivent
 * hors de `volume/`, sous `runs/<date>/pages-citees/` ; l'archive du volume n'a plus d'exclusion.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as depot from "../../pipeline/run/depot.ts";
import { CONTENU_SOURCES_ARCHIVEES, DepotRefuse, verifierArchives } from "../../pipeline/run/depot.ts";
import type { ArchiveDeclaree, MotifDepotRefuse, SourceDeclaree } from "../../pipeline/run/depot.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function motif(action: () => unknown): MotifDepotRefuse {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof DepotRefuse) return erreur.motif;
    throw erreur;
  }
  throw new Error("aucun refus");
}

const archiveSources: ArchiveDeclaree = { nom: "sources.zip", contenu: CONTENU_SOURCES_ARCHIVEES };
const publique: SourceDeclaree = { url: "https://exemple.invalid/a", publication: "publique" };

/** Le dossier des pages, tel que l'écrivent `pipeline/liens/sortie.py` et le lit `fournisseur-fichiers.ts`. */
function dossierDesPages(fichier: string): string | undefined {
  return /REPERTOIRE_PAGES = "([^"]+)"/.exec(readFileSync(join(RACINE, fichier), "utf8"))?.[1];
}

describe("D75 (4) : pages citées hors du volume", () => {
  it("D75 (4) cas 5 : l'archive du volume n'a plus d'exclusion nommée", () => {
    const exports = Object.keys(depot);
    expect(exports).not.toContain("SEGMENTS_HORS_DEPOT");
    expect(exports).not.toContain("verifierEntreesArchive");
    expect(readFileSync(join(RACINE, "pipeline", "run", "depot.ts"), "utf8")).not.toContain("page_citee_dans_archive");
  });

  it("D75 (4) cas 5 : le volume ne contient aucune page, le dossier des pages est hors de volume/ (Python, TypeScript, schéma)", () => {
    const python = dossierDesPages("pipeline/liens/sortie.py");
    expect(python).toBe("pages-citees");
    expect(dossierDesPages("pipeline/notation/fournisseur-fichiers.ts")).toBe(python);
    const schema = readFileSync(join(RACINE, "schema", "existence-lien.schema.json"), "utf8");
    expect(schema.match(/"pattern": "\^pages-citees\/\[0-9a-f\]\{64\}/g)).toHaveLength(2);
    expect(schema).not.toMatch(/"pattern": "\^pages\//);
  });

  it("D75 (4) cas 6 : runs/<date>/pages-citees/ est ignoré par Git, comme le volume ; run.json ne l'est pas", () => {
    const ignore = (chemin: string): boolean => {
      try {
        execFileSync("git", ["check-ignore", "--no-index", "-q", chemin], { cwd: RACINE, stdio: "ignore" });
        return true;
      } catch (erreur) {
        if ((erreur as { status?: number }).status === 1) return false;
        throw erreur;
      }
    };
    expect(ignore(`runs/2026-11-27/pages-citees/${"a".repeat(64)}.html`)).toBe(true);
    expect(ignore("runs/2026-11-27/volume/liens/x.json")).toBe(true);
    expect(ignore("runs/2026-11-27/run.json")).toBe(false);
  });
});

describe("dépôt, sources archivées", () => {
  it("source republiable : admise", () => {
    expect(() => verifierArchives([archiveSources], [publique])).not.toThrow();
  });

  it("source dont publication est interne : refusée", () => {
    const interne: SourceDeclaree = { url: "https://exemple.invalid/b", publication: "interne" };
    expect(motif(() => verifierArchives([archiveSources], [publique, interne]))).toBe("source_non_republiable");
  });

  it("champ publication absent : refusé, aucun défaut permissif", () => {
    expect(motif(() => verifierArchives([archiveSources], [{ url: "https://exemple.invalid/c" }]))).toBe("publication_absente");
  });

  it("valeur inconnue de publication : refusée", () => {
    expect(motif(() => verifierArchives([archiveSources], [{ url: "https://exemple.invalid/d", publication: "Publique" }]))).toBe(
      "source_non_republiable",
    );
  });

  it("archive de sources sans aucune source déclarée : refusée", () => {
    expect(motif(() => verifierArchives([archiveSources], []))).toBe("sources_archivees_sans_source");
  });

  it("les autres contenus d'archive ne dépendent pas de source.publication", () => {
    const autres = ["reponses_brutes", "notations_individuelles", "captures_application"].map((contenu) => ({ nom: `${contenu}.zip`, contenu }));
    expect(() => verifierArchives(autres, [{ url: "https://exemple.invalid/e", publication: "interne" }])).not.toThrow();
  });
});

describe("dépôt, garde structurelle", () => {
  it("le schéma du run admet toujours l'archive sources_archivees que la garde conditionne", () => {
    const schema = JSON.parse(readFileSync(join(RACINE, "schema", "run.schema.json"), "utf8")) as {
      properties: { depot: { properties: { archives: { items: { properties: { contenu: { enum: string[] } } } } } } };
    };
    expect(schema.properties.depot.properties.archives.items.properties.contenu.enum).toContain(CONTENU_SOURCES_ARCHIVEES);
  });

  it("D75 (4) : runs/README.md dit que le volume part en entier et que pages-citees/ ne part jamais", () => {
    const lisezmoi = readFileSync(join(RACINE, "runs", "README.md"), "utf8");
    expect(lisezmoi).toContain("pages-citees/");
    expect(lisezmoi).toMatch(/jamais dans l'archive Zenodo/i);
    expect(lisezmoi).toMatch(/en entier, sans exception/);
    expect(lisezmoi).not.toContain("liens/pages/<sha256>");
    expect(lisezmoi).not.toMatch(/À L'EXCEPTION/);
    expect(lisezmoi).toContain("pipeline/run/depot.ts");
  });
});
