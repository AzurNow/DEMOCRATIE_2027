/**
 * Renvoi d'une source à la réextraction (§4, protocole 0.24, D59 (9), première moitié).
 *
 * « Un texte extrait faux se solde par un rejet de l'item sous le motif énuméré « texte extrait
 * erroné », et c'est ce motif qui renvoie la source à la réextraction. » Le texte canonique n'est
 * jamais corrigé depuis l'interface (`corrections.ts`) : la seule issue d'un texte faux est ce rejet.
 *
 * Le renvoi n'est pas un état écrit : il se **recalcule** depuis les verdicts de la promotion (lots,
 * journaux, registres), comme la file d'arbitrage. Aucune fonction d'ici n'écrit ; `pnpm promote`
 * imprime la liste. Un renvoi désigne une source par l'empreinte du document et celle du texte jugé
 * faux ; il ne déplace, ne revalide ni ne suspend aucun autre item : la seconde moitié de D59 (9)
 * (suspendre les items déjà validés sur l'ancien texte) n'est pas retenue par l'auteur.
 *
 * Seul le cas que le texte tranche renvoie une source : l'item est rejeté par deux « rejeter »
 * concordants, qui portent tous deux le motif, et son contenu n'a qu'une source. Les autres rejets
 * qui portent le motif sont rapportés « à trancher » avec leur raison, jamais résolus en silence :
 *
 * | Raison | Cas |
 * | --- | --- |
 * | `motifs_discordants` | deux « rejeter », un seul sous le motif |
 * | `rejet_arbitre` | rejet tranché par l'arbitre ; l'arbitrage ne porte pas de motif de rejet |
 * | `plusieurs_sources` | item O à deux sources distinctes : le motif ne dit pas laquelle est fausse |
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { sourcesDuContenu } from "./ecoute-t2.ts";
import type { Issue } from "./promotion.ts";
import type { EntreeDecision, Item, MotifRejet, Source } from "./types.ts";

const MOTIF_RENVOI: MotifRejet = "texte_extrait_errone";

/** Ce que la promotion sait d'un item ; `outils/evaluation-lots.ts:Verdict` le satisfait. */
export interface VerdictRejet {
  readonly item: Item;
  readonly dossier: { readonly decisions: readonly EntreeDecision[] };
  readonly issue: Issue;
}

export interface SourceRenvoyee {
  readonly sha256: string;
  /** Absent quand la source n'en porte pas : jamais remplacé par une valeur. */
  readonly texte_sha256?: string;
  readonly url: string;
  /** Les items rejetés sous le motif qui la renvoient, triés. */
  readonly items: readonly string[];
}

export type RaisonATrancher = "motifs_discordants" | "rejet_arbitre" | "plusieurs_sources";

export interface RejetATrancher {
  readonly item_id: string;
  readonly raison: RaisonATrancher;
}

export interface RenvoisReextraction {
  readonly sources: readonly SourceRenvoyee[];
  readonly a_trancher: readonly RejetATrancher[];
}

type Examen =
  | { readonly sorte: "rien" }
  | { readonly sorte: "renvoi"; readonly source: Source }
  | { readonly sorte: "a_trancher"; readonly raison: RaisonATrancher };

const RIEN: Examen = { sorte: "rien" };

function estRejete(issue: Issue): boolean {
  return issue.sort === "promouvoir" && issue.statut === "rejete";
}

function porteLeMotif(decision: EntreeDecision): boolean {
  return decision.motif_rejet === MOTIF_RENVOI;
}

function rejetConcordant(decisions: readonly EntreeDecision[]): boolean {
  return decisions.length === 2 && decisions.every((decision) => decision.decision === "rejeter");
}

/** Document et texte ; une source sans `texte_sha256` a sa propre clé (JSON y écrit null). */
function cleSource(source: Source): string {
  return JSON.stringify([source.sha256, source.texte_sha256]);
}

/** Sources de contenu distinctes, par document et par texte. */
function sourcesDistinctes(item: Item): readonly Source[] {
  const parCle = new Map<string, Source>();
  for (const source of sourcesDuContenu(item)) parCle.set(cleSource(source), source);
  return [...parCle.values()];
}

function examinerSources(item: Item): Examen {
  const sources = sourcesDistinctes(item);
  const [seule] = sources;
  if (seule === undefined) {
    // Refusé à la décision (`decision.ts:controlerMotifRejet`) : une ligne de journal qui le porte
    // a été écrite hors de l'interface.
    throw new Error(`Item ${item.id} rejeté sous le motif « texte extrait erroné » sans aucune source de contenu.`);
  }
  if (sources.length > 1) return { sorte: "a_trancher", raison: "plusieurs_sources" };
  return { sorte: "renvoi", source: seule };
}

function examiner(verdict: VerdictRejet): Examen {
  if (!estRejete(verdict.issue)) return RIEN;
  const decisions = verdict.dossier.decisions;
  const avecMotif = decisions.filter(porteLeMotif).length;
  if (avecMotif === 0) return RIEN;
  if (!rejetConcordant(decisions)) return { sorte: "a_trancher", raison: "rejet_arbitre" };
  if (avecMotif !== decisions.length) return { sorte: "a_trancher", raison: "motifs_discordants" };
  return examinerSources(verdict.item);
}

function renvoiDe(source: Source, items: readonly string[]): SourceRenvoyee {
  return {
    sha256: source.sha256,
    ...(source.texte_sha256 === undefined ? {} : { texte_sha256: source.texte_sha256 }),
    url: source.url,
    items: [...items].sort(comparerChaines),
  };
}

export function renvoisAReextraction(verdicts: readonly VerdictRejet[]): RenvoisReextraction {
  const parSource = new Map<string, { source: Source; items: string[] }>();
  const a_trancher: RejetATrancher[] = [];

  for (const verdict of verdicts) {
    const examen = examiner(verdict);
    if (examen.sorte === "a_trancher") a_trancher.push({ item_id: verdict.item.id, raison: examen.raison });
    if (examen.sorte !== "renvoi") continue;
    const cle = cleSource(examen.source);
    const groupe = parSource.get(cle);
    if (groupe === undefined) parSource.set(cle, { source: examen.source, items: [verdict.item.id] });
    else groupe.items.push(verdict.item.id);
  }

  const sources = [...parSource.entries()]
    .sort(([a], [b]) => comparerChaines(a, b))
    .map(([, groupe]) => renvoiDe(groupe.source, groupe.items));
  return { sources, a_trancher: a_trancher.sort((a, b) => comparerChaines(a.item_id, b.item_id)) };
}
