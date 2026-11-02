/**
 * §8, « Analyses de robustesse préenregistrées » (protocole 0.24, D59 (8)) : « Les taux sont publiés
 * recalculés sans qualificatif de fragilité. Chaque recalcul garde le partage des couples outil ×
 * mode et des candidats du calcul principal : les seuils de non-publication ne sont pas réappliqués
 * à la population restreinte, et un couple ou un candidat exclu du calcul principal l'est aussi de
 * chaque recalcul. » « Graines de l'analyse » : « Les recalculs de robustesse gardent la clé de la
 * comparaison principale. »
 */

import { describe, expect, it } from "vitest";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import { stratesDuCalculPrincipal, tauxPubliesParCouple, type TauxPublie } from "../../analysis/incertitude.ts";
import { tauxRecalcules } from "../../analysis/robustesse-taux.ts";
import type { PartageCandidats, PartageCouples } from "../../analysis/seuils.ts";
import type { CoupleOutilMode, Notation } from "../../analysis/types.ts";
import { grappe, notation, run, ulid } from "./fabriques.ts";

const ALPHA: CoupleOutilMode = { outil_id: "outil-alpha", mode: "web_desactivee" };
const BETA: CoupleOutilMode = { outil_id: "outil-beta", mode: "web_desactivee" };
const GAMMA: CoupleOutilMode = { outil_id: "outil-gamma", mode: "web_desactivee" };
const OPTIONS = { reechantillonnages: 200, graine_du_run: 20261201 };
const PARTAGE: PartageCandidats = { compares: ["c1", "c2"], rapportes_a_part: ["c-bas"] };

function trouver(publies: readonly TauxPublie[] | undefined, metrique: string, strate: string): TauxPublie {
  const trouve = (publies ?? []).find((t) => t.metrique === metrique && t.strate === strate);
  if (trouve === undefined) throw new Error(`Aucun taux ${metrique} / ${strate}`);
  return trouve;
}

/** Chaque unité reçoit sa propre réponse : le recalcul (a) les retrouve par identifiant. */
function identifier(unites: readonly UniteAnalyse[], prefixe: string): UniteAnalyse[] {
  return unites.map((u, i) => ({ ...u, reponse_id: ulid(`${prefixe}:${i}`) }));
}

/** Les deux notations humaines de l'échantillon, d'accord sur `categorie`, pour chaque unité de l'échantillon. */
function notationsHumaines(unites: readonly UniteAnalyse[], categorie: Notation["categorie"]): Notation[] {
  return unites
    .filter((u) => u.dans_echantillon_humain)
    .flatMap((u) =>
      ["a1", "a2"].map((annotateur) =>
        notation({
          id: ulid(`n:${u.reponse_id}:${annotateur}`),
          objet_note: { type: "reponse", id: u.reponse_id },
          notateur: { type: "humain", id: annotateur },
          categorie,
        }),
      ),
    );
}

function recalculer(unites: readonly UniteAnalyse[], couples: PartageCouples, notations: readonly Notation[] = []) {
  const strates = stratesDuCalculPrincipal(unites, PARTAGE);
  return {
    principal: tauxPubliesParCouple(unites, couples, strates, PARTAGE, OPTIONS),
    recalculs: tauxRecalcules(unites, { run: run(), notations }, couples, strates, PARTAGE, OPTIONS),
  };
}

describe("tauxRecalcules", () => {
  it("rend les quatre recalculs dans l'ordre (a), (b), (c), (d) du §8, sans qualificatif de fragilité", () => {
    const unites = identifier(grappe("i1", 3, { candidat_id: "c1" }), "r");
    const { recalculs } = recalculer(unites, { compares: [ALPHA], incomplets: [] });
    expect(recalculs.map((r) => r.recalcul)).toEqual(["echantillon_humain", "items_contestes", "formulations_orientees", "reponses_tronquees"]);
    expect(Object.keys(recalculs[0] ?? {})).toEqual(["recalcul", "taux"]);
  });

  it("garde la clé et la graine du calcul principal : sans réponse retirée, l'intervalle est le même", () => {
    const unites = identifier(
      [...grappe("i1", 2, { candidat_id: "c1" }), ...grappe("i2", 2, { candidat_id: "c2", categorie: "inexacte" })],
      "r",
    );
    const { principal, recalculs } = recalculer(unites, { compares: [ALPHA], incomplets: [] });
    const sansOrientee = recalculs.find((r) => r.recalcul === "formulations_orientees");
    expect(sansOrientee?.taux).toEqual(principal);
  });

  it("ne retire pas par un seuil réappliqué un candidat comparé au principal, même réduit à une réponse", () => {
    const unites = identifier(
      [
        ...grappe("i1", 1, { candidat_id: "c1", categorie: "exacte" }),
        ...grappe("i2", 3, { candidat_id: "c1", tronquee: true }),
        ...grappe("i3", 2, { candidat_id: "c2", registre: "oriente" }),
      ],
      "r",
    );
    const { recalculs } = recalculer(unites, { compares: [ALPHA], incomplets: [] });
    const sansTronquees = recalculs.find((r) => r.recalcul === "reponses_tronquees")?.taux.compares[0]?.taux;
    expect(trouver(sansTronquees, "exactitude", "candidat:c1").taux).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    // c2 n'a plus aucune réponse sans formulation orientée : publié vide, pas retiré.
    const sansOrientees = recalculs.find((r) => r.recalcul === "formulations_orientees")?.taux.compares[0]?.taux;
    expect(trouver(sansOrientees, "exactitude", "candidat:c2").motif_absence).toBe("strate_vide");
  });

  it("garde exclu de chaque recalcul un candidat sous le seuil au calcul principal", () => {
    const unites = identifier([...grappe("i1", 2, { candidat_id: "c1" }), ...grappe("i2", 2, { candidat_id: "c-bas" })], "r");
    const { recalculs } = recalculer(unites, { compares: [ALPHA], incomplets: [] });
    for (const { taux } of recalculs) {
      const strates = (taux.compares[0]?.taux ?? []).map((t) => t.strate);
      expect(strates).toContain("candidat:c1");
      expect(strates).not.toContain("candidat:c-bas");
    }
  });

  it("publie, avec des taux absents, un couple comparé que la restriction vide, et n'ouvre jamais un couple incomplet", () => {
    const unites = identifier(
      [...grappe("i1", 2, { candidat_id: "c1" }), ...grappe("i2", 2, { candidat_id: "c1", outil_id: "outil-beta", tronquee: true })],
      "r",
    );
    const couples = { compares: [ALPHA, BETA], incomplets: [GAMMA] };
    const { recalculs } = recalculer(unites, couples);
    const sansTronquees = recalculs.find((r) => r.recalcul === "reponses_tronquees")?.taux;
    expect(sansTronquees?.compares.map((c) => c.couple)).toEqual([ALPHA, BETA]);
    expect(trouver(sansTronquees?.compares[1]?.taux, "exactitude", "global").motif_absence).toBe("strate_vide");
    expect(sansTronquees?.couples_incomplets).toEqual([GAMMA]);
  });

  it("recalcule (a) sur la note humaine de l'échantillon, pas sur la note retenue du verdict", () => {
    const unites = identifier(grappe("i1", 2, { candidat_id: "c1", categorie: "exacte", dans_echantillon_humain: true }), "r");
    const { principal, recalculs } = recalculer(unites, { compares: [ALPHA], incomplets: [] }, notationsHumaines(unites, "inexacte"));
    expect(trouver(principal.compares[0]?.taux, "exactitude", "global").taux.valeur).toBe(1);
    const humain = recalculs.find((r) => r.recalcul === "echantillon_humain")?.taux.compares[0]?.taux;
    expect(trouver(humain, "exactitude", "global").taux).toEqual({ numerateur: 0, denominateur: 2, valeur: 0 });
  });
});
