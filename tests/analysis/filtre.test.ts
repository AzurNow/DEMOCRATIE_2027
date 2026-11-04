/**
 * Le filtre du §8 : seul `contexte == "run"` entre dans une métrique.
 *
 * C'est « la seule barrière » entre les réponses permutées du test contrefactuel (§7) et un
 * chiffre publié (schema/README.md). Les tests portent donc sur ce qui NE passe pas.
 */

import { describe, expect, it } from "vitest";
import {
  assembler,
  estDuRun,
  filtrerContexteRun,
  IdentifiantEnDouble,
  ReponsesNonNotees,
  SourcageIncoherent,
  VerdictEnDouble,
} from "../../analysis/filtre.ts";
import { confirmationPremisse, exactitude, sourcageValide, tauxNonReponse } from "../../analysis/metriques.ts";
import { partReponsesManquantesDuPlan } from "../../analysis/seuils.ts";
import { entreeTirage, idQuestion, item, planCouvrant, question, reponse, run, ulid, verdict } from "./fabriques.ts";

/** Jeu commun : une question, un item P, et ce que l'appelant veut y mettre. */
function entrees(reponses: ReturnType<typeof reponse>[], verdicts: ReturnType<typeof verdict>[]) {
  return {
    run: run(),
    entrees_tirage: [entreeTirage()],
    questions: [question()],
    items: [item()],
    reponses,
    verdicts,
  };
}

describe("filtre de contexte", () => {
  it("ne laisse passer que le contexte run", () => {
    expect(estDuRun({ contexte: "run" })).toBe(true);
    expect(estDuRun({ contexte: "contrefactuel_candidat" })).toBe(false);
    expect(estDuRun({ contexte: "pilote" })).toBe(false);
    expect(estDuRun({ contexte: "jeu_or" })).toBe(false);
    expect(estDuRun({ contexte: "contrefactuel_outil" })).toBe(false);
    expect(filtrerContexteRun([{ contexte: "run" }, { contexte: "jeu_or" }])).toHaveLength(1);
  });

  it("une réponse contrefactuelle n'entre dans aucune métrique, même notée inexacte", () => {
    // Une réponse du run, exacte ; une réponse permutée (§7), inexacte.
    // Exactitude attendue : 1/1 = 1. Si le contrefactuel passait, elle vaudrait 1/2.
    const reponses = [
      reponse({ id: ulid("r-run") }),
      reponse({ id: ulid("r-cf"), contexte: "contrefactuel_candidat" }),
    ];
    const verdicts = [
      verdict({ id: ulid("v-run"), objet_note: { type: "reponse", id: ulid("r-run") } }),
      verdict({
        id: ulid("v-cf"),
        contexte: "contrefactuel_candidat",
        objet_note: { type: "reponse", id: ulid("r-cf") },
        categorie_retenue: "inexacte",
        drapeaux_retenus: ["fabrication"],
      }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites).toHaveLength(1);
    expect(unites[0]?.reponse_id).toBe(ulid("r-run"));
    expect(exactitude(unites)).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
  });

  it("un verdict du run pointant une réponse hors run est une incohérence, pas un silence", () => {
    const reponses = [reponse({ id: ulid("r-cf"), contexte: "contrefactuel_candidat" })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r-cf") } })];

    expect(() => assembler(entrees(reponses, verdicts))).toThrow(/contexte/);
  });

  it("une réponse manquante n'entre ni dans l'exactitude ni dans la non-réponse, mais compte dans la part de manquantes", () => {
    // Deux réponses obtenues (une exacte, une non-réponse) et une manquante, sans verdict.
    // Exactitude : 1/1. Taux de non-réponse : 1/2 (dénominateur = réponses obtenues).
    // Part de manquantes de l'outil : 1/3.
    // Un échantillon chacune : trois requêtes distinctes du plan (§8, protocole 0.21).
    const manquante = reponse({ id: ulid("r-manq"), statut_reponse: "manquante", normalise: undefined, echantillon: 3 });
    const reponses = [
      reponse({ id: ulid("r-ok"), echantillon: 1 }),
      reponse({ id: ulid("r-nr"), echantillon: 2 }),
      manquante,
    ];
    const verdicts = [
      verdict({ id: ulid("v-ok"), objet_note: { type: "reponse", id: ulid("r-ok") } }),
      verdict({
        id: ulid("v-nr"),
        objet_note: { type: "reponse", id: ulid("r-nr") },
        categorie_retenue: "non_reponse",
      }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites).toHaveLength(2);
    expect(exactitude(unites)).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(tauxNonReponse(unites)).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
    // Conformité n° 84, protocole 0.11 : la part se calcule par couple outil × mode (canal API).
    // Les réponses de ce jeu sont toutes du couple outil-alpha / web_desactivee de la fabrique ;
    // depuis le protocole 0.21, la part se compte sur le plan, ici celui d'un run complet.
    expect(partReponsesManquantesDuPlan(reponses, planCouvrant(reponses), { outil_id: "outil-alpha", mode: "web_desactivee" })).toEqual({
      numerateur: 1,
      denominateur: 3,
      valeur: 1 / 3,
    });

    // Une note portée sur une réponse manquante n'est pas une donnée : §6 la compte comme
    // manquante « et jamais comme une erreur ». La contradiction remonte.
    const verdictSurManquante = verdict({ objet_note: { type: "reponse", id: ulid("r-manq") } });
    expect(() => assembler(entrees(reponses, [verdictSurManquante]))).toThrow(/manquante/);
  });

  it("une réponse tronquée est toujours assemblée, marquée tronquée, sans aucun paramètre", () => {
    // §8 0.3 : une réponse tronquée « est notée sur ce qu'elle contient et entre dans les
    // métriques primaires ». Son exclusion n'existe que comme recalcul de robustesse (d), qui lit
    // `tronquee` sur l'unité : le drapeau doit donc y être, fidèle à `normalise.troncature`.
    const reponses = [
      reponse({ id: ulid("r-entiere") }),
      reponse({ id: ulid("r-tronquee"), normalise: { texte: "coupé", liens: [], troncature: true } }),
    ];
    const verdicts = [
      verdict({ id: ulid("v-entiere"), objet_note: { type: "reponse", id: ulid("r-entiere") } }),
      verdict({ id: ulid("v-tronquee"), objet_note: { type: "reponse", id: ulid("r-tronquee") } }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites.map((u) => [u.reponse_id, u.tronquee])).toEqual([
      [ulid("r-entiere"), false],
      [ulid("r-tronquee"), true],
    ]);
    expect(exactitude(unites)).toEqual({ numerateur: 2, denominateur: 2, valeur: 1 });
  });

  it("une réponse de l'application n'a pas de troncature (§6, 0.31) : son unité porte tronquee null, jamais false", () => {
    const reponses = [
      reponse({ id: ulid("r-app"), canal: "application", mode: undefined, normalise: { texte: "copié", liens: [] } }),
    ];
    const verdicts = [verdict({ id: ulid("v-app"), objet_note: { type: "reponse", id: ulid("r-app") } })];

    expect(assembler(entrees(reponses, verdicts)).map((u) => [u.canal, u.tronquee])).toEqual([["application", null]]);
  });

  it("une réponse de l'application qui porte une troncature lève : elle n'en a pas (§6, 0.31)", () => {
    const reponses = [
      reponse({ id: ulid("r-app"), canal: "application", mode: undefined, normalise: { texte: "copié", liens: [], troncature: false } }),
    ];
    const verdicts = [verdict({ id: ulid("v-app"), objet_note: { type: "reponse", id: ulid("r-app") } })];

    expect(() => assembler(entrees(reponses, verdicts))).toThrow(/application avec une troncature/);
  });

  it("une réponse de l'API sans troncature lève : le drapeau ne se devine pas", () => {
    const reponses = [reponse({ id: ulid("r-api"), normalise: { texte: "texte", liens: [] } })];
    const verdicts = [verdict({ id: ulid("v-api"), objet_note: { type: "reponse", id: ulid("r-api") } })];

    expect(() => assembler(entrees(reponses, verdicts))).toThrow(/troncature/);
  });

  it("une réponse, une question, un item ou une entrée de tirage introuvable lève", () => {
    const orphelin = verdict({ objet_note: { type: "reponse", id: ulid("inexistante") } });
    expect(() => assembler(entrees([], [orphelin]))).toThrow(/réponse/);

    const reponses = [reponse({ question_id: idQuestion("autre") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("reponse") } })];
    expect(() => assembler(entrees(reponses, verdicts))).toThrow(/question/);
  });

  it("reporte le thème, le gabarit, le registre et le type d'item principal sur l'unité", () => {
    const reponses = [reponse({ id: ulid("r"), formulation_id: ulid("formulation-orientee") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r") } })];
    const jeu = {
      ...entrees(reponses, verdicts),
      items: [item({ type: "O" })],
      // Protocole 0.11 (constat n° 37) : la prémisse fausse se lit dans le tirage, résolue au gel,
      // et non plus sur la formulation de la question.
      entrees_tirage: [entreeTirage({ theme: "immigration", premisse_fausse: true })],
    };

    const [unite] = assembler(jeu);

    expect(unite?.theme).toBe("immigration");
    expect(unite?.gabarit).toBe("Q-DIR");
    expect(unite?.registre).toBe("oriente");
    expect(unite?.premisse_fausse).toBe(true);
    expect(unite?.type_item_principal).toBe("O");
    expect(unite?.candidat_id).toBe("candidat-a");
    expect(unite?.grappe_id).toBe(ulid("item"));
  });

  it("laisse absent ce qui est absent : thème non tiré, candidat d'une Q-ATT", () => {
    const reponses = [reponse({ id: ulid("r") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r") } })];
    const jeu = {
      ...entrees(reponses, verdicts),
      questions: [question({ gabarit: "Q-ATT", candidat_id: undefined })],
      entrees_tirage: [entreeTirage({ gabarit: "Q-ATT", candidat_id: undefined, theme: undefined })],
    };

    const [unite] = assembler(jeu);

    expect(unite?.theme).toBeNull();
    expect(unite?.candidat_id).toBeNull();
  });
});

/**
 * Constat n° 37, protocole 0.11 (§5) : la prémisse d'une formulation orientée sur un item O se
 * résout au gel. Le dénominateur de la confirmation de prémisse (§8) lit la valeur gelée dans le
 * tirage : la même question, avec les mêmes réponses, n'y entre qu'au run où sa prémisse est fausse.
 */
describe("prémisse fausse lue dans le tirage, au gel (n° 37)", () => {
  function uniteOrientee(premisse_fausse: boolean, drapeaux: ("confirmation_premisse")[] = []) {
    const reponses = [reponse({ id: ulid("r-o"), formulation_id: ulid("formulation-orientee") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r-o") }, categorie_retenue: drapeaux.length === 0 ? "exacte" : "inexacte", drapeaux_retenus: drapeaux })];
    return assembler({
      ...entrees(reponses, verdicts),
      questions: [question({ gabarit: "Q-ORI" })],
      items: [item({ type: "O" })],
      entrees_tirage: [entreeTirage({ gabarit: "Q-ORI", premisse_fausse })],
    });
  }

  it("le dénominateur de la confirmation de prémisse suit la valeur au gel, pas la question", () => {
    // Même question, même item O : avant le changement la prémisse est vraie (hors dénominateur),
    // après elle est fausse (1 au dénominateur).
    expect(confirmationPremisse(uniteOrientee(false))).toEqual({ numerateur: 0, denominateur: 0 });
    expect(confirmationPremisse(uniteOrientee(true))).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
    expect(confirmationPremisse(uniteOrientee(true, ["confirmation_premisse"]))).toEqual({
      numerateur: 1,
      denominateur: 1,
      valeur: 1,
    });
  });

  it("une confirmation posée au run où la prémisse est vraie est une erreur de notation (n° 27)", () => {
    expect(() => confirmationPremisse(uniteOrientee(false, ["confirmation_premisse"]))).toThrow(ulid("r-o"));
  });

  it("n'attache aucune prémisse aux formulations neutre et familière, quel que soit le tirage", () => {
    const reponses = [reponse({ id: ulid("r-n") })];
    const verdicts = [verdict({ objet_note: { type: "reponse", id: ulid("r-n") } })];
    const [unite] = assembler({ ...entrees(reponses, verdicts), entrees_tirage: [entreeTirage({ premisse_fausse: true })] });
    expect(unite?.registre).toBe("neutre");
    expect(unite?.premisse_fausse).toBeNull();
  });
});

describe("une unité par réponse obtenue, un verdict par réponse (constat n° 4)", () => {
  it("lève en listant les réponses obtenues sans verdict, au lieu de les sortir du dénominateur", () => {
    // Deux réponses obtenues, un seul verdict. Avant la correction : taux de non-réponse 1/1
    // au lieu d'une erreur, la réponse non notée ayant disparu du dénominateur « réponses obtenues ».
    const reponses = [reponse({ id: ulid("r-notee") }), reponse({ id: ulid("r-non-notee") })];
    const verdicts = [
      verdict({ id: ulid("v-notee"), objet_note: { type: "reponse", id: ulid("r-notee") }, categorie_retenue: "non_reponse" }),
    ];

    const appel = () => assembler(entrees(reponses, verdicts));

    expect(appel).toThrow(ReponsesNonNotees);
    expect(appel).toThrow(ulid("r-non-notee"));
    try {
      appel();
    } catch (erreur) {
      expect((erreur as ReponsesNonNotees).reponses).toEqual([ulid("r-non-notee")]);
    }
  });

  it("lève sur deux verdicts du run portant sur une même réponse", () => {
    // Avant la correction : deux unités pour une réponse, taux de non-réponse 2/3 au lieu de 1/2.
    const reponses = [reponse({ id: ulid("r1") }), reponse({ id: ulid("r2") })];
    const verdicts = [
      verdict({ id: ulid("v1"), objet_note: { type: "reponse", id: ulid("r1") } }),
      verdict({ id: ulid("v1-bis"), objet_note: { type: "reponse", id: ulid("r1") }, categorie_retenue: "non_reponse" }),
      verdict({ id: ulid("v2"), objet_note: { type: "reponse", id: ulid("r2") }, categorie_retenue: "non_reponse" }),
    ];

    expect(() => assembler(entrees(reponses, verdicts))).toThrow(VerdictEnDouble);
    expect(() => assembler(entrees(reponses, verdicts))).toThrow(ulid("r1"));
  });

  it("un verdict hors run sur une réponse du run ne compte pas comme doublon", () => {
    // Le verdict contrefactuel ne passe pas le filtre : il n'est ni un doublon ni une note.
    const reponses = [reponse({ id: ulid("r1") })];
    const verdicts = [
      verdict({ id: ulid("v1"), objet_note: { type: "reponse", id: ulid("r1") } }),
      verdict({ id: ulid("v1-cf"), contexte: "contrefactuel_candidat", objet_note: { type: "reponse", id: ulid("r1") } }),
    ];

    expect(assembler(entrees(reponses, verdicts))).toHaveLength(1);
  });

  it("une réponse manquante sans verdict reste hors dénominateur, sans erreur", () => {
    const reponses = [
      reponse({ id: ulid("r-ok") }),
      reponse({ id: ulid("r-manq"), statut_reponse: "manquante", normalise: undefined }),
    ];
    const verdicts = [verdict({ id: ulid("v-ok"), objet_note: { type: "reponse", id: ulid("r-ok") } })];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites.map((u) => u.reponse_id)).toEqual([ulid("r-ok")]);
    expect(tauxNonReponse(unites)).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
  });

  it("cas nominal : une unité par réponse obtenue, dans l'ordre des réponses", () => {
    const reponses = [reponse({ id: ulid("r-a") }), reponse({ id: ulid("r-b") })];
    // Verdicts dans l'ordre inverse : l'ordre des unités suit les réponses, pas les verdicts.
    const verdicts = [
      verdict({ id: ulid("v-b"), objet_note: { type: "reponse", id: ulid("r-b") }, categorie_retenue: "non_reponse" }),
      verdict({ id: ulid("v-a"), objet_note: { type: "reponse", id: ulid("r-a") } }),
    ];

    const unites = assembler(entrees(reponses, verdicts));

    expect(unites.map((u) => [u.reponse_id, u.verdict_id])).toEqual([
      [ulid("r-a"), ulid("v-a")],
      [ulid("r-b"), ulid("v-b")],
    ]);
    expect(tauxNonReponse(unites)).toEqual({ numerateur: 1, denominateur: 2, valeur: 0.5 });
  });
});

/*
 * Conformité n° 64 (§7.11) : « un lien mort ou une page qui ne soutient pas l'affirmation est un
 * défaut de sourçage ». `au_moins_un_lien_soutenant` dit qu'un MÊME lien est vivant et soutient ; un
 * verdict qui le déclare sans lien existant, ou qui trouve un lien existant sans citation, se
 * contredit. L'analyse ne lit pas ces verdicts en silence : elle les refuse en les nommant.
 */
describe("sourçage retenu incohérent", () => {
  function avecSourcage(cite: boolean, existant: boolean, soutenant: boolean) {
    const reponses = [reponse({ id: ulid("r-s") })];
    const verdicts = [
      verdict({
        id: ulid("v-s"),
        objet_note: { type: "reponse", id: ulid("r-s") },
        sourcage_retenu: { cite, au_moins_un_lien_existant: existant, au_moins_un_lien_soutenant: soutenant },
      }),
    ];
    return entrees(reponses, verdicts);
  }

  it("refuse un verdict qui conclut au soutien sans lien vivant", () => {
    expect(() => assembler(avecSourcage(true, false, true))).toThrow(SourcageIncoherent);
    expect(() => assembler(avecSourcage(true, false, true))).toThrow(new RegExp(ulid("v-s")));
  });

  it("refuse un verdict qui trouve un lien vivant sans citation", () => {
    expect(() => assembler(avecSourcage(false, true, false))).toThrow(SourcageIncoherent);
  });

  it("un même lien vivant et soutenant : sourçage valide ; vivant mais non soutenant : non valide", () => {
    expect(sourcageValide(assembler(avecSourcage(true, true, true)))).toEqual({ numerateur: 1, denominateur: 1, valeur: 1 });
    expect(sourcageValide(assembler(avecSourcage(true, true, false)))).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
  });
});

/**
 * Revue du 2026-10-12, constat 10 : l'index de l'assemblage gardait la dernière entrée d'un
 * identifiant en double. Deux entrées de tirage d'une même question, aux `premisse_fausse`
 * différentes, faisaient dépendre le dénominateur de la confirmation de prémisse (§8) de l'ordre du
 * fichier, sans aucun signal.
 */
describe("un identifiant en double dans les entrées de l'analyse", () => {
  const unVerdict = () => [verdict({ id: ulid("v1"), objet_note: { type: "reponse", id: ulid("r1") } })];

  it("deux entrées de tirage pour une même question : levée, quel que soit l'ordre", () => {
    const base = entrees([reponse({ id: ulid("r1") })], unVerdict());
    for (const ordre of [
      [entreeTirage({ premisse_fausse: false }), entreeTirage({ premisse_fausse: true })],
      [entreeTirage({ premisse_fausse: true }), entreeTirage({ premisse_fausse: false })],
    ]) {
      const appel = () => assembler({ ...base, entrees_tirage: ordre });
      expect(appel).toThrow(IdentifiantEnDouble);
      expect(appel).toThrow(`entrée de tirage ${idQuestion("question")} présente 2 fois`);
    }
  });

  it("une question en double : levée", () => {
    const base = entrees([reponse({ id: ulid("r1") })], unVerdict());
    expect(() => assembler({ ...base, questions: [question(), question()] })).toThrow(`question ${idQuestion("question")} présente 2 fois`);
  });

  it("un item en double : levée", () => {
    const base = entrees([reponse({ id: ulid("r1") })], unVerdict());
    expect(() => assembler({ ...base, items: [item(), item()] })).toThrow(IdentifiantEnDouble);
  });

  it("une réponse en double : levée", () => {
    const base = entrees([reponse({ id: ulid("r1") }), reponse({ id: ulid("r1") })], unVerdict());
    expect(() => assembler(base)).toThrow(`réponse ${ulid("r1")} présente 2 fois`);
  });

  it("des identifiants distincts passent", () => {
    expect(assembler(entrees([reponse({ id: ulid("r1") })], unVerdict()))).toHaveLength(1);
  });
});
