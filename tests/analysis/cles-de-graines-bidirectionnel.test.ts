/**
 * Les clés de graine du protocole et celles du code, dans les deux sens (docs/DETTE.md, 2026-11-02,
 * point 3). Une clé renommée change toutes les bornes ou tous les tirages qu'elle engendre ; si le
 * protocole cite encore l'ancienne, un tiers qui refait le calcul d'après le texte n'obtient pas les
 * chiffres publiés.
 *
 * - Le relevé du protocole est celui de `cles-de-graines.ts` (fonctions pures, éprouvées ici sur de
 *   petits extraits fabriqués) : composants de clé du §8 et du §7, clés nommées du §7.
 * - Côté code, trois sources :
 *   1. les composants des clés publiées dans `graines[]` des `metriques.json` engendrés sur les runs
 *      de `run-analysable.ts` (référence, canal application, juge qui déclare un outil de son éditeur) ;
 *   2. les constantes exportées d'`analysis/` qui entrent dans une clé publiée par un chemin que ces
 *      runs n'empruntent pas (`CONSTANTES_HORS_RUN`) ;
 *   3. les clés de tirage du §7 : chaque export `CLE_*` des modules qui dérivent une graine de tirage
 *      (`MODULES_DE_TIRAGE`). Un module d'`analysis/` ou de `pipeline/notation/` qui appelle une
 *      fonction de dérivation sans figurer dans une liste fait échouer le test.
 * - Le sens protocole → code des composants du §8 est éprouvé par `cles-de-graines-protocole.test.ts`
 *   (b), qui porte la liste du sous-lot B ; celui des clés nommées du §7 l'est ici.
 *
 * Aucune liste d'écarts tolérés : une clé employée par le code et absente du texte, ou l'inverse, fait
 * échouer le test en la nommant. Un écart se résout par un amendement (§9) ou par le code, jamais ici.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyserRun, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import { DRAPEAUX, MODES, REGISTRES } from "../../analysis/types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import {
  clesAbsentes,
  clesNommees,
  composantsNonEcrits,
  composantsSansInstance,
  estInstance,
  extraireClesDuProtocole,
  jetonsIntroduits,
  sectionsSeptEtHuit,
  texteDeCle,
  type Domaines,
} from "./cles-de-graines.ts";
import { avecNotesDeJuges, entreesDuRunAnalysable, SPEC_APPLICATION, SPEC_REFERENCE } from "./run-analysable.ts";

const PROTOCOLE = readFileSync(join(RACINE_PROJET, "docs", "PROTOCOLE.md"), "utf8");

/** Jetons du paragraphe des graines qui ne sont pas des composants : les deux champs de `run.json` et l'algorithme. */
const HORS_CLE: readonly string[] = ["graines.bootstrap", "graines.permutation", "splitmix64-sha256-v1"];

/** Emplacements dont une valeur forme seule un composant : « l'outil, le mode », « l'identifiant du candidat » (§8). */
const PARAMETRES: readonly string[] = ["outil", "mode", "id"];

/**
 * Constantes exportées d'`analysis/` qui entrent telles quelles dans une clé publiée, par un chemin
 * que les runs de `run-analysable.ts` n'empruntent pas : les taux d'un comparateur (le run de
 * référence n'en inclut aucun ; `analyse-du-run-comparateurs.test.ts` relève ces clés dans graines[]).
 */
const CONSTANTES_HORS_RUN: readonly { readonly module: string; readonly nom: string }[] = [
  { module: "analysis/incertitude.ts", nom: "COMPOSANT_LECTURE" },
  { module: "analysis/incertitude.ts", nom: "METRIQUE_COUVERTURE" },
];

/** Modules qui dérivent une graine de tirage (§7) ; chacun de leurs exports `CLE_*` est une clé. */
const MODULES_DE_TIRAGE: readonly string[] = [
  "analysis/alias-candidats.ts",
  "pipeline/notation/derangement-outils.ts",
  "pipeline/notation/derangement.ts",
  "pipeline/notation/echantillons.ts",
];

/** Modules dont les clés dérivées sont publiées dans `graines[]` : relevées par la source 1. */
const MODULES_D_ANALYSE: readonly string[] = ["analysis/bootstrap.ts", "analysis/permutation.ts"];

/** Appels de dérivation qui n'engendrent aucune graine publiée, avec leur raison. */
const DERIVATIONS_SANS_GRAINE_PUBLIEE: readonly { readonly module: string; readonly raison: string }[] = [
  { module: "analysis/graines.ts", raison: "définition de la dérivation elle-même" },
  { module: "pipeline/notation/juge-simule.ts", raison: "juge simulé de pnpm run:dry, aucun run publié" },
];

const REPERTOIRES_SCRUTES: readonly string[] = ["analysis", "pipeline/notation"];
const APPEL_DE_DERIVATION = /\bgraine(?:Derivee|Hexadecimale|DepuisTexte)\(/u;

// ── Extraction et comparaison, sur des extraits fabriqués ───────────────────────────────────────

/** Un protocole minimal : un §7, un §8 avec son paragraphe des graines, un §9. */
function protocoleFabrique(septieme: string, paragrapheGraines: string): string {
  return ["# P", "## 7. Notation", septieme, "## 8. Analyses", `**Graines de l'analyse.** ${paragrapheGraines}`, "## 9. Suite", "la clé « hors_section »"].join("\n");
}

const DOMAINES_FABRIQUES: Domaines = new Map([
  ["outil", new Set(["outil-alpha", "outil-beta"])],
  ["juge", new Set(["juge-1"])],
  ["mode", new Set(["web_activee", "web_desactivee"])],
  ["registre", new Set(["neutre", "oriente"])],
  ["id", new Set(["candidat-a"])],
]);

describe("relevé des clés de graine dans un texte de protocole (fonctions pures)", () => {
  it("lit une clé entre accents graves et une clé entre guillemets français, espaces ordinaires, insécables ou fines", () => {
    const texte = "dérivée de la clé `contrefactuel_outil`, puis par la clé « jeu_or », la clé « alias_candidats » et la clé « ordre_file_humaine ».";
    expect(clesNommees(texte)).toEqual(["alias_candidats", "contrefactuel_outil", "jeu_or", "ordre_file_humaine"]);
  });

  it("ne lit pas le texte courant comme une clé : ni sans accents graves ni guillemets, ni au pluriel, ni dans un autre mot", () => {
    const texte = "dont la clé est celle de l'exactitude ; clé bootstrap / outil-alpha / global ; les clés « a » ; enclé « b » ; Clé « Seule ».";
    expect(clesNommees(texte)).toEqual(["Seule"]);
  });

  it("lit les composants du paragraphe des graines et les jetons introduits du §7, hors clé retirés, et ignore le §9", () => {
    const protocole = protocoleFabrique(
      "avec le composant `<juge>:propre-editeur`, strate `global` ; tiré par la clé « jeu_or » ; algorithme `splitmix64-sha256-v1`.",
      "graine (`graines.bootstrap`) : la strate `global`, `recents:60j`, `candidat:<id>` ; la métrique `exactitude`.",
    );
    expect(extraireClesDuProtocole(protocole, ["graines.bootstrap"])).toEqual({
      composants: ["<juge>:propre-editeur", "candidat:<id>", "exactitude", "global", "recents:60j"],
      cles_nommees: ["jeu_or"],
    });
  });

  it("lève quand un jeton déclaré hors clé n'est plus dans le paragraphe, ou quand le paragraphe ou les sections manquent", () => {
    const protocole = protocoleFabrique("", "la strate `global`.");
    expect(() => extraireClesDuProtocole(protocole, ["graines.bootstrap"])).toThrow(/graines\.bootstrap/u);
    expect(() => extraireClesDuProtocole(protocole.replace("**Graines de l'analyse.**", "**Graines.**"), [])).toThrow(/Graines de l'analyse/u);
    expect(() => sectionsSeptEtHuit("## 8. seul")).toThrow(/## 7\./u);
  });

  it("n'introduit un jeton qu'après composant, strate, métrique ou famille", () => {
    expect(jetonsIntroduits("le composant `a`, la strate `b`, la métrique `c`, la famille `d`, l'algorithme `e`.")).toEqual(["a", "b", "c", "d"]);
  });

  it("cas limite : une clé paramétrée se compare par son gabarit, chaque emplacement pris dans son domaine", () => {
    expect(estInstance("<outil>:api-application", "outil-alpha:api-application", DOMAINES_FABRIQUES)).toBe(true);
    // Le gabarit lui-même n'est pas une instance : `<outil>` n'est pas un outil du domaine.
    expect(estInstance("<outil>:api-application", "<outil>:api-application", DOMAINES_FABRIQUES)).toBe(false);
    // Un juge n'est pas un outil, et un suffixe renommé ne correspond plus.
    expect(estInstance("<outil>:api-application", "juge-1:api-application", DOMAINES_FABRIQUES)).toBe(false);
    expect(estInstance("<outil>:api-application", "outil-alpha:api_application", DOMAINES_FABRIQUES)).toBe(false);
    expect(estInstance("<outil>:<mode>:<registre>-<registre>", "outil-beta:web_activee:neutre-oriente", DOMAINES_FABRIQUES)).toBe(true);
    expect(() => estInstance("<inconnu>:x", "a:x", DOMAINES_FABRIQUES)).toThrow(/<inconnu>/u);
  });

  it("cas limite : une clé avec deux-points et chiffres se compare à l'identique, caractère pour caractère", () => {
    expect(estInstance("recents:60j", "recents:60j", DOMAINES_FABRIQUES)).toBe(true);
    expect(estInstance("recents:60j", "recents:90j", DOMAINES_FABRIQUES)).toBe(false);
    expect(estInstance("recents:60j", "recents_60j", DOMAINES_FABRIQUES)).toBe(false);
    expect(estInstance("type_item:F+O", "type_item:F+O", DOMAINES_FABRIQUES)).toBe(true);
    expect(estInstance("type_item:F+O", "type_item:FFO", DOMAINES_FABRIQUES)).toBe(false);
  });

  it("cas limite : un composant du code absent du texte est nommé, et un composant écrit sans instance au code aussi", () => {
    const ecrits = ["global", "<outil>:api-application", "exactitude"];
    const duCode = ["outil-alpha", "web_activee", "candidat-a", "exactitude", "global", "outil-alpha:api-application", "couverture"];
    expect(composantsNonEcrits(duCode, ecrits, ["outil", "mode", "id"], DOMAINES_FABRIQUES)).toEqual(["couverture"]);
    expect(composantsSansInstance([...ecrits, "<juge>:propre-editeur"], duCode, DOMAINES_FABRIQUES)).toEqual(["<juge>:propre-editeur"]);
  });

  it("cas limite : une clé de tirage du code absente du texte est nommée, et une clé nommée sans clé au code aussi", () => {
    const duCode = [["jeu_or"], ["contrefactuel", "noms_candidats", "sous_ensemble"]].map(texteDeCle);
    expect(clesAbsentes(duCode, ["jeu_or", "alias_candidats"])).toEqual(["contrefactuel / noms_candidats / sous_ensemble"]);
    expect(clesAbsentes(["jeu_or", "alias_candidats"], duCode)).toEqual(["alias_candidats"]);
    expect(() => texteDeCle([])).toThrow(/vide/u);
  });
});

// ── Le protocole réel et le code réel ───────────────────────────────────────────────────────────

const RELEVE = extraireClesDuProtocole(PROTOCOLE, HORS_CLE);

/** Les runs de `run-analysable.ts` qui, ensemble, empruntent chaque chemin de clé de l'analyse sauf les comparateurs. */
function runsAnalysables(): readonly EntreesDuRun[] {
  const avecJuges = avecNotesDeJuges(
    entreesDuRunAnalysable(SPEC_REFERENCE),
    [
      { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
      { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
    ],
    (retenue, outil_id, juge_id) => (juge_id === "juge-1" && outil_id === "outil-alpha" ? "exacte" : retenue),
  );
  return [entreesDuRunAnalysable(SPEC_REFERENCE), entreesDuRunAnalysable(SPEC_APPLICATION), avecJuges];
}

function clesPubliees(entrees: EntreesDuRun): readonly (readonly string[])[] {
  const document = valider<{ readonly graines: readonly { readonly cle: readonly string[] }[] }>(
    "metriques",
    analyserRun(entrees, { reechantillonnages: 5, permutations: 5 }, null),
    "metriques.json du run analysable",
  );
  return document.graines.map((g) => g.cle);
}

/** Les domaines des emplacements du protocole, lus sur les runs et les énumérations des schémas. */
function domainesDesRuns(runs: readonly EntreesDuRun[]): Domaines {
  const tous = <T,>(f: (e: EntreesDuRun) => readonly T[]): T[] => runs.flatMap(f);
  const candidats = new Set(tous((e) => e.run.perimetre.candidats.map((c) => c.candidat_id)));
  const registres = new Set<string>(REGISTRES);
  return new Map<string, ReadonlySet<string>>([
    ["outil", new Set(tous((e) => e.run.perimetre.outils.map((o) => o.outil_id)))],
    ["juge", new Set(tous((e) => e.run.juges.map((j) => j.juge_id)))],
    ["mode", new Set<string>(MODES)],
    ["registre", registres],
    ["r", registres],
    ["id", candidats],
    ["t", new Set(tous((e) => e.entrees_tirage.flatMap((t) => (t.theme === undefined ? [] : [t.theme]))))],
    ["g", new Set(tous((e) => e.entrees_tirage.map((t) => t.gabarit)))],
    ["drapeau", new Set<string>(DRAPEAUX)],
  ]);
}

async function chaine(module: string, nom: string): Promise<string> {
  const charge = (await import(join(RACINE_PROJET, module))) as Record<string, unknown>;
  const valeur = charge[nom];
  if (typeof valeur !== "string") throw new Error(`${module} : ${nom} absent ou n'est pas une chaîne (${JSON.stringify(valeur)}).`);
  return valeur;
}

function estCleDeChaines(valeur: unknown): valeur is readonly string[] {
  return Array.isArray(valeur) && valeur.every((v) => typeof v === "string");
}

/** Chaque export `CLE_*` d'un module de tirage, qui doit être une liste de chaînes. */
async function clesDeTirage(module: string): Promise<readonly (readonly string[])[]> {
  const charge = (await import(join(RACINE_PROJET, module))) as Record<string, unknown>;
  const noms = Object.keys(charge).filter((nom) => nom.startsWith("CLE_"));
  if (noms.length === 0) throw new Error(`${module} n'exporte aucune constante CLE_* : il ne devrait pas être un module de tirage.`);
  return noms.map((nom) => {
    const valeur = charge[nom];
    if (!estCleDeChaines(valeur)) throw new Error(`${module} : ${nom} n'est pas une liste de chaînes (${JSON.stringify(valeur)}).`);
    return valeur;
  });
}

/** Les modules d'`analysis/` et de `pipeline/notation/` dont le texte appelle une fonction de dérivation. */
function modulesQuiDerivent(): readonly string[] {
  return REPERTOIRES_SCRUTES.flatMap((repertoire) =>
    readdirSync(join(RACINE_PROJET, repertoire))
      .filter((fichier) => fichier.endsWith(".ts"))
      .map((fichier) => `${repertoire}/${fichier}`)
      .filter((module) => APPEL_DE_DERIVATION.test(readFileSync(join(RACINE_PROJET, module), "utf8"))),
  ).sort(comparerChaines);
}

describe("clés de graine : code ↔ protocole (DETTE 2026-11-02, point 3)", () => {
  it("le relevé du protocole trouve les clés connues de chaque forme", () => {
    // Garde contre une extraction qui ne trouverait plus rien : une clé de chaque origine et de chaque écriture.
    expect(RELEVE.composants).toEqual(expect.arrayContaining(["global", "recents:60j", "type_item:F+O", "<outil>:api-application", "<juge>:propre-editeur", "exactitude"]));
    expect(RELEVE.cles_nommees).toEqual(expect.arrayContaining(["contrefactuel_outil", "jeu_or"]));
  });

  it("chaque module qui dérive une graine est rangé : tirage, analyse publiée, ou sans graine publiée avec sa raison", () => {
    const ranges = [...MODULES_DE_TIRAGE, ...MODULES_D_ANALYSE, ...DERIVATIONS_SANS_GRAINE_PUBLIEE.map((d) => d.module)].sort(comparerChaines);
    expect(modulesQuiDerivent()).toEqual(ranges);
  });

  it("code → protocole : chaque composant des clés publiées par l'analyse est écrit au §7 ou au §8", () => {
    const runs = runsAnalysables();
    const composants = runs.flatMap(clesPubliees).flat();
    const manquants = composantsNonEcrits(composants, RELEVE.composants, PARAMETRES, domainesDesRuns(runs));
    expect(manquants, `composants publiés par le code et absents du protocole : ${manquants.join(", ")}`).toEqual([]);
  });

  it("code → protocole : chaque constante d'analysis/ hors des runs de test est écrite au §8", async () => {
    const valeurs = await Promise.all(CONSTANTES_HORS_RUN.map(({ module, nom }) => chaine(module, nom)));
    const manquants = composantsNonEcrits(valeurs, RELEVE.composants, PARAMETRES, domainesDesRuns(runsAnalysables()));
    expect(manquants, `composants employés par le code et absents du protocole : ${manquants.join(", ")}`).toEqual([]);
  });

  it("code → protocole : chaque clé de tirage du code est nommée au §7, à l'identique", async () => {
    const cles = (await Promise.all(MODULES_DE_TIRAGE.map(clesDeTirage))).flat().map(texteDeCle);
    const manquantes = clesAbsentes(cles, RELEVE.cles_nommees);
    expect(manquantes, `clés de tirage du code absentes du protocole : ${manquantes.join(" ; ")}`).toEqual([]);
  });

  it("protocole → code : chaque clé nommée au §7 est une clé de tirage du code, à l'identique", async () => {
    const cles = (await Promise.all(MODULES_DE_TIRAGE.map(clesDeTirage))).flat().map(texteDeCle);
    const manquantes = clesAbsentes(RELEVE.cles_nommees, cles);
    expect(manquantes, `clés nommées au protocole qu'aucun module de tirage n'exporte : ${manquantes.join(" ; ")}`).toEqual([]);
  });
});
