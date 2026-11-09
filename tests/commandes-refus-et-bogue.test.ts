/**
 * Lot 6 de la vague du 2026-11-01 (cohérence avec les constats 20 et 32, corrigés par #158) :
 * `outils/contacts.ts`, `go-no-go.ts`, `go-no-go-contresigner.ts` et `notation-dry.ts` n'attrapent
 * plus toute erreur. Un refus attendu (classe nommée, ou `Error` nue) donne un message et le code 2 ;
 * un bogue (`TypeError`) remonte avec sa pile (`outils/refus-attendu.ts`). Chaque cas est un
 * lancement réel de la commande ; le bogue est injecté par `tests/aides/bogue-injectee.ts`.
 * `outils/notation-controle.ts` les a rejoints (revue du 2026-11-09, constat 10).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { executerOutil, RACINE_PROJET } from "./aides/depot.ts";

const repertoire = mkdtempSync(join(tmpdir(), "banc-commandes-bogue-"));
afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

interface Lancement {
  readonly status: number | null;
  readonly erreur: string;
}

function lancerAvecBogue(outil: string, arguments_: readonly string[]): Lancement {
  const resultat = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--import", join(RACINE_PROJET, "tests/aides/bogue-injectee.ts"), join(RACINE_PROJET, "outils", outil), ...arguments_],
    { encoding: "utf8", env: { ...process.env, BANC_BOGUE_FICHIER: `outils/${outil}` } },
  );
  return { status: resultat.status, erreur: resultat.stderr };
}

function perimetreValide(): string {
  const chemin = join(repertoire, "perimetre.yaml");
  writeFileSync(chemin, "candidats:\n  - candidat_id: demo-b\n    statut_au_gel: actif\n    contact_notification: null\n", "utf8");
  return chemin;
}

function verifierBogueQuiRemonte(resultat: Lancement): void {
  expect(resultat.erreur).toContain("TypeError: bogue injectée par le test");
  expect(resultat.erreur).toMatch(/\n\s+at /);
  expect(resultat.status).not.toBe(0);
  expect(resultat.status).not.toBe(2);
}

describe("outils/contacts.ts", () => {
  it("refus attendu : un périmètre invalide (PerimetreContactsInvalide) donne le message et le code 2", () => {
    const chemin = join(repertoire, "perimetre-invalide.yaml");
    writeFileSync(chemin, "candidats: 3\n", "utf8");
    const resultat = executerOutil("contacts.ts", [`--perimetre=${chemin}`]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("candidats n'est pas une liste");
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
  });

  it("refus attendu : une option inconnue (Error nue) donne le message et le code 2", () => {
    const resultat = executerOutil("contacts.ts", ["--inconnue=1"]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
  });

  it("bogue : une TypeError remonte avec sa pile, pas en message d'une ligne au code 2", () => {
    verifierBogueQuiRemonte(lancerAvecBogue("contacts.ts", [`--perimetre=${perimetreValide()}`]));
  });
});

describe("outils/go-no-go.ts", () => {
  it("refus attendu : sans répertoire, message nommé et code 2", () => {
    const resultat = executerOutil("go-no-go.ts", []);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("Go/no-go non exécuté");
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
  });

  it("bogue : une TypeError remonte avec sa pile", () => {
    const resultat = lancerAvecBogue("go-no-go.ts", [repertoire]);
    verifierBogueQuiRemonte(resultat);
    expect(resultat.erreur).not.toContain("Go/no-go non exécuté");
  });
});

describe("outils/go-no-go-contresigner.ts", () => {
  it("refus attendu : sans --nom, message nommé et code 2", () => {
    const resultat = executerOutil("go-no-go-contresigner.ts", [repertoire]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("Contreseing non exécuté");
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
  });

  it("bogue : une TypeError remonte avec sa pile", () => {
    const resultat = lancerAvecBogue("go-no-go-contresigner.ts", [repertoire, "--nom=Auteur"]);
    verifierBogueQuiRemonte(resultat);
    expect(resultat.erreur).not.toContain("Contreseing non exécuté");
  });
});

describe("outils/notation-dry.ts", () => {
  it("refus attendu : --sortie sans chemin, message nommé et code 2", () => {
    const resultat = executerOutil("notation-dry.ts", ["--sortie"]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("Notation simulée non exécutée");
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
  });

  it("bogue : une TypeError remonte avec sa pile", () => {
    const resultat = lancerAvecBogue("notation-dry.ts", [`--sortie=${join(repertoire, "sortie")}`]);
    verifierBogueQuiRemonte(resultat);
    expect(resultat.erreur).not.toContain("Notation simulée non exécutée");
  });
});

describe("outils/notation-controle.ts (revue du 2026-11-09, constat 10)", () => {
  it("refus attendu : un répertoire de run illisible reste « non exécuté », code 2, sans pile", () => {
    const resultat = executerOutil("notation-controle.ts", [join(repertoire, "run-absent")]);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("Contrôle croisé (n° 18) non exécuté");
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
  });

  it("bogue : une TypeError remonte avec sa pile, jamais maquillée en « non exécuté », code 2", () => {
    const resultat = lancerAvecBogue("notation-controle.ts", [repertoire]);
    verifierBogueQuiRemonte(resultat);
    expect(resultat.erreur).not.toContain("non exécuté");
  });
});
