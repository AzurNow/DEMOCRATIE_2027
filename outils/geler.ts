/**
 * `pnpm geler` — gel d'un run (lot gel ; décisions D41, D44, D45, D46, D47).
 *
 *   pnpm geler --type-run=<type> --engagement=<url de capture> [--sortie=<répertoire>]
 *   pnpm geler --type-run=reexecution --remplace=<id du run invalidé> --engagement=<url> [--sortie=<répertoire>]
 *
 * Écrit, en une fois et tout ou rien, `run.json`, `tirage.json`, `questions.json` et les réponses
 * brutes des deux relais drand (`balise/<relais>.json`) et de la Wayback Machine
 * (`engagement/wayback.json`, D47 (3)) dans `runs/<date>/` (sans `--sortie`) ou
 * `<sortie>/<date>/`, où `<date>` est la date de `date_gel` à Paris ; au statut `planifie`, à partir de
 * `data/`, de `config/perimetre.yaml`, de `config/gel.json`, du commit courant, du run précédent de `runs/` et de la balise drand
 * quicknet. Refuse, sans rien écrire et avec le code 1 : un dépôt sale, un répertoire de run qui
 * existe déjà, une `--sortie` sous `runs/`, un `config/gel.json` incomplet, une question sans
 * formulations relues sur son texte neutre et sa position courants, un alias aveugle qui trahit un
 * outil ou que deux outils partagent, une fenêtre ouverte à `date_gel` ou avant (D50), et avant tout appel
 * réseau un gel exécuté avant `date_gel`, un run précédent illisible ou incohérent (D45 (2) à (4)) et
 * un tour drand pas encore émis, un engagement archivé absent, d'un autre commit, postérieur à
 * `date_gel` ou que la Wayback Machine ne sert pas, deux relais en désaccord ou l'un d'eux injoignable,
 * un appel réseau sans réponse en 30 s (D47 (4), aucune nouvelle tentative), et un run que la barrière de symétrie refuse (`pipeline/gel/barriere.ts`).
 *
 * D41 : seul l'auteur gèle un vrai run, c'est-à-dire lance cette commande sans `--sortie`. Un agent
 * ou un test gèle toujours vers un répertoire hors de `runs/`, et jamais avec le réseau : cette
 * commande appelle les deux relais drand et la Wayback Machine (D44, D46), et rien d'autre.
 *
 * `--engagement` : l'URL `https://web.archive.org/web/<14 chiffres>/https://github.com/AzurNow/
 * DEMOCRATIE_2027/commit/<HEAD complet>` de la capture faite avant `date_gel` (D46). Elle vient de la
 * ligne de commande, pas de `config/gel.json` : ce fichier est dans le commit capturé, il ne peut pas
 * porter l'URL de sa propre capture (retenu par D47 (1)).
 *
 * `--type-run` : l'une des valeurs de `run.schema.json#/properties/type_run`.
 *
 * `--remplace` (D51 (3)) : l'`id` (ULID) du run invalidé que remplace une réexécution, inscrit dans
 * `run_remplace_id`. Exigé avec `--type-run=reexecution`, refusé avec tout autre type ; le run doit
 * être sous `runs/` et porter une invalidation (`pnpm run:invalider`). Il n'est jamais réécrit.
 */

import { resolve } from "node:path";
import { analyserArguments, obligatoire } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";
import { validerFragment } from "./schemas/valider.ts";
import { geler } from "../pipeline/gel/geler.ts";
import type { ResultatGel } from "../pipeline/gel/geler.ts";
import { ecrireExclusif } from "../pipeline/gel/ecriture.ts";
import { DELAI_APPEL_RESEAU_MS, lectureParFetch } from "../pipeline/gel/reseau.ts";
import { MOTIFS_EXCLUSION } from "../pipeline/questions/types.ts";

const RACINE = resolve(import.meta.dirname, "..");
const OPTIONS: readonly string[] = ["type-run", "remplace", "engagement", "sortie"];

function imprimer(resultat: ResultatGel): void {
  const exclusions = MOTIFS_EXCLUSION.map((motif) => [motif, resultat.tirage.exclusions.filter((e) => e.motif === motif).length] as const)
    .filter(([, nombre]) => nombre > 0)
    .map(([motif, nombre]) => `${motif} ${nombre}`)
    .join(", ");
  process.stdout.write(
    `Run gelé (statut planifie) — ${resultat.repertoire}\n` +
      `  id ${resultat.run_id}, commit ${resultat.commit}, tour drand ${resultat.tour}\n` +
      `  ${resultat.questions.length} question(s) engendrée(s) au gel, ${resultat.tirage.entrees.length} tirée(s)\n` +
      `  ${resultat.tirage.exclusions.length} exclue(s) du tirage${exclusions.length === 0 ? "" : ` (${exclusions})`}\n` +
      `  symétrie : ${resultat.symetrie.statut_global}\n`,
  );
}

async function principal(): Promise<void> {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const type_run = validerFragment<string>(
    "run",
    "#/properties/type_run",
    obligatoire(table, "type-run", "le type du run (run.schema.json#/properties/type_run), sans valeur par défaut"),
    "--type-run",
  );
  const remplace_brut = table.get("remplace");
  const remplace = remplace_brut === undefined ? undefined : validerFragment<string>("run", "#/properties/run_remplace_id", remplace_brut, "--remplace");
  const engagement = obligatoire(
    table,
    "engagement",
    "l'URL de la capture Wayback de la page GitHub du commit gelé, faite avant date_gel (D46)",
  );
  const lire = lectureParFetch((url, init) => fetch(url, init), DELAI_APPEL_RESEAU_MS);
  const resultat = await geler({
    racine: RACINE,
    sortie: table.get("sortie"),
    type_run,
    remplace,
    engagement,
    relais: lire,
    wayback: lire,
    maintenant: () => Date.now(),
    ecrire: ecrireExclusif,
  });
  imprimer(resultat);
}

principal().catch((erreur: unknown) => {
  if (!estUnRefusAttendu(erreur)) throw erreur;
  process.stderr.write(`${erreur.name} : ${erreur.message}\nRien n'est écrit.\n`);
  process.exitCode = 1;
});
