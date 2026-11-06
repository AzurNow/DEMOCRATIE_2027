/**
 * Contrôle croisé n° 18, part du contrefactuel d'outil (§7, « Conflit d'intérêts » ; D90), appelée
 * par `controle-croise.ts`. Le bloc `run.json#/contrefactuel_outils` à l'état `termine`
 * (`publication-contrefactuel-outils.ts:publierTermineOutils`) est relu avec ce qui l'a produit :
 *
 * - **le sous-ensemble, rejoué** : les réponses obtenues hors refus de l'API dont le texte projeté
 *   nomme un outil permuté (`derangement-outils.ts:texteNommeUnOutilPermute`, la règle de
 *   `estEligibleOutils`), outils lus à l'instantané du gel (D84), tirées par
 *   `tirerSousEnsembleContrefactuelOutils` avec `run.graines.contrefactuel`, comme dans la chaîne.
 *   Le bloc publie ses éligibles et sa taille ; ils doivent être ceux du tirage rejoué ;
 * - **les juges du run** : « Seuls les juges non retirés au test des candidats sont mesurés » ; un
 *   juge porte `motif_non_mesure` si et seulement s'il est `retire` au run, et chaque juge du run
 *   figure au bloc, une fois ;
 * - **les effectifs de chaque juge mesuré** : son dénominateur plus ses paires écartées font la
 *   taille du sous-ensemble (toutes écartées : ses paires écartées la font seules), et son taux
 *   publié est le quotient exact de ses effectifs, comme au test des candidats ;
 * - **les notations de contexte `contrefactuel_outil` du volume** : chacune porte sur la copie
 *   permutée (`reponses-contrefactuelles/`, contexte `contrefactuel_outil`) d'une réponse du
 *   sous-ensemble rejoué ; celle d'un juge vient d'un juge mesuré.
 *
 * Un bloc indéfini (test non joué, ou joué sans réponse éligible) ou absent n'a rien de tout cela :
 * rien n'est contrôlé, comme avant D90.
 */

import type { RunLu } from "../../analysis/lecture-run.ts";
import type { ContexteMesure, Ulid } from "../../analysis/types.ts";
import type { JugeDuRun, NotationIndividuelle, RunDeNotation } from "../../analysis/types-notation.ts";
import type { Violation } from "./controle-croise.ts";
import { outilsDuContrefactuel, texteNommeUnOutilPermute, type OutilAuGelNomme } from "./derangement-outils.ts";
import { tirerSousEnsembleContrefactuelOutils, type SousEnsembleContrefactuel } from "./echantillons.ts";
import type { BlocContrefactuelOutils, BlocContrefactuelOutilsTermine, JugeContrefactuelOutils } from "./publication-contrefactuel-outils.ts";

/** Une réponse contrefactuelle du volume, réduite à ce qui la rattache à sa réponse d'origine. */
export interface ReponseContrefactuelleDuVolume {
  readonly id: Ulid;
  readonly contexte: ContexteMesure;
  readonly derive_de_reponse_id: Ulid;
}

/** Le bloc publié et de quoi le recouper. */
export interface ContrefactuelOutilsAControler {
  /** `run.json#/contrefactuel_outils`, tel qu'inscrit. */
  readonly bloc: BlocContrefactuelOutils;
  /** `run.json#/perimetre/outils` : l'instantané du gel (D84), d'où se rejoue le sous-ensemble. */
  readonly outils_au_gel: readonly OutilAuGelNomme[];
  /** Les réponses contrefactuelles du volume (`lireNotationsDuRun`). */
  readonly reponses_contrefactuelles: readonly ReponseContrefactuelleDuVolume[];
}

export interface EntreeControleOutils {
  readonly run: RunDeNotation;
  readonly reponses_obtenues: readonly Ulid[];
  readonly refus_api: ReadonlySet<Ulid>;
  readonly textes: ReadonlyMap<Ulid, string>;
  readonly notations: readonly NotationIndividuelle[];
  /** `null` : `run.json` ne porte pas (encore) de contrefactuel d'outil. */
  readonly a_controler: ContrefactuelOutilsAControler | null;
}

/**
 * Ce que le contrôle reçoit d'un run lu (`lireRunJson`, qui valide `run.json` contre son schéma) :
 * `null` quand le bloc n'est pas inscrit, jamais un bloc supposé.
 */
export function contrefactuelOutilsDuRun(run: RunLu, reponses_contrefactuelles: readonly ReponseContrefactuelleDuVolume[]): ContrefactuelOutilsAControler | null {
  const bloc = (run as RunLu & { readonly contrefactuel_outils?: BlocContrefactuelOutils }).contrefactuel_outils;
  if (bloc === undefined) return null;
  return { bloc, outils_au_gel: run.perimetre.outils, reponses_contrefactuelles };
}

export function violationsContrefactuelOutils(entree: EntreeControleOutils): Violation[] {
  const a_controler = entree.a_controler;
  if (a_controler === null) return [];
  const bloc = a_controler.bloc;
  if (bloc.etat !== "termine") return [];
  const rejoue = rejouerSousEnsemble(entree, a_controler.outils_au_gel);
  return [
    ...sousEnsembleNonRejoue(bloc, rejoue),
    ...mesuresIncoherentes(entree.run, bloc),
    ...bloc.juges.flatMap((juge) => effectifsIncoherents(juge, bloc.taille)),
    ...notationsPermutees(entree.notations, a_controler.reponses_contrefactuelles, new Set(rejoue.reponse_ids), jugesMesures(bloc)),
  ];
}

/** Le tirage de la chaîne (`chaine.ts:jouerContrefactuelOutils`), rejoué sur les textes stockés. */
function rejouerSousEnsemble(entree: EntreeControleOutils, outils_au_gel: readonly OutilAuGelNomme[]): SousEnsembleContrefactuel {
  const { permutes, perimetre } = outilsDuContrefactuel(outils_au_gel);
  // Comme `estEligibleOutils` : un refus de l'API n'a pas de texte à permuter, il n'est jamais éligible.
  const eligibles = entree.reponses_obtenues.filter((id) => !entree.refus_api.has(id) && texteNommeUnOutilPermute(texteExige(entree.textes, id), permutes, perimetre));
  return tirerSousEnsembleContrefactuelOutils(eligibles, entree.run.graines.contrefactuel);
}

/** Le texte projeté d'une réponse obtenue ; son absence lève, jamais remplacée par une valeur plausible. */
function texteExige(textes: ReadonlyMap<Ulid, string>, reponse_id: Ulid): string {
  const texte = textes.get(reponse_id);
  if (texte === undefined) {
    throw new Error(`Contrôle croisé : le sous-ensemble du contrefactuel d'outil se rejoue sur la réponse ${reponse_id}, dont le texte projeté n'est pas fourni.`);
  }
  return texte;
}

function sousEnsembleNonRejoue(bloc: BlocContrefactuelOutilsTermine, rejoue: SousEnsembleContrefactuel): Violation[] {
  if (bloc.eligibles === rejoue.eligibles && bloc.taille === rejoue.reponse_ids.length) return [];
  return [
    {
      code: "sous_ensemble_contrefactuel_outils_non_rejoue",
      detail: `contrefactuel_outils publie ${bloc.eligibles} éligible(s) et une taille de ${bloc.taille} ; le tirage rejoué donne ${rejoue.eligibles} éligible(s) et ${rejoue.reponse_ids.length} réponse(s).`,
    },
  ];
}

/** §7 : un juge du run est non mesuré si et seulement s'il est retiré au test des candidats ; chacun figure au bloc. */
function mesuresIncoherentes(run: RunDeNotation, bloc: BlocContrefactuelOutilsTermine): Violation[] {
  const publies = new Map(bloc.juges.map((juge) => [juge.juge_id, juge]));
  const du_run = new Set(run.juges.map((juge) => juge.juge_id));
  return [
    ...run.juges.flatMap((juge) => mesureDuJuge(juge, publies.get(juge.juge_id))),
    ...bloc.juges
      .filter((juge) => !du_run.has(juge.juge_id))
      .map((juge) => ({ code: "mesure_contrefactuel_outils_incoherente" as const, detail: `juge ${juge.juge_id} publié au contrefactuel d'outil, absent des juges du run.` })),
  ];
}

function mesureDuJuge(juge: JugeDuRun, publie: JugeContrefactuelOutils | undefined): Violation[] {
  if (publie === undefined) {
    return [{ code: "mesure_contrefactuel_outils_incoherente", detail: `juge ${juge.juge_id} du run absent de contrefactuel_outils.juges.` }];
  }
  const non_mesure = "motif_non_mesure" in publie;
  if (non_mesure === juge.retire) return [];
  return [
    {
      code: "mesure_contrefactuel_outils_incoherente",
      detail: `juge ${juge.juge_id} : retire vaut ${String(juge.retire)} au run, et il est ${non_mesure ? "publié non mesuré" : "mesuré"} au contrefactuel d'outil (§7 : seuls les juges non retirés au test des candidats sont mesurés).`,
    },
  ];
}

/** Dénominateur + paires écartées = taille (§7), et taux publié = quotient exact des effectifs. */
function effectifsIncoherents(juge: JugeContrefactuelOutils, taille: number): Violation[] {
  if ("motif_non_mesure" in juge) return [];
  const comptees = "changements" in juge ? juge.changements.denominateur : 0;
  const violations: Violation[] = [];
  if (comptees + juge.paires_ecartees !== taille) {
    violations.push({
      code: "denominateur_contrefactuel_outils_incoherent",
      detail: `juge ${juge.juge_id} : ${comptees} paire(s) au dénominateur et ${juge.paires_ecartees} écartée(s), pour un sous-ensemble de ${taille} réponse(s) (contrefactuel_outils.taille).`,
    });
  }
  if ("changements" in juge && juge.taux_changement !== juge.changements.numerateur / juge.changements.denominateur) {
    violations.push({
      code: "taux_contrefactuel_outils_incoherent",
      detail: `juge ${juge.juge_id} : taux_changement ${juge.taux_changement} au lieu de ${juge.changements.numerateur}/${juge.changements.denominateur}.`,
    });
  }
  return violations;
}

function jugesMesures(bloc: BlocContrefactuelOutilsTermine): ReadonlySet<string> {
  return new Set(bloc.juges.filter((juge) => !("motif_non_mesure" in juge)).map((juge) => juge.juge_id));
}

function notationsPermutees(
  notations: readonly NotationIndividuelle[],
  copies: readonly ReponseContrefactuelleDuVolume[],
  sous_ensemble: ReadonlySet<Ulid>,
  mesures: ReadonlySet<string>,
): Violation[] {
  const origines = new Map(copies.filter((copie) => copie.contexte === "contrefactuel_outil").map((copie) => [copie.id, copie.derive_de_reponse_id]));
  return notations
    .filter((notation) => notation.contexte === "contrefactuel_outil")
    .flatMap((notation) => [...horsSousEnsemble(notation, origines, sous_ensemble), ...deJugeNonMesure(notation, mesures)]);
}

/** La notation porte sur la copie permutée d'une réponse du sous-ensemble rejoué, et sur rien d'autre. */
function horsSousEnsemble(notation: NotationIndividuelle, origines: ReadonlyMap<Ulid, Ulid>, sous_ensemble: ReadonlySet<Ulid>): Violation[] {
  const origine = origines.get(notation.objet_note.id);
  if (origine !== undefined && sous_ensemble.has(origine)) return [];
  const objet =
    origine === undefined
      ? `${notation.objet_note.id}, copie d'aucune réponse du volume au contexte contrefactuel_outil`
      : `la copie ${notation.objet_note.id} de la réponse ${origine}, hors du sous-ensemble rejoué`;
  return [{ code: "notation_contrefactuel_outil_hors_sous_ensemble", detail: `notation ${notation.id} (${notation.notateur.type} ${notation.notateur.id}) porte sur ${objet}.` }];
}

function deJugeNonMesure(notation: NotationIndividuelle, mesures: ReadonlySet<string>): Violation[] {
  if (notation.notateur.type !== "juge" || mesures.has(notation.notateur.id)) return [];
  return [
    {
      code: "notation_contrefactuel_outil_de_juge_non_mesure",
      detail: `notation ${notation.id} du juge ${notation.notateur.id}, non mesuré au contrefactuel d'outil (§7 : seuls les juges non retirés au test des candidats sont mesurés).`,
    },
  ];
}
