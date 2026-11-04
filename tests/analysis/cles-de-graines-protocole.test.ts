/**
 * Chaque composant de clé de graine écrit dans le protocole existe dans le code (docs/DETTE.md,
 * 2026-11-02, point 3).
 *
 * (a) Les composants attendus sont **extraits du texte** de `docs/PROTOCOLE.md`, par deux regex
 *     fixes : les jetons entre accents graves du paragraphe « Graines de l'analyse » (§8), et, au §7,
 *     la clé nommée par « graine dérivée de la clé `…` » (le contrefactuel d'outil). Si le protocole
 *     change, la liste change avec lui.
 * (b) Chaque composant attendu est produit par le code : soit il figure dans une clé de `graines[]`
 *     d'un `metriques.json` engendré sur le run de test (`run-analysable.ts`), validé contre son
 *     schéma ; soit il est la valeur d'une constante exportée nommée d'`analysis/` ou de
 *     `pipeline/notation/` (`CONSTANTES_DU_CODE`). Un composant à gabarit (`candidat:<id>`) est
 *     produit dès qu'un composant publié a sa forme, chaque `<…>` valant un segment sans `:`.
 *
 * Ce qui manque encore est listé, commenté, dans `ATTENDUES_SOUS_LOT_B`, et l'assertion est une
 * égalité : un nouveau composant manquant fait échouer le test, et un composant implémenté doit être
 * retiré de la liste.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyserRun } from "../../analysis/analyse-du-run.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { avecNotesDeJuges, entreesDuRunAnalysable, SPEC_APPLICATION, SPEC_REFERENCE } from "./run-analysable.ts";

const PROTOCOLE = readFileSync(join(RACINE_PROJET, "docs", "PROTOCOLE.md"), "utf8");

/** Le paragraphe du §8, une seule ligne du fichier. */
const PARAGRAPHE_GRAINES = /^\*\*Graines de l'analyse\.\*\*.*$/m;
/** Tout jeton entre accents graves. */
const JETON = /`([^`]+)`/g;
/** §7 : « tirées avec leur propre graine dérivée de la clé `contrefactuel_outil` ». */
const CLE_DU_PARAGRAPHE_7 = /graine dérivée de la clé `([^`]+)`/g;

/**
 * Jetons du paragraphe qui ne sont pas des composants de clé : les deux champs de `run.json` d'où
 * vient l'entier, et le nom de l'algorithme. Chacun doit figurer dans le paragraphe (vérifié).
 */
const HORS_CLE: readonly string[] = ["graines.bootstrap", "graines.permutation", "splitmix64-sha256-v1"];

/**
 * Composants produits par une constante exportée nommée plutôt que par `metriques.json` : le
 * contrefactuel d'outil tire son sous-ensemble à la notation, pas à l'analyse (§7) ; `lecture`, le
 * composant d'un taux de comparateur, n'est publié que par un run qui inclut un comparateur, ce que
 * le run analysable de ce test ne fait pas (tests/analysis/analyse-du-run-comparateurs.test.ts le
 * relève dans graines[]).
 */
const CONSTANTES_DU_CODE: readonly { readonly composant: string; readonly module: string; readonly nom: string }[] = [
  { composant: "contrefactuel_outil", module: "pipeline/notation/echantillons.ts", nom: "CLE_SOUS_ENSEMBLE_CONTREFACTUEL_OUTILS" },
  { composant: "lecture", module: "analysis/incertitude.ts", nom: "COMPOSANT_LECTURE" },
];

/**
 * Sous-lot B de `pnpm analyze` : composants écrits au protocole qu'aucune graine publiée ni aucune
 * constante ne produit encore.
 * - `application` : le taux du canal application (exploratoire, QR8).
 * Un composant implémenté se retire d'ici : le test échoue tant qu'il y reste.
 */
const ATTENDUES_SOUS_LOT_B: readonly string[] = ["application"];

function trier(liste: readonly string[]): string[] {
  return [...liste].sort(comparerChaines);
}

function jetonsDuParagraphe(): readonly string[] {
  const paragraphe = PARAGRAPHE_GRAINES.exec(PROTOCOLE);
  if (paragraphe === null) throw new Error("docs/PROTOCOLE.md : paragraphe « Graines de l'analyse » introuvable.");
  return [...paragraphe[0].matchAll(JETON)].map((m) => m[1] as string);
}

function sectionSept(): string {
  const debut = PROTOCOLE.indexOf("\n## 7.");
  const fin = PROTOCOLE.indexOf("\n## 8.");
  if (debut < 0 || fin < debut) throw new Error("docs/PROTOCOLE.md : section 7 introuvable.");
  return PROTOCOLE.slice(debut, fin);
}

/** (a) Les composants attendus, sans doublon, triés. */
function composantsAttendus(): readonly string[] {
  const duSept = [...sectionSept().matchAll(CLE_DU_PARAGRAPHE_7)].map((m) => m[1] as string);
  const duHuit = jetonsDuParagraphe().filter((jeton) => !HORS_CLE.includes(jeton));
  return trier([...new Set([...duHuit, ...duSept])]);
}

/** `candidat:<id>` → /^candidat:[^:]+$/ ; un composant sans gabarit se compare à l'identique. */
function motifDe(composant: string): RegExp {
  const parties = composant.split(/<[^>]+>/).map((partie) => partie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parties.join("[^:]+")}$`);
}

/**
 * Le run de référence, un run qui a des réponses de l'application (écart API / application, §6), et le
 * run de référence noté par deux juges dont l'un déclare un outil de son éditeur (écart juge-éditeur,
 * §7, D73 (7)), indulgent sur cet outil.
 */
function composantsPublies(): ReadonlySet<string> {
  const avecJuges = avecNotesDeJuges(
    entreesDuRunAnalysable(SPEC_REFERENCE),
    [
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
      { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
    ],
    (retenue, outil_id, juge_id) => (juge_id === "juge-1" && outil_id === "outil-alpha" ? "exacte" : retenue),
  );
  const cles = [entreesDuRunAnalysable(SPEC_REFERENCE), entreesDuRunAnalysable(SPEC_APPLICATION), avecJuges].flatMap((entrees) => {
    const document = valider<{ readonly graines: readonly { readonly cle: readonly string[] }[] }>(
      "metriques",
      analyserRun(entrees, { reechantillonnages: 5, permutations: 5 }, null),
      "metriques.json du run analysable",
    );
    return document.graines.flatMap((g) => g.cle);
  });
  return new Set(cles);
}

function valeursDe(valeur: unknown): readonly string[] {
  if (typeof valeur === "string") return [valeur];
  if (Array.isArray(valeur) && valeur.every((v) => typeof v === "string")) return valeur;
  throw new Error(`constante de type inattendu : ${JSON.stringify(valeur)}`);
}

async function composantsDesConstantes(): Promise<ReadonlyMap<string, readonly string[]>> {
  const table = new Map<string, readonly string[]>();
  for (const { composant, module, nom } of CONSTANTES_DU_CODE) {
    const charge = (await import(join(RACINE_PROJET, module))) as Record<string, unknown>;
    if (!(nom in charge)) throw new Error(`${module} n'exporte pas ${nom}.`);
    table.set(composant, valeursDe(charge[nom]));
  }
  return table;
}

function estProduit(composant: string, publies: ReadonlySet<string>, constantes: ReadonlyMap<string, readonly string[]>): boolean {
  const motif = motifDe(composant);
  const parConstante = constantes.get(composant);
  return [...publies].some((p) => motif.test(p)) || (parConstante !== undefined && parConstante.some((v) => motif.test(v)));
}

describe("composants de clé de graine : protocole → code (DETTE 2026-11-02, point 3)", () => {
  it("(a) l'extraction lit le paragraphe du §8 et le §7 : jetons hors clé présents, composants attendus non vides", () => {
    const jetons = jetonsDuParagraphe();
    for (const hors of HORS_CLE) expect(jetons).toContain(hors);
    const attendus = composantsAttendus();
    // Garde contre une regex qui ne trouverait plus rien : un composant de chaque origine.
    expect(attendus).toEqual(expect.arrayContaining(["global", "recents:60j", "repartition_drapeaux:<drapeau>", "<juge>:propre-editeur", "contrefactuel_outil"]));
  });

  it("(b) chaque composant attendu est publié dans graines[] ou porté par une constante exportée ; seuls ceux du sous-lot B manquent", async () => {
    const attendus = composantsAttendus();
    for (const declare of [...ATTENDUES_SOUS_LOT_B, ...CONSTANTES_DU_CODE.map((c) => c.composant)]) expect(attendus).toContain(declare);
    for (const { module } of CONSTANTES_DU_CODE) expect(module).toMatch(/^(analysis|pipeline\/notation)\//);
    const publies = composantsPublies();
    const constantes = await composantsDesConstantes();
    const manquants = attendus.filter((composant) => !estProduit(composant, publies, constantes));
    expect(trier(manquants)).toEqual(trier(ATTENDUES_SOUS_LOT_B));
  });
});
