/**
 * Lot V3-1 (protocole 0.21, §7, D56 (1)) : « Le juge ne reçoit que les items des candidats
 * interrogés au run. » Depuis #200, la préparation de la notation (`preparation.ts`) refuse un item
 * PRINCIPAL d'un candidat non interrogé (`ItemPrincipalNonInterroge`) : c'est une incohérence du gel.
 * Or le tirage pouvait garder une question d'attribution de mesure fictive dont l'item F principal
 * est celui d'un candidat retiré (la Q-ATT ne nomme personne, `concerneLeRun` l'examine donc) ;
 * l'incohérence n'apparaissait qu'à la notation et arrêtait toute la notation du run.
 *
 * Décision (option recommandée, retenue) : refus nommé au tirage, avant tout usage de la graine,
 * comme `FormulationAuSensChange`. Aucune exclusion silencieuse : la population tirée ne change pas.
 * Un item NON principal d'un non-interrogé reste admis : la notation l'écarte (§7).
 */

import { describe, expect, it } from "vitest";
import { engendrer, identifiantAttribution } from "../../pipeline/questions/engendrement.ts";
import { PrincipalNonInterrogeAuTirage } from "../../pipeline/questions/tirabilite.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { DemandeTirage } from "../../pipeline/questions/tirage.ts";
import type { CandidatAuGel, Item } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemF, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2026-12-01T06:00:00+01:00";
const NOMS = ["demo-alpha", "demo-beta"];

const REELLE = mesure({ cle: "pni-reelle", theme: "sante", libelle: "tarif social de l'eau" });
const FICTIVE = mesure({ cle: "pni-fictive", theme: "retraites", libelle: "prime aux marcheurs", fictive: true });
const MESURES = [REELLE, FICTIVE];
const Q_ATT_FICTIVE = identifiantAttribution(FICTIVE.id, "Q-ATT");
const Q_ATT_REELLE = identifiantAttribution(REELLE.id, "Q-ATT");

const P_ALPHA = itemP({ cle: "pni-p-alpha", candidat_id: "demo-alpha", mesure: REELLE, position: "pour" });
const P_BETA = itemP({ cle: "pni-p-beta", candidat_id: "demo-beta", mesure: REELLE, position: "pour" });

function fictifDe(candidat_id: string): Item {
  return itemF({ cle: `pni-f-${candidat_id}`, candidat_id, mesure: FICTIVE });
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

describe("V3-1 : une Q-ATT dont l'item principal est d'un candidat non interrogé est refusée au tirage", () => {
  it("Q-ATT de mesure fictive, item F principal d'un candidat retiré ⇒ PrincipalNonInterrogeAuTirage, nommant la question et le candidat", () => {
    const fictif = fictifDe("demo-beta");
    const items = [P_ALPHA, P_BETA, fictif];
    const essai = (): unknown => tirer(demande(items, [ALPHA_INTERROGE, BETA_RETIRE]));
    expect(essai).toThrow(PrincipalNonInterrogeAuTirage);
    expect(essai).toThrow(new RegExp(`${Q_ATT_FICTIVE}.*${fictif.id}.*demo-beta`));
  });

  it("le refus porte la question, l'item et le candidat en champs", () => {
    const fictif = fictifDe("demo-beta");
    let levee: unknown;
    try {
      tirer(demande([P_ALPHA, P_BETA, fictif], [ALPHA_INTERROGE, BETA_RETIRE]));
    } catch (erreur) {
      levee = erreur;
    }
    expect(levee).toBeInstanceOf(PrincipalNonInterrogeAuTirage);
    const refus = levee as PrincipalNonInterrogeAuTirage;
    expect({ question_id: refus.question_id, item_id: refus.item_id, candidat_id: refus.candidat_id }).toEqual({
      question_id: Q_ATT_FICTIVE,
      item_id: fictif.id,
      candidat_id: "demo-beta",
    });
  });

  it("le refus précède tout usage de la graine : aucune graine ne le fait passer", () => {
    const items = [P_ALPHA, P_BETA, fictifDe("demo-beta")];
    for (const valeur of [0, 1, 20261201]) {
      expect(() => tirer(demande(items, [ALPHA_INTERROGE, BETA_RETIRE], valeur))).toThrow(PrincipalNonInterrogeAuTirage);
    }
  });

  it("la même Q-ATT, item F principal d'un candidat interrogé ⇒ tirée, sans refus", () => {
    const resultat = tirer(demande([P_ALPHA, P_BETA, fictifDe("demo-beta")], [ALPHA_INTERROGE, BETA_INTERROGE]));
    expect(tirees(resultat)).toContain(Q_ATT_FICTIVE);
  });

  it("une Q-ATT dont seul un item non principal est d'un non-interrogé ⇒ tirée, inchangée (la notation l'écartera)", () => {
    const items = [P_ALPHA, P_BETA, fictifDe("demo-alpha")];
    const avecBetaRetire = tirer(demande(items, [ALPHA_INTERROGE, BETA_RETIRE]));
    expect(tirees(avecBetaRetire)).toContain(Q_ATT_REELLE);
    const entree = avecBetaRetire.tirage.entrees.find((une) => une.question_id === Q_ATT_REELLE);
    expect(entree?.items_au_gel.map((item) => item.reference.item_id)).toContain(P_BETA.id);
    // Témoin : la question est engendrée avec l'item du retiré en liste, et sans principal.
    const question = demande(items, [ALPHA_INTERROGE, BETA_RETIRE]).questions.find((une) => une.id === Q_ATT_REELLE);
    expect(question?.items.find((une) => une.reference.item_id === P_BETA.id)?.role).toBe("attendu_dans_liste");
    expect(question?.items.some((une) => une.role === "principal")).toBe(false);
  });
});
