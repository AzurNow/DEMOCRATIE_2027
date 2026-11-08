/**
 * La seule lecture croisée du projet, isolée dans un fichier qui porte son nom.
 *
 * Le kappa de Cohen ne peut pas exister sans comparer les décisions des deux annotateurs. Cette
 * fonction est donc nécessaire — et elle est exactement ce qu'il faut surveiller. Trois
 * précautions l'entourent :
 *
 * 1. Elle vit ici, et non dans `JournalAnnotateur`, qui n'a aucun moyen de sortir du répertoire
 *    de son annotateur. Une relecture du code voit immédiatement qui lit quoi.
 * 2. Ses deux appelants légitimes sont `diagnostiquerLot`, dont le type de retour ne contient
 *    aucune décision ni rien qui relie l'accord à un item (seule exception : `absents_du_staging`,
 *    items du manifeste introuvables, un fait du staging et non d'un journal), et le verrou d'un lot terminé (`verrou-lot.ts`, conformité
 *    n° 16), qui n'en tire qu'un booléen : « les deux ont fini », déjà rendu par le diagnostic.
 * 3. Le test d'aveuglement exécute toutes les routes du serveur et vérifie qu'aucune valeur du
 *    journal de l'autre annotateur n'apparaît dans une réponse.
 *
 * Elle ne doit jamais être appelée pour construire l'écran de validation. Si un jour elle l'est,
 * c'est le test d'aveuglement qui le dira, pas une relecture attentive.
 */

import { JournalAnnotateur } from "./journal-fichier.ts";
import { rejouer, type EtatAnnotateur } from "../domaine/journal.ts";
import type { Lot } from "../domaine/types.ts";

export function etatsDuLot(repertoireDecisions: string, lot: Lot): ReadonlyMap<string, EtatAnnotateur> {
  const etats = new Map<string, EtatAnnotateur>();
  for (const annotateur_id of lot.annotateurs) {
    const journal = new JournalAnnotateur(repertoireDecisions, annotateur_id);
    etats.set(annotateur_id, rejouer(journal.lire(lot.lot_id)));
  }
  return etats;
}
