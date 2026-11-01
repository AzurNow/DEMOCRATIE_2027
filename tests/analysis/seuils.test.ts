/**
 * Seuils de non-publication du §8 — les deux règles qui retirent un chiffre du rapport.
 *
 * Protocole 0.11 : « Aucune statistique par candidat sous 10 items P vérifiés (section 4). Aucune
 * statistique pour un outil dans un mode si plus de 20 % des réponses du canal API de ce run sont
 * manquantes pour ce couple : il est alors marqué « run incomplet » et exclu des comparaisons de ce
 * run, l'autre mode de l'outil restant publié s'il passe le seuil. »
 *
 * Conformité n° 84, protocole 0.11 : les tests de la règle d'avant (seuil par outil, tous modes et
 * tous canaux confondus) sont réécrits ici par couple outil × mode ; aucune assertion n'est
 * affaiblie, les effectifs et les frontières (2/10, 3/10, 1/5) sont conservés.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AssistantInclusSansModes,
  candidatsComparables,
  cleCouple,
  CoupleHorsPerimetre,
  CoupleSansRequetePlanifiee,
  couplesComparables,
  couplesDeclares,
  couplesDuRun,
  parModeDuRun,
  partReponsesManquantes,
  partReponsesManquantesDuPlan,
  PlanIncoherent,
  repartirParCandidat,
  ReponseHorsPlan,
  requetesSansReponse,
  runIncomplet,
  SEUIL_RUN_INCOMPLET,
} from "../../analysis/seuils.ts";
import type { Canal, Mode } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { candidat, idQuestion, outil, planCouvrant, reponse, reponseDe, requetesPlanifiees, run, ulid, unite } from "./fabriques.ts";

const ALPHA_DESACTIVEE = { outil_id: "outil-alpha", mode: "web_desactivee" } as const;

/**
 * `obtenues` réponses obtenues et `manquantes` réponses manquantes d'un couple. Le canal
 * application n'a pas de mode (§6) : le champ est alors retiré, comme le schéma l'exige. Chaque
 * réponse porte sa propre question : deux réponses ne répondent jamais à la même requête du plan
 * (`planCouvrant`, protocole 0.21).
 */
function reponses(
  obtenues: number,
  manquantes: number,
  outil_id = "outil-alpha",
  mode: Mode = "web_desactivee",
  canal: Canal = "api",
) {
  const modeEcrit = canal === "api" ? mode : undefined;
  const prefixe = `${outil_id}-${mode}-${canal}`;
  const liste = [];
  for (let i = 0; i < obtenues; i += 1) {
    liste.push(reponse({ id: ulid(`${prefixe}-ok-${i}`), outil_id, mode: modeEcrit, canal, question_id: idQuestion(`${prefixe}-ok-${i}`) }));
  }
  for (let i = 0; i < manquantes; i += 1) {
    liste.push(
      reponse({
        id: ulid(`${prefixe}-manq-${i}`),
        question_id: idQuestion(`${prefixe}-manq-${i}`),
        outil_id,
        mode: modeEcrit,
        canal,
        statut_reponse: "manquante",
        normalise: undefined,
      }),
    );
  }
  return liste;
}

describe("seuil de couverture par candidat", () => {
  it("écarte des comparaisons inter-candidats un candidat sous le seuil, et le rapporte à part", () => {
    // §4 et §8 : le seuil est lu dans run.perimetre.candidats[].sous_seuil, jamais recalculé ici.
    const perimetre = run({
      perimetre: {
        candidats: [
          candidat({ candidat_id: "candidat-a", items_p_verifies: 20, sous_seuil: false }),
          candidat({ candidat_id: "candidat-b", items_p_verifies: 8, sous_seuil: true }),
          candidat({ candidat_id: "candidat-c", items_p_verifies: 10, sous_seuil: false }),
        ],
        outils: [],
      },
    });

    const partage = candidatsComparables(perimetre);

    expect(partage.compares).toEqual(["candidat-a", "candidat-c"]);
    expect(partage.rapportes_a_part).toEqual(["candidat-b"]);
  });
});

describe("seuil de réponses manquantes par couple outil × mode (conformité n° 84, protocole 0.11)", () => {
  it("SEUIL_RUN_INCOMPLET vaut exactement 20 %, en fraction entière (constat 16 de la revue du 2026-10-12)", () => {
    expect(SEUIL_RUN_INCOMPLET).toEqual({ numerateur: 1, denominateur: 5 });
    expect(SEUIL_RUN_INCOMPLET.numerateur / SEUIL_RUN_INCOMPLET.denominateur).toBe(0.2);
  });

  it("laisse un couple à 20 % exactement dans les comparaisons, et exclut celui qui dépasse", () => {
    // §8 dit « plus de 20 % ». Comparaison entière (5·manquantes > total) : 2/10 ne déclenche
    // pas, 3/10 déclenche. Le flottant 0,2 ne décide rien.
    const pile = partReponsesManquantes(reponses(8, 2), ALPHA_DESACTIVEE);
    expect(pile).toEqual({ numerateur: 2, denominateur: 10, valeur: 0.2 });
    expect(runIncomplet(pile)).toBe(false);

    const dessus = partReponsesManquantes(reponses(7, 3), ALPHA_DESACTIVEE);
    expect(dessus).toEqual({ numerateur: 3, denominateur: 10, valeur: 0.3 });
    expect(runIncomplet(dessus)).toBe(true);
  });

  it("laisse comparable un couple à un cinquième exact, sur 1/5 comme sur 2/10", () => {
    const unSurCinq = partReponsesManquantes(reponses(4, 1), ALPHA_DESACTIVEE);
    expect(unSurCinq).toEqual({ numerateur: 1, denominateur: 5, valeur: 0.2 });
    expect(runIncomplet(unSurCinq)).toBe(false);

    expect(runIncomplet(partReponsesManquantes(reponses(8, 2), ALPHA_DESACTIVEE))).toBe(false);
    expect(couplesComparables(reponses(4, 1), planCouvrant(reponses(4, 1)))).toEqual({ compares: [ALPHA_DESACTIVEE], incomplets: [] });
    expect(couplesComparables(reponses(8, 2), planCouvrant(reponses(8, 2)))).toEqual({ compares: [ALPHA_DESACTIVEE], incomplets: [] });
  });

  it("décide chaque mode d'un outil à part : 30 % en web activée l'exclut, 5 % en web désactivée reste comparable", () => {
    // Agrégés, les deux modes donneraient (6 + 1) / 40 = 17,5 %, sous le seuil : l'ancienne règle
    // aurait laissé passer le mode web activée. La moyenne agrégée ne décide plus rien.
    const jeu = [
      ...reponses(14, 6, "outil-alpha", "web_activee"),
      ...reponses(19, 1, "outil-alpha", "web_desactivee"),
    ];

    expect(partReponsesManquantes(jeu, { outil_id: "outil-alpha", mode: "web_activee" })).toEqual({
      numerateur: 6,
      denominateur: 20,
      valeur: 0.3,
    });
    expect(partReponsesManquantes(jeu, ALPHA_DESACTIVEE)).toEqual({
      numerateur: 1,
      denominateur: 20,
      valeur: 0.05,
    });

    const partage = couplesComparables(jeu, planCouvrant(jeu));

    expect(partage.incomplets).toEqual([{ outil_id: "outil-alpha", mode: "web_activee" }]);
    expect(partage.compares).toEqual([ALPHA_DESACTIVEE]);
  });

  it("ignore les réponses manquantes du canal application, qui n'entrent jamais dans le seuil", () => {
    // Couple API à 1/5 (comparable). Dix réponses manquantes du canal application sur le même
    // outil : les compter ferait passer la part à 11/15, bien au-delà du seuil.
    const jeu = [...reponses(4, 1), ...reponses(0, 10, "outil-alpha", "web_desactivee", "application")];

    expect(partReponsesManquantes(jeu, ALPHA_DESACTIVEE)).toEqual({
      numerateur: 1,
      denominateur: 5,
      valeur: 0.2,
    });
    expect(couplesComparables(jeu, planCouvrant(jeu))).toEqual({ compares: [ALPHA_DESACTIVEE], incomplets: [] });
  });

  it("ne qualifie pas un couple sans aucune réponse API plutôt que de le déclarer complet", () => {
    const aucune = partReponsesManquantes([], { outil_id: "outil-absent", mode: "web_activee" });
    expect(aucune.denominateur).toBe(0);
    expect(() => runIncomplet(aucune)).toThrow(/aucune réponse/);

    // Des réponses du seul canal application ne rendent pas le couple API décidable.
    const applicationSeule = partReponsesManquantes(
      reponses(3, 0, "outil-alpha", "web_desactivee", "application"),
      ALPHA_DESACTIVEE,
    );
    expect(applicationSeule.denominateur).toBe(0);
    expect(() => runIncomplet(applicationSeule)).toThrow(/aucune réponse/);
  });

  it("sépare les couples comparables des couples marqués run incomplet, outil par outil", () => {
    const jeu = [...reponses(8, 2, "outil-alpha"), ...reponses(7, 3, "outil-beta")];

    const partage = couplesComparables(jeu, planCouvrant(jeu));

    expect(partage.compares).toEqual([ALPHA_DESACTIVEE]);
    expect(partage.incomplets).toEqual([{ outil_id: "outil-beta", mode: "web_desactivee" }]);
  });

  it("refuse une réponse API sans mode plutôt que de la ranger dans un mode supposé", () => {
    // §6 : le mode est obligatoire sur le canal API. Absent, le couple n'est pas décidable.
    const sansMode = [reponse({ id: ulid("api-sans-mode"), mode: undefined })];

    expect(() => couplesComparables(sansMode, planCouvrant(sansMode))).toThrow(/mode/);
  });

  it("ne compte que les réponses du run dans la part de manquantes", () => {
    const jeu = [
      ...reponses(1, 1),
      reponse({ id: ulid("cf"), statut_reponse: "manquante", normalise: undefined, contexte: "contrefactuel_candidat" }),
    ];

    expect(partReponsesManquantes(jeu, ALPHA_DESACTIVEE)).toEqual({
      numerateur: 1,
      denominateur: 2,
      valeur: 0.5,
    });
  });

  it("nomme chaque couple par une clé stable et lisible", () => {
    // Le séparateur « / » n'appartient pas à l'alphabet d'un identifiant court (commun.schema.json) :
    // deux couples distincts ne peuvent pas partager une clé.
    expect(cleCouple({ outil_id: "outil-alpha", mode: "web_activee" })).toBe("outil-alpha/web_activee");
    expect(cleCouple(ALPHA_DESACTIVEE)).toBe("outil-alpha/web_desactivee");
  });
});

describe("par_mode du run (D55 (7), constat 17 de la revue du 2026-10-12)", () => {
  const EXEMPLE_RUN = resolve(import.meta.dirname, "../../schema/exemples/run/valide-01-mensuel-publie.json");

  it("calcule un seuil_mode par mode déclaré d'un assistant inclus ; rien pour l'exclu ni le comparateur", () => {
    const jeu = [
      ...reponses(8, 2, "outil-alpha", "web_activee"),
      ...reponses(7, 3, "outil-alpha", "web_desactivee"),
    ];
    const outils = [
      outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] }),
      outil({ outil_id: "outil-exclu", inclus: false, modes: ["web_activee"] }),
      outil({ outil_id: "comparateur-un", famille: "comparateur", mode_de_tete: undefined }),
    ];

    const resultat = parModeDuRun(outils, jeu, planCouvrant(jeu));

    expect(resultat.get("outil-alpha")).toEqual({
      web_activee: { reponses_manquantes_part: 0.2, run_incomplet: false },
      web_desactivee: { reponses_manquantes_part: 0.3, run_incomplet: true },
    });
    expect(resultat.has("outil-exclu")).toBe(false);
    expect(resultat.has("comparateur-un")).toBe(false);
  });

  it("ignore les réponses hors contexte run et hors canal api, comme partReponsesManquantes", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_desactivee"] })];
    const jeu = [
      ...reponses(4, 1, "outil-alpha", "web_desactivee"),
      reponse({ id: ulid("cf"), outil_id: "outil-alpha", mode: "web_desactivee", statut_reponse: "manquante", normalise: undefined, contexte: "contrefactuel_candidat" }),
      ...reponses(0, 10, "outil-alpha", "web_desactivee", "application"),
    ];

    expect(parModeDuRun(outils, jeu, planCouvrant(jeu)).get("outil-alpha")).toEqual({
      web_desactivee: { reponses_manquantes_part: 0.2, run_incomplet: false },
    });
  });

  it("un mode déclaré sans aucune réponse API lève, en nommant le couple, le seuil n'y étant pas décidable", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] })];
    const jeu = reponses(4, 1, "outil-alpha", "web_desactivee");

    // outil-alpha/web_desactivee a des réponses ; outil-alpha/web_activee, le couple sans
    // aucune réponse API, doit être nommé dans le message (format de `cleCouple`), pas seulement
    // le message générique de `runIncomplet`.
    expect(() => parModeDuRun(outils, jeu, planCouvrant(jeu))).toThrow(/outil-alpha\/web_activee.*décidable/);
  });

  it("une réponse API d'un couple non déclaré par un assistant inclus lève", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_desactivee"] })];
    const jeu = [...reponses(4, 1, "outil-alpha", "web_desactivee"), ...reponses(2, 0, "outil-alpha", "web_activee")];

    expect(() => parModeDuRun(outils, jeu, planCouvrant(jeu))).toThrow(/outil-alpha\/web_activee/);
  });

  it("une réponse API d'un outil exclu ou comparateur lève aussi, aucun n'ayant de couple déclaré", () => {
    const outils = [outil({ outil_id: "outil-alpha", inclus: false, modes: ["web_desactivee"] })];
    const jeu = reponses(4, 0, "outil-alpha", "web_desactivee");

    expect(() => parModeDuRun(outils, jeu, planCouvrant(jeu))).toThrow(/hors périmètre/);
  });

  it("son résultat, inséré dans un run publié de fixture, valide contre run.schema.json", () => {
    const jeu = [...reponses(9, 1, "outil-alpha", "web_activee"), ...reponses(19, 1, "outil-alpha", "web_desactivee")];
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] })];
    const resultat = parModeDuRun(outils, jeu, planCouvrant(jeu));

    const exemple = JSON.parse(readFileSync(EXEMPLE_RUN, "utf8")) as Record<string, unknown> & {
      perimetre: { outils: Record<string, unknown>[] };
    };
    const outilsExemple = exemple.perimetre.outils.map((o) =>
      o["outil_id"] === "outil-alpha" ? { ...o, par_mode: resultat.get("outil-alpha") } : o,
    );
    const runFixture = { ...exemple, perimetre: { ...exemple.perimetre, outils: outilsExemple } };

    expect(() => valider("run", runFixture, "fixture de test")).not.toThrow();
  });
});

describe("réponses manquantes comptées sur le plan d'interrogation (§8, protocole 0.21, D56 (2))", () => {
  // §8 : « comptées sur les requêtes que prévoit le plan d'interrogation du run pour ce couple —
  // chaque question tirée, dans chaque formulation et chaque échantillon —, et non sur les
  // réponses enregistrées ». Une requête du plan sans réponse enregistrée compte comme manquante.
  const OUTILS = [outil({ outil_id: "outil-alpha", modes: ["web_desactivee"] })];

  /** Les `obtenues` premières requêtes du plan obtenues, les `manquantes` suivantes manquantes écrites, le reste sans réponse. */
  function enregistrer(plan: ReturnType<typeof requetesPlanifiees>, obtenues: number, manquantes: number) {
    return [
      ...plan.slice(0, obtenues).map((r) => reponseDe(r, "obtenue")),
      ...plan.slice(obtenues, obtenues + manquantes).map((r) => reponseDe(r, "manquante")),
    ];
  }

  it("100 requêtes planifiées, 75 réponses enregistrées dont 0 manquante écrite : 25 %, run incomplet (avant : 0 %)", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 100);
    const jeu = enregistrer(plan, 75, 0);

    // L'ancien dénominateur, les seules réponses enregistrées, ne voyait aucune manquante.
    expect(partReponsesManquantes(jeu, ALPHA_DESACTIVEE)).toEqual({ numerateur: 0, denominateur: 75, valeur: 0 });

    const part = partReponsesManquantesDuPlan(jeu, plan, ALPHA_DESACTIVEE);
    expect(part).toEqual({ numerateur: 25, denominateur: 100, valeur: 0.25 });
    expect(runIncomplet(part)).toBe(true);
    expect(parModeDuRun(OUTILS, jeu, plan).get("outil-alpha")).toEqual({
      web_desactivee: { reponses_manquantes_part: 0.25, run_incomplet: true },
    });
    expect(couplesComparables(jeu, plan)).toEqual({ compares: [], incomplets: [ALPHA_DESACTIVEE] });
  });

  it("exactement 20 %, absentes et manquantes écrites additionnées : pas incomplet ; 21 % : incomplet (seuil strict)", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 100);

    const pile = partReponsesManquantesDuPlan(enregistrer(plan, 80, 10), plan, ALPHA_DESACTIVEE);
    expect(pile).toEqual({ numerateur: 20, denominateur: 100, valeur: 0.2 });
    expect(runIncomplet(pile)).toBe(false);

    const dessus = partReponsesManquantesDuPlan(enregistrer(plan, 79, 10), plan, ALPHA_DESACTIVEE);
    expect(dessus).toEqual({ numerateur: 21, denominateur: 100, valeur: 0.21 });
    expect(runIncomplet(dessus)).toBe(true);
  });

  it("un couple déclaré et planifié sans aucune réponse enregistrée : 100 % manquantes, décidé, run incomplet", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 10);

    expect(parModeDuRun(OUTILS, [], plan).get("outil-alpha")).toEqual({
      web_desactivee: { reponses_manquantes_part: 1, run_incomplet: true },
    });
  });

  it("zéro requête planifiée pour un couple déclaré : refus nommé, jamais une division par zéro silencieuse", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] })];
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 5);
    const jeu = enregistrer(plan, 5, 0);

    expect(() => parModeDuRun(outils, jeu, plan)).toThrow(CoupleSansRequetePlanifiee);
    expect(() => parModeDuRun(outils, jeu, plan)).toThrow(/outil-alpha\/web_activee/);
    expect(() => partReponsesManquantesDuPlan(jeu, plan, { outil_id: "outil-alpha", mode: "web_activee" })).toThrow(
      CoupleSansRequetePlanifiee,
    );
  });

  it("une réponse API du run enregistrée hors plan : refus nommé qui cite la réponse", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 5);
    const horsPlan = reponse({ id: ulid("hors-plan"), question_id: idQuestion("question-non-tiree") });
    const jeu = [...enregistrer(plan, 5, 0), horsPlan];

    expect(() => parModeDuRun(OUTILS, jeu, plan)).toThrow(ReponseHorsPlan);
    expect(() => parModeDuRun(OUTILS, jeu, plan)).toThrow(horsPlan.id);
    expect(() => partReponsesManquantesDuPlan(jeu, plan, ALPHA_DESACTIVEE)).toThrow(ReponseHorsPlan);
    expect(() => couplesComparables(jeu, plan)).toThrow(ReponseHorsPlan);
    expect(() => requetesSansReponse(jeu, plan)).toThrow(ReponseHorsPlan);
  });

  it("deux réponses enregistrées pour une même requête du plan : refus nommé, jamais un compte au-delà du plan", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 5);
    const premiere = plan[0];
    if (premiere === undefined) throw new Error("plan vide");
    const doublon = { ...reponseDe(premiere, "obtenue"), id: ulid("doublon") };
    const jeu = [...enregistrer(plan, 5, 0), doublon];

    expect(() => partReponsesManquantesDuPlan(jeu, plan, ALPHA_DESACTIVEE)).toThrow(ReponseHorsPlan);
    expect(() => partReponsesManquantesDuPlan(jeu, plan, ALPHA_DESACTIVEE)).toThrow(/deux/);
  });

  it("une requête planifiée pour un couple que le périmètre ne déclare pas : refus nommé", () => {
    const plan = [...requetesPlanifiees("outil-alpha", "web_desactivee", 5), ...requetesPlanifiees("outil-beta", "web_activee", 2)];

    expect(() => parModeDuRun(OUTILS, [], plan)).toThrow(PlanIncoherent);
    expect(() => parModeDuRun(OUTILS, [], plan)).toThrow(/outil-beta\/web_activee/);
  });

  it("une même requête deux fois au plan : refus nommé, le dénominateur n'est pas gonflé", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 5);
    const premiere = plan[0];
    if (premiere === undefined) throw new Error("plan vide");

    expect(() => parModeDuRun(OUTILS, [], [...plan, premiere])).toThrow(PlanIncoherent);
  });

  it("run complet : la part sur le plan est exactement celle d'avant, sur les réponses enregistrées", () => {
    const jeu = [...reponses(7, 3), ...reponses(19, 1, "outil-alpha", "web_activee"), ...reponses(4, 1, "outil-beta")];
    const plan = planCouvrant(jeu);
    const couples = [ALPHA_DESACTIVEE, { outil_id: "outil-alpha", mode: "web_activee" }, { outil_id: "outil-beta", mode: "web_desactivee" }] as const;

    for (const couple of couples) {
      expect(partReponsesManquantesDuPlan(jeu, plan, couple)).toEqual(partReponsesManquantes(jeu, couple));
    }
    expect(requetesSansReponse(jeu, plan)).toEqual([]);
  });

  it("requetesSansReponse : les requêtes du plan sans réponse enregistrée, dans l'ordre du plan", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 4);

    expect(requetesSansReponse(enregistrer(plan, 1, 1), plan)).toEqual(plan.slice(2));
  });

  it("une réponse hors contexte run ou du canal application ne couvre aucune requête du plan", () => {
    const plan = requetesPlanifiees("outil-alpha", "web_desactivee", 5);
    const [premiere] = plan;
    if (premiere === undefined) throw new Error("plan vide");
    const contrefactuelle = { ...reponseDe(premiere, "obtenue"), id: ulid("cf-plan"), contexte: "contrefactuel_candidat" as const };
    const jeu = [...enregistrer(plan.slice(1), 4, 0), contrefactuelle];

    expect(partReponsesManquantesDuPlan(jeu, plan, ALPHA_DESACTIVEE)).toEqual({ numerateur: 1, denominateur: 5, valeur: 0.2 });
    expect(requetesSansReponse(jeu, plan)).toEqual([premiere]);
  });
});

describe("couples outil × mode déclarés : une seule définition (Lot 10 (a), PR #178)", () => {
  it("un couple par mode déclaré d'un assistant inclus, dans l'ordre du périmètre ; rien pour l'exclu ni le comparateur", () => {
    const outils = [
      outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] }),
      outil({ outil_id: "outil-exclu", inclus: false, modes: ["web_activee"] }),
      outil({ outil_id: "comparateur-un", famille: "comparateur", mode_de_tete: undefined }),
      outil({ outil_id: "outil-beta", modes: ["web_desactivee"] }),
    ];

    expect(couplesDeclares(outils)).toEqual([
      { outil_id: "outil-alpha", mode: "web_activee" },
      { outil_id: "outil-alpha", mode: "web_desactivee" },
      { outil_id: "outil-beta", mode: "web_desactivee" },
    ]);
  });

  it("un assistant inclus sans modes : refus nommé, jamais une liste vide par défaut", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: undefined })];

    expect(() => couplesDeclares(outils)).toThrow(AssistantInclusSansModes);
    expect(() => couplesDeclares(outils)).toThrow(/outil-alpha/);
    expect(() => parModeDuRun(outils, reponses(4, 1), planCouvrant(reponses(4, 1)))).toThrow(AssistantInclusSansModes);
  });

  it("couplesDuRun : un couple présent dans les réponses API mais non déclaré lève CoupleHorsPerimetre", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_desactivee"] })];
    const jeu = [...reponses(4, 1, "outil-alpha", "web_desactivee"), ...reponses(2, 0, "outil-alpha", "web_activee")];

    expect(() => couplesDuRun(outils, jeu)).toThrow(CoupleHorsPerimetre);
    expect(() => couplesDuRun(outils, jeu)).toThrow(/outil-alpha\/web_activee/);
    expect(() => parModeDuRun(outils, jeu, planCouvrant(jeu))).toThrow(CoupleHorsPerimetre);
  });

  it("couplesDuRun : les couples déclarés, même sans réponse (le seuil en décidera), quand rien n'est hors périmètre", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] })];

    expect(couplesDuRun(outils, reponses(4, 1, "outil-alpha", "web_desactivee"))).toEqual([
      { outil_id: "outil-alpha", mode: "web_activee" },
      { outil_id: "outil-alpha", mode: "web_desactivee" },
    ]);
  });

  it("couplesDuRun : une réponse du canal application ou hors contexte run n'est jamais un couple hors périmètre", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_desactivee"] })];
    const jeu = [
      ...reponses(4, 1, "outil-alpha", "web_desactivee"),
      ...reponses(3, 0, "outil-beta", "web_activee", "application"),
      reponse({ id: ulid("cf-beta"), outil_id: "outil-beta", mode: "web_activee", contexte: "contrefactuel_candidat" }),
    ];

    expect(couplesDuRun(outils, jeu)).toEqual([{ outil_id: "outil-alpha", mode: "web_desactivee" }]);
  });
});

describe("répartition des unités par candidat (conformité n° 30)", () => {
  const partage = { compares: ["candidat-a", "candidat-b"], rapportes_a_part: ["candidat-c"] };

  it("garde les unités des candidats comparés et rapporte à part ceux sous le seuil, sans les effacer", () => {
    const jeu = [
      unite({ reponse_id: ulid("u-a"), candidat_id: "candidat-a" }),
      unite({ reponse_id: ulid("u-c"), candidat_id: "candidat-c" }),
      unite({ reponse_id: ulid("u-b"), candidat_id: "candidat-b" }),
    ];

    const repartition = repartirParCandidat(jeu, partage);

    expect(repartition.comparees.map((u) => u.candidat_id)).toEqual(["candidat-a", "candidat-b"]);
    expect(repartition.candidats_a_part).toEqual(["candidat-c"]);
  });

  it("laisse de côté les questions d'attribution, qui ne nomment aucun candidat", () => {
    const jeu = [unite({ candidat_id: null, gabarit: "Q-ATT" }), unite({ candidat_id: "candidat-a" })];

    const repartition = repartirParCandidat(jeu, partage);

    expect(repartition.comparees.map((u) => u.candidat_id)).toEqual(["candidat-a"]);
    expect(repartition.candidats_a_part).toEqual([]);
  });

  it("refuse un candidat présent dans les unités mais absent du partage", () => {
    const jeu = [unite({ candidat_id: "candidat-a" }), unite({ candidat_id: "candidat-inconnu" })];

    expect(() => repartirParCandidat(jeu, partage)).toThrow(/candidat-inconnu/);
  });
});
