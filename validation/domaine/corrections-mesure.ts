/**
 * Registre des corrections de thème : la logique, sans le disque.
 *
 * Le thème appartient à la mesure, référent partagé entre plusieurs candidats. Un annotateur ne
 * le corrige donc pas depuis l'écran : il **demande** sa correction, et la demande est
 * enregistrée avec sa décision (§4, « Correction de thème »). L'auteur tranche par une décision
 * tracée dans un registre publié, et ce module dit ce que cette décision — ou son absence —
 * entraîne pour l'item.
 *
 * Quatre issues, et une seule ouvre la promotion :
 *
 * | Verdict | Sort de l'item |
 * | --- | --- |
 * | `acceptee_et_appliquee` | promotion, sans revalidation |
 * | `acceptee_sans_mesure_modifiee` | erreur bloquante : le registre affirme une correction que la mesure ne porte pas |
 * | `refusee` | arbitrage, avec le motif du refus |
 * | `absente` | attente, rapportée avec son ancienneté |
 *
 * **Une absence reste une absence.** Une demande sans décision n'est ni acceptée ni refusée, et
 * l'écoulement du temps ne vaut jamais refus : c'est écrit au §4, et c'est pour cela que
 * l'ancienneté est calculée et publiée plutôt que comparée à un délai.
 */

import type { Correction, Mesure } from "./types.ts";
import { dateCivileValide, objetOuLeve as objetOuLeveCommun } from "./validateurs-champ.ts";

/** Seul chemin de mesure qu'une décision du registre peut trancher (voir `corrections.ts`). */
export const CHEMIN_THEME = "/theme";

export type SensDecisionMesure = "acceptee" | "refusee";

export interface DecisionCorrectionMesure {
  readonly mesure_id: string;
  readonly mesure_version: number;
  readonly theme_demande: string;
  readonly decision: SensDecisionMesure;
  /** Date civile de la décision, `AAAA-MM-JJ` : l'auteur tranche un jour, pas à une seconde. */
  readonly date: string;
  /** Obligatoire sur un refus, et sur lui seul. */
  readonly motif?: string;
}

export type RegistreCorrectionsMesure = readonly DecisionCorrectionMesure[];

export type VerdictCorrectionMesure =
  | "acceptee_et_appliquee"
  | "acceptee_sans_mesure_modifiee"
  | "refusee"
  | "absente";

export interface ResultatCorrectionMesure {
  readonly verdict: VerdictCorrectionMesure;
  /** L'entrée du registre qui fait foi, `null` quand aucune ne s'applique. */
  readonly entree: DecisionCorrectionMesure | null;
}

export class EntreeRegistreInvalide extends Error {
  constructor(detail: string, provenance: string) {
    super(`Entrée de registre invalide (${provenance}) : ${detail}`);
    this.name = "EntreeRegistreInvalide";
  }
}

/**
 * Le registre n'a pas de JSON Schema — il n'existe pas dans `schema/`, que ce lot n'écrit pas.
 * Cette fonction tient lieu de validation de frontière, en lecture comme en écriture : une
 * entrée malformée arrête, elle n'est jamais complétée.
 */
export function validerEntreeRegistre(valeur: unknown, provenance: string): DecisionCorrectionMesure {
  const brute = objetOuLeve(valeur, provenance);
  const entree: DecisionCorrectionMesure = {
    mesure_id: chaineObligatoire(brute, "mesure_id", provenance),
    mesure_version: entierObligatoire(brute, "mesure_version", provenance),
    theme_demande: chaineObligatoire(brute, "theme_demande", provenance),
    decision: sensObligatoire(brute, provenance),
    date: dateObligatoire(brute, provenance),
    ...motifEventuel(brute, provenance),
  };
  return entree;
}

function objetOuLeve(valeur: unknown, provenance: string): Record<string, unknown> {
  return objetOuLeveCommun(valeur, provenance, (detail, p) => {
    throw new EntreeRegistreInvalide(detail, p);
  });
}

function chaineObligatoire(brute: Record<string, unknown>, cle: string, provenance: string): string {
  const valeur = brute[cle];
  if (typeof valeur !== "string" || valeur.length === 0) {
    throw new EntreeRegistreInvalide(`champ « ${cle} » absent ou non textuel.`, provenance);
  }
  return valeur;
}

function entierObligatoire(brute: Record<string, unknown>, cle: string, provenance: string): number {
  const valeur = brute[cle];
  if (typeof valeur !== "number" || !Number.isInteger(valeur)) {
    throw new EntreeRegistreInvalide(`champ « ${cle} » absent ou non entier.`, provenance);
  }
  return valeur;
}

function sensObligatoire(brute: Record<string, unknown>, provenance: string): SensDecisionMesure {
  const valeur = brute["decision"];
  if (valeur !== "acceptee" && valeur !== "refusee") {
    throw new EntreeRegistreInvalide("« decision » vaut « acceptee » ou « refusee ».", provenance);
  }
  return valeur;
}

/** Vraie date civile par aller-retour (constat 1) : `2026-19-01` et `2027-02-29` sont refusées. */
function dateObligatoire(brute: Record<string, unknown>, provenance: string): string {
  const valeur = chaineObligatoire(brute, "date", provenance);
  if (!dateCivileValide(valeur)) {
    throw new EntreeRegistreInvalide(`date « ${valeur} » : attendu une vraie date civile AAAA-MM-JJ.`, provenance);
  }
  return valeur;
}

/** §4 : motif obligatoire en cas de refus. Un refus sans motif n'entre pas au registre. */
function motifEventuel(
  brute: Record<string, unknown>,
  provenance: string,
): Partial<Pick<DecisionCorrectionMesure, "motif">> {
  const motif = brute["motif"];
  if (brute["decision"] === "refusee") {
    if (typeof motif !== "string" || motif.trim().length === 0) {
      throw new EntreeRegistreInvalide("un refus porte un motif, qui est publié avec lui.", provenance);
    }
    return { motif };
  }
  if (motif === undefined) return {};
  if (typeof motif !== "string") {
    throw new EntreeRegistreInvalide("« motif » est textuel quand il est présent.", provenance);
  }
  return { motif };
}

/**
 * Levée quand le registre accepte un thème que la mesure ne porte pas. §4 : « une acceptation
 * enregistrée sans mesure modifiée est une erreur bloquante ». Promouvoir sur cette base
 * inscrirait dans `data/` un item validé contre un thème qui n'existe nulle part.
 */
export class CorrectionMesureIncoherente extends Error {
  readonly mesure_id: string;
  readonly theme_demande: string;
  readonly theme_porte: string;

  constructor(mesure: Mesure, entree: DecisionCorrectionMesure) {
    super(
      `Le registre accepte le thème « ${entree.theme_demande} » pour la mesure ${mesure.id} ` +
        `(décision du ${entree.date}), mais la mesure porte encore « ${mesure.theme} ». ` +
        `Une acceptation enregistrée sans mesure modifiée est une erreur bloquante (§4) : ` +
        `corriger la mesure en staging, ou retirer l'acceptation par une décision plus récente.`,
    );
    this.name = "CorrectionMesureIncoherente";
    this.mesure_id = mesure.id;
    this.theme_demande = entree.theme_demande;
    this.theme_porte = mesure.theme;
  }
}

/**
 * Décision du registre applicable à une correction de mesure, et ce qu'elle entraîne.
 *
 * L'appariement se fait sur la mesure et le thème demandé, jamais sur la version de la mesure :
 * une acceptation est suivie d'une modification de la mesure, donc d'un changement de version,
 * et apparier sur la version rendrait toute acceptation inapplicable dès qu'elle est appliquée.
 * La version enregistrée dit contre quoi l'auteur a tranché ; elle ne sert pas de clé.
 */
export function decisionApplicable(
  registre: RegistreCorrectionsMesure,
  correction: Correction,
  mesure: Mesure,
): ResultatCorrectionMesure {
  const entree = derniereDecision(registre, correction, mesure);
  if (entree === null) return { verdict: "absente", entree: null };
  if (entree.decision === "refusee") return { verdict: "refusee", entree };
  if (mesure.theme === entree.theme_demande) return { verdict: "acceptee_et_appliquee", entree };
  return { verdict: "acceptee_sans_mesure_modifiee", entree };
}

/**
 * La dernière du registre fait foi, dans l'ordre d'écriture, jamais celle de plus grande `date`
 * (revue du 2026-10-17, constat 1 ; D54 (1)) : un revirement de l'auteur est une entrée de plus,
 * jamais une réécriture, et le registre est en ajout seul — son ordre **est** la chronologie des
 * décisions, une date tapée à la main ne la remplace pas. Une décision antérieure en `date` mais
 * inscrite plus récemment au registre l'emporte donc sur une décision à `date` plus grande mais
 * inscrite avant elle.
 */
function derniereDecision(
  registre: RegistreCorrectionsMesure,
  correction: Correction,
  mesure: Mesure,
): DecisionCorrectionMesure | null {
  if (correction.cible !== "mesure" || correction.chemin !== CHEMIN_THEME) return null;
  let retenue: DecisionCorrectionMesure | null = null;
  for (const entree of registre) {
    if (vise(entree, correction, mesure)) retenue = entree;
  }
  return retenue;
}

function vise(entree: DecisionCorrectionMesure, correction: Correction, mesure: Mesure): boolean {
  return entree.mesure_id === mesure.id && entree.theme_demande === correction.nouvelle_valeur;
}

/**
 * Ancienneté en jours entiers, comptée contre un instant **passé en paramètre**. Aucune horloge
 * n'est lue ici : une fonction de mesure dont le résultat dépend du moment de l'appel n'est pas
 * testable, et ce qui n'est pas testable n'est pas publiable.
 */
export function ancienneteEnJours(depuis: string, instant: string): number {
  const debut = Date.parse(depuis);
  const fin = Date.parse(instant);
  if (Number.isNaN(debut)) throw new Error(`Date de demande illisible : ${JSON.stringify(depuis)}`);
  if (Number.isNaN(fin)) throw new Error(`Instant de référence illisible : ${JSON.stringify(instant)}`);
  return Math.floor((fin - debut) / 86_400_000);
}
