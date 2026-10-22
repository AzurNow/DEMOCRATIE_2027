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
  candidatsComparables,
  cleCouple,
  couplesComparables,
  parModeDuRun,
  partReponsesManquantes,
  repartirParCandidat,
  runIncomplet,
  SEUIL_RUN_INCOMPLET,
} from "../../analysis/seuils.ts";
import type { Canal, Mode } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { candidat, outil, reponse, run, ulid, unite } from "./fabriques.ts";

const ALPHA_DESACTIVEE = { outil_id: "outil-alpha", mode: "web_desactivee" } as const;

/**
 * `obtenues` réponses obtenues et `manquantes` réponses manquantes d'un couple. Le canal
 * application n'a pas de mode (§6) : le champ est alors retiré, comme le schéma l'exige.
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
    liste.push(reponse({ id: ulid(`${prefixe}-ok-${i}`), outil_id, mode: modeEcrit, canal }));
  }
  for (let i = 0; i < manquantes; i += 1) {
    liste.push(
      reponse({
        id: ulid(`${prefixe}-manq-${i}`),
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
    expect(couplesComparables(reponses(4, 1))).toEqual({ compares: [ALPHA_DESACTIVEE], incomplets: [] });
    expect(couplesComparables(reponses(8, 2))).toEqual({ compares: [ALPHA_DESACTIVEE], incomplets: [] });
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

    const partage = couplesComparables(jeu);

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
    expect(couplesComparables(jeu)).toEqual({ compares: [ALPHA_DESACTIVEE], incomplets: [] });
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

    const partage = couplesComparables(jeu);

    expect(partage.compares).toEqual([ALPHA_DESACTIVEE]);
    expect(partage.incomplets).toEqual([{ outil_id: "outil-beta", mode: "web_desactivee" }]);
  });

  it("refuse une réponse API sans mode plutôt que de la ranger dans un mode supposé", () => {
    // §6 : le mode est obligatoire sur le canal API. Absent, le couple n'est pas décidable.
    const sansMode = [reponse({ id: ulid("api-sans-mode"), mode: undefined })];

    expect(() => couplesComparables(sansMode)).toThrow(/mode/);
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

    const resultat = parModeDuRun(outils, jeu);

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

    expect(parModeDuRun(outils, jeu).get("outil-alpha")).toEqual({
      web_desactivee: { reponses_manquantes_part: 0.2, run_incomplet: false },
    });
  });

  it("un mode déclaré sans aucune réponse API lève, en nommant le couple, le seuil n'y étant pas décidable", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] })];
    const jeu = reponses(4, 1, "outil-alpha", "web_desactivee");

    // outil-alpha/web_desactivee a des réponses ; outil-alpha/web_activee, le couple sans
    // aucune réponse API, doit être nommé dans le message (format de `cleCouple`), pas seulement
    // le message générique de `runIncomplet`.
    expect(() => parModeDuRun(outils, jeu)).toThrow(/outil-alpha\/web_activee.*décidable/);
  });

  it("une réponse API d'un couple non déclaré par un assistant inclus lève", () => {
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_desactivee"] })];
    const jeu = [...reponses(4, 1, "outil-alpha", "web_desactivee"), ...reponses(2, 0, "outil-alpha", "web_activee")];

    expect(() => parModeDuRun(outils, jeu)).toThrow(/outil-alpha\/web_activee/);
  });

  it("une réponse API d'un outil exclu ou comparateur lève aussi, aucun n'ayant de couple déclaré", () => {
    const outils = [outil({ outil_id: "outil-alpha", inclus: false, modes: ["web_desactivee"] })];
    const jeu = reponses(4, 0, "outil-alpha", "web_desactivee");

    expect(() => parModeDuRun(outils, jeu)).toThrow(/hors périmètre/);
  });

  it("son résultat, inséré dans un run publié de fixture, valide contre run.schema.json", () => {
    const jeu = [...reponses(9, 1, "outil-alpha", "web_activee"), ...reponses(19, 1, "outil-alpha", "web_desactivee")];
    const outils = [outil({ outil_id: "outil-alpha", modes: ["web_activee", "web_desactivee"] })];
    const resultat = parModeDuRun(outils, jeu);

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
