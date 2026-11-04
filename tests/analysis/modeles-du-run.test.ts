/**
 * Le modèle de chaque outil à chaque run, publié avec la tendance (§8, 0.31, D73 (17)) : « C'est
 * le modèle demandé, inscrit au gel, avec les identifiants de modèle renvoyés par l'API et leurs
 * effectifs ; les réponses sans identifiant renvoyé sont comptées à part. »
 *
 * Les identifiants renvoyés sont publiés tels que l'API les a renvoyés (règle 7) : ni casse
 * ramenée, ni suffixe de date retiré, ni rapprochement avec le modèle demandé.
 */

import { describe, expect, it } from "vitest";
import { ModeleDemandeAbsent, ModeleRenvoyeNonEnregistre, modelesDuRun, OutilHorsPerimetre } from "../../analysis/modeles-du-run.ts";
import type { OutilAuGel, Reponse } from "../../analysis/types.ts";
import { outil, reponse, ulid } from "./fabriques.ts";

const DEMANDE = "famille-x/modele-1";

function assistant(outil_id: string, modele_demande: string = DEMANDE): OutilAuGel {
  return outil({ outil_id, modele_demande });
}

let compteur = 0;

/** Une réponse API obtenue dont l'API a renvoyé `modele_renvoye` (null : rien renvoyé). */
function obtenue(outil_id: string, modele_renvoye: string | null, partiel: Partial<Reponse> = {}): Reponse {
  compteur += 1;
  return reponse({ id: ulid(`r-${compteur}`), outil_id, metadonnees: { modele_renvoye }, ...partiel });
}

function plusieurs(n: number, fabrique: () => Reponse): Reponse[] {
  return Array.from({ length: n }, fabrique);
}

describe("modelesDuRun (§8, D73 (17))", () => {
  it("toutes les réponses renvoient l'identifiant demandé : un seul identifiant, avec l'effectif total", () => {
    const reponses = plusieurs(5, () => obtenue("outil-alpha", DEMANDE));
    expect(modelesDuRun([assistant("outil-alpha")], reponses)).toEqual([
      { outil_id: "outil-alpha", modele_demande: DEMANDE, identifiants_renvoyes: [{ identifiant: DEMANDE, reponses: 5 }], reponses_sans_identifiant: 0 },
    ]);
  });

  it("deux identifiants renvoyés dans le même run : deux lignes, chacune avec son effectif", () => {
    const reponses = [...plusieurs(3, () => obtenue("outil-alpha", "famille-x/modele-1-2026-10-01")), ...plusieurs(2, () => obtenue("outil-alpha", "famille-x/modele-1-2026-11-01"))];
    expect(modelesDuRun([assistant("outil-alpha")], reponses)[0]?.identifiants_renvoyes).toEqual([
      { identifiant: "famille-x/modele-1-2026-10-01", reponses: 3 },
      { identifiant: "famille-x/modele-1-2026-11-01", reponses: 2 },
    ]);
  });

  it("les réponses sans identifiant renvoyé sont comptées à part, jamais fondues dans le modèle demandé", () => {
    const reponses = [...plusieurs(2, () => obtenue("outil-alpha", DEMANDE)), ...plusieurs(3, () => obtenue("outil-alpha", null))];
    expect(modelesDuRun([assistant("outil-alpha")], reponses)).toEqual([
      { outil_id: "outil-alpha", modele_demande: DEMANDE, identifiants_renvoyes: [{ identifiant: DEMANDE, reponses: 2 }], reponses_sans_identifiant: 3 },
    ]);
  });

  it("un outil dont aucune réponse ne porte d'identifiant : aucune ligne d'identifiant, toutes comptées à part", () => {
    const reponses = plusieurs(4, () => obtenue("outil-alpha", null));
    expect(modelesDuRun([assistant("outil-alpha")], reponses)[0]).toMatchObject({ identifiants_renvoyes: [], reponses_sans_identifiant: 4 });
  });

  it("une réponse manquante ne compte nulle part : ni dans un identifiant, ni parmi les sans identifiant", () => {
    const manquante = reponse({ id: ulid("manquante"), outil_id: "outil-alpha", statut_reponse: "manquante", normalise: undefined });
    const reponses = [obtenue("outil-alpha", DEMANDE), manquante];
    expect(modelesDuRun([assistant("outil-alpha")], reponses)).toEqual([
      { outil_id: "outil-alpha", modele_demande: DEMANDE, identifiants_renvoyes: [{ identifiant: DEMANDE, reponses: 1 }], reponses_sans_identifiant: 0 },
    ]);
  });

  it("un outil sans aucune réponse obtenue garde sa ligne, avec des effectifs nuls", () => {
    const manquante = reponse({ id: ulid("seule-manquante"), outil_id: "outil-alpha", statut_reponse: "manquante", normalise: undefined });
    expect(modelesDuRun([assistant("outil-alpha")], [manquante])).toEqual([
      { outil_id: "outil-alpha", modele_demande: DEMANDE, identifiants_renvoyes: [], reponses_sans_identifiant: 0 },
    ]);
  });

  it("un identifiant renvoyé qui diffère du demandé est publié tel quel : ni casse, ni suffixe de date normalisés (règle 7)", () => {
    const reponses = [obtenue("outil-alpha", "Famille-X/Modele-1"), obtenue("outil-alpha", "famille-x/modele-1-20261015"), obtenue("outil-alpha", "famille-x/modele-1 ")];
    const ligne = modelesDuRun([assistant("outil-alpha")], reponses)[0];
    expect(ligne?.modele_demande).toBe(DEMANDE);
    expect(ligne?.identifiants_renvoyes.map((i) => i.identifiant).sort()).toEqual(["Famille-X/Modele-1", "famille-x/modele-1 ", "famille-x/modele-1-20261015"].sort());
    expect(ligne?.identifiants_renvoyes.every((i) => i.reponses === 1)).toBe(true);
  });

  it("ordre déterministe : outils dans l'ordre du périmètre, identifiants par ordre des unités de code, quel que soit l'ordre des réponses", () => {
    const outils = [assistant("outil-gamma", "g/1"), assistant("outil-alpha")];
    const reponses = [obtenue("outil-alpha", "b"), obtenue("outil-gamma", "z"), obtenue("outil-alpha", "B"), obtenue("outil-alpha", "a"), obtenue("outil-gamma", "y")];
    const attendu = modelesDuRun(outils, reponses);
    expect(attendu.map((l) => l.outil_id)).toEqual(["outil-gamma", "outil-alpha"]);
    expect(attendu[1]?.identifiants_renvoyes.map((i) => i.identifiant)).toEqual(["B", "a", "b"]);
    expect(attendu[0]?.identifiants_renvoyes.map((i) => i.identifiant)).toEqual(["y", "z"]);
    expect(modelesDuRun(outils, [...reponses].reverse())).toEqual(attendu);
  });

  it("seules les réponses API obtenues du contexte run comptent : canal application et pilote sont hors du compte", () => {
    const application = reponse({ id: ulid("app"), outil_id: "outil-alpha", canal: "application", mode: undefined });
    const pilote = obtenue("outil-alpha", "famille-x/pilote", { contexte: "pilote" });
    const reponses = [obtenue("outil-alpha", DEMANDE), application, pilote];
    expect(modelesDuRun([assistant("outil-alpha")], reponses)[0]).toMatchObject({ identifiants_renvoyes: [{ identifiant: DEMANDE, reponses: 1 }], reponses_sans_identifiant: 0 });
  });

  it("les deux modes d'un outil sont comptés ensemble : le modèle est celui de l'outil au run", () => {
    const reponses = [obtenue("outil-alpha", DEMANDE, { mode: "web_activee" }), obtenue("outil-alpha", DEMANDE, { mode: "web_desactivee" })];
    expect(modelesDuRun([assistant("outil-alpha")], reponses)[0]?.identifiants_renvoyes).toEqual([{ identifiant: DEMANDE, reponses: 2 }]);
  });

  it("comparateurs et assistants exclus n'ont pas de ligne", () => {
    const outils = [assistant("outil-alpha"), outil({ outil_id: "comparateur-un", famille: "comparateur", mode_de_tete: undefined }), outil({ outil_id: "outil-exclu", inclus: false })];
    expect(modelesDuRun(outils, []).map((l) => l.outil_id)).toEqual(["outil-alpha"]);
  });

  it("un assistant inclus sans modèle demandé au gel : refus, jamais un modèle deviné", () => {
    expect(() => modelesDuRun([outil({ outil_id: "outil-alpha" })], [])).toThrow(ModeleDemandeAbsent);
  });

  it("une réponse API obtenue sans la clé modele_renvoye : refus, une clé absente n'est pas un null", () => {
    const sansCle = reponse({ id: ulid("sans-cle"), outil_id: "outil-alpha", metadonnees: {} });
    const sansMetadonnees = reponse({ id: ulid("sans-meta"), outil_id: "outil-alpha" });
    expect(() => modelesDuRun([assistant("outil-alpha")], [sansCle])).toThrow(ModeleRenvoyeNonEnregistre);
    expect(() => modelesDuRun([assistant("outil-alpha")], [sansMetadonnees])).toThrow(ModeleRenvoyeNonEnregistre);
  });

  it("une réponse API obtenue d'un outil qui n'est pas un assistant inclus au gel : refus, jamais ignorée", () => {
    expect(() => modelesDuRun([assistant("outil-alpha")], [obtenue("outil-inconnu", DEMANDE)])).toThrow(OutilHorsPerimetre);
  });
});
