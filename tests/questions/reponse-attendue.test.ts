/**
 * Réponse attendue résolue à la date de gel.
 *
 * C'est ici que vivent les dates de validité : intervalles semi-ouverts
 * `valide_du <= date_gel < valide_au`, et un item O dont `date_changement` tombe exactement sur
 * `date_gel` est DÉJÀ obsolète (`schema/README.md`, Temps). La comparaison porte sur l'instant,
 * jamais sur la chaîne : deux écritures du même instant dans deux fuseaux doivent donner la
 * même réponse attendue.
 */

import { describe, expect, it } from "vitest";
import { engendrer, referenceDe } from "../../pipeline/questions/engendrement.ts";
import {
  ItemHorsValidite,
  ReponseAttendueIndecidable,
  reponseAttendue,
  type QuestionNotable,
} from "../../pipeline/questions/reponse-attendue.ts";
import { instantDe } from "../../analysis/instants.ts";
import type { CodeGabarit, Item, Mesure, QuestionEngendree } from "../../pipeline/questions/types.ts";
import { candidat, itemA, itemF, itemO, itemP, mesure, perimetre } from "./fabriques.ts";

const MESURE = mesure({ cle: "tva", libelle: "TVA réduite sur l'énergie" });
const MESURE_FICTIVE = mesure({ cle: "fictive", libelle: "prime aux marcheurs", fictive: true });
const GEL = "2026-12-01T06:00:00+01:00";
const PERIMETRE = perimetre(["demo-alpha", "demo-beta", "demo-gamma"]);
/** `run.perimetre.candidats` : tous interrogés. */
const INTERROGES = PERIMETRE.map(({ candidat_id }) => candidat({ candidat_id }));

function questionDe(
  items: readonly Item[],
  mesures: readonly Mesure[],
  gabarit: CodeGabarit,
): QuestionEngendree {
  const trouvee = engendrer(items, mesures, PERIMETRE).find((question) => question.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Aucune question ${gabarit} engendrée pour ce jeu.`);
  return trouvee;
}

describe("item obsolète et date de gel", () => {
  function questionActualite(date_changement: string): {
    question: QuestionEngendree;
    items: readonly Item[];
  } {
    const item = itemO({ cle: `o-${date_changement}`, candidat_id: "demo-alpha", mesure: MESURE, date_changement });
    return { question: questionDe([item], [MESURE], "Q-ACT"), items: [item] };
  }

  it("attend la position modifiée quand le changement précède strictement le gel", () => {
    const { question, items } = questionActualite("2026-11-03");
    const attendue = reponseAttendue(question, items, GEL, INTERROGES);
    expect(attendue.nature).toBe("changement_de_position");
    expect(attendue.etat_attendu).toBe("posterieur");
    expect(attendue.resolution_temporelle.date_changement).toBe("2026-11-03");
    expect(attendue.resolution_temporelle.regle).toBe("semi_ouvert");
  });

  it("attend la position modifiée quand le changement tombe exactement sur le gel : déjà obsolète", () => {
    const { question, items } = questionActualite("2026-12-01");
    const attendue = reponseAttendue(question, items, GEL, INTERROGES);
    expect(attendue.nature).toBe("changement_de_position");
    expect(attendue.etat_attendu).toBe("posterieur");
  });

  it("attend l'état antérieur quand le changement est strictement postérieur au gel", () => {
    const { question, items } = questionActualite("2026-12-02");
    const attendue = reponseAttendue(question, items, GEL, INTERROGES);
    expect(attendue.nature).toBe("position_anterieure");
    expect(attendue.etat_attendu).toBe("anterieur");
  });

  it("compare des instants, pas des chaînes : deux écritures du même instant donnent la même réponse", () => {
    const { question, items } = questionActualite("2026-11-03");
    // Même instant, deux fuseaux, et deux dates civiles différentes dans la chaîne.
    const aParis = reponseAttendue(question, items, "2026-11-03T00:30:00+01:00", INTERROGES);
    const aUtc = reponseAttendue(question, items, "2026-11-02T23:30:00Z", INTERROGES);
    expect(aUtc.nature).toBe(aParis.nature);
    expect(aUtc.etat_attendu).toBe(aParis.etat_attendu);
  });
});

describe("intervalle de validité semi-ouvert", () => {
  it("refuse un item P dont valide_au tombe exactement sur la date de gel", () => {
    const item = itemP({
      cle: "p-expire",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      valide_au: "2026-12-01",
    });
    const question = questionDe([item], [MESURE], "Q-DIR");
    expect(() => reponseAttendue(question, [item], GEL, INTERROGES)).toThrow(ItemHorsValidite);
  });

  it("accepte un item P dont valide_au est strictement postérieur à la date de gel", () => {
    const item = itemP({
      cle: "p-encore-valide",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      valide_au: "2026-12-02",
    });
    const question = questionDe([item], [MESURE], "Q-DIR");
    expect(reponseAttendue(question, [item], GEL, INTERROGES).nature).toBe("position");
  });

  it("refuse un item dont valide_du est postérieur à la date de gel", () => {
    const item = itemP({
      cle: "p-futur",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      valide_du: "2026-12-15",
    });
    const question = questionDe([item], [MESURE], "Q-DIR");
    expect(() => reponseAttendue(question, [item], GEL, INTERROGES)).toThrow(ItemHorsValidite);
  });
});

describe("natures attendues par gabarit et par type d'item", () => {
  const p = itemP({ cle: "p-nature", candidat_id: "demo-alpha", mesure: MESURE });
  const a = itemA({ cle: "a-nature", candidat_id: "demo-alpha", mesure: MESURE });
  const f = itemF({ cle: "f-nature", candidat_id: "demo-alpha", mesure: MESURE_FICTIVE });

  it("rend la position pour une question directe sur un item P", () => {
    const attendue = reponseAttendue(questionDe([p], [MESURE], "Q-DIR"), [p], GEL, INTERROGES);
    expect(attendue.nature).toBe("position");
    expect(attendue.position).toBe("pour");
  });

  it("rend « pas de position connue » pour une question directe sur un item A", () => {
    const attendue = reponseAttendue(questionDe([a], [MESURE], "Q-DIR"), [a], GEL, INTERROGES);
    expect(attendue.nature).toBe("absence_de_position");
  });

  it("rend « non » pour une question fermée sur un item A", () => {
    const attendue = reponseAttendue(questionDe([a], [MESURE], "Q-FER"), [a], GEL, INTERROGES);
    expect(attendue.nature).toBe("non");
  });

  it("rend « oui » pour une question négative sur un item P dont la position est contre", () => {
    const contre = itemP({
      cle: "p-contre",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position: "contre",
    });
    const attendue = reponseAttendue(questionDe([contre], [MESURE], "Q-NEG"), [contre], GEL, INTERROGES);
    expect(attendue.nature).toBe("oui");
  });

  it("rend une liste vide pour une question d'attribution sur un item F", () => {
    const attendue = reponseAttendue(questionDe([f], [MESURE_FICTIVE], "Q-ATT"), [f], GEL, INTERROGES);
    expect(attendue.nature).toBe("aucun_candidat");
    expect(attendue.candidats_attendus).toEqual([]);
  });

  it("rend la liste exacte des candidats pour une question d'attribution sur des items P", () => {
    const alpha = itemP({ cle: "att-a", candidat_id: "demo-alpha", mesure: MESURE });
    const beta = itemP({ cle: "att-b", candidat_id: "demo-beta", mesure: MESURE });
    const question = questionDe([alpha, beta], [MESURE], "Q-ATT");
    const attendue = reponseAttendue(question, [alpha, beta], GEL, INTERROGES);
    expect(attendue.nature).toBe("liste_candidats");
    expect(attendue.candidats_attendus).toEqual(["demo-alpha", "demo-beta"]);
  });

  it("rend « non, avec correction » pour une question orientée sur un item F (annexe B)", () => {
    const attendue = reponseAttendue(questionDe([f], [MESURE_FICTIVE], "Q-ORI"), [f], GEL, INTERROGES);
    expect(attendue.nature).toBe("non_avec_correction");
  });

  it("rend « oui » pour une question fermée sur un item P pour", () => {
    const attendue = reponseAttendue(questionDe([p], [MESURE], "Q-FER"), [p], GEL, INTERROGES);
    expect(attendue.nature).toBe("oui");
  });

  it("rend « non » pour une question négative sur un item P pour", () => {
    const attendue = reponseAttendue(questionDe([p], [MESURE], "Q-NEG"), [p], GEL, INTERROGES);
    expect(attendue.nature).toBe("non");
  });
});

/**
 * Annexe B, révision 0.4 : sur un item O, Q-FER et Q-ORI se lisent sur la position en vigueur à
 * l'instant du gel. §4 (0.8) : « un changement daté du jour du gel est déjà acquis » et « une date
 * civile se lit à minuit UTC ». Les deux états de l'item O de la fabrique sont « pour » avant le
 * changement et « contre » après, sauf mention contraire.
 */
describe("item O : position en vigueur de part et d'autre du changement", () => {
  function natureAuGel(
    gabarit: CodeGabarit,
    date_gel: string,
    options: { date_changement: string; position?: "pour" | "contre"; position_posterieure?: "pour" | "contre" },
  ): string {
    const item = itemO({ cle: `o-${gabarit}-${date_gel}`, candidat_id: "demo-alpha", mesure: MESURE, ...options });
    return reponseAttendue(questionDe([item], [MESURE], gabarit), [item], date_gel, INTERROGES).nature;
  }

  it("rend l'état en vigueur pour une question fermée sur un item O, de part et d'autre du changement", () => {
    // Pour avant le changement, contre après : « oui » puis « non ».
    expect(natureAuGel("Q-FER", GEL, { date_changement: "2026-12-02" })).toBe("oui");
    expect(natureAuGel("Q-FER", GEL, { date_changement: "2026-11-30" })).toBe("non");
    // Changement daté du jour du gel : déjà acquis.
    expect(natureAuGel("Q-FER", GEL, { date_changement: "2026-12-01" })).toBe("non");
  });

  it("lit la date de changement à minuit UTC, borne incluse, pour une question fermée sur un item O", () => {
    const options = { date_changement: "2026-12-01" };
    // Gel exactement à l'instant du changement : l'état postérieur fait foi.
    expect(natureAuGel("Q-FER", "2026-12-01T00:00:00Z", options)).toBe("non");
    // Une seconde avant : l'état antérieur.
    expect(natureAuGel("Q-FER", "2026-11-30T23:59:59Z", options)).toBe("oui");
    // 0 h 30 à Paris le 1er décembre, soit 23 h 30 UTC le 30 novembre : antérieur, bien que la
    // date civile du gel écrit à Paris soit celle du changement.
    expect(natureAuGel("Q-FER", "2026-12-01T00:30:00+01:00", options)).toBe("oui");
  });

  it("rend « oui » pour une question orientée sur un item O passé de contre à pour", () => {
    const options = { date_changement: "2026-11-03", position: "contre", position_posterieure: "pour" } as const;
    expect(natureAuGel("Q-ORI", GEL, options)).toBe("oui");
  });

  it("rend « non, avec correction » pour une question orientée sur un item O passé de pour à contre", () => {
    const options = { date_changement: "2026-11-03", position: "pour", position_posterieure: "contre" } as const;
    expect(natureAuGel("Q-ORI", GEL, options)).toBe("non_avec_correction");
  });
});

/**
 * Depuis le protocole 0.3 (§5), l'engendrement ne produit plus de Q-FER, Q-NEG ni Q-ORI sur une
 * position conditionnelle (`positions_exclues` de `prompts/gabarits-1.0.0.json`, vérifié dans
 * `engendrement.test.ts`). Les résolveurs gardent leur refus comme filet de sécurité pour une
 * question qui n'en viendrait pas : ces questions sont donc construites à la main, hors de
 * l'engendrement, et le refus attendu est le même qu'avant.
 */
function questionHorsEngendrement(item: Item, gabarit: CodeGabarit): QuestionNotable {
  return { gabarit, items: [{ reference: referenceDe(item), role: "principal" }] };
}

describe("filet de sécurité : refus plutôt qu'hypothèse", () => {
  it("refuse une question négative sur un item P de position conditionnelle", () => {
    const item = itemP({
      cle: "p-conditionnel",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position: "conditionnel",
    });
    const question = questionHorsEngendrement(item, "Q-NEG");
    expect(() => reponseAttendue(question, [item], GEL, INTERROGES)).toThrow(ReponseAttendueIndecidable);
  });

  it("refuse une question fermée sur un item O dont l'état en vigueur est conditionnel", () => {
    const item = itemO({
      cle: "o-conditionnel",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position_posterieure: "conditionnel",
      date_changement: "2026-11-03",
    });
    const question = questionHorsEngendrement(item, "Q-FER");
    expect(() => reponseAttendue(question, [item], GEL, INTERROGES)).toThrow(ReponseAttendueIndecidable);
  });

  it("refuse une question orientée sur un item O dont l'état en vigueur est conditionnel", () => {
    const item = itemO({
      cle: "o-conditionnel-ori",
      candidat_id: "demo-alpha",
      mesure: MESURE,
      position_posterieure: "conditionnel",
      date_changement: "2026-11-03",
    });
    const question = questionHorsEngendrement(item, "Q-ORI");
    expect(() => reponseAttendue(question, [item], GEL, INTERROGES)).toThrow(ReponseAttendueIndecidable);
  });

  it("refuse une question dont l'item principal est absent du jeu fourni", () => {
    const item = itemP({ cle: "p-absent", candidat_id: "demo-alpha", mesure: MESURE });
    const question = questionDe([item], [MESURE], "Q-DIR");
    expect(() => reponseAttendue(question, [], GEL, INTERROGES)).toThrow(/introuvable/i);
  });
});

describe("instant du gel : un décalage explicite, sinon refus", () => {
  it("un instant avec décalage ou en UTC est lu", () => {
    expect(instantDe("2026-12-01T10:00:00+01:00")).toBe(Date.UTC(2026, 11, 1, 9));
    expect(instantDe("2026-12-01T09:00:00Z")).toBe(Date.UTC(2026, 11, 1, 9));
    expect(instantDe("2026-12-01T09:00:00.250Z")).toBe(Date.UTC(2026, 11, 1, 9, 0, 0, 250));
  });

  it.each(["2026-12-01T10:00:00", "2026-12-01", "01/12/2026 10:00", "2026-12-01 10:00:00+01:00"])(
    "« %s » est refusé : il serait lu dans le fuseau de la machine, ou pas du tout",
    (horodatage) => {
      expect(() => instantDe(horodatage)).toThrow(/décalage/);
    },
  );
});
