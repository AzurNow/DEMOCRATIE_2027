/**
 * `staging/formulations/<question_id>/<id>.json` : une proposition par réponse HTTP reçue,
 * conforme à `schema/proposition-formulation.schema.json`, écrite une fois et jamais réécrite
 * (règle 7). Le pipeline n'écrit que sous `staging/` (règle 3) ; la promotion des formulations
 * relues vers `data/` appartient à l'interface de validation (`validation/io/data-formulations.ts`).
 * (Le chemin complet n'est pas écrit ici : `tests/ecriture-data.test.ts` attrape tout module qui
 * écrit sur disque et nomme un répertoire protégé.)
 *
 * - `ecrireProposition` valide l'objet contre le schéma (un objet non conforme est une erreur de
 *   code : `ErreurSchema`, rien n'est écrit), puis l'écrit de façon atomique — un temporaire du
 *   même répertoire, puis un lien vers le nom final, qui échoue si ce nom existe déjà
 *   (`PropositionDejaEcrite`). Calqué sur `validation/io/data-mesures.ts:creerMesure`.
 * - `lirePropositions` relit et valide toutes les propositions d'une question : le répertoire porte
 *   le nom de `question_id`, chaque fichier celui de son `id`, et `empreinte_texte_neutre` est le
 *   sha256 de `texte_neutre`. Un fichier étranger, mal nommé, incohérent ou non conforme arrête la
 *   lecture : il n'est ni lu ni ignoré, sauf `.DS_Store` seul (D54 (8)), liste fermée en données —
 *   un `.tmp` ou tout autre fichier parasite reste un refus nommé. Seul lecteur du staging : la
 *   relecture de l'interface de validation passe aussi par ici.
 * - `garderOctetsRecus` garde sous `octets-recus/<question_id>/<id>.octets` les octets de chaque
 *   réponse HTTP reçue, avant toute lecture (D55 (5)) ; `consignerNonStockee` y ajoute la cause
 *   quand la proposition n'a pas pu être écrite ; `recuesNonStockees` rend les octets sans
 *   proposition du même `id`, que la relance ne rappelle jamais (constat 24 du 2026-10-17).
 */

import { randomBytes } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import type { ObjetJson } from "../interrogation/types.ts";
import type { CodeGabarit } from "../questions/types.ts";
import type { MotifRejet } from "./controle.ts";
import type { PositionAffirmable, PositionDemandee } from "./position-affirmee.ts";

export type MotifProposition = MotifRejet | "corps_illisible";

export type IssueProposition =
  | { readonly statut: "echec_http" }
  | { readonly statut: "rejetee"; readonly motif: MotifProposition; readonly detail: string }
  | {
      readonly statut: "acceptee";
      readonly familier: { readonly texte: string };
      readonly oriente: { readonly texte: string; readonly position_affirmee?: PositionAffirmable };
    };

export type CorpsStocke = { readonly brut: ObjetJson } | { readonly brut_texte: string };

export type AppelStocke = {
  readonly date: string;
  readonly statut_http: number;
  readonly brut_octets_sha256: string;
} & CorpsStocke;

/** `schema/proposition-formulation.schema.json`, champ pour champ. */
export interface PropositionFormulation {
  readonly id: string;
  readonly question_id: string;
  readonly texte_neutre: string;
  readonly empreinte_texte_neutre: string;
  readonly version_gabarits: string;
  readonly demande: {
    readonly gabarit: CodeGabarit;
    readonly type_item: string;
    readonly libelle_candidat: string;
    readonly formulation_mesure: string;
    readonly position_affirmee: PositionDemandee;
  };
  readonly production: { readonly modele: string; readonly version_prompt: string };
  readonly appel: AppelStocke;
  readonly issue: IssueProposition;
}

export class PropositionDejaEcrite extends Error {
  constructor(chemin: string) {
    super(`Proposition déjà écrite, jamais réécrite (règle 7) : ${chemin}.`);
    this.name = "PropositionDejaEcrite";
  }
}

export class StagingFormulationsIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : ${detail} Rien n'est ignoré : corriger ou retirer ce fichier à la main.`);
    this.name = "StagingFormulationsIllisible";
  }
}

export function repertoireQuestion(staging: string, question_id: string): string {
  return join(staging, question_id);
}

export function cheminProposition(staging: string, proposition: Pick<PropositionFormulation, "id" | "question_id">): string {
  return join(repertoireQuestion(staging, proposition.question_id), `${proposition.id}.json`);
}

/**
 * Écrit `contenu` sous `<repertoire>/<nom>`, une fois, de façon atomique : un temporaire caché du
 * même répertoire, puis un lien vers le nom final, qui échoue si ce nom existe déjà
 * (`PropositionDejaEcrite`). Une seule écriture pour les propositions, les octets reçus et leur cause.
 */
function ecrireUneFois(repertoire: string, nom: string, contenu: string | Uint8Array): string {
  const chemin = join(repertoire, nom);
  mkdirSync(repertoire, { recursive: true });
  const tmp = join(repertoire, `.${nom}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  writeFileSync(tmp, contenu, { flag: "wx" });
  try {
    linkSync(tmp, chemin);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "EEXIST") throw new PropositionDejaEcrite(chemin);
    throw erreur;
  } finally {
    rmSync(tmp, { force: true });
  }
  return chemin;
}

/** Valide puis écrit une fois ; lève `ErreurSchema` ou `PropositionDejaEcrite`, sans rien écrire alors. */
export function ecrireProposition(staging: string, proposition: PropositionFormulation): string {
  const chemin = cheminProposition(staging, proposition);
  const texte = `${JSON.stringify(valider<PropositionFormulation>("proposition-formulation", proposition, `proposition à écrire dans ${chemin}`), null, 2)}\n`;
  return ecrireUneFois(repertoireQuestion(staging, proposition.question_id), `${proposition.id}.json`, texte);
}

/* ------------------------------------------------------------ octets reçus */

/**
 * `<staging>/octets-recus/<question_id>/` : les octets de chaque réponse HTTP reçue, gardés tels
 * quels avant toute interprétation, sous l'identifiant de la proposition qu'ils deviendront (D55 (5),
 * constat 24 du 2026-10-17). Ce nom ne peut pas être celui d'une question (`q_<hex>`).
 */
export const REPERTOIRE_OCTETS_RECUS = "octets-recus";

const SUFFIXE_OCTETS = ".octets";
const SUFFIXE_CAUSE = ".cause.txt";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function repertoireOctets(staging: string, question_id: string): string {
  return join(staging, REPERTOIRE_OCTETS_RECUS, question_id);
}

/** Garde les octets reçus, avant toute lecture ; rend leur chemin. Jamais réécrits (règle 7). */
export function garderOctetsRecus(staging: string, question_id: string, id: string, octets: Uint8Array): string {
  return ecrireUneFois(repertoireOctets(staging, question_id), `${id}${SUFFIXE_OCTETS}`, octets);
}

/**
 * Consigne pourquoi la réponse `id`, reçue et gardée, n'a pas été stockée : texte pour l'opérateur,
 * jamais relu par le code (la relance se fonde sur des octets sans proposition, `recuesNonStockees`).
 */
export function consignerNonStockee(staging: string, question_id: string, id: string, cause: string): string {
  return ecrireUneFois(repertoireOctets(staging, question_id), `${id}${SUFFIXE_CAUSE}`, `${cause}\n`);
}

/** L'identifiant d'un fichier d'octets ou de cause, ou `null` pour tout autre nom. */
function idDuFichier(nom: string): string | null {
  const suffixe = [SUFFIXE_OCTETS, SUFFIXE_CAUSE].find((candidat) => nom.endsWith(candidat));
  if (suffixe === undefined) return null;
  const id = nom.slice(0, -suffixe.length);
  return ULID.test(id) ? id : null;
}

/**
 * Les octets gardés d'une question sans proposition du même identifiant : réponses reçues (et
 * payées) que le banc n'a pas stockées — corps non UTF-8, proposition hors schéma, arrêt entre la
 * garde et l'écriture. Une telle question n'est jamais rappelée : elle attend l'opérateur. Un
 * fichier étranger arrête la lecture (`StagingFormulationsIllisible`), il n'est ni lu ni ignoré.
 */
export function recuesNonStockees(staging: string, question_id: string): readonly string[] {
  const repertoire = repertoireOctets(staging, question_id);
  if (!existsSync(repertoire)) return [];
  const noms = readdirSync(repertoire)
    .filter((nom) => !FICHIERS_IGNORES.has(nom))
    .sort();
  const etrangers = noms.filter((nom) => idDuFichier(nom) === null);
  if (etrangers.length > 0) {
    throw new StagingFormulationsIllisible(repertoire, `fichiers qui ne sont ni des octets reçus ni leur cause : ${etrangers.join(", ")}.`);
  }
  return noms
    .filter((nom) => nom.endsWith(SUFFIXE_OCTETS))
    .filter((nom) => !existsSync(cheminProposition(staging, { question_id, id: nom.slice(0, -SUFFIXE_OCTETS.length) })))
    .map((nom) => join(repertoire, nom));
}

function lireFichier(chemin: string, question_id: string, nom: string): PropositionFormulation {
  let brut: unknown;
  try {
    brut = JSON.parse(readFileSync(chemin, "utf8"));
  } catch (erreur) {
    throw new StagingFormulationsIllisible(chemin, `JSON illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
  const proposition = valider<PropositionFormulation>("proposition-formulation", brut, chemin);
  if (nom !== `${proposition.id}.json`) throw new StagingFormulationsIllisible(chemin, `porte l'id ${proposition.id}, pas celui de son nom.`);
  if (proposition.question_id !== question_id) {
    throw new StagingFormulationsIllisible(chemin, `porte la question ${proposition.question_id}, pas celle de son répertoire.`);
  }
  // La relecture compare cette empreinte à celle du texte neutre courant (D39) : elle doit être celle du texte porté.
  if (sha256(proposition.texte_neutre) !== proposition.empreinte_texte_neutre) {
    throw new StagingFormulationsIllisible(chemin, "empreinte_texte_neutre n'est pas le sha256 de texte_neutre.");
  }
  return proposition;
}

/** D54 (8) : le seul fichier parasite toléré en staging, liste fermée (ni `.tmp` ni aucun autre). */
const FICHIERS_IGNORES: ReadonlySet<string> = new Set([".DS_Store"]);

/** Toutes les propositions d'une question, en ordre de nom ; aucune si le répertoire n'existe pas. */
export function lirePropositions(staging: string, question_id: string): readonly PropositionFormulation[] {
  const repertoire = repertoireQuestion(staging, question_id);
  if (!existsSync(repertoire)) return [];
  const noms = readdirSync(repertoire)
    .filter((nom) => !FICHIERS_IGNORES.has(nom))
    .sort();
  const etrangers = noms.filter((nom) => !nom.endsWith(".json") || nom.startsWith("."));
  if (etrangers.length > 0) {
    throw new StagingFormulationsIllisible(repertoire, `fichiers qui ne sont pas des propositions : ${etrangers.join(", ")}.`);
  }
  return noms.map((nom) => lireFichier(join(repertoire, nom), question_id, nom));
}
