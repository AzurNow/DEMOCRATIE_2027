/**
 * Relevé déterministe des clés de graine écrites au protocole (§7, §8) et comparaison avec celles
 * qu'emploie le code (docs/DETTE.md, 2026-11-02, point 3). Fonctions pures : elles reçoivent un texte
 * ou des listes, ne lisent aucun fichier, et lèvent plutôt que de deviner.
 *
 * **Ce qui est relevé**, entre le titre « ## 7. » et le titre « ## 9. » :
 * - les *composants* de clé : chaque jeton entre accents graves du paragraphe « Graines de l'analyse »
 *   (§8), sauf les jetons déclarés hors clé (champs de `run.json`, nom de l'algorithme), et chaque
 *   jeton entre accents graves qui suit immédiatement « composant », « strate », « métrique » ou
 *   « famille » (§7 et §8). Un composant peut être un gabarit : `<outil>:api-application` ;
 * - les *clés nommées* : ce qui suit immédiatement « clé », entre accents graves (`contrefactuel_outil`)
 *   ou entre guillemets français (« jeu_or »), les espaces intérieurs pouvant être ordinaires,
 *   insécables (U+00A0) ou fines insécables (U+202F). Une clé nommée est une clé entière.
 *
 * Le texte courant n'est jamais lu comme une clé : « la clé est celle de l'exactitude » ou l'exemple
 * « clé bootstrap / outil-alpha / … » ne donnent rien, faute d'accents graves ou de guillemets.
 *
 * **Comparaison.** Un gabarit se compare à des instances, jamais à une autre chaîne : chaque `<nom>`
 * vaut un segment sans `:` pris dans le domaine déclaré de `nom` (les outils du run pour `<outil>`, les
 * juges pour `<juge>`…). Un emplacement sans domaine déclaré lève. Une clé du code à plusieurs
 * composants s'écrit, pour être comparée à une clé nommée, avec ses composants joints par « / »
 * entourée d'espaces, comme l'exemple du §8.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";

/** Espace ordinaire, insécable (U+00A0) ou fine insécable (U+202F). */
const ESPACE = "[ \\u00A0\\u202F]";

const PARAGRAPHE_GRAINES = /^\*\*Graines de l['’]analyse\.\*\*.*$/mu;
const JETON = /`([^`]+)`/gu;
const JETON_INTRODUIT = new RegExp(`(?:composant|strate|métrique|famille)${ESPACE}+\`([^\`]+)\``, "gu");
const CLE_NOMMEE = new RegExp(`(?<![\\p{L}\\p{N}_])[Cc]lé${ESPACE}+(?:\`([^\`]+)\`|«${ESPACE}*([^»\`]+?)${ESPACE}*»)`, "gu");
const EMPLACEMENT = /<([^<>]+)>/gu;
const SEPARATEUR_DE_CLE = " / ";

export interface ClesDuProtocole {
  /** Composants de clé, gabarits compris, sans doublon, triés. */
  readonly composants: readonly string[];
  /** Clés nommées, entières, sans doublon, triées. */
  readonly cles_nommees: readonly string[];
}

/** Nom d'emplacement (`outil` dans `<outil>`) → valeurs admises. */
export type Domaines = ReadonlyMap<string, ReadonlySet<string>>;

function trierSansDoublon(valeurs: readonly string[]): string[] {
  return [...new Set(valeurs)].sort(comparerChaines);
}

/** Le texte des sections 7 et 8 : du titre « ## 7. » inclus au titre « ## 9. » exclu. */
export function sectionsSeptEtHuit(protocole: string): string {
  const debut = protocole.indexOf("\n## 7.");
  const fin = protocole.indexOf("\n## 9.");
  if (debut < 0 || fin < debut) throw new Error("Protocole : titres « ## 7. » et « ## 9. » introuvables ou dans le désordre.");
  return protocole.slice(debut, fin);
}

/** Les jetons entre accents graves du paragraphe « Graines de l'analyse » (une seule ligne du fichier). */
export function jetonsDuParagrapheDesGraines(texte: string): readonly string[] {
  const paragraphe = PARAGRAPHE_GRAINES.exec(texte);
  if (paragraphe === null) throw new Error("Protocole : paragraphe « Graines de l'analyse » introuvable.");
  return [...paragraphe[0].matchAll(JETON)].map((m) => m[1] as string);
}

/** Ce qui suit « clé » entre accents graves ou entre guillemets français, espaces repliés. */
export function clesNommees(texte: string): readonly string[] {
  return trierSansDoublon([...texte.matchAll(CLE_NOMMEE)].map((m) => (m[1] ?? m[2]) as string));
}

/** Les jetons entre accents graves qui suivent « composant », « strate », « métrique » ou « famille ». */
export function jetonsIntroduits(texte: string): readonly string[] {
  return [...texte.matchAll(JETON_INTRODUIT)].map((m) => m[1] as string);
}

/**
 * Le relevé des sections 7 et 8. `horsCle` : les jetons du paragraphe des graines qui ne sont pas des
 * composants ; chacun doit y figurer, sinon la liste est périmée et la fonction lève.
 */
export function extraireClesDuProtocole(protocole: string, horsCle: readonly string[]): ClesDuProtocole {
  const texte = sectionsSeptEtHuit(protocole);
  const jetons = jetonsDuParagrapheDesGraines(texte);
  const perimes = horsCle.filter((h) => !jetons.includes(h));
  if (perimes.length > 0) throw new Error(`Jetons hors clé absents du paragraphe des graines : ${perimes.join(", ")}.`);
  const composants = [...jetons.filter((j) => !horsCle.includes(j)), ...jetonsIntroduits(texte)];
  return { composants: trierSansDoublon(composants), cles_nommees: clesNommees(texte) };
}

function echapper(litteral: string): string {
  return litteral.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function domaineDe(nom: string, domaines: Domaines): ReadonlySet<string> {
  const domaine = domaines.get(nom);
  if (domaine === undefined) throw new Error(`Emplacement <${nom}> sans domaine déclaré : impossible de dire ce qu'il admet.`);
  return domaine;
}

/**
 * `valeur` est-elle une instance de `gabarit` ? Sans emplacement, c'est l'égalité exacte. Chaque
 * `<nom>` vaut un segment non vide sans `:`, qui doit appartenir au domaine de `nom`.
 */
export function estInstance(gabarit: string, valeur: string, domaines: Domaines): boolean {
  const noms = [...gabarit.matchAll(EMPLACEMENT)].map((m) => m[1] as string);
  const domainesDuGabarit = noms.map((nom) => domaineDe(nom, domaines));
  const motif = new RegExp(`^${gabarit.split(/<[^<>]+>/u).map(echapper).join("([^:]+)")}$`, "u");
  const trouve = motif.exec(valeur);
  if (trouve === null) return false;
  return domainesDuGabarit.every((domaine, i) => domaine.has(trouve[i + 1] as string));
}

/**
 * Code → protocole : les composants employés par le code qui ne sont instance d'aucun composant écrit.
 * `parametres` : les noms d'emplacement dont une valeur peut former à elle seule un composant (le
 * protocole écrit en clair « l'outil, le mode » ou « l'identifiant du candidat »).
 */
export function composantsNonEcrits(
  duCode: readonly string[],
  ecrits: readonly string[],
  parametres: readonly string[],
  domaines: Domaines,
): readonly string[] {
  const estParametre = (c: string): boolean => parametres.some((nom) => domaineDe(nom, domaines).has(c));
  const estEcrit = (c: string): boolean => ecrits.some((gabarit) => estInstance(gabarit, c, domaines));
  return trierSansDoublon(duCode.filter((c) => !estParametre(c) && !estEcrit(c)));
}

/** Protocole → code : les composants écrits dont le code n'emploie aucune instance. */
export function composantsSansInstance(ecrits: readonly string[], duCode: readonly string[], domaines: Domaines): readonly string[] {
  return trierSansDoublon(ecrits.filter((gabarit) => !duCode.some((c) => estInstance(gabarit, c, domaines))));
}

/** Une clé du code, écrite comme le protocole écrit une clé : ses composants joints par « / ». */
export function texteDeCle(cle: readonly string[]): string {
  if (cle.length === 0) throw new Error("Clé de graine vide : elle ne nomme rien.");
  return cle.join(SEPARATEUR_DE_CLE);
}

/** Les clés de `de` (écrites par `texteDeCle`) absentes de `dans`, sans doublon, triées. */
export function clesAbsentes(de: readonly string[], dans: readonly string[]): readonly string[] {
  return trierSansDoublon(de.filter((cle) => !dans.includes(cle)));
}
