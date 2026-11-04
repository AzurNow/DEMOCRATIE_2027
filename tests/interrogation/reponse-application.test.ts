/**
 * Un dépôt de testeur devient une réponse du canal application (§6, protocole 0.31, D73 (12)) :
 * « La réponse notée d'une saisie est ce texte copié ; ses liens sont les adresses http ou https
 * qui figurent dans ce texte ; elle ne porte ni mode ni caractère tronqué, et le recalcul (d) de la
 * section 8, qui exclut les réponses tronquées, ne porte que sur le canal API. »
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CaptureMasqueeIdentique, type DepotApplication } from "../../pipeline/interrogation/depot-application.ts";
import { NORMALISATION_DEPOT, reponseDepuisDepot } from "../../pipeline/interrogation/reponse-application.ts";
import { ErreurSchema, erreurDeSchema } from "../../outils/schemas/valider.ts";

const ID = "01JDQ7XK2M8N3P4R5S6T7V8W9Z";

function depot(partiel: Partial<DepotApplication> = {}): DepotApplication {
  return {
    run_id: "01JDQ7XK2M8N3P4R5S6T7V8W9X",
    outil_id: "outil-alpha",
    question_id: `q_${"a".repeat(32)}`,
    formulation_id: "01JDQ7XK2M8N3P4R5S6T7V8W9A",
    echantillon: 1,
    testeur_id: "testeur-1",
    compte: "dedie",
    horodatage_saisie: "2026-12-02T10:00:00+01:00",
    texte_copie: "Le candidat propose X (source : https://a.example/p).",
    captures: [{ sha256: "1".repeat(64), chemin_local: "captures/t1/a.png" }],
    ...partiel,
  };
}

describe("dépôt → réponse du canal application", () => {
  it("la réponse produite est conforme à schema/reponse.schema.json", () => {
    expect(erreurDeSchema("reponse", reponseDepuisDepot(depot(), ID), "réponse produite")).toBeNull();
  });

  it("identité de la saisie recopiée, canal application, contexte run, obtenue", () => {
    const r = reponseDepuisDepot(depot(), ID);
    expect(r).toMatchObject({
      id: ID,
      run_id: "01JDQ7XK2M8N3P4R5S6T7V8W9X",
      contexte: "run",
      canal: "application",
      outil_id: "outil-alpha",
      question_id: `q_${"a".repeat(32)}`,
      formulation_id: "01JDQ7XK2M8N3P4R5S6T7V8W9A",
      echantillon: 1,
      statut_reponse: "obtenue",
      normalisation: NORMALISATION_DEPOT,
    });
  });

  it("brut_texte et normalise.texte sont le texte copié, et rien d'autre", () => {
    const r = reponseDepuisDepot(depot(), ID);
    expect(r.brut_texte).toBe(depot().texte_copie);
    expect(r.normalise.texte).toBe(depot().texte_copie);
  });

  it("les liens sont les adresses http(s) du texte", () => {
    expect(reponseDepuisDepot(depot(), ID).normalise.liens).toEqual(["https://a.example/p"]);
  });

  it("ni mode, ni troncature : les clés sont absentes, pas mises à une valeur par défaut", () => {
    const r = reponseDepuisDepot(depot(), ID) as unknown as Record<string, unknown> & { normalise: Record<string, unknown> };
    expect("mode" in r).toBe(false);
    expect("troncature" in r.normalise).toBe(false);
  });

  it("aucune métadonnée d'API ni empreinte d'octets HTTP n'est inventée", () => {
    const r = reponseDepuisDepot(depot(), ID) as unknown as Record<string, unknown>;
    expect("metadonnees" in r).toBe(false);
    expect("brut_octets_sha256" in r).toBe(false);
    expect("requete" in r).toBe(false);
    expect("brut" in r).toBe(false);
  });

  it("refus_api est faux : aucune API n'a été appelée, donc aucun refus de modération de l'API", () => {
    expect(reponseDepuisDepot(depot(), ID).normalise.refus_api).toBe(false);
  });

  it("saisie manuelle : testeur, horodatage, compte dédié, captures", () => {
    expect(reponseDepuisDepot(depot(), ID).saisie_manuelle).toEqual({
      testeur_id: "testeur-1",
      horodatage_saisie: "2026-12-02T10:00:00+01:00",
      compte_dedie: true,
      captures: [{ sha256: "1".repeat(64), chemin_local: "captures/t1/a.png" }],
    });
  });

  it("sans compte : compte_dedie faux", () => {
    expect(reponseDepuisDepot(depot({ compte: "aucun" }), ID).saisie_manuelle.compte_dedie).toBe(false);
  });

  it("capture masquée : les deux empreintes passent dans la réponse (§6, 0.25)", () => {
    const captures = [{ sha256: "1".repeat(64), sha256_masquee: "2".repeat(64), chemin_local: "captures/t1/a.png" }];
    const r = reponseDepuisDepot(depot({ captures }), ID);
    expect(r.saisie_manuelle.captures).toEqual(captures);
    expect(erreurDeSchema("reponse", r, "réponse masquée")).toBeNull();
  });

  it("capture masquée identique à l'origine : refus", () => {
    const captures = [{ sha256: "1".repeat(64), sha256_masquee: "1".repeat(64), chemin_local: "captures/t1/a.png" }];
    expect(() => reponseDepuisDepot(depot({ captures }), ID)).toThrow(CaptureMasqueeIdentique);
  });
});

describe("dépôt → réponse : texte conservé octet pour octet (règle 7)", () => {
  it("guillemets typographiques, espaces insécables et fines, apostrophe courbe", () => {
    const texte = "« Il a dit : “oui” » — l’adresse https://a.example/p.\r\n";
    const r = reponseDepuisDepot(depot({ texte_copie: texte }), ID);
    expect(Buffer.from(r.brut_texte, "utf8").equals(Buffer.from(texte, "utf8"))).toBe(true);
    expect(Buffer.from(r.normalise.texte, "utf8").equals(Buffer.from(texte, "utf8"))).toBe(true);
    expect(r.normalise.liens).toEqual(["https://a.example/p"]);
  });

  it("forme Unicode décomposée gardée telle quelle (aucune normalisation NFC)", () => {
    const texte = "élection";
    const r = reponseDepuisDepot(depot({ texte_copie: texte }), ID);
    expect(r.normalise.texte).toBe(texte);
    expect(r.normalise.texte).not.toBe(texte.normalize("NFC"));
  });

  it("espaces de tête et de fin gardées", () => {
    const texte = "  texte \n\n";
    expect(reponseDepuisDepot(depot({ texte_copie: texte }), ID).normalise.texte).toBe(texte);
  });
});

describe("dépôt → réponse : cas limites", () => {
  it("texte vide : réponse obtenue au texte vide, visible, jamais une manquante", () => {
    const r = reponseDepuisDepot(depot({ texte_copie: "" }), ID);
    expect(r.statut_reponse).toBe("obtenue");
    expect(r.brut_texte).toBe("");
    expect(r.normalise).toEqual({ texte: "", liens: [], refus_api: false });
    expect(erreurDeSchema("reponse", r, "réponse vide")).toBeNull();
  });

  it("même adresse deux fois : deux liens", () => {
    const r = reponseDepuisDepot(depot({ texte_copie: "https://a.example/p puis https://a.example/p" }), ID);
    expect(r.normalise.liens).toEqual(["https://a.example/p", "https://a.example/p"]);
  });

  it("ftp:// et www. ne sont pas des liens", () => {
    const r = reponseDepuisDepot(depot({ texte_copie: "ftp://a.example/f et www.a.example" }), ID);
    expect(r.normalise.liens).toEqual([]);
  });

  it("dépôt non conforme à son schéma : refus (frontière d'entrée)", () => {
    const { texte_copie: _texte, ...sansTexte } = depot();
    expect(() => reponseDepuisDepot(sansTexte, ID)).toThrow(ErreurSchema);
  });

  it("dépôt à l'échantillon 2 : refus", () => {
    expect(() => reponseDepuisDepot({ ...depot(), echantillon: 2 }, ID)).toThrow(ErreurSchema);
  });

  it("dépôt avec compte personnel : refus", () => {
    expect(() => reponseDepuisDepot({ ...depot(), compte: "personnel" }, ID)).toThrow(ErreurSchema);
  });

  it("identifiant de réponse qui n'est pas un ULID : refus (frontière de sortie)", () => {
    expect(() => reponseDepuisDepot(depot(), "reponse-1")).toThrow(ErreurSchema);
  });
});

describe("schéma reponse : la troncature n'appartient qu'au canal API (§6, 0.31)", () => {
  it("une réponse de l'application qui porte une troncature est refusée", () => {
    const r = reponseDepuisDepot(depot(), ID);
    const avec = { ...r, normalise: { ...r.normalise, troncature: false } };
    expect(erreurDeSchema("reponse", avec, "application avec troncature")?.chemins).toContain("/normalise");
  });

  it("une réponse de l'application qui porte un mode est refusée", () => {
    const r = reponseDepuisDepot(depot(), ID);
    expect(erreurDeSchema("reponse", { ...r, mode: "web_activee" }, "application avec mode")).not.toBeNull();
  });

  it("une réponse de l'API obtenue sans troncature est refusée : le drapeau y reste obligatoire", () => {
    const chemin = join(import.meta.dirname, "../../schema/exemples/reponse/valide-01-api-obtenue.json");
    const api = JSON.parse(readFileSync(chemin, "utf8")) as { normalise: Record<string, unknown> };
    expect(erreurDeSchema("reponse", api, "api avec troncature")).toBeNull();
    const { troncature: _t, ...sans } = api.normalise;
    expect(erreurDeSchema("reponse", { ...api, normalise: sans }, "api sans troncature")?.chemins).toContain("/normalise");
  });
});
