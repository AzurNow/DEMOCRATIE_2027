/**
 * D68, protocole 0.27 (§3, « Entre les deux tours ») : le tirage et les garanties de symétrie du §5
 * sur un périmètre de deux qualifiés et un éliminé. « Les candidats éliminés au premier tour restent
 * dans le jeu de données, et aucune question ne les nomme plus, comme un candidat retiré. » « Les
 * garanties de symétrie (section 5) s'appliquent telles quelles entre les deux candidats. »
 *
 * Aucun code propre au régime : un éliminé est un candidat retiré, non interrogé (chargé par
 * `charger-perimetre.ts`, testé dans `charger-perimetre.test.ts`). Ces tests prouvent que le
 * tirage et la symétrie, inchangés, font ce que le §3 dit avec deux candidats.
 */

import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { tirer } from "../../pipeline/questions/tirage.ts";
import type { Item, Mesure, Theme } from "../../pipeline/questions/types.ts";
import { candidat, completer, graine, itemA, itemF, itemP, mesure, perimetre, run } from "./fabriques.ts";

const GEL = "2027-04-20T06:00:00+02:00";
const FINALISTES = ["demo-alpha", "demo-beta"];
const ELIMINE = "demo-gamma";
const TOUS = [...FINALISTES, ELIMINE];
const THEMES_DU_JEU: readonly Theme[] = ["fiscalite_pouvoir_achat", "retraites"];
const MESURES_PAR_THEME = 3;

const MESURES_P: readonly Mesure[] = THEMES_DU_JEU.flatMap((theme) =>
  Array.from({ length: MESURES_PAR_THEME }, (_, rang) => mesure({ cle: `e2t-${theme}-${rang}`, theme })),
);
const MESURES_A: readonly Mesure[] = THEMES_DU_JEU.map((theme) => mesure({ cle: `e2t-abs-${theme}`, theme }));
/** Une mesure fictive par candidat et par thème : l'item F principal de sa Q-ATT (§5, protocole 0.9). */
const MESURES_F: Readonly<Record<string, readonly Mesure[]>> = Object.fromEntries(
  TOUS.map((candidat_id) => [
    candidat_id,
    THEMES_DU_JEU.map((theme) => mesure({ cle: `e2t-fic-${candidat_id}-${theme}`, theme, fictive: true })),
  ]),
);
const MESURES: readonly Mesure[] = [...MESURES_P, ...MESURES_A, ...Object.values(MESURES_F).flat()];

/** Le jeu de données garde l'éliminé : mêmes items que les finalistes. */
const ITEMS: readonly Item[] = TOUS.flatMap((candidat_id) => [
  ...MESURES_P.map((referent) => itemP({ cle: `e2t-${candidat_id}-${referent.id}`, candidat_id, mesure: referent })),
  ...MESURES_A.map((referent) => itemA({ cle: `e2t-a-${candidat_id}-${referent.id}`, candidat_id, mesure: referent })),
  ...(MESURES_F[candidat_id] ?? []).map((referent) => itemF({ cle: `e2t-f-${candidat_id}-${referent.id}`, candidat_id, mesure: referent })),
]);

const QUESTIONS = engendrer(ITEMS, MESURES, perimetre(TOUS)).map(completer);

const RUN = run(
  [
    ...FINALISTES.map((candidat_id) => candidat({ candidat_id })),
    candidat({ candidat_id: ELIMINE, statut_au_gel: "retire", interroge: false }),
  ],
  GEL,
);

function tirage() {
  return tirer({
    questions: QUESTIONS,
    items: ITEMS,
    mesures: MESURES,
    run: RUN,
    graine: graine(20270420),
    parametres: { questions_par_strate: 1, questions_attribution_par_theme: 1 },
  });
}

describe("D68 : un éliminé au premier tour", () => {
  it("reste dans le jeu de données : ses items et les questions engendrées sur eux existent", () => {
    expect(ITEMS.some((item) => item.candidat_id === ELIMINE)).toBe(true);
    expect(QUESTIONS.some((question) => question.candidat_id === ELIMINE)).toBe(true);
  });

  it("n'est nommé par aucune question tirée, et le rapport le dit non interrogé", () => {
    const resultat = tirage();
    expect(resultat.tirage.entrees.filter((entree) => entree.candidat_id === ELIMINE)).toEqual([]);
    expect(resultat.rapport.candidats_non_interroges).toEqual([ELIMINE]);
    for (const finaliste of FINALISTES) {
      expect(resultat.tirage.entrees.some((entree) => entree.candidat_id === finaliste)).toBe(true);
    }
  });
});

describe("D68 : garanties de symétrie sur un tirage à deux candidats", () => {
  it("passent telles quelles entre les deux finalistes : sept conditions vertes", () => {
    const resultat = tirage();
    const symetrie = verifierSymetrie(resultat.tirage, QUESTIONS, ITEMS, MESURES, RUN);
    expect(symetrie.conditions.map((condition) => [condition.code, condition.statut])).toEqual(
      symetrie.conditions.map((condition) => [condition.code, "vert"]),
    );
    expect(symetrie.statut_global).toBe("vert");
  });

  it("les deux finalistes reçoivent le même nombre de questions, non nul, par gabarit", () => {
    const entrees = tirage().tirage.entrees;
    const gabarits = (candidat_id: string) =>
      entrees.filter((entree) => entree.candidat_id === candidat_id).map((entree) => entree.gabarit).sort();
    expect(gabarits("demo-alpha").length).toBeGreaterThan(0);
    expect(gabarits("demo-beta")).toEqual(gabarits("demo-alpha"));
  });

  it("un tirage qui retire une question à un finaliste passe au rouge : la garantie mord à deux candidats", () => {
    const resultat = tirage();
    const premiere = resultat.tirage.entrees.findIndex((entree) => entree.candidat_id === "demo-beta");
    expect(premiere).toBeGreaterThanOrEqual(0);
    const ampute = { ...resultat.tirage, entrees: resultat.tirage.entrees.filter((_, rang) => rang !== premiere) };
    const symetrie = verifierSymetrie(ampute, QUESTIONS, ITEMS, MESURES, RUN);
    expect(symetrie.conditions.find((c) => c.code === "nombre_questions_par_candidat")?.statut).toBe("rouge");
    expect(symetrie.statut_global).toBe("rouge");
  });
});
