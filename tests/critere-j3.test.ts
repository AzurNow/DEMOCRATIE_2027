/**
 * Critère J3 (§12, protocole 0.28, D70 (5)) : accord suffisant sur les deux derniers lots réels ou
 * de réannotation de taille conforme, hors entraînement, « dans l'ordre de leur clôture, un lot
 * étant clos quand ses deux annotateurs l'ont terminé, celui du lot de réannotation comptant seul
 * quand un lot a été réannoté ».
 *
 * Deux étages, testés séparément : l'instant de clôture d'un lot, lu sur les journaux (horodatage
 * de l'entrée qui achève le lot de chaque annotateur, le plus tardif des deux) ; puis le verdict,
 * sur les diagnostics publiés retenus pour le §12 et ces instants.
 */

import { describe, expect, it } from "vitest";
import { lesDeuxOntFini } from "../validation/domaine/analyse-lot.ts";
import {
  clotureDuLot,
  ClotureInconnue,
  ContestationSansDateDeReception,
  DiagnosticManquant,
  finAnnotateur,
  verdictJ3,
  type Cloture,
} from "../validation/domaine/critere-j3.ts";
import { construireAnnulation, construireRetrait } from "../validation/domaine/decision.ts";
import type { DiagnosticPublie, KappaPublie } from "../validation/domaine/diagnostic-publie.ts";
import { rejouer, type EtatAnnotateur } from "../validation/domaine/journal.ts";
import type { EntreeJournal, Item, Lot } from "../validation/domaine/types.ts";
import { lotDe } from "./aides/bac.ts";
import { decision, itemP } from "./aides/fabriques.ts";

/* ------------------------------------------------------------ aides : verdict */

const KAPPA_QUESTION: KappaPublie = { kappa: 0.9, accord_observe: 0.96, n: 50 };

function diagnostic(lot_id: string, surcharges: Partial<DiagnosticPublie> = {}): DiagnosticPublie {
  return {
    lot_id,
    nature: "reel",
    date_calcul: "2026-11-10T12:00:00+01:00",
    kappa: 0.9,
    accord_observe: 0.98,
    n: 50,
    accord_suffisant: true,
    kappa_par_question: {
      citation_fidele: KAPPA_QUESTION,
      paraphrase_exacte: KAPPA_QUESTION,
      position_univoque: KAPPA_QUESTION,
      theme_correct: KAPPA_QUESTION,
      quantification_correcte: KAPPA_QUESTION,
    },
    exclus_contestation: 0,
    taille_lot: 50,
    taille_attendue: 50,
    taille_conforme: true,
    reannote: null,
    date_calibration: null,
    supersede_par: null,
    ...surcharges,
  };
}

const ITEM = itemP({ id: "01JBANCESSA1000000J3ITEM001" });

function lot(lot_id: string, nature: Lot["nature"] = "reel", reannote?: string): Lot {
  const base = lotDe(lot_id, [ITEM], nature);
  return reannote === undefined ? base : { ...base, reannote, date_calibration: "2026-11-01" };
}

function close(instant: string): Cloture {
  return { clos: true, instant };
}

const OUVERT: Cloture = { clos: false };

function clotures(entrees: Record<string, Cloture>): ReadonlyMap<string, Cloture> {
  return new Map(Object.entries(entrees));
}

/* ---------------------------------------------------------- aides : clôture */

const A = itemP({ id: "01JBANCESSA1000000J3ITEM00A", candidat_id: "demo-alpha" });
const B = itemP({ id: "01JBANCESSA1000000J3ITEM00B", candidat_id: "demo-beta" });
const LOT_AB = lotDe("lot-020", [A, B], "reel");
const ITEMS_AB: ReadonlyMap<string, Item> = new Map([
  [A.id, A],
  [B.id, B],
]);

let rangContestation = 0;

/** Une contestation conforme à `item.schema.json`, reçue à `date_reception`. */
function contestation(date_reception: string): Record<string, unknown> {
  rangContestation += 1;
  return {
    id: `01JBANCESSA1C0NTEST${String(rangContestation).padStart(7, "0")}`,
    date_reception,
    texte: "Position mal rapportée.",
    contestataire_type: "campagne",
    caviardage: false,
  };
}

/** A contesté (et donc sorti du dénominateur) avec ces contestations ; B inchangé. */
function itemsAvecAConteste(contestations: readonly unknown[]): ReadonlyMap<string, Item> {
  return new Map([
    [A.id, { ...A, statut_contestation: "contestee", contestations }],
    [B.id, B],
  ]);
}

let rangEntree = 0;

function decide(annotateur_id: string, item: Item, horodatage: string): EntreeJournal {
  return { ...decision({ annotateur_id, item, decision: "accepter", lot_id: LOT_AB.lot_id }), horodatage };
}

function retrait(annotateur_id: string, item: Item, horodatage: string): EntreeJournal {
  rangEntree += 1;
  return construireRetrait({
    identifiant: `01JBANCESSA1RETRA1T${String(rangEntree).padStart(7, "0")}`,
    annotateur_id,
    lot_id: LOT_AB.lot_id,
    lot_nature: "reel",
    item_id: item.id,
    motif: "item contestee",
    horodatage,
  });
}

function annulation(annotateur_id: string, cible: EntreeJournal, horodatage: string): EntreeJournal {
  rangEntree += 1;
  return construireAnnulation({
    identifiant: `01JBANCESSA1ANNUL0N${String(rangEntree).padStart(7, "0")}`,
    annotateur_id,
    lot_id: LOT_AB.lot_id,
    lot_nature: "reel",
    item_id: cible.item_id,
    annule: cible.id,
    horodatage,
  });
}

function etats(a1: readonly EntreeJournal[], a2: readonly EntreeJournal[]): ReadonlyMap<string, EtatAnnotateur> {
  return new Map([
    ["a1", rejouer(a1)],
    ["a2", rejouer(a2)],
  ]);
}

/* ------------------------------------------------------------- clôture d'un lot */

describe("instant de clôture d'un lot (§12 : clos quand ses deux annotateurs l'ont terminé)", () => {
  it("la clôture est l'instant où le second annotateur termine, pas le premier", () => {
    const a1 = [decide("a1", A, "2026-11-04T09:00:00+01:00"), decide("a1", B, "2026-11-04T09:05:00+01:00")];
    const a2 = [decide("a2", B, "2026-11-05T14:00:00+01:00"), decide("a2", A, "2026-11-05T14:10:00+01:00")];
    expect(clotureDuLot({ lot: LOT_AB, items: ITEMS_AB, etats: etats(a1, a2) })).toEqual(
      close("2026-11-05T14:10:00+01:00"),
    );
  });

  it("un lot terminé par un seul annotateur n'est pas clos", () => {
    const a1 = [decide("a1", A, "2026-11-04T09:00:00+01:00"), decide("a1", B, "2026-11-04T09:05:00+01:00")];
    const a2 = [decide("a2", A, "2026-11-05T14:00:00+01:00")];
    expect(clotureDuLot({ lot: LOT_AB, items: ITEMS_AB, etats: etats(a1, a2) })).toEqual(OUVERT);
  });

  it("le plus tardif des deux se lit sur l'instant réel, décalages comparés, pas sur la chaîne", () => {
    const a1 = [decide("a1", A, "2026-11-04T09:00:00+01:00"), decide("a1", B, "2026-11-05T10:00:00+01:00")];
    // 09:30Z = 10:30+01:00 : plus tardif, bien que la chaîne soit « plus petite ».
    const a2 = [decide("a2", A, "2026-11-04T08:00:00Z"), decide("a2", B, "2026-11-05T09:30:00Z")];
    expect(clotureDuLot({ lot: LOT_AB, items: ITEMS_AB, etats: etats(a1, a2) })).toEqual(
      close("2026-11-05T09:30:00Z"),
    );
  });

  it("un annotateur qui annule sa dernière décision puis redécide termine à la redécision", () => {
    const derniere = decide("a1", B, "2026-11-04T09:05:00+01:00");
    const a1 = [
      decide("a1", A, "2026-11-04T09:00:00+01:00"),
      derniere,
      annulation("a1", derniere, "2026-11-04T09:06:00+01:00"),
      decide("a1", B, "2026-11-04T09:20:00+01:00"),
    ];
    expect(finAnnotateur(LOT_AB, rejouer(a1))).toBe("2026-11-04T09:20:00+01:00");
  });

  it("un item retiré pour contestation et journalisé compte comme traité : la fin est l'entrée qui achève", () => {
    const AC: Item = { ...A, statut_contestation: "contestee" };
    const items = new Map([
      [A.id, AC],
      [B.id, B],
    ]);
    const a1 = [retrait("a1", A, "2026-11-04T09:00:00+01:00"), decide("a1", B, "2026-11-04T09:00:00+01:00")];
    const a2 = [decide("a2", A, "2026-11-04T08:00:00+01:00"), decide("a2", B, "2026-11-04T08:30:00+01:00")];
    expect(clotureDuLot({ lot: LOT_AB, items, etats: etats(a1, a2) })).toEqual(close("2026-11-04T09:00:00+01:00"));
  });

  it("lot achevé par une contestation sans journal : clos à la date de réception de la contestation (§12, 0.29)", () => {
    // a1 n'a jamais décidé A, ni écrit de retrait : la contestation de A, reçue après sa dernière
    // écriture, a achevé le lot. Aucun journal ne date cet instant : c'est date_reception.
    const items = itemsAvecAConteste([contestation("2026-11-04T11:00:00+01:00")]);
    const entrees = etats(
      [decide("a1", B, "2026-11-04T09:00:00+01:00")],
      [decide("a2", A, "2026-11-04T08:00:00+01:00"), decide("a2", B, "2026-11-04T08:30:00+01:00")],
    );
    expect(lesDeuxOntFini({ lot: LOT_AB, items, etats: entrees })).toBe(true);
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-04T11:00:00+01:00"));
  });

  it("contestation reçue avant la dernière écriture qui achève : c'est le journal qui date la clôture", () => {
    const items = itemsAvecAConteste([contestation("2026-11-04T07:00:00+01:00")]);
    const entrees = etats(
      [decide("a1", B, "2026-11-04T09:00:00+01:00")],
      [decide("a2", A, "2026-11-04T08:00:00+01:00"), decide("a2", B, "2026-11-04T08:30:00+01:00")],
    );
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-04T09:00:00+01:00"));
  });

  it("lot terminé par ses deux annotateurs ET contesté ensuite : la date des journaux prime", () => {
    const items = itemsAvecAConteste([contestation("2026-11-06T10:00:00+01:00")]);
    const entrees = etats(
      [decide("a1", A, "2026-11-04T09:00:00+01:00"), decide("a1", B, "2026-11-04T09:05:00+01:00")],
      [decide("a2", A, "2026-11-05T08:00:00+01:00"), decide("a2", B, "2026-11-05T08:30:00+01:00")],
    );
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-05T08:30:00+01:00"));
  });

  it("item recontesté (deux contestations sur le même item non couvert) : clos à sa première réception (§12, 0.30)", () => {
    const items = itemsAvecAConteste([contestation("2026-11-04T11:00:00+01:00"), contestation("2026-11-04T12:00:00+01:00")]);
    const entrees = etats([decide("a1", B, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]);
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-04T11:00:00+01:00"));
  });

  it("item recontesté, contestations enregistrées hors de l'ordre chronologique : la première réception se lit sur l'instant réel", () => {
    // 10:30Z = 11:30+01:00, plus tardive que 11:00+01:00 bien que listée d'abord et lexicographiquement plus petite.
    const items = itemsAvecAConteste([contestation("2026-11-04T10:30:00Z"), contestation("2026-11-04T11:00:00+01:00")]);
    const entrees = etats([decide("a1", B, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]);
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-04T11:00:00+01:00"));
  });

  it("deux items non couverts contestés à des dates différentes : clos à la plus tardive des premières réceptions (§12, 0.30)", () => {
    const items: ReadonlyMap<string, Item> = new Map([
      [
        A.id,
        {
          ...A,
          statut_contestation: "contestee",
          contestations: [contestation("2026-11-04T11:00:00+01:00"), contestation("2026-11-04T15:00:00+01:00")],
        },
      ],
      [B.id, { ...B, statut_contestation: "contestee", contestations: [contestation("2026-11-04T12:00:00+01:00")] }],
    ]);
    const entrees = etats([decide("a1", A, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]);
    expect(lesDeuxOntFini({ lot: LOT_AB, items, etats: entrees })).toBe(true);
    // A : première réception 11:00 (sa recontestation de 15:00 ne compte pas) ; B : 12:00. La plus tardive : 12:00.
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-04T12:00:00+01:00"));
  });

  it("plusieurs contestations, fin de journal plus tardive que la plus tardive des premières réceptions : la fin de journal l'emporte", () => {
    const items: ReadonlyMap<string, Item> = new Map([
      [A.id, { ...A, statut_contestation: "contestee", contestations: [contestation("2026-11-04T07:00:00+01:00")] }],
      [B.id, { ...B, statut_contestation: "contestee", contestations: [contestation("2026-11-04T07:30:00+01:00")] }],
    ]);
    const entrees = etats([decide("a1", A, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]);
    expect(clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toEqual(close("2026-11-04T09:00:00+01:00"));
  });

  it("lot achevé par plusieurs contestations, clos au même instant qu'un autre lot : départage par identifiant inchangé", () => {
    const items = itemsAvecAConteste([contestation("2026-11-06T17:00:00Z"), contestation("2026-11-07T09:00:00Z")]);
    const parContestations = clotureDuLot({
      lot: lotDe("lot-030", [A, B], "reel"),
      items,
      etats: etats([decide("a1", B, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]),
    });
    expect(parContestations).toEqual(close("2026-11-06T17:00:00Z"));
    const lots = [lot("lot-009"), lot("lot-031"), lot("lot-030")];
    const diagnostics = [diagnostic("lot-009"), diagnostic("lot-031"), diagnostic("lot-030", { accord_suffisant: false })];
    const entrees = clotures({
      "lot-009": close("2026-11-04T18:00:00+01:00"),
      "lot-031": close("2026-11-06T18:00:00+01:00"),
      "lot-030": parContestations,
    });
    expect(verdictJ3(diagnostics, lots, entrees)).toEqual({ atteint: false, motif: "accord_insuffisant", lots: ["lot-030", "lot-031"] });
  });

  it("un item non couvert contesté sans date de réception lisible : refus, jamais une date inventée", () => {
    const items = itemsAvecAConteste([{ id: "01JBANCESSA1C0NTEST000000X1", texte: "x" }]);
    const entrees = etats([decide("a1", B, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]);
    expect(() => clotureDuLot({ lot: LOT_AB, items, etats: entrees })).toThrow(ContestationSansDateDeReception);
  });

  it("lot ni terminé ni contesté : pas clos, comportement inchangé", () => {
    const entrees = etats([decide("a1", A, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]);
    expect(clotureDuLot({ lot: LOT_AB, items: ITEMS_AB, etats: entrees })).toEqual(OUVERT);
  });

  it("une contestation reçue au même instant que la clôture d'un autre lot : départage par identifiant", () => {
    const items = itemsAvecAConteste([contestation("2026-11-06T17:00:00Z")]);
    const parContestation = clotureDuLot({
      lot: lotDe("lot-030", [A, B], "reel"),
      items,
      etats: etats([decide("a1", B, "2026-11-04T09:00:00+01:00")], [decide("a2", B, "2026-11-04T08:30:00+01:00")]),
    });
    expect(parContestation).toEqual(close("2026-11-06T17:00:00Z"));
    const lots = [lot("lot-009"), lot("lot-031"), lot("lot-030")];
    const diagnostics = [diagnostic("lot-009"), diagnostic("lot-031"), diagnostic("lot-030", { accord_suffisant: false })];
    const entrees = clotures({
      "lot-009": close("2026-11-04T18:00:00+01:00"),
      "lot-031": close("2026-11-06T18:00:00+01:00"),
      "lot-030": parContestation,
    });
    expect(verdictJ3(diagnostics, lots, entrees)).toEqual({ atteint: false, motif: "accord_insuffisant", lots: ["lot-030", "lot-031"] });
  });
});

/* ----------------------------------------------------------------- verdict J3 */

describe("verdict J3 (§12, D70 (5)) : les deux derniers lots dans l'ordre de leur clôture", () => {
  it("trois lots clos dans un ordre différent de leur ordre de création : J3 lit les deux derniers clos", () => {
    // Créés 001, 002, 003 ; clos 002, 003, 001. Le lot 002, clos le premier, est insuffisant : il
    // ne compte pas. Lus dans l'ordre de création, 002 et 003 seraient les deux derniers : échec.
    const lots = [lot("lot-001"), lot("lot-002"), lot("lot-003")];
    const diagnostics = [
      diagnostic("lot-001"),
      diagnostic("lot-002", { accord_suffisant: false, kappa: 0.5 }),
      diagnostic("lot-003"),
    ];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({
        "lot-001": close("2026-11-09T18:00:00+01:00"),
        "lot-002": close("2026-11-05T18:00:00+01:00"),
        "lot-003": close("2026-11-07T18:00:00+01:00"),
      }),
    );
    expect(verdict).toEqual({ atteint: true, lots: ["lot-003", "lot-001"] });
  });

  it("le dernier clos insuffisant fait échouer J3, avec son motif et les deux lots lus", () => {
    const lots = [lot("lot-001"), lot("lot-002"), lot("lot-003")];
    const diagnostics = [diagnostic("lot-001", { accord_suffisant: false }), diagnostic("lot-002"), diagnostic("lot-003")];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({
        "lot-001": close("2026-11-09T18:00:00+01:00"),
        "lot-002": close("2026-11-05T18:00:00+01:00"),
        "lot-003": close("2026-11-07T18:00:00+01:00"),
      }),
    );
    expect(verdict).toEqual({ atteint: false, motif: "accord_insuffisant", lots: ["lot-003", "lot-001"] });
  });

  it("un lot terminé par un seul annotateur n'est pas clos, donc ignoré", () => {
    const lots = [lot("lot-001"), lot("lot-002"), lot("lot-003")];
    // lot-003, ouvert, n'a pas de diagnostic publié : pnpm diagnostics ne publie qu'un lot fini.
    const verdict = verdictJ3(
      [diagnostic("lot-001"), diagnostic("lot-002")],
      lots,
      clotures({
        "lot-001": close("2026-11-04T18:00:00+01:00"),
        "lot-002": close("2026-11-05T18:00:00+01:00"),
        "lot-003": OUVERT,
      }),
    );
    expect(verdict).toEqual({ atteint: true, lots: ["lot-001", "lot-002"] });
  });

  it("un lot réannoté : seul le lot de réannotation compte, à la date de sa propre clôture", () => {
    // lot-001 clos le 4, réannoté en lot-001-r1 clos le 12 ; lot-002 clos le 8. Les deux derniers
    // sont lot-002 puis lot-001-r1 ; lot-001, supersédé, ne compte plus, même suffisant.
    const lots = [lot("lot-001"), lot("lot-002"), lot("lot-001-r1", "reannotation", "lot-001")];
    const diagnostics = [
      diagnostic("lot-001", { supersede_par: "lot-001-r1", accord_suffisant: false }),
      diagnostic("lot-002"),
      diagnostic("lot-001-r1", { nature: "reannotation", reannote: "lot-001", date_calibration: "2026-11-01" }),
    ];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({
        "lot-001": close("2026-11-04T18:00:00+01:00"),
        "lot-002": close("2026-11-08T18:00:00+01:00"),
        "lot-001-r1": close("2026-11-12T18:00:00+01:00"),
      }),
    );
    expect(verdict).toEqual({ atteint: true, lots: ["lot-002", "lot-001-r1"] });
  });

  it("le lot de réannotation se place à sa propre clôture, non à celle du lot d'origine", () => {
    // lot-001 clos le 4, sa réannotation le 6 ; lot-002 et lot-003 clos le 8 et le 9 : la
    // réannotation, insuffisante, n'est pas parmi les deux derniers.
    const lots = [lot("lot-001"), lot("lot-002"), lot("lot-003"), lot("lot-001-r1", "reannotation", "lot-001")];
    const diagnostics = [
      diagnostic("lot-001", { supersede_par: "lot-001-r1" }),
      diagnostic("lot-002"),
      diagnostic("lot-003"),
      diagnostic("lot-001-r1", { nature: "reannotation", reannote: "lot-001", accord_suffisant: false }),
    ];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({
        "lot-001": close("2026-11-04T18:00:00+01:00"),
        "lot-001-r1": close("2026-11-06T18:00:00+01:00"),
        "lot-002": close("2026-11-08T18:00:00+01:00"),
        "lot-003": close("2026-11-09T18:00:00+01:00"),
      }),
    );
    expect(verdict).toEqual({ atteint: true, lots: ["lot-002", "lot-003"] });
  });

  it("un lot d'entraînement ou de taille non conforme est ignoré", () => {
    const lots = [lot("lot-001"), lot("ent-001", "entrainement"), lot("lot-002"), lot("lot-003")];
    const diagnostics = [
      diagnostic("lot-001"),
      diagnostic("ent-001", { nature: "entrainement", taille_lot: 30, taille_attendue: 30, accord_suffisant: false }),
      diagnostic("lot-002"),
      diagnostic("lot-003", { taille_lot: 17, taille_conforme: false, accord_suffisant: false }),
    ];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({
        "lot-001": close("2026-11-04T18:00:00+01:00"),
        "lot-002": close("2026-11-05T18:00:00+01:00"),
        "ent-001": close("2026-11-06T18:00:00+01:00"),
        "lot-003": close("2026-11-07T18:00:00+01:00"),
      }),
    );
    expect(verdict).toEqual({ atteint: true, lots: ["lot-001", "lot-002"] });
  });

  it("moins de deux lots éligibles : J3 non atteint, motif nommé, jamais vert par défaut", () => {
    const lots = [lot("lot-001"), lot("ent-001", "entrainement")];
    const diagnostics = [diagnostic("lot-001"), diagnostic("ent-001", { nature: "entrainement" })];
    const unSeul = verdictJ3(
      diagnostics,
      lots,
      clotures({ "lot-001": close("2026-11-04T18:00:00+01:00"), "ent-001": close("2026-11-03T18:00:00+01:00") }),
    );
    expect(unSeul).toEqual({ atteint: false, motif: "moins_de_deux_lots_clos", lots: ["lot-001"] });

    expect(verdictJ3([], [], clotures({}))).toEqual({ atteint: false, motif: "moins_de_deux_lots_clos", lots: [] });
  });

  it("deux lots clos au même instant : départage par identifiant de lot, déterministe", () => {
    // lot-010 et lot-011 clos au même instant, écrit avec deux décalages. Le protocole ne fixe pas
    // de départage : l'identifiant du lot, second critère (question ouverte du lot D70 (5)).
    const lots = [lot("lot-009"), lot("lot-011"), lot("lot-010")];
    const diagnostics = [
      diagnostic("lot-009"),
      diagnostic("lot-011"),
      diagnostic("lot-010", { accord_suffisant: false }),
    ];
    const entrees = {
      "lot-009": close("2026-11-04T18:00:00+01:00"),
      "lot-011": close("2026-11-06T17:00:00Z"),
      "lot-010": close("2026-11-06T18:00:00+01:00"),
    };
    // Ordre : lot-009, puis lot-010 et lot-011 ex aequo, départagés par identifiant.
    const attendu = { atteint: false, motif: "accord_insuffisant", lots: ["lot-010", "lot-011"] };
    expect(verdictJ3(diagnostics, lots, clotures(entrees))).toEqual(attendu);
    expect(verdictJ3([...diagnostics].reverse(), [...lots].reverse(), clotures(entrees))).toEqual(attendu);
  });

  it("un des deux derniers sans item commun (accord non décidable) : J3 non atteint, motif propre", () => {
    const lots = [lot("lot-001"), lot("lot-002")];
    const { kappa: _absent, ...sansKappa } = diagnostic("lot-002");
    const diagnostics = [
      diagnostic("lot-001"),
      { ...sansKappa, motif_indefini: "aucun_item_commun" as const, accord_observe: null, n: 0, accord_suffisant: null },
    ];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({ "lot-001": close("2026-11-04T18:00:00+01:00"), "lot-002": close("2026-11-05T18:00:00+01:00") }),
    );
    expect(verdict).toEqual({ atteint: false, motif: "accord_non_decidable", lots: ["lot-001", "lot-002"] });
  });

  it("un lot éligible clos sans instant connu : l'ordre n'est pas décidable, J3 non atteint", () => {
    const lots = [lot("lot-001"), lot("lot-002"), lot("lot-003")];
    const diagnostics = [diagnostic("lot-001"), diagnostic("lot-002"), diagnostic("lot-003")];
    const verdict = verdictJ3(
      diagnostics,
      lots,
      clotures({
        "lot-001": close("2026-11-04T18:00:00+01:00"),
        "lot-002": close("2026-11-05T18:00:00+01:00"),
        "lot-003": { clos: true, instant: null },
      }),
    );
    expect(verdict).toEqual({ atteint: false, motif: "cloture_non_datee", lots: ["lot-003"] });
  });

  it("un lot clos sans diagnostic publié, ou un lot sans clôture connue : refus, rien n'est choisi", () => {
    const lots = [lot("lot-001"), lot("lot-002")];
    const deux = clotures({ "lot-001": close("2026-11-04T18:00:00+01:00"), "lot-002": close("2026-11-05T18:00:00+01:00") });
    expect(() => verdictJ3([diagnostic("lot-001")], lots, deux)).toThrow(DiagnosticManquant);
    expect(() =>
      verdictJ3([diagnostic("lot-001"), diagnostic("lot-002")], lots, clotures({ "lot-001": close("2026-11-04T18:00:00+01:00") })),
    ).toThrow(ClotureInconnue);
  });
});
