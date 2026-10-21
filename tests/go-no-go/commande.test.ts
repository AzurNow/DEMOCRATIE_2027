/**
 * `pnpm go-no-go` et `pnpm go-no-go:contresigner` sur le run simulé de `pnpm notation:dry`, noté,
 * dont l'échantillon humain a reçu sa double notation : de bout en bout, `run.json` et
 * `checklist.json` conformes à leur schéma ; refus et idempotence.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import type { Checklist } from "../../pipeline/go-no-go/checklist.ts";
import { FormatMetriquesNonDefini, GoNoGoDivergent, GoNoGoRefuse, goNoGo } from "../../pipeline/go-no-go/go-no-go.ts";
import { executerOutil } from "../aides/depot.ts";
import { ecrireObjet, lireObjet, nettoyerReference, nettoyerRepertoires, runSimuleNote } from "./aides.ts";

afterEach(nettoyerRepertoires);
afterAll(nettoyerReference);

const TEMPS = 120_000;

function octets(repertoire: string, fichier: string): Buffer | null {
  const chemin = join(repertoire, fichier);
  return existsSync(chemin) ? readFileSync(chemin) : null;
}

function modifierRun(repertoire: string, modification: (run: Record<string, unknown>) => Record<string, unknown>): void {
  const chemin = join(repertoire, "run.json");
  ecrireObjet(chemin, modification(lireObjet(chemin)));
}

const PUBLICATION_ET_DEPOT = {
  publication: { date: "2026-12-05T10:00:00+01:00" },
  depot: {
    doi: "10.5281/zenodo.1234567",
    date: "2026-12-05T10:00:00+01:00",
    archives: [{ nom: "reponses.tar.zst", contenu: "reponses_brutes", sha256: "a".repeat(64), nombre_entrees: 1 }],
  },
};

describe("pnpm go-no-go, de bout en bout sur un run simulé", () => {
  it(
    "écrit un run.json et un checklist.json conformes ; décision provisoire tant que les métriques manquent",
    async () => {
      const run = await runSimuleNote();
      const statutAvant = lireObjet(join(run, "run.json"))["statut"];
      const resultat = goNoGo(run);
      expect(resultat.run_json).toBe("ecrit");
      expect(resultat.checklist_json).toBe("ecrit");

      const ecrit = valider<Record<string, unknown>>("run", lireObjet(join(run, "run.json")), "run.json écrit");
      expect(ecrit["statut"]).toBe(statutAvant);
      expect(ecrit["go_no_go"]).toEqual(resultat.go_no_go);
      expect(resultat.go_no_go.decision).toBe("publie_provisoire");
      expect(resultat.go_no_go.motif).toContain("analyses_preenregistrees_executees");
      expect(ecrit["motif_provisoire"]).toBe(resultat.go_no_go.motif);
      const juges = ecrit["juges"] as Record<string, unknown>[];
      for (const juge of juges) {
        const porte = "kappa_echantillon_humain" in juge || "motif_indefini_kappa_echantillon_humain" in juge;
        expect(porte).toBe(juge["retire"] === false);
      }

      const checklist = valider<Checklist>("checklist", lireObjet(join(run, "checklist.json")), "checklist.json écrit");
      expect(checklist.contreseing).toBeUndefined();
      expect(checklist.cases).toHaveLength(10);
      expect(checklist.cases.find((c) => c.rang === 7)).toMatchObject({ etat: "non_faite" });

      // D25 (1) : le nombre de réponses écartées du kappa est publié ; le run simulé n'en a aucune.
      expect(ecrit["indeterminees_echantillon_humain"]).toBe(0);
      expect(resultat.indeterminees).toBe(0);
      // D32 : les refus de l'API de l'échantillon, notés par règle sans juge, sont écartés du kappa
      // de chaque juge et publiés ; le run simulé en tire deux dans son échantillon.
      expect(resultat.refus_api).toBe(2);
      expect(ecrit["refus_api_echantillon_humain"]).toBe(resultat.refus_api);
      // D25 (3) : la fenêtre se lit sur les fichiers (réponses simulées dans la fenêtre du run),
      // la revérification des items d'absence n'est portée par aucun fichier.
      expect(checklist.cases.find((c) => c.rang === 4)?.appuis).toContain("interrogation_dans_la_fenetre");
      expect([checklist.cases.find((c) => c.rang === 4)?.motif]).not.toContainEqual(expect.stringContaining("fenêtre"));
      expect(checklist.cases.find((c) => c.rang === 2)).toMatchObject({ etat: "non_faite" });
    },
    TEMPS,
  );

  it(
    "relancée : rien n'est réécrit, l'issue le dit",
    async () => {
      const run = await runSimuleNote();
      goNoGo(run);
      const avant = [octets(run, "run.json"), octets(run, "checklist.json")];
      const seconde = goNoGo(run);
      expect([seconde.run_json, seconde.checklist_json]).toEqual(["inchange", "inchange"]);
      expect([octets(run, "run.json"), octets(run, "checklist.json")]).toEqual(avant);
    },
    TEMPS,
  );

  it(
    "D55 (7), constat 17 : écrit perimetre.outils[].par_mode des assistants inclus ; un par_mode déjà écrit différent du recalcul : refus, run.json inchangé à l'octet",
    async () => {
      const run = await runSimuleNote();
      const resultat = goNoGo(run);
      const ecrit = valider<Record<string, unknown>>("run", lireObjet(join(run, "run.json")), "run.json écrit");
      const outils = (ecrit["perimetre"] as Record<string, unknown>)["outils"] as Record<string, unknown>[];
      const alpha = outils.find((o) => o["outil_id"] === "outil-alpha");
      const beta = outils.find((o) => o["outil_id"] === "outil-beta");
      const gamma = outils.find((o) => o["outil_id"] === "comparateur-gamma");
      expect(alpha?.["par_mode"]).toEqual(resultat.par_mode.get("outil-alpha"));
      expect(beta?.["par_mode"]).toEqual(resultat.par_mode.get("outil-beta"));
      expect(gamma).not.toHaveProperty("par_mode");

      // Relancée à l'identique : rien n'est réécrit.
      const avant = octets(run, "run.json");
      expect(goNoGo(run).run_json).toBe("inchange");
      expect(octets(run, "run.json")).toEqual(avant);

      // Un par_mode déjà écrit, différent du recalcul : refus, rien n'est écrit.
      modifierRun(run, (r) => {
        const p = r["perimetre"] as Record<string, unknown>;
        const o = (p["outils"] as Record<string, unknown>[]).map((outil) =>
          outil["outil_id"] === "outil-alpha" ? { ...outil, par_mode: { ...(outil["par_mode"] as Record<string, unknown>), web_desactivee: { reponses_manquantes_part: 0.99, run_incomplet: true } } } : outil,
        );
        return { ...r, perimetre: { ...p, outils: o } };
      });
      const avant2 = [octets(run, "run.json"), octets(run, "checklist.json")];
      expect(() => goNoGo(run)).toThrow(GoNoGoDivergent);
      expect([octets(run, "run.json"), octets(run, "checklist.json")]).toEqual(avant2);
    },
    TEMPS,
  );

  it(
    "relancée après contreseing : la checklist signée n'est pas réécrite",
    async () => {
      const run = await runSimuleNote();
      goNoGo(run);
      const signature = executerOutil("go-no-go-contresigner.ts", [
        run,
        "--nom=Auteur Fictif",
        "--case=1:faite",
        "--case=8:faite",
        "--case=9:non_faite:Dépôt Zenodo : pas encore émis",
        "--case=10:non_faite:Après publication",
      ]);
      expect(signature.erreur).not.toContain("non exécuté");
      expect(signature.status).toBe(0);
      const signee = valider<Checklist>("checklist", lireObjet(join(run, "checklist.json")), "signée");
      expect(signee.contreseing?.nom).toBe("Auteur Fictif");
      expect(signee.cases.find((c) => c.rang === 9)?.motif).toBe("Dépôt Zenodo : pas encore émis");
      const avant = octets(run, "checklist.json");
      expect(goNoGo(run).checklist_json).toBe("inchange");
      expect(octets(run, "checklist.json")).toEqual(avant);
    },
    TEMPS,
  );

  it(
    "un go_no_go déjà écrit et différent du recalcul : erreur, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      goNoGo(run);
      modifierRun(run, (r) => {
        const go = r["go_no_go"] as Record<string, unknown>;
        return { ...r, go_no_go: { ...go, motif: "Un autre motif." }, motif_provisoire: "Un autre motif." };
      });
      const avant = [octets(run, "run.json"), octets(run, "checklist.json")];
      expect(() => goNoGo(run)).toThrow(GoNoGoDivergent);
      expect([octets(run, "run.json"), octets(run, "checklist.json")]).toEqual(avant);
    },
    TEMPS,
  );

  it(
    "une checklist déjà écrite dont la part calculée diffère : erreur, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      goNoGo(run);
      const chemin = join(run, "checklist.json");
      const checklist = lireObjet(chemin);
      const cases = (checklist["cases"] as Record<string, unknown>[]).map((c) => (c["rang"] === 2 ? { ...c, etat: "non_faite", motif: "autre" } : c));
      ecrireObjet(chemin, { ...checklist, cases });
      const avant = [octets(run, "run.json"), octets(run, "checklist.json")];
      expect(() => goNoGo(run)).toThrow(GoNoGoDivergent);
      expect([octets(run, "run.json"), octets(run, "checklist.json")]).toEqual(avant);
    },
    TEMPS,
  );
});

describe("pnpm go-no-go, refus", () => {
  it(
    "run invalide : refusé, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      modifierRun(run, (r) => ({ ...r, statut: "invalide", invalidation: { motif: "Incident technique.", date: "2026-12-02T10:00:00+01:00" }, ...PUBLICATION_ET_DEPOT }));
      const avant = octets(run, "run.json");
      expect(() => goNoGo(run)).toThrow(/run invalide/);
      expect(octets(run, "run.json")).toEqual(avant);
      expect(octets(run, "checklist.json")).toBeNull();
    },
    TEMPS,
  );

  it(
    "D51, cas 9 : run en cours qui porte une invalidation (pnpm run:invalider) : GoNoGoRefuse, rien n'est écrit, statut inchangé",
    async () => {
      const run = await runSimuleNote();
      const statut = lireObjet(join(run, "run.json"))["statut"];
      modifierRun(run, (r) => ({ ...r, invalidation: { motif: "Incident technique pendant la fenêtre (§6).", date: String(r["date_gel"]) } }));
      const avant = octets(run, "run.json");
      expect(() => goNoGo(run)).toThrow(GoNoGoRefuse);
      expect(() => goNoGo(run)).toThrow(/run invalidé/);
      expect(octets(run, "run.json")).toEqual(avant);
      expect(octets(run, "checklist.json")).toBeNull();
      expect(lireObjet(join(run, "run.json"))["statut"]).toBe(statut);
    },
    TEMPS,
  );

  it(
    "symétrie rouge : refusé, avec un message qui le dit",
    async () => {
      const run = await runSimuleNote();
      modifierRun(run, (r) => ({ ...r, statut: "planifie", symetrie: { ...(r["symetrie"] as Record<string, unknown>), statut_global: "rouge" } }));
      expect(() => goNoGo(run)).toThrow(GoNoGoRefuse);
      expect(() => goNoGo(run)).toThrow(/symétrie rouge/);
      expect(octets(run, "checklist.json")).toBeNull();
    },
    TEMPS,
  );

  it(
    "run planifié : refusé",
    async () => {
      const run = await runSimuleNote();
      modifierRun(run, (r) => ({ ...r, statut: "planifie" }));
      expect(() => goNoGo(run)).toThrow(/run planifié/);
      expect(octets(run, "checklist.json")).toBeNull();
    },
    TEMPS,
  );

  it(
    "metriques/ présent sans format défini : arrêt, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      mkdirSync(join(run, "metriques"));
      const avant = octets(run, "run.json");
      expect(() => goNoGo(run)).toThrow(FormatMetriquesNonDefini);
      expect(octets(run, "run.json")).toEqual(avant);
    },
    TEMPS,
  );
});

describe("les commandes en ligne", () => {
  it(
    "pnpm go-no-go imprime les critères et la décision ; code 0",
    async () => {
      const run = await runSimuleNote();
      const execution = executerOutil("go-no-go.ts", [run]);
      expect(execution.erreur).not.toContain("non exécuté");
      expect(execution.status).toBe(0);
      expect(execution.sortie).toContain("Décision : publie_provisoire");
      expect(execution.sortie).toContain("ROUGE  analyses_preenregistrees_executees");
    },
    TEMPS,
  );

  it(
    "pnpm go-no-go:contresigner sans état pour une case déclarée : code 2, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      goNoGo(run);
      const avant = [octets(run, "run.json"), octets(run, "checklist.json")];
      const execution = executerOutil("go-no-go-contresigner.ts", [run, "--nom=Auteur", "--case=1:faite"]);
      expect(execution.status).toBe(2);
      expect(execution.erreur).toContain("ContreseingRefuse");
      expect([octets(run, "run.json"), octets(run, "checklist.json")]).toEqual(avant);
    },
    TEMPS,
  );

  it("pnpm go-no-go sans répertoire : code 2", () => {
    expect(executerOutil("go-no-go.ts", []).status).toBe(2);
  });
});
