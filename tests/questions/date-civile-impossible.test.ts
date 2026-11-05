/**
 * Date civile impossible (revue du 2026-10-12, constat 11) : `Date.parse` accepte un jour hors du
 * mois (`2027-02-29` glisse au 1er mars) sans lever. Une date de validité est du code de mesure :
 * une date impossible lue dans un item ou dans un run est refusée par une erreur nommée, jamais
 * ramenée au mois suivant. Une seule règle de date civile valide dans le dépôt
 * (`dateCivileValide`, `validation/domaine/validateurs-champ.ts`).
 */

import { describe, expect, it } from "vitest";
import {
  estEnVigueur,
  etatEnVigueur,
} from "../../pipeline/questions/reponse-attendue.ts";
import { DateCivileInvalide, instantDe, instantDeDateCivile } from "../../analysis/instants.ts";
import { itemP, mesure } from "./fabriques.ts";

const MESURE = mesure({ cle: "tva", libelle: "TVA réduite sur l'énergie" });

describe("instantDeDateCivile : une date impossible est refusée, jamais glissée", () => {
  it.each(["2027-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-1-1"])(
    "« %s » lève DateCivileInvalide",
    (date) => {
      expect(() => instantDeDateCivile(date)).toThrow(DateCivileInvalide);
    },
  );

  it("le message nomme la date refusée", () => {
    expect(() => instantDeDateCivile("2027-02-29")).toThrow(/2027-02-29/);
  });

  it("le 29 février d'une année bissextile est lu à minuit UTC", () => {
    expect(instantDeDateCivile("2028-02-29")).toBe(Date.UTC(2028, 1, 29));
  });
});

describe("dates de validité d'un item : refus nommé, bornes inchangées", () => {
  const GEL = "2027-03-01T00:00:00Z";

  it("un item dont valide_au est impossible est refusé, et non tenu pour expiré le 1er mars", () => {
    const item = itemP({ cle: "p-impossible", candidat_id: "demo-alpha", mesure: MESURE, valide_au: "2027-02-29" });
    expect(() => estEnVigueur(item, GEL)).toThrow(DateCivileInvalide);
  });

  it("un item dont valide_du est impossible est refusé", () => {
    const item = itemP({ cle: "p-impossible-du", candidat_id: "demo-alpha", mesure: MESURE, valide_du: "2026-04-31" });
    expect(() => estEnVigueur(item, GEL)).toThrow(DateCivileInvalide);
  });

  it("une date de changement impossible est refusée", () => {
    expect(() => etatEnVigueur("2027-02-29", GEL)).toThrow(DateCivileInvalide);
  });

  it("valide_du exactement au jour du gel : en vigueur ; valide_au exactement au jour du gel : expiré", () => {
    const gelBissextile = "2028-02-29T00:00:00Z";
    const debutCeJour = itemP({ cle: "p-debut", candidat_id: "demo-alpha", mesure: MESURE, valide_du: "2028-02-29" });
    const finCeJour = itemP({
      cle: "p-fin",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      valide_du: "2028-01-01",
      valide_au: "2028-02-29",
    });
    expect(estEnVigueur(debutCeJour, gelBissextile)).toBe(true);
    expect(estEnVigueur(finCeJour, gelBissextile)).toBe(false);
  });

  it("un changement exactement au jour du gel : l'état postérieur fait foi", () => {
    expect(etatEnVigueur("2028-02-29", "2028-02-29T00:00:00Z")).toBe("posterieur");
  });
});

describe("instantDe : la date civile d'un instant de gel suit la même règle", () => {
  it.each(["2027-02-29T10:00:00+01:00", "2026-04-31T00:00:00Z"])("« %s » lève DateCivileInvalide", (instant) => {
    expect(() => instantDe(instant)).toThrow(DateCivileInvalide);
  });

  it("un instant du 29 février bissextile est lu", () => {
    expect(instantDe("2028-02-29T10:00:00+01:00")).toBe(Date.UTC(2028, 1, 29, 9));
  });
});
