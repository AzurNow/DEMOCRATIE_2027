/**
 * Rattachement des noms cités sur une question d'attribution (D27 (D)) : le juge relève les noms
 * tels qu'écrits, le code les rattache aux candidats du périmètre par la normalisation de la barrière
 * de symétrie du §5 (`libelles.ts`), sans jamais rapprocher.
 */

import { describe, expect, it } from "vitest";
import { NomCiteSansMot, rattacherNoms } from "../../pipeline/notation/rattachement.ts";
import { memesMots } from "../../pipeline/questions/libelles.ts";
import type { CandidatDuRun } from "../../analysis/types-notation.ts";

const PERIMETRE: readonly CandidatDuRun[] = [
  { candidat_id: "demo-alpha", libelle: "Alix Martinez", nom: "Martinez" },
  { candidat_id: "demo-beta", libelle: "Maxime Le Brun", nom: "Le Brun" },
  { candidat_id: "demo-gamma", libelle: "Camille Ollivier", nom: "Ollivier" },
  { candidat_id: "demo-delta", libelle: "Hélène Ollivier", nom: "Ollivier" },
];

describe("rattacherNoms", () => {
  it("nom seul : rattaché au seul candidat qui le porte", () => {
    expect(rattacherNoms(["Martinez"], PERIMETRE)).toEqual({ cites: ["demo-alpha"], hors_perimetre: [], ambigus: [] });
  });

  it("prénom et nom : rattaché par le libellé", () => {
    expect(rattacherNoms(["Maxime Le Brun"], PERIMETRE)).toEqual({ cites: ["demo-beta"], hors_perimetre: [], ambigus: [] });
  });

  it("nom hors périmètre : conservé tel qu'écrit, jamais rattaché", () => {
    expect(rattacherNoms(["Jean Dupont"], PERIMETRE)).toEqual({ cites: [], hors_perimetre: ["Jean Dupont"], ambigus: [] });
  });

  it("nom ambigu (deux candidats du même nom) : visible comme tel, rattaché à aucun", () => {
    expect(rattacherNoms(["Ollivier"], PERIMETRE)).toEqual({ cites: [], hors_perimetre: [], ambigus: ["Ollivier"] });
  });

  it("le prénom lève l'ambiguïté du nom partagé", () => {
    expect(rattacherNoms(["Hélène Ollivier"], PERIMETRE)).toEqual({ cites: ["demo-delta"], hors_perimetre: [], ambigus: [] });
  });

  it("casse et accents différents : même normalisation que la barrière du §5", () => {
    expect(rattacherNoms(["MARTINEZ", "helene ollivier", "le brun"], PERIMETRE)).toEqual({ cites: ["demo-alpha", "demo-beta", "demo-delta"], hors_perimetre: [], ambigus: [] });
    expect(memesMots("Hélène Ollivier", "HELENE OLLIVIER")).toBe(true);
  });

  it("une civilité ou un fragment n'est pas rapproché : égalité de mots, jamais inclusion", () => {
    expect(rattacherNoms(["M. Martinez", "Martinezville", "Brun"], PERIMETRE)).toEqual({ cites: [], hors_perimetre: ["M. Martinez", "Martinezville", "Brun"], ambigus: [] });
  });

  it("un candidat cité deux fois n'est compté qu'une fois ; un nom répété aussi", () => {
    expect(rattacherNoms(["Martinez", "Alix Martinez", "Jean Dupont", "Jean Dupont"], PERIMETRE)).toEqual({ cites: ["demo-alpha"], hors_perimetre: ["Jean Dupont"], ambigus: [] });
  });

  it("aucun nom : trois listes vides, une absence de citation est une donnée", () => {
    expect(rattacherNoms([], PERIMETRE)).toEqual({ cites: [], hors_perimetre: [], ambigus: [] });
  });

  it("un nom sans aucun mot est refusé, jamais classé", () => {
    expect(() => rattacherNoms(["  ", "Martinez"], PERIMETRE)).toThrow(NomCiteSansMot);
    expect(() => rattacherNoms(["—"], PERIMETRE)).toThrow(NomCiteSansMot);
  });

  it("les identifiants rendus sont triés, les noms gardent l'ordre de la réponse", () => {
    expect(rattacherNoms(["Ollivier", "Le Brun", "Zoé X", "Martinez", "Anne Y"], PERIMETRE)).toEqual({
      cites: ["demo-alpha", "demo-beta"],
      hors_perimetre: ["Zoé X", "Anne Y"],
      ambigus: ["Ollivier"],
    });
  });
});
