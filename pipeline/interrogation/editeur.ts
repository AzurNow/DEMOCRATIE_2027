/**
 * L'interface d'un éditeur interrogé (D3) : un adaptateur, propre à l'éditeur, et un transport.
 *
 * Tout ce qui distingue un éditeur d'un autre vit dans son adaptateur — la forme de la requête,
 * le mode web, la reconnaissance d'un refus de modération, la lecture du stop_reason, ses en-têtes
 * d'authentification — et jamais dans un `if` sur un outil. L'exécution (`executer.ts`) ne connaît
 * que cette interface.
 *
 * D3 : la réponse brute stockée est le corps HTTP tel que reçu, jamais l'objet d'un SDK. Le
 * transport rend donc les octets du corps et son statut, rien d'autre. Décisions de l'auteur du
 * 2026-10-02 : l'empreinte de ces octets est prise avant toute lecture (`brut_octets_sha256`) ; un
 * corps qui est un objet JSON est stocké dans `brut`, tout autre corps UTF-8 dans `brut_texte` ; un
 * corps qui n'est pas de l'UTF-8 valide lève `CorpsNonUtf8`.
 */

import type { ErreurTentative, Mode, ObjetJson } from "./types.ts";

/** Une requête prête à partir : tous ses en-têtes, authentification comprise. */
export interface RequeteHttp {
  readonly endpoint: string;
  readonly entetes: Readonly<Record<string, string>>;
  readonly corps: ObjetJson;
}

/** Ce que le serveur a renvoyé : le statut et les octets du corps, tels que reçus. */
export interface ReponseHttp {
  readonly statut: number;
  readonly corps: Uint8Array;
}

/** Échec du transport lui-même (connexion refusée, coupée) : erreur de tentative « reseau ». */
export class ErreurReseau extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurReseau";
  }
}

export interface Transport {
  /** Rejette `ErreurReseau` sur un échec de transport ; un `signal` levé abandonne l'envoi. */
  envoyer(requete: RequeteHttp, signal: AbortSignal): Promise<ReponseHttp>;
}

/** Le corps lu : un objet JSON (`brut`), ou le texte UTF-8 tel que reçu (`brut_texte`). */
export type Contenu =
  | { readonly forme: "objet"; readonly brut: ObjetJson }
  | { readonly forme: "texte"; readonly brut_texte: string };

/** Ce que l'adaptateur conclut d'une réponse HTTP. */
export type Classement =
  | { readonly issue: "reponse"; readonly contenu: Contenu }
  | { readonly issue: "refus_api"; readonly contenu: Contenu }
  | { readonly issue: "echec"; readonly erreur: ErreurTentative };

/**
 * Une citation dans la forme commune à tous les éditeurs (D15), seule forme qu'un adaptateur peut
 * projeter : ramener les champs propres à son éditeur (`uri`, `title`, `cited_text`…) vers `url` et
 * `texte` est le travail de sa normalisation. Le juge ne lit que ces deux clés ; une citation qui ne
 * porte ni l'une ni l'autre fait refuser la charge (`charge-juge.ts:CitationSansUrlNiTexte`).
 */
export type CitationNormalisee = { readonly url?: string; readonly texte?: string };

/** La projection avec perte d'une réponse ordinaire ; `refus_api` est posé par l'exécution. */
export interface Projection {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly citations?: readonly CitationNormalisee[];
  readonly appels_outils?: readonly ObjetJson[];
  readonly troncature: boolean;
}

/** Ce que l'API renvoie sur elle-même. Une valeur absente vaut `null`, jamais une copie. */
export interface MetadonneesRenvoyees {
  readonly modele_renvoye: string | null;
  readonly stop_reason: string | null;
  readonly tokens?: { readonly entree?: number; readonly sortie?: number };
}

export interface EntreeRequete {
  readonly texte: string;
  readonly mode: Mode;
  readonly modele_demande: string;
}

export interface Adaptateur {
  /** `reponse.normalisation` : la fonction de projection et sa version. */
  readonly normalisation: { readonly fonction: string; readonly version: string };
  /** Noms d'en-têtes d'authentification propres à l'éditeur, en plus de `EN_TETES_AUTHENTIFICATION`. */
  readonly entetes_authentification: readonly string[];
  /** §6 : aucune instruction système, paramètres par défaut, 2 048 tokens, le texte seul. */
  construireRequete(entree: EntreeRequete): RequeteHttp;
  /** §6 : les valeurs effectives des paramètres, enregistrées dans les métadonnées. */
  parametresEffectifs(requete: RequeteHttp): ObjetJson;
  classer(reponse: ReponseHttp): Classement;
  normaliser(contenu: Contenu): Projection;
  metadonnees(contenu: Contenu): MetadonneesRenvoyees;
}

export interface Editeur {
  readonly adaptateur: Adaptateur;
  readonly transport: Transport;
}

/* ------------------------------------------------------- en-têtes enregistrés */

/**
 * Les en-têtes d'authentification retirés de toute requête enregistrée, quel que soit l'éditeur
 * (décision de l'auteur du 2026-10-02). Comparés sans égard à la casse : HTTP ne la distingue pas.
 */
export const EN_TETES_AUTHENTIFICATION: readonly string[] = ["authorization", "x-api-key", "api-key"];

/** Les en-têtes envoyés, moins ceux d'authentification : le seul retrait autorisé (règle 7, §9). */
export function entetesEnregistrables(
  entetes: Readonly<Record<string, string>>,
  propres_a_l_editeur: readonly string[],
): Readonly<Record<string, string>> {
  const retires = new Set([...EN_TETES_AUTHENTIFICATION, ...propres_a_l_editeur].map((nom) => nom.toLowerCase()));
  return Object.fromEntries(Object.entries(entetes).filter(([nom]) => !retires.has(nom.toLowerCase())));
}

/* ------------------------------------------------------------ lecture du corps */

/** Un corps qui n'est pas de l'UTF-8 valide : `brut_texte` ne peut pas le porter tel quel. */
export class CorpsNonUtf8 extends Error {
  constructor(statut: number, longueur: number) {
    super(
      `Corps HTTP ${statut} de ${longueur} octets qui n'est pas de l'UTF-8 valide : ni brut ni brut_texte ne ` +
        `peuvent le porter sans le transformer (règle 7). Rien n'est écrit pour cette requête.`,
    );
    this.name = "CorpsNonUtf8";
  }
}

export type LectureJson = { readonly lisible: true; readonly valeur: unknown } | { readonly lisible: false; readonly raison: string };

/** Lit un texte comme JSON sans rien en perdre de visible : l'illisible est dit, pas comblé. */
export function lireJson(texte: string): LectureJson {
  try {
    return { lisible: true, valeur: JSON.parse(texte) as unknown };
  } catch (erreur) {
    return { lisible: false, raison: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

export function estObjetJson(valeur: unknown): valeur is ObjetJson {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const UTF8_INDICATIF = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

/** Le texte UTF-8 exact d'un corps, octet d'ordre compris ; lève `CorpsNonUtf8` sinon. */
export function texteExact(reponse: ReponseHttp): string {
  try {
    return UTF8_STRICT.decode(reponse.corps);
  } catch (erreur) {
    if (erreur instanceof TypeError) throw new CorpsNonUtf8(reponse.statut, reponse.corps.length);
    throw erreur;
  }
}

/**
 * Lecture indicative d'un corps, pour y chercher un code d'erreur : jamais stockée, elle remplace
 * un octet invalide par U+FFFD au lieu de lever, parce qu'une page d'erreur 503 mal encodée reste
 * un échec de tentative ordinaire.
 */
export function texteIndicatif(reponse: ReponseHttp): string {
  return UTF8_INDICATIF.decode(reponse.corps);
}

/** Le contenu stockable d'un corps : objet JSON dans `brut`, sinon le texte exact dans `brut_texte`. */
export function lireContenu(reponse: ReponseHttp): Contenu {
  const texte = texteExact(reponse);
  const lecture = lireJson(texte);
  if (lecture.lisible && estObjetJson(lecture.valeur)) return { forme: "objet", brut: lecture.valeur };
  return { forme: "texte", brut_texte: texte };
}
