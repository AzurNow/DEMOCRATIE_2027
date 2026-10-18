/**
 * Partagé par les commandes qui attrapaient toute erreur à leur sommet, perdant la pile d'un bogue
 * derrière un message d'une ligne (revue du 2026-10-17, constat 20 ; revue du 2026-10-12,
 * constat 32) : `outils/geler.ts`, `run-invalider.ts`, `arbitrer.ts`, `contester.ts`, `panel.ts`.
 *
 * Un refus métier de ce dépôt est soit une classe nommée (`this.name = "…"` dans son constructeur,
 * la convention de tout le code de production), soit une instance nue de `Error` : c'est ainsi que
 * `outils/arguments.ts:obligatoire` et la plupart des contrôles de ligne de commande signalent une
 * entrée refusée, sans sous-classe dédiée. Un bogue JavaScript — accès sur `undefined`, mauvais
 * type, référence absente — lève l'une des classes natives ci-dessous : jamais une classe que ce
 * dépôt écrit lui-même. C'est elle, seule, qui doit remonter avec sa pile.
 */

const CLASSES_DE_BOGUE: ReadonlySet<new (...arguments_: never[]) => Error> = new Set([
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
  EvalError,
  URIError,
]);

/** Vrai si `erreur` est un refus métier attendu (classe nommée ou `Error` nue) ; faux pour un bogue. */
export function estUnRefusAttendu(erreur: unknown): erreur is Error {
  return erreur instanceof Error && !CLASSES_DE_BOGUE.has(erreur.constructor as new (...arguments_: never[]) => Error);
}
