/**
 * Contestation d'un item publié et décision du panel (protocole 0.10, §4 droit de réponse, annexe E ;
 * lot contestation-notification, V3). Les cas limites sont le sujet : 1 000 caractères comptés en
 * points de code après NFC, emoji et caractère combinant en bordure, texte vide, deuxième
 * contestation, contestation d'un item arbitré, version jugée périmée, décisions simultanées,
 * correction hors liste blanche ou citation hors source, décision déjà prise ou contestation
 * inexistante ; et le retour au tirage selon la décision.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contestationPermetLeTirage, DecisionsPanelSimultanees } from "../pipeline/questions/contestation.ts";
import { itemEngendreDesQuestions } from "../pipeline/questions/engendrement.ts";
import { verifierAjoutSeul } from "../validation/domaine/ajout-seul.ts";
import {
  ajouterContestation,
  appliquerDecisionPanel,
  ContestationDejaDecidee,
  ContestationEnDouble,
  ContestationInexistante,
  CorrectionsDuPanelRefusees,
  delaiDecisionJours,
  StatutPanelIncoherent,
  TexteContestationRefuse,
  texteDeContestation,
  VersionJugeePerimee,
  type Contestation,
  type DecisionDuPanel,
} from "../validation/domaine/contestation-item.ts";
import type { AccesTexte } from "../validation/domaine/corrections.ts";
import { evaluerPromotion } from "../validation/domaine/promotion.ts";
import type { Correction, Item, Source } from "../validation/domaine/types.ts";
import { creerItem, lireItem, reecrireItem } from "../validation/io/data-items.ts";
import { valider } from "../outils/schemas/valider.ts";
import { itemPromu } from "./aides/data.ts";
import { decision as decisionAnnotateur, itemP, mesure, OPTIONS_PROMOTION, source } from "./aides/fabriques.ts";

const TRACE = { date: "2026-10-01T10:00:00+02:00", commit: "c".repeat(40) };
const TRACE_DECISION = { date: "2026-10-20T10:00:00+02:00", commit: "d".repeat(40) };
const SOURCE = "Préambule. Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.";

function contestation(id = "01JBANCESSA1C0NTESTAT10N01", surcharges: Partial<Contestation> = {}): Contestation {
  return {
    id,
    date_reception: "2026-10-01T09:00:00+02:00",
    texte: "La source ne dit pas cela.",
    contestataire_type: "campagne",
    caviardage: false,
    ...surcharges,
  };
}

function decisionPanel(surcharges: Partial<DecisionDuPanel> = {}): DecisionDuPanel {
  return {
    contestation_id: "01JBANCESSA1C0NTESTAT10N01",
    decision: "maintien",
    version_jugee: 1,
    motivation: "La citation figure dans la source.",
    opinions_dissidentes: [],
    arbitre_seul: true,
    corrections: [],
    date: TRACE_DECISION.date,
    ...surcharges,
  };
}

const ACCES: AccesTexte = {
  texteSource: () => SOURCE,
  offsetsActuels: () => ({ debut: null, fin: null }),
};

function conteste(item: Item = itemPromu()): Item {
  return ajouterContestation(item, contestation(), TRACE);
}

function refus(action: () => unknown): Error {
  try {
    action();
  } catch (erreur) {
    return erreur as Error;
  }
  throw new Error("Aucun refus levé.");
}

/* -------------------------------------------------------------------- texte */

describe("texte de la contestation (§4 : 1 000 caractères, jamais tronqué)", () => {
  it("1 000 points de code : accepté tel quel", () => {
    expect(texteDeContestation("a".repeat(1000))).toHaveLength(1000);
  });

  it("1 001 points de code : refusé, jamais tronqué", () => {
    const erreur = refus(() => texteDeContestation("a".repeat(1001)));
    expect(erreur).toBeInstanceOf(TexteContestationRefuse);
    expect(erreur.message).toMatch(/1001/);
  });

  it("un emoji en bordure compte pour un point de code, pas deux unités UTF-16", () => {
    const texte = `${"a".repeat(999)}😀`;
    expect(texte.length).toBe(1001);
    expect(texteDeContestation(texte)).toBe(texte);
    expect(() => texteDeContestation(`${"a".repeat(1000)}😀`)).toThrow(TexteContestationRefuse);
  });

  it("un caractère combinant en bordure : compté après NFC", () => {
    // « e » + accent aigu combinant : deux points de code, un seul après NFC (« é »).
    const texte = `${"a".repeat(999)}é`;
    expect([...texte]).toHaveLength(1001);
    expect(texteDeContestation(texte)).toBe(`${"a".repeat(999)}é`);
    // Un combinant sans composé précomposé reste deux points de code, et fait déborder.
    expect(() => texteDeContestation(`${"a".repeat(999)}q́`)).toThrow(TexteContestationRefuse);
  });

  it("un texte vide ou fait d'espaces est refusé", () => {
    expect(() => texteDeContestation("")).toThrow(TexteContestationRefuse);
    expect(() => texteDeContestation(" \n\t")).toThrow(TexteContestationRefuse);
  });
});

/* ------------------------------------------------------------- contestation */

describe("ajouterContestation", () => {
  it("place l'item en « contestee », ajoute une entrée d'historique, ne touche pas au contenu", () => {
    const avant = itemPromu();
    const apres = conteste(avant);
    expect(apres.statut_contestation).toBe("contestee");
    expect(apres.contestations).toHaveLength(1);
    expect(apres.empreinte).toBe(avant.empreinte);
    expect(apres.version).toBe(avant.version);
    expect(() => verifierAjoutSeul(avant, apres, { corrections: false })).not.toThrow();
    expect(() => valider("item", apres, "item contesté")).not.toThrow();
  });

  it("l'item contesté sort du tirage (§5)", () => {
    expect(contestationPermetLeTirage(conteste())).toBe(false);
  });

  it("une deuxième contestation ouverte s'ajoute, l'item reste contesté", () => {
    const deux = ajouterContestation(conteste(), contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    expect(deux.contestations).toHaveLength(2);
    expect(deux.statut_contestation).toBe("contestee");
  });

  it("la même contestation deux fois est refusée", () => {
    expect(() => ajouterContestation(conteste(), contestation(), TRACE)).toThrow(ContestationEnDouble);
  });

  it("un texte de plus de 1 000 caractères est refusé même si l'appelant ne l'a pas contrôlé", () => {
    expect(() => ajouterContestation(itemPromu(), contestation(undefined, { texte: "a".repeat(1001) }), TRACE)).toThrow(
      TexteContestationRefuse,
    );
  });

  it("une contestation sur un item arbitré le repasse en « contestee »", () => {
    const arbitre = appliquerDecisionPanel(conteste(), decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(arbitre.statut_contestation).toBe("arbitree");
    const reconteste = ajouterContestation(arbitre, contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    expect(reconteste.statut_contestation).toBe("contestee");
    expect(contestationPermetLeTirage(reconteste)).toBe(false);
  });
});

/* --------------------------------------------------------------- panel */

describe("appliquerDecisionPanel", () => {
  it("maintien : arbitrée, réintégrée au tirage, statut de validation inchangé", () => {
    const avant = conteste();
    const { item, autorisation } = appliquerDecisionPanel(avant, decisionPanel(), TRACE_DECISION, ACCES);
    expect(item.statut_contestation).toBe("arbitree");
    expect(item.statut_validation).toBe("verifie");
    expect(contestationPermetLeTirage(item)).toBe(true);
    expect(() => verifierAjoutSeul(avant, item, autorisation)).not.toThrow();
    expect(() => valider("item", item, "item arbitré")).not.toThrow();
  });

  it("retrait : « retire_par_panel », sorti du tirage", () => {
    const { item } = appliquerDecisionPanel(conteste(), decisionPanel({ decision: "retrait" }), TRACE_DECISION, ACCES);
    expect(item.statut_validation).toBe("retire_par_panel");
    expect(contestationPermetLeTirage(item)).toBe(false);
  });

  it("non-évaluabilité : « non_evaluable », sorti du tirage", () => {
    const { item } = appliquerDecisionPanel(conteste(), decisionPanel({ decision: "non_evaluabilite" }), TRACE_DECISION, ACCES);
    expect(item.statut_validation).toBe("non_evaluable");
    expect(contestationPermetLeTirage(item)).toBe(false);
  });

  it("publie motivation, opinions dissidentes et arbitre_seul", () => {
    const { item } = appliquerDecisionPanel(
      conteste(),
      decisionPanel({ opinions_dissidentes: ["Un membre tient pour le retrait."] }),
      TRACE_DECISION,
      ACCES,
    );
    expect(item.contestations?.[0]).toMatchObject({
      decision_panel: {
        decision: "maintien",
        motivation: "La citation figure dans la source.",
        opinions_dissidentes: ["Un membre tient pour le retrait."],
        arbitre_seul: true,
      },
    });
  });

  it("une décision rendue après 14 jours est acceptée, et son délai se calcule", () => {
    const tard = { ...TRACE_DECISION, date: "2026-11-30T10:00:00+01:00" };
    const { item } = appliquerDecisionPanel(conteste(), decisionPanel({ date: tard.date }), tard, ACCES);
    expect(item.statut_contestation).toBe("arbitree");
    expect(delaiDecisionJours(contestation(), tard.date)).toBe(60);
  });

  it("deux contestations : arbitrée seulement quand les deux sont décidées", () => {
    const deux = ajouterContestation(conteste(), contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    const une = appliquerDecisionPanel(deux, decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(une.statut_contestation).toBe("contestee");
    const plus = { ...TRACE_DECISION, date: "2026-10-21T10:00:00+02:00" };
    const toutes = appliquerDecisionPanel(
      une,
      decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N02", date: plus.date }),
      plus,
      ACCES,
    ).item;
    expect(toutes.statut_contestation).toBe("arbitree");
  });

  it("deux décisions différentes au même instant sont refusées à l'écriture", () => {
    const deux = ajouterContestation(conteste(), contestation("01JBANCESSA1C0NTESTAT10N02"), TRACE);
    const une = appliquerDecisionPanel(deux, decisionPanel(), TRACE_DECISION, ACCES).item;
    const simultanee = decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N02", decision: "retrait" });
    expect(() => appliquerDecisionPanel(une, simultanee, TRACE_DECISION, ACCES)).toThrow(DecisionsPanelSimultanees);
  });

  it("une contestation inexistante ou déjà décidée est refusée", () => {
    expect(() =>
      appliquerDecisionPanel(conteste(), decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N09" }), TRACE_DECISION, ACCES),
    ).toThrow(ContestationInexistante);
    const decidee = appliquerDecisionPanel(conteste(), decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(() => appliquerDecisionPanel(decidee, decisionPanel(), TRACE_DECISION, ACCES)).toThrow(ContestationDejaDecidee);
  });

  it("une version jugée périmée est refusée", () => {
    expect(() => appliquerDecisionPanel(conteste(), decisionPanel({ version_jugee: 2 }), TRACE_DECISION, ACCES)).toThrow(
      VersionJugeePerimee,
    );
  });
});

describe("décision « correction » du panel", () => {
  const citation = (nouvelle: string): Correction => ({
    cible: "item",
    chemin: "/assertion/citation_verbatim",
    ancienne_valeur: "Nous ramènerons la TVA sur l'énergie à 5,5 %.",
    nouvelle_valeur: nouvelle,
  });

  it("corrige par la liste blanche : version + 1, empreinte recalculée, test verbatim rejoué", () => {
    const avant = conteste();
    const { item, autorisation } = appliquerDecisionPanel(
      avant,
      decisionPanel({ decision: "correction", corrections: [citation("Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.")] }),
      TRACE_DECISION,
      ACCES,
    );
    expect(item.version).toBe(avant.version + 1);
    expect(item.empreinte).not.toBe(avant.empreinte);
    expect(autorisation.corrections).toBe(true);
    expect(() => verifierAjoutSeul(avant, item, autorisation)).not.toThrow();
    expect(contestationPermetLeTirage(item)).toBe(true);
  });

  it("une citation corrigée absente de la source est refusée (test verbatim)", () => {
    const erreur = refus(() =>
      appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [citation("Une phrase inventée.")] }), TRACE_DECISION, ACCES),
    );
    expect(erreur).toBeInstanceOf(CorrectionsDuPanelRefusees);
    expect(erreur.message).toMatch(/citation_hors_source/);
  });

  it("une correction hors de la liste blanche est refusée", () => {
    const hors: Correction = { cible: "item", chemin: "/candidat_id", ancienne_valeur: "demo-alpha", nouvelle_valeur: "demo-autre" };
    const erreur = refus(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [hors] }), TRACE_DECISION, ACCES));
    expect(erreur).toBeInstanceOf(CorrectionsDuPanelRefusees);
    expect(erreur.message).toMatch(/chemin_interdit/);
  });

  it("une correction de la mesure (thème) n'est pas une correction d'item", () => {
    const theme: Correction = { cible: "mesure", chemin: "/theme", ancienne_valeur: "retraites", nouvelle_valeur: "sante" };
    const erreur = refus(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [theme] }), TRACE_DECISION, ACCES));
    expect(erreur).toBeInstanceOf(CorrectionsDuPanelRefusees);
    expect(erreur.message).toMatch(/pas la mesure/);
  });

  it("une valeur ancienne qui ne correspond plus à l'item est refusée", () => {
    const perimee = { ...citation("Nous ramènerons la TVA sur l'énergie à 5,5 %."), ancienne_valeur: "autre chose" };
    expect(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction", corrections: [perimee] }), TRACE_DECISION, ACCES)).toThrow(
      CorrectionsDuPanelRefusees,
    );
  });

  it("« correction » sans correction, ou corrections sans « correction », est refusé", () => {
    expect(() => appliquerDecisionPanel(conteste(), decisionPanel({ decision: "correction" }), TRACE_DECISION, ACCES)).toThrow(CorrectionsDuPanelRefusees);
    expect(() =>
      appliquerDecisionPanel(conteste(), decisionPanel({ corrections: [citation("Nous ramènerons la TVA sur l'énergie à 5,5 %.")] }), TRACE_DECISION, ACCES),
    ).toThrow(CorrectionsDuPanelRefusees);
  });
});

/* ------------------------------------------- réintégration après une sortie */

/**
 * §4 (droit de réponse) : « un maintien décidé sur un item que le panel avait retiré lui rend le
 * statut qu'il avait avant ce retrait » ; annexe E, point 6 : réintégration au tirage si l'item est
 * maintenu **ou corrigé**. Décision de l'auteur du 2026-09-29 : même règle après une
 * non-évaluabilité décidée par le panel. Le statut rendu est lu dans la décision publiée
 * (`statut_validation_anterieur`), jamais deviné.
 */
describe("réintégration après un retrait ou une non-évaluabilité du panel (§4, annexe E point 6)", () => {
  const JOURS = ["2026-10-20", "2026-10-22", "2026-10-24", "2026-10-26", "2026-10-28"];

  /** Un item promu par la vraie règle de promotion, sur deux décisions d'annotateurs identiques. */
  function promuPar(decisionAnnotateurs: "accepter" | "rejeter" | "non_evaluable"): Item {
    const item = itemP({});
    const issue = evaluerPromotion(
      {
        item,
        mesure: mesure({ id: item.mesure_id, version: item.mesure_version }),
        lot_id: "lot-001",
        lot_nature: "reel",
        decisions: ["a1", "a2"].map((annotateur_id) => decisionAnnotateur({ annotateur_id, item, decision: decisionAnnotateurs })),
        registre_corrections_mesure: [],
      },
      OPTIONS_PROMOTION,
    );
    if (issue.sort !== "promouvoir") throw new Error("L'item de départ aurait dû être promu.");
    return issue.item;
  }

  /** Contestation n° `rang`, reçue puis décidée le jour `JOURS[rang]`. */
  function contesterPuisDecider(item: Item, rang: number, surcharges: Partial<DecisionDuPanel>): Item {
    const id = `01JBANCESSA1C0NTESTAT10N${String(rang + 1).padStart(2, "0")}`;
    const jour = JOURS[rang];
    if (jour === undefined) throw new Error(`Aucun jour prévu pour la contestation de rang ${rang}.`);
    const recue = ajouterContestation(
      item,
      contestation(id, { date_reception: `${jour}T09:00:00+02:00` }),
      { ...TRACE, date: `${jour}T09:00:00+02:00` },
    );
    const date = `${jour}T15:00:00+02:00`;
    const decision = decisionPanel({ contestation_id: id, version_jugee: recue.version, date, ...surcharges });
    return appliquerDecisionPanel(recue, decision, { ...TRACE_DECISION, date }, ACCES).item;
  }

  function suite(item: Item, decisions: readonly Partial<DecisionDuPanel>[]): Item {
    return decisions.reduce((courant, surcharges, rang) => contesterPuisDecider(courant, rang, surcharges), item);
  }

  const RETRAIT = { decision: "retrait" } as const;
  const MAINTIEN = { decision: "maintien" } as const;
  const NON_EVALUABILITE = { decision: "non_evaluabilite" } as const;
  const CITATION_ACTUELLE = "Nous ramènerons la TVA sur l'énergie à 5,5 %.";

  it("maintien après un retrait : l'item reprend le statut qu'il avait avant le retrait, et rentre au tirage", () => {
    const retire = suite(itemPromu(), [RETRAIT]);
    expect(retire.statut_validation).toBe("retire_par_panel");
    const maintenu = contesterPuisDecider(retire, 1, MAINTIEN);
    expect(maintenu.statut_validation).toBe("verifie");
    expect(maintenu.statut_contestation).toBe("arbitree");
    expect(contestationPermetLeTirage(maintenu)).toBe(true);
    expect(itemEngendreDesQuestions(retire)).toBe(false);
    expect(itemEngendreDesQuestions(maintenu)).toBe(true);
    expect(() => valider("item", maintenu, "item maintenu après retrait")).not.toThrow();
  });

  it("une correction de la seule paraphrase incrémente la version et garde l'empreinte (§4)", () => {
    const publie = itemPromu();
    // Empreinte posée à la main : la recalculer en produirait une autre, donc la règle se voit.
    const avant = conteste({ ...publie, empreinte: "e".repeat(64) });
    const paraphrase: Correction = {
      cible: "item",
      chemin: "/assertion/paraphrase",
      ancienne_valeur: publie.assertion?.paraphrase,
      nouvelle_valeur: "Une autre façon de dire la même chose.",
    };
    const { item } = appliquerDecisionPanel(avant, decisionPanel({ decision: "correction", corrections: [paraphrase] }), TRACE_DECISION, ACCES);
    expect(item.version).toBe(avant.version + 1);
    expect(item.empreinte).toBe(avant.empreinte);
    expect(item.assertion?.paraphrase).toBe("Une autre façon de dire la même chose.");
  });

  it("correction après un retrait : l'item reprend son statut antérieur, version + 1", () => {
    const retire = suite(itemPromu(), [RETRAIT]);
    const correction: Correction = {
      cible: "item",
      chemin: "/assertion/citation_verbatim",
      ancienne_valeur: CITATION_ACTUELLE,
      nouvelle_valeur: `${CITATION_ACTUELLE} Et nous ferons plus encore.`,
    };
    const corrige = contesterPuisDecider(retire, 1, { decision: "correction", corrections: [correction] });
    expect(corrige.statut_validation).toBe("verifie");
    expect(corrige.version).toBe(retire.version + 1);
    expect(contestationPermetLeTirage(corrige)).toBe(true);
  });

  it("maintien après un retrait d'un item rejeté : il redevient rejeté, pas vérifié", () => {
    const rejete = promuPar("rejeter");
    expect(rejete.statut_validation).toBe("rejete");
    const maintenu = suite(rejete, [RETRAIT, MAINTIEN]);
    expect(maintenu.statut_validation).toBe("rejete");
  });

  it("maintien après une non-évaluabilité décidée par le panel : l'item reprend son statut antérieur", () => {
    const declare = suite(itemPromu(), [NON_EVALUABILITE]);
    expect(declare.statut_validation).toBe("non_evaluable");
    const maintenu = contesterPuisDecider(declare, 1, MAINTIEN);
    expect(maintenu.statut_validation).toBe("verifie");
    expect(contestationPermetLeTirage(maintenu)).toBe(true);
  });

  it("maintien sur un item non évaluable par la promotion, sans décision du panel : le statut ne change pas", () => {
    const nonEvaluable = promuPar("non_evaluable");
    expect(nonEvaluable.statut_validation).toBe("non_evaluable");
    const maintenu = suite(nonEvaluable, [MAINTIEN]);
    expect(maintenu.statut_validation).toBe("non_evaluable");
  });

  it("retrait, maintien, retrait, maintien : l'item reprend le statut d'origine", () => {
    const rejete = promuPar("rejeter");
    expect(suite(rejete, [RETRAIT, MAINTIEN, RETRAIT, MAINTIEN]).statut_validation).toBe("rejete");
    expect(suite(itemPromu(), [RETRAIT, MAINTIEN, RETRAIT, MAINTIEN]).statut_validation).toBe("verifie");
    // Deux sorties successives (retrait puis non-évaluabilité) : le maintien rend le statut
    // d'avant la première, pas « retire_par_panel ».
    expect(suite(itemPromu(), [RETRAIT, NON_EVALUABILITE, MAINTIEN]).statut_validation).toBe("verifie");
  });

  it("chaque décision publiée porte le statut de validation antérieur", () => {
    const item = suite(promuPar("rejeter"), [RETRAIT, MAINTIEN, NON_EVALUABILITE]);
    const anterieurs = (item.contestations ?? []).map(
      (publiee) => (publiee as { decision_panel: { statut_validation_anterieur: string } }).decision_panel.statut_validation_anterieur,
    );
    expect(anterieurs).toEqual(["rejete", "retire_par_panel", "rejete"]);
    expect(() => valider("item", item, "item aux trois décisions")).not.toThrow();
  });

  it("incohérence : « retire_par_panel » sans décision de retrait du panel est une erreur nommée", () => {
    const incoherent = { ...conteste(), statut_validation: "retire_par_panel" };
    const erreur = refus(() => appliquerDecisionPanel(incoherent, decisionPanel(), TRACE_DECISION, ACCES));
    expect(erreur).toBeInstanceOf(StatutPanelIncoherent);
    expect(erreur.message).toMatch(/retire_par_panel/);
    // Un statut qui ne correspond pas à la dernière sortie décidée est tout aussi incohérent.
    const retire = suite(itemPromu(), [RETRAIT]);
    const recue = ajouterContestation({ ...retire, statut_validation: "verifie" }, contestation("01JBANCESSA1C0NTESTAT10N09"), TRACE_DECISION);
    const date = "2026-10-30T15:00:00+01:00";
    expect(() =>
      appliquerDecisionPanel(recue, decisionPanel({ contestation_id: "01JBANCESSA1C0NTESTAT10N09", date }), { ...TRACE_DECISION, date }, ACCES),
    ).toThrow(StatutPanelIncoherent);
  });
});

/**
 * Conformité 2026-09-29, n° 6 ; décision de l'auteur du 2026-10-02 (texte à écrire au §4 en
 * 0.15) : « L'attestation n'existe que sur un item vérifié ; elle est conservée si le panel retire
 * ensuite l'item ou le déclare non évaluable. » Un item non évaluable par la double annotation,
 * jamais vérifié, ne la porte toujours pas.
 */
describe("non-évaluabilité décidée par le panel sur un item T2 (conformité n° 6)", () => {
  const ATTESTATION = { transcription_verifiee_par: ["a1", "a2"], transcription_verifiee_le: "2026-09-20" } as const;

  function sourceDe(item: Item): Source {
    if (item.assertion === undefined) throw new Error(`Item ${item.id} sans assertion.`);
    return item.assertion.source;
  }

  /** La source d'un enregistrement vidéo : un extrait, pas de page. */
  function sourceT2(): Source {
    const { page: _page, ...sansPage } = source({
      tier: "T2",
      type_document: "enregistrement_video",
      format: "video",
      url: "https://demo.invalid/emission",
      extrait: { debut: "00:42:10", fin: "00:43:05" },
    });
    return sansPage;
  }

  /** Un item P à source T2, promu par la vraie règle, les deux annotateurs ayant écouté l'extrait. */
  function promuT2(decisionAnnotateurs: "accepter" | "non_evaluable"): Item {
    const base = itemP();
    if (base.assertion === undefined) throw new Error("itemP sans assertion.");
    const item = itemP({ assertion: { ...base.assertion, source: sourceT2() } });
    const issue = evaluerPromotion(
      {
        item,
        mesure: mesure({ id: item.mesure_id, version: item.mesure_version }),
        lot_id: "lot-001",
        lot_nature: "reel",
        decisions: ["a1", "a2"].map((annotateur_id) =>
          decisionAnnotateur({ annotateur_id, item, decision: decisionAnnotateurs, questions_specifiques: { transcription_ecoutee: true } }),
        ),
        registre_corrections_mesure: [],
      },
      OPTIONS_PROMOTION,
    );
    if (issue.sort !== "promouvoir") throw new Error(`L'item de départ aurait dû être promu : ${JSON.stringify(issue)}`);
    return issue.item;
  }

  /** L'attestation posée à la main sur un item qui ne l'a pas reçue de la promotion. */
  function avecAttestation(item: Item): Item {
    if (item.assertion === undefined) throw new Error(`Item ${item.id} sans assertion.`);
    return { ...item, assertion: { ...item.assertion, source: { ...item.assertion.source, ...ATTESTATION } } };
  }

  /** Contestation n° `rang`, reçue puis décidée le 2`rang` octobre. */
  function decider(item: Item, rang: number, decision: DecisionDuPanel["decision"]): Item {
    const id = `01JBANCESSA1C0NTESTAT10N${String(rang + 1).padStart(2, "0")}`;
    const jour = `2026-10-2${rang}`;
    const recue = ajouterContestation(item, contestation(id, { date_reception: `${jour}T09:00:00+02:00` }), TRACE);
    const date = `${jour}T15:00:00+02:00`;
    const choix = decisionPanel({ contestation_id: id, version_jugee: recue.version, date, decision });
    return appliquerDecisionPanel(recue, choix, { ...TRACE_DECISION, date }, ACCES).item;
  }

  it("non-évaluabilité d'un item T2 vérifié : l'attestation est conservée, et l'item reste conforme au schéma", () => {
    const verifie = promuT2("accepter");
    expect(verifie.statut_validation).toBe("verifie");
    const attestation = sourceDe(verifie);
    expect(attestation.transcription_verifiee_par).toEqual(["a1", "a2"]);
    // Le chemin de `pnpm contester` puis de `pnpm panel --ecrire` : lireItem, décision, reecrireItem
    // (validation du schéma, puis ajout seul).
    const data = mkdtempSync(join(tmpdir(), "banc-panel-t2-"));
    try {
      creerItem(data, verifie);
      const recu = lireItem(data, verifie.id);
      reecrireItem(data, recu, ajouterContestation(recu.item, contestation(), TRACE), { corrections: false });
      const conteste = lireItem(data, verifie.id);
      const choix = decisionPanel({ decision: "non_evaluabilite", version_jugee: conteste.item.version });
      const { item: declare, autorisation } = appliquerDecisionPanel(conteste.item, choix, TRACE_DECISION, ACCES);
      expect(() => reecrireItem(data, conteste, declare, autorisation)).not.toThrow();
      const relu = lireItem(data, verifie.id).item;
      expect(relu.statut_validation).toBe("non_evaluable");
      expect(sourceDe(relu).transcription_verifiee_par).toEqual(attestation.transcription_verifiee_par);
      expect(sourceDe(relu).transcription_verifiee_le).toBe(attestation.transcription_verifiee_le);
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });

  it("item non évaluable par la double annotation, jamais vérifié, portant une attestation : invalide", () => {
    const nonEvaluable = promuT2("non_evaluable");
    expect(nonEvaluable.statut_validation).toBe("non_evaluable");
    expect(sourceDe(nonEvaluable).transcription_verifiee_par).toBeUndefined();
    expect(() => valider("item", nonEvaluable, "item non évaluable sans attestation")).not.toThrow();
    expect(() => valider("item", avecAttestation(nonEvaluable), "item non évaluable attesté")).toThrow(/\/assertion\/source/);
    // Une non-évaluabilité du panel posée ensuite ne lui ouvre pas l'attestation : il n'a jamais
    // été vérifié.
    const declareParLePanel = decider(nonEvaluable, 0, "non_evaluabilite");
    expect(declareParLePanel.statut_validation).toBe("non_evaluable");
    expect(() => valider("item", avecAttestation(declareParLePanel), "item jamais vérifié attesté")).toThrow(/\/assertion\/source/);
  });

  it("non-évaluabilité du panel puis maintien : le statut vérifié est rendu, l'attestation est toujours là", () => {
    const declare = decider(promuT2("accepter"), 0, "non_evaluabilite");
    const maintenu = decider(declare, 1, "maintien");
    expect(maintenu.statut_validation).toBe("verifie");
    expect(sourceDe(maintenu).transcription_verifiee_par).toEqual(["a1", "a2"]);
    expect(sourceDe(maintenu).transcription_verifiee_le).toBe(sourceDe(declare).transcription_verifiee_le);
    expect(() => valider("item", maintenu, "item maintenu après non-évaluabilité")).not.toThrow();
  });

  it("item non évaluable dont la dernière décision du panel est un maintien, portant une attestation : invalide", () => {
    // Non évaluable par la promotion, déclaré non évaluable par le panel, puis maintenu : il reste
    // non évaluable, et sa dernière décision n'est pas une non-évaluabilité.
    const maintenu = decider(decider(promuT2("non_evaluable"), 0, "non_evaluabilite"), 1, "maintien");
    expect(maintenu.statut_validation).toBe("non_evaluable");
    expect(() => valider("item", maintenu, "item maintenu non évaluable")).not.toThrow();
    expect(() => valider("item", avecAttestation(maintenu), "item maintenu non évaluable attesté")).toThrow(/\/assertion\/source/);
  });
});
