/**
 * §7 (protocole 0.31, D73 (7)) : « Les outils du run qu'édite l'éditeur de chaque juge forment une
 * liste déclarée par l'auteur au gel, vide comprise, et publiée avec le run. »
 *
 * La liste vient de `config/gel.json` (`configuration.ts:JugeAuGel`) ; ce module vérifie seulement
 * qu'elle ne nomme que des outils du run : présents au périmètre du gel et inclus. Un outil absent ou
 * exclu est refusé, avec le juge et l'outil nommés, jamais retiré en silence de la liste — la liste
 * publiée est exactement celle que l'auteur a déclarée. Aucune déduction : rien ici ne rapproche
 * l'éditeur d'un outil de la famille d'un juge.
 */

/** Ce que le contrôle lit d'un juge déclaré au gel. */
export interface JugeEtSesOutils {
  readonly juge_id: string;
  readonly outils_de_son_editeur: readonly string[];
}

/** Ce que le contrôle lit d'un outil du périmètre au gel. */
export interface OutilDuPerimetre {
  readonly outil_id: string;
  readonly inclus: boolean;
}

export type MotifHorsDuRun = "absent_du_perimetre" | "exclu_du_run";

export interface OutilHorsDuRun {
  readonly juge_id: string;
  readonly outil_id: string;
  readonly motif: MotifHorsDuRun;
}

export class OutilDeSonEditeurHorsDuRun extends Error {
  readonly hors_du_run: readonly OutilHorsDuRun[];

  constructor(hors_du_run: readonly OutilHorsDuRun[]) {
    const liste = hors_du_run.map((h) => `${h.juge_id} → ${h.outil_id} (${h.motif})`).join(", ");
    super(
      `config/gel.json, juges[].outils_de_son_editeur : outil(s) qui ne sont pas des outils du run : ${liste}. ` +
        `§7 (D73 (7)) : la liste nomme les outils du run qu'édite l'éditeur du juge ; aucun n'est retiré en silence, à corriger par l'auteur.`,
    );
    this.name = "OutilDeSonEditeurHorsDuRun";
    this.hors_du_run = hors_du_run;
  }
}

function motifHorsDuRun(outil_id: string, outils: ReadonlyMap<string, OutilDuPerimetre>): MotifHorsDuRun | null {
  const outil = outils.get(outil_id);
  if (outil === undefined) return "absent_du_perimetre";
  return outil.inclus ? null : "exclu_du_run";
}

/** Lève `OutilDeSonEditeurHorsDuRun` si une liste nomme un outil absent du périmètre ou exclu. */
export function exigerOutilsDesEditeursDuRun(juges: readonly JugeEtSesOutils[], outils: readonly OutilDuPerimetre[]): void {
  const parId = new Map(outils.map((outil) => [outil.outil_id, outil]));
  const hors_du_run = juges.flatMap((juge) =>
    juge.outils_de_son_editeur.flatMap((outil_id) => {
      const motif = motifHorsDuRun(outil_id, parId);
      return motif === null ? [] : [{ juge_id: juge.juge_id, outil_id, motif }];
    }),
  );
  if (hors_du_run.length > 0) throw new OutilDeSonEditeurHorsDuRun(hors_du_run);
}
