/**
 * `pnpm appels-notation` — engendre `docs/APPELS-NOTATION.md` depuis le code des juges réels
 * (`pipeline/notation/juge-*.ts`), comme `pnpm appels-interrogation` pour l'interrogation.
 *
 * Ne fait qu'appeler le rendu (`appels-notation/rendu.ts`) et écrire le Markdown.
 * `docs/APPELS-NOTATION.md` est un artefact engendré, jamais édité à la main.
 *
 * Avec `--verifier`, la commande n'écrit rien : elle sort avec le code 1 si le Markdown sur disque
 * diffère de celui qu'elle produirait, code 0 sinon.
 *
 *   pnpm appels-notation
 *   pnpm appels-notation --verifier
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyserArguments, drapeau } from "./arguments.ts";
import { genererAppelsNotation } from "./appels-notation/rendu.ts";
import { estAJour } from "./feuille-de-route/verification.ts";

const OPTIONS: readonly string[] = ["verifier"];

const CHEMIN = resolve(import.meta.dirname, "..", "docs/APPELS-NOTATION.md");

function verifier(genere: string): void {
  const surDisque = existsSync(CHEMIN) ? readFileSync(CHEMIN, "utf8") : undefined;
  if (estAJour(surDisque, genere)) {
    process.stdout.write("docs/APPELS-NOTATION.md est à jour.\n");
    return;
  }
  process.stderr.write("docs/APPELS-NOTATION.md n'est pas à jour avec le code des juges réels.\n");
  process.exitCode = 1;
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const genere = genererAppelsNotation();
  if (drapeau(table, "verifier")) {
    verifier(genere);
    return;
  }
  writeFileSync(CHEMIN, genere, "utf8");
  process.stdout.write(`Écrit : ${CHEMIN}\n`);
}

principal();
