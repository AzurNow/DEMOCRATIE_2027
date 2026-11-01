/**
 * §7.30 : l'accord des deux humains de l'échantillon de 10 %, publié par run (constat n° 8 de la mise
 * à jour de conformité du 2026-11-01). « S'accorder » est la règle du §7 (révision 0.14),
 * `analysis/note-lue.ts:notationsConcordent`, jamais réécrite.
 */

import { describe, expect, it } from "vitest";
import {
  accordHumainsEchantillon,
  accordPublie,
  DoubleNotationHumaineIncoherente,
} from "../../analysis/accord-humains.ts";
import { ulid } from "./fabriques.ts";
import { echantillonSynthetique, fois } from "../go-no-go/aides.ts";
import { inexacte, notationHumaine } from "../notation/fabriques.ts";

const ACCORD = { juges: {}, humains: ["exacte", "exacte"] } as const;
const DESACCORD = { juges: {}, humains: ["exacte", "inexacte"], arbitre: "exacte" } as const;

describe("§7.30 : accord des deux humains de l'échantillon", () => {
  it("tout concorde : part 1", () => {
    const { echantillon, notations } = echantillonSynthetique(fois(3, ACCORD));
    expect(accordHumainsEchantillon(echantillon, notations)).toEqual({ reponses_doublement_notees: 3, accords: 3, part: 1 });
  });

  it("rien ne concorde : part 0, définie puisque des réponses sont doublement notées", () => {
    const { echantillon, notations } = echantillonSynthetique(fois(2, DESACCORD));
    expect(accordHumainsEchantillon(echantillon, notations)).toEqual({ reponses_doublement_notees: 2, accords: 0, part: 0 });
  });

  it("mixte : 1 accord sur 4", () => {
    const { echantillon, notations } = echantillonSynthetique([ACCORD, ...fois(3, DESACCORD)]);
    expect(accordHumainsEchantillon(echantillon, notations)).toEqual({ reponses_doublement_notees: 4, accords: 1, part: 0.25 });
  });

  it("la règle est celle du §7 (tout ce que lisent les métriques primaires) : même catégorie, drapeaux différents ⇒ pas d'accord", () => {
    const id = ulid("reponse-drapeaux");
    const objet = { objet_note: { type: "reponse" as const, id } };
    const notations = [
      notationHumaine("annotateur-1", "echantillon_aleatoire_10", { ...objet, ...inexacte(["fabrication"]) }),
      notationHumaine("annotateur-2", "echantillon_aleatoire_10", { ...objet, ...inexacte(["mauvaise_attribution"]) }),
    ];
    expect(accordHumainsEchantillon([id], notations)).toEqual({ reponses_doublement_notees: 1, accords: 0, part: 0 });
  });

  it("réponse notée par un seul humain : exclue du numérateur et du dénominateur (ni accord ni désaccord)", () => {
    const { echantillon, notations } = echantillonSynthetique(fois(3, ACCORD));
    const seul = echantillon[0] as string;
    const amputees = notations.filter((n) => !(n.objet_note.id === seul && n.notateur.id === "annotateur-2"));
    expect(accordHumainsEchantillon(echantillon, amputees)).toEqual({ reponses_doublement_notees: 2, accords: 2, part: 1 });
  });

  it("échantillon vide : aucune réponse doublement notée, part absente (null), jamais 0 ni 1", () => {
    expect(accordHumainsEchantillon([], [])).toEqual({ reponses_doublement_notees: 0, accords: 0, part: null });
  });

  it("échantillon sans aucune double notation : part absente (null)", () => {
    const { echantillon, notations } = echantillonSynthetique(fois(2, ACCORD));
    const premiers = notations.filter((n) => n.notateur.id !== "annotateur-2");
    expect(accordHumainsEchantillon(echantillon, premiers)).toEqual({ reponses_doublement_notees: 0, accords: 0, part: null });
  });

  it("arbitrage d'un troisième humain : l'accord porte sur les deux premiers, l'arbitre n'en fait pas un accord", () => {
    // L'arbitre rejoint le premier humain : la note retenue existe, mais les deux humains ne s'accordaient pas.
    const { echantillon, notations } = echantillonSynthetique([DESACCORD]);
    expect(notations.some((n) => n.motif_notation === "arbitrage_echantillon_10")).toBe(true);
    expect(accordHumainsEchantillon(echantillon, notations)).toEqual({ reponses_doublement_notees: 1, accords: 0, part: 0 });
  });

  it("un arbitrage ne tient pas lieu de seconde notation : un humain d'échantillon et un arbitre ⇒ réponse exclue", () => {
    const { echantillon, notations } = echantillonSynthetique([DESACCORD]);
    const sansSecond = notations.filter((n) => n.notateur.id !== "annotateur-2");
    expect(accordHumainsEchantillon(echantillon, sansSecond)).toEqual({ reponses_doublement_notees: 0, accords: 0, part: null });
  });

  it("les notations hors de l'échantillon, d'un juge, ou d'un autre contexte n'entrent pas", () => {
    const { echantillon, notations } = echantillonSynthetique([{ juges: { j1: "inexacte" }, humains: ["exacte", "exacte"] }]);
    const dehors = ulid("reponse-hors-echantillon");
    const etrangeres = [
      notationHumaine("annotateur-1", "echantillon_aleatoire_10", { objet_note: { type: "reponse", id: dehors } }),
      notationHumaine("annotateur-2", "echantillon_aleatoire_10", { objet_note: { type: "reponse", id: dehors }, ...inexacte() }),
    ];
    expect(accordHumainsEchantillon(echantillon, [...notations, ...etrangeres])).toEqual({ reponses_doublement_notees: 1, accords: 1, part: 1 });
  });

  it("deux notations d'échantillon du même annotateur : DoubleNotationHumaineIncoherente, aucun compte rendu", () => {
    const id = ulid("reponse-meme-annotateur");
    const objet = { objet_note: { type: "reponse" as const, id } };
    const notations = [
      notationHumaine("annotateur-1", "echantillon_aleatoire_10", objet),
      { ...notationHumaine("annotateur-1", "echantillon_aleatoire_10", objet), id: ulid("seconde-notation-annotateur-1") },
    ];
    expect(() => accordHumainsEchantillon([id], notations)).toThrow(DoubleNotationHumaineIncoherente);
  });

  it("trois notations d'échantillon sur une réponse : DoubleNotationHumaineIncoherente", () => {
    const { echantillon, notations } = echantillonSynthetique([ACCORD]);
    const id = echantillon[0] as string;
    const troisieme = notationHumaine("annotateur-3", "echantillon_aleatoire_10", { objet_note: { type: "reponse", id } });
    expect(() => accordHumainsEchantillon(echantillon, [...notations, troisieme])).toThrow(DoubleNotationHumaineIncoherente);
  });
});

describe("§7.30 : forme publiée dans run.json", () => {
  it("une part définie est publiée avec ses effectifs", () => {
    expect(accordPublie({ reponses_doublement_notees: 4, accords: 1, part: 0.25 })).toEqual({ reponses_doublement_notees: 4, accords: 1, part: 0.25 });
  });

  it("une part indéfinie est absente de la forme publiée, ni 0, ni 1, ni null", () => {
    const publie = accordPublie({ reponses_doublement_notees: 0, accords: 0, part: null });
    expect(publie).toEqual({ reponses_doublement_notees: 0, accords: 0 });
    expect("part" in publie).toBe(false);
  });
});
