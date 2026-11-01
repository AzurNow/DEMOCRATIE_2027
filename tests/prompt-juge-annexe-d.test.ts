/**
 * Conformité du 2026-11-01, n° 5 : le prompt du juge (`prompts/judge-1.0.0.md`) porte le squelette
 * de l'annexe D du protocole (exigences §7.15, D.01, D.05). Modèle : `protocole-annexe-a.test.ts`.
 *
 * Ce qui se compare, et rien de plus (le squelette est un résumé, le prompt en est la version
 * complète, D.05) :
 *   1. les variables `{nom.champ}` : le même ensemble des deux côtés, ni manquante, ni en trop ;
 *   2. l'ordre de première apparition de ces variables ;
 *   3. l'ordre des blocs du squelette qui portent une variable (étiquettes en capitales : DATE DU
 *      RUN, QUESTION, RÉPONSE ATTENDUE, RÉPONSE À NOTER, TEXTE DES PAGES CITÉES, RÉFÉRENCE), chacun
 *      cherché à sa première apparition en début de ligne dans le prompt ;
 *   4. la phrase d'ouverture du squelette (D.01, §7.15 : le juge ne donne pas son avis sur la
 *      position), recopiée mot pour mot dans le prompt.
 * Ne se compare PAS : les blocs RÈGLES et SORTIE JSON du squelette (le prompt les développe sous
 * d'autres intitulés) ni les définitions de classement (§7.03 à §7.05, acceptées sans test).
 *
 * Les témoins sont construits en mémoire : aucun fichier de `prompts/` n'est modifié.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(import.meta.dirname, "..");
const VARIABLE = /\{([a-z_]+(?:\.[a-z_]+)*)\}/g;
const ETIQUETTE = /^([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ' ]*[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ])(?![a-zà-ÿ])/;

/** Le premier bloc ```text qui suit `titre`. Lève s'il manque : jamais de squelette par défaut. */
function blocTexteApres(source: string, titre: string, nom: string): string {
  const debut = source.indexOf(titre);
  if (debut < 0) throw new Error(`${nom} introuvable`);
  const bloc = /```text\n([\s\S]*?)\n```/.exec(source.slice(debut));
  if (bloc?.[1] === undefined) throw new Error(`bloc text de ${nom} introuvable`);
  return bloc[1];
}

function squeletteAnnexeD(): string {
  const protocole = readFileSync(resolve(RACINE, "docs/PROTOCOLE.md"), "utf8");
  return blocTexteApres(protocole, "**D. Squelette du prompt juge**", "annexe D de docs/PROTOCOLE.md");
}

function promptJuge(): string {
  const fichier = readFileSync(resolve(RACINE, "prompts/judge-1.0.0.md"), "utf8");
  return blocTexteApres(fichier, "## Texte du prompt", "« Texte du prompt » de prompts/judge-1.0.0.md");
}

/** Variables dans l'ordre de première apparition, sans doublon. */
function variablesDe(texte: string): string[] {
  const vues = [...texte.matchAll(VARIABLE)].map((m) => m[1] as string);
  return [...new Set(vues)];
}

function etiquetteDeLigne(ligne: string): string | undefined {
  return ETIQUETTE.exec(ligne)?.[1];
}

function sansIndefini(etiquettes: readonly (string | undefined)[]): string[] {
  return etiquettes.filter((e): e is string => e !== undefined);
}

/** Étiquettes de blocs (capitales en début de ligne) dans l'ordre, première apparition de chacune. */
function etiquettesDe(texte: string): string[] {
  return [...new Set(sansIndefini(texte.split("\n").map(etiquetteDeLigne)))];
}

/** Étiquettes des blocs du squelette dont la ligne porte au moins une variable. */
function etiquettesAvecVariable(squelette: string): string[] {
  const lignes = squelette.split("\n").filter((ligne) => variablesDe(ligne).length > 0);
  return sansIndefini(lignes.map(etiquetteDeLigne));
}

function ecartsVariables(squelette: string, prompt: string): string[] {
  const attendues = variablesDe(squelette);
  const presentes = variablesDe(prompt);
  const absentes = attendues.filter((v) => !presentes.includes(v)).map((v) => `variable absente du prompt : {${v}}`);
  const enTrop = presentes.filter((v) => !attendues.includes(v)).map((v) => `variable en trop dans le prompt : {${v}}`);
  return [...absentes, ...enTrop];
}

function ecartOrdreVariables(squelette: string, prompt: string): string[] {
  const attendues = variablesDe(squelette);
  const presentes = variablesDe(prompt).filter((v) => attendues.includes(v));
  const communes = attendues.filter((v) => presentes.includes(v));
  return communes.join(" ") === presentes.join(" ")
    ? []
    : [`ordre des variables différent : ${communes.join(" ")} / ${presentes.join(" ")}`];
}

function ecartsBlocs(squelette: string, prompt: string): string[] {
  const attendus = etiquettesAvecVariable(squelette);
  const dansPrompt = etiquettesDe(prompt);
  const absents = attendus.filter((e) => !dansPrompt.includes(e)).map((e) => `bloc absent du prompt : ${e}`);
  const presents = attendus.filter((e) => dansPrompt.includes(e));
  const observes = dansPrompt.filter((e) => presents.includes(e));
  const ordre =
    presents.join(" | ") === observes.join(" | ") ? [] : [`ordre des blocs différent : ${observes.join(" | ")}`];
  return [...absents, ...ordre];
}

function normaliserEspaces(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

function ecartOuverture(squelette: string, prompt: string): string[] {
  const ouverture = normaliserEspaces(squelette.split("\n")[0] ?? "");
  if (ouverture === "") return ["le squelette n'a pas de phrase d'ouverture"];
  return normaliserEspaces(prompt).includes(ouverture)
    ? []
    : [`phrase d'ouverture du squelette absente : ${ouverture}`];
}

/** Tous les écarts entre le squelette et le prompt ; vide si le prompt porte le squelette. */
function ecartsDuPrompt(squelette: string, prompt: string): string[] {
  return [
    ...ecartsVariables(squelette, prompt),
    ...ecartOrdreVariables(squelette, prompt),
    ...ecartsBlocs(squelette, prompt),
    ...ecartOuverture(squelette, prompt),
  ];
}

/** Échange deux paragraphes (séparés par une ligne vide) du texte, repérés par leur début. */
function echangerParagraphes(texte: string, debutA: string, debutB: string): string {
  const paragraphes = texte.split("\n\n");
  const a = paragraphes.findIndex((p) => p.startsWith(debutA));
  const b = paragraphes.findIndex((p) => p.startsWith(debutB));
  if (a < 0 || b < 0) throw new Error("paragraphe à échanger introuvable");
  [paragraphes[a], paragraphes[b]] = [paragraphes[b] as string, paragraphes[a] as string];
  return paragraphes.join("\n\n");
}

describe("annexe D du protocole et prompts/judge-1.0.0.md (conformité n° 5 ; §7.15, D.01, D.05)", () => {
  const squelette = squeletteAnnexeD();
  const prompt = promptJuge();

  it("le prompt porte les variables, l'ordre des blocs et la phrase d'ouverture du squelette", () => {
    expect(ecartsDuPrompt(squelette, prompt)).toEqual([]);
  });

  it("le squelette lu porte bien les quatorze variables et les six blocs attendus (garde du test lui-même)", () => {
    expect(variablesDe(squelette)).toHaveLength(14);
    expect(etiquettesAvecVariable(squelette)).toEqual([
      "DATE DU RUN",
      "QUESTION",
      "RÉPONSE ATTENDUE",
      "RÉPONSE À NOTER",
      "TEXTE DES PAGES CITÉES",
      "RÉFÉRENCE",
    ]);
  });

  it("une variable du squelette absente du prompt fait échouer la comparaison", () => {
    const temoin = prompt.replaceAll("{pages_citees}", "");
    expect(ecartsDuPrompt(squelette, temoin)).toContain("variable absente du prompt : {pages_citees}");
  });

  it("une variable en trop dans le prompt fait échouer la comparaison", () => {
    const temoin = `${prompt}\nOutil noté : {outil_id}`;
    expect(ecartsDuPrompt(squelette, temoin)).toContain("variable en trop dans le prompt : {outil_id}");
  });

  it("des blocs dans un autre ordre font échouer la comparaison", () => {
    const temoin = echangerParagraphes(prompt, "DATE DU RUN", "RÉFÉRENCE : items");
    const ecarts = ecartsDuPrompt(squelette, temoin);
    expect(ecarts.some((e) => e.startsWith("ordre des blocs différent"))).toBe(true);
  });

  it("un bloc du squelette absent du prompt fait échouer la comparaison", () => {
    const temoin = prompt.replace("TEXTE DES PAGES CITÉES", "pages citées");
    expect(ecartsDuPrompt(squelette, temoin)).toContain("bloc absent du prompt : TEXTE DES PAGES CITÉES");
  });

  it("des variables dans un autre ordre font échouer la comparaison", () => {
    const temoin = echangerParagraphes(prompt, "DATE DU RUN", "RÉFÉRENCE : items");
    expect(ecartsDuPrompt(squelette, temoin).some((e) => e.startsWith("ordre des variables différent"))).toBe(true);
  });

  it("une phrase d'ouverture modifiée fait échouer la comparaison (D.01, §7.15)", () => {
    const temoin = prompt.replace("Tu ne donnes pas ton avis sur la position.", "Donne ton avis sur la position.");
    expect(ecartsDuPrompt(squelette, temoin).some((e) => e.startsWith("phrase d'ouverture"))).toBe(true);
  });

  it("les accolades des exemples JSON du prompt ne sont pas prises pour des variables", () => {
    expect(variablesDe('{"categorie": "exacte", "drapeaux": []}')).toEqual([]);
  });
});
