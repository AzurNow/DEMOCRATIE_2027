/**
 * D19 (2026-10-06) : quand le test HTTP dit un lien mort, la notation d'un juge porte, pour ce
 * lien, le soutien `non_applicable`, quoi que le juge ait répondu (§7 : « Un lien mort ne soutient
 * jamais rien »). Le forçage couvre exactement la combinaison que `schema/notation.schema.json`
 * refuse (mort × soutient), rien de plus : un lien inaccessible ou non testable peut être noté
 * soutenant d'après une copie archivée, il n'est pas forcé. Chaque `describe` numéroté porte un
 * cas limite du brief ; le cas 7 (`pnpm notation:dry` de bout en bout) est dans `chaine.test.ts`.
 * D21 : la règle reçoit l'existence entière ; les liens inaccessibles ou non testables d'ici portent
 * leur copie archivée, le cas sans copie est dans `juge-copie-archivee.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { notationsConcordent } from "../../analysis/note-lue.ts";
import { VERDICTS_EXISTENCE, VERDICTS_SOUTIEN, type VerdictExistence, type VerdictSoutien } from "../../analysis/types.ts";
import { decider } from "../../pipeline/notation/decision.ts";
import { notationDeJuge, soutienApresTestHttp, type IdentiteJuge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import type { ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";
import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { CADRE_V3, ITEM_REF, REPONSE_ID, REPONSE_PROJETEE, RUN_ID, runDeNotation } from "./fabriques.ts";

const MORT = "https://mort.invalid/page";
const EXISTANT = "https://existant.invalid/page";
const INACCESSIBLE = "https://inaccessible.invalid/page";
const NON_TESTABLE = "https://non-testable.invalid/page";
const DATE_TEST = "2026-12-04T09:00:00+01:00";
const SHA = "a".repeat(64);

/** Un lien inaccessible ou non testable noté soutenant exige sa copie archivée (schéma, n° 29). */
const EXISTENCES: ReadonlyMap<string, ExistenceEtablie> = new Map<string, ExistenceEtablie>([
  [MORT, { url_citee: MORT, code_http: 404, date_test: DATE_TEST, verdict_existence: "mort" }],
  [EXISTANT, { url_citee: EXISTANT, code_http: 200, date_test: DATE_TEST, verdict_existence: "existe", sha256_contenu: SHA }],
  [INACCESSIBLE, { url_citee: INACCESSIBLE, code_http: null, date_test: DATE_TEST, verdict_existence: "inaccessible", sha256_contenu: SHA, archive_url: "https://archive.invalid/inaccessible" }],
  [NON_TESTABLE, { url_citee: NON_TESTABLE, date_test: DATE_TEST, verdict_existence: "non_testable", sha256_contenu: SHA, archive_url: "https://archive.invalid/non-testable" }],
]);

function identite(juge_id: string): IdentiteJuge {
  return { juge_id, famille_modele: `famille-${juge_id}`, modele: `famille-${juge_id}/modele`, prompt: { chemin: "simule://juge-test", version: "1.0.0" } };
}

function sortie(soutiens: readonly (readonly [string, VerdictSoutien])[]): SortieJuge {
  return {
    categorie: "exacte",
    drapeaux: [],
    sourcage: { cite: soutiens.length > 0, soutiens: soutiens.map(([url_citee, verdict_soutien]) => ({ url_citee, verdict_soutien })) },
  };
}

/** La notation d'un juge sur la réponse de test, validée au schéma comme l'écriture la validerait. */
function noter(soutiens: readonly (readonly [string, VerdictSoutien])[], juge_id = "j1"): NotationIndividuelle {
  const notation = notationDeJuge(identite(juge_id), sortie(soutiens), {
    id: ulid(`notation-lien-mort-${juge_id}`),
    run_id: RUN_ID,
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: REPONSE_ID,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    date: "2026-12-04T10:00:00+01:00",
    liens: soutiens.map(([url]) => url),
    existences: EXISTENCES,
    textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
    ...CADRE_V3,
  });
  valider("notation", notation, `notation de juge ${juge_id}`);
  return notation;
}

function soutiensDe(notation: NotationIndividuelle): readonly (readonly [string, VerdictSoutien])[] {
  return notation.sourcage.liens.map((l) => [l.url_citee, l.verdict_soutien] as const);
}

const SOUTIENS_ADMIS_SUR_LIEN_MORT = VERDICTS_SOUTIEN.filter((s) => s !== "soutient");

/** D21 : la règle reçoit l'existence entière ; avec sa copie archivée, seul D19 joue. */
function avecCopie(verdict_existence: VerdictExistence): ExistenceEtablie {
  return { url_citee: "https://x.invalid/", date_test: DATE_TEST, verdict_existence, sha256_contenu: SHA, archive_url: "https://archive.invalid/x" };
}

describe("D19, la règle : soutienApresTestHttp", () => {
  it("ne force que mort × soutient, et le force à non_applicable", () => {
    for (const existence of VERDICTS_EXISTENCE) {
      for (const soutien of VERDICTS_SOUTIEN) {
        const attendu: VerdictSoutien = existence === "mort" && soutien === "soutient" ? "non_applicable" : soutien;
        expect(soutienApresTestHttp(soutien, avecCopie(existence)), `${existence} × ${soutien}`).toBe(attendu);
      }
    }
  });

  it("couvre exactement ce que le schéma refuse pour un lien sans copie archivée tenue : mort × soutient, et lui seul parmi les liens morts", () => {
    const lienDe = (existence: VerdictExistence, soutien: VerdictSoutien): Record<string, unknown> => ({
      url_citee: "https://x.invalid/",
      date_test: DATE_TEST,
      verdict_existence: existence,
      verdict_soutien: soutien,
      sha256_contenu: SHA,
      archive_url: "https://archive.invalid/x",
    });
    const fragment = "#/properties/sourcage/properties/liens/items";
    for (const existence of VERDICTS_EXISTENCE) {
      for (const soutien of VERDICTS_SOUTIEN) {
        const brut = (): void => validerFragment("notation", fragment, lienDe(existence, soutien), `${existence} × ${soutien}`);
        const force = (): void => validerFragment("notation", fragment, lienDe(existence, soutienApresTestHttp(soutien, avecCopie(existence))), `forcé ${existence} × ${soutien}`);
        expect(force, `forcé ${existence} × ${soutien}`).not.toThrow();
        if (existence === "mort" && soutien === "soutient") expect(brut).toThrow(/non conforme/);
        else expect(brut, `${existence} × ${soutien}`).not.toThrow();
      }
    }
  });
});

describe("1. lien mort, juge « soutient »", () => {
  it("la notation est écrite, conforme au schéma, avec le soutien non_applicable et le résultat du test HTTP recopié", () => {
    const notation = noter([[MORT, "soutient"]]);
    expect(notation.sourcage).toEqual({
      cite: true,
      liens: [{ url_citee: MORT, code_http: 404, date_test: DATE_TEST, verdict_existence: "mort", verdict_soutien: "non_applicable" }],
    });
  });
});

describe("2. lien mort, juge déjà non_applicable ou toute autre valeur admise", () => {
  it.each(SOUTIENS_ADMIS_SUR_LIEN_MORT)("%s : inchangé", (soutien) => {
    expect(soutiensDe(noter([[MORT, soutien]]))).toEqual([[MORT, soutien]]);
  });
});

describe("3. lien inaccessible ou non testable, juge « soutient »", () => {
  it("inaccessible : non forcé, le soutien est conservé (§7, copie archivée)", () => {
    expect(soutiensDe(noter([[INACCESSIBLE, "soutient"]]))).toEqual([[INACCESSIBLE, "soutient"]]);
  });

  it("non testable : non forcé, le soutien est conservé (§7, copie archivée)", () => {
    expect(soutiensDe(noter([[NON_TESTABLE, "soutient"]]))).toEqual([[NON_TESTABLE, "soutient"]]);
  });
});

describe("4. lien existant, juge « soutient »", () => {
  it("inchangé", () => {
    expect(soutiensDe(noter([[EXISTANT, "soutient"]]))).toEqual([[EXISTANT, "soutient"]]);
  });
});

describe("5. réponse à plusieurs liens, l'un mort", () => {
  it("seul le lien mort est forcé, l'ordre des liens est conservé", () => {
    const notation = noter([
      [EXISTANT, "soutient"],
      [MORT, "soutient"],
      [INACCESSIBLE, "soutient"],
      [NON_TESTABLE, "ne_soutient_pas"],
    ]);
    expect(soutiensDe(notation)).toEqual([
      [EXISTANT, "soutient"],
      [MORT, "non_applicable"],
      [INACCESSIBLE, "soutient"],
      [NON_TESTABLE, "ne_soutient_pas"],
    ]);
    expect(notation.sourcage.liens.map((l) => l.verdict_existence)).toEqual(["existe", "mort", "inaccessible", "non_testable"]);
  });
});

describe("6. deux juges qui ne diffèrent que par le soutien d'un même lien mort", () => {
  it("« soutient » et non_applicable : sourçages identiques après forçage, notations concordantes, accord_juges", () => {
    const a = noter([[EXISTANT, "ne_soutient_pas"], [MORT, "soutient"]], "j1");
    const b = noter([[EXISTANT, "ne_soutient_pas"], [MORT, "non_applicable"]], "j2");
    expect(b.sourcage).toEqual(a.sourcage);
    expect(notationsConcordent(a, b)).toBe(true);
    expect(decisionDe(a, b)).toMatchObject({ statut: "verdict", verdict: { mode_resolution: "accord_juges", desaccord_juges: false } });
  });

  it("« soutient » et ne_soutient_pas : concordantes, le lien mort ne fait de sourçage valide pour aucun des deux", () => {
    const a = noter([[MORT, "soutient"]], "j1");
    const b = noter([[MORT, "ne_soutient_pas"]], "j2");
    expect(notationsConcordent(a, b)).toBe(true);
    const decision = decisionDe(a, b);
    expect(decision).toMatchObject({ statut: "verdict", verdict: { mode_resolution: "accord_juges" } });
    if (decision.statut === "verdict") valider("verdict", decision.verdict, "verdict de deux juges sur un lien mort");
  });
});

function decisionDe(a: NotationIndividuelle, b: NotationIndividuelle): ReturnType<typeof decider> {
  return decider({
    run: runDeNotation(),
    objet_note: { type: "reponse", id: REPONSE_ID },
    notations: [a, b],
    renvois: [],
    dans_echantillon_humain: false,
    textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
    verdict_id: ulid("verdict-lien-mort"),
    date: "2026-12-06T12:00:00+01:00",
  });
}
