/**
 * D75 (7) : l'absence du contrefactuel d'outil publiée dans `run.json#/contrefactuel_outils` (§7,
 * « Conflit d'intérêts »). Le bloc rendu par `publication-contrefactuel-outils.ts` est validé dans un
 * run d'exemple contre `schema/run.schema.json`, puis inscrit une fois dans `run.json`
 * (`inscription-contrefactuel-outils.ts`).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { testerContrefactuelOutils } from "../../pipeline/notation/contrefactuel-outils.ts";
import type { EntreeContrefactuel } from "../../pipeline/notation/contrefactuel.ts";
import { derangementOutilsOuAbsence, tirerDerangementOutils, type OutilNomme } from "../../pipeline/notation/derangement-outils.ts";
import { tirerSousEnsembleContrefactuelOutils } from "../../pipeline/notation/echantillons.ts";
import { ContrefactuelOutilsDejaInscrit, inscrireContrefactuelOutils } from "../../pipeline/notation/inscription-contrefactuel-outils.ts";
import {
  ContrefactuelOutilsNonPubliable,
  publierAbsenceContrefactuelOutils,
  publierSansReponseEligible,
  type BlocContrefactuelOutils,
} from "../../pipeline/notation/publication-contrefactuel-outils.ts";
import { GENERATEUR_DU_TIRAGE } from "../../pipeline/questions/graine.ts";
import type { GraineTirage } from "../../pipeline/questions/types.ts";
import { ErreurSchema, valider } from "../../outils/schemas/valider.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { runDeNotation } from "./fabriques.ts";

type Objet = Record<string, unknown>;

const ALPHA: OutilNomme = { outil_id: "outil-alpha", libelle: "Alphabot", editeur: "Société Alpha" };
const BETA: OutilNomme = { outil_id: "outil-beta", libelle: "Le Chat", editeur: "Bêta IA" };
const GAMMA: OutilNomme = { outil_id: "comparateur-gamma", libelle: "Gamma Compare", editeur: "Société Alpha" };
const GRAINE: GraineTirage = { valeur: 2026, ...GENERATEUR_DU_TIRAGE };

function exemple(nom: string): Objet {
  return JSON.parse(readFileSync(join(RACINE_PROJET, "schema", "exemples", "run", nom), "utf8")) as Objet;
}

/** valide-01 : un seul assistant inclus (outil-alpha) et un comparateur. */
function runUnAssistant(): Objet {
  return exemple("valide-01-mensuel-publie.json");
}

/** valide-16 sans son bloc : deux assistants inclus (outil-alpha, outil-beta) et un comparateur. */
function runDeuxAssistants(): Objet {
  const { contrefactuel_outils: _bloc, ...run } = exemple("valide-16-contrefactuel-outils-aucune-reponse-eligible.json");
  return run;
}

function valideDans(run: Objet, bloc: BlocContrefactuelOutils): Objet {
  return valider<Objet>("run", { ...run, contrefactuel_outils: bloc }, "run de test");
}

/** Le test joué sur un run sans réponse éligible : sous-ensemble vide, aucune paire, aucune notation. */
function sansEligible(): { readonly entree: EntreeContrefactuel; readonly derangement: ReturnType<typeof tirerDerangementOutils> } {
  const sous_ensemble = tirerSousEnsembleContrefactuelOutils([], GRAINE);
  const entree: EntreeContrefactuel = { run: runDeNotation(), sous_ensemble, paires: [], notations: [], renvois: [] };
  const gamma = { ...GAMMA, editeur: "Gamma Labs" };
  return { entree, derangement: tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA, gamma], GRAINE) };
}

describe("D75 (7) : le test non joué, publié absent avec son motif", () => {
  it("moins de deux outils : etat, motif, outils, taille visée et taille nulle, rien d'autre ; valide au schéma", () => {
    const issue = derangementOutilsOuAbsence([ALPHA], [ALPHA, GAMMA], GRAINE, ["comparateur-gamma"]);
    if (issue.statut === "tire") throw new Error("absence attendue");
    const bloc = publierAbsenceContrefactuelOutils(issue);
    expect(bloc).toEqual({ etat: "indefini", motif_indefini: "moins_de_deux_outils", outils: 1, taille_visee: 200, taille: 0 });
    valideDans(runUnAssistant(), bloc);
  });

  it("D75 (6) et (7) : comparateur du même éditeur : l'éditeur et ses outils publiés ; valide au schéma", () => {
    const issue = derangementOutilsOuAbsence([ALPHA, BETA], [ALPHA, BETA, GAMMA], GRAINE, ["comparateur-gamma"]);
    if (issue.statut === "tire") throw new Error("absence attendue");
    const bloc = publierAbsenceContrefactuelOutils(issue);
    expect(bloc).toEqual({
      etat: "indefini",
      motif_indefini: "comparateur_du_meme_editeur",
      outils: 2,
      editeurs_partages: [{ editeur: "Société Alpha", outil_ids: ["comparateur-gamma", "outil-alpha"] }],
      taille_visee: 200,
      taille: 0,
    });
    valideDans(runDeuxAssistants(), bloc);
  });

  it("deux outils du dérangement du même éditeur : valide au schéma", () => {
    const pro = { ...BETA, editeur: ALPHA.editeur };
    const issue = derangementOutilsOuAbsence([ALPHA, pro], [ALPHA, pro], GRAINE, []);
    if (issue.statut === "tire") throw new Error("absence attendue");
    expect(valideDans(runDeuxAssistants(), publierAbsenceContrefactuelOutils(issue))).toMatchObject({ contrefactuel_outils: { motif_indefini: "outils_du_meme_editeur" } });
  });

  it("une absence incohérente se refuse plutôt que de se compléter", () => {
    const editeurs_partages = [{ editeur: "Société Alpha", outil_ids: ["a", "b"] }];
    expect(() => publierAbsenceContrefactuelOutils({ statut: "indefini", motif: "moins_de_deux_outils", outils: 1, editeurs_partages })).toThrow(ContrefactuelOutilsNonPubliable);
    expect(() => publierAbsenceContrefactuelOutils({ statut: "indefini", motif: "comparateur_du_meme_editeur", outils: 2, editeurs_partages: [] })).toThrow(ContrefactuelOutilsNonPubliable);
  });

  it("le motif moins_de_deux_outils se recoupe avec le périmètre : refusé sur un run à deux assistants inclus", () => {
    const bloc = publierAbsenceContrefactuelOutils({ statut: "indefini", motif: "moins_de_deux_outils", outils: 1, editeurs_partages: [] });
    expect(() => valideDans(runDeuxAssistants(), bloc)).toThrow(ErreurSchema);
  });
});

describe("D75 (7) cas 5 : le test joué sans réponse éligible, sous-ensemble vide", () => {
  it("bloc publié avec le dérangement et les clés de graine, jamais 0 % ; valide au schéma", () => {
    const { entree, derangement } = sansEligible();
    const resultat = testerContrefactuelOutils(entree);
    expect(resultat).toMatchObject({ statut: "indefini", motif: "aucune_reponse_eligible" });
    const bloc = publierSansReponseEligible(resultat, entree.sous_ensemble, derangement);
    expect(bloc).toEqual({
      etat: "indefini",
      motif_indefini: "aucune_reponse_eligible",
      outils: 2,
      eligibles: 0,
      taille_visee: 200,
      taille: 0,
      sous_effectif: true,
      correspondances: { "outil-alpha": "outil-beta", "outil-beta": "outil-alpha" },
      cle_graine: ["contrefactuel_outil"],
      cle_graine_derangement: ["contrefactuel", "noms_outils", "derangement"],
      mentions_residuelles: 0,
    });
    valideDans(runDeuxAssistants(), bloc);
  });

  it("D75 (7) cas 5 : le même bloc sans motif est refusé par le schéma", () => {
    const { entree, derangement } = sansEligible();
    const { motif_indefini: _motif, ...sans_motif } = publierSansReponseEligible(testerContrefactuelOutils(entree), entree.sous_ensemble, derangement);
    expect(() => valider("run", { ...runDeuxAssistants(), contrefactuel_outils: sans_motif }, "run de test")).toThrow(ErreurSchema);
  });

  it("un test terminé ou un sous-ensemble non vide ne se publie pas comme une absence", () => {
    const { entree, derangement } = sansEligible();
    const termine = { statut: "termine", sous_effectif: true, mentions_residuelles: 0, juges: [] } as const;
    expect(() => publierSansReponseEligible(termine, entree.sous_ensemble, derangement)).toThrow(ContrefactuelOutilsNonPubliable);
    const plein = { ...entree.sous_ensemble, eligibles: 1, reponse_ids: ["01JBANCESSA1REP0NSE0000001"] };
    expect(() => publierSansReponseEligible(testerContrefactuelOutils(entree), plein, derangement)).toThrow(ContrefactuelOutilsNonPubliable);
  });
});

describe("D75 (7) : inscription dans run.json, une seule fois", () => {
  const repertoires: string[] = [];
  afterEach(() => {
    for (const repertoire of repertoires.splice(0)) rmSync(repertoire, { recursive: true, force: true });
  });

  function repertoireAvec(run: Objet): string {
    const repertoire = mkdtempSync(join(tmpdir(), "banc-contrefactuel-outils-"));
    repertoires.push(repertoire);
    writeFileSync(join(repertoire, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
    return repertoire;
  }

  function lire(repertoire: string): Objet {
    return JSON.parse(readFileSync(join(repertoire, "run.json"), "utf8")) as Objet;
  }

  const ABSENT: BlocContrefactuelOutils = { etat: "indefini", motif_indefini: "moins_de_deux_outils", outils: 1, taille_visee: 200, taille: 0 };

  it("inscrit le bloc, recopie tout le reste tel quel ; une reprise identique n'écrit rien", () => {
    const avant = runUnAssistant();
    const repertoire = repertoireAvec(avant);
    expect(inscrireContrefactuelOutils(repertoire, ABSENT)).toBe("inscrit");
    expect(lire(repertoire)).toEqual({ ...avant, contrefactuel_outils: ABSENT });
    const ecrit = readFileSync(join(repertoire, "run.json"), "utf8");
    expect(inscrireContrefactuelOutils(repertoire, ABSENT)).toBe("deja_inscrit");
    expect(readFileSync(join(repertoire, "run.json"), "utf8")).toBe(ecrit);
  });

  it("un bloc différent déjà inscrit : refus, rien n'est réécrit (règle 7)", () => {
    const repertoire = repertoireAvec({ ...runUnAssistant(), contrefactuel_outils: ABSENT });
    const ecrit = readFileSync(join(repertoire, "run.json"), "utf8");
    expect(() => inscrireContrefactuelOutils(repertoire, { ...ABSENT, outils: 0 })).toThrow(ContrefactuelOutilsDejaInscrit);
    expect(readFileSync(join(repertoire, "run.json"), "utf8")).toBe(ecrit);
  });

  it("un bloc que le schéma refuse n'est pas écrit", () => {
    const avant = runDeuxAssistants();
    const repertoire = repertoireAvec(avant);
    expect(() => inscrireContrefactuelOutils(repertoire, ABSENT)).toThrow(ErreurSchema);
    expect(lire(repertoire)).toEqual(avant);
  });
});
