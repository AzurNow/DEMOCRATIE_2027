/**
 * Protocole 0.32, décision D74 de l'auteur (2026-11-04), points (16), (17) et (18), sur les items aux
 * positions incompatibles du §5 (protocole 0.27, D67) :
 *
 * - (16) §4 : « Un item que le tirage exclut parce que sa position est incompatible avec celle d'un
 *   autre item du même candidat sur la même mesure (section 5) ne compte pas non plus » au seuil de
 *   couverture (`couverture.ts:itemsPAuGel`).
 * - (17) §5 : ces items sont « publiés un à un avec le tirage » : `tirage.incompatibles_au_gel`, sur le
 *   modèle de `contestes_au_gel` (une entrée par candidat interrogé, zéro compris, triée).
 * - (18) §5 : « Un item vérifié sur une version de sa mesure qui n'est pas la version en vigueur, que
 *   le tirage exclut déjà (section 4), n'entre pas dans cette comparaison et ne fait exclure aucun
 *   autre item. »
 *
 * Le point (14), déjà codé (seuls les candidats interrogés entrent dans la détection), est gardé ici
 * pour les deux usages nouveaux de la détection.
 */

import { describe, expect, it } from "vitest";
import { idsInterroges } from "../../analysis/candidats-interroges.ts";
import { itemsPAuGel } from "../../pipeline/questions/couverture.ts";
import { engendrer, MesureIntrouvable } from "../../pipeline/questions/engendrement.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import {
  itemsAuxPositionsIncompatibles,
  positionsIncompatiblesAuGel,
} from "../../pipeline/questions/tirabilite.ts";
import type { CandidatAuGel, Item, Mesure, Question } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { candidat, completerSur, graine, itemO, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";

/** Ordre volontairement non trié : le champ publié l'est. Gamma est retiré, non interrogé. */
const CANDIDATS: readonly CandidatAuGel[] = [
  candidat({ candidat_id: "demo-beta" }),
  candidat({ candidat_id: "demo-alpha" }),
  candidat({ candidat_id: "demo-gamma", statut_au_gel: "retire", interroge: false }),
];
const RUN = run(CANDIDATS, GEL);
const INTERROGES = idsInterroges(CANDIDATS);
const TOUS = ["demo-alpha", "demo-beta", "demo-gamma"];

const M_SOCLE = mesure({ cle: "iag-socle", theme: "sante" });
const M_CONFLIT = mesure({ cle: "iag-conflit", theme: "retraites" });
const M_CONFLIT_2 = mesure({ cle: "iag-conflit-2", theme: "education" });
/** Une mesure corrigée : sa version en vigueur est la 2 (§4, correction de la formulation ou du thème). */
const M_CORRIGEE_V1 = mesure({ cle: "iag-corrigee", theme: "immigration" });
const M_CORRIGEE: Mesure = { ...M_CORRIGEE_V1, version: 2 };
const MESURES: readonly Mesure[] = [M_SOCLE, M_CONFLIT, M_CONFLIT_2, M_CORRIGEE];
const REFERENTIEL = new Map(MESURES.map((une) => [une.id, une]));

function p(cle: string, candidat_id: string, mesure_: Mesure, position: "pour" | "contre" = "pour"): Item {
  return itemP({ cle: `iag-${cle}`, candidat_id, mesure: mesure_, position });
}

/** Un item P ordinaire par candidat, sans conflit : le tirage a toujours des entrées. */
const SOCLE = TOUS.map((candidat_id) => p(`socle-${candidat_id}`, candidat_id, M_SOCLE));

function tirerSur(items: readonly Item[], valeur = 20261201) {
  const tous = [...SOCLE, ...items];
  const questions: readonly Question[] = engendrer(tous, MESURES, perimetre(TOUS)).map(completerSur(tous));
  return tirer({
    questions,
    items: tous,
    mesures: MESURES,
    run: RUN,
    graine: graine(valeur),
    parametres: { questions_par_strate: 10, questions_attribution_par_theme: 10 },
  });
}

function listesDe(items: readonly Item[]): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(tirerSur(items).tirage.incompatibles_au_gel.map((entree) => [entree.candidat_id, entree.item_ids]));
}

function ids(...items: readonly Item[]): readonly string[] {
  return items.map((item) => item.id).sort();
}

/* ---------------------------------------------------------------- (16) */

describe("D74 (16) : un item exclu pour une position incompatible ne compte pas au seuil de couverture", () => {
  it("les deux items P incompatibles d'un candidat interrogé sortent de items_p_au_gel, les autres y restent", () => {
    const pour = p("c16-pour", "demo-alpha", M_CONFLIT, "pour");
    const contre = p("c16-contre", "demo-alpha", M_CONFLIT, "contre");
    const sauf = p("c16-sauf", "demo-alpha", M_SOCLE);
    const liste = itemsPAuGel([pour, contre, sauf], "demo-alpha", GEL, MESURES, INTERROGES);
    expect(liste).toEqual([sauf.id]);
  });

  it("candidat qui passe sous le seuil à cause des exclusions : 10 items P sans le conflit, 9 avec (11 sans la règle)", () => {
    const neuf = Array.from({ length: 9 }, (_, rang) => p(`c16-seuil-${rang}`, "demo-alpha", M_SOCLE));
    const pour = p("c16-seuil-pour", "demo-alpha", M_CONFLIT, "pour");
    const contre = p("c16-seuil-contre", "demo-alpha", M_CONFLIT, "contre");
    expect(itemsPAuGel([...neuf, pour], "demo-alpha", GEL, MESURES, INTERROGES)).toHaveLength(10);
    const avecConflit = itemsPAuGel([...neuf, pour, contre], "demo-alpha", GEL, MESURES, INTERROGES);
    expect(avecConflit).toEqual(ids(...neuf));
    expect(avecConflit).not.toContain(pour.id);
    expect(avecConflit).not.toContain(contre.id);
  });

  it("un item P incompatible avec un item O en vigueur ne compte pas ; l'item O n'est jamais compté (P seuls)", () => {
    const pour = p("c16-po-p", "demo-alpha", M_CONFLIT, "pour");
    const o = itemO({ cle: "iag-c16-po-o", candidat_id: "demo-alpha", mesure: M_CONFLIT, position: "pour", position_posterieure: "contre", date_changement: "2026-10-01" });
    expect(itemsPAuGel([pour, o], "demo-alpha", GEL, MESURES, INTERROGES)).toEqual([]);
  });

  it("D74 (14) : les items incompatibles d'un candidat non interrogé, hors de la détection, comptent", () => {
    const pour = p("c16-gamma-pour", "demo-gamma", M_CONFLIT, "pour");
    const contre = p("c16-gamma-contre", "demo-gamma", M_CONFLIT, "contre");
    expect(itemsPAuGel([pour, contre], "demo-gamma", GEL, MESURES, INTERROGES)).toEqual(ids(pour, contre));
  });

  it("le conflit d'un autre candidat ne retire rien au compte de celui-ci", () => {
    const alpha = p("c16-autre-alpha", "demo-alpha", M_CONFLIT, "pour");
    const betaPour = p("c16-autre-beta-pour", "demo-beta", M_CONFLIT, "pour");
    const betaContre = p("c16-autre-beta-contre", "demo-beta", M_CONFLIT, "contre");
    expect(itemsPAuGel([alpha, betaPour, betaContre], "demo-alpha", GEL, MESURES, INTERROGES)).toEqual([alpha.id]);
  });

  it("deux items de même position sur une mesure ne sont pas incompatibles : tous deux comptent", () => {
    const un = p("c16-accord-1", "demo-alpha", M_CONFLIT, "pour");
    const deux = p("c16-accord-2", "demo-alpha", M_CONFLIT, "pour");
    expect(itemsPAuGel([un, deux], "demo-alpha", GEL, MESURES, INTERROGES)).toEqual(ids(un, deux));
  });
});

/* ---------------------------------------------------------------- (18) */

describe("D74 (18) : un item épinglé sur une version dépassée de sa mesure n'entre pas dans la détection", () => {
  /** Vérifié sur la version 1, « contre » ; la version en vigueur est la 2. */
  const PERIME = itemP({ cle: "iag-c18-perime", candidat_id: "demo-alpha", mesure: M_CORRIGEE_V1, position: "contre" });
  /** Vérifié sur la version en vigueur, « pour ». */
  const COURANT = itemP({ cle: "iag-c18-courant", candidat_id: "demo-alpha", mesure: M_CORRIGEE, position: "pour" });

  function questionsDe(item: Item, tirage: ReturnType<typeof tirerSur>["tirage"]): readonly string[] {
    const tous = [...SOCLE, PERIME, COURANT];
    return engendrer(tous, MESURES, perimetre(TOUS))
      .filter((question) => question.candidat_id !== undefined && question.grappe_id === item.id)
      .map((question) => question.id)
      .filter((id) => tirage.entrees.some((entree) => entree.question_id === id) || tirage.exclusions.some((une) => une.question_id === id));
  }

  it("épinglé sur version dépassée face à un item en vigueur incompatible : aucun groupe détecté", () => {
    expect(positionsIncompatiblesAuGel([PERIME, COURANT], GEL, INTERROGES, REFERENTIEL)).toEqual([]);
    expect(itemsAuxPositionsIncompatibles(positionsIncompatiblesAuGel([PERIME, COURANT], GEL, INTERROGES, REFERENTIEL), "demo-alpha")).toEqual([]);
  });

  it("au tirage, aucun des deux n'est exclu pour ce motif : le courant est tiré, le périmé garde son seul motif de version", () => {
    const { tirage, rapport } = tirerSur([PERIME, COURANT]);
    expect(tirage.exclusions.filter((une) => une.motif === "positions_incompatibles")).toEqual([]);
    expect(rapport.positions_incompatibles).toEqual([]);
    const courantes = questionsDe(COURANT, tirage);
    expect(courantes.length).toBeGreaterThan(0);
    for (const id of courantes) expect(tirage.entrees.map((entree) => entree.question_id)).toContain(id);
    const perimees = questionsDe(PERIME, tirage);
    expect(perimees.length).toBeGreaterThan(0);
    for (const id of perimees) {
      expect(tirage.exclusions.find((une) => une.question_id === id)?.motif).toBe("mesure_version_depassee");
    }
    expect(listesDe([PERIME, COURANT])["demo-alpha"]).toEqual([]);
  });

  it("le seuil compte l'item en vigueur ; le périmé n'y compte pas, pour sa version seule", () => {
    expect(itemsPAuGel([PERIME, COURANT], "demo-alpha", GEL, MESURES, INTERROGES)).toEqual([COURANT.id]);
  });

  it("deux items en vigueur incompatibles, sur la version courante : exclusion inchangée", () => {
    const contre = itemP({ cle: "iag-c18-courant-contre", candidat_id: "demo-alpha", mesure: M_CORRIGEE, position: "contre" });
    const conflits = positionsIncompatiblesAuGel([COURANT, contre], GEL, INTERROGES, REFERENTIEL);
    expect(conflits).toHaveLength(1);
    expect(itemsAuxPositionsIncompatibles(conflits, "demo-alpha")).toEqual(ids(COURANT, contre));
    const { tirage } = tirerSur([COURANT, contre]);
    for (const id of questionsDe(COURANT, tirage)) {
      expect(tirage.exclusions.find((une) => une.question_id === id)?.motif).toBe("positions_incompatibles");
    }
  });

  it("une mesure absente du référentiel reste une erreur nommée, jamais un item écarté en silence", () => {
    const orphelin = itemP({ cle: "iag-c18-orphelin", candidat_id: "demo-alpha", mesure: mesure({ cle: "iag-absente" }) });
    expect(() => positionsIncompatiblesAuGel([orphelin], GEL, INTERROGES, REFERENTIEL)).toThrow(MesureIntrouvable);
  });
});

/* ---------------------------------------------------------------- (17) */

describe("D74 (17) : tirage.incompatibles_au_gel publie les items exclus un à un", () => {
  const A_POUR = p("c17-a-pour", "demo-alpha", M_CONFLIT, "pour");
  const A_CONTRE = p("c17-a-contre", "demo-alpha", M_CONFLIT, "contre");
  const A2_POUR = p("c17-a2-pour", "demo-alpha", M_CONFLIT_2, "pour");
  const A2_CONTRE = p("c17-a2-contre", "demo-alpha", M_CONFLIT_2, "contre");
  const B_POUR = p("c17-b-pour", "demo-beta", M_CONFLIT, "pour");
  const G_POUR = p("c17-g-pour", "demo-gamma", M_CONFLIT_2, "pour");
  const G_CONTRE = p("c17-g-contre", "demo-gamma", M_CONFLIT_2, "contre");
  const CONFLITS = [A_POUR, A_CONTRE, A2_POUR, A2_CONTRE, B_POUR, G_POUR, G_CONTRE];

  it("l'item exclu est publié avec son identifiant, toutes mesures du candidat confondues, triés", () => {
    expect(listesDe(CONFLITS)["demo-alpha"]).toEqual(ids(A_POUR, A_CONTRE, A2_POUR, A2_CONTRE));
  });

  it("une entrée par candidat interrogé, triée par candidat_id ; vide (pas absente) sans conflit", () => {
    const { tirage } = tirerSur(CONFLITS);
    expect(tirage.incompatibles_au_gel.map((entree) => entree.candidat_id)).toEqual(["demo-alpha", "demo-beta"]);
    expect(tirage.incompatibles_au_gel).toContainEqual({ candidat_id: "demo-beta", item_ids: [] });
  });

  it("aucun conflit : chaque candidat interrogé est publié avec une liste vide, comme contestes_au_gel", () => {
    const { tirage } = tirerSur([]);
    expect(tirage.incompatibles_au_gel).toEqual([
      { candidat_id: "demo-alpha", item_ids: [] },
      { candidat_id: "demo-beta", item_ids: [] },
    ]);
    expect(tirage.incompatibles_au_gel.map((entree) => entree.candidat_id)).toEqual(
      tirage.contestes_au_gel.map((entree) => entree.candidat_id),
    );
  });

  it("D74 (14) : le candidat non interrogé n'a pas d'entrée, et ses items n'apparaissent nulle part", () => {
    const { tirage } = tirerSur(CONFLITS);
    const publies = tirage.incompatibles_au_gel.flatMap((entree) => entree.item_ids);
    expect(tirage.incompatibles_au_gel.map((entree) => entree.candidat_id)).not.toContain("demo-gamma");
    expect(publies).not.toContain(G_POUR.id);
    expect(publies).not.toContain(G_CONTRE.id);
  });

  it("la liste publiée est exactement celle du rapport, mise à plat par candidat", () => {
    const { tirage, rapport } = tirerSur(CONFLITS);
    const duRapport = rapport.positions_incompatibles.flatMap((conflit) => conflit.items.map((lu) => lu.item_id));
    expect(tirage.incompatibles_au_gel.flatMap((entree) => entree.item_ids).sort()).toEqual([...duRapport].sort());
  });

  it("identique quelle que soit la graine (évalué sans elle)", () => {
    expect(tirerSur(CONFLITS, 1).tirage.incompatibles_au_gel).toEqual(tirerSur(CONFLITS, 20270101).tirage.incompatibles_au_gel);
  });

  it("le tirage publié est conforme au schéma ; privé du champ, il est refusé", () => {
    const publie = JSON.parse(JSON.stringify(tirerSur(CONFLITS).tirage)) as Record<string, unknown>;
    expect(() => valider("tirage", publie, "tirage avec incompatibles_au_gel")).not.toThrow();
    const { incompatibles_au_gel: _retire, ...sans } = publie;
    expect(() => valider("tirage", sans, "tirage sans incompatibles_au_gel")).toThrow();
  });
});
