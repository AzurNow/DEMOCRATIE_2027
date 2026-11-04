/**
 * §7 (protocole 0.31, D73 (7)) : la liste des outils de l'éditeur de chaque juge, déclarée par
 * l'auteur au gel, ne nomme que des outils du run. Un outil absent du périmètre, ou présent mais
 * exclu, est refusé au gel, avant toute écriture : la liste n'est jamais filtrée en silence.
 */

import { describe, expect, it } from "vitest";
import { exigerOutilsDesEditeursDuRun, OutilDeSonEditeurHorsDuRun } from "../../pipeline/gel/editeurs.ts";

const OUTILS = [
  { outil_id: "outil-alpha", inclus: true },
  { outil_id: "outil-beta", inclus: true },
  { outil_id: "outil-exclu", inclus: false },
];

function juge(juge_id: string, outils_de_son_editeur: readonly string[]) {
  return { juge_id, outils_de_son_editeur };
}

function erreurDe(appel: () => unknown): Error {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("aucune erreur levée");
}

describe("D73 (7) : outils de l'éditeur d'un juge, contrôlés contre le périmètre du run au gel", () => {
  it("des outils inclus du périmètre, et une liste vide, passent", () => {
    expect(() => exigerOutilsDesEditeursDuRun([juge("juge-1", ["outil-alpha", "outil-beta"]), juge("juge-2", [])], OUTILS)).not.toThrow();
  });

  it("outil absent du périmètre du run ⇒ OutilDeSonEditeurHorsDuRun, qui nomme le juge et l'outil", () => {
    const erreur = erreurDe(() => exigerOutilsDesEditeursDuRun([juge("juge-1", []), juge("juge-2", ["outil-alpha", "outil-inconnu"])], OUTILS));
    expect(erreur).toBeInstanceOf(OutilDeSonEditeurHorsDuRun);
    expect(erreur.message).toContain("juge-2");
    expect(erreur.message).toContain("outil-inconnu");
    expect((erreur as OutilDeSonEditeurHorsDuRun).hors_du_run).toEqual([{ juge_id: "juge-2", outil_id: "outil-inconnu", motif: "absent_du_perimetre" }]);
  });

  it("outil du périmètre mais exclu ⇒ refusé : il n'est pas un outil du run", () => {
    const erreur = erreurDe(() => exigerOutilsDesEditeursDuRun([juge("juge-1", ["outil-exclu"]), juge("juge-2", [])], OUTILS));
    expect(erreur).toBeInstanceOf(OutilDeSonEditeurHorsDuRun);
    expect((erreur as OutilDeSonEditeurHorsDuRun).hors_du_run).toEqual([{ juge_id: "juge-1", outil_id: "outil-exclu", motif: "exclu_du_run" }]);
  });

  it("nomme chaque outil fautif de chaque juge, dans l'ordre déclaré", () => {
    const erreur = erreurDe(() => exigerOutilsDesEditeursDuRun([juge("juge-1", ["outil-z", "outil-alpha"]), juge("juge-2", ["outil-exclu"])], OUTILS));
    expect((erreur as OutilDeSonEditeurHorsDuRun).hors_du_run.map((h) => `${h.juge_id}/${h.outil_id}`)).toEqual(["juge-1/outil-z", "juge-2/outil-exclu"]);
  });
});
