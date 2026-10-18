/**
 * Lot gel, PR 3 (décision D51) : les transitions pures du statut d'un run (`pipeline/run/statut.ts`).
 * Chaque cas limite du brief a son test, nommé « statut, cas n ».
 *
 * - `demarrer` : `planifie` ⇒ `en_cours`, tout autre départ refusé nommément, et un run qui porte une
 *   invalidation aussi (D51 (1)).
 * - `invalider` : `invalidation { motif, date }` posée, statut inchangé, depuis `planifie` ou
 *   `en_cours` seulement (D51 (2), (4)) ; jamais réécrite (règle 7) ; motif non vide ; date jamais
 *   avant `date_gel`, admise exactement à `date_gel` (convention semi-ouverte du dépôt).
 */

import { describe, expect, it } from "vitest";
import { demarrer, demarrerOuReprendre, invalider, TransitionRefusee } from "../../pipeline/run/statut.ts";
import type { MotifTransition, RunAvecStatut } from "../../pipeline/run/statut.ts";

const DATE_GEL = "2026-12-01T01:00:00+01:00";
const APRES = "2026-12-02T10:00:00.000+01:00";
const MOTIF = "Incident technique : l'interrogation d'un outil a été interrompue six heures (§6).";

function run(statut: string, surcharges: Partial<RunAvecStatut> = {}): RunAvecStatut & { readonly autre: string } {
  return { statut, date_gel: DATE_GEL, autre: "inchangé", ...surcharges };
}

function refus(action: () => unknown): TransitionRefusee {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof TransitionRefusee) return erreur;
    throw erreur;
  }
  throw new Error("La transition a été acceptée alors qu'un refus était attendu.");
}

function motifDu(action: () => unknown): MotifTransition {
  return refus(action).motif;
}

describe("statut, cas 1 : demarrer", () => {
  it("statut, cas 1 : planifie ⇒ en_cours, le reste du run recopié tel quel", () => {
    expect(demarrer(run("planifie"))).toEqual({ statut: "en_cours", date_gel: DATE_GEL, autre: "inchangé" });
  });

  it("statut, cas 1 : en_cours, publie, publie_provisoire, invalide ⇒ refus nommé statut_de_depart", () => {
    for (const statut of ["en_cours", "publie", "publie_provisoire", "invalide"]) {
      const erreur = refus(() => demarrer(run(statut)));
      expect(erreur.motif).toBe("statut_de_depart");
      expect(erreur.transition).toBe("demarrer");
      expect(erreur.message).toContain(statut);
    }
  });

  it("statut, cas 1 : planifie portant une invalidation ⇒ refus nommé porte_une_invalidation", () => {
    const invalide = run("planifie", { invalidation: { motif: MOTIF, date: APRES } });
    expect(motifDu(() => demarrer(invalide))).toBe("porte_une_invalidation");
  });

  it("statut, cas 1 : l'entrée n'est jamais modifiée", () => {
    const entree = run("planifie");
    demarrer(entree);
    expect(entree.statut).toBe("planifie");
  });
});

describe("run gelé, cas 7 et 12 : demarrerOuReprendre (lot gel, PR 4)", () => {
  it("run gelé, cas 7 : planifie ⇒ demarre, avec le run de demarrer", () => {
    expect(demarrerOuReprendre(run("planifie"))).toEqual({ issue: "demarre", run: demarrer(run("planifie")) });
  });

  it("run gelé, cas 7 : en_cours sans invalidation ⇒ reprend, sans nouveau run à écrire", () => {
    expect(demarrerOuReprendre(run("en_cours"))).toEqual({ issue: "reprend" });
  });

  it("run gelé, cas 12 : en_cours portant une invalidation ⇒ refus nommé porte_une_invalidation", () => {
    const invalide = run("en_cours", { invalidation: { motif: MOTIF, date: APRES } });
    const erreur = refus(() => demarrerOuReprendre(invalide));
    expect(erreur.motif).toBe("porte_une_invalidation");
    expect(erreur.transition).toBe("demarrer");
  });

  it("run gelé, cas 6 : publie, publie_provisoire, invalide ⇒ refus nommé statut_de_depart ; planifie invalidé ⇒ porte_une_invalidation", () => {
    for (const statut of ["publie", "publie_provisoire", "invalide"]) expect(motifDu(() => demarrerOuReprendre(run(statut)))).toBe("statut_de_depart");
    expect(motifDu(() => demarrerOuReprendre(run("planifie", { invalidation: { motif: MOTIF, date: APRES } })))).toBe("porte_une_invalidation");
  });
});

describe("statut, cas 2 : invalider depuis planifie ou en_cours", () => {
  it("statut, cas 2 : planifie et en_cours ⇒ invalidation { motif, date } posée, statut inchangé", () => {
    for (const statut of ["planifie", "en_cours"]) {
      const issue = invalider(run(statut), MOTIF, APRES);
      expect(issue).toEqual({ issue: "inscrite", run: { ...run(statut), invalidation: { motif: MOTIF, date: APRES } } });
    }
  });
});

describe("statut, cas 3 : invalider depuis un statut publié ou invalide", () => {
  it("statut, cas 3 : publie, publie_provisoire, invalide ⇒ refus nommé statut_de_depart", () => {
    for (const statut of ["publie", "publie_provisoire", "invalide"]) {
      const erreur = refus(() => invalider(run(statut), MOTIF, APRES));
      expect(erreur.motif).toBe("statut_de_depart");
      expect(erreur.transition).toBe("invalider");
      expect(erreur.message).toContain(statut);
    }
  });
});

describe("statut, cas 4 : une invalidation n'est jamais réécrite (règle 7)", () => {
  it("statut, cas 4 : même motif, même date ⇒ deja_inscrite, la date déjà inscrite est rendue", () => {
    const deja = run("en_cours", { invalidation: { motif: MOTIF, date: APRES } });
    expect(invalider(deja, MOTIF, APRES)).toEqual({ issue: "deja_inscrite", date: APRES });
  });

  it("statut, cas 4 (D54 (5)) : même motif, un instant écrit autrement ⇒ deja_inscrite quand même, date déjà inscrite rendue", () => {
    const deja = run("en_cours", { invalidation: { motif: MOTIF, date: APRES } });
    expect(invalider(deja, MOTIF, "2026-12-02T09:00:00.000Z")).toEqual({ issue: "deja_inscrite", date: APRES });
  });

  it("statut, cas 4 : motif différent ⇒ refus invalidation_differente", () => {
    const deja = run("planifie", { invalidation: { motif: MOTIF, date: APRES } });
    expect(motifDu(() => invalider(deja, `${MOTIF} Autre.`, APRES))).toBe("invalidation_differente");
  });

  it("statut, cas 4 (D54 (5)) : même motif, date tout à fait différente (même avant date_gel) ⇒ deja_inscrite, date déjà inscrite rendue", () => {
    const deja = run("planifie", { invalidation: { motif: MOTIF, date: APRES } });
    expect(invalider(deja, MOTIF, "2026-12-03T10:00:00.000+01:00")).toEqual({ issue: "deja_inscrite", date: APRES });
  });
});

describe("statut, cas 5 : motif et date", () => {
  it("statut, cas 5 : motif vide ou fait de blancs ⇒ refus motif_vide", () => {
    for (const motif of ["", "   ", "\n\t"]) expect(motifDu(() => invalider(run("planifie"), motif, APRES))).toBe("motif_vide");
  });

  it("statut, cas 5 : date d'invalidation avant date_gel, d'une milliseconde ⇒ refus date_avant_gel", () => {
    expect(motifDu(() => invalider(run("planifie"), MOTIF, "2026-12-01T00:59:59.999+01:00"))).toBe("date_avant_gel");
  });

  it("statut, cas 5 : date d'invalidation exactement à date_gel ⇒ admise (le run existe dès date_gel, convention semi-ouverte)", () => {
    const issue = invalider(run("planifie"), MOTIF, "2026-12-01T00:00:00.000Z");
    expect(issue.issue).toBe("inscrite");
  });

  it("statut, cas 5 : date sans décalage explicite ⇒ refus date_illisible", () => {
    expect(motifDu(() => invalider(run("planifie"), MOTIF, "2026-12-02T10:00:00"))).toBe("date_illisible");
  });
});
