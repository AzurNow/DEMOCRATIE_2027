/**
 * `pnpm go-no-go` et `pnpm go-no-go:contresigner` sur le run simulé de `pnpm notation:dry`, noté,
 * dont l'échantillon humain a reçu sa double notation : de bout en bout, `run.json` et
 * `checklist.json` conformes à leur schéma ; refus et idempotence.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { lireReponses, lireRunJson } from "../../analysis/lecture-run.ts";
import { ReponseHorsPlan } from "../../analysis/seuils.ts";
import type { Mode, Reponse } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ReponsesEnAttenteOperateur } from "../../pipeline/interrogation/attente-operateur.ts";
import type { Checklist } from "../../pipeline/go-no-go/checklist.ts";
import { KAPPA_PAIRE_NON_INSCRIT } from "../../pipeline/go-no-go/criteres-juges.ts";
import { GoNoGoDivergent, GoNoGoRefuse, goNoGo } from "../../pipeline/go-no-go/go-no-go.ts";
import { MetriquesSansFichier } from "../../pipeline/go-no-go/metriques.ts";
import { PlanNonReconstructible } from "../../pipeline/interrogation/plan-du-run.ts";
import { tirerEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import { JournalRequete, nomJournal } from "../../pipeline/interrogation/journal.ts";
import type { CleRequete } from "../../pipeline/interrogation/types.ts";
import { ulid } from "../analysis/fabriques.ts";
import { executerOutil } from "../aides/depot.ts";
import { ecrireObjet, lireObjet, nettoyerReference, nettoyerRepertoires, runSimuleNote } from "./aides.ts";

/**
 * Établit, indépendamment de `parModeDuRun`, le `seuil_mode` attendu d'un couple : compte les
 * réponses API de contexte run du run simulé lui-même, sans passer par le code noté (D55 (7),
 * relecture du constat 17 — une comparaison à `resultat.par_mode` serait tautologique).
 */
function seuilModeAttendu(reponses: readonly Reponse[], outil_id: string, mode: Mode): Record<string, unknown> {
  const siennes = reponses.filter((r) => r.contexte === "run" && r.canal === "api" && r.outil_id === outil_id && r.mode === mode);
  const manquantes = siennes.filter((r) => r.statut_reponse === "manquante").length;
  return { reponses_manquantes_part: manquantes / siennes.length, run_incomplet: 5 * manquantes > siennes.length };
}

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
      // D64, D70 : les réponses à note non classée, écartées du kappa, sont publiées à côté ; aucune ici.
      expect(ecrit["non_classees_echantillon_humain"]).toBe(0);
      expect(resultat.non_classees).toBe(0);
      // D32 : les refus de l'API de l'échantillon, notés par règle sans juge, sont écartés du kappa
      // de chaque juge et publiés ; le run simulé en tire deux dans son échantillon.
      expect(resultat.refus_api).toBe(2);
      expect(ecrit["refus_api_echantillon_humain"]).toBe(resultat.refus_api);
      // D25 (3) : la fenêtre se lit sur les fichiers (réponses simulées dans la fenêtre du run),
      // le run simulé n'a pas de reverification-absence.json : la case 2 est non faite.
      expect(checklist.cases.find((c) => c.rang === 4)?.appuis).toContain("interrogation_dans_la_fenetre");
      expect([checklist.cases.find((c) => c.rang === 4)?.motif]).not.toContainEqual(expect.stringContaining("fenêtre"));
      expect(checklist.cases.find((c) => c.rang === 2)).toMatchObject({ etat: "non_faite" });
    },
    TEMPS,
  );

  it(
    "§7 : le critère kappa_paire_jeu_or lit le kappa de la paire de run.json — non inscrit, rouge ; exactement 0,75, vert ; indéfini, rouge",
    async () => {
      const critereDe = (run: string): unknown => goNoGo(run).go_no_go.criteres.find((c) => c.code === "kappa_paire_jeu_or");

      const nonInscrit = await runSimuleNote();
      expect(lireObjet(join(nonInscrit, "run.json"))).not.toHaveProperty("kappa_paire_juges");
      expect(critereDe(nonInscrit)).toEqual({ code: "kappa_paire_jeu_or", statut: "rouge", valeur: KAPPA_PAIRE_NON_INSCRIT, seuil: 0.75 });
      expect(lireObjet(join(nonInscrit, "run.json"))["motif_provisoire"]).toContain("kappa_paire_jeu_or");

      const auSeuil = await runSimuleNote();
      modifierRun(auSeuil, (r) => ({ ...r, kappa_paire_juges: 0.75 }));
      expect(critereDe(auSeuil)).toEqual({ code: "kappa_paire_jeu_or", statut: "vert", valeur: 0.75, seuil: 0.75 });
      expect(lireObjet(join(auSeuil, "run.json"))["motif_provisoire"]).not.toContain("kappa_paire_jeu_or");

      const indefini = await runSimuleNote();
      modifierRun(indefini, (r) => ({ ...r, motif_indefini_kappa_paire_juges: "accord_attendu_maximal" }));
      expect(critereDe(indefini)).toMatchObject({ statut: "rouge", valeur: "kappa de la paire indéfini : accord_attendu_maximal" });
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
      goNoGo(run);
      const ecrit = valider<Record<string, unknown>>("run", lireObjet(join(run, "run.json")), "run.json écrit");
      const outils = (ecrit["perimetre"] as Record<string, unknown>)["outils"] as Record<string, unknown>[];
      const alpha = outils.find((o) => o["outil_id"] === "outil-alpha");
      const beta = outils.find((o) => o["outil_id"] === "outil-beta");
      const gamma = outils.find((o) => o["outil_id"] === "comparateur-gamma");

      const reponses = lireReponses(run, lireRunJson(run).id);
      expect(alpha?.["par_mode"]).toEqual({
        web_activee: seuilModeAttendu(reponses, "outil-alpha", "web_activee"),
        web_desactivee: seuilModeAttendu(reponses, "outil-alpha", "web_desactivee"),
      });
      expect(beta?.["par_mode"]).toEqual({
        web_desactivee: seuilModeAttendu(reponses, "outil-beta", "web_desactivee"),
      });
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
    "§7.30 : écrit accord_humains_echantillon, compté sur l'échantillon rejoué ; un accord déjà écrit différent du recalcul : refus, run.json inchangé à l'octet",
    async () => {
      const run = await runSimuleNote();
      const lu = lireRunJson(run);
      const obtenues = lireReponses(run, lu.id).filter((r) => r.contexte === "run" && r.statut_reponse === "obtenue").map((r) => r.id);
      const taille = tirerEchantillonHumain(obtenues, lu.graines.echantillon_humain, lu.taux_echantillon_humain).length;
      expect(taille).toBeGreaterThan(0);

      const resultat = goNoGo(run);
      // Les aides posent deux notations humaines identiques sur chaque réponse de l'échantillon,
      // refus de l'API compris (D32) : toutes sont doublement notées, toutes concordent. Les notes
      // recopiées couvrent plusieurs catégories primaires : le kappa des deux humains (D58) vaut 1.
      const attendu = { reponses_doublement_notees: taille, accords: taille, part: 1, kappa: 1 };
      expect(resultat.accord_humains).toEqual({ ...attendu, motif_indefini_kappa: null, non_classees_ecartees_kappa: 0 });
      const ecrit = valider<Record<string, unknown>>("run", lireObjet(join(run, "run.json")), "run.json écrit");
      expect(ecrit["accord_humains_echantillon"]).toEqual(attendu);
      expect(ecrit["go_no_go"]).not.toHaveProperty("accord_humains_echantillon");

      modifierRun(run, (r) => ({ ...r, accord_humains_echantillon: { reponses_doublement_notees: taille, accords: taille - 1, part: (taille - 1) / taille, kappa: 1 } }));
      const avant = [octets(run, "run.json"), octets(run, "checklist.json")];
      expect(() => goNoGo(run)).toThrow(GoNoGoDivergent);
      expect([octets(run, "run.json"), octets(run, "checklist.json")]).toEqual(avant);
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
      // Un run invalide porte l'empreinte du protocole (§9, run.schema.json) : sans elle, le schéma refuserait avant le go/no-go.
      modifierRun(run, (r) => ({
        ...r,
        statut: "invalide",
        invalidation: { motif: "Incident technique.", date: "2026-12-02T10:00:00+01:00" },
        versions: { ...(r["versions"] as object), protocole_sha256: "b".repeat(64) },
        ...PUBLICATION_ET_DEPOT,
      }));
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
    "metriques/ présent sans metriques.json : arrêt (MetriquesSansFichier), rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      mkdirSync(join(run, "metriques"));
      const avant = octets(run, "run.json");
      expect(() => goNoGo(run)).toThrow(MetriquesSansFichier);
      expect(octets(run, "checklist.json")).toBeNull();
      expect(octets(run, "run.json")).toEqual(avant);
    },
    TEMPS,
  );
});

describe("pnpm go-no-go : plan d'interrogation et attente de l'opérateur (§6, §8, §12, protocole 0.21)", () => {
  function cleDeReponse(reponse: Reponse): CleRequete {
    if (reponse.mode === undefined) throw new Error(`réponse ${reponse.id} sans mode`);
    const { outil_id, question_id, formulation_id, echantillon } = reponse;
    return { outil_id, question_id, mode: reponse.mode, formulation_id, echantillon };
  }

  function reponsesDuRun(run: string): readonly Reponse[] {
    return lireReponses(run, lireRunJson(run).id).filter((r) => r.contexte === "run" && r.canal === "api");
  }

  function premiereManquante(run: string): Reponse {
    const manquante = reponsesDuRun(run).find((r) => r.statut_reponse === "manquante");
    if (manquante === undefined) throw new Error("le run simulé n'a aucune réponse manquante");
    return manquante;
  }

  function retirerReponse(run: string, reponse: Reponse): void {
    rmSync(join(run, "volume", "reponses", `${reponse.id}.json`));
  }

  /** Le journal de la requête, réécrit à neuf : une tentative reçue, non stockée (§6, D55 (5)). */
  function journalNeuf(run: string, reponse: Reponse): JournalRequete {
    const repertoire = join(run, "volume", "tentatives");
    const cle = cleDeReponse(reponse);
    rmSync(join(repertoire, nomJournal(cle)), { force: true });
    const journal = new JournalRequete(repertoire, cle);
    journal.inscrireDebut(1, "2026-12-01T06:00:00+01:00", cle);
    return journal;
  }

  it(
    "une manquante écrite retirée du volume, sans journal en attente : toujours comptée manquante, par_mode inchangé (dénominateur = plan)",
    async () => {
      const run = await runSimuleNote();
      const avant = reponsesDuRun(run);
      const manquante = premiereManquante(run);
      if (manquante.mode === undefined) throw new Error("manquante sans mode");
      const attendu = seuilModeAttendu(avant, manquante.outil_id, manquante.mode);
      retirerReponse(run, manquante);

      const resultat = goNoGo(run);

      expect(resultat.par_mode.get(manquante.outil_id)?.[manquante.mode]).toEqual(attendu);
    },
    TEMPS,
  );

  it(
    "une requête en attente de l'opérateur (recue_non_stockee) : refus nommé qui la liste, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      const manquante = premiereManquante(run);
      retirerReponse(run, manquante);
      journalNeuf(run, manquante).inscrireRecueNonStockee(1, null, "décodage non UTF-8");
      const avant = octets(run, "run.json");

      expect(() => goNoGo(run)).toThrow(ReponsesEnAttenteOperateur);
      expect(() => goNoGo(run)).toThrow(manquante.question_id);
      expect(octets(run, "run.json")).toEqual(avant);
      expect(octets(run, "checklist.json")).toBeNull();
    },
    TEMPS,
  );

  it(
    "une réponse reçue dont les octets sont gardés sans suite (octets_sans_suite) : même refus, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      const manquante = premiereManquante(run);
      retirerReponse(run, manquante);
      journalNeuf(run, manquante).garderOctets(1, new TextEncoder().encode("{"));
      const avant = octets(run, "run.json");

      expect(() => goNoGo(run)).toThrow(ReponsesEnAttenteOperateur);
      expect(octets(run, "run.json")).toEqual(avant);
      expect(octets(run, "checklist.json")).toBeNull();
    },
    TEMPS,
  );

  it(
    "une requête dont l'opérateur a stocké la réponse n'attend plus : le go/no-go se prononce",
    async () => {
      const run = await runSimuleNote();
      const manquante = premiereManquante(run);
      journalNeuf(run, manquante).inscrireRecueNonStockee(1, null, "décodage non UTF-8");

      expect(goNoGo(run).run_json).toBe("ecrit");
    },
    TEMPS,
  );

  it(
    "une réponse enregistrée hors plan (échantillon que le plan ne prévoit pas) : refus nommé, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      const manquante = premiereManquante(run);
      const horsPlan = { ...manquante, id: ulid("reponse-hors-plan"), echantillon: 3 };
      ecrireObjet(join(run, "volume", "reponses", `${horsPlan.id}.json`), horsPlan);
      const avant = octets(run, "run.json");

      expect(() => goNoGo(run)).toThrow(ReponseHorsPlan);
      expect(() => goNoGo(run)).toThrow(horsPlan.id);
      expect(octets(run, "run.json")).toEqual(avant);
      expect(octets(run, "checklist.json")).toBeNull();
    },
    TEMPS,
  );

  it(
    "tirage.json absent : le plan n'est pas reconstructible, refus nommé, rien n'est écrit",
    async () => {
      const run = await runSimuleNote();
      rmSync(join(run, "tirage.json"));
      const avant = octets(run, "run.json");

      expect(() => goNoGo(run)).toThrow(PlanNonReconstructible);
      expect(octets(run, "run.json")).toEqual(avant);
      expect(octets(run, "checklist.json")).toBeNull();
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
