/**
 * Décision D32 de l'auteur (2026-10-10) : un refus de l'API (`reponse.normalise.refus_api`) n'est
 * pas envoyé aux juges ; le code inscrit de façon déterministe la catégorie `non_reponse` que D12
 * fixe d'avance, sans extrait justificatif, dans une notation par règle (`notateur.type: regle`).
 *
 * Cas limites du brief : refus sur un item P, A, F, O ; Q-ATT à items F seulement ; réponse sans
 * refus. Le schéma garde l'exigence d'extrait de l'annexe C entière pour un juge et pour un humain.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lireNote, sourcageDeNotation } from "../../analysis/note-lue.ts";
import { notationParRegle, PasUnRefusApi, REGLE_REFUS_API, type CadreNotationParRegle } from "../../pipeline/notation/regle-refus.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { itemA, itemF, itemO, itemP } from "../aides/fabriques.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "../analysis/fabriques.ts";
import { CANDIDATS_DU_RUN, GEL_DES_TESTS, notationHumaine, notationJuge, RUN_ID } from "./fabriques.ts";

const REFUS = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-03-api-obtenue-refus-api.json"), "utf8")) as ReponseObtenue;
const ORDINAIRE = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-01-api-obtenue.json"), "utf8")) as ReponseObtenue;

function references(...items: readonly Item[]): CadreNotationParRegle["references_item"] {
  return items.map((item) => ({ item_id: item.id, item_version: item.version, item_empreinte: item.empreinte }));
}

function cadre(surcharges: Partial<CadreNotationParRegle> = {}): CadreNotationParRegle {
  return {
    id: ulid("notation-regle"),
    run_id: RUN_ID,
    reponse: REFUS,
    gabarit: "Q-DIR",
    references_item: references(itemP()),
    attribution: null,
    date: "2026-12-04T10:00:00+01:00",
    ...surcharges,
  };
}

function schemaRefuse(notation: unknown): void {
  expect(() => valider("notation", notation, "notation de test")).toThrow(ErreurSchema);
}

describe("D32 : la notation par règle d'un refus de l'API", () => {
  it("le champ lu est bien reponse.normalise.refus_api, vrai dans l'exemple de refus et faux ailleurs", () => {
    expect(REFUS.normalise.refus_api).toBe(true);
    expect(ORDINAIRE.normalise.refus_api).toBe(false);
  });

  it.each([
    ["P", itemP()],
    ["A", itemA()],
    ["F", itemF()],
    ["O", itemO()],
  ] as const)("refus sur un item %s : non_reponse, sans extrait ni charge, conforme au schéma", (_type, item) => {
    const notation = notationParRegle(cadre({ references_item: references(item) }));
    valider("notation", notation, "notation par règle");
    expect(notation).toEqual({
      id: ulid("notation-regle"),
      run_id: RUN_ID,
      contexte: "run",
      objet_note: { type: "reponse", id: REFUS.id },
      notateur: REGLE_REFUS_API,
      sur_refus_api: true,
      gabarit: "Q-DIR",
      references_item: references(item),
      categorie: "non_reponse",
      drapeaux: [],
      sourcage: { cite: false, liens: [] },
      date: "2026-12-04T10:00:00+01:00",
      motif_notation: "regle_refus_api",
    });
    expect(notation.notateur).toEqual({ type: "regle", id: "d12-refus-api" });
    expect("extrait_justificatif" in notation).toBe(false);
    expect("version_charge" in notation).toBe(false);
  });

  it("Q-ATT dont la référence n'a que des items F (aucun candidat attendu) : attendus et cités vides, conforme", () => {
    const attribution = {
      reponse_attendue: { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } },
      candidats: CANDIDATS_DU_RUN,
    } as const;
    const notation = notationParRegle(cadre({ gabarit: "Q-ATT", references_item: references(itemF(), itemF({ id: "01JBANCESSA1000000001TEM05" })), attribution }));
    valider("notation", notation, "notation par règle Q-ATT");
    expect(notation.attribution).toEqual({ attendus: [], cites: [] });
    expect(notation.categorie).toBe("non_reponse");
  });

  it("Q-ATT à liste attendue : la liste résolue au gel est recopiée, personne n'est cité", () => {
    const attribution = {
      reponse_attendue: { nature: "liste_candidats", candidats_attendus: ["demo-alpha", "demo-gamma"], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } },
      candidats: CANDIDATS_DU_RUN,
    } as const;
    const notation = notationParRegle(cadre({ gabarit: "Q-ATT", attribution }));
    valider("notation", notation, "notation par règle Q-ATT");
    expect(notation.attribution).toEqual({ attendus: ["demo-alpha", "demo-gamma"], cites: [] });
  });

  it("une réponse sans refus de l'API n'est jamais notée par règle", () => {
    expect(() => notationParRegle(cadre({ reponse: ORDINAIRE }))).toThrow(PasUnRefusApi);
  });

  it("une Q-ATT sans liste attendue, ou une question ordinaire avec, est refusée : rien n'est supposé", () => {
    expect(() => notationParRegle(cadre({ gabarit: "Q-ATT" }))).toThrow(PasUnRefusApi);
    const attribution = {
      reponse_attendue: { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } },
      candidats: CANDIDATS_DU_RUN,
    } as const;
    expect(() => notationParRegle(cadre({ attribution }))).toThrow(PasUnRefusApi);
  });

  it("est déterministe : même cadre, même notation", () => {
    expect(notationParRegle(cadre())).toEqual(notationParRegle(cadre()));
  });

  it("analysis/note-lue.ts la lit comme une non-réponse ordinaire : même note qu'un juge qui dit non-réponse sans source", () => {
    const juge = notationJuge("j1", { categorie: "non_reponse", extrait_justificatif: { provenance: "reference", texte: "x", verifie_deterministe: true } });
    expect(lireNote(notationParRegle(cadre()))).toEqual(lireNote(juge));
    expect(sourcageDeNotation(notationParRegle(cadre()))).toEqual({ cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false });
  });
});

describe("D32 : le schéma de notation", () => {
  const regle = (): NotationIndividuelle => notationParRegle(cadre());

  it("refuse une notation par règle qui porte un extrait, une version de charge ou des champs de juge", () => {
    schemaRefuse({ ...regle(), extrait_justificatif: { provenance: "reponse", texte: "x", verifie_deterministe: true } });
    schemaRefuse({ ...regle(), version_charge: "charge-juge-v3" });
    schemaRefuse({ ...regle(), notateur: { ...REGLE_REFUS_API, famille_modele: "f", modele: "m", version_prompt: "p", a_vu_identite_outil: false } });
  });

  it("refuse une notation par règle autre que non_reponse, sous un autre motif, d'une autre règle, hors du contexte run ou avec une source", () => {
    schemaRefuse({ ...regle(), categorie: "exacte" });
    schemaRefuse({ ...regle(), motif_notation: "notation_juge" });
    schemaRefuse({ ...regle(), notateur: { type: "regle", id: "autre-regle" } });
    schemaRefuse({ ...regle(), contexte: "contrefactuel_candidat" });
    schemaRefuse({ ...regle(), sourcage: { cite: true, liens: [] } });
  });

  it("refuse un juge ou un humain sous le motif regle_refus_api", () => {
    schemaRefuse(notationJuge("j1", { categorie: "non_reponse", motif_notation: "regle_refus_api", extrait_justificatif: { provenance: "reference", texte: "x", verifie_deterministe: true } }));
    schemaRefuse(notationHumaine("h1", "regle_refus_api", { categorie: "non_reponse", extrait_justificatif: { provenance: "reference", texte: "x", verifie_deterministe: true } }));
  });

  it("hors refus, l'annexe C reste entière pour un juge et pour un humain : non_reponse sans extrait refusée", () => {
    schemaRefuse(notationJuge("j1", { categorie: "non_reponse" }));
    schemaRefuse(notationHumaine("h1", "echantillon_aleatoire_10", { categorie: "non_reponse" }));
  });

  it("D33 : le marqueur sur_refus_api est exigé de la règle, interdit au juge, admis pour l'humain, qu'il exempte de l'extrait", () => {
    const { sur_refus_api: _marqueur, ...sansMarqueur } = regle();
    schemaRefuse(sansMarqueur);
    schemaRefuse(notationJuge("j1", { categorie: "non_reponse", sur_refus_api: true, extrait_justificatif: { provenance: "reference", texte: "x", verifie_deterministe: true } }));
    schemaRefuse({ ...regle(), sur_refus_api: false });
    for (const categorie of ["non_reponse", "indeterminee"] as const) {
      valider("notation", notationHumaine("h1", "echantillon_aleatoire_10", { categorie, sur_refus_api: true }), "humain sur refus sans extrait");
    }
    schemaRefuse(notationHumaine("h1", "echantillon_aleatoire_10", { categorie: "non_reponse", sur_refus_api: true, contexte: "contrefactuel_candidat" }));
  });
});
