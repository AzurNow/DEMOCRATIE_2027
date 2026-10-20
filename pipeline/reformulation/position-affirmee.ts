/**
 * Position que doit affirmer la prémisse de la formulation orientée, décidée avant l'appel au modèle.
 *
 * Décision D42 (3) de l'auteur du 2026-10-15 : règle fixe par type d'item, pour qu'aucune position
 * ne soit choisie à la main, item par item (ce qui ouvrirait une asymétrie entre candidats) :
 * F ⇒ « pour » (le candidat proposerait la mesure fictive) ; O ⇒ la position de l'état ANTÉRIEUR ;
 * P ⇒ la position de l'item ; A ⇒ aucune ; question d'attribution ⇒ aucune, que sa mesure soit réelle
 * (sans item principal) ou fictive (item F principal) : §5, « sur une question d'attribution, elle
 * n'affirme aucune position », confirmé par l'auteur le 2026-10-17. La règle ne lit que le gabarit,
 * le type et le contenu de l'item : ni le candidat (son type d'entrée ne le porte pas), ni une date
 * (la vérité de la prémisse se résout au gel, dans le tirage : `reponse-attendue.ts:premisseFausseAuGel`).
 *
 * §5 (protocole 0.19, D54 (4)) : « Un état sans objet n'en affirme aucune, comme une question
 * d'attribution. » Un item P dont l'assertion est « sans_objet », ou un item O dont l'état
 * ANTÉRIEUR est « sans_objet », rend donc `AUCUNE`, jamais un refus. Le prompt
 * `prompts/reformulation-1.0.1` n'admet que « pour », « contre », « conditionnel » ou `AUCUNE` :
 * une position hors de ce vocabulaire (ni l'un des trois, ni « sans_objet ») reste un refus nommé,
 * jamais rabattue sur `AUCUNE`.
 */

import { gabaritParCode } from "../questions/gabarits.ts";
import type { CodeGabarit, EtatPositionnel, Item, TypeItem } from "../questions/types.ts";

/** Rendu de « aucune prémisse » dans le prompt (variable `{position_affirmee}`). */
export const AUCUNE = "AUCUNE";

export const POSITIONS_AFFIRMABLES = ["pour", "contre", "conditionnel"] as const;
export type PositionAffirmable = (typeof POSITIONS_AFFIRMABLES)[number];
export type PositionDemandee = PositionAffirmable | typeof AUCUNE;

/** Ce que la règle lit de l'item, et rien d'autre : ni candidat, ni date, ni statut. */
export type ItemLu = Pick<Item, "id" | "type" | "assertion" | "obsolescence">;

export class ContenuItemAbsent extends Error {
  readonly item_id: string;

  constructor(item: ItemLu, champ: "assertion" | "obsolescence") {
    super(`Item ${item.type} ${item.id} sans « ${champ} » : la position affirmée ne peut pas être lue.`);
    this.name = "ContenuItemAbsent";
    this.item_id = item.id;
  }
}

export class PositionNonAffirmable extends Error {
  readonly item_id: string;
  readonly position: string;

  constructor(item: ItemLu, position: string) {
    super(
      `Item ${item.type} ${item.id} : la position « ${position} » ne peut pas être affirmée par une ` +
        `prémisse (pour, contre ou conditionnel seulement, prompts/reformulation-1.0.1).`,
    );
    this.name = "PositionNonAffirmable";
    this.item_id = item.id;
    this.position = position;
  }
}

function estAffirmable(position: string): position is PositionAffirmable {
  return (POSITIONS_AFFIRMABLES as readonly string[]).includes(position);
}

/** Un état « sans_objet » n'affirme aucune position, comme une question d'attribution (§5). */
function affirmable(item: ItemLu, etat: EtatPositionnel): PositionDemandee {
  if (etat.position === "sans_objet") return AUCUNE;
  if (!estAffirmable(etat.position)) throw new PositionNonAffirmable(item, etat.position);
  return etat.position;
}

function positionDeP(item: ItemLu): PositionDemandee {
  if (item.assertion === undefined) throw new ContenuItemAbsent(item, "assertion");
  return affirmable(item, item.assertion);
}

function positionDeO(item: ItemLu): PositionDemandee {
  if (item.obsolescence === undefined) throw new ContenuItemAbsent(item, "obsolescence");
  return affirmable(item, item.obsolescence.etat_anterieur);
}

/** La règle, en données : un type d'item ajouté sans être listé ici ne compile pas. */
const REGLE: Readonly<Record<TypeItem, (item: ItemLu) => PositionDemandee>> = {
  F: () => "pour",
  O: positionDeO,
  P: positionDeP,
  A: () => AUCUNE,
};

/** D42 (3) : `item_principal` absent pour une question d'attribution sur une mesure réelle, F pour une mesure fictive. */
export function positionAffirmeeDemandee(gabarit: CodeGabarit, item_principal: ItemLu | undefined): PositionDemandee {
  // Question d'attribution : donnée `nomme_candidat` de la table des gabarits, jamais le code.
  if (!gabaritParCode(gabarit).nomme_candidat || item_principal === undefined) return AUCUNE;
  return REGLE[item_principal.type](item_principal);
}
