/**
 * Rejet arbitré sans motif de l'arbitre alors qu'un annotateur en avait porté un (décision D74 (6)
 * et (7), protocole 0.32 : §4).
 *
 * L'arbitre fonde le rejet : sa décision seule dit le motif (`renvoi-reextraction.ts`). Quand elle
 * n'en porte pas, aucun renvoi n'est produit et le rejet est valide. Le motif qu'un annotateur
 * avait porté ne compte donc pas, mais l'auteur veut le voir : `pnpm promote` le signale **en
 * information**. Ce signalement ne bloque rien et n'écrit rien ; il se recalcule à chaque lancement.
 */

import type { Issue } from "./promotion.ts";
import type { BlocArbitrage, EntreeDecision, Item, MotifRejet } from "./types.ts";

/** Ce que la promotion sait d'un item ; `outils/evaluation-lots.ts:Verdict` le satisfait. */
export interface VerdictArbitre {
  readonly lot_id: string;
  readonly item: Item;
  readonly dossier: { readonly decisions: readonly EntreeDecision[] };
  readonly issue: Issue;
}

export interface MotifAnnotateurIgnore {
  readonly annotateur_id: string;
  readonly motif_rejet: MotifRejet;
}

export interface RejetArbitreSansMotif {
  readonly item_id: string;
  readonly lot_id: string;
  /** Les motifs portés par les annotateurs, jamais vide. */
  readonly motifs: readonly MotifAnnotateurIgnore[];
}

/** Le bloc `arbitrage` d'un item promu « rejeté » par l'arbitre, ou null : sinon rien à signaler. */
function blocDeRejetArbitre(issue: Issue): BlocArbitrage | null {
  if (issue.sort !== "promouvoir" || issue.statut !== "rejete") return null;
  return issue.item.arbitrage ?? null;
}

function motifsDesAnnotateurs(decisions: readonly EntreeDecision[]): readonly MotifAnnotateurIgnore[] {
  return decisions.flatMap((decision) =>
    decision.motif_rejet === undefined ? [] : [{ annotateur_id: decision.annotateur_id, motif_rejet: decision.motif_rejet }],
  );
}

function examiner(verdict: VerdictArbitre): RejetArbitreSansMotif | null {
  const bloc = blocDeRejetArbitre(verdict.issue);
  if (bloc === null || bloc.motif_rejet !== undefined) return null;
  const motifs = motifsDesAnnotateurs(verdict.dossier.decisions);
  if (motifs.length === 0) return null;
  return { item_id: verdict.item.id, lot_id: verdict.lot_id, motifs };
}

export function rejetsArbitresSansMotif(verdicts: readonly VerdictArbitre[]): readonly RejetArbitreSansMotif[] {
  return verdicts.flatMap((verdict) => {
    const rejet = examiner(verdict);
    return rejet === null ? [] : [rejet];
  });
}

/** Les lignes de l'information, en français, un item par ligne ; aucune ligne s'il n'y a rien à dire. */
export function decrireRejetsArbitresSansMotif(rejets: readonly RejetArbitreSansMotif[]): readonly string[] {
  if (rejets.length === 0) return [];
  return [
    `\nInformation : rejets arbitrés sans motif de l'arbitre, alors qu'un annotateur en avait porté un : ${rejets.length}`,
    "  Aucun renvoi à la réextraction (l'arbitre fonde le rejet) ; le rejet est valide et la promotion n'est pas bloquée.",
    ...rejets.map((rejet) => {
      const motifs = rejet.motifs.map((m) => `${m.annotateur_id} : ${m.motif_rejet}`).join(", ");
      return `  ${rejet.item_id}  [${rejet.lot_id}]  motif d'annotateur non repris : ${motifs}`;
    }),
  ];
}
