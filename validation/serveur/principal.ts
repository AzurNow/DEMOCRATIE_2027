/**
 * Serveur local de l'interface de validation.
 *
 * Trois propriétés tenues ici, et vérifiées par les tests :
 *
 * - **Écoute sur 127.0.0.1 seulement.** Pas de `0.0.0.0` : l'outil ne doit pas être joignable
 *   depuis le réseau, même par accident, même le temps d'un essai.
 * - **Aucune origine externe.** La politique de sécurité de contenu n'autorise que `'self'`,
 *   il n'y a ni police distante, ni CDN, ni télémétrie. Le projet interdit tout appel réseau
 *   sortant ; l'interface n'en émet aucun, et s'en prive par déclaration autant que par code.
 * - **L'identité vient de l'environnement**, lue une fois au démarrage.
 *
 * La plomberie HTTP (en-têtes, fichiers statiques, corps JSON, décodage des paramètres de route,
 * erreurs inattendues) est partagée avec l'écran de notation humaine : `./http.ts` en est la seule
 * implémentation des deux serveurs (constat 20 de la revue du 2026-10-12, D55 (8)). Une erreur
 * inattendue n'expose plus que son nom au navigateur ; message et pile vont à la console du serveur
 * seulement, comme pour la notation (D18) — un JSON illisible dans un POST répond 400, plus 500.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { configurationDepuisEnvironnement, creerContexte, type Contexte } from "./contexte.ts";
import { erreurInattendue, executerRoute, repondre, servirStatique } from "./http.ts";
import { trouverRoute } from "./routes.ts";

const ADRESSE = "127.0.0.1";

export function creerServeur(contexte: Contexte, racine: string): Server {
  return createServer((requete, reponse) => {
    traiter(contexte, racine, requete, reponse).catch((erreur: unknown) => repondre(reponse, erreurInattendue(erreur)));
  });
}

export function demarrer(port: number): void {
  const racine = resolve(import.meta.dirname, "../..");
  const contexte = creerContexte(configurationDepuisEnvironnement(process.env, racine));
  const serveur = creerServeur(contexte, racine);

  serveur.listen(port, ADRESSE, () => {
    process.stdout.write(
      `Validation — annotateur ${contexte.annotateur_id}\n` +
        `  staging   : ${contexte.configuration.racine_staging}\n` +
        `  décisions : ${contexte.configuration.repertoire_decisions}\n` +
        `  http://${ADRESSE}:${port}/\n`,
    );
  });
}

async function traiter(
  contexte: Contexte,
  racine: string,
  requete: IncomingMessage,
  reponse: ServerResponse,
): Promise<void> {
  const chemin = new URL(requete.url ?? "/", `http://${ADRESSE}`).pathname;
  const methode = requete.method ?? "GET";

  const trouvee = trouverRoute(methode, chemin);
  if (trouvee !== null) {
    repondre(reponse, await executerRoute(contexte, requete, methode, trouvee));
    return;
  }

  repondre(reponse, servirStatique(join(racine, "validation/client"), chemin));
}

// Démarrage seulement en exécution directe : les tests importent ce module pour comparer la
// table de routes du serveur à celle qu'ils énumèrent, sans ouvrir de port.
const lanceDirectement =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename);
if (lanceDirectement) {
  demarrer(Number(process.env["PORT"] ?? 4173));
}
