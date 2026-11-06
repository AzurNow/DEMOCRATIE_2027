/**
 * Liens entre les pages du site (accueil et page « exemple »), construits depuis la base Astro
 * (`import.meta.env.BASE_URL`, « / » aujourd'hui) pour rester justes si le site est servi sous un
 * sous-dossier. Fonctions pures : le composant passe le chemin de la page et la base.
 *
 * Sur l'accueil, une ancre reste « #x » (lien dans la page, vérifié par les gardes du site) ;
 * depuis une autre page, elle devient « /#x ».
 */

/** La racine du site, toujours terminée par « / ». */
export function racineDuSite(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/** Vrai si `chemin` (Astro.url.pathname) désigne la page d'accueil. */
export function estAccueil(chemin: string, base: string): boolean {
  const racine = racineDuSite(base);
  return chemin === racine || chemin === `${racine}index.html`;
}

/** Lien vers l'ancre `ancre` de la page d'accueil, vu depuis la page `chemin`. */
export function lienAccueil(ancre: string, chemin: string, base: string): string {
  return estAccueil(chemin, base) ? `#${ancre}` : `${racineDuSite(base)}#${ancre}`;
}

/** Adresse de la page « exemple » (un cas inventé suivi sur les sept étapes). */
export function lienExemple(base: string): string {
  return `${racineDuSite(base)}exemple/`;
}

/** Vrai si `chemin` désigne la page « exemple ». */
export function estExemple(chemin: string, base: string): boolean {
  const page = lienExemple(base);
  return chemin === page || chemin === page.slice(0, -1) || chemin === `${page}index.html`;
}
