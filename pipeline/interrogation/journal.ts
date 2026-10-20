/**
 * Le journal des tentatives : un fichier `.jsonl` par requête, en ajout seul.
 *
 * Avant chaque envoi, la tentative est inscrite (`debut`) et le fichier est synchronisé sur disque ;
 * après un échec, l'erreur est inscrite (`echec`). Une relance relit le journal : chaque `debut`
 * sans `echec` ni `recue_non_stockee` est une tentative interrompue (le processus s'est arrêté
 * pendant qu'elle était en vol) et compte comme échouée, de type « autre ». Le plafond de trois
 * tentatives du §6 tient donc même après un arrêt brutal : une requête n'est jamais envoyée une
 * quatrième fois.
 *
 * Une réponse HTTP reçue mais que le banc ne peut pas stocker (décodage non UTF-8, forme
 * inattendue, schéma refusé, écriture de la réponse structurée en échec) conclut la ligne par un
 * événement `recue_non_stockee` plutôt que `echec` : ce n'est pas une tentative de l'outil (§6,
 * D55 (5)). Ses octets, déjà gardés sous `volume/` avant toute interprétation (`garderOctets`),
 * restent accessibles par `chemin_octets` — le nom de fichier relatif au répertoire des tentatives,
 * jamais un chemin absolu (le volume est archivé et publié ; un chemin absolu de la machine qui a
 * tourné le run n'y a pas de sens). La lecture refuse tout autre chemin. Une requête dont le
 * journal porte cet événement n'est jamais relue comme une tentative interrompue ni retentée :
 * `reprise()` le dit explicitement, et aucune ligne ne peut suivre.
 *
 * Si `garderOctets` échoue avant même d'avoir gardé les octets (collision, erreur disque), la
 * réponse a tout de même été reçue : une inscription `recue_non_stockee` avec `chemin_octets: null`
 * est tentée, puis l'erreur d'origine remonte pour arrêter la file de l'outil comme aujourd'hui
 * (`executer.ts:garderOctetsOuSignaler`). Si cette inscription échoue à son tour, l'erreur d'origine
 * remonte seule : la relance lira alors un `debut` sans suite comme une tentative interrompue
 * ordinaire — limite connue, non résolue ici (§6, D55 (5), décision du 2026-10-20).
 *
 * Le journal ne consigne pas les réussites stockées : une requête aboutie a sa réponse écrite
 * (`stockage.ts`), et c'est elle qui fait sauter la requête à la relance.
 *
 * Chaque ligne relue est contrôlée : forme, numéros consécutifs, clé de la requête, et l'erreur
 * contre `reponse.schema.json#/$defs/tentative/properties/erreur`. Une ligne illisible lève en
 * nommant le fichier et la ligne : un journal abîmé se montre, il ne se répare pas en silence.
 */

import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { validerFragment } from "../../outils/schemas/valider.ts";
import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import { TENTATIVES_MAX } from "./conditions.ts";
import { estObjetJson, lireJson } from "./editeur.ts";
import type { CleRequete, ErreurTentative, Tentative } from "./types.ts";

export const MESSAGE_INTERROMPUE =
  "Tentative interrompue : inscrite au journal avant l'envoi, sans résultat journalisé ; comptée comme échouée à la reprise.";

type LigneDebut = { readonly evenement: "debut"; readonly numero: number; readonly horodatage: string; readonly requete: CleRequete };
type LigneEchec = { readonly evenement: "echec"; readonly numero: number; readonly erreur: ErreurTentative };
type LigneRecueNonStockee = {
  readonly evenement: "recue_non_stockee";
  readonly numero: number;
  /** Nom de fichier relatif au répertoire des tentatives, ou `null` si la garde a elle-même échoué. */
  readonly chemin_octets: string | null;
  readonly cause: string;
};
type Ligne = LigneDebut | LigneEchec | LigneRecueNonStockee;

export class JournalIllisible extends Error {
  constructor(chemin: string, numeroLigne: number, raison: string) {
    super(`${chemin}, ligne ${numeroLigne} : ${raison}. Le journal n'est ni réparé ni ignoré.`);
    this.name = "JournalIllisible";
  }
}

/** Les octets d'une réponse HTTP déjà reçue pour cette tentative, jamais réécrits (règle 7). */
export class OctetsDejaGardes extends Error {
  constructor(chemin: string) {
    super(`${chemin} : octets déjà gardés, jamais réécrits (règle 7).`);
    this.name = "OctetsDejaGardes";
  }
}

/** Nom de fichier opaque et stable d'une requête : l'empreinte de sa clé canonique. */
export function nomJournal(cle: CleRequete): string {
  return `${sha256(canoniser(cle))}.jsonl`;
}

/** Octets bruts d'une tentative d'une requête, gardés avant toute interprétation (§6, D55 (5)). */
export function nomOctets(cle: CleRequete, numero: number): string {
  return `${sha256(canoniser(cle))}.${numero}.octets`;
}

/** Écrit la totalité du tampon : `writeSync` peut n'en écrire qu'une partie en un seul appel. */
function ecrireIntegralement(descripteur: number, octets: Uint8Array): void {
  let ecrit = 0;
  while (ecrit < octets.length) {
    ecrit += writeSync(descripteur, octets, ecrit, octets.length - ecrit);
  }
}

/**
 * Écrit `octets` sous `<repertoire>/<nom>`, en entier ou pas du tout : un fichier temporaire caché
 * du même répertoire, écrit intégralement puis synchronisé (`fsync`), est ensuite lié sous son nom
 * final (`linkSync`, exclusif — jamais de remplacement). Un arrêt pendant l'écriture laisse au plus
 * le temporaire, jamais le nom final tronqué. `chemin` déjà pris ⇒ `OctetsDejaGardes`, sans écrire.
 */
function ecrireOctetsExclusif(repertoire: string, nom: string, octets: Uint8Array): void {
  const chemin = join(repertoire, nom);
  const tmp = join(repertoire, `.${nom}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const descripteur = openSync(tmp, "wx");
  try {
    ecrireIntegralement(descripteur, octets);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
  try {
    linkSync(tmp, chemin);
  } catch (erreur) {
    if (erreur instanceof Error && "code" in erreur && erreur.code === "EEXIST") throw new OctetsDejaGardes(chemin);
    throw erreur;
  } finally {
    rmSync(tmp, { force: true });
  }
}

function ajouterLigne(chemin: string, ligne: Ligne): void {
  const descripteur = openSync(chemin, "a");
  try {
    writeSync(descripteur, `${JSON.stringify(ligne)}\n`);
    fsyncSync(descripteur);
  } finally {
    closeSync(descripteur);
  }
}

/* ------------------------------------------------------------------ lecture */

function exigerNumero(valeur: unknown): number {
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1 || valeur > TENTATIVES_MAX) {
    throw new Error(`numéro de tentative invalide : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

function exigerTexte(valeur: unknown, nom: string): string {
  if (typeof valeur !== "string") throw new Error(`${nom} absent ou non textuel`);
  return valeur;
}

/** `chemin_octets` : un nom de fichier relatif au répertoire des tentatives, ou `null`. Jamais un chemin absolu ni composé (règle 2, D55 (5)). */
function exigerCheminOctetsOuNul(valeur: unknown): string | null {
  if (valeur === null) return null;
  if (typeof valeur !== "string" || valeur.length === 0 || isAbsolute(valeur) || valeur.includes("/") || valeur.includes("\\") || valeur.includes("..")) {
    throw new Error(`chemin_octets doit être un nom de fichier relatif ou null : ${JSON.stringify(valeur)}`);
  }
  return valeur;
}

/** La clé portée par la ligne n'est pas typée ici : `appliquer` l'exige égale à celle du fichier. */
function lireDebut(objet: Readonly<Record<string, unknown>>): LigneDebut {
  const requete = objet["requete"];
  if (!estObjetJson(requete)) throw new Error("ligne debut sans clé de requête");
  return {
    evenement: "debut",
    numero: exigerNumero(objet["numero"]),
    horodatage: exigerTexte(objet["horodatage"], "horodatage"),
    requete: requete as unknown as CleRequete,
  };
}

function lireEchec(objet: Readonly<Record<string, unknown>>, provenance: string): LigneEchec {
  const erreur = validerFragment<ErreurTentative>(
    "reponse",
    "#/$defs/tentative/properties/erreur",
    objet["erreur"],
    provenance,
  );
  return { evenement: "echec", numero: exigerNumero(objet["numero"]), erreur };
}

function lireRecueNonStockee(objet: Readonly<Record<string, unknown>>): LigneRecueNonStockee {
  return {
    evenement: "recue_non_stockee",
    numero: exigerNumero(objet["numero"]),
    chemin_octets: exigerCheminOctetsOuNul(objet["chemin_octets"]),
    cause: exigerTexte(objet["cause"], "cause"),
  };
}

function lireLigne(texte: string, provenance: string): Ligne {
  const lecture = lireJson(texte);
  if (!lecture.lisible) throw new Error(`JSON illisible (${lecture.raison})`);
  const objet = lecture.valeur;
  if (!estObjetJson(objet)) throw new Error("ligne qui n'est pas un objet JSON");
  if (objet["evenement"] === "debut") return lireDebut(objet);
  if (objet["evenement"] === "echec") return lireEchec(objet, provenance);
  if (objet["evenement"] === "recue_non_stockee") return lireRecueNonStockee(objet);
  throw new Error(`événement inconnu : ${JSON.stringify(objet["evenement"])}`);
}

/* --------------------------------------------------------------- séquence */

function interrompue(debut: LigneDebut): Tentative {
  return { numero: debut.numero, horodatage: debut.horodatage, erreur: { type: "autre", message: MESSAGE_INTERROMPUE } };
}

interface Lecture {
  readonly tentatives: Tentative[];
  enCours: LigneDebut | null;
  recueNonStockee: LigneRecueNonStockee | null;
}

function appliquerDebut(lecture: Lecture, ligne: LigneDebut, cle: string): void {
  if (canoniser(ligne.requete) !== cle) throw new Error("clé de requête différente de celle du fichier");
  if (lecture.enCours !== null) lecture.tentatives.push(interrompue(lecture.enCours));
  if (ligne.numero !== lecture.tentatives.length + 1) throw new Error(`tentative ${ligne.numero} hors séquence`);
  lecture.enCours = ligne;
}

/** Applique une ligne à la séquence ; lève si elle la contredit. */
function appliquer(lecture: Lecture, ligne: Ligne, cle: string): void {
  if (lecture.recueNonStockee !== null) {
    throw new Error("ligne après « recue_non_stockee » : cette requête n'est plus retentée (§6, D55 (5))");
  }
  if (ligne.evenement === "debut") return appliquerDebut(lecture, ligne, cle);
  if (lecture.enCours?.numero !== ligne.numero) throw new Error(`${ligne.evenement} de la tentative ${ligne.numero} sans son début`);
  if (ligne.evenement === "recue_non_stockee") {
    lecture.recueNonStockee = ligne;
    lecture.enCours = null;
    return;
  }
  lecture.tentatives.push({ numero: ligne.numero, horodatage: lecture.enCours.horodatage, erreur: ligne.erreur });
  lecture.enCours = null;
}

function lignesDe(chemin: string): readonly string[] {
  const contenu = readFileSync(chemin, "utf8");
  if (contenu.length > 0 && !contenu.endsWith("\n")) {
    throw new JournalIllisible(chemin, contenu.split("\n").length, "dernière ligne tronquée (écriture interrompue)");
  }
  return contenu.split("\n").slice(0, -1);
}

/** Ce que la relecture du journal d'une requête rend : ses tentatives, ou une requête en attente. */
export type Reprise =
  | { readonly genre: "tentatives"; readonly tentatives: readonly Tentative[] }
  | { readonly genre: "recue_non_stockee"; readonly numero: number; readonly chemin_octets: string | null; readonly cause: string };

/* ------------------------------------------------------------------ journal */

/** Le journal d'une requête, dans le répertoire `tentatives/` du volume du run. */
export class JournalRequete {
  readonly chemin: string;
  private readonly repertoire: string;
  private readonly cleOriginale: CleRequete;
  private readonly cle: string;

  constructor(repertoire: string, cle: CleRequete) {
    this.repertoire = repertoire;
    this.chemin = join(repertoire, nomJournal(cle));
    this.cleOriginale = cle;
    this.cle = canoniser(cle);
  }

  /**
   * Ce que la requête porte avant de reprendre : ses tentatives (interrompues comprises), ou,
   * si le journal porte un événement `recue_non_stockee`, la requête en attente de l'opérateur —
   * jamais retentée (§6, D55 (5)). Vide si aucun journal.
   */
  reprise(): Reprise {
    if (!existsSync(this.chemin)) return { genre: "tentatives", tentatives: [] };
    const lecture: Lecture = { tentatives: [], enCours: null, recueNonStockee: null };
    lignesDe(this.chemin).forEach((texte, rang) => {
      const provenance = `${this.chemin}, ligne ${rang + 1}`;
      try {
        appliquer(lecture, lireLigne(texte, provenance), this.cle);
      } catch (erreur) {
        throw new JournalIllisible(this.chemin, rang + 1, erreur instanceof Error ? erreur.message : String(erreur));
      }
    });
    if (lecture.recueNonStockee !== null) {
      const { numero, chemin_octets, cause } = lecture.recueNonStockee;
      return { genre: "recue_non_stockee", numero, chemin_octets, cause };
    }
    const tentatives = lecture.enCours === null ? lecture.tentatives : [...lecture.tentatives, interrompue(lecture.enCours)];
    return { genre: "tentatives", tentatives };
  }

  inscrireDebut(numero: number, horodatage: string, requete: CleRequete): void {
    ajouterLigne(this.chemin, { evenement: "debut", numero, horodatage, requete });
  }

  inscrireEchec(numero: number, erreur: ErreurTentative): void {
    ajouterLigne(this.chemin, { evenement: "echec", numero, erreur });
  }

  /**
   * Garde les octets reçus pour la tentative `numero`, avant toute interprétation (§6, D55 (5)).
   * Rend le nom de fichier relatif au répertoire des tentatives (jamais un chemin absolu, règle 2).
   */
  garderOctets(numero: number, octets: Uint8Array): string {
    const nom = nomOctets(this.cleOriginale, numero);
    ecrireOctetsExclusif(this.repertoire, nom, octets);
    return nom;
  }

  /** Conclut la ligne ouverte par `inscrireDebut(numero, …)` : la réponse est reçue, non stockée. */
  inscrireRecueNonStockee(numero: number, chemin_octets: string | null, cause: string): void {
    ajouterLigne(this.chemin, { evenement: "recue_non_stockee", numero, chemin_octets, cause });
  }
}
