/**
 * `schema/run.schema.json` aligné sur le protocole 0.13.
 *
 * - §12 : « un run invalide ne porte aucune décision de publication, mais déclare sa publication et
 *   son dépôt comme tout run publié ». Un run `invalide` n'a pas de `go_no_go`, et porte
 *   `publication` et `depot`. La symétrie rouge n'impose plus `go_no_go.decision =
 *   publie_provisoire` : un tel run est planifié ou invalide (0.11), et un run invalide n'a plus de
 *   go/no-go.
 * - §7 : « L'échantillon humain et ce sous-ensemble sont tirés avec le générateur du tirage
 *   (SplitMix64, `splitmix64-sha256-v1`) ». Les graines `echantillon_humain` et `contrefactuel`
 *   déclarent ce générateur, champ par champ, comme `GENERATEUR_DU_TIRAGE`.
 *
 * Chaque cas part de l'exemple valide réel et n'en change qu'un point ; un cas invalide vérifie
 * que TOUTES les erreurs rapportées portent sur le point changé ou sur un de ses ancêtres.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATEUR_DU_TIRAGE } from "../pipeline/questions/graine.ts";
import { erreurDeSchema } from "../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLE = resolve(import.meta.dirname, "../schema/exemples/run/valide-01-mensuel-publie.json");
const SCHEMA = resolve(import.meta.dirname, "../schema/run.schema.json");

const PCG64 = { algorithme: "PCG64", bibliotheque: "numpy.random.Generator", version: "2.1.3" };

function runValide(): Objet {
  const run = JSON.parse(readFileSync(EXEMPLE, "utf8")) as Objet;
  const graines = run["graines"] as Record<string, Objet>;
  for (const nom of ["echantillon_humain", "contrefactuel"]) {
    graines[nom] = { valeur: graines[nom]?.["valeur"], ...GENERATEUR_DU_TIRAGE };
  }
  return run;
}

function chemins(run: Objet): readonly string[] {
  const erreur = erreurDeSchema("run", run, "test");
  return erreur === null ? [] : erreur.chemins;
}

function toutesSous(cible: string): (liste: readonly string[]) => boolean {
  const sous = (c: string) => c === cible || c.startsWith(`${cible}/`);
  const ancetre = (c: string) => c === "" || cible.startsWith(`${c}/`);
  return (liste) => liste.some(sous) && liste.every((c) => sous(c) || ancetre(c));
}

/** Un run invalide, avec sa raison, sa publication et son dépôt, sans go/no-go. */
function runInvalide(symetrie: "vert" | "rouge"): Objet {
  const run = runValide();
  run["statut"] = "invalide";
  run["invalidation"] = { motif: "Incident technique : fenêtre de collecte interrompue.", date: "2026-12-02T10:00:00+01:00" };
  (run["symetrie"] as Objet)["statut_global"] = symetrie;
  delete run["go_no_go"];
  return run;
}

describe("protocole 0.13, §12 : un run invalide ne porte pas de go/no-go", () => {
  it("accepte un run invalide avec publication et dépôt, sans go/no-go (incident technique, symétrie verte)", () => {
    expect(chemins(runInvalide("vert"))).toEqual([]);
  });

  it("accepte un run invalide pour symétrie rouge, sans go/no-go", () => {
    expect(chemins(runInvalide("rouge"))).toEqual([]);
  });

  it.each(["vert", "rouge"] as const)("refuse un run invalide qui porte un go/no-go (symétrie %s)", (symetrie) => {
    const run = runInvalide(symetrie);
    run["go_no_go"] = runValide()["go_no_go"];
    expect(chemins(run)).toSatisfy(toutesSous("/go_no_go"));
  });

  it.each(["publication", "depot"])("refuse un run invalide sans %s", (bloc) => {
    const run = runInvalide("vert");
    delete run[bloc];
    const erreur = erreurDeSchema("run", run, "test");
    expect(erreur?.chemins.every((chemin) => chemin === "")).toBe(true);
    expect(erreur?.message).toContain(`must have required property '${bloc}'`);
  });

  // Conformité 2026-09-29, n° 15 : le schéma impose de nouveau `decision: publie_provisoire`, mais
  // sur un critère go/no-go rouge, plus sur une symétrie rouge. Le test lisait tout le texte du
  // schéma ; il ne lit plus que les règles conditionnées par la symétrie, qui sont son sujet.
  it("n'impose plus de décision « publié provisoire » à un run dont la symétrie est rouge", () => {
    type Regle = { if?: { properties?: Record<string, unknown> }; then?: unknown };
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8")) as { allOf: Regle[] };
    const regles = schema.allOf.filter((regle) => regle.if?.properties?.["symetrie"] !== undefined);
    expect(regles).toHaveLength(1);
    expect(JSON.stringify(regles.map((regle) => regle.then))).not.toContain("go_no_go");
  });
});

describe("protocole 0.13, §7 : l'échantillon humain et le contrefactuel déclarent le générateur du tirage", () => {
  it("accepte les deux graines en splitmix64-sha256-v1", () => {
    expect(chemins(runValide())).toEqual([]);
  });

  it.each(["echantillon_humain", "contrefactuel"])("refuse la graine %s en PCG64", (nom) => {
    const run = runValide();
    const graines = run["graines"] as Record<string, Objet>;
    graines[nom] = { valeur: graines[nom]?.["valeur"], ...PCG64 };
    expect(chemins(run)).toSatisfy(toutesSous(`/graines/${nom}`));
  });

  it.each([
    ["echantillon_humain", "bibliotheque", "numpy.random.Generator"],
    ["echantillon_humain", "version", "2"],
    ["contrefactuel", "bibliotheque", "numpy.random.Generator"],
    ["contrefactuel", "version", "2"],
  ])("refuse la graine %s dont seul le champ %s diffère du générateur du tirage", (nom, champ, valeur) => {
    const run = runValide();
    ((run["graines"] as Record<string, Objet>)[nom] as Objet)[champ] = valeur;
    expect(chemins(run)).toSatisfy(toutesSous(`/graines/${nom}/${champ}`));
  });

  it("le schéma désigne le générateur que le code emploie, champ par champ (GENERATEUR_DU_TIRAGE)", () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8")) as { $defs: Record<string, { properties: Record<string, { const?: string }> }> };
    const proprietes = schema.$defs["graine_generateur_du_tirage"]?.properties;
    expect(proprietes?.["algorithme"]?.const).toBe(GENERATEUR_DU_TIRAGE.algorithme);
    expect(proprietes?.["bibliotheque"]?.const).toBe(GENERATEUR_DU_TIRAGE.bibliotheque);
    expect(proprietes?.["version"]?.const).toBe(GENERATEUR_DU_TIRAGE.version);
  });
});
