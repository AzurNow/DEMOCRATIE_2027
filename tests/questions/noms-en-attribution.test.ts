/**
 * Dette du 2026-10-15, point 1 : la liste des noms cherchés dans une Q-ATT a un seul domicile,
 * `nomsCherchesEnAttribution` (`libelles.ts`), lue par le contrôle de la reformulation
 * (`controle.ts`) et par la barrière de symétrie (`symetrie.ts`).
 *
 * Le test d'équivalence interroge les deux par leur comportement, sur chaque chaîne que rend la
 * fonction commune et sur des chaînes qui n'en sont pas : une formulation acceptée par le contrôle
 * ne peut plus faire rougir la barrière au gel, ni l'inverse. Si la fonction commune apprend un nom
 * de plus, la liste des sondes l'inclut d'elle-même.
 *
 * Aucun nom réel : « Marie Dupont », « Hélène Dupré » sont des noms génériques de test.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { gabaritParCode, remplirTexteNeutre } from "../../pipeline/questions/gabarits.ts";
import { nomsCherchesEnAttribution } from "../../pipeline/questions/libelles.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { entreesPour } from "../../pipeline/questions/entrees-tirage.ts";
import type { CandidatAuGel, Item, Question, StatutSymetrie } from "../../pipeline/questions/types.ts";
import { controlerSortie, SortieRejetee } from "../../pipeline/reformulation/controle.ts";
import { demandeDe } from "../../pipeline/reformulation/demande.ts";
import { candidat, completer, graine, itemP, mesure, nomme, question, quotas, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const MESURE = mesure({ cle: "noms-communs", libelle: "tarif réduit des cantines" });
const ITEM: Item = itemP({ cle: "noms-communs-p", candidat_id: "demo-alpha", mesure: MESURE });

const DUPONT: CandidatAuGel = candidat({ candidat_id: "demo-alpha", libelle: "Marie Dupont", nom: "Dupont" });
const DUPRE: CandidatAuGel = candidat({ candidat_id: "demo-beta", libelle: "Hélène Dupré", nom: "Dupré" });
const RUN = run([DUPONT, DUPRE], GEL);

/* ------------------------------------------------------- fonction commune */

describe("nomsCherchesEnAttribution : identifiant, libellé et nom de chaque candidat", () => {
  it("rend les trois chaînes de chaque candidat, dans l'ordre du périmètre", () => {
    expect(nomsCherchesEnAttribution([DUPONT, DUPRE])).toEqual([
      "demo-alpha",
      "Marie Dupont",
      "Dupont",
      "demo-beta",
      "Hélène Dupré",
      "Dupré",
    ]);
  });

  it("lit aussi bien un candidat nommé qu'un candidat au gel : mêmes chaînes pour les mêmes noms", () => {
    const nommes = [nomme("demo-alpha", "Marie Dupont", "Dupont"), nomme("demo-beta", "Hélène Dupré", "Dupré")];
    expect(nomsCherchesEnAttribution(nommes)).toEqual(nomsCherchesEnAttribution([DUPONT, DUPRE]));
  });

  it("dédoublonne une chaîne répétée (libellé égal au nom), en gardant la première place", () => {
    const seul = nomme("demo-gamma", "Gamma", "Gamma");
    expect(nomsCherchesEnAttribution([seul])).toEqual(["demo-gamma", "Gamma"]);
  });

  it.each([
    ["libelle", nomme("demo-gamma", " , ", "Gamma")],
    ["nom", nomme("demo-gamma", "Gamma Delta", "-")],
  ] as const)("%s sans aucun mot ⇒ refus qui nomme la chaîne et les deux contrôles concernés", (_champ, fautif) => {
    expect(() => nomsCherchesEnAttribution([DUPONT, fautif])).toThrow(/sans aucun mot/u);
    expect(() => nomsCherchesEnAttribution([DUPONT, fautif])).toThrow(/barrière.*contrôle de la reformulation/su);
  });

  it("périmètre vide ⇒ liste vide : refuser le vide appartient à l'appelant (le contrôle le refuse)", () => {
    expect(nomsCherchesEnAttribution([])).toEqual([]);
  });
});

/* ---------------------------------------------- contrôle et barrière égaux */

/** La Q-ATT engendrée sur l'item, dont seul le texte est remplacé par celui du cas. */
function attribution(texte: string): Question {
  const engendree = engendrer([ITEM], [MESURE], RUN.perimetre.candidats).find((q) => q.candidat_id === undefined);
  if (engendree === undefined) throw new Error("Aucune Q-ATT engendrée.");
  const socle = completer(engendree);
  return question({ id: socle.id, gabarit: socle.gabarit, items: socle.items, grappe_id: socle.grappe_id, texte_neutre: texte });
}

function jeuComplet(q: Question): readonly Question[] {
  const nominatives = engendrer([ITEM], [MESURE], RUN.perimetre.candidats)
    .filter((engendree) => engendree.candidat_id !== undefined)
    .map(completer);
  return [...nominatives, q];
}

function barriere(texte: string): StatutSymetrie {
  const q = attribution(texte);
  const tirage = {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    parametres: quotas(),
    entrees: entreesPour([q], [ITEM], [MESURE], RUN),
    exclusions: [],
    contestes_au_gel: [],
    bilan_reprise: [],
    compensations: [],
  };
  const condition = verifierSymetrie(tirage, jeuComplet(q), [ITEM], [MESURE], RUN).conditions.find(
    (c) => c.code === "aucun_nom_candidat_dans_q_att",
  );
  if (condition === undefined) throw new Error("Condition aucun_nom_candidat_dans_q_att absente.");
  return condition.statut;
}

const SUBSTITUTIONS = { formulation_mesure: MESURE.formulation_canonique };
const DEMANDE_ATT = demandeDe({
  gabarit: "Q-ATT",
  item_principal: undefined,
  texte_neutre: remplirTexteNeutre(gabaritParCode("Q-ATT"), SUBSTITUTIONS),
  substitutions: SUBSTITUTIONS,
});
const NEUTRE_ATT = `Quels candidats proposent ${MESURE.formulation_canonique} ?`;

/** Vrai si le contrôle rejette la formulation pour un nom de candidat ; toute autre issue lève. */
function controleRejette(texte: string): boolean {
  const brut = JSON.stringify({ familier: { texte }, oriente: { texte: NEUTRE_ATT } });
  try {
    controlerSortie(brut, DEMANDE_ATT, RUN.perimetre.candidats);
    return false;
  } catch (erreur) {
    if (erreur instanceof SortieRejetee && erreur.motif === "nom_de_candidat_dans_attribution") return true;
    throw erreur;
  }
}

function phrase(sonde: string): string {
  return `Quels candidats, dont ${sonde}, proposent ${MESURE.formulation_canonique} ?`;
}

/** Chaque chaîne cherchée, puis des chaînes qui n'en sont pas (prénom seul, nom prolongé). */
const SONDES_NOMS = nomsCherchesEnAttribution(RUN.perimetre.candidats);
const SONDES_AUTRES = ["Marie", "Hélène", "Dupontel", "alpha", "le maire"];

describe("contrôle de la reformulation et barrière de symétrie cherchent les mêmes chaînes", () => {
  it("témoin : la formulation sans nom passe les deux", () => {
    expect(controleRejette(NEUTRE_ATT)).toBe(false);
    expect(barriere(NEUTRE_ATT)).toBe("vert");
  });

  it.each(SONDES_NOMS)("« %s », chaîne cherchée : rejetée par le contrôle ET rouge à la barrière", (sonde) => {
    expect(controleRejette(phrase(sonde))).toBe(true);
    expect(barriere(phrase(sonde))).toBe("rouge");
  });

  it.each(SONDES_AUTRES)("« %s », chaîne non cherchée : acceptée par le contrôle ET verte à la barrière", (sonde) => {
    expect(controleRejette(phrase(sonde))).toBe(false);
    expect(barriere(phrase(sonde))).toBe("vert");
  });

  it("un libellé sans mot est refusé par les deux, avec le même message", () => {
    const fautif = candidat({ candidat_id: "demo-gamma", libelle: "—", nom: "Gamma" });
    const avecFautif = run([DUPONT, fautif], GEL);
    const brut = JSON.stringify({ familier: { texte: NEUTRE_ATT }, oriente: { texte: NEUTRE_ATT } });
    const messageControle = messageDe(() => controlerSortie(brut, DEMANDE_ATT, avecFautif.perimetre.candidats));
    const messageCommun = messageDe(() => nomsCherchesEnAttribution(avecFautif.perimetre.candidats));
    expect(messageControle).toBe(messageCommun);
    expect(messageCommun).toMatch(/« — »/u);
  });
});

function messageDe(appel: () => unknown): string {
  try {
    appel();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur.message;
    throw erreur;
  }
  throw new Error("Aucune erreur levée alors qu'un refus était attendu.");
}
