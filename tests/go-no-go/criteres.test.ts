/**
 * Les critères du §12 autres que le kappa : test contrefactuel, item contesté au tirage, symétrie,
 * réponses manquantes, erreurs graves, analyses exécutées avec la graine publiée.
 */

import { describe, expect, it } from "vitest";
import { graineHexadecimale } from "../../analysis/graines.ts";
import { AssistantInclusSansModes, CoupleHorsPerimetre, CoupleSansRequetePlanifiee, parModeDuRun, ReponseHorsPlan } from "../../analysis/seuils.ts";
import { critereTestContrefactuel } from "../../pipeline/go-no-go/criteres-juges.ts";
import {
  critereAnalysesExecutees,
  critereAucunItemConteste,
  critereErreursGravesRevues,
  critereReponsesManquantes,
  critereTestsSymetrie,
  METRIQUES_ABSENTES,
  type OutilDeclare,
} from "../../pipeline/go-no-go/criteres-run.ts";
import { AUCUN_JUGE_RETENU } from "../../pipeline/go-no-go/types.ts";
import type { JugeDuRun, VerdictProduit } from "../../pipeline/notation/types.ts";
import type { ConditionSymetrie, Symetrie } from "../../pipeline/questions/types.ts";
import { planCouvrant, reponseDe, requetesPlanifiees, ulid } from "../analysis/fabriques.ts";
import { inexacte, notationHumaine, notationJuge } from "../notation/fabriques.ts";
import { reponsesApi } from "./aides.ts";

function juge(juge_id: string, numerateur: number | null, retire = false): JugeDuRun {
  if (numerateur === null) return { juge_id, retire };
  return { juge_id, retire, taux_changement_contrefactuel: numerateur / 200, changements_contrefactuel: { numerateur, denominateur: 200 } };
}

describe("test contrefactuel ≤ 3 % pour chaque juge retenu", () => {
  it("exactement 3 % (6/200) : vert", () => {
    expect(critereTestContrefactuel([juge("j1", 6), juge("j2", 2)])).toEqual({ code: "test_contrefactuel", statut: "vert", valeur: 0.03, seuil: 0.03 });
  });

  it("7/200 : rouge, valeur le plus grand taux", () => {
    expect(critereTestContrefactuel([juge("j1", 2), juge("j2", 7)])).toEqual({ code: "test_contrefactuel", statut: "rouge", valeur: 0.035, seuil: 0.03 });
  });

  it("effectifs absents pour un juge retenu : rouge, le juge nommé", () => {
    const critere = critereTestContrefactuel([juge("j1", 2), juge("j2", null)]);
    expect(critere.statut).toBe("rouge");
    expect(critere.valeur).toBe("effectifs du test contrefactuel absents : j2");
  });

  it("un juge retiré n'entre pas dans le critère", () => {
    expect(critereTestContrefactuel([juge("j1", 2), juge("j2", 9, true)]).statut).toBe("vert");
  });

  it("tous les juges retirés : rouge", () => {
    expect(critereTestContrefactuel([juge("j1", 9, true), juge("j2", 9, true)])).toEqual({
      code: "test_contrefactuel",
      statut: "rouge",
      valeur: AUCUN_JUGE_RETENU,
      seuil: 0.03,
    });
  });
});

function symetrie(statut_global: Symetrie["statut_global"], contestee: ConditionSymetrie["statut"] | null): Symetrie {
  const conditions: ConditionSymetrie[] = [{ code: "nombre_questions_par_candidat", statut: "vert" }];
  if (contestee !== null) conditions.push({ code: "aucun_item_conteste_ou_en_attente", statut: contestee, commentaire: "Item X dans la question Y : statut de contestation « contestee »." });
  return { statut_global, conditions };
}

describe("aucun item contesté dans le tirage (condition de symétrie déjà calculée au gel)", () => {
  it("un item contesté au tirage : rouge", () => {
    expect(critereAucunItemConteste(symetrie("rouge", "rouge"))).toEqual({ code: "aucun_item_conteste_dans_le_tirage", statut: "rouge", valeur: "rouge", seuil: "vert" });
  });

  it("aucun item contesté : vert", () => {
    expect(critereAucunItemConteste(symetrie("vert", "vert")).statut).toBe("vert");
  });

  it("condition absente de run.json : rouge, jamais supposée verte", () => {
    expect(critereAucunItemConteste(symetrie("vert", null)).statut).toBe("rouge");
  });
});

describe("tests de symétrie restés verts", () => {
  it("vert : vert", () => {
    expect(critereTestsSymetrie({ statut_global: "vert" })).toEqual({ code: "tests_symetrie", statut: "vert", valeur: "vert", seuil: "vert" });
  });

  it("écart toléré (§5, répartition imposée par les items) : vert, la valeur le dit", () => {
    expect(critereTestsSymetrie({ statut_global: "ecart_tolere" })).toEqual({ code: "tests_symetrie", statut: "vert", valeur: "ecart_tolere", seuil: "vert" });
  });

  it("rouge : rouge", () => {
    expect(critereTestsSymetrie({ statut_global: "rouge" }).statut).toBe("rouge");
  });
});

const OUTIL: OutilDeclare = { outil_id: "outil-a", famille: "assistant", inclus: true, modes: ["web_desactivee", "web_activee"] };

describe("au plus 20 % de réponses manquantes par outil et par mode (analysis/seuils.ts)", () => {
  it("exactement 20 % sur un seul couple : vert", () => {
    const reponses = [...reponsesApi("outil-a", "web_desactivee", 2, 10), ...reponsesApi("outil-a", "web_activee", 0, 10)];
    expect(critereReponsesManquantes([OUTIL], reponses, planCouvrant(reponses))).toEqual({ code: "reponses_manquantes", statut: "vert", valeur: 0.2, seuil: 0.2 });
  });

  it("juste au-dessus de 20 % sur un seul couple (3/14) : rouge", () => {
    const reponses = [...reponsesApi("outil-a", "web_desactivee", 3, 14), ...reponsesApi("outil-a", "web_activee", 0, 10)];
    const critere = critereReponsesManquantes([OUTIL], reponses, planCouvrant(reponses));
    expect(critere.statut).toBe("rouge");
    expect(critere.valeur).toBe(3 / 14);
  });

  it("un couple déclaré sans aucune réponse API : erreur visible, pas un vert", () => {
    const reponses = reponsesApi("outil-a", "web_desactivee", 0, 10);
    expect(() => critereReponsesManquantes([OUTIL], reponses, planCouvrant(reponses))).toThrow(/sans aucune réponse API/);
  });

  it("aucun couple à juger : rouge", () => {
    expect(critereReponsesManquantes([], [], planCouvrant([])).statut).toBe("rouge");
  });

  it("un couple présent dans les réponses API mais non déclaré : la même erreur nommée que parModeDuRun (Lot 10 (a))", () => {
    const reponses = [
      ...reponsesApi("outil-a", "web_desactivee", 0, 10),
      ...reponsesApi("outil-a", "web_activee", 0, 10),
      ...reponsesApi("outil-b", "web_activee", 0, 10),
    ];
    expect(() => critereReponsesManquantes([OUTIL], reponses, planCouvrant(reponses))).toThrow(CoupleHorsPerimetre);
    expect(() => critereReponsesManquantes([OUTIL], reponses, planCouvrant(reponses))).toThrow(/outil-b\/web_activee/);
    expect(() => parModeDuRun([OUTIL], reponses, planCouvrant(reponses))).toThrow(CoupleHorsPerimetre);
  });

  it("un assistant inclus sans modes : refus nommé, pas une liste vide de couples (Lot 10 (a))", () => {
    const sansModes: OutilDeclare = { outil_id: "outil-a", famille: "assistant", inclus: true };
    const reponses = reponsesApi("outil-a", "web_desactivee", 0, 10);
    expect(() => critereReponsesManquantes([sansModes], reponses, planCouvrant(reponses))).toThrow(AssistantInclusSansModes);
  });
});

describe("réponses manquantes comptées sur le plan d'interrogation (§12 « comptées comme en section 8 », protocole 0.21)", () => {
  const SEUL: OutilDeclare = { outil_id: "outil-a", famille: "assistant", inclus: true, modes: ["web_desactivee"] };

  it("100 requêtes planifiées, 75 réponses enregistrées sans manquante écrite : 25 %, rouge (avant : 0 %, vert)", () => {
    const plan = requetesPlanifiees("outil-a", "web_desactivee", 100);
    const reponses = plan.slice(0, 75).map((r) => reponseDe(r, "obtenue"));
    expect(critereReponsesManquantes([SEUL], reponses, plan)).toEqual({ code: "reponses_manquantes", statut: "rouge", valeur: 0.25, seuil: 0.2 });
  });

  it("100 requêtes planifiées, 80 réponses enregistrées : exactement 20 %, vert", () => {
    const plan = requetesPlanifiees("outil-a", "web_desactivee", 100);
    const reponses = plan.slice(0, 80).map((r) => reponseDe(r, "obtenue"));
    expect(critereReponsesManquantes([SEUL], reponses, plan)).toEqual({ code: "reponses_manquantes", statut: "vert", valeur: 0.2, seuil: 0.2 });
  });

  it("zéro requête planifiée pour un couple déclaré : refus nommé", () => {
    const plan = requetesPlanifiees("outil-a", "web_desactivee", 10);
    const reponses = plan.map((r) => reponseDe(r, "obtenue"));
    expect(() => critereReponsesManquantes([OUTIL], reponses, plan)).toThrow(CoupleSansRequetePlanifiee);
  });

  it("une réponse enregistrée hors plan : refus nommé", () => {
    const plan = requetesPlanifiees("outil-a", "web_desactivee", 10);
    const [premiere] = reponsesApi("outil-a", "web_desactivee", 0, 1);
    if (premiere === undefined) throw new Error("aucune réponse fabriquée");
    expect(() => critereReponsesManquantes([SEUL], [premiere], plan)).toThrow(ReponseHorsPlan);
  });
});

function verdict(objet: string, surcharges: Partial<VerdictProduit> = {}): VerdictProduit {
  return {
    id: ulid(`verdict-${objet}`),
    run_id: ulid("run-notation"),
    contexte: "run",
    objet_note: { type: "reponse", id: objet },
    categorie_retenue: "exacte",
    drapeaux_retenus: [],
    sourcage_retenu: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false },
    notations_sources: [],
    mode_resolution: "accord_juges",
    desaccord_juges: false,
    dans_echantillon_humain: false,
    erreur_grave: false,
    date: "2026-12-04T10:00:00+01:00",
    ...surcharges,
  };
}

describe("toutes les erreurs graves revues par un humain", () => {
  const R1 = ulid("r1");
  const R2 = ulid("r2");
  const JUGES: readonly JugeDuRun[] = [
    { juge_id: "j1", retire: false },
    { juge_id: "j2", retire: true },
  ];

  it("aucune erreur grave : vert", () => {
    const entree = { juges: JUGES, reponses_obtenues: [R1], notations: [notationJuge("j1", { objet_note: { type: "reponse", id: R1 } })], verdicts: [verdict(R1)] };
    expect(critereErreursGravesRevues(entree)).toEqual({ code: "erreurs_graves_revues", statut: "vert", valeur: 0, seuil: 0 });
  });

  it("une erreur grave retenue sans revue humaine : rouge", () => {
    const entree = { juges: JUGES, reponses_obtenues: [R1], notations: [], verdicts: [verdict(R1, { erreur_grave: true })] };
    expect(critereErreursGravesRevues(entree)).toMatchObject({ statut: "rouge", valeur: 1 });
  });

  it("une erreur grave revue : vert", () => {
    const revue = { effectuee: true, date: "2026-12-05T09:30:00+01:00", annotateurs: ["annotateur-1"] };
    const entree = { juges: JUGES, reponses_obtenues: [R1], notations: [], verdicts: [verdict(R1, { erreur_grave: true, mode_resolution: "revue_erreur_grave", revue_humaine: revue })] };
    expect(critereErreursGravesRevues(entree).statut).toBe("vert");
  });

  it("un drapeau grave d'un juge retenu sur une réponse encore sans verdict : rouge (en attente de revue)", () => {
    const grave = notationJuge("j1", { objet_note: { type: "reponse", id: R2 }, ...inexacte(["fabrication"]) });
    const entree = { juges: JUGES, reponses_obtenues: [R1, R2], notations: [grave], verdicts: [verdict(R1)] };
    expect(critereErreursGravesRevues(entree)).toMatchObject({ statut: "rouge", valeur: 1 });
  });

  it("le drapeau grave d'un juge retiré n'est pas une erreur grave (D13)", () => {
    const grave = notationJuge("j2", { objet_note: { type: "reponse", id: R2 }, ...inexacte(["mauvaise_attribution"]) });
    const entree = { juges: JUGES, reponses_obtenues: [R1, R2], notations: [grave], verdicts: [verdict(R1)] };
    expect(critereErreursGravesRevues(entree).statut).toBe("vert");
  });

  it("un humain qui pose un drapeau grave sur une réponse sans verdict : rouge", () => {
    const grave = notationHumaine("annotateur-1", "echantillon_aleatoire_10", { objet_note: { type: "reponse", id: R2 }, ...inexacte(["fabrication"]) });
    expect(critereErreursGravesRevues({ juges: JUGES, reponses_obtenues: [R2], notations: [grave], verdicts: [] }).statut).toBe("rouge");
  });
});

describe("analyses préenregistrées exécutées avec la graine publiée", () => {
  const GRAINES = { bootstrap: 20261201, permutation: 20261202 };
  const CLE = ["bootstrap", "outil-alpha", "web_desactivee", "exactitude", "global"];

  it("métriques absentes : rouge, la valeur le dit", () => {
    expect(critereAnalysesExecutees(null, GRAINES)).toEqual({ code: "analyses_preenregistrees_executees", statut: "rouge", valeur: METRIQUES_ABSENTES, seuil: "graine publiée" });
  });

  it("aucun résultat : rouge", () => {
    expect(critereAnalysesExecutees([], GRAINES).statut).toBe("rouge");
  });

  it("chaque graine dérivée de la graine publiée et de sa clé : vert (vecteur du §8)", () => {
    expect(graineHexadecimale(20261201, CLE)).toBe("d8bcfbd164a58f33");
    const permutation = ["permutation", "outil-alpha", "web_desactivee"];
    const resultats = [
      { cle: CLE, graine: "d8bcfbd164a58f33" },
      { cle: permutation, graine: graineHexadecimale(20261202, permutation) },
    ];
    expect(critereAnalysesExecutees(resultats, GRAINES).statut).toBe("vert");
  });

  it("une graine différente de la graine publiée : rouge", () => {
    const resultats = [{ cle: CLE, graine: graineHexadecimale(20261203, CLE) }];
    expect(critereAnalysesExecutees(resultats, GRAINES)).toMatchObject({ statut: "rouge", valeur: "1 résultat(s) sans la graine publiée" });
  });

  it("une famille inconnue : rouge", () => {
    expect(critereAnalysesExecutees([{ cle: ["autre", "x"], graine: "0000000000000000" }], GRAINES).statut).toBe("rouge");
  });
});
