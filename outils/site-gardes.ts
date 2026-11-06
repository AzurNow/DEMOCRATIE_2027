/**
 * `outils/site-gardes.ts` — fonctions de garde du site statique (plan de la page pédagogique,
 * « Technique » : tests). Pures, sauf `lireSiteConstruit` et `lirePageConstruite` qui lisent
 * `site/dist/` : elles prennent du texte et rendent des constats, pour que chaque garde soit
 * testable sur un exemple. Le site a plusieurs pages : une garde qui vaut page par page (un seul h1,
 * ancres résolues…) lit `pages`, une garde qui vaut sur tout le site peut lire `html`.
 *
 * Quatre gardes : aucune ressource externe chargée, aucun nom du périmètre, aucun renvoi « §n »
 * sans section dans le protocole, aucun appel réseau dans les scripts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import { URL_DEPOT } from "../site/src/lib/protocole.ts";
import { comparerChaines } from "./ordre-chaines.ts";

/** Seul préfixe externe admis, et seulement pour un lien documentaire `<a href>`. */
export const LIENS_DOCUMENTAIRES_ADMIS: readonly string[] = [URL_DEPOT];

const EXTERNE = /^\s*(?:https?:)?\/\//i;
const ATTRIBUTS_RESSOURCE = ["src", "poster", "data", "action", "formaction", "href"] as const;

export class SiteNonConstruit extends Error {
  constructor(dossier: string) {
    super(`${dossier}/index.html est absent : lancer pnpm build:site avant les tests.`);
  }
}

export class PageNonConstruite extends Error {
  constructor(dossier: string, chemin: string, presentes: readonly string[]) {
    super(`${dossier}/${chemin} est absente du site construit (pages présentes : ${presentes.join(", ")}).`);
  }
}

/** Une page HTML construite ; `chemin` est relatif au dossier construit, en « / » (« exemple/index.html »). */
export interface PageConstruite {
  chemin: string;
  html: string;
}

export interface SiteConstruit {
  /** Toutes les pages mises bout à bout, pour les gardes qui valent sur tout le site. */
  html: string;
  /** Chaque page à part, triée par chemin, pour les gardes qui valent page par page. */
  pages: PageConstruite[];
  scripts: string[];
}

function fichiersSous(dossier: string, extension: string): string[] {
  const trouves: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersSous(chemin, extension));
    else if (nom.endsWith(extension)) trouves.push(chemin);
  }
  return trouves;
}

/** Lit toutes les pages HTML et tous les JS produits ; échoue s'il n'y a pas de page d'accueil. */
export function lireSiteConstruit(dossier: string): SiteConstruit {
  if (!existsSync(join(dossier, "index.html"))) throw new SiteNonConstruit(dossier);
  const pages = fichiersSous(dossier, ".html")
    .map((f) => ({ chemin: relative(dossier, f).split(sep).join("/"), html: readFileSync(f, "utf8") }))
    .sort((a, b) => comparerChaines(a.chemin, b.chemin));
  const scripts = fichiersSous(dossier, ".js").map((f) => readFileSync(f, "utf8"));
  return { html: pages.map((p) => p.html).join("\n"), pages, scripts };
}

/** Le HTML d'une seule page construite (« index.html » par défaut) ; une page absente est une erreur. */
export function lirePageConstruite(dossier: string, chemin = "index.html"): string {
  const { pages } = lireSiteConstruit(dossier);
  const page = pages.find((p) => p.chemin === chemin);
  if (page === undefined) throw new PageNonConstruite(dossier, chemin, pages.map((p) => p.chemin));
  return page.html;
}

// --- ressources externes ---------------------------------------------------------------------

interface Balise {
  nom: string;
  attributs: Map<string, string>;
}

function balises(html: string): Balise[] {
  const resultat: Balise[] = [];
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
    const attributs = new Map<string, string>();
    for (const a of (m[2] ?? "").matchAll(/([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attributs.set((a[1] ?? "").toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
    }
    resultat.push({ nom: (m[1] ?? "").toLowerCase(), attributs });
  }
  return resultat;
}

function estLienAdmis(url: string): boolean {
  return LIENS_DOCUMENTAIRES_ADMIS.some((base) => url === base || (url.startsWith(base) && /^[/?#]/.test(url.slice(base.length))));
}

function urlsSrcset(valeur: string): string[] {
  return valeur.split(",").map((candidat) => candidat.trim().split(/\s+/)[0] ?? "");
}

function urlsExternesDeBalise(balise: Balise): string[] {
  const urls: string[] = [];
  for (const attribut of ATTRIBUTS_RESSOURCE) {
    const valeur = balise.attributs.get(attribut);
    if (valeur === undefined || !EXTERNE.test(valeur)) continue;
    if (attribut === "href" && balise.nom === "a" && estLienAdmis(valeur.trim())) continue;
    urls.push(valeur.trim());
  }
  const srcset = balise.attributs.get("srcset");
  if (srcset !== undefined) urls.push(...urlsSrcset(srcset).filter((u) => EXTERNE.test(u)));
  return urls;
}

function urlsExternesDeCss(contenu: string): string[] {
  const motifs = [
    /url\(\s*['"]?\s*((?:https?:)?\/\/[^)'"\s]+)/gi,
    /@import\s+(?:url\(\s*)?['"]?\s*((?:https?:)?\/\/[^)'"\s;]+)/gi,
  ];
  // Dédoublonné : `@import url(//x)` est vu par les deux motifs.
  return [...new Set(motifs.flatMap((motif) => [...contenu.matchAll(motif)].map((m) => m[1] ?? "")))];
}

/** Toute URL externe chargée par la page (liens `<a>` vers le dépôt exceptés). */
export function ressourcesExternes(html: string): string[] {
  return [...balises(html).flatMap(urlsExternesDeBalise), ...urlsExternesDeCss(html)];
}

/** Les `<script src>` externes, seuls. */
export function scriptsExternes(html: string): string[] {
  return balises(html)
    .filter((b) => b.nom === "script")
    .map((b) => b.attributs.get("src") ?? "")
    .filter((src) => EXTERNE.test(src));
}

// --- appels réseau -----------------------------------------------------------------------------

const APPELS_RESEAU = new RegExp(
  [
    String.raw`\bfetch\s*\(`,
    "XMLHttpRequest",
    String.raw`navigator\s*\.\s*sendBeacon`,
    String.raw`\bsendBeacon\s*\(`,
    String.raw`\bnew\s+WebSocket\b`,
    String.raw`\bnew\s+EventSource\b`,
    String.raw`\bimport\s*\(\s*["'\x60]\s*(?:https?:)?\/\/`,
  ].join("|"),
  "g",
);

/** Les occurrences d'un appel réseau dans un contenu (HTML avec scripts inline, ou JS produit). */
export function appelsReseau(contenu: string): string[] {
  return [...contenu.matchAll(APPELS_RESEAU)].map((m) => m[0].trim());
}

// --- texte de la page ----------------------------------------------------------------------------

const ENTITES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  sect: "§",
  nbsp: " ",
};

function decoderEntites(texte: string): string {
  return texte.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (brut, hex?: string, dec?: string, nom?: string) => {
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    if (dec !== undefined) return String.fromCodePoint(parseInt(dec, 10));
    return ENTITES[(nom ?? "").toLowerCase()] ?? brut;
  });
}

const ATTRIBUTS_TEXTUELS = ["alt", "title", "aria-label", "content"];

/** Texte lisible d'une page : contenu des balises, plus les attributs qui se lisent (alt, title…). */
export function texteDePage(html: string): string {
  const sansCode = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  const attributs = balises(sansCode).flatMap((b) => ATTRIBUTS_TEXTUELS.map((a) => b.attributs.get(a) ?? ""));
  return decoderEntites(`${sansCode.replace(/<[^>]*>/g, " ")} ${attributs.join(" ")}`);
}

/** Minuscules, sans accents, espaces unifiés : la forme de comparaison des noms. */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// --- noms du périmètre -----------------------------------------------------------------------------

function chaines(valeur: unknown): string[] {
  if (typeof valeur === "string") return [valeur];
  return Array.isArray(valeur) ? valeur.filter((v): v is string => typeof v === "string") : [];
}

function nomsDeFiche(fiche: unknown, champs: readonly string[]): string[] {
  if (typeof fiche !== "object" || fiche === null) return [];
  const table = fiche as Record<string, unknown>;
  const noms = champs.flatMap((champ) => chaines(table[champ]));
  const identifiants = [...chaines(table["candidat_id"]), ...chaines(table["outil_id"])];
  return [...noms, ...identifiants.map((id) => id.replace(/-/g, " "))];
}

export class CleDuPerimetreAbsente extends Error {
  constructor(cle: string) {
    super(`périmètre illisible : la clé « ${cle} » est absente (ou mal orthographiée) ; une liste vide s'écrit « ${cle}: [] ».`);
  }
}

/** La liste portée par une clé obligatoire du périmètre ; une clé absente ou qui n'est pas une liste est refusée. */
function listeObligatoire(table: Record<string, unknown>, cle: string): unknown[] {
  const valeur = table[cle];
  if (!Array.isArray(valeur)) throw new CleDuPerimetreAbsente(cle);
  return valeur as unknown[];
}

/**
 * Noms, libellés, alias, éditeurs et identifiants des candidats et des outils d'un périmètre (texte
 * YAML). Une liste vide est admise et donne zéro nom ; un document qui n'est pas une table, ou
 * dont la clé `candidats` ou `outils` manque, échoue (`CleDuPerimetreAbsente`) : zéro nom par
 * faute de frappe désarmerait la garde des noms.
 */
export function nomsDuPerimetre(yamlTexte: string): string[] {
  const racine: unknown = parse(yamlTexte);
  if (typeof racine !== "object" || racine === null || Array.isArray(racine)) {
    throw new Error("périmètre illisible : le document YAML n'est pas une table");
  }
  const table = racine as Record<string, unknown>;
  const noms = [
    ...listeObligatoire(table, "candidats").flatMap((c) => nomsDeFiche(c, ["libelle", "nom", "alias"])),
    ...listeObligatoire(table, "outils").flatMap((o) => nomsDeFiche(o, ["libelle", "editeur", "alias"])),
  ];
  return [...new Set(noms.map(normaliser).filter((n) => n.length >= 2))];
}

/** Les noms (déjà normalisés) qui figurent dans le texte comme mots entiers, sans égard à la casse ni aux accents. */
export function nomsPresents(texte: string, noms: readonly string[]): string[] {
  const cible = normaliser(texte);
  return noms.filter((nom) => {
    const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${echappe}(?![\\p{L}\\p{N}])`, "u").test(cible);
  });
}

// --- renvois au protocole ----------------------------------------------------------------------------

/** Numéros des sections `## n.` d'un protocole. */
export function sectionsDuProtocole(markdown: string): string[] {
  return [...markdown.matchAll(/^## (\d+)\./gm)].map((m) => m[1] ?? "");
}

/** Numéros cités par des renvois « §n » dans un texte. */
export function renvoisDuTexte(texte: string): string[] {
  return [...texte.matchAll(/§\s*(\d+)/g)].map((m) => m[1] ?? "");
}

/** Les renvois dont la section n'existe pas. */
export function renvoisSansSection(texte: string, sections: readonly string[]): string[] {
  return [...new Set(renvoisDuTexte(texte))].filter((n) => !sections.includes(n));
}
