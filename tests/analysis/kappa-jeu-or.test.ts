/**
 * §7 « Calibration et fiabilité publiée » (protocole 0.23, D58) : kappa de chaque juge sur le jeu
 * d'or, contre la note humaine retenue, sur la catégorie primaire, non pondéré ; kappa de la paire =
 * le plus faible des deux ; réponses à note retenue indéterminée exclues et comptées ; kappa indéfini
 * absent avec son motif, jamais 0 ni 1.
 */

import { describe, expect, it } from "vitest";
import {
  JeuOrIncoherent,
  kappasJeuOr,
  type JugeDeclare,
  type ReponseDuJeuOr,
} from "../../analysis/kappa-jeu-or.ts";
import { categorieHumaineRetenue, kappaDeLaPaire } from "../../analysis/kappa-categorie-primaire.ts";
import type { CategorieRetenue } from "../../analysis/types.ts";
import { ulid } from "./fabriques.ts";
import { inexacte, notationHumaine, notationJuge } from "../notation/fabriques.ts";

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
      { juge_id: "j1", kappa: 1, motif_indefini: null, n: 4 },
      { juge_id: "j2", kappa: 0, motif_indefini: null, n: 4 },
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
      { juge_id: "j1", kappa: null, motif_indefini: "accord_attendu_maximal", n: 2 },
      { juge_id: "j2", kappa: null, motif_indefini: "accord_attendu_maximal", n: 2 },
    ]);
    expect(resultat.paire).toEqual({ kappa: null, motif_indefini: "accord_attendu_maximal" });
  });

  it("un seul kappa indéfini : la paire est absente, avec le motif de ce juge, jamais le kappa de l'autre", () => {
    // Référence toujours « exacte » : j1 varie (pₑ = 1/2, κ = 0, défini), j2 aussi constant (pₑ = 1, indéfini).
    const resultat = kappasJeuOr(JUGES, jeu([accord("exacte", "exacte", "exacte"), accord("exacte", "inexacte", "exacte")]));
    expect(resultat.kappas).toEqual([
      { juge_id: "j1", kappa: 0, motif_indefini: null, n: 2 },
      { juge_id: "j2", kappa: null, motif_indefini: "accord_attendu_maximal", n: 2 },
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
      { juge_id: "j1", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0 },
      { juge_id: "j2", kappa: null, motif_indefini: "aucune_reponse_comparable", n: 0 },
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
    expect(resultat.kappas).toEqual([{ juge_id: "j1", kappa: 1, motif_indefini: null, n: 2 }]);
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

  it("note d'un juge retenu absente (refus de l'API, renvoi d'attribution : règle non écrite au §7 pour le jeu d'or)", () => {
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
