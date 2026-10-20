/**
 * Réponse contrefactuelle et charge permutée (§7 ; D15 (5), D16 (1)). Cas limites 7 à 10 du brief
 * de la PR B du lot notation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construireCharge, VERSION_CHARGE_JUGE, type DemandeCharge } from "../../pipeline/notation/charge-juge.ts";
import type { Derangement } from "../../pipeline/notation/derangement.ts";
import { controlerExtrait } from "../../pipeline/notation/extrait.ts";
import { demandePermutee, reponseContrefactuelle } from "../../pipeline/notation/reponse-contrefactuelle.ts";
import type { CandidatDuRun } from "../../pipeline/notation/types.ts";
import type { ReponseManquante, ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { itemA, itemO, itemP } from "../aides/fabriques.ts";
import { ulid } from "../analysis/fabriques.ts";
import { ALIAS_CANDIDATS_TEST, aliasDeTest, CANDIDATS_DU_RUN, notationJuge, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const NOUVEL_ID = ulid("reponse-contrefactuelle");

function candidat(id: string): CandidatDuRun {
  const trouve = CANDIDATS_DU_RUN.find((c) => c.candidat_id === id);
  if (trouve === undefined) throw new Error(`candidat de test inconnu : ${id}`);
  return trouve;
}

/** alpha → beta → gamma → alpha. */
const CYCLE: Derangement = {
  paires: [
    { source: candidat("demo-alpha"), image: candidat("demo-beta") },
    { source: candidat("demo-beta"), image: candidat("demo-gamma") },
    { source: candidat("demo-gamma"), image: candidat("demo-alpha") },
  ],
};

const TEXTE = "Alix Martinez propose de ramener la TVA à 5,5 %, LE BRUN s'y oppose.";

function reponse(surcharges: Partial<ReponseObtenue["normalise"]> = {}): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>(
    "reponse",
    {
      ...lue,
      normalise: {
        ...lue.normalise,
        texte: TEXTE,
        liens: ["https://exemple.invalid/Martinez"],
        citations: [{ url: "https://exemple.invalid/Martinez", texte: "Martinez l'a annoncé", type: "url_citation" }],
        ...surcharges,
      },
    },
    "réponse de test",
  );
}

/** Les formes exactes de alpha, seul candidat nommé par la demande d'origine. */
const FORMES_ALPHA = ["Alix Martinez", "Martinez"];

function demande(r: ReponseObtenue = reponse()): DemandeCharge {
  return {
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "neutre", texte: "Quelle est la position d’Alix Martinez sur la TVA ?" },
    references: [
      {
        item: itemP({
          candidat_id: "demo-alpha",
          assertion: {
            ...(itemP().assertion as NonNullable<ReturnType<typeof itemP>["assertion"]>),
            paraphrase: "Martinez veut ramener la TVA sur l'énergie à 5,5 %.",
            citation_verbatim: "Moi, Alix Martinez, je ramènerai la TVA sur l'énergie à 5,5 %.",
          },
        }),
        role: "principal",
      },
      { item: itemA({ candidat_id: "demo-alpha" }), role: "distracteur" },
    ],
    date_run: "2026-12-01T06:00:00+01:00",
    prompt: { chemin: "prompts/judge-primaire.md", version: "1.0.0" },
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(r.normalise.liens),
    alias_candidats: ALIAS_CANDIDATS_TEST,
  };
}

describe("réponse contrefactuelle", () => {
  it("brut, empreintes et requête identiques octet pour octet à l'origine", () => {
    const origine = reponse();
    const { reponse: permutee } = reponseContrefactuelle(origine, NOUVEL_ID, CYCLE);
    expect(JSON.stringify(permutee.brut)).toBe(JSON.stringify(origine.brut));
    expect(permutee.brut_sha256).toBe(origine.brut_sha256);
    expect(permutee.brut_octets_sha256).toBe(origine.brut_octets_sha256);
    expect(JSON.stringify(permutee.requete)).toBe(JSON.stringify(origine.requete));
    expect(JSON.stringify(permutee.metadonnees)).toBe(JSON.stringify(origine.metadonnees));
    expect(permutee.normalisation).toEqual(origine.normalisation);
  });

  it("un brut texte (corps non JSON) est recopié tel quel", () => {
    const { brut: _b, brut_sha256: _s, ...sansBrut } = reponse();
    const origine = valider<ReponseObtenue>("reponse", { ...sansBrut, brut_texte: "Martinez\u0000 brut texte" }, "brut texte");
    const { reponse: permutee } = reponseContrefactuelle(origine, NOUVEL_ID, CYCLE);
    expect(permutee.brut_texte).toBe("Martinez\u0000 brut texte");
    expect("brut" in permutee).toBe(false);
  });

  it("valide reponse.schema.json : contexte, dérivation et permutation déclarés", () => {
    const origine = reponse();
    const { reponse: permutee } = reponseContrefactuelle(origine, NOUVEL_ID, CYCLE);
    valider("reponse", permutee, "réponse contrefactuelle");
    expect(permutee.id).toBe(NOUVEL_ID);
    expect(permutee.contexte).toBe("contrefactuel_candidat");
    expect(permutee.derive_de_reponse_id).toBe(origine.id);
    expect(permutee.permutation).toEqual({
      type: "noms_candidats",
      correspondances: { "demo-alpha": "demo-beta", "demo-beta": "demo-gamma", "demo-gamma": "demo-alpha" },
    });
  });

  it("seule la projection est permutée : texte et texte des citations, pas les liens", () => {
    const origine = reponse();
    const { reponse: permutee, mentions_residuelles } = reponseContrefactuelle(origine, NOUVEL_ID, CYCLE);
    expect(permutee.normalise.texte).toBe("Maxime Le Brun propose de ramener la TVA à 5,5 %, LE BRUN s'y oppose.");
    expect(permutee.normalise.liens).toEqual(["https://exemple.invalid/Martinez"]);
    expect(permutee.normalise.citations).toEqual([
      { url: "https://exemple.invalid/Martinez", texte: "Le Brun l'a annoncé", type: "url_citation" },
    ]);
    expect(mentions_residuelles).toBe(1);
    // L'origine n'est pas touchée.
    expect(origine.normalise.texte).toBe(TEXTE);
  });

  it("une citation dont texte n'est pas une chaîne, ou sans texte, est laissée telle quelle", () => {
    const citations = [{ url: "https://exemple.invalid/a", texte: 12 }, { url: "https://exemple.invalid/b" }, { texte: null }, {}];
    const { reponse: permutee } = reponseContrefactuelle(reponse({ citations }), NOUVEL_ID, CYCLE);
    expect(permutee.normalise.citations).toEqual(citations);
  });

  it("une réponse sans citations n'en reçoit pas", () => {
    const { citations: _c, ...sansCitations } = reponse().normalise;
    const origine = { ...reponse(), normalise: sansCitations };
    expect("citations" in reponseContrefactuelle(origine, NOUVEL_ID, CYCLE).reponse.normalise).toBe(false);
  });

  it("un refus de l'API n'est pas permutable", () => {
    const refus = reponse({ texte: "", liens: [], citations: [], troncature: false, refus_api: true });
    expect(() => reponseContrefactuelle(refus, NOUVEL_ID, CYCLE)).toThrow(/refus de l'API/);
  });

  it("une réponse manquante n'est pas permutable", () => {
    const origine = reponse();
    const manquante: ReponseManquante = {
      id: origine.id,
      run_id: origine.run_id,
      contexte: "run",
      canal: "api",
      alias_aveugle: origine.alias_aveugle,
      outil_id: origine.outil_id,
      mode: origine.mode,
      question_id: origine.question_id,
      formulation_id: origine.formulation_id,
      echantillon: 1,
      requete: origine.requete,
      statut_reponse: "manquante",
      motif_manquante: "hors_fenetre",
      tentatives: [],
    };
    valider("reponse", manquante, "réponse manquante");
    expect(() => reponseContrefactuelle(manquante, NOUVEL_ID, CYCLE)).toThrow(/manquante/);
  });

  it("une réponse déjà contrefactuelle n'est pas permutée une seconde fois", () => {
    const { reponse: permutee } = reponseContrefactuelle(reponse(), NOUVEL_ID, CYCLE);
    expect(() => reponseContrefactuelle(permutee, ulid("autre"), CYCLE)).toThrow(/contrefactuel_candidat/);
  });
});

describe("charge permutée", () => {
  it("candidat_id de chaque item remplacé par son image ; question et textes des items permutés", () => {
    const { demande: permutee } = demandePermutee(demande(), NOUVEL_ID, CYCLE);
    const charge = construireCharge(permutee);
    expect(charge.references.map((r) => r.candidat_id)).toEqual([aliasDeTest("demo-beta"), aliasDeTest("demo-beta")]);
    expect(charge.question.texte).toBe("Quelle est la position d’Maxime Le Brun sur la TVA ?");
    expect(charge.references[0]?.assertion?.paraphrase).toBe("Le Brun veut ramener la TVA sur l'énergie à 5,5 %.");
    expect(charge.references[0]?.assertion?.citation_verbatim).toBe("Moi, Maxime Le Brun, je ramènerai la TVA sur l'énergie à 5,5 %.");
    expect(charge.references[0]?.assertion?.position).toBe("pour");
    expect(charge.reponse.texte).toBe("Maxime Le Brun propose de ramener la TVA à 5,5 %, LE BRUN s'y oppose.");
  });

  it("aucun nom d'origine ne reste en forme exacte dans la charge", () => {
    const serialisee = JSON.stringify(construireCharge(demandePermutee(demande(), NOUVEL_ID, CYCLE).demande));
    const origine = JSON.stringify(construireCharge(demande()));
    for (const forme of FORMES_ALPHA) {
      expect(origine).toContain(forme);
      // Seule exception admise : l'URL d'un lien, jamais permutée (question tranchée).
      expect(serialisee.replaceAll("https://exemple.invalid/Martinez", "")).not.toContain(forme);
    }
  });

  it("version_charge inchangée ; la charge ne dit pas qu'elle est permutée", () => {
    const origine = reponse();
    const charge = construireCharge(demandePermutee(demande(origine), NOUVEL_ID, CYCLE).demande);
    expect(charge.version_charge).toBe(VERSION_CHARGE_JUGE);
    expect(charge.reponse_id).toBe(NOUVEL_ID);
    const serialisee = JSON.stringify(charge);
    expect(serialisee).not.toContain(origine.id);
    expect(serialisee).not.toContain("permutation");
    expect(serialisee).not.toContain("derive_de");
    expect(serialisee).not.toContain("contrefactuel");
  });

  it("quantification et identité de l'item recopiées sans changement", () => {
    const origine = demande();
    const charge = construireCharge(demandePermutee(origine, NOUVEL_ID, CYCLE).demande);
    const chargeOrigine = construireCharge(origine);
    expect(charge.references[0]?.assertion?.quantification).toEqual(chargeOrigine.references[0]?.assertion?.quantification);
    expect(charge.references.map((r) => [r.item_id, r.item_version, r.item_empreinte])).toEqual(
      chargeOrigine.references.map((r) => [r.item_id, r.item_version, r.item_empreinte]),
    );
  });

  it("un item O : ses deux états sont permutés", () => {
    const o = itemO({ candidat_id: "demo-gamma" });
    const avant = o.obsolescence;
    if (avant === undefined) throw new Error("item O sans obsolescence");
    const item = {
      ...o,
      obsolescence: {
        ...avant,
        etat_anterieur: { ...avant.etat_anterieur, citation_verbatim: "Ollivier : la retraite à 60 ans." },
        etat_posterieur: { ...avant.etat_posterieur, paraphrase: "Camille Ollivier passe à 62 ans." },
      },
    };
    const sortie = demandePermutee({ ...demande(), references: [{ item, role: "principal" }] }, NOUVEL_ID, CYCLE);
    const charge = construireCharge(sortie.demande);
    expect(charge.references[0]?.candidat_id).toBe(aliasDeTest("demo-alpha"));
    expect(charge.references[0]?.obsolescence?.etat_anterieur.citation_verbatim).toBe("Martinez : la retraite à 60 ans.");
    expect(charge.references[0]?.obsolescence?.etat_posterieur.paraphrase).toBe("Alix Martinez passe à 62 ans.");
    expect(sortie.textes.citations_reference).toEqual(["Martinez : la retraite à 60 ans.", avant.etat_posterieur.citation_verbatim]);
  });

  it("D55 (4) : un item dont le candidat n'est pas au dérangement (non interrogé) garde son identifiant inchangé", () => {
    const etranger = { ...demande(), references: [{ item: itemP({ candidat_id: "inconnu" }), role: "principal" as const }] };
    const sortie = demandePermutee(etranger, NOUVEL_ID, CYCLE);
    expect(sortie.demande.references[0]?.item.candidat_id).toBe("inconnu");
  });

  it("D27 (G) : la liste attendue d'une Q-ATT suit les items, triée ; prémisse et registre recopiés", () => {
    const reponse_attendue = { nature: "liste_candidats" as const, candidats_attendus: ["demo-alpha", "demo-gamma"], resolution_temporelle: RESOLU_POSITION_POUR.reponse_attendue.resolution_temporelle };
    const base = { ...demande(), question: { ...demande().question, registre: "oriente" as const }, resolu_au_gel: { reponse_attendue, premisse_fausse: true } };
    const permutee = demandePermutee(base, NOUVEL_ID, CYCLE).demande;
    // alpha → beta, gamma → alpha (CYCLE)
    expect(permutee.resolu_au_gel.reponse_attendue.candidats_attendus).toEqual(["demo-alpha", "demo-beta"]);
    expect(permutee.resolu_au_gel.premisse_fausse).toBe(true);
    expect(permutee.question.registre).toBe("oriente");
  });

  it("D27 (G) : une réponse attendue sans liste de candidats est recopiée telle quelle", () => {
    expect(demandePermutee(demande(), NOUVEL_ID, CYCLE).demande.resolu_au_gel).toEqual(RESOLU_POSITION_POUR);
  });

  it("D27 (E) : le texte des pages citées n'est pas permuté (§7 ne permute que réponse et item ; trou signalé)", () => {
    const page = { url_citee: "https://exemple.invalid/Martinez", texte_disponible: true as const, origine: "page_conservee" as const, texte: "Alix Martinez propose la mesure.", texte_sha256: "e".repeat(64), tronque: false, longueur_totale: 32 };
    const permutee = demandePermutee({ ...demande(), pages_citees: [page] }, NOUVEL_ID, CYCLE).demande;
    expect(permutee.pages_citees).toEqual([page]);
  });

  it("les mentions résiduelles comptent la réponse, la question et les items", () => {
    const base = demande();
    const question = { gabarit: base.question.gabarit, registre: base.question.registre, texte: "Et MARTINEZ ?" };
    expect(demandePermutee(base, NOUVEL_ID, CYCLE).mentions_residuelles).toBe(1);
    expect(demandePermutee({ ...base, question }, NOUVEL_ID, CYCLE).mentions_residuelles).toBe(2);
  });
});

describe("extrait de la notation permutée", () => {
  const sortie = demandePermutee(demande(), NOUVEL_ID, CYCLE);
  const inexacte = (texte: string) =>
    notationJuge("j1", {
      categorie: "inexacte",
      motif_inexactitude: "position_inventee",
      extrait_justificatif: { provenance: "reponse", texte, verifie_deterministe: true },
    });

  it("un extrait trouvé dans le texte permuté est valide", () => {
    expect(controlerExtrait(inexacte("Maxime Le Brun propose"), sortie.textes)).toEqual({ valide: true, trouve_dans: "reponse" });
    expect(controlerExtrait(inexacte("Moi, Maxime Le Brun, je ramènerai"), sortie.textes)).toEqual({ valide: true, trouve_dans: "reference" });
  });

  it("un extrait qui cite le nom d'origine, absent du texte permuté, est invalide", () => {
    expect(controlerExtrait(inexacte("Alix Martinez propose"), sortie.textes)).toEqual({ valide: false, motif: "introuvable" });
  });
});
