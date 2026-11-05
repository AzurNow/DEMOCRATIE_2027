/**
 * Ce qui fait qu'une question est « la même » d'un run à l'autre : seule définition du dépôt.
 *
 * §5 (protocole 0.9) : « Une question est reprise si elle porte le même identifiant et les mêmes
 * empreintes de texte qu'au run précédent ; une question dont un texte a changé compte comme
 * neuve. » §8 : « Une question est commune aux deux runs quand elle a le même identifiant […] et
 * que ses trois formulations ont le même texte, à l'empreinte près. »
 *
 * Le tirage (reprise, §5) et la tendance (questions communes, §8) lisent cette signature, et
 * aucun des deux ne la recalcule : deux définitions de la même égalité divergeraient, et une
 * question comptée reprise par le tirage sortirait de la tendance sans que rien ne le dise. Elle vit
 * dans `analysis/`, que `pipeline/` importe ; l'inverse est interdit (CLAUDE.md, « Architecture »).
 */

/** La part d'une question que la signature lit : son identifiant et l'empreinte de chaque texte. */
export interface QuestionSignable {
  readonly id: string;
  readonly formulations: readonly { readonly empreinte_texte: string }[];
}

/**
 * Identifiant, puis les empreintes des formulations triées : l'ordre du tableau n'est pas une
 * propriété de la question, un texte changé l'est. Le séparateur U+0000 ne figure ni dans un
 * identifiant ni dans une empreinte hexadécimale.
 */
export function signatureQuestion(question: QuestionSignable): string {
  const empreintes = question.formulations.map((formulation) => formulation.empreinte_texte).sort();
  return `${question.id}\0${empreintes.join("\0")}`;
}

/**
 * §8 (protocole 0.9) : « une question dont un texte a changé sort de la comparaison, et leur
 * nombre est publié ». Les identifiants présents aux deux runs dont la signature diffère, triés.
 * Une question absente de l'un des deux runs n'est pas une question au texte changé : elle est
 * neuve, ou retirée.
 */
export function questionsAuTexteChange(
  premier: readonly QuestionSignable[],
  dernier: readonly QuestionSignable[],
): readonly string[] {
  const signaturesDernier = new Map(dernier.map((question) => [question.id, signatureQuestion(question)]));
  return premier
    .filter((question) => {
      const apres = signaturesDernier.get(question.id);
      return apres !== undefined && apres !== signatureQuestion(question);
    })
    .map((question) => question.id)
    .sort();
}
