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
import type { CategorieRetenue, Intervalle95, Notation } from "../../analysis/types.ts";
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

describe("signaler", () => {
  it("signale un intervalle qui exclut 0, d'un côté ou de l'autre", () => {
    expect(signaler(intervalle(0.1, 0.4))).toBe(true);
    expect(signaler(intervalle(-0.4, -0.1))).toBe(true);
  });

  it("ne signale pas un intervalle qui touche 0 exactement", () => {
    expect(signaler(intervalle(0, 0.4))).toBe(false);
    expect(signaler(intervalle(-0.4, 0))).toBe(false);
  });

  it("ne se prononce pas sans intervalle, ni sur un intervalle d'une seule grappe (§8)", () => {
    expect(signaler(null)).toBeNull();
    expect(signaler({ ...intervalle(1, 1), nombre_grappes: 1, degenere: "grappe_unique" })).toBeNull();
  });
});

describe("ecartsJugesEditeurs", () => {
  it("calcule l'écart signé sur l'outil de l'éditeur contre la moyenne des autres, et le signale s'il exclut 0", () => {
    const jeu = jeuIndulgentSurA(["outil-b", "outil-c"]);
    const resultat = ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-a"]), OPTIONS);
    const j1 = premier(resultat);
    expect(resultat.par_juge).toHaveLength(1);
    expect(j1.juge_id).toBe("j1");
    expect(j1.autre_juge_id).toBe("j2");
    expect(j1.ecarts.map((e) => [e.outil_id, e.ecart])).toEqual([
      ["outil-a", 1],
      ["outil-b", 0],
      ["outil-c", 0],
    ]);
    expect(j1.moyenne_autres_outils).toBe(0);
    expect(j1.difference).toBe(1);
    expect(j1.intervalle?.cle).toEqual(["bootstrap", "ecart_juge_editeur", "j1"]);
    expect(j1.intervalle?.intervalle).toMatchObject({ bas: 1, haut: 1, nombre_grappes: 4, degenere: null });
    expect(j1.signale).toBe(true);
    expect(j1.motif_absence).toBeNull();
    expect(resultat.juges_sans_outil_de_leur_editeur).toEqual(["j2"]);
  });

  it("garde le signe : un juge plus sévère que l'autre sur l'outil de son éditeur a une différence négative", () => {
    const jeu = jeuIndulgentSurA(["outil-b", "outil-c"]);
    const j2 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges([], ["outil-a"]), OPTIONS));
    expect(j2.juge_id).toBe("j2");
    expect(j2.difference).toBe(-1);
    expect(j2.signale).toBe(true);
  });

  it("compare à l'écart du seul autre outil quand il n'y en a qu'un", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const j2 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges([], ["outil-b"]), OPTIONS));
    // j2 sur B : 1 − 1 = 0 ; sur A, seul autre outil : 0 − 1 = −1.
    expect(j2.moyenne_autres_outils).toBe(-1);
    expect(j2.difference).toBe(1);
  });

  it("ne signale pas une différence dont l'intervalle touche 0 exactement", () => {
    const jeu: Jeu = { unites: [], notations: [] };
    for (let i = 0; i < 4; i += 1) {
      reponseNotee(jeu, "outil-a", `item-${i}`, "exacte", "exacte");
      reponseNotee(jeu, "outil-b", `item-${i}`, "exacte", "exacte");
    }
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-a"]), OPTIONS));
    expect(j1.difference).toBe(0);
    expect(j1.intervalle?.intervalle).toMatchObject({ bas: 0, haut: 0 });
    expect(j1.signale).toBe(false);
  });

  it("publie absent, avec son motif, l'écart d'un juge dont l'éditeur n'a aucune réponse notée", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-delta"]), OPTIONS));
    expect(j1.difference).toBeNull();
    expect(j1.intervalle).toBeNull();
    expect(j1.signale).toBeNull();
    expect(j1.motif_absence).toBe("aucune_reponse_de_son_outil");
  });

  it("publie absent l'écart d'un juge dont l'outil de l'éditeur n'a aucune réponse classée", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    reponseNotee(jeu, "outil-d", "item-0", "indeterminee", "exacte");
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-d"]), OPTIONS));
    expect(j1.motif_absence).toBe("ecart_indefini_sur_son_outil");
    expect(j1.difference).toBeNull();
  });

  it("publie absent l'écart d'un juge sans autre outil à qui le comparer", () => {
    const jeu = jeuIndulgentSurA([]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-a"]), OPTIONS));
    expect(j1.motif_absence).toBe("aucun_autre_outil_avec_ecart");
    expect(j1.moyenne_autres_outils).toBeNull();
  });

  it("sort de la moyenne, en le nommant, un autre outil dont l'écart n'est pas défini", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    reponseNotee(jeu, "outil-c", "item-0", "non_reponse", "non_reponse");
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-a"]), OPTIONS));
    expect(j1.autres_outils_sans_ecart).toEqual(["outil-c"]);
    expect(j1.difference).toBe(1);
  });

  it("publie absent l'écart d'un juge dont l'éditeur édite plusieurs outils du run : la règle n'en compare qu'un", () => {
    const jeu = jeuIndulgentSurA(["outil-b", "outil-c"]);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-a", "outil-b"]), OPTIONS));
    expect(j1.motif_absence).toBe("plusieurs_outils_de_son_editeur");
    expect(j1.difference).toBeNull();
  });

  it("ne qualifie pas une différence calculée sur une seule grappe", () => {
    const jeu = jeuIndulgentSurA(["outil-b"], 1);
    const j1 = premier(ecartsJugesEditeurs(jeu.unites, jeu.notations, juges(["outil-a"]), OPTIONS));
    expect(j1.intervalle?.intervalle?.degenere).toBe("grappe_unique");
    expect(j1.signale).toBeNull();
  });

  it("nomme les réponses qu'aucun juge n'a notées (refus de l'API, notés par règle) et les laisse hors du calcul", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const refus = unite({ reponse_id: ulid("refus"), outil_id: "outil-b", grappe_id: ulid("item-0") });
    const resultat = ecartsJugesEditeurs([...jeu.unites, refus], jeu.notations, juges(["outil-a"]), OPTIONS);
    expect(resultat.reponses_sans_note_de_juge).toEqual([ulid("refus")]);
    expect(premier(resultat).difference).toBe(1);
  });

  it("ignore les notations hors du contexte run (réponses permutées du contrefactuel)", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const permutee = noteDeJuge(jeu.unites[0]?.reponse_id ?? "", "j1", "inexacte", { contexte: "contrefactuel_outil" });
    const resultat = ecartsJugesEditeurs(jeu.unites, [...jeu.notations, permutee], juges(["outil-a"]), OPTIONS);
    expect(premier(resultat).difference).toBe(1);
  });

  it("lève sur une réponse notée par un seul des deux juges", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const seule = jeu.notations.filter((n, i) => i !== 0);
    expect(() => ecartsJugesEditeurs(jeu.unites, seule, juges(["outil-a"]), OPTIONS)).toThrow(NotationDeJugeIncoherente);
  });

  it("lève sur deux notations d'un même juge sur une même réponse", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const double = noteDeJuge(jeu.unites[0]?.reponse_id ?? "", "j1", "inexacte", { id: ulid("double") });
    expect(() => ecartsJugesEditeurs(jeu.unites, [...jeu.notations, double], juges(["outil-a"]), OPTIONS)).toThrow(NotationDeJugeIncoherente);
  });

  it("lève sur la notation d'un juge que le run ne déclare pas", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    const intrus = noteDeJuge(jeu.unites[0]?.reponse_id ?? "", "j9", "exacte");
    expect(() => ecartsJugesEditeurs(jeu.unites, [...jeu.notations, intrus], juges(["outil-a"]), OPTIONS)).toThrow(/j9/);
  });

  it("lève sans exactement deux juges déclarés (§7, D58)", () => {
    const jeu = jeuIndulgentSurA(["outil-b"]);
    expect(() => ecartsJugesEditeurs(jeu.unites, jeu.notations, [{ juge_id: "j1", outils_de_son_editeur: ["outil-a"] }], OPTIONS)).toThrow(
      /deux juges/,
    );
  });
});
