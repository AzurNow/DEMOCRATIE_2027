/**
 * Renvoi d'une source à la réextraction (§4, protocole 0.24, D59 (9), première moitié ; règle du
 * renvoi précisée en protocole 0.27, D62 #233 (1)).
 *
 * « Un texte extrait faux se solde par un rejet de l'item sous le motif énuméré « texte extrait
 * erroné », et c'est ce motif qui renvoie la source à la réextraction. » Le texte canonique n'est
 * jamais corrigé depuis l'interface (`corrections.ts`) : la seule issue d'un texte faux est ce rejet.
 *
 * Le renvoi n'est pas un état écrit : il se **recalcule** depuis les verdicts de la promotion (lots,
 * journaux, registres), comme la file d'arbitrage. Aucune fonction d'ici n'écrit ; `pnpm promote`
 * imprime la liste. Un renvoi désigne une source par l'empreinte du document et celle du texte jugé
 * faux. Ce module ne nomme que les items rejetés ; ce que le renvoi fait aux autres items validés
 * sur ce même texte (seconde moitié de D59 (9), écrite au §4 en protocole 0.25, D60 (9b) : retour en
 * attente d'un item non publié, contestation par l'auteur d'un item publié) est calculé, depuis les
 * sources renvoyées, par `renvoi-texte-errone.ts`.
 *
 * « Le renvoi a lieu dès que l'item est rejeté et qu'une décision de rejet qui le fonde porte ce
 * motif : quand un seul des deux « rejeter » concordants le porte, comme quand les deux le portent ;
 * quand le rejet est tranché par l'arbitre, sa décision porte le motif comme celle d'un annotateur ;
 * sur un item O à deux sources, le motif ne disant pas laquelle est fausse, les deux sources sont
 * renvoyées. » Les décisions qui fondent le rejet sont donc :
 *
 * - pour un rejet arbitré (l'item promu porte le bloc `arbitrage`, recopié du registre) : la seule
 *   décision de l'arbitre ; un « rejeter » d'annotateur, que l'arbitre a départagé, ne le fonde pas ;
 * - sinon : les deux « rejeter » concordants. Un item rejeté sans arbitrage ni deux « rejeter » est
 *   incohérent : refusé, jamais lu en silence.
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

export interface RenvoisReextraction {
  readonly sources: readonly SourceRenvoyee[];
}

/** Un verdict rejeté que rien ne fonde : ni arbitrage, ni deux « rejeter » concordants. */
export class RejetSansFondement extends Error {
  readonly item_id: string;

  constructor(item_id: string) {
    super(
      `Item ${item_id} rejeté sans décision d'arbitrage ni deux « rejeter » concordants : ` +
        `aucune décision ne fonde le rejet, le renvoi à la réextraction ne peut pas se lire.`,
    );
    this.name = "RejetSansFondement";
    this.item_id = item_id;
  }
}

/** L'item promu « rejeté », tel que la promotion l'écrit (bloc `arbitrage` compris), ou null. */
function itemRejete(issue: Issue): Item | null {
  return issue.sort === "promouvoir" && issue.statut === "rejete" ? issue.item : null;
}

function rejetConcordant(decisions: readonly EntreeDecision[]): boolean {
  return decisions.length === 2 && decisions.every((decision) => decision.decision === "rejeter");
}

/** Les motifs de rejet des décisions qui fondent le rejet ; un motif absent reste absent. */
function motifsQuiFondent(verdict: VerdictRejet, promu: Item): readonly (MotifRejet | undefined)[] {
  if (promu.arbitrage !== undefined) return [promu.arbitrage.motif_rejet];
  const decisions = verdict.dossier.decisions;
  if (!rejetConcordant(decisions)) throw new RejetSansFondement(verdict.item.id);
  return decisions.map((decision) => decision.motif_rejet);
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

/** Toutes les sources de contenu distinctes : le motif ne dit pas laquelle est fausse (item O). */
function sourcesRenvoyees(item: Item): readonly Source[] {
  const sources = sourcesDistinctes(item);
  if (sources.length === 0) {
    // Refusé à la décision (`decision.ts:controlerMotifRejet`) comme à l'arbitrage
    // (`arbitrage.ts:motifsIssue`) : une ligne qui le porte a été écrite hors des commandes.
    throw new Error(`Item ${item.id} rejeté sous le motif « texte extrait erroné » sans aucune source de contenu.`);
  }
  return sources;
}

function examiner(verdict: VerdictRejet): readonly Source[] {
  const promu = itemRejete(verdict.issue);
  if (promu === null) return [];
  if (!motifsQuiFondent(verdict, promu).includes(MOTIF_RENVOI)) return [];
  return sourcesRenvoyees(verdict.item);
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

  for (const verdict of verdicts) {
    for (const source of examiner(verdict)) {
      const cle = cleSource(source);
      const groupe = parSource.get(cle);
      if (groupe === undefined) parSource.set(cle, { source, items: [verdict.item.id] });
      else groupe.items.push(verdict.item.id);
    }
  }

  const sources = [...parSource.entries()]
    .sort(([a], [b]) => comparerChaines(a, b))
    .map(([, groupe]) => renvoiDe(groupe.source, groupe.items));
  return { sources };
}
