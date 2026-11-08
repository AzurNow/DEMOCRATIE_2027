/**
 * Diagnostic d'un lot : la **seule** lecture croisée entre deux annotateurs de tout le projet.
 *
 * Elle existe parce que le kappa n'a pas d'autre moyen d'exister. Elle est donc isolée dans ce
 * module, et son type de retour ne contient ni décision, ni rien qui permette de remonter de
 * l'accord à un item précis : des agrégats, et le seul bit inévitable — « l'autre a fini ce
 * lot ». Ce bit est le prix du kappa, il est documenté comme tel, et il ne dit rien d'un item.
 *
 * Une seule exception, qui ne porte sur aucune décision : `absents_du_staging` nomme les items
 * du manifeste introuvables parmi les items chargés. Leur absence est un fait du staging, pas
 * du journal de l'un ou l'autre annotateur, et ils sont déjà nommés par le manifeste du lot.
 */

import { empreinteContenuNotant } from "./empreinte.ts";
import { CLES_GRILLE, reduireEtats } from "./grille.ts";
import {
  accordSuffisant,
  alerteReannotation,
  comptesKappaPublie,
  kappaDepuisComptes,
  kappaQuestion,
  type ResultatKappa,
} from "./kappa.ts";
import type { EtatAnnotateur } from "./journal.ts";
import { appliquerCorrections } from "./promotion.ts";
import type { CleGrille, Decision, EntreeDecision, Grille, Item, Lot } from "./types.ts";

export interface DiagnosticLot {
  readonly lot_id: string;
  readonly les_deux_ont_fini: boolean;
  /** Le chiffre publié et le critère go/no-go : trois catégories, non pondéré. */
  readonly kappa: ResultatKappa;
  /** Diagnostic secondaire, un par question de la grille. */
  readonly kappa_par_question: Readonly<Record<CleGrille, ResultatKappa>>;
  /**
   * Part des items que les deux ont corrigés vers des contenus notants divergents. Un taux qui
   * monte sans que le kappa bouge signale deux annotateurs d'accord sur le sort des items et en
   * désaccord sur leur contenu — ce que le kappa, par construction, ne peut pas voir.
   */
  readonly taux_double_correction_divergente: number | null;
  /**
   * §4 (D65) : kappa ≥ 0,80, ou accord observé ≥ 0,96 avec au plus deux désaccords
   * (`kappa.ts:accordSuffisant`). `null` quand aucun item n'est commun : rien n'est observé.
   */
  readonly accord_suffisant: boolean | null;
  /** L'accord n'est pas suffisant : séance de calibration, puis réannotation décidée par l'auteur. */
  readonly alerte_reannotation: boolean;
  /**
   * Items du lot qu'une contestation vise au moment du calcul, sortis du dénominateur (§4). Un
   * décompte, pas une liste : le diagnostic ne nomme aucun item (voir l'en-tête du module).
   * `kappa.n` est l'effectif publié avec le kappa, contestations déduites.
   */
  readonly exclus_contestation: number;
  /**
   * Items du manifeste introuvables parmi les items chargés (`staging/`, et `data/` que les
   * appelants fusionnent par `itemsEffectifs`) : promus puis retirés, renommés. Ils sortent du
   * dénominateur comme avant (docs/DETTE.md, 2026-09-25, n° 1), mais nommés, dans l'ordre du
   * manifeste ; vide quand aucun ne manque, jamais omis. Leur statut de contestation n'est pas
   * lisible : ils ne comptent pas dans `exclus_contestation`.
   */
  readonly absents_du_staging: readonly string[];
  /** Nombre d'items du manifeste, contestations comprises : distinct de `kappa.n`. */
  readonly taille_lot: number;
  /** Taille fixée par le §4 pour ce lot : 50 (réel), 30 (entraînement), celle de l'origine. */
  readonly taille_attendue: number;
  /**
   * Faux pour un lot écrit avant que `pnpm lots` ne compose que des lots pleins. Son kappa est
   * calculé, mais il n'a pas la variance d'un kappa sur 50 : il ne se lit pas comme tel (§12).
   */
  readonly taille_conforme: boolean;
}

export interface EntreeDiagnostic {
  readonly lot: Lot;
  readonly items: ReadonlyMap<string, Item>;
  /** État rejoué du journal, par annotateur. Exactement deux entrées. */
  readonly etats: ReadonlyMap<string, EtatAnnotateur>;
  /** Taille que le lot devrait compter, voir `lot.ts:tailleAttendue`. */
  readonly taille_attendue: number;
}

interface PaireDecisions {
  readonly item: Item;
  readonly a: EntreeDecision;
  readonly b: EntreeDecision;
}

/**
 * Un item du lot dont le statut de contestation n'est pas dans la table fermée ci-dessous : le
 * kappa n'est pas calculé plutôt que calculé sur une règle inventée.
 */
export class StatutContestationNonTranche extends Error {
  readonly item_id: string;
  readonly statut: string;

  constructor(item_id: string, statut: string) {
    super(
      `Item ${item_id} au statut de contestation inconnu « ${statut} » : ` +
        `sa sortie du dénominateur du kappa n'est pas définie. Kappa non calculé.`,
    );
    this.name = "StatutContestationNonTranche";
    this.item_id = item_id;
    this.statut = statut;
  }
}

/**
 * §4 (0.8) : « Un item sort du dénominateur si une contestation le vise à la date où le kappa du
 * lot est calculé ». Table fermée sur `item.schema.json:statut_contestation`. Décision de l'auteur
 * du 2026-09-25 : une contestation close (`arbitree`, quelle que soit la décision du panel) vise
 * encore l'item. Un item arbitré ne s'affiche plus à l'annotation (`retirerSiConteste`) : le
 * garder ferait de nouveau dépendre le dénominateur de l'ordre de navigation.
 */
const VISE_PAR_UNE_CONTESTATION: ReadonlyMap<string, boolean> = new Map([
  ["aucune", false],
  ["contestee", true],
  ["arbitree", true],
]);

function etatsDesDeux(etats: ReadonlyMap<string, EtatAnnotateur>): readonly [EtatAnnotateur, EtatAnnotateur] {
  if (etats.size !== 2) {
    const liste = [...etats.keys()].join(", ");
    throw new Error(
      `Un diagnostic de lot exige exactement deux annotateurs (reçu : ${etats.size}` +
        `${liste.length > 0 ? `, ${liste}` : ""}).`,
    );
  }
  const [premier, second] = [...etats.keys()].sort();
  return [etats.get(premier as string) as EtatAnnotateur, etats.get(second as string) as EtatAnnotateur];
}

/**
 * Un lot est terminé quand les deux annotateurs ont fini : la définition de `diagnostiquerLot`
 * (`les_deux_ont_fini`), partagée avec le verrou de `verrou-lot.ts`, jamais redéfinie.
 */
export function lesDeuxOntFini(entree: Pick<EntreeDiagnostic, "lot" | "items" | "etats">): boolean {
  const [etatA, etatB] = etatsDesDeux(entree.etats);
  const exclus = exclusPourContestation(entree);
  return aFini(entree, etatA, exclus) && aFini(entree, etatB, exclus);
}

export function diagnostiquerLot(entree: EntreeDiagnostic): DiagnosticLot {
  const [etatA, etatB] = etatsDesDeux(entree.etats);
  const exclus = exclusPourContestation(entree);
  const paires = apparier(entree, etatA, etatB, exclus);
  const comptes = comptesKappaPublie(paires.map((paire) => ({ a: paire.a.decision, b: paire.b.decision })));
  const kappa = kappaDepuisComptes(comptes);

  return {
    lot_id: entree.lot.lot_id,
    les_deux_ont_fini: lesDeuxOntFini(entree),
    kappa,
    kappa_par_question: kappaParQuestion(paires),
    taux_double_correction_divergente: tauxDivergence(paires),
    accord_suffisant: accordSuffisant(comptes),
    alerte_reannotation: alerteReannotation(comptes),
    exclus_contestation: exclus.size,
    absents_du_staging: absentsDesItemsCharges(entree),
    taille_lot: entree.lot.items.length,
    taille_attendue: entree.taille_attendue,
    taille_conforme: entree.lot.items.length === entree.taille_attendue,
  };
}

/**
 * Les items du lot qu'une contestation vise **au calcul**, lus sur l'item tel qu'il est chargé
 * maintenant, jamais sur le journal : l'entrée `retrait_item` constate qu'une contestation a retiré
 * l'item de la file de l'annotateur, à la première écriture de celui-ci qui suit (qu'il l'ait
 * atteint ou non) : un horodatage qui dépend de sa navigation (constat 9 du 2026-09-24). Les décisions déjà
 * portées sur un item exclu restent au journal ; elles ne sont simplement pas appariées.
 */
function exclusPourContestation(entree: Pick<EntreeDiagnostic, "lot" | "items">): ReadonlySet<string> {
  const exclus = new Set<string>();
  for (const reference of entree.lot.items) {
    const item = entree.items.get(reference.item_id);
    if (item !== undefined && viseParUneContestation(item)) exclus.add(item.id);
  }
  return exclus;
}

function viseParUneContestation(item: Item): boolean {
  const vise = VISE_PAR_UNE_CONTESTATION.get(item.statut_contestation);
  if (vise === undefined) {
    throw new StatutContestationNonTranche(item.id, item.statut_contestation);
  }
  return vise;
}

/**
 * Un `item_id` que `lot.items` porte deux fois : `apparier` produirait sinon deux paires
 * identiques pour la même décision, gonflant le `n` du kappa publié (revue du 2026-10-12,
 * constat 4). `lireLot` et `ecrireLot` (`validation/io/lots-fichier.ts`) refusent déjà ce cas à
 * la lecture et avant l'écriture ; cette erreur est la défense de `apparier` pour tout `Lot` qui
 * lui arriverait sans être passé par l'un des deux, par exemple construit en mémoire.
 */
export class ItemEnDoubleDansLeLot extends Error {
  readonly item_id: string;

  constructor(lot_id: string, item_id: string) {
    super(
      `Lot ${lot_id} : l'item ${item_id} figure deux fois dans items. Le kappa n'est pas calculé ` +
        "plutôt que calculé sur un n gonflé par un doublon.",
    );
    this.name = "ItemEnDoubleDansLeLot";
    this.item_id = item_id;
  }
}

/**
 * Les items du manifeste que `entree.items` ne porte pas, dans l'ordre du manifeste. Appelée
 * après `apparier`, qui a déjà refusé un manifeste portant un item deux fois.
 */
function absentsDesItemsCharges(entree: Pick<EntreeDiagnostic, "lot" | "items">): readonly string[] {
  return entree.lot.items
    .map((reference) => reference.item_id)
    .filter((item_id) => !entree.items.has(item_id));
}

/**
 * Un item qu'une contestation vise au calcul sort du dénominateur. Le §4 parle de lots de 50 ;
 * quand une contestation en retire un, le kappa porte sur ce qui reste, et `n` le dit. Un item
 * introuvable parmi les items chargés en sort aussi, et `absentsDesItemsCharges` le nomme.
 */
function apparier(
  entree: EntreeDiagnostic,
  etatA: EtatAnnotateur,
  etatB: EtatAnnotateur,
  exclus: ReadonlySet<string>,
): readonly PaireDecisions[] {
  const vus = new Set<string>();
  const paires: PaireDecisions[] = [];
  for (const reference of entree.lot.items) {
    if (vus.has(reference.item_id)) throw new ItemEnDoubleDansLeLot(entree.lot.lot_id, reference.item_id);
    vus.add(reference.item_id);
    if (exclus.has(reference.item_id)) continue;
    const a = etatA.decisions.get(reference.item_id);
    const b = etatB.decisions.get(reference.item_id);
    const item = entree.items.get(reference.item_id);
    if (a === undefined || b === undefined || item === undefined) continue;
    paires.push({ item, a, b });
  }
  return paires;
}

/** Fini : chaque item que la contestation n'exclut pas au calcul porte une décision. */
function aFini(entree: Pick<EntreeDiagnostic, "lot">, etat: EtatAnnotateur, exclus: ReadonlySet<string>): boolean {
  for (const reference of entree.lot.items) {
    if (exclus.has(reference.item_id)) continue;
    if (!etat.decisions.has(reference.item_id)) return false;
  }
  return true;
}

function kappaParQuestion(paires: readonly PaireDecisions[]): Record<CleGrille, ResultatKappa> {
  const resultats: Partial<Record<CleGrille, ResultatKappa>> = {};
  for (const cle of CLES_GRILLE) {
    resultats[cle] = kappaQuestion(
      paires.map((paire) => ({
        a: reponse(paire.a, paire.item, cle),
        b: reponse(paire.b, paire.item, cle),
      })),
    );
  }
  return resultats as Record<CleGrille, ResultatKappa>;
}

/** Sur un item O, la réponse comparée est la réduction des deux états — la même qu'à la promotion. */
function reponse(decision: EntreeDecision, item: Item, cle: CleGrille): boolean | null {
  const grille = grilleEffective(decision, item);
  if (grille === null) return null;
  return grille[cle];
}

function grilleEffective(decision: EntreeDecision, item: Item): Grille | null {
  if (item.type !== "O") return decision.reponses_grille ?? null;
  const parEtat = decision.reponses_par_etat;
  if (parEtat === undefined) return null;
  return reduireEtats(parEtat.anterieur, parEtat.posterieur);
}

function tauxDivergence(paires: readonly PaireDecisions[]): number | null {
  const doubles = paires.filter((paire) => estDouble(paire, "corriger"));
  if (doubles.length === 0) return null;
  const divergentes = doubles.filter((paire) => contenusDivergents(paire));
  return divergentes.length / doubles.length;
}

function estDouble(paire: PaireDecisions, decision: Decision): boolean {
  return paire.a.decision === decision && paire.b.decision === decision;
}

function contenusDivergents(paire: PaireDecisions): boolean {
  const versionA = appliquerCorrections(paire.item, paire.a.corrections);
  const versionB = appliquerCorrections(paire.item, paire.b.corrections);
  return empreinteContenuNotant(versionA) !== empreinteContenuNotant(versionB);
}

/**
 * Taux de « non évaluable » par annotateur, garde-fou du §4 contre l'usage de la sortie de
 * secours : un écart durable entre les deux annotateurs déclenche une séance de calibration.
 *
 * Volontairement **hors** de `DiagnosticLot` : ce chiffre part dans le rapport de promotion,
 * lu par l'auteur, et n'est jamais renvoyé par une route de l'interface. Un annotateur qui
 * verrait le taux de l'autre ne serait plus à l'aveugle.
 */
export function tauxNonEvaluable(etat: EtatAnnotateur, lot: Lot): number | null {
  let decides = 0;
  let nonEvaluables = 0;
  for (const reference of lot.items) {
    const decision = etat.decisions.get(reference.item_id);
    if (decision === undefined) continue;
    decides += 1;
    if (decision.decision === "non_evaluable") nonEvaluables += 1;
  }
  return decides === 0 ? null : nonEvaluables / decides;
}
