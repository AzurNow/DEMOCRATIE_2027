/**
 * §8, « Incertitude » (protocole 0.24, D59 (7)) : « Tous les taux, ceux des métriques secondaires
 * compris, sur chacune de leurs strates, sont accompagnés d'un intervalle de confiance à 95 % par
 * bootstrap en grappes ». « Graines de l'analyse » : la clé d'un taux est la famille, l'outil, le
 * mode, la métrique et la strate ; « La strate s'écrit `global` pour l'ensemble des réponses du
 * couple, et `candidat:<id>`, `theme:<t>`, `gabarit:<g>` ou `registre:<r>` ».
 */

import { describe, expect, it } from "vitest";
import { intervalleNomme, valeurDuTaux } from "../../analysis/bootstrap.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import {
  METRIQUES_GLOBALES,
  stratesDuCalculPrincipal,
  tauxPublies,
  tauxPubliesParCouple,
  type TauxPublie,
} from "../../analysis/incertitude.ts";
import { exactitude } from "../../analysis/metriques.ts";
import type { PartageCandidats } from "../../analysis/seuils.ts";
import type { CoupleOutilMode } from "../../analysis/types.ts";
import { grappe, ulid, unite } from "./fabriques.ts";

const COUPLE: CoupleOutilMode = { outil_id: "outil-alpha", mode: "web_desactivee" };
const OPTIONS = { reechantillonnages: 200, graine_du_run: 20261201 };
const PARTAGE: PartageCandidats = { compares: ["c1", "c2"], rapportes_a_part: ["c-bas"] };

function trouver(publies: readonly TauxPublie[], metrique: string, strate: string): TauxPublie {
  const trouve = publies.find((t) => t.metrique === metrique && t.strate === strate);
  if (trouve === undefined) throw new Error(`Aucun taux ${metrique} / ${strate}`);
  return trouve;
}

/** Deux items de c1 (retraites, Q-DIR), un item de c2 (sante, Q-FER), une Q-ATT sans candidat. */
function jeu(): UniteAnalyse[] {
  return [
    ...grappe("i1", 2, { candidat_id: "c1", categorie: "exacte" }),
    ...grappe("i2", 2, { candidat_id: "c1", categorie: "inexacte", registre: "familier" }),
    ...grappe("i3", 2, { candidat_id: "c2", theme: "sante", gabarit: "Q-FER", categorie: "exacte" }),
    ...grappe("m1", 1, { candidat_id: null, gabarit: "Q-ATT", type_item_principal: null, item_principal_id: null, categorie: "inexacte" }),
  ];
}

describe("stratesDuCalculPrincipal", () => {
  it("relève les strates présentes dans les unités du calcul principal, triées, candidats comparés seuls", () => {
    const strates = stratesDuCalculPrincipal(
      [...jeu(), ...grappe("i4", 1, { candidat_id: "c-bas", theme: null })],
      PARTAGE,
    );
    expect(strates).toEqual({
      candidats: ["c1", "c2"],
      themes: ["retraites", "sante"],
      gabarits: ["Q-ATT", "Q-DIR", "Q-FER"],
      registres: ["familier", "neutre"],
    });
  });

  it("lève sur un candidat absent du partage du seuil de couverture", () => {
    expect(() => stratesDuCalculPrincipal(grappe("i9", 1, { candidat_id: "inconnu" }), PARTAGE)).toThrow(/inconnu/);
  });
});

describe("tauxPublies", () => {
  const unitesDuCouple = jeu();
  const strates = stratesDuCalculPrincipal(unitesDuCouple, PARTAGE);
  const publies = tauxPublies(unitesDuCouple, COUPLE, strates, PARTAGE, OPTIONS);

  it("publie chaque taux primaire et chaque part de drapeau sur la strate global", () => {
    const globaux = publies.filter((t) => t.strate === "global").map((t) => t.metrique);
    expect(globaux).toEqual([...METRIQUES_GLOBALES]);
    expect(METRIQUES_GLOBALES).toEqual([
      "exactitude",
      "non_reponse",
      "fabrication",
      "obsolescence",
      "obsolescence_fraiche",
      "confirmation_premisse",
      "sourcage_valide",
      "repartition_drapeaux:fabrication",
      "repartition_drapeaux:mauvaise_attribution",
      "repartition_drapeaux:obsolescence",
      "repartition_drapeaux:deformation",
      "repartition_drapeaux:confirmation_premisse",
    ]);
  });

  it("nomme l'intervalle d'un taux par la clé du §8 : famille, outil, mode, métrique, strate", () => {
    const global = trouver(publies, "exactitude", "global");
    expect(global.intervalle.cle).toEqual(["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"]);
    const attendu = intervalleNomme(unitesDuCouple, valeurDuTaux(exactitude), {
      ...OPTIONS,
      cle: ["outil-alpha", "web_desactivee", "exactitude", "global"],
    });
    expect(global.intervalle).toEqual(attendu);
    expect(global.taux).toEqual({ numerateur: 4, denominateur: 7, valeur: 4 / 7 });
    expect(global.motif_absence).toBeNull();
  });

  it("publie l'exactitude sur chaque strate candidat:, theme:, gabarit:, registre:, dans cet ordre", () => {
    const strata = publies.filter((t) => t.strate !== "global").map((t) => `${t.metrique} ${t.strate}`);
    expect(strata).toEqual([
      "exactitude candidat:c1",
      "exactitude candidat:c2",
      "exactitude theme:retraites",
      "exactitude theme:sante",
      "exactitude gabarit:Q-ATT",
      "exactitude gabarit:Q-DIR",
      "exactitude gabarit:Q-FER",
      "exactitude registre:familier",
      "exactitude registre:neutre",
    ]);
  });

  it("bootstrappe une strate sur ses seules unités, avec sa propre clé", () => {
    const c1 = trouver(publies, "exactitude", "candidat:c1");
    expect(c1.taux).toEqual({ numerateur: 2, denominateur: 4, valeur: 0.5 });
    expect(c1.intervalle.cle).toEqual(["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "candidat:c1"]);
    expect(c1.intervalle.intervalle?.nombre_grappes).toBe(2);
  });

  it("publie la mention d'un taux dégénéré et le nombre de grappes de son intervalle (§8, 0.27 et 0.28)", () => {
    // Trois grappes de c1, toutes exactes (3/3, [1 ; 1]) en neutre, toutes inexactes (0/3,
    // [0 ; 0]) en familier. « aucun non-événement observé sur 3 grappes », « aucun événement
    // observé sur 3 grappes » : la mention et n sont publiés à côté de l'intervalle.
    const unites = ["d1", "d2", "d3"].flatMap((g) => [
      ...grappe(g, 1, { candidat_id: "c1", categorie: "exacte" }),
      ...grappe(g, 1, { candidat_id: "c1", categorie: "inexacte", registre: "familier" }),
    ]);
    const publies = tauxPublies(unites, COUPLE, stratesDuCalculPrincipal(unites, PARTAGE), PARTAGE, OPTIONS);

    const neutre = trouver(publies, "exactitude", "registre:neutre");
    expect(neutre.taux).toEqual({ numerateur: 3, denominateur: 3, valeur: 1 });
    expect(neutre.taux_degenere).toBe("aucun_non_evenement");
    expect(neutre.intervalle.intervalle).toMatchObject({ bas: 1, haut: 1, nombre_grappes: 3, degenere: null });

    const familier = trouver(publies, "exactitude", "registre:familier");
    expect(familier.taux).toEqual({ numerateur: 0, denominateur: 3, valeur: 0 });
    expect(familier.taux_degenere).toBe("aucun_evenement");
    expect(familier.intervalle.intervalle).toMatchObject({ bas: 0, haut: 0, nombre_grappes: 3, degenere: null });

    // Un taux intermédiaire n'a pas de mention ; un taux absent non plus : il a son motif d'absence.
    expect(trouver(publies, "exactitude", "global").taux_degenere).toBeNull();
    const fabrication = trouver(publies, "fabrication", "global");
    expect(fabrication.motif_absence).toBe("denominateur_nul");
    expect(fabrication.taux_degenere).toBeNull();
  });

  it("publie absente, avec le motif strate_vide, une strate sans unité dans ce couple — jamais 0", () => {
    const autres = stratesDuCalculPrincipal([...unitesDuCouple, ...grappe("i5", 1, { candidat_id: "c2", theme: "immigration" })], PARTAGE);
    const vide = trouver(tauxPublies(unitesDuCouple, COUPLE, autres, PARTAGE, OPTIONS), "exactitude", "theme:immigration");
    expect(vide.taux).toEqual({ numerateur: 0, denominateur: 0 });
    expect(vide.taux.valeur).toBeUndefined();
    expect(vide.motif_absence).toBe("strate_vide");
    expect(vide.intervalle.intervalle).toBeNull();
    expect(vide.intervalle.raison_sans_intervalle).toBe("aucune_grappe");
  });

  it("publie absent, avec le motif denominateur_nul, un taux dont le dénominateur est nul sur une strate non vide", () => {
    const fabrication = trouver(publies, "fabrication", "global");
    expect(fabrication.taux.valeur).toBeUndefined();
    expect(fabrication.motif_absence).toBe("denominateur_nul");
    expect(fabrication.intervalle.intervalle).toBeNull();
    expect(fabrication.intervalle.raison_sans_intervalle).toBe("aucun_reechantillon_defini");
  });

  it("n'ouvre aucune strate à un candidat sous le seuil, mais garde ses réponses dans la strate global", () => {
    const avecBas = [...unitesDuCouple, ...grappe("i6", 2, { candidat_id: "c-bas", categorie: "exacte" })];
    const resultat = tauxPublies(avecBas, COUPLE, stratesDuCalculPrincipal(avecBas, PARTAGE), PARTAGE, OPTIONS);
    expect(resultat.some((t) => t.strate === "candidat:c-bas")).toBe(false);
    expect(trouver(resultat, "exactitude", "global").taux.denominateur).toBe(9);
  });

  it("lève sur une unité d'un autre couple", () => {
    expect(() => tauxPublies([unite({ outil_id: "outil-beta" })], COUPLE, strates, PARTAGE, OPTIONS)).toThrow(/outil-beta/);
  });
});

describe("tauxPubliesParCouple", () => {
  const beta: CoupleOutilMode = { outil_id: "outil-beta", mode: "web_activee" };
  const gamma: CoupleOutilMode = { outil_id: "outil-gamma", mode: "web_activee" };

  it("rend chaque couple comparé du partage, même sans unité, et aucun taux pour un couple incomplet", () => {
    const unites = [...jeu(), unite({ outil_id: "outil-gamma", mode: "web_activee", candidat_id: "c1", grappe_id: ulid("g") })];
    const strates = stratesDuCalculPrincipal(unites, PARTAGE);
    const resultat = tauxPubliesParCouple(unites, { compares: [COUPLE, beta], incomplets: [gamma] }, strates, PARTAGE, OPTIONS);
    expect(resultat.compares.map((c) => c.couple)).toEqual([COUPLE, beta]);
    const exactBeta = trouver(resultat.compares[1]?.taux ?? [], "exactitude", "global");
    expect(exactBeta.motif_absence).toBe("strate_vide");
    expect(resultat.couples_incomplets).toEqual([gamma]);
  });

  it("lève sur une unité du canal application : ses chiffres sont exploratoires (QR8)", () => {
    const application = unite({ canal: "application", mode: null });
    expect(() =>
      tauxPubliesParCouple([application], { compares: [COUPLE], incomplets: [] }, stratesDuCalculPrincipal([], PARTAGE), PARTAGE, OPTIONS),
    ).toThrow(/application/);
  });
});
