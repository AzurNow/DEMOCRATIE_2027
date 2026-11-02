/**
 * `pnpm appels-interrogation` — engendre `docs/APPELS-INTERROGATION.md` depuis le code de
 * l'interrogation (§9, « Reproductibilité » ; D59 (16), protocole 0.24).
 *
 * Ne fait qu'appeler le rendu (`appels-interrogation/rendu.ts`) et écrire le Markdown.
 * `docs/APPELS-INTERROGATION.md` est un artefact engendré, jamais édité à la main.
 *
 * Avec `--verifier`, la commande n'écrit rien : elle sort avec le code 1 si le Markdown sur disque
 * diffère de celui qu'elle produirait, code 0 sinon.
 *
 *   pnpm appels-interrogation
 *   pnpm appels-interrogation --verifier
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyserArguments, drapeau } from "./arguments.ts";
import { genererAppelsInterrogation } from "./appels-interrogation/rendu.ts";
import { estAJour } from "./feuille-de-route/verification.ts";

const OPTIONS: readonly string[] = ["verifier"];

const CHEMIN = resolve(import.meta.dirname, "..", "docs/APPELS-INTERROGATION.md");

function verifier(genere: string): void {
  const surDisque = existsSync(CHEMIN) ? readFileSync(CHEMIN, "utf8") : undefined;
  if (estAJour(surDisque, genere)) {
    process.stdout.write("docs/APPELS-INTERROGATION.md est à jour.\n");
    return;
  }
  process.stderr.write("docs/APPELS-INTERROGATION.md n'est pas à jour avec le code de l'interrogation.\n");
  process.exitCode = 1;
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const genere = genererAppelsInterrogation();
  if (drapeau(table, "verifier")) {
    verifier(genere);
    return;
  }
  writeFileSync(CHEMIN, genere, "utf8");
  process.stdout.write(`Écrit : ${CHEMIN}\n`);
}

principal();
