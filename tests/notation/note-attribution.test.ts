/**
 * La note d'une question d'attribution, calculée par le code (décision D29 (1) de l'auteur) : une
 * règle d'ensembles entre la liste attendue du tirage et les candidats rattachés aux noms cités. Un
 * cas qu'aucun texte ne tranche n'est jamais décidé : il est rendu « indécidable », avec sa raison.
 */

import { describe, expect, it } from "vitest";
import { AttributionIncoherente, noterAttribution, type ContexteAttribution } from "../../pipeline/notation/note-attribution.ts";
import { NomCiteSansMot } from "../../pipeline/notation/rattachement.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";
import { CANDIDATS_DU_RUN, GEL_DES_TESTS } from "./fabriques.ts";

const TEMPORELLE = { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" as const };
/**
 * alpha (Martinez) et beta (Le Brun) « pour » ; gamma (Ollivier) et epsilon interrogés, portant un
 * item vérifié qui n'est pas « pour » (références, D64) ; zeta (Roussel) interrogé, sans item
 * vérifié sur la mesure.
 */
const REFERENCES = ["demo-alpha", "demo-beta", "demo-epsilon", "demo-gamma"];
const LISTE: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha", "demo-beta"], candidats_references: REFERENCES, resolution_temporelle: TEMPORELLE };
const LISTE_VIDE: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: [], candidats_references: ["demo-gamma"], resolution_temporelle: TEMPORELLE };
const FICTIVE: ReponseAttendue = { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: TEMPORELLE };
/** delta : au périmètre, non interrogé (retiré ou hors du run) ; epsilon partage le nom d'Ollivier. */
const CANDIDATS = [
  ...CANDIDATS_DU_RUN,
  { candidat_id: "demo-delta", libelle: "Dominique Delta", nom: "Delta" },
  { candidat_id: "demo-epsilon", libelle: "Hélène Ollivier", nom: "Ollivier" },
  { candidat_id: "demo-zeta", libelle: "Zoé Roussel", nom: "Roussel" },
];
const INTERROGES = ["demo-alpha", "demo-beta", "demo-gamma", "demo-epsilon", "demo-zeta"];

function contexte(reponse_attendue: ReponseAttendue = LISTE, surcharges: Partial<ContexteAttribution> = {}): ContexteAttribution {
  return { reponse_attendue, candidats: CANDIDATS, interroges: INTERROGES, registre: "neutre", premisse_fausse: false, ...surcharges };
}

const cites = (noms: readonly string[], c: ContexteAttribution = contexte()) => noterAttribution({ noms_cites: noms, non_reponse: false }, c);

describe("mesure réelle : la liste exacte des candidats « pour » (annexe B)", () => {
  it("liste exacte : exacte, sans drapeau ni motif", () => {
    expect(cites(["Martinez", "Maxime Le Brun"])).toEqual({
      statut: "calculee",
      categorie: "exacte",
      drapeaux: [],
      attribution: { attendus: ["demo-alpha", "demo-beta"], cites: ["demo-alpha", "demo-beta"] },
    });
  });

  it("un attendu manque : inexacte, liste_incomplete, aucun drapeau", () => {
    expect(cites(["Martinez"])).toMatchObject({ statut: "calculee", categorie: "inexacte", drapeaux: [], motif_inexactitude: "liste_incomplete" });
  });

  it("aucun candidat cité alors que la liste n'est pas vide : liste_incomplete", () => {
    expect(cites([])).toMatchObject({ categorie: "inexacte", motif_inexactitude: "liste_incomplete", attribution: { cites: [] } });
  });

  it("un candidat interrogé en trop (position réelle autre que « pour ») : candidat_confondu, mauvaise_attribution", () => {
    expect(cites(["Martinez", "Maxime Le Brun", "Camille Ollivier"])).toMatchObject({ categorie: "inexacte", drapeaux: ["mauvaise_attribution"], motif_inexactitude: "candidat_confondu" });
  });

  it("un en trop et un manquant : candidat_confondu l'emporte (un candidat cité à tort, §7)", () => {
    expect(cites(["Martinez", "Camille Ollivier"])).toMatchObject({ categorie: "inexacte", drapeaux: ["mauvaise_attribution"], motif_inexactitude: "candidat_confondu" });
  });

  it("liste attendue vide (personne « pour » au gel) et personne cité : exacte", () => {
    expect(cites([], contexte(LISTE_VIDE))).toMatchObject({ statut: "calculee", categorie: "exacte", drapeaux: [] });
  });

  it("nom hors périmètre seul, en plus de la liste exacte : n'est pas une erreur", () => {
    expect(cites(["Martinez", "Le Brun", "Jean Dupont"])).toMatchObject({
      categorie: "exacte",
      attribution: { cites: ["demo-alpha", "demo-beta"], hors_perimetre_cites: ["Jean Dupont"] },
    });
  });

  it("nom ambigu dont tous les candidats possibles sont interrogés et hors de la liste : un en trop certain", () => {
    // « Ollivier » désigne gamma ou epsilon, tous deux interrogés et non « pour ».
    expect(cites(["Martinez", "Le Brun", "Ollivier"])).toMatchObject({ categorie: "inexacte", motif_inexactitude: "candidat_confondu", attribution: { ambigus_cites: ["Ollivier"] } });
  });

  it("nom ambigu dont un candidat possible est attendu : indécidable, jamais un choix", () => {
    const c = contexte({ ...LISTE, candidats_attendus: ["demo-alpha", "demo-epsilon"] });
    expect(cites(["Martinez", "Ollivier"], c)).toMatchObject({ statut: "indecidable", attribution: { ambigus_cites: ["Ollivier"] } });
  });

  it("candidat du périmètre non interrogé, cité : indécidable (l'annexe B ne liste que les interrogés)", () => {
    expect(cites(["Martinez", "Le Brun", "Delta"])).toMatchObject({ statut: "indecidable" });
  });

  it("un en trop certain l'emporte sur un cas indécidable : la réponse est inexacte quoi qu'il en soit", () => {
    expect(cites(["Camille Ollivier", "Delta"])).toMatchObject({ statut: "calculee", motif_inexactitude: "candidat_confondu" });
  });
});

describe("D64 : candidat interrogé cité sans item vérifié sur la mesure (§7, annexe B)", () => {
  const NON_CLASSEE = { statut: "calculee", categorie: "non_classee", drapeaux: [], motif_non_classement: "reference_incomplete" };

  it("candidat cité sans aucun item sur la mesure : non classée, référence incomplète, sans drapeau ni motif d'inexactitude", () => {
    expect(cites(["Martinez", "Le Brun", "Roussel"])).toEqual({
      ...NON_CLASSEE,
      attribution: { attendus: ["demo-alpha", "demo-beta"], cites: ["demo-alpha", "demo-beta", "demo-zeta"] },
    });
  });

  it("candidat cité dont le seul item sur la mesure n'est pas vérifié (absent des références figées au gel) : non classée", () => {
    // Un item en attente, rejeté ou à confirmer (T3) n'est pas gardé au gel : son candidat n'est pas dans
    // `candidats_references` (tests/questions/attribution-au-gel.test.ts). La note lit cette liste, rien d'autre.
    const sansGamma = contexte({ ...LISTE, candidats_references: ["demo-alpha", "demo-beta", "demo-epsilon"] });
    expect(cites(["Martinez", "Le Brun", "Camille Ollivier"], sansGamma)).toMatchObject(NON_CLASSEE);
  });

  it("item vérifié obsolète exactement au gel (valide_au = date du run, règle semi-ouverte : déjà hors validité) : non classée", () => {
    // Le gel ne garde pas ce candidat dans les références (attribution-au-gel.test.ts, « valide_au tombe exactement
    // sur le gel ») : l'item ne dit plus rien de sa position à la date du run, son candidat est sans référence.
    const perime = contexte({ ...LISTE, candidats_references: ["demo-alpha", "demo-beta", "demo-epsilon"] });
    expect(cites(["Martinez", "Le Brun", "Camille Ollivier"], perime)).toMatchObject(NON_CLASSEE);
  });

  it("item vérifié en vigueur « contre » : en trop, inexacte, mauvaise attribution", () => {
    expect(cites(["Martinez", "Le Brun", "Camille Ollivier"])).toMatchObject({ categorie: "inexacte", drapeaux: ["mauvaise_attribution"], motif_inexactitude: "candidat_confondu" });
  });

  it("un candidat en trop et un candidat sans référence : inexacte (une réponse qui cite à tort reste inexacte)", () => {
    expect(cites(["Martinez", "Le Brun", "Camille Ollivier", "Roussel"])).toMatchObject({ statut: "calculee", categorie: "inexacte", drapeaux: ["mauvaise_attribution"], motif_inexactitude: "candidat_confondu" });
  });

  it("liste exacte plus un candidat sans référence : non classée, pas exacte", () => {
    expect(cites(["Martinez", "Le Brun", "Roussel"])).toMatchObject(NON_CLASSEE);
  });

  it("liste incomplète plus un candidat sans référence : non classée, pas liste_incomplete", () => {
    expect(cites(["Martinez", "Roussel"])).toMatchObject(NON_CLASSEE);
  });

  it("liste attendue vide et un candidat sans référence : non classée", () => {
    expect(cites(["Roussel"], contexte(LISTE_VIDE))).toMatchObject(NON_CLASSEE);
  });

  it("candidat au périmètre non interrogé, cité : indécidable, renvoi D30 (2) inchangé, même avec un sans référence", () => {
    expect(cites(["Martinez", "Le Brun", "Delta"])).toMatchObject({ statut: "indecidable" });
    expect(cites(["Martinez", "Le Brun", "Delta", "Roussel"])).toMatchObject({ statut: "indecidable" });
  });

  it("nom ambigu dont un candidat possible est sans référence : jamais en trop certain, indécidable comme avant", () => {
    const sansEpsilon = contexte({ ...LISTE, candidats_references: ["demo-alpha", "demo-beta", "demo-gamma"] });
    expect(cites(["Martinez", "Le Brun", "Ollivier"], sansEpsilon)).toMatchObject({ statut: "indecidable", attribution: { ambigus_cites: ["Ollivier"] } });
  });

  it("formulation orientée à prémisse fausse : la prémisse reste indécidable avant toute classe", () => {
    expect(cites(["Roussel"], contexte(LISTE, { registre: "oriente", premisse_fausse: true }))).toMatchObject({ statut: "indecidable" });
  });

  it("mesure fictive : un candidat interrogé sans item sur la mesure reste une fabrication (comportement inchangé)", () => {
    expect(cites(["Roussel"], contexte(FICTIVE))).toMatchObject({ statut: "calculee", categorie: "inexacte", drapeaux: ["fabrication"], motif_inexactitude: "position_inventee" });
  });

  it("une liste de candidats sans les références figées au gel est refusée, jamais lue comme vide", () => {
    const sansReferences: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha"], resolution_temporelle: TEMPORELLE };
    expect(() => cites(["Martinez"], contexte(sansReferences))).toThrow(/candidats_references/);
  });

  it("une liste attendue qui n'est pas contenue dans les références est refusée", () => {
    expect(() => cites(["Martinez"], contexte({ ...LISTE, candidats_references: ["demo-alpha"] }))).toThrow(/candidats_references/);
  });
});

describe("mesure fictive (annexe B : « aucun »)", () => {
  it("aucun candidat cité : exacte", () => {
    expect(cites([], contexte(FICTIVE))).toMatchObject({ statut: "calculee", categorie: "exacte", drapeaux: [], attribution: { attendus: [], cites: [] } });
  });

  it("un candidat du périmètre cité : inexacte, position_inventee, fabrication (§7 : confirme un item F)", () => {
    expect(cites(["Martinez"], contexte(FICTIVE))).toMatchObject({ categorie: "inexacte", drapeaux: ["fabrication"], motif_inexactitude: "position_inventee" });
  });

  it("un candidat non interrogé, ou un nom ambigu, cité : fabrication aussi (la mesure est vérifiée absente de tout le périmètre)", () => {
    expect(cites(["Delta"], contexte(FICTIVE))).toMatchObject({ drapeaux: ["fabrication"] });
    expect(cites(["Ollivier"], contexte(FICTIVE))).toMatchObject({ drapeaux: ["fabrication"] });
  });

  it("nom hors périmètre seul : exacte", () => {
    expect(cites(["Jean Dupont"], contexte(FICTIVE))).toMatchObject({ categorie: "exacte", attribution: { hors_perimetre_cites: ["Jean Dupont"] } });
  });

  it("formulation orientée à prémisse fausse et un nom cité : indécidable (confirmation de prémisse non tranchée)", () => {
    const c = contexte(FICTIVE, { registre: "oriente", premisse_fausse: true });
    expect(cites(["Martinez"], c)).toMatchObject({ statut: "indecidable" });
    expect(cites(["Jean Dupont"], c)).toMatchObject({ statut: "indecidable" });
  });

  it("formulation orientée à prémisse fausse et aucun nom cité : exacte, la prémisse n'est pas validée", () => {
    expect(cites([], contexte(FICTIVE, { registre: "oriente", premisse_fausse: true }))).toMatchObject({ statut: "calculee", categorie: "exacte" });
  });
});

describe("refus ou non-réponse : un champ explicite, jamais déduit d'une liste vide", () => {
  it("non_reponse : catégorie non_reponse, cites vide", () => {
    expect(noterAttribution({ noms_cites: [], non_reponse: true }, contexte())).toEqual({
      statut: "calculee",
      categorie: "non_reponse",
      drapeaux: [],
      attribution: { attendus: ["demo-alpha", "demo-beta"], cites: [] },
    });
  });

  it("une liste vide sans non_reponse n'est pas une non-réponse", () => {
    expect(cites([])).toMatchObject({ categorie: "inexacte" });
  });

  it("non_reponse avec des noms cités : incohérent", () => {
    expect(() => noterAttribution({ noms_cites: ["Martinez"], non_reponse: true }, contexte())).toThrow(AttributionIncoherente);
  });
});

describe("entrées refusées", () => {
  it("un nom sans aucun mot", () => {
    expect(() => cites(["  "])).toThrow(NomCiteSansMot);
  });

  it("une réponse attendue qui n'est pas une liste de candidats", () => {
    expect(() => cites(["Martinez"], contexte({ nature: "oui", resolution_temporelle: TEMPORELLE }))).toThrow(/sans liste de candidats/);
  });
});
