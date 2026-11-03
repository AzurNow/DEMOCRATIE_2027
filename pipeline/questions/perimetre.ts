/**
 * Inclusion d'un candidat dans le régime « avant la liste officielle » (§3, conformité n° 10).
 *
 * §3 (protocole 0.11) : « est inclus tout candidat qui remplit les deux conditions suivantes à la
 * date de gel du run : candidature déclarée publiquement par l'intéressé ou par son parti, et
 * présence dans au moins deux sondages d'intention de vote […] au cours des 60 jours précédents
 * […] ; la fenêtre va de 60 jours avant l'instant de gel jusqu'à cet instant, bornes comprises, une
 * date de publication se lisant à minuit UTC (section 4). »
 *
 * `schema/run.schema.json` exige la déclaration et au moins deux preuves pour un candidat non
 * retiré de ce régime ; il ne sait pas comparer des dates. Cette fonction pure fait la partie que
 * le schéma ne peut pas faire ; le chargeur de `config/perimetre.yaml`,
 * `charger-perimetre.ts:construirePerimetre`, l'appelle pour chaque candidat non retiré de ce régime.
 *
 * Placée ici plutôt que dans `outils/` : `outils/` porte des commandes en ligne, et la lecture des
 * dates (instant avec décalage obligatoire, date civile à minuit UTC) vit une seule fois dans
 * `reponse-attendue.ts`, que ce module réutilise.
 *
 * D70 (6), protocole 0.28 : un sondage ne compte que si la notice de son institut, déclarée avec la
 * preuve (`notice_institut`), est datée dans les douze mois civils précédant l'instant de gel
 * (`noticeDansLaFenetre`). La notice n'est rapprochée d'aucun sondage : « toute notice de l'institut
 * compte, quel que soit le sondage qu'elle accompagne ». Elle est déclarée, jamais téléchargée ici.
 */

import { instantDe, instantDeDateCivile } from "./reponse-attendue.ts";
import { normaliserUrlSondage } from "./url-sondage.ts";

/** §3 : « au cours des 60 jours précédents ». */
export const FENETRE_SONDAGES_JOURS = 60;

/** §3 : « au moins deux sondages ». */
export const SONDAGES_MINIMUM = 2;

const MILLISECONDES_PAR_JOUR = 86_400_000;

/** §3 (protocole 0.28, D70 (6)) : « au cours des douze mois précédant l'instant de gel », mois civils. */
export const FENETRE_NOTICES_MOIS = 12;

/** La part de `perimetre.candidats[].preuves_inclusion[]` que la règle lit. */
export interface PreuveSondage {
  readonly date_publication: string;
  readonly url: string;
  /** D70 (6) : la notice de la Commission des sondages retenue pour l'institut. Absente : le sondage ne compte pas. */
  readonly notice_institut?: { readonly date_publication: string };
}

/** La part de `perimetre.candidats[]` que la règle lit, aux noms du schéma. */
export interface CandidatAvantListe {
  readonly declaration_candidature?: { readonly url: string; readonly date: string };
  readonly preuves_inclusion?: readonly PreuveSondage[];
}

export interface VerdictInclusion {
  readonly inclus: boolean;
  /** Déclaration présente et datée au plus tard le jour du gel (minuit UTC ≤ gel). */
  readonly declaration_au_gel: boolean;
  /** Sondages distincts (par URL) publiés dans la fenêtre. */
  readonly sondages_dans_la_fenetre: number;
}

/** Vrai si la date de publication, lue à minuit UTC, est dans [gel − 60 jours, gel]. */
export function sondageDansLaFenetre(date_publication: string, date_gel: string): boolean {
  const gel = instantDe(date_gel);
  const publication = instantDeDateCivile(date_publication);
  const debut = gel - FENETRE_SONDAGES_JOURS * MILLISECONDES_PAR_JOUR;
  return debut <= publication && publication <= gel;
}

/** Le nombre de jours du mois (0 à 11) de cette année, en calendrier grégorien UTC. */
function joursDuMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
}

/**
 * D70 (6) : « de la même date douze mois avant l'instant de gel ». La date du gel est sa date civile
 * UTC, comme toute date de ce module se lit à minuit UTC. Quand le même jour n'existe pas douze mois
 * plus tôt (un gel le 29 février), la borne est le dernier jour de ce mois (le 28 février), jamais
 * un glissement au mois suivant : lecture retenue, que le protocole ne tranche pas. Avec douze mois,
 * le mois est le même et un 31 a toujours son 31.
 */
export function debutFenetreNotices(date_gel: string): string {
  const gel = new Date(instantDe(date_gel));
  const rang_du_mois = gel.getUTCFullYear() * 12 + gel.getUTCMonth() - FENETRE_NOTICES_MOIS;
  const annee = Math.floor(rang_du_mois / 12);
  const mois = rang_du_mois - annee * 12;
  const jour = Math.min(gel.getUTCDate(), joursDuMois(annee, mois));
  return new Date(Date.UTC(annee, mois, jour)).toISOString().slice(0, 10);
}

/** Vrai si la date de la notice, lue à minuit UTC, est dans [même date douze mois avant le gel, gel]. */
export function noticeDansLaFenetre(date_notice: string, date_gel: string): boolean {
  const notice = instantDeDateCivile(date_notice);
  return instantDeDateCivile(debutFenetreNotices(date_gel)) <= notice && notice <= instantDe(date_gel);
}

/** §3 : la preuve compte si le sondage est dans les 60 jours et la notice déclarée dans les douze mois. */
function preuveRetenue(preuve: PreuveSondage, date_gel: string): boolean {
  const notice = preuve.notice_institut;
  if (notice === undefined) return false;
  return sondageDansLaFenetre(preuve.date_publication, date_gel) && noticeDansLaFenetre(notice.date_publication, date_gel);
}

function declarationAuGel(candidat: CandidatAvantListe, date_gel: string): boolean {
  const declaration = candidat.declaration_candidature;
  if (declaration === undefined) return false;
  return instantDeDateCivile(declaration.date) <= instantDe(date_gel);
}

/**
 * Un même sondage déclaré deux fois ne fait pas deux sondages : le décompte porte sur les URL
 * distinctes, après la normalisation de `url-sondage.ts` (décision de l'auteur du 2026-10-02,
 * conformité n° 36, texte au §3 en 0.15). Une preuve sans liste est l'absence de preuve, jamais
 * une liste vide supposée.
 */
function sondagesDansLaFenetre(candidat: CandidatAvantListe, date_gel: string): number {
  const preuves = candidat.preuves_inclusion;
  if (preuves === undefined) return 0;
  const retenues = preuves.filter((preuve) => preuveRetenue(preuve, date_gel));
  return new Set(retenues.map((preuve) => normaliserUrlSondage(preuve.url))).size;
}

/** Les deux conditions du §3, évaluées à l'instant de gel. Aucune n'est court-circuitée. */
export function inclusionAvantListe(candidat: CandidatAvantListe, date_gel: string): VerdictInclusion {
  const declaration_au_gel = declarationAuGel(candidat, date_gel);
  const sondages_dans_la_fenetre = sondagesDansLaFenetre(candidat, date_gel);
  return {
    inclus: declaration_au_gel && sondages_dans_la_fenetre >= SONDAGES_MINIMUM,
    declaration_au_gel,
    sondages_dans_la_fenetre,
  };
}
