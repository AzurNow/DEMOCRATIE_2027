/**
 * Les deux critères du §12 qui portent sur les juges retenus : le kappa juges-humains de
 * l'échantillon humain et le test contrefactuel. Fonctions pures.
 *
 * Aucun juge retenu (tous retirés) : les deux critères sont rouges. Une absence de mesure n'est
 * jamais un succès, dans l'esprit de D24 (2) ; choix confirmé par l'auteur (D25 (4)). En pratique,
 * deux juges retirés rendent le run invalide (D16 (3)), que `pnpm go-no-go` refuse avant d'en arriver là.
 */

import { depasseSeuilRetrait, SEUIL_RETRAIT } from "../notation/contrefactuel.ts";
import type { ChangementsContrefactuel, JugeDuRun } from "../notation/types.ts";
import { SEUIL_KAPPA_ECHANTILLON, type KappaDeJuge } from "./kappa-echantillon.ts";
import { AUCUN_JUGE_RETENU, type Critere } from "./types.ts";

const SEUIL_KAPPA_PUBLIE = SEUIL_KAPPA_ECHANTILLON.numerateur / SEUIL_KAPPA_ECHANTILLON.denominateur;
const SEUIL_CONTREFACTUEL_PUBLIE = SEUIL_RETRAIT.numerateur / SEUIL_RETRAIT.denominateur;

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
