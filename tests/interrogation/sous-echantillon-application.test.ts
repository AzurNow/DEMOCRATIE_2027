/**
 * Sous-échantillon de l'application (§6, QR8 ; D59 (12), protocole 0.24) : « un sous-échantillon
 * stratifié des questions du run, cinq par candidat interrogé (60 pour 12 candidats), toutes ses
 * questions tirées pour un candidat interrogé qui en a moins de cinq […]. Les cinq questions d'un candidat
 * sont réparties entre ses gabarits en tourniquet, gabarits et questions pris dans l'ordre trié de
 * leurs codes et identifiants ; chacune est saisie dans sa formulation neutre, en un seul
 * échantillon, numéroté 1. Chacun des deux testeurs saisit tout le sous-échantillon. »
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FormulationNeutreIntrouvable,
  QUESTIONS_PAR_CANDIDAT,
  questionsDuSousEchantillonDuRun,
  sousEchantillonApplication,
  type EntreesSousEchantillon,
} from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";

const RUN_ID = "01JDQ7XK2M8N3P4R5S6T7V8W9X";

function q(cle: string): string {
  return `q_${createHash("sha256").update(cle, "utf8").digest("hex").slice(0, 32)}`;
}

function formulationId(question_id: string, registre: string): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const octets = createHash("sha256").update(`${question_id}-${registre}`, "utf8").digest();
  return Array.from({ length: 26 }, (_, i) => alphabet[(octets[i] as number) % 32]).join("");
}

type Gabarit = EntreesSousEchantillon["entrees"][number]["gabarit"];

/** Les entrées de tirage et les questions d'un candidat : `n` questions par gabarit. */
function jeu(candidat_id: string | undefined, parGabarit: Readonly<Partial<Record<Gabarit, number>>>) {
  const entrees: EntreesSousEchantillon["entrees"][number][] = [];
  const questions: EntreesSousEchantillon["questions"][number][] = [];
  for (const [gabarit, n] of Object.entries(parGabarit) as [Gabarit, number][]) {
    for (let i = 0; i < n; i += 1) {
      const id = q(`${candidat_id ?? "attribution"}-${gabarit}-${i}`);
      entrees.push(candidat_id === undefined ? { question_id: id, gabarit } : { question_id: id, candidat_id, gabarit });
      questions.push({
        id,
        formulations: (["neutre", "familier", "oriente"] as const).map((registre) => ({ id: formulationId(id, registre), registre })),
      });
    }
  }
  return { entrees, questions };
}

function entrees(
  candidats: readonly { candidat_id: string; interroge: boolean }[],
  jeux: readonly ReturnType<typeof jeu>[],
): EntreesSousEchantillon {
  return {
    run_id: RUN_ID,
    candidats,
    entrees: jeux.flatMap((j) => j.entrees),
    questions: jeux.flatMap((j) => j.questions),
  };
}

function trier(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

describe("tourniquet des gabarits", () => {
  it("prend cinq questions par candidat interrogé, une par gabarit à tour de rôle, gabarits par code trié", () => {
    const j = jeu("cand-a", { "Q-NEG": 2, "Q-DIR": 2, "Q-FER": 2, "Q-ORI": 2, "Q-ACT": 2 });

    const resultat = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [j]));

    const [candidat] = resultat.candidats;
    expect(QUESTIONS_PAR_CANDIDAT).toBe(5);
    expect(candidat?.questions.map((x) => x.gabarit)).toEqual(["Q-ACT", "Q-DIR", "Q-FER", "Q-NEG", "Q-ORI"]);
    expect(candidat?.questions.map((x) => x.rang)).toEqual([1, 2, 3, 4, 5]);
  });

  it("dans un gabarit, prend les questions dans l'ordre trié de leurs identifiants", () => {
    const j = jeu("cand-a", { "Q-DIR": 5 });

    const [candidat] = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [j])).candidats;

    expect(candidat?.questions.map((x) => x.question_id)).toEqual(trier(j.entrees.map((e) => e.question_id)));
  });

  it("moins de cinq gabarits : le tourniquet repart du premier gabarit, et saute un gabarit épuisé", () => {
    // Trois gabarits : Q-DIR (3 questions), Q-FER (1), Q-NEG (2). Tour 1 : DIR, FER, NEG ;
    // tour 2 : DIR, FER épuisé et sauté, NEG. Cinq questions atteintes.
    const j = jeu("cand-a", { "Q-DIR": 3, "Q-FER": 1, "Q-NEG": 2 });

    const [candidat] = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [j])).candidats;

    const dir = trier(j.entrees.filter((e) => e.gabarit === "Q-DIR").map((e) => e.question_id));
    const neg = trier(j.entrees.filter((e) => e.gabarit === "Q-NEG").map((e) => e.question_id));
    const fer = j.entrees.filter((e) => e.gabarit === "Q-FER").map((e) => e.question_id);
    expect(candidat?.questions.map((x) => x.question_id)).toEqual([dir[0], fer[0], neg[0], dir[1], neg[1]]);
  });

  it("un seul gabarit : les cinq questions en viennent toutes", () => {
    const j = jeu("cand-a", { "Q-FER": 7 });

    const [candidat] = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [j])).candidats;

    expect(candidat?.questions.map((x) => x.gabarit)).toEqual(Array(5).fill("Q-FER"));
  });

  it.each([0, 1, 4])(
    "%i question(s) tirée(s) pour un candidat interrogé : toutes ses questions, dans l'ordre du tourniquet, aucune inventée (§6, 0.27)",
    (n) => {
      const pleine = jeu("cand-a", { "Q-DIR": 5 });
      // Réparties sur deux gabarits pour que l'ordre du tourniquet se voie dès deux questions.
      const courte = jeu("cand-b", { "Q-DIR": Math.ceil(n / 2), "Q-FER": Math.floor(n / 2) });
      const candidats = [{ candidat_id: "cand-a", interroge: true }, { candidat_id: "cand-b", interroge: true }];

      const resultat = sousEchantillonApplication(entrees(candidats, [pleine, courte]));

      const b = resultat.candidats.find((c) => c.candidat_id === "cand-b");
      const dir = trier(courte.entrees.filter((e) => e.gabarit === "Q-DIR").map((e) => e.question_id));
      const fer = trier(courte.entrees.filter((e) => e.gabarit === "Q-FER").map((e) => e.question_id));
      const attendu = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? dir[i / 2] : fer[(i - 1) / 2]));
      expect(b?.questions.map((x) => x.question_id)).toEqual(attendu);
      expect(b?.questions.map((x) => x.rang)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(resultat.candidats.find((c) => c.candidat_id === "cand-a")?.questions).toHaveLength(5);
    },
  );

  it("zéro question tirée : le candidat interrogé reste visible, avec un sous-échantillon vide", () => {
    const pleine = jeu("cand-a", { "Q-DIR": 5 });
    const candidats = [{ candidat_id: "cand-a", interroge: true }, { candidat_id: "cand-b", interroge: true }];

    const resultat = sousEchantillonApplication(entrees(candidats, [pleine]));

    expect(resultat.candidats.map((c) => c.candidat_id)).toEqual(["cand-a", "cand-b"]);
    expect(resultat.candidats[1]?.questions).toEqual([]);
  });

  it.each([5, 6])("%i questions tirées : exactement cinq, le choix du tourniquet est inchangé", (n) => {
    const j = jeu("cand-a", { "Q-DIR": Math.ceil(n / 2), "Q-FER": Math.floor(n / 2) });

    const [candidat] = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [j])).candidats;

    const dir = trier(j.entrees.filter((e) => e.gabarit === "Q-DIR").map((e) => e.question_id));
    const fer = trier(j.entrees.filter((e) => e.gabarit === "Q-FER").map((e) => e.question_id));
    expect(candidat?.questions.map((x) => x.question_id)).toEqual([dir[0], fer[0], dir[1], fer[1], dir[2]]);
  });
});

describe("candidats et questions retenus", () => {
  it("un candidat non interrogé n'a pas de sous-échantillon, même s'il porte des questions", () => {
    const a = jeu("cand-a", { "Q-DIR": 5 });
    const b = jeu("cand-b", { "Q-DIR": 5 });

    const resultat = sousEchantillonApplication(
      entrees([{ candidat_id: "cand-a", interroge: true }, { candidat_id: "cand-b", interroge: false }], [a, b]),
    );

    expect(resultat.candidats.map((c) => c.candidat_id)).toEqual(["cand-a"]);
  });

  it("les questions d'attribution, qui ne nomment aucun candidat, n'entrent pas au sous-échantillon", () => {
    const a = jeu("cand-a", { "Q-DIR": 5 });
    const attribution = jeu(undefined, { "Q-ATT": 4 });

    const resultat = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [a, attribution]));

    const retenues = resultat.candidats.flatMap((c) => c.questions.map((x) => x.gabarit));
    expect(retenues).not.toContain("Q-ATT");
  });

  it("chaque question est saisie dans sa formulation neutre, échantillon 1, par les deux testeurs", () => {
    const j = jeu("cand-a", { "Q-DIR": 5 });

    const resultat = sousEchantillonApplication(entrees([{ candidat_id: "cand-a", interroge: true }], [j]));

    expect(resultat).toMatchObject({ run_id: RUN_ID, registre: "neutre", echantillon: 1, testeurs: 2, questions_par_candidat: 5 });
    for (const choisie of resultat.candidats[0]?.questions ?? []) {
      expect(choisie.formulation_id).toBe(formulationId(choisie.question_id, "neutre"));
    }
  });

  it("une question tirée sans formulation neutre lève : aucune autre formulation n'est prise à sa place", () => {
    const j = jeu("cand-a", { "Q-DIR": 5 });
    const questions = j.questions.map((question) => ({
      ...question,
      formulations: question.formulations.filter((f) => f.registre !== "neutre"),
    }));

    expect(() =>
      sousEchantillonApplication({ ...entrees([{ candidat_id: "cand-a", interroge: true }], [j]), questions }),
    ).toThrow(FormulationNeutreIntrouvable);
  });

  it("valide sa sortie contre son schéma : un run_id qui n'est pas un ULID est refusé", () => {
    const j = jeu("cand-a", { "Q-DIR": 5 });

    expect(() =>
      sousEchantillonApplication({ ...entrees([{ candidat_id: "cand-a", interroge: true }], [j]), run_id: "pas-un-ulid" }),
    ).toThrow(ErreurSchema);
  });
});

describe("déterminisme et symétrie (§5)", () => {
  it("mêmes entrées, même sous-échantillon ; l'ordre des fichiers n'y change rien", () => {
    const a = jeu("cand-a", { "Q-DIR": 3, "Q-FER": 3, "Q-NEG": 2 });
    const b = jeu("cand-b", { "Q-ORI": 4, "Q-DIR": 1 });
    const candidats = [{ candidat_id: "cand-a", interroge: true }, { candidat_id: "cand-b", interroge: true }];
    const direct = entrees(candidats, [a, b]);
    const inverse: EntreesSousEchantillon = {
      run_id: RUN_ID,
      candidats: [...candidats].reverse(),
      entrees: [...direct.entrees].reverse(),
      questions: [...direct.questions].reverse(),
    };

    expect(sousEchantillonApplication(inverse)).toEqual(sousEchantillonApplication(direct));
    expect(sousEchantillonApplication(direct)).toEqual(sousEchantillonApplication(direct));
  });

  it("le tirage ne dépend d'aucun attribut du candidat : deux candidats aux mêmes files reçoivent le même motif", () => {
    // Les mêmes gabarits et les mêmes effectifs ; seuls l'identifiant et les attributs du candidat
    // (sous le seuil, statut, libellé) diffèrent. Le motif des gabarits retenus est identique.
    const a = jeu("cand-a", { "Q-DIR": 2, "Q-FER": 2, "Q-NEG": 2 });
    const b = jeu("cand-b", { "Q-DIR": 2, "Q-FER": 2, "Q-NEG": 2 });
    const candidats = [
      { candidat_id: "cand-a", interroge: true, sous_seuil: false, statut_au_gel: "actif", libelle: "A" },
      { candidat_id: "cand-b", interroge: true, sous_seuil: true, statut_au_gel: "nouveau", libelle: "B" },
    ];

    const resultat = sousEchantillonApplication(entrees(candidats, [a, b]));

    const motif = (i: number) => resultat.candidats[i]?.questions.map((x) => [x.rang, x.gabarit]);
    expect(motif(0)).toEqual(motif(1));
  });
});

describe("questionsDuSousEchantillonDuRun : l'entrée injectée dans pnpm analyze (écart API / application)", () => {
  it("rend les questions du sous-échantillon calculé sur les fichiers gelés, candidats triés puis ordre du tourniquet", () => {
    const a = jeu("cand-a", { "Q-DIR": 3, "Q-FER": 3 });
    const b = jeu("cand-b", { "Q-DIR": 5 });
    const candidats = [
      { candidat_id: "cand-b", interroge: true },
      { candidat_id: "cand-a", interroge: true },
    ];
    const attendu = sousEchantillonApplication(entrees(candidats, [a, b])).candidats.flatMap((c) => c.questions.map((x) => x.question_id));

    const lues = questionsDuSousEchantillonDuRun({
      run: { id: RUN_ID, perimetre: { candidats } },
      entrees_tirage: [...a.entrees, ...b.entrees],
      questions: [...a.questions, ...b.questions],
    });

    expect(lues).toEqual(attendu);
    expect(lues).toHaveLength(2 * QUESTIONS_PAR_CANDIDAT);
  });
});
