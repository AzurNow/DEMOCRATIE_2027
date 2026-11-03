/**
 * Lot gel, PR 3 (décision D51) : ce que `schema/run.schema.json` admet de l'invalidation et de la
 * réexécution. Cas limite 6 du brief, nommé « schéma, cas 6 ».
 *
 * - `invalidation` permise pour `planifie`, `en_cours` et `invalide` (exigée pour ce dernier),
 *   interdite pour `publie` et `publie_provisoire` ; `invalidation.date` exigée (D51 (2)).
 * - `run_remplace_id` exigé d'une `reexecution`, interdit pour tout autre type (D51 (3)).
 *
 * Chaque cas part d'un exemple valide réel et n'en change qu'un point.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../../schema/exemples/run");
const INVALIDATION = { motif: "Incident technique pendant la fenêtre (§6).", date: "2026-12-02T10:00:00+01:00" };
const ULID = "01KAAAAAAAAAAAAAAAAAAAAAAA";

function exemple(nom: string): Objet {
  return JSON.parse(readFileSync(resolve(EXEMPLES, nom), "utf8")) as Objet;
}

function messages(run: Objet): readonly string[] {
  const erreur = erreurDeSchema("run", run, "test");
  return erreur === null ? [] : [erreur.message];
}

function publie(): Objet {
  return exemple("valide-01-mensuel-publie.json");
}

/** `valide-01` ramené au statut voulu avant publication : sans go/no-go, publication ni dépôt. */
function avantPublication(statut: string): Objet {
  const run = publie();
  for (const cle of ["go_no_go", "publication", "depot", "indeterminees_echantillon_humain", "non_classees_echantillon_humain", "renvois_attribution_indecidable", "refus_api_echantillon_humain"]) delete run[cle];
  return { ...run, statut };
}

describe("schéma, cas 6 : invalidation", () => {
  it("schéma, cas 6 : invalidation sur planifie et sur en_cours ⇒ valide (D51 (2))", () => {
    for (const statut of ["planifie", "en_cours"]) {
      expect(messages(avantPublication(statut))).toEqual([]);
      expect(messages({ ...avantPublication(statut), invalidation: INVALIDATION })).toEqual([]);
    }
  });

  it("schéma, cas 6 : invalidation sur publie et sur publie_provisoire ⇒ invalide", () => {
    expect(messages(publie())).toEqual([]);
    const [erreur] = messages({ ...publie(), invalidation: INVALIDATION });
    expect(erreur).toContain("must NOT be valid");
    const provisoire = exemple("valide-02-provisoire-juge-retire.json");
    expect(messages(provisoire)).toEqual([]);
    expect(messages({ ...provisoire, invalidation: INVALIDATION }).length).toBe(1);
  });

  it("schéma, cas 6 : invalide sans date d'invalidation ⇒ invalide ; avec ⇒ valide", () => {
    const invalide = exemple("valide-04-invalide-symetrie-rouge-sans-go-no-go.json");
    expect(messages(invalide)).toEqual([]);
    const { motif } = invalide["invalidation"] as { motif: string };
    const [erreur] = messages({ ...invalide, invalidation: { motif } });
    expect(erreur).toContain("/invalidation");
    expect(erreur).toContain("must have required property 'date'");
  });

  it("schéma, cas 6 : invalide sans invalidation ⇒ invalide (inchangé)", () => {
    const { invalidation: _retiree, ...sans } = exemple("valide-04-invalide-symetrie-rouge-sans-go-no-go.json");
    expect(messages(sans).join("\n")).toContain("must have required property 'invalidation'");
  });

  it("schéma, cas 6 : date d'invalidation sans décalage ⇒ invalide", () => {
    const [erreur] = messages({ ...avantPublication("en_cours"), invalidation: { ...INVALIDATION, date: "2026-12-02T10:00:00" } });
    expect(erreur).toContain("/invalidation/date");
  });
});

describe("schéma, cas 6 : run_remplace_id", () => {
  it("schéma, cas 6 : reexecution avec run_remplace_id ⇒ valide", () => {
    expect(messages({ ...publie(), type_run: "reexecution", run_remplace_id: ULID })).toEqual([]);
  });

  it("schéma, cas 6 : reexecution sans run_remplace_id ⇒ invalide", () => {
    const [erreur] = messages({ ...publie(), type_run: "reexecution" });
    expect(erreur).toContain("must have required property 'run_remplace_id'");
  });

  it("schéma, cas 6 : run_remplace_id sur un hebdomadaire (et sur un mensuel) ⇒ invalide", () => {
    const hebdomadaire = exemple("valide-02-provisoire-juge-retire.json");
    expect(hebdomadaire["type_run"]).toBe("hebdomadaire");
    expect(messages({ ...hebdomadaire, run_remplace_id: ULID })[0]).toContain("must NOT be valid");
    expect(messages({ ...publie(), run_remplace_id: ULID })[0]).toContain("must NOT be valid");
  });

  it("schéma, cas 6 : run_remplace_id qui n'est pas un ULID ⇒ invalide", () => {
    const [erreur] = messages({ ...publie(), type_run: "reexecution", run_remplace_id: "run-de-decembre" });
    expect(erreur).toContain("/run_remplace_id");
  });
});
