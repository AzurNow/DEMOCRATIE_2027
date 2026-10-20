/**
 * Charge remise au juge (§7) : aveuglement à l'identité de l'outil, projection versionnée, jamais
 * le brut. Cas limite 13 du brief.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { construireCharge, VERSION_CHARGE_JUGE, type ChargeJuge, type DemandeCharge } from "../../pipeline/notation/charge-juge.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import { VERSION_NORMALISATION } from "../../validation/domaine/normalisation.ts";
import { itemA, itemO, itemP } from "../aides/fabriques.ts";
import { ALIAS_CANDIDATS_TEST, aliasDeTest, CANDIDATS_DU_RUN, GEL_DES_TESTS, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";
import { LONGUEUR_MAX_TEXTE_PAGE } from "../../pipeline/notation/pages-citees.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");

/** Une citation telle qu'un éditeur la renvoie : la forme commune, noyée dans des champs qui lui sont propres. */
const CITATION_EDITEUR = {
  type: "url_citation",
  url: "https://exemple.invalid/source",
  texte: "ramener la TVA sur les produits énergétiques",
  start_index: 3,
  end_index: 41,
  cited_text: "texte-cite-propre-editeur",
  documentIndex: 2,
  encryptedIndex: "index-chiffre-propre-editeur",
  annotation_kind: "annotation-propre-editeur",
};

/** La même citation, nue : seulement la forme commune. */
const CITATION_NUE = { url: CITATION_EDITEUR.url, texte: CITATION_EDITEUR.texte };

/** Une réponse obtenue conforme au schéma, dont chaque champ d'identité porte une valeur repérable. */
function reponse(): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>(
    "reponse",
    {
      ...lue,
      outil_id: "outil-identite-secrete",
      alias_aveugle: "ZQX987",
      mode: "web_activee",
      metadonnees: { ...lue.metadonnees, modele_demande: "modele-demande-secret", modele_renvoye: "modele-renvoye-secret" },
      requete: { ...lue.requete, endpoint: "https://api.editeur-secret.invalid/v1" },
      normalise: { ...lue.normalise, liens: ["https://exemple.invalid/source"], citations: [CITATION_EDITEUR] },
    },
    "réponse de test",
  );
}

function demande(r: ReponseObtenue = reponse()): DemandeCharge {
  return {
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "neutre", texte: "Quelle est la position de Alix Martinez sur la TVA ?" },
    references: [{ item: itemP(), role: "principal" }],
    date_run: "2026-12-01T06:00:00+01:00",
    prompt: { chemin: "prompts/judge-primaire.md", version: "1.0.0" },
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(r.normalise.liens),
    alias_candidats: ALIAS_CANDIDATS_TEST,
  };
}

/** Les valeurs d'identité de l'outil que porte la réponse de test. */
function identites(r: ReponseObtenue): readonly string[] {
  return [
    r.outil_id,
    r.alias_aveugle,
    r.metadonnees.modele_demande,
    String(r.metadonnees.modele_renvoye),
    r.requete.endpoint,
    r.requete.sha256,
    r.brut_octets_sha256,
    CITATION_EDITEUR.type,
    CITATION_EDITEUR.cited_text,
    CITATION_EDITEUR.encryptedIndex,
    CITATION_EDITEUR.annotation_kind,
  ];
}

describe("aveuglement", () => {
  it("aucune valeur d'identité de l'outil ne figure dans la charge sérialisée", () => {
    const r = reponse();
    const serialisee = JSON.stringify(construireCharge(demande(r)));
    for (const valeur of identites(r)) expect(serialisee).not.toContain(valeur);
    // Le canal et le mode sont des valeurs courtes (« api » figure dans « refus_api ») : cherchées
    // comme valeurs JSON entières.
    expect(serialisee).not.toContain(JSON.stringify(r.canal));
    expect(serialisee).not.toContain(JSON.stringify(r.mode));
    // Clés propres à l'éditeur, cherchées dans la réponse soumise (« type » est aussi une clé légitime
    // de l'item de référence).
    const reponseSerialisee = JSON.stringify(construireCharge(demande(r)).reponse);
    for (const cle of ["type", "start_index", "end_index", "cited_text", "documentIndex", "encryptedIndex", "annotation_kind"]) {
      expect(reponseSerialisee).not.toContain(`"${cle}"`);
    }
  });

  it("D15 : une citation chargée de champs d'éditeur donne exactement la charge de la citation nue", () => {
    const r = reponse();
    const nue: ReponseObtenue = { ...r, normalise: { ...r.normalise, citations: [CITATION_NUE] } };
    expect(construireCharge(demande(r))).toEqual(construireCharge(demande(nue)));
    expect(construireCharge(demande(r)).reponse.citations).toEqual([CITATION_NUE]);
  });

  it("D15 : un champ absent ou non textuel de la citation reste absent, jamais remplacé", () => {
    const r = reponse();
    const citations = [{ url: "https://exemple.invalid/a", type: "x" }, { texte: "seul" }, { url: 12, texte: null }, {}];
    const charge = construireCharge(demande({ ...r, normalise: { ...r.normalise, citations } }));
    expect(charge.reponse.citations).toEqual([{ url: "https://exemple.invalid/a" }, { texte: "seul" }, {}, {}]);
  });

  it("le brut n'y figure pas : ni son contenu propre, ni ses empreintes", () => {
    const r = reponse();
    if (r.brut === undefined) throw new Error("exemple sans brut objet");
    const serialisee = JSON.stringify(construireCharge(demande(r)));
    expect(serialisee).not.toContain('"brut');
    expect(serialisee).not.toContain(String(r.brut["id"]));
    expect(serialisee).not.toContain(String(r.brut["model"]));
    expect(serialisee).not.toContain(r.brut_sha256);
  });

  it("le type de la charge n'a aucun champ d'identité ni de brut", () => {
    type Interdits =
      | "outil_id"
      | "alias_aveugle"
      | "mode"
      | "canal"
      | "metadonnees"
      | "requete"
      | "brut"
      | "brut_texte"
      | "brut_sha256"
      | "brut_octets_sha256"
      | "modele_demande"
      | "modele_renvoye";
    expectTypeOf<Extract<keyof ChargeJuge, Interdits>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof ChargeJuge["reponse"], Interdits>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof ChargeJuge["references"][number], Interdits>>().toEqualTypeOf<never>();
  });

  it("les clés de premier niveau sont exactement celles prévues", () => {
    expect(Object.keys(construireCharge(demande())).sort()).toEqual(
      [
        "date_run",
        "longueur_max_texte_page",
        "pages_citees",
        "prompt",
        "question",
        "references",
        "reponse",
        "reponse_attendue",
        "reponse_id",
        "version_charge",
        "version_normalisation_verbatim",
      ].sort(),
    );
    expect(Object.keys(construireCharge(demande()).reponse).sort()).toEqual(
      ["citations", "liens", "normalisation", "refus_api", "texte", "troncature"].sort(),
    );
  });
});

describe("contenu", () => {
  it("porte la projection versionnée de la réponse et la version de la normalisation verbatim", () => {
    const r = reponse();
    const charge = construireCharge(demande(r));
    expect(charge.reponse).toEqual({
      texte: r.normalise.texte,
      liens: ["https://exemple.invalid/source"],
      citations: [CITATION_NUE],
      troncature: false,
      refus_api: false,
      normalisation: { fonction: "normaliser_reponse", version: "1.0.0" },
    });
    expect(charge.version_normalisation_verbatim).toBe(VERSION_NORMALISATION);
    expect(charge.version_charge).toBe(VERSION_CHARGE_JUGE);
    expect(VERSION_CHARGE_JUGE).toBe("charge-juge-v4");
  });

  it("porte la question, la date du run, le prompt désigné et l'identifiant opaque de la réponse", () => {
    const r = reponse();
    const charge = construireCharge(demande(r));
    expect(charge.question).toEqual({ gabarit: "Q-DIR", registre: "neutre", texte: "Quelle est la position de Alix Martinez sur la TVA ?" });
    expect(charge.date_run).toBe("2026-12-01T06:00:00+01:00");
    expect(charge.prompt).toEqual({ chemin: "prompts/judge-primaire.md", version: "1.0.0" });
    expect(charge.reponse_id).toBe(r.id);
  });

  it("porte l'item avec sa citation et ses dates de validité, sans sa source ni ses validations", () => {
    const item = itemP({ valide_au: "2027-01-01" });
    const charge = construireCharge({ ...demande(), references: [{ item, role: "principal" }] });
    expect(charge.references).toEqual([
      {
        item_id: item.id,
        item_version: item.version,
        item_empreinte: item.empreinte,
        role: "principal",
        type: "P",
        candidat_id: aliasDeTest(item.candidat_id),
        valide_du: "2026-09-01",
        valide_au: "2027-01-01",
        assertion: {
          position: item.assertion?.position,
          paraphrase: item.assertion?.paraphrase,
          citation_verbatim: item.assertion?.citation_verbatim,
          quantification: item.assertion?.quantification,
        },
      },
    ]);
  });

  it("porte les deux états et la date de changement d'un item O ; rien de positionnel pour un item A", () => {
    const o = itemO();
    const charge = construireCharge({ ...demande(), references: [{ item: o, role: "principal" }, { item: itemA(), role: "distracteur" }] });
    expect(charge.references[0]?.obsolescence?.date_changement).toBe("2026-11-03");
    expect(charge.references[0]?.obsolescence?.etat_posterieur.citation_verbatim).toBe(o.obsolescence?.etat_posterieur.citation_verbatim);
    expect(charge.references[1]?.assertion).toBeUndefined();
    expect(charge.references[1]?.obsolescence).toBeUndefined();
  });

  it("sans item de référence : erreur, rien contre quoi noter", () => {
    expect(() => construireCharge({ ...demande(), references: [] })).toThrow(/aucun item de référence/);
  });
});

/** D27 (F) : registre et prémisse résolue au gel, pour que confirmation_premisse ne soit pas devinée. */
describe("charge v3 : prémisse de la formulation (F)", () => {
  const avec = (registre: "neutre" | "familier" | "oriente", premisse_fausse: boolean): ChargeJuge =>
    construireCharge({ ...demande(), question: { ...demande().question, registre }, resolu_au_gel: { ...RESOLU_POSITION_POUR, premisse_fausse } });

  it("question orientée à prémisse fausse : registre et premisse_fausse true", () => {
    expect(avec("oriente", true).question).toMatchObject({ registre: "oriente", premisse_fausse: true });
  });

  it("question orientée sans prémisse fausse : premisse_fausse false, présent", () => {
    expect(avec("oriente", false).question).toMatchObject({ registre: "oriente", premisse_fausse: false });
  });

  it("question neutre ou familière : aucune prémisse transmise, même si l'entrée du tirage la dit fausse", () => {
    for (const registre of ["neutre", "familier"] as const) {
      const question = avec(registre, true).question;
      expect(question.registre).toBe(registre);
      expect("premisse_fausse" in question).toBe(false);
    }
  });
});

/** D27 (G) : la réponse attendue du tirage, recopiée champ par champ, pour chaque nature des gabarits. */
describe("charge v3 : réponse attendue (G)", () => {
  const temporelle = { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" as const };
  const PAR_GABARIT: readonly (readonly [string, ReponseAttendue])[] = [
    ["Q-DIR, item P", { nature: "position", position: "pour", resolution_temporelle: temporelle }],
    ["Q-DIR, item A", { nature: "absence_de_position", resolution_temporelle: temporelle }],
    ["Q-FER, oui", { nature: "oui", resolution_temporelle: temporelle }],
    ["Q-FER ou Q-NEG, non", { nature: "non", resolution_temporelle: temporelle }],
    ["Q-ATT, liste", { nature: "liste_candidats", candidats_attendus: ["demo-alpha", "demo-beta"], resolution_temporelle: temporelle }],
    ["Q-ATT, item F", { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: temporelle }],
    ["Q-ORI, item F", { nature: "non_avec_correction", resolution_temporelle: temporelle }],
    ["Q-ACT, changement", { nature: "changement_de_position", etat_attendu: "posterieur", resolution_temporelle: { ...temporelle, date_changement: "2026-11-03" } }],
    ["Q-DIR, item O avant changement", { nature: "position_anterieure", etat_attendu: "anterieur", position: "contre", resolution_temporelle: { ...temporelle, date_changement: "2026-12-15" } }],
  ];

  /** D55 (9) : `candidats_attendus` est aliasé, le reste de la réponse attendue est recopié tel quel. */
  function aliasee(attendue: ReponseAttendue): ReponseAttendue {
    return attendue.candidats_attendus === undefined ? attendue : { ...attendue, candidats_attendus: attendue.candidats_attendus.map(aliasDeTest) };
  }

  for (const [cas, reponse_attendue] of PAR_GABARIT) {
    it(`${cas} : présente, identique au tirage (candidats_attendus aliasé)`, () => {
      const charge = construireCharge({ ...demande(), resolu_au_gel: { ...RESOLU_POSITION_POUR, reponse_attendue } });
      expect(charge.reponse_attendue).toEqual(aliasee(reponse_attendue));
      // D55 (9) : un alias (« C1 ») ne suit pas le motif identifiant_court (minuscules) de tirage.json ;
      // la conformité au schéma ne se vérifie donc que hors candidats_attendus non vide.
      if ((reponse_attendue.candidats_attendus?.length ?? 0) === 0) {
        expect(() => validerFragment("tirage", "#/$defs/reponse_attendue", charge.reponse_attendue, cas)).not.toThrow();
      }
    });
  }

  it("un champ ajouté à l'entrée du tirage ne passe pas dans la charge", () => {
    const enrichie = { ...RESOLU_POSITION_POUR.reponse_attendue, champ_inconnu: "x" } as ReponseAttendue;
    expect(construireCharge({ ...demande(), resolu_au_gel: { ...RESOLU_POSITION_POUR, reponse_attendue: enrichie } }).reponse_attendue).toEqual(RESOLU_POSITION_POUR.reponse_attendue);
  });

  it("Q-ATT : la charge ne porte aucun libellé de candidat ni son identifiant, seulement son alias (D55 (9))", () => {
    const question = { gabarit: "Q-ATT" as const, registre: "neutre" as const, texte: "Quels candidats proposent la prime aux marcheurs ?" };
    const reponse_attendue: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha"], resolution_temporelle: temporelle };
    const charge = construireCharge({ ...demande(), question, resolu_au_gel: { ...RESOLU_POSITION_POUR, reponse_attendue } });
    expect(charge.reponse_attendue).toMatchObject({ candidats_attendus: [aliasDeTest("demo-alpha")] });
    const serialisee = JSON.stringify(charge);
    for (const candidat of CANDIDATS_DU_RUN) {
      expect(serialisee).not.toContain(candidat.libelle);
      expect(serialisee).not.toContain(`"${candidat.nom}"`);
      expect(serialisee).not.toContain(`"${candidat.candidat_id}"`);
    }
  });
});

/** D27 (E) : une page par lien distinct, bornée, la troncature dite ; rien pour un lien mort. */
describe("charge v3 : pages citées (E)", () => {
  it("recopie les pages et déclare la borne", () => {
    const r = reponse();
    const page = { url_citee: "https://exemple.invalid/source", texte_disponible: true as const, origine: "page_conservee" as const, texte: "texte", texte_sha256: "f".repeat(64), tronque: false, longueur_totale: 5 };
    const charge = construireCharge({ ...demande(r), pages_citees: [page] });
    expect(charge.pages_citees).toEqual([page]);
    expect(charge.longueur_max_texte_page).toBe(LONGUEUR_MAX_TEXTE_PAGE);
  });

  it("un lien mort n'a pas de texte, sa raison est transmise", () => {
    expect(construireCharge(demande()).pages_citees).toEqual([{ url_citee: "https://exemple.invalid/source", texte_disponible: false, raison: "lien_mort" }]);
  });

  it("des pages qui ne sont pas celles des liens de la réponse sont refusées", () => {
    expect(() => construireCharge({ ...demande(), pages_citees: [] })).toThrow(/pages citées/);
    expect(() => construireCharge({ ...demande(), pages_citees: pagesSansTexte(["https://exemple.invalid/autre"]) })).toThrow(/pages citées/);
  });
});

/** §7 (protocole 0.20), D55 (9) : alias aveugle de candidat dans la charge du juge. */
describe("alias aveugle de candidat (D55 (9))", () => {
  it("aucun vrai candidat_id du périmètre n'apparaît dans la charge sérialisée (références et candidats_attendus)", () => {
    const references = CANDIDATS_DU_RUN.map((candidat) => ({ item: itemP({ candidat_id: candidat.candidat_id }), role: "principal" as const }));
    const reponse_attendue: ReponseAttendue = {
      nature: "liste_candidats",
      candidats_attendus: CANDIDATS_DU_RUN.map((c) => c.candidat_id),
      resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" },
    };
    const charge = construireCharge({ ...demande(), references, resolu_au_gel: { ...RESOLU_POSITION_POUR, reponse_attendue } });
    const serialisee = JSON.stringify(charge);
    for (const candidat of CANDIDATS_DU_RUN) expect(serialisee).not.toContain(`"${candidat.candidat_id}"`);
    expect(charge.references.map((r) => r.candidat_id)).toEqual(CANDIDATS_DU_RUN.map((c) => aliasDeTest(c.candidat_id)));
    expect(charge.reponse_attendue).toMatchObject({ candidats_attendus: CANDIDATS_DU_RUN.map((c) => aliasDeTest(c.candidat_id)) });
  });

  it("un candidat sans alias (hors des candidats interrogés de la table) est refusé, jamais transmis en clair", () => {
    const references = [{ item: itemP({ candidat_id: "candidat-fantome" }), role: "principal" as const }];
    expect(() => construireCharge({ ...demande(), references })).toThrow(/candidat-fantome/);
  });
});
