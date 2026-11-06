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
import { testerContrefactuelOutils, type ResultatContrefactuelOutils } from "../../pipeline/notation/contrefactuel-outils.ts";
import type { EntreeContrefactuel } from "../../pipeline/notation/contrefactuel.ts";
import { derangementOutilsOuAbsence, tirerDerangementOutils, type OutilNomme } from "../../pipeline/notation/derangement-outils.ts";
import { tirerSousEnsembleContrefactuel, tirerSousEnsembleContrefactuelOutils } from "../../pipeline/notation/echantillons.ts";
import { ContrefactuelOutilsDejaInscrit, inscrireContrefactuelOutils } from "../../pipeline/notation/inscription-contrefactuel-outils.ts";
import {
  ContrefactuelOutilsNonPubliable,
  publierAbsenceContrefactuelOutils,
  publierContrefactuelOutilsJoue,
  publierSansReponseEligible,
  publierTermineOutils,
  type BlocContrefactuelOutils,
} from "../../pipeline/notation/publication-contrefactuel-outils.ts";
import { GENERATEUR_DU_TIRAGE } from "../../analysis/graine-tirage.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
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

describe("D90 : le test joué et terminé, taux de chaque juge publié", () => {
  const IDS = ["01JBANCESSA1REP0NSE0000001", "01JBANCESSA1REP0NSE0000002", "01JBANCESSA1REP0NSE0000003", "01JBANCESSA1REP0NSE0000004"];
  const sous_ensemble = tirerSousEnsembleContrefactuelOutils(IDS, GRAINE);
  const derangement = tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA, { ...GAMMA, editeur: "Gamma Labs" }], GRAINE);

  /** valide-16, juges j1 et j2 (ceux de `runDeNotation`), retiré au test des candidats si demandé. */
  function runDuTest(retires: readonly string[] = []): Objet {
    const run = runDeuxAssistants();
    const juges = (run["juges"] as Objet[]).map((juge, rang) => {
      const juge_id = rang === 0 ? "j1" : "j2";
      if (!retires.includes(juge_id)) return { ...juge, juge_id };
      // Un juge retiré porte son motif et ne publie plus d'accord sur l'échantillon (run.schema.json).
      const { kappa_echantillon_humain: _k, renvois_ecartes_kappa_echantillon: _r, ...retenu } = juge;
      return { ...retenu, juge_id, retire: true, motif_retrait: "Test contrefactuel des noms de candidats : au-delà de 3 % (§7)." };
    });
    return { ...run, juges, ...(retires.length > 0 ? { taux_echantillon_humain: 0.25 } : {}) };
  }

  function termine(juges: Extract<ResultatContrefactuelOutils, { statut: "termine" }>["juges"]): ResultatContrefactuelOutils {
    return { statut: "termine", sous_effectif: true, mentions_residuelles: 1, juges };
  }

  const MESURE_J1 = { juge_id: "j1", taux: { numerateur: 1, denominateur: 4, valeur: 0.25 }, paires_ecartees: 0 } as const;
  const MESURE_J2 = { juge_id: "j2", taux: { numerateur: 0, denominateur: 3, valeur: 0 }, paires_ecartees: 1 } as const;

  it("deux juges mesurés : taux, effectifs et paires écartées de chacun, tirage rejouable ; valide au schéma", () => {
    const bloc = publierTermineOutils(termine([MESURE_J1, MESURE_J2]), sous_ensemble, derangement, runDeNotation());
    expect(bloc).toEqual({
      etat: "termine",
      outils: 2,
      eligibles: 4,
      taille_visee: 200,
      taille: 4,
      sous_effectif: true,
      correspondances: { "outil-alpha": "outil-beta", "outil-beta": "outil-alpha" },
      cle_graine: ["contrefactuel_outil"],
      cle_graine_derangement: ["contrefactuel", "noms_outils", "derangement"],
      mentions_residuelles: 1,
      juges: [
        { juge_id: "j1", taux_changement: 0.25, changements: { numerateur: 1, denominateur: 4 }, paires_ecartees: 0 },
        { juge_id: "j2", taux_changement: 0, changements: { numerateur: 0, denominateur: 3 }, paires_ecartees: 1 },
      ],
    });
    valideDans(runDuTest(), bloc);
  });

  it("juge retiré au test des candidats : publié non mesuré, sans taux ni effectifs ; l'autre mesuré ; valide au schéma", () => {
    const bloc = publierTermineOutils(termine([MESURE_J1]), sous_ensemble, derangement, runDeNotation(["j2"]));
    expect(bloc.juges).toEqual([
      { juge_id: "j1", taux_changement: 0.25, changements: { numerateur: 1, denominateur: 4 }, paires_ecartees: 0 },
      { juge_id: "j2", motif_non_mesure: "retire_au_test_des_candidats" },
    ]);
    valideDans(runDuTest(["j2"]), bloc);
  });

  it("toutes les paires d'un juge écartées par ses renvois : taux absent avec toutes_paires_ecartees, jamais 0 % ; valide au schéma", () => {
    const indefini = { juge_id: "j2", motif_indefini: "toutes_paires_ecartees", paires_ecartees: 4 } as const;
    const bloc = publierTermineOutils(termine([MESURE_J1, indefini]), sous_ensemble, derangement, runDeNotation());
    expect(bloc.juges[1]).toEqual({ juge_id: "j2", motif_indefini: "toutes_paires_ecartees", paires_ecartees: 4 });
    valideDans(runDuTest(), bloc);
  });

  it("aiguillage : sans réponse éligible, le chemin existant publierSansReponseEligible, inchangé ; en attente, refus", () => {
    const vide = tirerSousEnsembleContrefactuelOutils([], GRAINE);
    const indefini = testerContrefactuelOutils({ run: runDeNotation(), sous_ensemble: vide, paires: [], notations: [], renvois: [] });
    expect(publierContrefactuelOutilsJoue(indefini, vide, derangement, runDeNotation())).toEqual(publierSansReponseEligible(indefini, vide, derangement));
    expect(publierContrefactuelOutilsJoue(termine([MESURE_J1, MESURE_J2]), sous_ensemble, derangement, runDeNotation())).toMatchObject({ etat: "termine" });
    const en_attente = { statut: "en_attente", sous_effectif: true, mentions_residuelles: 0, paires_incompletes: [{ reponse_id: "01JBANCESSA1REP0NSE0000001", juge_id: "j1", manque: ["permutee"] }] } as const;
    expect(() => publierContrefactuelOutilsJoue(en_attente, sous_ensemble, derangement, runDeNotation())).toThrow(ContrefactuelOutilsNonPubliable);
  });

  it("un résultat qui ne concorde pas avec le tirage ou les juges du run se refuse plutôt que de se compléter", () => {
    const run = runDeNotation();
    // Dénominateur + paires écartées ≠ taille du sous-ensemble.
    expect(() => publierTermineOutils(termine([MESURE_J1, { ...MESURE_J2, paires_ecartees: 0 }]), sous_ensemble, derangement, run)).toThrow(ContrefactuelOutilsNonPubliable);
    // Taux indéfini sans que toutes les paires soient écartées.
    expect(() => publierTermineOutils(termine([MESURE_J1, { juge_id: "j2", motif_indefini: "toutes_paires_ecartees", paires_ecartees: 3 }]), sous_ensemble, derangement, run)).toThrow(ContrefactuelOutilsNonPubliable);
    // Un juge retiré mesuré, ou un juge non retiré absent du résultat.
    expect(() => publierTermineOutils(termine([MESURE_J1, MESURE_J2]), sous_ensemble, derangement, runDeNotation(["j2"]))).toThrow(ContrefactuelOutilsNonPubliable);
    expect(() => publierTermineOutils(termine([MESURE_J1]), sous_ensemble, derangement, run)).toThrow(ContrefactuelOutilsNonPubliable);
    // Sous-effectif différent du tirage, sous-ensemble vide, test non terminé.
    expect(() => publierTermineOutils({ ...termine([MESURE_J1, MESURE_J2]), sous_effectif: false }, sous_ensemble, derangement, run)).toThrow(ContrefactuelOutilsNonPubliable);
    expect(() => publierTermineOutils(termine([MESURE_J1, MESURE_J2]), tirerSousEnsembleContrefactuelOutils([], GRAINE), derangement, run)).toThrow(ContrefactuelOutilsNonPubliable);
    const indefini = { statut: "indefini", motif: "aucune_reponse_eligible", sous_effectif: true, mentions_residuelles: 0 } as const;
    expect(() => publierTermineOutils(indefini, sous_ensemble, derangement, run)).toThrow(ContrefactuelOutilsNonPubliable);
  });

  it("schéma : un test terminé sans juges, avec un motif d'absence, ou sans juge mesuré est refusé", () => {
    const bloc = publierTermineOutils(termine([MESURE_J1, MESURE_J2]), sous_ensemble, derangement, runDeNotation());
    const { juges: _juges, ...sans_juges } = bloc;
    expect(() => valider("run", { ...runDuTest(), contrefactuel_outils: sans_juges }, "run de test")).toThrow(/\/contrefactuel_outils : must have required property 'juges'/u);
    expect(() => valider("run", { ...runDuTest(), contrefactuel_outils: { ...bloc, motif_indefini: "aucune_reponse_eligible" } }, "run de test")).toThrow(
      /\/contrefactuel_outils\/motif_indefini : boolean schema is false/u,
    );
    const aucun_mesure = bloc.juges.map((juge) => ({ juge_id: juge.juge_id, motif_non_mesure: "retire_au_test_des_candidats" }));
    expect(() => valider("run", { ...runDuTest(), contrefactuel_outils: { ...bloc, juges: aucun_mesure } }, "run de test")).toThrow(/\/contrefactuel_outils\/juges : must contain at least 1/u);
  });
});

describe("D90 : déterminisme du sous-ensemble du contrefactuel d'outil", () => {
  const IDS = Array.from({ length: 250 }, (_, rang) => `01JBANCESSA1REP0NSE${String(rang).padStart(7, "0")}`);

  it("même graine ⇒ même sous-ensemble, quel que soit l'ordre des éligibles reçus ; 200 tirés, sans sous-effectif", () => {
    const premier = tirerSousEnsembleContrefactuelOutils(IDS, GRAINE);
    const second = tirerSousEnsembleContrefactuelOutils([...IDS].reverse(), GRAINE);
    expect(second).toEqual(premier);
    expect(premier).toMatchObject({ eligibles: 250, taille_visee: 200, sous_effectif: false });
    expect(premier.reponse_ids).toHaveLength(200);
  });

  it("autre graine ⇒ autre tirage ; sa clé propre le sépare du sous-ensemble des candidats sous la même graine", () => {
    const premier = tirerSousEnsembleContrefactuelOutils(IDS, GRAINE);
    expect(tirerSousEnsembleContrefactuelOutils(IDS, { ...GRAINE, valeur: 2027 }).reponse_ids).not.toEqual(premier.reponse_ids);
    expect(tirerSousEnsembleContrefactuel(IDS, GRAINE).reponse_ids).not.toEqual(premier.reponse_ids);
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
