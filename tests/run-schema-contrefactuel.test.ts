/**
 * `schema/run.schema.json` : publication du test contrefactuel des noms de candidats (§7 ; D14,
 * D16 ; lot notation, PR C, cas limite 11 du brief). Les exemples valides passent, et chaque
 * exemple invalide tombe pour sa seule règle : la liste COMPLÈTE des erreurs ajv est comparée, pas
 * seulement la première (les erreurs `if`, qui ne font que signaler la branche prise, sont écartées).
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLE_DERANGEMENT_CANDIDATS } from "../pipeline/notation/derangement.ts";
import { urnSchema } from "../outils/schemas/noms.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";

const RACINE_SCHEMA = resolve(import.meta.dirname, "../schema");
const { ajv } = construireRegistre(RACINE_SCHEMA);

interface ErreurLue {
  readonly chemin: string;
  readonly mot_cle: string;
  readonly detail: string;
}

function erreurs(fichier: string): readonly ErreurLue[] {
  const valider = ajv.getSchema(urnSchema("run"));
  if (valider === undefined) throw new Error("schéma run absent du registre");
  const exemple: unknown = JSON.parse(readFileSync(join(RACINE_SCHEMA, "exemples", "run", fichier), "utf8"));
  if (valider(exemple) === true) return [];
  return (valider.errors ?? [])
    .filter((e) => e.keyword !== "if")
    .map((e) => ({ chemin: e.instancePath, mot_cle: e.keyword, detail: JSON.stringify(e.params) }));
}

describe("11. bloc contrefactuel_candidats et effectifs des juges", () => {
  it("valides : test terminé (valide-01), test indéfini (valide-05), deux juges retirés et run invalide (valide-06)", () => {
    expect(erreurs("valide-01-mensuel-publie.json")).toEqual([]);
    expect(erreurs("valide-05-contrefactuel-indefini.json")).toEqual([]);
    expect(erreurs("valide-06-invalide-deux-juges-retires.json")).toEqual([]);
  });

  it("le bloc des exemples publie la clé du dérangement, celle de derangement.ts", () => {
    const exemple = JSON.parse(readFileSync(join(RACINE_SCHEMA, "exemples", "run", "valide-01-mensuel-publie.json"), "utf8")) as {
      contrefactuel_candidats: { cle_graine_derangement: unknown };
    };
    expect(exemple.contrefactuel_candidats.cle_graine_derangement).toEqual([...CLE_DERANGEMENT_CANDIDATS]);
  });

  it("un bloc sans cle_graine_derangement : tombe pour cette seule obligation", () => {
    const valider = ajv.getSchema(urnSchema("run"));
    if (valider === undefined) throw new Error("schéma run absent du registre");
    const run = JSON.parse(readFileSync(join(RACINE_SCHEMA, "exemples", "run", "valide-01-mensuel-publie.json"), "utf8")) as {
      contrefactuel_candidats: Record<string, unknown>;
    };
    delete run.contrefactuel_candidats["cle_graine_derangement"];
    expect(valider(run)).toBe(false);
    expect((valider.errors ?? []).filter((e) => e.keyword !== "if").map((e) => [e.instancePath, e.keyword, JSON.stringify(e.params)])).toEqual([
      ["/contrefactuel_candidats", "required", JSON.stringify({ missingProperty: "cle_graine_derangement" })],
    ]);
  });

  it("run publié sans le bloc : tombe pour cette seule obligation", () => {
    expect(erreurs("invalide-27-publie-sans-contrefactuel.json")).toEqual([
      { chemin: "", mot_cle: "required", detail: JSON.stringify({ missingProperty: "contrefactuel_candidats" }) },
    ]);
  });

  it("test indéfini et un juge qui publie un taux et ses effectifs : tombe sur ces deux champs seuls", () => {
    expect(erreurs("invalide-28-indefini-avec-taux-de-juge.json").map((e) => [e.chemin, e.mot_cle])).toEqual([
      ["/juges/0/taux_changement_contrefactuel", "false schema"],
      ["/juges/0/changements_contrefactuel", "false schema"],
    ]);
  });

  it("taux de juge sans ses effectifs : tombe sur la dépendance seule", () => {
    expect(erreurs("invalide-29-taux-sans-changements.json")).toEqual([
      {
        chemin: "/juges/0",
        mot_cle: "dependentRequired",
        detail: JSON.stringify({ property: "taux_changement_contrefactuel", missingProperty: "changements_contrefactuel", depsCount: 1, deps: "changements_contrefactuel" }),
      },
    ]);
  });

  // Modifié ouvertement (D31 (1)) : un test terminé admet désormais, à la place du taux et des
  // effectifs, le motif toutes_paires_ecartees ; l'erreur nomme donc les deux branches de l'alternative.
  it("test terminé et un juge sans taux ni effectifs ni motif d'indéfinition : tombe sur l'obligation de les publier", () => {
    expect(erreurs("invalide-30-termine-sans-taux-de-juge.json")).toEqual([
      { chemin: "/juges/1", mot_cle: "required", detail: JSON.stringify({ missingProperty: "taux_changement_contrefactuel" }) },
      { chemin: "/juges/1", mot_cle: "required", detail: JSON.stringify({ missingProperty: "changements_contrefactuel" }) },
      { chemin: "/juges/1", mot_cle: "required", detail: JSON.stringify({ missingProperty: "motif_indefini_contrefactuel" }) },
      { chemin: "/juges/1", mot_cle: "anyOf", detail: JSON.stringify({}) },
    ]);
  });
});

describe("§7 (protocole 0.21) : test indéfini sous deux candidats interrogés", () => {
  it("valide : un seul candidat interrogé, bloc réduit à son état, son motif et ses tailles (valide-11)", () => {
    expect(erreurs("valide-11-contrefactuel-moins-de-deux-interroges.json")).toEqual([]);
  });

  it("le motif moins_de_deux_interroges sur un run qui interroge deux candidats : tombe sur le recoupement avec le périmètre seul", () => {
    expect(erreurs("invalide-55-moins-de-deux-interroges-avec-deux-interroges.json").map((e) => [e.chemin, e.mot_cle])).toEqual([
      ["/perimetre/candidats", "contains"],
    ]);
  });

  it("le motif moins_de_deux_interroges avec un dérangement publié : tombe sur ce champ seul", () => {
    expect(erreurs("invalide-56-moins-de-deux-interroges-avec-derangement.json").map((e) => [e.chemin, e.mot_cle])).toEqual([
      ["/contrefactuel_candidats/correspondances", "false schema"],
    ]);
  });
});
