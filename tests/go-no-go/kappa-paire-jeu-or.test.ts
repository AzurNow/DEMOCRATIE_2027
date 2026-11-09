/**
 * Critère `kappa_paire_jeu_or` du go/no-go et règle du schéma du run qui le double (§7, « Seuil de
 * publication : kappa de la paire ≥ 0,75 sur la catégorie primaire ; en dessous, les résultats sont
 * publiés avec la mention « provisoire » » ; constat 1 de la conformité du 2026-11-09).
 *
 * Le critère lit le kappa de la paire tel que `pnpm kappa:jeu-or` l'a inscrit dans `run.json`
 * (`analysis/kappa-jeu-or.ts`), sans rien recalculer. Un kappa de la paire indéfini ne satisfait pas
 * le seuil, comme au §12 ; un kappa non inscrit non plus : une absence de mesure n'est jamais un succès.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEUIL_KAPPA_PAIRE_JEU_OR } from "../../analysis/parametres-protocole.ts";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { critereKappaPaireJeuOr, KAPPA_PAIRE_NON_INSCRIT, KappaPaireAmbigu } from "../../pipeline/go-no-go/criteres-juges.ts";
import { deciderPublication } from "../../pipeline/go-no-go/decision.ts";
import { CODES_CRITERES, type Critere } from "../../pipeline/go-no-go/types.ts";
import { kappaCohen, type PaireCategories } from "../../validation/domaine/kappa.ts";
import { RACINE_PROJET } from "../aides/depot.ts";

/** Matrice juge × humain sur (e, i) : a = e/e, b = e/i, c = i/e, d = i/i. */
function kappaDeMatrice(a: number, b: number, c: number, d: number): number {
  const paires: PaireCategories<"e" | "i">[] = [
    ...Array.from({ length: a }, () => ({ a: "e" as const, b: "e" as const })),
    ...Array.from({ length: b }, () => ({ a: "e" as const, b: "i" as const })),
    ...Array.from({ length: c }, () => ({ a: "i" as const, b: "e" as const })),
    ...Array.from({ length: d }, () => ({ a: "i" as const, b: "i" as const })),
  ];
  const { kappa } = kappaCohen(paires, ["e", "i"]);
  if (kappa === null) throw new Error("matrice de test au kappa indéfini");
  return kappa;
}

describe("critère kappa_paire_jeu_or (§7)", () => {
  it("le seuil est SEUIL_KAPPA_PAIRE_JEU_OR, 3/4 en fraction exacte", () => {
    expect(SEUIL_KAPPA_PAIRE_JEU_OR).toEqual({ numerateur: 3, denominateur: 4 });
    expect(critereKappaPaireJeuOr({ kappa_paire_juges: 0.9 }).seuil).toBe(SEUIL_KAPPA_PAIRE_JEU_OR.numerateur / SEUIL_KAPPA_PAIRE_JEU_OR.denominateur);
  });

  it("kappa de la paire exactement 0,75 : vert (« ≥ 0,75 »)", () => {
    // κ = (A·n − B)/(n² − B) = (7·8 − 32)/(64 − 32) = 3/4 : le flottant publié est exactement 0,75.
    const kappa = kappaDeMatrice(3, 0, 1, 4);
    expect(kappa).toBe(0.75);
    expect(critereKappaPaireJeuOr({ kappa_paire_juges: kappa })).toEqual({ code: "kappa_paire_jeu_or", statut: "vert", valeur: 0.75, seuil: 0.75 });
  });

  it("kappa de la paire juste en dessous de 0,75 (50/67) : rouge, valeur le kappa publié", () => {
    const kappa = kappaDeMatrice(5, 0, 2, 10);
    expect(kappa).toBeCloseTo(50 / 67, 12);
    expect(critereKappaPaireJeuOr({ kappa_paire_juges: kappa })).toEqual({ code: "kappa_paire_jeu_or", statut: "rouge", valeur: kappa, seuil: 0.75 });
  });

  it("kappa de la paire 0,74 : rouge", () => {
    expect(critereKappaPaireJeuOr({ kappa_paire_juges: 0.74 }).statut).toBe("rouge");
  });

  it("le flottant immédiatement inférieur à 0,75 : rouge", () => {
    const juste_dessous = 0.75 - 2 ** -53;
    expect(juste_dessous).toBeLessThan(0.75);
    expect(critereKappaPaireJeuOr({ kappa_paire_juges: juste_dessous }).statut).toBe("rouge");
  });

  it("kappa de la paire indéfini : rouge, le motif nommé (comme au §12)", () => {
    expect(critereKappaPaireJeuOr({ motif_indefini_kappa_paire_juges: "accord_attendu_maximal" })).toEqual({
      code: "kappa_paire_jeu_or",
      statut: "rouge",
      valeur: "kappa de la paire indéfini : accord_attendu_maximal",
      seuil: 0.75,
    });
    expect(critereKappaPaireJeuOr({ motif_indefini_kappa_paire_juges: "aucune_reponse_comparable" }).statut).toBe("rouge");
  });

  it("kappa de la paire non inscrit (ni valeur ni motif) : rouge, jamais un succès", () => {
    expect(critereKappaPaireJeuOr({})).toEqual({ code: "kappa_paire_jeu_or", statut: "rouge", valeur: KAPPA_PAIRE_NON_INSCRIT, seuil: 0.75 });
  });

  it("kappa et motif à la fois : refusé, aucun des deux n'est choisi", () => {
    expect(() => critereKappaPaireJeuOr({ kappa_paire_juges: 0.8, motif_indefini_kappa_paire_juges: "accord_attendu_maximal" })).toThrow(KappaPaireAmbigu);
  });

  it("seul critère au rouge, les sept du §12 verts : publie_provisoire, motif qui le nomme, rangé après eux", () => {
    const criteres: Critere[] = CODES_CRITERES.filter((code) => code !== "kappa_paire_jeu_or").map((code) => ({ code, statut: "vert", valeur: 0, seuil: 0 }));
    const decision = deciderPublication([critereKappaPaireJeuOr({ kappa_paire_juges: 0.74 }), ...criteres]);
    expect(decision.decision).toBe("publie_provisoire");
    expect(decision.motif).toBe("Critère(s) go/no-go du §12 au rouge : kappa_paire_jeu_or.");
    expect(decision.criteres.map((c) => c.code).at(-1)).toBe("kappa_paire_jeu_or");
  });
});

describe("schéma du run : un run publié porte un kappa de la paire ≥ 0,75 (§7)", () => {
  const exemple = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/run/valide-01-mensuel-publie.json"), "utf8")) as Record<string, unknown>;

  /** Le go/no-go de l'exemple, son critère kappa_paire_jeu_or remplacé. */
  function avecCritere(run: Record<string, unknown>, critere: Critere): Record<string, unknown> {
    const go = run["go_no_go"] as { criteres: Critere[] };
    return { ...go, criteres: go.criteres.map((c) => (c.code === "kappa_paire_jeu_or" ? critere : c)) };
  }

  it("publie avec un kappa de la paire exactement 0,75 : valide", () => {
    const run = exemple();
    const publie = { ...run, kappa_paire_juges: 0.75, go_no_go: avecCritere(run, critereKappaPaireJeuOr({ kappa_paire_juges: 0.75 })) };
    expect(() => valider("run", publie, "test")).not.toThrow();
  });

  it("publie avec un kappa de la paire juste en dessous de 0,75 : invalide, même si le go/no-go se dit vert", () => {
    const run = exemple();
    const juste_dessous = 0.75 - 2 ** -53;
    const vert_force: Critere = { code: "kappa_paire_jeu_or", statut: "vert", valeur: juste_dessous, seuil: 0.75 };
    expect(() => valider("run", { ...run, kappa_paire_juges: juste_dessous, go_no_go: avecCritere(run, vert_force) }, "test")).toThrow(ErreurSchema);
  });

  it("publie avec un kappa de la paire indéfini : invalide", () => {
    const { kappa_paire_juges: _retire, ...run } = exemple();
    const indefini = { ...run, motif_indefini_kappa_paire_juges: "accord_attendu_maximal" };
    expect(() => valider("run", indefini, "test")).toThrow(ErreurSchema);
  });

  it("publie_provisoire avec un kappa de la paire 0,74 et le critère au rouge : valide", () => {
    const run = exemple();
    const motif = "Critère(s) go/no-go du §12 au rouge : kappa_paire_jeu_or.";
    const go = { ...avecCritere(run, critereKappaPaireJeuOr({ kappa_paire_juges: 0.74 })), decision: "publie_provisoire", motif };
    const provisoire = { ...run, statut: "publie_provisoire", motif_provisoire: motif, kappa_paire_juges: 0.74, go_no_go: go };
    expect(() => valider("run", provisoire, "test")).not.toThrow();
  });

  it("un go/no-go sans le critère kappa_paire_jeu_or : invalide", () => {
    const run = exemple();
    const go = run["go_no_go"] as { criteres: Critere[] };
    const sans = { ...run, go_no_go: { ...go, criteres: go.criteres.filter((c) => c.code !== "kappa_paire_jeu_or") } };
    expect(() => valider("run", sans, "test")).toThrow(ErreurSchema);
  });

  it("le minimum écrit dans le schéma est SEUIL_KAPPA_PAIRE_JEU_OR", () => {
    const schema = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/run.schema.json"), "utf8")) as { allOf: { then?: { properties?: Record<string, { minimum?: number }> } }[] };
    const minimums = schema.allOf.flatMap((regle) => {
      const minimum = regle.then?.properties?.["kappa_paire_juges"]?.minimum;
      return minimum === undefined ? [] : [minimum];
    });
    expect(minimums).toEqual([SEUIL_KAPPA_PAIRE_JEU_OR.numerateur / SEUIL_KAPPA_PAIRE_JEU_OR.denominateur]);
  });
});
