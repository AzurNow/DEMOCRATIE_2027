/**
 * §7 (protocole 0.27, D67) : « Le troisième humain n'est jamais l'auteur, qui connaît la table des
 * alias d'outils. » La règle ne vise que la place d'arbitre : l'auteur peut être le premier ou le
 * second annotateur d'une double notation, jamais le troisième humain.
 *
 * Les trois places d'arbitrage d'un humain sur une réponse ou une lecture : l'échantillon de 10 %
 * (`arbitrage_echantillon_10`), la lecture de comparateur (`arbitrage_comparateur`) et le jeu d'or
 * (`arbitrage_jeu_or`, D93). Le pseudonyme de l'auteur est déclaré au gel (`config/gel.json`,
 * `annotateur_auteur`) et recopié dans `run.json` ; un run qui ne le porte pas (gelé avant ce champ)
 * ne permet pas de vérifier la règle : la notation d'arbitrage y est refusée en le disant, jamais
 * acceptée par défaut.
 */

/** Les motifs de notation qui occupent la place du troisième humain. */
export const MOTIFS_ARBITRAGE_HUMAIN = ["arbitrage_echantillon_10", "arbitrage_comparateur", "arbitrage_jeu_or"] as const;

export type CodeArbitreAuteur = "arbitre_est_l_auteur" | "auteur_non_declare";

export interface RefusArbitreAuteur {
  readonly code: CodeArbitreAuteur;
  readonly detail: string;
}

export function estUnArbitrage(motif_notation: string): boolean {
  return (MOTIFS_ARBITRAGE_HUMAIN as readonly string[]).includes(motif_notation);
}

/**
 * `undefined` quand la notation est permise ; sinon le refus nommé. `annotateur_auteur` est la valeur
 * de `run.annotateur_auteur`, `undefined` pour un run qui ne la porte pas.
 */
export function refusArbitreAuteur(motif_notation: string, annotateur_id: string, annotateur_auteur: string | undefined): RefusArbitreAuteur | undefined {
  if (!estUnArbitrage(motif_notation)) return undefined;
  if (annotateur_auteur === undefined) {
    return {
      code: "auteur_non_declare",
      detail: `le run ne déclare pas le pseudonyme de l'auteur (run.annotateur_auteur) : la règle « le troisième humain n'est jamais l'auteur » (§7) ne peut pas être vérifiée pour ${motif_notation}.`,
    };
  }
  if (annotateur_id === annotateur_auteur) {
    return { code: "arbitre_est_l_auteur", detail: `${annotateur_id} est l'auteur : le troisième humain n'est jamais l'auteur, qui connaît la table des alias d'outils (§7).` };
  }
  return undefined;
}
