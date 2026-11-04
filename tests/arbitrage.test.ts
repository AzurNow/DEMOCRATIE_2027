/**
 * Arbitrage des désaccords (§4, règle de concordance, protocole 0.10 ; lot contestation-notification,
 * V2). Chaque motif d'arbitrage a son cas ; l'arbitre choisit un contenu proposé, jamais un contenu
 * rédigé ; une décision sur une version dépassée, un autre désaccord ou un contenu disparu ne
 * s'applique pas ; la paire « non évaluable » / « rejeter » relève du panel.
 */

import { describe, expect, it } from "vitest";
import {
  contenuRetenu,
  decisionEnVigueur,
  evaluerAvecArbitrage,
  instanceArbitrage,
  type DecisionArbitrage,
} from "../validation/domaine/arbitrage.ts";
import type { DecisionCorrectionMesure } from "../validation/domaine/corrections-mesure.ts";
import { evaluerPromotion, type Dossier, type Issue } from "../validation/domaine/promotion.ts";
import type { Correction, EntreeDecision, Item } from "../validation/domaine/types.ts";
import { valider } from "../outils/schemas/valider.ts";
import { decision, itemA, itemF, itemP, mesure, OPTIONS_PROMOTION } from "./aides/fabriques.ts";

function dossier(item: Item, decisions: readonly EntreeDecision[], surcharges: Partial<Dossier> = {}): Dossier {
  return {
    item,
    mesure: mesure(),
    lot_id: "lot-001",
    lot_nature: "reel",
    decisions,
    registre_corrections_mesure: [],
    ...surcharges,
  };
}

let compteur = 0;
function decisionArbitrage(cas: Dossier, surcharges: Partial<DecisionArbitrage>): DecisionArbitrage {
  const issue = evaluerPromotion(cas, OPTIONS_PROMOTION);
  if (issue.sort !== "arbitrage") throw new Error(`Cas de test hors arbitrage : ${issue.sort}`);
  compteur += 1;
  return {
    id: `01JBANCESSA1ARB1TRAGE000${String(compteur).padStart(2, "0")}`,
    item_id: cas.item.id,
    lot_id: cas.lot_id,
    item_version: cas.item.version,
    item_empreinte: cas.item.empreinte,
    motif: issue.motif,
    issue: "verifie",
    contenu_retenu: "original",
    arbitre: "auteur",
    arbitre_seul: false,
    motivation: "Motivation publiée de la décision.",
    date: "2026-10-02T10:00:00+02:00",
    ...surcharges,
  };
}

/** Une issue autre que « verifie » ne retient aucun contenu. */
function sansContenu(decisionPrise: DecisionArbitrage): DecisionArbitrage {
  const { contenu_retenu: _retire, ...reste } = decisionPrise;
  return reste;
}

function evaluer(cas: Dossier, registre: readonly DecisionArbitrage[]): Issue {
  return evaluerAvecArbitrage(cas, registre, OPTIONS_PROMOTION);
}

function motifsInapplicables(issue: Issue): readonly string[] {
  if (issue.sort !== "arbitrage") throw new Error(`Attendu : arbitrage, obtenu ${issue.sort}`);
  if (issue.decision_inapplicable === undefined) throw new Error("Attendu : une décision inapplicable");
  return issue.decision_inapplicable.motifs;
}

const correctionParaphrase = (texte: string): Correction => ({
  cible: "item",
  chemin: "/assertion/paraphrase",
  ancienne_valeur: "Ramener la TVA sur les produits énergétiques de 20 % à 5,5 %.",
  nouvelle_valeur: texte,
});

const correctionTaux = (taux: number): Correction => ({
  cible: "item",
  chemin: "/assertion/quantification",
  ancienne_valeur: { dimensions: [{ type: "taux", valeur: 5.5, unite: "%", operateur: "exact" }] },
  nouvelle_valeur: { dimensions: [{ type: "taux", valeur: taux, unite: "%", operateur: "exact" }] },
});

/* ----------------------------------------------------------------- désaccord */

describe("désaccord ordinaire « accepter » / « rejeter »", () => {
  const item = itemP();
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "accepter" }),
    decision({ annotateur_id: "a2", item, decision: "rejeter" }),
  ]);

  it("sans décision au registre, l'item reste en arbitrage, sans décision inapplicable", () => {
    const issue = evaluer(cas, []);
    expect(issue.sort === "arbitrage" && issue.motif).toBe("desaccord");
    expect(issue.sort === "arbitrage" && issue.decision_inapplicable).toBeUndefined();
  });

  it("tranché par l'auteur en « verifie » sur le contenu original : promu, bloc arbitrage et historique", () => {
    const tranche = decisionArbitrage(cas, {});
    const issue = evaluer(cas, [tranche]);
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.statut).toBe("verifie");
    expect(issue.corrections_appliquees).toBe(false);
    expect(issue.item.version).toBe(item.version);
    expect(issue.item.empreinte).toBe(item.empreinte);
    expect(issue.item.arbitrage).toEqual({
      decision_id: tranche.id,
      date: tranche.date,
      arbitre: "auteur",
      arbitre_seul: false,
      motif: "desaccord",
      issue: "verifie",
      motivation: tranche.motivation,
    });
    expect(JSON.stringify(issue.item.historique)).toContain(tranche.id);
    // Un item vérifié par arbitrage est conforme au schéma, validations discordantes comprises.
    expect(() => valider("item", issue.item, "item arbitré")).not.toThrow();
  });

  it("tranché en « rejete » : promu rejeté, sans contenu retenu", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "rejete" }))]);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
  });

  it("une issue « rejete » qui retient un contenu est inapplicable", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { issue: "rejete", contenu_retenu: "original" })]);
    expect(motifsInapplicables(issue).join()).toMatch(/ne se retient que pour l'issue « verifie »/);
  });

  it("le panel ne tranche pas un désaccord ordinaire, ni l'auteur marqué arbitre_seul", () => {
    expect(motifsInapplicables(evaluer(cas, [decisionArbitrage(cas, { arbitre: "panel" })])).join()).toMatch(/l'auteur/);
    expect(motifsInapplicables(evaluer(cas, [decisionArbitrage(cas, { arbitre_seul: true })])).join()).toMatch(/l'auteur/);
  });

  it("un contenu retenu inexistant est inapplicable", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "correction:a9" })]);
    expect(motifsInapplicables(issue).join()).toMatch(/aucune décision de l'annotateur a9/);
  });

  it("une correction retenue d'un annotateur qui n'en a proposé aucune est inapplicable", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "correction:a2" })]);
    expect(motifsInapplicables(issue).join()).toMatch(/n'a proposé aucune correction/);
  });

  it("une décision sur une version dépassée de l'item ne s'applique pas", () => {
    const tranche = decisionArbitrage(cas, { item_version: item.version + 1, item_empreinte: "f".repeat(64) });
    expect(motifsInapplicables(evaluer(cas, [tranche])).join()).toMatch(/dépassée/);
  });

  it("une décision prise sur un autre motif ne s'applique pas", () => {
    const tranche = decisionArbitrage(cas, { motif: "corrections_divergentes" });
    expect(motifsInapplicables(evaluer(cas, [tranche])).join()).toMatch(/« corrections_divergentes »/);
  });

  it("une décision d'un autre lot ne s'applique pas", () => {
    const tranche = decisionArbitrage(cas, { lot_id: "lot-002" });
    expect(motifsInapplicables(evaluer(cas, [tranche])).join()).toMatch(/lot-002/);
  });

  it("la dernière décision du registre fait foi", () => {
    const premiere = decisionArbitrage(cas, {});
    const seconde = sansContenu(decisionArbitrage(cas, { issue: "rejete" }));
    expect(decisionEnVigueur([premiere, seconde], item.id)).toBe(seconde);
    expect(evaluer(cas, [premiere, seconde]).sort === "promouvoir" && evaluer(cas, [premiere, seconde])).toMatchObject({
      statut: "rejete",
    });
  });
});

describe("paire « non évaluable » / « rejeter » : relève du panel", () => {
  const item = itemP();
  const decisions = [
    decision({ annotateur_id: "a1", item, decision: "non_evaluable" }),
    decision({ annotateur_id: "a2", item, decision: "rejeter" }),
  ];
  const cas = dossier(item, decisions);
  const nonEvaluable = { issue: "non_evaluable" as const };

  it("l'instance est le panel", () => {
    expect(instanceArbitrage(decisions)).toBe("panel");
  });

  it("l'auteur seul ne tranche que marqué arbitre_seul", () => {
    expect(motifsInapplicables(evaluer(cas, [sansContenu(decisionArbitrage(cas, nonEvaluable))])).join()).toMatch(/panel/);
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { ...nonEvaluable, arbitre_seul: true }))]);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("non_evaluable");
    expect(issue.sort === "promouvoir" && issue.item.arbitrage?.arbitre_seul).toBe(true);
  });

  it("le panel tranche, jamais marqué arbitre_seul", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { ...nonEvaluable, arbitre: "panel" }))]);
    expect(issue.sort === "promouvoir" && issue.item.arbitrage?.arbitre).toBe("panel");
    const incoherent = evaluer(cas, [sansContenu(decisionArbitrage(cas, { ...nonEvaluable, arbitre: "panel", arbitre_seul: true }))]);
    expect(motifsInapplicables(incoherent).join()).toMatch(/panel/);
  });

  it("aucun « accepter » : le contenu « original » n'est proposé par personne", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { arbitre_seul: true })]);
    expect(motifsInapplicables(issue).join()).toMatch(/proposé par aucun « accepter »/);
  });
});

/* ------------------------------------------------------- corrections, versions */

describe("corrections divergentes", () => {
  const item = itemP();
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [correctionTaux(5)] }),
    decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [correctionTaux(10)] }),
  ]);

  it("retenir la correction d'un annotateur applique la sienne : version + 1, empreinte recalculée", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "correction:a2" })]);
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.corrections_appliquees).toBe(true);
    expect(issue.item.version).toBe(item.version + 1);
    expect(issue.item.empreinte).not.toBe(item.empreinte);
    expect(issue.item.assertion?.quantification).toEqual(correctionTaux(10).nouvelle_valeur);
  });

  it("« paraphrase:<annotateur> » n'est pas admis hors arbitrage « paraphrase seule »", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "paraphrase:a2" })]);
    expect(motifsInapplicables(issue).join()).toMatch(/paraphrase seule/);
  });

  it("un contenu rédigé par l'arbitre n'est pas lisible comme contenu retenu", () => {
    expect(contenuRetenu(cas, "corrections_divergentes", "taux de 7,5 %")).toEqual({
      refus: 'contenu retenu illisible : "taux de 7,5 %"',
    });
  });
});

describe("paraphrase seule", () => {
  const item = itemP();
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [correctionParaphrase("Ramener la TVA sur l'énergie à 5,5 %.")] }),
    decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [correctionParaphrase("Ramener à 5,5 % la TVA sur l'énergie.")] }),
  ]);

  it("la paraphrase retenue est celle de l'annotateur nommé ; l'empreinte ne change pas", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "paraphrase:a1" })]);
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.item.assertion?.paraphrase).toBe("Ramener la TVA sur l'énergie à 5,5 %.");
    expect(issue.item.empreinte).toBe(item.empreinte);
    expect(issue.item.version).toBe(item.version + 1);
  });

  it("« correction:<annotateur> » n'est pas la forme admise pour une paraphrase seule", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "correction:a1" })]);
    expect(motifsInapplicables(issue).join()).toMatch(/paraphrase:<annotateur>/);
  });
});

describe("versions différentes", () => {
  const item = itemP({ version: 2 });
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [correctionTaux(10)], item_version: 1, item_empreinte: "e".repeat(64) }),
    decision({ annotateur_id: "a2", item, decision: "accepter" }),
  ]);

  it("le motif est « versions_differentes »", () => {
    const issue = evaluer(cas, []);
    expect(issue.sort === "arbitrage" && issue.motif).toBe("versions_differentes");
  });

  it("le contenu accepté sur la version courante peut être retenu", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, {})]);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("verifie");
  });

  it("une correction proposée sur une autre version ne l'est pas pour celle-ci", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, { contenu_retenu: "correction:a1" })]);
    expect(motifsInapplicables(issue).join()).toMatch(/autre version/);
  });
});

/* -------------------------------------------------------------------- item A */

describe("item A sans confirmation d'absence", () => {
  const item = itemA();
  const confirme = { couverture_theme_verifiee: true, corpus_complet: true, confirmation_absence: true };
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: confirme }),
    decision({ annotateur_id: "a2", item, decision: "accepter", questions_specifiques: { ...confirme, confirmation_absence: false } }),
  ]);

  it("le motif est « confirmation_absence_manquante »", () => {
    const issue = evaluer(cas, []);
    expect(issue.sort === "arbitrage" && issue.motif).toBe("confirmation_absence_manquante");
  });

  it("l'arbitre ne peut pas le vérifier (§4)", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, {})]);
    expect(motifsInapplicables(issue).join()).toMatch(/confirmé l'absence/);
  });

  it("il peut le rejeter", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "rejete" }))]);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
    expect(issue.sort === "promouvoir" && issue.item.absence?.confirmation_initiale).toBeUndefined();
  });
});

describe("item A en désaccord, absence confirmée par les deux", () => {
  const item = itemA();
  const confirme = { couverture_theme_verifiee: true, corpus_complet: true, confirmation_absence: true };
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: confirme }),
    decision({ annotateur_id: "a2", item, decision: "rejeter", questions_specifiques: confirme }),
  ]);

  it("vérifié par arbitrage : la confirmation initiale est inscrite", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, {})]);
    expect(issue.sort === "promouvoir" && issue.item.absence?.confirmation_initiale?.annotateurs).toEqual(["a1", "a2"]);
  });
});

/* -------------------------------------------------------------------- item F */

describe("item F sans confirmation de fictivité (§4, conformité 2026-11-03 n° 2)", () => {
  const item = itemF();
  const fictif = { fictivite_verifiee: true, plausibilite: true };
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: fictif }),
    decision({ annotateur_id: "a2", item, decision: "accepter", questions_specifiques: { ...fictif, fictivite_verifiee: false } }),
  ]);

  it("le motif est « confirmation_fictivite_manquante »", () => {
    const issue = evaluer(cas, []);
    expect(issue.sort === "arbitrage" && issue.motif).toBe("confirmation_fictivite_manquante");
  });

  it("l'arbitre ne peut pas le vérifier : deux annotateurs doivent confirmer (§4)", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, {})]);
    expect(motifsInapplicables(issue).join()).toMatch(/confirmé la fictivité/);
  });

  it("il peut le rejeter", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "rejete" }))]);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
  });

  it("il ne peut pas le rejeter sous le motif « texte extrait erroné » : un item F n'a aucune source de contenu", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "rejete", motif_rejet: "texte_extrait_errone" }))]);
    expect(motifsInapplicables(issue).join()).toMatch(/aucune source de contenu/);
  });
});

/* ---------------------------------------------- motif de rejet de l'arbitre (0.27) */

describe("motif de rejet porté par l'arbitre (§4, protocole 0.27)", () => {
  const item = itemP();
  const cas = dossier(item, [
    decision({ annotateur_id: "a1", item, decision: "accepter" }),
    decision({ annotateur_id: "a2", item, decision: "rejeter" }),
  ]);

  it("un rejet sous le motif le recopie dans le bloc arbitrage de l'item promu", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "rejete", motif_rejet: "texte_extrait_errone" }))]);
    if (issue.sort !== "promouvoir") throw new Error(`Attendu : promouvoir, obtenu ${issue.sort}`);
    expect(issue.item.arbitrage?.motif_rejet).toBe("texte_extrait_errone");
    expect(() => valider("item", issue.item, "item arbitré")).not.toThrow();
  });

  it("un rejet sans motif n'en écrit aucun : le champ est absent, jamais une valeur", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "rejete" }))]);
    expect(issue.sort === "promouvoir" && issue.item.arbitrage !== undefined && "motif_rejet" in issue.item.arbitrage).toBe(false);
  });

  it("un motif de rejet sur une autre issue ne s'applique pas", () => {
    const issue = evaluer(cas, [sansContenu(decisionArbitrage(cas, { issue: "non_evaluable", motif_rejet: "texte_extrait_errone" }))]);
    expect(motifsInapplicables(issue).join()).toMatch(/ne se porte que sur l'issue « rejete »/);
  });
});

/* -------------------------------------------------- correction de mesure refusée */

describe("correction de mesure refusée", () => {
  const item = itemP();
  const demande: Correction = {
    cible: "mesure",
    chemin: "/theme",
    ancienne_valeur: "fiscalite_pouvoir_achat",
    nouvelle_valeur: "ecologie_energie",
  };
  const refus: DecisionCorrectionMesure = {
    mesure_id: item.mesure_id,
    mesure_version: 1,
    theme_demande: "ecologie_energie",
    decision: "refusee",
    date: "2026-09-25",
    motif: "La mesure relève de la fiscalité.",
  };
  const cas = dossier(
    item,
    [
      decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [demande] }),
      decision({ annotateur_id: "a2", item, decision: "accepter" }),
    ],
    { registre_corrections_mesure: [refus] },
  );

  it("le motif est « correction_mesure_refusee »", () => {
    const issue = evaluer(cas, []);
    expect(issue.sort === "arbitrage" && issue.motif).toBe("correction_mesure_refusee");
  });

  it("l'arbitre retient le contenu accepté : promu vérifié, contenu inchangé", () => {
    const issue = evaluer(cas, [decisionArbitrage(cas, {})]);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("verifie");
    expect(issue.sort === "promouvoir" && issue.item.empreinte).toBe(item.empreinte);
  });
});
