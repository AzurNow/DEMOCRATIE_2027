/**
 * Lot gel, PR 3 (décision D51 (2), (4)) : `pnpm run:invalider` et sa partie sans ligne de commande
 * (`pipeline/run/invalidation.ts:invaliderRun`), sur un `run.json` de fixture rangé sous
 * `<temporaire>/<date de gel>/`, jamais sous `runs/` du projet. Cas limites 2 à 5 du brief, nommés
 * « invalider, cas n ».
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { instantParis } from "../../pipeline/interrogation/heure-paris.ts";
import { invaliderRun } from "../../pipeline/run/invalidation.ts";
import { TransitionRefusee } from "../../pipeline/run/statut.ts";
import type { MotifTransition } from "../../pipeline/run/statut.ts";
import { executerOutil } from "../aides/depot.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../../schema/exemples/run");
/** `date_gel` des exemples : 2026-12-01T06:00:00+01:00. */
const DATE_GEL_MS = Date.parse("2026-12-01T05:00:00Z");
const MAINTENANT = DATE_GEL_MS + 30 * 3_600_000;
const MOTIF = "Incident technique : l'interrogation d'un outil a été interrompue six heures (§6).";

const temporaires: string[] = [];

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function exemple(nom: string): Objet {
  return JSON.parse(readFileSync(join(EXEMPLES, nom), "utf8")) as Objet;
}

/** `valide-01` ramené au statut voulu avant publication : sans go/no-go, publication ni dépôt. */
function avantPublication(statut: string): Objet {
  const run = exemple("valide-01-mensuel-publie.json");
  for (const cle of ["go_no_go", "publication", "depot", "indeterminees_echantillon_humain", "renvois_attribution_indecidable", "refus_api_echantillon_humain"]) delete run[cle];
  return { ...run, statut };
}

/** Pose `run.json` sous `<temporaire>/<date>/` et rend ce répertoire. */
function poser(run: Objet, date = "2026-12-01"): string {
  const racine = mkdtempSync(join(tmpdir(), "banc-run-invalider-"));
  temporaires.push(racine);
  const repertoire = join(racine, date);
  mkdirSync(repertoire);
  expect(erreurDeSchema("run", run, "fixture")).toBeNull();
  writeFileSync(join(repertoire, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return repertoire;
}

function octets(repertoire: string): string {
  return readFileSync(join(repertoire, "run.json"), "utf8");
}

function lu(repertoire: string): Objet {
  return JSON.parse(octets(repertoire)) as Objet;
}

function refusDe(action: () => unknown): MotifTransition {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof TransitionRefusee) return erreur.motif;
    throw erreur;
  }
  throw new Error("L'invalidation a été acceptée alors qu'un refus était attendu.");
}

describe("invalider, cas 2 : depuis planifie et en_cours", () => {
  it("invalider, cas 2 : invalidation { motif, date } écrite, statut inchangé, run.json valide au schéma", () => {
    for (const statut of ["planifie", "en_cours"]) {
      const repertoire = poser(avantPublication(statut));
      const avant = lu(repertoire);
      const resultat = invaliderRun(repertoire, MOTIF, MAINTENANT);
      expect(resultat).toEqual({ issue: "inscrite", run_id: avant["id"], statut, date: instantParis(MAINTENANT) });
      const apres = lu(repertoire);
      expect(apres).toEqual({ ...avant, invalidation: { motif: MOTIF, date: instantParis(MAINTENANT) } });
      expect(apres["statut"]).toBe(statut);
      expect(erreurDeSchema("run", apres, "après invalidation")).toBeNull();
    }
  });
});

describe("invalider, cas 3 : depuis publie, publie_provisoire, invalide", () => {
  it("invalider, cas 3 : refus nommé statut_de_depart, octets de run.json identiques", () => {
    const exemples = ["valide-01-mensuel-publie.json", "valide-02-provisoire-juge-retire.json", "valide-04-invalide-symetrie-rouge-sans-go-no-go.json"];
    for (const nom of exemples) {
      const repertoire = poser(exemple(nom));
      const avant = octets(repertoire);
      expect(refusDe(() => invaliderRun(repertoire, MOTIF, MAINTENANT))).toBe("statut_de_depart");
      expect(octets(repertoire)).toBe(avant);
    }
  });
});

describe("invalider, cas 4 : une invalidation n'est jamais réécrite", () => {
  it("invalider, cas 4 : deuxième appel, même motif, même instant ⇒ deja_inscrite, octets identiques", () => {
    const repertoire = poser(avantPublication("en_cours"));
    invaliderRun(repertoire, MOTIF, MAINTENANT);
    const avant = octets(repertoire);
    expect(invaliderRun(repertoire, MOTIF, MAINTENANT).issue).toBe("deja_inscrite");
    expect(octets(repertoire)).toBe(avant);
  });

  it("invalider, cas 4 : deuxième appel, motif différent ⇒ refus invalidation_differente, octets identiques", () => {
    const repertoire = poser(avantPublication("planifie"));
    invaliderRun(repertoire, MOTIF, MAINTENANT);
    const avant = octets(repertoire);
    expect(refusDe(() => invaliderRun(repertoire, "Autre raison.", MAINTENANT))).toBe("invalidation_differente");
    expect(octets(repertoire)).toBe(avant);
  });

  it("invalider, cas 4 (D54 (5)) : deuxième appel, même motif, plus tard ⇒ deja_inscrite, octets et date inchangés", () => {
    const repertoire = poser(avantPublication("planifie"));
    const premier = invaliderRun(repertoire, MOTIF, MAINTENANT);
    const avant = octets(repertoire);
    const second = invaliderRun(repertoire, MOTIF, MAINTENANT + 1000);
    expect(second).toEqual({ ...premier, issue: "deja_inscrite" });
    expect(octets(repertoire)).toBe(avant);
  });

  it("invalider, cas 4 (D54 (5)) : même motif, quelle que soit la date reçue (même avant date_gel) ⇒ deja_inscrite, date inscrite rendue", () => {
    const repertoire = poser(avantPublication("planifie"));
    const premier = invaliderRun(repertoire, MOTIF, MAINTENANT);
    const avant = octets(repertoire);
    const second = invaliderRun(repertoire, MOTIF, DATE_GEL_MS - 1);
    expect(second).toEqual({ ...premier, issue: "deja_inscrite" });
    expect(octets(repertoire)).toBe(avant);
  });
});

describe("invalider, cas 5 : motif et date", () => {
  it("invalider, cas 5 : motif vide ⇒ refus motif_vide, rien écrit", () => {
    const repertoire = poser(avantPublication("planifie"));
    const avant = octets(repertoire);
    expect(refusDe(() => invaliderRun(repertoire, " ", MAINTENANT))).toBe("motif_vide");
    expect(octets(repertoire)).toBe(avant);
  });

  it("invalider, cas 5 : une milliseconde avant date_gel ⇒ refus date_avant_gel, rien écrit", () => {
    const repertoire = poser(avantPublication("planifie"));
    const avant = octets(repertoire);
    expect(refusDe(() => invaliderRun(repertoire, MOTIF, DATE_GEL_MS - 1))).toBe("date_avant_gel");
    expect(octets(repertoire)).toBe(avant);
  });

  it("invalider, cas 5 : exactement à date_gel ⇒ inscrite (le run existe dès son gel, convention semi-ouverte)", () => {
    const repertoire = poser(avantPublication("planifie"));
    expect(invaliderRun(repertoire, MOTIF, DATE_GEL_MS).issue).toBe("inscrite");
    expect((lu(repertoire)["invalidation"] as Objet)["date"]).toBe("2026-12-01T06:00:00.000+01:00");
  });
});

describe("pnpm run:invalider en ligne de commande", () => {
  /** Un run gelé dans le passé de l'horloge réelle : la commande date l'invalidation de Date.now(). */
  function runPasse(): string {
    const run = { ...avantPublication("en_cours"), date_gel: "2026-01-06T06:00:00+01:00", fenetre: { debut: "2026-01-06T06:00:00+01:00", fin: "2026-01-08T06:00:00+01:00" } };
    return poser(run, "2026-01-06");
  }

  it("invalider, cas 5 : --motif absent, sans valeur ou vide ⇒ code 2, rien écrit", () => {
    const repertoire = runPasse();
    const avant = octets(repertoire);
    for (const options of [[], ["--motif"], ["--motif="]]) {
      const execution = executerOutil("run-invalider.ts", [repertoire, ...options]);
      expect(execution.status).toBe(2);
      expect(execution.erreur).toContain("Rien n'est écrit");
      expect(octets(repertoire)).toBe(avant);
    }
  });

  it("invalider, cas 2 : nominal ⇒ code 0, invalidation écrite à l'instant de la commande, statut inchangé", () => {
    const repertoire = runPasse();
    const debut = Date.now();
    const execution = executerOutil("run-invalider.ts", [repertoire, `--motif=${MOTIF}`]);
    expect(execution.status).toBe(0);
    expect(execution.sortie).toContain("invalidation inscrite");
    const apres = lu(repertoire);
    expect(apres["statut"]).toBe("en_cours");
    const invalidation = apres["invalidation"] as { motif: string; date: string };
    expect(invalidation.motif).toBe(MOTIF);
    expect(Date.parse(invalidation.date)).toBeGreaterThanOrEqual(debut - 1000);
    expect(Date.parse(invalidation.date)).toBeLessThanOrEqual(Date.now());
  });

  it("invalider, cas 3 : run publié ⇒ code 2, TransitionRefusee nommée, rien écrit", () => {
    const repertoire = poser(exemple("valide-01-mensuel-publie.json"));
    const avant = octets(repertoire);
    const execution = executerOutil("run-invalider.ts", [repertoire, `--motif=${MOTIF}`]);
    expect(execution.status).toBe(2);
    expect(execution.erreur).toContain("TransitionRefusee");
    expect(octets(repertoire)).toBe(avant);
  });

  it("invalider, cas 4 (D54 (5), constat 8) : relancer la commande sur le même motif ⇒ code 0, déjà inscrite, octets inchangés", () => {
    const repertoire = runPasse();
    const premiere = executerOutil("run-invalider.ts", [repertoire, `--motif=${MOTIF}`]);
    expect(premiere.status).toBe(0);
    const avant = octets(repertoire);
    // Deux lancements réels n'ont jamais exactement le même Date.now() : c'est précisément le bogue
    // du constat 8 (invalidation_differente affiché comme « non enregistrée » alors qu'elle l'est).
    const seconde = executerOutil("run-invalider.ts", [repertoire, `--motif=${MOTIF}`]);
    expect(seconde.status).toBe(0);
    expect(seconde.sortie).toContain("invalidation déjà inscrite");
    expect(seconde.erreur).toBe("");
    expect(octets(repertoire)).toBe(avant);
  });
});
