/**
 * Contrôle a posteriori du corpus promu (docs/DETTE.md, 2026-09-17, point 1) : chaque validation
 * retenue de `item.validations[]` est rapprochée de la décision du journal qu'elle projette, et les
 * versions jugées sont confrontées par `validationsConcordantesMemeVersion`.
 */
import { describe, expect, it } from "vitest";
import type { EntreeDecision, EntreeJournal, Item } from "../validation/domaine/types.ts";
import {
  controlerVersionsPromues,
  ValidationsPromuesIncoherentes,
  verifierVersionsPromues,
  type LireJournal,
} from "../validation/domaine/versions-promues.ts";
import { itemPromu } from "./aides/data.ts";
import { decision, itemP } from "./aides/fabriques.ts";

/** Le journal de `itemPromu` : deux acceptations, lot-001, même horodatage que la projection. */
function journalDe(item: Item, versions: { readonly a1: number; readonly a2: number }): EntreeJournal[] {
  const avant = itemP({ id: item.id });
  return [
    decision({ annotateur_id: "a1", item: avant, decision: "accepter", item_version: versions.a1 }),
    decision({ annotateur_id: "a2", item: avant, decision: "accepter", item_version: versions.a2 }),
  ];
}

function lecteur(entrees: readonly EntreeJournal[]): LireJournal {
  return (annotateur_id, lot_id) =>
    entrees.filter((entree) => entree.annotateur_id === annotateur_id && entree.lot_id === lot_id);
}

function avecHorodatage(entree: EntreeDecision, horodatage: string): EntreeDecision {
  return { ...entree, horodatage };
}

describe("controlerVersionsPromues", () => {
  it("corpus promu vide : rien à signaler", () => {
    expect(controlerVersionsPromues([], lecteur([]))).toEqual({ violations: [], introuvables: [] });
    expect(() => verifierVersionsPromues([], lecteur([]))).not.toThrow();
  });

  it("corpus sain : les deux validations rapprochées portent la même version", () => {
    const item = itemPromu();
    expect(controlerVersionsPromues([item], lecteur(journalDe(item, { a1: 1, a2: 1 })))).toEqual({
      violations: [],
      introuvables: [],
    });
  });

  it("deux validations concordantes sur deux versions : violation nommée par l'item, erreur ValidationsPromuesIncoherentes", () => {
    const item = itemPromu();
    const lire = lecteur(journalDe(item, { a1: 1, a2: 2 }));
    const { violations, introuvables } = controlerVersionsPromues([item], lire);
    expect(introuvables).toEqual([]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(item.id);
    expect(() => verifierVersionsPromues([item], lire)).toThrow(ValidationsPromuesIncoherentes);
    expect(() => verifierVersionsPromues([item], lire)).toThrow(item.id);
  });

  it("même version, empreintes différentes : violation", () => {
    const item = itemPromu();
    const [a1, a2] = journalDe(item, { a1: 1, a2: 1 }) as [EntreeDecision, EntreeDecision];
    const lire = lecteur([a1, { ...a2, item_empreinte: "8".repeat(64) }]);
    expect(controlerVersionsPromues([item], lire).violations).toHaveLength(1);
  });

  it("une décision remplacée sur une autre version n'est pas lue : seule celle que projette validations[] compte", () => {
    const item = itemPromu();
    const ancienne = avecHorodatage(
      decision({ annotateur_id: "a1", item: itemP({ id: item.id }), decision: "accepter", item_version: 7 }),
      "2026-09-19T08:00:00+02:00",
    );
    const lire = lecteur([ancienne, ...journalDe(item, { a1: 1, a2: 1 })]);
    expect(controlerVersionsPromues([item], lire)).toEqual({ violations: [], introuvables: [] });
  });

  it("trois décisions rapprochées sur deux versions (entrées indiscernables) : une violation, qui nomme les deux versions", () => {
    const item = itemPromu();
    const doublon = decision({ annotateur_id: "a1", item: itemP({ id: item.id }), decision: "accepter", item_version: 3 });
    const lire = lecteur([...journalDe(item, { a1: 1, a2: 1 }), doublon]);
    const { violations } = controlerVersionsPromues([item], lire);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toMatch(/2 versions différentes : 1\|.*, 3\|/);
  });

  it("item tranché par arbitrage : exclu, ses validations peuvent porter deux versions (§4)", () => {
    const item: Item = {
      ...itemPromu(),
      arbitrage: {
        decision_id: "01JBANCESSA1ARB1TRAGE00001",
        date: "2026-09-22T10:00:00+02:00",
        arbitre: "auteur",
        arbitre_seul: true,
        motif: "versions_differentes",
        issue: "verifie",
        motivation: "Les deux versions ne diffèrent que par la paraphrase.",
      },
    };
    expect(controlerVersionsPromues([item], lecteur(journalDe(item, { a1: 1, a2: 2 })))).toEqual({
      violations: [],
      introuvables: [],
    });
  });

  it("validations de rejet sur deux versions : aucune ne vérifie l'item, rien à rapprocher", () => {
    const item: Item = {
      ...itemPromu(),
      statut_validation: "rejete",
      validations: (itemPromu().validations as readonly Record<string, unknown>[]).map((validation) => ({
        ...validation,
        decision: "rejeter",
      })),
    };
    expect(controlerVersionsPromues([item], lecteur([]))).toEqual({ violations: [], introuvables: [] });
  });

  it("validation retenue absente du journal : introuvable, nommée, et l'erreur est levée", () => {
    const item = itemPromu();
    const [a1] = journalDe(item, { a1: 1, a2: 1 });
    const lire = lecteur([a1 as EntreeJournal]);
    const { introuvables } = controlerVersionsPromues([item], lire);
    expect(introuvables).toEqual([
      { item_id: item.id, annotateur_id: "a2", lot_id: "lot-001", date: "2026-09-20T10:00:00+02:00", decision: "accepter" },
    ]);
    expect(() => verifierVersionsPromues([item], lire)).toThrow(/validation introuvable au journal : a2, lot lot-001/);
  });

  it("validation retenue sans lot_id : introuvable, jamais rapprochée d'un lot deviné", () => {
    const promu = itemPromu();
    const item: Item = {
      ...promu,
      validations: (promu.validations as readonly Record<string, unknown>[]).map(({ lot_id: _lot, ...reste }) => reste),
    };
    const { introuvables } = controlerVersionsPromues([item], lecteur(journalDe(item, { a1: 1, a2: 1 })));
    expect(introuvables.map((validation) => validation.lot_id)).toEqual([null, null]);
  });

  it("décision du journal de même horodatage mais d'une autre valeur : pas la projection, introuvable", () => {
    const item = itemPromu();
    const [a1, a2] = journalDe(item, { a1: 1, a2: 1 }) as [EntreeDecision, EntreeDecision];
    const lire = lecteur([a1, { ...a2, decision: "corriger" }]);
    expect(controlerVersionsPromues([item], lire).introuvables).toHaveLength(1);
  });
});
