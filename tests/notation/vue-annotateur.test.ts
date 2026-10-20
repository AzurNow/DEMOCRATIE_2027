/**
 * Vue de l'annotateur humain (§7 ; D18 : aveugle total). Exactement la charge du juge, sans prompt,
 * plus la version de la grille et le verdict d'existence de chaque lien. Cas limite 1 du brief
 * notation-humaine.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { MOTIFS_NOTATION } from "../../analysis/types.ts";
import { construireCharge } from "../../pipeline/notation/charge-juge.ts";
import {
  construireVue,
  ExistencesIncoherentes,
  LienSansVerdictExistence,
  VERSION_GRILLE_HUMAINE,
  VERSION_VUE_ANNOTATEUR,
  type DemandeVue,
  type ExistenceEtablie,
  type VueAnnotateur,
} from "../../pipeline/notation/vue-annotateur.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { itemP } from "../aides/fabriques.ts";
import { ALIAS_CANDIDATS_TEST, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const LIEN_A = "https://exemple.invalid/a";
const LIEN_B = "https://exemple.invalid/b";

/** Une réponse obtenue dont chaque champ d'identité de l'outil porte une valeur repérable. */
function reponse(liens: readonly string[] = [LIEN_A, LIEN_B]): ReponseObtenue {
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
      normalise: { ...lue.normalise, liens: [...liens], citations: [{ url: LIEN_A, texte: "extrait cité", cited_text: "propre-editeur" }] },
    },
    "réponse de test",
  );
}

function existence(url: string, verdict: ExistenceEtablie["verdict_existence"] = "existe"): ExistenceEtablie {
  return { url_citee: url, verdict_existence: verdict, date_test: "2026-12-03T11:05:00+01:00", code_http: verdict === "existe" ? 200 : 404 };
}

function demande(r: ReponseObtenue = reponse(), existences: readonly ExistenceEtablie[] = [existence(LIEN_A), existence(LIEN_B, "mort")]): DemandeVue {
  return {
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "oriente", texte: "Quelle est la position de Alix Martinez sur la TVA ?" },
    references: [{ item: itemP(), role: "principal" }],
    date_run: "2026-12-01T06:00:00+01:00",
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(r.normalise.liens),
    existences,
    alias_candidats: ALIAS_CANDIDATS_TEST,
  };
}

describe("aveuglement de la vue (D18)", () => {
  it("prompt absent : ni la clé, ni le chemin ou la version d'un prompt de juge", () => {
    const vue = construireVue(demande());
    expect(Object.keys(vue)).not.toContain("prompt");
    expect(JSON.stringify(vue)).not.toContain("prompts/");
    expectTypeOf<Extract<keyof VueAnnotateur, "prompt">>().toEqualTypeOf<never>();
  });

  it("aucun champ d'outil : aucune valeur d'identité de l'outil dans la vue sérialisée", () => {
    const r = reponse();
    const serialisee = JSON.stringify(construireVue(demande(r)));
    for (const valeur of [r.outil_id, r.alias_aveugle, r.metadonnees.modele_demande, String(r.metadonnees.modele_renvoye), r.requete.endpoint, r.requete.sha256, r.brut_sha256, r.brut_octets_sha256, "propre-editeur"]) {
      expect(serialisee).not.toContain(valeur);
    }
    expect(serialisee).not.toContain(JSON.stringify(r.canal));
    expect(serialisee).not.toContain(JSON.stringify(r.mode));
    expect(serialisee).not.toContain('"brut');
  });

  it("aucun motif d'appel : ni clé motif, ni aucune valeur de motif_notation", () => {
    const serialisee = JSON.stringify(construireVue(demande()));
    expect(serialisee).not.toContain("motif");
    for (const motif of MOTIFS_NOTATION) expect(serialisee).not.toContain(motif);
    expectTypeOf<Extract<keyof VueAnnotateur, "motif_notation" | "motif">>().toEqualTypeOf<never>();
  });

  it("aucune note de juge ni d'humain ne peut y entrer : la demande n'en reçoit pas", () => {
    expectTypeOf<Extract<keyof DemandeVue, "notations" | "notation" | "verdict" | "prompt">>().toEqualTypeOf<never>();
  });

  it("les clés sont exactement celles prévues, à chaque niveau", () => {
    const vue = construireVue(demande());
    expect(Object.keys(vue).sort()).toEqual(
      [
        "date_run",
        "longueur_max_texte_page",
        "pages_citees",
        "question",
        "references",
        "reponse",
        "reponse_attendue",
        "reponse_id",
        "version_grille",
        "version_normalisation_verbatim",
        "version_vue",
      ].sort(),
    );
    expect(Object.keys(vue.reponse).sort()).toEqual(["citations", "liens", "normalisation", "refus_api", "texte", "troncature"].sort());
    expect(Object.keys(vue.question).sort()).toEqual(["gabarit", "premisse_fausse", "registre", "texte"]);
  });

  it("D27 : la vue porte exactement la réponse attendue, la prémisse et les pages de la charge v3", () => {
    const d = demande();
    const vue = construireVue(d);
    const charge = construireCharge({ ...d, prompt: { chemin: "prompts/judge-primaire.md", version: "1.0.0" } });
    expect(vue.reponse_attendue).toEqual(charge.reponse_attendue);
    expect(vue.question).toEqual(charge.question);
    expect(vue.pages_citees).toEqual(charge.pages_citees);
    expect(vue.longueur_max_texte_page).toBe(charge.longueur_max_texte_page);
    expect(VERSION_VUE_ANNOTATEUR).toBe("vue-annotateur-v2");
  });

  it("hors les liens enrichis et les versions, la vue est la charge du juge sans son prompt", () => {
    const d = demande();
    const charge = construireCharge({ ...d, prompt: { chemin: "prompts/judge-primaire.md", version: "1.0.0" } });
    const vue = construireVue(d);
    const { prompt: _prompt, version_charge: _version, reponse: reponseCharge, ...resteCharge } = charge;
    const { version_vue: _v, version_grille: _g, reponse: reponseVue, ...resteVue } = vue;
    expect(resteVue).toEqual(resteCharge);
    expect({ ...reponseVue, liens: reponseVue.liens.map((l) => l.url_citee) }).toEqual(reponseCharge);
  });

  it("porte la version de la grille et sa propre version, sans aucun texte de consigne", () => {
    const vue = construireVue(demande());
    expect(vue.version_grille).toBe(VERSION_GRILLE_HUMAINE);
    expect(vue.version_vue).toBe(VERSION_VUE_ANNOTATEUR);
    expect(VERSION_GRILLE_HUMAINE).toMatch(/^grille-humaine-v\d+$/);
  });
});

describe("verdicts d'existence des liens", () => {
  it("chaque lien porte son verdict d'existence, dans l'ordre de la réponse projetée", () => {
    const vue = construireVue(demande());
    expect(vue.reponse.liens).toEqual([existence(LIEN_A), existence(LIEN_B, "mort")]);
  });

  it("l'ordre des verdicts reçus ne compte pas", () => {
    const vue = construireVue(demande(reponse(), [existence(LIEN_B, "mort"), existence(LIEN_A)]));
    expect(vue.reponse.liens.map((l) => l.url_citee)).toEqual([LIEN_A, LIEN_B]);
  });

  it("un lien sans verdict d'existence : erreur nommée, jamais « existe » par défaut", () => {
    expect(() => construireVue(demande(reponse(), [existence(LIEN_A)]))).toThrow(LienSansVerdictExistence);
    expect(() => construireVue(demande(reponse(), [existence(LIEN_A)]))).toThrow(LIEN_B);
  });

  it("un verdict pour un lien que la réponse ne cite pas est refusé", () => {
    expect(() => construireVue(demande(reponse([LIEN_A]), [existence(LIEN_A), existence(LIEN_B)]))).toThrow(ExistencesIncoherentes);
  });

  it("deux verdicts pour le même lien sont refusés", () => {
    expect(() => construireVue(demande(reponse([LIEN_A]), [existence(LIEN_A), existence(LIEN_A, "mort")]))).toThrow(ExistencesIncoherentes);
  });

  it("une réponse sans lien : aucune existence attendue", () => {
    expect(construireVue(demande(reponse([]), [])).reponse.liens).toEqual([]);
  });

  it("le même lien cité deux fois reçoit deux fois son unique verdict", () => {
    expect(construireVue(demande(reponse([LIEN_A, LIEN_A]), [existence(LIEN_A)])).reponse.liens).toEqual([existence(LIEN_A), existence(LIEN_A)]);
  });

  it("sans item de référence : erreur, rien contre quoi noter", () => {
    expect(() => construireVue({ ...demande(), references: [] })).toThrow(/aucun item de référence/);
  });
});
