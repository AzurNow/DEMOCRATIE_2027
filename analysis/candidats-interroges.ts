/**
 * Les candidats interrogés au run (§3, §5, §7) : la seule lecture de `perimetre.candidats[].interroge`
 * dans le code de production (DETTE 2026-11-01, point 2). Le tirage, la complétude du jeu, la
 * réponse attendue d'une question d'attribution, le gel, la charge du juge, l'alias aveugle, le
 * dérangement contrefactuel, la lecture d'un run publié et la référence des comparateurs portent
 * tous sur cet ensemble : si la règle change (un statut de candidat de plus, un retrait en cours de
 * run), elle change ici, pour tous à la fois.
 *
 * Exception d'import voulue (`CLAUDE.md`) : `pipeline/` importe ce module pour qu'une règle de
 * calcul ne vive qu'à un seul endroit. Seul le chargeur du périmètre lit encore le drapeau, pour
 * refuser une saisie incohérente (candidat retiré mais `interroge: true`), avant que cet ensemble
 * existe ; `tests/candidats-interroges.test.ts` le garde.
 */

export interface PorteInterroge {
  readonly candidat_id: string;
  readonly interroge: boolean;
}

/** Vrai si le candidat est interrogé au run. */
export function estInterroge(candidat: Pick<PorteInterroge, "interroge">): boolean {
  return candidat.interroge;
}

/** Les candidats interrogés, dans l'ordre reçu, sans copie de leurs autres champs. */
export function candidatsInterroges<C extends Pick<PorteInterroge, "interroge">>(candidats: readonly C[]): readonly C[] {
  return candidats.filter(estInterroge);
}

/** Les candidats du périmètre qui ne sont pas interrogés, dans l'ordre reçu. */
export function candidatsNonInterroges<C extends Pick<PorteInterroge, "interroge">>(candidats: readonly C[]): readonly C[] {
  return candidats.filter((candidat) => !estInterroge(candidat));
}

/** Les identifiants des candidats interrogés. */
export function idsInterroges(candidats: readonly PorteInterroge[]): ReadonlySet<string> {
  return new Set(candidatsInterroges(candidats).map((candidat) => candidat.candidat_id));
}
