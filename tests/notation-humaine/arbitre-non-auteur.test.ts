/**
 * §7 (protocole 0.27, D67) : « Le troisième humain n'est jamais l'auteur, qui connaît la table des
 * alias d'outils. » Le pseudonyme de l'auteur vient de `run.annotateur_auteur` (écrit au gel).
 * Le refus est nommé, rien n'est écrit ; l'auteur reste libre d'être le premier ou le second
 * annotateur ; un run sans la déclaration refuse l'arbitrage en le disant.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { Contexte } from "../../notation-humaine/serveur/contexte.ts";
import { MOTIFS_ARBITRAGE_HUMAIN, refusArbitreAuteur } from "../../pipeline/notation/arbitre-non-auteur.ts";
import { appeler, AUTEUR, humain, SAISIE_EXACTE, type Monde, monter } from "./fixture.ts";

let monde: Monde | null = null;

afterEach(() => {
  monde?.nettoyer();
  monde = null;
});

function poser(options: Parameters<typeof monter>[0] = {}): Monde {
  monde = monter(options);
  return monde;
}

const INEXACTE = { categorie: "inexacte", drapeaux: [], cite: false, soutiens: [], motif_inexactitude: "omission", extrait: { texte: "ramener la TVA", provenance: "reponse" } } as const;
const INEXACTE_ECRITE = { categorie: "inexacte" as const, drapeaux: [], motif_inexactitude: "omission" as const, extrait_justificatif: { provenance: "reponse" as const, texte: "ramener la TVA", verifie_deterministe: true } };

function noter(contexte: Contexte, reponse_id: string, saisie: unknown = SAISIE_EXACTE) {
  return appeler(contexte, "notation", [], { reponse_id, saisie });
}

/** L'échantillon : deux premiers qui divergent, l'arbitrage est ouvert à un troisième. */
function echantillonADepartager(m: Monde): void {
  expect(noter(m.contexte("premier-1"), m.dans.id).statut).toBe(201);
  expect(noter(m.contexte("second-2"), m.dans.id, INEXACTE).statut).toBe(201);
}

/** Le jeu d'or du pilote : deux calibrations qui divergent, l'arbitrage est ouvert. */
function jeuOrADepartager(m: Monde) {
  const r = m.hors[0];
  if (r === undefined) throw new Error("réponse attendue");
  m.ecrire(humain(m, "calib-1", "calibration_jeu_or", r), humain(m, "calib-2", "calibration_jeu_or", r, INEXACTE_ECRITE));
  return r;
}

describe("la règle, sur les trois places d'arbitrage", () => {
  it.each(MOTIFS_ARBITRAGE_HUMAIN)("%s : l'auteur est refusé, code arbitre_est_l_auteur", (motif) => {
    const refus = refusArbitreAuteur(motif, AUTEUR, AUTEUR);
    expect(refus?.code).toBe("arbitre_est_l_auteur");
    expect(refus?.detail).toContain(AUTEUR);
  });

  it.each(MOTIFS_ARBITRAGE_HUMAIN)("%s : un tiers est accepté", (motif) => {
    expect(refusArbitreAuteur(motif, "tiers", AUTEUR)).toBeUndefined();
  });

  it.each(MOTIFS_ARBITRAGE_HUMAIN)("%s : run sans annotateur_auteur ⇒ refus nommé auteur_non_declare, pas d'acceptation par défaut", (motif) => {
    expect(refusArbitreAuteur(motif, "tiers", undefined)?.code).toBe("auteur_non_declare");
  });

  it.each(["echantillon_aleatoire_10", "double_notation_comparateur", "calibration_jeu_or", "desaccord_juges"])("%s n'est pas une place d'arbitrage : l'auteur y reste permis", (motif) => {
    expect(refusArbitreAuteur(motif, AUTEUR, AUTEUR)).toBeUndefined();
    expect(refusArbitreAuteur(motif, AUTEUR, undefined)).toBeUndefined();
  });
});

describe("l'écran de notation humaine", () => {
  it("arbitrage_echantillon_10 par l'auteur : 422 arbitre_est_l_auteur, aucune notation écrite", () => {
    const m = poser();
    echantillonADepartager(m);
    const avant = m.notationsEcrites();
    const reponse = noter(m.contexte(AUTEUR), m.dans.id);
    expect(reponse.statut).toBe(422);
    expect(reponse.corps).toMatchObject({ statut: "refusee", motifs: [{ code: "arbitre_est_l_auteur" }] });
    expect(m.notationsEcrites()).toEqual(avant);
  });

  it("arbitrage_echantillon_10 par un tiers : accepté (non-régression)", () => {
    const m = poser();
    echantillonADepartager(m);
    expect(noter(m.contexte("tiers-3"), m.dans.id).statut).toBe(201);
  });

  it("arbitrage_jeu_or par l'auteur : 422 arbitre_est_l_auteur, aucune notation écrite", () => {
    const m = poser({ type_run: "pilote" });
    const r = jeuOrADepartager(m);
    const avant = m.notationsEcrites();
    const reponse = noter(m.contexte(AUTEUR), r.id);
    expect(reponse.statut).toBe(422);
    expect(reponse.corps).toMatchObject({ statut: "refusee", motifs: [{ code: "arbitre_est_l_auteur" }] });
    expect(m.notationsEcrites()).toEqual(avant);
  });

  it("arbitrage_jeu_or par un tiers : accepté (non-régression)", () => {
    const m = poser({ type_run: "pilote" });
    const r = jeuOrADepartager(m);
    expect(noter(m.contexte("tiers-3"), r.id).statut).toBe(201);
  });

  it("l'auteur comme premier annotateur d'une double notation : permis (le §7 n'interdit que la troisième place)", () => {
    const m = poser();
    expect(noter(m.contexte(AUTEUR), m.dans.id).statut).toBe(201);
  });

  it("l'auteur comme second annotateur d'une double notation : permis", () => {
    const m = poser();
    expect(noter(m.contexte("premier-1"), m.dans.id).statut).toBe(201);
    expect(noter(m.contexte(AUTEUR), m.dans.id, INEXACTE).statut).toBe(201);
  });

  it("run sans annotateur_auteur (ancien run) : l'arbitrage est refusé en nommant auteur_non_declare, une notation ordinaire reste permise", () => {
    const m = poser({ annotateur_auteur: null });
    expect(noter(m.contexte("premier-1"), m.dans.id).statut).toBe(201);
    expect(noter(m.contexte("second-2"), m.dans.id, INEXACTE).statut).toBe(201);
    const avant = m.notationsEcrites();
    const reponse = noter(m.contexte("tiers-3"), m.dans.id);
    expect(reponse.statut).toBe(422);
    expect(reponse.corps).toMatchObject({ statut: "refusee", motifs: [{ code: "auteur_non_declare" }] });
    expect(m.notationsEcrites()).toEqual(avant);
  });
});
