/**
 * `verifierAjoutSeul` : ce qu'une réécriture d'un item de `data/items/` a le droit de changer
 * (lot contestation-notification, V1). Un item publié ne perd rien : ses validations, sa
 * confirmation d'absence, ses contestations, son historique et ses revérifications gardent leur
 * préfixe ; une décision du panel s'ajoute, elle ne remplace jamais ; le contenu notant ne bouge
 * que par la liste blanche des corrections, et seulement quand la commande l'autorise.
 */

import { describe, expect, it } from "vitest";
import { EcritureNonAjoutSeule, verifierAjoutSeul } from "../validation/domaine/ajout-seul.ts";
import { empreinteContenuNotant } from "../validation/domaine/empreinte.ts";
import type { Item } from "../validation/domaine/types.ts";
import { entreeHistorique, itemPromu } from "./aides/data.ts";
import { itemA } from "./aides/fabriques.ts";

function assertionDe(item: Item): NonNullable<Item["assertion"]> {
  if (item.assertion === undefined) throw new Error("item sans assertion");
  return item.assertion;
}

function absenceDe(item: Item): NonNullable<Item["absence"]> {
  if (item.absence === undefined) throw new Error("item sans absence");
  return item.absence;
}

function confirmationDe(item: Item): NonNullable<NonNullable<Item["absence"]>["confirmation_initiale"]> {
  const confirmation = absenceDe(item).confirmation_initiale;
  if (confirmation === undefined) throw new Error("item sans confirmation initiale");
  return confirmation;
}

const CONTESTATION = {
  id: "01JBANCESSA1C0NTESTAT10N01",
  date_reception: "2026-10-01T09:00:00+02:00",
  texte: "La source ne dit pas cela.",
  contestataire_type: "campagne",
  caviardage: false,
};

const DECISION_PANEL = {
  date: "2026-10-10T09:00:00+02:00",
  decision: "maintien",
  motivation: "La citation figure dans la source.",
  arbitre_seul: true,
  statut_validation_anterieur: "verifie",
};

function contester(item: Item): Item {
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [...(item.contestations ?? []), CONTESTATION],
    historique: [...(item.historique ?? []), entreeHistorique(item.version)],
  };
}

function refus(avant: Item, apres: Item, corrections = false): string {
  try {
    verifierAjoutSeul(avant, apres, { corrections });
  } catch (erreur) {
    if (erreur instanceof EcritureNonAjoutSeule) return erreur.message;
    throw erreur;
  }
  return "";
}

/** Les motifs du refus, un par ligne ; un échec si la réécriture n'est pas refusée ou l'est par une autre erreur. */
function motifsDuRefus(avant: Item, apres: Item, corrections = false): readonly string[] {
  try {
    verifierAjoutSeul(avant, apres, { corrections });
  } catch (erreur) {
    if (erreur instanceof EcritureNonAjoutSeule) return erreur.motifs;
    throw erreur;
  }
  throw new Error("la réécriture a été admise ; un refus était attendu");
}

describe("réécritures admises", () => {
  it("une contestation ajoutée, un statut changé, une entrée d'historique", () => {
    const avant = itemPromu();
    expect(refus(avant, contester(avant))).toBe("");
  });

  it("une décision du panel posée sur une contestation qui n'en avait pas", () => {
    const avant = contester(itemPromu());
    const apres: Item = {
      ...avant,
      statut_contestation: "arbitree",
      contestations: [{ ...CONTESTATION, decision_panel: DECISION_PANEL }],
      historique: [...(avant.historique ?? []), entreeHistorique(avant.version, "décision du panel")],
    };
    expect(refus(avant, apres)).toBe("");
  });

  it("une correction de la liste blanche, autorisée, version + 1 et empreinte recalculée", () => {
    const avant = contester(itemPromu());
    const corrige = { ...avant, assertion: { ...assertionDe(avant), position: "contre" } } as Item;
    const apres: Item = {
      ...corrige,
      version: avant.version + 1,
      empreinte: empreinteContenuNotant(corrige),
      historique: [...(avant.historique ?? []), entreeHistorique(avant.version + 1, "correction")],
    };
    expect(refus(avant, apres, true)).toBe("");
  });

  it("une paraphrase corrigée : version + 1, empreinte inchangée (§4, contenu notant)", () => {
    const avant = contester(itemPromu());
    const apres: Item = {
      ...avant,
      assertion: { ...assertionDe(avant), paraphrase: "Autre paraphrase, même contenu notant." },
      version: avant.version + 1,
      historique: [...(avant.historique ?? []), entreeHistorique(avant.version + 1, "correction")],
    };
    expect(refus(avant, apres, true)).toBe("");
  });
});

describe("réécritures refusées", () => {
  const avant = contester(itemPromu());
  const suite = (surcharges: Partial<Item>): Item => ({
    ...avant,
    historique: [...(avant.historique ?? []), entreeHistorique(avant.version)],
    ...surcharges,
  });

  // Revue du 2026-10-12, constat 46 : `toMatch(/id/)` passait aussi sur « validations ». On prouve la
  // raison du refus par la classe d'erreur et le texte exact du motif (le refus en porte aussi un
  // motif « contenu modifié », que ces fabriques ne séparent pas : d'où `toContain`, pas `toEqual`).
  it("un identifiant changé : EcritureNonAjoutSeule, motif exact nommé", () => {
    const apres = suite({ id: "01JBANCESSA1000000009TEM99" });
    expect(() => verifierAjoutSeul(avant, apres, { corrections: false })).toThrow(EcritureNonAjoutSeule);
    expect(motifsDuRefus(avant, apres)).toContain(`id changé : ${avant.id} → 01JBANCESSA1000000009TEM99`);
  });

  it("des validations modifiées : EcritureNonAjoutSeule, motif exact nommé", () => {
    const apres = suite({ validations: (avant.validations ?? []).slice(0, 1) });
    expect(() => verifierAjoutSeul(avant, apres, { corrections: false })).toThrow(EcritureNonAjoutSeule);
    expect(motifsDuRefus(avant, apres)).toContain("validations[] modifiées");
  });

  it("une contestation retirée", () => {
    expect(refus(avant, suite({ contestations: [] }))).toMatch(/contestation a disparu/);
  });

  it("une contestation réécrite", () => {
    expect(refus(avant, suite({ contestations: [{ ...CONTESTATION, texte: "Autre texte." }] }))).toMatch(
      /contestations/,
    );
  });

  it("une décision du panel remplacée", () => {
    const decidee: Item = { ...avant, contestations: [{ ...CONTESTATION, decision_panel: DECISION_PANEL }] };
    const apres: Item = {
      ...decidee,
      contestations: [{ ...CONTESTATION, decision_panel: { ...DECISION_PANEL, decision: "retrait" } }],
      historique: [...(decidee.historique ?? []), entreeHistorique(decidee.version)],
    };
    expect(refus(decidee, apres)).toMatch(/decision_panel/);
  });

  it("un historique réécrit", () => {
    const [premiere, ...reste] = avant.historique ?? [];
    const apres = suite({
      historique: [{ ...(premiere as object), changement: "réécrit" }, ...reste, entreeHistorique(avant.version)],
    });
    expect(refus(avant, apres)).toMatch(/historique/);
  });

  it("aucune entrée d'historique ajoutée", () => {
    expect(refus(avant, { ...avant, statut_contestation: "arbitree" })).toMatch(/historique/);
  });

  it("deux entrées d'historique ajoutées pour une seule réécriture", () => {
    const apres = suite({});
    const deux = { ...apres, historique: [...(apres.historique ?? []), entreeHistorique(avant.version)] };
    expect(refus(avant, deux)).toMatch(/historique/);
  });

  it("une entrée d'historique dont la version résultante n'est pas celle de l'item", () => {
    const apres: Item = { ...avant, historique: [...(avant.historique ?? []), entreeHistorique(avant.version + 3)] };
    expect(refus(avant, apres)).toMatch(/version_resultante/);
  });

  it("le contenu notant modifié sans autorisation de corriger", () => {
    const corrige = { ...avant, assertion: { ...assertionDe(avant), position: "contre" } } as Item;
    const apres = { ...corrige, version: avant.version + 1, empreinte: empreinteContenuNotant(corrige) };
    expect(refus(avant, suite(apres))).toMatch(/contenu/);
  });

  it("un champ hors de la liste blanche modifié, même avec l'autorisation", () => {
    const apres = suite({ candidat_id: "demo-autre" });
    expect(refus(avant, apres, true)).toMatch(/contenu/);
  });

  it("une source modifiée, même avec l'autorisation (une source ne se corrige pas)", () => {
    const assertion = { ...assertionDe(avant), source: { ...assertionDe(avant).source, url: "https://autre.invalid/" } };
    expect(refus(avant, suite({ assertion }), true)).toMatch(/contenu/);
  });

  it("une correction sans version incrémentée", () => {
    const corrige = { ...avant, assertion: { ...assertionDe(avant), position: "contre" } } as Item;
    expect(refus(avant, suite({ ...corrige, empreinte: empreinteContenuNotant(corrige) }), true)).toMatch(/version/);
  });

  it("une correction dont l'empreinte n'est pas recalculée", () => {
    const corrige = { ...avant, assertion: { ...assertionDe(avant), position: "contre" } } as Item;
    const apres: Item = {
      ...corrige,
      version: avant.version + 1,
      historique: [...(avant.historique ?? []), entreeHistorique(avant.version + 1)],
    };
    expect(refus(avant, apres, true)).toMatch(/empreinte/);
  });

  it("une version incrémentée sans rien corriger", () => {
    const apres: Item = {
      ...avant,
      version: avant.version + 1,
      historique: [...(avant.historique ?? []), entreeHistorique(avant.version + 1)],
    };
    expect(refus(avant, apres, true)).toMatch(/version/);
  });
});

describe("item A : confirmation initiale et revérifications", () => {
  const avantA: Item = {
    ...itemA({ statut_validation: "verifie" }),
    absence: {
      ...absenceDe(itemA()),
      confirmation_initiale: { lot_id: "lot-001", date: "2026-09-21T09:00:00+02:00", annotateurs: ["a1", "a2"] },
      reverifications: [
        { run_id: "01JBANCESSA1RUN00000000001", date: "2026-10-01T09:00:00+02:00", resultat: "absence_confirmee", confirme_par: "a1" },
      ],
    },
  };
  const ajout = (absence: NonNullable<Item["absence"]>): Item => ({
    ...avantA,
    absence,
    historique: [...(avantA.historique ?? []), entreeHistorique(avantA.version)],
  });

  it("une revérification ajoutée en fin de liste est admise", () => {
    const reverifications = [
      ...absenceDe(avantA).reverifications,
      { run_id: "01JBANCESSA1RUN00000000002", date: "2026-11-01T09:00:00+02:00", resultat: "absence_confirmee", confirme_par: "a2" },
    ];
    expect(refus(avantA, ajout({ ...absenceDe(avantA), reverifications }))).toBe("");
  });

  it("une revérification retirée est refusée", () => {
    expect(refus(avantA, ajout({ ...absenceDe(avantA), reverifications: [] }))).toMatch(/reverifications/);
  });

  it("la confirmation initiale modifiée est refusée", () => {
    const confirmation_initiale = { ...confirmationDe(avantA), annotateurs: ["a1", "a3"] };
    expect(refus(avantA, ajout({ ...absenceDe(avantA), confirmation_initiale }))).toMatch(/confirmation_initiale/);
  });
});
