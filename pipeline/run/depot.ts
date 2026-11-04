/**
 * Ce qui peut entrer dans une archive du dépôt Zenodo d'un run (§9 et §10 du protocole, constat n° 10
 * de la conformité du 2026-11-03). Gardes pures : elles lisent, elles n'écrivent rien. Aucune commande
 * de dépôt n'existe encore ; la future, et toute vérification d'un `run.json#/depot`, passent par ici.
 *
 * Le §9 ne publie ni les copies intégrales des sources, ni les pages citées par les réponses, quand
 * leur licence n'en permet pas la republication : pour ces objets, l'empreinte, le lien d'archive et
 * l'extrait cité sont publiés.
 *
 * - **Pages citées.** Le test des liens les écrit sous `volume/liens/pages/` (`pipeline/liens/sortie.py`).
 *   Elles restent dans `volume/` parce que la notation les lit (`pipeline/notation/fournisseur-fichiers.ts`),
 *   mais aucune archive ne peut en contenir un fichier : `verifierEntreesArchive` refuse tout chemin
 *   dont les segments contiennent `SEGMENTS_HORS_DEPOT` (une donnée, pas un `if`). Seules leurs
 *   empreintes, dans `volume/liens/<sha256 de l'URL>.json`, partent.
 * - **Sources archivées.** Une archive `sources_archivees` n'est admise que si chaque source qu'elle
 *   contient déclare `publication: "publique"` (`schema/commun.schema.json#/$defs/source`). `interne`,
 *   toute autre valeur et l'absence du champ sont refusées : aucun défaut permissif. Sans source
 *   déclarée, l'archive ne peut pas être justifiée et est refusée aussi.
 */

/** Séquences de segments consécutifs qui écartent un chemin de toute archive. */
export const SEGMENTS_HORS_DEPOT: readonly (readonly string[])[] = [["liens", "pages"]];

/** Le seul contenu d'archive conditionné à `source.publication` (`run.schema.json#/depot/archives`). */
export const CONTENU_SOURCES_ARCHIVEES = "sources_archivees";

/** La seule valeur de `source.publication` qui admet la republication. */
export const PUBLICATION_REPUBLIABLE = "publique";

export type MotifDepotRefuse =
  | "page_citee_dans_archive"
  | "source_non_republiable"
  | "publication_absente"
  | "sources_archivees_sans_source";

export class DepotRefuse extends Error {
  readonly motif: MotifDepotRefuse;

  constructor(motif: MotifDepotRefuse, detail: string) {
    super(`Dépôt refusé (${motif}, §9 du protocole) : ${detail}`);
    this.name = "DepotRefuse";
    this.motif = motif;
  }
}

export interface ArchiveDeclaree {
  readonly nom: string;
  readonly contenu: string;
}

/** Ce que la garde lit d'une source ; `publication` est `unknown` pour que son absence reste visible. */
export interface SourceDeclaree {
  readonly url: string;
  readonly publication?: unknown;
}

function segmentsDe(chemin: string): readonly string[] {
  return chemin.split(/[\\/]+/).filter((segment) => segment !== "" && segment !== ".");
}

function contientSequence(segments: readonly string[], sequence: readonly string[]): boolean {
  for (let debut = 0; debut + sequence.length <= segments.length; debut += 1) {
    if (sequence.every((segment, i) => segments[debut + i] === segment)) return true;
  }
  return false;
}

function estHorsDepot(chemin: string): boolean {
  const segments = segmentsDe(chemin);
  return SEGMENTS_HORS_DEPOT.some((sequence) => contientSequence(segments, sequence));
}

/** Refuse une archive dont la liste de fichiers contient une page citée par les réponses. */
export function verifierEntreesArchive(nom: string, chemins: readonly string[]): void {
  const fautif = chemins.find(estHorsDepot);
  if (fautif === undefined) return;
  throw new DepotRefuse(
    "page_citee_dans_archive",
    `l'archive « ${nom} » contient « ${fautif} » : les pages citées par les réponses ne partent jamais ` +
      `(seuls l'empreinte, le lien d'archive et l'extrait cité sont publiés).`,
  );
}

function verifierSource(source: SourceDeclaree): void {
  if (source.publication === undefined) {
    throw new DepotRefuse("publication_absente", `la source « ${source.url} » ne déclare pas \`publication\` ; rien n'est supposé.`);
  }
  if (source.publication !== PUBLICATION_REPUBLIABLE) {
    throw new DepotRefuse(
      "source_non_republiable",
      `la source « ${source.url} » est déclarée « ${String(source.publication)} » : sa copie ne peut pas être republiée.`,
    );
  }
}

function verifierArchiveDeSources(archive: ArchiveDeclaree, sources: readonly SourceDeclaree[]): void {
  if (sources.length === 0) {
    throw new DepotRefuse(
      "sources_archivees_sans_source",
      `l'archive « ${archive.nom} » est de contenu ${CONTENU_SOURCES_ARCHIVEES} sans aucune source déclarée : sa republication ne peut pas être établie.`,
    );
  }
  sources.forEach(verifierSource);
}

/**
 * Chaque archive `sources_archivees` exige que toutes les `sources` qu'elle contient soient
 * republiables. `sources` sont celles des archives de ce contenu ; les autres contenus n'en dépendent pas.
 */
export function verifierArchives(archives: readonly ArchiveDeclaree[], sources: readonly SourceDeclaree[]): void {
  for (const archive of archives) {
    if (archive.contenu === CONTENU_SOURCES_ARCHIVEES) verifierArchiveDeSources(archive, sources);
  }
}
