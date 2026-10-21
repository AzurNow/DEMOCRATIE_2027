/**
 * La plomberie HTTP commune aux deux serveurs locaux — l'interface de validation et l'écran de
 * notation humaine. En-têtes de sécurité, fichiers statiques, lecture du corps JSON, décodage des
 * paramètres de route, erreurs inattendues : une seule implémentation (constat 20 de la revue du
 * 2026-10-12, D55 (8)). `pnpm validate` et `pnpm notation:humaine` partagent cette politique de
 * sécurité et cette règle d'erreur ; aucune des deux ne recopie l'autre.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

export interface Reponse {
  readonly statut: number;
  readonly corps?: unknown;
  readonly binaire?: Buffer;
  readonly type_mime?: string;
}

export const POLITIQUE_SECURITE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "frame-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
].join("; ");

export const TYPES_STATIQUES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

/** Un corps de requête qui n'est pas du JSON : une erreur de l'appelant (400), pas du serveur. */
export class CorpsIllisible extends Error {
  constructor(detail: string) {
    super(`Corps de requête illisible : ${detail}`);
    this.name = "CorpsIllisible";
  }
}

/** Un paramètre de route dont le décodage pourcent-encodé échoue : 400 nommé, pas un bogue serveur. */
export class ParametreMalEncode extends Error {
  constructor(brut: string) {
    super(`Paramètre de route mal encodé : ${brut}`);
    this.name = "ParametreMalEncode";
  }
}

export async function lireCorps(requete: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  for await (const morceau of requete) morceaux.push(morceau as Buffer);
  const texte = Buffer.concat(morceaux).toString("utf8");
  if (texte.length === 0) return null;
  try {
    return JSON.parse(texte);
  } catch (erreur) {
    throw new CorpsIllisible(erreur instanceof Error ? erreur.message : String(erreur));
  }
}

/** Décode chaque paramètre capturé par une route ; un pourcentage mal formé est un refus nommé. */
export function decoderParametres(bruts: readonly string[]): readonly string[] {
  return bruts.map((brut) => {
    try {
      return decodeURIComponent(brut);
    } catch {
      throw new ParametreMalEncode(brut);
    }
  });
}

/** Sert un fichier de `dossier_client`, et de lui seul. */
export function servirStatique(dossier_client: string, chemin: string): Reponse {
  const relatif = chemin === "/" ? "index.html" : chemin.replace(/^\/+/, "");
  const complet = join(dossier_client, relatif);
  if (!complet.startsWith(dossier_client) || !existsSync(complet)) {
    return { statut: 404, corps: { erreur: `Introuvable : ${chemin}` } };
  }
  return { statut: 200, binaire: readFileSync(complet), type_mime: TYPES_STATIQUES[extname(complet)] ?? "application/octet-stream" };
}

export function repondre(reponse: ServerResponse, resultat: Reponse): void {
  const entetes: Record<string, string> = {
    "content-security-policy": POLITIQUE_SECURITE,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  };

  if (resultat.binaire !== undefined) {
    reponse.writeHead(resultat.statut, { ...entetes, "content-type": resultat.type_mime ?? "application/octet-stream" });
    reponse.end(resultat.binaire);
    return;
  }

  if (resultat.corps === undefined) {
    reponse.writeHead(resultat.statut, entetes);
    reponse.end();
    return;
  }

  reponse.writeHead(resultat.statut, { ...entetes, "content-type": "application/json; charset=utf-8" });
  reponse.end(JSON.stringify(resultat.corps));
}

/**
 * Une erreur que personne n'a prévue : son **nom** est rendu, son message et sa pile vont à la
 * console du serveur seulement. Le message peut nommer un chemin du journal d'un autre
 * annotateur ; il ne sort jamais vers le navigateur (D18, D55 (8)).
 */
export function erreurInattendue(erreur: unknown): Reponse {
  const nom = erreur instanceof Error ? erreur.name : "Erreur";
  process.stderr.write(`${erreur instanceof Error ? (erreur.stack ?? erreur.message) : String(erreur)}\n`);
  return { statut: 500, corps: { erreur: nom, detail: "Voir la console du serveur." } };
}

export interface RouteAvecGestionnaire<Contexte> {
  readonly gestionnaire: (contexte: Contexte, params: readonly string[], corps: unknown) => Reponse;
}

export interface RouteTrouvee<Contexte> {
  readonly route: RouteAvecGestionnaire<Contexte>;
  readonly params: readonly string[];
}

/**
 * Exécute une route déjà résolue : décode ses paramètres, lit le corps pour un POST, et traduit
 * `CorpsIllisible`/`ParametreMalEncode` en 400 plutôt que de les laisser remonter en erreur
 * inattendue (500).
 */
export async function executerRoute<Contexte>(
  contexte: Contexte,
  requete: IncomingMessage,
  methode: string,
  trouvee: RouteTrouvee<Contexte>,
): Promise<Reponse> {
  try {
    const params = decoderParametres(trouvee.params);
    const corps = methode === "POST" ? await lireCorps(requete) : null;
    return trouvee.route.gestionnaire(contexte, params, corps);
  } catch (erreur) {
    if (erreur instanceof CorpsIllisible || erreur instanceof ParametreMalEncode) {
      return { statut: 400, corps: { erreur: erreur.name, detail: erreur.message } };
    }
    throw erreur;
  }
}
