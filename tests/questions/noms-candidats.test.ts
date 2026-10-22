/**
 * Constat 3 de la conformité du 2026-09-24 (protocole 0.6, §5) : le nom d'un candidat a un
 * domicile, `run.perimetre.candidats[].libelle` et `.nom`, saisis par l'auteur.
 *
 * - Le `libelle` remplit `[candidat]` dans les cinq gabarits nominatifs, jamais
 *   `item.libelle_lisible`, qui est l'étiquette de l'item.
 * - La barrière « aucun nom de candidat — prénom et nom, ou nom seul — dans les questions
 *   d'attribution » cherche le libellé complet ET le nom seul, casse et accents ignorés, par mots
 *   entiers.
 *
 * Aucun nom réel : « Marie Dupont », « Dupré » sont des noms génériques de test.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { LibelleCandidatAbsent } from "../../pipeline/questions/gabarits.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { entreesPour } from "../../pipeline/questions/entrees-tirage.ts";
import type { CandidatAuGel, Item, Question, StatutSymetrie } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemP, mesure, nomme, question, quotas, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const MESURE = mesure({ cle: "noms", libelle: "tarif réduit des cantines" });
const ETIQUETTE = "TVA énergie à 5,5 %";
const ITEM: Item = itemP({ cle: "noms-p", candidat_id: "demo-alpha", mesure: MESURE, libelle_lisible: ETIQUETTE });

describe("cas 7 : [candidat] reçoit le libellé du périmètre du run", () => {
  const questions = engendrer([ITEM], [MESURE], [nomme("demo-alpha", "Marie Dupont", "Dupont")]);

  it("les cinq gabarits nominatifs portent le libellé du run, jamais libelle_lisible", () => {
    const nominatives = questions.filter((q) => q.candidat_id !== undefined);
    expect(nominatives.length).toBeGreaterThan(0);
    for (const q of nominatives) {
      expect(q.texte_neutre).toContain("Marie Dupont");
      expect(q.texte_neutre).not.toContain(ETIQUETTE);
      expect(q.texte_neutre).not.toContain("[candidat]");
    }
  });

  it("la Q-ATT ne porte ni le libellé du run ni libelle_lisible", () => {
    const attribution = questions.find((q) => q.candidat_id === undefined);
    expect(attribution?.texte_neutre).not.toContain("Dupont");
    expect(attribution?.texte_neutre).not.toContain(ETIQUETTE);
  });

  it("un candidat absent du périmètre : refus pour un gabarit nominatif, jamais le libelle_lisible en repli", () => {
    expect(() => engendrer([ITEM], [MESURE], [nomme("demo-beta", "Paul Martin", "Martin")])).toThrow(
      LibelleCandidatAbsent,
    );
  });
});

/* ------------------------------------------------------------- barrière */

const DUPONT: CandidatAuGel = candidat({ candidat_id: "demo-alpha", libelle: "Marie Dupont", nom: "Dupont" });
const DUPRE: CandidatAuGel = candidat({ candidat_id: "demo-beta", libelle: "Hélène Dupré", nom: "Dupré" });
const RUN = run([DUPONT, DUPRE], GEL);

/** La Q-ATT engendrée sur l'item, dont seul le texte est remplacé par celui du cas. */
function attribution(texte: string): Question {
  const engendree = engendrer([ITEM], [MESURE], RUN.perimetre.candidats).find((q) => q.candidat_id === undefined);
  if (engendree === undefined) throw new Error("Aucune Q-ATT engendrée.");
  const socle = completer(engendree);
  return question({
    id: socle.id,
    gabarit: socle.gabarit,
    items: socle.items,
    grappe_id: socle.grappe_id,
    texte_neutre: texte,
  });
}

/**
 * Modifié ouvertement (protocole 0.13, §5) : la barrière reçoit le jeu complet des questions
 * engendrées au gel, et non plus la seule Q-ATT tirée, qu'elle refuserait comme jeu incomplet. Les
 * questions nominatives de l'item complètent le jeu ; seule la Q-ATT est tirée, comme avant.
 */
function jeuComplet(q: Question): readonly Question[] {
  const nominatives = engendrer([ITEM], [MESURE], RUN.perimetre.candidats)
    .filter((engendree) => engendree.candidat_id !== undefined)
    .map(completer);
  return [...nominatives, q];
}

function barriere(texte: string): StatutSymetrie | undefined {
  const q = attribution(texte);
  const tirage = { run_id: RUN.id, date_gel: GEL, graine_tirage: graine(), parametres: quotas() /* conformité n° 59 */, entrees: entreesPour([q], [ITEM], [MESURE], RUN), exclusions: [], contestes_au_gel: [], bilan_reprise: [], compensations: [] };
  const symetrie = verifierSymetrie(tirage, jeuComplet(q), [ITEM], [MESURE], RUN);
  return symetrie.conditions.find((c) => c.code === "aucun_nom_candidat_dans_q_att")?.statut;
}

describe("cas 8 : barrière « aucun nom de candidat dans les Q-ATT »", () => {
  it("rouge : le libellé complet", () => {
    expect(barriere("Marie Dupont propose-t-elle le tarif réduit des cantines ?")).toBe("rouge");
  });

  it("rouge : le nom seul", () => {
    expect(barriere("Est-ce que Dupont propose le tarif réduit des cantines ?")).toBe("rouge");
  });

  it("rouge : le nom seul en capitales", () => {
    expect(barriere("DUPONT propose-t-il le tarif réduit des cantines ?")).toBe("rouge");
  });

  it("rouge : le nom sans son accent (formulation familière « sans accent parfois », §5)", () => {
    expect(barriere("dis, dupre il propose le tarif reduit des cantines ?")).toBe("rouge");
  });

  it("rouge : le libellé complet avec casse et accents différents", () => {
    expect(barriere("HELENE DUPRE propose-t-elle le tarif réduit des cantines ?")).toBe("rouge");
  });

  it("rouge : le nom collé à une ponctuation", () => {
    expect(barriere("Qui, à part Dupont, propose le tarif réduit des cantines ?")).toBe("rouge");
  });

  it("vert : un mot qui contient le nom (« Dupontel »)", () => {
    expect(barriere("Quels candidats, selon Dupontel, proposent le tarif réduit des cantines ?")).toBe("vert");
  });

  it("vert : la Q-ATT qui cite seulement sa mesure", () => {
    expect(barriere("Quels candidats à la présidentielle 2027 proposent tarif réduit des cantines ?")).toBe("vert");
  });

  it("vert : le prénom seul n'est pas un nom au sens du §5", () => {
    expect(barriere("Quels candidats, dont Marie, proposent le tarif réduit des cantines ?")).toBe("vert");
  });

  it("n'utilise plus libelle_lisible : l'étiquette de l'item dans une Q-ATT ne fait pas rougir", () => {
    expect(barriere(`Quels candidats proposent ${ETIQUETTE} ?`)).toBe("vert");
  });
});

describe("cas 9 : un nom inexploitable dans le périmètre est refusé, jamais sauté", () => {
  it.each([
    ["libelle", { libelle: " , " }],
    ["nom", { nom: "-" }],
  ] as const)("%s sans aucun mot : la vérification de symétrie lève", (_champ, surcharge) => {
    const vide = run([{ ...DUPONT, ...surcharge }, DUPRE], GEL);
    const q = attribution("Quels candidats proposent tarif réduit des cantines ?");
    const tirage = { run_id: vide.id, date_gel: GEL, graine_tirage: graine(), parametres: quotas() /* conformité n° 59 */, entrees: entreesPour([q], [ITEM], [MESURE], vide), exclusions: [], contestes_au_gel: [], bilan_reprise: [], compensations: [] };
    expect(() => verifierSymetrie(tirage, [q], [ITEM], [MESURE], vide)).toThrow(/sans aucun mot/);
  });
});
