/**
 * Garde de l'égalité des notations (`docs/DETTE.md`, 2026-10-05, point 1).
 *
 * `analysis/note-lue.ts:notationsConcordent` définit l'accord des humains, l'accord des juges et
 * « la note change » du test contrefactuel (D14 (3)). Elle est censée distinguer exactement ce que
 * lisent les métriques primaires du §8. Ce test le vérifie par le chemin public, sans rien supposer
 * de ce que lit `metriques.ts` : une notation témoin, et pour chaque champ qui passe dans un verdict
 * une variante qui ne diffère que sur ce champ ; chacune est portée en verdict
 * (`note-retenue.ts:noteDe`, puis `construireVerdict`), assemblée (`filtre.ts:assembler`) dans
 * quatre contextes de question (item P neutre ; item A neutre ; item F et item O en formulation
 * orientée à prémisse fausse), qui ouvrent chacun le dénominateur d'une métrique ; les métriques
 * primaires (`metriquesPrimaires`) y sont calculées. Un contexte où une note n'est pas admise
 * (`metriques.ts` lève, par exemple sur un drapeau fabrication porté par un item P) n'est pas
 * comparé. « Les métriques diffèrent » : dans au moins un contexte admis des deux côtés.
 *
 * Exigence, dans le sens qui fausserait la mesure en silence : si les métriques diffèrent, les
 * notations ne concordent pas. Aucune exception.
 *
 * Dans l'autre sens (les notations ne concordent pas, donc les métriques diffèrent), le test a
 * révélé le 2026-10-06 des écarts : l'égalité est plus stricte que les métriques primaires. La
 * décision D17 de l'auteur (2026-10-06) les assume : l'égalité porte sur tous les drapeaux, et la 0.16
 * l'écrit ; la fraîcheur sans le drapeau obsolescence, autre écart, est refusée par les schémas de
 * notation et de verdict, donc ne figure plus parmi les cas. Les écarts assumés sont listés
 * nommément dans `ECARTS_ASSUMES`, et le test exige que la liste reste exacte : un écart qui
 * disparaît, ou un nouveau, le fait échouer.
 */

import { describe, expect, it } from "vitest";
import { assembler } from "../../analysis/filtre.ts";
import { metriquesPrimaires, type TauxPrimaires } from "../../analysis/metriques.ts";
import { notationsConcordent } from "../../analysis/note-lue.ts";
import { DRAPEAUX, type TypeItem } from "../../analysis/types.ts";
import { construireVerdict, noteDe } from "../../pipeline/notation/note-retenue.ts";
import type { LienNotation, NotationIndividuelle } from "../../analysis/types-notation.ts";
import { lien, notationJuge } from "../notation/fabriques.ts";
import { entreeTirage, item, question, reponse, run, ulid } from "./fabriques.ts";

type Surcharges = Parameters<typeof notationJuge>[1];

/** Inexacte, sans drapeau, citant sans lien : chaque champ peut en différer seul. */
const TEMOIN: Surcharges = {
  categorie: "inexacte",
  drapeaux: [],
  motif_inexactitude: "position_inventee",
  sourcage: { cite: true, liens: [] },
};

/** Témoins secondaires : un champ ne se lit qu'en présence d'un autre (fraîcheur, soutien d'un lien). */
const TEMOIN_OBSOLESCENCE: Surcharges = { ...TEMOIN, drapeaux: ["obsolescence"], obsolescence_fraiche: false };
const TEMOIN_LIEN: Surcharges = { ...TEMOIN, sourcage: { cite: true, liens: [lien("existe", "soutient")] } };

function avecLiens(liens: readonly LienNotation[]): Surcharges {
  return { ...TEMOIN, sourcage: { cite: true, liens } };
}

interface Cas {
  readonly nom: string;
  readonly temoin: Surcharges;
  readonly variante: Surcharges;
}

const CAS: readonly Cas[] = [
  { nom: "categorie exacte", temoin: TEMOIN, variante: { ...TEMOIN, categorie: "exacte" } },
  { nom: "categorie non_reponse", temoin: TEMOIN, variante: { ...TEMOIN, categorie: "non_reponse" } },
  { nom: "categorie indeterminee", temoin: TEMOIN, variante: { ...TEMOIN, categorie: "indeterminee" } },
  ...DRAPEAUX.map((drapeau) => ({ nom: `drapeau ${drapeau}`, temoin: TEMOIN, variante: { ...TEMOIN, drapeaux: [drapeau] } })),
  { nom: "motif_inexactitude", temoin: TEMOIN, variante: { ...TEMOIN, motif_inexactitude: "autre" } },
  { nom: "obsolescence_fraiche avec drapeau", temoin: TEMOIN_OBSOLESCENCE, variante: { ...TEMOIN_OBSOLESCENCE, obsolescence_fraiche: true } },
  { nom: "sourcage.cite", temoin: TEMOIN, variante: { ...TEMOIN, sourcage: { cite: false, liens: [] } } },
  { nom: "lien existant et soutenant", temoin: TEMOIN, variante: avecLiens([lien("existe", "soutient")]) },
  { nom: "lien existant non soutenant", temoin: TEMOIN, variante: avecLiens([lien("existe", "ne_soutient_pas")]) },
  { nom: "lien mort soutenant", temoin: TEMOIN, variante: avecLiens([lien("mort", "soutient")]) },
  { nom: "lien inaccessible soutenant", temoin: TEMOIN, variante: avecLiens([lien("inaccessible", "soutient")]) },
  { nom: "soutien du lien existant", temoin: TEMOIN_LIEN, variante: avecLiens([lien("existe", "ne_soutient_pas")]) },
  { nom: "existence du lien soutenant", temoin: TEMOIN_LIEN, variante: avecLiens([lien("mort", "soutient")]) },
];

/**
 * Assumés par la décision D17 (2026-10-06) : `notationsConcordent` les distingue, aucune métrique
 * primaire ne les lit. Les drapeaux « mauvaise attribution » et « déformation » ne sont lus que par
 * la répartition des drapeaux, métrique secondaire du §8 ; « mauvaise attribution » est aussi un
 * drapeau grave, qui impose la revue humaine (§7).
 */
const ECARTS_ASSUMES: readonly string[] = ["drapeau mauvaise_attribution", "drapeau deformation"];

interface Contexte {
  readonly nom: string;
  readonly type: TypeItem;
  readonly formulation: "neutre" | "orientee";
}

const CONTEXTES: readonly Contexte[] = [
  { nom: "item P, neutre", type: "P", formulation: "neutre" },
  { nom: "item A, neutre", type: "A", formulation: "neutre" },
  { nom: "item F, orientée à prémisse fausse", type: "F", formulation: "orientee" },
  { nom: "item O, orientée à prémisse fausse", type: "O", formulation: "orientee" },
];

const REPONSE = ulid("reponse");

function notation(surcharges: Surcharges): NotationIndividuelle {
  return notationJuge("j1", { run_id: ulid("run"), objet_note: { type: "reponse", id: REPONSE }, ...surcharges });
}

/** Les métriques primaires d'une seule réponse notée, ou `null` si la note n'est pas admise dans ce contexte. */
function metriques(n: NotationIndividuelle, contexte: Contexte): TauxPrimaires | null {
  const verdict = construireVerdict(
    { verdict_id: ulid("verdict"), run_id: ulid("run"), objet_note: { type: "reponse", id: REPONSE }, dans_echantillon_humain: false, date: n.date },
    { note: noteDe(n), mode: "accord_juges", sources: [n], humains: [], desaccord: false },
  );
  const unites = assembler({
    run: run(),
    entrees_tirage: [entreeTirage({ premisse_fausse: contexte.formulation === "orientee" })],
    questions: [question()],
    items: [item({ type: contexte.type })],
    reponses: [reponse({ formulation_id: ulid(`formulation-${contexte.formulation}`) })],
    verdicts: [verdict],
  });
  try {
    const { outil_id: _o, mode: _m, ...taux } = metriquesPrimaires(unites, "outil-alpha", "web_desactivee");
    return taux;
  } catch (erreur) {
    // Seule erreur admise : un drapeau que `metriques.ts` refuse dans ce contexte (§5, §7).
    if (erreur instanceof Error && /réserve/.test(erreur.message)) return null;
    throw erreur;
  }
}

/** Vrai si, dans au moins un contexte où les deux notes sont admises, une métrique diffère. */
function metriquesDifferent(a: NotationIndividuelle, b: NotationIndividuelle): boolean {
  let compares = 0;
  let different = false;
  for (const contexte of CONTEXTES) {
    const ma = metriques(a, contexte);
    const mb = metriques(b, contexte);
    if (ma === null || mb === null) continue;
    compares += 1;
    if (JSON.stringify(ma) !== JSON.stringify(mb)) different = true;
  }
  if (compares === 0) throw new Error("aucun contexte n'admet les deux notes : le cas ne prouve rien.");
  return different;
}

describe("notationsConcordent distingue ce que lisent les métriques primaires", () => {
  for (const cas of CAS) {
    it(`${cas.nom} : si les métriques diffèrent, les notations ne concordent pas`, () => {
      const a = notation(cas.temoin);
      const b = notation(cas.variante);
      if (metriquesDifferent(a, b)) expect(notationsConcordent(a, b)).toBe(false);
      // Le témoin concorde avec lui-même : l'égalité est réflexive.
      expect(notationsConcordent(a, notation(cas.temoin))).toBe(true);
    });
  }

  it("dans l'autre sens, seuls les écarts assumés par D17 font exception, et ils sont tous encore là", () => {
    const ecarts = CAS.filter((cas) => {
      const a = notation(cas.temoin);
      const b = notation(cas.variante);
      return !notationsConcordent(a, b) && !metriquesDifferent(a, b);
    }).map((cas) => cas.nom);
    expect(ecarts).toEqual(ECARTS_ASSUMES);
  });

  it("le jeu de cas couvre chaque champ qu'un verdict reprend d'une notation", () => {
    const noms = CAS.map((cas) => cas.nom).join(" | ");
    for (const champ of ["categorie", "motif_inexactitude", "obsolescence_fraiche", "sourcage.cite", "existant", "soutenant", "soutien", "existence"]) {
      expect(noms).toContain(champ);
    }
    for (const drapeau of DRAPEAUX) expect(noms).toContain(`drapeau ${drapeau}`);
  });
});
