/**
 * Décision D74 (7) : `pnpm promote` signale en information un rejet arbitré sans motif de l'arbitre
 * alors qu'un annotateur en avait porté un. Aucun renvoi (D74 (6)), aucun blocage.
 */
import { describe, expect, it } from "vitest";
import type { Issue } from "../validation/domaine/promotion.ts";
import { renvoisAReextraction } from "../validation/domaine/renvoi-reextraction.ts";
import {
  decrireRejetsArbitresSansMotif,
  rejetsArbitresSansMotif,
  type VerdictArbitre,
} from "../validation/domaine/rejet-arbitre-sans-motif.ts";
import type { BlocArbitrage, EntreeDecision, Item, MotifRejet } from "../validation/domaine/types.ts";
import { decision, itemP } from "./aides/fabriques.ts";

const MOTIF: MotifRejet = "texte_extrait_errone";

function rejeterDe(annotateur_id: string, item: Item, motif?: MotifRejet): EntreeDecision {
  const entree = decision({ annotateur_id, item, decision: "rejeter" });
  return motif === undefined ? entree : { ...entree, motif_rejet: motif };
}

function bloc(motif?: MotifRejet, issue: BlocArbitrage["issue"] = "rejete"): BlocArbitrage {
  return {
    decision_id: "01JBANCESSA1ARB1TRAGE00001",
    date: "2026-10-02T10:00:00+02:00",
    arbitre: "auteur",
    arbitre_seul: false,
    motif: "desaccord",
    issue,
    motivation: "Motivation publiée de la décision.",
    ...(motif === undefined ? {} : { motif_rejet: motif }),
  };
}

function arbitre(item: Item, arbitrage: BlocArbitrage, decisions: readonly EntreeDecision[]): VerdictArbitre {
  const statut = arbitrage.issue === "rejete" ? "rejete" : "verifie";
  const issue: Issue = { sort: "promouvoir", statut, item: { ...item, arbitrage }, corrections_appliquees: false };
  return { lot_id: "lot-001", item, dossier: { decisions }, issue };
}

describe("rejet arbitré sans motif de l'arbitre : information (D74 (7))", () => {
  it("motif d'un annotateur, aucun de l'arbitre : signalé, avec l'annotateur et son motif", () => {
    const item = itemP();
    const rejets = rejetsArbitresSansMotif([
      arbitre(item, bloc(), [rejeterDe("a1", item, MOTIF), decision({ annotateur_id: "a2", item, decision: "accepter" })]),
    ]);
    expect(rejets).toEqual([{ item_id: item.id, lot_id: "lot-001", motifs: [{ annotateur_id: "a1", motif_rejet: MOTIF }] }]);
    const texte = decrireRejetsArbitresSansMotif(rejets).join("\n");
    expect(texte).toContain("Information");
    expect(texte).toContain(item.id);
    expect(texte).toContain("a1 : texte_extrait_errone");
  });

  it("le signalement ne renvoie rien à la réextraction : D74 (6) tient", () => {
    const item = itemP();
    const verdict = arbitre(item, bloc(), [rejeterDe("a1", item, MOTIF), rejeterDe("a2", item)]);
    expect(rejetsArbitresSansMotif([verdict])).toHaveLength(1);
    expect(renvoisAReextraction([verdict])).toEqual({ sources: [] });
  });

  it("motif de l'arbitre : rien", () => {
    const item = itemP();
    const verdict = arbitre(item, bloc(MOTIF), [rejeterDe("a1", item, MOTIF), rejeterDe("a2", item)]);
    expect(rejetsArbitresSansMotif([verdict])).toEqual([]);
  });

  it("motif de personne : rien, comportement inchangé", () => {
    const item = itemP();
    const rejets = rejetsArbitresSansMotif([arbitre(item, bloc(), [rejeterDe("a1", item), rejeterDe("a2", item)])]);
    expect(rejets).toEqual([]);
    expect(decrireRejetsArbitresSansMotif(rejets)).toEqual([]);
  });

  it("acceptation arbitrée : rien, même si un annotateur avait rejeté sous un motif", () => {
    const item = itemP();
    const verdict = arbitre(item, bloc(undefined, "verifie"), [
      rejeterDe("a1", item, MOTIF),
      decision({ annotateur_id: "a2", item, decision: "accepter" }),
    ]);
    expect(rejetsArbitresSansMotif([verdict])).toEqual([]);
  });

  it("rejet sans arbitrage : rien", () => {
    const item = itemP();
    const issue: Issue = { sort: "promouvoir", statut: "rejete", item, corrections_appliquees: false };
    const decisions = [rejeterDe("a1", item, MOTIF), rejeterDe("a2", item, MOTIF)];
    expect(rejetsArbitresSansMotif([{ lot_id: "lot-001", item, dossier: { decisions }, issue }])).toEqual([]);
  });
});
