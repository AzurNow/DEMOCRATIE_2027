/**
 * Égalité des voix du panel d'arbitrage (§10, protocole 0.28, D70 (10)) : « À égalité des voix,
 * rien ne change : l'item reste contesté et hors du tirage, et les opinions de chaque membre sont
 * publiées. »
 *
 * Le modèle ne connaît que les quatre décisions de l'annexe E (`DECISIONS_PANEL`, énumération de
 * `item.schema.json`) : une égalité n'en est pas une, et rien ne permet de l'enregistrer comme
 * telle. Ce fichier prouve la moitié conforme de la règle — sans majorité, aucune décision n'est
 * posée, la contestation reste ouverte et l'item hors du tirage — et la non-régression d'une
 * décision à la majorité. La publication des opinions de chaque membre à égalité n'a ni champ ni
 * commande : elle n'est pas testée ici, faute d'exister (question ouverte du lot D70 (10)).
 */

import { describe, expect, it } from "vitest";
import { contestationPermetLeTirage } from "../pipeline/questions/contestation.ts";
import { itemEngendreDesQuestions } from "../pipeline/questions/engendrement.ts";
import {
  ajouterContestation,
  appliquerDecisionPanel,
  DECISIONS_PANEL,
  type Contestation,
  type DecisionDuPanel,
  type DecisionPanel,
} from "../validation/domaine/contestation-item.ts";
import type { AccesTexte } from "../validation/domaine/corrections.ts";
import type { Item } from "../validation/domaine/types.ts";
import { valider } from "../outils/schemas/valider.ts";
import { itemPromu } from "./aides/data.ts";

const TRACE = { date: "2026-11-01T10:00:00+01:00", commit: "c".repeat(40) };
const TRACE_DECISION = { date: "2026-11-10T10:00:00+01:00", commit: "d".repeat(40) };
const PREMIERE = "01JBANCESSA1C0NTESTAT10N01";
const SECONDE = "01JBANCESSA1C0NTESTAT10N02";

const ACCES: AccesTexte = {
  texteSource: () => "Préambule. Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.",
  offsetsActuels: () => ({ debut: null, fin: null }),
};

function contestation(id: string): Contestation {
  return {
    id,
    date_reception: "2026-11-01T09:00:00+01:00",
    texte: "La source ne dit pas cela.",
    contestataire_type: "campagne",
    caviardage: false,
  };
}

function decisionPanel(surcharges: Partial<DecisionDuPanel> = {}): DecisionDuPanel {
  return {
    contestation_id: PREMIERE,
    decision: "maintien",
    version_jugee: 1,
    motivation: "La citation figure dans la source.",
    opinions_dissidentes: [],
    arbitre_seul: false,
    corrections: [],
    date: TRACE_DECISION.date,
    ...surcharges,
  };
}

function conteste(item: Item = itemPromu(), id = PREMIERE): Item {
  return ajouterContestation(item, contestation(id), TRACE);
}

function horsDuTirage(item: Item): void {
  expect(item.statut_contestation).toBe("contestee");
  expect(contestationPermetLeTirage(item)).toBe(false);
  expect(itemEngendreDesQuestions(item)).toBe(false);
}

describe("panel à égalité des voix (§10, D70 (10))", () => {
  it("panel à égalité des voix : l'item reste contesté et hors tirage, aucune décision n'est posée", () => {
    // Deux voix contre deux : pas de majorité, donc aucune des quatre décisions de l'annexe E.
    // Rien n'est appliqué à l'item ; il reste tel que la contestation l'a laissé.
    const item = conteste();
    horsDuTirage(item);
    const contestations = item.contestations as readonly Record<string, unknown>[];
    expect(contestations[0]?.["decision_panel"]).toBeUndefined();
    expect(() => valider("item", item, "item contesté, panel à égalité")).not.toThrow();
  });

  it("une égalité ne s'enregistre pas comme une décision : hors énumération, refusée, l'item inchangé", () => {
    expect(DECISIONS_PANEL as readonly string[]).not.toContain("egalite");
    const item = conteste();
    const avant = structuredClone(item);
    const egalite = decisionPanel({ decision: "egalite" as DecisionPanel });
    expect(() => appliquerDecisionPanel(item, egalite, TRACE_DECISION, ACCES)).toThrow(/hors énumération/);
    expect(item).toEqual(avant);
    horsDuTirage(item);
  });

  it("égalité sur une nouvelle contestation d'un item déjà maintenu : il reste contesté, le maintien antérieur ne le réintègre pas", () => {
    const maintenu = appliquerDecisionPanel(conteste(), decisionPanel(), TRACE_DECISION, ACCES).item;
    expect(contestationPermetLeTirage(maintenu)).toBe(true);
    const reconteste = conteste(maintenu, SECONDE);
    // Le panel se partage sur la seconde contestation : aucune décision, rien ne change.
    horsDuTirage(reconteste);
    expect(reconteste.statut_validation).toBe(maintenu.statut_validation);
    expect(reconteste.version).toBe(maintenu.version);
  });
});

describe("panel avec majorité (§10) : comportement inchangé", () => {
  it("panel avec majorité, maintien à trois voix contre une : arbitré, réintégré, dissidence publiée", () => {
    const dissidence = "Un membre tient pour le retrait : la citation est sortie de son contexte.";
    const { item } = appliquerDecisionPanel(
      conteste(),
      decisionPanel({ opinions_dissidentes: [dissidence] }),
      TRACE_DECISION,
      ACCES,
    );
    expect(item.statut_contestation).toBe("arbitree");
    expect(item.statut_validation).toBe("verifie");
    expect(contestationPermetLeTirage(item)).toBe(true);
    const publiee = (item.contestations as readonly Record<string, unknown>[])[0]?.["decision_panel"];
    expect(publiee).toMatchObject({ decision: "maintien", opinions_dissidentes: [dissidence], arbitre_seul: false });
    expect(() => valider("item", item, "item maintenu à la majorité")).not.toThrow();
  });

  it("panel avec majorité, retrait à trois voix contre deux : retiré, hors du tirage", () => {
    const { item } = appliquerDecisionPanel(
      conteste(),
      decisionPanel({ decision: "retrait", opinions_dissidentes: ["Premier dissident.", "Second dissident."] }),
      TRACE_DECISION,
      ACCES,
    );
    expect(item.statut_contestation).toBe("arbitree");
    expect(item.statut_validation).toBe("retire_par_panel");
    expect(contestationPermetLeTirage(item)).toBe(false);
  });
});
