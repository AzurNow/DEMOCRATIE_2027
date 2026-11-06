/**
 * Contrefactuel d'outil (§7, protocole 0.24, D59 (13)) : dérangement des outils, remplacement du
 * libellé et de l'éditeur dans le texte des réponses, éligibilité au sous-ensemble et son tirage.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { graineDerivee, graineHexadecimale } from "../../analysis/graines.ts";
import {
  CLE_DERANGEMENT_OUTILS,
  correspondancesOutils,
  DerangementOutilsImpossible,
  estEligibleOutils,
  FormesOutilsAmbigues,
  MINIMUM_OUTILS_DERANGEMENT,
  permuterNomsOutils,
  texteNommeUnOutilPermute,
  tirerDerangementOutils,
  type DerangementOutils,
  type OutilNomme,
} from "../../pipeline/notation/derangement-outils.ts";
import {
  CLE_SOUS_ENSEMBLE_CONTREFACTUEL,
  CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS,
  TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS,
  tirerSousEnsembleContrefactuel,
  tirerSousEnsembleContrefactuelOutils,
} from "../../pipeline/notation/echantillons.ts";
import type { ReponseEcrite, ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { GENERATEUR_DU_TIRAGE, GraineNonConforme } from "../../analysis/graine-tirage.ts";
import type { GraineTirage } from "../../analysis/graine-tirage.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { generateur, melanger } from "../../validation/domaine/alea.ts";
import { RACINE_PROJET } from "../aides/depot.ts";

const EXEMPLE = join(RACINE_PROJET, "schema", "exemples", "reponse", "valide-01-api-obtenue.json");

const ALPHA: OutilNomme = { outil_id: "alpha", libelle: "Alphabot", editeur: "Société Alpha" };
const BETA: OutilNomme = { outil_id: "beta", libelle: "Le Chat", editeur: "Bêta IA" };
const GAMMA: OutilNomme = { outil_id: "gamma", libelle: "Gammachat", editeur: "Gamma Labs" };
/** Hors dérangement : son libellé contient celui de BETA. */
const DELTA: OutilNomme = { outil_id: "delta", libelle: "Le Chat Pro", editeur: "Delta Corp" };

function graine(valeur: number): GraineTirage {
  return { valeur, ...GENERATEUR_DU_TIRAGE };
}

function outils(n: number): OutilNomme[] {
  return Array.from({ length: n }, (_, i) => {
    const rang = String(i).padStart(2, "0");
    return { outil_id: `outil-${rang}`, libelle: `Outil${rang}`, editeur: `Editeur${rang}` };
  });
}

/** Un dérangement fixé à la main : ALPHA → BETA → GAMMA → ALPHA, DELTA hors dérangement. */
function cycle(): DerangementOutils {
  return {
    paires: [
      { source: ALPHA, image: BETA },
      { source: BETA, image: GAMMA },
      { source: GAMMA, image: ALPHA },
    ],
    hors_derangement: [DELTA],
  };
}

function echange(): DerangementOutils {
  return { paires: [{ source: ALPHA, image: BETA }, { source: BETA, image: ALPHA }], hors_derangement: [] };
}

function reponse(texte: string, refus_api = false): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return { ...lue, normalise: { ...lue.normalise, texte, refus_api } };
}

describe("dérangement des outils", () => {
  it("aucun point fixe, chaque outil image une fois, sur cent graines et 2 à 9 outils", () => {
    for (let valeur = 0; valeur < 100; valeur += 1) {
      for (const n of [2, 3, 5, 9]) {
        const paires = tirerDerangementOutils(outils(n), outils(n), graine(valeur)).paires;
        expect(paires).toHaveLength(n);
        for (const paire of paires) expect(paire.image.outil_id).not.toBe(paire.source.outil_id);
        expect(new Set(paires.map((p) => p.image.outil_id)).size).toBe(n);
      }
    }
  });

  it("deux outils : l'échange, quelle que soit la graine", () => {
    for (let valeur = 0; valeur < 20; valeur += 1) {
      expect(correspondancesOutils(tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA], graine(valeur)))).toEqual({ alpha: "beta", beta: "alpha" });
    }
  });

  it("un seul outil au run : dérangement impossible, refus nommé (jamais une identité)", () => {
    expect(MINIMUM_OUTILS_DERANGEMENT).toBe(2);
    expect(() => tirerDerangementOutils([ALPHA], [ALPHA, BETA], graine(1))).toThrow(DerangementOutilsImpossible);
    expect(() => tirerDerangementOutils([], [ALPHA], graine(1))).toThrow(DerangementOutilsImpossible);
  });

  it("rejouable : rangement par outil_id, Fisher-Yates, rejet des points fixes, clé noms_outils", () => {
    const ranges = outils(5);
    const rng = generateur(graineDerivee(77, CLE_DERANGEMENT_OUTILS));
    let images = melanger(ranges, rng);
    while (ranges.some((o, i) => images[i] === o)) images = melanger(ranges, rng);
    const attendu = Object.fromEntries(ranges.map((o, i) => [o.outil_id, images[i]?.outil_id]));
    expect(correspondancesOutils(tirerDerangementOutils([...ranges].reverse(), ranges, graine(77)))).toEqual(attendu);
    expect(graineHexadecimale(77, CLE_DERANGEMENT_OUTILS)).not.toBe(graineHexadecimale(77, CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS));
  });

  it("les outils hors dérangement sont transportés, triés, sans image", () => {
    const d = tirerDerangementOutils([BETA, ALPHA], [DELTA, GAMMA, BETA, ALPHA], graine(3));
    expect(d.hors_derangement.map((o) => o.outil_id)).toEqual(["delta", "gamma"]);
    expect(Object.keys(correspondancesOutils(d))).toEqual(["alpha", "beta"]);
  });

  it("graine d'un autre générateur : refus nommé", () => {
    const pcg = { ...graine(1), algorithme: "pcg64" } as unknown as GraineTirage;
    expect(() => tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA], pcg)).toThrow(GraineNonConforme);
  });
});

describe("formes des outils : non blanches sur tout le périmètre, celles d'un outil permuté uniques", () => {
  it("deux outils du même éditeur, dont un permuté : refus nommé, jamais départagé", () => {
    const memeEditeur = { ...GAMMA, editeur: ALPHA.editeur };
    expect(() => tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA, memeEditeur], graine(1))).toThrow(FormesOutilsAmbigues);
  });

  it("libellé égal à l'éditeur d'un même outil : refus nommé", () => {
    const perplexe = { outil_id: "perplexe", libelle: "Perplexe", editeur: "Perplexe" };
    expect(() => tirerDerangementOutils([ALPHA, perplexe], [ALPHA, perplexe], graine(1))).toThrow(/Perplexe/);
  });

  it("forme blanche, identifiant en double, outil permuté hors périmètre ou déclaré autrement : refus nommé", () => {
    expect(() => tirerDerangementOutils([ALPHA, BETA], [ALPHA, { ...BETA, editeur: "  " }], graine(1))).toThrow(FormesOutilsAmbigues);
    expect(() => tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA, { ...GAMMA, outil_id: "alpha" }], graine(1))).toThrow(FormesOutilsAmbigues);
    expect(() => tirerDerangementOutils([ALPHA, GAMMA], [ALPHA, BETA], graine(1))).toThrow(/gamma/);
    expect(() => tirerDerangementOutils([ALPHA, { ...BETA, libelle: "Autre" }], [ALPHA, BETA], graine(1))).toThrow(/beta/);
    expect(() => tirerDerangementOutils([ALPHA, ALPHA, BETA], [ALPHA, BETA], graine(1))).toThrow(/double/);
  });
});

describe("remplacement du libellé et de l'éditeur", () => {
  it("libellé vers libellé de l'image, éditeur vers éditeur de l'image", () => {
    const sortie = permuterNomsOutils("Alphabot, édité par Société Alpha, répond ainsi.", cycle());
    expect(sortie.texte).toBe("Le Chat, édité par Bêta IA, répond ainsi.");
    expect(sortie.remplacements).toBe(2);
    expect(sortie.mentions_residuelles).toBe(0);
  });

  it("une réponse qui nomme deux outils : les deux remplacés en une passe, jamais relus (A↔B donne B…A)", () => {
    const sortie = permuterNomsOutils("Alphabot fait mieux que Le Chat.", echange());
    expect(sortie.texte).toBe("Le Chat fait mieux que Alphabot.");
    expect(sortie.remplacements).toBe(2);
  });

  it("un libellé en sous-chaîne d'un autre mot n'est pas remplacé (mot entier)", () => {
    const sortie = permuterNomsOutils("Le Chatelet et les Alphabots ne sont pas Alphabot.", echange());
    expect(sortie.texte).toBe("Le Chatelet et les Alphabots ne sont pas Le Chat.");
    expect(sortie.remplacements).toBe(1);
  });

  it("le nom d'un outil hors dérangement qui contient un nom permuté reste intact (la plus longue l'emporte)", () => {
    const sortie = permuterNomsOutils("Le Chat Pro n'est pas Le Chat.", cycle());
    expect(sortie.texte).toBe("Le Chat Pro n'est pas Gammachat.");
    expect(sortie.remplacements).toBe(1);
  });

  it("casse exacte : une mention en capitales est comptée résiduelle, jamais remplacée", () => {
    const sortie = permuterNomsOutils("ALPHABOT et Alphabot.", cycle());
    expect(sortie.texte).toBe("ALPHABOT et Le Chat.");
    expect(sortie.mentions_residuelles).toBe(1);
  });

  it("guillemets typographiques et apostrophe bordent le nom", () => {
    expect(permuterNomsOutils("« Alphabot » et l’Alphabot", cycle()).texte).toBe("« Le Chat » et l’Le Chat");
  });
});

describe("éligibilité : le texte de la réponse nomme au moins un outil permuté", () => {
  const permutes = [ALPHA, BETA, GAMMA];
  const perimetre = [ALPHA, BETA, GAMMA, DELTA];

  it("nomme un outil par son libellé ou par son éditeur : éligible", () => {
    expect(estEligibleOutils(reponse("Selon Alphabot, oui."), permutes, perimetre)).toBe(true);
    expect(estEligibleOutils(reponse("Gamma Labs ne se prononce pas."), permutes, perimetre)).toBe(true);
  });

  it("ne nomme aucun outil, ou seulement en sous-chaîne, ou seulement un outil hors dérangement : non éligible", () => {
    expect(estEligibleOutils(reponse("La candidate propose la TVA à 5,5 %."), permutes, perimetre)).toBe(false);
    expect(estEligibleOutils(reponse("Au Chatelet, les Alphabots."), permutes, perimetre)).toBe(false);
    expect(estEligibleOutils(reponse("Le Chat Pro répond."), permutes, perimetre)).toBe(false);
  });

  it("un refus de l'API n'est jamais éligible : il n'a pas de texte à permuter", () => {
    expect(estEligibleOutils(reponse("Alphabot", true), permutes, perimetre)).toBe(false);
  });

  it("une réponse manquante n'est jamais éligible", () => {
    const manquante = { ...reponse("Alphabot"), statut_reponse: "manquante" } as unknown as ReponseEcrite;
    expect(estEligibleOutils(manquante, permutes, perimetre)).toBe(false);
  });
});

describe("sous-ensemble du contrefactuel d'outil", () => {
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `R${String(i).padStart(4, "0")}`);

  it("200 parmi plus de 200 éligibles, sans doublon, sous sa propre clé", () => {
    expect(TAILLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS).toBe(200);
    const tire = tirerSousEnsembleContrefactuelOutils(ids(450), graine(9));
    expect(tire.reponse_ids).toHaveLength(200);
    expect(new Set(tire.reponse_ids).size).toBe(200);
    expect(tire.sous_effectif).toBe(false);
    expect(tire.eligibles).toBe(450);
    expect(tire.reponse_ids).not.toEqual(tirerSousEnsembleContrefactuel(ids(450), graine(9)).reponse_ids);
    expect(CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS).not.toEqual(CLE_SOUS_ENSEMBLE_CONTREFACTUEL);
  });

  it("clé de graine du contrefactuel d'outil figée : contrefactuel_outil (§7, protocole 0.25, D60)", () => {
    expect(CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS).toEqual(["contrefactuel_outil"]);
    expect(CLE_SOUS_ENSEMBLE_CONTREFACTUEL).toEqual(["contrefactuel", "noms_candidats", "sous_ensemble"]);
    const rng = generateur(graineDerivee(9, ["contrefactuel_outil"]));
    const attendu = melanger(ids(450).sort(), rng).slice(0, 200);
    expect(tirerSousEnsembleContrefactuelOutils(ids(450), graine(9)).reponse_ids).toEqual(attendu);
  });

  it("moins de 200 réponses nommant un outil : toutes, et le sous-effectif est dit (comme pour les candidats)", () => {
    const tire = tirerSousEnsembleContrefactuelOutils(ids(37), graine(9));
    expect([...tire.reponse_ids].sort()).toEqual(ids(37));
    expect(tire.sous_effectif).toBe(true);
    expect(tire.taille_visee).toBe(200);
  });

  it("aucune réponse éligible : sous-ensemble vide, sous-effectif", () => {
    const tire = tirerSousEnsembleContrefactuelOutils([], graine(9));
    expect(tire.reponse_ids).toEqual([]);
    expect(tire.sous_effectif).toBe(true);
  });
});

/** D86 : deux comparateurs du même éditeur, qu'aucun outil permuté ne porte ; leurs libellés contiennent ceux de BETA et d'ALPHA. */
const BOUSSOLE: OutilNomme = { outil_id: "boussole", libelle: "Boussole Le Chat", editeur: "Éditeur Commun" };
const COMPAS: OutilNomme = { outil_id: "compas", libelle: "Compas Alphabot", editeur: "Éditeur Commun" };

describe("D86 : une forme qu'aucun outil permuté ne porte peut être partagée, elle est cherchée sans être remplacée", () => {
  const permutes = [ALPHA, BETA, GAMMA];
  const perimetre = [ALPHA, BETA, GAMMA, BOUSSOLE, COMPAS];

  it("D86 : deux comparateurs non permutés du même éditeur : plus de refus, dérangement identique à celui du périmètre sans ce doublon", () => {
    for (const valeur of [1, 2, 77, 2026]) {
      const avec = tirerDerangementOutils(permutes, perimetre, graine(valeur));
      const sans = tirerDerangementOutils(permutes, [ALPHA, BETA, GAMMA, BOUSSOLE], graine(valeur));
      expect(avec.paires).toEqual(sans.paires);
      expect(correspondancesOutils(avec)).toEqual(correspondancesOutils(sans));
      expect(avec.hors_derangement).toEqual([BOUSSOLE, COMPAS]);
    }
  });

  it("D86 : libellé égal à l'éditeur d'un même outil hors dérangement, ou à l'éditeur d'un autre outil hors dérangement : cherché, pas refusé", () => {
    const perplexe = { outil_id: "perplexe", libelle: "Perplexe", editeur: "Perplexe" };
    const croise = { outil_id: "croise", libelle: "Éditeur Commun", editeur: "Delta Corp" };
    expect(() => tirerDerangementOutils([ALPHA, BETA], [ALPHA, BETA, perplexe, BOUSSOLE, croise], graine(1))).not.toThrow();
  });

  it("D86 : une forme partagée par un outil permuté et un autre outil reste refusée, au tirage comme à l'éligibilité", () => {
    const libelle_partage = { ...BOUSSOLE, libelle: ALPHA.libelle };
    const editeur_en_libelle = { ...BOUSSOLE, libelle: BETA.editeur };
    const trois_porteurs = [
      { ...BOUSSOLE, editeur: ALPHA.editeur },
      { ...COMPAS, editeur: ALPHA.editeur },
    ];
    expect(() => tirerDerangementOutils(permutes, [...permutes, libelle_partage], graine(1))).toThrow(/Alphabot/);
    expect(() => tirerDerangementOutils(permutes, [...permutes, editeur_en_libelle], graine(1))).toThrow(/Bêta IA/);
    expect(() => tirerDerangementOutils(permutes, [...permutes, ...trois_porteurs], graine(1))).toThrow(FormesOutilsAmbigues);
    expect(() => tirerDerangementOutils(permutes, [...permutes, ...trois_porteurs], graine(1))).toThrow(/éditeur de alpha et le éditeur de boussole et le éditeur de compas/);
    expect(() => estEligibleOutils(reponse("Alphabot"), permutes, [...permutes, libelle_partage])).toThrow(FormesOutilsAmbigues);
    expect(() => texteNommeUnOutilPermute("Alphabot", permutes, [...permutes, libelle_partage])).toThrow(FormesOutilsAmbigues);
  });

  it("D86 : les formes des deux comparateurs sont toujours cherchées, au remplacement comme aux mentions résiduelles", () => {
    const derangement = tirerDerangementOutils(permutes, perimetre, graine(1));
    const texte = "Boussole Le Chat et Compas Alphabot, d'Éditeur Commun.";
    expect(permuterNomsOutils(texte, derangement)).toEqual({ texte, remplacements: 0, mentions_residuelles: 0 });
    // En capitales, « LE CHAT » et « ALPHABOT » reviennent aux comparateurs (la plus longue l'emporte) : aucune mention résiduelle.
    expect(permuterNomsOutils("BOUSSOLE LE CHAT et COMPAS ALPHABOT.", derangement).mentions_residuelles).toBe(0);
    expect(permuterNomsOutils("BOUSSOLE LE CHAT et ALPHABOT.", derangement).mentions_residuelles).toBe(1);
    // Sans COMPAS, sa forme n'est plus cherchée : « ALPHABOT » devient une mention résiduelle.
    const sans_compas = tirerDerangementOutils(permutes, [ALPHA, BETA, GAMMA, BOUSSOLE], graine(1));
    expect(permuterNomsOutils("BOUSSOLE LE CHAT et COMPAS ALPHABOT.", sans_compas).mentions_residuelles).toBe(1);
  });

  it("D86 : éligibilité : un texte qui ne nomme que les comparateurs et leur éditeur commun n'est pas éligible ; un outil permuté à côté le rend éligible", () => {
    const comparateurs_seuls = "Boussole Le Chat et Compas Alphabot, d'Éditeur Commun.";
    expect(estEligibleOutils(reponse(comparateurs_seuls), permutes, perimetre)).toBe(false);
    expect(texteNommeUnOutilPermute(comparateurs_seuls, permutes, perimetre)).toBe(false);
    expect(estEligibleOutils(reponse("Compas Alphabot cite Le Chat."), permutes, perimetre)).toBe(true);
    expect(texteNommeUnOutilPermute("Compas Alphabot cite Le Chat.", permutes, perimetre)).toBe(true);
  });

  it("D86 : déterminisme : même graine ⇒ même tirage, quel que soit l'ordre des outils reçus", () => {
    for (const valeur of [3, 41]) {
      const premier = tirerDerangementOutils(permutes, perimetre, graine(valeur));
      expect(tirerDerangementOutils(permutes, perimetre, graine(valeur))).toEqual(premier);
      expect(tirerDerangementOutils([...permutes].reverse(), [...perimetre].reverse(), graine(valeur))).toEqual(premier);
    }
  });
});
