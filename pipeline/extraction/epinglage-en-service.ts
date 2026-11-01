/**
 * L'épinglage des extracteurs de texte que le code a en service (§4, « une source dont le texte
 * vient d'une autre version est refusée » ; décision D56 (3), option B).
 *
 * Une seule source de vérité : `pipeline/collecte/textes/epinglage.json`, fichier de données versionné
 * que Python lit aussi (`pipeline/collecte/textes/en_service.py`) pour écrire les entrées de
 * `pnpm extraire`. Aucun sous-processus, aucun réseau : une lecture de fichier, sous la racine du
 * dépôt (`--racine` dans les tests).
 *
 * Le fichier déclare, par genre de contenu, l'outil, la version et les options. La version est
 * écrite en clair (pymupdf) ou vaut `{"interpreteur": "python"}` (`html.parser`, `webvtt`) : elle est
 * alors celle du Python qui exécute l'extraction, qu'aucun fichier du dépôt n'épingle et que le
 * TypeScript ne peut pas lire. Pour ces outils, `estEnService` compare l'outil et les options ;
 * le correctif de Python reste contrôlé par l'égalité exacte de `choix-texte.ts:choisirFiche` entre
 * l'entrée (écrite par Python) et les fiches.
 *
 * Validé à la lecture, forme exacte : un fichier absent, qui n'est pas du JSON ou non conforme lève
 * `EpinglageEnServiceIllisible`, sans valeur de repli. Les genres eux-mêmes ne sont pas relus ici :
 * la règle de genre vit en Python seul (`extraction.genre_de`), et une entrée se rapporte à sa
 * déclaration par son outil, unique d'un genre à l'autre.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import type { ExtracteurEpingle } from "./choix-texte.ts";

/** Chemin du fichier sous la racine du dépôt, le même que `en_service.py:CHEMIN_EPINGLAGE`. */
export const CHEMIN_EPINGLAGE: readonly string[] = ["pipeline", "collecte", "textes", "epinglage.json"];

export interface VersionInterpreteur {
  readonly interpreteur: "python";
}

export interface DeclarationEnService {
  readonly genre: string;
  readonly outil: string;
  readonly version: string | VersionInterpreteur;
  readonly options: Readonly<Record<string, unknown>>;
}

/** Les déclarations du fichier, dans son ordre. */
export type EpinglageEnService = readonly DeclarationEnService[];

export class EpinglageEnServiceIllisible extends Error {
  constructor(chemin: string, detail: string) {
    super(`${chemin} : ${detail} Aucune source n'est extraite sur un épinglage deviné (§4, D56 (3)).`);
    this.name = "EpinglageEnServiceIllisible";
  }
}

const CLES_DECLARATION = ["options", "outil", "version"];

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function estVersion(valeur: unknown): valeur is string | VersionInterpreteur {
  if (typeof valeur === "string") return valeur !== "";
  return estObjet(valeur) && Object.keys(valeur).length === 1 && valeur["interpreteur"] === "python";
}

/** Le défaut de forme d'une déclaration, ou `null` si elle est conforme. */
function defautDe(declaration: unknown): string | null {
  if (!estObjet(declaration) || Object.keys(declaration).sort().join() !== CLES_DECLARATION.join()) {
    return `doit porter exactement ${CLES_DECLARATION.join(", ")}`;
  }
  const outil = declaration["outil"];
  if (typeof outil !== "string" || outil === "") return "outil doit être une chaîne non vide";
  if (!estVersion(declaration["version"])) return 'version doit être une chaîne non vide ou {"interpreteur": "python"}';
  if (!estObjet(declaration["options"])) return "options doit être un objet";
  return null;
}

function nonConforme(chemin: string, detail: string): EpinglageEnServiceIllisible {
  return new EpinglageEnServiceIllisible(chemin, `épinglage des extracteurs de texte non conforme (${detail}).`);
}

function declarationDe(chemin: string, genre: string, declaration: unknown): DeclarationEnService {
  const defaut = defautDe(declaration);
  if (defaut !== null) throw nonConforme(chemin, `${genre} : ${defaut}`);
  const { outil, version, options } = declaration as Omit<DeclarationEnService, "genre">;
  return { genre, outil, version, options };
}

export function validerEpinglageEnService(contenu: unknown, chemin: string): EpinglageEnService {
  if (!estObjet(contenu) || Object.keys(contenu).length === 0) throw nonConforme(chemin, "un objet d'au moins un genre est attendu");
  const declarations = Object.entries(contenu).map(([genre, declaration]) => declarationDe(chemin, genre, declaration));
  const outils = declarations.map((declaration) => declaration.outil);
  if (new Set(outils).size !== outils.length) throw nonConforme(chemin, `un outil déclaré pour deux genres : ${outils.join(", ")}`);
  return declarations;
}

function lireTexte(chemin: string): string {
  try {
    return readFileSync(chemin, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") throw new EpinglageEnServiceIllisible(chemin, "épinglage des extracteurs de texte absent.");
    throw new EpinglageEnServiceIllisible(chemin, `épinglage des extracteurs de texte illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
}

function analyser(texte: string, chemin: string): unknown {
  try {
    return JSON.parse(texte) as unknown;
  } catch (erreur) {
    throw new EpinglageEnServiceIllisible(chemin, `JSON illisible (${erreur instanceof Error ? erreur.message : String(erreur)}).`);
  }
}

/** Lit et valide `<racine>/pipeline/collecte/textes/epinglage.json`. */
export function lireEpinglageEnService(racine: string): EpinglageEnService {
  const chemin = join(racine, ...CHEMIN_EPINGLAGE);
  return validerEpinglageEnService(analyser(lireTexte(chemin), chemin), chemin);
}

/** La déclaration en service pour cet outil, ou `null` si aucun genre ne l'a en service. */
export function declarationPour(enService: EpinglageEnService, outil: string): DeclarationEnService | null {
  return enService.find((declaration) => declaration.outil === outil) ?? null;
}

function versionAccordee(declaree: DeclarationEnService["version"], inscrite: string): boolean {
  return typeof declaree === "string" ? declaree === inscrite : true;
}

/**
 * Vrai si `epingle` est l'extracteur en service pour son outil : options égales en forme canonique,
 * et version égale quand le fichier l'écrit en clair (voir l'en-tête pour une version d'interpréteur).
 */
export function estEnService(enService: EpinglageEnService, epingle: ExtracteurEpingle): boolean {
  const declaration = declarationPour(enService, epingle.outil);
  if (declaration === null) return false;
  return canoniser(declaration.options) === canoniser(epingle.options) && versionAccordee(declaration.version, epingle.version);
}

/** Pour un message : la déclaration telle qu'en service, ou son absence. */
export function decrireEnService(enService: EpinglageEnService, outil: string): string {
  const declaration = declarationPour(enService, outil);
  if (declaration === null) return `absent (aucun genre n'a l'outil ${outil} en service)`;
  return JSON.stringify({ outil: declaration.outil, version: declaration.version, options: declaration.options });
}
