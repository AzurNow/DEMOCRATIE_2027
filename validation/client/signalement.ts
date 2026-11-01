/** Zone d'alerte persistante du client : toute promesse lancée sans attente y dit son échec. */

import { elementParId } from "./dom-type.ts";
import { lancerAvec } from "./erreurs.ts";

function afficher(messages: readonly string[]): void {
  const messagesZone = elementParId("alerte-messages", HTMLElement);
  messagesZone.replaceChildren(...messages.map((texte) => Object.assign(document.createElement("p"), { textContent: texte })));
  elementParId("alerte", HTMLElement).hidden = false;
}

/** Le bouton « Fermer » de la zone : l'alerte reste affichée tant que l'annotateur ne l'a pas lue. */
export function brancherAlerte(): void {
  elementParId("fermer-alerte", HTMLButtonElement).addEventListener("click", () => {
    elementParId("alerte", HTMLElement).hidden = true;
  });
}

/** À écrire à la place de `void promesse` : l'échec s'affiche, il ne disparaît jamais. */
export function lancer(promesse: Promise<unknown>, contexte?: string): void {
  void lancerAvec(afficher, promesse, contexte);
}
