/**
 * Ce que voit un annotateur humain quand il note une réponse (§7 ; D18 du 2026-10-06).
 *
 * **Aveugle total.** D18 : « un humain reçoit exactement ce que reçoit un juge ». La vue est donc la
 * charge du juge (`charge-juge.ts:construireCharge`), construite par les mêmes projections
 * (`reponseSoumise`, `itemSoumis`), sans le prompt : l'humain n'a pas de prompt de juge. Elle ne
 * porte ni l'outil, ni la note d'un juge, ni celle d'un autre humain, ni le motif pour lequel
 * l'annotateur est appelé : la demande n'en reçoit aucun, et la vue est construite champ par champ,
 * jamais par recopie d'un objet.
 *
 * Deux ajouts, et deux seulement :
 *
 * - **la version de la grille** (`VERSION_GRILLE_HUMAINE`), sans aucun texte de consigne : la grille
 *   elle-même (catégories, drapeaux, sourçage) est celle du §7, et un texte destiné à l'humain
 *   vivrait dans `prompts/` ou dans l'écran, pas ici (règle 6) ;
 * - **le verdict d'existence de chaque lien**, établi par le test HTTP déterministe du §7
 *   (`pipeline/liens`) et reçu tout fait. L'humain juge seulement le soutien. Un lien de la
 *   réponse sans verdict d'existence empêche la vue (`LienSansVerdictExistence`) : jamais un
 *   « existe » par défaut. Un verdict en double, ou pour un lien que la réponse ne cite pas, est une
 *   entrée incohérente (`ExistencesIncoherentes`).
 *
 * Les liens soumis sont `reponse.normalise.liens`, dans leur ordre, comme pour le juge ; un lien
 * cité deux fois apparaît deux fois, avec son unique verdict.
 *
 * **Charge v3 (D27).** Tout le reste est le contenu soumis au juge (`charge-juge.ts:contenuSoumis`),
 * tel quel : registre et prémisse de la formulation, réponse attendue, texte des pages citées et sa
 * borne. Un champ ajouté à la charge l'est donc à la vue sans autre code, et la garde de complétude
 * de l'écran (`tests/notation-humaine/completude-affichage.test.ts`) exige qu'il soit affiché.
 */

import type { Instant, VerdictExistence } from "../../analysis/types.ts";
import type { ReponseObtenue } from "../interrogation/types.ts";
import { contenuSoumis, type CitationSoumise, type ContenuSoumis, type DemandeCharge } from "./charge-juge.ts";

/**
 * Version du format de la vue : un champ ajouté ou retiré la change. v2 : la charge v3 (D27). v3 :
 * la charge v5 (D55 (1), §7) — `reponse.normalisation` n'est plus soumise, D18 obligeant l'humain à
 * recevoir exactement ce que reçoit un juge.
 */
export const VERSION_VUE_ANNOTATEUR = "vue-annotateur-v3";

/**
 * Version de la grille de notation humaine : la grille du §7 telle que la saisie la porte
 * (`notation-humaine.ts:SaisieHumaine`). Un champ de saisie ajouté ou retiré la change.
 */
export const VERSION_GRILLE_HUMAINE = "grille-humaine-v1";

/**
 * Le résultat du test HTTP d'un lien, reçu tout fait : tout ce que porte un lien de
 * `notation.schema.json#/properties/sourcage/properties/liens`, sauf le soutien, que juge l'humain.
 */
export interface ExistenceEtablie {
  readonly url_citee: string;
  readonly verdict_existence: VerdictExistence;
  readonly date_test: Instant;
  readonly url_finale?: string;
  readonly code_http?: number | null;
  readonly sha256_contenu?: string;
  readonly archive_url?: string;
}

/** La demande de charge du juge, sans prompt, pour une réponse obtenue, plus les existences. */
export interface DemandeVue extends Omit<DemandeCharge, "prompt" | "reponse"> {
  /** Un humain ne note que des réponses obtenues du run, jamais une réponse permutée. */
  readonly reponse: ReponseObtenue;
  readonly existences: readonly ExistenceEtablie[];
}

export interface ReponseVue {
  readonly texte: string;
  readonly liens: readonly ExistenceEtablie[];
  readonly citations?: readonly CitationSoumise[];
  readonly troncature: boolean;
  readonly refus_api: boolean;
}

export interface VueAnnotateur extends Omit<ContenuSoumis, "reponse"> {
  readonly version_vue: string;
  readonly version_grille: string;
  readonly reponse: ReponseVue;
}

export class LienSansVerdictExistence extends Error {
  readonly url: string;

  constructor(reponse_id: string, url: string) {
    super(`Réponse ${reponse_id} : le lien ${url} n'a pas de verdict d'existence (test HTTP du §7). La notation attend ce verdict ; il n'est jamais supposé.`);
    this.name = "LienSansVerdictExistence";
    this.url = url;
  }
}

export class ExistencesIncoherentes extends Error {
  constructor(reponse_id: string, detail: string) {
    super(`Réponse ${reponse_id} : ${detail}`);
    this.name = "ExistencesIncoherentes";
  }
}

export function construireVue(demande: DemandeVue): VueAnnotateur {
  const { existences: _existences, ...demandeCharge } = demande;
  const { reponse: soumise, ...contenu } = contenuSoumis(demandeCharge);
  const existences = indexerExistences(demande.reponse.id, soumise.liens, demande.existences);
  return {
    version_vue: VERSION_VUE_ANNOTATEUR,
    version_grille: VERSION_GRILLE_HUMAINE,
    ...contenu,
    reponse: {
      texte: soumise.texte,
      liens: soumise.liens.map((url) => existenceDe(demande.reponse.id, url, existences)),
      ...(soumise.citations === undefined ? {} : { citations: soumise.citations }),
      troncature: soumise.troncature,
      refus_api: soumise.refus_api,
    },
  };
}

export function indexerExistences(reponse_id: string, liens: readonly string[], existences: readonly ExistenceEtablie[]): ReadonlyMap<string, ExistenceEtablie> {
  const index = new Map<string, ExistenceEtablie>();
  for (const existence of existences) {
    if (index.has(existence.url_citee)) throw new ExistencesIncoherentes(reponse_id, `deux verdicts d'existence pour le lien ${existence.url_citee}.`);
    if (!liens.includes(existence.url_citee)) throw new ExistencesIncoherentes(reponse_id, `verdict d'existence pour ${existence.url_citee}, que la réponse ne cite pas.`);
    index.set(existence.url_citee, existence);
  }
  return index;
}

/** Recopie champ par champ : aucun champ ajouté au résultat du test ne passe dans la vue. */
function existenceDe(reponse_id: string, url: string, existences: ReadonlyMap<string, ExistenceEtablie>): ExistenceEtablie {
  const e = existences.get(url);
  if (e === undefined) throw new LienSansVerdictExistence(reponse_id, url);
  return {
    url_citee: e.url_citee,
    verdict_existence: e.verdict_existence,
    date_test: e.date_test,
    ...(e.url_finale === undefined ? {} : { url_finale: e.url_finale }),
    ...(e.code_http === undefined ? {} : { code_http: e.code_http }),
    ...(e.sha256_contenu === undefined ? {} : { sha256_contenu: e.sha256_contenu }),
    ...(e.archive_url === undefined ? {} : { archive_url: e.archive_url }),
  };
}
