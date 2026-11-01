/**
 * Accès typé aux éléments de la page : l'absence d'un élément, ou son type inattendu, est une erreur
 * nommée qui dit l'identifiant, au lieu d'un `as` qui la repousse à une erreur lointaine.
 * (Un module par client : les deux `tsconfig` ont des `rootDir` différents et notation-humaine/client
 * n'importe rien du dépôt ; le jumeau vit dans notation-humaine/client/dom-type.ts.)
 *
 * Le module ne nomme aucun type du DOM : les tests le chargent sous le `tsconfig` racine, qui n'a pas
 * la bibliothèque DOM. `document` est redéclaré ici, à la forme de ce dont il sert.
 */

/** Ce que ce module demande à `document` : de retrouver un nœud par son identifiant. */
export interface Racine {
  getElementById(id: string): object | null;
}

declare const document: Racine;

/** Un constructeur d'élément du DOM (`HTMLButtonElement`, …), abstrait pour accepter les deux formes. */
export type TypeElement<T> = abstract new (...args: never[]) => T;

export class ElementAbsent extends Error {
  readonly identifiant: string;

  constructor(identifiant: string) {
    super(`Élément #${identifiant} absent de la page.`);
    this.name = "ElementAbsent";
    this.identifiant = identifiant;
  }
}

export class ElementDeMauvaisType extends Error {
  readonly identifiant: string;

  constructor(identifiant: string, attendu: string) {
    super(`Élément #${identifiant} de type inattendu : ${attendu} attendu.`);
    this.name = "ElementDeMauvaisType";
    this.identifiant = identifiant;
  }
}

/** L'élément d'identifiant `id`, absent ⇒ `null` ; présent mais d'un autre type ⇒ `ElementDeMauvaisType`. */
export function elementFacultatif<T>(id: string, type: TypeElement<T>, racine: Racine = document): T | null {
  const noeud = racine.getElementById(id);
  if (noeud === null) return null;
  if (!(noeud instanceof type)) throw new ElementDeMauvaisType(id, type.name);
  return noeud;
}

/** L'élément d'identifiant `id`, du type demandé ; absent ⇒ `ElementAbsent`. */
export function elementParId<T>(id: string, type: TypeElement<T>, racine: Racine = document): T {
  const noeud = elementFacultatif(id, type, racine);
  if (noeud === null) throw new ElementAbsent(id);
  return noeud;
}
