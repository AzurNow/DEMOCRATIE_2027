/**
 * Constat n° 39 de la conformité du 2026-09-24, protocole 0.9 (§5) : « Une mesure engendre une
 * seule question d'attribution, quel que soit le nombre de candidats qui la portent ; son identité
 * et sa grappe sont celles de la mesure, et les questions d'attribution sont tirées par thème selon
 * un quota déclaré séparément dans `config/perimetre.yaml`. » §8 : « la grappe étant l'item […], et
 * la mesure pour une question d'attribution, qui ne porte sur aucun item en particulier ».
 *
 * Décision de l'auteur du 2026-09-25 : pas d'item principal désigné arbitrairement. Une Q-ATT sur
 * une mesure réelle porte tous ses items P et O en `attendu_dans_liste`, sans principal ; sur une
 * mesure fictive, l'item F reste principal.
 */

import { describe, expect, it } from "vitest";
import {
  AttributionFictiveAmbigue,
  engendrer,
  identifiantAttribution,
  identifiantQuestion,
} from "../../pipeline/questions/engendrement.ts";
import { grappeSuitItemPrincipal } from "../../pipeline/questions/invariants.ts";
import { reponseAttendue } from "../../pipeline/questions/reponse-attendue.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { ParametresTirage } from "../../pipeline/questions/tirage.ts";
import type { Item, QuestionEngendree } from "../../pipeline/questions/types.ts";
import { empreinteContenuNotant } from "../../validation/domaine/empreinte.ts";
import { candidat, completer, completerSur, graine, itemF, itemO, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta", "demo-gamma"];
const PERIMETRE = perimetre(CANDIDATS);
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

const REELLE = mesure({ cle: "apm-reelle", theme: "sante", libelle: "tarif social de l'eau" });
const FICTIVE = mesure({ cle: "apm-fictive", theme: "retraites", libelle: "prime aux marcheurs", fictive: true });

const ALPHA = itemP({ cle: "apm-a", candidat_id: "demo-alpha", mesure: REELLE, position: "pour" });
const BETA = itemP({ cle: "apm-b", candidat_id: "demo-beta", mesure: REELLE, position: "contre" });
const GAMMA = itemO({
  cle: "apm-c",
  candidat_id: "demo-gamma",
  mesure: REELLE,
  position: "contre",
  position_posterieure: "pour",
  date_changement: "2026-10-01",
});
const FICTIF = itemF({ cle: "apm-f", candidat_id: "demo-alpha", mesure: FICTIVE });

function attributions(items: readonly Item[]): readonly QuestionEngendree[] {
  return engendrer(items, [REELLE, FICTIVE], PERIMETRE).filter((question) => question.candidat_id === undefined);
}

function seule(items: readonly Item[]): QuestionEngendree {
  const liste = attributions(items);
  expect(liste).toHaveLength(1);
  return liste[0] as QuestionEngendree;
}

describe("n° 39 : une seule Q-ATT par mesure", () => {
  it("mesure portée par trois candidats : une Q-ATT, trois attendu_dans_liste, aucun principal", () => {
    const question = seule([ALPHA, BETA, GAMMA]);
    expect(question.candidat_id).toBeUndefined();
    expect(question.items.map((entree) => entree.role)).toEqual([
      "attendu_dans_liste",
      "attendu_dans_liste",
      "attendu_dans_liste",
    ]);
    expect(question.items.map((entree) => entree.reference.item_id).sort()).toEqual(
      [ALPHA.id, BETA.id, GAMMA.id].sort(),
    );
  });

  it("sa grappe et son thème sont ceux de la mesure", () => {
    const question = seule([ALPHA, BETA, GAMMA]);
    expect(question.grappe_id).toBe(REELLE.id);
    expect(question.theme).toBe("sante");
  });

  it("mesure fictive : une Q-ATT, l'item F principal, aucune autre entrée", () => {
    const question = seule([FICTIF]);
    expect(question.items).toEqual([
      { reference: { item_id: FICTIF.id, item_version: 1, item_empreinte: FICTIF.empreinte }, role: "principal" },
    ]);
    expect(question.grappe_id).toBe(FICTIVE.id);
    expect(question.theme).toBe("retraites");
  });

  it("mesure fictive : la réponse attendue est « aucun », liste vide", () => {
    const question = completer(seule([FICTIF]));
    const attendue = reponseAttendue(question, [FICTIF], GEL, RUN.perimetre.candidats);
    expect(attendue.nature).toBe("aucun_candidat");
    expect(attendue.candidats_attendus).toEqual([]);
  });

  it("mesure réelle : la réponse attendue se résout sans item principal", () => {
    const question = completer(seule([ALPHA, BETA, GAMMA]));
    const attendue = reponseAttendue(question, [ALPHA, BETA, GAMMA], GEL, RUN.perimetre.candidats);
    expect(attendue).toEqual({
      nature: "liste_candidats",
      candidats_attendus: ["demo-alpha", "demo-gamma"],
      // D64 : beta, « contre », porte un item vérifié sur la mesure : il est une référence.
      candidats_references: ["demo-alpha", "demo-beta", "demo-gamma"],
      resolution_temporelle: { date_gel: GEL, regle: "semi_ouvert" },
    });
  });

  it("une mesure qui ne porte qu'un item O n'engendre aucune Q-ATT (Q-ATT admet P et F)", () => {
    expect(attributions([GAMMA])).toHaveLength(0);
  });

  it("refuse, sans en choisir un, deux items F sur la même mesure fictive", () => {
    const autre = itemF({ cle: "apm-f2", candidat_id: "demo-beta", mesure: FICTIVE });
    expect(() => attributions([FICTIF, autre])).toThrow(AttributionFictiveAmbigue);
  });
});

describe("n° 39 : identifiant de la Q-ATT", () => {
  it("dérivé de la mesure : identique quel que soit l'ordre ou le nombre des items", () => {
    const id = seule([ALPHA, BETA, GAMMA]).id;
    expect(seule([GAMMA, BETA, ALPHA]).id).toBe(id);
    expect(id).toBe(identifiantAttribution(REELLE.id, "Q-ATT"));
  });

  it("stable quand un item de la mesure est corrigé (nouvelle version, nouvelle empreinte)", () => {
    const assertion = BETA.assertion as NonNullable<Item["assertion"]>;
    const corrige = { ...BETA, version: 2, assertion: { ...assertion, citation_verbatim: "Citation fictive corrigée." } };
    const recelle = { ...corrige, empreinte: empreinteContenuNotant(corrige) };
    expect(recelle.empreinte).not.toBe(BETA.empreinte);
    expect(seule([ALPHA, recelle, GAMMA]).id).toBe(seule([ALPHA, BETA, GAMMA]).id);
  });

  it("stable quand un item de la mesure est retiré", () => {
    expect(seule([ALPHA, GAMMA]).id).toBe(seule([ALPHA, BETA, GAMMA]).id);
  });

  it("aucune collision avec l'espace des items, même pour une chaîne identique", () => {
    expect(identifiantAttribution(ALPHA.id, "Q-ATT")).not.toBe(identifiantQuestion(ALPHA.id, "Q-ATT"));
    expect(identifiantAttribution(REELLE.id, "Q-ATT")).not.toBe(identifiantQuestion(REELLE.id, "Q-ATT"));
  });

  it("aucune collision entre toutes les questions engendrées d'un jeu mêlant mesures et items", () => {
    const questions = engendrer([ALPHA, BETA, GAMMA, FICTIF], [REELLE, FICTIVE], PERIMETRE);
    expect(new Set(questions.map((question) => question.id)).size).toBe(questions.length);
  });

  it("respecte le motif de question.schema.json", () => {
    expect(identifiantAttribution(REELLE.id, "Q-ATT")).toMatch(/^q_[0-9a-f]{32}$/);
  });
});

/* ----------------------------------------------------------------- tirage */

const PARAMETRES: ParametresTirage = { questions_par_strate: 5, questions_attribution_par_theme: 5 };

/*
 * Protocole 0.11 (constat n° 37) : les questions sur l'item O GAMMA portent, sur leur formulation
 * orientée, la position affirmée (`completerSur`), sans quoi leur prémisse est indécidable au gel et
 * le tirage les refuse. Les assertions de ce bloc sont inchangées.
 */

function tirerSur(items: readonly Item[], parametres: ParametresTirage = PARAMETRES) {
  const questions = engendrer(items, [REELLE, FICTIVE], PERIMETRE).map(completerSur(items));
  return tirer({ questions, items, mesures: [REELLE, FICTIVE], run: RUN, graine: graine(), parametres });
}

describe("n° 39 : tirage des Q-ATT", () => {
  it("tire la Q-ATT d'une mesure une seule fois, avec grappe et thème de la mesure", () => {
    const entrees = tirerSur([ALPHA, BETA, GAMMA]).tirage.entrees.filter((entree) => entree.candidat_id === undefined);
    expect(entrees).toHaveLength(1);
    expect(entrees[0]).toMatchObject({ grappe_id: REELLE.id, theme: "sante" });
    expect(entrees[0]?.items_au_gel.every((item) => item.role === "attendu_dans_liste")).toBe(true);
  });

  /*
   * Modifié ouvertement (décision de l'auteur du 2026-09-29, conformité n° 3) : la Q-ATT dont l'item
   * d'un candidat interrogé est contesté au gel n'est plus écartée en silence ; elle est exclue et
   * comptée, motif `attribution_contestee`.
   */
  it("une Q-ATT dont un seul des items est contesté n'est pas tirable : exclue et comptée", () => {
    const conteste = { ...BETA, statut_contestation: "contestee" as const };
    const questions = engendrer([ALPHA, BETA, GAMMA], [REELLE], PERIMETRE).map(completerSur([ALPHA, BETA, GAMMA]));
    const resultat = tirer({
      questions,
      items: [ALPHA, conteste, GAMMA],
      mesures: [REELLE],
      run: RUN,
      graine: graine(),
      parametres: PARAMETRES,
    });
    expect(resultat.tirage.entrees.filter((entree) => entree.candidat_id === undefined)).toHaveLength(0);
    const exclusions = resultat.tirage.exclusions.filter((exclusion) => exclusion.gabarit === "Q-ATT");
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({ motif: "attribution_contestee", theme: "sante" });
    expect(exclusions[0]?.detail).toContain(BETA.id);
  });

  /*
   * Modifié ouvertement (décision de l'auteur du 2026-09-29, conformité n° 3) : « Un item en attente de
   * validation […] n'appartient pas à la vérité de référence : il n'entre pas dans la liste et ne la rend
   * pas indéfinie. » Avant : la Q-ATT entière était écartée en silence.
   */
  it("une Q-ATT dont un seul des items est en attente est tirée sans lui", () => {
    const attente = { ...GAMMA, statut_validation: "en_attente" as const };
    const questions = engendrer([ALPHA, BETA, GAMMA], [REELLE], PERIMETRE).map(completerSur([ALPHA, BETA, GAMMA]));
    const resultat = tirer({
      questions,
      items: [ALPHA, BETA, attente],
      mesures: [REELLE],
      run: RUN,
      graine: graine(),
      parametres: PARAMETRES,
    });
    const entrees = resultat.tirage.entrees.filter((entree) => entree.candidat_id === undefined);
    expect(entrees).toHaveLength(1);
    expect(entrees[0]?.items_au_gel.map((item) => item.reference.item_id).sort()).toEqual([ALPHA.id, BETA.id].sort());
    expect(entrees[0]?.reponse_attendue.candidats_attendus).toEqual(["demo-alpha"]);
    expect(resultat.tirage.exclusions.filter((exclusion) => exclusion.gabarit === "Q-ATT")).toEqual([]);
  });

  it("la symétrie se vérifie sur un tirage portant des Q-ATT sans principal", () => {
    const items = [ALPHA, BETA, GAMMA, FICTIF];
    const questions = engendrer(items, [REELLE, FICTIVE], PERIMETRE).map(completerSur(items));
    const { tirage } = tirer({ questions, items, mesures: [REELLE, FICTIVE], run: RUN, graine: graine(), parametres: PARAMETRES });
    expect(() => verifierSymetrie(tirage, questions, items, [REELLE, FICTIVE], RUN)).not.toThrow();
  });

  it("les Q-ATT suivent leur propre quota par thème, distinct du quota des strates candidat", () => {
    const mesures = Array.from({ length: 4 }, (_, rang) => mesure({ cle: `apm-q${rang}`, theme: "sante" }));
    const items = mesures.map((referent, rang) => itemP({ cle: `apm-q${rang}`, candidat_id: "demo-alpha", mesure: referent }));
    const questions = engendrer(items, mesures, PERIMETRE).map(completerSur(items));
    const avec = (parametres: ParametresTirage) =>
      tirer({ questions, items, mesures, run: RUN, graine: graine(), parametres }).tirage.entrees;
    const attribution = (entrees: ReturnType<typeof avec>) => entrees.filter((entree) => entree.candidat_id === undefined);
    const nommees = (entrees: ReturnType<typeof avec>) => entrees.filter((entree) => entree.candidat_id !== undefined);

    const a = avec({ questions_par_strate: 1, questions_attribution_par_theme: 3 });
    expect(attribution(a)).toHaveLength(3);
    expect(nommees(a)).toHaveLength(3);
    const b = avec({ questions_par_strate: 3, questions_attribution_par_theme: 1 });
    expect(attribution(b)).toHaveLength(1);
    expect(nommees(b)).toHaveLength(9);
  });
});

describe("n° 39 : quota d'attribution obligatoire, sans valeur par défaut", () => {
  const avecQuota = (quota: unknown) => () =>
    tirerSur([ALPHA], { questions_par_strate: 1, questions_attribution_par_theme: quota } as unknown as ParametresTirage);

  it("absent : erreur", () => {
    expect(() => tirerSur([ALPHA], { questions_par_strate: 1 } as unknown as ParametresTirage)).toThrow(/attribution/i);
  });

  it("0 : erreur", () => {
    expect(avecQuota(0)).toThrow(/attribution/i);
  });

  it("non entier : erreur", () => {
    expect(avecQuota(1.5)).toThrow(/attribution/i);
  });
});

/* -------------------------------------------------------------- invariant */

describe("n° 39 : invariant de grappe", () => {
  const items = [ALPHA, BETA, GAMMA, FICTIF];

  it("Q-ATT sans principal, grappe = mesure de ses items : conforme", () => {
    const question = seule([ALPHA, BETA, GAMMA]);
    expect(grappeSuitItemPrincipal([question], items)).toEqual([]);
  });

  it("Q-ATT fictive, grappe = mesure, item F principal : conforme", () => {
    expect(grappeSuitItemPrincipal([seule([FICTIF])], items)).toEqual([]);
  });

  it("Q-ATT dont la grappe est un item et non la mesure : violation", () => {
    const question = { ...seule([ALPHA, BETA, GAMMA]), grappe_id: ALPHA.id };
    expect(grappeSuitItemPrincipal([question], items)).toHaveLength(1);
  });

  it("Q-ATT fictive dont la grappe est l'item F : violation", () => {
    const question = { ...seule([FICTIF]), grappe_id: FICTIF.id };
    expect(grappeSuitItemPrincipal([question], items)).toHaveLength(1);
  });

  it("question nommant un candidat sans item principal : violation", () => {
    const directe = engendrer([ALPHA], [REELLE], PERIMETRE).find((question) => question.candidat_id !== undefined);
    if (directe === undefined) throw new Error("Aucune question nommant un candidat.");
    const sansPrincipal = {
      ...directe,
      items: directe.items.map((entree) => ({ ...entree, role: "attendu_dans_liste" as const })),
    };
    expect(grappeSuitItemPrincipal([sansPrincipal], items)).toHaveLength(1);
  });

  it("Q-ATT dont un item est introuvable : violation, pas de silence", () => {
    const violations = grappeSuitItemPrincipal([seule([ALPHA, BETA, GAMMA])], [ALPHA, BETA]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain(`item ${GAMMA.id} introuvable`);
  });
});
