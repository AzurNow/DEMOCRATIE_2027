/**
 * §7 (protocole 0.21) : « Un dérangement exige au moins deux candidats interrogés : sous ce nombre,
 * le test contrefactuel est indéfini » ; §12 : « Un test contrefactuel indéfini ne satisfait pas son
 * critère. » De bout en bout, sur le run simulé de `pnpm run:dry` réduit à un seul candidat
 * interrogé : la notation se fait en entier, le test contrefactuel est inscrit indéfini avec le motif
 * `moins_de_deux_interroges`, aucun juge n'est appelé pour lui, et le critère go/no-go est rouge.
 *
 * Avant le correctif, `tirerDerangement` levait une erreur générique et toute la notation s'arrêtait.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import { critereTestContrefactuel } from "../../pipeline/go-no-go/criteres-juges.ts";
import { tableAliasCandidats } from "../../analysis/alias-candidats.ts";
import { bilanNotation, texteContrefactuelInscrit } from "../../pipeline/notation/bilan-notation.ts";
import { noterRun, type ReponseANoter } from "../../pipeline/notation/chaine.ts";
import { environnementSimule, preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
import { ecrireJson } from "./run-fictif.ts";
import { enregistreurs, instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference, type Appel } from "./simulation.ts";

// Bout en bout (lancements et écritures réels) : même limite large que chaine.test.ts.
vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

interface CandidatBrut {
  readonly candidat_id: string;
  readonly interroge: boolean;
}

/** Réécrit run.json avec les seuls `gardes` interrogés, et la table d'alias que la graine recalcule pour eux. */
function nInterroger(repertoire_run: string, gardes: readonly string[]): void {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const run = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & {
    perimetre: { candidats: CandidatBrut[] };
    graines: { alias_candidats: GraineTirage };
  };
  const candidats = run.perimetre.candidats.map((c) => ({ ...c, interroge: gardes.includes(c.candidat_id) }));
  const interroges = candidats.filter((c) => c.interroge);
  ecrireJson(chemin, {
    ...run,
    perimetre: { ...run.perimetre, candidats },
    alias_candidats: interroges.length === 0 ? {} : tableAliasCandidats(interroges, run.graines.alias_candidats),
  });
}

/**
 * Les réponses d'un run qui n'interroge que demo-alpha : celles dont chaque item de référence est de
 * lui. Le run simulé interroge les deux candidats ; ses réponses sur demo-beta n'existeraient pas
 * dans un run qui ne l'interroge pas (§3 : aucune question ne nomme un candidat non interrogé), et
 * leur charge ne trouverait pas d'alias à son item (`analysis/alias-candidats.ts`, D55 (9)).
 */
function reponsesDAlpha(reponses: readonly ReponseANoter[]): readonly ReponseANoter[] {
  const gardees = reponses.filter((r) => r.references.every((reference) => reference.item.candidat_id === "demo-alpha"));
  expect(gardees.length).toBeGreaterThan(0);
  expect(gardees.length).toBeLessThan(reponses.length);
  return gardees;
}

describe("§7 (0.21) : test contrefactuel indéfini sous deux candidats interrogés", () => {
  it("1 candidat interrogé : notation complète, contrefactuel absent avec le motif moins_de_deux_interroges, aucun appel de juge pour lui", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const { repertoire_run } = prepare;
    nInterroger(repertoire_run, ["demo-alpha"]);
    const appels: Appel[] = [];
    const env = environnementSimule(repertoire_run, parametresDeReference());
    const reponses = reponsesDAlpha(prepare.reponses);
    const resultat = await noterRun(reponses, { ...env, juges: enregistreurs(env.juges, appels) });

    expect(resultat.contrefactuel.statut).toBe("inscrit");
    if (resultat.contrefactuel.statut !== "inscrit") return;
    expect(resultat.contrefactuel.resultat).toEqual({ statut: "indefini", motif: "moins_de_deux_interroges", taux_echantillon_humain: 0.1 });

    // Aucun appel pour le contrefactuel : chaque charge porte une réponse obtenue du run, une fois par juge.
    const obtenues = new Set(reponses.map((r) => r.reponse.id));
    expect(appels.length).toBeGreaterThan(0);
    expect(appels.every((a) => obtenues.has(a.charge.reponse_id))).toBe(true);
    expect(new Set(appels.map((a) => `${a.juge_id}\u0000${a.charge.reponse_id}`)).size).toBe(appels.length);
    const disposition = dispositionRunNote(repertoire_run);
    expect(existsSync(disposition.reponses_contrefactuelles) ? readdirSync(disposition.reponses_contrefactuelles) : []).toEqual([]);

    // La suite de la notation a lieu : chaque réponse a son issue, des verdicts sont écrits.
    const bilan = bilanNotation(repertoire_run, resultat, reponses.map((r) => r.reponse.id));
    expect(resultat.verdicts.length).toBeGreaterThan(0);
    expect(resultat.attentes.some((a) => a.motifs.includes("contrefactuel_en_attente"))).toBe(false);
    for (const juge of bilan.juges) {
      expect(juge.notations_contrefactuel).toBe(0);
      expect(juge.notations_run).toBeGreaterThan(0);
    }
    expect(appels.length).toBe(bilan.juges.reduce((total, juge) => total + juge.notations_run, 0));

    // run.json, relu et validé au schéma par lireRunJson : bloc indéfini avec son motif, aucun taux de juge.
    const run = lireRunJson(repertoire_run);
    expect(run.contrefactuel_candidats).toEqual({ etat: "indefini", motif_indefini: "moins_de_deux_interroges", taille_visee: 200, taille: 0 });
    expect(run.taux_echantillon_humain).toBe(0.1);
    for (const juge of run.juges) {
      expect(juge.retire).toBe(false);
      expect(juge.taux_changement_contrefactuel).toBeUndefined();
      expect(juge.changements_contrefactuel).toBeUndefined();
      expect(juge.paires_ecartees_contrefactuel).toBeUndefined();
      expect(juge.motif_indefini_contrefactuel).toBeUndefined();
    }

    // §12 : un test indéfini ne satisfait pas son critère, sans code propre au motif.
    expect(critereTestContrefactuel(run.juges)).toMatchObject({ code: "test_contrefactuel", statut: "rouge" });
  });

  it("bilan d'un run à 1 interrogé : le motif est porté, aucun éligible ni sous-effectif, texte en clair", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    nInterroger(prepare.repertoire_run, ["demo-alpha"]);
    const reponses = reponsesDAlpha(prepare.reponses);
    const resultat = await noterRun(reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    const bilan = bilanNotation(prepare.repertoire_run, resultat, reponses.map((r) => r.reponse.id));

    expect(bilan.contrefactuel_inscrit).toEqual({
      test: "non_joue_faute_d_interroges",
      etat: "indefini",
      motif_indefini: "moins_de_deux_interroges",
      taille_visee: 200,
      taille: 0,
    });
    // Aucune clé absente rendue visible comme undefined, ni éligibles ni sous-effectif.
    const serialise = JSON.stringify(bilan);
    expect(serialise).not.toContain("undefined");
    expect(serialise).not.toContain("eligibles");
    expect(serialise).not.toContain("sous_effectif");
    expect(bilan.contrefactuel_inscrit).toBeDefined();
    if (bilan.contrefactuel_inscrit === undefined) return;
    const texte = texteContrefactuelInscrit(bilan.contrefactuel_inscrit);
    expect(texte).toContain("non joué faute de deux candidats interrogés");
    expect(texte).toContain("rouge");
    expect(texte).not.toContain("éligible");
    expect(texte).not.toContain("sous-effectif");
  });

  it("1 candidat interrogé, relancé : reprise, rien n'est réécrit ni redemandé", async () => {
    const sortie = nouvelleSortie();
    const prepare = await preparerNotationSimulee(options(sortie));
    nInterroger(prepare.repertoire_run, ["demo-alpha"]);
    const reponses = reponsesDAlpha(prepare.reponses);
    await noterRun(reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    const avant = instantane(sortie);
    const appels: Appel[] = [];
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const seconde = await noterRun(reponses, { ...env, juges: enregistreurs(env.juges, appels) });
    expect(seconde.contrefactuel.statut).toBe("deja_inscrit");
    expect(appels).toEqual([]);
    expect(instantane(sortie)).toEqual(avant);
  });

  it("0 candidat interrogé : le run est refusé dès sa lecture (alias_candidats exige au moins un interrogé), avant toute écriture", async () => {
    const sortie = nouvelleSortie();
    const prepare = await preparerNotationSimulee(options(sortie));
    nInterroger(prepare.repertoire_run, []);
    const avant = instantane(sortie);
    const appels: Appel[] = [];
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    await expect(noterRun(prepare.reponses, { ...env, juges: enregistreurs(env.juges, appels) })).rejects.toBeInstanceOf(ErreurSchema);
    expect(appels).toEqual([]);
    expect(instantane(sortie)).toEqual(avant);
  });
});
