/**
 * `analysis/analyse-du-run.ts` : chaque module de calcul reçoit le partage du calcul principal, le
 * même objet, jamais un partage recalculé ni recopié (docs/DETTE.md, 2026-11-02, n° 1). §8,
 * robustesse : « Chaque recalcul garde le partage des couples outil × mode et des candidats du calcul
 * principal : les seuils de non-publication ne sont pas réappliqués à la population restreinte ».
 *
 * `analyse-du-run-contexte.test.ts` compte les appels aux fonctions de partage ; ce fichier suit le
 * partage jusqu'à ses consommateurs. Les fonctions de partage et celles qui le reçoivent sont
 * enveloppées (résultat inchangé) ; chaque appel d'un consommateur doit porter, **par référence**,
 * le partage des couples, celui des candidats, les strates et les unités du canal API que
 * `contexteDuRun` a calculés pour ce run, et que `metriques.json` publie dans `population`. Un partage
 * égal en valeur mais reconstruit échoue aussi : la garde porte sur la provenance, pas sur une
 * coïncidence des effectifs du jeu de test.
 *
 * Le run analysé réunit tout ce qui consomme le partage : un couple incomplet et un candidat sous le
 * seuil, le canal application (§6, QR8), deux juges déclarés (§7, D73 (7)) et un premier run (H5),
 * dont le partage diffère de celui du run analysé et reste le sien (§8, tendance).
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import * as accordEchantillons from "../../analysis/accord-echantillons.ts";
import { analyserRun, type EntreesDuRun } from "../../analysis/analyse-du-run.ts";
import * as conditions from "../../analysis/conditions.ts";
import * as correlationCouverture from "../../analysis/correlation-couverture.ts";
import * as couplesCompares from "../../analysis/couples-compares.ts";
import * as ecartApiApplication from "../../analysis/ecart-api-application.ts";
import * as ecartJugeEditeur from "../../analysis/ecart-juge-editeur.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import * as hypotheses from "../../analysis/hypotheses.ts";
import * as incertitude from "../../analysis/incertitude.ts";
import * as permutation from "../../analysis/permutation.ts";
import * as robustesseTaux from "../../analysis/robustesse-taux.ts";
import * as seuils from "../../analysis/seuils.ts";
import * as strateRecente from "../../analysis/strate-recente.ts";
import * as tendance from "../../analysis/tendance.ts";
import { avecNotesDeJuges, entreesDuRunAnalysable, SPEC_APPLICATION, SPEC_REFERENCE, type ContexteReponse, type SpecApplication, type SpecRun } from "./run-analysable.ts";

const { envelopper } = vi.hoisted(() => ({
  /** Le module, chaque fonction nommée remplacée par un espion qui l'appelle telle quelle. */
  envelopper<M extends object>(module: M, noms: readonly (keyof M & string)[]): M {
    const fonctions = module as Record<string, unknown>;
    const espions = Object.fromEntries(noms.map((nom) => [nom, vi.fn(fonctions[nom] as (...args: unknown[]) => unknown)]));
    return { ...module, ...espions };
  },
}));

vi.mock("../../analysis/seuils.ts", async (original) => envelopper(await original<typeof seuils>(), ["couplesComparables", "candidatsComparables"]));
vi.mock("../../analysis/incertitude.ts", async (original) => envelopper(await original<typeof incertitude>(), ["stratesDuCalculPrincipal", "tauxPubliesParCouple"]));
vi.mock("../../analysis/strate-recente.ts", async (original) => envelopper(await original<typeof strateRecente>(), ["unitesDeLaStrateRecente"]));
vi.mock("../../analysis/robustesse-taux.ts", async (original) => envelopper(await original<typeof robustesseTaux>(), ["tauxRecalcules"]));
vi.mock("../../analysis/permutation.ts", async (original) =>
  envelopper(await original<typeof permutation>(), ["testHomogeneiteCandidats", "corrigerFamilleAsymetrie"]),
);
vi.mock("../../analysis/couples-compares.ts", async (original) => envelopper(await original<typeof couplesCompares>(), ["unitesParCoupleCompare"]));
vi.mock("../../analysis/conditions.ts", async (original) =>
  envelopper(await original<typeof conditions>(), ["pairesParMode", "pairesParFormulation", "pairesDeH3"]),
);
vi.mock("../../analysis/hypotheses.ts", async (original) =>
  envelopper(await original<typeof hypotheses>(), ["decisionH1", "decisionH2", "decisionH3", "decisionH5"]),
);
vi.mock("../../analysis/correlation-couverture.ts", async (original) => envelopper(await original<typeof correlationCouverture>(), ["correlationsParCouple"]));
vi.mock("../../analysis/ecart-api-application.ts", async (original) => envelopper(await original<typeof ecartApiApplication>(), ["ecartsApiApplication"]));
vi.mock("../../analysis/ecart-juge-editeur.ts", async (original) => envelopper(await original<typeof ecartJugeEditeur>(), ["ecartsJugesEditeurs"]));
vi.mock("../../analysis/accord-echantillons.ts", async (original) => envelopper(await original<typeof accordEchantillons>(), ["variabiliteDuRun"]));
vi.mock("../../analysis/tendance.ts", async (original) => envelopper(await original<typeof tendance>(), ["tendanceDuRun"]));

const PARAMETRES = { reechantillonnages: 40, permutations: 40 };

type Appel = readonly unknown[];

interface Espion {
  readonly mock: { readonly calls: readonly Appel[]; readonly results: readonly { readonly type: string; readonly value: unknown }[] };
}

function espion(fonction: unknown): Espion {
  if (!vi.isMockFunction(fonction)) throw new Error("Fonction non enveloppée : vi.mock ne s'applique pas à ce module.");
  return fonction;
}

/** Le résultat de l'unique appel de `fonction` dont l'argument `position` est `argument` (par référence). */
function resultatPour(fonction: unknown, position: number, argument: unknown): unknown {
  const { calls, results } = espion(fonction).mock;
  const indices = calls.flatMap((appel, i) => (appel[position] === argument ? [i] : []));
  if (indices.length !== 1) throw new Error(`${indices.length} appels pour cet argument, un seul attendu : le partage est calculé une fois par run.`);
  const resultat = results[indices[0] as number];
  if (resultat === undefined || resultat.type !== "return") throw new Error("Appel sans résultat rendu.");
  return resultat.value;
}

/* ------------------------------------------------------------------ runs */

const JUGES = [
  { juge_id: "juge-1", retire: false, outils_de_son_editeur: ["outil-alpha"] },
  { juge_id: "juge-2", retire: false, outils_de_son_editeur: [] },
] as const;

function applicationDe(spec: SpecRun): SpecApplication {
  if (spec.application === undefined) throw new Error("SPEC_APPLICATION sans canal application : l'écart API / application ne serait pas éprouvé.");
  return spec.application;
}

/** Le run de référence (couple incomplet, candidat sous le seuil) avec le canal application de `SPEC_APPLICATION`. */
const SPEC_DERNIER: SpecRun = { ...SPEC_REFERENCE, application: applicationDe(SPEC_APPLICATION) };

/**
 * Gelé plus tôt ; outil-alpha / web_activee y est incomplet : son partage n'est pas celui du dernier
 * run. outil-alpha s'y trompe sur tous les items P : sa tendance est établie, donc recalculée par la
 * robustesse (comme dans `analyse-du-run-robustesse.test.ts`).
 */
const SPEC_PREMIER: SpecRun = {
  ...SPEC_REFERENCE,
  run: { cle: "run-premier-partage", date_gel: "2026-11-20T06:00:00+01:00" },
  categorie: (c: ContexteReponse) => (c.outil_id === "outil-alpha" && c.type === "P" ? "inexacte" : SPEC_REFERENCE.categorie(c)),
  manquante: (c: ContexteReponse) => c.outil_id === "outil-alpha" && c.mode === "web_activee" && c.registre !== "neutre",
};

const DERNIER: EntreesDuRun = avecNotesDeJuges(entreesDuRunAnalysable(SPEC_DERNIER), JUGES, (retenue) => retenue);
const PREMIER: EntreesDuRun = entreesDuRunAnalysable(SPEC_PREMIER);

/* ------------------------------------------------------------------ partage relevé */

interface Partage {
  readonly couples: seuils.PartageCouples;
  readonly candidats: seuils.PartageCandidats;
  readonly strates: incertitude.StratesPubliees;
  /** Les unités du canal API du run : la population de chaque section. */
  readonly unites: readonly UniteAnalyse[];
}

function partageDe(entrees: EntreesDuRun): Partage {
  const couples = resultatPour(seuils.couplesComparables, 0, entrees.reponses) as seuils.PartageCouples;
  const candidats = resultatPour(seuils.candidatsComparables, 0, entrees.run) as seuils.PartageCandidats;
  const strates = resultatPour(incertitude.stratesDuCalculPrincipal, 1, candidats) as incertitude.StratesPubliees;
  const appel = espion(incertitude.stratesDuCalculPrincipal).mock.calls.find((a) => a[1] === candidats);
  if (appel === undefined) throw new Error("Strates calculées sans le partage des candidats du run.");
  return { couples, candidats, strates, unites: appel[0] as readonly UniteAnalyse[] };
}

interface Population {
  readonly couples_compares: unknown;
  readonly couples_incomplets: unknown;
  readonly candidats_compares: unknown;
  readonly candidats_rapportes_a_part: unknown;
  readonly strates: unknown;
  readonly modes_de_tete: readonly { readonly outil_id: string; readonly mode: string }[];
}

let dernier: Partage;
let premier: Partage;
let population: Population;

beforeAll(() => {
  vi.clearAllMocks();
  const document = analyserRun(DERNIER, PARAMETRES, PREMIER) as { readonly population: Population };
  population = document.population;
  dernier = partageDe(DERNIER);
  premier = partageDe(PREMIER);
});

/* ------------------------------------------------------------------ consommateurs */

/** Ce qu'un appel transmet du partage ; une clé absente n'est pas transmise par ce consommateur. */
interface Recu {
  readonly couples?: unknown;
  readonly candidats?: unknown;
  readonly strates?: unknown;
  /** Les unités du canal API, quand le consommateur les reçoit sans restriction. */
  readonly unites?: unknown;
}

interface Consommateur {
  readonly nom: string;
  readonly fonction: unknown;
  readonly recu: (appel: Appel) => Recu;
}

function champ(objet: unknown, cle: string): unknown {
  return (objet as Record<string, unknown>)[cle];
}

/**
 * Chaque module qui reçoit le partage, par l'assembleur ou par un autre module de calcul. Les unités ne
 * sont vérifiées que là où la population entière est passée : les recalculs de robustesse, la strate
 * de moins de 60 jours et chaque couple reçoivent légitimement des unités restreintes.
 */
const CONSOMMATEURS: readonly Consommateur[] = [
  { nom: "incertitude.tauxPubliesParCouple", fonction: incertitude.tauxPubliesParCouple, recu: (a) => ({ couples: a[1], strates: a[2], candidats: a[3] }) },
  { nom: "robustesse-taux.tauxRecalcules", fonction: robustesseTaux.tauxRecalcules, recu: (a) => ({ unites: a[0], couples: a[2], strates: a[3], candidats: a[4] }) },
  { nom: "permutation.testHomogeneiteCandidats", fonction: permutation.testHomogeneiteCandidats, recu: (a) => ({ candidats: a[1] }) },
  { nom: "permutation.corrigerFamilleAsymetrie", fonction: permutation.corrigerFamilleAsymetrie, recu: (a) => ({ couples: a[1] }) },
  { nom: "couples-compares.unitesParCoupleCompare", fonction: couplesCompares.unitesParCoupleCompare, recu: (a) => ({ couples: a[1] }) },
  { nom: "conditions.pairesParMode", fonction: conditions.pairesParMode, recu: (a) => ({ couples: a[1] }) },
  { nom: "conditions.pairesParFormulation", fonction: conditions.pairesParFormulation, recu: (a) => ({ couples: a[1] }) },
  { nom: "conditions.pairesDeH3", fonction: conditions.pairesDeH3, recu: (a) => ({ couples: a[1] }) },
  { nom: "hypotheses.decisionH1", fonction: hypotheses.decisionH1, recu: (a) => ({ couples: a[1] }) },
  { nom: "hypotheses.decisionH3", fonction: hypotheses.decisionH3, recu: (a) => ({ couples: a[0] }) },
  { nom: "correlation-couverture.correlationsParCouple", fonction: correlationCouverture.correlationsParCouple, recu: (a) => ({ unites: a[0], couples: a[1], candidats: a[2] }) },
  { nom: "ecart-api-application.ecartsApiApplication", fonction: ecartApiApplication.ecartsApiApplication, recu: (a) => ({ couples: champ(a[0], "couples") }) },
  { nom: "ecart-juge-editeur.ecartsJugesEditeurs", fonction: ecartJugeEditeur.ecartsJugesEditeurs, recu: (a) => ({ unites: a[0] }) },
  { nom: "accord-echantillons.variabiliteDuRun", fonction: accordEchantillons.variabiliteDuRun, recu: (a) => ({ couples: champ(a[0], "couples"), unites: champ(a[0], "unites") }) },
  { nom: "tendance.tendanceDuRun (dernier run)", fonction: tendance.tendanceDuRun, recu: (a) => ({ couples: champ(a[1], "couples") }) },
];

function verifierAppel(consommateur: Consommateur, appel: Appel, rang: number): void {
  const recu = consommateur.recu(appel);
  const ou = `${consommateur.nom}, appel ${rang + 1}`;
  if ("couples" in recu) expect(recu.couples, `${ou} : partage des couples`).toBe(dernier.couples);
  if ("candidats" in recu) expect(recu.candidats, `${ou} : partage des candidats`).toBe(dernier.candidats);
  if ("strates" in recu) expect(recu.strates, `${ou} : strates`).toBe(dernier.strates);
  if ("unites" in recu) expect(recu.unites, `${ou} : unités du canal API`).toBe(dernier.unites);
}

/* ------------------------------------------------------------------ tests */

describe("un seul partage, passé tel quel à chaque module (DETTE 2026-11-02, n° 1)", () => {
  it("le partage du run analysé est celui que metriques.json publie dans population", () => {
    expect(population.couples_compares).toBe(dernier.couples.compares);
    expect(population.couples_incomplets).toBe(dernier.couples.incomplets);
    expect(population.candidats_compares).toBe(dernier.candidats.compares);
    expect(population.candidats_rapportes_a_part).toBe(dernier.candidats.rapportes_a_part);
    expect(population.strates).toBe(dernier.strates);
  });

  it("le jeu de test discrimine : couple incomplet, candidat rapporté à part, premier run au partage différent", () => {
    expect(dernier.couples.incomplets.length).toBeGreaterThan(0);
    expect(dernier.candidats.rapportes_a_part.length).toBeGreaterThan(0);
    expect(premier.couples.compares).not.toEqual(dernier.couples.compares);
  });

  it("chaque fonction de partage est appelée une fois par run : le run analysé et le premier run", () => {
    expect(espion(seuils.couplesComparables).mock.calls).toHaveLength(2);
    expect(espion(seuils.candidatsComparables).mock.calls).toHaveLength(2);
    expect(espion(incertitude.stratesDuCalculPrincipal).mock.calls).toHaveLength(2);
    expect(espion(strateRecente.unitesDeLaStrateRecente).mock.calls.map((a) => a[0])).toEqual([dernier.unites, premier.unites]);
  });

  it.each(CONSOMMATEURS.map((c) => [c.nom, c] as const))("%s reçoit, à chaque appel, le partage du calcul principal", (_nom, consommateur) => {
    const appels = espion(consommateur.fonction).mock.calls;
    expect(appels.length, `${consommateur.nom} jamais appelé : la garde ne porte sur rien`).toBeGreaterThan(0);
    appels.forEach((appel, rang) => verifierAppel(consommateur, appel, rang));
  });

  it("la tendance garde, à chaque appel (principal et robustesse), le partage propre au premier run", () => {
    const appels = espion(tendance.tendanceDuRun).mock.calls;
    expect(appels.length).toBeGreaterThan(1);
    for (const appel of appels) expect(champ(appel[0], "couples")).toBe(premier.couples);
  });

  it("le principal de la tendance porte sur les unités du canal API de chaque run", () => {
    const [principal] = espion(tendance.tendanceDuRun).mock.calls;
    expect(champ(principal?.[0], "unites")).toBe(premier.unites);
    expect(champ(principal?.[1], "unites")).toBe(dernier.unites);
  });

  it("les hypothèses et l'écart API / application lisent les assistants et les modes de tête publiés", () => {
    const outils = population.modes_de_tete.map((m) => m.outil_id);
    for (const nom of ["decisionH1", "decisionH2"] as const) {
      const appels = espion(hypotheses[nom]).mock.calls;
      expect(appels).toHaveLength(1);
      expect(appels[0]?.[0], nom).toEqual(outils);
    }
    const [h5] = espion(hypotheses.decisionH5).mock.calls;
    expect(champ(h5?.[0], "dernier")).toEqual(outils);
    const [ecart] = espion(ecartApiApplication.ecartsApiApplication).mock.calls;
    expect(champ(ecart?.[0], "outils")).toEqual(population.modes_de_tete.map((m) => ({ outil_id: m.outil_id, mode_de_tete: m.mode })));
  });

  it("l'écart API / application reçoit les unités API du calcul principal, puis les seules unités de l'application", () => {
    const [ecart] = espion(ecartApiApplication.ecartsApiApplication).mock.calls;
    const unites = champ(ecart?.[0], "unites") as readonly UniteAnalyse[];
    const api = unites.slice(0, dernier.unites.length);
    expect(api.length).toBe(dernier.unites.length);
    api.forEach((unite, i) => expect(unite, `unité API ${i}`).toBe(dernier.unites[i]));
    const application = unites.slice(dernier.unites.length);
    expect(application.length).toBeGreaterThan(0);
    expect(application.every((u) => u.canal === "application")).toBe(true);
  });
});
