/**
 * `pipeline/extraction/epinglage-en-service.ts` : l'épinglage des extracteurs de texte en service,
 * lu dans `pipeline/collecte/textes/epinglage.json`, le même fichier que Python
 * (`pipeline/collecte/textes/en_service.py`, testé par `tests/collecte/test_epinglage_en_service.py`).
 * Décision D56 (3), §4. Aucun réseau.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import {
  CHEMIN_EPINGLAGE,
  EpinglageEnServiceIllisible,
  estEnService,
  lireEpinglageEnService,
  type EpinglageEnService,
} from "../../pipeline/extraction/epinglage-en-service.ts";
import { HTML, PYMUPDF, fiche } from "./aides.ts";

const DEPOT = resolve(import.meta.dirname, "../..");
const racines: string[] = [];

afterEach(() => {
  racines.splice(0).forEach((racine) => rmSync(racine, { recursive: true, force: true }));
});

const DECLARATION = {
  pdf: { outil: "pymupdf", version: "1.28.2", options: { mode: "text", drapeaux: 67, separateur_pages: "\f" } },
  html: { outil: "html.parser", version: { interpreteur: "python" }, options: { regle: "blocs-1" } },
  transcription: { outil: "webvtt", version: { interpreteur: "python" }, options: { regle: "vtt-1" } },
};

function racineAvec(contenu: unknown): string {
  const racine = mkdtempSync(join(tmpdir(), "banc-epinglage-"));
  racines.push(racine);
  const chemin = join(racine, ...CHEMIN_EPINGLAGE);
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, typeof contenu === "string" ? contenu : JSON.stringify(contenu));
  return racine;
}

function enService(contenu: unknown = DECLARATION): EpinglageEnService {
  return lireEpinglageEnService(racineAvec(contenu));
}

describe("le fichier du dépôt, lu comme Python le lit", () => {
  it("est pipeline/collecte/textes/epinglage.json, le chemin de en_service.py", () => {
    expect(CHEMIN_EPINGLAGE.join("/")).toBe("pipeline/collecte/textes/epinglage.json");
    expect(readFileSync(join(DEPOT, "pipeline", "collecte", "textes", "en_service.py"), "utf8")).toContain('with_name("epinglage.json")');
  });

  it("accord Python ↔ TS : mêmes genres et mêmes déclarations que le JSON brut, un outil par genre", () => {
    const brut = JSON.parse(readFileSync(join(DEPOT, ...CHEMIN_EPINGLAGE), "utf8")) as Record<string, Record<string, unknown>>;
    expect(Object.keys(brut).sort()).toEqual(["html", "pdf", "transcription"]);
    const lus = lireEpinglageEnService(DEPOT);
    expect(lus.map(({ genre, outil, version, options }) => [genre, { outil, version, options }])).toEqual(Object.entries(brut));
  });

  it("la version de pymupdf déclarée est celle qu'épingle pyproject.toml", () => {
    const epingle = /"pymupdf==([^"]+)"/u.exec(readFileSync(join(DEPOT, "pyproject.toml"), "utf8"))?.[1];
    const pdf = lireEpinglageEnService(DEPOT).find((declaration) => declaration.outil === "pymupdf");
    expect(epingle).toBeDefined();
    expect(pdf?.version).toBe(epingle);
  });

  it("une fiche portant l'extracteur pymupdf déclaré est conforme au schéma des fiches", () => {
    const pdf = lireEpinglageEnService(DEPOT).find((declaration) => declaration.outil === "pymupdf");
    if (pdf === undefined || typeof pdf.version !== "string") throw new Error("pymupdf doit être déclaré en version écrite en clair");
    const contenu = fiche("Texte.", { outil: pdf.outil, version: pdf.version, options: pdf.options }, { pages: [{ numero: 1, debut: 0, fin: 6 }] });
    expect(() => valider("extraction-texte", contenu, "fiche")).not.toThrow();
  });
});

describe("fichier absent ou illisible : refus nommé, jamais de valeur par défaut", () => {
  it("absent ⇒ EpinglageEnServiceIllisible", () => {
    const racine = mkdtempSync(join(tmpdir(), "banc-epinglage-"));
    racines.push(racine);
    expect(() => lireEpinglageEnService(racine)).toThrow(EpinglageEnServiceIllisible);
    expect(() => lireEpinglageEnService(racine)).toThrow(/absent/u);
  });

  it("pas du JSON ⇒ EpinglageEnServiceIllisible", () => {
    expect(() => enService("{ pas du json")).toThrow(EpinglageEnServiceIllisible);
    expect(() => enService("{ pas du json")).toThrow(/JSON illisible/u);
  });

  const nonConformes: readonly [string, unknown][] = [
    ["liste", []],
    ["objet vide", {}],
    ["clé en trop", { ...DECLARATION, pdf: { ...DECLARATION.pdf, note: "x" } }],
    ["outil vide", { ...DECLARATION, pdf: { ...DECLARATION.pdf, outil: "" } }],
    ["version vide", { ...DECLARATION, pdf: { ...DECLARATION.pdf, version: "" } }],
    ["version absente", { ...DECLARATION, pdf: { outil: "pymupdf", options: {} } }],
    ["autre interpréteur", { ...DECLARATION, html: { ...DECLARATION.html, version: { interpreteur: "ruby" } } }],
    ["options non objet", { ...DECLARATION, html: { ...DECLARATION.html, options: ["blocs-1"] } }],
    ["même outil pour deux genres", { ...DECLARATION, transcription: { ...DECLARATION.html } }],
  ];
  for (const [nom, contenu] of nonConformes) {
    it(`${nom} ⇒ EpinglageEnServiceIllisible`, () => {
      expect(() => enService(contenu)).toThrow(EpinglageEnServiceIllisible);
      expect(() => enService(contenu)).toThrow(/non conforme/u);
    });
  }
});

describe("estEnService : l'épinglage d'une entrée comparé à celui du code", () => {
  const pdf = { ...PYMUPDF, version: "1.28.2", options: DECLARATION.pdf.options };

  it("épinglage en service = celui de l'entrée ⇒ en service", () => {
    expect(estEnService(enService(), pdf)).toBe(true);
  });

  it("version en service plus récente que celle de l'entrée ⇒ pas en service", () => {
    expect(estEnService(enService(), { ...pdf, version: "1.26.4" })).toBe(false);
  });

  it("version en service plus ancienne (retour arrière) ⇒ pas en service", () => {
    expect(estEnService(enService(), { ...pdf, version: "1.29.0" })).toBe(false);
  });

  it("options différentes ⇒ pas en service, même à version égale", () => {
    expect(estEnService(enService(), { ...pdf, options: { ...pdf.options, drapeaux: 3 } })).toBe(false);
  });

  it("outil qu'aucun genre n'a en service ⇒ pas en service", () => {
    const sansPdf = { html: DECLARATION.html, transcription: DECLARATION.transcription };
    expect(estEnService(enService(sansPdf), pdf)).toBe(false);
  });

  it("version d'interpréteur : outil et options comparés, le correctif de Python ne se lit pas hors de Python", () => {
    expect(estEnService(enService(), HTML)).toBe(true);
    expect(estEnService(enService(), { ...HTML, options: { regle: "blocs-2" } })).toBe(false);
  });

  it("version écrite en clair pour html.parser : comparée comme les autres", () => {
    const fige = { ...DECLARATION, html: { ...DECLARATION.html, version: "3.12.9" } };
    expect(estEnService(enService(fige), HTML)).toBe(false);
    expect(estEnService(enService(fige), { ...HTML, version: "3.12.9" })).toBe(true);
  });
});
