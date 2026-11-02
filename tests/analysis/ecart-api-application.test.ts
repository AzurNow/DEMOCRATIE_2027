/**
 * Écart API / application (§6, QR8 ; §8, « Graines de l'analyse » ; D59 (6), protocole 0.24) :
 * « la différence d'exactitude entre l'API, dans le mode de tête de l'outil (section 8), et
 * l'application, appariée par question sur les questions du sous-échantillon, dont la graine dérive
 * de la clé `<outil>:api-application` », rapportée « avec ses intervalles de confiance et
 * l'étiquette « exploratoire » ».
 */

import { describe, expect, it } from "vitest";
import {
  ApplicationHorsConditionsDesTesteurs,
  ApplicationHorsSousEchantillon,
  COMPOSANT_ECART,
  ecartsApiApplication,
  ModeDeTeteAbsent,
} from "../../analysis/ecart-api-application.ts";
import { graineHexadecimale } from "../../analysis/graines.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import { idQuestion, outil, tousCompares, ulid, unite, type Partiel } from "./fabriques.ts";

const OPTIONS = { reechantillonnages: 200, graine_du_run: 20261201 };

const Q1 = idQuestion("q1");
const Q2 = idQuestion("q2");
const Q3 = idQuestion("q3");
const Q4 = idQuestion("q4");

let rang = 0;

/** Une unité d'une question donnée ; la grappe est l'item de la question (§8). */
function sur(question: string, partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse {
  rang += 1;
  return unite({
    verdict_id: ulid(`verdict-${rang}`),
    reponse_id: ulid(`reponse-${rang}`),
    question_id: question,
    grappe_id: ulid(`item-${question}`),
    item_principal_id: ulid(`item-${question}`),
    ...partiel,
  });
}

function api(question: string, mode: "web_activee" | "web_desactivee", categorie: UniteAnalyse["categorie"]): UniteAnalyse {
  return sur(question, { canal: "api", mode, categorie });
}

function application(question: string, categorie: UniteAnalyse["categorie"]): UniteAnalyse {
  return sur(question, { canal: "application", mode: null, categorie });
}

describe("écart API / application : bras, appariement, clé", () => {
  it("compare l'API dans le mode de tête à l'application, API moins application, étiqueté exploratoire", () => {
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      api(Q2, "web_desactivee", "exacte"),
      application(Q1, "inexacte"),
      application(Q2, "exacte"),
    ];

    const resultat = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1, Q2] },
      OPTIONS,
    );

    expect(resultat.outils_exclus).toEqual([]);
    const [ecart] = resultat.par_outil;
    expect(ecart?.outil_id).toBe("outil-alpha");
    expect(ecart?.mode_de_tete).toBe("web_desactivee");
    expect(ecart?.exploratoire).toBe(true);
    expect(ecart?.questions_appariees).toBe(2);
    expect(ecart?.questions_exclues).toEqual([]);
    expect(ecart?.difference.taux_a).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
    expect(ecart?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
    expect(ecart?.difference.difference).toBe(0.5);
  });

  it("publie la clé §8 : famille, métrique, strate, puis <outil>:api-application, et la graine qui en dérive", () => {
    const unites = [api(Q1, "web_desactivee", "exacte"), application(Q1, "exacte")];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
      OPTIONS,
    ).par_outil;

    const cle = ["bootstrap", "exactitude", "global", "outil-alpha:api-application"];
    expect(COMPOSANT_ECART).toBe("api-application");
    expect(ecart?.difference.cle).toEqual(cle);
    expect(ecart?.difference.graine).toBe(graineHexadecimale(OPTIONS.graine_du_run, cle));
  });

  it("réponse API manquante pour une question de l'application : la paire n'est pas appariée, la question est nommée", () => {
    // Q2 n'a de réponse que dans l'application (la réponse API est manquante, donc sans unité).
    // Appariée, la différence porte sur Q1 seule : 1 − 1 = 0. Non appariée, l'application
    // compterait Q2 (inexacte) et la différence vaudrait 1 − 0,5 = 0,5.
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      application(Q1, "exacte"),
      application(Q2, "inexacte"),
    ];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1, Q2] },
      OPTIONS,
    ).par_outil;

    expect(ecart?.questions_appariees).toBe(1);
    expect(ecart?.questions_exclues).toEqual([Q2]);
    expect(ecart?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(ecart?.difference.difference).toBe(0);
  });

  it("ne lit que les questions du sous-échantillon dans le bras API : les autres ne sont ni comparées ni exclues", () => {
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      api(Q3, "web_desactivee", "inexacte"),
      application(Q1, "exacte"),
    ];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
      OPTIONS,
    ).par_outil;

    expect(ecart?.questions_exclues).toEqual([]);
    expect(ecart?.difference.taux_a).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
  });

  it("une réponse de l'application hors du sous-échantillon lève : elle n'a pas été tirée", () => {
    const unites = [api(Q1, "web_desactivee", "exacte"), application(Q1, "exacte"), application(Q3, "exacte")];

    expect(() =>
      ecartsApiApplication(
        { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
        OPTIONS,
      ),
    ).toThrow(ApplicationHorsSousEchantillon);
  });

  it("une saisie de l'application hors de la formulation neutre lève : les testeurs ne saisissent qu'elle", () => {
    const familiere = sur(Q1, { canal: "application", mode: null, categorie: "exacte", registre: "familier" });
    const unites = [api(Q1, "web_desactivee", "exacte"), application(Q1, "exacte"), familiere];

    expect(() =>
      ecartsApiApplication(
        { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
        OPTIONS,
      ),
    ).toThrow(new ApplicationHorsConditionsDesTesteurs([familiere.reponse_id]));
  });

  it("une saisie de l'application à un autre échantillon que 1 lève, même neutre", () => {
    const seconde = sur(Q1, { canal: "application", mode: null, categorie: "exacte", echantillon: 2 });
    const unites = [api(Q1, "web_desactivee", "exacte"), application(Q1, "exacte"), seconde];

    expect(() =>
      ecartsApiApplication(
        { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
        OPTIONS,
      ),
    ).toThrow(ApplicationHorsConditionsDesTesteurs);
  });

  it("garde toutes les réponses de l'application d'une question où un seul testeur a rapporté", () => {
    // Q1 : deux testeurs (deux réponses) ; Q2 : un seul. Q2 reste appariée ; l'effectif le dit.
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      api(Q2, "web_desactivee", "exacte"),
      application(Q1, "exacte"),
      application(Q1, "inexacte"),
      application(Q2, "inexacte"),
    ];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1, Q2] },
      OPTIONS,
    ).par_outil;

    expect(ecart?.questions_appariees).toBe(2);
    expect(ecart?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 3, valeur: 1 / 3 });
  });
});

describe("écart API / application : formulation neutre, échantillon 1 côté API (§6, protocole 0.25, D60)", () => {
  it("une réponse API en formulation familière ou à l'échantillon 2 n'entre pas dans l'écart", () => {
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      sur(Q1, { canal: "api", mode: "web_desactivee", categorie: "inexacte", registre: "familier" }),
      sur(Q1, { canal: "api", mode: "web_desactivee", categorie: "inexacte", registre: "oriente", premisse_fausse: true }),
      sur(Q1, { canal: "api", mode: "web_desactivee", categorie: "inexacte", echantillon: 2 }),
      application(Q1, "exacte"),
    ];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
      OPTIONS,
    ).par_outil;

    expect(ecart?.difference.taux_a).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(ecart?.difference.difference).toBe(0);
  });

  it("deux saisies (deux testeurs) d'une même question sont deux observations de la même grappe", () => {
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      api(Q2, "web_desactivee", "exacte"),
      application(Q1, "exacte"),
      application(Q1, "inexacte"),
      application(Q2, "exacte"),
    ];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1, Q2] },
      OPTIONS,
    ).par_outil;

    // Trois observations de l'application, deux grappes (les items de Q1 et de Q2), pas trois.
    expect(ecart?.difference.taux_b).toEqual({ numerateur: 2, denominateur: 3, valeur: 2 / 3 });
    expect(ecart?.difference.intervalle?.nombre_grappes).toBe(2);
  });

  it("une question sans réponse API neutre à l'échantillon 1 est exclue et nommée", () => {
    // Q2 n'a, côté API, qu'une réponse familière et une réponse neutre à l'échantillon 2.
    const unites = [
      api(Q1, "web_desactivee", "exacte"),
      sur(Q2, { canal: "api", mode: "web_desactivee", categorie: "exacte", registre: "familier" }),
      sur(Q2, { canal: "api", mode: "web_desactivee", categorie: "exacte", echantillon: 2 }),
      application(Q1, "exacte"),
      application(Q2, "inexacte"),
    ];

    const [ecart] = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1, Q2] },
      OPTIONS,
    ).par_outil;

    expect(ecart?.questions_appariees).toBe(1);
    expect(ecart?.questions_exclues).toEqual([Q2]);
    expect(ecart?.difference.taux_b).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
  });
});

describe("écart API / application : mode de tête", () => {
  it("égalité d'exactitude entre les deux modes : le mode lu est celui déclaré, jamais départagé par les chiffres", () => {
    // web_activee : 1/2 (Q1, Q2) ; web_desactivee : 2/4 (Q1 à Q4). Même exactitude, effectifs
    // différents : seul le dénominateur dit quel bras a été lu.
    const unites = [
      api(Q1, "web_activee", "exacte"),
      api(Q2, "web_activee", "inexacte"),
      api(Q1, "web_desactivee", "exacte"),
      api(Q2, "web_desactivee", "inexacte"),
      api(Q3, "web_desactivee", "exacte"),
      api(Q4, "web_desactivee", "inexacte"),
      application(Q1, "exacte"),
      application(Q2, "exacte"),
      application(Q3, "exacte"),
      application(Q4, "exacte"),
    ];
    const couples = tousCompares(unites);
    const entrees = { unites, couples, questions_sous_echantillon: [Q1, Q2, Q3, Q4] };

    const desactivee = ecartsApiApplication({ ...entrees, outils: [outil({ mode_de_tete: "web_desactivee" })] }, OPTIONS);
    const activee = ecartsApiApplication({ ...entrees, outils: [outil({ mode_de_tete: "web_activee" })] }, OPTIONS);

    expect(desactivee.par_outil[0]?.mode_de_tete).toBe("web_desactivee");
    expect(desactivee.par_outil[0]?.difference.taux_a.denominateur).toBe(4);
    expect(activee.par_outil[0]?.mode_de_tete).toBe("web_activee");
    expect(activee.par_outil[0]?.difference.taux_a.denominateur).toBe(2);
  });

  it("un outil de l'application sans mode de tête déclaré lève : aucun mode n'est choisi à sa place", () => {
    const unites = [api(Q1, "web_desactivee", "exacte"), application(Q1, "exacte")];

    expect(() =>
      ecartsApiApplication(
        {
          unites,
          outils: [outil({ mode_de_tete: undefined })],
          couples: tousCompares(unites),
          questions_sous_echantillon: [Q1],
        },
        OPTIONS,
      ),
    ).toThrow(ModeDeTeteAbsent);
  });

  it("un outil dont le couple de tête est « run incomplet » est exclu, nommé, jamais comparé", () => {
    const unites = [api(Q1, "web_desactivee", "exacte"), application(Q1, "exacte")];
    const couples = { compares: [], incomplets: [{ outil_id: "outil-alpha", mode: "web_desactivee" as const }] };

    const resultat = ecartsApiApplication(
      { unites, outils: [outil()], couples, questions_sous_echantillon: [Q1] },
      OPTIONS,
    );

    expect(resultat.par_outil).toEqual([]);
    expect(resultat.outils_exclus).toEqual([{ outil_id: "outil-alpha", mode_de_tete: "web_desactivee", motif: "run_incomplet" }]);
  });

  it("un outil sans aucune réponse de l'application n'a pas de ligne", () => {
    const unites = [api(Q1, "web_desactivee", "exacte")];

    const resultat = ecartsApiApplication(
      { unites, outils: [outil()], couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
      OPTIONS,
    );

    expect(resultat).toEqual({ par_outil: [], outils_exclus: [] });
  });

  it("rend une ligne par outil, triée par identifiant, chacun avec sa propre clé", () => {
    const unites = [
      sur(Q1, { outil_id: "outil-beta", canal: "api", mode: "web_activee" }),
      sur(Q1, { outil_id: "outil-beta", canal: "application", mode: null }),
      api(Q1, "web_desactivee", "exacte"),
      application(Q1, "exacte"),
    ];
    const outils = [outil({ outil_id: "outil-beta", mode_de_tete: "web_activee" }), outil()];

    const resultat = ecartsApiApplication(
      { unites, outils, couples: tousCompares(unites), questions_sous_echantillon: [Q1] },
      OPTIONS,
    );

    expect(resultat.par_outil.map((e) => e.outil_id)).toEqual(["outil-alpha", "outil-beta"]);
    expect(resultat.par_outil[1]?.difference.cle.at(-1)).toBe("outil-beta:api-application");
  });
});
