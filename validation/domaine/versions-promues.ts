/**
 * Contrôle a posteriori du corpus promu : les deux validations concordantes de chaque item de
 * `data/items/` portent sur la même version de l'item (§4, règle de concordance ; docs/DETTE.md,
 * 2026-09-17, point 1).
 *
 * `evaluerPromotion` garde l'entrée de `data/` (`memeVersionJugee`, refus `versions_differentes`),
 * mais seulement pour l'item qu'on promeut. Ce module relit le corpus déjà promu, que rien d'autre
 * ne relit sous cet angle. `item.validations[]` ne porte ni version ni empreinte jugées : chacune de
 * ses entrées est rapprochée de **la** décision du journal qu'elle projette
 * (`promotion.ts:projeterValidation`), par item, annotateur, lot, horodatage et décision. La règle
 * elle-même n'est pas réécrite : c'est `pipeline/questions/invariants.ts:validationsConcordantesMemeVersion`,
 * qui appelle `memeVersionJugee`.
 *
 * Deux exclusions, écrites dans la DETTE :
 * - un item porteur d'un bloc `arbitrage` : ses deux validations peuvent légitimement porter deux
 *   versions, c'est même l'un des motifs qui envoient en arbitrage (§4) ;
 * - les décisions remplacées, annulées ou antérieures à un retour en attente : elles ne figurent pas
 *   dans `item.validations[]`, et le rapprochement exact ne les retient donc jamais.
 *
 * Seules les validations qui peuvent vérifier un item (`types.ts:DECISIONS_VERIFIANTES`) sont
 * rapprochées : ce premier filtre décide aussi quelles validations peuvent être introuvables, et
 * `validationsConcordantesMemeVersion` refiltre sur la même constante. Une
 * validation retenue que le journal ne contient pas n'est pas ignorée : le contrôle ne peut pas
 * conclure, et il le dit (`introuvables`). Ce module n'écrit rien et ne lit pas le disque : le
 * journal lui est passé par l'appelant.
 */

import {
  validationsConcordantesMemeVersion,
  type DecisionValidation,
  type Violation,
} from "../../pipeline/questions/invariants.ts";
import { DECISIONS_VERIFIANTES, type EntreeDecision, type EntreeJournal, type Item } from "./types.ts";

/** Ce que `item.schema.json` garantit d'une entrée de `validations[]`, déjà validée à la lecture. */
interface ValidationPromue {
  readonly annotateur_id: string;
  readonly decision: string;
  readonly date: string;
  readonly lot_id?: string;
}

/** Le journal d'un annotateur pour un lot, tel que `JournalAnnotateur.lire` le rend. */
export type LireJournal = (annotateur_id: string, lot_id: string) => readonly EntreeJournal[];

/** Une validation retenue d'un item promu dont le journal ne contient pas la décision. */
export interface ValidationIntrouvable {
  readonly item_id: string;
  readonly annotateur_id: string;
  readonly lot_id: string | null;
  readonly date: string;
  readonly decision: string;
}

export interface ControleVersionsPromues {
  readonly violations: readonly Violation[];
  readonly introuvables: readonly ValidationIntrouvable[];
}

export function controlerVersionsPromues(items: readonly Item[], lire: LireJournal): ControleVersionsPromues {
  const decisions: DecisionValidation[] = [];
  const introuvables: ValidationIntrouvable[] = [];
  for (const item of items) {
    if (item.arbitrage !== undefined) continue;
    for (const validation of validationsRetenues(item)) {
      const trouvees = decisionsProjetees(item.id, validation, lire);
      if (trouvees.length === 0) introuvables.push(introuvable(item.id, validation));
      decisions.push(...trouvees);
    }
  }
  return { violations: validationsConcordantesMemeVersion(decisions), introuvables };
}

function validationsRetenues(item: Item): readonly ValidationPromue[] {
  if (item.validations === undefined) throw new Error(`Item ${item.id} sans validations[] : item.schema.json l'exige.`);
  return (item.validations as readonly ValidationPromue[]).filter((validation) => DECISIONS_VERIFIANTES.has(validation.decision));
}

/**
 * Les décisions du journal que la validation projette. Plusieurs entrées identiques sur ces cinq
 * champs sont toutes rendues : si elles portent deux versions, le contrôle ne peut pas prouver la
 * même version, et l'invariant le nomme.
 */
function decisionsProjetees(item_id: string, validation: ValidationPromue, lire: LireJournal): readonly EntreeDecision[] {
  if (validation.lot_id === undefined) return [];
  return lire(validation.annotateur_id, validation.lot_id).filter(
    (entree): entree is EntreeDecision =>
      entree.type_entree === "decision" &&
      entree.item_id === item_id &&
      entree.horodatage === validation.date &&
      entree.decision === validation.decision,
  );
}

function introuvable(item_id: string, validation: ValidationPromue): ValidationIntrouvable {
  return {
    item_id,
    annotateur_id: validation.annotateur_id,
    lot_id: validation.lot_id === undefined ? null : validation.lot_id,
    date: validation.date,
    decision: validation.decision,
  };
}

/** Un item déjà promu viole la règle de concordance, ou ne peut pas y être confronté. */
export class ValidationsPromuesIncoherentes extends Error {
  readonly violations: readonly Violation[];
  readonly introuvables: readonly ValidationIntrouvable[];

  constructor(controle: ControleVersionsPromues) {
    super(
      [
        "ValidationsPromuesIncoherentes : le corpus déjà promu (data/items/) ne tient pas la règle de",
        "concordance du §4 (deux validations concordantes sur la même version de l'item). Rien n'est écrit.",
        ...controle.violations.map((violation) => `  ${violation.objet}  versions différentes : ${violation.detail}`),
        ...controle.introuvables.map(decrireIntrouvable),
      ].join("\n"),
    );
    this.name = "ValidationsPromuesIncoherentes";
    this.violations = controle.violations;
    this.introuvables = controle.introuvables;
  }
}

function decrireIntrouvable(validation: ValidationIntrouvable): string {
  const lot = validation.lot_id === null ? "sans lot_id" : `lot ${validation.lot_id}`;
  return (
    `  ${validation.item_id}  validation introuvable au journal : ${validation.annotateur_id}, ${lot}, ` +
    `${validation.decision} du ${validation.date}`
  );
}

/** Lève `ValidationsPromuesIncoherentes` si le contrôle trouve quoi que ce soit ; ne rend rien sinon. */
export function verifierVersionsPromues(items: readonly Item[], lire: LireJournal): void {
  const controle = controlerVersionsPromues(items, lire);
  if (controle.violations.length > 0 || controle.introuvables.length > 0) {
    throw new ValidationsPromuesIncoherentes(controle);
  }
}
