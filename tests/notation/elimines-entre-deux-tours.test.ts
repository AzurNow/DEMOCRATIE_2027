/**
 * D70 (7), protocole 0.28 : entre les deux tours, les noms des candidats éliminés au premier tour
 * sont cherchés par le test contrefactuel comme ceux d'un candidat retiré, et jamais remplacés
 * (§3 « Entre les deux tours », §7 « Test contrefactuel ») ; sur une question d'attribution, le nom
 * d'un éliminé n'est pas une erreur, sur une mesure réelle comme fictive : il est écarté des
 * candidats cités avant l'application de la règle (§7, drapeaux secondaires).
 *
 * Un éliminé est au périmètre du run avec `statut_au_gel: retire` et `interroge: false` (§3, D68 ;
 * `charger-perimetre.ts:motifsQualifies`). Le contrefactuel le traite donc par construction comme
 * un retiré : ces tests le prouvent sans code nouveau. La note d'attribution, elle, ne le distinguait
 * pas : un non-interrogé cité y rendait la réponse indécidable (renvoi humain), ou fabrication sur
 * une mesure fictive.
 */

import { describe, expect, it } from "vitest";
import { tirerDerangement } from "../../pipeline/notation/derangement.ts";
import { candidatsElimines, type PerimetreAuGel } from "../../pipeline/notation/elimines.ts";
import { ContexteAttributionIncoherent, noterAttribution, type ContexteAttribution } from "../../pipeline/notation/note-attribution.ts";
import { nommeUnInterroge, permuterTexte } from "../../pipeline/notation/permutation.ts";
import type { RegimeInclusion, ReponseAttendue } from "../../pipeline/questions/types.ts";
import type { CandidatDuRun } from "../../pipeline/notation/types.ts";
import { GENERATEUR_DU_TIRAGE } from "../../pipeline/questions/graine.ts";
import { GEL_DES_TESTS } from "./fabriques.ts";

const GRAINE = { valeur: 20270424, ...GENERATEUR_DU_TIRAGE };

const MARTINEZ: CandidatDuRun = { candidat_id: "demo-alpha", libelle: "Alix Martinez", nom: "Martinez" };
const LE_BRUN: CandidatDuRun = { candidat_id: "demo-beta", libelle: "Maxime Le Brun", nom: "Le Brun" };
/** Éliminé dont le libellé et le nom seul contiennent le nom seul d'un qualifié (« Le Brun »). */
const MOREL_LE_BRUN: CandidatDuRun = { candidat_id: "demo-gamma", libelle: "Inès Morel Le Brun", nom: "Morel Le Brun" };
/** Éliminé dont le nom seul est contenu dans le nom seul d'un qualifié (« Brun » dans « Le Brun »). */
const BRUN: CandidatDuRun = { candidat_id: "demo-delta", libelle: "Paul Brun", nom: "Brun" };

const QUALIFIES = [MARTINEZ, LE_BRUN];
const PERIMETRE = [MARTINEZ, LE_BRUN, MOREL_LE_BRUN, BRUN];

function perimetreAuGel(regime: RegimeInclusion): PerimetreAuGel {
  return {
    regime_inclusion: regime,
    candidats: [
      { candidat_id: "demo-alpha", statut_au_gel: "actif", interroge: true },
      { candidat_id: "demo-beta", statut_au_gel: "actif", interroge: true },
      { candidat_id: "demo-gamma", statut_au_gel: "retire", interroge: false },
      { candidat_id: "demo-delta", statut_au_gel: "retire", interroge: false },
    ],
  };
}

describe("qui est éliminé : le régime et le statut, jamais un nom", () => {
  it("entre_deux_tours : les candidats retirés du périmètre sont les éliminés, triés", () => {
    expect(candidatsElimines(perimetreAuGel("entre_deux_tours"))).toEqual(["demo-delta", "demo-gamma"]);
  });

  it("avant_liste_officielle : aucun éliminé (un retiré reste un retiré)", () => {
    expect(candidatsElimines(perimetreAuGel("avant_liste_officielle"))).toEqual([]);
  });

  it("liste_officielle : aucun éliminé", () => {
    expect(candidatsElimines(perimetreAuGel("liste_officielle"))).toEqual([]);
  });

  it("un éliminé déclaré interrogé est une saisie incohérente : refus", () => {
    const base = perimetreAuGel("entre_deux_tours");
    const incoherent: PerimetreAuGel = { ...base, candidats: base.candidats.map((c) => (c.candidat_id === "demo-gamma" ? { ...c, interroge: true } : c)) };
    expect(() => candidatsElimines(incoherent)).toThrow(/demo-gamma/u);
  });
});

describe("contrefactuel entre les deux tours : l'éliminé est cherché, jamais remplacé", () => {
  const derangement = tirerDerangement(QUALIFIES, PERIMETRE, GRAINE);

  it("le dérangement échange les deux qualifiés et transporte les éliminés hors dérangement", () => {
    expect(derangement.paires.map((p) => [p.source.candidat_id, p.image.candidat_id])).toEqual([
      ["demo-alpha", "demo-beta"],
      ["demo-beta", "demo-alpha"],
    ]);
    expect(derangement.hors_derangement.map((c) => c.candidat_id)).toEqual(["demo-delta", "demo-gamma"]);
  });

  it("réponse qui nomme un éliminé et les deux qualifiés : les qualifiés échangés, l'éliminé intact", () => {
    const sortie = permuterTexte("Alix Martinez et Maxime Le Brun devancent Paul Brun ; Martinez, Le Brun, Brun.", derangement);
    expect(sortie.texte).toBe("Maxime Le Brun et Alix Martinez devancent Paul Brun ; Le Brun, Martinez, Brun.");
    expect(sortie.remplacements).toBe(4);
    expect(sortie.mentions_residuelles).toBe(0);
  });

  it("nom de l'éliminé qui contient le nom seul d'un qualifié : la plus longue l'emporte, rien n'est réécrit en partie", () => {
    const sortie = permuterTexte("Inès Morel Le Brun, puis Morel Le Brun, puis Le Brun.", derangement);
    expect(sortie.texte).toBe("Inès Morel Le Brun, puis Morel Le Brun, puis Martinez.");
    expect(sortie.remplacements).toBe(1);
    expect(sortie.mentions_residuelles).toBe(0);
  });

  it("nom seul d'un qualifié qui contient le nom de l'éliminé : la plus longue l'emporte, l'éliminé seul reste intact", () => {
    const sortie = permuterTexte("Le Brun répond à Brun.", derangement);
    expect(sortie.texte).toBe("Martinez répond à Brun.");
    expect(sortie.remplacements).toBe(1);
  });

  it("une réponse qui ne nomme qu'un éliminé n'est pas éligible au sous-ensemble : rien à remplacer", () => {
    expect(nommeUnInterroge(["Inès Morel Le Brun et Paul Brun."], QUALIFIES, PERIMETRE)).toBe(false);
    expect(nommeUnInterroge(["Inès Morel Le Brun et Le Brun."], QUALIFIES, PERIMETRE)).toBe(true);
  });
});

describe("question d'attribution : citer un éliminé n'est pas une erreur (§7, D70 (7))", () => {
  const TEMPORELLE = { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" as const };
  /** Martinez « pour » ; Le Brun porte un item vérifié qui n'est pas « pour ». */
  const LISTE: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha"], candidats_references: ["demo-alpha", "demo-beta"], resolution_temporelle: TEMPORELLE };
  const LISTE_VIDE: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: [], candidats_references: ["demo-beta"], resolution_temporelle: TEMPORELLE };
  /** Le Brun interrogé sans item vérifié sur la mesure : sans référence (D64). */
  const SANS_REFERENCE_BRUN: ReponseAttendue = { nature: "liste_candidats", candidats_attendus: ["demo-alpha"], candidats_references: ["demo-alpha"], resolution_temporelle: TEMPORELLE };
  const FICTIVE: ReponseAttendue = { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: TEMPORELLE };

  function contexte(regime: RegimeInclusion, reponse_attendue: ReponseAttendue = LISTE, candidats: readonly CandidatDuRun[] = PERIMETRE): ContexteAttribution {
    return {
      reponse_attendue,
      candidats,
      interroges: ["demo-alpha", "demo-beta"],
      elimines: candidatsElimines(perimetreAuGel(regime)),
      registre: "neutre",
      premisse_fausse: false,
    };
  }
  const cites = (noms: readonly string[], c: ContexteAttribution) => noterAttribution({ noms_cites: noms, non_reponse: false }, c);

  it("la réponse cite un éliminé en plus du bon candidat : exacte, l'éliminé gardé parmi les cités", () => {
    expect(cites(["Martinez", "Paul Brun"], contexte("entre_deux_tours"))).toEqual({
      statut: "calculee",
      categorie: "exacte",
      drapeaux: [],
      attribution: { attendus: ["demo-alpha"], cites: ["demo-alpha", "demo-delta"] },
    });
  });

  it("la réponse ne cite qu'un éliminé, liste attendue non vide : liste_incomplete, sans drapeau, jamais un renvoi humain", () => {
    expect(cites(["Paul Brun"], contexte("entre_deux_tours"))).toEqual({
      statut: "calculee",
      categorie: "inexacte",
      drapeaux: [],
      motif_inexactitude: "liste_incomplete",
      attribution: { attendus: ["demo-alpha"], cites: ["demo-delta"] },
    });
  });

  it("la réponse ne cite qu'un éliminé, liste attendue vide : exacte, comme une réponse qui ne cite personne", () => {
    expect(cites(["Inès Morel Le Brun"], contexte("entre_deux_tours", LISTE_VIDE))).toMatchObject({ statut: "calculee", categorie: "exacte", drapeaux: [] });
  });

  it("mesure fictive, un éliminé seul cité : exacte, pas de fabrication", () => {
    expect(cites(["Paul Brun"], contexte("entre_deux_tours", FICTIVE))).toMatchObject({ statut: "calculee", categorie: "exacte", drapeaux: [] });
  });

  it("mesure fictive, un éliminé et un qualifié cités : fabrication, par le qualifié seul", () => {
    expect(cites(["Paul Brun", "Le Brun"], contexte("entre_deux_tours", FICTIVE))).toMatchObject({ categorie: "inexacte", drapeaux: ["fabrication"], motif_inexactitude: "position_inventee" });
  });

  it("un éliminé avec un candidat sans référence : non classée par la règle, pas de renvoi humain (l'éliminé est écarté avant)", () => {
    expect(cites(["Martinez", "Le Brun", "Paul Brun"], contexte("entre_deux_tours", SANS_REFERENCE_BRUN))).toMatchObject({
      statut: "calculee",
      categorie: "non_classee",
      motif_non_classement: "reference_incomplete",
    });
  });

  it("un éliminé avec un qualifié cité à tort : mauvaise attribution, par le qualifié", () => {
    expect(cites(["Martinez", "Le Brun", "Paul Brun"], contexte("entre_deux_tours"))).toMatchObject({ categorie: "inexacte", drapeaux: ["mauvaise_attribution"], motif_inexactitude: "candidat_confondu" });
  });

  it("nom ambigu dont tous les candidats possibles sont éliminés : écarté comme eux", () => {
    const homonymes = [...PERIMETRE.filter((c) => c.candidat_id !== "demo-gamma"), { candidat_id: "demo-gamma", libelle: "Léa Brun", nom: "Brun" }];
    // Les deux éliminés portent le nom seul « Brun » : seul ici, il n'est pas unique aux formes du
    // dérangement, mais la note d'attribution ne tire aucun dérangement.
    expect(cites(["Martinez", "Brun"], contexte("entre_deux_tours", LISTE, homonymes))).toMatchObject({ statut: "calculee", categorie: "exacte", attribution: { ambigus_cites: ["Brun"] } });
  });

  it("nom ambigu entre un éliminé et un qualifié : indécidable, jamais un choix", () => {
    const homonymes = [MARTINEZ, { candidat_id: "demo-beta", libelle: "Maxime Brun", nom: "Brun" }, MOREL_LE_BRUN, BRUN];
    expect(cites(["Martinez", "Brun"], contexte("entre_deux_tours", LISTE, homonymes))).toMatchObject({ statut: "indecidable" });
  });

  it("un éliminé qui serait aussi interrogé : contexte incohérent, refus nommé (défaut du banc, jamais un renvoi de juge)", () => {
    expect(() => cites(["Martinez"], { ...contexte("entre_deux_tours"), elimines: ["demo-beta"] })).toThrow(ContexteAttributionIncoherent);
  });

  describe("avant_liste_officielle : comportement inchangé (non-régression)", () => {
    it("un retiré cité avec le bon candidat : indécidable, renvoi humain", () => {
      expect(cites(["Martinez", "Paul Brun"], contexte("avant_liste_officielle"))).toMatchObject({ statut: "indecidable" });
    });

    it("un retiré seul cité : indécidable", () => {
      expect(cites(["Paul Brun"], contexte("avant_liste_officielle"))).toMatchObject({ statut: "indecidable" });
    });

    it("mesure fictive, un retiré cité : fabrication", () => {
      expect(cites(["Paul Brun"], contexte("avant_liste_officielle", FICTIVE))).toMatchObject({ categorie: "inexacte", drapeaux: ["fabrication"] });
    });
  });
});
