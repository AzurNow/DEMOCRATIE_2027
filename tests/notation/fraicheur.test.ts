/**
 * Fraîcheur d'une erreur d'obsolescence (§11, D17) : « fraîche quand la date de gel du run est
 * strictement antérieure à la date du changement plus 14 jours ». Cas limite 3 du brief
 * notation-humaine (bornes, fuseaux, minuit UTC).
 */

import { describe, expect, it } from "vitest";
import { DELAI_FRAICHEUR_JOURS, fraicheurDesItems, obsolescenceFraiche } from "../../pipeline/notation/fraicheur.ts";
import { DateCivileInvalide } from "../../analysis/instants.ts";

const CHANGEMENT = "2026-11-01";

describe("obsolescenceFraiche", () => {
  it("le délai est de 14 jours (§11)", () => {
    expect(DELAI_FRAICHEUR_JOURS).toBe(14);
  });

  it("gel à J+13 : fraîche", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-14T00:00:00Z")).toBe(true);
  });

  it("gel à J+14 pile, minuit UTC : non fraîche (« strictement antérieure »)", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-15T00:00:00Z")).toBe(false);
  });

  it("le dernier instant avant J+14 minuit UTC est encore frais", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-14T23:59:59.999Z")).toBe(true);
  });

  it("fuseaux : le 15 à 00:30 à Paris est le 14 à 23:30 UTC, donc frais", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-15T00:30:00+01:00")).toBe(true);
  });

  it("fuseaux : le 14 à 23:30 en UTC-01:00 est le 15 à 00:30 UTC, donc non frais", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-14T23:30:00-01:00")).toBe(false);
  });

  it("deux écritures du même instant donnent la même réponse", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-15T01:00:00+01:00")).toBe(obsolescenceFraiche(CHANGEMENT, "2026-11-15T00:00:00Z"));
  });

  it("gel le jour même du changement : frais", () => {
    expect(obsolescenceFraiche(CHANGEMENT, "2026-11-01T00:00:00Z")).toBe(true);
  });

  it("un gel sans décalage horaire est refusé, jamais lu dans le fuseau de la machine", () => {
    expect(() => obsolescenceFraiche(CHANGEMENT, "2026-11-14T00:00:00")).toThrow(/décalage/);
  });

  it("une date de changement illisible est refusée", () => {
    expect(() => obsolescenceFraiche("2026-13-45", "2026-11-14T00:00:00Z")).toThrow(/illisible/);
  });
});

/** D27 (C) : la fraîcheur se calcule depuis les items soumis, pour un juge comme pour un humain. */
describe("fraicheurDesItems", () => {
  const O = (date_changement: string) => ({ obsolescence: { date_changement } });
  const P = { obsolescence: undefined };
  const GEL_J14 = "2026-11-15T00:00:00Z";

  it("sans drapeau obsolescence : sans objet, aucune date lue", () => {
    expect(fraicheurDesItems(["deformation"], [P], GEL_J14)).toEqual({ statut: "sans_objet" });
  });

  it("item O à J+14 pile : calculée, non fraîche (borne de fraicheur.ts)", () => {
    expect(fraicheurDesItems(["obsolescence"], [P, O(CHANGEMENT)], GEL_J14)).toEqual({ statut: "calculee", fraiche: false });
  });

  it("item O à J+13 : calculée, fraîche", () => {
    expect(fraicheurDesItems(["obsolescence"], [O(CHANGEMENT)], "2026-11-14T00:00:00Z")).toEqual({ statut: "calculee", fraiche: true });
  });

  it("deux items O de même date : une seule date, calculée", () => {
    expect(fraicheurDesItems(["obsolescence"], [O(CHANGEMENT), O(CHANGEMENT)], GEL_J14)).toEqual({ statut: "calculee", fraiche: false });
  });

  it("drapeau sans item O : la date du changement manque, jamais supposée", () => {
    expect(fraicheurDesItems(["obsolescence"], [P], GEL_J14)).toEqual({ statut: "sans_item_o" });
  });

  it("deux items O de dates différentes : ambiguë, jamais une date choisie", () => {
    expect(fraicheurDesItems(["obsolescence"], [O(CHANGEMENT), O("2026-10-01")], GEL_J14)).toEqual({ statut: "ambigue", dates: [CHANGEMENT, "2026-10-01"] });
  });

  it("trois items O sur deux dates : ambiguë, chaque date une seule fois, dans l'ordre des items", () => {
    expect(fraicheurDesItems(["obsolescence"], [O("2026-10-01"), O(CHANGEMENT), O("2026-10-01")], GEL_J14)).toEqual({ statut: "ambigue", dates: ["2026-10-01", CHANGEMENT] });
  });

  // D74 (25) : la date du changement est une date civile (commun#/$defs/date_civile), d'une seule
  // graphie. Deux écritures du même jour ne se comparent pas : une graphie hors AAAA-MM-JJ est
  // refusée avant toute comparaison, jamais lue comme une seconde date ni rapprochée de la première.
  for (const graphie of ["2026-11-1", "2026-11-01T00:00:00Z", " 2026-11-01", "01/11/2026"]) {
    it(`même jour écrit « ${graphie} » à côté de « ${CHANGEMENT} » : refusé (DateCivileInvalide), ni ambiguë ni calculée`, () => {
      expect(() => fraicheurDesItems(["obsolescence"], [O(CHANGEMENT), O(graphie)], GEL_J14)).toThrow(DateCivileInvalide);
    });
  }

  it("une seule date illisible est refusée de même", () => {
    expect(() => fraicheurDesItems(["obsolescence"], [O("2026-02-30")], GEL_J14)).toThrow(DateCivileInvalide);
  });

  it("sans drapeau obsolescence, aucune date n'est lue, même illisible", () => {
    expect(fraicheurDesItems(["deformation"], [O("2026-11-1")], GEL_J14)).toEqual({ statut: "sans_objet" });
  });
});
