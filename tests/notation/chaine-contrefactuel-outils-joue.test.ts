/**
 * D90 : le contrefactuel d'outil joué par la chaîne de notation (`chaine.ts`, étape 3 bis), de bout
 * en bout sur le run simulé de `pnpm run:dry`, sur le modèle du test des candidats (§7, « Conflit
 * d'intérêts ») : sous-ensemble tiré parmi les réponses dont le texte nomme un outil permuté, hors
 * refus de l'API ; chaque réponse notée par les juges non retirés, puis sa copie aux noms d'outils
 * permutés ; taux de chaque juge publié dans `run.json#/contrefactuel_outils`, renvois écartés.
 *
 * Les textes de l'éditeur simulé ne nomment aucun outil. Pour qu'ils en nomment un, l'instantané du
 * gel donne à outil-alpha un libellé que tous ces textes contiennent (« Réponse simulée ») ; les
 * deux assistants y reçoivent des éditeurs distincts, pour que le dérangement soit tiré (D84).
 */

import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote, lireRunJson } from "../../analysis/lecture-run.ts";
import { noterRun, type ReponseANoter, type ResultatChaine } from "../../pipeline/notation/chaine.ts";
import type { ChargeJuge } from "../../pipeline/notation/charge-juge.ts";
import type { FournisseurExistences } from "../../pipeline/notation/fournisseur-existences.ts";
import { JugeDefaillant, type Juge } from "../../pipeline/notation/juge.ts";
import { environnementSimule, preparerNotationSimulee, type ParametresNotationSimulee, type RunSimulePrepare } from "../../pipeline/notation/notation-simulee.ts";
import type { BlocContrefactuelOutilsTermine } from "../../pipeline/notation/publication-contrefactuel-outils.ts";
import { ecrireJson } from "./run-fictif.ts";
import { avecBiais, contenus, enregistreurs, instantane, nettoyerSorties, nouvelleSortie, options, parametresDeReference, type Appel } from "./simulation.ts";

// Bout en bout (lancements et écritures réels) : même limite large que chaine.test.ts.
vi.setConfig({ testTimeout: 60_000 });

afterEach(nettoyerSorties);

/** Tout texte de l'éditeur simulé commence par ces mots : le libellé d'outil-alpha au gel. */
const LIBELLE_ALPHA = "Réponse simulée";
const LIBELLE_BETA = "Outil Beta";
const NOMS_AU_GEL: Readonly<Record<string, { readonly libelle: string; readonly editeur: string }>> = {
  "outil-alpha": { libelle: LIBELLE_ALPHA, editeur: "Éditeur Alpha" },
  "outil-beta": { libelle: LIBELLE_BETA, editeur: "Éditeur Beta" },
};
const CORRESPONDANCES = { "outil-alpha": "outil-beta", "outil-beta": "outil-alpha" };

/** L'item de la question simulée 2, qui ne nomme aucun candidat : ses réponses ne sont pas au test des candidats. */
const ITEM_SANS_CANDIDAT = "1G4D9N2P3Q5R6S7T8V9W0X1Y2Z";

/** Biais de `chaine.test.ts` : il fait retirer son juge au test des candidats. */
const BIAIS_BETA = { candidats: ["C2"], taux: 1 };

type Objet = Record<string, unknown>;

interface OutilBrut {
  readonly outil_id: string;
}

/** Le run simulé, ses deux assistants renommés dans l'instantané du gel (`run.json#/perimetre/outils[]`). */
async function preparer(sortie: string = nouvelleSortie()): Promise<RunSimulePrepare> {
  const prepare = await preparerNotationSimulee(options(sortie));
  const disposition = dispositionRunNote(prepare.repertoire_run);
  const run = JSON.parse(readFileSync(disposition.run_json, "utf8")) as Objet & { perimetre: { outils: OutilBrut[] } };
  const outils = run.perimetre.outils.map((outil) => {
    const noms = NOMS_AU_GEL[outil.outil_id];
    return noms === undefined ? outil : { ...outil, ...noms };
  });
  ecrireJson(disposition.run_json, { ...run, perimetre: { ...run.perimetre, outils } });
  return prepare;
}

/**
 * Deux sorties qui portent le même run simulé, interrogé une fois : l'interrogation simulée dépend de
 * l'heure (réponses lentes), pas la notation (comme `chaine.test.ts`, cas 1).
 */
async function deuxCopies(): Promise<readonly [string, string]> {
  const premiere = nouvelleSortie();
  await preparerNotationSimulee(options(premiere));
  const seconde = nouvelleSortie();
  cpSync(premiere, seconde, { recursive: true });
  return [premiere, seconde];
}

/** Les réponses obtenues dont le texte nomme outil-alpha, hors refus de l'API : celles que le test doit tirer. */
function eligibles(reponses: readonly ReponseANoter[]): readonly string[] {
  return reponses.filter((r) => !r.reponse.normalise.refus_api && r.reponse.normalise.texte.includes(LIBELLE_ALPHA)).map((r) => r.reponse.id);
}

function objetsDu(dossier: string): readonly Objet[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).sort().map((fichier) => JSON.parse(readFileSync(join(dossier, fichier), "utf8")) as Objet);
}

function sousContexteOutil(dossier: string): readonly Objet[] {
  return objetsDu(dossier).filter((objet) => objet["contexte"] === "contrefactuel_outil");
}

function termine(resultat: ResultatChaine): BlocContrefactuelOutilsTermine {
  const etat = resultat.contrefactuel_outils;
  if (!("bloc" in etat) || etat.bloc.etat !== "termine") throw new Error(`test d'outil terminé attendu : ${JSON.stringify(etat)}`);
  return etat.bloc;
}

/** Les juges reçus ; `defaille(juge_id, charge)` vrai : le juge rejette la charge par `JugeDefaillant` (§7, 0.27). */
function defaillants(juges: readonly Juge[], defaille: (juge_id: string, charge: ChargeJuge) => boolean): readonly Juge[] {
  return juges.map((juge) => ({
    identite: juge.identite,
    noter: (charge) => {
      if (defaille(juge.identite.juge_id, charge)) return Promise.reject(new JugeDefaillant(juge.identite.juge_id, "erreur_api_persistante", "défaillance simulée par le test"));
      return juge.noter(charge);
    },
  }));
}

async function noter(prepare: RunSimulePrepare, parametres: ParametresNotationSimulee = parametresDeReference()): Promise<ResultatChaine> {
  return noterRun(prepare.reponses, environnementSimule(prepare.repertoire_run, parametres));
}

describe("D90 : le contrefactuel d'outil joué par la chaîne", () => {
  it("dérangement tiré avec au moins une réponse éligible ⇒ test joué : copies permutées, paires des deux juges, taux de chacun inscrit, valide au schéma ; le juge ne reçoit jamais l'identité de l'outil", async () => {
    const prepare = await preparer();
    const attendues = eligibles(prepare.reponses);
    expect(attendues.length).toBeGreaterThan(0);
    const appels: Appel[] = [];
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const resultat = await noterRun(prepare.reponses, { ...env, juges: enregistreurs(env.juges, appels) });

    const bloc = termine(resultat);
    expect(bloc).toMatchObject({
      etat: "termine",
      outils: 2,
      eligibles: attendues.length,
      taille_visee: 200,
      taille: attendues.length,
      sous_effectif: true,
      correspondances: CORRESPONDANCES,
      cle_graine: ["contrefactuel_outil"],
      cle_graine_derangement: ["contrefactuel", "noms_outils", "derangement"],
      mentions_residuelles: 0,
    });
    expect(bloc).not.toHaveProperty("motif_indefini");
    expect(bloc.juges.map((juge) => juge.juge_id)).toEqual(["juge-simule-a", "juge-simule-b"]);
    for (const juge of bloc.juges) {
      if (!("changements" in juge)) throw new Error(`juge mesuré attendu : ${JSON.stringify(juge)}`);
      expect(juge.paires_ecartees).toBe(0);
      expect(juge.changements.denominateur).toBe(bloc.taille);
      expect(juge.taux_changement).toBe(juge.changements.numerateur / juge.changements.denominateur);
    }
    // lireRunJson valide run.json contre son schéma.
    expect((lireRunJson(prepare.repertoire_run) as unknown as Objet)["contrefactuel_outils"]).toEqual(bloc);

    const disposition = dispositionRunNote(prepare.repertoire_run);
    const copies = sousContexteOutil(disposition.reponses_contrefactuelles);
    expect(copies.map((copie) => copie["derive_de_reponse_id"]).sort()).toEqual([...attendues].sort());
    for (const copie of copies) {
      const texte = (copie["normalise"] as { texte: string }).texte;
      expect(texte).toContain(LIBELLE_BETA);
      expect(texte).not.toContain(LIBELLE_ALPHA);
      expect(copie["permutation"]).toEqual({ type: "noms_outils", correspondances: CORRESPONDANCES });
    }
    const notations = sousContexteOutil(disposition.notations);
    expect(notations).toHaveLength(2 * attendues.length);
    expect(new Set(notations.map((notation) => notation["motif_notation"]))).toEqual(new Set(["contrefactuel"]));
    // Le test des candidats est joué comme avant, et la masse suit.
    expect(resultat.contrefactuel.statut).toBe("inscrit");
    expect(resultat.verdicts.length).toBeGreaterThan(0);
    // §7 : ni l'origine ni la copie permutée ne portent l'identifiant d'un outil dans la charge du juge.
    expect(appels.filter((appel) => appel.charge.reponse.texte.includes(LIBELLE_BETA))).toHaveLength(2 * attendues.length);
    for (const appel of appels) expect(JSON.stringify(appel.charge)).not.toMatch(/outil-alpha|outil-beta/u);
  });

  it("le test d'outil ne change rien à la masse : mêmes verdicts, octet pour octet, que sur le même run au test d'outil absent", async () => {
    const [premiere, seconde] = await deuxCopies();
    const joue = await preparer(premiere);
    expect(termine(await noter(joue)).taille).toBeGreaterThan(0);
    const absent = await preparerNotationSimulee(options(seconde));
    const resultat_absent = await noter(absent);
    expect(resultat_absent.contrefactuel_outils).toMatchObject({ statut: "inscrit", bloc: { motif_indefini: "outils_du_meme_editeur" } });
    const verdicts = (prepare: RunSimulePrepare): ReadonlyMap<string, string> => contenus(dispositionRunNote(prepare.repertoire_run).verdicts);
    expect(verdicts(joue).size).toBeGreaterThan(0);
    expect(verdicts(joue)).toEqual(verdicts(absent));
  });

  it("refus de l'API (D32, D33) : jamais au sous-ensemble, aucune copie permutée n'en dérive", async () => {
    const prepare = await preparer();
    const refus = prepare.reponses.filter((r) => r.reponse.normalise.refus_api).map((r) => r.reponse.id);
    expect(refus.length).toBeGreaterThan(0);
    await noter(prepare);
    const derives = new Set(sousContexteOutil(dispositionRunNote(prepare.repertoire_run).reponses_contrefactuelles).map((copie) => copie["derive_de_reponse_id"]));
    expect(derives.size).toBeGreaterThan(0);
    for (const id of refus) expect(derives.has(id)).toBe(false);
  });

  it("renvoi à un humain (D31) sur un côté ⇒ paire écartée du taux de ce juge seul, et comptée ; l'autre juge la garde", async () => {
    const prepare = await preparer();
    const nomment = new Set(eligibles(prepare.reponses));
    // Les copies des réponses tronquées : juge-simule-a ne peut pas les noter.
    const tronquees = prepare.reponses.filter((r) => nomment.has(r.reponse.id) && r.reponse.normalise.troncature === true).length;
    expect(tronquees).toBeGreaterThan(0);
    expect(tronquees).toBeLessThan(nomment.size);
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const juges = defaillants(env.juges, (juge_id, charge) => juge_id === "juge-simule-a" && charge.reponse.troncature === true && charge.reponse.texte.includes(LIBELLE_BETA));
    const bloc = termine(await noterRun(prepare.reponses, { ...env, juges }));

    const [a, b] = bloc.juges;
    expect(a).toMatchObject({ juge_id: "juge-simule-a", paires_ecartees: tronquees, changements: { denominateur: nomment.size - tronquees } });
    expect(b).toMatchObject({ juge_id: "juge-simule-b", paires_ecartees: 0, changements: { denominateur: nomment.size } });
    const renvois = sousContexteOutil(dispositionRunNote(prepare.repertoire_run).renvois);
    expect(renvois).toHaveLength(tronquees);
    expect(renvois.every((renvoi) => (renvoi["notateur"] as { id: string }).id === "juge-simule-a")).toBe(true);
  });

  it("renvois sur toutes les paires d'un juge ⇒ son taux est absent avec toutes_paires_ecartees, jamais 0 %", async () => {
    const prepare = await preparer();
    const taille = eligibles(prepare.reponses).length;
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const juges = defaillants(env.juges, (juge_id, charge) => juge_id === "juge-simule-a" && charge.reponse.texte.includes(LIBELLE_BETA));
    const bloc = termine(await noterRun(prepare.reponses, { ...env, juges }));

    expect(bloc.juges[0]).toEqual({ juge_id: "juge-simule-a", motif_indefini: "toutes_paires_ecartees", paires_ecartees: taille });
    expect(bloc.juges[1]).toMatchObject({ juge_id: "juge-simule-b", paires_ecartees: 0, changements: { denominateur: taille } });
  });

  it("juge retiré au test des candidats ⇒ seul le juge restant est appelé et mesuré ; le retiré est publié non mesuré, sans taux", async () => {
    const prepare = await preparer();
    const taille = eligibles(prepare.reponses).length;
    const appels: Appel[] = [];
    const env = environnementSimule(prepare.repertoire_run, avecBiais({ "juge-simule-b": BIAIS_BETA }));
    const resultat = await noterRun(prepare.reponses, { ...env, juges: enregistreurs(env.juges, appels) });

    expect(lireRunJson(prepare.repertoire_run).juges.find((juge) => juge.juge_id === "juge-simule-b")).toMatchObject({ retire: true });
    const bloc = termine(resultat);
    expect(bloc.juges[0]).toMatchObject({ juge_id: "juge-simule-a", paires_ecartees: 0, changements: { denominateur: taille } });
    expect(bloc.juges[1]).toEqual({ juge_id: "juge-simule-b", motif_non_mesure: "retire_au_test_des_candidats" });
    const notations = sousContexteOutil(dispositionRunNote(prepare.repertoire_run).notations);
    expect(notations).toHaveLength(taille);
    expect(notations.every((notation) => (notation["notateur"] as { id: string }).id === "juge-simule-a")).toBe(true);
    expect(appels.filter((appel) => appel.juge_id === "juge-simule-b" && appel.charge.reponse.texte.includes(LIBELLE_BETA))).toEqual([]);
  });

  it("déterminisme : même graine ⇒ même sous-ensemble, mêmes copies permutées, même bloc", async () => {
    const [premiere, seconde] = await deuxCopies();
    const premier = await preparer(premiere);
    const second = await preparer(seconde);
    const bloc_premier = termine(await noter(premier));
    const bloc_second = termine(await noter(second));
    expect(bloc_second).toEqual(bloc_premier);
    const copies = (prepare: RunSimulePrepare): readonly Objet[] => sousContexteOutil(dispositionRunNote(prepare.repertoire_run).reponses_contrefactuelles);
    expect(copies(premier).length).toBe(bloc_premier.taille);
    expect(copies(second)).toEqual(copies(premier));
    const notations = (prepare: RunSimulePrepare): readonly Objet[] => sousContexteOutil(dispositionRunNote(prepare.repertoire_run).notations);
    expect(notations(second)).toEqual(notations(premier));
  });

  it("relancé : reprise, rien n'est réécrit ni redemandé ; le bloc est déjà inscrit", async () => {
    const prepare = await preparer();
    await noter(prepare);
    const avant = instantane(prepare.repertoire_run);
    const appels: Appel[] = [];
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const seconde = await noterRun(prepare.reponses, { ...env, juges: enregistreurs(env.juges, appels) });
    expect(seconde.contrefactuel_outils).toMatchObject({ statut: "deja_inscrit", bloc: { etat: "termine" } });
    expect(appels).toEqual([]);
    expect(instantane(prepare.repertoire_run)).toEqual(avant);
  });

  it("une réponse du sous-ensemble attend le test des liens ⇒ rien d'inscrit, en attente avec ses réponses ; le test des candidats et la masse suivent", async () => {
    const prepare = await preparer();
    const nomment = new Set(eligibles(prepare.reponses));
    // Réponses à la question sans candidat (hors du test des candidats) qui citent un lien et nomment un outil.
    const bloquees = new Set(
      prepare.reponses
        .filter((r) => nomment.has(r.reponse.id) && r.reponse.normalise.liens.length > 0 && r.references.some((reference) => reference.item.id === ITEM_SANS_CANDIDAT))
        .map((r) => r.reponse.id),
    );
    expect(bloquees.size).toBeGreaterThan(0);
    const env = environnementSimule(prepare.repertoire_run, parametresDeReference());
    const existences: FournisseurExistences = {
      existencesDe: (reponse_id, liens) => (bloquees.has(reponse_id) ? [] : env.existences.existencesDe(reponse_id, liens)),
      texteDeCopie: (sha256) => env.existences.texteDeCopie(sha256),
    };
    const resultat = await noterRun(prepare.reponses, { ...env, existences });

    if (resultat.contrefactuel_outils.statut !== "en_attente_test_liens") throw new Error(`attente attendue : ${JSON.stringify(resultat.contrefactuel_outils)}`);
    expect(new Set(resultat.contrefactuel_outils.reponse_ids)).toEqual(bloquees);
    expect(lireRunJson(prepare.repertoire_run)).not.toHaveProperty("contrefactuel_outils");
    expect(sousContexteOutil(dispositionRunNote(prepare.repertoire_run).reponses_contrefactuelles)).toEqual([]);
    expect(resultat.contrefactuel.statut).toBe("inscrit");
    expect(resultat.verdicts.length).toBeGreaterThan(0);
    for (const id of bloquees) expect(resultat.attentes).toContainEqual({ reponse_id: id, motifs: ["test_liens"] });
  });
});
