/**
 * Cas limite 9 (décision D39) : le gel lit `data/formulations/` et rend des `question` conformes au
 * schéma, ou refuse en listant toutes les questions en défaut. Q1, option (a) : une formulation
 * promue sur une position périmée (item corrigé, texte neutre inchangé) fait aussi refuser le gel.
 */

import { describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import { FormulationsEnDefautAuGel, questionsAuGel } from "../../pipeline/reformulation/lecture-au-gel.ts";
import {
  formulationsValideesDe,
  type FormulationsValidees,
  type PropositionAcceptee,
} from "../../pipeline/reformulation/relecture.ts";
import { AUCUNE } from "../../pipeline/reformulation/position-affirmee.ts";
import { identifiants, jeu, jeuO, proposition, questionDe, RELECTEUR, surAutreTexte, toutCoche } from "./fabriques-relecture.ts";

const ENGENDREE_LE = "2026-12-01T06:00:00+01:00";
const { taches } = jeu();

function promue(tache: Tache): FormulationsValidees {
  const prop = proposition(tache, { cle: `gel:${tache.question.id}:${tache.demande.position_affirmee}` }) as PropositionAcceptee;
  return formulationsValideesDe(tache, prop, toutCoche(), { ...RELECTEUR, commentaire: null }, identifiants(tache.question.id));
}

function toutes(jeuDeTaches: readonly Tache[] = taches): Map<string, FormulationsValidees> {
  return new Map(jeuDeTaches.map((tache) => [tache.question.id, promue(tache)]));
}

function erreurDe(appel: () => unknown): FormulationsEnDefautAuGel {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof FormulationsEnDefautAuGel) return erreur;
    throw erreur;
  }
  throw new Error("Le gel a été accepté alors qu'un refus était attendu.");
}

describe("cas limite 9 : lecture des formulations au gel", () => {
  it("le jeu porte au moins une question qui nomme un candidat et une question d'attribution", () => {
    expect(taches.map((tache) => tache.question.gabarit)).toEqual(expect.arrayContaining(["Q-FER", "Q-ATT"]));
  });

  it("toutes présentes ⇒ des questions conformes au schéma question, mêmes id, gabarit, items, grappe", () => {
    const rendues = questionsAuGel(taches, toutes(), ENGENDREE_LE);
    expect(rendues).toHaveLength(taches.length);
    rendues.forEach((question, rang) => {
      const engendree = (taches[rang] as Tache).question;
      expect(() => valider("question", question, "essai")).not.toThrow();
      expect(question.id).toBe(engendree.id);
      expect(question.gabarit).toBe(engendree.gabarit);
      expect(question.items).toEqual(engendree.items);
      expect(question.grappe_id).toBe(engendree.grappe_id);
      expect(question.candidat_id).toBe(engendree.candidat_id);
      expect(question.engendree_le).toBe(ENGENDREE_LE);
      expect(question.version_gabarits).toBe(engendree.version_gabarits);
      expect(question.formulations[0]?.texte).toBe(engendree.texte_neutre);
      expect("theme" in question).toBe(false);
    });
  });

  it("une manquante et une relue sur une autre empreinte ⇒ une seule erreur qui liste les deux", () => {
    const [premiere, seconde] = taches as [Tache, Tache];
    const data = toutes();
    data.delete(premiere.question.id);
    data.set(seconde.question.id, promue(surAutreTexte(seconde)));
    const erreur = erreurDe(() => questionsAuGel(taches, data, ENGENDREE_LE));
    expect(erreur.defauts.map((defaut) => [defaut.question_id, defaut.motif])).toEqual([
      [premiere.question.id, "absente"],
      [seconde.question.id, "autre_empreinte"],
    ]);
    expect(erreur.message).toContain(premiere.question.id);
    expect(erreur.message).toContain(seconde.question.id);
  });

  it("un fichier dont la neutre vient d'une autre table de gabarits ⇒ refus nommé « invariant »", () => {
    const [premiere] = taches as [Tache];
    const data = toutes();
    const lue = data.get(premiere.question.id) as FormulationsValidees;
    data.set(premiere.question.id, { ...lue, version_gabarits: "prompts/gabarits-0.9.0" });
    const erreur = erreurDe(() => questionsAuGel(taches, data, ENGENDREE_LE));
    expect(erreur.defauts.map((defaut) => [defaut.question_id, defaut.motif])).toEqual([[premiere.question.id, "invariant"]]);
    expect(erreur.defauts[0]?.detail).toContain("la neutre est produite par la version de gabarits de la question");
  });

  it("un fichier sans question engendrée correspondante n'empêche pas le gel", () => {
    const data = toutes();
    const autre = promue(taches[0] as Tache);
    data.set("q_ffffffffffffffffffffffffffffffff", { ...autre, question_id: "q_ffffffffffffffffffffffffffffffff" });
    expect(questionsAuGel(taches, data, ENGENDREE_LE)).toHaveLength(taches.length);
  });
});

describe("Q1, option (a) : position périmée au gel", () => {
  it("P corrigé de « pour » à « contre », texte neutre inchangé ⇒ gel refusé, listé avec les autres défauts", () => {
    const data = toutes();
    const corriges = jeu("contre").taches;
    const fer = questionDe(corriges, "Q-FER");
    const att = questionDe(corriges, "Q-ATT");
    data.delete(att.question.id);
    const erreur = erreurDe(() => questionsAuGel(corriges, data, ENGENDREE_LE));
    const motifs = new Map(erreur.defauts.map((defaut) => [defaut.question_id, defaut.motif]));
    expect(motifs.get(fer.question.id)).toBe("position_perimee");
    expect(motifs.get(att.question.id)).toBe("absente");
    expect(erreur.defauts.find((defaut) => defaut.question_id === fer.question.id)?.detail).toContain("« pour »");
  });

  it("O dont l'état antérieur change ⇒ gel refusé sur ses questions qui affirment une position", () => {
    const avant = jeuO("pour", "contre").taches;
    const apres = jeuO("contre", "pour").taches;
    const data = toutes(avant);
    const erreur = erreurDe(() => questionsAuGel(apres, data, ENGENDREE_LE));
    const fer = questionDe(apres, "Q-FER");
    expect(erreur.defauts.map((defaut) => defaut.motif)).toContain("position_perimee");
    expect(erreur.defauts.some((defaut) => defaut.question_id === fer.question.id && defaut.motif === "position_perimee")).toBe(true);
  });

  it("aucune correction ⇒ inchangé : le gel passe", () => {
    expect(questionsAuGel(jeu("pour").taches, toutes(), ENGENDREE_LE)).toHaveLength(taches.length);
    const o = jeuO("pour", "contre").taches;
    expect(questionsAuGel(o, toutes(o), ENGENDREE_LE)).toHaveLength(o.length);
  });
});

describe("§5, D54 (4) : un état « sans_objet » n'affirme aucune position, au gel comme à la demande", () => {
  it("item P « sans_objet » : la position recalculée est AUCUNE, le gel passe sans lever", () => {
    const sansObjet = jeu("sans_objet").taches;
    for (const tache of sansObjet) expect(tache.demande.position_affirmee).toBe(AUCUNE);
    expect(questionsAuGel(sansObjet, toutes(sansObjet), ENGENDREE_LE)).toHaveLength(sansObjet.length);
  });

  it("item O dont l'état antérieur est « sans_objet » : la position recalculée est AUCUNE, le gel passe sans lever", () => {
    const sansObjet = jeuO("sans_objet", "pour").taches;
    for (const tache of sansObjet) expect(tache.demande.position_affirmee).toBe(AUCUNE);
    expect(questionsAuGel(sansObjet, toutes(sansObjet), ENGENDREE_LE)).toHaveLength(sansObjet.length);
  });
});
