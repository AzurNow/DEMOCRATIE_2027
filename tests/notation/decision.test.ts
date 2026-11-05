/**
 * Règle de décision du §7 (D13, D14 (3)). Cas limites 1, 3 à 8 et 14 du brief ; chaque verdict
 * produit passe ajv contre `schema/verdict.schema.json` (cas 16), et chaque notation d'entrée contre
 * `schema/notation.schema.json`, pour que les tests ne reposent pas sur une entrée impossible.
 */

import { describe, expect, it } from "vitest";
import { ulid } from "../analysis/fabriques.ts";
import { decider, JugeIndetermine, NotationsIncoherentes, type Decision, type EntreeDecision } from "../../pipeline/notation/decision.ts";
import { humainsAArbitrer, noteDe } from "../../pipeline/notation/note-retenue.ts";
import type { NotationIndividuelle, VerdictProduit } from "../../pipeline/notation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import {
  inexacte,
  lien,
  notationHumaine,
  notationJuge,
  notationRegle,
  renvoiDefaillant,
  renvoiJuge,
  REPONSE_ID,
  REPONSE_PROJETEE,
  runDeNotation,
} from "./fabriques.ts";

const TEXTES = { reponse: REPONSE_PROJETEE, citations_reference: ["Nous ne toucherons pas à la taxe foncière."] };
const VERDICT_ID = ulid("verdict-notation");

function entree(notations: readonly NotationIndividuelle[], options: Partial<EntreeDecision> = {}): EntreeDecision {
  return {
    run: runDeNotation(),
    objet_note: { type: "reponse", id: REPONSE_ID },
    notations,
    renvois: [],
    dans_echantillon_humain: false,
    textes: TEXTES,
    verdict_id: VERDICT_ID,
    date: "2026-12-06T12:00:00+01:00",
    ...options,
  };
}

/** Décide, après avoir validé chaque notation d'entrée et, s'il y en a un, le verdict produit. */
function decide(notations: readonly NotationIndividuelle[], options: Partial<EntreeDecision> = {}): Decision {
  for (const n of notations) valider("notation", n, `notation de test ${n.id}`);
  const decision = decider(entree(notations, options));
  if (decision.statut === "verdict") valider("verdict", decision.verdict, "verdict produit par decider");
  return decision;
}

function verdictDe(decision: Decision): VerdictProduit {
  if (decision.statut !== "verdict") throw new Error(`attendu un verdict, reçu : en attente (${decision.motifs.join(", ")})`);
  return decision.verdict;
}

const J1 = notationJuge("j1");
const J2 = notationJuge("j2");

describe("accord des deux juges", () => {
  it("deux juges valides d'accord, hors échantillon, sans drapeau grave : accord_juges", () => {
    const v = verdictDe(decide([J1, J2]));
    expect(v).toMatchObject({
      mode_resolution: "accord_juges",
      categorie_retenue: "exacte",
      desaccord_juges: false,
      erreur_grave: false,
      dans_echantillon_humain: false,
      notations_sources: [J1.id, J2.id],
    });
    expect(v.revue_humaine).toBeUndefined();
  });

  it("drapeaux identiques dans un ordre différent : accord", () => {
    const a = notationJuge("j1", inexacte(["deformation", "confirmation_premisse"]));
    const b = notationJuge("j2", inexacte(["confirmation_premisse", "deformation"]));
    const v = verdictDe(decide([a, b]));
    expect(v.mode_resolution).toBe("accord_juges");
    expect(v.drapeaux_retenus).toEqual(["deformation", "confirmation_premisse"]);
  });

  it("l'ordre des notations reçues ne change pas le verdict", () => {
    expect(decide([J2, J1])).toEqual(decide([J1, J2]));
  });
});

describe("extrait justificatif", () => {
  it("cas 1 : juges d'accord, mais l'extrait de l'un absent de la réponse et de la référence → humain", () => {
    const valide = notationJuge("j1", inexacte());
    const invente = notationJuge("j2", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reponse", texte: "il veut tripler la taxe", verifie_deterministe: true },
    });
    expect(decide([valide, invente])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["extrait_invalide"] });
  });

  it("cas 1, suite : l'humain appelé tranche, la notation invalide ne figure pas dans les sources", () => {
    const valide = notationJuge("j1", inexacte());
    const invente = notationJuge("j2", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reference", texte: "phrase absente", verifie_deterministe: true },
    });
    const humain = notationHumaine("a1", "extrait_invalide", inexacte());
    const v = verdictDe(decide([valide, invente, humain]));
    expect(v.mode_resolution).toBe("tranche_humain");
    expect(v.notations_sources).toEqual([valide.id, humain.id]);
    expect(v.revue_humaine).toEqual({ effectuee: true, date: humain.date, annotateurs: ["a1"] });
  });

  it("D15 : extrait invalide, un humain appelé sous desaccord_juges ou erreur_grave est refusé", () => {
    const valide = notationJuge("j1", inexacte());
    const invente = notationJuge("j2", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reponse", texte: "phrase absente", verifie_deterministe: true },
    });
    for (const motif of ["desaccord_juges", "erreur_grave"] as const) {
      expect(() => decide([valide, invente, notationHumaine("a1", motif, inexacte())])).toThrow(/extrait_invalide/);
    }
  });

  it("D15 : catégories différentes mais un extrait invalide → seul le motif extrait_invalide (le désaccord ne se lit qu'entre notations qui comptent)", () => {
    const invalide = notationJuge("j2", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reponse", texte: "phrase absente", verifie_deterministe: true },
    });
    expect(decide([J1, invalide])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["extrait_invalide"] });
    expect(() => decide([J1, invalide, notationHumaine("a1", "desaccord_juges")])).toThrow(/extrait_invalide/);
    expect(verdictDe(decide([J1, invalide, notationHumaine("a1", "extrait_invalide")]))).toMatchObject({
      mode_resolution: "tranche_humain",
      desaccord_juges: false,
    });
  });

  it("D15 : extrait invalide et drapeau grave, le motif exigé reste extrait_invalide", () => {
    const grave = notationJuge("j1", inexacte(["fabrication"]));
    const invalide = notationJuge("j2", {
      ...inexacte(["fabrication"]),
      extrait_justificatif: { provenance: "reponse", texte: "phrase absente", verifie_deterministe: true },
    });
    expect(decide([grave, invalide])).toMatchObject({ motifs: ["extrait_invalide", "drapeau_grave"] });
    expect(() => decide([grave, invalide, notationHumaine("a1", "erreur_grave", inexacte(["fabrication"]))])).toThrow(/extrait_invalide/);
    const humain = notationHumaine("a1", "extrait_invalide", inexacte(["fabrication"]));
    expect(verdictDe(decide([grave, invalide, humain])).mode_resolution).toBe("revue_erreur_grave");
  });

  it("D15 : humain sous extrait_invalide alors qu'aucun extrait n'a échoué → refusé", () => {
    const b = notationJuge("j2", inexacte());
    expect(() => decide([J1, b, notationHumaine("a1", "extrait_invalide")])).toThrow(/extrait_invalide/);
  });

  it("un extrait trouvé dans la citation de la référence est valide", () => {
    const a = notationJuge("j1", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reference", texte: "Nous ne toucherons pas", verifie_deterministe: true },
    });
    const b = notationJuge("j2", inexacte());
    expect(verdictDe(decide([a, b])).mode_resolution).toBe("accord_juges");
  });
});

describe("§7 (0.27) : renvoi d'un juge défaillant → humain sous juge_defaillant, la décision continue", () => {
  const QATT = { gabarit: "Q-ATT" as const, attribution: { attendus: ["demo-alpha"], cites: ["demo-alpha"] } };

  it("un juge renvoie (sortie illisible), l'autre note : en attente d'un humain, motif juge_defaillant", () => {
    expect(decide([J2], { renvois: [renvoiDefaillant("j1")] })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["juge_defaillant"] });
  });

  it("les deux juges incohérents sur la même réponse : en attente d'un humain, jamais d'un juge manquant", () => {
    const renvois = [renvoiDefaillant("j1"), renvoiDefaillant("j2", { motif: "erreur_api_persistante" })];
    expect(decide([], { renvois })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["juge_defaillant"] });
    const humain = notationHumaine("a1", "juge_defaillant");
    const v = verdictDe(decide([humain], { renvois }));
    expect(v).toMatchObject({ mode_resolution: "tranche_humain", notations_sources: [humain.id] });
  });

  it("l'humain appelé sous juge_defaillant tranche ; le renvoi n'est pas une source", () => {
    const humain = notationHumaine("a1", "juge_defaillant");
    const v = verdictDe(decide([J2, humain], { renvois: [renvoiDefaillant("j1")] }));
    expect(v.mode_resolution).toBe("tranche_humain");
    expect(v.notations_sources).toEqual([J2.id, humain.id]);
  });

  it("un humain sous un autre motif (attribution_indecidable, desaccord_juges) est refusé", () => {
    for (const motif of ["attribution_indecidable", "desaccord_juges"] as const) {
      expect(() => decide([J2, notationHumaine("a1", motif)], { renvois: [renvoiDefaillant("j1")] })).toThrow(/juge_defaillant/);
    }
  });

  it("un humain sous juge_defaillant sans renvoi : refusé", () => {
    expect(() => decide([J1, J2, notationHumaine("a1", "juge_defaillant")])).toThrow(NotationsIncoherentes);
  });

  it("sur une Q-ATT, un renvoi d'attribution et un renvoi de défaillance : attribution_indecidable prime", () => {
    const renvois = [renvoiJuge("j1"), renvoiDefaillant("j2", { gabarit: "Q-ATT" })];
    expect(decide([], { renvois })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["attribution_indecidable", "juge_defaillant"] });
    expect(() => decide([notationHumaine("a1", "juge_defaillant", QATT)], { renvois })).toThrow(/attribution_indecidable/);
    expect(verdictDe(decide([notationHumaine("a1", "attribution_indecidable", QATT)], { renvois })).mode_resolution).toBe("tranche_humain");
  });

  it("dans l'échantillon, le renvoi n'est pas manquant : la double notation humaine décide", () => {
    const [a, b] = [notationHumaine("a1", "echantillon_aleatoire_10"), notationHumaine("a2", "echantillon_aleatoire_10")];
    const v = verdictDe(decide([J2, a, b], { renvois: [renvoiDefaillant("j1")], dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", notations_sources: [J2.id, a.id, b.id] });
  });

  it("le renvoi d'un juge retiré est écarté comme ses notations (D13)", () => {
    expect(verdictDe(decide([J2], { run: runDeNotation(["j1"]), renvois: [renvoiDefaillant("j1")] })).mode_resolution).toBe("juge_unique_apres_retrait");
  });

  it("§7 : un refus de l'API ne peut pas être renvoyé par un juge : incohérent", () => {
    const regle = notationRegle({ objet_note: { type: "reponse", id: REPONSE_ID } });
    expect(() => decide([regle], { renvois: [renvoiDefaillant("j1")] })).toThrow(NotationsIncoherentes);
  });
});

describe("D30 (2) : renvoi d'un juge sur une Q-ATT indécidable → humain sous attribution_indecidable", () => {
  const QATT = { gabarit: "Q-ATT" as const, attribution: { attendus: ["demo-alpha"], cites: ["demo-alpha"] } };
  const J2_QATT = notationJuge("j2", QATT);

  it("un juge renvoie, l'autre note : en attente d'un humain, motif attribution_indecidable", () => {
    expect(decide([J2_QATT], { renvois: [renvoiJuge("j1")] })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["attribution_indecidable"] });
  });

  it("les deux juges renvoient : en attente d'un humain, jamais d'un juge manquant", () => {
    expect(decide([], { renvois: [renvoiJuge("j1"), renvoiJuge("j2")] })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["attribution_indecidable"] });
  });

  it("l'humain appelé sous attribution_indecidable tranche ; le renvoi n'est pas une source", () => {
    const humain = notationHumaine("a1", "attribution_indecidable", QATT);
    const v = verdictDe(decide([J2_QATT, humain], { renvois: [renvoiJuge("j1")] }));
    expect(v.mode_resolution).toBe("tranche_humain");
    expect(v.notations_sources).toEqual([J2_QATT.id, humain.id]);
  });

  it("le renvoi prime sur un extrait invalide de l'autre juge : seul attribution_indecidable est admis", () => {
    const invalide = notationJuge("j2", { ...QATT, ...inexacte(), extrait_justificatif: { provenance: "reponse", texte: "absent", verifie_deterministe: true } });
    expect(decide([invalide], { renvois: [renvoiJuge("j1")] })).toMatchObject({ statut: "en_attente", motifs: ["attribution_indecidable", "extrait_invalide"] });
    expect(() => decide([invalide, notationHumaine("a1", "extrait_invalide", QATT)], { renvois: [renvoiJuge("j1")] })).toThrow(NotationsIncoherentes);
  });

  it("le renvoi d'un juge retiré est écarté comme ses notations (D13)", () => {
    expect(verdictDe(decide([J2_QATT], { run: runDeNotation(["j1"]), renvois: [renvoiJuge("j1")] })).mode_resolution).toBe("juge_unique_apres_retrait");
  });

  it("un juge qui porte une notation et un renvoi sur l'objet, ou un renvoi d'un autre objet : incohérent", () => {
    expect(() => decide([notationJuge("j1", QATT), J2_QATT], { renvois: [renvoiJuge("j1")] })).toThrow(NotationsIncoherentes);
    expect(() => decide([J2_QATT], { renvois: [renvoiJuge("j1", { objet_note: { type: "reponse", id: ulid("autre") } })] })).toThrow(NotationsIncoherentes);
  });

  it("dans l'échantillon, le renvoi ne compte pas et les humains d'échantillon décident", () => {
    const humains = ["a1", "a2"].map((a) => notationHumaine(a, "echantillon_aleatoire_10", QATT));
    const v = verdictDe(decide([J2_QATT, ...humains], { renvois: [renvoiJuge("j1")], dans_echantillon_humain: true }));
    expect(v.mode_resolution).toBe("echantillon_humain_10");
  });
});

describe("drapeaux graves", () => {
  it("cas 3 : juges d'accord sur inexacte + fabrication → jamais accord_juges, revue humaine requise", () => {
    const a = notationJuge("j1", inexacte(["fabrication"]));
    const b = notationJuge("j2", inexacte(["fabrication"]));
    expect(decide([a, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["drapeau_grave"] });
  });

  it("cas 3, suite : l'humain confirme → revue_erreur_grave, erreur_grave vrai", () => {
    const a = notationJuge("j1", inexacte(["fabrication"]));
    const b = notationJuge("j2", inexacte(["fabrication"]));
    const humain = notationHumaine("a4", "erreur_grave", inexacte(["fabrication"]));
    const v = verdictDe(decide([a, b, humain]));
    expect(v).toMatchObject({ mode_resolution: "revue_erreur_grave", erreur_grave: true, drapeaux_retenus: ["fabrication"] });
    expect(v.notations_sources).toEqual([a.id, b.id, humain.id]);
  });

  it("l'humain infirme la fabrication → revue_erreur_grave, mais pas d'erreur grave publiée", () => {
    const a = notationJuge("j1", inexacte(["mauvaise_attribution"]));
    const b = notationJuge("j2", inexacte(["mauvaise_attribution"]));
    const humain = notationHumaine("a4", "erreur_grave");
    const v = verdictDe(decide([a, b, humain]));
    expect(v).toMatchObject({ mode_resolution: "revue_erreur_grave", erreur_grave: false, categorie_retenue: "exacte" });
  });

  it("un seul juge pose une mauvaise attribution : désaccord et drapeau grave, revue_erreur_grave", () => {
    const a = notationJuge("j1", inexacte(["mauvaise_attribution"]));
    const b = notationJuge("j2", inexacte());
    expect(decide([a, b])).toMatchObject({ statut: "en_attente", motifs: ["desaccord_juges", "drapeau_grave"] });
    const humain = notationHumaine("a2", "desaccord_juges", inexacte(["mauvaise_attribution"]));
    expect(verdictDe(decide([a, b, humain]))).toMatchObject({ mode_resolution: "revue_erreur_grave", desaccord_juges: true, erreur_grave: true });
  });

  it("désaccord sans drapeau grave tranché par un humain qui en pose un → revue_erreur_grave", () => {
    const b = notationJuge("j2", inexacte());
    const humain = notationHumaine("a2", "desaccord_juges", inexacte(["fabrication"]));
    expect(verdictDe(decide([J1, b, humain])).mode_resolution).toBe("revue_erreur_grave");
  });
});

describe("désaccord et ce qui fait une note différente (D14 (3))", () => {
  it("désaccord sur la catégorie → humain, puis tranche_humain", () => {
    const b = notationJuge("j2", inexacte());
    expect(decide([J1, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["desaccord_juges"] });
    const humain = notationHumaine("a1", "desaccord_juges");
    expect(verdictDe(decide([J1, b, humain]))).toMatchObject({ mode_resolution: "tranche_humain", desaccord_juges: true });
  });

  it("cas 4 : juges qui ne diffèrent que sur obsolescence_fraiche → désaccord", () => {
    const a = notationJuge("j1", { ...inexacte(["obsolescence"]), obsolescence_fraiche: true });
    const b = notationJuge("j2", { ...inexacte(["obsolescence"]), obsolescence_fraiche: false });
    expect(decide([a, b])).toMatchObject({ statut: "en_attente", motifs: ["desaccord_juges"] });
  });

  it("cas 4 : un lien existant mais non soutenant contre un lien existant et soutenant → désaccord", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("existe", "soutient")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    expect(decide([a, b])).toMatchObject({ statut: "en_attente", motifs: ["desaccord_juges"] });
  });

  it("cas 4 : lien soutenant différent chez chacun, même sourçage valide → accord", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("existe", "soutient", "https://exemple.invalid/a")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "soutient", "https://exemple.invalid/b")] } });
    const v = verdictDe(decide([a, b]));
    expect(v.mode_resolution).toBe("accord_juges");
    expect(v.sourcage_retenu).toEqual({ cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: true });
  });

  it("cas 4 : lien mort contre lien existant non soutenant, aucun sourçage valide → accord sur la note", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("mort", "non_applicable")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    // Même note lue (aucun sourçage valide), mais `au_moins_un_lien_existant` diffère : pas de note commune.
    expect(decide([a, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["accord_sans_note_commune"] });
  });

  it("accord mais motif d'inexactitude différent : pas de note commune, un humain la donne", () => {
    const a = notationJuge("j1", inexacte());
    const b = notationJuge("j2", { ...inexacte(), motif_inexactitude: "position_opposee" });
    expect(decide([a, b])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["accord_sans_note_commune"] });
  });
});

describe("accord partiel des juges (D15) : un humain sous accord_partiel_juges", () => {
  const A = notationJuge("j1", inexacte());
  const B = notationJuge("j2", { ...inexacte(), motif_inexactitude: "position_opposee" });

  it("humain présent sous accord_partiel_juges : sa note est retenue, tranche_humain, sources = deux juges + l'humain", () => {
    const humain = notationHumaine("a1", "accord_partiel_juges", { ...inexacte(), motif_inexactitude: "position_opposee" });
    const v = verdictDe(decide([A, B, humain]));
    expect(v).toMatchObject({ mode_resolution: "tranche_humain", motif_inexactitude_retenu: "position_opposee", desaccord_juges: false, erreur_grave: false });
    expect(v.notations_sources).toEqual([A.id, B.id, humain.id]);
    expect(v.revue_humaine).toMatchObject({ effectuee: true, annotateurs: ["a1"] });
  });

  it("l'humain appelé pose un drapeau grave : revue_erreur_grave", () => {
    const humain = notationHumaine("a1", "accord_partiel_juges", inexacte(["fabrication"]));
    expect(verdictDe(decide([A, B, humain]))).toMatchObject({ mode_resolution: "revue_erreur_grave", erreur_grave: true });
  });

  it("sourçage partiel (existence d'un lien) : même règle", () => {
    const a = notationJuge("j1", { sourcage: { cite: true, liens: [lien("mort", "non_applicable")] } });
    const b = notationJuge("j2", { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    const humain = notationHumaine("a1", "accord_partiel_juges", { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } });
    expect(verdictDe(decide([a, b, humain])).mode_resolution).toBe("tranche_humain");
  });

  it("humain sous desaccord_juges alors que la situation est un accord partiel : incohérence", () => {
    expect(() => decide([A, B, notationHumaine("a1", "desaccord_juges", inexacte())])).toThrow(NotationsIncoherentes);
    expect(() => decide([A, B, notationHumaine("a1", "erreur_grave", inexacte())])).toThrow(/accord_partiel_juges/);
  });

  it("accord_partiel_juges sur un vrai désaccord : incohérence", () => {
    expect(() => decide([J1, notationJuge("j2", inexacte()), notationHumaine("a1", "accord_partiel_juges")])).toThrow(NotationsIncoherentes);
  });

  it("accord_partiel_juges sur un accord complet : incohérence, rien ne l'exige", () => {
    expect(() => decide([J1, J2, notationHumaine("a1", "accord_partiel_juges")])).toThrow(/ne l'exige/);
  });

  it("accord_partiel_juges après un extrait invalide : incohérence, extrait_invalide est exigé", () => {
    const invalide = notationJuge("j2", { ...inexacte(), extrait_justificatif: { provenance: "reponse", texte: "absent", verifie_deterministe: true } });
    expect(() => decide([J1, invalide, notationHumaine("a1", "accord_partiel_juges")])).toThrow(/extrait_invalide/);
  });

  it("accord_partiel_juges sur une réponse de l'échantillon : incohérence", () => {
    const humains = ["a1", "a2"].map((a) => notationHumaine(a, "echantillon_aleatoire_10"));
    expect(() => decide([J1, J2, ...humains, notationHumaine("a3", "accord_partiel_juges")], { dans_echantillon_humain: true })).toThrow(NotationsIncoherentes);
  });
});

describe("juge retiré (D13)", () => {
  const RUN = runDeNotation(["j2"]);

  it("cas 6 : juge retiré, réponse hors échantillon → juge_unique_apres_retrait", () => {
    const v = verdictDe(decide([J1, notationJuge("j2", inexacte())], { run: RUN }));
    expect(v).toMatchObject({ mode_resolution: "juge_unique_apres_retrait", notations_sources: [J1.id], desaccord_juges: false });
  });

  it("cas 6 : le juge restant pose une fabrication → revue humaine, pas juge_unique", () => {
    const restant = notationJuge("j1", inexacte(["fabrication"]));
    expect(decide([restant, J2], { run: RUN })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["drapeau_grave"] });
    const humain = notationHumaine("a1", "erreur_grave", inexacte(["fabrication"]));
    const v = verdictDe(decide([restant, J2, humain], { run: RUN }));
    expect(v.mode_resolution).toBe("revue_erreur_grave");
    expect(v.notations_sources).toEqual([restant.id, humain.id]);
  });

  it("cas 7 : la seule fabrication vient du juge retiré → ignorée, sans revue grave", () => {
    const retire = notationJuge("j2", inexacte(["fabrication"]));
    const v = verdictDe(decide([J1, retire], { run: RUN }));
    expect(v).toMatchObject({ mode_resolution: "juge_unique_apres_retrait", erreur_grave: false });
    expect(v.notations_sources).not.toContain(retire.id);
  });

  it("l'extrait invalide du juge restant → humain", () => {
    const restant = notationJuge("j1", {
      ...inexacte(),
      extrait_justificatif: { provenance: "reponse", texte: "absent", verifie_deterministe: false },
    });
    expect(decide([restant], { run: RUN })).toEqual({ statut: "en_attente", attend: "humain", motifs: ["extrait_invalide"] });
  });

  it("aucune notation du juge restant → en attente du juge, pas d'un humain", () => {
    expect(decide([J2], { run: RUN })).toEqual({ statut: "en_attente", attend: "juge", motifs: ["notation_juge_manquante"] });
  });

  it("les deux juges retirés : erreur, aucune note de juge ne reste", () => {
    expect(() => decide([J1], { run: runDeNotation(["j1", "j2"]) })).toThrow(NotationsIncoherentes);
  });

  it("dans l'échantillon, la notation du juge retiré ne figure pas dans les sources", () => {
    const retire = notationJuge("j2", inexacte(["fabrication"]));
    const h1 = notationHumaine("a1", "echantillon_aleatoire_10");
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    const v = verdictDe(decide([J1, retire, h1, h2], { run: RUN, dans_echantillon_humain: true }));
    expect(v.notations_sources).toEqual([J1.id, h1.id, h2.id]);
  });
});

describe("échantillon humain", () => {
  const H1 = notationHumaine("a1", "echantillon_aleatoire_10", inexacte());
  const H2 = notationHumaine("a2", "echantillon_aleatoire_10", inexacte());

  it("cas 8 : deux humains d'accord, juges en désaccord → note humaine", () => {
    const v = verdictDe(decide([J1, notationJuge("j2", inexacte()), H1, H2], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({
      mode_resolution: "echantillon_humain_10",
      categorie_retenue: "inexacte",
      desaccord_juges: true,
      dans_echantillon_humain: true,
    });
  });

  it("cas 8 : juges d'accord, la note humaine prévaut quand même", () => {
    const v = verdictDe(decide([J1, J2, H1, H2], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "inexacte" });
  });

  it("cas 8 : deux humains en désaccord sans troisième → en attente", () => {
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    expect(decide([J1, J2, H1, h2], { dans_echantillon_humain: true })).toEqual({
      statut: "en_attente",
      attend: "humain",
      motifs: ["arbitrage_echantillon_manquant"],
    });
  });

  it("cas 8 : deux humains en désaccord, le troisième arbitre → sa note", () => {
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...inexacte(), date: "2026-12-07T10:00:00+01:00" });
    const v = verdictDe(decide([J1, J2, H1, h2, arbitre], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "inexacte" });
    expect(v.notations_sources).toEqual([J1.id, J2.id, H1.id, h2.id, arbitre.id]);
    expect(v.revue_humaine).toEqual({ effectuee: true, date: arbitre.date, annotateurs: ["a1", "a2", "a3"] });
  });

  it("un seul humain sur deux → en attente", () => {
    expect(decide([J1, J2, H1], { dans_echantillon_humain: true })).toEqual({
      statut: "en_attente",
      attend: "humain",
      motifs: ["double_notation_humaine_incomplete"],
    });
  });

  it("l'humain peut rendre indeterminee", () => {
    const i1 = notationHumaine("a1", "echantillon_aleatoire_10", {
      categorie: "indeterminee",
      extrait_justificatif: { provenance: "reponse", texte: "supprimer la taxe", verifie_deterministe: true },
    });
    const i2 = notationHumaine("a2", "echantillon_aleatoire_10", { ...i1, id: ulid("i2"), notateur: { type: "humain", id: "a2" } });
    expect(verdictDe(decide([J1, J2, i1, i2], { dans_echantillon_humain: true })).categorie_retenue).toBe("indeterminee");
  });

  it("fabrication confirmée par les deux humains : erreur grave, mode échantillon", () => {
    const f1 = notationHumaine("a1", "echantillon_aleatoire_10", inexacte(["fabrication"]));
    const f2 = notationHumaine("a2", "echantillon_aleatoire_10", inexacte(["fabrication"]));
    const v = verdictDe(decide([J1, J2, f1, f2], { dans_echantillon_humain: true }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", erreur_grave: true });
  });

  it("humains d'échantillon sur une réponse hors échantillon : incohérence", () => {
    expect(() => decide([J1, J2, H1, H2])).toThrow(NotationsIncoherentes);
  });

  it("arbitrage alors que les deux humains s'accordent : incohérence", () => {
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10");
    expect(() => decide([J1, J2, H1, H2, arbitre], { dans_echantillon_humain: true })).toThrow(/s'accordent/);
  });

  it("arbitre qui est l'un des deux premiers : incohérence", () => {
    const h2 = notationHumaine("a2", "echantillon_aleatoire_10");
    const arbitre = notationHumaine("a1", "arbitrage_echantillon_10");
    expect(() => decide([J1, J2, H1, h2, arbitre], { dans_echantillon_humain: true })).toThrow(/troisième humain/);
  });
});

describe("§7 (0.31, D73 (14)) : deux humains de l'échantillon d'accord sur la note, motifs différents → troisième humain", () => {
  const ECH = { dans_echantillon_humain: true } as const;
  const H1 = notationHumaine("a1", "echantillon_aleatoire_10", inexacte());
  const H2 = notationHumaine("a2", "echantillon_aleatoire_10", { ...inexacte(), motif_inexactitude: "position_opposee" });

  it("sans troisième humain : en attente de l'arbitrage, jamais une note en repli ni un cas sans issue", () => {
    expect(decide([J1, J2, H1, H2], ECH)).toEqual({ statut: "en_attente", attend: "humain", motifs: ["arbitrage_echantillon_manquant"] });
  });

  it("le troisième humain rejoint le motif de l'un des deux : sa note est retenue, avec les trois humains pour sources", () => {
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...inexacte(), motif_inexactitude: "position_opposee", date: "2026-12-07T10:00:00+01:00" });
    const v = verdictDe(decide([J1, J2, H1, H2, arbitre], ECH));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "inexacte", motif_inexactitude_retenu: "position_opposee", dans_echantillon_humain: true });
    expect(v.notations_sources).toEqual([J1.id, J2.id, H1.id, H2.id, arbitre.id]);
    expect(v.revue_humaine).toEqual({ effectuee: true, date: arbitre.date, annotateurs: ["a1", "a2", "a3"] });
  });

  it("le troisième humain donne un troisième motif : §7 retient sa note, ce motif compris", () => {
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...inexacte(), motif_inexactitude: "omission" });
    const v = verdictDe(decide([J1, J2, H1, H2, arbitre], ECH));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", motif_inexactitude_retenu: "omission" });
  });

  it("le troisième humain change aussi la note : sa note est retenue, comme pour toute réponse arbitrée", () => {
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10");
    expect(verdictDe(decide([J1, J2, H1, H2, arbitre], ECH))).toMatchObject({ categorie_retenue: "exacte", mode_resolution: "echantillon_humain_10" });
  });

  it("l'arbitre ne peut pas être l'un des deux premiers", () => {
    const arbitre = notationHumaine("a2", "arbitrage_echantillon_10", inexacte());
    expect(() => decide([J1, J2, H1, H2, arbitre], ECH)).toThrow(/troisième humain/);
  });

});

describe("D75 (15) : deux humains de l'échantillon d'accord sur la note et le motif, sourçage partiel divergent → troisième humain (§7, 0.33)", () => {
  const ECH = { dans_echantillon_humain: true } as const;
  /** Aucun lien soutenant de part et d'autre : les deux notations s'accordent au sens de `notationsConcordent`. */
  const SANS_CITATION = { cite: false, liens: [] };
  const CITE_SANS_LIEN = { cite: true, liens: [] };
  const CITE_LIEN_MORT = { cite: true, liens: [lien("mort", "non_applicable")] };
  const CITE_LIEN_EXISTANT = { cite: true, liens: [lien("existe", "ne_soutient_pas")] };
  const humains = (s1: NotationIndividuelle["sourcage"], s2: NotationIndividuelle["sourcage"]): readonly [NotationIndividuelle, NotationIndividuelle] => [
    notationHumaine("a1", "echantillon_aleatoire_10", { ...inexacte(), sourcage: s1 }),
    notationHumaine("a2", "echantillon_aleatoire_10", { ...inexacte(), sourcage: s2 }),
  ];
  const CAS = [
    { nom: "cite seul", s1: SANS_CITATION, s2: CITE_SANS_LIEN },
    { nom: "au_moins_un_lien_existant seul", s1: CITE_LIEN_MORT, s2: CITE_LIEN_EXISTANT },
    { nom: "cite et au_moins_un_lien_existant", s1: SANS_CITATION, s2: CITE_LIEN_EXISTANT },
  ] as const;

  for (const { nom, s1, s2 } of CAS) {
    it(`D75 (15) : divergence sur ${nom} → en attente de l'arbitrage, jamais accord_sans_note_commune`, () => {
      const [h1, h2] = humains(s1, s2);
      expect(humainsAArbitrer(h1, h2)).toBe(true);
      expect(decide([J1, J2, h1, h2], ECH)).toEqual({ statut: "en_attente", attend: "humain", motifs: ["arbitrage_echantillon_manquant"] });
    });

    it(`D75 (15) : divergence sur ${nom}, après l'arbitrage → verdict, la note de l'arbitre retenue (sourçage compris)`, () => {
      const [h1, h2] = humains(s1, s2);
      const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...inexacte(), sourcage: s2, date: "2026-12-07T10:00:00+01:00" });
      const v = verdictDe(decide([J1, J2, h1, h2, arbitre], ECH));
      expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "inexacte", motif_inexactitude_retenu: "position_inventee", dans_echantillon_humain: true });
      expect(v.sourcage_retenu).toEqual(noteDe(arbitre).sourcage);
      expect(v.notations_sources).toEqual([J1.id, J2.id, h1.id, h2.id, arbitre.id]);
      expect(v.revue_humaine).toEqual({ effectuee: true, date: arbitre.date, annotateurs: ["a1", "a2", "a3"] });
    });
  }

  it("D75 (15) : l'arbitre donne un troisième sourçage partiel : sa note est retenue telle quelle, jamais une fusion des deux premières", () => {
    const [h1, h2] = humains(SANS_CITATION, CITE_LIEN_EXISTANT);
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...inexacte(), sourcage: CITE_LIEN_MORT });
    expect(verdictDe(decide([J1, J2, h1, h2, arbitre], ECH)).sourcage_retenu).toEqual({ cite: true, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false });
  });

  it("D75 (15) : l'arbitre ne peut pas être l'un des deux premiers", () => {
    const [h1, h2] = humains(SANS_CITATION, CITE_SANS_LIEN);
    const arbitre = notationHumaine("a1", "arbitrage_echantillon_10", { ...inexacte(), sourcage: CITE_SANS_LIEN });
    expect(() => decide([J1, J2, h1, h2, arbitre], ECH)).toThrow(/troisième humain/);
  });

  it("D75 (15) : accord complet (note, motif, cite, lien existant) → verdict des deux humains, aucun arbitre ; un arbitre en trop est incohérent", () => {
    const [h1, h2] = humains(CITE_LIEN_EXISTANT, CITE_LIEN_EXISTANT);
    expect(humainsAArbitrer(h1, h2)).toBe(false);
    const v = verdictDe(decide([J1, J2, h1, h2], ECH));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", sourcage_retenu: { cite: true, au_moins_un_lien_existant: true, au_moins_un_lien_soutenant: false } });
    expect(v.notations_sources).toEqual([J1.id, J2.id, h1.id, h2.id]);
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", inexacte());
    expect(() => decide([J1, J2, h1, h2, arbitre], ECH)).toThrow(/s'accordent/);
  });

  it("D75 (15) : hors échantillon, deux juges dans le même cas restent un accord partiel (D15), inchangé", () => {
    const j1 = notationJuge("j1", { sourcage: CITE_LIEN_MORT });
    const j2 = notationJuge("j2", { sourcage: CITE_LIEN_EXISTANT });
    expect(decide([j1, j2])).toEqual({ statut: "en_attente", attend: "humain", motifs: ["accord_sans_note_commune"] });
  });
});

describe("entrées rejetées", () => {
  it("cas 14 : notation de juge indeterminee → erreur", () => {
    const indetermine = { ...notationJuge("j2"), categorie: "indeterminee" as const };
    expect(() => decider(entree([J1, indetermine]))).toThrow(JugeIndetermine);
  });

  it("cas 14 : même d'un juge retiré", () => {
    const indetermine = { ...notationJuge("j2"), categorie: "indeterminee" as const };
    expect(() => decider(entree([J1, indetermine], { run: runDeNotation(["j2"]) }))).toThrow(JugeIndetermine);
  });

  it("notation d'un autre objet, d'un autre run, d'un autre contexte", () => {
    const autreObjet = notationJuge("j2", { objet_note: { type: "reponse", id: ulid("autre") } });
    const autreRun = notationJuge("j2", { run_id: ulid("autre-run") });
    const contrefactuel = notationJuge("j2", { contexte: "contrefactuel_candidat" });
    for (const intrus of [autreObjet, autreRun, contrefactuel]) {
      expect(() => decider(entree([J1, intrus]))).toThrow(NotationsIncoherentes);
    }
  });

  it("juge inconnu du run, deux notations d'un même juge", () => {
    expect(() => decider(entree([J1, notationJuge("j9")]))).toThrow(/n'est pas un juge du run/);
    expect(() => decider(entree([J1, { ...J1, id: ulid("doublon") }]))).toThrow(/deux notations/);
  });

  it("humain appelé sans raison, deux humains appelés", () => {
    expect(() => decider(entree([J1, J2, notationHumaine("a1", "desaccord_juges")]))).toThrow(/ne l'exige/);
    const b = notationJuge("j2", inexacte());
    const deux = [notationHumaine("a1", "desaccord_juges"), notationHumaine("a2", "desaccord_juges")];
    expect(() => decider(entree([J1, b, ...deux]))).toThrow(/2 humains/);
  });

  it("humain sous un motif hors de la règle (panel, jeu d'or)", () => {
    expect(() => decider(entree([J1, J2, notationHumaine("a1", "arbitrage_panel")]))).toThrow(/hors de la règle/);
  });

  it("aucune notation de juge : en attente des juges", () => {
    expect(decider(entree([]))).toEqual({ statut: "en_attente", attend: "juge", motifs: ["notation_juge_manquante"] });
  });
});

describe("D32 : refus de l'API noté par règle, sans juge", () => {
  const REGLE = notationRegle();
  const NON_REPONSE_HUMAINE = {
    categorie: "non_reponse" as const,
    extrait_justificatif: { provenance: "reference" as const, texte: "Nous ne toucherons pas", verifie_deterministe: true },
  };
  const REFUS_TEXTES = { reponse: "", citations_reference: TEXTES.citations_reference };

  it("hors échantillon, la notation par règle seule donne le verdict regle_refus_api, sans humain ni juge", () => {
    const v = verdictDe(decide([REGLE], { textes: REFUS_TEXTES }));
    expect(v).toMatchObject({
      mode_resolution: "regle_refus_api",
      categorie_retenue: "non_reponse",
      drapeaux_retenus: [],
      sourcage_retenu: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false },
      notations_sources: [REGLE.id],
      desaccord_juges: false,
      dans_echantillon_humain: false,
      erreur_grave: false,
    });
    expect(v.revue_humaine).toBeUndefined();
  });

  it("un juge retiré (D13) est sans effet sur la règle : même verdict", () => {
    const run = runDeNotation(["j2"]);
    expect(decide([REGLE], { run, textes: REFUS_TEXTES })).toEqual(decide([REGLE], { textes: REFUS_TEXTES }));
  });

  it("dans l'échantillon, la double notation humaine reste exigée (§7, « quel que soit l'accord des juges ») : en attente des humains", () => {
    expect(decide([REGLE], { dans_echantillon_humain: true, textes: REFUS_TEXTES })).toEqual({
      statut: "en_attente",
      attend: "humain",
      motifs: ["double_notation_humaine_incomplete"],
    });
    const une = notationHumaine("a1", "echantillon_aleatoire_10", NON_REPONSE_HUMAINE);
    expect(decide([REGLE, une], { dans_echantillon_humain: true, textes: REFUS_TEXTES })).toMatchObject({ statut: "en_attente", attend: "humain" });
  });

  it("dans l'échantillon, deux humains d'accord : leur note prévaut, la règle reste parmi les sources pour la comparaison", () => {
    const a = notationHumaine("a1", "echantillon_aleatoire_10", NON_REPONSE_HUMAINE);
    const b = notationHumaine("a2", "echantillon_aleatoire_10", NON_REPONSE_HUMAINE);
    const v = verdictDe(decide([REGLE, a, b], { dans_echantillon_humain: true, textes: REFUS_TEXTES }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "non_reponse", notations_sources: [REGLE.id, a.id, b.id], dans_echantillon_humain: true });
    expect(v.revue_humaine?.annotateurs).toEqual(["a1", "a2"]);
  });

  it("dans l'échantillon, des humains qui divergent entre eux : l'arbitre tranche, même contre la règle", () => {
    const a = notationHumaine("a1", "echantillon_aleatoire_10", NON_REPONSE_HUMAINE);
    const b = notationHumaine("a2", "echantillon_aleatoire_10", { ...NON_REPONSE_HUMAINE, categorie: "indeterminee" });
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...NON_REPONSE_HUMAINE, categorie: "indeterminee" });
    const v = verdictDe(decide([REGLE, a, b, arbitre], { dans_echantillon_humain: true, textes: REFUS_TEXTES }));
    expect(v).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "indeterminee", notations_sources: [REGLE.id, a.id, b.id, arbitre.id] });
  });

  it("une notation de juge, même d'un juge retiré, ou un renvoi, sur une réponse notée par règle : incohérent", () => {
    const juge = notationJuge("j1", NON_REPONSE_HUMAINE);
    expect(() => decider(entree([REGLE, juge], { textes: REFUS_TEXTES }))).toThrow(NotationsIncoherentes);
    expect(() => decider(entree([REGLE, notationJuge("j2", NON_REPONSE_HUMAINE)], { run: runDeNotation(["j2"]), textes: REFUS_TEXTES }))).toThrow(NotationsIncoherentes);
    expect(() => decider(entree([REGLE], { renvois: [renvoiJuge("j1")], textes: REFUS_TEXTES }))).toThrow(NotationsIncoherentes);
  });

  it("deux notations par règle, ou un humain appelé hors échantillon sur une réponse notée par règle : incohérent", () => {
    expect(() => decider(entree([REGLE, { ...REGLE, id: ulid("autre-regle") }], { textes: REFUS_TEXTES }))).toThrow(NotationsIncoherentes);
    const appele = notationHumaine("a1", "desaccord_juges", NON_REPONSE_HUMAINE);
    expect(() => decider(entree([REGLE, appele], { textes: REFUS_TEXTES }))).toThrow(NotationsIncoherentes);
    const echantillon = notationHumaine("a1", "echantillon_aleatoire_10", NON_REPONSE_HUMAINE);
    expect(() => decider(entree([REGLE, echantillon], { textes: REFUS_TEXTES }))).toThrow(NotationsIncoherentes);
  });
});
