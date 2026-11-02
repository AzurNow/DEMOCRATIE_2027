/**
 * Renvoi d'une source à la réextraction (§4, protocole 0.24, D59 (9), première moitié) : « un texte
 * extrait faux se solde par un rejet de l'item sous le motif énuméré « texte extrait erroné », et
 * c'est ce motif qui renvoie la source à la réextraction ».
 *
 * Seul le cas que le texte tranche renvoie une source : un item rejeté par deux « rejeter »
 * concordants qui portent tous deux le motif, sur un item dont le contenu n'a qu'une source. Tout
 * autre rejet qui porte le motif (motifs discordants, rejet tranché par l'arbitre, item à deux
 * sources distinctes) est rapporté « à trancher », jamais résolu en silence ni écarté.
 *
 * Ce module ne nomme que les items rejetés. Ce que le renvoi fait aux autres items validés sur le
 * même texte (protocole 0.25, D60 (9b)) est testé dans `renvoi-texte-errone.test.ts`.
 */

import { describe, expect, it } from "vitest";
import type { Issue } from "../validation/domaine/promotion.ts";
import { renvoisAReextraction, type VerdictRejet } from "../validation/domaine/renvoi-reextraction.ts";
import type { Decision, EntreeDecision, Item, MotifRejet } from "../validation/domaine/types.ts";
import { decision, itemA, itemO, itemP, source } from "./aides/fabriques.ts";

function avecMotif(entree: EntreeDecision, motif: MotifRejet | undefined): EntreeDecision {
  return motif === undefined ? entree : { ...entree, motif_rejet: motif };
}

function decisionDe(annotateur_id: string, item: Item, choix: Decision, motif?: MotifRejet): EntreeDecision {
  return avecMotif(decision({ annotateur_id, item, decision: choix }), motif);
}

function rejete(item: Item): Issue {
  return { sort: "promouvoir", statut: "rejete", item, corrections_appliquees: false };
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
    expect(resultat.a_trancher).toEqual([]);
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
    expect(resultat).toEqual({ sources: [], a_trancher: [] });
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
    expect(resultat.a_trancher).toEqual([]);
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

describe("renvoi à la réextraction : ce que le texte ne tranche pas est rapporté, jamais résolu", () => {
  it("deux « rejeter », un seul sous le motif : à trancher, motifs discordants, aucune source renvoyée", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter")]),
    ]);
    expect(resultat.sources).toEqual([]);
    expect(resultat.a_trancher).toEqual([{ item_id: item.id, raison: "motifs_discordants" }]);
  });

  it("rejet tranché par l'arbitre, dont un annotateur avait donné le motif : à trancher, rejet arbitré", () => {
    const item = itemP();
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "accepter")]),
    ]);
    expect(resultat.sources).toEqual([]);
    expect(resultat.a_trancher).toEqual([{ item_id: item.id, raison: "rejet_arbitre" }]);
  });

  it("item O à deux sources distinctes : à trancher, le motif ne dit pas laquelle est fausse", () => {
    const bloc = itemO().obsolescence as NonNullable<Item["obsolescence"]>;
    const item = itemO({
      obsolescence: {
        ...bloc,
        etat_posterieur: { ...bloc.etat_posterieur, source: { ...bloc.etat_posterieur.source, sha256: "8".repeat(64) } },
      },
    });
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "rejeter", MOTIF)]),
    ]);
    expect(resultat.sources).toEqual([]);
    expect(resultat.a_trancher).toEqual([{ item_id: item.id, raison: "plusieurs_sources" }]);
  });

  it("un item qui n'est pas rejeté ne renvoie rien, même si une décision porte le motif (arbitrage en cours)", () => {
    const item = itemP();
    const enArbitrage: Issue = { sort: "arbitrage", motif: "desaccord" };
    const resultat = renvoisAReextraction([
      verdict(item, [decisionDe("a1", item, "rejeter", MOTIF), decisionDe("a2", item, "accepter")], enArbitrage),
    ]);
    expect(resultat).toEqual({ sources: [], a_trancher: [] });
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
