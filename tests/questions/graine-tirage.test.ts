/**
 * Constat n° 24 de la conformité du 2026-09-24 : « avec une graine publiée, ce qui rend le tirage
 * reproductible » (§5). `tirer` recopiait `demande.graine` sans vérifier qu'elle désigne le
 * générateur réellement employé (`validation/domaine/alea.ts`, `splitmix64-sha256-v1`) : un tirage
 * publié pouvait nommer PCG64, et un tiers qui rejoue avec PCG64 obtient un autre tirage (§9).
 *
 * Le générateur ne change pas : seule la déclaration est contrôlée. L'empreinte figée ci-dessous a
 * été calculée AVANT le contrôle, sur le code de la PR #39 : elle garde que la correction ne
 * déplace aucune question tirée.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALGORITHME_ALEA } from "../../validation/domaine/alea.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { DemandeTirage } from "../../pipeline/questions/tirage.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../pipeline/questions/graine.ts";
import { tiragePrecedentDe } from "../../pipeline/questions/entrees-tirage.ts";
import { candidat, graine, jeu, run } from "./fabriques.ts";

const JEU = jeu({
  candidats: ["demo-alpha", "demo-beta"],
  themes: ["fiscalite_pouvoir_achat", "retraites"],
  mesures_par_theme: 4,
  themes_manquants: { "demo-beta": ["retraites"] },
});
const RUN = run([candidat({ candidat_id: "demo-alpha" }), candidat({ candidat_id: "demo-beta" })]);
const PRECEDENT = tiragePrecedentDe(
  "44CX8VSV75Q6ZAHDEJ8VA81YQE",
  JEU.questions.filter((_, rang) => rang % 3 === 0),
);

function demande(graine_tirage: DemandeTirage["graine"]): DemandeTirage {
  return {
    questions: JEU.questions,
    items: JEU.items,
    mesures: JEU.mesures,
    run: RUN,
    graine: graine_tirage,
    parametres: { questions_par_strate: 2, questions_attribution_par_theme: 2 },
    tirage_precedent: PRECEDENT,
  };
}

/** Ce qui fait le tirage : les questions choisies dans leur ordre, les reprises, les compensations. */
function empreinteDuTirage(resultat: ReturnType<typeof tirer>): string {
  const trace = {
    entrees: resultat.tirage.entrees.map((entree) => [entree.question_id, entree.reprise]),
    compensations: resultat.tirage.compensations,
    bilan: resultat.tirage.bilan_reprise,
  };
  return createHash("sha256").update(JSON.stringify(trace)).digest("hex");
}

describe("n° 24 : la graine désigne le générateur employé", () => {
  it("graine correcte : tirage identique à celui d'avant le contrôle (empreinte figée)", () => {
    const resultat = tirer(demande(graine()));
    expect(resultat.tirage.entrees).toHaveLength(28);
    expect(empreinteDuTirage(resultat)).toBe("71d889944896840f1d256ddd0714299db2056e3cd964a6999f60b107b3085284");
    expect(resultat.tirage.compensations.length).toBeGreaterThan(0);
    expect(resultat.tirage.graine_tirage).toEqual(graine());
  });

  it("déclare le générateur du dépôt : algorithme, bibliothèque et version", () => {
    expect(GENERATEUR_DU_TIRAGE).toEqual({
      algorithme: ALGORITHME_ALEA,
      bibliotheque: "banc-essai-2027/validation/domaine/alea.ts",
      version: "1",
    });
    const { valeur: _valeur, ...declaree } = graine();
    expect(declaree).toEqual(GENERATEUR_DU_TIRAGE);
  });

  it("refuse une graine qui nomme PCG64, en nommant le champ et le générateur employé", () => {
    const pcg = { ...graine(), algorithme: "PCG64", bibliotheque: "numpy.random.Generator", version: "2.1.3" };
    expect(() => tirer(demande(pcg))).toThrow(GraineNonConforme);
    expect(() => tirer(demande(pcg))).toThrow(/algorithme « PCG64 ».*splitmix64-sha256-v1/);
  });

  it("nomme le tirage, pas l'échantillon ou une autre graine, dans le message de refus (constat 18 de la revue du 2026-10-12)", () => {
    const pcg = { ...graine(), algorithme: "PCG64" };
    expect(() => tirer(demande(pcg))).toThrow(/^Graine du tirage non conforme/);
  });

  it("refuse une graine au bon algorithme mais qui nomme une autre bibliothèque", () => {
    const autre = { ...graine(), bibliotheque: "numpy.random.Generator" };
    expect(() => tirer(demande(autre))).toThrow(/bibliotheque « numpy\.random\.Generator »/);
  });

  it("refuse une graine au bon algorithme mais d'une autre version", () => {
    expect(() => tirer(demande({ ...graine(), version: "2" }))).toThrow(/version « 2 »/);
  });

  it("refuse avant tout tirage, quelle que soit la valeur de la graine", () => {
    for (const valeur of [0, 1, 20261201]) {
      expect(() => tirer(demande({ ...graine(valeur), algorithme: "PCG64" }))).toThrow(GraineNonConforme);
    }
  });
});

describe("n° 24 : exemples publiés alignés sur le générateur employé", () => {
  const racine = resolve(import.meta.dirname, "../../schema/exemples");

  function graines(chemin: string): readonly { readonly algorithme?: string }[] {
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as {
      graine_tirage?: { readonly algorithme?: string };
      graines?: Record<string, { readonly algorithme?: string }>;
    };
    if (objet.graine_tirage !== undefined) return [objet.graine_tirage];
    const du_run = objet.graines;
    if (du_run === undefined) return [];
    // §8 : bootstrap et permutation amorcent le même générateur que le tirage.
    return ["tirage", "bootstrap", "permutation"].flatMap((cle) => (du_run[cle] === undefined ? [] : [du_run[cle]]));
  }

  it("aucun exemple de tirage ou de run ne déclare un autre générateur que splitmix64-sha256-v1", () => {
    const fichiers = ["tirage", "run"].flatMap((dossier) =>
      readdirSync(resolve(racine, dossier)).map((nom) => resolve(racine, dossier, nom)),
    );
    const declarees = fichiers.flatMap((chemin) => graines(chemin).map((graine_lue) => ({ chemin, graine_lue })));
    expect(declarees.length).toBeGreaterThan(0);
    // run/invalide-01 omet l'algorithme exprès : une graine sans algorithme est l'objet de cet exemple.
    const fautives = declarees.filter(
      ({ graine_lue }) => graine_lue.algorithme !== undefined && graine_lue.algorithme !== ALGORITHME_ALEA,
    );
    expect(fautives.map(({ chemin }) => chemin)).toEqual([]);
  });
});
