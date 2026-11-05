/**
 * §7, « Conflit d'intérêts » (protocole 0.24, D59 (14)) : « Pour chaque juge dont l'éditeur édite un
 * outil du run, l'écart signé entre son exactitude et celle de l'autre juge est calculé sur les
 * réponses de chaque outil ; l'écart sur l'outil de son propre éditeur est comparé à la moyenne de
 * ses écarts sur les autres outils, et leur différence reçoit un intervalle par bootstrap en grappes
 * (section 8). Elle est signalée dans le rapport quand cet intervalle exclut 0. »
 */

import { describe, expect, it } from "vitest";
import {
  ecartsJugesEditeurs,
  NotationDeJugeIncoherente,
  signaler,
  type EcartJugeEditeur,
  type JugeEtSonEditeur,
} from "../../analysis/ecart-juge-editeur.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import type { RenvoiLu } from "../../analysis/renvois-humains.ts";
import { taux, type CategorieRetenue, type Intervalle95, type Notation } from "../../analysis/types.ts";
import { notation, ulid, unite } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 200, graine_du_run: 20261201, cle: ["ecart_juge_editeur"] };

interface Jeu {
  readonly unites: UniteAnalyse[];
  readonly notations: Notation[];
}

function noteDeJuge(reponse_id: string, juge_id: string, categorie: CategorieRetenue, partiel: Partial<Notation> = {}): Notation {
  return notation({
    id: ulid(`n:${reponse_id}:${juge_id}:${JSON.stringify(partiel)}`),
    objet_note: { type: "reponse", id: reponse_id },
    notateur: { type: "juge", id: juge_id },
    categorie,
    motif_notation: "notation_juge",
    ...partiel,
  });
}

/** Une réponse de `outil_id` sur l'item `grappe`, notée `j1` par le juge j1 et `j2` par le juge j2. */
function reponseNotee(jeu: Jeu, outil_id: string, grappe: string, j1: CategorieRetenue, j2: CategorieRetenue): void {
  const reponse_id = ulid(`reponse:${outil_id}:${grappe}:${jeu.unites.length}`);
  jeu.unites.push(unite({ reponse_id, outil_id, grappe_id: ulid(grappe), item_principal_id: ulid(grappe), item_ids: [ulid(grappe)] }));
  jeu.notations.push(noteDeJuge(reponse_id, "j1", j1), noteDeJuge(reponse_id, "j2", j2));
}

/**
 * Sur chaque item : l'outil A noté exact par j1 et inexact par j2 ; les autres outils notés pareil
 * par les deux juges. L'écart de j1 vaut 1 sur A, 0 ailleurs, sur chaque rééchantillon.
 */
function jeuIndulgentSurA(outils: readonly string[], items = 4): Jeu {
  const jeu: Jeu = { unites: [], notations: [] };
  for (let i = 0; i < items; i += 1) {
    reponseNotee(jeu, "outil-a", `item-${i}`, "exacte", "inexacte");
    for (const outil of outils) reponseNotee(jeu, outil, `item-${i}`, "exacte", "exacte");
  }
  return jeu;
}

function juges(editeurJ1: readonly string[], editeurJ2: readonly string[] = []): JugeEtSonEditeur[] {
  return [
    { juge_id: "j1", outils_de_son_editeur: editeurJ1 },
    { juge_id: "j2", outils_de_son_editeur: editeurJ2 },
  ];
}

/** Le premier résultat par juge ; lève s'il n'y en a pas, pour que chaque test lise ses champs sans détour. */
function premier(resultat: { readonly par_juge: readonly EcartJugeEditeur[] }): EcartJugeEditeur {
  const [trouve] = resultat.par_juge;
  if (trouve === undefined) throw new Error("Aucun résultat par juge.");
  return trouve;
}

function intervalle(bas: number, haut: number): Intervalle95 {
  return { bas, haut, nombre_grappes: 5, reechantillonnages: 200, reechantillonnages_indefinis: 0, degenere: null };
}

/**
 * Sur chaque item, des exactitudes ni nulles ni égales à 1 : sur A, j1 à 2/3 et j2 à 1/3 (écart 1/3) ;
 * sur les autres outils, les deux à 1/2 (écart 0). La différence de j1 vaut 1/3 sur chaque rééchantillon.
 */
function jeuNuanceSurA(outils: readonly string[], items = 4): Jeu {
  const jeu: Jeu = { unites: [], notations: [] };
  for (let i = 0; i < items; i += 1) {
    reponseNotee(jeu, "outil-a", `item-${i}`, "exacte", "inexacte");
    reponseNotee(jeu, "outil-a", `item-${i}`, "inexacte", "inexacte");
    reponseNotee(jeu, "outil-a", `item-${i}`, "exacte", "exacte");
    for (const outil of outils) {
      reponseNotee(jeu, outil, `item-${i}`, "exacte", "exacte");
      reponseNotee(jeu, outil, `item-${i}`, "inexacte", "inexacte");
    }
  }
  return jeu;
}

/** Ajoute sur chaque item les réponses de `outil_id`, notées (j1, j2) comme `paires`. */
function ajouter(jeu: Jeu, outil_id: string, paires: readonly (readonly [CategorieRetenue, CategorieRetenue])[], items = 4): Jeu {
  for (let i = 0; i < items; i += 1) {
    for (const [j1, j2] of paires) reponseNotee(jeu, outil_id, `item-${i}`, j1, j2);
  }
  return jeu;
}

const ORDINAIRES = [taux(1, 3), taux(2, 3), taux(1, 2), taux(1, 2)];

describe("signaler", () => {
  it("signale un intervalle qui exclut 0, d'un côté ou de l'autre", () => {
    expect(signaler(ORDINAIRES, intervalle(0.1, 0.4))).toEqual({ signale: true, motif_sans_qualificatif: null });
    expect(signaler(ORDINAIRES, intervalle(-0.4, -0.1))).toEqual({ signale: true, motif_sans_qualificatif: null });
  });

  it("ne signale pas un intervalle qui touche 0 exactement", () => {
    expect(signaler(ORDINAIRES, intervalle(0, 0.4)).signale).toBe(false);
    expect(signaler(ORDINAIRES, intervalle(-0.4, 0)).signale).toBe(false);
  });

  it("ne se prononce pas sans intervalle, ni sur un intervalle d'une seule grappe (§8)", () => {
    expect(signaler(ORDINAIRES, null)).toEqual({ signale: null, motif_sans_qualificatif: "sans_intervalle" });
    expect(signaler(ORDINAIRES, { ...intervalle(1, 1), nombre_grappes: 1, degenere: "grappe_unique" })).toEqual({
      signale: null,
      motif_sans_qualificatif: "grappe_unique",
    });
  });

  it("ne se prononce pas quand une exactitude vaut 0 ou 1, même sur un intervalle qui exclut 0 (§7, 0.29, D71 (2))", () => {
    expect(signaler([taux(0, 3), ...ORDINAIRES], intervalle(0.1, 0.4))).toEqual({ signale: null, motif_sans_qualificatif: "taux_degenere" });
    expect(signaler([...ORDINAIRES, taux(3, 3)], intervalle(0.1, 0.4))).toEqual({ signale: null, motif_sans_qualificatif: "taux_degenere" });
  });
});

describe("ecartsJugesEditeurs", () => {
  it("cas ordinaire : calcule l'écart signé sur l'outil de l'éditeur contre la moyenne des autres, et le signale s'il exclut 0", () => {
    const jeu = jeuNuanceSurA(["outil-b", "outil-c"]);
    const resultat = ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS);
    const j1 = premier(resultat);
    expect(resultat.par_juge).toHaveLength(1);
    expect(j1.juge_id).toBe("j1");
    expect(j1.autre_juge_id).toBe("j2");
    expect(j1.ecarts.map((e) => [e.outil_id, e.ecart])).toEqual([
      ["outil-a", 2 / 3 - 1 / 3],
      ["outil-b", 0],
      ["outil-c", 0],
    ]);
    expect(j1.moyenne_autres_outils).toBe(0);
    expect(j1.difference).toBeCloseTo(1 / 3, 12);
    expect(j1.intervalle?.cle).toEqual(["bootstrap", "ecart_juge_editeur", "j1:propre-editeur"]);
    expect(j1.intervalle?.intervalle).toMatchObject({ nombre_grappes: 4, degenere: null });
    expect(j1.intervalle?.intervalle?.bas).toBeCloseTo(1 / 3, 12);
    expect(j1.signale).toBe(true);
    expect(j1.motif_sans_qualificatif).toBeNull();
    expect(j1.motif_absence).toBeNull();
    expect(resultat.juges_sans_outil_de_leur_editeur).toEqual(["j2"]);
  });

  it("intervalle qui exclurait 0 mais exactitudes à 0 et à 1 : la différence est publiée, non signalée (§7, 0.29)", () => {
    const jeu = jeuIndulgentSurA(["outil-b", "outil-c"]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.ecarts.map((e) => [e.outil_id, e.ecart])).toEqual([
      ["outil-a", 1],
      ["outil-b", 0],
      ["outil-c", 0],
    ]);
    expect(j1.difference).toBe(1);
    expect(j1.intervalle?.intervalle).toMatchObject({ bas: 1, haut: 1, nombre_grappes: 4, degenere: null });
    expect(j1.signale).toBeNull();
    expect(j1.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("exactitude du juge à 0 sur l'outil de son éditeur : non signalée", () => {
    const jeu = ajouter({ unites: [], notations: [] }, "outil-a", [
      ["inexacte", "exacte"],
      ["inexacte", "inexacte"],
    ]);
    ajouter(jeu, "outil-b", [
      ["exacte", "exacte"],
      ["inexacte", "inexacte"],
    ]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.ecarts[0]?.exactitude_juge.valeur).toBe(0);
    expect(j1.difference).toBe(-0.5);
    expect(j1.intervalle?.intervalle).toMatchObject({ bas: -0.5, haut: -0.5 });
    expect(j1.signale).toBeNull();
    expect(j1.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("exactitude du juge à 1 sur l'outil de son éditeur : non signalée", () => {
    const jeu = ajouter({ unites: [], notations: [] }, "outil-a", [
      ["exacte", "exacte"],
      ["exacte", "inexacte"],
    ]);
    ajouter(jeu, "outil-b", [
      ["exacte", "exacte"],
      ["inexacte", "inexacte"],
    ]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.ecarts[0]?.exactitude_juge.valeur).toBe(1);
    expect(j1.difference).toBe(0.5);
    expect(j1.intervalle?.intervalle).toMatchObject({ bas: 0.5, haut: 0.5 });
    expect(j1.signale).toBeNull();
    expect(j1.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("exactitude à 0 ou à 1 sur un autre outil seulement, de l'un ou l'autre juge : la différence en dépend, non signalée", () => {
    // Sur B, j1 à 1 (2/2) et j2 à 1/2 : écart 1/2 ; différence 1/3 − (1/2 + 0)/2 = 1/12.
    const juge = ajouter(jeuNuanceSurA(["outil-c"]), "outil-b", [
      ["exacte", "exacte"],
      ["exacte", "inexacte"],
    ]);
    const j1 = premier(ecartsJugesEditeurs(juge.unites, juge.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.difference).toBeCloseTo(1 / 12, 12);
    expect(j1.intervalle?.intervalle?.bas).toBeGreaterThan(0);
    expect(j1.signale).toBeNull();
    expect(j1.motif_sans_qualificatif).toBe("taux_degenere");

    // Sur B, l'autre juge à 0 (0/2) et j1 à 1/2 : écart 1/2, même différence.
    const autre = ajouter(jeuNuanceSurA(["outil-c"]), "outil-b", [
      ["exacte", "inexacte"],
      ["inexacte", "inexacte"],
    ]);
    const j1bis = premier(ecartsJugesEditeurs(autre.unites, autre.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1bis.difference).toBeCloseTo(1 / 12, 12);
    expect(j1bis.signale).toBeNull();
    expect(j1bis.motif_sans_qualificatif).toBe("taux_degenere");
  });

  it("une exactitude à 1 sur un autre outil sorti de la moyenne (écart indéfini) ne compte pas : la différence n'en dépend pas", () => {
    const jeu = ajouter(jeuNuanceSurA(["outil-b"]), "outil-c", [["exacte", "indeterminee"]]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.autres_outils_sans_ecart).toEqual(["outil-c"]);
    expect(j1.signale).toBe(true);
    expect(j1.motif_sans_qualificatif).toBeNull();
  });

  it("publie la clé §8 (0.25) : famille, métrique et strate, puis le composant <juge>:propre-editeur", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const resultat = ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), { ...OPTIONS, cle: ["exactitude", "global"] });
    expect(premier(resultat).intervalle?.cle).toEqual(["bootstrap", "exactitude", "global", "j1:propre-editeur"]);
  });

  it("garde le signe : un juge plus sévère que l'autre sur l'outil de son éditeur a une différence négative", () => {
    const jeu = jeuNuanceSurA(["outil-b", "outil-c"]);
    const j2 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges([], ["outil-a"]), OPTIONS));
    expect(j2.juge_id).toBe("j2");
    expect(j2.difference).toBeCloseTo(-1 / 3, 12);
    expect(j2.signale).toBe(true);
  });

  it("compare à l'écart du seul autre outil quand il n'y en a qu'un", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const j2 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges([], ["outil-b"]), OPTIONS));
    // j2 sur B : 1 − 1 = 0 ; sur A, seul autre outil : 0 − 1 = −1.
    expect(j2.moyenne_autres_outils).toBe(-1);
    expect(j2.difference).toBe(1);
  });

  it("ne signale pas une différence dont l'intervalle touche 0 exactement", () => {
    const paires = [
      ["exacte", "exacte"],
      ["inexacte", "inexacte"],
    ] as const;
    const jeu = ajouter(ajouter({ unites: [], notations: [] }, "outil-a", paires), "outil-b", paires);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.difference).toBe(0);
    expect(j1.intervalle?.intervalle).toMatchObject({ bas: 0, haut: 0 });
    expect(j1.signale).toBe(false);
    expect(j1.motif_sans_qualificatif).toBeNull();
  });

  it("publie absent, avec son motif, l'écart d'un juge dont l'éditeur n'a aucune réponse notée", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-delta"]), OPTIONS));
    expect(j1.difference).toBeNull();
    expect(j1.intervalle).toBeNull();
    expect(j1.signale).toBeNull();
    expect(j1.motif_sans_qualificatif).toBe("difference_indefinie");
    expect(j1.motif_absence).toBe("aucune_reponse_de_son_outil");
  });

  it("publie absent l'écart d'un juge dont l'outil de l'éditeur n'a aucune réponse classée", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    reponseNotee(jeu, "outil-d", "item-0", "indeterminee", "exacte");
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-d"]), OPTIONS));
    expect(j1.motif_absence).toBe("ecart_indefini_sur_son_outil");
    expect(j1.difference).toBeNull();
  });

  it("publie absent l'écart d'un juge sans autre outil à qui le comparer", () => {
    const jeu = jeuIndulgentSurA([]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.motif_absence).toBe("aucun_autre_outil_avec_ecart");
    expect(j1.moyenne_autres_outils).toBeNull();
  });

  it("sort de la moyenne, en le nommant, un autre outil dont l'écart n'est pas défini", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    reponseNotee(jeu, "outil-c", "item-0", "non_reponse", "non_reponse");
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.autres_outils_sans_ecart).toEqual(["outil-c"]);
    expect(j1.difference).toBe(1);
  });

  it("publie absent l'écart d'un juge dont l'éditeur édite plusieurs outils du run : la règle n'en compare qu'un", () => {
    const jeu = jeuIndulgentSurA(["outil-b", "outil-c"]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a", "outil-b"]), OPTIONS));
    expect(j1.motif_absence).toBe("plusieurs_outils_de_son_editeur");
    expect(j1.difference).toBeNull();
  });

  it("ne qualifie pas une différence calculée sur une seule grappe", () => {
    const jeu = jeuNuanceSurA(["outil-b"], 1);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    expect(j1.intervalle?.intervalle?.degenere).toBe("grappe_unique");
    expect(j1.signale).toBeNull();
    expect(j1.motif_sans_qualificatif).toBe("grappe_unique");
  });

  it("nomme les réponses qu'aucun juge n'a notées (refus de l'API, notés par règle) et les laisse hors du calcul", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const refus = unite({ reponse_id: ulid("refus"), outil_id: "outil-b", grappe_id: ulid("item-0") });
    const resultat = ecartsJugesEditeurs([...jeu.unites, refus], jeu.notations, [], juges(["outil-a"]), OPTIONS);
    expect(resultat.reponses_sans_note_de_juge).toEqual([ulid("refus")]);
    expect(premier(resultat).difference).toBe(1);
  });

  it("ignore les notations hors du contexte run (réponses permutées du contrefactuel)", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const permutee = noteDeJuge(jeu.unites[0]?.reponse_id ?? "", "j1", "inexacte", { contexte: "contrefactuel_outil" });
    const resultat = ecartsJugesEditeurs(jeu.unites, [...jeu.notations, permutee], [], juges(["outil-a"]), OPTIONS);
    expect(premier(resultat).difference).toBe(1);
  });

  it("lève sur une réponse notée par un seul des deux juges", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const seule = jeu.notations.filter((n, i) => i !== 0);
    expect(() => ecartsJugesEditeurs(jeu.unites, seule, [], juges(["outil-a"]), OPTIONS)).toThrow(NotationDeJugeIncoherente);
  });

  it("lève sur deux notations d'un même juge sur une même réponse", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const double = noteDeJuge(jeu.unites[0]?.reponse_id ?? "", "j1", "inexacte", { id: ulid("double") });
    expect(() => ecartsJugesEditeurs(jeu.unites, [...jeu.notations, double], [], juges(["outil-a"]), OPTIONS)).toThrow(NotationDeJugeIncoherente);
  });

  it("lève sur la notation d'un juge que le run ne déclare pas", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const intrus = noteDeJuge(jeu.unites[0]?.reponse_id ?? "", "j9", "exacte");
    expect(() => ecartsJugesEditeurs(jeu.unites, [...jeu.notations, intrus], [], juges(["outil-a"]), OPTIONS)).toThrow(/j9/);
  });

  it("lève sans exactement deux juges déclarés (§7, D58)", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    expect(() => ecartsJugesEditeurs(jeu.unites, jeu.notations, [], [{ juge_id: "j1", outils_de_son_editeur: ["outil-a"] }], OPTIONS)).toThrow(
      /deux juges/,
    );
  });
});

/* ------------------------------------------------------------------ D75 (25) : renvois */

/** Un renvoi de juge vers un humain, tel que l'écart le lit (`renvois-humains.ts:RenvoiLu`). */
function renvoi(reponse_id: string, juge_id: string, motif = "sortie_illisible", contexte = "run"): RenvoiLu {
  return { id: ulid(`renvoi:${reponse_id}:${juge_id}:${contexte}`), contexte, objet_note: { type: "reponse", id: reponse_id }, notateur: { id: juge_id }, motif };
}

/**
 * Ajoute sur chaque item une réponse de `outil_id` que `renvoyeurs` renvoient à un humain ; l'autre
 * juge, s'il n'est pas parmi eux, la note `note`.
 */
interface OptionsRenvoyees {
  readonly items?: number;
  readonly mode?: "web_activee" | "web_desactivee";
  readonly note?: CategorieRetenue;
}

function ajouterRenvoyees(jeu: Jeu, outil_id: string, renvoyeurs: readonly string[], options: OptionsRenvoyees = {}): RenvoiLu[] {
  const mode = options.mode ?? "web_desactivee";
  const note = options.note ?? "exacte";
  return Array.from({ length: options.items ?? 4 }, (_, i) => {
    const reponse_id = ulid(`renvoyee:${outil_id}:${mode}:${i}:${jeu.unites.length}`);
    const grappe = ulid(`item-${i}`);
    jeu.unites.push(unite({ reponse_id, outil_id, mode, grappe_id: grappe, item_principal_id: grappe, item_ids: [grappe] }));
    return issuesDesJuges(jeu, reponse_id, renvoyeurs, note);
  }).flat();
}

/** Chaque juge renvoie la réponse (j1 : contexte_depasse, j2 : sortie_illisible) ou la note `note`. */
function issuesDesJuges(jeu: Jeu, reponse_id: string, renvoyeurs: readonly string[], note: CategorieRetenue): RenvoiLu[] {
  const renvois: RenvoiLu[] = [];
  for (const juge of ["j1", "j2"]) {
    if (renvoyeurs.includes(juge)) renvois.push(renvoi(reponse_id, juge, juge === "j1" ? "contexte_depasse" : "sortie_illisible"));
    else jeu.notations.push(noteDeJuge(reponse_id, juge, note));
  }
  return renvois;
}

describe("D75 (25) : une réponse renvoyée à un humain par un juge sort du calcul, nommée", () => {
  it("D75 (25) renvoyée par un seul juge : hors du calcul, nommée avec le juge et son motif, sans exception", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const renvois = ajouterRenvoyees(jeu, "outil-b", ["j2"], { items: 1, note: "inexacte" });
    const resultat = ecartsJugesEditeurs(jeu.unites, jeu.notations, renvois, juges(["outil-a"]), OPTIONS);
    const [renvoyee] = jeu.unites.slice(-1);
    expect(resultat.reponses_renvoyees).toEqual([{ reponse_id: renvoyee?.reponse_id, renvois: [{ juge_id: "j2", motif: "sortie_illisible" }] }]);
    expect(resultat.reponses_sans_note_de_juge).toEqual([]);
    // La note « inexacte » de j1 sur la réponse renvoyée n'entre pas : outil-b reste à 4/4 pour les deux juges.
    const j1 = premier(resultat);
    expect(j1.ecarts.find((e) => e.outil_id === "outil-b")).toMatchObject({ exactitude_juge: { numerateur: 4, denominateur: 4 }, ecart: 0 });
    expect(j1.difference).toBe(1);
  });

  it("D75 (25) renvoyée par les deux juges : hors du calcul, nommée avec les deux renvois triés par juge, jamais parmi les réponses sans note", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const renvois = ajouterRenvoyees(jeu, "outil-b", ["j2", "j1"], { items: 1 });
    const resultat = ecartsJugesEditeurs(jeu.unites, jeu.notations, [...renvois].reverse(), juges(["outil-a"]), OPTIONS);
    const [renvoyee] = jeu.unites.slice(-1);
    expect(resultat.reponses_renvoyees).toEqual([
      { reponse_id: renvoyee?.reponse_id, renvois: [{ juge_id: "j1", motif: "contexte_depasse" }, { juge_id: "j2", motif: "sortie_illisible" }] },
    ]);
    expect(resultat.reponses_sans_note_de_juge).toEqual([]);
    expect(premier(resultat).difference).toBe(1);
  });

  it("D75 (25) aucune réponse renvoyée : sortie inchangée, liste vide ; un renvoi du test contrefactuel n'est pas lu", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const sans = ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS);
    expect(sans.reponses_renvoyees).toEqual([]);
    const permute = renvoi(jeu.unites[0]?.reponse_id ?? "", "j1", "sortie_illisible", "contrefactuel_outil");
    expect(ecartsJugesEditeurs(jeu.unites, jeu.notations, [permute], juges(["outil-a"]), OPTIONS)).toEqual(sans);
  });

  it("D75 (25) toutes les réponses de l'outil de son éditeur renvoyées : différence absente avec son motif, écart null, jamais 0", () => {
    const jeu = jeuIndulgentSurA([]);
    ajouter(jeu, "outil-b", [["exacte", "exacte"]]);
    const avant = jeu.unites.filter((u) => u.outil_id === "outil-a").map((u) => u.reponse_id);
    // Chaque réponse de outil-a : j2 renvoie au lieu de noter.
    const notations = jeu.notations.filter((n) => !(avant.includes(n.objet_note.id) && n.notateur.id === "j2"));
    const renvois = avant.map((id) => renvoi(id, "j2"));
    const resultat = ecartsJugesEditeurs(jeu.unites, notations, renvois, juges(["outil-a"]), OPTIONS);
    const j1 = premier(resultat);
    expect(j1).toMatchObject({ difference: null, intervalle: null, signale: null, motif_absence: "ecart_indefini_sur_son_outil" });
    expect(j1.ecarts.find((e) => e.outil_id === "outil-a")).toMatchObject({ exactitude_juge: { numerateur: 0, denominateur: 0 }, ecart: null });
    expect(resultat.reponses_renvoyees.map((r) => r.reponse_id)).toEqual(avant);
  });

  it("D75 (25) toutes les réponses d'un autre outil renvoyées : il sort de la moyenne, nommé dans autres_outils_sans_ecart", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const renvois = ajouterRenvoyees(jeu, "outil-c", ["j1"]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, renvois, juges(["outil-a"]), OPTIONS));
    expect(j1.autres_outils_sans_ecart).toEqual(["outil-c"]);
    expect(j1.ecarts.find((e) => e.outil_id === "outil-c")?.ecart).toBeNull();
    expect(j1.moyenne_autres_outils).toBe(0);
    expect(j1.difference).toBe(1);
  });

  it("D75 (25) toutes les réponses d'un couple outil × mode renvoyées, l'autre mode noté : calcul sur le reste, à l'identique", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const sans = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, [], juges(["outil-a"]), OPTIONS));
    const renvois = ajouterRenvoyees(jeu, "outil-a", ["j1"], { mode: "web_activee", note: "inexacte" });
    const resultat = ecartsJugesEditeurs(jeu.unites, jeu.notations, renvois, juges(["outil-a"]), OPTIONS);
    expect(resultat.reponses_renvoyees).toHaveLength(4);
    expect(premier(resultat)).toEqual(sans);
  });

  it("D75 (25) lève sur un juge qui renvoie une réponse qu'il a aussi notée", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const reponse_id = jeu.unites[0]?.reponse_id ?? "";
    expect(() => ecartsJugesEditeurs(jeu.unites, jeu.notations, [renvoi(reponse_id, "j1")], juges(["outil-a"]), OPTIONS)).toThrow(/aussi notée/);
  });

  it("D75 (25) lève sur une réponse renvoyée par un juge que l'autre n'a ni notée ni renvoyée", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const reponse_id = jeu.unites[0]?.reponse_id ?? "";
    const notations = jeu.notations.filter((n) => n.objet_note.id !== reponse_id);
    expect(() => ecartsJugesEditeurs(jeu.unites, notations, [renvoi(reponse_id, "j1")], juges(["outil-a"]), OPTIONS)).toThrow(NotationDeJugeIncoherente);
  });

  it("D75 (25) lève sur deux renvois d'un même juge, et sur le renvoi d'un juge que le run ne déclare pas", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const reponse_id = jeu.unites[0]?.reponse_id ?? "";
    const notations = jeu.notations.filter((n) => !(n.objet_note.id === reponse_id && n.notateur.id === "j1"));
    const deux = [renvoi(reponse_id, "j1"), { ...renvoi(reponse_id, "j1"), id: ulid("renvoi-bis") }];
    expect(() => ecartsJugesEditeurs(jeu.unites, notations, deux, juges(["outil-a"]), OPTIONS)).toThrow(/deux renvois/);
    expect(() => ecartsJugesEditeurs(jeu.unites, notations, [renvoi(reponse_id, "j9")], juges(["outil-a"]), OPTIONS)).toThrow(/j9/);
  });
});
