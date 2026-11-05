/**
 * File de travail des annotateurs humains (§7 ; D18). Cas limites 4 à 9 du brief notation-humaine.
 * Chaque notation d'entrée est validée contre `schema/notation.schema.json`.
 */

import { describe, expect, it } from "vitest";
import { ulid } from "../analysis/fabriques.ts";
import { decider, NotationsIncoherentes } from "../../pipeline/notation/decision.ts";
import { createHash } from "node:crypto";
import {
  CLE_ECHANTILLON_HUMAIN,
  CLE_JEU_OR,
  CLE_ORDRE_FILE_HUMAINE,
  ordreEchantillonHumain,
  ordreFileHumaine,
  tirerEchantillonHumain,
  tirerJeuOr,
  type JeuOr,
} from "../../pipeline/notation/echantillons.ts";
import { construireFile, FileIncoherente, separerCalibration, type EntreeFile, type FileHumaine } from "../../pipeline/notation/file-humaine.ts";
import { MOTIFS_HUMAINS, PseudonymeVide } from "../../pipeline/notation/notation-humaine.ts";
import type { NotationIndividuelle, RunDeNotation } from "../../pipeline/notation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { inexacte, lien, notationHumaine, notationJuge, notationRegle, renvoiDefaillant, renvoiJuge, REPONSE_PROJETEE, runDeNotation } from "./fabriques.ts";

const TEXTES = { reponse: REPONSE_PROJETEE, citations_reference: ["Nous ne toucherons pas à la taxe foncière."] };

function reponseIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => ulid(`file-reponse-${i}`));
}

function sur(id: string) {
  return { objet_note: { type: "reponse" as const, id } };
}

/** Les deux juges d'accord (exacte) sur chaque réponse donnée, ou le seul juge restant. */
function jugesDAccord(ids: readonly string[], juges: readonly string[] = ["j1", "j2"]): NotationIndividuelle[] {
  return ids.flatMap((id) => juges.map((j) => notationJuge(j, sur(id))));
}

function entree(ids: readonly string[], notations: readonly NotationIndividuelle[], options: Partial<EntreeFile> = {}): EntreeFile {
  for (const n of notations) valider("notation", n, `notation de test ${n.id}`);
  return {
    run: runDeNotation(),
    reponses: ids.map((reponse_id) => ({ reponse_id, textes: TEXTES })),
    notations,
    renvois: [],
    jeu_or: null,
    ...options,
  };
}

function echantillonDe(ids: readonly string[], run: RunDeNotation = runDeNotation()): readonly string[] {
  return tirerEchantillonHumain(ids, run.graines.echantillon_humain, run.taux_echantillon_humain);
}

/** Les réponses retenues, rangées dans l'ordre tiré de la file (D79). */
function dansLOrdreDeLaFile(ids: readonly string[], retenues: readonly string[], run: RunDeNotation = runDeNotation()): readonly string[] {
  return ordreFileHumaine(ids, run.graines.echantillon_humain).filter((id) => retenues.includes(id));
}

function tachesDe(file: FileHumaine, reponse_id: string) {
  return file.taches.filter((t) => t.reponse_id === reponse_id);
}

const IDS = reponseIds(10);
const [DANS] = echantillonDe(IDS) as [string];
const HORS = IDS.filter((id) => id !== DANS);
const [H1] = HORS as [string];

describe("échantillon humain", () => {
  it("le run de 10 réponses a un échantillon d'une réponse", () => {
    expect(echantillonDe(IDS)).toHaveLength(1);
  });

  it("0 notation faite : une tâche d'échantillon à deux places, personne d'exclu", () => {
    const file = construireFile(entree(IDS, jugesDAccord(IDS)));
    expect(tachesDe(file, DANS)).toEqual([{ reponse_id: DANS, motif_notation: "echantillon_aleatoire_10", places_restantes: 2, deja_notee_par: [] }]);
  });

  it("1 notation faite : une place, l'annotateur qui a noté ne revoit pas la tâche", () => {
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), notationHumaine("a1", "echantillon_aleatoire_10", sur(DANS))]));
    expect(tachesDe(file, DANS)).toEqual([{ reponse_id: DANS, motif_notation: "echantillon_aleatoire_10", places_restantes: 1, deja_notee_par: ["a1"] }]);
    expect(file.tachesPour("a1").some((t) => t.reponse_id === DANS)).toBe(false);
    expect(file.tachesPour("a2")).toContainEqual({ reponse_id: DANS, motif_notation: "echantillon_aleatoire_10" });
  });

  it("2 notations concordantes : aucune tâche", () => {
    const humains = ["a1", "a2"].map((a) => notationHumaine(a, "echantillon_aleatoire_10", sur(DANS)));
    expect(tachesDe(construireFile(entree(IDS, [...jugesDAccord(IDS), ...humains])), DANS)).toEqual([]);
  });

  it("2 notations discordantes : tâche d'arbitrage, inaccessible aux deux premiers", () => {
    const humains = [notationHumaine("a1", "echantillon_aleatoire_10", sur(DANS)), notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() })];
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), ...humains]));
    expect(tachesDe(file, DANS)).toEqual([{ reponse_id: DANS, motif_notation: "arbitrage_echantillon_10", places_restantes: 1, deja_notee_par: ["a1", "a2"] }]);
    expect(file.tachesPour("a1").some((t) => t.reponse_id === DANS)).toBe(false);
    expect(file.tachesPour("a2").some((t) => t.reponse_id === DANS)).toBe(false);
    expect(file.tachesPour("a3")).toContainEqual({ reponse_id: DANS, motif_notation: "arbitrage_echantillon_10" });
  });

  it("arbitrage rendu : plus aucune tâche", () => {
    const humains = [
      notationHumaine("a1", "echantillon_aleatoire_10", sur(DANS)),
      notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() }),
      notationHumaine("a3", "arbitrage_echantillon_10", sur(DANS)),
    ];
    expect(tachesDe(construireFile(entree(IDS, [...jugesDAccord(IDS), ...humains])), DANS)).toEqual([]);
  });

  it("un arbitre qui est l'un des deux premiers : incohérence, jamais ignorée", () => {
    const humains = [
      notationHumaine("a1", "echantillon_aleatoire_10", sur(DANS)),
      notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() }),
      notationHumaine("a1", "arbitrage_echantillon_10", sur(DANS)),
    ];
    expect(() => construireFile(entree(IDS, humains))).toThrow(FileIncoherente);
  });

  it("le même annotateur deux fois sous le même motif : incohérence", () => {
    const double = [notationHumaine("a1", "echantillon_aleatoire_10", sur(DANS)), { ...notationHumaine("a1", "echantillon_aleatoire_10", sur(DANS)), id: ulid("doublon") }];
    expect(() => construireFile(entree(IDS, double))).toThrow(FileIncoherente);
  });

  it("les tâches d'échantillon sont ouvertes même si un juge manque : la réponse attend aussi un juge", () => {
    const file = construireFile(entree(IDS, jugesDAccord(HORS)));
    expect(tachesDe(file, DANS)).toHaveLength(1);
    expect(file.attend_juge.map((a) => a.reponse_id)).toContain(DANS);
  });
});

describe("hors échantillon", () => {
  const autres = jugesDAccord(HORS.slice(1).concat(DANS));

  it("accord des juges : aucune tâche", () => {
    expect(tachesDe(construireFile(entree(IDS, jugesDAccord(IDS))), H1)).toEqual([]);
  });

  it("désaccord des juges : tâche desaccord_juges, une place", () => {
    const file = construireFile(entree(IDS, [...autres, notationJuge("j1", sur(H1)), notationJuge("j2", { ...sur(H1), ...inexacte() })]));
    expect(tachesDe(file, H1)).toEqual([{ reponse_id: H1, motif_notation: "desaccord_juges", places_restantes: 1, deja_notee_par: [] }]);
  });

  it("extrait invalide d'un juge : tâche extrait_invalide", () => {
    const invalide = { ...inexacte(), extrait_justificatif: { provenance: "reponse" as const, texte: "absent de la réponse", verifie_deterministe: true } };
    const file = construireFile(entree(IDS, [...autres, notationJuge("j1", { ...sur(H1), ...invalide }), notationJuge("j2", { ...sur(H1), ...inexacte() })]));
    expect(tachesDe(file, H1).map((t) => t.motif_notation)).toEqual(["extrait_invalide"]);
  });

  it("drapeau grave : tâche erreur_grave", () => {
    const grave = inexacte(["fabrication"]);
    const file = construireFile(entree(IDS, [...autres, notationJuge("j1", { ...sur(H1), ...grave }), notationJuge("j2", { ...sur(H1), ...grave })]));
    expect(tachesDe(file, H1).map((t) => t.motif_notation)).toEqual(["erreur_grave"]);
  });

  it("désaccord et drapeau grave ensemble : une seule tâche, desaccord_juges", () => {
    const file = construireFile(entree(IDS, [...autres, notationJuge("j1", sur(H1)), notationJuge("j2", { ...sur(H1), ...inexacte(["fabrication"]) })]));
    expect(tachesDe(file, H1).map((t) => t.motif_notation)).toEqual(["desaccord_juges"]);
  });

  it("notation de juge manquante : « attend un juge », pas une tâche", () => {
    const file = construireFile(entree(IDS, [...autres, notationJuge("j1", sur(H1))]));
    expect(tachesDe(file, H1)).toEqual([]);
    expect(file.attend_juge).toContainEqual({ reponse_id: H1, motifs: ["notation_juge_manquante"] });
  });

  it("aucune notation du tout : attend un juge", () => {
    expect(construireFile(entree(IDS, autres)).attend_juge.map((a) => a.reponse_id)).toEqual([H1]);
  });

  it("chaque tâche ouverte, une fois notée sous son motif, donne un verdict de decider", () => {
    const cas: readonly NotationIndividuelle[][] = [
      [notationJuge("j1", sur(H1)), notationJuge("j2", { ...sur(H1), ...inexacte() })],
      [notationJuge("j1", { ...sur(H1), ...inexacte(["fabrication"]) }), notationJuge("j2", { ...sur(H1), ...inexacte(["fabrication"]) })],
      [notationJuge("j1", { ...sur(H1), ...inexacte(), extrait_justificatif: { provenance: "reponse", texte: "absent", verifie_deterministe: true } }), notationJuge("j2", sur(H1))],
      [notationJuge("j1", { ...sur(H1), ...inexacte() }), notationJuge("j2", { ...sur(H1), ...inexacte(), motif_inexactitude: "position_opposee" })],
    ];
    for (const juges of cas) {
      const [tache] = tachesDe(construireFile(entree(IDS, [...autres, ...juges])), H1);
      if (tache === undefined) throw new Error("tâche attendue");
      const humain = notationHumaine("a1", tache.motif_notation, sur(H1));
      const decision = decider({ run: runDeNotation(), objet_note: { type: "reponse", id: H1 }, notations: [...juges, humain], renvois: [], dans_echantillon_humain: false, textes: TEXTES, verdict_id: ulid("v"), date: "2026-12-06T12:00:00+01:00" });
      expect(decision.statut).toBe("verdict");
      expect(tachesDe(construireFile(entree(IDS, [...autres, ...juges, humain])), H1)).toEqual([]);
    }
  });

  it("accord partiel des juges (D15) : tâche accord_partiel_juges, une place", () => {
    const j1 = notationJuge("j1", { ...sur(H1), ...inexacte() });
    const j2 = notationJuge("j2", { ...sur(H1), ...inexacte(), motif_inexactitude: "position_opposee" });
    const file = construireFile(entree(IDS, [...autres, j1, j2]));
    expect(tachesDe(file, H1)).toEqual([{ reponse_id: H1, motif_notation: "accord_partiel_juges", places_restantes: 1, deja_notee_par: [] }]);
    expect(file.sans_motif_admis).toEqual([]);
  });
});

describe("D30 (2) : renvoi d'un juge sur une Q-ATT indécidable", () => {
  it("la réponse hors échantillon devient une tâche humaine sous attribution_indecidable, puis sort de la file une fois notée", () => {
    const qatt = { gabarit: "Q-ATT" as const, attribution: { attendus: ["demo-alpha"], cites: ["demo-alpha"] } };
    const autres = jugesDAccord(IDS.filter((id) => id !== H1));
    const j2 = notationJuge("j2", { ...sur(H1), ...qatt });
    const renvois = [renvoiJuge("j1", sur(H1))];
    const [tache] = tachesDe(construireFile(entree(IDS, [...autres, j2], { renvois })), H1);
    expect(tache?.motif_notation).toBe("attribution_indecidable");
    const humain = notationHumaine("a1", "attribution_indecidable", { ...sur(H1), ...qatt });
    expect(tachesDe(construireFile(entree(IDS, [...autres, j2, humain], { renvois })), H1)).toEqual([]);
  });
});

describe("§7 (0.27) : renvoi d'un juge défaillant", () => {
  it("la réponse hors échantillon devient une tâche humaine sous juge_defaillant, puis sort de la file une fois notée", () => {
    const autres = jugesDAccord(IDS.filter((id) => id !== H1));
    const j2 = notationJuge("j2", sur(H1));
    const renvois = [renvoiDefaillant("j1", sur(H1))];
    const file = construireFile(entree(IDS, [...autres, j2], { renvois }));
    expect(tachesDe(file, H1)).toEqual([{ reponse_id: H1, motif_notation: "juge_defaillant", places_restantes: 1, deja_notee_par: [] }]);
    expect(file.comptes.juge_defaillant).toEqual({ taches: 1, places: 1 });
    const humain = notationHumaine("a1", "juge_defaillant", sur(H1));
    expect(tachesDe(construireFile(entree(IDS, [...autres, j2, humain], { renvois })), H1)).toEqual([]);
  });

  it("les deux juges défaillants sur la même réponse : une seule tâche, jamais une attente de juge", () => {
    const autres = jugesDAccord(IDS.filter((id) => id !== H1));
    const renvois = [renvoiDefaillant("j1", sur(H1)), renvoiDefaillant("j2", { ...sur(H1), motif: "sortie_refusee" })];
    const file = construireFile(entree(IDS, autres, { renvois }));
    expect(tachesDe(file, H1).map((t) => t.motif_notation)).toEqual(["juge_defaillant"]);
    expect(file.attend_juge.map((a) => a.reponse_id)).not.toContain(H1);
  });
});

describe("§7 (0.31, D73 (14)) : échantillon, deux humains d'accord sur la note mais motifs différents", () => {
  const humains = [
    notationHumaine("a1", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() }),
    notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte(), motif_inexactitude: "position_opposee" }),
  ];

  it("une tâche d'arbitrage, fermée aux deux premiers ; plus rien « sans motif admis »", () => {
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), ...humains]));
    expect(tachesDe(file, DANS)).toEqual([{ reponse_id: DANS, motif_notation: "arbitrage_echantillon_10", places_restantes: 1, deja_notee_par: ["a1", "a2"] }]);
    expect(file.sans_motif_admis).toEqual([]);
    expect(file.tachesPour("a3")).toContainEqual({ reponse_id: DANS, motif_notation: "arbitrage_echantillon_10" });
  });

  it("le troisième humain a noté (troisième motif compris) : la tâche se ferme, decider rend un verdict", () => {
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...sur(DANS), ...inexacte(), motif_inexactitude: "omission" });
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), ...humains, arbitre]));
    expect(tachesDe(file, DANS)).toEqual([]);
    expect(file.sans_motif_admis).toEqual([]);
  });

  it("un arbitrage alors que les deux humains ont le même motif : incohérent, levé par decider", () => {
    const memes = [notationHumaine("a1", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() }), notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() })];
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...sur(DANS), ...inexacte() });
    expect(() => construireFile(entree(IDS, [...jugesDAccord(IDS), ...memes, arbitre]))).toThrow(NotationsIncoherentes);
  });

  it("juges encore absents : la tâche d'arbitrage est ouverte quand même (elle ne dépend pas des juges)", () => {
    const file = construireFile(entree(IDS, [...jugesDAccord(HORS), ...humains]));
    expect(tachesDe(file, DANS).map((t) => t.motif_notation)).toEqual(["arbitrage_echantillon_10"]);
    expect(file.attend_juge.map((a) => a.reponse_id)).toContain(DANS);
  });

  it("juges encore absents, arbitrage de deux humains au même motif : FileIncoherente (contrôle propre à la file)", () => {
    const memes = [notationHumaine("a1", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() }), notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), ...inexacte() })];
    const arbitre = notationHumaine("a3", "arbitrage_echantillon_10", { ...sur(DANS), ...inexacte() });
    expect(() => construireFile(entree(IDS, [...jugesDAccord(HORS), ...memes, arbitre]))).toThrow(FileIncoherente);
  });
});

describe("échantillon : deux humains d'accord, même motif, sourçage partiel divergent (question ouverte)", () => {
  it("ni tâche, ni arbitrage (le §7 ne nomme que le motif) : la réponse est rapportée à part", () => {
    const humains = [
      notationHumaine("a1", "echantillon_aleatoire_10", { ...sur(DANS), sourcage: { cite: true, liens: [lien("mort", "non_applicable")] } }),
      notationHumaine("a2", "echantillon_aleatoire_10", { ...sur(DANS), sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } }),
    ];
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), ...humains]));
    expect(tachesDe(file, DANS)).toEqual([]);
    expect(file.sans_motif_admis).toEqual([{ reponse_id: DANS, motifs: ["accord_sans_note_commune"] }]);
  });
});

describe("juge retiré (taux 0,25)", () => {
  it("l'échantillon est rejoué au taux du run, et seul le juge restant est attendu", () => {
    const run = runDeNotation(["j1"]);
    expect(run.taux_echantillon_humain).toBe(0.25);
    const ids = reponseIds(8);
    const file = construireFile(entree(ids, jugesDAccord(ids, ["j2"]), { run }));
    const echantillon = echantillonDe(ids, run);
    expect(echantillon).toHaveLength(2);
    expect(file.taches.filter((t) => t.motif_notation === "echantillon_aleatoire_10").map((t) => t.reponse_id)).toEqual(dansLOrdreDeLaFile(ids, echantillon, run));
    expect(file.attend_juge).toEqual([]);
  });
});

describe("jeu d'or", () => {
  const PILOTE = reponseIds(12);
  const run = runDeNotation();
  const JEU: JeuOr = tirerJeuOr(PILOTE, run.graines.echantillon_humain);
  const [OR] = JEU.reponse_ids as [string];

  it("sous-effectif : les 12 réponses obtenues sont toutes au jeu d'or, deux places chacune", () => {
    const file = construireFile(entree(PILOTE, jugesDAccord(PILOTE), { jeu_or: JEU }));
    const calibration = file.taches.filter((t) => t.motif_notation === "calibration_jeu_or");
    expect(calibration.map((t) => t.reponse_id)).toEqual(dansLOrdreDeLaFile(PILOTE, JEU.reponse_ids, run));
    expect(calibration.every((t) => t.places_restantes === 2)).toBe(true);
  });

  it("deux places, annotateurs distincts : celui qui a noté ne revoit pas la tâche", () => {
    const file = construireFile(entree(PILOTE, [...jugesDAccord(PILOTE), notationHumaine("a1", "calibration_jeu_or", sur(OR))], { jeu_or: JEU }));
    expect(tachesDe(file, OR).find((t) => t.motif_notation === "calibration_jeu_or")).toEqual({ reponse_id: OR, motif_notation: "calibration_jeu_or", places_restantes: 1, deja_notee_par: ["a1"] });
    expect(file.tachesPour("a1")).not.toContainEqual({ reponse_id: OR, motif_notation: "calibration_jeu_or" });
    expect(file.tachesPour("a2")).toContainEqual({ reponse_id: OR, motif_notation: "calibration_jeu_or" });
  });

  it("ses notations n'entrent pas dans decider : accord des juges, deux calibrations, aucune tâche ni erreur", () => {
    const calibrations = ["a1", "a2"].map((a) => notationHumaine(a, "calibration_jeu_or", { ...sur(OR), ...inexacte() }));
    const echantillon = new Set(echantillonDe(PILOTE));
    const humainsEchantillon = PILOTE.filter((id) => echantillon.has(id)).flatMap((id) => ["a1", "a2"].map((a) => notationHumaine(a, "echantillon_aleatoire_10", sur(id))));
    const file = construireFile(entree(PILOTE, [...jugesDAccord(PILOTE), ...calibrations, ...humainsEchantillon], { jeu_or: JEU }));
    expect(tachesDe(file, OR).filter((t) => t.motif_notation === "calibration_jeu_or")).toEqual([]);
    expect(file.taches.filter((t) => t.reponse_id === OR)).toEqual([]);
    // decider, lui, refuse une notation de calibration : c'est pourquoi la file la sépare.
    expect(() =>
      decider({ run, objet_note: { type: "reponse", id: OR }, notations: [...jugesDAccord([OR]), ...calibrations], renvois: [], dans_echantillon_humain: echantillon.has(OR), textes: TEXTES, verdict_id: ulid("v"), date: "2026-12-06T12:00:00+01:00" }),
    ).toThrow(NotationsIncoherentes);
  });

  it("une réponse tirée dans l'échantillon et au jeu d'or est notée deux fois, sous deux motifs", () => {
    const [commune] = echantillonDe(PILOTE) as [string];
    const motifs = tachesDe(construireFile(entree(PILOTE, jugesDAccord(PILOTE), { jeu_or: JEU })), commune).map((t) => t.motif_notation);
    expect(motifs).toEqual(["echantillon_aleatoire_10", "calibration_jeu_or"]);
  });

  it("separerCalibration : la calibration d'un côté, tout le reste de l'autre", () => {
    const cal = notationHumaine("a1", "calibration_jeu_or", sur(OR));
    const ech = notationHumaine("a1", "echantillon_aleatoire_10", sur(OR));
    const juge = notationJuge("j1", sur(OR));
    expect(separerCalibration([cal, ech, juge])).toEqual({ decision: [ech, juge], calibration: [cal] });
  });

  it("un tirage du jeu d'or qui ne se rejoue pas sur les réponses obtenues : incohérence", () => {
    const faux: JeuOr = { ...JEU, reponse_ids: [...JEU.reponse_ids].reverse() };
    expect(() => construireFile(entree(PILOTE, jugesDAccord(PILOTE), { jeu_or: faux }))).toThrow(FileIncoherente);
  });

  it("une notation de calibration sans jeu d'or : incohérence", () => {
    expect(() => construireFile(entree(PILOTE, [notationHumaine("a1", "calibration_jeu_or", sur(OR))]))).toThrow(FileIncoherente);
  });

  it("une troisième notation de calibration : incohérence", () => {
    const trois = ["a1", "a2", "a3"].map((a) => notationHumaine(a, "calibration_jeu_or", sur(OR)));
    expect(() => construireFile(entree(PILOTE, trois, { jeu_or: JEU }))).toThrow(FileIncoherente);
  });
});

describe("ordre des tâches (D79 : tiré, indépendant du motif)", () => {
  const PILOTE = reponseIds(40);
  const run = runDeNotation();
  const JEU = tirerJeuOr(PILOTE, run.graines.echantillon_humain);
  const echantillon = echantillonDe(PILOTE);
  const ORDRE = ordreFileHumaine(PILOTE, run.graines.echantillon_humain);
  const rang = (id: string): number => ORDRE.indexOf(id);
  const horsEchantillon = ORDRE.filter((id) => !echantillon.includes(id));
  // X : la réponse hors échantillon la plus tôt dans l'ordre tiré ; Y : la plus tardive.
  const X = horsEchantillon[0] as string;
  const Y = horsEchantillon.at(-1) as string;
  const desaccords = [X, Y].flatMap((id) => [notationJuge("j1", sur(id)), notationJuge("j2", { ...sur(id), ...inexacte() })]);
  const notations = [...jugesDAccord(PILOTE.filter((id) => id !== X && id !== Y)), ...desaccords];

  it("1. le rang d'une tâche est celui de sa réponse dans l'ordre tiré, quel que soit son motif", () => {
    const file = construireFile(entree(PILOTE, notations, { jeu_or: JEU }));
    const motifsDe = (id: string): string[] => [
      ...(echantillon.includes(id) ? ["echantillon_aleatoire_10"] : []),
      ...(id === X || id === Y ? ["desaccord_juges"] : []),
      ...(JEU.reponse_ids.includes(id) ? ["calibration_jeu_or"] : []),
    ];
    // Réponse par réponse dans l'ordre tiré, motifs dans l'ordre de MOTIFS_HUMAINS.
    const attendu = ORDRE.flatMap((id) => MOTIFS_HUMAINS.filter((m) => motifsDe(id).includes(m)).map((m) => [m, id]));
    expect(file.taches.map((t) => [t.motif_notation, t.reponse_id])).toEqual(attendu);
  });

  it("2. l'ordre ne dépend pas du motif : une même réponse, tirée dans l'échantillon ou appelée par un désaccord des juges, garde sa place face aux autres", () => {
    // L'appartenance à l'échantillon ne dépend que du tirage, pas des notations : Z est dans
    // l'échantillon de 25 % (emboîté) mais pas dans celui de 10 %. Seuls le taux et les notations de
    // juge sur Z changent d'une entrée à l'autre.
    const run25 = runDeNotation([], { taux_echantillon_humain: 0.25 });
    const echantillon25 = tirerEchantillonHumain(PILOTE, run25.graines.echantillon_humain, 0.25);
    const Z = echantillon25.find((id) => !echantillon.includes(id) && id !== X && id !== Y) as string;
    const autres = PILOTE.filter((id) => id !== Z && id !== X && id !== Y);
    const desaccordZ = [notationJuge("j1", sur(Z)), notationJuge("j2", { ...sur(Z), ...inexacte() })];
    const dansEchantillon = construireFile({ ...entree(PILOTE, [...jugesDAccord([...autres, Z]), ...desaccords]), run: run25 });
    const parDesaccord = construireFile(entree(PILOTE, [...jugesDAccord(autres), ...desaccords, ...desaccordZ]));
    expect(tachesDe(dansEchantillon, Z).map((t) => t.motif_notation)).toEqual(["echantillon_aleatoire_10"]);
    expect(tachesDe(parDesaccord, Z).map((t) => t.motif_notation)).toEqual(["desaccord_juges"]);
    const idsDe = (file: FileHumaine): string[] => file.taches.map((t) => t.reponse_id);
    const communes = idsDe(parDesaccord).filter((id) => idsDe(dansEchantillon).includes(id));
    expect(communes).toContain(Z);
    expect(communes.length).toBeGreaterThan(2);
    expect(idsDe(dansEchantillon).filter((id) => communes.includes(id))).toEqual(communes);
  });

  it("3. une tâche hors échantillon peut précéder une tâche d'échantillon", () => {
    // Condition de la fixture : la première réponse hors échantillon est tirée avant au moins une de l'échantillon.
    expect(echantillon.some((id) => rang(id) > rang(X))).toBe(true);
    const file = construireFile(entree(PILOTE, notations));
    const position = (motif: string, id: string): number => file.taches.findIndex((t) => t.motif_notation === motif && t.reponse_id === id);
    const derniereEchantillon = Math.max(...echantillon.map((id) => position("echantillon_aleatoire_10", id)));
    expect(position("desaccord_juges", X)).toBeGreaterThanOrEqual(0);
    expect(position("desaccord_juges", X)).toBeLessThan(derniereEchantillon);
  });

  it("4. déterministe, quel que soit l'ordre des réponses et des notations reçues", () => {
    const reference = construireFile(entree(PILOTE, notations, { jeu_or: JEU }));
    for (const graine of [1n, 2n, 3n]) {
      const melangees = construireFile(entree(melanger(PILOTE, generateur(graine)), melanger(notations, generateur(graine + 10n)), { jeu_or: JEU }));
      expect(melangees.taches).toEqual(reference.taches);
      expect(melangees.tachesPour("a1")).toEqual(reference.tachesPour("a1"));
      expect(melangees.attend_juge).toEqual(reference.attend_juge);
    }
  });

  it("5. une même réponse sous deux motifs (échantillon et jeu d'or) : tâches adjacentes, départagées par MOTIFS_HUMAINS", () => {
    const file = construireFile(entree(PILOTE, notations, { jeu_or: JEU }));
    const doubles = echantillon.filter((id) => JEU.reponse_ids.includes(id));
    expect(doubles.length).toBeGreaterThan(0);
    for (const id of doubles) {
      const i = file.taches.findIndex((t) => t.reponse_id === id);
      expect(file.taches.slice(i, i + 2).map((t) => [t.motif_notation, t.reponse_id])).toEqual([
        ["echantillon_aleatoire_10", id],
        ["calibration_jeu_or", id],
      ]);
    }
  });

  it("6. clé distincte de l'échantillon et du jeu d'or : autre ordre sur les mêmes réponses, texte haché <valeur>␀ordre_file_humaine", () => {
    expect(CLE_ORDRE_FILE_HUMAINE).toEqual(["ordre_file_humaine"]);
    expect(CLE_ORDRE_FILE_HUMAINE).not.toEqual(CLE_ECHANTILLON_HUMAIN);
    expect(CLE_ORDRE_FILE_HUMAINE).not.toEqual(CLE_JEU_OR);
    const graine = run.graines.echantillon_humain;
    expect(graine.valeur).toBe(20261201);
    expect(ORDRE).not.toEqual(ordreEchantillonHumain(PILOTE, graine));
    expect(ORDRE).not.toEqual(tirerJeuOr(PILOTE, graine).reponse_ids);
    const empreinte = createHash("sha256").update("20261201\u0000ordre_file_humaine", "utf8").digest();
    const amorce = BigInt(`0x${empreinte.subarray(0, 8).toString("hex")}`);
    expect(ORDRE).toEqual(melanger([...PILOTE].sort(), generateur(amorce)));
  });

  it("7. une tâche dont la réponse n'est pas parmi les réponses obtenues : incohérence", () => {
    const etrangere = ulid("hors-des-obtenues");
    const notee = notationHumaine("a1", "desaccord_juges", sur(etrangere));
    expect(() => construireFile(entree(PILOTE, [...notations, notee]))).toThrow(FileIncoherente);
    const jeuEtranger: JeuOr = { ...JEU, reponse_ids: [etrangere, ...JEU.reponse_ids.slice(1)] };
    expect(() => construireFile(entree(PILOTE, notations, { jeu_or: jeuEtranger }))).toThrow(FileIncoherente);
  });

  it("8. run sans aucune tâche humaine : file vide, aucune erreur", () => {
    const faites = ["a1", "a2"].map((a) => notationHumaine(a, "echantillon_aleatoire_10", sur(DANS)));
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), ...faites]));
    expect(file.taches).toEqual([]);
    expect(file.tachesPour("a3")).toEqual([]);
    const vide = construireFile(entree([], []));
    expect(vide.taches).toEqual([]);
    expect(vide.tachesPour("a1")).toEqual([]);
  });

  it("tachesPour ne rend que la réponse et le motif, jamais les autres annotateurs", () => {
    const file = construireFile(entree(PILOTE, notations, { jeu_or: JEU }));
    for (const tache of file.tachesPour("a1")) expect(Object.keys(tache).sort()).toEqual(["motif_notation", "reponse_id"]);
  });

  it("le compte par motif : tâches et places restantes", () => {
    const file = construireFile(entree(PILOTE, notations, { jeu_or: JEU }));
    expect(file.comptes.echantillon_aleatoire_10).toEqual({ taches: echantillon.length, places: 2 * echantillon.length });
    expect(file.comptes.calibration_jeu_or).toEqual({ taches: 40, places: 80 });
    expect(file.comptes.desaccord_juges).toEqual({ taches: 2, places: 2 });
    expect(file.comptes.erreur_grave).toEqual({ taches: 0, places: 0 });
  });
});

describe("entrées", () => {
  it("pseudonyme vide : erreur", () => {
    const file = construireFile(entree(IDS, jugesDAccord(IDS)));
    expect(() => file.tachesPour("")).toThrow(PseudonymeVide);
    expect(() => file.tachesPour("  ")).toThrow(PseudonymeVide);
  });

  it("une notation sur une réponse absente des réponses obtenues : incohérence", () => {
    expect(() => construireFile(entree(IDS, [notationJuge("j1", sur(ulid("inconnue")))]))).toThrow(FileIncoherente);
  });

  it("une notation d'un autre run : incohérence", () => {
    expect(() => construireFile(entree(IDS, [notationJuge("j1", { ...sur(H1), run_id: ulid("autre-run") })]))).toThrow(FileIncoherente);
  });

  it("les notations de juge du test contrefactuel sont hors de la file", () => {
    const permutee = notationJuge("j1", { objet_note: { type: "reponse", id: ulid("permutee") }, contexte: "contrefactuel_candidat" });
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), permutee]));
    expect(file.taches.map((t) => t.reponse_id)).toEqual([DANS]);
  });

  it("les notations de lectures de comparateur sont hors de la file", () => {
    // D30 (4) : une lecture de comparateur ne porte pas de version de charge. D59 (15), §6 0.24 :
    // elle n'est notée que par des humains (le juge de cette notation d'entrée est devenu un humain).
    const { version_charge: _sansCharge, ...lecture } = notationHumaine("a1", "double_notation_comparateur", { objet_note: { type: "lecture_comparateur", id: ulid("lecture") } });
    const file = construireFile(entree(IDS, [...jugesDAccord(IDS), lecture]));
    expect(file.taches.map((t) => t.reponse_id)).toEqual([DANS]);
  });

  it("une notation humaine hors du contexte run : incohérence", () => {
    expect(() => construireFile(entree(IDS, [notationHumaine("a1", "echantillon_aleatoire_10", { ...sur(DANS), contexte: "jeu_or" })]))).toThrow(FileIncoherente);
  });

  it("une réponse en double : refusée", () => {
    expect(() => construireFile(entree([...IDS, H1], []))).toThrow(/en double/);
  });
});

describe("D32 : refus de l'API noté par règle", () => {
  const sansRefus = (refus: string) => jugesDAccord(IDS.filter((id) => id !== refus));

  it("hors échantillon : aucune tâche humaine, et la réponse n'attend aucun juge", () => {
    const file = construireFile(entree(IDS, [...sansRefus(H1), notationRegle(sur(H1))]));
    expect(tachesDe(file, H1)).toEqual([]);
    expect(file.attend_juge.map((a) => a.reponse_id)).not.toContain(H1);
  });

  it("dans l'échantillon : la double notation humaine reste à faire (§7), comme pour toute réponse tirée", () => {
    const file = construireFile(entree(IDS, [...sansRefus(DANS), notationRegle(sur(DANS))]));
    expect(tachesDe(file, DANS)).toEqual([{ reponse_id: DANS, motif_notation: "echantillon_aleatoire_10", places_restantes: 2, deja_notee_par: [] }]);
    expect(file.attend_juge.map((a) => a.reponse_id)).not.toContain(DANS);
  });
});
