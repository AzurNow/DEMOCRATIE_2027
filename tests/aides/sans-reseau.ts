/**
 * Préchargé (`node --import`) par les tests de ligne de commande qui doivent prouver qu'une commande
 * n'appelle pas le réseau (D80, mode simulé). Tout `fetch` et toute connexion de socket sont inscrits
 * dans le journal que nomme `BANC_JOURNAL_RESEAU`, puis refusés : le test lit le journal, qui doit
 * rester absent. Sans la variable, le préchargement lève : un test qui l'oublierait ne vérifierait rien.
 */

import { appendFileSync } from "node:fs";
import net from "node:net";

const journal = process.env["BANC_JOURNAL_RESEAU"];
if (journal === undefined || journal.length === 0) throw new Error("BANC_JOURNAL_RESEAU absent : le journal des appels réseau n'a pas de chemin.");
const chemin_journal: string = journal;

function inscrire(appel: string): void {
  appendFileSync(chemin_journal, `${appel}\n`, "utf8");
}

globalThis.fetch = (entree: string | URL | Request): Promise<Response> => {
  inscrire(`fetch ${entree instanceof Request ? entree.url : String(entree)}`);
  return Promise.reject(new Error("appel réseau refusé par tests/aides/sans-reseau.ts"));
};

net.Socket.prototype.connect = function connect(this: net.Socket, ...arguments_: unknown[]): net.Socket {
  inscrire(`socket ${JSON.stringify(arguments_[0])}`);
  throw new Error("connexion réseau refusée par tests/aides/sans-reseau.ts");
};
