/**
 * Le fournisseur d'existences adossé aux fichiers du test des liens d'un run (§7 ; décision D20).
 *
 * `pnpm liens <run>` (`pipeline/liens`, Python) écrit un fichier par URL citée,
 * `runs/<date>/volume/liens/<sha256 de l'URL>.json` (`schema/existence-lien.schema.json`). Ce module
 * les lit **tous, à la construction** : un fichier invalide au schéma ou incohérent arrête la
 * construction par une erreur nommée (`ErreurSchema`, `FichierExistenceRefuse`), il n'est jamais
 * ignoré. Contrôles en plus du schéma :
 * - le nom du fichier est le SHA-256 (UTF-8) de `url_citee` : un fichier par URL, sans doublon ;
 * - tentatives numérotées 1, 2, 3… sans trou ; `date_test` et `code_http` sont ceux de la dernière ;
 * - `archive_url`, quand elle est présente, est exactement l'instantané que Wayback a renvoyé (Save
 *   Page Now : `wayback.archive_url`) ou servi (D22 : forme publique, sans `id_`, de l'URL finale du
 *   téléchargement de la version brute, qui peut différer de l'instantané demandé) ; sa présence ou
 *   son absence est réglée par le schéma (D21 : un instantané écarté ou un téléchargement en échec
 *   n'en donnent pas) ;
 * - la copie conservée — page d'un lien qui existe, ou version brute de l'instantané téléchargée
 *   pour un lien inaccessible ou non testable (D21) — est présente sous `runs/<date>/pages-citees/`,
 *   hors de `volume/` (D75 (4) : le volume part en entier sur Zenodo, les pages citées non), au
 *   chemin relatif au run que déclare le résultat, nommée par son empreinte (`sha256_contenu`), de
 *   la taille annoncée (l'empreinte elle-même n'est pas recalculée à chaque ouverture de l'écran).
 * Une entrée de `volume/liens/` qui n'est ni un résultat `.json` ni l'un des dossiers
 * `extractions/` est refusée : un ancien dossier `pages/` ou `textes/` sous `volume/liens/` aussi (D75 (4), D83).
 *
 * Contrat de `FournisseurExistences` inchangé : `existencesDe` rend un verdict par lien distinct
 * demandé qui en a un, ni plus ni moins. Un lien sans fichier n'a pas de verdict : la réponse reste
 * « en attente du test des liens ». Seuls les champs d'un lien de notation (`ExistenceEtablie`) sont
 * rendus : le journal des tentatives et l'issue Wayback restent dans le fichier.
 *
 * **Texte des copies (D27 (E)).** `pnpm liens:textes` (`pipeline/liens/textes.py`) écrit une fiche
 * par copie, `extractions/<sha256_contenu>.json` (`schema/extraction-page-lien.schema.json`), et le
 * texte extrait, `pages-citees/textes/<texte_sha256>.txt`, hors de `volume/` (D83 : le texte intégral d'une
 * page d'autrui ne part pas sur Zenodo, l'empreinte de la fiche suffit à le vérifier). Les fiches sont lues et validées à la construction :
 * le nom est l'empreinte de la copie, et le texte d'une fiche « extrait » est présent. Le texte
 * lui-même n'est lu qu'à la demande (`texteDeCopie`), et refusé si ses octets n'ont plus l'empreinte
 * ou la longueur de sa fiche (`FichierExistenceRefuse`). Une copie sans fiche n'a pas encore de
 * texte : `undefined`, la réponse attend.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import type { FournisseurExistences } from "./fournisseur-existences.ts";
import type { TexteDeCopie } from "./pages-citees.ts";
import type { ExistenceEtablie } from "./vue-annotateur.ts";

/** Relatif au répertoire du run, hors de `volume/` (D75 (4)) ; même valeur que `pipeline/liens/sortie.py`. */
export const REPERTOIRE_PAGES = "pages-citees";
export const REPERTOIRE_EXTRACTIONS = "extractions";
/** Sous `pages-citees/`, hors de `volume/` (D83) ; même valeur que `pipeline/liens/textes.py`. */
export const REPERTOIRE_TEXTES = "textes";
const DOSSIERS_ADMIS: ReadonlySet<string> = new Set([REPERTOIRE_EXTRACTIONS]);

/** Une fiche de `extractions/`, telle que la décrit `schema/extraction-page-lien.schema.json`. */
type FicheExtraction =
  | { readonly sha256_contenu: string; readonly issue: "extrait"; readonly texte_sha256: string; readonly longueur: number }
  | { readonly sha256_contenu: string; readonly issue: "refuse"; readonly motif: string };

interface TentativeEcrite {
  readonly numero: number;
  readonly horodatage: string;
  readonly issue: string;
  readonly code_http: number | null;
}

interface PageConservee {
  readonly chemin: string;
  readonly taille_octets: number;
}

/** D21 : téléchargement de la version brute d'un instantané retenu (`wayback.telechargement`). */
type TelechargementInstantane = ({ readonly issue: "reussi"; readonly url_finale: string } & PageConservee) | { readonly issue: "echec" };

/** D22 : URL finale d'une version brute servie ; même forme que `$defs/instantane_brut_servi` du schéma. */
const BRUT_SERVI = /^(https?):\/\/web\.archive\.org\/web\/([0-9]{14})id_\/(.+)$/u;

/** Un fichier de `volume/liens/`, tel que le décrit `schema/existence-lien.schema.json`. */
interface ResultatTestLien extends ExistenceEtablie {
  readonly code_http: number | null;
  readonly version_table: string;
  readonly tentatives: readonly TentativeEcrite[];
  readonly page?: PageConservee;
  readonly wayback: { readonly operation: string; readonly archive_url?: string; readonly telechargement?: TelechargementInstantane };
}

export class FichierExistenceRefuse extends Error {
  readonly chemin: string;

  constructor(chemin: string, detail: string) {
    super(`${chemin} : résultat du test des liens refusé — ${detail}`);
    this.name = "FichierExistenceRefuse";
    this.chemin = chemin;
  }
}

/** `<repertoire_run>/volume/liens`, où `pipeline/liens` écrit ses résultats. */
export function repertoireLiens(repertoire_run: string): string {
  return join(repertoire_run, "volume", "liens");
}

/** `<repertoire_run>/pages-citees`, où `pipeline/liens` conserve les pages citées, hors de `volume/` (D75 (4)). */
export function repertoirePages(repertoire_run: string): string {
  return join(repertoire_run, REPERTOIRE_PAGES);
}

export function nomResultat(url: string): string {
  return `${createHash("sha256").update(url, "utf8").digest("hex")}.json`;
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, "utf8")) as unknown;
  } catch (erreur) {
    if (erreur instanceof SyntaxError) throw new FichierExistenceRefuse(chemin, `JSON illisible (${erreur.message}).`);
    throw erreur;
  }
}

function incoherencesDesTentatives(r: ResultatTestLien): readonly string[] {
  const derniere = r.tentatives.at(-1);
  if (derniere === undefined) return ["aucune tentative."];
  const constats: string[] = [];
  if (!r.tentatives.every((t, rang) => t.numero === rang + 1)) constats.push("tentatives non numérotées 1, 2, 3… sans trou.");
  if (r.date_test !== derniere.horodatage) constats.push(`date_test ${r.date_test} n'est pas l'horodatage de la dernière tentative (${derniere.horodatage}).`);
  if (r.code_http !== derniere.code_http) constats.push(`code_http ${String(r.code_http)} n'est pas celui de la dernière tentative (${String(derniere.code_http)}).`);
  return constats;
}

/** La copie conservée : la page d'un lien qui existe, ou la version brute téléchargée d'un instantané (D21). */
function copieConservee(r: ResultatTestLien): PageConservee | undefined {
  if (r.page !== undefined) return r.page;
  const telechargement = r.wayback.telechargement;
  return telechargement?.issue === "reussi" ? telechargement : undefined;
}

/** `repertoire_run` : le chemin déclaré de la copie lui est relatif (D75 (4)). */
function incoherencesDeLaCopie(repertoire_run: string, r: ResultatTestLien): readonly string[] {
  const copie = copieConservee(r);
  if (copie === undefined) return [];
  if (r.sha256_contenu === undefined || !copie.chemin.startsWith(`${REPERTOIRE_PAGES}/${r.sha256_contenu}.`)) {
    return [`la copie ${copie.chemin} n'est pas nommée par l'empreinte ${String(r.sha256_contenu)}.`];
  }
  const chemin = join(repertoire_run, copie.chemin);
  if (!existsSync(chemin)) return [`la copie conservée ${copie.chemin} est absente.`];
  const taille = statSync(chemin).size;
  return taille === copie.taille_octets ? [] : [`la copie ${copie.chemin} fait ${taille} octets, ${copie.taille_octets} annoncés.`];
}

/** D22 : l'instantané servi, forme publique sans `id_` de l'URL finale ; `undefined` hors de cette forme. */
function instantaneServi(url_finale: string): string | undefined {
  const correspondance = BRUT_SERVI.exec(url_finale);
  if (correspondance === null) return undefined;
  const [, schema, horodatage, cible] = correspondance;
  return `${String(schema)}://web.archive.org/web/${String(horodatage)}/${String(cible)}`;
}

/** L'archive_url que l'issue Wayback autorise : renvoyée par Save Page Now, ou servie au téléchargement (D22). */
function archiveUrlAttendue(r: ResultatTestLien): string | undefined {
  const telechargement = r.wayback.telechargement;
  return telechargement?.issue === "reussi" ? instantaneServi(telechargement.url_finale) : r.wayback.archive_url;
}

function incoherenceDArchive(r: ResultatTestLien): readonly string[] {
  if (r.archive_url === undefined) return [];
  const attendue = archiveUrlAttendue(r);
  return r.archive_url === attendue ? [] : [`archive_url n'est pas l'instantané que Wayback a renvoyé ou servi (${String(attendue)} attendu).`];
}

function incoherences(repertoire_run: string, nom: string, r: ResultatTestLien): readonly string[] {
  const constats: string[] = [];
  if (nom !== nomResultat(r.url_citee)) constats.push(`le nom n'est pas le SHA-256 de l'URL citée (${nomResultat(r.url_citee)} attendu).`);
  constats.push(...incoherenceDArchive(r));
  return [...constats, ...incoherencesDesTentatives(r), ...incoherencesDeLaCopie(repertoire_run, r)];
}

/** Recopie champ par champ : seuls les champs d'un lien de notation sortent du fichier. */
function existenceDe(r: ResultatTestLien): ExistenceEtablie {
  return {
    url_citee: r.url_citee,
    verdict_existence: r.verdict_existence,
    date_test: r.date_test,
    code_http: r.code_http,
    ...(r.url_finale === undefined ? {} : { url_finale: r.url_finale }),
    ...(r.sha256_contenu === undefined ? {} : { sha256_contenu: r.sha256_contenu }),
    ...(r.archive_url === undefined ? {} : { archive_url: r.archive_url }),
  };
}

function lireResultat(repertoire_run: string, nom: string): ExistenceEtablie {
  const chemin = join(repertoireLiens(repertoire_run), nom);
  const resultat = valider<ResultatTestLien>("existence-lien", lireJson(chemin), chemin);
  const constats = incoherences(repertoire_run, nom, resultat);
  if (constats.length > 0) throw new FichierExistenceRefuse(chemin, constats.join(" "));
  return existenceDe(resultat);
}

function estEntreeAdmise(repertoire: string, nom: string): boolean {
  const statut = statSync(join(repertoire, nom));
  return DOSSIERS_ADMIS.has(nom) ? statut.isDirectory() : nom.endsWith(".json") && statut.isFile();
}

/** Tous les verdicts de `volume/liens/` du run, indexés par URL citée. Lève au premier fichier refusé. */
export function lireExistences(repertoire_run: string): ReadonlyMap<string, ExistenceEtablie> {
  const repertoire = repertoireLiens(repertoire_run);
  const noms = readdirSync(repertoire).sort();
  const etrangers = noms.filter((nom) => !estEntreeAdmise(repertoire, nom));
  if (etrangers.length > 0) throw new FichierExistenceRefuse(repertoire, `entrées qui ne sont pas des résultats, ni lues ni ignorées : ${etrangers.join(", ")}.`);
  const index = new Map<string, ExistenceEtablie>();
  for (const nom of noms.filter((n) => !DOSSIERS_ADMIS.has(n))) {
    const existence = lireResultat(repertoire_run, nom);
    index.set(existence.url_citee, existence);
  }
  return index;
}

/* ------------------------------------------------------------------ textes des copies (D27 (E)) */

const NOM_FICHE = /^[0-9a-f]{64}\.json$/u;

function cheminTexte(repertoire_run: string, texte_sha256: string): string {
  return join(repertoirePages(repertoire_run), REPERTOIRE_TEXTES, `${texte_sha256}.txt`);
}

function lireFiche(repertoire_run: string, nom: string): FicheExtraction {
  const chemin = join(repertoireLiens(repertoire_run), REPERTOIRE_EXTRACTIONS, nom);
  if (!NOM_FICHE.test(nom)) throw new FichierExistenceRefuse(chemin, "entrée de extractions/ qui n'est pas une fiche <sha256_contenu>.json.");
  const fiche = valider<FicheExtraction>("extraction-page-lien", lireJson(chemin), chemin);
  if (nom !== `${fiche.sha256_contenu}.json`) throw new FichierExistenceRefuse(chemin, `le nom n'est pas l'empreinte de la copie (${fiche.sha256_contenu}.json attendu).`);
  if (fiche.issue === "extrait" && !existsSync(cheminTexte(repertoire_run, fiche.texte_sha256))) {
    throw new FichierExistenceRefuse(chemin, `le texte ${REPERTOIRE_PAGES}/${REPERTOIRE_TEXTES}/${fiche.texte_sha256}.txt est absent.`);
  }
  return fiche;
}

/** Toutes les fiches d'extraction, indexées par empreinte de copie ; aucune si le dossier n'existe pas encore. */
export function lireExtractions(repertoire_run: string): ReadonlyMap<string, FicheExtraction> {
  const dossier = join(repertoireLiens(repertoire_run), REPERTOIRE_EXTRACTIONS);
  if (!existsSync(dossier)) return new Map();
  return new Map(readdirSync(dossier).sort().map((nom) => {
    const fiche = lireFiche(repertoire_run, nom);
    return [fiche.sha256_contenu, fiche] as const;
  }));
}

/** Le texte d'une fiche « extrait », relu et revérifié : empreinte et longueur de la fiche. */
function texteVerifie(repertoire_run: string, fiche: Extract<FicheExtraction, { issue: "extrait" }>): string {
  const chemin = cheminTexte(repertoire_run, fiche.texte_sha256);
  const octets = readFileSync(chemin);
  const empreinte = createHash("sha256").update(octets).digest("hex");
  if (empreinte !== fiche.texte_sha256) throw new FichierExistenceRefuse(chemin, `le texte n'a plus l'empreinte de sa fiche (${empreinte} calculée).`);
  const texte = octets.toString("utf8");
  const longueur = Array.from(texte).length;
  if (longueur !== fiche.longueur) throw new FichierExistenceRefuse(chemin, `le texte fait ${longueur} points de code, ${fiche.longueur} annoncés.`);
  return texte;
}

function texteDeCopie(repertoire_run: string, fiches: ReadonlyMap<string, FicheExtraction>, sha256_contenu: string): TexteDeCopie | undefined {
  const fiche = fiches.get(sha256_contenu);
  if (fiche === undefined) return undefined;
  if (fiche.issue === "refuse") return { issue: "refuse", motif: fiche.motif };
  return { issue: "extrait", texte: texteVerifie(repertoire_run, fiche), texte_sha256: fiche.texte_sha256 };
}

/** Le fournisseur de `volume/liens/` du run. Le répertoire doit exister : l'appelant choisit. */
export function fournisseurFichiers(repertoire_run: string): FournisseurExistences {
  const index = lireExistences(repertoire_run);
  const fiches = lireExtractions(repertoire_run);
  return {
    existencesDe: (_reponse_id, liens) =>
      [...new Set(liens)].flatMap((lien) => {
        const existence = index.get(lien);
        return existence === undefined ? [] : [existence];
      }),
    texteDeCopie: (sha256_contenu) => texteDeCopie(repertoire_run, fiches, sha256_contenu),
  };
}
