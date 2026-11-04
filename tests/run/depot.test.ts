/**
 * Constat n° 10 de la conformité du 2026-11-03 (§9 et §10) : ni les pages citées par les réponses, ni
 * les copies de sources non republiables n'entrent dans une archive du dépôt Zenodo
 * (`pipeline/run/depot.ts`). Chaque cas limite du brief a son test.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTENU_SOURCES_ARCHIVEES,
  DepotRefuse,
  SEGMENTS_HORS_DEPOT,
  verifierArchives,
  verifierEntreesArchive,
} from "../../pipeline/run/depot.ts";
import type { ArchiveDeclaree, MotifDepotRefuse, SourceDeclaree } from "../../pipeline/run/depot.ts";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = "a".repeat(64);

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

describe("dépôt, pages citées", () => {
  it("page citée d'un lien vivant : hors archive, mais le résultat qui porte son empreinte part", () => {
    expect(motif(() => verifierEntreesArchive("volume.zip", [`volume/liens/pages/${SHA}.html`]))).toBe("page_citee_dans_archive");
    expect(() => verifierEntreesArchive("volume.zip", [`volume/liens/${SHA}.json`, "volume/reponses/01.json"])).not.toThrow();
  });

  it("le refus tient avec des séparateurs Windows, un préfixe ./ et un chemin relatif à liens/", () => {
    for (const chemin of [`volume\\liens\\pages\\${SHA}.pdf`, `./volume/liens/pages/${SHA}.html`, `liens/pages/${SHA}.html`]) {
      expect(motif(() => verifierEntreesArchive("volume.zip", [chemin]))).toBe("page_citee_dans_archive");
    }
  });

  it("un seul fichier de pages dans une longue liste suffit au refus", () => {
    const chemins = [...Array.from({ length: 50 }, (_, i) => `volume/reponses/${i}.json`), `volume/liens/pages/${SHA}.html`];
    expect(motif(() => verifierEntreesArchive("volume.zip", chemins))).toBe("page_citee_dans_archive");
  });

  it("un dossier qui s'appelle seulement pages, hors de liens/, n'est pas écarté", () => {
    expect(() => verifierEntreesArchive("x.zip", ["volume/pages/a.json", "volume/liens-pages/b.json"])).not.toThrow();
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
  it("le dossier exclu est celui que le test des liens écrit, en Python comme en TypeScript", () => {
    const python = readFileSync(join(RACINE, "pipeline", "liens", "sortie.py"), "utf8");
    const ts = readFileSync(join(RACINE, "pipeline", "notation", "fournisseur-fichiers.ts"), "utf8");
    const dossier = /REPERTOIRE_PAGES = "([^"]+)"/;
    const [liens, pages] = SEGMENTS_HORS_DEPOT[0] ?? [];
    expect(liens).toBe("liens");
    expect(python.match(dossier)?.[1]).toBe(pages);
    expect(ts.match(dossier)?.[1]).toBe(pages);
  });

  it("le schéma du run admet toujours l'archive sources_archivees que la garde conditionne", () => {
    const schema = JSON.parse(readFileSync(join(RACINE, "schema", "run.schema.json"), "utf8")) as {
      properties: { depot: { properties: { archives: { items: { properties: { contenu: { enum: string[] } } } } } } };
    };
    expect(schema.properties.depot.properties.archives.items.properties.contenu.enum).toContain(CONTENU_SOURCES_ARCHIVEES);
  });

  it("runs/README.md nomme l'exclusion des pages citées de l'archive", () => {
    const lisezmoi = readFileSync(join(RACINE, "runs", "README.md"), "utf8");
    expect(lisezmoi).toContain("liens/pages/");
    expect(lisezmoi).toMatch(/jamais dans l'archive Zenodo/i);
    expect(lisezmoi).toContain("pipeline/run/depot.ts");
  });
});
