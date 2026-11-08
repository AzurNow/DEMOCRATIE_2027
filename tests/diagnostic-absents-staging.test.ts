/**
 * Un item du lot introuvable parmi les items chargés (docs/DETTE.md, 2026-09-25, n° 1).
 *
 * Avant ce lot, `analyse-lot.ts:apparier` écartait sans bruit un item du manifeste qu'il ne
 * trouvait plus dans `staging/` (ni dans `data/`, que les appelants fusionnent par
 * `itemsEffectifs`) : promu puis retiré, renommé. Il sortait du dénominateur sans être compté
 * nulle part, et le `n` publié baissait sans explication.
 *
 * Décision d'implémentation, pas de protocole : ces items sont nommés dans le diagnostic
 * (`absents_du_staging`), et le kappa comme son dénominateur restent exactement ceux d'avant.
 */

import { describe, expect, it } from "vitest";
import { valider } from "../outils/schemas/valider.ts";
import { diagnostiquerLot, ItemEnDoubleDansLeLot, type DiagnosticLot } from "../validation/domaine/analyse-lot.ts";
import { projeterDiagnostic } from "../validation/domaine/diagnostic-publie.ts";
import { rejouer } from "../validation/domaine/journal.ts";
import type { Decision, EntreeJournal, Item, Lot } from "../validation/domaine/types.ts";
import { lotDe } from "./aides/bac.ts";
import { decision, itemP } from "./aides/fabriques.ts";

const ITEMS: readonly Item[] = [1, 2, 3, 4].map((rang) =>
  itemP({ id: `01JBANCESSA1000000001TEM0${rang}`, candidat_id: "demo-alpha" }),
);

/** Un seul désaccord (item 3) : le kappa n'est ni 0 ni 1, une régression se voit. */
const DECISIONS: Readonly<Record<string, readonly Decision[]>> = {
  a1: ["accepter", "rejeter", "accepter", "non_evaluable"],
  a2: ["accepter", "rejeter", "rejeter", "non_evaluable"],
};

/** L'item qui quitte le staging : un accord, dont la sortie change le kappa. */
const ABSENT = ITEMS[1] as Item;

function journal(annotateur_id: string, items: readonly Item[] = ITEMS): EntreeJournal[] {
  return items.map((item) => {
    const rang = ITEMS.indexOf(item);
    const choix = (DECISIONS[annotateur_id] as readonly Decision[])[rang] as Decision;
    return decision({ annotateur_id, item, decision: choix });
  });
}

function diagnostic(lot: Lot, charges: readonly Item[], journaux = { a1: journal("a1"), a2: journal("a2") }): DiagnosticLot {
  return diagnostiquerLot({
    lot,
    items: new Map(charges.map((item) => [item.id, item])),
    etats: new Map(Object.entries(journaux).map(([annotateur, entrees]) => [annotateur, rejouer(entrees)])),
    taille_attendue: lot.items.length,
  });
}

const LOT = lotDe("lot-001", ITEMS);
const SANS_ABSENT = ITEMS.filter((item) => item.id !== ABSENT.id);

describe("absents_du_staging : aucun absent", () => {
  it("présent et vide, jamais omis ; kappa inchangé (4 paires, un désaccord)", () => {
    const resultat = diagnostic(LOT, ITEMS);
    expect(resultat).toHaveProperty("absents_du_staging");
    expect(resultat.absents_du_staging).toEqual([]);
    // Marges a1 (2, 1, 1), a2 (1, 2, 1) : po = 3/4, pe = 5/16, kappa = (12/16 − 5/16) / (11/16) = 7/11.
    expect(resultat.kappa.n).toBe(4);
    expect(resultat.kappa.kappa).toBeCloseTo(7 / 11, 12);
  });
});

describe("absents_du_staging : un absent", () => {
  it("compté et nommé par son identifiant", () => {
    const resultat = diagnostic(LOT, SANS_ABSENT);
    expect(resultat.absents_du_staging).toEqual([ABSENT.id]);
  });

  it("kappa et n identiques à avant la correction : l'item sort du dénominateur comme avant", () => {
    const resultat = diagnostic(LOT, SANS_ABSENT);
    // Valeurs d'avant la correction : paires 1, 3, 4 ; po = 2/3, pe = 3/9, kappa = 0,5.
    expect(resultat.kappa.n).toBe(3);
    expect(resultat.kappa.kappa).toBeCloseTo(0.5, 12);
  });

  it("kappa, kappa par question et accord : ceux du lot dont l'item n'aurait jamais fait partie", () => {
    const avecAbsent = diagnostic(LOT, SANS_ABSENT);
    const lotReduit = diagnostic(lotDe("lot-001", SANS_ABSENT), SANS_ABSENT, {
      a1: journal("a1", SANS_ABSENT),
      a2: journal("a2", SANS_ABSENT),
    });
    expect(avecAbsent.kappa).toEqual(lotReduit.kappa);
    expect(avecAbsent.kappa_par_question).toEqual(lotReduit.kappa_par_question);
    expect(avecAbsent.accord_suffisant).toBe(lotReduit.accord_suffisant);
    expect(avecAbsent.taux_double_correction_divergente).toBe(lotReduit.taux_double_correction_divergente);
  });

  it("n'est pas compté parmi les exclus pour contestation, et taille_lot compte toujours le manifeste", () => {
    const resultat = diagnostic(LOT, SANS_ABSENT);
    expect(resultat.exclus_contestation).toBe(0);
    expect(resultat.taille_lot).toBe(4);
    expect(resultat.taille_conforme).toBe(true);
  });

  it("absent sans décision : nommé, et le lot reste non fini comme avant (aFini lit le journal)", () => {
    const journaux = { a1: journal("a1", SANS_ABSENT), a2: journal("a2", SANS_ABSENT) };
    const resultat = diagnostic(LOT, SANS_ABSENT, journaux);
    expect(resultat.absents_du_staging).toEqual([ABSENT.id]);
    expect(resultat.les_deux_ont_fini).toBe(false);
  });

  it("plusieurs absents : nommés dans l'ordre du manifeste", () => {
    const charges = [ITEMS[0] as Item, ITEMS[2] as Item];
    const resultat = diagnostic(LOT, charges);
    expect(resultat.absents_du_staging).toEqual([(ITEMS[1] as Item).id, (ITEMS[3] as Item).id]);
    expect(resultat.kappa.n).toBe(2);
  });
});

describe("absents_du_staging : tous les items absents", () => {
  it("diagnostic explicite : tous nommés, kappa indéfini faute d'item commun, aucune exception", () => {
    const resultat = diagnostic(LOT, []);
    expect(resultat.absents_du_staging).toEqual(ITEMS.map((item) => item.id));
    expect(resultat.kappa.kappa).toBeNull();
    expect(resultat.kappa.motif_indefini).toBe("aucun_item_commun");
    expect(resultat.kappa.n).toBe(0);
    expect(resultat.kappa.accord_observe).toBeNull();
    expect(resultat.accord_suffisant).toBeNull();
  });

  it("le diagnostic publié qui en sort passe le schéma et porte les absents", () => {
    const resultat = diagnostic(LOT, []);
    const publie = projeterDiagnostic(resultat, LOT, [LOT], "2026-11-08T10:00:00+01:00");
    expect(publie.absents_du_staging).toEqual(ITEMS.map((item) => item.id));
    expect(() => valider("diagnostic-lot", publie, "diagnostic publié")).not.toThrow();
  });
});

describe("absents_du_staging : comportements préservés", () => {
  it("item présent deux fois et absent : le doublon reste refusé par son erreur nommée", () => {
    const lot = lotDe("lot-001", [ABSENT, ABSENT, ITEMS[0] as Item]);
    expect(() => diagnostic(lot, [ITEMS[0] as Item])).toThrow(ItemEnDoubleDansLeLot);
  });

  it("identifiant renommé : l'ancien est nommé absent, le nouveau n'entre pas au kappa, ses décisions non plus", () => {
    const renomme: Item = { ...ABSENT, id: "01JBANCESSA1000000001TEM09" };
    const charges = [...SANS_ABSENT, renomme];
    const resultat = diagnostic(LOT, charges);
    expect(resultat.absents_du_staging).toEqual([ABSENT.id]);
    expect(resultat.absents_du_staging).not.toContain(renomme.id);
    expect(resultat.kappa.n).toBe(3);
    expect(resultat.kappa.kappa).toBeCloseTo(0.5, 12);
  });

  it("le diagnostic publié d'un lot sans absent porte un tableau vide et passe le schéma", () => {
    const resultat = diagnostic(LOT, ITEMS);
    const publie = projeterDiagnostic(resultat, LOT, [LOT], "2026-11-08T10:00:00+01:00");
    expect(publie.absents_du_staging).toEqual([]);
    expect(() => valider("diagnostic-lot", publie, "diagnostic publié")).not.toThrow();
  });
});
