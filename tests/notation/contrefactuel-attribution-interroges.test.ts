/**
 * Cas construit de D55 (4) (constat 4 de la conformité du 2026-10-19, constat 5 de la revue du
 * 2026-10-12) : avec le dérangement d'autrefois — tiré sur tout le périmètre, interrogés et non
 * interrogés ensemble —, un candidat interrogé cité à tort sur une question d'attribution pouvait
 * avoir pour image un candidat non interrogé. Le côté permuté devenait alors indécidable
 * (`note-attribution.ts`, « candidat cité au périmètre mais non interrogé »), donc un renvoi vers
 * l'humain (D30 (2)) ; la paire était écartée du taux de changement (D31 (1)) au lieu d'y être
 * comptée. Démontré de bout en bout : dérangement → réponse permutée → `issueDeJuge` →
 * `testerContrefactuel`.
 *
 * Avant la correction, ce test échouait : le dérangement « d'autrefois » ci-dessous donnait pour
 * image de « c » le candidat non interrogé « b », et la paire finissait écartée pour les deux juges.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { testerContrefactuel, type PaireContrefactuelle } from "../../pipeline/notation/contrefactuel.ts";
import { tirerDerangement, type Derangement } from "../../pipeline/notation/derangement.ts";
import type { SousEnsembleContrefactuel } from "../../pipeline/notation/echantillons.ts";
import { reponseContrefactuelle } from "../../pipeline/notation/reponse-contrefactuelle.ts";
import { issueDeJuge, type CadreNotationJuge, type IdentiteJuge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import type { CandidatDuRun, NotationIndividuelle, RenvoiHumain } from "../../pipeline/notation/types.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";
import { GENERATEUR_DU_TIRAGE } from "../../pipeline/questions/tirage.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { runDeNotation } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");

/** « a » et « c » interrogés, « b » non interrogé. */
const A: CandidatDuRun = { candidat_id: "a", libelle: "Alix A", nom: "A" };
const B: CandidatDuRun = { candidat_id: "b", libelle: "Bela B", nom: "B" };
const C: CandidatDuRun = { candidat_id: "c", libelle: "Cora C", nom: "C" };
const PERIMETRE = [A, B, C];
const INTERROGES = [A, C];
const INTERROGES_IDS = INTERROGES.map((c) => c.candidat_id);

/** Graine 2, celle du cas construit de `derangement.test.ts` : l'image de « c » y est « b ». */
const GRAINE_DU_CAS: GraineTirage = { valeur: 2, ...GENERATEUR_DU_TIRAGE };

/** D'autrefois : dérangement tiré sur tout le périmètre, interrogés et non interrogés ensemble. */
const DERANGEMENT_D_AUTREFOIS: Derangement = tirerDerangement(PERIMETRE, PERIMETRE, GRAINE_DU_CAS);
/** Corrigé (D55 (4)) : dérangement tiré sur les deux seuls interrogés, l'échange. */
const DERANGEMENT_CORRIGE: Derangement = tirerDerangement(INTERROGES, PERIMETRE, GRAINE_DU_CAS);

const REPONSE_ID = ulid("rep-cas-construit-d55-4");
const CONTREFACTUELLE_ID = ulid("rep-cas-construit-d55-4-permutee");
const RUN_ID = ulid("run-cas-construit-d55-4");
const TEXTE_ORIGINE = "Le candidat C propose la mesure.";
const EXTRAIT = "propose la mesure";

function reponseDeTest(texte: string): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>("reponse", { ...lue, id: REPONSE_ID, run_id: RUN_ID, normalise: { ...lue.normalise, texte } }, "réponse de test (cas construit D55 (4))");
}

const ORIGINE = reponseDeTest(TEXTE_ORIGINE);
const ATTENDU: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["a"], resolution_temporelle: { date_gel: "2026-12-01T06:00:00+01:00", regle: "semi_ouvert" } };

function identite(juge_id: string): IdentiteJuge {
  return { juge_id, famille_modele: `famille-${juge_id}`, modele: `famille-${juge_id}/modele`, prompt: { chemin: "simule://cas-construit-d55-4", version: "1.0.0" } };
}

function releve(nom_cite: string): SortieJuge {
  return { noms_cites: [nom_cite], non_reponse: false, sourcage: { cite: false, soutiens: [] }, extrait_justificatif: { provenance: "reponse", texte: EXTRAIT } };
}

function cadre(objet_id: string, contexte: "run" | "contrefactuel_candidat", reponse_attendue: ReponseAttendue, texte_reponse: string): CadreNotationJuge {
  return {
    id: ulid(`notation-cas-construit-${objet_id}`),
    run_id: RUN_ID,
    contexte,
    motif_notation: contexte === "run" ? "notation_juge" : "contrefactuel",
    objet_id,
    gabarit: "Q-ATT",
    references_item: [],
    date: "2026-12-04T10:00:00+01:00",
    liens: [],
    existences: new Map(),
    textes: { reponse: texte_reponse, citations_reference: [] },
    date_gel: "2026-12-01T06:00:00+01:00",
    items: [],
    reponse_attendue,
    candidats: PERIMETRE,
    interroges: INTERROGES_IDS,
    registre: "neutre",
    premisse_fausse: false,
    version_charge: "charge-juge-v3",
  };
}

function imageDe(derangement: Derangement, candidat_id: string): string {
  const paire = derangement.paires.find((p) => p.source.candidat_id === candidat_id);
  if (paire === undefined) throw new Error(`candidat ${candidat_id} sans image dans ce dérangement de test.`);
  return paire.image.candidat_id;
}

interface PaireNotee {
  readonly paire: PaireContrefactuelle;
  readonly notations: readonly NotationIndividuelle[];
  readonly renvois: readonly RenvoiHumain[];
  readonly permutee_texte: string;
}

/** Les deux juges, aveugles et identiques, notent l'origine (citant « C » à tort) puis le côté permuté. */
function noterLaPaire(derangement: Derangement): PaireNotee {
  const { reponse: permutee } = reponseContrefactuelle(ORIGINE, CONTREFACTUELLE_ID, derangement);
  const attendu_permute: ReponseAttendue = { ...ATTENDU, candidats_attendus: [imageDe(derangement, "a")] };
  const nom_permute = PERIMETRE.find((c) => c.candidat_id === imageDe(derangement, "c"))?.nom;
  if (nom_permute === undefined) throw new Error("image de « c » introuvable parmi les candidats de test.");
  expect(permutee.normalise.texte).toContain(nom_permute);

  const notations: NotationIndividuelle[] = [];
  const renvois: RenvoiHumain[] = [];
  for (const juge_id of ["j1", "j2"]) {
    const origine = issueDeJuge(identite(juge_id), releve("C"), cadre(REPONSE_ID, "run", ATTENDU, TEXTE_ORIGINE));
    if (origine.type === "notation") notations.push(origine.notation);
    else renvois.push(origine.renvoi);
    const permute = issueDeJuge(identite(juge_id), releve(nom_permute), cadre(CONTREFACTUELLE_ID, "contrefactuel_candidat", attendu_permute, permutee.normalise.texte));
    if (permute.type === "notation") notations.push(permute.notation);
    else renvois.push(permute.renvoi);
  }
  const paire: PaireContrefactuelle = {
    reponse_id: REPONSE_ID,
    contrefactuelle_id: CONTREFACTUELLE_ID,
    textes_origine: { reponse: TEXTE_ORIGINE, citations_reference: [] },
    textes_permutes: { reponse: permutee.normalise.texte, citations_reference: [] },
    mentions_residuelles: 0,
  };
  return { paire, notations, renvois, permutee_texte: permutee.normalise.texte };
}

const SOUS_ENSEMBLE: SousEnsembleContrefactuel = { reponse_ids: [REPONSE_ID], eligibles: 1, taille_visee: 1, sous_effectif: false };
const RUN = runDeNotation([], { id: RUN_ID });

describe("cas construit D55 (4) : le dérangement contrefactuel ne porte que sur les candidats interrogés", () => {
  it("avant la correction (dérangement sur tout le périmètre) : le côté permuté est indécidable, la paire est écartée pour les deux juges, aucun taux", () => {
    const { paire, notations, renvois } = noterLaPaire(DERANGEMENT_D_AUTREFOIS);
    expect(renvois).toHaveLength(2);
    expect(renvois.every((r) => r.raison.includes("non interrogé"))).toBe(true);
    const resultat = testerContrefactuel({ run: RUN, sous_ensemble: SOUS_ENSEMBLE, paires: [paire], notations, renvois });
    expect(resultat.statut).toBe("termine");
    if (resultat.statut !== "termine") return;
    for (const juge of resultat.juges) {
      expect(juge.paires_ecartees_contrefactuel).toBe(1);
      expect("motif_indefini_contrefactuel" in juge && juge.motif_indefini_contrefactuel).toBe("toutes_paires_ecartees");
    }
  });

  it("corrigé (dérangement sur les seuls interrogés) : le côté permuté reste comparable, aucun renvoi, la paire est comptée dans le taux", () => {
    const { paire, notations, renvois } = noterLaPaire(DERANGEMENT_CORRIGE);
    expect(renvois).toHaveLength(0);
    const resultat = testerContrefactuel({ run: RUN, sous_ensemble: SOUS_ENSEMBLE, paires: [paire], notations, renvois });
    expect(resultat.statut).toBe("termine");
    if (resultat.statut !== "termine") return;
    for (const juge of resultat.juges) {
      expect("taux" in juge && juge.taux).toEqual({ numerateur: 0, denominateur: 1, valeur: 0 });
      expect(juge.paires_ecartees_contrefactuel).toBe(0);
      expect(juge.retire).toBe(false);
    }
  });
});
