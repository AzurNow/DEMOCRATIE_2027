/**
 * Conformité du 2026-09-29, constats hauts n° 2 et n° 3 ; décisions 5 et 6 de l'auteur du même
 * jour (`docs/TACHES-AUTEUR.md`), à écrire au protocole en 0.14.
 *
 * n° 3 (§5) : « une question d'attribution n'est pas tirée lorsque l'item d'un candidat interrogé
 * au run sur la mesure est contesté à la date du gel […] La question est exclue et comptée à part
 * dans le rapport du run […]. Un item en attente de validation, retiré ou déclaré non évaluable
 * n'appartient pas à la vérité de référence : il n'entre pas dans la liste et ne la rend pas
 * indéfinie. » Le résultat ne dépend plus du moment où la Q-ATT a été engendrée : chaque cas est
 * joué deux fois, questions engendrées avant le changement d'état de l'item, et au gel.
 *
 * n° 2 (§4) : le tirage refuse un item vérifié dont `mesure_version` n'est pas la version courante
 * de sa mesure, et le compte dans les exclusions ; un tel item ne compte pas au seuil de couverture.
 */

import { describe, expect, it } from "vitest";
import { itemPCompteAuGel } from "../../pipeline/questions/couverture.ts";
import { engendrer, MesureIntrouvable } from "../../pipeline/questions/engendrement.ts";
import { verifierSymetrie, conditionDeSymetrie } from "../../pipeline/questions/symetrie.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import { questionsTirables } from "../../pipeline/questions/tirabilite.ts";
import type { Item, Mesure, Question, Tirage } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { candidat, completer, decidePar, graine, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const AVANT_GEL = "2026-10-05T10:00:00+02:00";
/** demo-gamma est au périmètre, retiré, et n'est plus interrogé (§3). */
const CANDIDATS = ["demo-alpha", "demo-beta", "demo-gamma"];
const RUN = run(
  [
    candidat({ candidat_id: "demo-alpha" }),
    candidat({ candidat_id: "demo-beta" }),
    candidat({ candidat_id: "demo-gamma", statut_au_gel: "retire", interroge: false }),
  ],
  GEL,
);
const PARAMETRES = { questions_par_strate: 5, questions_attribution_par_theme: 5 };

const MESURE = mesure({ cle: "cvg", theme: "sante", libelle: "tarif social de l'eau" });
/** La même mesure après une correction de thème acceptée : nouvelle version (§4). */
const MESURE_V2: Mesure = { ...MESURE, version: 2, theme: "retraites" };

const ALPHA = itemP({ cle: "cvg-a", candidat_id: "demo-alpha", mesure: MESURE, position: "pour" });
const BETA = itemP({ cle: "cvg-b", candidat_id: "demo-beta", mesure: MESURE, position: "pour" });
const GAMMA = itemP({ cle: "cvg-c", candidat_id: "demo-gamma", mesure: MESURE, position: "pour" });
const TOUS = [ALPHA, BETA, GAMMA];

function conteste(item: Item): Item {
  return { ...item, statut_contestation: "contestee" };
}

function questionsSur(items: readonly Item[], mesures: readonly Mesure[] = [MESURE]): readonly Question[] {
  return engendrer(items, mesures, perimetre(CANDIDATS)).map(completer);
}

function tirerSur(questions: readonly Question[], items: readonly Item[], mesures: readonly Mesure[] = [MESURE]): Tirage {
  return tirer({ questions, items, mesures, run: RUN, graine: graine(), parametres: PARAMETRES }).tirage;
}

/** Le tirage des questions engendrées AVANT le changement d'état, puis de celles engendrées AU GEL. */
function deuxFois(items_au_gel: readonly Item[]): { readonly avant: Tirage; readonly au_gel: Tirage } {
  return {
    avant: tirerSur(questionsSur(TOUS), items_au_gel),
    au_gel: tirerSur(questionsSur(items_au_gel), items_au_gel),
  };
}

function attributions(tirage: Tirage) {
  return tirage.entrees.filter((entree) => entree.gabarit === "Q-ATT");
}

function exclusionsAttribution(tirage: Tirage) {
  return tirage.exclusions.filter((exclusion) => exclusion.gabarit === "Q-ATT");
}

function itemsDeLaQAtt(tirage: Tirage): readonly string[] {
  const entrees = attributions(tirage);
  expect(entrees).toHaveLength(1);
  return (entrees[0]?.items_au_gel ?? []).map((item) => item.reference.item_id).sort();
}

function listeDeLaQAtt(tirage: Tirage): readonly string[] | undefined {
  return attributions(tirage)[0]?.reponse_attendue.candidats_attendus;
}

/* ------------------------------------------------------------------ n° 3 */

describe("n° 3 : un item vérifié contesté au gel suspend la Q-ATT de sa mesure", () => {
  it("cas 1 : l'item d'un candidat interrogé est contesté au gel : Q-ATT exclue, motif attribution_contestee, comptée", () => {
    const { au_gel } = deuxFois([ALPHA, conteste(BETA), GAMMA]);
    expect(attributions(au_gel)).toHaveLength(0);
    const exclusions = exclusionsAttribution(au_gel);
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({ gabarit: "Q-ATT", theme: "sante", motif: "attribution_contestee" });
    expect(exclusions[0]?.candidat_id).toBeUndefined();
    expect(exclusions[0]?.detail).toContain(BETA.id);
    expect(exclusions[0]?.detail).toContain("demo-beta");
  });

  it("cas 2 : Q-ATT engendrée avant la contestation : même tirage que celle engendrée au gel", () => {
    const { avant, au_gel } = deuxFois([ALPHA, conteste(BETA), GAMMA]);
    expect(exclusionsAttribution(avant)).toEqual(exclusionsAttribution(au_gel));
    expect(avant).toEqual(au_gel);
  });

  it("cas 3 : un item retiré par le panel : Q-ATT tirée, son candidat hors de la liste attendue et des items au gel", () => {
    const retire = decidePar(BETA, [{ cle: "cvg-retrait", decision: "retrait", date: AVANT_GEL }]);
    expect(retire.statut_validation).toBe("retire_par_panel");
    const { avant, au_gel } = deuxFois([ALPHA, retire, GAMMA]);
    for (const tirage of [avant, au_gel]) {
      expect(listeDeLaQAtt(tirage)).toEqual(["demo-alpha"]);
      expect(itemsDeLaQAtt(tirage)).not.toContain(BETA.id);
      expect(exclusionsAttribution(tirage)).toEqual([]);
    }
    expect(avant).toEqual(au_gel);
  });

  it.each(["en_attente", "non_evaluable", "a_confirmer", "rejete"] as const)(
    "cas 4 : un item « %s » n'entre pas dans la liste et ne bloque pas : Q-ATT tirée sans lui",
    (statut_validation) => {
      const hors = { ...BETA, statut_validation };
      const { avant, au_gel } = deuxFois([ALPHA, hors, GAMMA]);
      for (const tirage of [avant, au_gel]) {
        expect(listeDeLaQAtt(tirage)).toEqual(["demo-alpha"]);
        expect(itemsDeLaQAtt(tirage)).toEqual([ALPHA.id, GAMMA.id].sort());
        expect(exclusionsAttribution(tirage)).toEqual([]);
      }
      expect(avant).toEqual(au_gel);
    },
  );

  it("cas 4 bis : un item contesté qui n'est pas vérifié (retiré puis recontesté) ne bloque pas", () => {
    const retire = decidePar(BETA, [{ cle: "cvg-retrait-bis", decision: "retrait", date: AVANT_GEL }]);
    const reconteste = conteste(retire);
    const { avant, au_gel } = deuxFois([ALPHA, reconteste, GAMMA]);
    expect(listeDeLaQAtt(au_gel)).toEqual(["demo-alpha"]);
    expect(exclusionsAttribution(au_gel)).toEqual([]);
    expect(avant).toEqual(au_gel);
  });

  it("cas 5 : l'item contesté d'un candidat non interrogé ne bloque pas la Q-ATT", () => {
    const { avant, au_gel } = deuxFois([ALPHA, BETA, conteste(GAMMA)]);
    for (const tirage of [avant, au_gel]) {
      expect(listeDeLaQAtt(tirage)).toEqual(["demo-alpha", "demo-beta"]);
      expect(itemsDeLaQAtt(tirage)).toEqual([ALPHA.id, BETA.id].sort());
      expect(exclusionsAttribution(tirage)).toEqual([]);
    }
    expect(avant).toEqual(au_gel);
  });

  it("cas 6 : un item maintenu après contestation revient dans la liste : Q-ATT tirée avec lui", () => {
    const maintenu = decidePar(BETA, [{ cle: "cvg-maintien", decision: "maintien", date: AVANT_GEL }]);
    expect(maintenu.statut_contestation).toBe("arbitree");
    const { avant, au_gel } = deuxFois([ALPHA, maintenu, GAMMA]);
    for (const tirage of [avant, au_gel]) {
      expect(listeDeLaQAtt(tirage)).toEqual(["demo-alpha", "demo-beta"]);
      expect(itemsDeLaQAtt(tirage)).toContain(BETA.id);
    }
    expect(avant).toEqual(au_gel);
  });

  it("cas 6 bis : un item réintégré (retrait puis maintien) revient dans la liste", () => {
    const retire = decidePar(BETA, [{ cle: "cvg-ri-1", decision: "retrait", date: AVANT_GEL }]);
    const reintegre = decidePar(retire, [{ cle: "cvg-ri-2", decision: "maintien", date: "2026-10-20T10:00:00+02:00" }]);
    expect(reintegre.statut_validation).toBe("verifie");
    const { avant, au_gel } = deuxFois([ALPHA, reintegre, GAMMA]);
    expect(listeDeLaQAtt(au_gel)).toEqual(["demo-alpha", "demo-beta"]);
    expect(avant).toEqual(au_gel);
  });

  it("une mesure dont le seul porteur est contesté : Q-ATT ni tirée ni comptée, qu'elle ait été engendrée avant ou au gel", () => {
    const seul = [conteste(BETA)];
    expect(questionsSur(seul)).toEqual([]);
    const avant = tirerSur(questionsSur([BETA, ALPHA]), [conteste(BETA), { ...ALPHA, statut_validation: "en_attente" }]);
    expect(attributions(avant)).toEqual([]);
    expect(exclusionsAttribution(avant)).toEqual([]);
  });

  it("la Q-ATT engendrée au gel garde l'item vérifié contesté dans ses items (attendu_dans_liste)", () => {
    const attribution = questionsSur([ALPHA, conteste(BETA)]).find((question) => question.gabarit === "Q-ATT");
    expect(attribution?.items.map((entree) => entree.reference.item_id).sort()).toEqual([ALPHA.id, BETA.id].sort());
  });

  it("questionsTirables applique la même règle : la Q-ATT bloquée n'est pas tirable", () => {
    const items = [ALPHA, conteste(BETA), GAMMA];
    const tirables = questionsTirables(questionsSur(TOUS), items, [MESURE], RUN);
    expect(tirables.filter((question) => question.gabarit === "Q-ATT")).toEqual([]);
  });

  it("les tirages de ces cas passent la symétrie : aucun item contesté ou en attente n'y figure", () => {
    const retire = decidePar(BETA, [{ cle: "cvg-sym", decision: "retrait", date: AVANT_GEL }]);
    for (const items of [
      [ALPHA, conteste(BETA), GAMMA],
      [ALPHA, retire, GAMMA],
      [ALPHA, { ...BETA, statut_validation: "en_attente" as const }, GAMMA],
      [ALPHA, BETA, conteste(GAMMA)],
    ]) {
      const questions = questionsSur(TOUS);
      const tirage = tirerSur(questions, items);
      const symetrie = verifierSymetrie(tirage, questions, items, [MESURE], RUN);
      expect(conditionDeSymetrie(symetrie, "aucun_item_conteste_ou_en_attente")?.statut).toBe("vert");
    }
  });
});

/* ------------------------------------------------------------------ n° 2 */

describe("n° 2 : un item vérifié épinglé sur une version dépassée de sa mesure", () => {
  /** ALPHA épingle la version 1 ; BETA a été revalidé sur la version 2, courante. */
  const BETA_V2 = itemP({ cle: "cvg-b", candidat_id: "demo-beta", mesure: MESURE_V2, position: "pour" });
  const ITEMS = [ALPHA, BETA_V2];
  const QUESTIONS = questionsSur(ITEMS, [MESURE_V2]);
  const TIRAGE = tirerSur(QUESTIONS, ITEMS, [MESURE_V2]);

  function questionsDe(item: Item): readonly Question[] {
    return QUESTIONS.filter((question) => question.candidat_id === item.candidat_id);
  }

  it("cas 7 : les questions d'un item P à mesure_version dépassée sont exclues, motif mesure_version_depassee, et comptées", () => {
    const siennes = questionsDe(ALPHA);
    expect(siennes.length).toBeGreaterThan(0);
    const tirees = new Set(TIRAGE.entrees.map((entree) => entree.question_id));
    for (const question of siennes) {
      expect(tirees.has(question.id)).toBe(false);
      const exclusion = TIRAGE.exclusions.find((candidate) => candidate.question_id === question.id);
      expect(exclusion).toMatchObject({ motif: "mesure_version_depassee", candidat_id: "demo-alpha", theme: "retraites" });
      expect(exclusion?.detail).toContain(ALPHA.id);
    }
  });

  it("cas 7 : il ne compte pas au seuil de couverture", () => {
    const referentiel = new Map([[MESURE_V2.id, MESURE_V2]]);
    expect(itemPCompteAuGel(ALPHA, "demo-alpha", GEL, referentiel)).toBe(false);
  });

  it("cas 8 : une Q-ATT dont un item est à mesure_version dépassée est exclue avec ce motif", () => {
    expect(attributions(TIRAGE)).toEqual([]);
    const exclusions = exclusionsAttribution(TIRAGE);
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({ motif: "mesure_version_depassee", gabarit: "Q-ATT" });
    expect(exclusions[0]?.detail).toContain(ALPHA.id);
  });

  it("cas 8 bis : un item à version dépassée d'un candidat non interrogé exclut aussi la Q-ATT (l'item serait figé au tirage)", () => {
    const gamma = GAMMA;
    const items = [BETA_V2, gamma];
    const tirage = tirerSur(questionsSur(items, [MESURE_V2]), items, [MESURE_V2]);
    expect(exclusionsAttribution(tirage).map((exclusion) => exclusion.motif)).toEqual(["mesure_version_depassee"]);
  });

  it("cas 8 ter : un item à version dépassée mais contesté (le chemin prévu au §4) : la contestation prime", () => {
    const items = [conteste(ALPHA), BETA_V2];
    const tirage = tirerSur(questionsSur([ALPHA, BETA_V2], [MESURE_V2]), items, [MESURE_V2]);
    expect(exclusionsAttribution(tirage).map((exclusion) => exclusion.motif)).toEqual(["attribution_contestee"]);
    // Ses propres questions restent écartées comme avant ce lot : item principal contesté.
    expect(tirage.exclusions.filter((exclusion) => exclusion.candidat_id === "demo-alpha")).toEqual([]);
  });

  it("cas 8 quater : un item à version dépassée écarté (en attente) ne rend pas la Q-ATT exclue", () => {
    const items = [{ ...ALPHA, statut_validation: "en_attente" as const }, BETA_V2];
    const tirage = tirerSur(questionsSur([ALPHA, BETA_V2], [MESURE_V2]), items, [MESURE_V2]);
    expect(exclusionsAttribution(tirage)).toEqual([]);
    expect(listeDeLaQAtt(tirage)).toEqual(["demo-beta"]);
  });

  it("cas 9 : un item à la version courante est inchangé : ses questions sont tirées, il compte au seuil", () => {
    const tirees = new Set(TIRAGE.entrees.map((entree) => entree.question_id));
    for (const question of questionsDe(BETA_V2)) expect(tirees.has(question.id)).toBe(true);
    expect(TIRAGE.exclusions.filter((exclusion) => exclusion.candidat_id === "demo-beta")).toEqual([]);
    expect(itemPCompteAuGel(BETA_V2, "demo-beta", GEL, new Map([[MESURE_V2.id, MESURE_V2]]))).toBe(true);
  });

  it("cas 9 : à version courante partout, le tirage n'a aucune exclusion", () => {
    const tirage = tirerSur(questionsSur(TOUS), TOUS);
    expect(tirage.exclusions).toEqual([]);
    expect(listeDeLaQAtt(tirage)).toEqual(["demo-alpha", "demo-beta"]);
  });

  it("une mesure absente du référentiel reste une erreur, jamais une exclusion", () => {
    expect(() => tirerSur(QUESTIONS, ITEMS, [])).toThrow(MesureIntrouvable);
    expect(() => itemPCompteAuGel(ALPHA, "demo-alpha", GEL, new Map())).toThrow(MesureIntrouvable);
  });
});

/* ---------------------------------------------------------------- schéma */

describe("cas 10 : tirage.schema.json connaît les deux nouveaux motifs, et eux seuls en plus", () => {
  const tirage = JSON.parse(JSON.stringify(tirerSur(questionsSur(TOUS), TOUS))) as Tirage;
  const exclusion = {
    question_id: "q_0123456789abcdef0123456789abcdef",
    theme: "sante",
    gabarit: "Q-ATT",
    detail: "Détail de l'exclusion.",
  };

  it.each(["attribution_contestee", "mesure_version_depassee"])("motif « %s » : accepté", (motif) => {
    expect(() => valider("tirage", { ...tirage, exclusions: [{ ...exclusion, motif }] }, motif)).not.toThrow();
  });

  it("motif hors énumération : refusé", () => {
    expect(() =>
      valider("tirage", { ...tirage, exclusions: [{ ...exclusion, motif: "item_conteste" }] }, "motif inconnu"),
    ).toThrow();
  });

  it("les tirages produits par ces cas sont conformes au schéma", () => {
    const publie = JSON.parse(JSON.stringify(deuxFois([ALPHA, conteste(BETA), GAMMA]).au_gel)) as unknown;
    expect(() => valider("tirage", publie, "tirage avec attribution_contestee")).not.toThrow();
    const perime = tirerSur(
      questionsSur([ALPHA, itemP({ cle: "cvg-b", candidat_id: "demo-beta", mesure: MESURE_V2 })], [MESURE_V2]),
      [ALPHA, itemP({ cle: "cvg-b", candidat_id: "demo-beta", mesure: MESURE_V2 })],
      [MESURE_V2],
    );
    expect(() => valider("tirage", JSON.parse(JSON.stringify(perime)), "tirage avec mesure_version_depassee")).not.toThrow();
  });
});
