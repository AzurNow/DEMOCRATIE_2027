/**
 * La décision de publication, dérivée des huit critères (D24 (3) ; les sept du §12 et le kappa de la
 * paire du §7) : tous verts ⇒ `publie` ; au moins un rouge ⇒ `publie_provisoire`, avec un motif qui
 * énumère les codes rouges dans l'ordre fixe des critères. Le code ne laisse aucun choix à l'humain, et le schéma du run impose la même règle
 * dans les deux sens.
 */

import { CODES_CRITERES, type CodeCritere, type Critere, type GoNoGo } from "./types.ts";

export class CriteresIncomplets extends Error {
  constructor(detail: string) {
    super(`Go/no-go non décidable : ${detail} (§12 et §7 : huit critères, chacun une fois).`);
    this.name = "CriteresIncomplets";
  }
}

/** Les critères rangés dans l'ordre de `CODES_CRITERES` ; un code manquant ou en double lève. */
export function rangerCriteres(criteres: readonly Critere[]): readonly Critere[] {
  return CODES_CRITERES.map((code) => uniqueDe(criteres, code));
}

function uniqueDe(criteres: readonly Critere[], code: CodeCritere): Critere {
  const trouves = criteres.filter((critere) => critere.code === code);
  const [critere] = trouves;
  if (critere === undefined || trouves.length !== 1) throw new CriteresIncomplets(`${trouves.length} critère(s) ${code}`);
  return critere;
}

/** Texte déterministe du motif d'une décision provisoire. */
export function motifProvisoire(rouges: readonly CodeCritere[]): string {
  return `Critère(s) go/no-go du §12 au rouge : ${rouges.join(", ")}.`;
}

export function deciderPublication(criteres: readonly Critere[]): GoNoGo {
  const ranges = rangerCriteres(criteres);
  const rouges = ranges.filter((critere) => critere.statut === "rouge").map((critere) => critere.code);
  if (rouges.length === 0) return { criteres: ranges, decision: "publie" };
  return { criteres: ranges, decision: "publie_provisoire", motif: motifProvisoire(rouges) };
}
