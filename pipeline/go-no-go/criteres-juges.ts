/**
 * Les deux critères du §12 qui portent sur les juges retenus : le kappa juges-humains de
 * l'échantillon humain et le test contrefactuel ; et le seuil de publication du kappa de la paire de
 * juges sur le jeu d'or (§7). Fonctions pures.
 *
 * Aucun juge retenu (tous retirés) : les deux critères sont rouges. Une absence de mesure n'est
 * jamais un succès, dans l'esprit de D24 (2) ; choix confirmé par l'auteur (D25 (4)). En pratique,
 * deux juges retirés rendent le run invalide (D16 (3)), que `pnpm go-no-go` refuse avant d'en arriver là.
 */

import type { MotifKappaIndefini } from "../../analysis/kappa-categorie-primaire.ts";
import { SEUIL_KAPPA_PAIRE_JEU_OR, SEUIL_RETRAIT } from "../../analysis/parametres-protocole.ts";
import { depasseSeuilRetrait } from "../notation/contrefactuel.ts";
import type { ChangementsContrefactuel, JugeDuRun } from "../../analysis/types-notation.ts";
import { SEUIL_KAPPA_ECHANTILLON, type KappaDeJuge } from "./kappa-echantillon.ts";
import { AUCUN_JUGE_RETENU, type Critere } from "./types.ts";

const SEUIL_KAPPA_PUBLIE = SEUIL_KAPPA_ECHANTILLON.numerateur / SEUIL_KAPPA_ECHANTILLON.denominateur;
const SEUIL_CONTREFACTUEL_PUBLIE = SEUIL_RETRAIT.numerateur / SEUIL_RETRAIT.denominateur;
const SEUIL_KAPPA_PAIRE_PUBLIE = SEUIL_KAPPA_PAIRE_JEU_OR.numerateur / SEUIL_KAPPA_PAIRE_JEU_OR.denominateur;

/** Valeur publiée du critère de la paire quand `run.json` ne porte ni le kappa de la paire ni son motif. */
export const KAPPA_PAIRE_NON_INSCRIT = "kappa de la paire non inscrit (pnpm kappa:jeu-or)";

/**
 * §12 : « le kappa juges-humains de l'échantillon de 10 % est ≥ 0,75 » — pour CHAQUE juge retenu
 * (D24 (1)). Valeur publiée : le plus petit kappa, ou, dès qu'un kappa est indéfini, une chaîne qui
 * nomme le juge et le motif (D24 (2) : rouge).
 */
export function critereKappaJugesHumains(kappas: readonly KappaDeJuge[]): Critere {
  const socle = { code: "kappa_juges_humains", seuil: SEUIL_KAPPA_PUBLIE } as const;
  if (kappas.length === 0) return { ...socle, statut: "rouge", valeur: AUCUN_JUGE_RETENU };
  const indefini = kappas.find((k) => k.kappa === null);
  if (indefini !== undefined) {
    return { ...socle, statut: "rouge", valeur: `kappa indéfini pour ${indefini.juge_id} : ${String(indefini.motif_indefini)}` };
  }
  const valeurs = kappas.flatMap((k) => (k.kappa === null ? [] : [k.kappa]));
  return { ...socle, statut: kappas.every((k) => k.atteint_seuil) ? "vert" : "rouge", valeur: Math.min(...valeurs) };
}

/** §7 : « au-delà de 3 % », comme `controle-croise.ts` : `depasseSeuilRetrait` de `contrefactuel.ts`. */
function depasse(changements: ChangementsContrefactuel): boolean {
  return depasseSeuilRetrait(changements.numerateur, changements.denominateur);
}

/**
 * §12 : « le test contrefactuel est ≤ 3 % pour chaque juge retenu », lu sur
 * `juges[].changements_contrefactuel`. Effectifs absents pour un juge retenu (test non publié, ou
 * indéfini) : rouge, avec les juges nommés. Valeur publiée : le plus grand taux des juges retenus.
 */
export function critereTestContrefactuel(juges: readonly JugeDuRun[]): Critere {
  const socle = { code: "test_contrefactuel", seuil: SEUIL_CONTREFACTUEL_PUBLIE } as const;
  const retenus = juges.filter((juge) => !juge.retire);
  if (retenus.length === 0) return { ...socle, statut: "rouge", valeur: AUCUN_JUGE_RETENU };
  const effectifs = retenus.map((juge) => juge.changements_contrefactuel);
  const sans = retenus.filter((juge) => juge.changements_contrefactuel === undefined).map((juge) => juge.juge_id);
  const publies = effectifs.filter((e): e is ChangementsContrefactuel => e !== undefined);
  if (sans.length > 0) return { ...socle, statut: "rouge", valeur: `effectifs du test contrefactuel absents : ${sans.join(", ")}` };
  const taux = publies.map((e) => e.numerateur / e.denominateur);
  return { ...socle, statut: publies.some(depasse) ? "rouge" : "vert", valeur: Math.max(...taux) };
}

/** Ce que le critère de la paire lit de `run.json` : le kappa de la paire de juges, ou son motif (D93). */
export interface PaireDuJeuOr {
  readonly kappa_paire_juges?: number;
  readonly motif_indefini_kappa_paire_juges?: MotifKappaIndefini;
}

/** `run.json` porte à la fois le kappa de la paire et son motif : le schéma l'interdit, rien n'est choisi. */
export class KappaPaireAmbigu extends Error {
  constructor(kappa: number, motif: MotifKappaIndefini) {
    super(`Kappa de la paire publié à la fois comme valeur (${kappa}) et comme indéfini (${motif}) : aucun des deux n'est retenu (§7).`);
    this.name = "KappaPaireAmbigu";
  }
}

/**
 * §7 : « Seuil de publication : kappa de la paire ≥ 0,75 sur la catégorie primaire ; en dessous, les
 * résultats sont publiés avec la mention « provisoire » ». Lu sur `run.json#/kappa_paire_juges`, tel que
 * `pnpm kappa:jeu-or` l'a inscrit d'après `analysis/kappa-jeu-or.ts` : rien n'est recalculé ici.
 *
 * Le kappa publié est un quotient d'entiers `p/q` arrondi une seule fois (`validation/domaine/kappa.ts:
 * kappaDepuisComptes`). L'arrondi correct est monotone et 3/4 est représentable : `p/q ≥ 3/4` donne un
 * flottant ≥ 0,75, 0,75 exactement compris ; et un `p/q < 3/4` en reste éloigné d'au moins `1/(4q)`,
 * bien plus qu'un écart entre flottants voisins aux effectifs d'un jeu d'or. La comparaison en
 * flottant décide donc comme celle des fractions.
 *
 * Indéfini (motif publié) : rouge, comme le kappa de l'échantillon au §12 (« un kappa indéfini ne
 * satisfait pas ce critère »). Ni kappa ni motif inscrits : rouge, une absence de mesure n'est jamais
 * un succès (D24 (2)).
 */
export function critereKappaPaireJeuOr(paire: PaireDuJeuOr): Critere {
  const socle = { code: "kappa_paire_jeu_or", seuil: SEUIL_KAPPA_PAIRE_PUBLIE } as const;
  const { kappa_paire_juges: kappa, motif_indefini_kappa_paire_juges: motif } = paire;
  if (kappa !== undefined && motif !== undefined) throw new KappaPaireAmbigu(kappa, motif);
  if (kappa !== undefined) return { ...socle, statut: kappa >= SEUIL_KAPPA_PAIRE_PUBLIE ? "vert" : "rouge", valeur: kappa };
  if (motif !== undefined) return { ...socle, statut: "rouge", valeur: `kappa de la paire indéfini : ${motif}` };
  return { ...socle, statut: "rouge", valeur: KAPPA_PAIRE_NON_INSCRIT };
}
