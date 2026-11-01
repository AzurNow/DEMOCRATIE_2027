/**
 * §7.12 : deux juges de familles différentes (constat n° 6 de la mise à jour de conformité du
 * 2026-11-01). La règle (`pipeline/notation/familles-juges.ts`) et son refus dans la chaîne de
 * notation, avant toute écriture.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote } from "../../analysis/lecture-run.ts";
import { noterRun } from "../../pipeline/notation/chaine.ts";
import { cleDeFamille, exigerFamillesDistinctes, FamilleDeJugeAbsente, JugesDeMemeFamille } from "../../pipeline/notation/familles-juges.ts";
import { environnementSimule, preparerNotationSimulee, type ParametresNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { ecrireJson } from "./run-fictif.ts";
import { enregistreurs, instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference, type Appel } from "./simulation.ts";

vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

describe("§7.12 : la règle des familles", () => {
  it("deux familles différentes : aucun refus", () => {
    expect(() =>
      exigerFamillesDistinctes([
        { juge_id: "j1", famille_modele: "famille-x" },
        { juge_id: "j2", famille_modele: "famille-y" },
      ]),
    ).not.toThrow();
  });

  it("deux juges de la même famille : JugesDeMemeFamille", () => {
    expect(() =>
      exigerFamillesDistinctes([
        { juge_id: "j1", famille_modele: "famille-x" },
        { juge_id: "j2", famille_modele: "famille-x" },
      ]),
    ).toThrow(JugesDeMemeFamille);
  });

  it("la comparaison ignore la casse, les espaces de bord et la forme Unicode : « Famille-X » et « famille-x » sont la même famille", () => {
    expect(() =>
      exigerFamillesDistinctes([
        { juge_id: "j1", famille_modele: "Famille-X" },
        { juge_id: "j2", famille_modele: " famille-x " },
      ]),
    ).toThrow(JugesDeMemeFamille);
    // « é » composé (U+00E9) et décomposé (e + U+0301) : la même famille après NFC.
    expect(cleDeFamille("éditeur")).toBe(cleDeFamille("éditeur"));
  });

  it("la ponctuation et les espaces intérieurs ne sont pas normalisés : deux chaînes différentes restent deux familles", () => {
    expect(() =>
      exigerFamillesDistinctes([
        { juge_id: "j1", famille_modele: "famille x" },
        { juge_id: "j2", famille_modele: "famille-x" },
      ]),
    ).not.toThrow();
  });

  it.each([
    ["absente", undefined],
    ["vide", ""],
    ["faite d'espaces", "   "],
  ])("famille %s dans la déclaration : FamilleDeJugeAbsente, aucune famille supposée", (_cas, famille) => {
    expect(() =>
      exigerFamillesDistinctes([
        { juge_id: "j1", famille_modele: "famille-x" },
        { juge_id: "j2", famille_modele: famille },
      ]),
    ).toThrow(FamilleDeJugeAbsente);
  });

  it("après le retrait d'un juge, le juge restant seul ne déclenche pas le refus : la règle porte sur les juges déclarés, retirés compris", () => {
    const declares = [
      { juge_id: "j1", famille_modele: "famille-x", retire: true, motif_retrait: "biais contrefactuel" },
      { juge_id: "j2", famille_modele: "famille-y", retire: false },
    ];
    expect(() => exigerFamillesDistinctes(declares)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ dans la chaîne */

/** `run.json` du run préparé, ses juges déclarés sous les familles voulues, et les juges simulés alignés. */
function poserFamilles(repertoire_run: string, familles: Readonly<Record<string, string | undefined>>): ParametresNotationSimulee {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const run = JSON.parse(readFileSync(chemin, "utf8")) as { juges: Record<string, unknown>[] };
  run.juges = run.juges.map((juge) => familleDe(juge, familles[String(juge["juge_id"])]));
  ecrireJson(chemin, run);
  const reference = parametresDeReference();
  return {
    ...reference,
    juge_simule: {
      ...reference.juge_simule,
      juges: reference.juge_simule.juges.map((juge) => ({ ...juge, famille_modele: familles[juge.juge_id] ?? juge.famille_modele })),
    },
  };
}

function familleDe(juge: Record<string, unknown>, famille: string | undefined): Record<string, unknown> {
  const { famille_modele: _retiree, ...reste } = juge;
  return famille === undefined ? reste : { ...reste, famille_modele: famille };
}

async function refusAvantEcriture(familles: Readonly<Record<string, string | undefined>>, attendue: new (...args: never[]) => Error): Promise<void> {
  const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
  const parametres = poserFamilles(prepare.repertoire_run, familles);
  const avant = instantane(prepare.repertoire_run);
  const appels: Appel[] = [];
  const env = environnementSimule(prepare.repertoire_run, parametres);
  await expect(noterRun(prepare.reponses, { ...env, juges: enregistreurs(env.juges, appels) })).rejects.toThrow(attendue);
  expect(appels).toEqual([]);
  expect(instantane(prepare.repertoire_run)).toEqual(avant);
}

describe("§7.12 : la chaîne de notation refuse avant toute écriture", () => {
  it("deux juges déclarés de la même famille ⇒ JugesDeMemeFamille, aucun juge appelé, rien écrit sous le run", async () => {
    await refusAvantEcriture({ "juge-simule-a": "famille-commune", "juge-simule-b": "famille-commune" }, JugesDeMemeFamille);
  });

  it("même famille à la casse près ⇒ JugesDeMemeFamille", async () => {
    await refusAvantEcriture({ "juge-simule-a": "Famille-Commune", "juge-simule-b": "famille-commune" }, JugesDeMemeFamille);
  });

  it("famille faite d'espaces dans run.json (le schéma n'exige qu'un caractère) ⇒ FamilleDeJugeAbsente", async () => {
    await refusAvantEcriture({ "juge-simule-a": "famille-simulee-a", "juge-simule-b": "   " }, FamilleDeJugeAbsente);
  });

  it("famille absente de run.json ⇒ refus à la lecture du schéma, avant toute écriture", async () => {
    await refusAvantEcriture({ "juge-simule-a": "famille-simulee-a", "juge-simule-b": undefined }, ErreurSchema);
  });

  it("deux familles différentes ⇒ la notation se déroule comme avant", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    expect(resultat.verdicts.length).toBeGreaterThan(0);
  });
});
