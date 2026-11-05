/**
 * La note que porte un verdict, et la construction du verdict à partir de la résolution que la
 * règle de décision (`decision.ts`) a choisie. Ce module ne décide rien : il recopie une note
 * individuelle (ou la note commune de deux notations) dans la forme de `verdict.schema.json`.
 */

import { notationsConcordent, sourcageDeNotation } from "../../analysis/note-lue.ts";
import { DRAPEAUX, type Drapeau, type Instant, type ObjetNote, type SourcageRetenu, type Ulid } from "../../analysis/types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import {
  DRAPEAUX_GRAVES,
  type ModeResolution,
  type MotifInexactitude,
  type NotationIndividuelle,
  type RevueHumaine,
  type VerdictProduit,
} from "./types.ts";

export interface NoteRetenue {
  readonly categorie: NotationIndividuelle["categorie"];
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude: MotifInexactitude | undefined;
  readonly obsolescence_fraiche: boolean | undefined;
  readonly sourcage: SourcageRetenu;
}

export interface Resolution {
  readonly note: NoteRetenue;
  readonly mode: ModeResolution;
  readonly sources: readonly NotationIndividuelle[];
  /** Les humains dont la note a décidé : ils forment la revue humaine. */
  readonly humains: readonly NotationIndividuelle[];
  readonly desaccord: boolean;
}

/** Ce que le verdict reçoit de l'appelant, et non de la règle : identifiant, objet, date. */
export interface CadreVerdict {
  readonly verdict_id: Ulid;
  readonly run_id: Ulid;
  readonly objet_note: ObjetNote;
  readonly dans_echantillon_humain: boolean;
  readonly date: Instant;
}

/** §7 : fabrication ou mauvaise attribution, revue humaine obligatoire avant publication. */
export function porteDrapeauGrave(notation: { readonly drapeaux: readonly Drapeau[] }): boolean {
  return notation.drapeaux.some((drapeau) => DRAPEAUX_GRAVES.includes(drapeau));
}

/** La note d'une notation, drapeaux rangés dans l'ordre figé de `DRAPEAUX`. */
export function noteDe(notation: NotationIndividuelle): NoteRetenue {
  return {
    categorie: notation.categorie,
    drapeaux: DRAPEAUX.filter((drapeau) => notation.drapeaux.includes(drapeau)),
    motif_inexactitude: notation.motif_inexactitude,
    obsolescence_fraiche: notation.obsolescence_fraiche,
    sourcage: sourcageDeNotation(notation),
  };
}

/**
 * La note de deux notations qui s'accordent (`notationsConcordent`), si elles portent aussi le même
 * motif d'inexactitude et le même sourçage complet ; `null` sinon. Le §7 ne dit pas lequel retenir
 * quand ces champs, hors des métriques primaires, divergent : plutôt qu'une règle de fusion
 * inventée, la règle de décision appelle un humain (hors échantillon, D15), et un troisième humain
 * entre deux humains de l'échantillon (§7, protocole 0.33 ; D75 (15), `humainsAArbitrer`).
 */
export function noteCommune(a: NotationIndividuelle, b: NotationIndividuelle): NoteRetenue | null {
  const noteA = noteDe(a);
  const noteB = noteDe(b);
  const memeSourcage =
    noteA.sourcage.cite === noteB.sourcage.cite && noteA.sourcage.au_moins_un_lien_existant === noteB.sourcage.au_moins_un_lien_existant;
  return memeSourcage && noteA.motif_inexactitude === noteB.motif_inexactitude ? noteA : null;
}

/**
 * Deux notations humaines appellent un troisième humain (§6 et §7, protocole 0.33 ; D73 (14),
 * D75 (15)) : quand elles divergent au sens de `notationsConcordent`, ou quand elles s'accordent
 * ainsi mais divergent « sur un autre champ que porte la note retenue (motif d'inexactitude,
 * citation d'une source, existence d'un lien) », « comme une réponse dont les deux juges s'accordent
 * sur la note mais divergent sur ce champ ». Ces trois champs sont exactement ceux que `noteCommune`
 * compare au-delà de `notationsConcordent` : deux humains n'appellent pas d'arbitre si et seulement
 * si ils ont une note commune, que la règle de décision retient alors.
 * Seule définition du dépôt : l'échantillon des réponses (`decision.ts`, `file-humaine.ts`) et les
 * lectures de comparateur (`lectures-comparateur.ts`) la lisent ici.
 */
export function humainsAArbitrer(a: NotationIndividuelle, b: NotationIndividuelle): boolean {
  return !notationsConcordent(a, b) || noteCommune(a, b) === null;
}

/**
 * `erreur_grave` dit que la note RETENUE porte un drapeau grave : c'est elle que le §8 publie in
 * extenso « validée par un humain ». Un drapeau grave posé par un juge et infirmé par l'humain qui
 * revoit la réponse laisse `erreur_grave` faux ; la revue reste visible dans `mode_resolution`.
 */
export function construireVerdict(cadre: CadreVerdict, resolution: Resolution): VerdictProduit {
  const { note } = resolution;
  return {
    id: cadre.verdict_id,
    run_id: cadre.run_id,
    contexte: "run",
    objet_note: { type: cadre.objet_note.type, id: cadre.objet_note.id },
    categorie_retenue: note.categorie,
    drapeaux_retenus: note.drapeaux,
    ...(note.motif_inexactitude === undefined ? {} : { motif_inexactitude_retenu: note.motif_inexactitude }),
    ...(note.obsolescence_fraiche === undefined ? {} : { obsolescence_fraiche: note.obsolescence_fraiche }),
    sourcage_retenu: note.sourcage,
    notations_sources: resolution.sources.map((n) => n.id),
    mode_resolution: resolution.mode,
    desaccord_juges: resolution.desaccord,
    dans_echantillon_humain: cadre.dans_echantillon_humain,
    erreur_grave: porteDrapeauGrave(note),
    ...revue(resolution.humains),
    date: cadre.date,
  };
}

/** Une revue humaine est consignée dès qu'un humain a donné la note : date de sa notation la plus récente. */
function revue(humains: readonly NotationIndividuelle[]): { readonly revue_humaine?: RevueHumaine } {
  const [premier, ...autres] = humains;
  if (premier === undefined) return {};
  const derniere = autres.reduce((plusRecente, n) => (Date.parse(n.date) > Date.parse(plusRecente.date) ? n : plusRecente), premier);
  const annotateurs = [...new Set(humains.map((n) => n.notateur.id))].sort(comparerChaines);
  return { revue_humaine: { effectuee: true, date: derniere.date, annotateurs } };
}
