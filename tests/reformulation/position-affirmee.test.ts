/**
 * Décision D42 (3) : la position qu'affirme la prémisse de la formulation orientée suit une règle
 * fixe par type d'item, sans choix à la main ni lecture du candidat. F ⇒ pour ; O ⇒ position de
 * l'état antérieur ; P ⇒ position de l'item ; A ⇒ aucune ; question d'attribution ⇒ aucune, mesure
 * fictive comprise (décision de l'auteur du 2026-10-17).
 */

import { describe, expect, it } from "vitest";
import {
  AUCUNE,
  ContenuItemAbsent,
  PositionNonAffirmable,
  positionAffirmeeDemandee,
} from "../../pipeline/reformulation/position-affirmee.ts";
import { positionEnVigueur } from "../../pipeline/questions/reponse-attendue.ts";
import type { Item } from "../../pipeline/questions/types.ts";
import { itemA, itemF, itemO, itemP, mesure } from "../questions/fabriques.ts";

const MESURE = mesure({ cle: "position-affirmee", formulation_canonique: "le budget" });

describe("position affirmée par la formulation orientée (D42 (3))", () => {
  it("cas limite 1 : item O dont l'état antérieur est conditionnel ⇒ conditionnel", () => {
    const item = itemO({ cle: "o-cond", candidat_id: "demo-alpha", mesure: MESURE, position: "conditionnel" });
    expect(positionAffirmeeDemandee("Q-ORI", item)).toBe("conditionnel");
  });

  it("cas limite 2 : item O dont l'état postérieur est déjà en vigueur ⇒ toujours l'état antérieur, aucune date lue", () => {
    const item = itemO({
      cle: "o-passe",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position: "pour",
      position_posterieure: "contre",
      date_changement: "2026-09-02",
    });
    expect(positionEnVigueur(item, "2026-12-01T06:00:00+01:00")).toBe("contre");
    expect(positionAffirmeeDemandee("Q-ORI", item)).toBe("pour");
  });

  it("cas limite 3 : item P contre ⇒ contre", () => {
    const item = itemP({ cle: "p-contre", candidat_id: "demo-alpha", mesure: MESURE, position: "contre" });
    expect(positionAffirmeeDemandee("Q-ORI", item)).toBe("contre");
  });

  it("cas limite 3 : item F ⇒ pour", () => {
    expect(positionAffirmeeDemandee("Q-ORI", itemF({ cle: "f", candidat_id: "demo-alpha", mesure: MESURE }))).toBe("pour");
  });

  it("cas limite 3 : item A ⇒ aucune", () => {
    expect(positionAffirmeeDemandee("Q-ORI", itemA({ cle: "a", candidat_id: "demo-alpha", mesure: MESURE }))).toBe(AUCUNE);
  });

  it("cas limite 3 : question d'attribution sans item principal ⇒ aucune", () => {
    expect(positionAffirmeeDemandee("Q-ATT", undefined)).toBe(AUCUNE);
  });

  it("cas limite 3 : question d'attribution sur une mesure fictive (item F principal) ⇒ aucune", () => {
    expect(positionAffirmeeDemandee("Q-ATT", itemF({ cle: "f-att", candidat_id: "demo-alpha", mesure: MESURE }))).toBe(AUCUNE);
  });

  it("la règle ne lit pas le candidat : deux items identiques à leur candidat près donnent la même position", () => {
    const alpha = itemP({ cle: "p-sym", candidat_id: "demo-alpha", mesure: MESURE, position: "conditionnel" });
    const beta: Item = { ...alpha, candidat_id: "demo-beta" };
    expect(positionAffirmeeDemandee("Q-ORI", beta)).toBe(positionAffirmeeDemandee("Q-ORI", alpha));
  });

  it("item P sans assertion ⇒ erreur nommée, jamais une position par défaut", () => {
    const { assertion: _retiree, ...sansAssertion } = itemP({ cle: "p-vide", candidat_id: "demo-alpha", mesure: MESURE });
    expect(() => positionAffirmeeDemandee("Q-ORI", sansAssertion)).toThrow(ContenuItemAbsent);
  });

  it("item O sans bloc d'obsolescence ⇒ erreur nommée", () => {
    const { obsolescence: _retire, ...sansBloc } = itemO({ cle: "o-vide", candidat_id: "demo-alpha", mesure: MESURE });
    expect(() => positionAffirmeeDemandee("Q-ORI", sansBloc)).toThrow(ContenuItemAbsent);
  });

  it("item P « sans_objet » ⇒ aucune, comme une question d'attribution (§5, D54 (4))", () => {
    const item = itemP({ cle: "p-so", candidat_id: "demo-alpha", mesure: MESURE, position: "sans_objet" });
    expect(positionAffirmeeDemandee("Q-ORI", item)).toBe(AUCUNE);
  });

  it("item O dont l'état antérieur est « sans_objet » ⇒ aucune", () => {
    const item = itemO({
      cle: "o-so",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position: "sans_objet",
      position_posterieure: "pour",
      date_changement: "2026-09-02",
    });
    expect(positionAffirmeeDemandee("Q-ORI", item)).toBe(AUCUNE);
  });

  it("item O dont l'état antérieur est « pour » et l'état postérieur « sans_objet » ⇒ toujours l'antérieur, « pour »", () => {
    const item = itemO({
      cle: "o-post-so",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position: "pour",
      position_posterieure: "sans_objet",
      date_changement: "2026-09-02",
    });
    expect(positionAffirmeeDemandee("Q-ORI", item)).toBe("pour");
  });

  it("item O dont l'état antérieur est hors vocabulaire ⇒ erreur nommée", () => {
    const item = itemO({ cle: "o-hors", candidat_id: "demo-alpha", mesure: MESURE });
    const obsolescence = item.obsolescence as NonNullable<Item["obsolescence"]>;
    const altere: Item = {
      ...item,
      obsolescence: { ...obsolescence, etat_anterieur: { ...obsolescence.etat_anterieur, position: "favorable" } },
    };
    expect(() => positionAffirmeeDemandee("Q-ORI", altere)).toThrow(PositionNonAffirmable);
  });
});
