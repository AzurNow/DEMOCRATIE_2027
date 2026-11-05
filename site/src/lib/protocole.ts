/**
 * Renvois de la page pédagogique vers `docs/PROTOCOLE.md` publié.
 *
 * Fonctions pures : `Renvoi.astro` lit le fichier à la construction et les appelle. Un renvoi vers
 * une section absente fait échouer la construction, jamais un lien mort silencieux.
 */
import { dirname, join, resolve } from "node:path";

/** Seul endroit où vit l'adresse du dépôt public (pied de page, gardes du site, protocole). */
export const URL_DEPOT = "https://github.com/AzurNow/DEMOCRATIE_2027";

/** Seul endroit où vit l'adresse publiée du protocole. */
export const URL_PROTOCOLE = `${URL_DEPOT}/blob/main/docs/PROTOCOLE.md`;

/** Chemin du protocole relatif à la racine du dépôt. */
export const CHEMIN_PROTOCOLE = "docs/PROTOCOLE.md";

const NUMERO_DE_SECTION = /^[1-9]\d*$/;

/**
 * Ancre que GitHub donne à un titre : minuscules, suppression de la ponctuation hors tirets et
 * espaces (lettres accentuées conservées), chaque espace devenant un tiret.
 */
export function ancreGitHub(titre: string): string {
  return titre
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

/**
 * Texte du titre `## n.` du protocole, sans les dièses. Lance une erreur si le numéro n'est pas un
 * entier positif, si aucune section ne le porte, ou si plusieurs le portent.
 */
export function titreDeSection(protocole: string, section: string): string {
  if (!NUMERO_DE_SECTION.test(section)) {
    throw new Error(`Renvoi au protocole : « ${section} » n'est pas un numéro de section.`);
  }
  const prefixe = `## ${section}. `;
  const titres = protocole
    .split("\n")
    .map((ligne) => ligne.replace(/\r$/, ""))
    .filter((ligne) => ligne.startsWith(prefixe))
    .map((ligne) => ligne.slice(3).trim());
  const [titre, ...autres] = titres;
  if (titre === undefined) {
    throw new Error(`Renvoi au protocole : aucune section « ## ${section}. » dans ${CHEMIN_PROTOCOLE}.`);
  }
  if (autres.length > 0) {
    throw new Error(`Renvoi au protocole : plusieurs sections « ## ${section}. » dans ${CHEMIN_PROTOCOLE}.`);
  }
  return titre;
}

/** Lien vers la section `n` du protocole publié. */
export function lienDeSection(protocole: string, section: string): string {
  return `${URL_PROTOCOLE}#${ancreGitHub(titreDeSection(protocole, section))}`;
}

/** Texte du lien : le libellé donné (« annexe E »), sinon « §n ». */
export function texteDuRenvoi(section: string, libelle?: string): string {
  return libelle ?? `§${section}`;
}

/**
 * Chemin de `docs/PROTOCOLE.md` en remontant depuis `depart` jusqu'à la racine du système de
 * fichiers. Lance une erreur s'il n'est trouvé nulle part. `existe` est injecté pour rester pur.
 */
export function cheminDuProtocole(depart: string, existe: (chemin: string) => boolean): string {
  let dossier = resolve(depart);
  for (;;) {
    const candidat = join(dossier, CHEMIN_PROTOCOLE);
    if (existe(candidat)) {
      return candidat;
    }
    const parent = dirname(dossier);
    if (parent === dossier) {
      throw new Error(`Renvoi au protocole : ${CHEMIN_PROTOCOLE} introuvable en remontant depuis ${depart}.`);
    }
    dossier = parent;
  }
}
