/**
 * Renvoi en attente après une correction de thème (protocole 0.13, §4 « Correction de thème »,
 * conformité n° 69) : « Une correction acceptée crée une nouvelle version de la mesure : les autres
 * items de cette mesure, jugés contre l'ancien thème, retournent en attente et sont validés à
 * nouveau sur la nouvelle version. »
 *
 * La logique, sans le disque. `pnpm mesures --renvoyer=<mesure>` lit, appelle ce module, et réécrit
 * en `staging/` les items à renvoyer (règle 3 : rien n'est écrit dans `data/items`).
 *
 * **Comment les décisions déjà prises sont supersédées, sans être effacées.** Sur le modèle de la
 * réannotation (§4, `lot.ts:lotsApresSupersession`) : le journal n'est jamais touché, le lot qui a
 * jugé l'item reste publié et son kappa reste calculé. Ce qui change est la version de l'item :
 * repinglé sur la nouvelle version de la mesure, il prend une version nouvelle et une empreinte
 * nouvelle (la version de la mesure fait partie du contenu notant), et son historique porte une
 * entrée `CHANGEMENT_RENVOI`. Un lot qui épingle une version antérieure à ce renvoi ne juge plus
 * l'item (`lotJugeEncore`) : la promotion ne lit plus ses décisions pour lui, et l'item rentre dans
 * la réserve d'un prochain lot, qui l'épinglera dans sa nouvelle version.
 */

import { CHEMIN_THEME, decisionApplicable, type DecisionCorrectionMesure, type RegistreCorrectionsMesure } from "./corrections-mesure.ts";
import { empreinteContenuNotant } from "./empreinte.ts";
import type { EntreeDecision, Item, ItemDuLot, Mesure } from "./types.ts";

/** Préfixe de l'entrée d'historique d'un renvoi : écrit par `repinglerSurMesure`, lu par `renvoyeDepuis`. */
export const CHANGEMENT_RENVOI = "renvoi en attente";

/**
 * Préfixe de l'entrée d'historique d'un rattachement à une autre mesure (décision D53 (1)) : écrit
 * par `rattachements-item.ts:rattacherItem`, lu par `renvoyeDepuis`. Défini ici, avec la liste qui
 * le lit, pour que ce module n'importe pas celui qui l'écrit.
 */
export const CHANGEMENT_RATTACHEMENT = "rattachement à une autre mesure";

/**
 * Préfixe de l'entrée d'historique d'un retour en attente après le rejet d'un autre item sous le
 * motif « texte extrait erroné » (protocole 0.25, §4, D60 (9b)) : écrit par
 * `renvoi-texte-errone.ts:renvoyerEnAttente`, lu par `renvoyeDepuis`. Défini ici pour la même raison
 * que `CHANGEMENT_RATTACHEMENT`.
 */
export const CHANGEMENT_TEXTE_ERRONE = "retour en attente, texte extrait erroné";

/**
 * Les changements d'historique qui renvoient un item en attente : le lot qui épinglait une version
 * antérieure ne le juge plus. Une donnée, pas une branche par cas : un nouveau chemin de renvoi
 * s'ajoute ici.
 */
export const CHANGEMENTS_QUI_RENVOIENT: readonly string[] = [CHANGEMENT_RENVOI, CHANGEMENT_RATTACHEMENT, CHANGEMENT_TEXTE_ERRONE];

/** Le renvoi n'existe qu'après une correction de thème acceptée au registre et portée par la mesure. */
export class RenvoiSansCorrectionAppliquee extends Error {
  readonly mesure_id: string;

  constructor(mesure: Mesure, verdict: string) {
    super(
      `Mesure ${mesure.id} (version ${mesure.version}, thème « ${mesure.theme} ») : aucune correction de ` +
        `thème acceptée au registre vers ce thème (verdict du registre : ${verdict}). Le renvoi en attente ` +
        `suit une correction acceptée et appliquée (§4) ; rien n'est renvoyé.`,
    );
    this.name = "RenvoiSansCorrectionAppliquee";
    this.mesure_id = mesure.id;
  }
}

/**
 * La décision du registre qui a donné à la mesure son thème courant. L'appariement est celui de la
 * promotion (`decisionApplicable`) : la décision la plus récente pour ce thème fait foi, et elle doit
 * être une acceptation que la mesure porte.
 */
export function correctionAppliquee(registre: RegistreCorrectionsMesure, mesure: Mesure): DecisionCorrectionMesure {
  const versLeThemeCourant = { cible: "mesure", chemin: CHEMIN_THEME, ancienne_valeur: null, nouvelle_valeur: mesure.theme } as const;
  const resultat = decisionApplicable(registre, versLeThemeCourant, mesure);
  if (resultat.verdict !== "acceptee_et_appliquee" || resultat.entree === null) {
    throw new RenvoiSansCorrectionAppliquee(mesure, resultat.verdict);
  }
  return resultat.entree;
}

/* ------------------------------------------------------------- planification */

/** Décisions actives d'un item dans le lot qui le juge encore. */
export interface JugementEnCours {
  readonly lot_id: string;
  readonly annotateurs: readonly string[];
  readonly decisions: readonly EntreeDecision[];
}

export interface ContexteRenvoi {
  /** La mesure dans sa version courante, celle qui porte le thème accepté. */
  readonly mesure: Mesure;
  /** Items de `staging/`. Ceux des autres mesures sont ignorés. */
  readonly items: readonly Item[];
  /** Identifiants des items déjà publiés dans `data/`. */
  readonly publies: ReadonlySet<string>;
  /** Par item, le lot qui le juge encore et ses décisions actives ; absent : l'item n'est dans aucun lot. */
  readonly jugements: ReadonlyMap<string, JugementEnCours>;
  readonly registre: RegistreCorrectionsMesure;
}

/**
 * - `renvoyer` : jugé jusqu'au bout contre l'ancienne version, ou dans aucun lot ;
 * - `demandeur` : une de ses décisions porte la demande acceptée ; son lot le juge, et la promotion
 *   l'épingle sur la nouvelle version (`promotion.ts:versionMesurePromue`) ;
 * - `decisions_incompletes` : son lot ne l'a pas encore jugé jusqu'au bout ; le renvoyer changerait
 *   un lot en cours. Il attend la fin de son lot, et une relance le renverra ;
 * - `publie` : déjà dans `data/`, que ce chemin n'écrit pas. Décision de l'auteur du 2026-09-28 : un
 *   item publié ne change que par la contestation et le panel (`pnpm contester`, `pnpm panel`).
 */
export type SortRenvoi = "renvoyer" | "demandeur" | "decisions_incompletes" | "publie";

export interface Renvoi {
  readonly item: Item;
  readonly sort: SortRenvoi;
  /** Lot qui juge encore l'item, `null` s'il n'est dans aucun lot. */
  readonly lot_id: string | null;
}

/**
 * Les items de la mesure qui épinglent une version antérieure à la version courante, et le sort de
 * chacun. Un item déjà épinglé sur la version courante n'y figure pas : relancer ne fait rien de plus.
 */
export function planifierRenvois(contexte: ContexteRenvoi): readonly Renvoi[] {
  const decision = correctionAppliquee(contexte.registre, contexte.mesure);
  return contexte.items
    .filter((item) => epingleUneVersionAnterieure(item, contexte.mesure))
    .map((item) => ({
      item,
      sort: sortDe(item, contexte, decision),
      lot_id: lotQuiJuge(item, contexte),
    }));
}

function epingleUneVersionAnterieure(item: Item, mesure: Mesure): boolean {
  if (item.mesure_id !== mesure.id) return false;
  if (item.mesure_version > mesure.version) {
    throw new Error(
      `Item ${item.id} : il épingle la version ${item.mesure_version} de la mesure ${mesure.id}, ` +
        `postérieure à sa version courante (${mesure.version}). Incohérence de staging, rien n'est renvoyé.`,
    );
  }
  return item.mesure_version < mesure.version;
}

function sortDe(item: Item, contexte: ContexteRenvoi, decision: DecisionCorrectionMesure): SortRenvoi {
  if (contexte.publies.has(item.id)) return "publie";
  const jugement = contexte.jugements.get(item.id);
  if (jugement === undefined) return "renvoyer";
  if (jugement.decisions.some((entree) => porteLaDemande(entree, decision))) return "demandeur";
  return jugementComplet(jugement) ? "renvoyer" : "decisions_incompletes";
}

function lotQuiJuge(item: Item, contexte: ContexteRenvoi): string | null {
  const jugement = contexte.jugements.get(item.id);
  return jugement === undefined ? null : jugement.lot_id;
}

function porteLaDemande(entree: EntreeDecision, decision: DecisionCorrectionMesure): boolean {
  return entree.corrections.some(
    (correction) =>
      correction.cible === "mesure" &&
      correction.chemin === CHEMIN_THEME &&
      correction.nouvelle_valeur === decision.theme_demande,
  );
}

/**
 * Chaque annotateur du lot a une décision active sur l'item. Un lot sans annotateur n'est jamais
 * complet. Exporté pour le rattachement (`rattachements-item.ts`), qui refuse comme le renvoi.
 */
export function jugementComplet(jugement: JugementEnCours): boolean {
  if (jugement.annotateurs.length === 0) return false;
  return jugement.annotateurs.every((annotateur) =>
    jugement.decisions.some((entree) => entree.annotateur_id === annotateur),
  );
}

/* ---------------------------------------------------------------- repinglage */

export interface TraceRenvoi {
  /** HEAD au moment du renvoi : l'arbre est propre, il décrit l'état d'où part l'écriture. */
  readonly commit: string;
  readonly horodatage: string;
  readonly decision: DecisionCorrectionMesure;
}

/**
 * La nouvelle version de l'item : épinglée sur la version courante de la mesure, version de l'item
 * incrémentée, empreinte recalculée (la version de la mesure fait partie du contenu notant, §4),
 * historique augmenté. Rien d'autre ne change : l'item reste en attente.
 */
export function repinglerSurMesure(item: Item, mesure: Mesure, trace: TraceRenvoi): Item {
  if (item.statut_validation !== "en_attente") {
    throw new Error(`Item ${item.id} : seul un item en attente se renvoie en attente (statut ${item.statut_validation}).`);
  }
  if (item.historique === undefined) throw new Error(`Item ${item.id} sans historique : le renvoi ne s'y inscrirait pas.`);
  const version = item.version + 1;
  const epingle: Item = { ...item, mesure_version: mesure.version, version };
  return {
    ...epingle,
    empreinte: empreinteContenuNotant(epingle),
    historique: [
      ...item.historique,
      {
        date: trace.horodatage,
        changement: `${CHANGEMENT_RENVOI} : mesure ${mesure.id} en version ${mesure.version}`,
        motif:
          `correction de thème acceptée au registre le ${trace.decision.date} (thème ${trace.decision.theme_demande}) : ` +
          `l'item épinglait la version ${item.mesure_version} de la mesure (§4, protocole 0.13)`,
        commit: trace.commit,
        version_resultante: version,
      },
    ],
  };
}

/* --------------------------------------------------------- supersession par version */

/** Vrai si l'item a été renvoyé en attente (renvoi, rattachement ou texte extrait erroné) après la version donnée. */
export function renvoyeDepuis(item: Item, version: number): boolean {
  if (item.historique === undefined) return false;
  return item.historique.some((entree) => estRenvoiPosterieur(entree, version));
}

function estRenvoiPosterieur(entree: unknown, version: number): boolean {
  const { changement, version_resultante } = entree as { changement?: unknown; version_resultante?: unknown };
  if (typeof changement !== "string" || typeof version_resultante !== "number") return false;
  return version_resultante > version && CHANGEMENTS_QUI_RENVOIENT.some((prefixe) => changement.startsWith(`${prefixe} :`));
}

/**
 * Un lot juge encore l'item qu'il épingle, sauf si l'item a été renvoyé en attente depuis la version
 * épinglée, par un renvoi, un rattachement ou un retour après texte extrait erroné : les décisions du lot restent au journal, mais ne
 * comptent plus pour cet item.
 */
export function lotJugeEncore(item: Item, reference: Pick<ItemDuLot, "item_version">): boolean {
  return !renvoyeDepuis(item, reference.item_version);
}
