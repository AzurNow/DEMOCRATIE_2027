/**
 * `pnpm analyze` : le modèle de chaque outil à chaque run, publié avec la tendance dans H5 (§8,
 * 0.31, D73 (17)), de bout en bout sur des runs en mémoire (`run-analysable.ts`).
 */

import { describe, expect, it } from "vitest";
import { analyserRun } from "../../analysis/analyse-du-run.ts";
import { ModeleDemandeAbsent } from "../../analysis/modeles-du-run.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { entreesDuRunAnalysable, modeleDemande, SPEC_REFERENCE, type ContexteReponse, type SpecRun } from "./run-analysable.ts";

const PARAMETRES = { reechantillonnages: 20, permutations: 20 };

type Json = Record<string, unknown>;

interface ModeleJson {
  readonly outil_id: string;
  readonly modele_demande: string;
  readonly identifiants_renvoyes: readonly { identifiant: string; reponses: number }[];
  readonly reponses_sans_identifiant: number;
}

/**
 * Le premier run : outil-alpha renvoie, en mode web_activee, un identifiant daté qui n'est pas le
 * demandé ; outil-beta ne renvoie aucun identifiant sur ses formulations orientées ; outil-gamma a
 * des manquantes (registre non neutre en web_activee), qui ne comptent nulle part.
 */
const SPEC_PREMIER: SpecRun = {
  ...SPEC_REFERENCE,
  run: { cle: "run-premier-modeles", date_gel: "2026-11-20T06:00:00+01:00" },
  modele_renvoye: (c: ContexteReponse) => {
    if (c.outil_id === "outil-alpha" && c.mode === "web_activee") return "Famille-Test/outil-alpha-2026-11-01";
    if (c.outil_id === "outil-beta" && c.registre === "oriente") return null;
    return modeleDemande(c.outil_id);
  },
};

const DERNIER = entreesDuRunAnalysable(SPEC_REFERENCE);
const PREMIER = entreesDuRunAnalysable(SPEC_PREMIER);
const DOCUMENT = analyserRun(DERNIER, PARAMETRES, PREMIER) as Json;

function modeles(document: Json): { premier: ModeleJson[]; dernier: ModeleJson[] } {
  const h5 = (document["hypotheses"] as Json)["H5"] as Json;
  return h5["modeles"] as { premier: ModeleJson[]; dernier: ModeleJson[] };
}

/** Le compte attendu, recalculé sur les réponses en mémoire du run : obtenues, API, de l'outil. */
function obtenuesApi(entrees: typeof DERNIER, outil_id: string, filtre: (modele: string | null | undefined) => boolean): number {
  return entrees.reponses.filter((r) => r.contexte === "run" && r.canal === "api" && r.statut_reponse === "obtenue" && r.outil_id === outil_id && filtre(r.metadonnees?.modele_renvoye)).length;
}

describe("modèles publiés avec la tendance (§8, D73 (17))", () => {
  it("le document reste conforme à schema/metriques.schema.json", () => {
    expect(() => valider("metriques", DOCUMENT, "avec modèles")).not.toThrow();
  });

  it("une ligne par assistant inclus et par run, dans l'ordre du périmètre, avec le modèle demandé au gel", () => {
    const { premier, dernier } = modeles(DOCUMENT);
    for (const lignes of [premier, dernier]) {
      expect(lignes.map((l) => l.outil_id)).toEqual(["outil-alpha", "outil-beta", "outil-gamma"]);
      for (const l of lignes) expect(l.modele_demande).toBe(modeleDemande(l.outil_id));
    }
  });

  it("au dernier run, toutes les réponses renvoient le demandé : un seul identifiant, l'effectif de toutes les réponses obtenues", () => {
    const alpha = modeles(DOCUMENT).dernier[0] as ModeleJson;
    const total = obtenuesApi(DERNIER, "outil-alpha", () => true);
    expect(total).toBeGreaterThan(0);
    expect(alpha.identifiants_renvoyes).toEqual([{ identifiant: modeleDemande("outil-alpha"), reponses: total }]);
    expect(alpha.reponses_sans_identifiant).toBe(0);
  });

  it("au premier run, deux identifiants pour outil-alpha, publiés tels quels et rangés de façon déterministe", () => {
    const alpha = modeles(DOCUMENT).premier[0] as ModeleJson;
    expect(alpha.identifiants_renvoyes).toEqual([
      { identifiant: "Famille-Test/outil-alpha-2026-11-01", reponses: obtenuesApi(PREMIER, "outil-alpha", (m) => m === "Famille-Test/outil-alpha-2026-11-01") },
      { identifiant: modeleDemande("outil-alpha"), reponses: obtenuesApi(PREMIER, "outil-alpha", (m) => m === modeleDemande("outil-alpha")) },
    ]);
    expect(alpha.identifiants_renvoyes.every((i) => i.reponses > 0)).toBe(true);
  });

  it("au premier run, les réponses d'outil-beta sans identifiant sont comptées à part", () => {
    const beta = modeles(DOCUMENT).premier[1] as ModeleJson;
    const sans = obtenuesApi(PREMIER, "outil-beta", (m) => m === null);
    expect(sans).toBeGreaterThan(0);
    expect(beta.reponses_sans_identifiant).toBe(sans);
    expect(beta.identifiants_renvoyes).toEqual([{ identifiant: modeleDemande("outil-beta"), reponses: obtenuesApi(PREMIER, "outil-beta", (m) => m !== null) }]);
  });

  it("les manquantes d'outil-gamma ne comptent nulle part : effectifs = réponses obtenues seules", () => {
    const gamma = modeles(DOCUMENT).dernier[2] as ModeleJson;
    const manquantes = DERNIER.reponses.filter((r) => r.outil_id === "outil-gamma" && r.canal === "api" && r.statut_reponse === "manquante").length;
    expect(manquantes).toBeGreaterThan(0);
    const compte = gamma.identifiants_renvoyes.reduce((somme, i) => somme + i.reponses, 0) + gamma.reponses_sans_identifiant;
    expect(compte).toBe(obtenuesApi(DERNIER, "outil-gamma", () => true));
  });

  it("deux analyses du même run publient les mêmes modèles", () => {
    expect(modeles(analyserRun(DERNIER, PARAMETRES, PREMIER) as Json)).toEqual(modeles(DOCUMENT));
  });

  it("un assistant inclus sans modèle demandé au gel : l'analyse refuse", () => {
    const outils = DERNIER.run.perimetre.outils.map((o) => {
      if (o.outil_id !== "outil-beta") return o;
      const { modele_demande: _retire, ...sans } = o;
      return sans;
    });
    const sansModele = { ...DERNIER, run: { ...DERNIER.run, perimetre: { ...DERNIER.run.perimetre, outils } } };
    expect(() => analyserRun(sansModele, PARAMETRES, PREMIER)).toThrow(ModeleDemandeAbsent);
  });
});
