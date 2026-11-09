/**
 * Les fiches des sources collectées, `staging/sources/par-source/<cle_source>/<sha256>.json`
 * (`schema/fiche-source.schema.json`, écrites par `pipeline/collecte`, `docs/CONTRATS.md` §5), lues
 * pour la recherche des nouvelles sources T1 d'un item A (§4, D59 (11) ;
 * `validation/domaine/absence.ts:nouvellesSourcesT1`). Lecture seule.
 *
 * Chaque fiche est validée contre son schéma. Un répertoire absent est refusé, jamais lu comme
 * « aucune source collectée » : une recherche de nouvelles sources faite sans le corpus ne trouverait
 * rien, et une absence serait confirmée sur rien.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { jsonDe, valider } from "../../outils/schemas/valider.ts";
import type { SourceCollectee } from "../domaine/absence.ts";

export class FichesSourceAbsentes extends Error {
  constructor(repertoire: string) {
    super(
      `${repertoire} n'existe pas : sans les fiches des sources collectées, la recherche de nouvelles ` +
        `sources T1 ne peut rien trouver, et aucune absence ne se confirme sur rien (§4). Rien n'est écrit.`,
    );
    this.name = "FichesSourceAbsentes";
  }
}

function fichiersDe(repertoire: string): readonly string[] {
  return readdirSync(repertoire)
    .sort()
    .map((nom) => join(repertoire, nom))
    .filter((chemin) => statSync(chemin).isDirectory())
    .flatMap((dossier) =>
      readdirSync(dossier)
        .filter((nom) => nom.endsWith(".json"))
        .sort()
        .map((nom) => join(dossier, nom)),
    );
}

function lireFiche(chemin: string): SourceCollectee {
  const fiche = valider<SourceCollectee>("fiche-source", jsonDe(readFileSync(chemin, "utf8"), chemin), chemin);
  return { candidat_id: fiche.candidat_id, tier: fiche.tier, sha256: fiche.sha256, date_collecte: fiche.date_collecte };
}

/** Toutes les fiches de `repertoire` (`staging/sources/par-source`), chacune validée. */
export function lireFichesSource(repertoire: string): readonly SourceCollectee[] {
  if (!existsSync(repertoire)) throw new FichesSourceAbsentes(repertoire);
  return fichiersDe(repertoire).map(lireFiche);
}
