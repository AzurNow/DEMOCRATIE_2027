/**
 * Registre des relectures de mesure : la logique, sans le disque (décision D53 (1) du 2026-10-16).
 *
 * Une mesure est un référent partagé entre candidats, et sa `formulation_canonique` est le texte
 * exact substitué dans les gabarits de questions (§5, symétrie). Avant d'entrer dans
 * `data/mesures/`, à sa création comme à chaque nouvelle version, son contenu exact est relu par
 * l'auteur, et la relecture est inscrite dans un registre publié en ajout seul
 * (`validation/mesures/relectures.json`). `pnpm promote` refuse d'écrire une mesure qu'aucune
 * entrée ne couvre (règle 3 de `CLAUDE.md`).
 *
 * **Une règle uniforme.** Aucune distinction selon l'origine de la mesure (extraction ou autre), ni
 * selon la raison d'une nouvelle version (une correction de thème acceptée comprise) : une
 * relecture couvre un `(id, version, empreinte)`, et rien d'autre.
 *
 * **L'empreinte de relecture n'est pas `mesure.empreinte`.** Elle couvre tout ce que l'auteur relit
 * (protocole 0.17, §4 : « libellé, thème, formulation canonique, caractère fictif, alias, et pour
 * une mesure fictive son origine et la vérification de sa fictivité ») : sha256 de la forme
 * canonique de {libelle, theme, formulation_canonique, fictive, alias, origine_fictive,
 * verification_fictivite}, champs absents omis. `mesure.empreinte` (`mesure.schema.json`, calculée
 * à l'extraction) reste sur quatre champs et ne sert pas ici.
 *
 * **Absent ≠ vide.** Un champ absent n'entre pas dans l'objet canonisé ; un `alias: []` y entre.
 * Les deux contenus diffèrent, leurs empreintes aussi.
 *
 * **L'empreinte est recalculée depuis le contenu.** Le champ `empreinte` porté par la mesure n'est
 * contrôlé nulle part contre son contenu : s'y fier laisserait passer une formulation modifiée
 * après la relecture sans que ce champ suive.
 */

import { empreinteDe } from "./empreinte.ts";
import type { Mesure } from "./types.ts";
import { MOTIF_ULID } from "./ulid.ts";
import {
  DATE_CIVILE,
  objetOuLeve as objetOuLeveCommun,
  refuserChampsEnTrop as refuserChampsEnTropCommun,
} from "./validateurs-champ.ts";

export interface RelectureMesure {
  readonly mesure_id: string;
  readonly mesure_version: number;
  /** `empreinteRelecture` de la mesure relue. */
  readonly empreinte: string;
  /** Date civile de la relecture, `AAAA-MM-JJ`. */
  readonly date: string;
}

export type RegistreRelecturesMesure = readonly RelectureMesure[];

const CHAMPS: ReadonlySet<string> = new Set(["mesure_id", "mesure_version", "empreinte", "date"]);
const ULID = MOTIF_ULID;
const SHA256 = /^[0-9a-f]{64}$/;

export class EntreeRelectureInvalide extends Error {
  constructor(detail: string, provenance: string) {
    super(`Entrée du registre des relectures invalide (${provenance}) : ${detail}`);
    this.name = "EntreeRelectureInvalide";
  }
}

/**
 * sha256 de la forme canonique de {libelle, theme, formulation_canonique, fictive, alias,
 * origine_fictive, verification_fictivite}, champs absents omis (jamais remplacés par une valeur).
 */
export function empreinteRelecture(mesure: Mesure): string {
  return empreinteDe({
    libelle: mesure.libelle,
    theme: mesure.theme,
    formulation_canonique: mesure.formulation_canonique,
    fictive: mesure.fictive,
    ...siPresent("alias", mesure.alias),
    ...siPresent("origine_fictive", mesure.origine_fictive),
    ...siPresent("verification_fictivite", mesure.verification_fictivite),
  });
}

/** `{ [cle]: valeur }` si la valeur est présente, `{}` sinon : la clé n'est jamais écrite à vide. */
function siPresent<V>(cle: string, valeur: V | undefined): Readonly<Record<string, V>> {
  return valeur === undefined ? {} : { [cle]: valeur };
}

/** L'entrée qui couvrirait exactement `mesure`, relue le jour `date`. */
export function relectureDe(mesure: Mesure, date: string): RelectureMesure {
  return {
    mesure_id: mesure.id,
    mesure_version: mesure.version,
    empreinte: empreinteRelecture(mesure),
    date,
  };
}

/** Vrai ssi une entrée porte exactement l'id, la version et l'empreinte du contenu de `mesure`. */
export function mesureRelue(registre: RegistreRelecturesMesure, mesure: Mesure): boolean {
  const empreinte = empreinteRelecture(mesure);
  return registre.some(
    (entree) => entree.mesure_id === mesure.id && entree.mesure_version === mesure.version && entree.empreinte === empreinte,
  );
}

/**
 * Frontière d'exécution d'une entrée, en lecture (et en écriture, PR B). Même verdict que
 * `schema/relecture-mesure.schema.json` sur chaque cas (test d'accord) : une entrée malformée
 * arrête, elle n'est jamais complétée ni ignorée.
 */
export function validerEntreeRelecture(valeur: unknown, provenance: string): RelectureMesure {
  const brute = objetOuLeve(valeur, provenance);
  refuserChampsEnTrop(brute, provenance);
  return {
    mesure_id: motifObligatoire(brute, "mesure_id", ULID, provenance),
    mesure_version: versionObligatoire(brute, provenance),
    empreinte: motifObligatoire(brute, "empreinte", SHA256, provenance),
    date: motifObligatoire(brute, "date", DATE_CIVILE, provenance),
  };
}

function objetOuLeve(valeur: unknown, provenance: string): Record<string, unknown> {
  return objetOuLeveCommun(valeur, provenance, (detail, p) => {
    throw new EntreeRelectureInvalide(detail, p);
  });
}

function refuserChampsEnTrop(brute: Record<string, unknown>, provenance: string): void {
  refuserChampsEnTropCommun(brute, CHAMPS, provenance, (detail, p) => {
    throw new EntreeRelectureInvalide(detail, p);
  });
}

function motifObligatoire(brute: Record<string, unknown>, cle: string, motif: RegExp, provenance: string): string {
  const valeur = brute[cle];
  if (typeof valeur !== "string" || !motif.test(valeur)) {
    throw new EntreeRelectureInvalide(`champ « ${cle} » absent ou mal formé (attendu ${motif.source}).`, provenance);
  }
  return valeur;
}

function versionObligatoire(brute: Record<string, unknown>, provenance: string): number {
  const valeur = brute["mesure_version"];
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1) {
    throw new EntreeRelectureInvalide("champ « mesure_version » absent ou non entier ≥ 1.", provenance);
  }
  return valeur;
}
