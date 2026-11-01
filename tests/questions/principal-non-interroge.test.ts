/**
 * D57 (1), protocole 0.22, §5 « Tirage » : « Une question dont l'item principal est celui d'un
 * candidat non interrogé au run n'est pas tirée non plus : elle est exclue et comptée à part dans le
 * rapport du run, avec ce motif ; seule une question d'attribution peut l'être, celle d'une mesure
 * fictive dont l'item est celui d'un candidat retiré ou non interrogé. »
 *
 * Avant la 0.22 (#209), le tirage refusait tout le gel (`PrincipalNonInterrogeAuTirage`) ; la question
 * est désormais exclue, motif `principal_non_interroge`, avant tout usage de la graine. Le refus de la
 * notation (`preparation.ts`, `ItemPrincipalNonInterroge`, #200) reste : il garde un tirage construit
 * à la main. Un item NON principal d'un non-interrogé reste admis : la notation l'écarte (§7).
 *
 * Ordre des motifs (cas 4) : le nouveau motif est évalué en dernier, après `attribution_contestee`,
 * `mesure_version_depassee`, `hors_validite` et `reponse_attendue_indecidable`. Une question qui
 * tombait déjà sous un de ces motifs garde le sien ; seules les questions que #209 refusait changent.
 */

import { describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { engendrer, identifiantAttribution } from "../../pipeline/questions/engendrement.ts";
import * as tirabilite from "../../pipeline/questions/tirabilite.ts";
import { questionsTirables } from "../../pipeline/questions/tirabilite.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { DemandeTirage } from "../../pipeline/questions/tirage.ts";
import type { CandidatAuGel, ExclusionTirage, Item, Mesure } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemF, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const NOMS = ["demo-alpha", "demo-beta"];

const REELLE = mesure({ cle: "pni-reelle", theme: "sante", libelle: "tarif social de l'eau" });
const FICTIVE = mesure({ cle: "pni-fictive", theme: "retraites", libelle: "prime aux marcheurs", fictive: true });
const FICTIVE_2 = mesure({ cle: "pni-fictive-2", theme: "sante", libelle: "chèque montagne", fictive: true });
const MESURES = [REELLE, FICTIVE, FICTIVE_2];
const Q_ATT_FICTIVE = identifiantAttribution(FICTIVE.id, "Q-ATT");
const Q_ATT_FICTIVE_2 = identifiantAttribution(FICTIVE_2.id, "Q-ATT");
const Q_ATT_REELLE = identifiantAttribution(REELLE.id, "Q-ATT");

const P_ALPHA = itemP({ cle: "pni-p-alpha", candidat_id: "demo-alpha", mesure: REELLE, position: "pour" });
const P_BETA = itemP({ cle: "pni-p-beta", candidat_id: "demo-beta", mesure: REELLE, position: "pour" });

function fictifDe(candidat_id: string, sur: Mesure = FICTIVE, valide_au?: string): Item {
  return itemF({ cle: `pni-f-${sur.id}-${candidat_id}`, candidat_id, mesure: sur, ...(valide_au === undefined ? {} : { valide_au }) });
}

const ALPHA_INTERROGE = candidat({ candidat_id: "demo-alpha" });
const BETA_RETIRE = candidat({ candidat_id: "demo-beta", statut_au_gel: "retire", interroge: false });
const BETA_INTERROGE = candidat({ candidat_id: "demo-beta" });

function demande(items: readonly Item[], candidats: readonly CandidatAuGel[], valeur?: number): DemandeTirage {
  return {
    questions: engendrer(items, MESURES, perimetre(NOMS)).map(completer),
    items,
    mesures: MESURES,
    run: run(candidats, GEL),
    graine: graine(valeur),
    parametres: { questions_par_strate: 5, questions_attribution_par_theme: 5 },
  };
}

function tirees(resultat: ReturnType<typeof tirer>): readonly string[] {
  return resultat.tirage.entrees.map((entree) => entree.question_id);
}

function exclusionDe(resultat: ReturnType<typeof tirer>, question_id: string): ExclusionTirage | undefined {
  return resultat.tirage.exclusions.find((exclusion) => exclusion.question_id === question_id);
}

describe("D57 (1) : une question dont l'item principal est d'un candidat non interrogé est exclue du tirage", () => {
  it("cas 1 : Q-ATT de mesure fictive, item F principal d'un candidat retiré ⇒ exclue, motif principal_non_interroge, non tirée", () => {
    const fictif = fictifDe("demo-beta");
    const resultat = tirer(demande([P_ALPHA, P_BETA, fictif], [ALPHA_INTERROGE, BETA_RETIRE]));
    expect(tirees(resultat)).not.toContain(Q_ATT_FICTIVE);
    const exclusion = exclusionDe(resultat, Q_ATT_FICTIVE);
    expect(exclusion).toMatchObject({ motif: "principal_non_interroge", gabarit: "Q-ATT", theme: "retraites" });
    expect(exclusion).not.toHaveProperty("candidat_id");
    // Le détail nomme l'item et le candidat, sans valeur supposée.
    expect(exclusion?.detail).toContain(fictif.id);
    expect(exclusion?.detail).toContain("demo-beta");
    // Les autres questions ne bougent pas : la Q-ATT réelle reste tirée.
    expect(tirees(resultat)).toContain(Q_ATT_REELLE);
  });

  it("cas 1 : la règle de tirabilité publique (questionsTirables) l'écarte aussi", () => {
    const items = [P_ALPHA, P_BETA, fictifDe("demo-beta")];
    const { questions, run: gel } = demande(items, [ALPHA_INTERROGE, BETA_RETIRE]);
    expect(questionsTirables(questions, items, MESURES, gel).map((q) => q.id)).not.toContain(Q_ATT_FICTIVE);
  });

  it("cas 2 : deux graines différentes ⇒ la même exclusion, le même ensemble de tirables", () => {
    const items = [P_ALPHA, P_BETA, fictifDe("demo-beta")];
    const resultats = [0, 1, 20261201].map((valeur) => tirer(demande(items, [ALPHA_INTERROGE, BETA_RETIRE], valeur)));
    const [premier, ...autres] = resultats;
    for (const autre of autres) {
      expect(autre.tirage.exclusions).toEqual(premier?.tirage.exclusions);
      expect(new Set(tirees(autre))).toEqual(new Set(premier === undefined ? [] : tirees(premier)));
    }
    expect(premier?.tirage.exclusions.map((exclusion) => exclusion.motif)).toEqual(["principal_non_interroge"]);
  });

  it("cas 3 : la même Q-ATT, item F principal d'un candidat interrogé ⇒ tirée, aucune exclusion", () => {
    const resultat = tirer(demande([P_ALPHA, P_BETA, fictifDe("demo-beta")], [ALPHA_INTERROGE, BETA_INTERROGE]));
    expect(tirees(resultat)).toContain(Q_ATT_FICTIVE);
    expect(resultat.tirage.exclusions).toEqual([]);
  });

  it("cas 4 : principal non interrogé ET hors de sa validité ⇒ un seul motif, hors_validite (le nouveau motif est évalué en dernier)", () => {
    const perime = fictifDe("demo-beta", FICTIVE, "2026-11-01");
    const resultats = [0, 20261201].map((valeur) => tirer(demande([P_ALPHA, P_BETA, perime], [ALPHA_INTERROGE, BETA_RETIRE], valeur)));
    for (const resultat of resultats) {
      const exclusions = resultat.tirage.exclusions.filter((exclusion) => exclusion.question_id === Q_ATT_FICTIVE);
      expect(exclusions.map((exclusion) => exclusion.motif)).toEqual(["hors_validite"]);
    }
  });

  it("cas 4 : principal non interrogé ET version de mesure dépassée ⇒ un seul motif, mesure_version_depassee", () => {
    const epingleV1 = fictifDe("demo-beta");
    const mesures = [REELLE, { ...FICTIVE, version: 2 }, FICTIVE_2];
    const base = demande([P_ALPHA, P_BETA, epingleV1], [ALPHA_INTERROGE, BETA_RETIRE]);
    const resultat = tirer({ ...base, mesures });
    const exclusions = resultat.tirage.exclusions.filter((exclusion) => exclusion.question_id === Q_ATT_FICTIVE);
    expect(exclusions.map((exclusion) => exclusion.motif)).toEqual(["mesure_version_depassee"]);
  });

  it("cas 5 : plusieurs exclusions ⇒ triées par question_id (comparerChaines), quel que soit l'ordre des questions lues", () => {
    const items = [P_ALPHA, P_BETA, fictifDe("demo-beta"), fictifDe("demo-beta", FICTIVE_2)];
    const base = demande(items, [ALPHA_INTERROGE, BETA_RETIRE]);
    for (const questions of [base.questions, [...base.questions].reverse()]) {
      const ids = tirer({ ...base, questions }).tirage.exclusions.map((exclusion) => exclusion.question_id);
      expect(new Set(ids)).toEqual(new Set([Q_ATT_FICTIVE, Q_ATT_FICTIVE_2]));
      expect(ids).toEqual([...ids].sort(comparerChaines));
    }
  });

  it("une Q-ATT dont seul un item non principal est d'un non-interrogé ⇒ tirée, inchangée (la notation l'écartera)", () => {
    const items = [P_ALPHA, P_BETA, fictifDe("demo-alpha")];
    const avecBetaRetire = tirer(demande(items, [ALPHA_INTERROGE, BETA_RETIRE]));
    expect(tirees(avecBetaRetire)).toContain(Q_ATT_REELLE);
    expect(avecBetaRetire.tirage.exclusions).toEqual([]);
    const entree = avecBetaRetire.tirage.entrees.find((une) => une.question_id === Q_ATT_REELLE);
    expect(entree?.items_au_gel.map((item) => item.reference.item_id)).toContain(P_BETA.id);
    // Témoin : la question est engendrée avec l'item du retiré en liste, et sans principal.
    const question = demande(items, [ALPHA_INTERROGE, BETA_RETIRE]).questions.find((une) => une.id === Q_ATT_REELLE);
    expect(question?.items.find((une) => une.reference.item_id === P_BETA.id)?.role).toBe("attendu_dans_liste");
    expect(question?.items.some((une) => une.role === "principal")).toBe(false);
  });

  it("le refus nommé du gel n'existe plus : aucun export PrincipalNonInterrogeAuTirage", () => {
    expect(Object.keys(tirabilite)).not.toContain("PrincipalNonInterrogeAuTirage");
  });
});

describe("cas 6 : tirage.schema.json connaît le motif principal_non_interroge", () => {
  const publie = JSON.parse(
    JSON.stringify(tirer(demande([P_ALPHA, P_BETA, fictifDe("demo-beta")], [ALPHA_INTERROGE, BETA_RETIRE])).tirage),
  ) as { exclusions: Record<string, unknown>[] };

  it("cas 6 : un tirage portant l'exclusion principal_non_interroge est conforme", () => {
    expect(publie.exclusions.map((exclusion) => exclusion["motif"])).toEqual(["principal_non_interroge"]);
    expect(() => valider("tirage", publie, "tirage avec principal_non_interroge")).not.toThrow();
  });

  it("cas 6 : le même tirage avec un motif inconnu est refusé", () => {
    const inconnu = { ...publie, exclusions: publie.exclusions.map((exclusion) => ({ ...exclusion, motif: "candidat_non_interroge" })) };
    expect(() => valider("tirage", inconnu, "motif inconnu")).toThrow();
  });
});
