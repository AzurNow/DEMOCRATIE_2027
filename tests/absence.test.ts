/**
 * Items d'absence (§4, protocole 0.24, D59 (10) et (11)).
 *
 * (10) La recherche qui fonde un item A « ne trouve rien quand aucun item P ni O du candidat sur la
 * mesure n'est vérifié et que la double extraction, passée sur le corpus examiné, ne propose aucune
 * position du candidat sur la mesure ».
 *
 * (11) « Une nouvelle source T1 est une source T1 du candidat collectée après la dernière
 * revérification de l'item, ou, s'il n'a jamais été revérifié, après la date d'examen de son
 * corpus ; la revérification est confirmée par un seul annotateur. »
 */

import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../outils/schemas/valider.ts";
import {
  nouvellesSourcesT1,
  rechercheAbsence,
  type ExtractionPassee,
  type RechercheAbsence,
  type SourceCollectee,
} from "../validation/domaine/absence.ts";
import type { Item } from "../validation/domaine/types.ts";
import { itemA, itemO, itemP } from "./aides/fabriques.ts";

const CANDIDAT = "demo-alpha";
const MESURE = "01JBANCESSA90000000MESVRE1";
const AUTRE_MESURE = "01JBANCESSA90000000MESVRE7";
const SOURCE_CORPUS = "1".repeat(64);
const AUTRE_SOURCE_CORPUS = "4".repeat(64);

const EXTRAITE: ExtractionPassee = { sha256_source: SOURCE_CORPUS, statut: "extraite" };

function recherche(surcharges: Partial<RechercheAbsence> = {}): RechercheAbsence {
  return {
    candidat_id: CANDIDAT,
    mesure_id: MESURE,
    corpus_examine: [{ sha256: SOURCE_CORPUS }],
    items_publies: [],
    propositions: [],
    extractions: [EXTRAITE],
    ...surcharges,
  };
}

const verifie = (item: Item): Item => ({ ...item, statut_validation: "verifie" });

describe("recherche d'une absence (D59 (10))", () => {
  it("aucun item vérifié, double extraction passée sur tout le corpus sans proposition : la recherche ne trouve rien", () => {
    expect(rechercheAbsence(recherche())).toEqual({ issue: "aucune_position" });
  });

  it("un item P vérifié du candidat sur la mesure : position trouvée", () => {
    const item = verifie(itemP());
    expect(rechercheAbsence(recherche({ items_publies: [item] }))).toEqual({
      issue: "position_trouvee",
      items_verifies: [item.id],
      propositions: [],
    });
  });

  it("un item O vérifié du candidat sur la mesure : position trouvée", () => {
    const item = verifie(itemO());
    expect(rechercheAbsence(recherche({ items_publies: [item] })).issue).toBe("position_trouvee");
  });

  it("item P vérifié présent, item O seulement en staging : position trouvée, les deux sont nommés", () => {
    const publie = verifie(itemP());
    const propose = itemO({ id: "01JBANCESSA1000000001TEM0B" });
    expect(rechercheAbsence(recherche({ items_publies: [publie], propositions: [propose] }))).toEqual({
      issue: "position_trouvee",
      items_verifies: [publie.id],
      propositions: [propose.id],
    });
  });

  it("double extraction dont un seul extracteur propose une position (désaccord d'existence) : ce n'est pas une absence", () => {
    // Une proposition sans partenaire est déposée marquée « désaccord d'existence » (§4) : la
    // double extraction a proposé une position, la recherche ne peut donc pas conclure à l'absence.
    const proposition = itemP({ id: "01JBANCESSA1000000001TEM0C", statut_validation: "en_attente" });
    expect(rechercheAbsence(recherche({ propositions: [proposition] }))).toEqual({
      issue: "position_trouvee",
      items_verifies: [],
      propositions: [proposition.id],
    });
  });

  it("un item P du candidat sur la mesure, publié mais non vérifié (rejeté, non évaluable), n'est pas une position trouvée", () => {
    for (const statut of ["rejete", "non_evaluable"]) {
      const item = itemP({ statut_validation: statut });
      expect(rechercheAbsence(recherche({ items_publies: [item] })).issue, statut).toBe("aucune_position");
    }
  });

  it("un item vérifié d'un autre candidat, ou sur une autre mesure, n'entre pas dans la recherche", () => {
    const autreCandidat = verifie(itemP({ candidat_id: "demo-beta" }));
    const autreMesure = verifie(itemP({ id: "01JBANCESSA1000000001TEM0D", mesure_id: AUTRE_MESURE }));
    expect(rechercheAbsence(recherche({ items_publies: [autreCandidat, autreMesure] })).issue).toBe("aucune_position");
  });

  it("un item A vérifié sur la mesure n'est pas une position (seuls P et O comptent)", () => {
    const absence = verifie(itemA());
    expect(rechercheAbsence(recherche({ items_publies: [absence], propositions: [itemA()] })).issue).toBe("aucune_position");
  });

  it("une source du corpus sans double extraction : la recherche n'est pas faite, jamais « rien trouvé »", () => {
    const resultat = rechercheAbsence(
      recherche({ corpus_examine: [{ sha256: SOURCE_CORPUS }, { sha256: AUTRE_SOURCE_CORPUS }] }),
    );
    expect(resultat).toEqual({ issue: "extraction_incomplete", sources: [AUTRE_SOURCE_CORPUS] });
  });

  it("une source du corpus dont l'extraction est refusée (extraction non double) : extraction incomplète", () => {
    const resultat = rechercheAbsence(recherche({ extractions: [{ sha256_source: SOURCE_CORPUS, statut: "refusee" }] }));
    expect(resultat).toEqual({ issue: "extraction_incomplete", sources: [SOURCE_CORPUS] });
  });

  it("une position trouvée l'emporte sur une extraction incomplète : il n'y a pas d'absence, quoi qu'il manque", () => {
    const item = verifie(itemP());
    const resultat = rechercheAbsence(recherche({ items_publies: [item], extractions: [] }));
    expect(resultat.issue).toBe("position_trouvee");
  });
});

/* ------------------------------------------------------------------------- (11) */

function sourceCollectee(date_collecte: string, surcharges: Partial<SourceCollectee> = {}): SourceCollectee {
  return { candidat_id: CANDIDAT, tier: "T1", sha256: "5".repeat(64), date_collecte, ...surcharges };
}

function reverifie(item: Item, dates: readonly string[]): Item {
  const absence = item.absence as NonNullable<Item["absence"]>;
  return {
    ...item,
    absence: {
      ...absence,
      reverifications: dates.map((date) => ({
        run_id: "01JBANCESSA1RVN00000000001",
        date,
        resultat: "absence_confirmee" as const,
        confirme_par: "a1",
      })),
    },
  };
}

describe("nouvelle source T1 d'un item A (D59 (11))", () => {
  it("aucune revérification encore faite : la borne est la date d'examen du corpus", () => {
    const item = itemA(); // date_examen 2026-09-04T10:00:00+02:00
    const avant = sourceCollectee("2026-09-04T09:59:59+02:00", { sha256: "6".repeat(64) });
    const apres = sourceCollectee("2026-09-04T10:00:01+02:00", { sha256: "7".repeat(64) });
    expect(nouvellesSourcesT1(item, [avant, apres]).map((source) => source.sha256)).toEqual(["7".repeat(64)]);
  });

  it("après une revérification : la borne est la dernière revérification, plus la date d'examen", () => {
    const item = reverifie(itemA(), ["2026-10-01T12:00:00+02:00", "2026-10-08T12:00:00+02:00"]);
    const entreLesDeux = sourceCollectee("2026-10-05T12:00:00+02:00", { sha256: "6".repeat(64) });
    const apresLaDerniere = sourceCollectee("2026-10-09T12:00:00+02:00", { sha256: "7".repeat(64) });
    expect(nouvellesSourcesT1(item, [entreLesDeux, apresLaDerniere]).map((source) => source.sha256)).toEqual([
      "7".repeat(64),
    ]);
  });

  it("la dernière revérification est la plus tardive en instant, pas la dernière écrite ni la plus grande chaîne", () => {
    // Même instant que 2026-10-08T10:00:00Z ; comparées comme chaînes, les deux dates s'ordonneraient autrement.
    const item = reverifie(itemA(), ["2026-10-08T12:00:00+02:00", "2026-10-08T09:00:00Z"]);
    const entre = sourceCollectee("2026-10-08T09:30:00Z");
    expect(nouvellesSourcesT1(item, [entre])).toEqual([]);
  });

  it("source collectée exactement à l'instant de la dernière revérification : pas nouvelle (« après » est strict)", () => {
    const item = reverifie(itemA(), ["2026-10-08T12:00:00+02:00"]);
    const memeInstant = sourceCollectee("2026-10-08T10:00:00Z");
    expect(nouvellesSourcesT1(item, [memeInstant])).toEqual([]);
  });

  it("source collectée exactement à la date d'examen, sans revérification : pas nouvelle", () => {
    expect(nouvellesSourcesT1(itemA(), [sourceCollectee("2026-09-04T10:00:00+02:00")])).toEqual([]);
  });

  it("une source T2 ou T3, ou une source d'un autre candidat, n'est jamais une nouvelle source T1", () => {
    const tardive = "2026-12-01T00:00:00Z";
    const sources = [
      sourceCollectee(tardive, { tier: "T2" }),
      sourceCollectee(tardive, { tier: "T3" }),
      sourceCollectee(tardive, { candidat_id: "demo-beta" }),
    ];
    expect(nouvellesSourcesT1(itemA(), sources)).toEqual([]);
  });

  it("un item qui n'est pas un item A est refusé, nommé : la notion n'a de sens que pour une absence", () => {
    expect(() => nouvellesSourcesT1(itemP(), [])).toThrow(/01JBANCESSA1000000001TEM01/);
  });

  it("une date de collecte sans décalage horaire est refusée, jamais lue dans le fuseau de la machine", () => {
    expect(() => nouvellesSourcesT1(itemA(), [sourceCollectee("2026-12-01T00:00:00")])).toThrow();
  });
});

describe("revérification confirmée par un seul annotateur (D59 (11)) : forme du schéma", () => {
  it("une revérification porte un seul annotateur, et le schéma refuse une liste", () => {
    const item = reverifie(itemA(), ["2026-10-08T12:00:00+02:00"]);
    const absence = item.absence as NonNullable<Item["absence"]>;
    expect(absence.reverifications[0]?.confirme_par).toBe("a1");
    expect(erreurDeSchema("item", item, "test")).toBeNull();
    const deux = {
      ...item,
      absence: { ...absence, reverifications: [{ ...absence.reverifications[0], confirme_par: ["a1", "a2"] }] },
    };
    expect(erreurDeSchema("item", deux, "test")).not.toBeNull();
  });
});
