/**
 * §7 (exigence §7.12) : « Deux juges de familles différentes (par exemple un modèle Anthropic et un
 * modèle Mistral) notent chaque réponse indépendamment. »
 *
 * La famille d'un juge est une donnée : `famille_modele`, champ obligatoire de chaque juge déclaré
 * dans `run.json` (`run.schema.json#/properties/juges`) et dans `config/gel.json`. Elle n'est jamais
 * déduite d'un nom de modèle, et aucune famille n'est nommée dans le code.
 *
 * **Refus.** La chaîne de notation (`chaine.ts:verifierJuges`) appelle `exigerFamillesDistinctes`
 * sur les juges que déclare `run.json`, avant toute écriture :
 *
 * - une famille absente, vide ou faite seulement d'espaces lève `FamilleDeJugeAbsente` ; aucune
 *   famille n'est supposée ;
 * - deux juges déclarés de la même famille lèvent `JugesDeMemeFamille`.
 *
 * **Comparaison.** Deux familles sont la même quand leurs clés (`cleDeFamille`) sont égales :
 * normalisation NFC, espaces de bord retirés, minuscules. « Anthropic » et « anthropic » désignent le
 * même éditeur : une comparaison sensible à la casse laisserait passer deux juges d'une même famille
 * pour une faute de frappe. Le sens de l'erreur est donc le refus, jamais l'acceptation. Les espaces
 * intérieurs et la ponctuation ne sont pas touchés : « mistral-ai » et « mistral ai » restent deux
 * familles distinctes, et c'est à l'auteur de déclarer la même chaîne pour le même éditeur.
 *
 * **Juges retirés.** La règle porte sur tous les juges déclarés, retirés compris : le retrait (§7,
 * test contrefactuel) ne change pas la composition déclarée du run. Un juge resté seul après le
 * retrait de l'autre ne déclenche donc aucun refus : les deux familles déclarées restent distinctes.
 */

export interface JugeAFamille {
  readonly juge_id: string;
  readonly famille_modele?: string | undefined;
}

export class FamilleDeJugeAbsente extends Error {
  constructor(juge_id: string) {
    super(`Juge ${juge_id} : famille de modèle absente ou vide (§7 : deux juges de familles différentes). Aucune famille n'est supposée ; rien n'est écrit.`);
    this.name = "FamilleDeJugeAbsente";
  }
}

export class JugesDeMemeFamille extends Error {
  constructor(premier: string, second: string, famille: string) {
    super(`Juges ${premier} et ${second} : même famille de modèle (« ${famille} ») ; le §7 exige deux juges de familles différentes. Rien n'est écrit.`);
    this.name = "JugesDeMemeFamille";
  }
}

/** La clé de comparaison d'une famille : NFC, sans espaces de bord, en minuscules. Vide si absente. */
export function cleDeFamille(famille: string | undefined): string {
  if (typeof famille !== "string") return "";
  return famille.normalize("NFC").trim().toLowerCase();
}

/** §7.12 : chaque juge déclaré a une famille, et deux juges déclarés n'en partagent jamais une. */
export function exigerFamillesDistinctes(juges: readonly JugeAFamille[]): void {
  const vues = new Map<string, string>();
  for (const juge of juges) {
    const cle = cleDeFamille(juge.famille_modele);
    if (cle === "") throw new FamilleDeJugeAbsente(juge.juge_id);
    const deja = vues.get(cle);
    if (deja !== undefined) throw new JugesDeMemeFamille(deja, juge.juge_id, cle);
    vues.set(cle, juge.juge_id);
  }
}
