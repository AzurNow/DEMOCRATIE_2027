/**
 * Constat n° 59 de la conformité du 2026-09-24 (§5.28) : « Le quota de questions par strate n'est
 * pas fixé ici : il est déclaré dans `config/perimetre.yaml` avec le reste du périmètre du run et
 * publié avec lui. » L'en-tête de `tirage.ts` affirme que le fichier de tirage suffit pour rejouer ;
 * il n'y inscrivait pourtant ni le quota par strate ni le quota d'attribution par thème.
 *
 * `tirer` recopie désormais ses deux quotas dans `tirage.parametres`, que `tirage.schema.json`
 * exige. Le rejeu se fait avec les seuls champs du fichier publié (graine et quotas).
 */

import { describe, expect, it } from "vitest";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { DemandeTirage, ParametresTirage } from "../../pipeline/questions/tirage.ts";
import { tiragePrecedentDe } from "../../pipeline/questions/entrees-tirage.ts";
import type { Tirage } from "../../pipeline/questions/types.ts";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { candidat, graine, jeu, run } from "./fabriques.ts";

const JEU = jeu({
  candidats: ["demo-alpha", "demo-beta"],
  themes: ["fiscalite_pouvoir_achat", "retraites"],
  mesures_par_theme: 4,
  themes_manquants: { "demo-beta": ["retraites"] },
});
const RUN = run([candidat({ candidat_id: "demo-alpha" }), candidat({ candidat_id: "demo-beta" })]);
const PRECEDENT = tiragePrecedentDe(
  "44CX8VSV75Q6ZAHDEJ8VA81YQE",
  JEU.questions.filter((_, rang) => rang % 3 === 0),
);

/** Deux quotas différents : une inversion des deux champs se verrait. */
const QUOTAS: ParametresTirage = { questions_par_strate: 2, questions_attribution_par_theme: 3 };

function demande(parametres: ParametresTirage, graine_tirage = graine()): DemandeTirage {
  return {
    questions: JEU.questions,
    items: JEU.items,
    mesures: JEU.mesures,
    run: RUN,
    graine: graine_tirage,
    parametres,
    tirage_precedent: PRECEDENT,
  };
}

/** Rejoue un tirage à partir du seul fichier publié : sa graine et ses quotas, rien d'autre. */
function rejouer(publie: Tirage): Tirage {
  const relu = JSON.parse(JSON.stringify(publie)) as Tirage;
  return tirer(demande(relu.parametres, relu.graine_tirage)).tirage;
}

describe("n° 59 : les quotas du tirage sont inscrits dans le tirage publié", () => {
  it("un tirage produit porte ses deux quotas, chacun à sa place", () => {
    const { tirage } = tirer(demande(QUOTAS));
    expect(tirage.parametres).toEqual({ questions_par_strate: 2, questions_attribution_par_theme: 3 });
  });

  it("le tirage produit est conforme à tirage.schema.json, quotas compris", () => {
    const { tirage } = tirer(demande(QUOTAS));
    expect(erreurDeSchema("tirage", tirage, "tirage produit")).toBeNull();
  });

  it("le rejeu depuis le seul fichier de tirage redonne le même tirage", () => {
    const { tirage } = tirer(demande(QUOTAS));
    expect(rejouer(tirage)).toEqual(tirage);
  });

  it("des quotas différents donnent un autre tirage : le rejeu dépend bien d'eux", () => {
    const { tirage } = tirer(demande(QUOTAS));
    const autre = tirer(demande({ questions_par_strate: 1, questions_attribution_par_theme: 1 })).tirage;
    expect(autre.entrees.map((entree) => entree.question_id)).not.toEqual(
      tirage.entrees.map((entree) => entree.question_id),
    );
  });
});
