/**
 * Le journal des tentatives : un fichier `.jsonl` par requête, en ajout seul.
 *
 * Avant chaque envoi, la tentative est inscrite (`debut`) et le fichier est synchronisé sur disque ;
 * après un échec, l'erreur est inscrite (`echec`). Une relance relit le journal : chaque `debut`
 * sans `echec` ni `recue_non_stockee`, et sans octets gardés, est une tentative interrompue (le processus s'est arrêté
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
 * Un arrêt brutal après la garde des octets mais avant la suite (réponse écrite, `echec` ou
 * `recue_non_stockee`) laisse un `debut` sans suite dont les octets existent : la réponse a été
 * reçue. `reprise()` le rend comme `octets_sans_suite`, jamais comme une tentative interrompue :
 * la requête n'est pas renvoyée et le compteur de tentatives ne bouge pas (§6, 0.19). L'exécution
 * conclut alors la ligne par `recue_non_stockee` (`executer.ts`), sans relire les octets.
 *
 * Réception (§6, 0.21) : avant ses octets, chaque réponse HTTP reçue laisse ses métadonnées de
 * réception — statut HTTP, instants d'envoi et de réception, empreinte des octets — dans
 * `<clé>.<n>.reception.json` (`garderReception`, schéma `reponse#/$defs/reception`), écrit de la
 * même façon atomique et exclusive. Cet ordre ne laisse jamais, après un arrêt, des octets sans leur
 * réception : un arrêt entre les deux laisse une réception sans octets, et la tentative est alors
 * relue comme interrompue, comme avant (la réponse n'a pas été gardée, elle ne peut être stockée).
 * Des octets sans réception ne viennent donc que d'un volume antérieur à cette garde, ou d'une
 * intervention extérieure : l'opérateur les refuse sous un motif nommé (`stocker.ts`).
 *
 * L'opérateur stocke une réponse en attente depuis ses octets et sa réception (`stocker.ts`), par le
 * même chemin que l'exécution. Si l'adaptateur la classe en échec (un 503 gardé, par exemple), la
 * tentative est conclue comme au chemin normal, par un `echec` inscrit après `recue_non_stockee` —
 * le seul événement admis à cette place, et pour la même tentative : elle redevient une tentative
 * de l'outil, comptée, et la requête est retentée par la relance ordinaire si le §6 le permet.
 *
 * Le journal ne consigne pas les réussites stockées : une requête aboutie a sa réponse écrite
 * (`stockage.ts`), et c'est elle qui fait sauter la requête à la relance.
 *
 * Chaque ligne relue est contrôlée : forme, numéros consécutifs, clé de la requête, et l'erreur
 * contre `reponse.schema.json#/$defs/tentative/properties/erreur`. Une ligne illisible lève en
 * nommant le fichier et la ligne : un journal abîmé se montre, il ne se répare pas en silence.
 */

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { validerFragment } from "../../outils/schemas/valider.ts";
import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import { ecrireUneFois } from "../run/ecriture.ts";
import { TENTATIVES_MAX } from "./conditions.ts";
import { estObjetJson, lireJson } from "./editeur.ts";
import type { CleRequete, ErreurTentative, Tentative } from "./types.ts";

export const MESSAGE_INTERROMPUE =
  "Tentative interrompue : inscrite au journal avant l'envoi, sans résultat journalisé ; comptée comme échouée à la reprise.";

/** Cause inscrite à la reprise d'une tentative dont les octets sont gardés mais la ligne non conclue (§6, 0.19). */
export const MESSAGE_OCTETS_SANS_SUITE =
  "Arrêt après la garde des octets reçus, avant leur stockage : réponse reçue, ni renvoyée ni comptée comme " +
  "tentative ; son statut HTTP et son instant de réception n'ont pas été journalisés, elle attend l'opérateur (§6).";

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

/** Métadonnées de réception d'une tentative, gardées avant ses octets (§6, 0.21). */
export function nomReception(cle: CleRequete, numero: number): string {
  return `${sha256(canoniser(cle))}.${numero}.reception.json`;
}

/** `reponse.schema.json#/$defs/reception` : ce qu'il faut, avec les octets, pour stocker sans rien inventer. */
export interface Reception {
  readonly numero: number;
  readonly statut_http: number;
  /** Instant de l'envoi (début de la tentative), en ms, horloge du run. */
  readonly debut_ms: number;
  /** Instant de la réception de la réponse HTTP, en ms, horloge du run. */
  readonly reception_ms: number;
  /** SHA-256 des octets gardés, tels que reçus. */
  readonly octets_sha256: string;
}

/** Une réception gardée illisible : JSON, schéma, ou numéro autre que celui de son nom de fichier. */
export class ReceptionIllisible extends Error {
  constructor(chemin: string, raison: string) {
    super(`${chemin} : ${raison}. La réception n'est ni réparée ni ignorée.`);
    this.name = "ReceptionIllisible";
  }
}

/**
 * Écrit `octets` sous `<repertoire>/<nom>`, en entier ou pas du tout, jamais en remplacement
 * (`pipeline/run/ecriture.ts:ecrireUneFois`, la seule écriture « une fois » du dépôt). `chemin` déjà
 * pris ⇒ `OctetsDejaGardes`, sans écrire.
 */
function ecrireOctetsExclusif(repertoire: string, nom: string, octets: Uint8Array): void {
  ecrireUneFois(repertoire, nom, octets, (chemin) => new OctetsDejaGardes(chemin));
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

/** Une ligne `recue_non_stockee`, avec l'horodatage du `debut` qu'elle conclut. */
type RecueLue = LigneRecueNonStockee & { readonly horodatage: string };

interface Lecture {
  readonly tentatives: Tentative[];
  enCours: LigneDebut | null;
  recueNonStockee: RecueLue | null;
}

function appliquerDebut(lecture: Lecture, ligne: LigneDebut, cle: string): void {
  if (canoniser(ligne.requete) !== cle) throw new Error("clé de requête différente de celle du fichier");
  if (lecture.enCours !== null) lecture.tentatives.push(interrompue(lecture.enCours));
  if (ligne.numero !== lecture.tentatives.length + 1) throw new Error(`tentative ${ligne.numero} hors séquence`);
  lecture.enCours = ligne;
}

/**
 * Après `recue_non_stockee`, seul l'`echec` de la même tentative est admis : l'opérateur a stocké la
 * réponse gardée et l'adaptateur l'a classée en échec (`stocker.ts`, §6, 0.21). La tentative est
 * alors comptée comme au chemin normal, et la séquence reprend.
 */
function appliquerApresAttente(lecture: Lecture, recue: RecueLue, ligne: Ligne): void {
  if (ligne.evenement !== "echec" || ligne.numero !== recue.numero) {
    throw new Error(
      "ligne après « recue_non_stockee » autre que l'échec de la même tentative conclu par l'opérateur : " +
        "cette requête n'est pas retentée (§6, D55 (5))",
    );
  }
  lecture.tentatives.push({ numero: ligne.numero, horodatage: recue.horodatage, erreur: ligne.erreur });
  lecture.recueNonStockee = null;
}

/** Applique une ligne à la séquence ; lève si elle la contredit. */
function appliquer(lecture: Lecture, ligne: Ligne, cle: string): void {
  if (lecture.recueNonStockee !== null) return appliquerApresAttente(lecture, lecture.recueNonStockee, ligne);
  if (ligne.evenement === "debut") return appliquerDebut(lecture, ligne, cle);
  if (lecture.enCours?.numero !== ligne.numero) throw new Error(`${ligne.evenement} de la tentative ${ligne.numero} sans son début`);
  if (ligne.evenement === "recue_non_stockee") {
    lecture.recueNonStockee = { ...ligne, horodatage: lecture.enCours.horodatage };
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

/**
 * Ce que la relecture du journal d'une requête rend : ses tentatives, une requête en attente, ou
 * une réponse reçue et gardée dont la ligne n'a pas été conclue (arrêt après `garderOctets`). Dans
 * ces deux derniers cas, `tentatives` porte les tentatives closes qui précèdent la tentative
 * `numero` : celles que la réponse obtenue gardera si l'opérateur la stocke (§6, 0.21).
 */
export type Reprise =
  | { readonly genre: "tentatives"; readonly tentatives: readonly Tentative[] }
  | {
      readonly genre: "recue_non_stockee";
      readonly numero: number;
      readonly chemin_octets: string | null;
      readonly cause: string;
      readonly tentatives: readonly Tentative[];
    }
  | { readonly genre: "octets_sans_suite"; readonly numero: number; readonly chemin_octets: string; readonly tentatives: readonly Tentative[] };

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
   * jamais retentée (§6, D55 (5)). Une dernière tentative ouverte dont les octets sont gardés est
   * une réponse reçue, non une tentative interrompue : `octets_sans_suite`, jamais renvoyée ni
   * comptée (§6, 0.19). Vide si aucun journal. Lecture seule : rien n'est inscrit ici.
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
      return { genre: "recue_non_stockee", numero, chemin_octets, cause, tentatives: lecture.tentatives };
    }
    if (lecture.enCours === null) return { genre: "tentatives", tentatives: lecture.tentatives };
    return this.repriseDeLaTentativeOuverte(lecture.tentatives, lecture.enCours);
  }

  /**
   * La dernière tentative a un `debut` sans suite. Ses octets gardés existent : la réponse a été
   * reçue avant l'arrêt — leur contenu n'est pas lu (vide ou tronqué, ce sont les octets reçus).
   * Sinon, l'arrêt a eu lieu avant toute réception : tentative interrompue, comptée comme échouée.
   */
  private repriseDeLaTentativeOuverte(closes: readonly Tentative[], ouverte: LigneDebut): Reprise {
    const nom = nomOctets(this.cleOriginale, ouverte.numero);
    if (existsSync(join(this.repertoire, nom))) return { genre: "octets_sans_suite", numero: ouverte.numero, chemin_octets: nom, tentatives: closes };
    return { genre: "tentatives", tentatives: [...closes, interrompue(ouverte)] };
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

  /**
   * Garde la réception de la tentative `reception.numero`, validée, avant ses octets (§6, 0.21) :
   * atomique et exclusive comme eux (`OctetsDejaGardes` si le nom est pris, sans écrire).
   */
  garderReception(reception: Reception): void {
    const nom = nomReception(this.cleOriginale, reception.numero);
    validerReception(reception, `${nom} avant écriture`);
    ecrireOctetsExclusif(this.repertoire, nom, new TextEncoder().encode(`${JSON.stringify(reception)}\n`));
  }

  /** La réception gardée de la tentative `numero`, validée ; `null` si aucune n'a été gardée. */
  lireReception(numero: number): Reception | null {
    const chemin = join(this.repertoire, nomReception(this.cleOriginale, numero));
    if (!existsSync(chemin)) return null;
    const lecture = lireJson(readFileSync(chemin, "utf8"));
    if (!lecture.lisible) throw new ReceptionIllisible(chemin, `JSON illisible (${lecture.raison})`);
    const reception = validerReception(lecture.valeur, chemin);
    if (reception.numero !== numero) throw new ReceptionIllisible(chemin, `numéro ${reception.numero} au lieu de ${numero}`);
    return reception;
  }

  /** Les octets gardés sous `chemin_octets`, nom relatif relu du journal (jamais un chemin absolu). */
  lireOctets(chemin_octets: string): Uint8Array {
    return readFileSync(join(this.repertoire, exigerCheminOctetsOuNul(chemin_octets) as string));
  }
}

function validerReception(valeur: unknown, provenance: string): Reception {
  return validerFragment<Reception>("reponse", "#/$defs/reception", valeur, provenance);
}
