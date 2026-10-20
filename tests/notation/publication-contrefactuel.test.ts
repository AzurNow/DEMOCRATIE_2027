/**
 * Du résultat du test contrefactuel (`contrefactuel.ts`) aux champs publiés du run (lot notation,
 * PR C, cas limite 12 du brief). Chaque sortie est fusionnée dans l'exemple valide de run et
 * validée contre `schema/run.schema.json` : la fonction ne produit rien que le schéma refuse.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ulid } from "../analysis/fabriques.ts";
import type { ResultatContrefactuel, ResultatJuge } from "../../pipeline/notation/contrefactuel.ts";
import type { Derangement } from "../../pipeline/notation/derangement.ts";
import { CLE_SOUS_ENSEMBLE_CONTREFACTUEL, type SousEnsembleContrefactuel } from "../../pipeline/notation/echantillons.ts";
import {
  ContrefactuelNonPubliable,
  publierContrefactuel,
  type PublicationContrefactuel,
} from "../../pipeline/notation/publication-contrefactuel.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { CANDIDATS_DU_RUN, runDeNotation } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "run", "valide-01-mensuel-publie.json");

const [ALPHA, BETA, GAMMA] = CANDIDATS_DU_RUN as [(typeof CANDIDATS_DU_RUN)[number], (typeof CANDIDATS_DU_RUN)[number], (typeof CANDIDATS_DU_RUN)[number]];
const CYCLE: Derangement = {
  paires: [
    { source: ALPHA, image: BETA },
    { source: BETA, image: GAMMA },
    { source: GAMMA, image: ALPHA },
  ],
  hors_derangement: [],
};

function sousEnsemble(taille: number, eligibles = taille): SousEnsembleContrefactuel {
  return {
    reponse_ids: Array.from({ length: taille }, (_, i) => ulid(`sous-ensemble-${i}`)),
    eligibles,
    taille_visee: 200,
    sous_effectif: eligibles < 200,
  };
}

function resultatJuge(juge_id: string, numerateur: number, retire: boolean, denominateur = 200): ResultatJuge {
  const valeur = numerateur / denominateur;
  return {
    juge_id,
    taux: { numerateur, denominateur, valeur },
    taux_changement_contrefactuel: valeur,
    paires_ecartees_contrefactuel: 0,
    retire,
    ...(retire ? { motif_retrait: `Test contrefactuel des noms de candidats : ${numerateur} changements sur ${denominateur}, au-delà de 3 % (§7).` } : {}),
  };
}

type RunBrut = Record<string, unknown> & { juges: Record<string, unknown>[] };

/** L'exemple valide de run, les champs publiés fusionnés, juge par juge sur les identifiants. */
function fusionner(publication: PublicationContrefactuel, ajuster: (run: RunBrut) => RunBrut = (r) => r): unknown {
  const base = JSON.parse(readFileSync(EXEMPLE, "utf8")) as RunBrut;
  const juges = ["j1", "j2"].map((juge_id, rang) => {
    const {
      taux_changement_contrefactuel: _t,
      changements_contrefactuel: _c,
      paires_ecartees_contrefactuel: _p,
      retire: _r,
      motif_retrait: _m,
      kappa_echantillon_humain: kappa,
      renvois_ecartes_kappa_echantillon: renvois,
      ...reste
    } = base.juges[rang] as Record<string, unknown>;
    const publie = publication.juges.find((j) => j.juge_id === juge_id);
    // Modifié ouvertement (lot go-no-go, D24 (1)) : l'exemple porte le kappa de l'échantillon de
    // chaque juge retenu ; un juge que le test retire n'en a pas (D13), un juge retenu le garde.
    // Modifié ouvertement (D31) : les paires écartées viennent de la publication ; les renvois écartés
    // du kappa suivent le kappa.
    return { ...reste, ...(publie?.retire === true ? {} : { kappa_echantillon_humain: kappa, renvois_ecartes_kappa_echantillon: renvois }), ...publie };
  });
  const { invalidation, ...champs } = publication;
  const run: RunBrut = {
    ...base,
    ...champs,
    juges,
    // Modifié ouvertement (D51 (2)) : l'appelant date l'invalidation qu'il inscrit (inscription-contrefactuel.ts),
    // et le schéma exige désormais cette date ; la publication n'en porte pas. Le statut, lui, n'est
    // jamais écrit par publierContrefactuel (constat 34, revue du 2026-10-17) : c'est l'appelant qui,
    // pour ce test, le fait passer à invalide afin de garder le run fusionné conforme au schéma.
    ...(invalidation === undefined ? {} : { statut: "invalide", invalidation: { ...invalidation, date: "2026-12-02T10:00:00+01:00" } }),
  };
  return ajuster(run);
}

describe("12. ResultatContrefactuel → champs du run", () => {
  it("constat 34 : PublicationContrefactuel ne porte aucune clé statut, à la compilation", () => {
    expectTypeOf<Extract<keyof PublicationContrefactuel, "statut">>().toEqualTypeOf<never>();
  });

  it("termine avec un retrait : taux 0.25, effectifs et motif publiés, bloc conforme au schéma", () => {
    const resultat: ResultatContrefactuel = {
      statut: "termine",
      sous_effectif: false,
      mentions_residuelles: 3,
      juges: [resultatJuge("j1", 2, false), resultatJuge("j2", 9, true)],
      taux_echantillon_humain: 0.25,
    };
    const publication = publierContrefactuel(resultat, sousEnsemble(200, 480), CYCLE, runDeNotation());
    expect(publication.taux_echantillon_humain).toBe(0.25);
    expect(publication.invalidation).toBeUndefined();
    expect("statut" in publication).toBe(false);
    expect(publication.contrefactuel_candidats).toEqual({
      etat: "termine",
      eligibles: 480,
      taille_visee: 200,
      taille: 200,
      sous_effectif: false,
      correspondances: { "demo-alpha": "demo-beta", "demo-beta": "demo-gamma", "demo-gamma": "demo-alpha" },
      cle_graine: [...CLE_SOUS_ENSEMBLE_CONTREFACTUEL],
      cle_graine_derangement: ["contrefactuel", "noms_candidats", "derangement"],
      mentions_residuelles: 3,
    });
    expect(publication.juges).toEqual([
      // Modifié ouvertement (D31 (1)) : paires_ecartees_contrefactuel accompagne les effectifs.
      { juge_id: "j1", retire: false, taux_changement_contrefactuel: 0.01, changements_contrefactuel: { numerateur: 2, denominateur: 200 }, paires_ecartees_contrefactuel: 0 },
      {
        juge_id: "j2",
        retire: true,
        motif_retrait: "Test contrefactuel des noms de candidats : 9 changements sur 200, au-delà de 3 % (§7).",
        taux_changement_contrefactuel: 0.045,
        changements_contrefactuel: { numerateur: 9, denominateur: 200 },
        paires_ecartees_contrefactuel: 0,
      },
    ]);
    expect(() => valider("run", fusionner(publication), "run fusionné")).not.toThrow();
  });

  it("D31 (1) : paires écartées publiées ; un juge à toutes paires écartées publie le motif, sans taux ni effectifs, conforme au schéma", () => {
    const resultat: ResultatContrefactuel = {
      statut: "termine",
      sous_effectif: false,
      mentions_residuelles: 0,
      juges: [
        { ...resultatJuge("j1", 2, false, 197), paires_ecartees_contrefactuel: 3 },
        { juge_id: "j2", motif_indefini_contrefactuel: "toutes_paires_ecartees", paires_ecartees_contrefactuel: 200, retire: false },
      ],
      taux_echantillon_humain: 0.1,
    };
    const publication = publierContrefactuel(resultat, sousEnsemble(200, 480), CYCLE, runDeNotation());
    expect(publication.juges).toEqual([
      { juge_id: "j1", retire: false, taux_changement_contrefactuel: 2 / 197, changements_contrefactuel: { numerateur: 2, denominateur: 197 }, paires_ecartees_contrefactuel: 3 },
      { juge_id: "j2", retire: false, paires_ecartees_contrefactuel: 200, motif_indefini_contrefactuel: "toutes_paires_ecartees" },
    ]);
    expect(() => valider("run", fusionner(publication), "run fusionné")).not.toThrow();
  });

  it("D31 (1) : dénominateur + paires écartées différent de la taille, ou taux indéfini sans toutes les paires : non publiable", () => {
    const avec = (juge: ResultatJuge): ResultatContrefactuel => ({ statut: "termine", sous_effectif: false, mentions_residuelles: 0, juges: [resultatJuge("j1", 2, false), juge], taux_echantillon_humain: 0.1 });
    expect(() => publierContrefactuel(avec({ ...resultatJuge("j2", 2, false, 197), paires_ecartees_contrefactuel: 2 }), sousEnsemble(200), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
    expect(() => publierContrefactuel(avec({ juge_id: "j2", motif_indefini_contrefactuel: "toutes_paires_ecartees", paires_ecartees_contrefactuel: 199, retire: false }), sousEnsemble(200), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
  });

  it("indefini : aucun taux de juge, aucun retrait, 10 %, sous-ensemble vide", () => {
    const resultat: ResultatContrefactuel = {
      statut: "indefini",
      motif: "aucune_reponse_eligible",
      sous_effectif: true,
      mentions_residuelles: 0,
      taux_echantillon_humain: 0.1,
    };
    const publication = publierContrefactuel(resultat, sousEnsemble(0), CYCLE, runDeNotation());
    expect(publication.contrefactuel_candidats).toMatchObject({ etat: "indefini", eligibles: 0, taille: 0, sous_effectif: true });
    expect(publication.juges).toEqual([
      { juge_id: "j1", retire: false },
      { juge_id: "j2", retire: false },
    ]);
    expect(publication.taux_echantillon_humain).toBe(0.1);
    expect("statut" in publication).toBe(false);
    expect(() => valider("run", fusionner(publication), "run fusionné")).not.toThrow();
  });

  it("run_invalide : les deux juges retirés, motif publié, sans nouveau champ (D16 (3)) ; le statut n'est jamais écrit ici (constat 34)", () => {
    const resultat: ResultatContrefactuel = {
      statut: "run_invalide",
      raison: "Les deux juges dépassent 3 % de changement au test contrefactuel des noms de candidats : aucun juge n'est retenu (§7, D16 (3)).",
      sous_effectif: true,
      mentions_residuelles: 0,
      juges: [resultatJuge("j1", 1, true, 20), resultatJuge("j2", 2, true, 20)],
    };
    const publication = publierContrefactuel(resultat, sousEnsemble(20), CYCLE, runDeNotation());
    // Le run invalide se reconnaît à resultat.statut === "run_invalide" et à sa raison (chaine.ts
    // en fait de même) ; publierContrefactuel ne produit ni ne lit de champ "statut".
    expect("statut" in publication).toBe(false);
    expect(publication.invalidation).toEqual({ motif: resultat.raison });
    expect(publication.taux_echantillon_humain).toBe(0.25);
    expect(publication.juges.every((j) => j.retire)).toBe(true);
    const sansGoNoGo = (run: RunBrut): RunBrut => {
      const { go_no_go: _g, ...reste } = run;
      return reste;
    };
    expect(() => valider("run", fusionner(publication, sansGoNoGo), "run fusionné")).not.toThrow();
  });

  it("en_attente : erreur, un test incomplet ne se publie pas", () => {
    const resultat: ResultatContrefactuel = {
      statut: "en_attente",
      sous_effectif: false,
      mentions_residuelles: 0,
      paires_incompletes: [{ reponse_id: ulid("sous-ensemble-0"), juge_id: "j1", manque: ["permutee"] }],
    };
    expect(() => publierContrefactuel(resultat, sousEnsemble(200), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
  });

  it("un dénominateur de juge qui n'est pas la taille du sous-ensemble : erreur", () => {
    const resultat: ResultatContrefactuel = {
      statut: "termine",
      sous_effectif: false,
      mentions_residuelles: 0,
      juges: [resultatJuge("j1", 2, false, 199), resultatJuge("j2", 2, false)],
      taux_echantillon_humain: 0.1,
    };
    expect(() => publierContrefactuel(resultat, sousEnsemble(200), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
  });

  it("un sous-effectif qui diffère entre le résultat et le tirage : erreur", () => {
    const resultat: ResultatContrefactuel = {
      statut: "termine",
      sous_effectif: true,
      mentions_residuelles: 0,
      juges: [resultatJuge("j1", 2, false), resultatJuge("j2", 2, false)],
      taux_echantillon_humain: 0.1,
    };
    expect(() => publierContrefactuel(resultat, sousEnsemble(200, 480), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
  });

  it("des juges du résultat qui ne sont pas ceux du run : erreur", () => {
    const resultat: ResultatContrefactuel = {
      statut: "termine",
      sous_effectif: false,
      mentions_residuelles: 0,
      juges: [resultatJuge("j1", 2, false), resultatJuge("j9", 2, false)],
      taux_echantillon_humain: 0.1,
    };
    expect(() => publierContrefactuel(resultat, sousEnsemble(200), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
  });

  it("indefini avec un sous-ensemble non vide : erreur", () => {
    const resultat: ResultatContrefactuel = {
      statut: "indefini",
      motif: "aucune_reponse_eligible",
      sous_effectif: true,
      mentions_residuelles: 0,
      taux_echantillon_humain: 0.1,
    };
    expect(() => publierContrefactuel(resultat, sousEnsemble(3), CYCLE, runDeNotation())).toThrow(ContrefactuelNonPubliable);
  });
});
