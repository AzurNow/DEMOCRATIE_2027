/**
 * D75 (7) : le branchement du contrefactuel d'outil dans la chaîne de notation (`chaine.ts`, étape
 * 3 bis), de bout en bout sur le run simulé de `pnpm run:dry`. Sous deux assistants inclus, son
 * absence est inscrite dans `run.json#/contrefactuel_outils`, sans tirage ni appel de juge ; au-delà,
 * rien n'est inscrit, et le résultat de la chaîne le dit. Le test des candidats ne change pas.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import { noterRun, type ReponseANoter } from "../../pipeline/notation/chaine.ts";
import { environnementSimule, preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { ecrireJson } from "./run-fictif.ts";
import { enregistreurs, instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference, type Appel } from "./simulation.ts";

// Bout en bout (lancements et écritures réels) : même limite large que chaine.test.ts.
vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

interface OutilBrut {
  readonly outil_id: string;
  readonly famille: string;
  readonly inclus: boolean;
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
  it("deux assistants inclus : rien n'est inscrit, la chaîne le dit (libellés et éditeurs hors du gel) ; le test des candidats est joué comme avant", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    const resultat = await noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametresDeReference()));
    expect(resultat.contrefactuel_outils).toEqual({ statut: "non_joue", motif: "libelles_et_editeurs_hors_du_gel" });
    expect(resultat.contrefactuel.statut).toBe("inscrit");
    const run = JSON.parse(readFileSync(dispositionRunNote(prepare.repertoire_run).run_json, "utf8")) as Record<string, unknown>;
    expect(run).not.toHaveProperty("contrefactuel_outils");
    expect(run).toHaveProperty("contrefactuel_candidats");
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
