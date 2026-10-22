/**
 * Taux de changement du test contrefactuel et décision de retrait (§7 ; D14 (3), D16 (2) et (3)).
 * Cas limites 11 à 14 du brief de la PR B du lot notation. Les notations d'entrée sont validées
 * contre `schema/notation.schema.json` : aucun test ne repose sur une entrée impossible.
 */

import { describe, expect, it } from "vitest";
import {
  ContrefactuelIncoherent,
  depasseSeuilRetrait,
  testerContrefactuel,
  type EntreeContrefactuel,
  type PaireContrefactuelle,
  type ResultatContrefactuel,
  type ResultatJuge,
} from "../../pipeline/notation/contrefactuel.ts";
import type { RenvoiHumain } from "../../pipeline/notation/types.ts";
import { JugeIndetermine } from "../../pipeline/notation/decision.ts";
import type { TextesDeVerification } from "../../pipeline/notation/extrait.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { inexacte, lien, notationHumaine, notationJuge, renvoiJuge, REPONSE_PROJETEE, runDeNotation } from "./fabriques.ts";
import { critereTestContrefactuel } from "../../pipeline/go-no-go/criteres-juges.ts";
import { publierContrefactuel } from "../../pipeline/notation/publication-contrefactuel.ts";

const TEXTES: TextesDeVerification = { reponse: REPONSE_PROJETEE, citations_reference: [] };

function origineId(i: number): string {
  return ulid(`origine-${i}`);
}

function permuteeId(i: number): string {
  return ulid(`permutee-${i}`);
}

function paire(i: number, mentions = 0): PaireContrefactuelle {
  return {
    reponse_id: origineId(i),
    contrefactuelle_id: permuteeId(i),
    textes_origine: TEXTES,
    textes_permutes: TEXTES,
    mentions_residuelles: mentions,
  };
}

type Surcharges = Parameters<typeof notationJuge>[1];

function surOrigine(juge: string, i: number, surcharges: Surcharges = {}): NotationIndividuelle {
  return notationJuge(juge, { objet_note: { type: "reponse", id: origineId(i) }, ...surcharges });
}

function surPermutee(juge: string, i: number, surcharges: Surcharges = {}): NotationIndividuelle {
  return notationJuge(juge, {
    objet_note: { type: "reponse", id: permuteeId(i) },
    contexte: "contrefactuel_candidat",
    motif_notation: "contrefactuel",
    ...surcharges,
  });
}

/**
 * `n` paires ; pour chaque juge, les `changements[juge]` premières changent (exacte → inexacte), les
 * autres concordent.
 */
function jeu(n: number, changements: Readonly<Record<string, number>> = {}, eligibles = n): EntreeContrefactuel {
  const notations: NotationIndividuelle[] = [];
  for (let i = 0; i < n; i += 1) {
    for (const juge of ["j1", "j2"]) {
      notations.push(surOrigine(juge, i));
      const change = changements[juge] !== undefined && i < changements[juge];
      notations.push(surPermutee(juge, i, change ? inexacte() : {}));
    }
  }
  return entree(n, notations, eligibles);
}

function entree(n: number, notations: readonly NotationIndividuelle[], eligibles = n, renvois: readonly RenvoiHumain[] = []): EntreeContrefactuel {
  for (const notation of notations) valider("notation", notation, `notation de test ${notation.id}`);
  const ids = Array.from({ length: n }, (_, i) => origineId(i));
  return {
    run: runDeNotation(),
    sous_ensemble: { reponse_ids: ids, eligibles, taille_visee: 200, sous_effectif: eligibles < 200 },
    paires: ids.map((_, i) => paire(i)),
    notations,
    renvois,
  };
}

function termine(resultat: ResultatContrefactuel) {
  if (resultat.statut !== "termine") throw new Error(`statut ${resultat.statut} au lieu de termine`);
  return resultat;
}

function resultatDe(resultat: ResultatContrefactuel, juge_id: string): ResultatJuge {
  if (resultat.statut !== "termine" && resultat.statut !== "run_invalide") throw new Error(`statut ${resultat.statut}`);
  const trouve = resultat.juges.find((j) => j.juge_id === juge_id);
  if (trouve === undefined) throw new Error(`juge ${juge_id} absent`);
  return trouve;
}

/** Le résultat d'un juge dont le taux est défini. */
function juge(resultat: ResultatContrefactuel, juge_id: string): Extract<ResultatJuge, { taux: unknown }> {
  const trouve = resultatDe(resultat, juge_id);
  if (!("taux" in trouve)) throw new Error(`juge ${juge_id} : taux indéfini`);
  return trouve;
}

describe("depasseSeuilRetrait (constat 16 de la revue du 2026-10-12)", () => {
  it("6 sur 200 : 3 % tout juste, pas dépassé", () => {
    expect(depasseSeuilRetrait(6, 200)).toBe(false);
  });

  it("7 sur 200 : au-delà de 3 %, dépassé", () => {
    expect(depasseSeuilRetrait(7, 200)).toBe(true);
  });

  it("0 sur 0 : dénominateur nul, pas dépassé (comportement actuel, inchangé)", () => {
    expect(depasseSeuilRetrait(0, 0)).toBe(false);
  });
});

describe("taux de changement et seuil de 3 %", () => {
  it("6 changements sur 200 : 3 % tout juste, pas retiré", () => {
    const resultat = testerContrefactuel(jeu(200, { j1: 6 }));
    expect(juge(resultat, "j1")).toEqual({
      juge_id: "j1",
      taux: { numerateur: 6, denominateur: 200, valeur: 0.03 },
      taux_changement_contrefactuel: 0.03,
      // Ajouté ouvertement (D31 (1)) : le nombre de paires écartées accompagne le taux.
      paires_ecartees_contrefactuel: 0,
      retire: false,
    });
    expect(termine(resultat).taux_echantillon_humain).toBe(0.1);
  });

  it("7 changements sur 200 : au-delà de 3 %, retiré avec son motif", () => {
    const resultat = testerContrefactuel(jeu(200, { j1: 7 }));
    const j1 = juge(resultat, "j1");
    expect(j1.taux).toEqual({ numerateur: 7, denominateur: 200, valeur: 0.035 });
    expect(j1.retire).toBe(true);
    expect(j1.motif_retrait).toMatch(/7 changements sur 200/);
    expect(juge(resultat, "j2").retire).toBe(false);
  });

  it("sous-effectif (37 éligibles) : dénominateur 37 et drapeau recopié", () => {
    const resultat = termine(testerContrefactuel(jeu(37, { j2: 1 }, 37)));
    expect(resultat.sous_effectif).toBe(true);
    expect(juge(resultat, "j2").taux).toEqual({ numerateur: 1, denominateur: 37, valeur: 1 / 37 });
    // 1 × 100 > 3 × 37 = 111 ? Non : pas retiré.
    expect(juge(resultat, "j2").retire).toBe(false);
    expect(termine(testerContrefactuel(jeu(37, { j2: 2 }, 37))).juges.find((j) => j.juge_id === "j2")?.retire).toBe(true);
  });

  it("200 réponses tirées parmi plus de 200 éligibles : pas de sous-effectif", () => {
    expect(termine(testerContrefactuel(jeu(200, {}, 450))).sous_effectif).toBe(false);
  });

  it("sous-ensemble vide : taux indéfini, aucun retrait, jamais 0 %", () => {
    const resultat = testerContrefactuel(entree(0, [], 0));
    expect(resultat).toEqual({
      statut: "indefini",
      motif: "aucune_reponse_eligible",
      taux_echantillon_humain: 0.1,
      sous_effectif: true,
      mentions_residuelles: 0,
    });
  });

  it("le total des mentions résiduelles des paires accompagne le résultat", () => {
    const base = jeu(3);
    const resultat = testerContrefactuel({ ...base, paires: [paire(0, 2), paire(1), paire(2, 5)] });
    expect(resultat.mentions_residuelles).toBe(7);
  });
});

describe("issue du test", () => {
  it("aucun juge retiré : échantillon humain à 10 %", () => {
    const resultat = termine(testerContrefactuel(jeu(200, { j1: 6, j2: 6 })));
    expect(resultat.taux_echantillon_humain).toBe(0.1);
    expect(resultat.juges.every((j) => !j.retire)).toBe(true);
  });

  it("un juge retiré : échantillon humain à 25 %", () => {
    expect(termine(testerContrefactuel(jeu(200, { j2: 30 }))).taux_echantillon_humain).toBe(0.25);
  });

  it("les deux juges retirés : run invalide avec sa raison, aucun juge retenu", () => {
    const resultat = testerContrefactuel(jeu(200, { j1: 7, j2: 8 }));
    expect(resultat.statut).toBe("run_invalide");
    if (resultat.statut !== "run_invalide") return;
    expect(resultat.raison).toMatch(/deux juges/);
    expect(resultat.juges.map((j) => j.retire)).toEqual([true, true]);
    expect("taux_echantillon_humain" in resultat).toBe(false);
  });
});

describe("ce qu'est un changement", () => {
  // Rétabli (D30 (1)) : D29 (2) avait ajouté le motif par erreur ; le changement porte sur ce que
  // lisent les métriques primaires, sourçage excepté (D14 (3)).
  it("D14 (3) : notes concordantes mais motifs d'inexactitude différents, pas un changement", () => {
    const notations = [
      surOrigine("j1", 0, inexacte()),
      surPermutee("j1", 0, { ...inexacte(), motif_inexactitude: "ajout_fabrique" }),
      surOrigine("j2", 0),
      surPermutee("j2", 0),
    ];
    expect(juge(testerContrefactuel(entree(1, notations)), "j1").taux.numerateur).toBe(0);
  });

  it("D30 (1) : seul le soutien d'un lien diffère (sourçage valide d'un côté, pas de l'autre) : pas un changement", () => {
    const soutient = { sourcage: { cite: true, liens: [lien("existe", "soutient")] } };
    const neSoutientPas = { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } };
    const notations = [surOrigine("j1", 0, soutient), surPermutee("j1", 0, neSoutientPas), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(juge(testerContrefactuel(entree(1, notations)), "j1").taux.numerateur).toBe(0);
  });

  it("D30 (1) : la fraîcheur de l'obsolescence différente est un changement", () => {
    const obsolete = (fraiche: boolean) => ({ ...inexacte(["obsolescence"]), obsolescence_fraiche: fraiche });
    const notations = [surOrigine("j1", 0, obsolete(true)), surPermutee("j1", 0, obsolete(false)), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(juge(testerContrefactuel(entree(1, notations)), "j1").taux.numerateur).toBe(1);
  });

  it("D30 (1) : un drapeau différent reste un changement", () => {
    const notations = [surOrigine("j1", 0, inexacte()), surPermutee("j1", 0, inexacte(["deformation"])), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(juge(testerContrefactuel(entree(1, notations)), "j1").taux.numerateur).toBe(1);
  });

  it("D16 (2) : un extrait invalide du côté permuté est un changement, même à note égale", () => {
    const introuvable = { ...inexacte(), extrait_justificatif: { provenance: "reponse" as const, texte: "absent du texte", verifie_deterministe: true } };
    const notations = [surOrigine("j1", 0, inexacte()), surPermutee("j1", 0, introuvable), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(juge(testerContrefactuel(entree(1, notations)), "j1").taux.numerateur).toBe(1);
  });

  it("D16 (2) : un extrait invalide du côté d'origine est un changement, même à note égale", () => {
    const introuvable = { ...inexacte(), extrait_justificatif: { provenance: "reponse" as const, texte: "absent du texte", verifie_deterministe: true } };
    const notations = [surOrigine("j1", 0, introuvable), surPermutee("j1", 0, inexacte()), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(juge(testerContrefactuel(entree(1, notations)), "j1").taux.numerateur).toBe(1);
  });

  it("chaque côté se contrôle contre ses propres textes", () => {
    const notations = [surOrigine("j1", 0, inexacte()), surPermutee("j1", 0, inexacte()), surOrigine("j2", 0), surPermutee("j2", 0)];
    const base = entree(1, notations);
    const autresTextes = { reponse: "Un texte permuté sans l'extrait.", citations_reference: [] };
    const resultat = testerContrefactuel({ ...base, paires: [{ ...paire(0), textes_permutes: autresTextes }] });
    expect(juge(resultat, "j1").taux.numerateur).toBe(1);
    // j2 note « exacte » sans extrait des deux côtés : rien à invalider.
    expect(juge(resultat, "j2").taux.numerateur).toBe(0);
  });
});

describe("notations manquantes ou incohérentes", () => {
  it("une notation permutée manquante met le test en attente, avec la paire", () => {
    const base = jeu(3);
    const sansUne = base.notations.filter((n) => !(n.notateur.id === "j2" && n.objet_note.id === permuteeId(1)));
    const resultat = testerContrefactuel({ ...base, notations: sansUne });
    expect(resultat.statut).toBe("en_attente");
    if (resultat.statut !== "en_attente") return;
    expect(resultat.paires_incompletes).toEqual([{ reponse_id: origineId(1), juge_id: "j2", manque: ["permutee"] }]);
    expect("juges" in resultat).toBe(false);
  });

  it("toutes les paires incomplètes sont listées, des deux côtés", () => {
    const base = jeu(2);
    const resultat = testerContrefactuel({ ...base, notations: base.notations.filter((n) => n.notateur.id !== "j1") });
    if (resultat.statut !== "en_attente") throw new Error(resultat.statut);
    expect(resultat.paires_incompletes).toEqual([
      { reponse_id: origineId(0), juge_id: "j1", manque: ["origine", "permutee"] },
      { reponse_id: origineId(1), juge_id: "j1", manque: ["origine", "permutee"] },
    ]);
  });

  it("une notation indeterminee d'un juge lève JugeIndetermine", () => {
    const base = jeu(1);
    // Contourne le schéma, qui l'interdit déjà : le code ne doit pas compter sur lui.
    const indeterminee = { ...surPermutee("j1", 0), categorie: "indeterminee" as const };
    const notations = base.notations.map((n) => (n.id === indeterminee.id ? indeterminee : n));
    expect(() => testerContrefactuel({ ...base, notations })).toThrow(JugeIndetermine);
  });

  it("une notation permutée en contexte run lève", () => {
    const base = jeu(1);
    const fautive = surPermutee("j1", 0, { contexte: "run" });
    const notations = base.notations.map((n) => (n.id === fautive.id ? fautive : n));
    expect(() => testerContrefactuel({ ...base, notations })).toThrow(ContrefactuelIncoherent);
  });

  it("une notation d'origine sous le motif contrefactuel lève", () => {
    const base = jeu(1);
    const fautive = surOrigine("j1", 0, { motif_notation: "contrefactuel" });
    const notations = base.notations.map((n) => (n.id === fautive.id ? fautive : n));
    expect(() => testerContrefactuel({ ...base, notations })).toThrow(/motif contrefactuel/);
  });

  it("deux notations d'un même juge sur un objet lèvent", () => {
    const base = jeu(1);
    const seconde = { ...surPermutee("j1", 0), id: ulid("seconde") };
    expect(() => testerContrefactuel({ ...base, notations: [...base.notations, seconde] })).toThrow(/deux notations/);
  });

  it("une notation d'un autre run, d'un objet hors des paires, d'un humain ou d'un juge inconnu lève", () => {
    const base = jeu(1);
    const fautives = [
      { ...surOrigine("j1", 0), run_id: ulid("autre-run") },
      surOrigine("j1", 99),
      notationHumaine("a1", "desaccord_juges", { objet_note: { type: "reponse", id: origineId(0) } }),
      surOrigine("j3", 0),
    ];
    for (const fautive of fautives) {
      expect(() => testerContrefactuel({ ...base, notations: [...base.notations, fautive] })).toThrow(ContrefactuelIncoherent);
    }
  });

  it("un juge déjà retiré lève : le test précède tout retrait (D14 (1))", () => {
    expect(() => testerContrefactuel({ ...jeu(1), run: runDeNotation(["j2"]) })).toThrow(/précède tout retrait/);
  });

  it("une paire hors du sous-ensemble, ou une réponse tirée sans paire, lève", () => {
    const base = jeu(2);
    expect(() => testerContrefactuel({ ...base, paires: [paire(0)] })).toThrow(/sans réponse contrefactuelle/);
    expect(() => testerContrefactuel({ ...base, paires: [paire(0), paire(1), paire(5)] })).toThrow(/n'appartient pas/);
    expect(() => testerContrefactuel({ ...base, paires: [paire(0), paire(0)] })).toThrow(/deux fois/);
  });
});

/** D31 (1) : une paire dont un côté au moins porte un renvoi de CE juge est écartée de son taux. */
describe("renvois d'attribution dans les paires (D31 (1))", () => {
  const renvoiOrigine = (juge_id: string, i: number): RenvoiHumain => renvoiJuge(juge_id, { objet_note: { type: "reponse", id: origineId(i) } });
  const renvoiPermute = (juge_id: string, i: number): RenvoiHumain =>
    renvoiJuge(juge_id, { id: ulid(`renvoi-permute-${juge_id}-${i}`), objet_note: { type: "reponse", id: permuteeId(i) }, contexte: "contrefactuel_candidat" });
  /** `n` paires concordantes ; les notations des côtés renvoyés sont retirées. */
  function avecRenvois(n: number, renvois: readonly RenvoiHumain[], changeJ1: readonly number[] = []): EntreeContrefactuel {
    const renvoyes = new Set(renvois.map((r) => `${r.notateur.id}|${r.objet_note.id}`));
    const notations: NotationIndividuelle[] = [];
    for (let i = 0; i < n; i += 1) {
      for (const j of ["j1", "j2"]) {
        notations.push(surOrigine(j, i), surPermutee(j, i, j === "j1" && changeJ1.includes(i) ? inexacte() : {}));
      }
    }
    return entree(n, notations.filter((x) => !renvoyes.has(`${x.notateur.id}|${x.objet_note.id}`)), n, renvois);
  }

  it("aucun renvoi : aucune paire écartée", () => {
    expect(juge(testerContrefactuel(avecRenvois(3, [])), "j1")).toMatchObject({ paires_ecartees_contrefactuel: 0, taux: { denominateur: 3 } });
  });

  it("un côté renvoyé (origine ou permuté) : la paire est écartée du numérateur et du dénominateur de ce juge seulement", () => {
    const resultat = testerContrefactuel(avecRenvois(4, [renvoiOrigine("j1", 0), renvoiPermute("j1", 1)], [0, 1, 2]));
    // Les paires 0 et 1 changeraient, mais elles sont écartées ; seule la 2 compte.
    expect(juge(resultat, "j1")).toMatchObject({ paires_ecartees_contrefactuel: 2, taux: { numerateur: 1, denominateur: 2 } });
    expect(juge(resultat, "j2")).toMatchObject({ paires_ecartees_contrefactuel: 0, taux: { numerateur: 0, denominateur: 4 } });
  });

  it("les deux côtés renvoyés : une seule paire écartée, pas deux", () => {
    const resultat = testerContrefactuel(avecRenvois(3, [renvoiOrigine("j1", 0), renvoiPermute("j1", 0)]));
    expect(juge(resultat, "j1")).toMatchObject({ paires_ecartees_contrefactuel: 1, taux: { denominateur: 2 } });
  });

  it("toutes les paires écartées : taux indéfini, pas de retrait, publié sans effectifs, critère go/no-go rouge", () => {
    const resultat = termine(testerContrefactuel(avecRenvois(2, [renvoiOrigine("j1", 0), renvoiPermute("j1", 1)])));
    expect(resultatDe(resultat, "j1")).toEqual({ juge_id: "j1", motif_indefini_contrefactuel: "toutes_paires_ecartees", paires_ecartees_contrefactuel: 2, retire: false });
    expect(resultat.taux_echantillon_humain).toBe(0.1);
    const ensemble = { reponse_ids: [origineId(0), origineId(1)], eligibles: 2, taille_visee: 200, sous_effectif: true };
    const publication = publierContrefactuel(resultat, ensemble, { paires: [], hors_derangement: [] }, runDeNotation());
    const critere = critereTestContrefactuel(publication.juges.map((j) => ({ ...j, retire: j.retire })));
    expect(critere.statut).toBe("rouge");
  });

  it("un renvoi et une notation du même juge sur le même objet, ou un renvoi d'un autre côté : incohérent", () => {
    const base = avecRenvois(1, []);
    expect(() => testerContrefactuel({ ...base, renvois: [renvoiOrigine("j1", 0)] })).toThrow(ContrefactuelIncoherent);
    const mauvaisCote = renvoiJuge("j1", { objet_note: { type: "reponse", id: permuteeId(0) } });
    expect(() => testerContrefactuel(avecRenvois(1, [mauvaisCote]))).toThrow(ContrefactuelIncoherent);
  });
});
