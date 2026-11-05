/**
 * §7, « Juges automatiques » (§7.59 de `docs/conformite/exigences.json` ; décision D74 (22)) : « Une
 * réponse qu'un juge ne peut pas noter (erreur persistante de son API, charge qui dépasse sa fenêtre
 * de contexte, sortie refusée ou illisible) est renvoyée à un humain, comme une question
 * d'attribution que la règle ne tranche pas ; elle sort du kappa de ce juge, et leur nombre est
 * publié par juge, avec leur motif. »
 *
 * Le compte des renvois (`volume/renvois/`, `schema/renvoi-humain.schema.json`) par juge, par
 * contexte et par motif, calculé ici une seule fois et publié par `pnpm analyze`
 * (`analyse-du-run.ts:sectionRenvoisHumains`).
 *
 * - Chaque juge déclaré au gel (`run.json#/juges[]`, dans son ordre) est publié, par son
 *   identifiant de gel, même sans aucun renvoi ; un juge retiré au test contrefactuel reste déclaré
 *   (§7) et est publié avec `retire: true`. Aucune identité d'outil noté n'est publiée.
 * - Chaque motif connu du schéma est publié dans chaque contexte, 0 compris : un zéro se lit, une
 *   clé absente ne se lit pas (« absent » n'est jamais « zéro »).
 * - Les contextes restent séparés : les renvois du test contrefactuel (des candidats, des outils)
 *   portent sur des copies permutées, jamais sur une réponse du run ; ils ne sont pas additionnés à
 *   ceux du run.
 * - Refus, jamais d'omission : un motif ou un contexte que le schéma ne connaît pas, un renvoi d'un
 *   juge non déclaré au gel, deux renvois d'un même juge sur une même réponse dans un même contexte.
 */

import { MOTIFS_RENVOI_DEFAILLANCE } from "./types-notation.ts";
import type { IdentifiantCourt, Ulid } from "./types.ts";

/** Les motifs de `schema/renvoi-humain.schema.json`, dans son ordre : D30 (2), puis les quatre du §7 (0.27). */
export const MOTIFS_RENVOI = ["attribution_indecidable", ...MOTIFS_RENVOI_DEFAILLANCE] as const;
export type MotifRenvoi = (typeof MOTIFS_RENVOI)[number];

/** Les contextes de `schema/renvoi-humain.schema.json`, dans son ordre. */
export const CONTEXTES_RENVOI = ["run", "contrefactuel_candidat", "contrefactuel_outil"] as const;
export type ContexteRenvoi = (typeof CONTEXTES_RENVOI)[number];

/** Ce que le compte lit d'un renvoi. `motif` et `contexte` sont des chaînes : le compte les vérifie lui-même. */
export interface RenvoiLu {
  readonly id: Ulid;
  readonly contexte: string;
  readonly objet_note: { readonly type: "reponse"; readonly id: Ulid };
  readonly notateur: { readonly id: IdentifiantCourt };
  readonly motif: string;
}

/** Un juge de `run.json#/juges[]`, tel que le compte le lit. */
export interface JugeDeclare {
  readonly juge_id: IdentifiantCourt;
  readonly retire: boolean;
}

export type ComptesParMotif = Record<MotifRenvoi, number>;

export interface RenvoisDUnJuge {
  readonly juge_id: IdentifiantCourt;
  readonly retire: boolean;
  readonly par_contexte: Record<ContexteRenvoi, ComptesParMotif>;
}

export class MotifDeRenvoiInconnu extends Error {
  constructor(renvoi: RenvoiLu) {
    super(`Renvoi ${renvoi.id} : motif « ${renvoi.motif} » inconnu de schema/renvoi-humain.schema.json (${MOTIFS_RENVOI.join(", ")}). Jamais ignoré ni rangé ailleurs.`);
    this.name = "MotifDeRenvoiInconnu";
  }
}

export class ContexteDeRenvoiInconnu extends Error {
  constructor(renvoi: RenvoiLu) {
    super(`Renvoi ${renvoi.id} : contexte « ${renvoi.contexte} » inconnu de schema/renvoi-humain.schema.json (${CONTEXTES_RENVOI.join(", ")}).`);
    this.name = "ContexteDeRenvoiInconnu";
  }
}

export class JugeDeRenvoiNonDeclare extends Error {
  constructor(renvoi: RenvoiLu) {
    super(`Renvoi ${renvoi.id} du juge ${renvoi.notateur.id}, qui n'est pas déclaré dans run.json#/juges : jamais ignoré.`);
    this.name = "JugeDeRenvoiNonDeclare";
  }
}

export class RenvoiEnDouble extends Error {
  constructor(renvoi: RenvoiLu) {
    super(
      `Renvoi ${renvoi.id} : le juge ${renvoi.notateur.id} porte déjà un renvoi de la réponse ${renvoi.objet_note.id} ` +
        `dans le contexte ${renvoi.contexte}. Une réponse n'est renvoyée qu'une fois par juge et par contexte ; jamais comptée deux fois.`,
    );
    this.name = "RenvoiEnDouble";
  }
}

function estMotifConnu(motif: string): motif is MotifRenvoi {
  return (MOTIFS_RENVOI as readonly string[]).includes(motif);
}

function estContexteConnu(contexte: string): contexte is ContexteRenvoi {
  return (CONTEXTES_RENVOI as readonly string[]).includes(contexte);
}

function comptesAZero(): ComptesParMotif {
  return Object.fromEntries(MOTIFS_RENVOI.map((motif) => [motif, 0])) as ComptesParMotif;
}

function contextesAZero(): Record<ContexteRenvoi, ComptesParMotif> {
  return Object.fromEntries(CONTEXTES_RENVOI.map((contexte) => [contexte, comptesAZero()])) as Record<ContexteRenvoi, ComptesParMotif>;
}

/** Le motif et le contexte du renvoi, vérifiés contre le schéma ; refus sinon. */
function motifEtContexte(renvoi: RenvoiLu): { readonly motif: MotifRenvoi; readonly contexte: ContexteRenvoi } {
  const { motif, contexte } = renvoi;
  if (!estMotifConnu(motif)) throw new MotifDeRenvoiInconnu(renvoi);
  if (!estContexteConnu(contexte)) throw new ContexteDeRenvoiInconnu(renvoi);
  return { motif, contexte };
}

/** Un même juge, une même réponse, un même contexte : deux renvois seraient deux issues comptées. */
function exigerUnique(renvoi: RenvoiLu, vus: Set<string>): void {
  const cle = [renvoi.notateur.id, renvoi.contexte, renvoi.objet_note.id].join("\0");
  if (vus.has(cle)) throw new RenvoiEnDouble(renvoi);
  vus.add(cle);
}

/**
 * Le nombre de renvois de chaque juge déclaré au gel, par contexte et par motif, chaque motif connu
 * présent à 0 compris. Les juges sont rendus dans l'ordre de `juges`.
 */
export function renvoisParJuge(juges: readonly JugeDeclare[], renvois: readonly RenvoiLu[]): RenvoisDUnJuge[] {
  const comptes = new Map(juges.map((juge) => [juge.juge_id, contextesAZero()]));
  const vus = new Set<string>();
  for (const renvoi of renvois) {
    const { motif, contexte } = motifEtContexte(renvoi);
    const duJuge = comptes.get(renvoi.notateur.id);
    if (duJuge === undefined) throw new JugeDeRenvoiNonDeclare(renvoi);
    exigerUnique(renvoi, vus);
    duJuge[contexte][motif] += 1;
  }
  return juges.map(({ juge_id, retire }) => ({ juge_id, retire, par_contexte: comptes.get(juge_id) as Record<ContexteRenvoi, ComptesParMotif> }));
}
