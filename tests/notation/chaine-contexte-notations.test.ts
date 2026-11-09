/**
 * DETTE 2026-09-17 n° 1 : l'invariant `contexteSuitObjetNote` (`pipeline/questions/invariants.ts`)
 * tourne sur le corpus réel. `chaine.ts:ouvrir` relit les notations déjà écrites du run et refuse,
 * avant toute écriture, celle dont le contexte n'est pas celui de l'objet qu'elle note
 * (`ContexteDeNotationDivergent`). Bout en bout sur le run simulé de `pnpm run:dry`.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import { ContexteDeNotationDivergent, identifiantDerive, noterRun } from "../../pipeline/notation/chaine.ts";
import { environnementSimule, preparerNotationSimulee, type RunSimulePrepare } from "../../pipeline/notation/notation-simulee.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import { ulid } from "../analysis/fabriques.ts";
import { renvoiJuge } from "./fabriques.ts";
import { doubleNotation, poserLecturesAffichees } from "./lectures-sur-disque.ts";
import { ecrireJson } from "./run-fictif.ts";
import { contenus, enregistreurs, instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference, type Appel } from "./simulation.ts";

// Bout en bout (lancements et écritures réels) : même limite large que chaine.test.ts.
vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

type Objet = Record<string, unknown>;

const INVARIANT = "le contexte suit celui de l'objet noté";

/**
 * Comme `chaine-contrefactuel-outils-joue.test.ts` : outil-alpha reçoit au gel un libellé que tous
 * les textes simulés contiennent, et les deux assistants des éditeurs distincts, pour que le
 * contrefactuel d'outil soit joué et écrive des notations de contexte `contrefactuel_outil`.
 */
function jouerLeContrefactuelOutil(repertoire_run: string): void {
  const noms: Readonly<Record<string, Objet>> = {
    "outil-alpha": { libelle: "Réponse simulée", editeur: "Éditeur Alpha" },
    "outil-beta": { libelle: "Outil Beta", editeur: "Éditeur Beta" },
  };
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const run = JSON.parse(readFileSync(chemin, "utf8")) as Objet & { perimetre: { outils: (Objet & { outil_id: string })[] } };
  const outils = run.perimetre.outils.map((outil) => ({ ...outil, ...noms[outil.outil_id] }));
  ecrireJson(chemin, { ...run, perimetre: { ...run.perimetre, outils } });
}

async function noter(prepare: RunSimulePrepare, appels: Appel[] = []): Promise<void> {
  const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
  await noterRun(prepare.reponses, { ...env, juges: enregistreurs(env.juges, appels) });
}

function notationsSurDisque(repertoire_run: string): readonly (Objet & { id: string; contexte: string })[] {
  const dossier = dispositionRunNote(repertoire_run).notations;
  return readdirSync(dossier).sort().map((fichier) => JSON.parse(readFileSync(join(dossier, fichier), "utf8")) as Objet & { id: string; contexte: string });
}

/** Réécrit sur le disque une notation déjà écrite, comme le ferait une main ou un code fautif. */
function alterer(repertoire_run: string, choisir: (notation: Objet & { contexte: string }) => boolean, alteration: (notation: Objet) => Objet): string {
  const notation = notationsSurDisque(repertoire_run).find(choisir);
  if (notation === undefined) throw new Error("aucune notation à altérer");
  ecrireJson(join(dispositionRunNote(repertoire_run).notations, `${notation.id}.json`), alteration(notation));
  return notation.id;
}

/** Simule une interruption avant le verdict d'une réponse : sa relance devrait l'écrire. */
function retirerUnVerdict(repertoire_run: string): string {
  const dossier = dispositionRunNote(repertoire_run).verdicts;
  const [premier] = readdirSync(dossier).sort();
  if (premier === undefined) throw new Error("aucun verdict écrit");
  rmSync(join(dossier, premier));
  return premier;
}

async function attendreLeRefus(prepare: RunSimulePrepare): Promise<ContexteDeNotationDivergent> {
  const appels: Appel[] = [];
  const refus = await noter(prepare, appels).then(
    () => null,
    (erreur: unknown) => erreur,
  );
  expect(refus).toBeInstanceOf(ContexteDeNotationDivergent);
  expect(appels).toEqual([]);
  return refus as ContexteDeNotationDivergent;
}

describe("DETTE 2026-09-17 n° 1 : la chaîne contrôle le contexte des notations déjà écrites", () => {
  it("aucune notation existante (première ouverture) : la chaîne s'ouvre et note normalement", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    expect(existsSync(dispositionRunNote(prepare.repertoire_run).notations)).toBe(false);
    await noter(prepare);
    expect(notationsSurDisque(prepare.repertoire_run).length).toBeGreaterThan(0);
  });

  it("notations existantes toutes cohérentes (run, contrefactuel_candidat, contrefactuel_outil, lecture de comparateur) : la relance s'ouvre et ne réécrit rien", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    jouerLeContrefactuelOutil(prepare.repertoire_run);
    const [lecture] = poserLecturesAffichees(prepare.repertoire_run, [ulid("contexte-item-1")]);
    if (lecture === undefined) throw new Error("aucune lecture posée");
    const depot = DepotNotation.ouvrir(prepare.repertoire_run);
    doubleNotation(depot, lecture, "a1");
    doubleNotation(depot, lecture, "a2");
    await noter(prepare);
    const notations = notationsSurDisque(prepare.repertoire_run);
    expect(new Set(notations.map((n) => n.contexte))).toEqual(new Set(["run", "contrefactuel_candidat", "contrefactuel_outil"]));
    expect(notations.some((n) => (n["objet_note"] as Objet)["type"] === "lecture_comparateur")).toBe(true);

    const avant = instantane(prepare.repertoire_run);
    const appels: Appel[] = [];
    await noter(prepare, appels);
    expect(appels).toEqual([]);
    expect(instantane(prepare.repertoire_run)).toEqual(avant);
  });

  it("une notation existante dont le contexte diffère de celui de son objet noté : ContexteDeNotationDivergent, aucun juge appelé, aucun fichier écrit", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    await noter(prepare);
    const fautive = alterer(prepare.repertoire_run, (n) => n.contexte === "contrefactuel_candidat", (n) => ({ ...n, contexte: "contrefactuel_outil" }));
    // Sans le refus, la relance écrirait ce verdict : l'arborescence inchangée prouve que rien n'est écrit.
    const retire = retirerUnVerdict(prepare.repertoire_run);
    const avant = instantane(prepare.repertoire_run);

    const refus = await attendreLeRefus(prepare);
    expect(refus.violations).toHaveLength(1);
    expect(refus.violations[0]).toMatchObject({ invariant: INVARIANT, objet: fautive });
    expect(refus.violations[0]?.detail).toMatch(/^contexte contrefactuel_outil alors que l'objet noté \S+ porte contrefactuel_candidat\.$/);
    expect(refus.message).toContain(fautive);
    expect(refus.message).toContain(lireRunJson(prepare.repertoire_run).id);
    expect(instantane(prepare.repertoire_run)).toEqual(avant);
    expect(existsSync(join(dispositionRunNote(prepare.repertoire_run).verdicts, retire))).toBe(false);
  });

  it("une notation existante dont l'objet noté est introuvable : refus nommé (« introuvable »), aucun fichier écrit", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    await noter(prepare);
    const absent = identifiantDerive(["objet-noté-absent-du-run"]);
    const fautive = alterer(prepare.repertoire_run, (n) => n.contexte === "run", (n) => ({ ...n, objet_note: { ...(n["objet_note"] as Objet), id: absent } }));
    retirerUnVerdict(prepare.repertoire_run);
    const avant = instantane(prepare.repertoire_run);

    const refus = await attendreLeRefus(prepare);
    expect(refus.violations).toEqual([
      { invariant: INVARIANT, objet: fautive, detail: `objet noté ${absent} introuvable : le contexte n'est pas vérifiable.` },
    ]);
    expect(instantane(prepare.repertoire_run)).toEqual(avant);
  });

  it("un renvoi de juge existant dont le contexte diffère de celui de son objet noté : ContexteDeNotationDivergent, aucun fichier écrit", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    await noter(prepare);
    const [cible] = prepare.reponses;
    if (cible === undefined) throw new Error("réponse attendue");
    const run_id = lireRunJson(prepare.repertoire_run).id;
    // Une réponse d'outil est de contexte run ; le renvoi la vise sous le contexte du test des candidats.
    const renvoi = renvoiJuge("juge-simule-a", {
      id: identifiantDerive([run_id, "renvoi-fautif", cible.reponse.id]),
      run_id,
      contexte: "contrefactuel_candidat",
      objet_note: { type: "reponse", id: cible.reponse.id },
    });
    DepotNotation.ouvrir(prepare.repertoire_run).ecrireRenvoi(renvoi);
    retirerUnVerdict(prepare.repertoire_run);
    const avant = instantane(prepare.repertoire_run);

    const refus = await attendreLeRefus(prepare);
    expect(refus.violations).toEqual([
      { invariant: INVARIANT, objet: renvoi.id, detail: `contexte contrefactuel_candidat alors que l'objet noté ${cible.reponse.id} porte run.` },
    ]);
    expect(instantane(prepare.repertoire_run)).toEqual(avant);
  });

  it("la reprise d'une chaîne saine interrompue n'est pas bloquée : le verdict manquant est réécrit à l'identique", async () => {
    const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
    await noter(prepare);
    const verdicts = dispositionRunNote(prepare.repertoire_run).verdicts;
    const avant = contenus(verdicts);
    const retire = retirerUnVerdict(prepare.repertoire_run);
    expect(contenus(verdicts).has(retire)).toBe(false);

    await noter(prepare);
    expect(contenus(verdicts)).toEqual(avant);
  });
});
