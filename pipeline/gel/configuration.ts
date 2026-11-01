/**
 * `config/gel.json` : ce que `run.json` exige et qu'aucune autre source du dépôt ne porte (lot gel,
 * décision D41). Rempli à la main par l'auteur, livré à `null`, validé contre
 * `schema/config-gel.schema.json`.
 *
 * Trois refus, chacun nommé, jamais une valeur par défaut :
 *   1. JSON illisible ou clé répétée (`JSON.parse` n'en garderait que la dernière) :
 *      `ConfigurationGelIllisible` ;
 *   2. non conforme au schéma (clé inconnue ou absente, forme fausse) : `ErreurSchema`, qui nomme
 *      chaque chemin fautif ;
 *   3. un champ resté `null` : `ConfigurationGelIncomplete`, qui nomme chaque champ.
 */

import { readFileSync } from "node:fs";
import { valider } from "../../outils/schemas/valider.ts";
import { exigerFamillesDistinctes } from "../notation/familles-juges.ts";
import { premiereCleDupliquee } from "../reformulation/cles-dupliquees.ts";

/** `config-gel#/$defs/juge` : ce qu'un juge porte au gel. */
export interface JugeAuGel {
  readonly juge_id: string;
  readonly famille_modele: string;
  readonly modele: string;
  readonly version_prompt: string;
}

/** `config/gel.json`, une fois conforme au schéma : un brouillon y est conforme. */
interface ConfigurationSaisie {
  readonly version_protocole: string | null;
  readonly fenetre_debut: string | null;
  readonly juges: readonly JugeAuGel[] | null;
  readonly alias_aveugles: Readonly<Record<string, string>> | null;
}

/** Le même, sans aucun `null` : ce que le gel lit. */
export interface ConfigurationGel {
  readonly version_protocole: string;
  readonly fenetre_debut: string;
  readonly juges: readonly JugeAuGel[];
  /** `outil_id` → alias aveugle (§7), tel que `charger-perimetre.ts:ContexteDuGel` le reçoit. */
  readonly alias_aveugles: ReadonlyMap<string, string>;
}

export class ConfigurationGelIllisible extends Error {
  constructor(provenance: string, detail: string) {
    super(`${provenance} : paramètres du gel illisibles, ${detail}`);
    this.name = "ConfigurationGelIllisible";
  }
}

/** Un brouillon présenté pour un gel : chaque champ resté `null` est nommé. */
export class ConfigurationGelIncomplete extends Error {
  readonly champs: readonly string[];

  constructor(provenance: string, champs: readonly string[]) {
    super(
      `${provenance} : paramètres du gel incomplets, champ(s) à null : ${champs.join(", ")}. ` +
        `À remplir par l'auteur ; aucune valeur par défaut n'est appliquée.`,
    );
    this.name = "ConfigurationGelIncomplete";
    this.champs = champs;
  }
}

function lireTexte(texte: string, provenance: string): unknown {
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch (erreur) {
    if (!(erreur instanceof SyntaxError)) throw erreur;
    throw new ConfigurationGelIllisible(provenance, `JSON illisible (${erreur.message}).`);
  }
  const repetee = premiereCleDupliquee(texte);
  if (repetee !== null) throw new ConfigurationGelIllisible(provenance, `clé « ${repetee} » répétée.`);
  return valeur;
}

function sansNull(saisie: ConfigurationSaisie): ConfigurationGel | null {
  const { version_protocole, fenetre_debut, juges, alias_aveugles } = saisie;
  if (version_protocole === null || fenetre_debut === null) return null;
  if (juges === null || alias_aveugles === null) return null;
  return { version_protocole, fenetre_debut, juges, alias_aveugles: new Map(Object.entries(alias_aveugles)) };
}

/** Le texte du fichier, validé ; lève en nommant la provenance et chaque champ fautif. */
export function validerConfigurationGel(texte: string, provenance: string): ConfigurationGel {
  const saisie = valider<ConfigurationSaisie>("config-gel", lireTexte(texte, provenance), provenance);
  const champs: readonly (readonly [string, unknown])[] = [
    ["version_protocole", saisie.version_protocole],
    ["fenetre_debut", saisie.fenetre_debut],
    ["juges", saisie.juges],
    ["alias_aveugles", saisie.alias_aveugles],
  ];
  const nuls = champs.filter(([, valeur]) => valeur === null).map(([nom]) => nom);
  const complete = sansNull(saisie);
  if (nuls.length > 0 || complete === null) throw new ConfigurationGelIncomplete(provenance, nuls);
  // §7.12 : la même règle que la notation (`chaine.ts:verifierJuges`), refusée ici avant tout gel.
  exigerFamillesDistinctes(complete.juges);
  return complete;
}

export function lireConfigurationGel(chemin: string): ConfigurationGel {
  return validerConfigurationGel(readFileSync(chemin, "utf8"), chemin);
}
