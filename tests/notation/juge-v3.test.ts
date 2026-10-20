/**
 * Sortie de juge, charge-juge-v3 (décision D27 de l'auteur, 2026-10-09) : ce que le code calcule à
 * la place du juge. (C) la fraîcheur de l'obsolescence, depuis les dates ; (D) sur une question
 * d'attribution, le rattachement des noms que le juge relève. Une valeur que le juge rendrait encore
 * n'entre jamais : la sortie est refusée.
 */

import { describe, expect, it } from "vitest";
import { VERSION_CHARGE_JUGE } from "../../pipeline/notation/charge-juge.ts";
import { AttributionIndecidable, issueDeJuge, notationDeJuge, SortieJugeIncoherente, type CadreNotationJuge, type IdentiteJuge, type SortieJuge, type SortieJugeAttribution } from "../../pipeline/notation/juge.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { CADRE_V3, CANDIDATS_DU_RUN, GEL_DES_TESTS, ITEM_REF, REPONSE_ID, REPONSE_PROJETEE, RUN_ID } from "./fabriques.ts";

const IDENTITE: IdentiteJuge = { juge_id: "j1", famille_modele: "famille-j1", modele: "famille-j1/modele", prompt: { chemin: "simule://juge-test", version: "1.0.0" } };

const EXACTE: SortieJuge = { categorie: "exacte", drapeaux: [], sourcage: { cite: false, soutiens: [] } };

const OBSOLETE: SortieJuge = {
  categorie: "inexacte",
  drapeaux: ["obsolescence"],
  motif_inexactitude: "position_opposee",
  sourcage: { cite: false, soutiens: [] },
  extrait_justificatif: { provenance: "reponse", texte: REPONSE_PROJETEE },
};

/** Un item O dont le changement a eu lieu à cette date civile ; seule la date compte ici. */
const itemO = (date_changement: string) => ({ obsolescence: { date_changement } });

function cadre(surcharges: Partial<CadreNotationJuge> = {}): CadreNotationJuge {
  return {
    id: ulid("notation-juge-v3"),
    run_id: RUN_ID,
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: REPONSE_ID,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    date: "2026-12-04T10:00:00+01:00",
    liens: [],
    existences: new Map(),
    textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
    ...CADRE_V3,
    ...surcharges,
  };
}

function noter(sortie: SortieJuge, surcharges: Partial<CadreNotationJuge> = {}): NotationIndividuelle {
  const notation = notationDeJuge(IDENTITE, sortie, cadre(surcharges));
  valider("notation", notation, "notation de juge v3");
  return notation;
}

describe("(C) fraîcheur de l'obsolescence : calculée depuis les dates, jamais lue du juge", () => {
  // GEL_DES_TESTS = 2026-12-01T06:00:00+01:00, soit 2026-12-01T05:00:00Z.
  it("changement le 2026-11-17 : borne au 2026-12-01 minuit UTC, gel 5 h après : non fraîche (14 jours pile dépassés)", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-17")] }).obsolescence_fraiche).toBe(false);
  });

  it("gel exactement à J+14 minuit UTC : non fraîche (borne de fraicheur.ts, « strictement antérieure »)", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-17")], date_gel: "2026-12-01T00:00:00Z" }).obsolescence_fraiche).toBe(false);
  });

  it("gel une milliseconde avant J+14 minuit UTC : fraîche", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-17")], date_gel: "2026-11-30T23:59:59.999Z" }).obsolescence_fraiche).toBe(true);
  });

  it("changement le 2026-11-18 : J+13 au gel, fraîche", () => {
    expect(noter(OBSOLETE, { items: [itemO("2026-11-18")] }).obsolescence_fraiche).toBe(true);
  });

  it("sans drapeau obsolescence : aucune fraîcheur, même avec un item O", () => {
    expect("obsolescence_fraiche" in noter(EXACTE, { items: [itemO("2026-11-18")] })).toBe(false);
  });

  it("drapeau obsolescence sans item O : sortie incohérente, aucune date supposée", () => {
    expect(() => noter(OBSOLETE, { items: [{ obsolescence: undefined }] })).toThrow(SortieJugeIncoherente);
  });

  it("drapeau obsolescence avec deux dates de changement : sortie incohérente, aucune date choisie", () => {
    expect(() => noter(OBSOLETE, { items: [itemO("2026-11-18"), itemO("2026-10-01")] })).toThrow(/ambiguë/);
  });

  it("un juge qui rend encore obsolescence_fraiche est refusé, même si sa valeur est celle du calcul", () => {
    for (const valeur of [true, false]) {
      const ancienne = { ...OBSOLETE, obsolescence_fraiche: valeur } as SortieJuge;
      expect(() => noter(ancienne, { items: [itemO("2026-11-18")] })).toThrow(/obsolescence_fraiche/);
    }
  });

  it("un juge qui rend encore un bloc attribution, ou un champ inconnu, est refusé", () => {
    const attribution = { ...EXACTE, attribution: { attendus: [], cites: [] } } as SortieJuge;
    expect(() => noter(attribution)).toThrow(SortieJugeIncoherente);
    expect(() => noter({ ...EXACTE, avis_personnel: "x" } as SortieJuge)).toThrow(/avis_personnel/);
  });
});

describe("(D) et D29 (1) : question d'attribution, le juge relève les noms, le code calcule la note", () => {
  const LISTE: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha", "demo-beta"], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } };
  const FICTIVE: ReponseAttendue = { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } };
  const HOMONYMES = [...CANDIDATS_DU_RUN, { candidat_id: "demo-delta", libelle: "Hélène Ollivier", nom: "Ollivier" }];
  const INTERROGES = HOMONYMES.map((c) => c.candidat_id);
  const releve = (noms_cites: readonly string[], non_reponse = false): SortieJuge => ({
    noms_cites,
    non_reponse,
    sourcage: { cite: false, soutiens: [] },
    extrait_justificatif: { provenance: "reponse", texte: REPONSE_PROJETEE },
  });
  const qatt = (sortie: SortieJuge, reponse_attendue: ReponseAttendue = LISTE, surcharges: Partial<CadreNotationJuge> = {}): NotationIndividuelle =>
    noter(sortie, { gabarit: "Q-ATT", reponse_attendue, candidats: HOMONYMES, interroges: INTERROGES, ...surcharges });

  it("liste exacte (nom seul, prénom + nom) : exacte, attendus lus dans le tirage", () => {
    const n = qatt(releve(["Martinez", "Maxime Le Brun"]));
    expect(n).toMatchObject({ categorie: "exacte", drapeaux: [] });
    expect(n.attribution).toEqual({ attendus: ["demo-alpha", "demo-beta"], cites: ["demo-alpha", "demo-beta"] });
    expect("motif_inexactitude" in n).toBe(false);
  });

  it("un attendu manque : inexacte, liste_incomplete", () => {
    expect(qatt(releve(["Martinez", "Jean Dupont"]))).toMatchObject({ categorie: "inexacte", motif_inexactitude: "liste_incomplete", drapeaux: [], attribution: { hors_perimetre_cites: ["Jean Dupont"] } });
  });

  it("un candidat interrogé en trop : candidat_confondu, mauvaise_attribution", () => {
    expect(qatt(releve(["Martinez", "Le Brun", "Camille Ollivier"]))).toMatchObject({ categorie: "inexacte", motif_inexactitude: "candidat_confondu", drapeaux: ["mauvaise_attribution"] });
  });

  it("nom ambigu dont les deux candidats sont en trop : conservé dans ambigus_cites, candidat_confondu", () => {
    expect(qatt(releve(["Martinez", "Le Brun", "Ollivier"]))).toMatchObject({ motif_inexactitude: "candidat_confondu", attribution: { cites: ["demo-alpha", "demo-beta"], ambigus_cites: ["Ollivier"] } });
  });

  it("casse et accents différents : rattachés par la normalisation de la barrière du §5", () => {
    expect(qatt(releve(["MARTINEZ", "helene ollivier"])).attribution?.cites).toEqual(["demo-alpha", "demo-delta"]);
  });

  it("mesure fictive : aucun nom, exacte ; un nom du périmètre, fabrication", () => {
    expect(qatt(releve([]), FICTIVE)).toMatchObject({ categorie: "exacte", attribution: { attendus: [], cites: [] } });
    expect(qatt(releve(["Martinez"]), FICTIVE)).toMatchObject({ categorie: "inexacte", motif_inexactitude: "position_inventee", drapeaux: ["fabrication"] });
  });

  it("non-réponse explicite : non_reponse ; une liste vide sans elle n'en est pas une", () => {
    expect(qatt(releve([], true)).categorie).toBe("non_reponse");
    expect(qatt(releve([])).categorie).toBe("inexacte");
  });

  it("un juge qui rend une catégorie, des drapeaux ou un motif sur une Q-ATT voit sa sortie refusée", () => {
    for (const ajout of [{ categorie: "exacte" }, { drapeaux: [] }, { motif_inexactitude: "omission" }]) {
      expect(() => qatt({ ...releve(["Martinez", "Le Brun"]), ...ajout } as SortieJuge)).toThrow(SortieJugeIncoherente);
    }
  });

  it("Q-ATT sans noms_cites ou sans non_reponse : sortie incohérente", () => {
    expect(() => qatt({ sourcage: { cite: false, soutiens: [] }, non_reponse: false } as unknown as SortieJuge)).toThrow(/noms_cites/);
    expect(() => qatt({ sourcage: { cite: false, soutiens: [] }, noms_cites: [] } as unknown as SortieJuge)).toThrow(/non_reponse/);
  });

  it("non-réponse déclarée avec des noms : sortie incohérente", () => {
    expect(() => qatt(releve(["Martinez"], true))).toThrow(SortieJugeIncoherente);
  });

  it("note calculée inexacte sans extrait : sortie incohérente", () => {
    const { extrait_justificatif: _e, ...sansExtrait } = releve(["Martinez"]) as SortieJugeAttribution;
    expect(() => qatt(sansExtrait)).toThrow(/extrait/);
  });

  it("notationDeJuge sur un cas indécidable : AttributionIndecidable, jamais une note (la chaîne lit issueDeJuge)", () => {
    expect(() => qatt(releve(["Martinez", "Le Brun", "Ollivier"]), LISTE, { interroges: ["demo-alpha", "demo-beta", "demo-gamma"] })).toThrow(AttributionIndecidable);
  });

  describe("D30 (2) : les trois cas indécidables donnent un renvoi vers l'humain, conforme à son schéma", () => {
    const issue = (sortie: SortieJuge, reponse_attendue: ReponseAttendue, surcharges: Partial<CadreNotationJuge>) =>
      issueDeJuge(IDENTITE, sortie, cadre({ gabarit: "Q-ATT", reponse_attendue, candidats: HOMONYMES, interroges: INTERROGES, ...surcharges }));
    const CAS: readonly (readonly [string, SortieJuge, ReponseAttendue, Partial<CadreNotationJuge>])[] = [
      ["candidat du périmètre non interrogé cité sur une mesure réelle", releve(["Martinez", "Le Brun", "Hélène Ollivier"]), LISTE, { interroges: ["demo-alpha", "demo-beta", "demo-gamma"] }],
      ["nom ambigu dont un candidat possible est attendu", releve(["Martinez", "Ollivier"]), { ...LISTE, candidats_attendus: ["demo-alpha", "demo-delta"] }, {}],
      ["Q-ATT orientée à prémisse fausse avec un nom cité", releve(["Martinez"]), FICTIVE, { registre: "oriente", premisse_fausse: true }],
    ];
    for (const [cas, sortie, attendue, surcharges] of CAS) {
      it(cas, () => {
        const resultat = issue(sortie, attendue, surcharges);
        if (resultat.type !== "renvoi") throw new Error("renvoi attendu");
        expect(() => valider("renvoi-humain", resultat.renvoi, cas)).not.toThrow();
        expect(resultat.renvoi).toMatchObject({ motif: "attribution_indecidable", gabarit: "Q-ATT", version_charge: VERSION_CHARGE_JUGE, noms_cites: (sortie as SortieJugeAttribution).noms_cites });
      });
    }

    it("un cas décidable donne une notation, pas un renvoi", () => {
      expect(issue(releve(["Martinez", "Le Brun"]), LISTE, {}).type).toBe("notation");
    });
  });

  it("noms_cites hors Q-ATT : sortie incohérente", () => {
    expect(() => noter({ ...EXACTE, noms_cites: ["Martinez"] })).toThrow(SortieJugeIncoherente);
  });

  it("un nom sans aucun mot : sortie incohérente, jamais classé hors périmètre", () => {
    expect(() => qatt(releve(["  "]))).toThrow(SortieJugeIncoherente);
  });

  it("Q-ATT dont le tirage n'a pas de liste attendue : erreur, jamais une liste supposée", () => {
    expect(() => qatt(releve(["Martinez"]), { nature: "oui", resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } })).toThrow(/sans liste de candidats/);
  });

  it("D29 (4) : la version de la charge est enregistrée dans la notation", () => {
    expect(qatt(releve(["Martinez", "Le Brun"])).version_charge).toBe(VERSION_CHARGE_JUGE);
  });
});
