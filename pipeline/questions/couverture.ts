/**
 * Comptage des items P d'un candidat au gel, qui décide du seuil de couverture du §4.
 *
 * §4 : « Un candidat comptant moins de 10 items P vérifiés à la date du run est rapporté à part,
 * avec la mention « couverture insuffisante ». » Décision de l'auteur du 2026-09-27 (conformité
 * n° 19, révision 0.12 du protocole en attente) : « vérifié à la date du run » se lit comme
 * « pourrait entrer au tirage à l'instant de gel ». Un item P compte s'il est vérifié, en vigueur
 * au gel, et non contesté ou arbitré par un maintien ou une correction. Décision de l'auteur du
 * 2026-09-29 (conformité n° 2) : un item qui épingle une version dépassée de sa mesure n'entre pas au
 * tirage (`epingleLaVersionCourante`), il ne compte donc pas non plus. Protocole 0.32 (§4, D74 (16)) :
 * un item que le tirage exclut parce que sa position est incompatible avec celle d'un autre item du
 * même candidat sur la même mesure ne compte pas non plus. Cette règle se juge sur l'ensemble des
 * items, pas sur un item seul : `referencesPAuGel` l'applique, avec la détection du tirage
 * (`tirabilite.ts:positionsIncompatiblesAuGel`, lue par `itemsAuxPositionsIncompatibles`), jamais
 * recopiée ; `itemPCompteAuGel` ne juge que l'item.
 *
 * Aucune de ces règles n'est réécrite ici : la validation et la contestation sont celles de
 * l'engendrement (`itemEngendreDesQuestions`), la vigueur celle de la réponse attendue
 * (`estEnVigueur`), et la décision du panel est lue telle que le tirage la fige
 * (`decisionPanelAuGel`, qui refuse une décision postérieure au gel). Le total est STOCKÉ dans
 * `run.perimetre.candidats[].items_p_verifies` ; `analysis/seuils.ts` lit `sous_seuil`, jamais ce
 * module, et le schéma du run lie les deux dans les deux sens. La liste dont ce total est la
 * longueur est stockée à côté, dans `items_p_au_gel` (`referencesPAuGel`, conformité n° 11), chaque
 * item épinglé à sa version et à son empreinte au gel (DETTE 2026-10-02, constats soldés, n° 2).
 *
 * Même définition, autre usage (décision de l'auteur du 2026-09-29, n° 8) : les items P qu'une
 * contestation pendante tient hors du tirage, en vigueur au gel, quelle que soit leur version de mesure
 * (`itemsPContestesAuGel`), publiés dans `tirage.contestes_au_gel`.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { decisionPanelAuGel } from "./contestation.ts";
import { epingleLaVersionCourante, itemEngendreDesQuestions, mesureDe, referenceDe } from "./engendrement.ts";
import { placeAuGel } from "./place-au-gel.ts";
import { estEnVigueur } from "./reponse-attendue.ts";
import { itemsAuxPositionsIncompatibles, positionsIncompatiblesAuGel } from "./tirabilite.ts";
import type { Item, Mesure, ReferenceItem } from "./types.ts";

function estItemPDuCandidat(item: Item, candidat_id: string): boolean {
  return item.type === "P" && item.candidat_id === candidat_id;
}

/**
 * Vrai si l'item, jugé seul, compte pour le seuil de couverture de ce candidat au gel : la règle des
 * positions incompatibles, qui se juge sur l'ensemble des items, est appliquée par `referencesPAuGel`. Pour un item arbitré,
 * la décision est lue au gel : une décision postérieure lève `DecisionPanelPosterieureAuGel`,
 * comme au tirage, plutôt que de compter un item sur un état que le gel ne connaissait pas.
 * `referentiel` : les mesures au gel, par identifiant ; une mesure absente lève `MesureIntrouvable`.
 */
export function itemPCompteAuGel(
  item: Item,
  candidat_id: string,
  date_gel: string,
  referentiel: ReadonlyMap<string, Mesure>,
): boolean {
  if (!estItemPDuCandidat(item, candidat_id)) return false;
  if (item.statut_contestation === "arbitree") decisionPanelAuGel(item, date_gel);
  const tirable = itemEngendreDesQuestions(item);
  const admis = admisAuGelHorsContestation(item, date_gel, referentiel);
  return tirable && admis;
}

/**
 * Ce que le seuil exige d'un item au gel, contestation mise à part : la version courante de sa
 * mesure, et une fenêtre de validité qui contient le gel. Les deux sont évaluées : une mesure
 * absente du référentiel lève `MesureIntrouvable` même hors de la fenêtre.
 */
function admisAuGelHorsContestation(item: Item, date_gel: string, referentiel: ReadonlyMap<string, Mesure>): boolean {
  const versionCourante = epingleLaVersionCourante(item, referentiel);
  return versionCourante && estEnVigueur(item, date_gel);
}

/**
 * Les items P de ce candidat qui comptent au gel, chacun épinglé à sa version et à son empreinte
 * (`engendrement.ts:referenceDe`), triés par identifiant. Tous les items sont évalués. Décision de
 * l'auteur du 2026-10-02 (conformité n° 11, texte à écrire au §8 en 0.15) : cette liste est aussi
 * celle des « items P de référence » des comparateurs, figée dans
 * `run.perimetre.candidats[].items_p_au_gel` ; l'épingle refuse une lecture de comparateur faite sur
 * une autre version de l'item (`analysis/reference-comparateurs.ts`, DETTE 2026-10-02, constats
 * soldés, n° 2). Deux items comptés de même identifiant lèvent : la liste ne se dédoublonne pas en
 * silence.
 *
 * Protocole 0.32 (§4, D74 (16)) : les items que le tirage exclut pour des positions incompatibles en
 * sont retirés. `interroges` : les candidats interrogés au run, ceux que la détection examine (§5,
 * D74 (14)) ; l'item d'un candidat non interrogé n'est exclu du tirage pour aucune incompatibilité,
 * il compte donc s'il remplit le reste de la règle.
 */
export function referencesPAuGel(
  items: readonly Item[],
  candidat_id: string,
  date_gel: string,
  mesures: readonly Mesure[],
  interroges: ReadonlySet<string>,
): readonly ReferenceItem[] {
  const referentiel = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  const comptes = items.filter((item) => itemPCompteAuGel(item, candidat_id, date_gel, referentiel));
  const conflits = positionsIncompatiblesAuGel(items, date_gel, interroges, referentiel);
  const incompatibles = new Set(itemsAuxPositionsIncompatibles(conflits, candidat_id));
  const references = comptes
    .filter((item) => !incompatibles.has(item.id))
    .map(referenceDe)
    .sort((a, b) => comparerChaines(a.item_id, b.item_id));
  const doublon = references.find((reference, rang) => references[rang + 1]?.item_id === reference.item_id);
  if (doublon !== undefined) {
    throw new Error(`Item ${doublon.item_id} compté deux fois au gel pour ${candidat_id} : identifiant en double dans les items lus.`);
  }
  return references;
}

/**
 * Décision 8 de l'auteur du 2026-09-29 (texte à écrire au §5 en 0.14) : « Le rapport du run publie,
 * pour chaque candidat interrogé, les items P vérifiés que leur contestation tient hors du tirage à
 * la date du gel. » Un item y figure si sa place au gel est `conteste` (`place-au-gel.ts`, vérifié
 * et contestation pendante) et s'il est en vigueur au gel, quelle que soit la version de sa mesure
 * (décision de l'auteur du même jour) : l'item épinglé sur une version dépassée est précisément
 * celui que l'auteur conteste après une correction de thème (décision 5), et il bloque déjà la Q-ATT
 * de sa mesure (`attribution_contestee`) ; le taire rendrait ce chemin invisible. Un item contesté
 * hors de sa fenêtre de validité n'y figure pas : sa contestation n'est pas ce qui le tient hors du
 * tirage. Une mesure absente du référentiel reste une erreur (`MesureIntrouvable`).
 */
export function itemPContesteAuGel(
  item: Item,
  candidat_id: string,
  date_gel: string,
  referentiel: ReadonlyMap<string, Mesure>,
): boolean {
  if (!estItemPDuCandidat(item, candidat_id)) return false;
  if (placeAuGel(item) !== "conteste") return false;
  mesureDe(referentiel, item);
  return estEnVigueur(item, date_gel);
}

/** Les identifiants, triés, des items P de ce candidat que leur contestation tient hors du tirage. */
export function itemsPContestesAuGel(
  items: readonly Item[],
  candidat_id: string,
  date_gel: string,
  mesures: readonly Mesure[],
): readonly string[] {
  const referentiel = new Map(mesures.map((mesure) => [mesure.id, mesure]));
  return items
    .filter((item) => itemPContesteAuGel(item, candidat_id, date_gel, referentiel))
    .map((item) => item.id)
    .sort();
}
