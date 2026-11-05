/**
 * Ce qui peut entrer dans une archive du dépôt Zenodo d'un run (§9 et §10 du protocole, constat n° 10
 * de la conformité du 2026-11-03). Gardes pures : elles lisent, elles n'écrivent rien. Aucune commande
 * de dépôt n'existe encore ; la future, et toute vérification d'un `run.json#/depot`, passent par ici.
 *
 * Le §9 ne publie ni les copies intégrales des sources, ni les pages citées par les réponses, quand
 * leur licence n'en permet pas la republication : pour ces objets, l'empreinte, le lien d'archive et
 * l'extrait cité sont publiés.
 *
 * - **Pages citées.** Le test des liens les écrit hors de `volume/`, sous `runs/<date>/pages-citees/`
 *   (`pipeline/liens/sortie.py`, D75 (4)) : le volume part en entier, sans exception ni exclusion
 *   nommée. Seules leurs empreintes, dans `volume/liens/<sha256 de l'URL>.json`, partent.
 * - **Sources archivées.** Une archive `sources_archivees` n'est admise que si chaque source qu'elle
 *   contient déclare `publication: "publique"` (`schema/commun.schema.json#/$defs/source`). `interne`,
 *   toute autre valeur et l'absence du champ sont refusées : aucun défaut permissif. Sans source
 *   déclarée, l'archive ne peut pas être justifiée et est refusée aussi.
 */

/** Le seul contenu d'archive conditionné à `source.publication` (`run.schema.json#/depot/archives`). */
export const CONTENU_SOURCES_ARCHIVEES = "sources_archivees";

/** La seule valeur de `source.publication` qui admet la republication. */
export const PUBLICATION_REPUBLIABLE = "publique";

export type MotifDepotRefuse =
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
