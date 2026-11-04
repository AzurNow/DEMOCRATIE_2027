/**
 * `pnpm extraire` — extraction double de chaque source préparée par `pnpm extraction:entrees`
 * (§4, décisions D52 et D53).
 *
 *   ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm extraire --plafond=<n> [--source=<cle_source>/<sha256>]
 *   pnpm extraire --simule [--sortie=<chemin>] [--source=<cle_source>/<sha256>]
 *
 * Écrit sous `staging/` (mode réel) ou hors du dépôt (mode simulé) : réponses brutes, items,
 * mesures proposées et journal de chaque source. Jamais dans `data/` : la validation et la
 * promotion appartiennent à l'interface de validation. Toute la logique vit dans
 * `pipeline/extraction/commande.ts`.
 *
 * Les sources renvoyées à la réextraction (§4, D73 (9)) sont recalculées au démarrage depuis la
 * validation de la racine, comme `pnpm promote` les imprime : mêmes lots, journaux, registres,
 * `staging/` et `data/items/`, même fonction (`renvoisAReextraction`). Rien n'y est écrit.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluerLots } from "./evaluation-lots.ts";
import { arbreDuCodePropre, commitCourant } from "./garde-fous-git.ts";
import { horlogeSysteme } from "../pipeline/interrogation/horloge.ts";
import { commandeExtraire } from "../pipeline/extraction/commande.ts";
import { choixParEmpreinte } from "../pipeline/extraction/editeur-simule.ts";
import type { TexteRenvoye } from "../pipeline/extraction/renvoi.ts";
import { renvoisAReextraction } from "../validation/domaine/renvoi-reextraction.ts";
import { ulid } from "../validation/domaine/ulid.ts";
import { lireRegistreArbitrage } from "../validation/io/arbitrage-fichier.ts";
import { lireItemsData } from "../validation/io/data-items.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { lireRegistre } from "../validation/io/mesures-fichier.ts";
import { chargerStaging } from "../validation/io/staging.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

const depot = resolve(import.meta.dirname, "..");

/** Les chemins par défaut de `pnpm promote` sous cette racine ; rien n'est promu ni écrit ici. */
function renvoisDeLaRacine(racine: string): readonly TexteRenvoye[] {
  const evaluation = evaluerLots({
    staging: chargerStaging(join(racine, "staging")),
    data: lireItemsData(join(racine, "data", "items")),
    lots: lireLots(join(racine, "validation", "lots")),
    repertoire_decisions: join(racine, "validation", "decisions"),
    registre_mesures: lireRegistre(join(racine, "validation", "mesures")),
    registre_arbitrage: lireRegistreArbitrage(join(racine, "validation", "arbitrage")),
    commit: commitCourant(depot),
    horodatage: instantLocal(new Date()),
  });
  return renvoisAReextraction(evaluation.verdicts).sources;
}

process.exitCode = await commandeExtraire(process.argv.slice(2), {
  env: process.env,
  envoi: (url, init) => fetch(url, init),
  maintenant: () => Date.now(),
  nouvelUlid: () => ulid(),
  attendre: (ms, signal) => horlogeSysteme.attendre(ms, signal),
  imprimer: (texte) => process.stdout.write(texte),
  temporaire: () => mkdtempSync(join(tmpdir(), "banc-extraire-")),
  depot,
  commit: () => commitCourant(depot),
  arbreDuCodePropre: () => arbreDuCodePropre(depot),
  choixSimule: choixParEmpreinte,
  renvoisAReextraction: renvoisDeLaRacine,
});
