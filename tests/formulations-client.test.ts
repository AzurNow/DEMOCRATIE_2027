/**
 * L'état des cases de l'écran de relecture des formulations, sans DOM (D39, D42) : aucune case
 * pré-cochée, promotion seulement quand tout est coché, refus seulement avec un commentaire.
 */

import { describe, expect, it } from "vitest";
import {
  actionsPermises,
  etatInitial,
  libellePremisse,
  relectureDe,
  type EtatCases,
} from "../validation/client/cases-formulations.ts";
import { lignesItemPrincipal } from "../validation/client/item-principal.ts";
import type { VueFormulations } from "../validation/client/types.ts";

const VUE: VueFormulations = {
  question_id: "q_00000000000000000000000000000001",
  proposition_id: "01JA0000000000000000000001",
  gabarit: "Q-FER",
  candidat: "Libellé demo-alpha",
  mesure: "la création d’un jardin",
  position_demandee: "pour",
  item_principal: null,
  textes: [
    { registre: "neutre", texte: "Neutre ?" },
    { registre: "familier", texte: "Familier ?" },
    { registre: "oriente", texte: "Orienté ?" },
  ],
};

function tout(etat: EtatCases): EtatCases {
  return { ...etat, sens: new Map([...etat.sens.keys()].map((registre) => [registre, true])), premisse: true };
}

describe("écran de relecture : cases et boutons", () => {
  it("aucune case n'est pré-cochée, et aucun bouton n'est actif à l'ouverture", () => {
    const etat = etatInitial(VUE);
    expect([...etat.sens.values()]).toEqual([false, false, false]);
    expect(etat.premisse).toBe(false);
    expect(actionsPermises(etat)).toEqual({ promouvoir: false, refuser: false });
  });

  it("tout coché ⇒ seule la promotion est permise, même avec un commentaire", () => {
    expect(actionsPermises(tout(etatInitial(VUE)))).toEqual({ promouvoir: true, refuser: false });
    expect(actionsPermises({ ...tout(etatInitial(VUE)), commentaire: "RAS" })).toEqual({ promouvoir: true, refuser: false });
  });

  it("une case décochée ⇒ refus permis seulement avec un commentaire non blanc", () => {
    const decoche = { ...tout(etatInitial(VUE)), premisse: false };
    expect(actionsPermises(decoche)).toEqual({ promouvoir: false, refuser: false });
    expect(actionsPermises({ ...decoche, commentaire: "   " })).toEqual({ promouvoir: false, refuser: false });
    expect(actionsPermises({ ...decoche, commentaire: "Prémisse fausse." })).toEqual({ promouvoir: false, refuser: true });
  });

  it("le libellé de la prémisse nomme la position demandée, ou l'absence de position", () => {
    expect(libellePremisse("contre")).toBe("La prémisse affirme bien : « contre »");
    expect(libellePremisse("AUCUNE")).toBe("La prémisse n'affirme aucune position");
  });

  it("la requête porte chaque case telle quelle", () => {
    const etat = { ...etatInitial(VUE), commentaire: "x" };
    expect(relectureDe(VUE, etat)).toEqual({
      question_id: VUE.question_id,
      proposition_id: VUE.proposition_id,
      sens_preserve: { neutre: false, familier: false, oriente: false },
      premisse_conforme: false,
      commentaire: "x",
    });
  });
});

describe("écran de relecture : l'item principal (§5)", () => {
  const SOURCE = {
    tier: "T1",
    url: "https://exemple.test/programme.pdf",
    type_document: "programme",
    page: 3,
    extrait: null,
    date_source: "2026-05-01",
    archive_url: "https://archive.test/abc",
    sha256: "a".repeat(64),
    texte_sha256: null,
    publication: "publique",
  };
  const CITATION = "« Nous <b>baisserons</b> l’impôt & rien d’autre »";

  function principal(): NonNullable<VueFormulations["item_principal"]> {
    return {
      statut_validation: "verifie",
      item: {
        id: "01JA00000000000000000000IT",
        version: 1,
        empreinte: "e".repeat(64),
        type: "P",
        candidat_id: "demo-alpha",
        valide_du: "2026-01-01",
        valide_au: null,
        mesure: { libelle: "m", theme: "education", formulation_canonique: "f", fictive: false, origine_fictive: null, verification_fictivite: null },
        assertion: { position: "pour", paraphrase: "hors contenu notant", citation_verbatim: CITATION, quantification: null, source: SOURCE, offsets: null },
        absence: null,
        obsolescence: null,
      },
    };
  }

  it("montre identifiant, type, statut, source et citation, sans la paraphrase", () => {
    const lignes = lignesItemPrincipal(principal());
    const valeurs = Object.fromEntries(lignes.map((ligne) => [ligne.libelle, ligne.valeur]));
    expect(valeurs["Identifiant"]).toBe("01JA00000000000000000000IT");
    expect(valeurs["Type"]).toBe("P");
    expect(valeurs["Statut de validation"]).toBe("verifie");
    expect(valeurs["Source"]).toContain("https://exemple.test/programme.pdf");
    expect(valeurs["Archive"]).toContain("a".repeat(64));
    expect(JSON.stringify(lignes)).not.toContain("hors contenu notant");
  });

  it("guillemets typographiques et HTML de la citation : valeur intacte, non interprétée", () => {
    const lignes = lignesItemPrincipal(principal());
    expect(lignes.find((ligne) => ligne.libelle === "Citation")?.valeur).toBe(CITATION);
  });
});
