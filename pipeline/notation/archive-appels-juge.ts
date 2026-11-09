/**
 * L'archive des appels d'un juge réel (§7, décision D100 de l'auteur du 2026-11-09) : « La réponse
 * HTTP brute de chaque appel de juge est stockée telle quelle et publiée dans le volume du run, comme
 * les réponses brutes de l'interrogation » (texte proposé pour la 0.35, `docs/TACHES-AUTEUR.md`,
 * item 13). Règle 7 : ce qu'un juge a répondu n'est ni nettoyé, ni tronqué, ni reformaté.
 *
 * **Ce qui est gardé, et quand.** Chaque tentative d'un appel laisse, sous
 * `runs/<date>/volume/appels-juges/` :
 * - `<empreinte>.<appel>.<tentative>.json` : ses métadonnées (`schema/appel-juge.schema.json`) —
 *   identifiants de l'appel, instants de départ et de fin, statut HTTP et empreinte des octets, ou la
 *   raison de l'échec de transport quand aucune réponse HTTP n'est arrivée (réseau, délai d'abandon) ;
 * - `<empreinte>.<appel>.<tentative>.octets` : les octets du corps, tels que reçus, quand une réponse
 *   HTTP est arrivée — quel que soit son statut (401, 429, 500… comme 200) et son contenu (non UTF-8,
 *   non JSON, sortie illisible).
 * Les deux sont écrits **dès la réception, avant toute lecture** du statut ou du corps
 * (`appel-juge.ts:tenter`) : les métadonnées d'abord, validées contre leur schéma, puis les octets,
 * comme la réception de l'interrogation précède ses octets (`interrogation/journal.ts`, §6 0.21). Un
 * arrêt entre les deux laisse des métadonnées sans octets, jamais des octets sans métadonnées.
 *
 * **Écrit une fois, jamais remplacé.** Chaque fichier passe par `pipeline/run/ecriture.ts:ecrireUneFois`
 * (lien dur exclusif) : un nom déjà pris lève `AppelJugeDejaArchive`, sans rien écrire, et cette erreur
 * n'est pas une défaillance du juge — elle remonte et arrête la notation, comme tout défaut du banc.
 * Une archive qui ne peut pas s'écrire empêche donc la lecture de la réponse : aucune note ne naît
 * d'une réponse non gardée.
 *
 * **Appels rejoués.** `<empreinte>` est le SHA-256 de la forme canonique de `{juge_id, reponse_id}`
 * (`reponse_id` est l'objet noté : la réponse du run, ou la réponse permutée d'un test
 * contrefactuel). `<appel>` numérote les appels de ce juge sur cet objet, à partir de 1 : une relance
 * après un arrêt (401 ou 403, `AccesApiRefuse` ; processus interrompu) prend le premier numéro libre et
 * ne touche à rien de ce qui est déjà gardé. `<tentative>` est le rang de la tentative dans l'appel
 * (politique de tentatives déclarée, `appel-juge.ts:PolitiqueTentatives`).
 *
 * **Ce qui n'est pas gardé.** Ni la requête (son corps porte le texte des pages citées, qui ne sont
 * pas republiées, `runs/README.md`, D75 (4) ; seule son empreinte canonique `requete_sha256` est
 * gardée), ni ses en-têtes (la clé d'API), ni les en-têtes de la réponse, que le transport ne rend pas
 * (`interrogation/editeur.ts:ReponseHttp`), comme pour l'interrogation.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import type { ReponseHttp, RequeteHttp } from "../interrogation/editeur.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import { empreinteOctets } from "../interrogation/tentatives.ts";
import { ecrireUneFois } from "../run/ecriture.ts";

/** Le dossier de l'archive, dans le volume du run (archive Zenodo, `runs/README.md`). */
export function repertoireAppelsJuges(repertoire_run: string): string {
  return join(repertoire_run, "volume", "appels-juges");
}

/** Ce qui nomme les appels d'un juge sur un objet noté. */
export interface CleAppelJuge {
  readonly juge_id: string;
  /** `charge.reponse_id` : l'objet noté (ULID), jamais l'outil. */
  readonly reponse_id: string;
}

/** Ce que le juge sait de l'appel qu'il fait : sa clé, son identité déclarée au run et la requête. */
export interface AppelJuge extends CleAppelJuge {
  readonly modele: string;
  /** `<chemin>@<version>` (`juge.ts:versionPromptDe`). */
  readonly version_prompt: string;
  readonly version_charge: string;
  readonly requete: RequeteHttp;
}

interface MetadonneesCommunes {
  readonly juge_id: string;
  readonly reponse_id: string;
  readonly modele: string;
  readonly version_prompt: string;
  readonly version_charge: string;
  readonly appel: number;
  readonly tentative: number;
  readonly endpoint: string;
  /** SHA-256 de la forme canonique du corps envoyé (`canoniser`), comme `reponse.requete.sha256`. */
  readonly requete_sha256: string;
  /** Instant du départ de la tentative, en ms depuis l'époque Unix, horloge du run. */
  readonly debut_ms: number;
  /** Instant de la réception, ou de l'échec de transport, en ms. */
  readonly fin_ms: number;
}

/** `schema/appel-juge.schema.json` : une tentative d'appel, avec ou sans réponse HTTP. */
export type MetadonneesAppelJuge =
  | (MetadonneesCommunes & { readonly issue: "reponse_http"; readonly statut_http: number; readonly octets_sha256: string; readonly taille_octets: number })
  | (MetadonneesCommunes & { readonly issue: "sans_reponse"; readonly raison: string });

/** Une tentative partie, en attente de son issue. Chaque méthode écrit, une fois. */
export interface TentativeEnVol {
  /** Une réponse HTTP est arrivée : métadonnées puis octets exacts, avant toute lecture. */
  recue(reponse: ReponseHttp): void;
  /** Aucune réponse HTTP (réseau, délai d'abandon) : la raison seule. */
  sansReponse(raison: string): void;
}

export interface AppelOuvert {
  readonly numero: number;
  /** À appeler juste avant l'envoi de la tentative `tentative` : l'instant de départ est pris ici. */
  partir(tentative: number): TentativeEnVol;
}

/** Le port que reçoit un juge réel (`appel-juge.ts:DeclarationJugeReel`). */
export interface ArchiveAppelsJuge {
  ouvrir(appel: AppelJuge): AppelOuvert;
}

/** Un fichier de l'archive existe déjà sous ce nom : il n'est jamais remplacé (règle 7). */
export class AppelJugeDejaArchive extends Error {
  constructor(chemin: string) {
    super(`${chemin} : déjà archivé, jamais réécrit (règle 7, D100). La notation s'arrête ; rien n'est remplacé.`);
    this.name = "AppelJugeDejaArchive";
  }
}

export function empreinteAppelJuge(cle: CleAppelJuge): string {
  return sha256(canoniser({ juge_id: cle.juge_id, reponse_id: cle.reponse_id }));
}

/** `<empreinte>.<appel>.<tentative>.json` : les métadonnées d'une tentative. */
export function nomMetadonneesAppel(cle: CleAppelJuge, appel: number, tentative: number): string {
  return `${empreinteAppelJuge(cle)}.${appel}.${tentative}.json`;
}

/** `<empreinte>.<appel>.<tentative>.octets` : le corps reçu, tel quel. */
export function nomOctetsAppel(cle: CleAppelJuge, appel: number, tentative: number): string {
  return `${empreinteAppelJuge(cle)}.${appel}.${tentative}.octets`;
}

/** Le premier numéro d'appel dont la première tentative n'a laissé aucune métadonnée. */
function premierAppelLibre(repertoire: string, cle: CleAppelJuge): number {
  let appel = 1;
  while (existsSync(join(repertoire, nomMetadonneesAppel(cle, appel, 1)))) appel += 1;
  return appel;
}

function ecrireExclusif(repertoire: string, nom: string, contenu: string | Uint8Array): void {
  mkdirSync(repertoire, { recursive: true });
  ecrireUneFois(repertoire, nom, contenu, (chemin) => new AppelJugeDejaArchive(chemin));
}

function ecrireMetadonnees(repertoire: string, nom: string, metadonnees: MetadonneesAppelJuge): void {
  valider("appel-juge", metadonnees, `${nom} avant écriture`);
  ecrireExclusif(repertoire, nom, `${JSON.stringify(metadonnees, null, 2)}\n`);
}

interface Contexte {
  readonly repertoire: string;
  readonly maintenant: Horloge["maintenant"];
}

function communesDe(appel: AppelJuge, numero: number, tentative: number, debut_ms: number, fin_ms: number): MetadonneesCommunes {
  return {
    juge_id: appel.juge_id,
    reponse_id: appel.reponse_id,
    modele: appel.modele,
    version_prompt: appel.version_prompt,
    version_charge: appel.version_charge,
    appel: numero,
    tentative,
    endpoint: appel.requete.endpoint,
    requete_sha256: sha256(canoniser(appel.requete.corps)),
    debut_ms,
    fin_ms,
  };
}

function tentativeEnVol(contexte: Contexte, appel: AppelJuge, numero: number, tentative: number): TentativeEnVol {
  const debut_ms = contexte.maintenant();
  return {
    recue(reponse) {
      const communes = communesDe(appel, numero, tentative, debut_ms, contexte.maintenant());
      const metadonnees: MetadonneesAppelJuge = {
        ...communes,
        issue: "reponse_http",
        statut_http: reponse.statut,
        octets_sha256: empreinteOctets(reponse.corps),
        taille_octets: reponse.corps.length,
      };
      ecrireMetadonnees(contexte.repertoire, nomMetadonneesAppel(appel, numero, tentative), metadonnees);
      ecrireExclusif(contexte.repertoire, nomOctetsAppel(appel, numero, tentative), reponse.corps);
    },
    sansReponse(raison) {
      const communes = communesDe(appel, numero, tentative, debut_ms, contexte.maintenant());
      ecrireMetadonnees(contexte.repertoire, nomMetadonneesAppel(appel, numero, tentative), { ...communes, issue: "sans_reponse", raison });
    },
  };
}

/**
 * L'archive des appels de juge du run `repertoire_run`. Rien n'est créé avant la première tentative
 * gardée : une notation qui refuse de partir ne laisse aucun dossier.
 */
export function archiveAppelsJuge(repertoire_run: string, maintenant: Horloge["maintenant"]): ArchiveAppelsJuge {
  const contexte: Contexte = { repertoire: repertoireAppelsJuges(repertoire_run), maintenant };
  return {
    ouvrir(appel) {
      const numero = premierAppelLibre(contexte.repertoire, appel);
      return { numero, partir: (tentative) => tentativeEnVol(contexte, appel, numero, tentative) };
    },
  };
}
