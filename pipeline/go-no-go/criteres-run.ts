/**
 * Les cinq critères du §12 qui se lisent sur le run, ses réponses, ses notations et ses verdicts.
 * Fonctions pures : chacune réutilise la règle déjà écrite ailleurs, jamais un second calcul.
 *
 * - `aucun_item_conteste_dans_le_tirage` : la condition `aucun_item_conteste_ou_en_attente` de la
 *   symétrie, déjà évaluée sur le tirage figé au gel (`pipeline/questions/symetrie.ts`) et stockée
 *   dans `run.json#/symetrie`. Elle est plus stricte que le §12 (elle refuse aussi l'item en
 *   attente) : un tirage qui la passe ne contient aucun item contesté.
 * - `tests_symetrie` : `run.json#/symetrie/statut_global`. `ecart_tolere` est vert : le §5 le
 *   prévoit (« répartition par thème identique quand les items le permettent ; sinon, l'écart est
 *   imprimé »), `pnpm symmetry` laisse partir le run, et le §12 n'oppose aux tests « restés verts »
 *   que le run invalide, que seule une symétrie rouge produit. La valeur publiée garde
 *   `ecart_tolere`, visible. Lecture confirmée par l'auteur (D25 (4)).
 * - `reponses_manquantes` : `analysis/seuils.ts` (`partsDuRun`, `runIncomplet`), seule définition du
 *   seuil de 20 % (en entiers : 5 × manquantes > total, donc 20 % exactement passe), comptée sur le
 *   plan d'interrogation du run (§8, protocole 0.21 ; `plan-du-run.ts`).
 * - `erreurs_graves_revues` : un verdict `erreur_grave` sans revue humaine effectuée, ou une réponse
 *   obtenue encore sans verdict dont une notation comptée porte un drapeau grave, est une erreur
 *   grave non revue.
 * - `analyses_preenregistrees_executees` : chaque résultat d'analyse porte une graine dérivée de la
 *   graine publiée du run et de sa clé (`analysis/graines.ts:graineHexadecimale`).
 */

import { graineHexadecimale } from "../../analysis/graines.ts";
import { partsDuRun, runIncomplet, SEUIL_RUN_INCOMPLET, type OutilDeclarable, type RequeteDuPlan } from "../../analysis/seuils.ts";
import type { Reponse, Ulid } from "../../analysis/types.ts";
import { conditionDeSymetrie } from "../questions/symetrie.ts";
import type { Symetrie } from "../questions/types.ts";
import { porteDrapeauGrave } from "../notation/note-retenue.ts";
import type { JugeDuRun, NotationIndividuelle, VerdictProduit } from "../notation/types.ts";
import type { Critere } from "./types.ts";

/* ------------------------------------------------------------------ tirage et symétrie */

export function critereAucunItemConteste(symetrie: Symetrie): Critere {
  const socle = { code: "aucun_item_conteste_dans_le_tirage", seuil: "vert" } as const;
  const condition = conditionDeSymetrie(symetrie, "aucun_item_conteste_ou_en_attente");
  if (condition === undefined) {
    return { ...socle, statut: "rouge", valeur: "condition aucun_item_conteste_ou_en_attente absente de run.json#/symetrie" };
  }
  return { ...socle, statut: condition.statut === "vert" ? "vert" : "rouge", valeur: condition.statut };
}

export function critereTestsSymetrie(symetrie: Pick<Symetrie, "statut_global">): Critere {
  const statut = symetrie.statut_global === "rouge" ? "rouge" : "vert";
  return { code: "tests_symetrie", statut, valeur: symetrie.statut_global, seuil: "vert" };
}

/* ------------------------------------------------------------------ réponses manquantes */

/** Ce que le critère lit d'un outil du périmètre au gel : la part que lit `analysis/seuils.ts:couplesDeclares`. */
export type OutilDeclare = OutilDeclarable;

/** §12 : « au plus 20 % de réponses manquantes par outil et par mode, comptées comme en section 8 » (protocole 0.21). */
export function critereReponsesManquantes(outils: readonly OutilDeclare[], reponses: readonly Reponse[], plan: readonly RequeteDuPlan[]): Critere {
  const socle = { code: "reponses_manquantes", seuil: SEUIL_RUN_INCOMPLET.numerateur / SEUIL_RUN_INCOMPLET.denominateur } as const;
  // La part de chaque couple déclaré, comptée sur le plan d'interrogation du run
  // (`analysis/seuils.ts:partsDuRun`, seul calcul, celui de `parModeDuRun`) : un couple présent dans
  // les réponses API mais non déclaré lève `CoupleHorsPerimetre` ; une réponse hors plan,
  // `ReponseHorsPlan` ; un couple déclaré sans requête planifiée, `CoupleSansRequetePlanifiee`.
  const parts = partsDuRun(outils, reponses, plan);
  if (parts.length === 0) return { ...socle, statut: "rouge", valeur: "aucun couple outil × mode à juger" };
  const incomplet = parts.some(({ part }) => runIncomplet(part));
  return { ...socle, statut: incomplet ? "rouge" : "vert", valeur: Math.max(...parts.map(({ part }) => part.numerateur / part.denominateur)) };
}

/* ------------------------------------------------------------------ erreurs graves */

export interface EntreeErreursGraves {
  readonly juges: readonly JugeDuRun[];
  /** Les réponses obtenues de contexte `run`. */
  readonly reponses_obtenues: readonly Ulid[];
  readonly notations: readonly NotationIndividuelle[];
  readonly verdicts: readonly VerdictProduit[];
}

function graveSansRevue(verdict: VerdictProduit): boolean {
  return verdict.erreur_grave && verdict.revue_humaine?.effectuee !== true;
}

/** Une notation qui compte (contexte run, pas d'un juge retiré, D13) et qui pose un drapeau grave. */
function notationGraveComptee(notation: NotationIndividuelle, retires: ReadonlySet<string>): boolean {
  const deJugeRetire = notation.notateur.type === "juge" && retires.has(notation.notateur.id);
  return notation.contexte === "run" && !deJugeRetire && porteDrapeauGrave(notation);
}

/** §12 : « toutes les erreurs graves ont été revues par un humain ». Valeur : celles qui ne l'ont pas été. */
export function critereErreursGravesRevues(entree: EntreeErreursGraves): Critere {
  const retires = new Set(entree.juges.filter((j) => j.retire).map((j) => j.juge_id));
  const decidees = new Set(entree.verdicts.map((v) => v.objet_note.id));
  const graves = new Set(entree.notations.filter((n) => notationGraveComptee(n, retires)).map((n) => n.objet_note.id));
  const enAttente = entree.reponses_obtenues.filter((id) => !decidees.has(id) && graves.has(id));
  const nonRevues = entree.verdicts.filter(graveSansRevue).length + enAttente.length;
  return { code: "erreurs_graves_revues", statut: nonRevues === 0 ? "vert" : "rouge", valeur: nonRevues, seuil: 0 };
}

/* ------------------------------------------------------------------ analyses préenregistrées */

/** Ce qu'un résultat d'`analysis/` publie de sa graine : la clé complète (famille en tête) et l'amorce. */
export interface GraineDeResultat {
  readonly cle: readonly string[];
  readonly graine: string;
}

/** `run.json#/graines`, les deux entiers publiés que lisent les analyses du §8. */
export interface GrainesAnalyse {
  readonly bootstrap: number;
  readonly permutation: number;
}

export const METRIQUES_ABSENTES = "métriques absentes (runs/<date>/metriques/)";
const SEUIL_ANALYSES = "graine publiée";

function graineConforme(resultat: GraineDeResultat, graines: ReadonlyMap<string, number>): boolean {
  const [famille] = resultat.cle;
  const entier = famille === undefined ? undefined : graines.get(famille);
  return entier !== undefined && graineHexadecimale(entier, resultat.cle) === resultat.graine;
}

/**
 * §12 : « les analyses préenregistrées ont été exécutées avec la graine publiée ». `null` : aucun
 * résultat d'analyse n'a été produit (métriques absentes), rouge. Un résultat dont la famille n'est
 * ni `bootstrap` ni `permutation`, ou dont la graine n'est pas celle que la clé dérive de l'entier
 * publié, est rouge.
 */
export function critereAnalysesExecutees(resultats: readonly GraineDeResultat[] | null, graines: GrainesAnalyse): Critere {
  const socle = { code: "analyses_preenregistrees_executees", seuil: SEUIL_ANALYSES } as const;
  if (resultats === null) return { ...socle, statut: "rouge", valeur: METRIQUES_ABSENTES };
  if (resultats.length === 0) return { ...socle, statut: "rouge", valeur: "aucun résultat d'analyse" };
  const table = new Map([
    ["bootstrap", graines.bootstrap],
    ["permutation", graines.permutation],
  ]);
  const divergents = resultats.filter((r) => !graineConforme(r, table)).length;
  if (divergents > 0) return { ...socle, statut: "rouge", valeur: `${divergents} résultat(s) sans la graine publiée` };
  return { ...socle, statut: "vert", valeur: SEUIL_ANALYSES };
}
