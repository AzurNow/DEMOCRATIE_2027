/**
 * D21 (2026-10-08), point 3 : un avis « soutient » d'un juge sur un lien que le test HTTP dit
 * `inaccessible` ou `non_testable` n'est conservé que si le lien porte sa copie archivée
 * (`archive_url` ET `sha256_contenu`) ; sinon la notation porte `non_applicable` pour ce lien. C'est
 * la combinaison que `schema/notation.schema.json` refuse (conformité 2026-09-29, n° 29), comme D19
 * l'a fait pour mort × soutient. Cas limites 10 et 11 du brief D21 ; les cas D19 restent dans
 * `juge-lien-mort.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { VERDICTS_SOUTIEN, type VerdictSoutien } from "../../analysis/types.ts";
import { notationDeJuge, soutienApresTestHttp, type IdentiteJuge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import type { ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";
import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { CADRE_V3, ITEM_REF, REPONSE_ID, REPONSE_PROJETEE, RUN_ID } from "./fabriques.ts";

const DATE_TEST = "2026-12-04T09:00:00+01:00";
const SHA = "c".repeat(64);
const ARCHIVE = "https://web.archive.org/web/20261201000000/https://x.invalid/";

type Copie = "avec_copie" | "sans_archive_url" | "sans_empreinte" | "sans_copie";

function existence(url: string, verdict: "inaccessible" | "non_testable", copie: Copie): ExistenceEtablie {
  return {
    url_citee: url,
    date_test: DATE_TEST,
    verdict_existence: verdict,
    code_http: null,
    ...(copie === "avec_copie" || copie === "sans_empreinte" ? { archive_url: ARCHIVE } : {}),
    ...(copie === "avec_copie" || copie === "sans_archive_url" ? { sha256_contenu: SHA } : {}),
  };
}

const MORT: ExistenceEtablie = { url_citee: "https://mort.invalid/", date_test: DATE_TEST, verdict_existence: "mort", code_http: 404 };
const EXISTANT: ExistenceEtablie = { url_citee: "https://existant.invalid/", date_test: DATE_TEST, verdict_existence: "existe", code_http: 200, sha256_contenu: SHA };

function identite(): IdentiteJuge {
  return { juge_id: "j1", famille_modele: "famille-j1", modele: "famille-j1/modele", prompt: { chemin: "simule://juge-test", version: "1.0.0" } };
}

function sortie(soutiens: readonly (readonly [string, VerdictSoutien])[]): SortieJuge {
  return {
    categorie: "exacte",
    drapeaux: [],
    sourcage: { cite: soutiens.length > 0, soutiens: soutiens.map(([url_citee, verdict_soutien]) => ({ url_citee, verdict_soutien })) },
  };
}

/** La notation qu'assemble la chaîne pour ce juge, validée au schéma comme l'écriture la validerait (cas 11). */
function noter(existences: readonly ExistenceEtablie[], soutien: VerdictSoutien): NotationIndividuelle {
  const notation = notationDeJuge(identite(), sortie(existences.map((e) => [e.url_citee, soutien] as const)), {
    id: ulid("notation-copie-archivee"),
    run_id: RUN_ID,
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: REPONSE_ID,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    date: "2026-12-04T10:00:00+01:00",
    liens: existences.map((e) => e.url_citee),
    existences: new Map(existences.map((e) => [e.url_citee, e])),
    textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
    ...CADRE_V3,
  });
  valider("notation", notation, "notation de juge, copie archivée (D21)");
  return notation;
}

function soutienNote(e: ExistenceEtablie, soutien: VerdictSoutien): VerdictSoutien | undefined {
  return noter([e], soutien).sourcage.liens[0]?.verdict_soutien;
}

describe("10. D21 : juge « soutient » sur un lien inaccessible ou non testable", () => {
  for (const verdict of ["inaccessible", "non_testable"] as const) {
    it(`${verdict} sans copie archivée : non_applicable`, () => {
      expect(soutienApresTestHttp("soutient", existence("https://a.invalid/", verdict, "sans_copie"))).toBe("non_applicable");
      expect(soutienNote(existence("https://a.invalid/", verdict, "sans_copie"), "soutient")).toBe("non_applicable");
    });

    it(`${verdict} avec archive_url mais sans sha256_contenu : non_applicable`, () => {
      expect(soutienNote(existence("https://a.invalid/", verdict, "sans_empreinte"), "soutient")).toBe("non_applicable");
    });

    it(`${verdict} avec sha256_contenu mais sans archive_url : non_applicable`, () => {
      expect(soutienNote(existence("https://a.invalid/", verdict, "sans_archive_url"), "soutient")).toBe("non_applicable");
    });

    it(`${verdict} avec archive_url et sha256_contenu : soutient conservé`, () => {
      expect(soutienApresTestHttp("soutient", existence("https://a.invalid/", verdict, "avec_copie"))).toBe("soutient");
      expect(soutienNote(existence("https://a.invalid/", verdict, "avec_copie"), "soutient")).toBe("soutient");
    });

    it(`${verdict} sans copie, tout autre avis que « soutient » : inchangé`, () => {
      for (const soutien of VERDICTS_SOUTIEN.filter((s) => s !== "soutient")) {
        expect(soutienNote(existence("https://a.invalid/", verdict, "sans_copie"), soutien), soutien).toBe(soutien);
      }
    });
  }

  it("« ne_soutient_pas » sur inaccessible sans copie : inchangé", () => {
    expect(soutienNote(existence("https://a.invalid/", "inaccessible", "sans_copie"), "ne_soutient_pas")).toBe("ne_soutient_pas");
  });

  it("mort (D19) : « soutient » toujours non_applicable, même avec une copie ; les autres avis inchangés", () => {
    expect(soutienNote(MORT, "soutient")).toBe("non_applicable");
    expect(soutienApresTestHttp("soutient", { ...MORT, archive_url: ARCHIVE, sha256_contenu: SHA })).toBe("non_applicable");
    expect(soutienNote(MORT, "ne_soutient_pas")).toBe("ne_soutient_pas");
  });

  it("existe : « soutient » inchangé", () => {
    expect(soutienNote(EXISTANT, "soutient")).toBe("soutient");
  });
});

describe("11. D21 : la notation assemblée est valide contre notation.schema.json", () => {
  it("une réponse à liens mêlés, tous notés « soutient » par le juge : écrite, conforme, seuls les liens sans copie forcés", () => {
    const liens = [
      EXISTANT,
      MORT,
      existence("https://i1.invalid/", "inaccessible", "sans_copie"),
      existence("https://i2.invalid/", "inaccessible", "avec_copie"),
      existence("https://n1.invalid/", "non_testable", "sans_empreinte"),
      existence("https://n2.invalid/", "non_testable", "avec_copie"),
    ];
    const notation = noter(liens, "soutient");
    expect(notation.sourcage.liens.map((l) => [l.url_citee, l.verdict_soutien])).toEqual([
      [EXISTANT.url_citee, "soutient"],
      [MORT.url_citee, "non_applicable"],
      ["https://i1.invalid/", "non_applicable"],
      ["https://i2.invalid/", "soutient"],
      ["https://n1.invalid/", "non_applicable"],
      ["https://n2.invalid/", "soutient"],
    ]);
  });

  it("sans le forçage, le schéma refuserait chacun des liens forcés : la règle couvre exactement ce que le schéma refuse", () => {
    const fragment = "#/properties/sourcage/properties/liens/items";
    for (const verdict of ["inaccessible", "non_testable"] as const) {
      for (const copie of ["avec_copie", "sans_archive_url", "sans_empreinte", "sans_copie"] as const) {
        for (const soutien of VERDICTS_SOUTIEN) {
          const e = existence("https://x.invalid/", verdict, copie);
          const brut = (): void => validerFragment("notation", fragment, { ...e, verdict_soutien: soutien }, `${verdict} × ${copie} × ${soutien}`);
          const force = (): void => validerFragment("notation", fragment, { ...e, verdict_soutien: soutienApresTestHttp(soutien, e) }, `forcé ${verdict} × ${copie} × ${soutien}`);
          expect(force, `forcé ${verdict} × ${copie} × ${soutien}`).not.toThrow();
          if (soutienApresTestHttp(soutien, e) === soutien) expect(brut, `${verdict} × ${copie} × ${soutien}`).not.toThrow();
          else expect(brut, `${verdict} × ${copie} × ${soutien}`).toThrow(/non conforme/);
        }
      }
    }
  });
});
