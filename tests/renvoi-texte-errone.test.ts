/**
 * Protocole 0.25, §4 « Contrat des artefacts » (D60 (9b), seconde moitié de D59 (9)) : « Les autres
 * items validés sur ce même texte ne sont pas déplacés, mais leur validation ne tient plus : un item
 * non publié retourne en attente et est validé à nouveau, ses décisions antérieures restant au
 * journal, un item d'un lot en cours attendant la fin de son lot ; un item publié ne change que par
 * la contestation et le panel, et l'auteur le conteste dès que le rejet est enregistré. »
 *
 * « Même texte » : le couple (empreinte du document, empreinte du texte) d'une source renvoyée
 * tranchée (`renvoi-reextraction.ts`), porté par l'une des sources de contenu de l'item. Le retour
 * en attente est celui de la correction de thème et du rattachement : version + 1, entrée
 * d'historique, et le lot qui épinglait l'ancienne version ne juge plus l'item (`lotJugeEncore`).
 */

import { describe, expect, it } from "vitest";
import type { Issue } from "../validation/domaine/promotion.ts";
import { lotJugeEncore, type JugementEnCours } from "../validation/domaine/renvoi-mesure.ts";
import { renvoisAReextraction, type SourceRenvoyee, type VerdictRejet } from "../validation/domaine/renvoi-reextraction.ts";
import {
  CHANGEMENT_TEXTE_ERRONE,
  jugementsDesVerdicts,
  planifierTexteErrone,
  porteUnTexteRenvoye,
  renvoyerEnAttente,
  type ContexteTexteErrone,
} from "../validation/domaine/renvoi-texte-errone.ts";
import type { BlocArbitrage, Decision, EntreeDecision, Item, Source } from "../validation/domaine/types.ts";
import { decision, itemA, itemO, itemP, source } from "./aides/fabriques.ts";

const DOCUMENT = "1".repeat(64);
const TEXTE_FAUX = "2".repeat(64);
const AUTRE_TEXTE = "3".repeat(64);

/** X : l'item rejeté sous le motif, qui renvoie la source. */
const X = itemP({ id: "01JBANCESSA1000000000TEMX1", candidat_id: "demo-x" });

const RENVOI: SourceRenvoyee = {
  sha256: DOCUMENT,
  texte_sha256: TEXTE_FAUX,
  url: "https://demo.invalid/programme.pdf",
  items: [X.id],
};

function itemSur(id: string, sourceDuContenu: Source = source()): Item {
  const base = itemP().assertion as NonNullable<Item["assertion"]>;
  return itemP({ id, candidat_id: `demo-${id.slice(-2).toLowerCase()}`, assertion: { ...base, source: sourceDuContenu } });
}

function decisionsDe(item: Item, choix: Decision, annotateurs: readonly string[] = ["a1", "a2"]): readonly EntreeDecision[] {
  return annotateurs.map((annotateur_id) => decision({ annotateur_id, item, decision: choix }));
}

function jugement(decisions: readonly EntreeDecision[], lot_id = "lot-001"): JugementEnCours {
  return { lot_id, annotateurs: ["a1", "a2"], decisions };
}

function jugementsComplets(items: readonly Item[]): ReadonlyMap<string, JugementEnCours> {
  return new Map(items.map((item) => [item.id, jugement(decisionsDe(item, "accepter"))]));
}

function contexte(surcharges: Partial<ContexteTexteErrone>): ContexteTexteErrone {
  return { renvois: [RENVOI], items: [], publies: new Map(), jugements: new Map(), ...surcharges };
}

const TRACE = { commit: "c".repeat(40), horodatage: "2026-11-02T10:00:00+01:00" };

describe("texte extrait erroné : les autres items validés sur ce texte", () => {
  it("deux items vérifiés non publiés sur le même texte qu'un item rejeté : les deux retournent en attente, leurs décisions restent au journal", () => {
    const y1 = itemSur("01JBANCESSA1000000000TEMY1");
    const y2 = itemSur("01JBANCESSA1000000000TEMY2");
    const jugements = jugementsComplets([X, y1, y2]);
    const plan = planifierTexteErrone(contexte({ items: [X, y1, y2], jugements }));

    expect(plan.retours.map((retour) => [retour.item.id, retour.sort, retour.lot_id])).toEqual([
      [y1.id, "renvoyer", "lot-001"],
      [y2.id, "renvoyer", "lot-001"],
    ]);
    expect(plan.a_contester).toEqual([]);

    for (const retour of plan.retours) {
      const decisionsAvant = jugements.get(retour.item.id)?.decisions;
      const apres = renvoyerEnAttente(retour.item, retour.textes, TRACE);
      // Retour en attente : le lot qui épinglait la version jugée ne juge plus l'item.
      expect(apres.statut_validation).toBe("en_attente");
      expect(apres.version).toBe(retour.item.version + 1);
      expect(lotJugeEncore(apres, { item_version: retour.item.version })).toBe(false);
      // Ni déplacé ni corrigé : même contenu notant, donc même empreinte, même source.
      expect(apres.empreinte).toBe(retour.item.empreinte);
      expect(apres.assertion).toEqual(retour.item.assertion);
      // Les décisions ne sont ni lues ni réécrites par le retour : elles restent telles quelles.
      expect(jugements.get(retour.item.id)?.decisions).toBe(decisionsAvant);
      expect(apres.historique?.at(-1)).toEqual({
        date: TRACE.horodatage,
        changement: `${CHANGEMENT_TEXTE_ERRONE} : document ${DOCUMENT} texte ${TEXTE_FAUX}`,
        motif: expect.stringContaining(X.id),
        commit: TRACE.commit,
        version_resultante: 2,
      });
    }
  });

  it("item sur le même document mais un autre texte (autre empreinte de texte) : non touché", () => {
    const autre = itemSur("01JBANCESSA1000000000TEMW1", source({ texte_sha256: AUTRE_TEXTE }));
    const plan = planifierTexteErrone(contexte({ items: [X, autre], jugements: jugementsComplets([X, autre]) }));
    expect(plan.retours).toEqual([]);
    expect(plan.a_contester).toEqual([]);
  });

  it("item d'un lot en cours (une seule décision) : il attend la fin de son lot avant de retourner en attente", () => {
    const enCours = itemSur("01JBANCESSA1000000000TEMC1");
    const jugements = new Map([[enCours.id, jugement(decisionsDe(enCours, "accepter", ["a1"]), "lot-002")]]);
    const plan = planifierTexteErrone(contexte({ items: [enCours], jugements }));
    expect(plan.retours.map((retour) => [retour.item.id, retour.sort, retour.lot_id])).toEqual([
      [enCours.id, "decisions_incompletes", "lot-002"],
    ]);
  });

  it("item publié sur le même texte : statut inchangé, listé à contester par l'auteur", () => {
    const publie = { ...itemSur("01JBANCESSA1000000000TEMP1"), statut_validation: "verifie" };
    const enStaging = itemSur("01JBANCESSA1000000000TEMP1");
    const plan = planifierTexteErrone(
      contexte({ items: [enStaging], publies: new Map([[publie.id, publie]]), jugements: jugementsComplets([enStaging]) }),
    );
    expect(plan.retours).toEqual([]);
    expect(plan.a_contester).toEqual([{ item: publie, textes: [RENVOI] }]);
    expect(plan.a_contester[0]?.item.statut_validation).toBe("verifie");
    expect(plan.a_contester[0]?.item.version).toBe(publie.version);
  });

  it("l'item rejeté lui-même n'est ni retourné en attente ni listé à contester, publié ou non", () => {
    const planStaging = planifierTexteErrone(contexte({ items: [X], jugements: jugementsComplets([X]) }));
    const planPublie = planifierTexteErrone(contexte({ items: [X], publies: new Map([[X.id, X]]) }));
    expect(planStaging).toEqual({ retours: [], a_contester: [], sans_texte: [] });
    expect(planPublie).toEqual({ retours: [], a_contester: [], sans_texte: [] });
  });

  it("item O dont un seul des deux états porte le texte faux : traité, sa validation porte sur ce texte", () => {
    const base = itemO();
    const bloc = base.obsolescence as NonNullable<Item["obsolescence"]>;
    const o = itemO({
      id: "01JBANCESSA1000000000TEMO1",
      obsolescence: {
        ...bloc,
        etat_anterieur: { ...bloc.etat_anterieur, source: source({ sha256: "7".repeat(64), texte_sha256: "8".repeat(64) }) },
        etat_posterieur: { ...bloc.etat_posterieur, source: source() },
      },
    });
    const plan = planifierTexteErrone(contexte({ items: [o], jugements: jugementsComplets([o]) }));
    expect(plan.retours.map((retour) => [retour.item.id, retour.sort])).toEqual([[o.id, "renvoyer"]]);
  });

  it("item A dont la source de couverture porte le texte faux : traité comme toute source de contenu", () => {
    const a = itemA({ id: "01JBANCESSA1000000000TEMA1" });
    const plan = planifierTexteErrone(contexte({ items: [a], jugements: jugementsComplets([a]) }));
    expect(plan.retours.map((retour) => retour.item.id)).toEqual([a.id]);
  });

  it("item qu'aucun lot ne juge : jamais validé, rien ne tombe, il n'est pas touché", () => {
    const horsLot = itemSur("01JBANCESSA1000000000TEMH1");
    const plan = planifierTexteErrone(contexte({ items: [horsLot] }));
    expect(plan.retours).toEqual([]);
  });

  it("item rejeté pour une autre raison sur le même texte : sa validation ne tient pas plus, il retourne en attente", () => {
    const rejeteAutrement = itemSur("01JBANCESSA1000000000TEMR1");
    const jugements = new Map([[rejeteAutrement.id, jugement(decisionsDe(rejeteAutrement, "rejeter"))]]);
    const plan = planifierTexteErrone(contexte({ items: [rejeteAutrement], jugements }));
    expect(plan.retours.map((retour) => [retour.item.id, retour.sort])).toEqual([[rejeteAutrement.id, "renvoyer"]]);
  });

  it("relance : un item déjà retourné en attente pour ce texte, puis jugé à nouveau, n'est pas renvoyé une seconde fois", () => {
    const y = itemSur("01JBANCESSA1000000000TEMY1");
    const retourne = renvoyerEnAttente(y, [RENVOI], TRACE);
    const rejuge = new Map([[retourne.id, jugement(decisionsDe(retourne, "accepter"), "lot-003")]]);
    const plan = planifierTexteErrone(contexte({ items: [retourne], jugements: rejuge }));
    expect(plan.retours).toEqual([]);
  });

  it("un renvoi sans empreinte de texte ne rapproche aucun item : il est rapporté à part, jamais apparié par le seul document", () => {
    const { texte_sha256: _retire, ...sansTexte } = source();
    const renvoi: SourceRenvoyee = { sha256: DOCUMENT, url: RENVOI.url, items: [X.id] };
    const memeDocumentSansTexte = itemSur("01JBANCESSA1000000000TEMS1", sansTexte);
    const memeDocumentAvecTexte = itemSur("01JBANCESSA1000000000TEMS2");
    const items = [memeDocumentSansTexte, memeDocumentAvecTexte];
    const plan = planifierTexteErrone(contexte({ renvois: [renvoi], items, jugements: jugementsComplets(items) }));
    expect(plan).toEqual({ retours: [], a_contester: [], sans_texte: [renvoi] });
  });
});

/**
 * Protocole 0.27 (conformité 2026-11-03 n° 1) : les trois cas que la 0.24 laissait « à trancher »
 * renvoient désormais leurs sources, et la validation des autres items sur ces textes tombe.
 */
describe("texte extrait erroné : du rejet qui renvoie aux autres items du même texte (protocole 0.27)", () => {
  const MOTIF = "texte_extrait_errone" as const;

  function rejet(annotateur_id: string, item: Item, motif: boolean): EntreeDecision {
    const entree = decision({ annotateur_id, item, decision: "rejeter" });
    return motif ? { ...entree, motif_rejet: MOTIF } : entree;
  }

  function verdictRejete(item: Item, decisions: readonly EntreeDecision[], arbitrage?: BlocArbitrage): VerdictRejet {
    const promu = arbitrage === undefined ? item : { ...item, arbitrage };
    const issue: Issue = { sort: "promouvoir", statut: "rejete", item: promu, corrections_appliquees: false };
    return { item, dossier: { decisions }, issue };
  }

  function blocArbitre(motif: boolean): BlocArbitrage {
    return {
      decision_id: "01JBANCESSA1ARB1TRAGE00001",
      date: "2026-10-02T10:00:00+02:00",
      arbitre: "auteur",
      arbitre_seul: false,
      motif: "desaccord",
      issue: "rejete",
      motivation: "Motivation publiée de la décision.",
      ...(motif ? { motif_rejet: MOTIF } : {}),
    };
  }

  function plan(verdicts: readonly VerdictRejet[], autres: readonly Item[], publies: readonly Item[] = []) {
    const renvois = renvoisAReextraction(verdicts);
    const items = [...verdicts.map((verdict) => verdict.item), ...autres];
    return planifierTexteErrone({
      renvois: renvois.sources,
      items,
      publies: new Map(publies.map((item) => [item.id, item])),
      jugements: jugementsComplets(items),
    });
  }

  it("un seul « rejeter » sous le motif : l'item non publié sur ce texte retourne en attente, le publié est à contester", () => {
    const discordant = itemSur("01JBANCESSA1000000000TEMD1");
    const y = itemSur("01JBANCESSA1000000000TEMY1");
    const publie = itemSur("01JBANCESSA1000000000TEMY2");
    const resultat = plan([verdictRejete(discordant, [rejet("a1", discordant, true), rejet("a2", discordant, false)])], [y, publie], [publie]);
    expect(resultat.retours.map((retour) => [retour.item.id, retour.sort])).toEqual([[y.id, "renvoyer"]]);
    expect(resultat.a_contester.map((entree) => entree.item.id)).toEqual([publie.id]);
  });

  it("rejet arbitré dont l'arbitre porte le motif : l'item sur ce texte retourne en attente", () => {
    const arbitre = itemSur("01JBANCESSA1000000000TEMD2");
    const y = itemSur("01JBANCESSA1000000000TEMY1");
    const accepte = decision({ annotateur_id: "a2", item: arbitre, decision: "accepter" });
    const resultat = plan([verdictRejete(arbitre, [rejet("a1", arbitre, false), accepte], blocArbitre(true))], [y]);
    expect(resultat.retours.map((retour) => retour.item.id)).toEqual([y.id]);
  });

  it("rejet arbitré dont l'arbitre ne porte pas le motif : aucun item touché, même si un annotateur l'avait donné", () => {
    const arbitre = itemSur("01JBANCESSA1000000000TEMD2");
    const y = itemSur("01JBANCESSA1000000000TEMY1");
    const accepte = decision({ annotateur_id: "a2", item: arbitre, decision: "accepter" });
    const resultat = plan([verdictRejete(arbitre, [rejet("a1", arbitre, true), accepte], blocArbitre(false))], [y]);
    expect(resultat).toEqual({ retours: [], a_contester: [], sans_texte: [] });
  });

  it("item O à deux sources distinctes : les items sur l'un comme sur l'autre texte retournent en attente", () => {
    const bloc = itemO().obsolescence as NonNullable<Item["obsolescence"]>;
    const deuxSources = itemO({
      id: "01JBANCESSA1000000000TEMD3",
      obsolescence: { ...bloc, etat_posterieur: { ...bloc.etat_posterieur, source: source({ sha256: "8".repeat(64) }) } },
    });
    const surPremiere = itemSur("01JBANCESSA1000000000TEMY1");
    const surSeconde = itemSur("01JBANCESSA1000000000TEMY2", source({ sha256: "8".repeat(64) }));
    const temoin = itemSur("01JBANCESSA1000000000TEMY3", source({ sha256: "7".repeat(64) }));
    const resultat = plan([verdictRejete(deuxSources, [rejet("a1", deuxSources, true), rejet("a2", deuxSources, true)])], [
      surPremiere,
      surSeconde,
      temoin,
    ]);
    expect(resultat.retours.map((retour) => retour.item.id)).toEqual([surPremiere.id, surSeconde.id]);
  });
});

describe("texte extrait erroné : garde-fous", () => {
  it("seul un item en attente retourne en attente", () => {
    const verifie = { ...itemSur("01JBANCESSA1000000000TEMV1"), statut_validation: "verifie" };
    expect(() => renvoyerEnAttente(verifie, [RENVOI], TRACE)).toThrow(/seul un item en attente/);
  });

  it("un retour sans texte en cause est refusé : il n'aurait rien à inscrire", () => {
    expect(() => renvoyerEnAttente(itemSur("01JBANCESSA1000000000TEMV2"), [], TRACE)).toThrow(/aucun texte/);
  });

  it("seuls les items qui portent un texte renvoyé identifié sont concernés (filtre des jugements lus)", () => {
    const { texte_sha256: _retire, ...sansTexte } = source();
    expect(porteUnTexteRenvoye(itemSur("01JBANCESSA1000000000TEMY1"), [RENVOI])).toBe(true);
    expect(porteUnTexteRenvoye(itemSur("01JBANCESSA1000000000TEMW1", source({ texte_sha256: AUTRE_TEXTE })), [RENVOI])).toBe(false);
    const { texte_sha256: _texte, ...renvoiSansTexte } = RENVOI;
    expect(porteUnTexteRenvoye(itemSur("01JBANCESSA1000000000TEMS1", sansTexte), [renvoiSansTexte])).toBe(false);
    expect(porteUnTexteRenvoye(itemSur("01JBANCESSA1000000000TEMS2"), [renvoiSansTexte])).toBe(false);
  });

  it("les jugements se lisent dans les verdicts ; un item jugé par deux lots arrête tout", () => {
    const y = itemSur("01JBANCESSA1000000000TEMY1");
    const decisions = decisionsDe(y, "accepter");
    const annotateurs = new Map([
      ["lot-001", ["a1", "a2"]],
      ["lot-002", ["a3", "a4"]],
    ]);
    const un = jugementsDesVerdicts([{ item: y, lot_id: "lot-001", dossier: { decisions } }], annotateurs);
    expect(un.get(y.id)).toEqual({ lot_id: "lot-001", annotateurs: ["a1", "a2"], decisions });
    expect(() =>
      jugementsDesVerdicts(
        [
          { item: y, lot_id: "lot-001", dossier: { decisions } },
          { item: y, lot_id: "lot-002", dossier: { decisions } },
        ],
        annotateurs,
      ),
    ).toThrow(/jugé à la fois par lot-001 et lot-002/);
    expect(() => jugementsDesVerdicts([{ item: y, lot_id: "lot-009", dossier: { decisions } }], annotateurs)).toThrow(
      /lot-009/,
    );
  });
});
