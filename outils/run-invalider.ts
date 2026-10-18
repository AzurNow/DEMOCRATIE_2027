/**
 * `pnpm run:invalider` — enregistre l'invalidation d'un run (décision D51 (2), §6 : « si un incident
 * technique invalide un run, le run entier est réexécuté et les deux runs sont publiés, le premier
 * marqué invalide avec la raison »).
 *
 *   pnpm run:invalider <repertoire_run> --motif=<raison>
 *
 * Écrit `invalidation { motif, date }` dans `<repertoire_run>/run.json`, la date étant l'horloge au
 * moment de la commande, à l'heure de Paris. Le statut reste `planifie` ou `en_cours` : le statut
 * `invalide` s'écrit avec le dépôt Zenodo (§12), pas ici. Un run qui porte une invalidation n'est
 * plus démarré, noté ni décidé (notation, `pnpm go-no-go`) ; sa réexécution se gèle avec
 * `pnpm geler --type-run=reexecution --remplace=<id>`.
 *
 * Refuse, sans rien écrire : `--motif` absent, sans valeur ou vide ; un run `publie`,
 * `publie_provisoire` ou `invalide` (D51 (4)) ; une date avant `date_gel` ; une invalidation déjà
 * présente d'un autre motif (règle 7). Déjà présente du même motif (D54 (5), quelle que soit la
 * date de cet appel) : rien n'est écrit, et la commande le dit.
 *
 * Codes de sortie : 0, invalidation inscrite ou déjà là ; 2, commande mal appelée ou refusée.
 */

import { invaliderRun, type ResultatInvalidation } from "../pipeline/run/invalidation.ts";
import { analyserArguments, obligatoire } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm run:invalider <repertoire_run> --motif=<raison>";

interface Demande {
  readonly repertoire: string;
  readonly motif: string;
}

function demande(bruts: readonly string[]): Demande {
  const table = analyserArguments(bruts, ["motif"]);
  // `--motif` seul vaudrait « true » pour analyserArguments : une raison, jamais une valeur inventée.
  if (bruts.includes("--motif")) throw new Error(`--motif attend une valeur (--motif=<raison>). ${USAGE}`);
  const motif = obligatoire(table, "motif", `la raison de l'invalidation, sans valeur par défaut (§6). ${USAGE}`);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return { repertoire, motif };
}

const LIBELLE = {
  inscrite: "invalidation inscrite",
  deja_inscrite: "invalidation déjà inscrite pour ce motif (D54 (5)) ; rien n'est écrit",
} as const;

function imprimer(repertoire: string, motif: string, resultat: ResultatInvalidation): void {
  process.stdout.write(
    `Run ${resultat.run_id} — ${repertoire}\n` +
      `  ${LIBELLE[resultat.issue]} (date ${resultat.date})\n` +
      `  motif : ${motif}\n` +
      `  statut inchangé : ${resultat.statut} (invalide s'écrit avec le dépôt, §12)\n`,
  );
}

function principal(): void {
  try {
    const { repertoire, motif } = demande(process.argv.slice(2));
    imprimer(repertoire, motif, invaliderRun(repertoire, motif, Date.now()));
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Invalidation non enregistrée — ${erreur.name} :\n  ${erreur.message}\nRien n'est écrit.\n`);
    process.exitCode = 2;
  }
}

principal();
