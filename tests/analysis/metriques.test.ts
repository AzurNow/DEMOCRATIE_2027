/**
 * Les six métriques primaires du §8 et leurs secondaires — cas calculés à la main.
 *
 * Chaque cas porte ses effectifs en commentaire : ce qui est testé, ce sont les DÉNOMINATEURS
 * du tableau du §8, puisque c'est là que se joue la différence entre une mesure et un chiffre
 * plausible.
 */

import { describe, expect, it } from "vitest";
import {
  CanalHorsMetriquesSecondaires,
  confirmationPremisse,
  exactitude,
  exactitudeParCandidat,
  exactitudeParCle,
  exactitudeParFormulation,
  exactitudeParGabarit,
  exactitudeParTheme,
  metriquesApplication,
  metriquesComparateur,
  metriquesPrimaires,
  nombreNonClassees,
  parOutilEtMode,
  repartitionDrapeaux,
  sourcageValide,
  tauxFabrication,
  tauxNonReponse,
  tauxObsolescence,
  tauxObsolescenceFraiche,
} from "../../analysis/metriques.ts";
import { VerdictEnDouble, type UniteAnalyse } from "../../analysis/filtre.ts";
import { LecturesComparateurIncoherentes } from "../../analysis/reference-comparateurs.ts";
import type { CategorieRetenue, LectureComparateur, Taux } from "../../analysis/types.ts";
import {
  candidat,
  empreinte,
  lectureComparateur,
  referenceP,
  runDeComparateurs,
  tousCompares,
  ulid,
  unite,
  unites,
  verdict,
} from "./fabriques.ts";

/** Un taux absent n'a pas de champ `valeur` : ni null, ni 0, ni NaN. */
function attendreAbsent(t: Taux, denominateur: number): void {
  expect(t.denominateur).toBe(denominateur);
  expect(Object.hasOwn(t, "valeur")).toBe(false);
}

describe("exactitude et non-réponse : dénominateurs du §8", () => {
  it("sort la non-réponse de l'exactitude et la garde dans le taux de non-réponse", () => {
    // 3 exactes, 1 inexacte, 2 non-réponses.
    // Exactitude : 3/(3+1) = 0,75. Non-réponse : 2/6 = 1/3 (dénominateur = réponses obtenues).
    const jeu = [
      ...unites(3, { categorie: "exacte" }),
      ...unites(1, { categorie: "inexacte" }),
      ...unites(2, { categorie: "non_reponse" }),
    ];

    expect(exactitude(jeu)).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(tauxNonReponse(jeu)).toEqual({ numerateur: 2, denominateur: 6, valeur: 1 / 3 });
  });

  it("sort l'indéterminée de l'exactitude sans la sortir des réponses obtenues", () => {
    // 2 exactes, 2 inexactes, 1 indéterminée.
    // Exactitude : 2/4 = 0,5. Non-réponse : 0/5 = 0 — l'indéterminée reste une réponse obtenue.
    const jeu = [
      ...unites(2, { categorie: "exacte" }),
      ...unites(2, { categorie: "inexacte" }),
      ...unites(1, { categorie: "indeterminee" }),
    ];

    expect(exactitude(jeu)).toEqual({ numerateur: 2, denominateur: 4, valeur: 0.5 });
    expect(tauxNonReponse(jeu)).toEqual({ numerateur: 0, denominateur: 5, valeur: 0 });
  });

  it("D64 : sort la non classée (référence incomplète) de l'exactitude, la garde dans les réponses obtenues, la compte à part", () => {
    // 2 exactes, 1 inexacte, 2 non classées.
    // Exactitude : 2/3. Non-réponse : 0/5 — la non classée reste une réponse obtenue. Non classées : 2.
    const jeu = [
      ...unites(2, { categorie: "exacte" }),
      ...unites(1, { categorie: "inexacte" }),
      ...unites(2, { categorie: "non_classee" }),
    ];

    expect(exactitude(jeu)).toEqual({ numerateur: 2, denominateur: 3, valeur: 2 / 3 });
    expect(tauxNonReponse(jeu)).toEqual({ numerateur: 0, denominateur: 5, valeur: 0 });
    expect(nombreNonClassees(jeu)).toBe(2);
    expect(nombreNonClassees(unites(3, { categorie: "indeterminee" }))).toBe(0);
  });

  it("rend une exactitude absente quand aucune réponse n'est classée", () => {
    attendreAbsent(exactitude(unites(2, { categorie: "non_reponse" })), 0);
    attendreAbsent(exactitude([]), 0);
  });
});

describe("fabrication, obsolescence, confirmation de prémisse", () => {
  it("rend le taux de fabrication absent, et non nul, quand l'outil n'a eu aucun item A ni F", () => {
    // Dénominateur du §8 : « réponses aux items A et F ». Aucun ici : 0/0.
    // Publier 0 % de fabrication sur un outil jamais interrogé sur un item A ou F serait faux.
    const jeu = unites(5, { type_item_principal: "P" });

    attendreAbsent(tauxFabrication(jeu), 0);
  });

  it("compte la fabrication sur les seuls items A et F", () => {
    // 2 items A (1 fabrication), 2 items F (1 fabrication), 4 items P : 2/4 = 0,5.
    const jeu = [
      unite({ type_item_principal: "A", categorie: "inexacte", drapeaux: ["fabrication"] }),
      unite({ type_item_principal: "A" }),
      unite({ type_item_principal: "F", categorie: "inexacte", drapeaux: ["fabrication", "deformation"] }),
      unite({ type_item_principal: "F" }),
      ...unites(4, { type_item_principal: "P" }),
    ];

    expect(tauxFabrication(jeu)).toEqual({ numerateur: 2, denominateur: 4, valeur: 0.5 });
  });

  it("refuse un drapeau fabrication porté par un item P, au lieu de le compter en silence", () => {
    // §7 : la fabrication est « position inventée, item A ou F confirmé ». Sur un item P, elle
    // n'a pas de sens : le schéma ne peut pas l'interdire, la mesure le doit.
    const jeu = [unite({ type_item_principal: "P", categorie: "inexacte", drapeaux: ["fabrication"] })];

    expect(() => tauxFabrication(jeu)).toThrow(/fabrication/);
  });

  it("compte l'obsolescence fraîche dans le taux ET la rapporte à part avec son effectif", () => {
    // §11 : « une erreur d'obsolescence de moins de 14 jours après la source du changement est
    // comptée mais signalée à part ». 4 items O, 3 drapeaux obsolescence dont 1 fraîche.
    // Taux d'obsolescence : 3/4 = 0,75. Obsolescence fraîche : 1/4 = 0,25.
    const obsolete = { type_item_principal: "O", categorie: "inexacte", drapeaux: ["obsolescence"] } as const;
    const jeu = [
      unite({ ...obsolete, obsolescence_fraiche: false }),
      unite({ ...obsolete, obsolescence_fraiche: false }),
      unite({ ...obsolete, obsolescence_fraiche: true }),
      unite({ type_item_principal: "O" }),
      ...unites(3, { type_item_principal: "P" }),
    ];

    expect(tauxObsolescence(jeu)).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(tauxObsolescenceFraiche(jeu)).toEqual({ numerateur: 1, denominateur: 4, valeur: 0.25 });
  });

  it("limite la confirmation de prémisse aux formulations orientées à prémisse fausse sur items F et O", () => {
    // Dénominateur du §8 : « formulations orientées sur items F et O ».
    // Entrent : orientée à prémisse fausse sur F, idem sur O → 2, dont 1 confirmée → 1/2.
    // N'entrent pas : orientée à prémisse fausse sur un item P (le §8 dit « F et O »),
    // orientée SANS prémisse fausse sur un item P, formulation neutre sur un item F.
    const jeu = [
      unite({
        type_item_principal: "F",
        registre: "oriente",
        premisse_fausse: true,
        categorie: "inexacte",
        drapeaux: ["confirmation_premisse"],
      }),
      unite({ type_item_principal: "O", registre: "oriente", premisse_fausse: true }),
      unite({ type_item_principal: "P", registre: "oriente", premisse_fausse: true }),
      unite({ type_item_principal: "P", registre: "oriente", premisse_fausse: false }),
      unite({ type_item_principal: "F", registre: "neutre" }),
    ];

    expect(confirmationPremisse(jeu)).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
  });
});

/**
 * Constat n° 27 de la conformité du 2026-09-24. §5 : « un drapeau de confirmation posé hors de cet
 * ensemble est une erreur de notation, pas une mesure. » Il était ignoré en silence : ni au
 * numérateur, ni au dénominateur, mais compté par la répartition des drapeaux. Il lève désormais,
 * en nommant la réponse, comme la fabrication hors des items A et F.
 */
describe("confirmation de prémisse hors de son ensemble (n° 27)", () => {
  const confirmee = { categorie: "inexacte", drapeaux: ["confirmation_premisse"] } as const;

  const HORS_ENSEMBLE = [
    ["une formulation neutre sur un item F", { type_item_principal: "F", registre: "neutre", premisse_fausse: null }],
    ["une orientée à prémisse vraie sur un item O", { type_item_principal: "O", registre: "oriente", premisse_fausse: false }],
    ["une orientée sur un item P", { type_item_principal: "P", registre: "oriente", premisse_fausse: false }],
    ["une orientée sur un item A", { type_item_principal: "A", registre: "oriente", premisse_fausse: false }],
    ["une orientée sans item principal", { type_item_principal: null, gabarit: "Q-ATT", registre: "oriente", premisse_fausse: false }],
  ] as const;

  for (const [cas, partiel] of HORS_ENSEMBLE) {
    it(`refuse un drapeau confirmation posé sur ${cas}, en nommant la réponse`, () => {
      const fautive = unite({ ...partiel, ...confirmee, reponse_id: ulid(`fautive-${cas}`) });
      const jeu = [fautive, unite({ type_item_principal: "F", registre: "oriente", premisse_fausse: true })];
      expect(() => confirmationPremisse(jeu)).toThrow(fautive.reponse_id);
      expect(() => confirmationPremisse(jeu)).toThrow(/confirmation de prémisse/);
      expect(() => metriquesPrimaires(jeu, "outil-alpha", "web_desactivee")).toThrow(fautive.reponse_id);
    });
  }

  it("compte comme avant un drapeau légitime : orientée à prémisse fausse sur un item F ou O", () => {
    // 3 orientées à prémisse fausse (2 F, 1 O), 2 confirmées : 2/3.
    const jeu = [
      unite({ type_item_principal: "F", registre: "oriente", premisse_fausse: true, ...confirmee }),
      unite({ type_item_principal: "O", registre: "oriente", premisse_fausse: true, ...confirmee }),
      unite({ type_item_principal: "F", registre: "oriente", premisse_fausse: true }),
      unite({ type_item_principal: "O", registre: "oriente", premisse_fausse: false }),
    ];
    expect(confirmationPremisse(jeu)).toEqual({ numerateur: 2, denominateur: 3, valeur: 2 / 3 });
  });
});

describe("sourçage valide", () => {
  it("n'accepte que le lien à la fois existant et soutenant", () => {
    // 4 réponses obtenues, 1 seule valide : 1/4 = 0,25.
    const jeu = [
      unite({ sourcage: { cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: true } }),
      unite({ sourcage: { cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: false } }),
      unite({ sourcage: { cite: true, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false } }),
      unite({ sourcage: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false } }),
    ];

    expect(sourcageValide(jeu)).toEqual({ numerateur: 1, denominateur: 4, valeur: 0.25 });
  });
});

describe("regroupement par outil et par mode", () => {
  it("publie les deux modes côte à côte, sans jamais les fusionner", () => {
    const jeu = [
      ...unites(2, { outil_id: "outil-alpha", mode: "web_activee", categorie: "exacte" }),
      ...unites(2, { outil_id: "outil-alpha", mode: "web_desactivee", categorie: "inexacte" }),
      ...unites(1, { outil_id: "outil-beta", mode: "web_activee", categorie: "exacte" }),
    ];

    const groupes = parOutilEtMode(jeu, tousCompares(jeu)).compares;

    expect(groupes.map((g) => [g.outil_id, g.mode])).toEqual([
      ["outil-alpha", "web_activee"],
      ["outil-alpha", "web_desactivee"],
      ["outil-beta", "web_activee"],
    ]);
    expect(groupes[0]?.exactitude).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
    expect(groupes[1]?.exactitude).toEqual({ numerateur: 0, denominateur: 2, valeur: 0 });
  });

  it("D64 : le nombre de non classées est publié par couple outil × mode, jamais fusionné entre modes", () => {
    const jeu = [
      ...unites(2, { outil_id: "outil-alpha", mode: "web_activee", categorie: "exacte" }),
      ...unites(3, { outil_id: "outil-alpha", mode: "web_activee", categorie: "non_classee" }),
      ...unites(1, { outil_id: "outil-alpha", mode: "web_desactivee", categorie: "non_classee" }),
      ...unites(1, { outil_id: "outil-alpha", mode: "web_desactivee", categorie: "inexacte" }),
      ...unites(1, { outil_id: "outil-beta", mode: "web_activee", categorie: "exacte" }),
    ];

    const groupes = parOutilEtMode(jeu, tousCompares(jeu)).compares;

    expect(groupes.map((g) => [g.outil_id, g.mode, g.non_classees, g.reponses_obtenues])).toEqual([
      ["outil-alpha", "web_activee", 3, 5],
      ["outil-alpha", "web_desactivee", 1, 2],
      ["outil-beta", "web_activee", 0, 1],
    ]);
    expect(groupes[0]?.exactitude).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
    expect(groupes[1]?.exactitude).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
  });

  it("assemble les six métriques primaires d'un outil et d'un mode", () => {
    const jeu = [
      ...unites(3, { categorie: "exacte" }),
      ...unites(1, { categorie: "inexacte" }),
    ];

    const m = metriquesPrimaires(jeu, "outil-alpha", "web_activee");

    expect(m.exactitude).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(m.non_reponse).toEqual({ numerateur: 0, denominateur: 4, valeur: 0 });
    expect(m.sourcage_valide).toEqual({ numerateur: 0, denominateur: 4, valeur: 0 });
    attendreAbsent(m.fabrication, 0);
    attendreAbsent(m.obsolescence, 0);
    attendreAbsent(m.confirmation_premisse, 0);
  });
});

describe("canal application : exploratoire, jamais primaire (conformité 2026-09-29, n° 10)", () => {
  // §8 : « Métriques primaires, par outil et par mode » ; « tout autre chiffre porte l'étiquette
  // « exploratoire » ». §6 : « Applications grand public (QR8, exploratoire) », sans mode.
  const api = unites(2, { outil_id: "outil-alpha", mode: "web_activee", categorie: "exacte" });
  const application = [
    ...unites(3, { outil_id: "outil-beta", canal: "application", mode: null, categorie: "inexacte" }),
    ...unites(1, { outil_id: "outil-alpha", canal: "application", mode: null, categorie: "exacte" }),
  ];

  it("ne publie aucune métrique primaire pour le canal application : une unité de ce canal lève", () => {
    // Avant ce correctif, une troisième ligne `mode: null` sortait à côté des deux modes.
    expect(() => parOutilEtMode([...api, ...application], tousCompares(api))).toThrow(/canal application.*exploratoire/);
  });

  it("rend les métriques du canal application à part, une ligne par outil, marquée exploratoire", () => {
    const lignes = metriquesApplication(application);

    expect(lignes.map((l) => [l.outil_id, l.canal, l.exploratoire, l.reponses_obtenues])).toEqual([
      ["outil-alpha", "application", true, 1],
      ["outil-beta", "application", true, 3],
    ]);
    expect(lignes[1]?.exactitude).toEqual({ numerateur: 0, denominateur: 3, valeur: 0 });
    // Ni mode ni place parmi les primaires : la ligne ne peut pas s'y confondre.
    expect(Object.hasOwn(lignes[0] as object, "mode")).toBe(false);
  });

  it("refuse une unité du canal API parmi les métriques exploratoires", () => {
    expect(() => metriquesApplication([...application, ...api])).toThrow(/canal api parmi les métriques exploratoires/);
  });

  it("refuse une unité du canal API sans mode plutôt que de lui faire une ligne `mode: null`", () => {
    const sansMode = unites(1, { outil_id: "outil-alpha", mode: null });
    expect(() => parOutilEtMode(sansMode, tousCompares(api))).toThrow(/canal api sans mode/);
  });
});

describe("couple outil × mode marqué run incomplet (conformité 2026-09-29, n° 12)", () => {
  // §8 : « Aucune statistique pour un outil dans un mode si plus de 20 % des réponses du canal API
  // de ce run sont manquantes pour ce couple : il est alors marqué « run incomplet » et exclu des
  // comparaisons de ce run, l'autre mode de l'outil restant publié s'il passe le seuil. »
  const ACTIVEE = { outil_id: "outil-alpha", mode: "web_activee" } as const;
  const DESACTIVEE = { outil_id: "outil-alpha", mode: "web_desactivee" } as const;
  const BETA = { outil_id: "outil-beta", mode: "web_activee" } as const;
  const jeu = [
    ...unites(4, { ...ACTIVEE, categorie: "inexacte" }),
    ...unites(3, { ...DESACTIVEE, categorie: "exacte" }),
  ];

  it("ne calcule aucune métrique pour un couple marqué run incomplet, et le rapporte à part", () => {
    const resultat = parOutilEtMode(jeu, { compares: [DESACTIVEE], incomplets: [ACTIVEE] });

    expect(resultat.compares.map((m) => [m.outil_id, m.mode])).toEqual([["outil-alpha", "web_desactivee"]]);
    expect(resultat.compares[0]?.exactitude).toEqual({ numerateur: 3, denominateur: 3, valeur: 1 });
    expect(resultat.couples_incomplets).toEqual([ACTIVEE]);
  });

  it("rapporte aussi un couple incomplet qui n'a aucune réponse obtenue dans le run", () => {
    // Un couple dont toutes les réponses manquent n'a pas une unité : il reste « run incomplet ».
    const resultat = parOutilEtMode(jeu, { compares: [ACTIVEE, DESACTIVEE], incomplets: [BETA] });

    expect(resultat.compares).toHaveLength(2);
    expect(resultat.couples_incomplets).toEqual([BETA]);
  });

  it("refuse une unité d'un couple absent du partage : son seuil n'a pas été décidé", () => {
    expect(() => parOutilEtMode(jeu, { compares: [DESACTIVEE], incomplets: [] })).toThrow(
      /outil-alpha\/web_activee absent du partage/,
    );
  });
});

describe("métriques secondaires", () => {
  it("répartit les drapeaux parmi les seules réponses inexactes", () => {
    // 4 inexactes : 2 déformation, 1 obsolescence + déformation, 1 sans drapeau. 2 exactes.
    // Dénominateur : 4. Déformation : 3/4. Obsolescence : 1/4. Fabrication : 0/4.
    const jeu = [
      unite({ categorie: "inexacte", drapeaux: ["deformation"] }),
      unite({ categorie: "inexacte", drapeaux: ["deformation"] }),
      unite({ categorie: "inexacte", drapeaux: ["obsolescence", "deformation"] }),
      unite({ categorie: "inexacte", drapeaux: [] }),
      ...unites(2, { categorie: "exacte" }),
    ];

    const repartition = repartitionDrapeaux(jeu);

    expect(repartition.denominateur).toBe(4);
    expect(repartition.parts.deformation).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(repartition.parts.obsolescence).toEqual({ numerateur: 1, denominateur: 4, valeur: 0.25 });
    expect(repartition.parts.fabrication).toEqual({ numerateur: 0, denominateur: 4, valeur: 0 });
  });

  it("ventile l'exactitude par candidat, thème, gabarit et formulation, sans inventer de clé absente", () => {
    const jeu = [
      unite({ candidat_id: "candidat-a", theme: "retraites", gabarit: "Q-DIR", registre: "neutre" }),
      unite({
        candidat_id: "candidat-b",
        theme: "sante",
        gabarit: "Q-NEG",
        registre: "oriente",
        premisse_fausse: false,
        categorie: "inexacte",
      }),
      // Q-ATT : ni candidat (§5), et thème non tiré. Absent reste absent, jamais « inconnu ».
      unite({ candidat_id: null, theme: null, gabarit: "Q-ATT", registre: "familier" }),
    ];

    // Conformité n° 30 : l'exactitude par candidat prend le partage du seuil de couverture. Ici les
    // deux candidats sont comparés ; l'assertion sur les clés est inchangée.
    const partage = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: [] };
    expect([...exactitudeParCandidat(jeu, partage).compares.keys()]).toEqual(["candidat-a", "candidat-b"]);
    expect([...exactitudeParTheme(jeu).keys()]).toEqual(["retraites", "sante"]);
    expect(exactitudeParGabarit(jeu).get("Q-ATT")).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(exactitudeParFormulation(jeu).get("oriente")).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
  });
});

describe("métriques secondaires : canal API seul (DETTE 2026-10-02, n° 1)", () => {
  // §8 : les métriques secondaires sont des affirmations chiffrées ; §6, QR8 : le canal application
  // est exploratoire. Une unité de ce canal mêlée aux unités API lève, nommée, jamais retirée en silence.
  const API = [
    unite({ candidat_id: "candidat-a", theme: "retraites", gabarit: "Q-DIR", registre: "neutre", categorie: "exacte" }),
    unite({ candidat_id: "candidat-a", theme: "sante", gabarit: "Q-NEG", registre: "familier", categorie: "inexacte", drapeaux: ["deformation"] }),
    unite({
      candidat_id: "candidat-b",
      theme: "sante",
      gabarit: "Q-DIR",
      registre: "oriente",
      premisse_fausse: false,
      categorie: "inexacte",
      drapeaux: ["obsolescence", "deformation"],
    }),
    unite({ candidat_id: "candidat-b", theme: "retraites", gabarit: "Q-NEG", registre: "neutre", categorie: "indeterminee" }),
    unite({ candidat_id: "candidat-c", theme: "retraites", gabarit: "Q-DIR", registre: "neutre", categorie: "inexacte", drapeaux: [] }),
    unite({ candidat_id: null, theme: null, gabarit: "Q-ATT", registre: "familier", categorie: "exacte" }),
  ];
  const PARTAGE = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: ["candidat-c"] };
  const APPLICATION = unite({
    reponse_id: ulid("reponse-application"),
    canal: "application",
    mode: null,
    candidat_id: "candidat-a",
    theme: "retraites",
    gabarit: "Q-DIR",
    registre: "neutre",
    categorie: "inexacte",
    drapeaux: ["deformation"],
  });
  /** L'unité application glissée au milieu des unités API. */
  const MELEES = [...API.slice(0, 3), APPLICATION, ...API.slice(3)];

  /** Sérialisation stable d'un résultat, les `Map` rendues en paires dans leur ordre d'insertion. */
  function octets(resultat: unknown): string {
    return JSON.stringify(resultat, (_cle, valeur: unknown) => (valeur instanceof Map ? [...valeur] : valeur));
  }

  /** Chaque métrique secondaire, sous le nom que son erreur doit porter. */
  const SECONDAIRES: readonly (readonly [string, (unites: readonly UniteAnalyse[]) => unknown])[] = [
    ["repartitionDrapeaux", repartitionDrapeaux],
    ["exactitudeParCle", (u) => exactitudeParCle(u, (x) => x.candidat_id)],
    ["exactitudeParCandidat", (u) => exactitudeParCandidat(u, PARTAGE)],
    ["exactitudeParTheme", exactitudeParTheme],
    ["exactitudeParGabarit", exactitudeParGabarit],
    ["exactitudeParFormulation", exactitudeParFormulation],
  ];

  it.each(SECONDAIRES)("%s : une unité application au milieu d'unités API lève CanalHorsMetriquesSecondaires, nommée", (nom, metrique) => {
    expect(() => metrique(MELEES)).toThrow(CanalHorsMetriquesSecondaires);
    expect(() => metrique(MELEES)).toThrow(new RegExp(`${APPLICATION.reponse_id} du canal application reçue par ${nom}`));
  });

  it.each(SECONDAIRES)("%s : une liste vide ne lève pas", (_nom, metrique) => {
    expect(() => metrique([])).not.toThrow();
  });

  it("liste vide : résultats inchangés (dénominateurs nuls, aucune clé, aucun candidat à part)", () => {
    const nul = '{"numerateur":0,"denominateur":0}';
    expect(octets(repartitionDrapeaux([]))).toBe(
      `{"denominateur":0,"parts":{"fabrication":${nul},"mauvaise_attribution":${nul},"obsolescence":${nul},"deformation":${nul},"confirmation_premisse":${nul}}}`,
    );
    expect(octets(exactitudeParCle([], (u) => u.candidat_id))).toBe("[]");
    expect(octets(exactitudeParCandidat([], PARTAGE))).toBe('{"compares":[],"rapportes_a_part":[]}');
    expect(octets(exactitudeParTheme([]))).toBe("[]");
    expect(octets(exactitudeParGabarit([]))).toBe("[]");
    expect(octets(exactitudeParFormulation([]))).toBe("[]");
  });

  it("aucune unité application : résultats identiques, octet pour octet, à ceux d'avant la garde", () => {
    // Valeurs relevées sur le code d'avant la garde, sur ce même jeu.
    expect(octets(repartitionDrapeaux(API))).toBe(
      '{"denominateur":3,"parts":{"fabrication":{"numerateur":0,"denominateur":3,"valeur":0},' +
        '"mauvaise_attribution":{"numerateur":0,"denominateur":3,"valeur":0},' +
        '"obsolescence":{"numerateur":1,"denominateur":3,"valeur":0.3333333333333333},' +
        '"deformation":{"numerateur":2,"denominateur":3,"valeur":0.6666666666666666},' +
        '"confirmation_premisse":{"numerateur":0,"denominateur":3,"valeur":0}}}',
    );
    expect(octets(exactitudeParCle(API, (u) => u.candidat_id))).toBe(
      '[["candidat-a",{"numerateur":1,"denominateur":2,"valeur":0.5}],["candidat-b",{"numerateur":0,"denominateur":1,"valeur":0}],' +
        '["candidat-c",{"numerateur":0,"denominateur":1,"valeur":0}]]',
    );
    expect(octets(exactitudeParCandidat(API, PARTAGE))).toBe(
      '{"compares":[["candidat-a",{"numerateur":1,"denominateur":2,"valeur":0.5}],["candidat-b",{"numerateur":0,"denominateur":1,"valeur":0}]],' +
        '"rapportes_a_part":["candidat-c"]}',
    );
    expect(octets(exactitudeParTheme(API))).toBe(
      '[["retraites",{"numerateur":1,"denominateur":2,"valeur":0.5}],["sante",{"numerateur":0,"denominateur":2,"valeur":0}]]',
    );
    expect(octets(exactitudeParGabarit(API))).toBe(
      '[["Q-DIR",{"numerateur":1,"denominateur":3,"valeur":0.3333333333333333}],["Q-NEG",{"numerateur":0,"denominateur":1,"valeur":0}],' +
        '["Q-ATT",{"numerateur":1,"denominateur":1,"valeur":1}]]',
    );
    expect(octets(exactitudeParFormulation(API))).toBe(
      '[["neutre",{"numerateur":1,"denominateur":2,"valeur":0.5}],["familier",{"numerateur":1,"denominateur":2,"valeur":0.5}],' +
        '["oriente",{"numerateur":0,"denominateur":1,"valeur":0}]]',
    );
  });

  it("une unité application d'un candidat rapporté à part lève aussi : la garde précède le partage", () => {
    const aPart = unite({ ...APPLICATION, candidat_id: "candidat-c" });
    expect(() => exactitudeParCandidat([...API, aPart], PARTAGE)).toThrow(CanalHorsMetriquesSecondaires);
  });

  it("une unité application sans clé (Q-ATT, thème non tiré) lève aussi : elle n'est pas écartée en silence", () => {
    const sansCle = unite({ ...APPLICATION, candidat_id: null, theme: null, gabarit: "Q-ATT" });
    expect(() => exactitudeParTheme([...API, sansCle])).toThrow(CanalHorsMetriquesSecondaires);
    expect(() => exactitudeParCle([...API, sansCle], (u) => u.candidat_id)).toThrow(CanalHorsMetriquesSecondaires);
  });

  it("une seule unité, du canal application : lève, comme au milieu d'unités API", () => {
    expect(() => repartitionDrapeaux([APPLICATION])).toThrow(CanalHorsMetriquesSecondaires);
  });
});

describe("exactitude par candidat et seuil de couverture (conformité n° 30, §4 et §8)", () => {
  it("n'établit aucune exactitude pour un candidat sous le seuil, et le rapporte à part", () => {
    // candidat-c compte moins de 10 items P vérifiés au gel (sous_seuil lu dans le run) : §8,
    // « aucune statistique par candidat » ; §4, « rapporté à part, couverture insuffisante ».
    const partage = { compares: ["candidat-a"], rapportes_a_part: ["candidat-c"] };
    const jeu = [
      unite({ candidat_id: "candidat-a", categorie: "exacte" }),
      unite({ candidat_id: "candidat-c", categorie: "inexacte" }),
    ];

    const parCandidat = exactitudeParCandidat(jeu, partage);

    expect([...parCandidat.compares]).toEqual([["candidat-a", { numerateur: 1, denominateur: 1, valeur: 1 }]]);
    expect(parCandidat.rapportes_a_part).toEqual(["candidat-c"]);
  });

  it("refuse un candidat des unités absent du partage plutôt que de le classer en silence", () => {
    const partage = { compares: ["candidat-a"], rapportes_a_part: [] };

    expect(() => exactitudeParCandidat([unite({ candidat_id: "candidat-z" })], partage)).toThrow(/candidat-z/);
  });
});

/** Lecture du run de `outil_id` sur l'item `item`, identifiée par `id`. */
function lectureSur(id: string, item: string, affiche: boolean, outil_id = "comparateur-un"): LectureComparateur {
  return lectureComparateur({
    id: ulid(id),
    outil_id,
    affiche,
    reference_item: referenceP(item),
  });
}

function verdictDeLecture(id: string, lecture: string, categorie_retenue: CategorieRetenue = "exacte") {
  return verdict({ id: ulid(id), objet_note: { type: "lecture_comparateur", id: ulid(lecture) }, categorie_retenue });
}

/** Le run dont les items P de référence sont les items nommés `noms`. */
function runSur(noms: readonly string[], comparateurs?: readonly string[]) {
  return runDeComparateurs(noms.map(referenceP), comparateurs);
}

describe("comparateurs (QR9)", () => {
  it("calcule couverture et exactitude, et les rend absentes quand le dénominateur est nul", () => {
    // 4 items P de référence, 3 affichés (couverture 3/4 = 0,75), dont 2 compatibles (2/3).
    const reference = runSur(["i1", "i2", "i3", "i4"]);
    const lectures = [
      lectureSur("l1", "i1", true),
      lectureSur("l2", "i2", true),
      lectureSur("l3", "i3", true),
      lectureSur("l4", "i4", false),
      // Hors run : ne compte ni au numérateur ni au dénominateur, et n'est pas une lecture en double.
      lectureComparateur({ ...lectureSur("l5", "i1", true), contexte: "pilote" }),
    ];
    const verdicts = [
      verdictDeLecture("vl1", "l1"),
      verdictDeLecture("vl2", "l2"),
      verdictDeLecture("vl3", "l3", "inexacte"),
      verdict({ id: ulid("vl5"), contexte: "pilote", objet_note: { type: "lecture_comparateur", id: ulid("l5") } }),
    ];

    const [mesure] = metriquesComparateur(reference, lectures, verdicts);

    expect(mesure?.outil_id).toBe("comparateur-un");
    expect(mesure?.couverture).toEqual({ numerateur: 3, denominateur: 4, valeur: 0.75 });
    expect(mesure?.exactitude).toEqual({ numerateur: 2, denominateur: 3, valeur: 2 / 3 });

    // Aucun item affiché : l'exactitude n'existe pas.
    const aucunAffichage = metriquesComparateur(runSur(["i6"]), [lectureSur("l6", "i6", false)], []);
    expect(aucunAffichage[0]?.couverture).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    attendreAbsent(aucunAffichage[0]?.exactitude as Taux, 0);
  });

  it("refuse une lecture affichée sans verdict, au lieu de la compter comme incompatible", () => {
    expect(() => metriquesComparateur(runSur(["i1"]), [lectureSur("l1", "i1", true)], [])).toThrow(/verdict/);
  });
});

describe("exactitude des comparateurs : même règle que les assistants (constat n° 5)", () => {
  /** Un comparateur, une lecture affichée par catégorie donnée, plus `masquees` lectures non affichées. */
  function mesurer(categories: readonly CategorieRetenue[], masquees = 0) {
    const affichees = categories.map((_, i) => lectureSur(`la-${i}`, `ia-${i}`, true));
    const cachees = Array.from({ length: masquees }, (_, i) => lectureSur(`lm-${i}`, `im-${i}`, false));
    const reference = runSur([
      ...categories.map((_, i) => `ia-${i}`),
      ...Array.from({ length: masquees }, (_, i) => `im-${i}`),
    ]);
    const verdicts = categories.map((categorie, i) => verdictDeLecture(`vla-${i}`, `la-${i}`, categorie));
    const [mesure] = metriquesComparateur(reference, [...affichees, ...cachees], verdicts);
    if (mesure === undefined) throw new Error("aucune mesure rendue");
    return mesure;
  }

  it("sort la lecture indéterminée du dénominateur de l'exactitude d'un comparateur", () => {
    // Exacte + indéterminée : 1/1, et non 1/2 comme avant la correction.
    expect(mesurer(["exacte", "indeterminee"]).exactitude).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
  });

  it("sort la lecture notée non-réponse du dénominateur", () => {
    expect(mesurer(["exacte", "non_reponse"]).exactitude).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
  });

  it("rend l'exactitude absente, pas nulle, quand aucune lecture affichée n'est classée", () => {
    const mesure = mesurer(["indeterminee", "non_reponse"]);
    attendreAbsent(mesure.exactitude, 0);
  });

  it("garde la couverture inchangée : les lectures non classées restent des items affichés", () => {
    // 3 affichées (exacte, indéterminée, non-réponse) sur 4 items P de référence : couverture 3/4.
    expect(mesurer(["exacte", "indeterminee", "non_reponse"], 1).couverture).toEqual({
      numerateur: 3,
      denominateur: 4,
      valeur: 0.75,
    });
  });

  it("lève sur deux verdicts du run portant sur une même lecture, au lieu de garder le dernier", () => {
    const verdicts = [verdictDeLecture("vl1", "l1"), verdictDeLecture("vl1-bis", "l1", "inexacte")];

    expect(() => metriquesComparateur(runSur(["i1"]), [lectureSur("l1", "i1", true)], verdicts)).toThrow(
      VerdictEnDouble,
    );
  });
});

/**
 * Conformité n° 11 : la couverture d'un comparateur se divise par les items P de référence du run,
 * pas par les lectures reçues. Décision de l'auteur du 2026-10-02 (texte à écrire au §8 en 0.15) :
 * ce sont les items P comptés au gel pour les candidats interrogés (`items_p_au_gel`), la base du
 * tirage et du seuil de couverture.
 */
describe("conformité n° 11 : couverture des comparateurs sur les items P de référence", () => {
  function fautes(appel: () => unknown): LecturesComparateurIncoherentes {
    try {
      appel();
    } catch (erreur) {
      if (erreur instanceof LecturesComparateurIncoherentes) return erreur;
      throw erreur;
    }
    throw new Error("aucune erreur levée");
  }

  it("lève sur un item P de référence sans lecture, au lieu de le sortir du dénominateur de la couverture", () => {
    // Avant la correction : 1 affichée sur 1 lecture reçue, couverture 1/1 au lieu d'une erreur.
    const erreur = fautes(() =>
      metriquesComparateur(runSur(["i1", "i2"]), [lectureSur("l1", "i1", true)], [verdictDeLecture("v1", "l1")]),
    );
    expect(erreur.manquantes).toEqual([{ outil_id: "comparateur-un", item_id: ulid("i2") }]);
    expect(erreur.en_double).toEqual([]);
    expect(erreur.hors_reference).toEqual([]);
    expect(erreur.epingles_divergentes).toEqual([]);
    expect(erreur.message).toContain(ulid("i2"));
  });

  it("lève sur deux lectures du même outil sur le même item, au lieu de le compter deux fois", () => {
    const lectures = [lectureSur("l1", "i1", true), lectureSur("l1-bis", "i1", false)];
    const erreur = fautes(() => metriquesComparateur(runSur(["i1"]), lectures, [verdictDeLecture("v1", "l1")]));
    expect(erreur.en_double).toEqual([
      { outil_id: "comparateur-un", item_id: ulid("i1"), lectures: [ulid("l1"), ulid("l1-bis")] },
    ]);
    expect(erreur.manquantes).toEqual([]);
  });

  it("lève sur une lecture d'un item hors de la liste, par exemple contesté au gel", () => {
    const lectures = [lectureSur("l1", "i1", false), lectureSur("l-hors", "conteste-au-gel", true)];
    const erreur = fautes(() => metriquesComparateur(runSur(["i1"]), lectures, [verdictDeLecture("v", "l-hors")]));
    expect(erreur.hors_reference).toEqual([ulid("l-hors")]);
    expect(erreur.manquantes).toEqual([]);
  });

  it("lève sur une lecture d'un item P d'un candidat non interrogé, même listé au gel", () => {
    const base = runSur(["i1"]);
    const retire = candidat({
      candidat_id: "candidat-retire",
      statut_au_gel: "retire",
      interroge: false,
      items_p_verifies: 1,
      items_p_au_gel: [referenceP("item-du-retire")],
      sous_seuil: true,
    });
    const reference = { ...base, perimetre: { ...base.perimetre, candidats: [...base.perimetre.candidats, retire] } };
    const lectures = [lectureSur("l1", "i1", false), lectureSur("l-retire", "item-du-retire", false)];
    expect(fautes(() => metriquesComparateur(reference, lectures, [])).hors_reference).toEqual([ulid("l-retire")]);
  });

  it("lève sur un comparateur du run sans aucune lecture quand la liste de référence n'est pas vide", () => {
    const erreur = fautes(() => metriquesComparateur(runSur(["i1", "i2"]), [], []));
    const attendues = [ulid("i1"), ulid("i2")].sort().map((item_id) => ({ outil_id: "comparateur-un", item_id }));
    expect(erreur.manquantes).toEqual(attendues);
  });

  it("ne lève pas sur un run sans comparateur et sans lecture", () => {
    expect(metriquesComparateur(runSur(["i1"], []), [], [])).toEqual([]);
  });

  it("lève sur une lecture d'un outil qui n'est pas un comparateur inclus du run, au lieu de l'ignorer", () => {
    const lectures = [lectureSur("l1", "i1", false), lectureSur("l-inconnu", "i1", false, "comparateur-inconnu")];
    expect(fautes(() => metriquesComparateur(runSur(["i1"]), lectures, [])).hors_perimetre).toEqual([
      ulid("l-inconnu"),
    ]);
  });

  it("rend une couverture absente, au dénominateur 0, quand la liste de référence est vide", () => {
    const [mesure] = metriquesComparateur(runSur([]), [], []);
    expect(mesure?.outil_id).toBe("comparateur-un");
    expect(mesure?.couverture.numerateur).toBe(0);
    attendreAbsent(mesure?.couverture as Taux, 0);
    attendreAbsent(mesure?.exactitude as Taux, 0);
  });

  it("juge deux comparateurs sur la même liste de référence", () => {
    // Liste de 3 items. Le premier en affiche 3, le second 1 : 3/3 et 1/3.
    const reference = runSur(["i1", "i2", "i3"], ["comparateur-un", "comparateur-deux"]);
    const lectures = [
      lectureSur("a1", "i1", true),
      lectureSur("a2", "i2", true),
      lectureSur("a3", "i3", true),
      lectureSur("b1", "i1", true, "comparateur-deux"),
      lectureSur("b2", "i2", false, "comparateur-deux"),
      lectureSur("b3", "i3", false, "comparateur-deux"),
    ];
    const verdicts = ["a1", "a2", "a3", "b1"].map((lecture) => verdictDeLecture(`v-${lecture}`, lecture));

    const mesures = metriquesComparateur(reference, lectures, verdicts);

    expect(mesures.map((m) => [m.outil_id, m.couverture])).toEqual([
      ["comparateur-un", { numerateur: 3, denominateur: 3, valeur: 1 }],
      ["comparateur-deux", { numerateur: 1, denominateur: 3, valeur: 1 / 3 }],
    ]);
  });

  it("accepte une lecture à la version et à l'empreinte de l'item au gel", () => {
    const lecture = lectureSur("l1", "i1", false);
    expect(lecture.reference_item).toEqual(referenceP("i1"));
    const [mesure] = metriquesComparateur(runSur(["i1"]), [lecture], []);
    expect(mesure?.couverture).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
  });

  it("lève sur une lecture d'une autre version de l'item qu'au gel, au lieu de la noter sur l'ancien contenu", () => {
    // L'item a été corrigé entre la lecture (version 1) et le gel (version 2).
    const au_gel = { ...referenceP("i1"), item_version: 2, item_empreinte: empreinte("i1-corrige") };
    const lecture = lectureSur("l1", "i1", true);
    const erreur = fautes(() => metriquesComparateur(runDeComparateurs([au_gel]), [lecture], [verdictDeLecture("v1", "l1")]));
    expect(erreur.epingles_divergentes).toEqual([{ lecture_id: ulid("l1"), lue: referenceP("i1"), au_gel }]);
    // La lecture reste celle de son item : il n'est pas dit manquant en plus.
    expect(erreur.manquantes).toEqual([]);
    expect(erreur.hors_reference).toEqual([]);
    expect(erreur.message).toContain(`${ulid("l1")} : ${ulid("i1")} lu en v1/${empreinte("i1")}, v2/${empreinte("i1-corrige")} au gel`);
  });

  it("lève sur une lecture de même version que l'item au gel mais d'empreinte différente", () => {
    const au_gel = { ...referenceP("i1"), item_empreinte: empreinte("i1-autre-contenu") };
    const erreur = fautes(() => metriquesComparateur(runDeComparateurs([au_gel]), [lectureSur("l1", "i1", false)], []));
    expect(erreur.epingles_divergentes).toEqual([{ lecture_id: ulid("l1"), lue: referenceP("i1"), au_gel }]);
  });

  it("liste chaque lecture divergente, par comparateur, et accepte celles qui ne le sont pas", () => {
    const au_gel = { ...referenceP("i2"), item_version: 3 };
    const reference = runDeComparateurs([referenceP("i1"), au_gel], ["comparateur-un", "comparateur-deux"]);
    const lectures = [
      lectureSur("a1", "i1", false),
      lectureSur("a2", "i2", false),
      lectureSur("b1", "i1", false, "comparateur-deux"),
      lectureComparateur({ ...lectureSur("b2", "i2", false, "comparateur-deux"), reference_item: au_gel }),
    ];
    const erreur = fautes(() => metriquesComparateur(reference, lectures, []));
    expect(erreur.epingles_divergentes.map((d) => d.lecture_id)).toEqual([ulid("a2")]);
  });

  it("une lecture hors de la liste reste hors référence, sans épingle à confronter", () => {
    const lectures = [lectureSur("l1", "i1", false), lectureSur("l-absent", "absent-du-gel", false)];
    const erreur = fautes(() => metriquesComparateur(runSur(["i1"]), lectures, []));
    expect(erreur.hors_reference).toEqual([ulid("l-absent")]);
    expect(erreur.epingles_divergentes).toEqual([]);
  });

  it("lève sur le comparateur auquel il manque un item, même quand l'autre est complet", () => {
    const reference = runSur(["i1", "i2"], ["comparateur-un", "comparateur-deux"]);
    const lectures = [
      lectureSur("a1", "i1", false),
      lectureSur("a2", "i2", false),
      lectureSur("b1", "i1", false, "comparateur-deux"),
    ];
    const erreur = fautes(() => metriquesComparateur(reference, lectures, []));
    expect(erreur.manquantes).toEqual([{ outil_id: "comparateur-deux", item_id: ulid("i2") }]);
  });
});
