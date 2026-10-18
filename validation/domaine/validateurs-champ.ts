/**
 * Validateurs de champ partagés par les trois registres de mesures (corrections de thème,
 * relectures, rattachements) : `corrections-mesure.ts`, `relectures-mesure.ts`,
 * `rattachements-item.ts`. Refactoring pur (revue du 2026-10-17, constat 11) : la frontière entre
 * un JSON quelconque et une entrée typée était recopiée trois fois, et les copies avaient déjà
 * divergé (constat 9).
 *
 * Chaque appelant garde son propre type d'erreur nommée (`EntreeRegistreInvalide`,
 * `EntreeRelectureInvalide`, `EntreeRattachementInvalide`) : ces fonctions ne lèvent rien
 * elles-mêmes, elles délèguent à `leveErreur`, fourni par l'appelant.
 */

export type LeveErreurChamp = (detail: string, provenance: string) => never;

/** Forme AAAA-MM-JJ. Un contrôle de date civile réelle (aller-retour) est une étape séparée. */
export const DATE_CIVILE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vraie date civile, par aller-retour (revue du 2026-10-12, constat 11 ; revue du 2026-10-17,
 * constat 1) : `Date.parse` accepte un jour hors du mois (`2027-02-29` glisse au 1er mars,
 * `2027-04-31` au 1er mai) sans lever. Reformater l'instant obtenu et le comparer à la forme
 * d'origine détecte ce glissement, qu'un simple `pattern` ne voit jamais.
 */
export function dateCivileValide(date: string): boolean {
  if (!DATE_CIVILE.test(date)) return false;
  const instant = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(instant)) return false;
  return new Date(instant).toISOString().slice(0, 10) === date;
}

export function objetOuLeve(
  valeur: unknown,
  provenance: string,
  leveErreur: LeveErreurChamp,
): Record<string, unknown> {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
    leveErreur("ce n'est pas un objet JSON.", provenance);
  }
  return valeur as Record<string, unknown>;
}

export function refuserChampsEnTrop(
  brute: Record<string, unknown>,
  champs: ReadonlySet<string>,
  provenance: string,
  leveErreur: LeveErreurChamp,
): void {
  const enTrop = Object.keys(brute).filter((cle) => !champs.has(cle));
  if (enTrop.length > 0) leveErreur(`champ(s) inattendu(s) : ${enTrop.join(", ")}.`, provenance);
}
