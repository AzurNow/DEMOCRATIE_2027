/**
 * `pnpm notation:reelle` — la notation du §7 d'un run gelé et interrogé, par ses deux juges réels
 * (`pipeline/notation/notation-reelle.ts`, où vit toute la logique). Lancée à la main par l'auteur,
 * jamais par un agent ni par un test : elle appelle les API des juges.
 *
 *   ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm notation:reelle <runs/AAAA-MM-JJ> [--items=<data/items>]
 *
 * Elle refuse de partir tant que les réglages des juges ne sont déclarés nulle part (trou du §7,
 * exigence §7.57 : `ReglagesDesJugesNonDeclares`), sans clé d'API, ou sur un gel simulé.
 *
 * Codes de sortie : 0, la chaîne a tourné ; 2, refus de partir ou arrêt sur une erreur nommée.
 */

import { resolve } from "node:path";
import { instantParis } from "../analysis/heure-paris.ts";
import { chargerRun } from "../notation-humaine/serveur/chargement.ts";
import { horlogeSysteme } from "../pipeline/interrogation/horloge.ts";
import { declarationsNonDeclarees, notationReelle } from "../pipeline/notation/notation-reelle.ts";
import { lignesBilanNotation, texteLectures } from "./notation-bilan.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const depot = resolve(import.meta.dirname, "..");

async function principal(): Promise<void> {
  try {
    const faite = await notationReelle(process.argv.slice(2), {
      env: process.env,
      envoi: (url, init) => fetch(url, init),
      attendre: (ms, signal) => horlogeSysteme.attendre(ms, signal),
      maintenant: () => instantParis(Date.now()),
      depot,
      chargerReponses: (repertoire_run, repertoire_items) => chargerRun(repertoire_run, repertoire_items).reponses,
      declarationsDesJuges: declarationsNonDeclarees,
    });
    for (const ligne of lignesBilanNotation("Notation par les juges réels", faite.repertoire_run, faite.bilan)) process.stdout.write(`${ligne}\n`);
    process.stdout.write(`${texteLectures(faite.resultat.lectures)}\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Notation réelle non exécutée — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

await principal();
