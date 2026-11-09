/**
 * La raison d'un changement de quota (§5 : « Il peut changer d'un run à l'autre ; son changement est
 * publié avec le run, avec sa raison »). Conformité du 2026-11-09, n° 12.
 *
 * Au gel, les deux quotas du périmètre (`questions_par_strate`, `questions_attribution_par_theme`)
 * sont comparés à ceux du tirage du run précédent (`tirage.parametres`). Tout défaut est un refus
 * nommé (`RaisonQuotaRefusee`), jamais une valeur par défaut :
 *   - `raison_manquante` : un quota diffère du précédent et `tirage.raison_changement_quota` est
 *     absente du périmètre ;
 *   - `raison_sans_changement` : la raison est présente alors qu'aucun quota ne change, ou qu'aucun
 *     run ne précède (le premier run n'a rien à changer). Le §5 est muet sur ce cas ; une raison
 *     publiée sans changement serait trompeuse, elle est refusée (choix à confirmer par l'auteur).
 * Une raison vide ou blanche est déjà refusée par `perimetre.schema.json`.
 */

import type { ParametresTirage } from "../questions/types.ts";

export type MotifRaisonQuota = "raison_manquante" | "raison_sans_changement";

export class RaisonQuotaRefusee extends Error {
  readonly motif: MotifRaisonQuota;

  constructor(motif: MotifRaisonQuota, detail: string) {
    super(`Quota refusé au gel (${motif}, §5, conformité du 2026-11-09 n° 12) : ${detail} Rien n'est écrit.`);
    this.name = "RaisonQuotaRefusee";
    this.motif = motif;
  }
}

/** Les quotas du tirage du run précédent, tels qu'il les a publiés. */
export type QuotasPrecedents = Pick<ParametresTirage, "questions_par_strate" | "questions_attribution_par_theme">;

/** Les noms des quotas qui diffèrent du précédent, vide quand rien ne change. */
export function quotasChanges(courants: QuotasPrecedents, precedents: QuotasPrecedents): readonly string[] {
  const noms: readonly (keyof QuotasPrecedents)[] = ["questions_par_strate", "questions_attribution_par_theme"];
  return noms.filter((nom) => courants[nom] !== precedents[nom]);
}

/**
 * Vérifie la raison contre le changement. `precedents` est `undefined` quand aucun run ne précède :
 * rien ne change alors, la raison n'est pas exigée.
 */
export function exigerRaisonDuChangementDeQuota(
  courants: ParametresTirage,
  precedents: QuotasPrecedents | undefined,
): void {
  const changes = precedents === undefined ? [] : quotasChanges(courants, precedents);
  const raison = courants.raison_changement_quota;
  if (changes.length > 0 && raison === undefined) {
    throw new RaisonQuotaRefusee(
      "raison_manquante",
      `${changes.join(", ")} diffère du run précédent et tirage.raison_changement_quota est absente de config/perimetre.yaml.`,
    );
  }
  if (changes.length === 0 && raison !== undefined) {
    const cause = precedents === undefined ? "aucun run ne précède" : "aucun quota ne diffère du run précédent";
    throw new RaisonQuotaRefusee(
      "raison_sans_changement",
      `tirage.raison_changement_quota est présente alors que ${cause} ; une raison sans changement serait trompeuse.`,
    );
  }
}
