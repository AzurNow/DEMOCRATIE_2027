/**
 * Le taux de changement du test contrefactuel des noms de candidats, et la décision de retrait
 * (§7 : « Une note qui change avec le nom seul révèle un biais du juge. Le taux de changement est
 * publié ; au-delà de 3 %, le juge concerné est retiré du run et l'échantillon humain passe à
 * 25 %. »).
 *
 * Entrées : le run (ses deux juges, aucun encore retiré : D14 (1), le test précède la notation des
 * autres réponses), le sous-ensemble tiré (`echantillons.ts`), une paire par réponse du
 * sous-ensemble (réponse d'origine, réponse contrefactuelle, textes de vérification des deux côtés,
 * mentions résiduelles), et les notations des juges sur ces réponses : d'origine, contexte `run`
 * et motif `notation_juge`, notations ordinaires du run, réutilisées ensuite par la règle de
 * décision (D14 (1)) ; permutées, contexte `contrefactuel_candidat` et motif `contrefactuel`, sur la
 * réponse contrefactuelle.
 *
 * Les règles, pour chaque juge déclaré au run :
 *
 * 1. **Incohérence.** Une notation d'un autre run, d'un humain, d'un juge inconnu, d'un objet hors
 *    des paires, sous un contexte ou un motif qui ne correspond pas à son côté, ou deux notations
 *    d'un même juge sur un objet, lèvent `ContrefactuelIncoherent`. Une notation `indeterminee` d'un
 *    juge lève `JugeIndetermine` (§7). Rien n'est ignoré.
 * 2. **Paire incomplète.** S'il manque une notation, d'un côté ou de l'autre, pour un juge et une
 *    réponse, le test est `en_attente` et liste toutes les paires incomplètes : aucun taux n'est
 *    calculé sur un jeu incomplet (D16 (2)), pour aucun juge.
 * 3. **Changement.** Une paire change quand l'extrait justificatif de l'une des deux notations est
 *    invalide (`extrait.ts:controlerExtrait`, contre les textes de son côté ; D16 (2)), ou quand les
 *    deux notations ne concordent pas sur la catégorie, les drapeaux et la fraîcheur (pas le motif)
 *    (`analysis/note-lue.ts:notesContrefactuellesConcordent`, D14 (3) précisée par D30 (1)) :
 *    le soutien des liens n'y entre pas, le texte des pages citées n'étant pas permuté.
 * 3 bis. **Renvois (D31 (1)).** Une paire dont l'un des côtés au moins porte un renvoi de CE juge
 *    vers l'humain (D30 (2), `renvois`) est écartée de son numérateur et de son dénominateur, et
 *    comptée à part (`paires_ecartees`). Un côté renvoyé n'est pas manquant. Toutes les paires
 *    écartées : le taux du juge est indéfini (`toutes_paires_ecartees`), jamais 0 %, et il n'est pas
 *    retiré (rien ne mesure son biais) ; le critère go/no-go est alors rouge (effectifs absents).
 * 4. **Taux et retrait.** Taux = changements / paires comptées (le sous-ensemble moins les paires
 *    écartées au 3 bis). Retrait si `changements × 100 > 3 × n`, `n` les paires comptées, en entiers : « au-delà de 3 % » est strict (6 sur 200 n'est pas
 *    retiré, 7 l'est).
 * 5. **Issue.** Aucun retrait : échantillon humain à 10 % ; un seul : 25 %. Les deux : le run est
 *    invalide, avec sa raison, et aucun juge n'est retenu (D16 (3)).
 *
 * Un sous-ensemble vide (aucune réponse éligible) n'a pas de taux : l'état est `indefini`, aucun
 * juge n'est retiré, et le taux n'est jamais 0 %. Le drapeau `sous_effectif` du tirage et le total
 * des mentions résiduelles (`permutation.ts`) accompagnent tout résultat.
 */

import { notesContrefactuellesConcordent } from "../../analysis/note-lue.ts";
import type { Ulid } from "../../analysis/types.ts";
import { JugeIndetermine } from "./decision.ts";
import { comparerChaines, type SousEnsembleContrefactuel } from "./echantillons.ts";
import { controlerExtrait, type TextesDeVerification } from "./extrait.ts";
import { TAUX_ECHANTILLON_APRES_RETRAIT, TAUX_ECHANTILLON_SANS_RETRAIT } from "./taux-echantillon.ts";
import type { NotationIndividuelle, RenvoiHumain, RunDeNotation, TauxEchantillonHumain } from "./types.ts";

/** §7 : « au-delà de 3 % », en fraction exacte. */
export const SEUIL_RETRAIT = { numerateur: 3, denominateur: 100 } as const;

/**
 * §7 : « au-delà de 3 % », en entiers stricts (constat 16 de la revue du 2026-10-12) :
 * `n × 100 > 3 × d`. Seule définition de la comparaison au seuil de retrait ; `controle-croise.ts`
 * et `go-no-go/criteres-juges.ts` l'appellent, pour qu'une copie qui passerait à `>=` ne diverge
 * jamais des deux autres.
 */
export function depasseSeuilRetrait(n: number, d: number): boolean {
  return n * SEUIL_RETRAIT.denominateur > SEUIL_RETRAIT.numerateur * d;
}

export interface PaireContrefactuelle {
  /** La réponse d'origine, membre du sous-ensemble. */
  readonly reponse_id: Ulid;
  readonly contrefactuelle_id: Ulid;
  readonly textes_origine: TextesDeVerification;
  readonly textes_permutes: TextesDeVerification;
  /** `reponse-contrefactuelle.ts:DemandePermutee.mentions_residuelles`. */
  readonly mentions_residuelles: number;
}

export interface EntreeContrefactuel {
  readonly run: RunDeNotation;
  readonly sous_ensemble: SousEnsembleContrefactuel;
  readonly paires: readonly PaireContrefactuelle[];
  readonly notations: readonly NotationIndividuelle[];
  /** Les renvois de juge portant sur un côté des paires (D30 (2), D31 (1)). */
  readonly renvois: readonly RenvoiHumain[];
}

export interface TauxDeChangement {
  readonly numerateur: number;
  readonly denominateur: number;
  readonly valeur: number;
}

/** Noms de champ de `run.schema.json#/properties/juges` là où ils existent. */
export type ResultatJuge =
  | {
      readonly juge_id: string;
      readonly taux: TauxDeChangement;
      /** `taux.valeur`, sous le nom que le run stocke. */
      readonly taux_changement_contrefactuel: number;
      /** D31 (1) : paires écartées par un renvoi de ce juge. */
      readonly paires_ecartees_contrefactuel: number;
      readonly retire: boolean;
      readonly motif_retrait?: string;
    }
  | {
      readonly juge_id: string;
      /** D31 (1) : toutes les paires sont écartées ; aucun taux, aucun retrait. */
      readonly motif_indefini_contrefactuel: "toutes_paires_ecartees";
      readonly paires_ecartees_contrefactuel: number;
      readonly retire: false;
    };

export interface PaireIncomplete {
  readonly reponse_id: Ulid;
  readonly juge_id: string;
  readonly manque: readonly ("origine" | "permutee")[];
}

interface Commun {
  readonly sous_effectif: boolean;
  readonly mentions_residuelles: number;
}

export type ResultatContrefactuel =
  | (Commun & { readonly statut: "en_attente"; readonly paires_incompletes: readonly PaireIncomplete[] })
  | (Commun & { readonly statut: "indefini"; readonly motif: "aucune_reponse_eligible"; readonly taux_echantillon_humain: typeof TAUX_ECHANTILLON_SANS_RETRAIT })
  | (Commun & { readonly statut: "termine"; readonly juges: readonly ResultatJuge[]; readonly taux_echantillon_humain: TauxEchantillonHumain })
  | (Commun & { readonly statut: "run_invalide"; readonly raison: string; readonly juges: readonly ResultatJuge[] });

export class ContrefactuelIncoherent extends Error {
  constructor(detail: string) {
    super(`Test contrefactuel : ${detail}`);
    this.name = "ContrefactuelIncoherent";
  }
}

type Cote = "origine" | "permutee";

/** Ce que chaque côté exige d'une notation de juge. */
const ATTENDU_DU_COTE: Readonly<Record<Cote, { readonly contexte: string; readonly motif: string }>> = {
  origine: { contexte: "run", motif: "notation_juge" },
  permutee: { contexte: "contrefactuel_candidat", motif: "contrefactuel" },
};

/** Où se trouve un objet noté : quelle paire, quel côté. */
interface Place {
  readonly paire: PaireContrefactuelle;
  readonly cote: Cote;
}

export function testerContrefactuel(entree: EntreeContrefactuel): ResultatContrefactuel {
  const juges = jugesDuTest(entree.run);
  const places = indexerPaires(entree);
  const notations = indexerNotations(entree, juges, places);
  const renvois = indexerRenvois(entree, juges, places, notations);
  const commun: Commun = {
    sous_effectif: entree.sous_ensemble.sous_effectif,
    mentions_residuelles: entree.paires.reduce((total, paire) => total + paire.mentions_residuelles, 0),
  };
  if (entree.paires.length === 0) return { ...commun, statut: "indefini", motif: "aucune_reponse_eligible", taux_echantillon_humain: TAUX_ECHANTILLON_SANS_RETRAIT };
  const incompletes = pairesIncompletes(entree.paires, juges, notations, renvois);
  if (incompletes.length > 0) return { ...commun, statut: "en_attente", paires_incompletes: incompletes };
  return issue(commun, juges.map((juge_id) => resultatDuJuge(juge_id, entree.paires, notations, renvois)));
}

/* ------------------------------------------------------------------ entrées */

/** §7 : deux juges distincts ; D14 (1) : aucun n'est encore retiré quand le test s'exécute. */
function jugesDuTest(run: RunDeNotation): readonly string[] {
  const ids = run.juges.map((juge) => juge.juge_id);
  if (ids.length !== 2 || new Set(ids).size !== 2) {
    throw new ContrefactuelIncoherent(`le run ${run.id} déclare ${ids.length} juge(s) distincts au lieu de deux (§7).`);
  }
  const retires = run.juges.filter((juge) => juge.retire).map((juge) => juge.juge_id);
  if (retires.length > 0) {
    throw new ContrefactuelIncoherent(`juge(s) déjà retiré(s) (${retires.join(", ")}) : le test précède tout retrait (D14 (1)).`);
  }
  return [...ids].sort(comparerChaines);
}

/** Une paire par réponse du sous-ensemble, et rien d'autre ; chaque objet n'apparaît qu'une fois. */
function indexerPaires(entree: EntreeContrefactuel): ReadonlyMap<Ulid, Place> {
  const attendues = new Set(entree.sous_ensemble.reponse_ids);
  const places = new Map<Ulid, Place>();
  for (const paire of entree.paires) {
    if (!attendues.delete(paire.reponse_id)) {
      throw new ContrefactuelIncoherent(`la paire de la réponse ${paire.reponse_id} n'appartient pas au sous-ensemble, ou y figure deux fois.`);
    }
    placer(places, paire.reponse_id, { paire, cote: "origine" });
    placer(places, paire.contrefactuelle_id, { paire, cote: "permutee" });
  }
  if (attendues.size > 0) throw new ContrefactuelIncoherent(`réponse(s) du sous-ensemble sans réponse contrefactuelle : ${[...attendues].join(", ")}.`);
  return places;
}

function placer(places: Map<Ulid, Place>, objet_id: Ulid, place: Place): void {
  if (places.has(objet_id)) throw new ContrefactuelIncoherent(`l'objet ${objet_id} figure deux fois dans les paires.`);
  places.set(objet_id, place);
}

/** Les notations, indexées par juge puis objet noté, après les contrôles de la règle 1. */
function indexerNotations(
  entree: EntreeContrefactuel,
  juges: readonly string[],
  places: ReadonlyMap<Ulid, Place>,
): ReadonlyMap<string, NotationIndividuelle> {
  const index = new Map<string, NotationIndividuelle>();
  for (const notation of entree.notations) {
    verifierNotation(notation, entree.run.id, juges, places);
    const cle = cleNotation(notation.notateur.id, notation.objet_note.id);
    if (index.has(cle)) throw new ContrefactuelIncoherent(`deux notations du juge ${notation.notateur.id} sur l'objet ${notation.objet_note.id}.`);
    index.set(cle, notation);
  }
  return index;
}

function verifierNotation(notation: NotationIndividuelle, run_id: Ulid, juges: readonly string[], places: ReadonlyMap<Ulid, Place>): void {
  const place = notation.objet_note.type === "reponse" ? places.get(notation.objet_note.id) : undefined;
  if (notation.run_id !== run_id || place === undefined) {
    throw new ContrefactuelIncoherent(
      `la notation ${notation.id} porte sur ${notation.objet_note.type} ${notation.objet_note.id} du run ${notation.run_id}, hors des paires du test.`,
    );
  }
  if (notation.notateur.type !== "juge" || !juges.includes(notation.notateur.id)) {
    throw new ContrefactuelIncoherent(`la notation ${notation.id} vient de ${notation.notateur.type} ${notation.notateur.id}, qui n'est pas un juge du run.`);
  }
  if (notation.categorie === "indeterminee") throw new JugeIndetermine(notation);
  const attendu = ATTENDU_DU_COTE[place.cote];
  if (notation.contexte !== attendu.contexte || notation.motif_notation !== attendu.motif) {
    throw new ContrefactuelIncoherent(
      `la notation ${notation.id} (côté ${place.cote}) porte le contexte ${notation.contexte} et le motif ${String(notation.motif_notation)} ; ` +
        `attendus : ${attendu.contexte} et ${attendu.motif}.`,
    );
  }
}

/**
 * Les renvois, indexés comme les notations. Un renvoi hors des paires, d'un autre run, d'un juge
 * inconnu, sous le contexte d'un autre côté, en double, ou à côté d'une notation du même juge sur
 * le même objet est incohérent.
 */
function indexerRenvois(
  entree: EntreeContrefactuel,
  juges: readonly string[],
  places: ReadonlyMap<Ulid, Place>,
  notations: ReadonlyMap<string, NotationIndividuelle>,
): ReadonlySet<string> {
  const index = new Set<string>();
  for (const renvoi of entree.renvois) {
    verifierRenvoi(renvoi, entree.run.id, juges, places);
    const cle = cleNotation(renvoi.notateur.id, renvoi.objet_note.id);
    if (index.has(cle) || notations.has(cle)) throw new ContrefactuelIncoherent(`le juge ${renvoi.notateur.id} porte plusieurs issues (notation ou renvoi) sur l'objet ${renvoi.objet_note.id}.`);
    index.add(cle);
  }
  return index;
}

function verifierRenvoi(renvoi: RenvoiHumain, run_id: Ulid, juges: readonly string[], places: ReadonlyMap<Ulid, Place>): void {
  const place = places.get(renvoi.objet_note.id);
  const contexte = place === undefined ? undefined : ATTENDU_DU_COTE[place.cote].contexte;
  if (renvoi.run_id !== run_id || place === undefined || !juges.includes(renvoi.notateur.id) || renvoi.contexte !== contexte) {
    throw new ContrefactuelIncoherent(`le renvoi ${renvoi.id} (juge ${renvoi.notateur.id}, contexte ${renvoi.contexte}) porte sur ${renvoi.objet_note.id}, hors des paires du test ou d'un autre côté.`);
  }
}

function cleNotation(juge_id: string, objet_id: Ulid): string {
  return `${juge_id}\u0000${objet_id}`;
}

/* ------------------------------------------------------------------ complétude */

function pairesIncompletes(
  paires: readonly PaireContrefactuelle[],
  juges: readonly string[],
  notations: ReadonlyMap<string, NotationIndividuelle>,
  renvois: ReadonlySet<string>,
): PaireIncomplete[] {
  const incompletes: PaireIncomplete[] = [];
  for (const paire of paires) {
    for (const juge_id of juges) {
      const manque = manquesDe(paire, juge_id, notations, renvois);
      if (manque.length > 0) incompletes.push({ reponse_id: paire.reponse_id, juge_id, manque });
    }
  }
  return incompletes;
}

/** Un côté renvoyé (D31 (1)) n'est pas manquant. */
function manquesDe(paire: PaireContrefactuelle, juge_id: string, notations: ReadonlyMap<string, NotationIndividuelle>, renvois: ReadonlySet<string>): Cote[] {
  const present = (objet_id: Ulid): boolean => notations.has(cleNotation(juge_id, objet_id)) || renvois.has(cleNotation(juge_id, objet_id));
  const manque: Cote[] = [];
  if (!present(paire.reponse_id)) manque.push("origine");
  if (!present(paire.contrefactuelle_id)) manque.push("permutee");
  return manque;
}

/* ------------------------------------------------------------------ taux et retrait */

function resultatDuJuge(
  juge_id: string,
  paires: readonly PaireContrefactuelle[],
  notations: ReadonlyMap<string, NotationIndividuelle>,
  renvois: ReadonlySet<string>,
): ResultatJuge {
  const renvoyee = (paire: PaireContrefactuelle): boolean => renvois.has(cleNotation(juge_id, paire.reponse_id)) || renvois.has(cleNotation(juge_id, paire.contrefactuelle_id));
  const comptees = paires.filter((paire) => !renvoyee(paire));
  const paires_ecartees_contrefactuel = paires.length - comptees.length;
  if (comptees.length === 0) return { juge_id, motif_indefini_contrefactuel: "toutes_paires_ecartees", paires_ecartees_contrefactuel, retire: false };
  const changements = comptees.filter((paire) => change(paire, juge_id, notations)).length;
  const taux = { numerateur: changements, denominateur: comptees.length, valeur: changements / comptees.length };
  const retire = depasseSeuilRetrait(changements, comptees.length);
  return {
    juge_id,
    taux,
    taux_changement_contrefactuel: taux.valeur,
    paires_ecartees_contrefactuel,
    retire,
    ...(retire ? { motif_retrait: `Test contrefactuel des noms de candidats : ${changements} changements sur ${comptees.length}, au-delà de 3 % (§7).` } : {}),
  };
}

/** D16 (2) : un extrait invalide d'un côté ou de l'autre est un changement ; sinon, D14 (3) sans le sourçage (D30 (1)). */
function change(paire: PaireContrefactuelle, juge_id: string, notations: ReadonlyMap<string, NotationIndividuelle>): boolean {
  const origine = exiger(notations, juge_id, paire.reponse_id);
  const permutee = exiger(notations, juge_id, paire.contrefactuelle_id);
  if (!controlerExtrait(origine, paire.textes_origine).valide) return true;
  if (!controlerExtrait(permutee, paire.textes_permutes).valide) return true;
  return !notesContrefactuellesConcordent(origine, permutee);
}

function exiger(notations: ReadonlyMap<string, NotationIndividuelle>, juge_id: string, objet_id: Ulid): NotationIndividuelle {
  const notation = notations.get(cleNotation(juge_id, objet_id));
  if (notation === undefined) throw new ContrefactuelIncoherent(`notation du juge ${juge_id} sur ${objet_id} introuvable après le contrôle de complétude.`);
  return notation;
}

function issue(commun: Commun, juges: readonly ResultatJuge[]): ResultatContrefactuel {
  const retires = juges.filter((juge) => juge.retire).length;
  if (retires === juges.length) {
    return {
      ...commun,
      statut: "run_invalide",
      raison: "Les deux juges dépassent 3 % de changement au test contrefactuel des noms de candidats : aucun juge n'est retenu (§7, D16 (3)).",
      juges,
    };
  }
  return { ...commun, statut: "termine", juges, taux_echantillon_humain: retires === 0 ? TAUX_ECHANTILLON_SANS_RETRAIT : TAUX_ECHANTILLON_APRES_RETRAIT };
}
