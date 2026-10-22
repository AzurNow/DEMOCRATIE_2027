/**
 * Alias aveugle de candidat (§7, protocole 0.20, D55 (9)) : table C1..Cn déterministe, dérivée de
 * la graine `alias_candidats` du run, sur les seuls candidats interrogés.
 */

import { describe, expect, it } from "vitest";
import { graineHexadecimale } from "../../analysis/graines.ts";
import {
  aliasDeCandidat,
  CandidatEnDouble,
  CandidatSansAlias,
  CLE_ALIAS_CANDIDATS,
  inverserTable,
  tableAliasCandidats,
} from "../../pipeline/notation/alias-candidats.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/graine.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import { CANDIDATS_DU_RUN } from "./fabriques.ts";

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

function candidats(n: number): readonly { readonly candidat_id: string }[] {
  return Array.from({ length: n }, (_, i) => ({ candidat_id: `cand-0${i}` }));
}

describe("table alias aveugle de candidat", () => {
  it("même graine, même liste ⇒ même table", () => {
    const a = tableAliasCandidats(candidats(5), graine(20261202));
    const b = tableAliasCandidats(candidats(5), graine(20261202));
    expect(a).toEqual(b);
  });

  it("l'ordre d'entrée des candidats est indifférent", () => {
    const ranges = candidats(5);
    const inverses = [...ranges].reverse();
    const reference = tableAliasCandidats(ranges, graine(20261202));
    expect(tableAliasCandidats(inverses, graine(20261202))).toEqual(reference);
  });

  it("deux graines différentes donnent, sur un cas fixe, deux ordres différents", () => {
    const a = tableAliasCandidats(candidats(5), graine(1));
    const b = tableAliasCandidats(candidats(5), graine(2));
    expect(a).not.toEqual(b);
  });

  it("forme C1 à Cn, n = le nombre de candidats reçus (les interrogés, jamais plus)", () => {
    const table = tableAliasCandidats(candidats(4), graine(1));
    expect(Object.keys(table).sort()).toEqual(["C1", "C2", "C3", "C4"]);
    expect(new Set(Object.values(table)).size).toBe(4);
  });

  it("un candidat non interrogé, non reçu par la fonction, n'a pas d'alias", () => {
    const table = tableAliasCandidats(candidats(2), graine(1));
    expect(Object.keys(table)).toHaveLength(2);
    expect(Object.values(table)).not.toContain("cand-02");
  });

  it("aucune saisie de l'auteur : seules la liste des candidats et la graine entrent dans le calcul", () => {
    expect(tableAliasCandidats.length).toBe(2);
  });

  it("une graine qui déclare un autre générateur lève GraineNonConforme", () => {
    expect(() => tableAliasCandidats(candidats(2), { ...graine(1), algorithme: "mt19937" })).toThrow(GraineNonConforme);
  });

  it("nomme la table d'alias, pas le tirage, dans le message de refus (constat 18 de la revue du 2026-10-12)", () => {
    const autre: GraineTirage = { ...graine(1), algorithme: "mt19937" };
    expect(() => tableAliasCandidats(candidats(2), autre)).toThrow(/Graine de la table d.alias non conforme/);
  });

  it("un identifiant de candidat en double lève CandidatEnDouble", () => {
    expect(() => tableAliasCandidats([...candidats(2), { candidat_id: "cand-00" }], graine(1))).toThrow(CandidatEnDouble);
  });

  it("valeur de référence figée : la graine et la table ne doivent pas bouger", () => {
    expect(CLE_ALIAS_CANDIDATS).toEqual(["alias_candidats"]);
    // printf '20261202\0alias_candidats' | shasum -a 256 | cut -c1-16
    expect(graineHexadecimale(20261202, CLE_ALIAS_CANDIDATS)).toBe("981298ab630d3d1c");
    expect(tableAliasCandidats(candidats(5), graine(20261202))).toEqual({
      C1: "cand-01",
      C2: "cand-03",
      C3: "cand-04",
      C4: "cand-00",
      C5: "cand-02",
    });
  });

  it("les trois candidats du run de test reçoivent chacun un alias distinct", () => {
    const table = tableAliasCandidats(CANDIDATS_DU_RUN, graine(20261203));
    expect(Object.keys(table).sort()).toEqual(["C1", "C2", "C3"]);
    expect(new Set(Object.values(table))).toEqual(new Set(CANDIDATS_DU_RUN.map((c) => c.candidat_id)));
  });
});

describe("index candidat_id ↔ alias", () => {
  it("inverserTable puis aliasDeCandidat retrouve l'alias de chaque candidat publié", () => {
    const table = tableAliasCandidats(candidats(3), graine(1));
    const index = inverserTable(table);
    for (const [alias, candidat_id] of Object.entries(table)) expect(aliasDeCandidat(index, candidat_id)).toBe(alias);
  });

  it("un candidat absent de la table (non interrogé) est refusé par aliasDeCandidat, jamais deviné", () => {
    const index = inverserTable(tableAliasCandidats(candidats(2), graine(1)));
    expect(() => aliasDeCandidat(index, "candidat-fantome")).toThrow(CandidatSansAlias);
  });
});
