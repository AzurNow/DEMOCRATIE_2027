/**
 * Le registre des rattachements d'item sur disque : `validation/mesures/rattachements.json`
 * (décision D53 (1) du 2026-10-16), à côté des registres des corrections de thème et des
 * relectures, dont il reprend les propriétés :
 *
 * 1. **Ajout seul.** La seule écriture est `ajouterRattachement`, appelée par
 *    `pnpm mesures --rattacher --ecrire` après la réécriture de l'item en staging. Aucune fonction
 *    ici ne modifie ni ne supprime une entrée.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande : une décision de rattachement perdue serait un item changé de
 *    mesure sans trace publiée.
 *
 * Chaque entrée est confrontée à `rattachement-item.schema.json`, puis à
 * `validerEntreeRattachement`, à la lecture comme avant l'écriture. La pose (temporaire puis
 * renommage, refusée si le fichier a changé depuis sa lecture) vient de `registre-ajout-seul.ts`,
 * générique, partagé avec les registres des relectures et des corrections de thème.
 *
 * Un fichier **absent** est un registre vide : aucun item n'a encore été rattaché.
 */

import { join } from "node:path";
import {
  validerEntreeRattachement,
  type RattachementItem,
  type RegistreRattachementsItem,
} from "../domaine/rattachements-item.ts";
import {
  ajouterAuRegistreGenerique,
  lireRegistreGenerique,
  validerEntreeRegistreGenerique,
  type DefinitionRegistre,
} from "./registre-ajout-seul.ts";

export const NOM_FICHIER_RATTACHEMENTS = "rattachements.json";

export function cheminRattachements(repertoire: string): string {
  return join(repertoire, NOM_FICHIER_RATTACHEMENTS);
}

export class RegistreRattachementsIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(
      `Registre des rattachements d'item illisible : ${chemin}\n${detail}\n` +
        `Rien n'est réparé automatiquement : ce fichier est la trace publiée des rattachements ` +
        `décidés par l'auteur.`,
    );
    this.name = "RegistreRattachementsIllisible";
  }
}

const DEFINITION: DefinitionRegistre<RattachementItem> = {
  schema: "rattachement-item",
  validerEntree: validerEntreeRattachement,
  creerIllisible: (chemin, detail) => new RegistreRattachementsIllisible(chemin, detail),
};

export function lireRattachements(repertoire: string): RegistreRattachementsItem {
  return lireRegistreGenerique(cheminRattachements(repertoire), DEFINITION);
}

/**
 * Les contrôles d'`ajouterRattachement`, sans l'écriture : registre lisible, entrée valide. La
 * commande les passe **avant** de réécrire l'item en staging, pour qu'un registre corrompu ou une
 * entrée fautive n'arrêtent pas l'écriture entre ses deux moitiés.
 */
export function controlerAjoutRattachement(repertoire: string, entree: RattachementItem): void {
  validerEntreeRegistreGenerique(entree, `rattachement à enregistrer dans ${cheminRattachements(repertoire)}`, DEFINITION);
  lireRattachements(repertoire);
}

/** Ajoute un rattachement en fin de registre ; le crée s'il est absent. Rend le registre relu. */
export function ajouterRattachement(repertoire: string, entree: RattachementItem): RegistreRattachementsItem {
  return ajouterAuRegistreGenerique(cheminRattachements(repertoire), entree, DEFINITION);
}
