/**
 * Renvoi d'une source à la réextraction (§4, protocole 0.24, D59 (9), première moitié) : « un texte
 * extrait faux se solde par un rejet de l'item sous le motif énuméré « texte extrait erroné », et
 * c'est ce motif qui renvoie la source à la réextraction ».
 *
 * Protocole 0.27 (D62 #233 (1), conformité 2026-11-03 n° 1) : « Le renvoi a lieu dès que l'item est
 * rejeté et qu'une décision de rejet qui le fonde porte ce motif : quand un seul des deux « rejeter »
 * concordants le porte, comme quand les deux le portent ; quand le rejet est tranché par l'arbitre,
 * sa décision porte le motif comme celle d'un annotateur ; sur un item O à deux sources, le motif ne
 * disant pas laquelle est fausse, les deux sources sont renvoyées. »
 *
 * Ce module ne nomme que les items rejetés. Ce que le renvoi fait aux autres items validés sur le
 * même texte (protocole 0.25, D60 (9b)) est testé dans `renvoi-texte-errone.test.ts`.
 */

import { describe, expect, it } from "vitest";
import type { Issue } from "../validation/domaine/promotion.ts";
import { renvoisAReextraction, type VerdictRejet } from "../validation/domaine/renvoi-reextraction.ts";
import type { BlocArbitrage, Decision, EntreeDecision, Item, MotifRejet } from "../validation/domaine/types.ts";
import { decision, itemA, itemF, itemO, itemP, source } from "./aides/fabriques.ts";

function avecMotif(entree: EntreeDecision, motif: MotifRejet | undefined): EntreeDecision {
  return motif === undefined ? entree : { ...entree, motif_rejet: motif };
}

function decisionDe(annotateur_id: string, item: Item, choix: Decision, motif?: MotifRejet): EntreeDecision {
  return avecMotif(decision({ annotateur_id, item, decision: choix }), motif);
}

function rejete(item: Item): Issue {
  return { sort: "promouvoir", statut: "rejete", item, corrections_appliquees: false };
}

/** Rejet tranché par l'arbitre : `pnpm promote` recopie sa décision dans le bloc `arbitrage` de l'item. */
function rejeteParArbitre(item: Item, motif?: MotifRejet): Issue {
  const arbitrage: BlocArbitrage = {
    decision_id: "01JBANCESSA1ARB1TRAGE00001",
    date: "2026-10-02T10:00:00+02:00",
    arbitre: "auteur",
    arbitre_seul: false,
    motif: "desaccord",
    issue: "rejete",
    motivation: "Motivation publiée de la décision.",
    ...(motif === undefined ? {} : { motif_rejet: motif }),
  };
  return rejete({ ...item, arbitrage });
}

function verdict(item: Item, decisions: readonly EntreeDecision[], issue: Issue = rejete(item)): VerdictRejet {
  return { item, dossier: { decisions }, issue };
}

const MOTIF: MotifRejet = "texte_extrait_errone";

describe("renvoi à la réextraction : le cas que le texte tranche", () => {
  it("deux « rejeter » sous le motif, item P à une source : la source est renvoyée, avec l'item et le texte en cause", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources).toEqual([
      {
        sha256: "1".repeat(64),
        texte_sha256: "2".repeat(64),
        url: "https://demo.invalid/programme.pdf",
        items: [item.id],
      },
    ]);
  });

  it("deux « rejeter » sans motif : rejet ordinaire, aucune source renvoyée, rien à trancher", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter"), decisionDe("a2", item, "rejeter")]),
    ]);
    expect(resultat).toEqual({ sources: [] });
  });

  it("source déjà renvoyée par un autre item : une seule entrée, qui nomme les deux items", () => {
    const premier = itemP();
    const second = itemP({ id: "01JBANCESSA1000000001TEM09" });
    const resultat = renvoisAReextraction([
      verdict(second, [decisionDe("a1", second, "rejeter", MOTIF), decisionDe("a2", second, "rejeter", MOTIF)]),
      verdict(premier, [decisionDe("a1", premier, "rejeter", MOTIF), decisionDe("a2", premier, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources).toHaveLength(1);
    expect(resultat.sources[0]?.items).toEqual([premier.id, second.id]);
  });

  it("même document, deux textes distincts : deux renvois, l'empreinte du texte fait partie de la clé", () => {
    const premier = itemP();
    const second = itemP({
      id: "01JBANCESSA1000000001TEM09",
      assertion: { ...(itemP().assertion as NonNullable<Item["assertion"]>), source: source({ texte_sha256: "3".repeat(64) }) },
    });
    const resultat = renvoisAReextraction(
      [premier, second].map((item) =>
        verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter", MOTIF)]),
      ),
    );
    expect(resultat.sources.map((renvoi) => renvoi.texte_sha256)).toEqual(["2".repeat(64), "3".repeat(64)]);
  });

  it("item A : sa source de couverture est sa seule source de contenu, elle est renvoyée", () => {
    const item = itemA();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources.map((renvoi) => renvoi.items)).toEqual([[item.id]]);
  });

  it("item O dont les deux états citent la même source : une source, renvoyée", () => {
    const base = itemO();
    const bloc = base.obsolescence as NonNullable<Item["obsolescence"]>;
    const item = itemO({
      obsolescence: { ...bloc, etat_posterieur: { ...bloc.etat_posterieur, source: bloc.etat_anterieur.source } },
    });
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources).toHaveLength(1);
  });

  it("une source sans texte_sha256 (transcription) est renvoyée sans empreinte de texte, jamais avec une valeur inventée", () => {
    const { texte_sha256: _retire, ...sansTexte } = source();
    const item = itemP({ assertion: { ...(itemP().assertion as NonNullable<Item["assertion"]>), source: sansTexte } });
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources).toHaveLength(1);
    expect("texte_sha256" in (resultat.sources[0] as object)).toBe(false);
  });
});

describe("renvoi à la réextraction : une décision de rejet qui fonde le rejet suffit (protocole 0.27, §4.113 à §4.115)", () => {
  it("deux « rejeter », un seul sous le motif : la source est renvoyée", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter")]),
    ]);
    expect(resultat.sources.map((renvoi) => [renvoi.sha256, renvoi.items])).toEqual([["1".repeat(64), [item.id]]]);
  });

  it("deux « rejeter », le second seul sous le motif : l'ordre des décisions ne compte pas", () => {
    // L'énumération n'a qu'un motif : « deux motifs différents dont un est le motif » est ce cas-ci.
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter"), decisionDe("a2", item, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources.map((renvoi) => renvoi.items)).toEqual([[item.id]]);
  });

  it("rejet tranché par l'arbitre, dont la décision porte le motif : la source est renvoyée, même si aucun annotateur ne l'a donné", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter"), decisionDe("a2", item, "accepter")], rejeteParArbitre(item, MOTIF)),
    ]);
    expect(resultat.sources.map((renvoi) => [renvoi.sha256, renvoi.texte_sha256, renvoi.items])).toEqual([
      ["1".repeat(64), "2".repeat(64), [item.id]],
    ]);
  });

  it("rejet tranché par l'arbitre sans le motif : rien n'est renvoyé, même si un annotateur l'avait donné (sa décision ne fonde pas le rejet)", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "accepter")], rejeteParArbitre(item)),
    ]);
    expect(resultat).toEqual({ sources: [] });
  });

  it("item O à deux sources distinctes : les deux sources sont renvoyées, chacune nommant l'item", () => {
    const bloc = itemO().obsolescence as NonNullable<Item["obsolescence"]>;
    const item = itemO({
      obsolescence: {
        ...bloc,
        etat_posterieur: { ...bloc.etat_posterieur, source: { ...bloc.etat_posterieur.source, sha256: "8".repeat(64) } },
      },
    });
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter")]),
    ]);
    expect(resultat.sources.map((renvoi) => [renvoi.sha256, renvoi.items])).toEqual([
      ["1".repeat(64), [item.id]],
      ["8".repeat(64), [item.id]],
    ]);
  });

  it("verdict rejeté sans arbitrage ni deux « rejeter » : incohérent, refusé avec l'item nommé, jamais lu en silence", () => {
    const item = itemP();
    expect(() =>
      renvoisAReextraction([verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "accepter")])]),
    ).toThrow(new RegExp(item.id));
  });

  it("rejet sous le motif d'un item sans source de contenu (item F) : refusé, la ligne a été écrite hors de l'interface", () => {
    const item = itemF();
    expect(() =>
      renvoisAReextraction([verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter")])]),
    ).toThrow(/sans aucune source de contenu/);
  });
});

describe("renvoi à la réextraction : ce qui ne renvoie rien", () => {
  it("un item qui n'est pas rejeté ne renvoie rien, même si une décision porte le motif (arbitrage en cours)", () => {
    const item = itemP();
    const enArbitrage: Issue = { sort: "arbitrage", motif: "desaccord" };
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "accepter")], enArbitrage),
    ]);
    expect(resultat).toEqual({ sources: [] });
  });

  it("la sortie ne nomme que les items rejetés, jamais un item vérifié sur le même texte (traité par renvoi-texte-errone.ts)", () => {
    const rejeteItem = itemP();
    const verifie = itemP({ id: "01JBANCESSA1000000001TEM09" });
    const resultat = renvoisAReextraction([
      verdict(rejeteItem, [decisionDe("a1", rejeteItem, "rejeter", MOTIF), decisionDe("a2", rejeteItem, "rejeter", MOTIF)]),
      verdict(verifie, [decisionDe("a1", verifie, "accepter"), decisionDe("a2", verifie, "accepter")], {
        sort: "promouvoir",
        statut: "verifie",
        item: verifie,
        corrections_appliquees: false,
      }),
    ]);
    expect(resultat.sources.flatMap((renvoi) => renvoi.items)).toEqual([rejeteItem.id]);
  });
});
