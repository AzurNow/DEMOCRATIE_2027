/**
 * Règle de promotion. Une ligne du tableau de décision, un test.
 *
 * C'est le seul chemin vers `data/` : une règle fausse ici fabrique un jeu de données de
 * référence faux, et tout ce qui en découle — questions, notations, métriques — mesure alors
 * autre chose que ce que le protocole annonce.
 */

import { describe, expect, it } from "vitest";
import {
  appliquerCorrections,
  cheminModifiable,
  evaluerPromotion,
  type Dossier,
} from "../validation/domaine/promotion.ts";
import { controlerSpecifiques } from "../validation/domaine/grille.ts";
import type { Correction, EntreeDecision, Item } from "../validation/domaine/types.ts";
import {
  decision,
  GRILLE_TOUT_VRAI,
  itemA,
  itemF,
  itemO,
  itemP,
  mesure,
  OPTIONS_PROMOTION,
} from "./aides/fabriques.ts";

function dossier(item: Item, decisions: readonly EntreeDecision[], surcharges: Partial<Dossier> = {}): Dossier {
  return {
    item,
    mesure: mesure(),
    lot_id: "lot-001",
    lot_nature: "reel",
    decisions,
    // Le registre des corrections de thème est passé, jamais chargé : `evaluerPromotion` reste
    // pure. Vide par défaut — aucune décision prise, donc aucune demande tranchée.
    registre_corrections_mesure: [],
    ...surcharges,
  };
}

const CONFIRME = { couverture_theme_verifiee: true, corpus_complet: true, confirmation_absence: true };

describe("accords", () => {
  it("deux « accepter » dont l'un répond non à la position univoque : vérifié, la réponse n'entre pas dans le sort", () => {
    // §4 : la réponse à « la position est-elle explicite et univoque » est un diagnostic, publié
    // avec le kappa par question, et n'entre pas dans le sort de l'item.
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({
          annotateur_id: "a2",
          item,
          decision: "accepter",
          reponses_grille: { ...GRILLE_TOUT_VRAI, position_univoque: false },
        }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.statut).toBe("verifie");
  });

  it("deux « accepter » sur la même version : item vérifié", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({ annotateur_id: "a2", item, decision: "accepter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.statut).toBe("verifie");
    expect(issue.corrections_appliquees).toBe(false);
    expect(issue.item.version).toBe(item.version);
    expect(issue.item.empreinte).toBe(item.empreinte);
    expect(issue.item.validations).toHaveLength(2);
  });

  it("deux « rejeter » : item rejeté, conservé, jamais supprimé", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "rejeter" }),
        decision({ annotateur_id: "a2", item, decision: "rejeter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
  });

  it("deux « non évaluable » : item non évaluable, conservé dans le jeu de données", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "non_evaluable" }),
        decision({ annotateur_id: "a2", item, decision: "non_evaluable" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("non_evaluable");
  });
});

describe("deux corrections", () => {
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

  it("même contenu notant et même paraphrase : vérifié, version incrémentée", () => {
    const item = itemP();
    const meme = correctionParaphrase("Ramener la TVA sur l'énergie à 5,5 %.");
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [meme] }),
        decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [meme] }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.statut).toBe("verifie");
    expect(issue.corrections_appliquees).toBe(true);
    expect(issue.item.version).toBe(item.version + 1);
    expect(issue.item.assertion?.paraphrase).toBe("Ramener la TVA sur l'énergie à 5,5 %.");
    // La paraphrase est hors du contenu notant : l'empreinte ne bouge pas, la version si.
    // Ce que l'outil sera jugé sur n'a pas changé ; ce que l'humain lit, oui.
    expect(issue.item.empreinte).toBe(item.empreinte);
  });

  it("une correction du contenu notant change l'empreinte et la version", () => {
    const item = itemP();
    const meme = correctionTaux(10);
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [meme] }),
        decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [meme] }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.item.version).toBe(item.version + 1);
    expect(issue.item.empreinte).not.toBe(item.empreinte);
    expect(issue.item.empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it("contenu notant identique, paraphrases divergentes : arbitrage « paraphrase seule »", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({
          annotateur_id: "a1",
          item,
          decision: "corriger",
          corrections: [correctionParaphrase("Ramener la TVA sur l'énergie à 5,5 %.")],
        }),
        decision({
          annotateur_id: "a2",
          item,
          decision: "corriger",
          corrections: [correctionParaphrase("Ramener à 5,5 % la TVA sur l'énergie.")],
        }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("paraphrase_seule");
  });

  it("contenus notants divergents : arbitrage ordinaire", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [correctionTaux(5.5)] }),
        decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [correctionTaux(10)] }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("corrections_divergentes");
  });
});

describe("désaccords", () => {
  it("« accepter » contre « corriger » : arbitrage", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({
          annotateur_id: "a2",
          item,
          decision: "corriger",
          corrections: [
            { cible: "item", chemin: "/assertion/paraphrase", ancienne_valeur: "x", nouvelle_valeur: "y" },
          ],
        }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("desaccord");
  });

  it("« rejeter » contre « accepter » : arbitrage", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "rejeter" }),
        decision({ annotateur_id: "a2", item, decision: "accepter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("desaccord");
  });

  it("« rejeter » contre « non évaluable » : arbitrage, car les deux statuts finaux diffèrent", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "rejeter" }),
        decision({ annotateur_id: "a2", item, decision: "non_evaluable" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("desaccord");
  });
});

describe("exception de non-évaluabilité (§4)", () => {
  it("« non évaluable » contre « accepter » : non évaluable, sans arbitrage", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "non_evaluable" }),
        decision({ annotateur_id: "a2", item, decision: "accepter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("non_evaluable");
  });

  it("« non évaluable » contre « corriger » : non évaluable, et la correction n'est pas appliquée", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({
          annotateur_id: "a1",
          item,
          decision: "corriger",
          corrections: [
            {
              cible: "item",
              chemin: "/assertion/paraphrase",
              ancienne_valeur: "x",
              nouvelle_valeur: "réécriture",
            },
          ],
        }),
        decision({ annotateur_id: "a2", item, decision: "non_evaluable" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.statut).toBe("non_evaluable");
    expect(issue.item.assertion?.paraphrase).not.toBe("réécriture");
    expect(issue.item.version).toBe(item.version);
  });

  it("l'ordre des deux décisions ne change rien", () => {
    const item = itemP();
    const inverse = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a2", item, decision: "accepter" }),
        decision({ annotateur_id: "a1", item, decision: "non_evaluable" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(inverse.sort === "promouvoir" && inverse.statut).toBe("non_evaluable");
  });
});

describe("barrages", () => {
  it("un lot d'entraînement ne promeut jamais", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(
        item,
        [
          decision({ annotateur_id: "a1", item, decision: "accepter", lot_nature: "entrainement" }),
          decision({ annotateur_id: "a2", item, decision: "accepter", lot_nature: "entrainement" }),
        ],
        { lot_nature: "entrainement" },
      ),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "attente" && issue.motif).toBe("lot_entrainement");
  });

  it("un item contesté ne promeut jamais, même sur deux accords", () => {
    const item = itemP({ statut_contestation: "contestee" });
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({ annotateur_id: "a2", item, decision: "accepter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "attente" && issue.motif).toBe("item_conteste");
  });

  it("une seule décision ne suffit pas", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [decision({ annotateur_id: "a1", item, decision: "accepter" })]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "attente" && issue.motif).toBe("decisions_insuffisantes");
  });

  it("deux décisions du même annotateur ne sont pas deux validations", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "attente" && issue.motif).toBe("decisions_insuffisantes");
  });

  it("deux décisions portant sur deux versions de l'item partent en arbitrage", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({ annotateur_id: "a2", item, decision: "accepter", item_version: 2 }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("versions_differentes");
  });

  it("même version mais empreinte différente : arbitrage aussi", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter" }),
        decision({ annotateur_id: "a2", item, decision: "accepter", item_empreinte: "f".repeat(64) }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("versions_differentes");
  });
});

describe("items d'absence", () => {
  it("refuse de promouvoir sans les deux confirmations explicites", () => {
    const item = itemA();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: CONFIRME }),
        decision({
          annotateur_id: "a2",
          item,
          decision: "accepter",
          questions_specifiques: { ...CONFIRME, confirmation_absence: false },
        }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("confirmation_absence_manquante");
  });

  it("inscrit la confirmation initiale dans l'item promu", () => {
    const item = itemA();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a2", item, decision: "accepter", questions_specifiques: CONFIRME }),
        decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: CONFIRME }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    expect(issue.item.absence?.confirmation_initiale).toEqual({
      lot_id: "lot-001",
      date: OPTIONS_PROMOTION.horodatage,
      annotateurs: ["a1", "a2"],
    });
  });

  it("un rejet d'item A n'exige aucune confirmation d'absence", () => {
    const item = itemA();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "rejeter", questions_specifiques: CONFIRME }),
        decision({
          annotateur_id: "a2",
          item,
          decision: "rejeter",
          questions_specifiques: { ...CONFIRME, confirmation_absence: false },
        }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
  });
});

/**
 * §4.126 (conformité 2026-11-03 n° 2) : « Il n'est vérifié que si deux annotateurs confirment, par
 * la grille de son type, que la mesure est absente des corpus balayés. » La question de la grille F
 * qui le confirme est `fictivite_verifiee` ; même mécanique que la confirmation d'absence d'un item A.
 */
describe("items fictifs", () => {
  const FICTIF = { fictivite_verifiee: true, plausibilite: true };

  function deuxAccepter(item: Item, premiere: boolean, seconde: boolean) {
    return evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: { ...FICTIF, fictivite_verifiee: premiere } }),
        decision({ annotateur_id: "a2", item, decision: "accepter", questions_specifiques: { ...FICTIF, fictivite_verifiee: seconde } }),
      ]),
      OPTIONS_PROMOTION,
    );
  }

  it("deux « accepter » qui confirment tous deux la fictivité : item vérifié", () => {
    const issue = deuxAccepter(itemF(), true, true);
    expect(issue.sort === "promouvoir" && issue.statut).toBe("verifie");
  });

  it("deux « accepter », un oui un non à la fictivité : arbitrage « confirmation_fictivite_manquante »", () => {
    expect(deuxAccepter(itemF(), true, false)).toEqual({ sort: "arbitrage", motif: "confirmation_fictivite_manquante" });
    expect(deuxAccepter(itemF(), false, true)).toEqual({ sort: "arbitrage", motif: "confirmation_fictivite_manquante" });
  });

  it("deux « accepter », deux non à la fictivité : arbitrage « confirmation_fictivite_manquante »", () => {
    expect(deuxAccepter(itemF(), false, false)).toEqual({ sort: "arbitrage", motif: "confirmation_fictivite_manquante" });
  });

  it("réponse absente à la fictivité : refusée dès la décision par le contrôle de la grille", () => {
    expect(controlerSpecifiques(itemF(), { plausibilite: true })).toEqual([{ cle: "fictivite_verifiee", probleme: "sans_reponse" }]);
  });

  it("deux « accepter » sans réponse à la fictivité (ligne écrite hors de l'interface) : jamais vérifié", () => {
    const item = itemF();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "accepter", questions_specifiques: FICTIF }),
        decision({ annotateur_id: "a2", item, decision: "accepter" }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue).toEqual({ sort: "arbitrage", motif: "confirmation_fictivite_manquante" });
  });

  it("deux « rejeter » d'un item F n'exigent aucune confirmation de fictivité", () => {
    const item = itemF();
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "rejeter", questions_specifiques: { ...FICTIF, fictivite_verifiee: false } }),
        decision({ annotateur_id: "a2", item, decision: "rejeter", questions_specifiques: { ...FICTIF, fictivite_verifiee: false } }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("rejete");
  });
});

describe("items obsolètes", () => {
  it("réduit les deux grilles par ET vers les cinq clés de l'item", () => {
    const item = itemO();
    // Modifié ouvertement (conformité n° 12) : l'état postérieur de `itemO()` est T2, la question
    // d'écoute est donc posée et l'item n'est vérifié qu'avec deux « oui ». Sans eux, il partirait
    // en arbitrage « transcription_non_verifiee » et ce test ne vérifierait plus la réduction.
    const specifiques = { changement_explicite: true, transcription_ecoutee: true };
    const issue = evaluerPromotion(
      dossier(item, [
        decision({
          annotateur_id: "a1",
          item,
          decision: "accepter",
          questions_specifiques: specifiques,
          reponses_par_etat: {
            anterieur: { ...GRILLE_TOUT_VRAI, theme_correct: null, quantification_correcte: null },
            posterieur: { ...GRILLE_TOUT_VRAI, quantification_correcte: null },
          },
        }),
        decision({
          annotateur_id: "a2",
          item,
          decision: "accepter",
          questions_specifiques: specifiques,
          reponses_par_etat: {
            anterieur: {
              ...GRILLE_TOUT_VRAI,
              paraphrase_exacte: false,
              theme_correct: null,
              quantification_correcte: null,
            },
            posterieur: { ...GRILLE_TOUT_VRAI, quantification_correcte: null },
          },
        }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort).toBe("promouvoir");
    if (issue.sort !== "promouvoir") return;
    const validations = issue.item.validations as readonly { reponses_grille: unknown }[];
    expect(validations[0]?.reponses_grille).toEqual({
      citation_fidele: true,
      paraphrase_exacte: true,
      position_univoque: true,
      theme_correct: true,
      quantification_correcte: null,
    });
    // false chez un seul annotateur sur un seul état suffit à faire false après réduction.
    expect(validations[1]?.reponses_grille).toEqual({
      citation_fidele: true,
      paraphrase_exacte: false,
      position_univoque: true,
      theme_correct: true,
      quantification_correcte: null,
    });
  });
});

describe("corrections visant la mesure", () => {
  it("retient l'item tant que la mesure ne porte pas le thème demandé", () => {
    const item = itemF();
    const correction: Correction = {
      cible: "mesure",
      chemin: "/theme",
      ancienne_valeur: "fiscalite_pouvoir_achat",
      nouvelle_valeur: "ecologie_energie",
    };
    const issue = evaluerPromotion(
      dossier(
        item,
        [
          decision({
            annotateur_id: "a1",
            item,
            decision: "corriger",
            corrections: [correction],
            questions_specifiques: { fictivite_verifiee: true, plausibilite: true },
          }),
          decision({
            annotateur_id: "a2",
            item,
            decision: "corriger",
            corrections: [correction],
            questions_specifiques: { fictivite_verifiee: true, plausibilite: true },
          }),
        ],
        { mesure: mesure({ theme: "fiscalite_pouvoir_achat" }) },
      ),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "attente" && issue.motif).toBe("correction_mesure_en_attente");
  });

  it("promeut sans revalidation une fois la mesure corrigée", () => {
    const item = itemF();
    const correction: Correction = {
      cible: "mesure",
      chemin: "/theme",
      ancienne_valeur: "fiscalite_pouvoir_achat",
      nouvelle_valeur: "ecologie_energie",
    };
    const issue = evaluerPromotion(
      dossier(
        item,
        [
          decision({
            annotateur_id: "a1",
            item,
            decision: "corriger",
            corrections: [correction],
            questions_specifiques: { fictivite_verifiee: true, plausibilite: true },
          }),
          decision({
            annotateur_id: "a2",
            item,
            decision: "corriger",
            corrections: [correction],
            questions_specifiques: { fictivite_verifiee: true, plausibilite: true },
          }),
        ],
        {
          mesure: mesure({ theme: "ecologie_energie" }),
          // §4 : la promotion demande une demande **acceptée** au registre, et une mesure qui
          // porte effectivement le thème. La mesure corrigée sans décision tracée reste en
          // attente — c'est le cas testé juste au-dessus.
          registre_corrections_mesure: [
            {
              mesure_id: mesure().id,
              mesure_version: 1,
              theme_demande: "ecologie_energie",
              decision: "acceptee",
              date: "2026-09-21",
            },
          ],
        },
      ),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("verifie");
  });
});

describe("champs modifiables", () => {
  it("autorise exactement les champs de contenu, et rien d'autre", () => {
    expect(cheminModifiable("/assertion/paraphrase")).toBe(true);
    expect(cheminModifiable("/assertion/citation_verbatim")).toBe(true);
    expect(cheminModifiable("/assertion/quantification")).toBe(true);
    expect(cheminModifiable("/obsolescence/etat_posterieur/position")).toBe(true);
    expect(cheminModifiable("/valide_au")).toBe(true);

    expect(cheminModifiable("/id")).toBe(false);
    expect(cheminModifiable("/empreinte")).toBe(false);
    expect(cheminModifiable("/mesure_id")).toBe(false);
    expect(cheminModifiable("/statut_validation")).toBe(false);
    expect(cheminModifiable("/assertion/source/sha256")).toBe(false);
    expect(cheminModifiable("/assertion/source/url")).toBe(false);
  });

  it("lève plutôt que d'écrire hors de la liste blanche", () => {
    expect(() =>
      appliquerCorrections(itemP(), [
        { cible: "item", chemin: "/statut_validation", ancienne_valeur: "en_attente", nouvelle_valeur: "verifie" },
      ]),
    ).toThrow(/non modifiable/);
  });

  it("ne modifie pas l'item reçu", () => {
    const item = itemP();
    const avant = JSON.stringify(item);
    appliquerCorrections(item, [
      {
        cible: "item",
        chemin: "/assertion/paraphrase",
        ancienne_valeur: item.assertion?.paraphrase,
        nouvelle_valeur: "autre chose",
      },
    ]);
    expect(JSON.stringify(item)).toBe(avant);
  });
});
