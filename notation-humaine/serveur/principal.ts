/**
 * Serveur local de l'écran de notation humaine (§7 ; D18).
 *
 * Mêmes propriétés que celui de l'interface de validation, vérifiées par les tests : écoute sur
 * 127.0.0.1 seulement, aucune origine externe, identité lue dans l'environnement. Il ne démarre pas
 * seul : `outils/notation-humaine.ts` le lance, et les tests importent `creerServeur` sans port.
 *
 * La plomberie HTTP (en-têtes, fichiers statiques, corps JSON, décodage des paramètres de route,
 * erreurs inattendues) est partagée avec l'interface de validation : `validation/serveur/http.ts`
 * en est la seule implémentation des deux serveurs (constat 20 de la revue du 2026-10-12, D55 (8)).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { erreurInattendue, executerRoute, repondre, servirStatique } from "../../validation/serveur/http.ts";
import { creerContexte, type Contexte, type OptionsContexte } from "./contexte.ts";
import { trouverRoute } from "./routes.ts";

export const ADRESSE = "127.0.0.1";
const DOSSIER_CLIENT = resolve(import.meta.dirname, "../client");

export function creerServeur(contexte: Contexte): Server {
  return createServer((requete, reponse) => {
    traiter(contexte, requete, reponse).catch((erreur: unknown) => repondre(reponse, erreurInattendue(erreur)));
  });
}

async function traiter(contexte: Contexte, requete: IncomingMessage, reponse: ServerResponse): Promise<void> {
  const chemin = new URL(requete.url ?? "/", `http://${ADRESSE}`).pathname;
  const methode = requete.method ?? "GET";
  const trouvee = trouverRoute(methode, chemin);
  if (trouvee === null) {
    repondre(reponse, servirStatique(DOSSIER_CLIENT, chemin));
    return;
  }
  repondre(reponse, await executerRoute(contexte, requete, methode, trouvee));
}

export interface OptionsDemarrage extends OptionsContexte {
  readonly port: number;
}

export function demarrer(options: OptionsDemarrage): Server {
  const contexte = creerContexte(options);
  const serveur = creerServeur(contexte);
  serveur.listen(options.port, ADRESSE, () => {
    process.stdout.write(
      `Notation humaine — annotateur ${contexte.annotateur_id}\n` +
        `  run     : ${options.repertoire_run} (${contexte.donnees.run.id})\n` +
        `  items   : ${options.repertoire_items}\n` +
        `  http://${ADRESSE}:${options.port}/\n`,
    );
  });
  return serveur;
}
