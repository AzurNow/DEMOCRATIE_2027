/**
 * §7 « Calibration et fiabilité publiée » (protocole 0.23, D58) : kappa de chaque juge sur le jeu
 * d'or, contre la note humaine retenue, sur la catégorie primaire, non pondéré ; kappa de la paire =
 * le plus faible des deux ; réponses à note retenue indéterminée exclues et comptées ; kappa indéfini
 * absent avec son motif, jamais 0 ni 1.
 */

import { describe, expect, it } from "vitest";
import {
  inscriptionsJeuOr,
  JeuOrIncoherent,
  kappasJeuOr,
  type JugeDeclare,
  type ReponseDuJeuOr,
} from "../../analysis/kappa-jeu-or.ts";
import { categorieHumaineRetenue, kappaDeLaPaire } from "../../analysis/kappa-categorie-primaire.ts";
import type { CategorieRetenue, Notation, Ulid } from "../../analysis/types.ts";
import { validerFragment } from "../../outils/schemas/valider.ts";
import { ulid } from "./fabriques.ts";
import { inexacte, notationHumaine, notationJuge, notationRegle, renvoiJuge } from "../notation/fabriques.ts";

type Categorie3 = Exclude<CategorieRetenue, "indeterminee">;

const JUGES: readonly JugeDeclare[] = [
  { juge_id: "j1", retire: false },
  { juge_id: "j2", retire: false },
];

function surcharges(categorie: CategorieRetenue): ReturnType<typeof inexacte> | { categorie: CategorieRetenue } {
  return categorie === "inexacte" ? inexacte() : { categorie };
}

interface Ligne {
  readonly humains: readonly [CategorieRetenue, CategorieRetenue];
  readonly troisieme?: CategorieRetenue;
  readonly juges: Readonly<Record<string, Categorie3>>;
}

function reponse(rang: number, ligne: Ligne): ReponseDuJeuOr {
  const id = ulid(`reponse-jeu-or-${rang}`);
  const objet = { objet_note: { type: "reponse" as const, id } };
  const [h1, h2] = ligne.humains;
  return {
    reponse_id: id,
    calibration: [
      notationHumaine("annotateur-1", "calibration_jeu_or", { ...objet, ...surcharges(h1) }),
      notationHumaine("annotateur-2", "calibration_jeu_or", { ...objet, ...surcharges(h2) }),
    ],
    troisieme: ligne.troisieme === undefined ? null : notationHumaine("annotateur-3", "calibration_jeu_or", { ...objet, ...surcharges(ligne.troisieme) }),
    juges: Object.entries(ligne.juges).map(([juge, categorie]) => notationJuge(juge, { ...objet, ...surcharges(categorie) })),
    refus_api: null,
    renvois: [],
  };
}

function jeu(lignes: readonly Ligne[]): readonly ReponseDuJeuOr[] {
  return lignes.map((ligne, rang) => reponse(rang, ligne));
}

/** Les deux humains d'accord sur `ref`, j1 et j2 rendent les catégories données. */
function accord(ref: Categorie3, j1: Categorie3, j2: Categorie3): Ligne {
  return { humains: [ref, ref], juges: { j1, j2 } };
}

describe("kappa de chaque juge et de la paire sur le jeu d'or", () => {
  it("un juge parfait et l'autre faible : la paire vaut le kappa du faible (un juge faible ne se cache pas)", () => {
    const resultat = kappasJeuOr(JUGES, jeu([
      accord("exacte", "exacte", "exacte"),
      accord("exacte", "exacte", "inexacte"),
      accord("inexacte", "inexacte", "exacte"),
      accord("inexacte", "inexacte", "inexacte"),
    ]));
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: 1, motif_indefini: null, n: 4, renvois_ecartes: 0 },
      { juge_id: "j2", kappa: 0, motif_indefini: null, n: 4, renvois_ecartes: 0 },
    ]);
    expect(resultat.paire).toEqual({ kappa: 0, motif_indefini: null });
    expect(resultat.indeterminees).toBe(0);
  });

  it("non pondéré, trois catégories : non_reponse compte comme les autres", () => {
    const resultat = kappasJeuOr(JUGES, jeu([
      accord("exacte", "exacte", "exacte"),
      accord("inexacte", "inexacte", "inexacte"),
      accord("non_reponse", "non_reponse", "exacte"),
    ]));
    expect(resultat.kappas[0]?.kappa).toBe(1);
    // j2 : 2 accords sur 3 ; marges juge (2,1,0), humain (1,1,1) : pₑ = 3/9 ; κ = (2/3 − 1/3) / (1 − 1/3) = 1/2.
    expect(resultat.kappas[1]?.kappa).toBe(0.5);
    expect(resultat.paire.kappa).toBe(0.5);
  });

  it("deux humains en désaccord : la note du troisième humain est la référence", () => {
    const resultat = kappasJeuOr(JUGES, jeu([
      { humains: ["exacte", "inexacte"], troisieme: "inexacte", juges: { j1: "inexacte", j2: "inexacte" } },
      accord("exacte", "exacte", "exacte"),
    ]));
    expect(resultat.kappas.map((k) => k.kappa)).toEqual([1, 1]);
  });

  it("une seule catégorie partout : accord attendu maximal, kappa absent avec son motif, jamais 1 ; la paire aussi", () => {
    const resultat = kappasJeuOr(JUGES, jeu([accord("exacte", "exacte", "exacte"), accord("exacte", "exacte", "exacte")]));
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: null, motif_indefini: "accord_attendu_maximal", n: 2, renvois_ecartes: 0 },
      { juge_id: "j2", kappa: null, motif_indefini: "accord_attendu_maximal", n: 2, renvois_ecartes: 0 },
    ]);
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "accord_attendu_maximal" });
  });

  it("un seul kappa indéfini : la paire est absente, avec le motif de ce juge, jamais le kappa de l'autre", () => {
    // Référence toujours « exacte » : j1 varie (pₑ = 1/2, κ = 0, défini), j2 aussi constant (pₑ = 1, indéfini).
    const resultat = kappasJeuOr(JUGES, jeu([accord("exacte", "exacte", "exacte"), accord("exacte", "inexacte", "exacte")]));
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: 0, motif_indefini: null, n: 2, renvois_ecartes: 0 },
      { juge_id: "j2", kappa: null, motif_indefini: "accord_attendu_maximal", n: 2, renvois_ecartes: 0 },
    ]);
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "accord_attendu_maximal" });
    const indefini = kappaDeLaPaire([
      { juge_id: "j1", kappa: 0.9, motif_indefini: null },
      { juge_id: "j2", kappa: null, motif_indefini: "accord_attendu_maximal" },
    ]);
    expect(indefini).toEqual({ kappa: null, motif_indefini: "accord_attendu_maximal" });
  });

  it("aucune réponse commune (jeu d'or vide) : aucune_reponse_comparable, jamais 0 ni 1", () => {
    const resultat = kappasJeuOr(JUGES, []);
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0, renvois_ecartes: 0 },
      { juge_id: "j2", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0, renvois_ecartes: 0 },
    ]);
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "aucune_reponse_comparable" });
    expect(resultat.indeterminees).toBe(0);
  });

  it("toutes les notes retenues indéterminées : exclues et comptées, aucune réponse comparable", () => {
    const resultat = kappasJeuOr(JUGES, jeu([
      { humains: ["indeterminee", "indeterminee"], juges: { j1: "exacte", j2: "exacte" } },
      { humains: ["exacte", "inexacte"], troisieme: "indeterminee", juges: { j1: "exacte", j2: "inexacte" } },
    ]));
    expect(resultat.indeterminees).toBe(2);
    expect(resultat.kappas.every((k) => k.kappa === null && k.motif_indefini === "aucune_reponse_comparable" && k.n === 0)).toBe(true);
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "aucune_reponse_comparable" });
  });

  it("une indéterminée parmi d'autres : écartée, comptée, le kappa porte sur le reste", () => {
    const resultat = kappasJeuOr(JUGES, jeu([
      { humains: ["indeterminee", "indeterminee"], juges: { j1: "inexacte", j2: "inexacte" } },
      accord("exacte", "exacte", "exacte"),
      accord("inexacte", "inexacte", "inexacte"),
    ]));
    expect(resultat.indeterminees).toBe(1);
    expect(resultat.kappas.map((k) => [k.kappa, k.n])).toEqual([[1, 2], [1, 2]]);
  });
});

/**
 * §7 (protocole 0.24, D59 (20)) : « Comme pour l'échantillon, un refus de l'API, noté sans juge,
 * n'entre pas dans l'accord juge-humain du jeu d'or, et une question d'attribution qu'un juge renvoie
 * à un humain [...] n'entre pas dans le kappa de ce juge ; leur nombre est publié. Un kappa du jeu
 * d'or qui ne porte sur aucune réponse comparable est publié absent, avec ce motif. »
 */
describe("D59 (20) : refus de l'API et renvois d'attribution hors du kappa du jeu d'or, comptés", () => {
  /** Une réponse du jeu d'or refusée par l'API : notée par la règle (D32), par aucun juge. */
  function refus(rang: number): ReponseDuJeuOr {
    const id = ulid(`reponse-jeu-or-refus-${rang}`);
    const objet = { objet_note: { type: "reponse" as const, id } };
    return {
      reponse_id: id,
      calibration: [
        notationHumaine("annotateur-1", "calibration_jeu_or", { ...objet, categorie: "non_reponse" }),
        notationHumaine("annotateur-2", "calibration_jeu_or", { ...objet, categorie: "non_reponse" }),
      ],
      troisieme: null,
      juges: [],
      refus_api: notationRegle(objet),
      renvois: [],
    };
  }

  /** La réponse `ligne`, que le juge `juge_id` a renvoyée à un humain au lieu de la noter. */
  function renvoyee(rang: number, ligne: Ligne, juge_id: string): ReponseDuJeuOr {
    const r = reponse(rang, ligne);
    return { ...r, renvois: [...r.renvois, renvoiJuge(juge_id, { objet_note: { type: "reponse", id: r.reponse_id } })] };
  }

  it("refus de l'API : hors du kappa de chaque juge, compté une fois pour le jeu d'or", () => {
    const resultat = kappasJeuOr(JUGES, [
      ...jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "inexacte")]),
      refus(0),
    ]);
    expect(resultat.refus_api).toBe(1);
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: 1, motif_indefini: null, n: 2, renvois_ecartes: 0 },
      { juge_id: "j2", kappa: 1, motif_indefini: null, n: 2, renvois_ecartes: 0 },
    ]);
  });

  it("jeu d'or composé uniquement de refus : aucune réponse comparable, chaque kappa et la paire absents avec ce motif", () => {
    const resultat = kappasJeuOr(JUGES, [refus(0), refus(1), refus(2)]);
    expect(resultat.refus_api).toBe(3);
    expect(resultat.indeterminees).toBe(0);
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0, renvois_ecartes: 0 },
      { juge_id: "j2", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0, renvois_ecartes: 0 },
    ]);
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "aucune_reponse_comparable" });
  });

  it("la référence humaine d'un refus n'est pas lue : deux humains en désaccord sans troisième n'empêchent rien", () => {
    const r = refus(0);
    const divergent = { ...r, calibration: [r.calibration[0] as Notation, { ...(r.calibration[1] as Notation), categorie: "exacte" as const }] };
    expect(kappasJeuOr(JUGES, [divergent]).refus_api).toBe(1);
  });

  it("Q-ATT renvoyée par un juge : hors du kappa de CE juge seulement, comptée pour lui", () => {
    const resultat = kappasJeuOr(JUGES, [
      ...jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "inexacte")]),
      renvoyee(9, { humains: ["exacte", "exacte"], juges: { j2: "inexacte" } }, "j1"),
    ]);
    expect(resultat.kappas[0]).toEqual({ juge_id: "j1", kappa: 1, motif_indefini: null, n: 2, renvois_ecartes: 1 });
    // j2 garde la réponse : 2 accords sur 3 ; marges juge (exacte 1, inexacte 2), humain (2, 1) ; pₑ = 4/9 ; κ = (2/3 − 4/9) / (5/9) = 2/5.
    expect(resultat.kappas[1]?.renvois_ecartes).toBe(0);
    expect(resultat.kappas[1]?.n).toBe(3);
    expect(resultat.kappas[1]?.kappa).toBeCloseTo(2 / 5, 12);
    expect(resultat.refus_api).toBe(0);
  });

  it("Q-ATT renvoyée par les deux juges : écartée des deux kappas, comptée pour chacun", () => {
    const base = renvoyee(9, { humains: ["exacte", "exacte"], juges: {} }, "j1");
    const deux = { ...base, renvois: [...base.renvois, renvoiJuge("j2", { objet_note: { type: "reponse", id: base.reponse_id } })] };
    const resultat = kappasJeuOr(JUGES, [...jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "inexacte")]), deux]);
    expect(resultat.kappas.map((k) => [k.n, k.renvois_ecartes])).toEqual([[2, 1], [2, 1]]);
  });

  it("toutes les réponses renvoyées par un juge : son kappa est absent (aucune_reponse_comparable), la paire aussi", () => {
    const resultat = kappasJeuOr(JUGES, [renvoyee(0, { humains: ["exacte", "exacte"], juges: { j2: "exacte" } }, "j1")]);
    expect(resultat.kappas[0]).toEqual({ juge_id: "j1", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0, renvois_ecartes: 1 });
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "aucune_reponse_comparable" });
  });

  it("renvoi sur une réponse à note retenue indéterminée : comptée indéterminée, pas renvoyée (aucun double compte)", () => {
    const resultat = kappasJeuOr(JUGES, [
      ...jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "inexacte")]),
      renvoyee(9, { humains: ["indeterminee", "indeterminee"], juges: { j2: "exacte" } }, "j1"),
    ]);
    expect(resultat.indeterminees).toBe(1);
    expect(resultat.kappas.map((k) => k.renvois_ecartes)).toEqual([0, 0]);
  });

  it("le renvoi d'un juge retiré n'est pas lu : il n'a pas de kappa", () => {
    const resultat = kappasJeuOr([{ juge_id: "j1", retire: false }, { juge_id: "j2", retire: true }], [
      ...jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "inexacte")]),
      renvoyee(9, { humains: ["exacte", "exacte"], juges: { j1: "exacte" } }, "j2"),
    ]);
    expect(resultat.kappas).toEqual([{ juge_id: "j1", kappa: 1, motif_indefini: null, n: 3, renvois_ecartes: 0 }]);
  });

  it("Q-ATT renvoyée ET refus de l'API sur la même réponse : incohérent (aucun juge ne voit un refus, D32), rien n'est compté deux fois", () => {
    const r = refus(0);
    const renvoiSurRefus = { ...r, renvois: [renvoiJuge("j1", { objet_note: { type: "reponse", id: r.reponse_id } })] };
    expect(() => kappasJeuOr(JUGES, [renvoiSurRefus])).toThrow(/refus de l'API/);
  });

  it("une notation de juge sur un refus de l'API : incohérent (D32)", () => {
    const r = refus(0);
    const noteParUnJuge = { ...r, juges: [notationJuge("j1", { objet_note: { type: "reponse", id: r.reponse_id }, categorie: "non_reponse" })] };
    expect(() => kappasJeuOr(JUGES, [noteParUnJuge])).toThrow(JeuOrIncoherent);
  });

  it("un juge qui renvoie ET note la même réponse : deux issues, aucune n'est choisie", () => {
    const r = renvoyee(0, { humains: ["exacte", "exacte"], juges: { j1: "exacte", j2: "exacte" } }, "j1");
    expect(() => kappasJeuOr(JUGES, [r])).toThrow(JeuOrIncoherent);
  });

  it("un renvoi d'un juge non déclaré au run", () => {
    const r = renvoyee(0, { humains: ["exacte", "exacte"], juges: { j1: "exacte", j2: "exacte" } }, "j9");
    expect(() => kappasJeuOr(JUGES, [r])).toThrow(/j9/);
  });

  it("un « refus de l'API » qui n'est pas une notation par règle : incohérent", () => {
    const r = refus(0);
    const humain = { ...r, refus_api: r.calibration[0] as Notation };
    expect(() => kappasJeuOr(JUGES, [humain])).toThrow(JeuOrIncoherent);
  });
});

describe("juge retiré (§7 : ses notations sortent, le kappa ne porte plus que sur le juge restant)", () => {
  const RETIRE: readonly JugeDeclare[] = [
    { juge_id: "j1", retire: false },
    { juge_id: "j2", retire: true },
  ];

  it("le juge retiré n'a pas de kappa ; la paire est celle du juge restant, même si le retiré était faible", () => {
    const resultat = kappasJeuOr(RETIRE, jeu([
      accord("exacte", "exacte", "inexacte"),
      accord("inexacte", "inexacte", "exacte"),
    ]));
    expect(resultat.kappas).toEqual([{ juge_id: "j1", kappa: 1, motif_indefini: null, n: 2, renvois_ecartes: 0 }]);
    expect(resultat.paire).toEqual({ kappa: 1, motif_indefini: null });
  });

  it("le juge retiré peut ne porter aucune notation : rien ne lui est demandé", () => {
    const resultat = kappasJeuOr(RETIRE, jeu([{ humains: ["exacte", "exacte"], juges: { j1: "exacte" } }, { humains: ["inexacte", "inexacte"], juges: { j1: "inexacte" } }]));
    expect(resultat.kappas.map((k) => k.juge_id)).toEqual(["j1"]);
  });

  it("deux juges retirés : aucun kappa de paire n'existe, erreur visible (le run est invalide, D16 (3))", () => {
    expect(() => kappasJeuOr([{ juge_id: "j1", retire: true }, { juge_id: "j2", retire: true }], [])).toThrow(JeuOrIncoherent);
  });
});

describe("entrées incohérentes : erreur visible, aucune référence ni note inventée", () => {
  it("un run qui ne déclare pas exactement deux juges (§7, D58)", () => {
    expect(() => kappasJeuOr([{ juge_id: "j1", retire: false }], [])).toThrow(JeuOrIncoherent);
    expect(() => kappasJeuOr([...JUGES, { juge_id: "j3", retire: false }], [])).toThrow(JeuOrIncoherent);
  });

  it("désaccord des deux humains sans troisième humain", () => {
    expect(() => kappasJeuOr(JUGES, jeu([{ humains: ["exacte", "inexacte"], juges: { j1: "exacte", j2: "exacte" } }]))).toThrow(/troisième humain/);
  });

  it("troisième humain alors que les deux s'accordent", () => {
    expect(() => kappasJeuOr(JUGES, jeu([{ humains: ["exacte", "exacte"], troisieme: "exacte", juges: { j1: "exacte", j2: "exacte" } }]))).toThrow(JeuOrIncoherent);
  });

  it("troisième humain qui est l'un des deux premiers", () => {
    const [r] = jeu([{ humains: ["exacte", "inexacte"], troisieme: "exacte", juges: { j1: "exacte", j2: "exacte" } }]) as [ReponseDuJeuOr];
    const meme = { ...r, troisieme: { ...(r.troisieme as NonNullable<ReponseDuJeuOr["troisieme"]>), notateur: r.calibration[0]?.notateur as NonNullable<ReponseDuJeuOr["troisieme"]>["notateur"] } };
    expect(() => kappasJeuOr(JUGES, [meme])).toThrow(JeuOrIncoherent);
  });

  it("une seule notation de calibration, ou deux du même annotateur", () => {
    const [r] = jeu([accord("exacte", "exacte", "exacte")]) as [ReponseDuJeuOr];
    expect(() => kappasJeuOr(JUGES, [{ ...r, calibration: r.calibration.slice(0, 1) }])).toThrow(JeuOrIncoherent);
    const premiere = r.calibration[0] as ReponseDuJeuOr["calibration"][number];
    expect(() => kappasJeuOr(JUGES, [{ ...r, calibration: [premiere, { ...premiere, id: ulid("autre") }] }])).toThrow(JeuOrIncoherent);
  });

  it("une notation de calibration sous un autre motif que calibration_jeu_or", () => {
    const [r] = jeu([accord("exacte", "exacte", "exacte")]) as [ReponseDuJeuOr];
    const autre = { ...(r.calibration[1] as ReponseDuJeuOr["calibration"][number]), motif_notation: "echantillon_aleatoire_10" as const };
    expect(() => kappasJeuOr(JUGES, [{ ...r, calibration: [r.calibration[0] as typeof autre, autre] }])).toThrow(JeuOrIncoherent);
  });

  it("note d'un juge retenu absente sans refus de l'API ni renvoi : erreur, aucune note inventée", () => {
    expect(() => kappasJeuOr(JUGES, jeu([{ humains: ["exacte", "exacte"], juges: { j1: "exacte" } }]))).toThrow(/j2/);
  });

  it("deux notes du même juge sur une réponse", () => {
    const [r] = jeu([accord("exacte", "exacte", "exacte")]) as [ReponseDuJeuOr];
    const double = { ...r, juges: [...r.juges, { ...(r.juges[0] as ReponseDuJeuOr["juges"][number]), id: ulid("double") }] };
    expect(() => kappasJeuOr(JUGES, [double])).toThrow(JeuOrIncoherent);
  });

  it("une note d'un juge non déclaré au run", () => {
    expect(() => kappasJeuOr(JUGES, jeu([{ humains: ["exacte", "exacte"], juges: { j1: "exacte", j2: "exacte", j9: "exacte" } }]))).toThrow(/j9/);
  });
});

describe("note humaine retenue : une seule règle pour l'échantillon et le jeu d'or", () => {
  const objet = { objet_note: { type: "reponse" as const, id: ulid("r") } };
  const h = (a: string, c: CategorieRetenue) => notationHumaine(a, "calibration_jeu_or", { ...objet, ...surcharges(c) });

  it("deux humains qui concordent : leur catégorie, le troisième n'est pas lu", () => {
    expect(categorieHumaineRetenue(h("a1", "inexacte"), h("a2", "inexacte"), null)).toBe("inexacte");
  });

  it("deux humains qui divergent : celle du troisième ; sans lui, null (à l'appelant de lever)", () => {
    expect(categorieHumaineRetenue(h("a1", "exacte"), h("a2", "inexacte"), h("a3", "non_reponse"))).toBe("non_reponse");
    expect(categorieHumaineRetenue(h("a1", "exacte"), h("a2", "inexacte"), null)).toBeNull();
  });

  it("même catégorie, drapeaux différents : pas d'accord au sens du §7, le troisième tranche", () => {
    const a = notationHumaine("a1", "calibration_jeu_or", { ...objet, ...inexacte(["fabrication"]) });
    const b = notationHumaine("a2", "calibration_jeu_or", { ...objet, ...inexacte(["mauvaise_attribution"]) });
    expect(categorieHumaineRetenue(a, b, h("a3", "exacte"))).toBe("exacte");
  });
});

/** D64 (protocole 0.27) et D70 : la non classée sort du kappa du jeu d'or, comptée à part. */
describe("D64, D70 : réponse non classée sur le jeu d'or", () => {
  const BASE = [
    accord("exacte", "exacte", "exacte"),
    accord("exacte", "exacte", "inexacte"),
    accord("inexacte", "inexacte", "exacte"),
    accord("inexacte", "inexacte", "inexacte"),
  ];

  it("référence humaine non classée : kappas et paire inchangés par rapport au jeu sans elle, compte 1", () => {
    const sans = kappasJeuOr(JUGES, jeu(BASE));
    const avec = kappasJeuOr(JUGES, jeu([...BASE, { humains: ["non_classee", "non_classee"], juges: { j1: "exacte", j2: "exacte" } }]));
    expect(avec.kappas).toEqual(sans.kappas);
    expect(avec.paire).toEqual(sans.paire);
    expect(avec.non_classees).toBe(1);
    expect(sans.non_classees).toBe(0);
  });

  it("note d'un juge retenu non classée : la réponse sort du kappa des deux juges, compte 1", () => {
    const sans = kappasJeuOr(JUGES, jeu(BASE));
    const avec = kappasJeuOr(JUGES, jeu([...BASE, accord("exacte", "non_classee", "exacte")]));
    expect(avec.kappas).toEqual(sans.kappas);
    expect(avec.non_classees).toBe(1);
  });
});

/**
 * D73 (8), décision de forme hors protocole : les comptes du jeu d'or sont publiés à côté de
 * `kappa_juge_humain`, dans `run.json#/juges[]`. Ils viennent du même calcul que le kappa, sur la même
 * population : un compte recalculé ailleurs, sur d'autres réponses, ferait échouer ces tests.
 */
describe("D73 (8) : comptes du jeu d'or inscrits à côté du kappa de chaque juge", () => {
  function objetDe(id: Ulid) {
    return { objet_note: { type: "reponse" as const, id } };
  }

  function refusApi(rang: number): ReponseDuJeuOr {
    const id = ulid(`reponse-jeu-or-comptes-refus-${rang}`);
    return {
      reponse_id: id,
      calibration: [
        notationHumaine("annotateur-1", "calibration_jeu_or", { ...objetDe(id), categorie: "non_reponse" }),
        notationHumaine("annotateur-2", "calibration_jeu_or", { ...objetDe(id), categorie: "non_reponse" }),
      ],
      troisieme: null,
      juges: [],
      refus_api: notationRegle(objetDe(id)),
      renvois: [],
    };
  }

  /** Six réponses : trois comparables, dont une que j2 renvoie, une indéterminée, une non classée, un refus. */
  function jeuMele(): readonly ReponseDuJeuOr[] {
    const comparables = jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "exacte"), accord("non_reponse", "non_reponse", "non_reponse")]);
    const [premiere, ...autres] = comparables;
    if (premiere === undefined) throw new Error("jeu vide");
    const renvoyeeParJ2: ReponseDuJeuOr = {
      ...premiere,
      juges: premiere.juges.filter((n) => n.notateur.id !== "j2"),
      renvois: [renvoiJuge("j2", objetDe(premiere.reponse_id))],
    };
    return [
      renvoyeeParJ2,
      ...autres,
      reponse(10, { humains: ["indeterminee", "indeterminee"], juges: { j1: "exacte", j2: "exacte" } }),
      reponse(11, { humains: ["non_classee", "non_classee"], juges: { j1: "exacte", j2: "exacte" } }),
      refusApi(0),
    ];
  }

  it("comptes et kappa d'un seul calcul : comparees = n du kappa, et la somme rend toutes les réponses lues", () => {
    const reponses = jeuMele();
    const calcul = kappasJeuOr(JUGES, reponses);
    const inscriptions = inscriptionsJeuOr(JUGES, reponses);
    expect(inscriptions.map((i) => i.comptes_jeu_or)).toEqual([
      { reponses: 6, comparees: 3, renvois_ecartes: 0, indeterminees: 1, non_classees: 1, refus_api: 1 },
      { reponses: 6, comparees: 2, renvois_ecartes: 1, indeterminees: 1, non_classees: 1, refus_api: 1 },
    ]);
    for (const [rang, inscription] of inscriptions.entries()) {
      const kappa = calcul.kappas[rang];
      expect(inscription.juge_id).toBe(kappa?.juge_id);
      expect(inscription.comptes_jeu_or.comparees).toBe(kappa?.n);
      expect("kappa_juge_humain" in inscription ? inscription.kappa_juge_humain : null).toBe(kappa?.kappa);
      const c = inscription.comptes_jeu_or;
      expect(c.comparees + c.renvois_ecartes + c.indeterminees + c.non_classees + c.refus_api).toBe(reponses.length);
    }
  });

  it("kappa défini : kappa_juge_humain sans motif ; indéfini : le motif sans kappa, jamais 0, 1 ni null", () => {
    const [defini] = inscriptionsJeuOr(JUGES, jeu([accord("exacte", "exacte", "exacte"), accord("inexacte", "inexacte", "inexacte")]));
    expect(defini).toEqual({
      juge_id: "j1",
      kappa_juge_humain: 1,
      comptes_jeu_or: { reponses: 2, comparees: 2, renvois_ecartes: 0, indeterminees: 0, non_classees: 0, refus_api: 0 },
    });
    const [indefini] = inscriptionsJeuOr(JUGES, [refusApi(0), refusApi(1)]);
    expect(indefini).toEqual({
      juge_id: "j1",
      motif_indefini_kappa_juge_humain: "aucune_reponse_comparable",
      comptes_jeu_or: { reponses: 2, comparees: 0, renvois_ecartes: 0, indeterminees: 0, non_classees: 0, refus_api: 2 },
    });
    expect(Object.keys(indefini ?? {})).not.toContain("kappa_juge_humain");
  });

  it("chaque inscription passe le schéma de run.json#/juges[] une fois jointe aux champs du gel", () => {
    for (const inscription of [...inscriptionsJeuOr(JUGES, jeuMele()), ...inscriptionsJeuOr(JUGES, [refusApi(0)])]) {
      const juge = { famille_modele: "famille-x", modele: "famille-x/m", version_prompt: "prompts/judge-1.0.0", retire: false, ...inscription };
      expect(() => validerFragment("run", "#/properties/juges/items", juge, `juge ${inscription.juge_id}`)).not.toThrow();
    }
  });

  it("juge retiré (D13) : hors de l'accord, aucune inscription calculée pour lui ; celle du juge restant porte sur toutes les réponses", () => {
    const retire: readonly JugeDeclare[] = [
      { juge_id: "j1", retire: false },
      { juge_id: "j2", retire: true },
    ];
    const inscriptions = inscriptionsJeuOr(retire, jeu([accord("exacte", "exacte", "inexacte"), accord("inexacte", "inexacte", "exacte")]));
    expect(inscriptions.map((i) => i.juge_id)).toEqual(["j1"]);
    expect(inscriptions[0]?.comptes_jeu_or).toEqual({ reponses: 2, comparees: 2, renvois_ecartes: 0, indeterminees: 0, non_classees: 0, refus_api: 0 });
  });
});
