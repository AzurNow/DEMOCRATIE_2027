/**
 * D75 (7) et D84 : le branchement du contrefactuel d'outil dans la chaîne de notation (`chaine.ts`,
 * étape 3 bis), de bout en bout sur le run simulé de `pnpm run:dry`. Libellés et éditeurs sont ceux
 * de l'instantané du périmètre inscrit au gel (`run.json#/perimetre/outils[]`, §7), jamais ceux du
 * périmètre courant. Une absence (moins de deux assistants, éditeur partagé entre outils permutés ou
 * avec un comparateur) est inscrite dans `run.json#/contrefactuel_outils`, sans appel de juge ; un
 * dérangement tiré n'inscrit encore rien (le test joué n'a pas de forme publiée), et le résultat de
 * la chaîne le dit. Le test des candidats ne change pas.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import { noterRun, type ReponseANoter } from "../../pipeline/notation/chaine.ts";
import { environnementSimule, preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ecrireJson } from "./run-fictif.ts";
import { enregistreurs, instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference, type Appel } from "./simulation.ts";

// Bout en bout (lancements et écritures réels) : même limite large que chaine.test.ts.
vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

interface OutilBrut {
  readonly outil_id: string;
  readonly editeur: string;
  readonly famille: string;
  readonly inclus: boolean;
}

/** Le périmètre courant de `pnpm run:dry`, celui que la chaîne ne lit jamais. */
const PERIMETRE_COURANT = join(RACINE_PROJET, "tests", "interrogation", "fixtures", "run-simule", "perimetre.yaml");

/** Réécrit l'éditeur de chaque outil nommé dans l'instantané du gel (`run.json#/perimetre/outils[]`). */
function editeursAuGel(repertoire_run: string, editeurs: Readonly<Record<string, string>>): void {
  const disposition = dispositionRunNote(repertoire_run);
  const run = JSON.parse(readFileSync(disposition.run_json, "utf8")) as Record<string, unknown> & { perimetre: { outils: OutilBrut[] } };
  const outils = run.perimetre.outils.map((o) => {
    const editeur = editeurs[o.outil_id];
    return editeur === undefined ? o : { ...o, editeur };
  });
  ecrireJson(disposition.run_json, { ...run, perimetre: { ...run.perimetre, outils } });
}

/**
 * Réécrit run.json avec `exclu` hors du périmètre interrogé (un seul assistant inclus reste), et
 * retire ses réponses du volume : un outil exclu n'est pas interrogé, le plan du run ne les attend pas.
 */
function exclure(repertoire_run: string, exclu: string): void {
  const disposition = dispositionRunNote(repertoire_run);
  const run = JSON.parse(readFileSync(disposition.run_json, "utf8")) as Record<string, unknown> & { perimetre: { outils: OutilBrut[] } };
  const outils = run.perimetre.outils.map((o) => (o.outil_id === exclu ? { ...o, inclus: false, motif_exclusion: "exclu pour le test" } : o));
  ecrireJson(disposition.run_json, { ...run, perimetre: { ...run.perimetre, outils } });
  for (const fichier of readdirSync(disposition.reponses)) {
    const chemin = join(disposition.reponses, fichier);
    if ((JSON.parse(readFileSync(chemin, "utf8")) as { outil_id: string }).outil_id === exclu) rmSync(chemin);
  }
}

/** Les réponses d'un run qui n'interroge pas `exclu` : un outil exclu n'a pas de réponse au run. */
function sansOutil(reponses: readonly ReponseANoter[], exclu: string): readonly ReponseANoter[] {
  const gardees = reponses.filter((r) => r.reponse.outil_id !== exclu);
  expect(gardees.length).toBeGreaterThan(0);
  expect(gardees.length).toBeLessThan(reponses.length);
  return gardees;
}

/** Les contextes des objets JSON d'un dossier du volume, sans doublon ; un dossier absent n'en a aucun. */
function contextesDu(dossier: string): readonly string[] {
  if (!existsSync(dossier)) return [];
  return [...new Set(readdirSync(dossier).map((fichier) => (JSON.parse(readFileSync(join(dossier, fichier), "utf8")) as { contexte: string }).contexte))];
}

describe("D75 (7) : la chaîne publie l'absence du contrefactuel d'outil", () => {
  it("D84 : deux assistants inclus du même éditeur au gel ⇒ absence outils_du_meme_editeur inscrite, libellés et éditeurs lus du gel ; le test des candidats est joué comme avant", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));

    const bloc = {
      etat: "indefini",
      motif_indefini: "outils_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Éditeur simulé", outil_ids: ["outil-alpha", "outil-beta"] }],
      taille_visee: 200,
      taille: 0,
    };
    expect(resultat.contrefactuel_outils).toEqual({ statut: "inscrit", bloc });
    // lireRunJson valide run.json contre son schéma.
    expect((lireRunJson(prepare.repertoire_run) as unknown as Record<string, unknown>)["contrefactuel_outils"]).toEqual(bloc);
    const disposition = dispositionRunNote(prepare.repertoire_run);
    expect(contextesDu(disposition.reponses_contrefactuelles)).not.toContain("contrefactuel_outil");
    expect(contextesDu(disposition.notations)).not.toContain("contrefactuel_outil");
    expect(resultat.contrefactuel.statut).toBe("inscrit");
    expect(lireRunJson(prepare.repertoire_run)).toHaveProperty("contrefactuel_candidats");
  });

  it("D84 : périmètre courant différent du gel ⇒ c'est le gel qui compte (éditeurs distincts au gel : dérangement tiré, rien d'inscrit)", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    // Le périmètre courant donne encore un même éditeur aux deux assistants : lu, il rendrait le test absent.
    expect(readFileSync(PERIMETRE_COURANT, "utf8").match(/editeur: "Éditeur simulé"/gu)?.length).toBeGreaterThanOrEqual(2);
    editeursAuGel(prepare.repertoire_run, { "outil-alpha": "Éditeur Alpha au gel", "outil-beta": "Éditeur Beta au gel" });
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));

    expect(resultat.contrefactuel_outils).toEqual({ statut: "non_joue", motif: "derangement_tire_test_non_branche" });
    const run = JSON.parse(readFileSync(dispositionRunNote(prepare.repertoire_run).run_json, "utf8")) as Record<string, unknown>;
    expect(run).not.toHaveProperty("contrefactuel_outils");
    expect(run).toHaveProperty("contrefactuel_candidats");
    expect(contextesDu(dispositionRunNote(prepare.repertoire_run).reponses_contrefactuelles)).not.toContain("contrefactuel_outil");
  });

  it("D84 : un comparateur du même éditeur qu'un outil permuté ⇒ absence comparateur_du_meme_editeur inscrite par la chaîne (§7 0.33)", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    editeursAuGel(prepare.repertoire_run, { "outil-alpha": "Éditeur Alpha", "outil-beta": "Éditeur Beta", "comparateur-gamma": "Éditeur Alpha" });
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));

    const bloc = {
      etat: "indefini",
      motif_indefini: "comparateur_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Éditeur Alpha", outil_ids: ["comparateur-gamma", "outil-alpha"] }],
      taille_visee: 200,
      taille: 0,
    };
    expect(resultat.contrefactuel_outils).toEqual({ statut: "inscrit", bloc });
    expect((lireRunJson(prepare.repertoire_run) as unknown as Record<string, unknown>)["contrefactuel_outils"]).toEqual(bloc);
    expect(contextesDu(dispositionRunNote(prepare.repertoire_run).notations)).not.toContain("contrefactuel_outil");
  });

  it("un seul assistant inclus : absence moins_de_deux_outils inscrite, valide au schéma, sans appel de juge pour elle ; la notation suit", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    exclure(prepare.repertoire_run, "outil-beta");
    const reponses = sansOutil(prepare.reponses, "outil-beta");
    const resultat = await noterRun(reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));

    const bloc = { etat: "indefini", motif_indefini: "moins_de_deux_outils", outils: 1, taille_visee: 200, taille: 0 };
    expect(resultat.contrefactuel_outils).toEqual({ statut: "inscrit", bloc });
    // lireRunJson valide run.json contre son schéma.
    expect((lireRunJson(prepare.repertoire_run) as unknown as Record<string, unknown>)["contrefactuel_outils"]).toEqual(bloc);
    // Aucune réponse permutée ni notation sous le contexte du contrefactuel d'outil.
    const disposition = dispositionRunNote(prepare.repertoire_run);
    expect(contextesDu(disposition.reponses_contrefactuelles)).not.toContain("contrefactuel_outil");
    expect(contextesDu(disposition.notations)).not.toContain("contrefactuel_outil");
    expect(contextesDu(disposition.notations)).toContain("contrefactuel_candidat");
    expect(resultat.contrefactuel.statut).toBe("inscrit");
    expect(resultat.verdicts.length).toBeGreaterThan(0);
  });

  it("relancé : reprise, rien n'est réécrit ni redemandé", async () => {
    const sortie = nouvelleSortie();
    const prepare = await preparerNotationSimulee(options(sortie));
    exclure(prepare.repertoire_run, "outil-beta");
    const reponses = sansOutil(prepare.reponses, "outil-beta");
    await noterRun(reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    const avant = instantane(sortie);
    const appels: Appel[] = [];
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const seconde = await noterRun(reponses, { ...env, juges: enregistreurs(env.juges, appels) });
    expect(seconde.contrefactuel_outils).toMatchObject({ statut: "deja_inscrit" });
    expect(appels).toEqual([]);
    expect(instantane(sortie)).toEqual(avant);
  });
});
