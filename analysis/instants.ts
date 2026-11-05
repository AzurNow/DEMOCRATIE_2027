/**
 * La lecture d'un instant et d'une date civile, une seule fois dans le dépôt : tout le dépôt la lit
 * ici, de la réponse attendue au gel (`pipeline/questions/reponse-attendue.ts`) à la strate de moins
 * de 60 jours du §8 (`strate-recente.ts`).
 *
 * **Comparaison sur l'instant** : une date civile (`valide_du`, `valide_au`, `date_changement`) est
 * ramenée à minuit UTC, et `date_gel` porte son décalage. C'est la seule convention qui donne la
 * même réponse à deux écritures du même instant ; comparer les chaînes, ou interpréter la date
 * civile dans le fuseau porté par `date_gel`, rendrait le résultat dépendant de l'écriture choisie
 * pour le gel.
 */

import { dateCivileValide } from "../validation/domaine/validateurs-champ.ts";

/**
 * Date civile impossible ou non canonique (`2027-02-29`, `2026-04-31`, `2026-1-1`), lue dans un
 * item ou un run (revue du 2026-10-12, constat 11) : `Date.parse` la ferait glisser au mois
 * suivant sans lever. Refus, jamais de glissement : une borne de validité déplacée d'un jour
 * change la réponse attendue.
 */
export class DateCivileInvalide extends Error {
  readonly date: string;

  constructor(date: string) {
    super(`Date civile illisible ou impossible : « ${date} » (forme AAAA-MM-JJ, jour réel du calendrier attendu).`);
    this.name = "DateCivileInvalide";
    this.date = date;
  }
}

/**
 * Une date civile est ramenée à minuit UTC : voir la convention en tête de module. La règle de
 * date réelle est celle des registres (`dateCivileValide`), une seule dans le dépôt.
 */
export function instantDeDateCivile(date: string): number {
  if (!dateCivileValide(date)) throw new DateCivileInvalide(date);
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * Motif de `commun#/$defs/instant` : ISO 8601 avec décalage obligatoire. `Date.parse` lit un
 * horodatage sans décalage dans le fuseau de la machine ; le vérifier d'abord rend le résultat
 * indépendant de la machine qui calcule.
 */
const INSTANT_AVEC_DECALAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

export function instantDe(horodatage: string): number {
  if (!INSTANT_AVEC_DECALAGE.test(horodatage)) {
    throw new Error(`Instant sans décalage horaire explicite, ou mal formé : ${horodatage}`);
  }
  // La date civile écrite (dans le fuseau porté par l'instant) suit la même règle que les bornes.
  if (!dateCivileValide(horodatage.slice(0, 10))) throw new DateCivileInvalide(horodatage.slice(0, 10));
  const millisecondes = Date.parse(horodatage);
  if (Number.isNaN(millisecondes)) throw new Error(`Instant illisible : ${horodatage}`);
  return millisecondes;
}
