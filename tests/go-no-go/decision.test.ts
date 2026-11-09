/**
 * Décision dérivée des huit critères (D24 (3) ; les sept du §12 et le kappa de la paire du §7), et la
 * règle du schéma dans les deux sens.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { CriteresIncomplets, deciderPublication } from "../../pipeline/go-no-go/decision.ts";
import { CODES_CRITERES, type Critere } from "../../pipeline/go-no-go/types.ts";
import { RACINE_PROJET } from "../aides/depot.ts";

function verts(): Critere[] {
  return CODES_CRITERES.map((code) => ({ code, statut: "vert", valeur: 0, seuil: 0 }));
}

describe("décision de publication dérivée des critères", () => {
  it("tous les critères verts : publie, sans motif", () => {
    const decision = deciderPublication(verts());
    expect(decision.decision).toBe("publie");
    expect(decision.motif).toBeUndefined();
  });

  it("un critère rouge : publie_provisoire, motif qui nomme ce code", () => {
    const criteres = verts().map((c) => (c.code === "reponses_manquantes" ? { ...c, statut: "rouge" as const } : c));
    expect(deciderPublication(criteres)).toMatchObject({
      decision: "publie_provisoire",
      motif: "Critère(s) go/no-go du §12 au rouge : reponses_manquantes.",
    });
  });

  it("plusieurs rouges : codes énumérés dans l'ordre fixe des critères, quel que soit l'ordre reçu", () => {
    const criteres = verts()
      .map((c) => (c.code === "analyses_preenregistrees_executees" || c.code === "kappa_juges_humains" ? { ...c, statut: "rouge" as const } : c))
      .reverse();
    const decision = deciderPublication(criteres);
    expect(decision.motif).toBe("Critère(s) go/no-go du §12 au rouge : kappa_juges_humains, analyses_preenregistrees_executees.");
    expect(decision.criteres.map((c) => c.code)).toEqual(CODES_CRITERES);
  });

  it("un critère manquant ou en double : non décidable", () => {
    expect(() => deciderPublication(verts().slice(1))).toThrow(CriteresIncomplets);
    expect(() => deciderPublication([...verts(), { code: "tests_symetrie", statut: "vert", valeur: 0, seuil: 0 }])).toThrow(CriteresIncomplets);
  });
});

describe("schéma du run : la décision suit les critères dans les deux sens", () => {
  const exemple = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/run/valide-01-mensuel-publie.json"), "utf8")) as Record<string, unknown>;

  it("publie_provisoire avec tous ses critères verts : invalide", () => {
    const run = exemple();
    const go = run["go_no_go"] as Record<string, unknown>;
    const provisoire = { ...run, statut: "publie_provisoire", motif_provisoire: "Sans raison.", go_no_go: { ...go, decision: "publie_provisoire", motif: "Sans raison." } };
    expect(() => valider("run", provisoire, "test")).toThrow(ErreurSchema);
  });

  it("publie_provisoire avec un critère rouge : valide", () => {
    const run = exemple();
    const go = run["go_no_go"] as { criteres: Record<string, unknown>[] };
    const criteres = go.criteres.map((c) => (c["code"] === "reponses_manquantes" ? { ...c, statut: "rouge" } : c));
    const motif = "Critère(s) go/no-go du §12 au rouge : reponses_manquantes.";
    const provisoire = { ...run, statut: "publie_provisoire", motif_provisoire: motif, go_no_go: { criteres, decision: "publie_provisoire", motif } };
    expect(() => valider("run", provisoire, "test")).not.toThrow();
  });
});
