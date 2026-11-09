/**
 * `mesure.schema.json`, `verification_fictivite.niveaux_balayes` : le §5 exige qu'une mesure fictive
 * soit vérifiée contre les corpus T1 et T2 et contre les items T3. La trace porte les trois niveaux,
 * tous trois, une seule fois chacun.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { valider } from "../outils/schemas/valider.ts";

const EXEMPLE = new URL("../schema/exemples/mesure/valide-02-mesure-fictive-verifiee.json", import.meta.url);

type Trace = Record<string, unknown>;

function mesureFictive(niveaux: readonly string[] | undefined): Trace {
  const base = JSON.parse(readFileSync(EXEMPLE, "utf8")) as Trace;
  const { niveaux_balayes: _retire, ...verification } = base["verification_fictivite"] as Trace;
  return {
    ...base,
    verification_fictivite: niveaux === undefined ? verification : { ...verification, niveaux_balayes: niveaux },
  };
}

describe("verification_fictivite.niveaux_balayes", () => {
  it("trace complète T1 + T2 + items T3 : valide", () => {
    const valeur = mesureFictive(["T1", "T2", "items_T3"]);
    expect(valider("mesure", valeur, "trace complète")).toBe(valeur);
  });

  it("l'ordre des niveaux ne compte pas", () => {
    expect(() => valider("mesure", mesureFictive(["items_T3", "T1", "T2"]), "ordre")).not.toThrow();
  });

  it.each([
    ["sans T2", ["T1", "items_T3"]],
    ["sans items T3", ["T1", "T2"]],
    ["sans T1", ["T2", "items_T3"]],
    ["vide", []],
    ["niveau en double (T1 deux fois, T3 absent)", ["T1", "T1", "T2"]],
    ["niveau en double (quatre valeurs)", ["T1", "T2", "items_T3", "T1"]],
    ["niveau inconnu", ["T1", "T2", "T4"]],
    ["items T3 écrit « T3 »", ["T1", "T2", "T3"]],
  ])("trace %s : invalide", (_cas, niveaux) => {
    expect(() => valider("mesure", mesureFictive(niveaux), "trace")).toThrow();
  });

  it("trace sans le champ niveaux_balayes : invalide", () => {
    expect(() => valider("mesure", mesureFictive(undefined), "trace")).toThrow();
  });
});
