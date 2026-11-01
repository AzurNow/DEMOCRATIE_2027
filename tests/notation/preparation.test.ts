/**
 * Préparation d'une réponse à noter, écrite une seule fois (constat 21 du 2026-10-12, D18) et
 * restreinte aux items des candidats interrogés (§7, protocole 0.21, D56 (1)).
 *
 * « Le juge ne reçoit que les items des candidats interrogés au run : comme pour la liste attendue
 * d'une question d'attribution, l'item d'un candidat non interrogé ne lui est pas transmis. »
 *
 * Les candidats de test : `demo-alpha` et `demo-beta` interrogés (ils ont un alias), `demo-hors`
 * non interrogé (il n'en a pas). La table d'alias est recalculée comme au gel, jamais en dur.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { tableAliasCandidats } from "../../pipeline/notation/alias-candidats.ts";
import { construireCharge, type ResoluAuGel } from "../../pipeline/notation/charge-juge.ts";
import {
  interrogesDuRun,
  ItemPrincipalNonInterroge,
  preparerANoter,
  ReponseImpreparable,
  type GelDeNotation,
} from "../../pipeline/notation/preparation.ts";
import { construireVue } from "../../pipeline/notation/vue-annotateur.ts";
import type { Question } from "../../pipeline/questions/types.ts";
import { preparerPourHumain } from "../../notation-humaine/serveur/chargement.ts";
import { valider } from "../../outils/schemas/valider.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { itemF, itemP } from "../aides/fabriques.ts";
import { GRAINE_ALIAS_CANDIDATS_TEST, GEL_DES_TESTS, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");

const INTERROGE_A = "demo-alpha";
const INTERROGE_B = "demo-beta";
const NON_INTERROGE = "demo-hors";

/** `run.perimetre.candidats` : la même source que l'alias et le dérangement. */
const PERIMETRE = {
  perimetre: {
    candidats: [
      { candidat_id: INTERROGE_A, interroge: true },
      { candidat_id: INTERROGE_B, interroge: true },
      { candidat_id: NON_INTERROGE, interroge: false },
    ],
  },
};
const ALIAS = tableAliasCandidats([{ candidat_id: INTERROGE_A }, { candidat_id: INTERROGE_B }], GRAINE_ALIAS_CANDIDATS_TEST);
const ALIAS_INVERSE = new Map(Object.entries(ALIAS).map(([alias, candidat_id]) => [candidat_id, alias]));

const ITEM_A = itemP({ id: "01JBANCESSA1000000001TEMA1", candidat_id: INTERROGE_A });
const ITEM_B = itemP({ id: "01JBANCESSA1000000001TEMB1", candidat_id: INTERROGE_B });
const ITEM_HORS = itemP({ id: "01JBANCESSA1000000001TEMH1", candidat_id: NON_INTERROGE });
const ITEM_HORS_PRINCIPAL = itemP({ id: "01JBANCESSA1000000001TEMH2", candidat_id: NON_INTERROGE });
const ITEM_F_A = itemF({ id: "01JBANCESSA1000000001TEMF1", candidat_id: INTERROGE_A });

const FORMULATION_ID = "01JBANCESSA1000000001FORM01";

function reference(item: Item, role: Question["items"][number]["role"]): Question["items"][number] {
  return { reference: { item_id: item.id, item_version: item.version, item_empreinte: item.empreinte }, role };
}

function questionDe(id: string, gabarit: Question["gabarit"], items: Question["items"], candidat_id?: string): Question {
  return {
    id,
    gabarit,
    ...(candidat_id === undefined ? {} : { candidat_id }),
    items,
    grappe_id: id,
    formulations: [
      {
        id: FORMULATION_ID,
        registre: "neutre",
        texte: gabarit === "Q-ATT" ? "Quels candidats proposent de ramener la TVA sur l'énergie à 5,5 % ?" : "Quelle est la position de ce candidat sur la TVA ?",
        empreinte_texte: "0".repeat(64),
        production: { gabarits: "gabarits-test" },
        relecture: { annotateur_id: "a1", date: "2026-11-01T10:00:00+01:00", sens_preserve: true },
      },
    ],
    engendree_le: "2026-11-01T10:00:00+01:00",
  };
}

const Q_ATT_MIXTE = questionDe("Q-ATT-MIXTE", "Q-ATT", [reference(ITEM_A, "attendu_dans_liste"), reference(ITEM_HORS, "attendu_dans_liste")]);
const Q_ATT_INTERROGES = questionDe("Q-ATT-INTERROGES", "Q-ATT", [reference(ITEM_A, "attendu_dans_liste"), reference(ITEM_B, "attendu_dans_liste")]);
const Q_ATT_FICTIVE = questionDe("Q-ATT-FICTIVE", "Q-ATT", [reference(ITEM_F_A, "principal"), reference(ITEM_HORS, "attendu_dans_liste")]);
const Q_DIR_HORS = questionDe("Q-DIR-HORS", "Q-DIR", [reference(ITEM_HORS_PRINCIPAL, "principal")], NON_INTERROGE);
const Q_DIR_DISTRACTEUR = questionDe("Q-DIR-DISTRACTEUR", "Q-DIR", [reference(ITEM_A, "principal"), reference(ITEM_HORS, "distracteur")], INTERROGE_A);

const RESOLU_ATT: ResoluAuGel = {
  reponse_attendue: { nature: "liste_candidats", candidats_attendus: [INTERROGE_A], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } },
  premisse_fausse: false,
};
const RESOLU_ATT_DEUX: ResoluAuGel = {
  reponse_attendue: { ...RESOLU_ATT.reponse_attendue, candidats_attendus: [INTERROGE_A, INTERROGE_B] },
  premisse_fausse: false,
};
const RESOLU_AUCUN: ResoluAuGel = {
  reponse_attendue: { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } },
  premisse_fausse: false,
};

const QUESTIONS = [Q_ATT_MIXTE, Q_ATT_INTERROGES, Q_ATT_FICTIVE, Q_DIR_HORS, Q_DIR_DISTRACTEUR];

function gel(): GelDeNotation {
  return {
    questions: new Map(QUESTIONS.map((q) => [q.id, q])),
    items: new Map([ITEM_A, ITEM_B, ITEM_HORS, ITEM_HORS_PRINCIPAL, ITEM_F_A].map((item) => [item.id, item])),
    resolus: new Map<string, ResoluAuGel>([
      [Q_ATT_MIXTE.id, RESOLU_ATT],
      [Q_ATT_INTERROGES.id, RESOLU_ATT_DEUX],
      [Q_ATT_FICTIVE.id, RESOLU_AUCUN],
      [Q_DIR_HORS.id, RESOLU_POSITION_POUR],
      [Q_DIR_DISTRACTEUR.id, RESOLU_POSITION_POUR],
    ]),
    interroges: interrogesDuRun(PERIMETRE),
  };
}

function reponse(question: Question): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return { ...lue, question_id: question.id, formulation_id: FORMULATION_ID, normalise: { ...lue.normalise, liens: [] } };
}

/** La charge exacte remise au juge pour une réponse préparée. */
function chargeDe(question: Question) {
  const prep = preparerANoter(reponse(question), gel());
  return construireCharge({
    ...prep,
    date_run: GEL_DES_TESTS,
    prompt: { chemin: "prompts/judge-primaire.md", version: "1.0.0" },
    pages_citees: pagesSansTexte(prep.reponse.normalise.liens),
    alias_candidats: ALIAS,
  });
}

function vueDe(question: Question) {
  const prep = preparerPourHumain(reponse(question), gel());
  return construireVue({
    reponse: prep.reponse,
    question: prep.question,
    references: prep.references,
    resolu_au_gel: prep.resolu_au_gel,
    date_run: GEL_DES_TESTS,
    pages_citees: pagesSansTexte(prep.reponse.normalise.liens),
    existences: [],
    alias_candidats: ALIAS,
  });
}

describe("D56 (1), §7 0.21 : le juge ne reçoit que les items des candidats interrogés", () => {
  it("Q-ATT sur une mesure portée par un interrogé et un non-interrogé ⇒ la notation passe, la charge ne porte que l'item de l'interrogé", () => {
    const charge = chargeDe(Q_ATT_MIXTE);
    expect(charge.references).toHaveLength(1);
    expect(charge.references[0]).toMatchObject({ item_id: ITEM_A.id, role: "attendu_dans_liste", candidat_id: ALIAS_INVERSE.get(INTERROGE_A) });
    expect(JSON.stringify(charge)).not.toContain(ITEM_HORS.id);
    expect(JSON.stringify(charge)).not.toContain(NON_INTERROGE);
  });

  it("même cas en notation humaine ⇒ l'humain voit exactement les références que reçoit le juge", () => {
    const vue = vueDe(Q_ATT_MIXTE);
    expect(vue.references).toEqual(chargeDe(Q_ATT_MIXTE).references);
    expect(JSON.stringify(vue)).not.toContain(ITEM_HORS.id);
  });

  it("Q-ATT dont tous les items sont d'interrogés ⇒ rien n'est écarté, ordre et rôles conservés", () => {
    const prep = preparerANoter(reponse(Q_ATT_INTERROGES), gel());
    expect(prep.references).toEqual([
      { item: ITEM_A, role: "attendu_dans_liste" },
      { item: ITEM_B, role: "attendu_dans_liste" },
    ]);
    expect(chargeDe(Q_ATT_INTERROGES).references.map((r) => r.item_id)).toEqual([ITEM_A.id, ITEM_B.id]);
  });

  it("règle générale, pas de cas Q-ATT : le distracteur d'un non-interrogé sur une Q-DIR est écarté aussi", () => {
    const prep = preparerANoter(reponse(Q_DIR_DISTRACTEUR), gel());
    expect(prep.references).toEqual([{ item: ITEM_A, role: "principal" }]);
  });

  it("Q-ATT fictive : le principal d'un interrogé reste, l'item listé d'un non-interrogé est écarté", () => {
    const prep = preparerANoter(reponse(Q_ATT_FICTIVE), gel());
    expect(prep.references).toEqual([{ item: ITEM_F_A, role: "principal" }]);
  });

  it("question qui nomme un candidat dont l'item principal est d'un non-interrogé ⇒ refus nommé, jamais écarté en silence", () => {
    expect(() => preparerANoter(reponse(Q_DIR_HORS), gel())).toThrow(ItemPrincipalNonInterroge);
    expect(() => preparerPourHumain(reponse(Q_DIR_HORS), gel())).toThrow(ItemPrincipalNonInterroge);
  });

  it("interrogesDuRun ne lit que `interroge` du périmètre", () => {
    expect([...interrogesDuRun(PERIMETRE)].sort()).toEqual([INTERROGE_A, INTERROGE_B]);
  });
});

describe("constat 21, D18 : une seule préparation pour le juge et pour l'humain", () => {
  it("sur un même jeu, l'humain reçoit la même question, les mêmes références et le même résolu au gel que le juge", () => {
    for (const question of QUESTIONS.filter((q) => q !== Q_DIR_HORS)) {
      const r = reponse(question);
      const juge = preparerANoter(r, gel());
      const humain = preparerPourHumain(r, gel());
      expect(humain.question).toEqual(juge.question);
      expect(humain.references).toEqual(juge.references);
      expect(humain.resolu_au_gel).toEqual(juge.resolu_au_gel);
      expect(humain.items).toEqual(juge.references.map((ref) => ref.item));
      const { version_vue: _v, version_grille: _g, reponse: _r, ...vue } = vueDe(question);
      const { version_charge: _c, prompt: _p, reponse: _s, ...charge } = chargeDe(question);
      expect(vue).toEqual(charge);
    }
  });

  it("la question posée est celle de la formulation interrogée", () => {
    const prep = preparerANoter(reponse(Q_ATT_MIXTE), gel());
    expect(prep.question).toEqual({ gabarit: "Q-ATT", registre: "neutre", texte: Q_ATT_MIXTE.formulations[0]?.texte });
  });
});

describe("refus nommés de la préparation", () => {
  it("question absente de questions.json ⇒ ReponseImpreparable", () => {
    const r = { ...reponse(Q_ATT_MIXTE), question_id: "Q-INCONNUE" };
    expect(() => preparerANoter(r, gel())).toThrow(ReponseImpreparable);
  });

  it("formulation absente de la question ⇒ ReponseImpreparable", () => {
    const r = { ...reponse(Q_ATT_MIXTE), formulation_id: "01JBANCESSA1000000001FORM99" };
    expect(() => preparerANoter(r, gel())).toThrow(ReponseImpreparable);
  });

  it("question absente du tirage ⇒ ReponseImpreparable", () => {
    const sansTirage = { ...gel(), resolus: new Map<string, ResoluAuGel>() };
    expect(() => preparerANoter(reponse(Q_ATT_MIXTE), sansTirage)).toThrow(ReponseImpreparable);
  });

  it("item épinglé absent des items lus ⇒ ReponseImpreparable, même s'il est d'un non-interrogé", () => {
    const items = new Map(gel().items);
    items.delete(ITEM_HORS.id);
    expect(() => preparerANoter(reponse(Q_ATT_MIXTE), { ...gel(), items })).toThrow(ReponseImpreparable);
  });
});
