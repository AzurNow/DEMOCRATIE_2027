/**
 * Contexte d'exécution de l'écran de notation humaine.
 *
 * Comme pour l'interface de validation, l'identité de l'annotateur vient de l'environnement
 * (`ANNOTATEUR_ID`), lue une fois : jamais un paramètre de requête, jamais un champ de formulaire.
 * Lire les tâches ou la notation d'un autre annotateur est ainsi inexprimable, pas seulement interdit.
 *
 * Ce que le contexte porte : les données immuables du run, le dépôt d'écriture des notations
 * (`DepotNotation`, règle 7), le fournisseur d'existences (injecté), et trois effets isolés pour que
 * les tests les maîtrisent : la lecture des notations, l'horloge, l'identifiant.
 */

import { lireNotationsDuRun } from "../../analysis/lecture-run.ts";
import { exigerPseudonyme } from "../../pipeline/notation/notation-humaine.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import type { NotationIndividuelle, RenvoiHumain } from "../../analysis/types-notation.ts";
import { validerFragment } from "../../outils/schemas/valider.ts";
import { ulid } from "../../validation/domaine/ulid.ts";
import { instantLocal } from "../../validation/serveur/contexte.ts";
import { chargerRun, type DonneesRun } from "./chargement.ts";
import type { FournisseurExistences } from "./fournisseur.ts";

export interface Contexte {
  readonly annotateur_id: string;
  readonly donnees: DonneesRun;
  readonly depot: DepotNotation;
  readonly existences: FournisseurExistences;
  /** Relues à chaque appel : une notation écrite pendant la session change la file. */
  notations(): readonly NotationIndividuelle[];
  /** Les renvois de juge (D30 (2)), relus de même. */
  renvois(): readonly RenvoiHumain[];
  maintenant(): string;
  nouvelId(): string;
}

export interface OptionsContexte {
  readonly repertoire_run: string;
  /** `data/items/`, dans le dépôt Git qui porte le commit du gel. */
  readonly repertoire_items: string;
  readonly annotateur_id: string;
  readonly existences: FournisseurExistences;
}

/** Le pseudonyme est exigé non vide, puis contre le schéma : c'est lui que porte `notateur.id`. */
export function exigerPseudonymeValide(annotateur_id: string): void {
  exigerPseudonyme(annotateur_id);
  validerFragment("notation", "#/properties/notateur/properties/id", annotateur_id, "pseudonyme de l'annotateur");
}

export function pseudonymeDepuisEnvironnement(env: NodeJS.ProcessEnv): string {
  const annotateur_id = env["ANNOTATEUR_ID"];
  if (annotateur_id === undefined) {
    throw new Error("ANNOTATEUR_ID n'est pas défini. Le pseudonyme est une variable d'environnement, jamais un choix fait dans l'écran :\n  ANNOTATEUR_ID=a1 pnpm notation:humaine <répertoire du run>");
  }
  return annotateur_id;
}

export function creerContexte(options: OptionsContexte): Contexte {
  exigerPseudonymeValide(options.annotateur_id);
  const donnees = chargerRun(options.repertoire_run, options.repertoire_items);
  return {
    annotateur_id: options.annotateur_id,
    donnees,
    depot: DepotNotation.ouvrir(options.repertoire_run),
    existences: options.existences,
    notations: () => lireNotationsDuRun(options.repertoire_run, donnees.run.id).notations,
    renvois: () => lireNotationsDuRun(options.repertoire_run, donnees.run.id).renvois,
    maintenant: () => instantLocal(new Date()),
    nouvelId: () => ulid(),
  };
}
