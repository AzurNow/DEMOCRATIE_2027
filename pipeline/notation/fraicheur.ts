/**
 * Fraîcheur d'une erreur d'obsolescence (§11 ; D17 du 2026-10-06).
 *
 * §11 : « Une erreur d'obsolescence est dite fraîche quand la date de gel du run est strictement
 * antérieure à la date du changement plus 14 jours ; elle est comptée mais signalée à part. » D17 :
 * la fraîcheur n'est portée que par une note qui pose le drapeau obsolescence ; c'est à l'appelant de
 * ne la calculer que dans ce cas (`fraicheurDesItems`, lu par `notation-humaine.ts` et, depuis D27
 * (charge-juge-v3), par `juge.ts` : un juge ne rend plus la fraîcheur).
 *
 * Arithmétique, avec les règles de date du §4 (`pipeline/questions/reponse-attendue.ts`, seule
 * source de ces conventions) :
 *
 * - `date_changement` est une date civile, lue à minuit UTC (`instantDeDateCivile`) ;
 * - `date_gel` est un instant dont le décalage est obligatoire (`instantDe`), comparé en
 *   millisecondes depuis l'époque, donc indépendamment de l'écriture du fuseau ;
 * - « plus 14 jours » ajoute 14 × 86 400 000 ms : en UTC un jour civil dure toujours 86 400 s, il
 *   n'y a pas de changement d'heure. La borne est donc minuit UTC du quatorzième jour suivant ;
 * - « strictement antérieure » : fraîche si `gel < changement + 14 j`. Un gel à J+14 minuit UTC
 *   pile n'est plus frais.
 *
 * Un gel antérieur au changement lui-même donne « fraîche » : la règle du §11 est appliquée telle
 * qu'écrite, sans cas ajouté.
 */

import { instantDe, instantDeDateCivile } from "../questions/reponse-attendue.ts";

/** §11 : « la date du changement plus 14 jours ». */
export const DELAI_FRAICHEUR_JOURS = 14;

const MILLISECONDES_PAR_JOUR = 86_400_000;

export function obsolescenceFraiche(date_changement: string, date_gel: string): boolean {
  const borne = instantDeDateCivile(date_changement) + DELAI_FRAICHEUR_JOURS * MILLISECONDES_PAR_JOUR;
  return instantDe(date_gel) < borne;
}

/**
 * La fraîcheur d'une note, depuis ses drapeaux et ses items soumis (D17 ; D27 (C) : jamais lue dans
 * la sortie d'un juge). Partagée par la notation humaine (`notation-humaine.ts`) et la notation de
 * juge (`juge.ts`), qui traduisent chacune les deux échecs à leur manière (refus de saisie, sortie de
 * juge incohérente) :
 *
 * - sans drapeau `obsolescence`, la fraîcheur est sans objet (D17) ;
 * - la date du changement est celle de l'item O soumis ; sans item O, elle manque (`sans_item_o`) ;
 *   avec des items O de dates différentes, la fraîcheur est ambiguë (`ambigue`). Jamais une date
 *   choisie. Côté juge, ce cas est un défaut du banc qui arrête la notation, et non un renvoi (§7,
 *   protocole 0.32, D74 (25)) ; côté humain, un refus de saisie.
 * - chaque date est lue comme date civile (`instantDeDateCivile`) avant toute comparaison : une
 *   graphie hors AAAA-MM-JJ lève `DateCivileInvalide`, jamais comptée comme une seconde date ni
 *   rapprochée d'une autre. Deux dates valides égales sont alors la même chaîne.
 */
export type FraicheurDesItems =
  | { readonly statut: "sans_objet" }
  | { readonly statut: "calculee"; readonly fraiche: boolean }
  | { readonly statut: "sans_item_o" }
  | { readonly statut: "ambigue"; readonly dates: readonly string[] };

export function fraicheurDesItems(
  drapeaux: readonly string[],
  items: readonly { readonly obsolescence?: { readonly date_changement: string } | undefined }[],
  date_gel: string,
): FraicheurDesItems {
  if (!drapeaux.includes("obsolescence")) return { statut: "sans_objet" };
  const dates = [...new Set(items.flatMap((item) => (item.obsolescence === undefined ? [] : [dateCivileLue(item.obsolescence.date_changement)])))];
  const [date, ...autres] = dates;
  if (date === undefined) return { statut: "sans_item_o" };
  if (autres.length > 0) return { statut: "ambigue", dates };
  return { statut: "calculee", fraiche: obsolescenceFraiche(date, date_gel) };
}

/** La date, une fois vérifiée comme date civile réelle de forme AAAA-MM-JJ ; sinon `DateCivileInvalide`. */
function dateCivileLue(date: string): string {
  instantDeDateCivile(date);
  return date;
}
