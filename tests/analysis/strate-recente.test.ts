/**
 * Strate « moins de 60 jours » de H2 (§2, protocole 0.24, D59 (1)) : « La date d'un item est son
 * début de validité (`valide_du`), et celle d'un item O la date de son changement ; une question
 * entre dans cette strate quand la date de son item principal est comprise entre l'instant de gel
 * moins 60 jours et l'instant de gel, bornes comprises, une date civile se lisant à minuit UTC,
 * comme aux sections 3 et 4. Les questions sur un item F et les questions d'attribution sont hors
 * de cette strate. »
 */

import { describe, expect, it } from "vitest";
import { comparerConditions, pairesParMode } from "../../analysis/conditions.ts";
import { exactitude } from "../../analysis/metriques.ts";
import {
  dateDeLItem,
  dateDansStrateRecente,
  ItemOSansDateChangement,
  ItemPrincipalHorsDesItems,
  QuestionSansItemPrincipal,
  STRATE_RECENTE,
  TypeItemDivergent,
  unitesDeLaStrateRecente,
  type ItemDate,
} from "../../analysis/strate-recente.ts";
import { DateCivileInvalide } from "../../pipeline/questions/reponse-attendue.ts";
import { tousCompares, ulid, unite } from "./fabriques.ts";

/** Gel à minuit UTC : « 60 jours avant » tombe exactement sur une date civile. */
const GEL_MINUIT = "2027-03-01T00:00:00Z";
/** 2027-03-01 − 60 jours = 2026-12-31 (janvier 31 + février 28 + 1). */
const J_MOINS_60 = "2026-12-31";
const J_MOINS_61 = "2026-12-30";

function itemP(cle: string, valide_du: string): ItemDate {
  return { id: ulid(cle), type: "P", valide_du };
}

describe("dateDansStrateRecente : bornes comprises, minuit UTC", () => {
  it("garde un item daté exactement de 60 jours avant le gel (borne basse comprise)", () => {
    expect(dateDansStrateRecente(J_MOINS_60, GEL_MINUIT)).toBe(true);
  });

  it("exclut un item daté de 61 jours avant le gel", () => {
    expect(dateDansStrateRecente(J_MOINS_61, GEL_MINUIT)).toBe(false);
  });

  it("garde un item daté du jour du gel (borne haute comprise)", () => {
    expect(dateDansStrateRecente("2027-03-01", GEL_MINUIT)).toBe(true);
  });

  it("exclut un item daté du lendemain du gel", () => {
    expect(dateDansStrateRecente("2027-03-02", GEL_MINUIT)).toBe(false);
  });

  it("compare des instants : gel à midi UTC, la date civile de J−60 tombe avant la borne basse", () => {
    // Borne basse : 2026-12-31T12:00Z ; la date 2026-12-31 se lit 2026-12-31T00:00Z, avant elle.
    expect(dateDansStrateRecente(J_MOINS_60, "2027-03-01T12:00:00Z")).toBe(false);
    expect(dateDansStrateRecente("2027-01-01", "2027-03-01T12:00:00Z")).toBe(true);
    expect(dateDansStrateRecente("2027-03-01", "2027-03-01T12:00:00Z")).toBe(true);
  });

  it("lit le décalage du gel : 2027-03-01T00:30+01:00 précède minuit UTC du 1er mars", () => {
    expect(dateDansStrateRecente("2027-03-01", "2027-03-01T00:30:00+01:00")).toBe(false);
    expect(dateDansStrateRecente("2027-02-28", "2027-03-01T00:30:00+01:00")).toBe(true);
  });

  it("refuse une date civile impossible au lieu de la faire glisser", () => {
    expect(() => dateDansStrateRecente("2027-02-29", GEL_MINUIT)).toThrow(DateCivileInvalide);
  });

  it("refuse un gel sans décalage horaire", () => {
    expect(() => dateDansStrateRecente("2027-02-01", "2027-03-01T00:00:00")).toThrow(/décalage/);
  });
});

describe("dateDeLItem", () => {
  it("lit valide_du pour un item P ou A", () => {
    expect(dateDeLItem(itemP("p", "2027-01-15"))).toBe("2027-01-15");
    expect(dateDeLItem({ id: ulid("a"), type: "A", valide_du: "2027-01-16" })).toBe("2027-01-16");
  });

  it("lit date_changement, pas valide_du, pour un item O", () => {
    const item: ItemDate = {
      id: ulid("o"),
      type: "O",
      valide_du: "2026-01-01",
      obsolescence: { date_changement: "2027-02-10" },
    };
    expect(dateDeLItem(item)).toBe("2027-02-10");
  });

  it("refuse un item O sans date de changement, sans se replier sur valide_du", () => {
    const item: ItemDate = { id: ulid("o-sans"), type: "O", valide_du: "2027-02-10" };
    expect(() => dateDeLItem(item)).toThrow(ItemOSansDateChangement);
  });
});

describe("unitesDeLaStrateRecente", () => {
  const recent = itemP("recent", "2027-02-01");
  const ancien = itemP("ancien", "2026-06-01");
  const fictif: ItemDate = { id: ulid("fictif"), type: "F", valide_du: "2027-02-01" };
  const oRecent: ItemDate = {
    id: ulid("o-recent"),
    type: "O",
    valide_du: "2025-01-01",
    obsolescence: { date_changement: "2027-02-15" },
  };
  const oAncien: ItemDate = {
    id: ulid("o-ancien"),
    type: "O",
    valide_du: "2027-02-01",
    obsolescence: { date_changement: "2026-05-01" },
  };
  const oPosterieur: ItemDate = {
    id: ulid("o-posterieur"),
    type: "O",
    valide_du: "2025-01-01",
    obsolescence: { date_changement: "2027-03-10" },
  };
  const items = [recent, ancien, fictif, oRecent, oAncien, oPosterieur];

  function surItem(item: ItemDate, gabarit: "Q-DIR" | "Q-ATT" = "Q-DIR") {
    return unite({
      verdict_id: ulid(`verdict-${item.id}-${gabarit}`),
      grappe_id: item.id,
      item_principal_id: item.id,
      item_ids: [item.id],
      type_item_principal: item.type,
      gabarit,
      candidat_id: gabarit === "Q-ATT" ? null : "candidat-a",
    });
  }

  it("garde les questions dont l'item principal est récent, dans l'ordre d'entrée", () => {
    const entree = [surItem(ancien), surItem(recent), surItem(oRecent), surItem(oAncien)];
    expect(unitesDeLaStrateRecente(entree, items, GEL_MINUIT).map((u) => u.item_principal_id)).toEqual([
      recent.id,
      oRecent.id,
    ]);
  });

  it("exclut un item O dont le changement est postérieur au gel", () => {
    expect(unitesDeLaStrateRecente([surItem(oPosterieur)], items, GEL_MINUIT)).toEqual([]);
  });

  it("exclut une question sur un item F, même daté dans la fenêtre", () => {
    expect(unitesDeLaStrateRecente([surItem(fictif)], items, GEL_MINUIT)).toEqual([]);
  });

  it("exclut une question d'attribution, même portée par un item principal récent", () => {
    expect(unitesDeLaStrateRecente([surItem(recent, "Q-ATT")], items, GEL_MINUIT)).toEqual([]);
  });

  it("exclut une question d'attribution sans item principal (mesure réelle)", () => {
    const qatt = unite({ gabarit: "Q-ATT", item_principal_id: null, type_item_principal: null, candidat_id: null });
    expect(unitesDeLaStrateRecente([qatt], items, GEL_MINUIT)).toEqual([]);
  });

  it("refuse une question hors attribution sans item principal", () => {
    const orpheline = unite({ gabarit: "Q-DIR", item_principal_id: null, type_item_principal: null });
    expect(() => unitesDeLaStrateRecente([orpheline], items, GEL_MINUIT)).toThrow(QuestionSansItemPrincipal);
  });

  it("refuse un item principal absent des items fournis, sans le classer d'un côté", () => {
    const inconnu = unite({ item_principal_id: ulid("inconnu"), type_item_principal: "P" });
    expect(() => unitesDeLaStrateRecente([inconnu], items, GEL_MINUIT)).toThrow(ItemPrincipalHorsDesItems);
  });

  it("refuse un item dont le type diverge de celui porté par l'unité", () => {
    const divergente = unite({ item_principal_id: recent.id, type_item_principal: "A" });
    expect(() => unitesDeLaStrateRecente([divergente], items, GEL_MINUIT)).toThrow(TypeItemDivergent);
  });

  it("refuse un item O sans date de changement dans la strate", () => {
    const oSans: ItemDate = { id: ulid("o-sans-date"), type: "O", valide_du: "2027-02-01" };
    expect(() => unitesDeLaStrateRecente([surItem(oSans)], [oSans], GEL_MINUIT)).toThrow(ItemOSansDateChangement);
  });

  it("refuse deux items de même identifiant", () => {
    expect(() => unitesDeLaStrateRecente([], [recent, recent], GEL_MINUIT)).toThrow(/double/);
  });
});

describe("clé de graine de la strate récente (§8, protocole 0.25, D60)", () => {
  it("nomme la strate recents:60j, et la différence de modes sur cette strate porte la clé exacte du §8", () => {
    expect(STRATE_RECENTE).toBe("recents:60j");
    const unites = Array.from({ length: 3 }, (_, i) => {
      const item = ulid(`item-recent-${i}`);
      const commun = { grappe_id: item, item_principal_id: item, item_ids: [item] };
      return [
        unite({ ...commun, verdict_id: ulid(`v-a-${i}`), mode: "web_activee" }),
        unite({ ...commun, verdict_id: ulid(`v-d-${i}`), mode: "web_desactivee" }),
      ];
    }).flat();
    const { paires } = pairesParMode(unites, tousCompares(unites));
    const [comparaison] = comparerConditions(paires, exactitude, {
      reechantillonnages: 50,
      graine_du_run: 20261201,
      cle: ["exactitude", STRATE_RECENTE],
    });
    expect(comparaison?.difference.cle).toEqual([
      "bootstrap",
      "exactitude",
      "recents:60j",
      "outil-alpha:web_activee-web_desactivee",
    ]);
  });
});
