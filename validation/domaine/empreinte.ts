/**
 * Formes canoniques et empreintes.
 *
 * Deux empreintes différentes vivent ici, et les confondre serait coûteux :
 *
 * - L'empreinte de ligne (decision.ts) scelle une entrée du journal. Elle distingue une ligne tronquée par un
 *   arrêt brutal d'une ligne réécrite à la main, dans un journal destiné à être publié.
 * - `empreinteContenuNotant` décide si **deux corrections sont concordantes**. Elle ne couvre
 *   que ce qu'un juge et le tirage utilisent : type, mesure, position, quantification, dates
 *   de validité, citation normalisée. La **paraphrase en est exclue** : deux humains qui
 *   réécrivent une phrase divergent toujours d'un mot, et faire échouer la concordance
 *   là-dessus enverrait en arbitrage des corrections identiques au fond.
 * - `empreinteMesure` est le champ `empreinte` d'une mesure, tel que `mesure.schema.json` le
 *   définit. Elle n'est pas l'empreinte de relecture (`relectures-mesure.ts`), qui couvre davantage.
 */

import { createHash } from "node:crypto";
import { normaliser } from "./normalisation.ts";
import type { EtatPositionnel, Item, Mesure } from "./types.ts";

/** JSON canonique : clés triées, aucune espace. Deux objets égaux ont la même chaîne. */
export function canoniser(valeur: unknown): string {
  return JSON.stringify(trierRecursivement(valeur));
}

function trierRecursivement(valeur: unknown): unknown {
  if (Array.isArray(valeur)) return valeur.map(trierRecursivement);
  if (valeur === null || typeof valeur !== "object") return valeur;
  const entrees = Object.entries(valeur as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const trie: Record<string, unknown> = {};
  for (const [cle, sousValeur] of entrees) trie[cle] = trierRecursivement(sousValeur);
  return trie;
}

export function sha256(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

export function empreinteDe(valeur: unknown): string {
  return sha256(canoniser(valeur));
}

/**
 * Empreinte d'une mesure : « sha256 de la forme canonique de {libelle, theme,
 * formulation_canonique, fictive} » (`mesure.schema.json`). Seule définition du dépôt :
 * l'extraction la calcule, la promotion la vérifie.
 */
export function empreinteMesure(mesure: Pick<Mesure, "libelle" | "theme" | "formulation_canonique" | "fictive">): string {
  return empreinteDe({
    libelle: mesure.libelle,
    theme: mesure.theme,
    formulation_canonique: mesure.formulation_canonique,
    fictive: mesure.fictive,
  });
}

/**
 * Empreinte du contenu notant d'un item : ce contre quoi une réponse d'outil sera jugée.
 * Ni les statuts, ni l'historique, ni les validations, ni la paraphrase.
 */
export function empreinteContenuNotant(item: Item): string {
  return empreinteDe({
    type: item.type,
    candidat_id: item.candidat_id,
    mesure_id: item.mesure_id,
    mesure_version: item.mesure_version,
    valide_du: item.valide_du,
    valide_au: item.valide_au,
    assertion: item.assertion === undefined ? null : etatNotant(item.assertion),
    absence:
      item.absence === undefined
        ? null
        : {
            corpus_examine: [...item.absence.corpus_examine]
              .map((entree) => ({ sha256: entree.sha256, tier: entree.tier }))
              .sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1)),
            source_couverture_sha256: item.absence.source_couverture_theme.sha256,
          },
    obsolescence:
      item.obsolescence === undefined
        ? null
        : {
            date_changement: item.obsolescence.date_changement,
            etat_anterieur: etatNotant(item.obsolescence.etat_anterieur),
            etat_posterieur: etatNotant(item.obsolescence.etat_posterieur),
          },
  });
}

/**
 * Règle unique de l'empreinte après une modification (§4) : elle n'est recalculée que si le contenu
 * notant a changé, sinon celle de `avant` est conservée. Recalculer sur un contenu intact
 * remplacerait l'empreinte contre laquelle les décisions ont été épinglées.
 */
export function empreinteApresModification(avant: Item, apres: Item): string {
  const notantApres = empreinteContenuNotant(apres);
  return empreinteContenuNotant(avant) === notantApres ? avant.empreinte : notantApres;
}

function etatNotant(etat: EtatPositionnel): unknown {
  return {
    position: etat.position,
    // Normalisée, comme dans le test verbatim : une source recopiée avec des guillemets
    // typographiques et la même recopiée en ASCII disent la même chose.
    citation: normaliser(etat.citation_verbatim),
    // Une absence de quantification est représentée par null, jamais par un objet vide :
    // deux représentations d'une même absence donneraient deux empreintes.
    quantification: etat.quantification === undefined ? null : etat.quantification,
    source_sha256: etat.source.sha256,
  };
}
