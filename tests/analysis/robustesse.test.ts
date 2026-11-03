/**
 * Analyses de robustesse préenregistrées (§8, protocole 0.3).
 *
 * « Recalcul des métriques primaires (a) sur la seule notation humaine de l'échantillon de 10 %,
 * (b) en excluant les items contestés à un run ultérieur, (c) en excluant les formulations
 * orientées, (d) en excluant les réponses tronquées. Un résultat qui ne survit pas à ces quatre
 * recalculs est signalé comme fragile. »
 */

import { describe, expect, it } from "vitest";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import {
  DivergenceSansArbitrage,
  EchantillonHumainIncoherent,
  evaluerRobustesse,
  exclureFormulationsOrientees,
  exclureItemsContestes,
  exclureReponsesTronquees,
  recalculEchantillonHumain,
  sourcageDeNotation,
} from "../../analysis/robustesse.ts";
import { exactitude, tauxFabrication } from "../../analysis/metriques.ts";
import type { Notation, Run } from "../../analysis/types.ts";
import { notation, run, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 100, graine_du_run: 20261201, cle: ["test", "robustesse"] };

function surItem(cle: string, partiel: Parameters<typeof unite>[0] = {}) {
  return unite({ ...partiel, grappe_id: ulid(cle), item_principal_id: ulid(cle), item_ids: [ulid(cle)] });
}

/**
 * Deux items témoins, identiques dans les deux bras : l'un exact, l'autre inexact. Leur différence
 * est nulle, et ils gardent chaque bras loin de 0/n et de n/n : un taux dégénéré ne qualifie aucune
 * différence (§8, 0.27 et 0.28), et ces tests portent sur la fragilité, pas sur cette règle.
 */
function temoins(partiel: Parameters<typeof unite>[0] = {}) {
  return [surItem("t-exacte", { ...partiel, categorie: "exacte" }), surItem("t-inexacte", { ...partiel, categorie: "inexacte" })];
}

/** Chaque réponse d'un bras reçoit son propre identifiant : deux bras sont deux outils. */
function bras(nom: string, unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.map((u, i) => ({ ...u, reponse_id: ulid(`${nom}:${i}`) }));
}

/**
 * Les deux notations humaines de l'échantillon, d'accord avec la note retenue du verdict, pour
 * chaque unité de l'échantillon. Sert aux tests où la question n'est pas l'écart humains-juges.
 */
function conformes(unites: readonly UniteAnalyse[]): Notation[] {
  return unites
    .filter((u) => u.dans_echantillon_humain)
    .flatMap((u) =>
      ["a1", "a2"].map((annotateur) =>
        notation({
          id: ulid(`n:${u.reponse_id}:${annotateur}`),
          objet_note: { type: "reponse", id: u.reponse_id },
          notateur: { type: "humain", id: annotateur },
          categorie: u.categorie,
          drapeaux: u.drapeaux,
        }),
      ),
    );
}

function evaluer(a: readonly UniteAnalyse[], b: readonly UniteAnalyse[], perimetre: Run = run()) {
  const brasA = bras("a", a);
  const brasB = bras("b", b);
  const sources = { run: perimetre, notations: conformes([...brasA, ...brasB]) };
  return evaluerRobustesse(brasA, brasB, sources, exactitude, OPTIONS);
}

describe("les quatre restrictions", () => {
  it("(b) écarte les items contestés après le gel du run", () => {
    const jeu = [surItem("i1"), surItem("i2")];
    const perimetre = run({
      contestations_posterieures: [
        { item_id: ulid("i2"), contestation_id: ulid("c1"), date_reception: "2026-12-10T09:00:00+01:00" },
      ],
    });

    const restant = exclureItemsContestes(jeu, perimetre);

    expect(restant).toHaveLength(1);
    expect(restant[0]?.item_principal_id).toBe(ulid("i1"));
    // Aucune contestation reçue : rien n'est retiré, et l'absence de liste n'est pas une erreur.
    expect(exclureItemsContestes(jeu, run())).toHaveLength(2);
  });

  it("(c) écarte les formulations orientées", () => {
    const jeu = [
      surItem("i1", { registre: "neutre" }),
      surItem("i2", { registre: "familier" }),
      surItem("i3", { registre: "oriente", premisse_fausse: true }),
    ];

    expect(exclureFormulationsOrientees(jeu).map((u) => u.registre)).toEqual(["neutre", "familier"]);
  });

  it("(d) retire exactement les réponses tronquées et garde toutes les autres", () => {
    // Deux réponses sur le même item : l'une tronquée, l'autre entière. La restriction porte sur
    // la réponse, pas sur l'item : la réponse entière de i1 reste.
    const jeu = [
      surItem("i1", { verdict_id: ulid("v-i1-entiere"), tronquee: false }),
      surItem("i1", { verdict_id: ulid("v-i1-tronquee"), tronquee: true }),
      surItem("i2", { verdict_id: ulid("v-i2-tronquee"), tronquee: true }),
      surItem("i3", { verdict_id: ulid("v-i3-entiere"), tronquee: false }),
    ];

    const restant = exclureReponsesTronquees(jeu);

    expect(restant.map((u) => u.verdict_id)).toEqual([ulid("v-i1-entiere"), ulid("v-i3-entiere")]);
  });
});

describe("ordre des recalculs", () => {
  it("rend quatre recalculs, dans l'ordre (a), (b), (c), (d) du §8", () => {
    const a = [surItem("i1", { categorie: "exacte" })];
    const b = [surItem("i1", { categorie: "inexacte" })];

    const resultat = evaluer(a, b);

    expect(resultat.recalculs.map((r) => r.recalcul)).toEqual([
      "echantillon_humain",
      "items_contestes",
      "formulations_orientees",
      "reponses_tronquees",
    ]);
  });
});

describe("marquage fragile", () => {
  it("laisse intact un résultat établi qui survit aux quatre recalculs", () => {
    // 4 items, toutes les réponses dans l'échantillon humain, aucune contestée, aucune orientée,
    // aucune tronquée. Bras A : exactes. Bras B : inexactes. Plus deux témoins, de différence nulle :
    // 5/6 contre 1/6, et un rééchantillon ne tombe à 0 que s'il ne tire que les témoins, (2/6)⁶ ≈
    // 0,14 %. Établie dans les cinq calculs.
    const cles = ["i1", "i2", "i3", "i4"];
    const echantillon = { dans_echantillon_humain: true } as const;
    const a = [...cles.map((c) => surItem(c, { ...echantillon, categorie: "exacte" })), ...temoins(echantillon)];
    const b = [...cles.map((c) => surItem(c, { ...echantillon, categorie: "inexacte" })), ...temoins(echantillon)];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs.map((r) => r.difference.qualificatif)).toEqual([
      "etablie",
      "etablie",
      "etablie",
      "etablie",
    ]);
    expect(resultat.fragile).toBe(false);
    expect(resultat.motifs_fragilite).toEqual([]);
  });

  it("marque fragile un résultat établi qui devient non établi sur la seule notation humaine", () => {
    // 8 items. Sur l'ensemble : i1 à i5, A exactes, B inexactes ; i6 et i7, inexactes des deux
    // côtés ; t, exacte des deux côtés → 6/8 contre 1/8, établie (un rééchantillon ne tombe à 0 que
    // s'il ne tire que i6, i7 et t : (3/8)⁸ ≈ 0,04 %, loin des 2,5 %).
    // Dans l'échantillon humain (i6, i7 et t, trois grappes) : 1/3 contre 1/3, aucun taux dégénéré
    // (§8, 0.27 et 0.28) → différence 0, intervalle contenant 0 → non établie. Le résultat ne
    // survit pas au recalcul (a). Plusieurs grappes et non une : depuis la 0.9, une seule grappe
    // ne se qualifie plus (§8).
    const communs = ["i1", "i2", "i3", "i4", "i5"];
    const echantillon = ["i6", "i7"];
    const temoin = surItem("t", { categorie: "exacte", dans_echantillon_humain: true });
    const a = [
      ...communs.map((c) => surItem(c, { categorie: "exacte" })),
      ...echantillon.map((c) => surItem(c, { categorie: "inexacte", dans_echantillon_humain: true })),
      temoin,
    ];
    const b = [
      ...communs.map((c) => surItem(c, { categorie: "inexacte" })),
      ...echantillon.map((c) => surItem(c, { categorie: "inexacte", dans_echantillon_humain: true })),
      temoin,
    ];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.recalcul).toBe("echantillon_humain");
    expect(resultat.recalculs[0]?.difference.qualificatif).toBe("non_etablie");
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("marque fragile un résultat dont un recalcul ne peut plus être calculé", () => {
    // Aucune réponse dans l'échantillon humain : le recalcul (a) n'a pas de différence à
    // qualifier. Une absence de confirmation n'est pas une confirmation. Cinq items et deux
    // témoins : établie au principal ((2/7)⁷ ≈ 0,015 % de rééchantillons à 0).
    const cles = ["i1", "i2", "i3", "i4", "i5"];
    const a = [...cles.map((c) => surItem(c, { categorie: "exacte" })), ...temoins()];
    const b = [...cles.map((c) => surItem(c, { categorie: "inexacte" })), ...temoins()];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("ne marque pas fragile ce qui n'était pas établi", () => {
    // §8 marque fragile « un résultat qui ne survit pas » : une différence non établie n'avait
    // rien à faire survivre, et la marquer fragile laisserait croire à un résultat rabaissé.
    const a = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "inexacte" })];
    const b = [surItem("i1", { categorie: "exacte" }), surItem("i2", { categorie: "inexacte" })];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("non_etablie");
    expect(resultat.fragile).toBe(false);
  });

  it("marque fragile un résultat établi dont un recalcul tombe sur une seule grappe", () => {
    // §8 (0.9) : un résultat « est fragile si, dans l'un des quatre recalculs, sa différence n'est
    // plus établie » ; sur une seule grappe, elle n'est qualifiée ni d'établie ni de non établie.
    // 5 items, A exactes, B inexactes : établie. Seul i1 est dans l'échantillon humain : le
    // recalcul (a) garde la différence 1, mais sur une grappe, donc sans qualificatif. Les deux
    // témoins, hors échantillon, gardent le principal hors des taux dégénérés (§8, 0.27 et 0.28).
    const cles = ["i1", "i2", "i3", "i4", "i5"];
    const a = [...cles.map((c) => surItem(c, { categorie: "exacte", dans_echantillon_humain: c === "i1" })), ...temoins()];
    const b = [...cles.map((c) => surItem(c, { categorie: "inexacte", dans_echantillon_humain: c === "i1" })), ...temoins()];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.difference.difference).toBe(1);
    expect(resultat.recalculs[0]?.difference.intervalle?.degenere).toBe("grappe_unique");
    expect(resultat.recalculs[0]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("marque fragile un résultat établi dont un recalcul tombe sur un taux dégénéré (§8, 0.27 et 0.28)", () => {
    // §8 : un résultat « est fragile si, dans l'un des quatre recalculs, sa différence n'est plus
    // établie ou ne peut plus être calculée ». i1 à i5, dans l'échantillon : A exacte, B inexacte.
    // Les deux témoins sont hors échantillon : principal 6/7 contre 1/7, établie. Sur la seule
    // notation humaine (i1 à i5, cinq grappes), 5/5 contre 0/5 : la différence vaut 1 sur un
    // intervalle [1 ; 1], mais ses deux taux sont dégénérés, elle n'est plus qualifiée.
    const cles = ["i1", "i2", "i3", "i4", "i5"];
    const a = [...cles.map((c) => surItem(c, { categorie: "exacte", dans_echantillon_humain: true })), ...temoins()];
    const b = [...cles.map((c) => surItem(c, { categorie: "inexacte", dans_echantillon_humain: true })), ...temoins()];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.difference).toMatchObject({
      difference: 1,
      intervalle: { bas: 1, haut: 1, nombre_grappes: 5, degenere: null },
      qualificatif: null,
      motif_sans_qualificatif: "taux_degenere",
    });
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("ne marque jamais fragile un résultat principal calculé sur une seule grappe", () => {
    // Un seul item, A exacte, B inexacte, hors échantillon humain : la différence principale vaut
    // 1 mais n'est pas qualifiée (§8, 0.9, « une seule grappe »). Pas établie, donc pas un
    // résultat : rien à faire survivre, même si le recalcul (a) ne peut plus être calculé.
    const a = [surItem("i1", { categorie: "exacte" })];
    const b = [surItem("i1", { categorie: "inexacte" })];

    const resultat = evaluer(a, b);

    expect(resultat.principal.difference).toBe(1);
    expect(resultat.principal.intervalle?.degenere).toBe("grappe_unique");
    expect(resultat.principal.qualificatif).toBeNull();
    expect(resultat.recalculs[0]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(false);
    expect(resultat.motifs_fragilite).toEqual([]);
  });

  it("marque fragile un résultat établi qui cesse de l'être seulement quand on retire les tronquées", () => {
    // 7 items, tous dans l'échantillon humain, aucun contesté, aucune formulation orientée : (a),
    // (b) et (c) recalculent sur le jeu entier et confirment le calcul principal.
    // i1 à i5, tronquées : A exacte, B inexacte. i6 et i7, entières : A et B inexactes. t,
    // entière : A et B exactes. Principal : 6/8 contre 1/8, établie. Sans les tronquées (i6, i7
    // et t, trois grappes) : 1/3 contre 1/3, aucun taux dégénéré (§8, 0.27 et 0.28), différence 0,
    // non établie. Le résultat tient aux seules réponses tronquées. Plusieurs grappes entières et
    // non une : depuis la 0.9, une seule grappe ne se qualifie plus (§8).
    const tronquees = ["i1", "i2", "i3", "i4", "i5"];
    const entieres = ["i6", "i7"];
    const commun = { dans_echantillon_humain: true } as const;
    const temoin = surItem("t", { ...commun, categorie: "exacte" });
    const a = [
      ...tronquees.map((c) => surItem(c, { ...commun, categorie: "exacte", tronquee: true })),
      ...entieres.map((c) => surItem(c, { ...commun, categorie: "inexacte" })),
      temoin,
    ];
    const b = [
      ...tronquees.map((c) => surItem(c, { ...commun, categorie: "inexacte", tronquee: true })),
      ...entieres.map((c) => surItem(c, { ...commun, categorie: "inexacte" })),
      temoin,
    ];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs.map((r) => r.difference.qualificatif)).toEqual([
      "etablie",
      "etablie",
      "etablie",
      "non_etablie",
    ]);
    expect(resultat.recalculs[3]?.difference.difference).toBe(0);
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["reponses_tronquees"]);
  });

  it("marque fragile un résultat établi dont toutes les réponses sont tronquées", () => {
    // Le recalcul (d) ne laisse plus aucune réponse : il n'a pas de différence à qualifier.
    // Une absence de confirmation n'est pas une confirmation, en (d) comme en (a).
    // Cinq items et deux témoins tronqués : établie au principal, hors des taux dégénérés.
    const cles = ["i1", "i2", "i3", "i4", "i5"];
    const commun = { dans_echantillon_humain: true, tronquee: true } as const;
    const a = [...cles.map((c) => surItem(c, { ...commun, categorie: "exacte" })), ...temoins(commun)];
    const b = [...cles.map((c) => surItem(c, { ...commun, categorie: "inexacte" })), ...temoins(commun)];

    const resultat = evaluer(a, b);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[3]?.recalcul).toBe("reponses_tronquees");
    expect(resultat.recalculs[3]?.difference.difference).toBeNull();
    expect(resultat.recalculs[3]?.difference.qualificatif).toBeNull();
    expect(resultat.fragile).toBe(true);
    expect(resultat.motifs_fragilite).toEqual(["reponses_tronquees"]);
  });

  it("sans aucune réponse tronquée, le recalcul (d) rend exactement le calcul principal", () => {
    // Même jeu, même graine : retirer zéro réponse ne doit rien changer, intervalle compris.
    const a = [
      surItem("i1", { categorie: "exacte" }),
      surItem("i2", { categorie: "inexacte" }),
      surItem("i3", { categorie: "exacte" }),
    ];
    const b = [
      surItem("i1", { categorie: "inexacte" }),
      surItem("i2", { categorie: "inexacte" }),
      surItem("i3", { categorie: "exacte" }),
    ];

    const resultat = evaluer(a, b);

    expect(resultat.recalculs[3]?.recalcul).toBe("reponses_tronquees");
    expect(resultat.recalculs[3]?.difference).toEqual(resultat.principal);
  });
});

/*
 * Recalcul (a) sur la seule notation humaine (constats n° 8 et 49 ; §7 depuis la 0.7) : « Pour une
 * réponse de l'échantillon, la note humaine prévaut sur celle des juges. Quand les deux humains
 * s'accordent, leur note est retenue ; quand ils divergent, la réponse est arbitrée par un
 * troisième humain, et c'est cette note que retient le recalcul (a) du §8. »
 *
 * Remplace le test « (a) ne garde que les verdicts de l'échantillon humain », qui figeait la
 * lecture de `verdict.categorie_retenue` : c'est précisément ce que le protocole exclut.
 */
describe("(a) : la note humaine de l'échantillon, lue dans les notations individuelles", () => {
  const R = ulid("r-echantillon");
  const dansEchantillon = surItem("i1", { reponse_id: R, dans_echantillon_humain: true, categorie: "exacte" });

  function humaine(annotateur: string, partiel: Parameters<typeof notation>[0] = {}) {
    return notation({
      id: ulid(`n:${annotateur}`),
      objet_note: { type: "reponse", id: R },
      notateur: { type: "humain", id: annotateur },
      ...partiel,
    });
  }

  const juge = (id: string, partiel: Parameters<typeof notation>[0] = {}) =>
    notation({
      id: ulid(`n:${id}`),
      objet_note: { type: "reponse", id: R },
      notateur: { type: "juge", id },
      motif_notation: "notation_juge",
      ...partiel,
    });

  it("deux humains d'accord contre les juges : la note humaine remplace la note retenue", () => {
    // Verdict : exacte (accord des juges). Les deux humains : inexacte, déformation, un lien
    // existant qui soutient. Tout ce que lisent les métriques vient des humains.
    const noteHumaine = {
      categorie: "inexacte",
      drapeaux: ["deformation"],
      sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "soutient" }] },
    } as const;
    const notations = [
      juge("juge-1"),
      juge("juge-2"),
      humaine("a1", noteHumaine),
      humaine("a2", noteHumaine),
    ];

    const [recalculee] = recalculEchantillonHumain([dansEchantillon], notations);

    expect(recalculee?.categorie).toBe("inexacte");
    expect(recalculee?.drapeaux).toEqual(["deformation"]);
    expect(recalculee?.sourcage).toEqual({
      cite: true,
      au_moins_un_lien_existant: true,
      au_moins_un_lien_soutenant: true,
    });
    expect(recalculee?.reponse_id).toBe(R);
  });

  it("deux humains divergents et un troisième : la note du troisième", () => {
    const notations = [
      humaine("a1", { categorie: "exacte" }),
      humaine("a2", { categorie: "non_reponse" }),
      humaine("a3", { categorie: "indeterminee", motif_notation: "arbitrage_echantillon_10" }),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("indeterminee");
  });

  it("deux humains d'accord sur la catégorie mais pas sur les drapeaux divergent", () => {
    // « Leur note » n'existe que si les deux notes sont identiques sur tout ce que lisent les
    // métriques primaires ; sinon il n'y a pas de note commune à retenir.
    const notations = [
      humaine("a1", { categorie: "inexacte", drapeaux: ["deformation"] }),
      humaine("a2", { categorie: "inexacte", drapeaux: ["obsolescence"], obsolescence_fraiche: false }),
    ];

    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(DivergenceSansArbitrage);
  });

  it("un désaccord sur un booléen du sourçage que les métriques ne lisent pas n'est pas un désaccord", () => {
    // Décision de l'auteur du 2026-10-02, conformité n° 43, texte en 0.15 : les métriques
    // primaires ne lisent du sourçage que `au_moins_un_lien_soutenant` (`metriques.ts:
    // sourcageValide`). a1 voit une citation et un lien vivant qui ne soutient pas ; a2 ne voit
    // aucune citation. « Cite » et « lien existant » divergent, le sourçage valide (non) est le
    // même : les deux humains s'accordent, aucun troisième n'est requis.
    const notations = [
      humaine("a1", {
        categorie: "inexacte",
        sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "ne_soutient_pas" }] },
      }),
      humaine("a2", { categorie: "inexacte", sourcage: { cite: false, liens: [] } }),
    ];

    const [recalculee] = recalculEchantillonHumain([dansEchantillon], notations);

    expect(recalculee?.categorie).toBe("inexacte");
    expect(recalculee?.sourcage.au_moins_un_lien_soutenant).toBe(false);
  });

  it("un désaccord sur le lien existant et soutenant, que lisent les métriques, reste un désaccord", () => {
    const notations = [
      humaine("a1", {
        sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "soutient" }] },
      }),
      humaine("a2", {
        sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "ne_soutient_pas" }] },
      }),
    ];

    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(DivergenceSansArbitrage);
  });

  it("divergence sans troisième humain : erreur nommée, jamais la note des juges en repli", () => {
    const notations = [juge("juge-1"), juge("juge-2"), humaine("a1"), humaine("a2", { categorie: "inexacte" })];

    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(DivergenceSansArbitrage);
    expect(() => recalculEchantillonHumain([dansEchantillon], notations)).toThrow(R);
  });

  it("une réponse hors échantillon n'entre pas dans le recalcul (a)", () => {
    const hors = surItem("i2", { reponse_id: ulid("r-hors"), dans_echantillon_humain: false });
    const notations = [humaine("a1"), humaine("a2")];

    const recalculees = recalculEchantillonHumain([dansEchantillon, hors], notations);

    expect(recalculees.map((u) => u.reponse_id)).toEqual([R]);
  });

  it("une notation d'échantillon sur une réponse marquée hors échantillon est une incohérence", () => {
    const hors = surItem("i2", { reponse_id: R, dans_echantillon_humain: false });

    expect(() => recalculEchantillonHumain([hors], [humaine("a1"), humaine("a2")])).toThrow(
      EchantillonHumainIncoherent,
    );
  });

  it("ne lit jamais une notation de juge, même portant un motif d'échantillon ou d'arbitrage", () => {
    // Deux humains d'accord (exacte). Des juges notent inexacte, dont un sous le motif
    // d'échantillon et un sous le motif d'arbitrage : s'ils étaient lus, il y aurait trois
    // notations d'échantillon, ou un arbitrage sans divergence, et la note changerait.
    const notations = [
      juge("juge-1", { categorie: "inexacte", drapeaux: ["deformation"], motif_notation: "echantillon_aleatoire_10" }),
      juge("juge-2", { categorie: "inexacte", drapeaux: ["deformation"], motif_notation: "arbitrage_echantillon_10" }),
      humaine("a1"),
      humaine("a2"),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("exacte");
  });

  it("ne lit pas un humain appelé pour une autre raison que l'échantillon", () => {
    // Un humain qui tranche un désaccord de juges ou revoit une erreur grave n'est pas tiré au sort.
    const notations = [
      humaine("a1"),
      humaine("a2"),
      humaine("a3", { categorie: "inexacte", drapeaux: ["fabrication"], motif_notation: "erreur_grave" }),
      humaine("a4", { categorie: "non_reponse", motif_notation: "desaccord_juges" }),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("exacte");
  });

  it("ne lit pas une notation hors contexte run", () => {
    const notations = [
      humaine("a1"),
      humaine("a2"),
      humaine("a3", { categorie: "inexacte", contexte: "contrefactuel_candidat" }),
    ];

    expect(recalculEchantillonHumain([dansEchantillon], notations)[0]?.categorie).toBe("exacte");
  });

  it("refuse une réponse de l'échantillon qui n'a pas ses deux notations humaines", () => {
    expect(() => recalculEchantillonHumain([dansEchantillon], [humaine("a1")])).toThrow(EchantillonHumainIncoherent);
    expect(() => recalculEchantillonHumain([dansEchantillon], [])).toThrow(EchantillonHumainIncoherent);
  });

  it("refuse une double notation par le même annotateur, et un arbitre qui a déjà noté", () => {
    expect(() => recalculEchantillonHumain([dansEchantillon], [humaine("a1"), humaine("a1")])).toThrow(
      EchantillonHumainIncoherent,
    );
    const arbitreDejaVu = [
      humaine("a1"),
      humaine("a2", { categorie: "inexacte" }),
      notation({
        id: ulid("n:a1-arbitre"),
        objet_note: { type: "reponse", id: R },
        notateur: { type: "humain", id: "a1" },
        motif_notation: "arbitrage_echantillon_10",
      }),
    ];
    expect(() => recalculEchantillonHumain([dansEchantillon], arbitreDejaVu)).toThrow(EchantillonHumainIncoherent);
  });

  it("refuse un arbitrage alors que les deux humains s'accordent, et deux arbitrages", () => {
    const arbitre = (id: string) =>
      humaine(id, { categorie: "inexacte", motif_notation: "arbitrage_echantillon_10" });

    expect(() =>
      recalculEchantillonHumain([dansEchantillon], [humaine("a1"), humaine("a2"), arbitre("a3")]),
    ).toThrow(EchantillonHumainIncoherent);
    expect(() =>
      recalculEchantillonHumain(
        [dansEchantillon],
        [humaine("a1"), humaine("a2", { categorie: "non_reponse" }), arbitre("a3"), arbitre("a4")],
      ),
    ).toThrow(EchantillonHumainIncoherent);
  });

  it("marque fragile un résultat établi que la note humaine contredit sur tout l'échantillon", () => {
    // 4 items, tous dans l'échantillon. Verdicts : A exacte, B inexacte → différence 1, établie.
    // Les humains notent les deux bras inexacts : sur la seule notation humaine, différence 0.
    // Avant la correction, (a) relisait les verdicts et confirmait à tort le résultat. Cinq items et
    // deux témoins : établie au principal, hors des taux dégénérés (§8, 0.27 et 0.28).
    const cles = ["i1", "i2", "i3", "i4", "i5"];
    const echantillon = { dans_echantillon_humain: true } as const;
    const a = bras("a", [...cles.map((c) => surItem(c, { ...echantillon, categorie: "exacte" })), ...temoins(echantillon)]);
    const b = bras("b", [...cles.map((c) => surItem(c, { ...echantillon, categorie: "inexacte" })), ...temoins(echantillon)]);
    const notations = [...a, ...b].flatMap((u) =>
      ["a1", "a2"].map((annotateur) =>
        notation({
          id: ulid(`n:${u.reponse_id}:${annotateur}`),
          objet_note: { type: "reponse", id: u.reponse_id },
          notateur: { type: "humain", id: annotateur },
          categorie: "inexacte",
        }),
      ),
    );

    const resultat = evaluerRobustesse(a, b, { run: run(), notations }, exactitude, OPTIONS);

    expect(resultat.principal.qualificatif).toBe("etablie");
    expect(resultat.recalculs[0]?.difference.difference).toBe(0);
    expect(resultat.motifs_fragilite).toEqual(["echantillon_humain"]);
  });

  it("les métriques à drapeau se recalculent aussi sur la note humaine", () => {
    // Item A : verdict sans fabrication, humains d'accord sur une fabrication.
    const itemA = surItem("i-a", { reponse_id: R, dans_echantillon_humain: true, type_item_principal: "A" });
    const notations = ["a1", "a2"].map((annotateur) =>
      humaine(annotateur, { categorie: "inexacte", drapeaux: ["fabrication"] }),
    );

    expect(tauxFabrication([itemA]).numerateur).toBe(0);
    expect(tauxFabrication(recalculEchantillonHumain([itemA], notations)).numerateur).toBe(1);
  });
});

describe("sourçage d'une notation humaine (§8 : « au moins une source existante qui soutient »)", () => {
  it("un lien mort qui soutient et un lien vivant hors sujet ne font pas un sourçage soutenant", () => {
    const n = notation({
      sourcage: {
        cite: true,
        liens: [
          { verdict_existence: "mort", verdict_soutien: "soutient" },
          { verdict_existence: "existe", verdict_soutien: "ne_soutient_pas" },
        ],
      },
    });

    expect(sourcageDeNotation(n)).toEqual({
      cite: true,
      au_moins_un_lien_existant: true,
      au_moins_un_lien_soutenant: false,
    });
  });

  it("un même lien existant et soutenant fait un sourçage soutenant", () => {
    const n = notation({
      sourcage: { cite: true, liens: [{ verdict_existence: "existe", verdict_soutien: "soutient" }] },
    });

    expect(sourcageDeNotation(n).au_moins_un_lien_soutenant).toBe(true);
  });
});
