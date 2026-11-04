/**
 * Promotion d'un item A (protocole 0.27, §4, D62 #233 (3) et D67) : « un item A n'est promu qu'une
 * fois rattachées à leur mesure (« Mesure d'un item extrait ») les propositions de position du
 * candidat déposées sur le corpus examiné. Aucun item A n'est créé quand un item T3 du candidat,
 * « à confirmer », porte sur la mesure. »
 *
 * Une proposition est rattachée quand l'auteur a arrêté sa mesure : le registre des relectures
 * (`validation/mesures/relectures.json`) porte une relecture de la mesure qu'elle cite, ou le
 * registre des rattachements (`validation/mesures/rattachements.json`) porte l'item vers cette
 * mesure. Une proposition qui cite encore la mesure que l'extraction lui a créée, jamais relue,
 * n'est pas rattachée.
 */

import { describe, expect, it } from "vitest";
import { refusPromotionAbsence, type PromotionAbsence } from "../validation/domaine/absence.ts";
import type { RattachementItem } from "../validation/domaine/rattachements-item.ts";
import type { RelectureMesure } from "../validation/domaine/relectures-mesure.ts";
import type { Item } from "../validation/domaine/types.ts";
import { extraireSource } from "../pipeline/extraction/extraction.ts";
import { itemA, itemF, itemO, itemP, source } from "./aides/fabriques.ts";
import { CANDIDAT, entreeHtml, ports, propose, SHA_SOURCE, sortie, sourceHtml } from "./extraction/aides.ts";

const MESURE = "01JBANCESSA90000000MESVRE1";
const AUTRE_MESURE = "01JBANCESSA90000000MESVRE7";
/** La mesure que l'extraction a créée pour la proposition, jamais relue. */
const MESURE_EXTRAITE = "01JBANCESSA90000000MESVRE8";
const HORS_CORPUS = "9".repeat(64);

function relecture(mesure_id: string): RelectureMesure {
  return { mesure_id, mesure_version: 1, empreinte: "e".repeat(64), date: "2026-10-20" };
}

function rattachement(item: Item, mesure_apres: string): RattachementItem {
  return {
    item_id: item.id,
    item_version: item.version,
    mesure_avant: MESURE_EXTRAITE,
    mesure_apres,
    mesure_version_apres: 1,
    date: "2026-10-20",
  };
}

const ASSERTION = itemP().assertion as NonNullable<Item["assertion"]>;

/** Une proposition P du candidat, sur le corpus examiné (source `1…1`), encore sur sa mesure d'extraction. */
function propositionExtraite(surcharges: Partial<Item> = {}): Item {
  return itemP({ id: "01JBANCESSA1000000001TEM0P", mesure_id: MESURE_EXTRAITE, ...surcharges });
}

function itemT3(surcharges: Partial<Item> = {}): Item {
  return itemP({
    id: "01JBANCESSA1000000001TEM0T",
    statut_validation: "a_confirmer",
    assertion: { ...ASSERTION, source: source({ tier: "T3", sha256: HORS_CORPUS }) },
    ...surcharges,
  });
}

function promotion(surcharges: Partial<PromotionAbsence> = {}): PromotionAbsence {
  return { item: itemA(), items: [], relectures: [relecture(MESURE)], rattachements: [], ...surcharges };
}

describe("propositions de position rattachées à leur mesure (D62 #233 (3))", () => {
  it("toutes les propositions du candidat rattachées, aucune sur la mesure : promouvable", () => {
    const relue = propositionExtraite();
    const rattachee = itemO({ id: "01JBANCESSA1000000001TEM0Q", mesure_id: AUTRE_MESURE });
    const refus = refusPromotionAbsence(
      promotion({
        items: [relue, rattachee],
        relectures: [relecture(MESURE), relecture(MESURE_EXTRAITE)],
        rattachements: [rattachement(rattachee, AUTRE_MESURE)],
      }),
    );
    expect(refus).toEqual([]);
  });

  it("une proposition du candidat rattachée à une autre mesure : promouvable (elle est rattachée)", () => {
    const ailleurs = propositionExtraite({ mesure_id: AUTRE_MESURE });
    expect(refusPromotionAbsence(promotion({ items: [ailleurs], rattachements: [rattachement(ailleurs, AUTRE_MESURE)] }))).toEqual([]);
  });

  it("une proposition du candidat non rattachée : refus nommé, qui cite la proposition", () => {
    const orpheline = propositionExtraite();
    expect(refusPromotionAbsence(promotion({ items: [orpheline] }))).toEqual([
      { motif: "propositions_non_rattachees", items: [orpheline.id] },
    ]);
  });

  it("une entrée de rattachement vers une autre mesure que celle que l'item cite ne le rattache pas", () => {
    // Registre en ajout seul : une entrée dépassée (l'item a changé de mesure depuis) ne prouve rien.
    const orpheline = propositionExtraite();
    expect(refusPromotionAbsence(promotion({ items: [orpheline], rattachements: [rattachement(orpheline, AUTRE_MESURE)] }))).toEqual([
      { motif: "propositions_non_rattachees", items: [orpheline.id] },
    ]);
  });

  it("un item O non rattaché dont seul l'état postérieur est sur le corpus examiné : refusé", () => {
    const base = itemO({ id: "01JBANCESSA1000000001TEM0R", mesure_id: MESURE_EXTRAITE });
    const obsolescence = base.obsolescence as NonNullable<Item["obsolescence"]>;
    const o: Item = {
      ...base,
      obsolescence: {
        ...obsolescence,
        etat_anterieur: { ...obsolescence.etat_anterieur, source: source({ sha256: HORS_CORPUS }) },
      },
    };
    expect(refusPromotionAbsence(promotion({ items: [o] }))).toEqual([{ motif: "propositions_non_rattachees", items: [o.id] }]);
  });

  it("la proposition non rattachée est d'un autre candidat : promouvable", () => {
    expect(refusPromotionAbsence(promotion({ items: [propositionExtraite({ candidat_id: "demo-beta" })] }))).toEqual([]);
  });

  it("une proposition non rattachée hors du corpus examiné : promouvable (la règle porte sur le corpus examiné)", () => {
    const horsCorpus = propositionExtraite({ assertion: { ...ASSERTION, source: source({ sha256: HORS_CORPUS }) } });
    expect(refusPromotionAbsence(promotion({ items: [horsCorpus] }))).toEqual([]);
  });

  it("un item F ou A non rattaché n'est pas une proposition de position (seuls P et O comptent)", () => {
    const fictif = itemF({ mesure_id: MESURE_EXTRAITE });
    const autreAbsence = itemA({ id: "01JBANCESSA1000000001TEM0S", mesure_id: MESURE_EXTRAITE });
    expect(refusPromotionAbsence(promotion({ items: [fictif, autreAbsence] }))).toEqual([]);
  });

  it("citation rejetée par le test verbatim : jamais déposée, elle n'est pas une proposition et reste au journal des rejets (D73 (10))", () => {
    // De bout en bout depuis le cœur de l'extraction : les deux modèles proposent une citation que
    // la source ne contient pas (coquille « corrigée »). `pipeline/extraction/rejets.ts` l'écarte
    // avant l'appariement, portée `item`, motif `introuvable` : elle est au journal des rejets, et
    // aucun item n'est déposé. Le témoin, même source et citation exacte, est déposé et compte.
    const texte = "Notre constat.\nNous ouvrirons les centres de santé municipaux le dimanche.";
    const exacte = "Nous ouvrirons les centres de santé municipaux le dimanche.";
    const corrigee = "Nous ouvrirons tous les centres de santé municipaux le dimanche.";
    const base = itemA({ candidat_id: CANDIDAT });
    const absence = base.absence as NonNullable<Item["absence"]>;
    const corpus = [{ url: sourceHtml(texte).url, sha256: SHA_SOURCE, tier: "T1" as const }];
    const item: Item = { ...base, absence: { ...absence, corpus_examine: corpus } };

    const rejetee = extraireSource(entreeHtml(texte, sortie(propose(corrigee)), sortie(propose(corrigee))), ports());
    expect(rejetee.items).toEqual([]);
    expect(rejetee.rejets.map((rejet) => [rejet.portee, rejet.motif])).toEqual([
      ["item", "introuvable"],
      ["item", "introuvable"],
    ]);
    expect(refusPromotionAbsence(promotion({ item, items: rejetee.items }))).toEqual([]);

    const temoin = extraireSource(entreeHtml(texte, sortie(propose(exacte)), sortie(propose(exacte))), ports());
    expect(refusPromotionAbsence(promotion({ item, items: temoin.items }))).toEqual([
      { motif: "propositions_non_rattachees", items: temoin.items.map((depose) => depose.id) },
    ]);
  });

  it("proposition déposée dont le test verbatim échoue : comptée, aucun filtre sur le test (D62 #233 (4) ouvert)", () => {
    // L'extraction ne dépose que des citations localisées (`passe: true`) : le cas ne naît pas du
    // pipeline. S'il naissait, la règle ne l'écarterait pas en silence.
    const echec = propositionExtraite({
      assertion: { ...ASSERTION, test_verbatim: { passe: false, date: "2026-10-20", version_normalisation: "1" } },
    });
    expect(refusPromotionAbsence(promotion({ items: [echec] }))).toEqual([
      { motif: "propositions_non_rattachees", items: [echec.id] },
    ]);
  });

  it("corpus examiné vide : refusé (`corpus_vide`), comme `item.schema.json` (minItems 1), jamais « rien à rattacher »", () => {
    const base = itemA();
    const absence = base.absence as NonNullable<Item["absence"]>;
    const item: Item = { ...base, absence: { ...absence, corpus_examine: [] } };
    expect(refusPromotionAbsence(promotion({ item, items: [propositionExtraite()] }))).toEqual([{ motif: "corpus_vide" }]);
  });
});

describe("item T3 du candidat sur la mesure (D67)", () => {
  it("un item T3 du candidat, à confirmer, sur la mesure : refusé", () => {
    const t3 = itemT3();
    expect(refusPromotionAbsence(promotion({ items: [t3] }))).toEqual([{ motif: "item_t3_sur_la_mesure", items: [t3.id] }]);
  });

  it("un item T3 sur une autre mesure, ou d'un autre candidat : promouvable", () => {
    const autreMesure = itemT3({ mesure_id: AUTRE_MESURE });
    const autreCandidat = itemT3({ id: "01JBANCESSA1000000001TEM0U", candidat_id: "demo-beta" });
    expect(refusPromotionAbsence(promotion({ items: [autreMesure, autreCandidat] }))).toEqual([]);
  });

  it("l'item A lui-même, à confirmer (source de couverture T3), ne se compte pas comme item T3 sur sa mesure", () => {
    const item = itemA({ statut_validation: "a_confirmer" });
    expect(refusPromotionAbsence(promotion({ item, items: [item] }))).toEqual([]);
  });

  it("les deux refus à la fois : chacun nommé, identifiants triés", () => {
    const orphelines = [
      propositionExtraite({ id: "01JBANCESSA1000000001TEM0Z" }),
      propositionExtraite({ id: "01JBANCESSA1000000001TEM0Y" }),
    ];
    const t3 = itemT3();
    expect(refusPromotionAbsence(promotion({ items: [...orphelines, t3] }))).toEqual([
      { motif: "propositions_non_rattachees", items: ["01JBANCESSA1000000001TEM0Y", "01JBANCESSA1000000001TEM0Z"] },
      { motif: "item_t3_sur_la_mesure", items: [t3.id] },
    ]);
  });

  it("un item qui n'est pas un item A est refusé, nommé", () => {
    expect(() => refusPromotionAbsence(promotion({ item: itemP() }))).toThrow(/01JBANCESSA1000000001TEM01/);
  });
});
