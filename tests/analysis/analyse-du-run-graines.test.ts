/**
 * `analysis/analyse-du-run.ts:grainesDeLAnalyse` (docs/DETTE.md, « Les seuils de l'analyse ne tiennent
 * que si le futur `pnpm analyze` passe par les bonnes portes », moitié « graines ») : les graines
 * `bootstrap` et `permutation` du run déclarent le générateur de l'analyse (§8, « Graines de
 * l'analyse » : SplitMix64, `splitmix64-sha256-v1`, « le même que pour le tirage »), sinon refus
 * nommé `GrainesDeLAnalyseNonConformes` avant tout partage, et rien n'est écrit.
 *
 * Deux portes : le code (`grainesDeLAnalyse`, appelé par `contexteDuRun`, seul lecteur des graines)
 * et le schéma (`run.schema.json#/properties/graines`, `graine_generateur_du_tirage`), qui refuse un
 * tel `run.json` dès sa lecture par `pnpm analyze`.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyserEtEcrire,
  analyserRun,
  cheminMetriques,
  contexteDuRun,
  GrainesDeLAnalyseNonConformes,
  validerEtEcrire,
  type EntreesDuRun,
} from "../../analysis/analyse-du-run.ts";
import { assembler } from "../../analysis/filtre.ts";
import { GENERATEUR_DU_TIRAGE } from "../../analysis/graine-tirage.ts";
import { ErreurSchema, erreurDeSchema, valider } from "../../outils/schemas/valider.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { echantillonHumainDuRun } from "../../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../../pipeline/notation/lectures-comparateur.ts";
import { ecrireJson, poserLecturesNonAffichees, poserRunNote, type RunFictif } from "../notation/run-fictif.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 20, permutations: 20 };
const PCG64 = { algorithme: "PCG64", bibliotheque: "numpy.random.Generator", version: "2.1.3" };
type Graines = EntreesDuRun["run"]["graines"];

const temporaires: string[] = [];
afterAll(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function avecGraines(graines: Partial<Record<keyof Graines, object>>): EntreesDuRun {
  const entrees = entreesDuRunAnalysable(SPEC_REFERENCE);
  return { ...entrees, run: { ...entrees.run, graines: { ...entrees.run.graines, ...graines } as Graines } };
}

/** `analyserEtEcrire` sans la lecture disque : analyser, puis valider et écrire dans un répertoire neuf. */
function analyserEtEcrireEnMemoire(entrees: EntreesDuRun): { readonly chemin: string; readonly refus: unknown } {
  const chemin = join(mkdtempSync(join(tmpdir(), "banc-graines-analyse-")), "metriques", "metriques.json");
  temporaires.push(join(chemin, "..", ".."));
  try {
    validerEtEcrire(chemin, analyserRun(entrees, PARAMETRES, null));
    return { chemin, refus: null };
  } catch (refus) {
    return { chemin, refus };
  }
}

function refusDe(entrees: EntreesDuRun): GrainesDeLAnalyseNonConformes {
  const { chemin, refus } = analyserEtEcrireEnMemoire(entrees);
  expect(existsSync(chemin)).toBe(false);
  expect(refus).toBeInstanceOf(GrainesDeLAnalyseNonConformes);
  return refus as GrainesDeLAnalyseNonConformes;
}

describe("porte des graines de l'analyse (grainesDeLAnalyse)", () => {
  it("1. run sain : graines du générateur attendu, le contexte porte leurs deux entiers, le document est écrit et conforme", () => {
    const entrees = entreesDuRunAnalysable(SPEC_REFERENCE);
    expect(entrees.run.graines.bootstrap).toEqual({ valeur: 20261203, ...GENERATEUR_DU_TIRAGE });
    const contexte = contexteDuRun(entrees, assembler(entrees), PARAMETRES);
    expect(contexte.graines).toEqual({ bootstrap: 20261203, permutation: 20261204 });
    expect(Object.isFrozen(contexte.graines)).toBe(true);
    const { chemin, refus } = analyserEtEcrireEnMemoire(entrees);
    expect(refus).toBeNull();
    expect(JSON.parse(readFileSync(chemin, "utf8"))).toEqual(JSON.parse(JSON.stringify(analyserRun(entrees, PARAMETRES, null))));
    expect(() => valider("metriques", JSON.parse(readFileSync(chemin, "utf8")), "test")).not.toThrow();
  });

  it("2. graine bootstrap d'un autre générateur : refus GrainesDeLAnalyseNonConformes, aucun metriques.json écrit", () => {
    const refus = refusDe(avecGraines({ bootstrap: { valeur: 20261203, ...PCG64 } }));
    expect(refus.name).toBe("GrainesDeLAnalyseNonConformes");
    expect(refus.fautives.map((f) => f.graine)).toEqual(["bootstrap"]);
    expect(refus.fautives[0]?.champs.map((c) => c.champ)).toEqual(["algorithme", "bibliotheque", "version"]);
    expect(refus.message).toContain("graines.bootstrap : algorithme « PCG64 » au lieu de « splitmix64-sha256-v1 »");
    expect(refus.message).not.toContain("graines.permutation");
  });

  it("3. graine permutation d'un autre générateur : refus GrainesDeLAnalyseNonConformes, aucun metriques.json écrit", () => {
    const refus = refusDe(avecGraines({ permutation: { valeur: 20261204, ...GENERATEUR_DU_TIRAGE, version: "2" } }));
    expect(refus.fautives).toEqual([{ graine: "permutation", champs: [{ champ: "version", declare: "2", attendu: "1" }] }]);
    expect(refus.message).toContain("graines.permutation : version « 2 » au lieu de « 1 »");
    expect(refus.message).not.toContain("graines.bootstrap");
  });

  it("4. graine sans déclaration de générateur : refus nommé, champs absents, aucune valeur par défaut", () => {
    const refus = refusDe(avecGraines({ bootstrap: { valeur: 20261203 } }));
    expect(refus.fautives).toEqual([
      {
        graine: "bootstrap",
        champs: [
          { champ: "algorithme", declare: undefined, attendu: GENERATEUR_DU_TIRAGE.algorithme },
          { champ: "bibliotheque", declare: undefined, attendu: GENERATEUR_DU_TIRAGE.bibliotheque },
          { champ: "version", declare: undefined, attendu: GENERATEUR_DU_TIRAGE.version },
        ],
      },
    ]);
    expect(refus.message).toContain("algorithme absent");
    expect(refus.message).not.toContain("undefined");
  });

  it("5. les deux graines fautives : le refus nomme bootstrap et permutation", () => {
    const refus = refusDe(avecGraines({ bootstrap: { valeur: 20261203, ...PCG64 }, permutation: { valeur: 20261204 } }));
    expect(refus.fautives.map((f) => f.graine)).toEqual(["bootstrap", "permutation"]);
    expect(refus.message).toContain("graines.bootstrap :");
    expect(refus.message).toContain("graines.permutation :");
  });

  it("le premier run de la tendance (--premier) passe par la même porte", () => {
    const dernier = entreesDuRunAnalysable(SPEC_REFERENCE);
    const sain = entreesDuRunAnalysable({ ...SPEC_REFERENCE, run: { cle: "run-premier", date_gel: "2026-11-20T06:00:00+01:00" } });
    expect(() => analyserRun(dernier, PARAMETRES, sain)).not.toThrow();
    const premier = { ...sain, run: { ...sain.run, graines: { ...sain.run.graines, permutation: { valeur: 1, ...PCG64 } } } };
    expect(() => analyserRun(dernier, PARAMETRES, premier)).toThrow(GrainesDeLAnalyseNonConformes);
  });
});

describe("porte du schéma : run.json#/graines/bootstrap et /permutation déclarent le générateur de l'analyse", () => {
  const EXEMPLE = resolve(import.meta.dirname, "../../schema/exemples/run/valide-01-mensuel-publie.json");
  const runAvec = (graines: Record<string, object>): Record<string, unknown> => {
    const run = JSON.parse(readFileSync(EXEMPLE, "utf8")) as Record<string, unknown>;
    return { ...run, graines: { ...(run["graines"] as object), ...graines } };
  };
  const chemins = (run: unknown): readonly string[] => {
    const erreur = erreurDeSchema("run", run, "test");
    return erreur === null ? [] : erreur.chemins;
  };

  it("l'exemple valide déclare le générateur de l'analyse et passe", () => {
    expect(chemins(runAvec({}))).toEqual([]);
  });

  it.each(["bootstrap", "permutation"])("graine %s en PCG64 ou sans algorithme : refusée, à son chemin", (nom) => {
    expect(chemins(runAvec({ [nom]: { valeur: 1, ...PCG64 } })).every((c) => c === `/graines/${nom}` || c.startsWith(`/graines/${nom}/`))).toBe(true);
    expect(chemins(runAvec({ [nom]: { valeur: 1, ...PCG64 } }))).not.toEqual([]);
    expect(chemins(runAvec({ [nom]: { valeur: 1, bibliotheque: GENERATEUR_DU_TIRAGE.bibliotheque, version: "1" } }))).not.toEqual([]);
  });
});

describe("pnpm analyze sur un run lu sur disque : graines fautives refusées avant tout calcul", () => {
  let fictif: RunFictif;

  beforeAll(() => {
    fictif = poserRunNote();
    poserLecturesNonAffichees(fictif);
  });
  afterAll(() => fictif.nettoyer());

  it("bootstrap et permutation en PCG64 : refus à la lecture (ErreurSchema), les deux chemins nommés, aucun metriques.json", () => {
    const graines = fictif.run["graines"] as Record<string, object>;
    ecrireJson(join(fictif.repertoire_run, "run.json"), { ...fictif.run, graines: { ...graines, bootstrap: { valeur: 7, ...PCG64 }, permutation: { valeur: 8, ...PCG64 } } });
    const options = { items: fictif.items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun, sous_echantillon_application: questionsDuSousEchantillonDuRun, etats_des_lectures: etatsDesLectures };
    let refus: unknown = null;
    try {
      analyserEtEcrire(fictif.repertoire_run, options, PARAMETRES, null);
    } catch (erreur) {
      refus = erreur;
    }
    expect(refus).toBeInstanceOf(ErreurSchema);
    const vus = (refus as ErreurSchema).chemins;
    expect(vus.some((c) => c.startsWith("/graines/bootstrap"))).toBe(true);
    expect(vus.some((c) => c.startsWith("/graines/permutation"))).toBe(true);
    expect(existsSync(cheminMetriques(fictif.repertoire_run))).toBe(false);
  });
});
