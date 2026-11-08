/**
 * Mentions que l'écran de validation ajoute à ce qu'un annotateur voit, sans jamais bloquer sa
 * décision : texte pur, testé sans DOM (`tests/mentions-lot.test.ts`). Aucune importation de
 * `node:*` : le client navigateur charge ce module.
 */

/** Les trois champs de taille que `diagnostiquerLot` porte (docs/DETTE.md, conformité n° 16). */
export interface TailleDeLot {
  readonly taille_lot: number;
  readonly taille_attendue: number;
  readonly taille_conforme: boolean;
}

/** Vide quand le lot a l'effectif attendu ; sinon dit l'écart, et que le kappa n'est pas celui d'un lot complet. */
export function mentionTailleLot(taille: TailleDeLot): string | null {
  if (taille.taille_conforme) return null;
  return (
    `Lot de taille non conforme : ${taille.taille_lot} item(s) au lieu de ${taille.taille_attendue} attendus. ` +
    "Ce kappa n'est pas celui d'un lot complet ; il ne compte pas pour le critère du §12."
  );
}

/** Vide quand l'item est toujours jugé par son lot ; sinon explique pourquoi la décision ne comptera pas. */
export function mentionItemRenvoye(renvoye: boolean): string | null {
  if (!renvoye) return null;
  return (
    "Item renvoyé en attente depuis la composition de ce lot : ce lot ne le juge plus. Votre décision " +
    "sera enregistrée au journal, mais la promotion ne la lira pas ; l'item sera jugé par un nouveau lot."
  );
}
