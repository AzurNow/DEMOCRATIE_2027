/**
 * Le registre des relectures de mesure sur disque : `validation/mesures/relectures.json`
 * (décision D53 (1) du 2026-10-16), à côté du registre des corrections de thème
 * (`mesures-fichier.ts`), dont il reprend les propriétés :
 *
 * 1. **Ajout seul.** La seule écriture est `ajouterRelecture`, appelée par
 *    `pnpm mesures --relire --ecrire` : elle relit les entrées existantes, les réécrit telles
 *    quelles dans leur ordre et ajoute la nouvelle en fin. Aucune fonction ici ne modifie ni ne
 *    supprime une entrée. Deux entrées identiques sont inoffensives.
 * 2. **Une corruption bloque au lieu d'être rattrapée.** Un fichier illisible ou une entrée
 *    malformée arrêtent la commande. Ignorer une ligne fautive pourrait faire tomber une
 *    relecture sans que personne ne le sache ; en tolérer une mal formée pourrait laisser entrer
 *    dans `data/` une mesure que personne n'a relue.
 *
 * Chaque entrée est confrontée à `relecture-mesure.schema.json`, puis à `validerEntreeRelecture`,
 * qui en construit la valeur typée, à la lecture comme avant l'écriture.
 *
 * L'écriture est atomique (temporaire puis renommage), refusée si le fichier a changé depuis sa
 * lecture, et le registre est relu après la pose : `registre-ajout-seul.ts`, générique, partagé
 * avec le registre des rattachements (`rattachements-fichier.ts`) et celui des corrections de
 * thème (`mesures-fichier.ts`).
 *
 * Un fichier **absent** est un registre vide, et non une erreur : aucune mesure n'a encore été
 * relue. Toute mesure à créer ou à réécrire est alors refusée par la promotion.
 */

import { join } from "node:path";
import {
  validerEntreeRelecture,
  type RegistreRelecturesMesure,
  type RelectureMesure,
} from "../domaine/relectures-mesure.ts";
import { ajouterAuRegistreGenerique, lireRegistreGenerique, type DefinitionRegistre } from "./registre-ajout-seul.ts";

export const NOM_FICHIER_RELECTURES = "relectures.json";

export function cheminRelectures(repertoire: string): string {
  return join(repertoire, NOM_FICHIER_RELECTURES);
}

export class RegistreRelecturesIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(
      `Registre des relectures de mesure illisible : ${chemin}\n${detail}\n` +
        `Rien n'est réparé automatiquement : ce fichier est la trace publiée des relectures de ` +
        `l'auteur, et aucune mesure n'entre dans data/ sans elle.`,
    );
    this.name = "RegistreRelecturesIllisible";
  }
}

const DEFINITION: DefinitionRegistre<RelectureMesure> = {
  schema: "relecture-mesure",
  validerEntree: validerEntreeRelecture,
  creerIllisible: (chemin, detail) => new RegistreRelecturesIllisible(chemin, detail),
};

export function lireRelectures(repertoire: string): RegistreRelecturesMesure {
  return lireRegistreGenerique(cheminRelectures(repertoire), DEFINITION);
}

/**
 * Ajoute une relecture en fin de registre ; le crée s'il est absent. Les entrées antérieures sont
 * relues, validées et réécrites telles quelles, dans leur ordre : la réécriture n'est qu'un ajout.
 * Rend le registre relu après la pose.
 */
export function ajouterRelecture(repertoire: string, entree: RelectureMesure): RegistreRelecturesMesure {
  return ajouterAuRegistreGenerique(cheminRelectures(repertoire), entree, DEFINITION);
}
