/**
 * Les candidats interrogés au run vivent une seule fois, dans `analysis/candidats-interroges.ts`
 * (DETTE 2026-11-01, point 2). D'abord les fonctions sur leurs cas limites, puis un test structurel :
 * aucun module de production ne relit le drapeau `interroge` lui-même, hors le chargeur du
 * périmètre, qui refuse une saisie incohérente avant que l'ensemble existe.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  candidatsInterroges,
  candidatsNonInterroges,
  estInterroge,
  idsInterroges,
} from "../analysis/candidats-interroges.ts";

const RACINE = join(import.meta.dirname, "..");

const PERIMETRE = [
  { candidat_id: "c-b", interroge: true, sous_seuil: false },
  { candidat_id: "c-a", interroge: false, sous_seuil: false },
  { candidat_id: "c-c", interroge: true, sous_seuil: true },
] as const;

describe("candidats interrogés : une seule définition", () => {
  it("estInterroge ne lit que le drapeau", () => {
    expect(estInterroge({ interroge: true })).toBe(true);
    expect(estInterroge({ interroge: false })).toBe(false);
  });

  it("candidatsInterroges garde l'ordre reçu et les objets d'origine, sous-seuil compris", () => {
    const gardes = candidatsInterroges(PERIMETRE);
    expect(gardes.map((c) => c.candidat_id)).toEqual(["c-b", "c-c"]);
    expect(gardes[0]).toBe(PERIMETRE[0]);
  });

  it("candidatsNonInterroges est le complément exact, dans l'ordre reçu", () => {
    expect(candidatsNonInterroges(PERIMETRE).map((c) => c.candidat_id)).toEqual(["c-a"]);
    expect(candidatsInterroges(PERIMETRE).length + candidatsNonInterroges(PERIMETRE).length).toBe(PERIMETRE.length);
  });

  it("idsInterroges : les identifiants seuls", () => {
    expect([...idsInterroges(PERIMETRE)]).toEqual(["c-b", "c-c"]);
  });

  it("périmètre vide, ou personne d'interrogé : ensembles vides, jamais d'erreur ni de valeur supposée", () => {
    expect(candidatsInterroges([])).toEqual([]);
    expect(idsInterroges([])).toEqual(new Set());
    expect(idsInterroges([{ candidat_id: "c-x", interroge: false }])).toEqual(new Set());
  });
});

/* -------------------------------------------------------------- structure */

/** Répertoires du code de production. */
const PRODUCTION = ["pipeline", "analysis", "validation", "outils", "notation-humaine"];
/** Le seul endroit où le drapeau se lit. */
const DEFINITION = "analysis/candidats-interroges.ts";
/** La validation de saisie du périmètre : elle lit le drapeau pour le refuser, avant le run. */
const VALIDATION_DE_SAISIE = "pipeline/questions/charger-perimetre.ts";

const LECTURES: readonly { readonly nom: string; readonly motif: RegExp }[] = [
  { nom: "accès .interroge", motif: /\.interroge\b(?!\s*:)/ },
  { nom: "accès [\"interroge\"]", motif: /\[\s*["']interroge["']\s*\]/ },
  { nom: "déstructuration de interroge", motif: /\{[^}]*\binterroge\b[^}:]*\}\s*=/ },
];

function fichiersTs(repertoire: string): string[] {
  return readdirSync(repertoire).flatMap((nom) => {
    const chemin = join(repertoire, nom);
    if (statSync(chemin).isDirectory()) return nom === "node_modules" || nom === "dist" ? [] : fichiersTs(chemin);
    return nom.endsWith(".ts") ? [chemin] : [];
  });
}

/** Le code sans ses commentaires de ligne et de bloc, ligne par ligne (les numéros sont gardés). */
function lignesDeCode(texte: string): readonly string[] {
  const sansBlocs = texte.replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "));
  return sansBlocs.split("\n").map((ligne) => ligne.replace(/(^|[^:])\/\/.*$/, "$1"));
}

function lecturesDuDrapeau(): readonly string[] {
  const trouvees: string[] = [];
  for (const repertoire of PRODUCTION) {
    for (const chemin of fichiersTs(join(RACINE, repertoire))) {
      const nom = relative(RACINE, chemin);
      if (nom === DEFINITION || nom === VALIDATION_DE_SAISIE) continue;
      lignesDeCode(readFileSync(chemin, "utf8")).forEach((ligne, rang) => {
        for (const { nom: forme, motif } of LECTURES) if (motif.test(ligne)) trouvees.push(`${nom}:${rang + 1} (${forme})`);
      });
    }
  }
  return trouvees;
}

describe("structure : le drapeau `interroge` n'est lu que par sa définition", () => {
  it("aucune autre lecture dans le code de production", () => {
    expect(lecturesDuDrapeau()).toEqual([]);
  });

  it("le balayage repère bien une lecture en ligne (témoin)", () => {
    const temoin = lignesDeCode("const a = run.perimetre.candidats.filter((c) => c.interroge);");
    expect(LECTURES.some(({ motif }) => temoin.some((ligne) => motif.test(ligne)))).toBe(true);
    const commentaire = lignesDeCode("/** lit `candidats[].interroge` */\n// c.interroge");
    expect(LECTURES.some(({ motif }) => commentaire.some((ligne) => motif.test(ligne)))).toBe(false);
  });

  it("une déclaration de type `readonly interroge: boolean` n'est pas une lecture", () => {
    const declaration = lignesDeCode("readonly interroge: boolean;");
    expect(LECTURES.some(({ motif }) => declaration.some((ligne) => motif.test(ligne)))).toBe(false);
  });
});
