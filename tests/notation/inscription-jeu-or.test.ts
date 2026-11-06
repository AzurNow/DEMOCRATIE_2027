/**
 * D89 : `pnpm kappa:jeu-or` inscrit ensemble, dans `run.json` du run pilote, le kappa juge-humain du
 * jeu d'or (ou son motif) et ses comptes, depuis `analysis/kappa-jeu-or.ts:inscriptionsJeuOr`
 * (`pipeline/notation/inscription-jeu-or.ts`). Un test nommé par cas limite du brief.
 *
 * Le run est un petit pilote écrit sous `os.tmpdir()`, jamais sous `runs/` : le `run.json` gelé de la
 * notation simulée (`tests/notation/fixtures/notation-dry/run.json`), passé en pilote, test
 * contrefactuel inscrit, et un volume fait à la main (réponses obtenues, notations, renvois). Moins de
 * 300 réponses obtenues : le jeu d'or les prend toutes (`tirerJeuOr`, sous-effectif).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { empreinteDuRun } from "../../analysis/analyse-du-run.ts";
import { CHAMPS_DU_JEU_D_OR, CHAMPS_ECRITS_APRES_LE_GEL, CHAMPS_HORS_EMPREINTE_DU_RUN, memeGel, retirerChamps } from "../../analysis/champs-posterieurs-au-gel.ts";
import { ArbitrageJeuOrEnAttente, JeuOrIncoherent } from "../../analysis/kappa-jeu-or.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import type { CategorieRetenue } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { tirerJeuOr } from "../../pipeline/notation/echantillons.ts";
import { CalibrationJeuOrIncomplete, InscriptionJeuOrRefusee, inscrireJeuOr, KappaJeuOrDejaInscrit } from "../../pipeline/notation/inscription-jeu-or.ts";
import { TemporaireOrphelin } from "../../pipeline/run/ecriture.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { executerOutil, RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "../analysis/fabriques.ts";
import { inexacte, notationHumaine, notationJuge, notationRegle, refusApi, renvoiJuge } from "./fabriques.ts";

type Objet = Record<string, unknown>;
type Categorie3 = Exclude<CategorieRetenue, "indeterminee">;

const FIXTURE_RUN = join(RACINE_PROJET, "tests", "notation", "fixtures", "notation-dry", "run.json");
const EXEMPLE_REPONSE = join(RACINE_PROJET, "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const EXEMPLE_CONTREFACTUEL = join(RACINE_PROJET, "schema", "exemples", "run", "valide-02-provisoire-juge-retire.json");
const JUGE_A = "juge-simule-a";
const JUGE_B = "juge-simule-b";

function lireObjet(chemin: string): Objet {
  return JSON.parse(readFileSync(chemin, "utf8")) as Objet;
}

function ecrireObjet(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

/* ------------------------------------------------------------------ run pilote */

const GELE = lireObjet(FIXTURE_RUN);
const RUN_ID = GELE["id"] as string;
const DATE = "2026-11-27";

/** Le run gelé de la fixture, passé en pilote, test contrefactuel inscrit (taux et retraits par juge). */
function runPilote(retire_b = false): Objet {
  const exemple = lireObjet(EXEMPLE_CONTREFACTUEL);
  const juges = (GELE["juges"] as Objet[]).map((juge) => ({
    ...juge,
    taux_changement_contrefactuel: 0.01,
    changements_contrefactuel: { numerateur: 2, denominateur: 200 },
    paires_ecartees_contrefactuel: 0,
    ...(retire_b && juge["juge_id"] === JUGE_B ? { retire: true, motif_retrait: "Taux de changement contrefactuel au-delà de 3 % (§7)." } : {}),
  }));
  return {
    ...GELE,
    type_run: "pilote",
    application_testee: { designe: false, mois_utc: "2026-11", motif: "type_run_exclu" },
    contrefactuel_candidats: { ...(exemple["contrefactuel_candidats"] as Objet), correspondances: { "demo-alpha": "demo-beta", "demo-beta": "demo-alpha" } },
    juges,
    taux_echantillon_humain: retire_b ? 0.25 : 0.1,
  };
}

/** Une réponse du jeu d'or : les deux humains, les juges qui la notent, ou un refus, ou un renvoi. */
interface Ligne {
  readonly humains: readonly CategorieRetenue[];
  readonly juges?: Readonly<Record<string, Categorie3>>;
  readonly refus?: true;
  readonly renvoyee_par?: string;
  /** D93 : la note du troisième humain (`arbitrage_jeu_or`), quand les deux premiers divergent. */
  readonly arbitre?: CategorieRetenue;
}

function categorie(c: CategorieRetenue): Partial<NotationIndividuelle> {
  return c === "inexacte" ? inexacte() : { categorie: c };
}

const sorties: string[] = [];

afterEach(() => {
  for (const chemin of sorties.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

interface RunPose {
  readonly repertoire: string;
  readonly run_json: string;
}

/** Écrit le run et son volume sous un répertoire temporaire `<bac>/2026-11-27/`. */
function poser(lignes: readonly Ligne[], run: Objet = runPilote()): RunPose {
  const bac = mkdtempSync(join(tmpdir(), "banc-kappa-jeu-or-"));
  sorties.push(bac);
  const repertoire = join(bac, DATE);
  const volume = join(repertoire, "volume");
  for (const dossier of ["reponses", "notations", "renvois", "reponses-contrefactuelles"]) mkdirSync(join(volume, dossier), { recursive: true });
  ecrireObjet(join(repertoire, "run.json"), run);
  lignes.forEach((ligne, rang) => poserLigne(volume, rang, ligne));
  return { repertoire, run_json: join(repertoire, "run.json") };
}

function poserLigne(volume: string, rang: number, ligne: Ligne): void {
  const id = ulid(`kappa-jeu-or-reponse-${rang}`);
  const sur = { objet_note: { type: "reponse" as const, id }, run_id: RUN_ID };
  const reponse = ligne.refus === true ? { ...refusApi(id), run_id: RUN_ID } : { ...lireObjet(EXEMPLE_REPONSE), id, run_id: RUN_ID };
  ecrireObjet(join(volume, "reponses", `${id}.json`), reponse);
  // D33 : sur un refus de l'API, l'humain porte le marqueur qui l'exempte d'extrait (non-réponse).
  const marqueur = ligne.refus === true ? { sur_refus_api: true as const } : {};
  const notations = [
    ...ligne.humains.map((c, i) => notationHumaine(`annotateur-${i + 1}`, "calibration_jeu_or", { ...sur, ...categorie(c), ...marqueur })),
    ...(ligne.arbitre === undefined ? [] : [notationHumaine("annotateur-3", "arbitrage_jeu_or", { ...sur, ...categorie(ligne.arbitre), ...marqueur })]),
    ...Object.entries(ligne.juges ?? {}).map(([juge, c]) => notationJuge(juge, { ...sur, ...categorie(c) })),
    ...(ligne.refus === true ? [notationRegle(sur)] : []),
  ];
  for (const notation of notations) ecrireObjet(join(volume, "notations", `${notation.id}.json`), notation);
  if (ligne.renvoyee_par !== undefined) {
    const renvoi = renvoiJuge(ligne.renvoyee_par, sur);
    ecrireObjet(join(volume, "renvois", `${renvoi.id}.json`), renvoi);
  }
}

function accord(ref: Categorie3, a: Categorie3, b: Categorie3): Ligne {
  return { humains: [ref, ref], juges: { [JUGE_A]: a, [JUGE_B]: b } };
}

/** juge-a parfait, juge-b au hasard : kappa 1 et 0 (`tests/analysis/kappa-jeu-or.test.ts`). */
const JEU_DEFINI: readonly Ligne[] = [
  accord("exacte", "exacte", "exacte"),
  accord("exacte", "exacte", "inexacte"),
  accord("inexacte", "inexacte", "exacte"),
  accord("inexacte", "inexacte", "inexacte"),
];

const COMPTES_DE_QUATRE = { reponses: 4, comparees: 4, renvois_ecartes: 0, indeterminees: 0, non_classees: 0, refus_api: 0 };

function juge(run_json: string, juge_id: string): Objet {
  const trouve = (lireObjet(run_json)["juges"] as Objet[]).find((j) => j["juge_id"] === juge_id);
  if (trouve === undefined) throw new Error(`juge ${juge_id} absent`);
  return trouve;
}

/* ------------------------------------------------------------------ tests */

describe("D89, inscription du kappa du jeu d'or : le cas nominal", () => {
  it("kappa défini : chaque juge reçoit kappa et comptes ensemble, rien d'autre ne change", () => {
    const pose = poser(JEU_DEFINI);
    const avant = lireObjet(pose.run_json);
    const resultat = inscrireJeuOr(pose.repertoire);
    expect(resultat.issue).toBe("inscrite");
    expect(resultat.jeu_or).toMatchObject({ obtenues: 4, sous_effectif: true });
    const apres = lireObjet(pose.run_json);
    expect(juge(pose.run_json, JUGE_A)).toMatchObject({ kappa_juge_humain: 1, comptes_jeu_or: COMPTES_DE_QUATRE });
    expect(juge(pose.run_json, JUGE_B)).toMatchObject({ kappa_juge_humain: 0, comptes_jeu_or: COMPTES_DE_QUATRE });
    expect(juge(pose.run_json, JUGE_A)["motif_indefini_kappa_juge_humain"]).toBeUndefined();
    expect(canoniser(retirerChamps(apres, CHAMPS_DU_JEU_D_OR))).toBe(canoniser(retirerChamps(avant, CHAMPS_DU_JEU_D_OR)));
  });

  it("refus de l'API et renvoi d'un juge : écartés du kappa et comptés (§7, D59 (20))", () => {
    const pose = poser([...JEU_DEFINI, { humains: ["non_reponse", "non_reponse"], refus: true }, { humains: ["exacte", "exacte"], juges: { [JUGE_B]: "exacte" }, renvoyee_par: JUGE_A }]);
    inscrireJeuOr(pose.repertoire);
    expect(juge(pose.run_json, JUGE_A)["comptes_jeu_or"]).toEqual({ reponses: 6, comparees: 4, renvois_ecartes: 1, indeterminees: 0, non_classees: 0, refus_api: 1 });
    expect(juge(pose.run_json, JUGE_B)["comptes_jeu_or"]).toEqual({ reponses: 6, comparees: 5, renvois_ecartes: 0, indeterminees: 0, non_classees: 0, refus_api: 1 });
  });
});

describe("D89, cas limites du brief", () => {
  it("kappa indéfini (accord attendu maximal) : motif et comptes, sans valeur, conforme au schéma (cf. valide-03)", () => {
    const pose = poser([accord("exacte", "exacte", "exacte"), accord("exacte", "exacte", "exacte"), accord("exacte", "exacte", "exacte")]);
    inscrireJeuOr(pose.repertoire);
    const a = juge(pose.run_json, JUGE_A);
    expect(a["kappa_juge_humain"]).toBeUndefined();
    expect(a).toMatchObject({ motif_indefini_kappa_juge_humain: "accord_attendu_maximal", comptes_jeu_or: { reponses: 3, comparees: 3 } });
    expect(() => valider("run", lireObjet(pose.run_json), "run.json écrit")).not.toThrow();
  });

  it("jeu d'or sans réponse comparable (tout refus de l'API) : motif aucune_reponse_comparable, comparees = 0", () => {
    const pose = poser([{ humains: ["non_reponse", "non_reponse"], refus: true }, { humains: ["non_reponse", "non_reponse"], refus: true }]);
    inscrireJeuOr(pose.repertoire);
    expect(juge(pose.run_json, JUGE_A)).toMatchObject({ motif_indefini_kappa_juge_humain: "aucune_reponse_comparable", comptes_jeu_or: { reponses: 2, comparees: 0, refus_api: 2 } });
  });

  it("notations humaines du jeu d'or absentes : CalibrationJeuOrIncomplete, rien d'écrit", () => {
    const pose = poser([...JEU_DEFINI, { humains: [], juges: { [JUGE_A]: "exacte", [JUGE_B]: "exacte" } }]);
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(CalibrationJeuOrIncomplete);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/1 réponse\(s\) du jeu d'or sur 5/);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("une seule des deux notations humaines : CalibrationJeuOrIncomplete, rien d'écrit", () => {
    const pose = poser([...JEU_DEFINI, { humains: ["exacte"], juges: { [JUGE_A]: "exacte", [JUGE_B]: "exacte" } }]);
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(CalibrationJeuOrIncomplete);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("run.json déjà porteur du même kappa : deja_inscrite, octets inchangés (convention du test contrefactuel et du go/no-go)", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const avant = readFileSync(pose.run_json, "utf8");
    expect(inscrireJeuOr(pose.repertoire).issue).toBe("deja_inscrite");
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("run.json déjà porteur d'un autre kappa : KappaJeuOrDejaInscrit, jamais d'écrasement silencieux", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const ecrit = lireObjet(pose.run_json);
    const juges = (ecrit["juges"] as Objet[]).map((j) => (j["juge_id"] === JUGE_B ? { ...j, kappa_juge_humain: 0.9 } : j));
    ecrireObjet(pose.run_json, { ...ecrit, juges });
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(KappaJeuOrDejaInscrit);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("run simulé (simule: true) : inscrit comme un autre, hors de runs/", () => {
    const pose = poser(JEU_DEFINI, { ...runPilote(), simule: true });
    expect(pose.repertoire.startsWith(join(RACINE_PROJET, "runs"))).toBe(false);
    expect(inscrireJeuOr(pose.repertoire).issue).toBe("inscrite");
    expect(lireObjet(pose.run_json)["simule"]).toBe(true);
    expect(juge(pose.run_json, JUGE_A)).toMatchObject({ kappa_juge_humain: 1, comptes_jeu_or: COMPTES_DE_QUATRE });
  });

  it("résultat validé par le schéma avant écriture : run.json écrit conforme, comptes avec le kappa (dependentRequired)", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const ecrit = lireObjet(pose.run_json);
    expect(() => valider("run", ecrit, "run.json écrit")).not.toThrow();
    const sansComptes = { ...ecrit, juges: (ecrit["juges"] as Objet[]).map(({ comptes_jeu_or: _c, ...reste }) => reste) };
    expect(() => valider("run", sansComptes, "kappa sans comptes")).toThrow();
  });

  it("écriture atomique : interrompue au milieu, run.json intact et aucun temporaire laissé", () => {
    const pose = poser(JEU_DEFINI);
    const avant = readFileSync(pose.run_json, "utf8");
    const panne = { writeSync: () => { throw new Error("disque plein (simulé)"); }, fsyncSync: () => undefined };
    expect(() => inscrireJeuOr(pose.repertoire, panne)).toThrow("disque plein (simulé)");
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
    expect(existsSync(`${pose.run_json}.kappa-jeu-or`)).toBe(false);
  });

  it("écriture atomique : un temporaire orphelin d'un arrêt brutal est refusé, rien d'écrit", () => {
    const pose = poser(JEU_DEFINI);
    writeFileSync(`${pose.run_json}.kappa-jeu-or`, "orphelin", "utf8");
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(TemporaireOrphelin);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
    expect(readFileSync(`${pose.run_json}.kappa-jeu-or`, "utf8")).toBe("orphelin");
  });

  it("juge retiré (§7, D13) : ses notations ne sont pas lues, il ne reçoit rien ; le juge restant a son kappa", () => {
    // juge-b ne note pas la dernière réponse : lue, elle lèverait JeuOrIncoherent (« 0 notation(s) du juge retenu »).
    const pose = poser([...JEU_DEFINI, { humains: ["exacte", "exacte"], juges: { [JUGE_A]: "exacte" } }], runPilote(true));
    const resultat = inscrireJeuOr(pose.repertoire);
    expect(resultat.inscriptions.map((i) => i.juge_id)).toEqual([JUGE_A]);
    expect(juge(pose.run_json, JUGE_A)).toMatchObject({ kappa_juge_humain: 1, comptes_jeu_or: { ...COMPTES_DE_QUATRE, reponses: 5, comparees: 5 } });
    const b = juge(pose.run_json, JUGE_B);
    for (const champ of CHAMPS_DU_JEU_D_OR.juges) expect(b[champ]).toBeUndefined();
    expect(b["retire"]).toBe(true);
  });

  it("le même jeu sans retrait : la notation manquante de juge-b est refusée, preuve qu'elle n'était pas lue", () => {
    const pose = poser([...JEU_DEFINI, { humains: ["exacte", "exacte"], juges: { [JUGE_A]: "exacte" } }]);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(JeuOrIncoherent);
  });
});

describe("D89, refus avant toute écriture", () => {

  const { contrefactuel_candidats: _contrefactuel, ...sansContrefactuel } = runPilote();
  it.each([
    ["un run qui n'est pas le pilote", { ...runPilote(), type_run: "mensuel", application_testee: { designe: true, mois_utc: "2026-11" } }, /pas le run pilote/],
    ["un run sans test contrefactuel inscrit", sansContrefactuel, /test contrefactuel n'est pas inscrit/],
    ["un run invalidé", { ...runPilote(), invalidation: { motif: "panne", date: "2026-11-28T10:00:00+01:00" } }, /invalidation/],
    ["un run planifié", { ...runPilote(), statut: "planifie" }, /statut planifie/],
  ])("%s : InscriptionJeuOrRefusee", (_nom, run, message) => {
    const pose = poser(JEU_DEFINI, run);
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(InscriptionJeuOrRefusee);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(message);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("metriques.json déjà écrit : refus, le kappa entre dans l'empreinte du run (§9)", () => {
    const pose = poser(JEU_DEFINI);
    mkdirSync(join(pose.repertoire, "metriques"));
    writeFileSync(join(pose.repertoire, "metriques", "metriques.json"), "{}\n", "utf8");
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/avant pnpm analyze/);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("une notation de calibration hors du jeu d'or rejoué (301 réponses obtenues) : refus", () => {
    const pose = poser(Array.from({ length: 301 }, () => ({ humains: [] })));
    const ids = Array.from({ length: 301 }, (_, rang) => ulid(`kappa-jeu-or-reponse-${rang}`));
    const jeu = new Set(tirerJeuOr(ids, (GELE["graines"] as { echantillon_humain: Parameters<typeof tirerJeuOr>[1] }).echantillon_humain).reponse_ids);
    const hors = ids.find((id) => !jeu.has(id));
    if (hors === undefined) throw new Error("tirage sans réponse hors du jeu d'or");
    const notation = notationHumaine("annotateur-1", "calibration_jeu_or", { objet_note: { type: "reponse", id: hors }, run_id: RUN_ID });
    ecrireObjet(join(pose.repertoire, "volume", "notations", `${notation.id}.json`), notation);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/hors du jeu d'or rejoué/);
  });
});

describe("D93, troisième humain du jeu d'or (arbitrage_jeu_or)", () => {
  it("deux humains d'accord : aucune attente d'arbitrage, kappa comme avant", () => {
    const pose = poser(JEU_DEFINI);
    expect(inscrireJeuOr(pose.repertoire).issue).toBe("inscrite");
    expect(juge(pose.run_json, JUGE_A)).toMatchObject({ kappa_juge_humain: 1, comptes_jeu_or: COMPTES_DE_QUATRE });
  });

  it("deux humains en désaccord, arbitrage présent : la note du troisième est la référence, le kappa est inscrit", () => {
    // Référence « inexacte » (le troisième) : juge-a, qui dit « inexacte », garde un kappa de 1 ;
    // la note du premier humain (« exacte ») le ferait tomber.
    const pose = poser([...JEU_DEFINI, { humains: ["exacte", "inexacte"], arbitre: "inexacte", juges: { [JUGE_A]: "inexacte", [JUGE_B]: "exacte" } }]);
    inscrireJeuOr(pose.repertoire);
    expect(juge(pose.run_json, JUGE_A)).toMatchObject({ kappa_juge_humain: 1, comptes_jeu_or: { ...COMPTES_DE_QUATRE, reponses: 5, comparees: 5 } });
    expect(() => valider("run", lireObjet(pose.run_json), "run.json écrit")).not.toThrow();
  });

  it("désaccord sans arbitrage rendu : ArbitrageJeuOrEnAttente nomme les réponses en attente, rien d'écrit", () => {
    const pose = poser([
      ...JEU_DEFINI,
      { humains: ["exacte", "inexacte"], juges: { [JUGE_A]: "exacte", [JUGE_B]: "exacte" } },
      { humains: ["exacte", "inexacte"], arbitre: "exacte", juges: { [JUGE_A]: "exacte", [JUGE_B]: "exacte" } },
      { humains: ["inexacte", "exacte"], juges: { [JUGE_A]: "exacte", [JUGE_B]: "exacte" } },
    ]);
    const avant = readFileSync(pose.run_json, "utf8");
    const attendues = [4, 6].map((rang) => ulid(`kappa-jeu-or-reponse-${rang}`));
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(ArbitrageJeuOrEnAttente);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(new RegExp(`2 réponse\\(s\\)[^]*(${attendues.join(", ")}|${[...attendues].reverse().join(", ")})`));
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("arbitrage sur une réponse où les deux humains s'accordent : JeuOrIncoherent, rien d'écrit", () => {
    const pose = poser([...JEU_DEFINI, { humains: ["exacte", "exacte"], arbitre: "inexacte", juges: { [JUGE_A]: "exacte", [JUGE_B]: "exacte" } }]);
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(JeuOrIncoherent);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/s'accordent/);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("une notation arbitrage_jeu_or hors du jeu d'or rejoué (301 réponses obtenues) : refus", () => {
    const pose = poser(Array.from({ length: 301 }, () => ({ humains: [] })));
    const ids = Array.from({ length: 301 }, (_, rang) => ulid(`kappa-jeu-or-reponse-${rang}`));
    const jeu = new Set(tirerJeuOr(ids, (GELE["graines"] as { echantillon_humain: Parameters<typeof tirerJeuOr>[1] }).echantillon_humain).reponse_ids);
    const hors = ids.find((id) => !jeu.has(id));
    if (hors === undefined) throw new Error("tirage sans réponse hors du jeu d'or");
    const notation = notationHumaine("annotateur-3", "arbitrage_jeu_or", { objet_note: { type: "reponse", id: hors }, run_id: RUN_ID });
    ecrireObjet(join(pose.repertoire, "volume", "notations", `${notation.id}.json`), notation);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(InscriptionJeuOrRefusee);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/arbitrage_jeu_or .* hors du jeu d'or rejoué/);
  });
});

describe("D93, kappa de la paire de juges inscrit à la racine", () => {
  it("défini : kappa_paire_juges, le plus faible des deux, sans motif ; même appel que les kappas des juges", () => {
    const pose = poser(JEU_DEFINI);
    const resultat = inscrireJeuOr(pose.repertoire);
    expect(resultat.paire).toEqual({ kappa_paire_juges: 0 });
    const ecrit = lireObjet(pose.run_json);
    expect(ecrit["kappa_paire_juges"]).toBe(0);
    expect(ecrit["motif_indefini_kappa_paire_juges"]).toBeUndefined();
  });

  it("indéfini : motif_indefini_kappa_paire_juges, sans valeur, conforme au schéma", () => {
    const pose = poser([accord("exacte", "exacte", "exacte"), accord("exacte", "exacte", "exacte")]);
    inscrireJeuOr(pose.repertoire);
    const ecrit = lireObjet(pose.run_json);
    expect(ecrit["kappa_paire_juges"]).toBeUndefined();
    expect(ecrit["motif_indefini_kappa_paire_juges"]).toBe("accord_attendu_maximal");
    expect(() => valider("run", ecrit, "run.json écrit")).not.toThrow();
  });

  it("juge retiré : la paire est le kappa du juge restant (§7, D13)", () => {
    const pose = poser(JEU_DEFINI, runPilote(true));
    inscrireJeuOr(pose.repertoire);
    expect(lireObjet(pose.run_json)["kappa_paire_juges"]).toBe(1);
  });

  it("idempotence : relancé, deja_inscrite, octets inchangés, la paire comprise", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const avant = readFileSync(pose.run_json, "utf8");
    const resultat = inscrireJeuOr(pose.repertoire);
    expect(resultat.issue).toBe("deja_inscrite");
    expect(resultat.paire).toEqual({ kappa_paire_juges: 0 });
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("un autre kappa de la paire déjà présent : KappaJeuOrDejaInscrit, qui nomme le champ, jamais d'écrasement", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    ecrireObjet(pose.run_json, { ...lireObjet(pose.run_json), kappa_paire_juges: 0.8 });
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(KappaJeuOrDejaInscrit);
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/racine\.kappa_paire_juges/);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("un motif de la paire déjà présent là où le recalcul donne une valeur : refus, le motif n'est pas retiré", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const { kappa_paire_juges: _k, ...sansPaire } = lireObjet(pose.run_json);
    ecrireObjet(pose.run_json, { ...sansPaire, motif_indefini_kappa_paire_juges: "accord_attendu_maximal" });
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(/racine\.motif_indefini_kappa_paire_juges/);
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });

  it("run inscrit par la version de D89 (kappas des juges, sans paire) : la paire est ajoutée (completee), rien d'autre ne change", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const complet = lireObjet(pose.run_json);
    const { kappa_paire_juges: _k, ...ancien } = complet;
    ecrireObjet(pose.run_json, ancien);
    const resultat = inscrireJeuOr(pose.repertoire);
    expect(resultat.issue).toBe("completee");
    const apres = lireObjet(pose.run_json);
    expect(canoniser(apres)).toBe(canoniser(complet));
    expect(canoniser(retirerChamps(apres, { racine: CHAMPS_DU_JEU_D_OR.racine, juges: [], outils: [], reponses: [] }))).toBe(canoniser(ancien));
    expect(inscrireJeuOr(pose.repertoire).issue).toBe("deja_inscrite");
  });

  it("run inscrit par la version de D89 dont un kappa de juge diffère du recalcul : KappaJeuOrDejaInscrit, la paire n'est pas ajoutée", () => {
    const pose = poser(JEU_DEFINI);
    inscrireJeuOr(pose.repertoire);
    const { kappa_paire_juges: _k, ...ancien } = lireObjet(pose.run_json);
    const juges = (ancien["juges"] as Objet[]).map((j) => (j["juge_id"] === JUGE_A ? { ...j, kappa_juge_humain: 0.5 } : j));
    ecrireObjet(pose.run_json, { ...ancien, juges });
    const avant = readFileSync(pose.run_json, "utf8");
    expect(() => inscrireJeuOr(pose.repertoire)).toThrow(new RegExp(`juges\\[${JUGE_A}\\]\\.kappa_juge_humain`));
    expect(readFileSync(pose.run_json, "utf8")).toBe(avant);
  });
});

describe("D89, champs postérieurs au gel", () => {
  it("les champs du jeu d'or (juges et racine) sont écrits après le gel, et restent dans l'empreinte du run (§9)", () => {
    for (const emplacement of ["juges", "racine"] as const) {
      const apres = new Set(CHAMPS_ECRITS_APRES_LE_GEL[emplacement]);
      for (const champ of CHAMPS_DU_JEU_D_OR[emplacement]) {
        expect(apres.has(champ)).toBe(true);
        expect(CHAMPS_HORS_EMPREINTE_DU_RUN[emplacement].includes(champ)).toBe(false);
      }
    }
    expect(CHAMPS_DU_JEU_D_OR.racine).toEqual(["kappa_paire_juges", "motif_indefini_kappa_paire_juges"]);
  });

  it("l'inscription garde le même gel (memeGel) et change l'empreinte du run", () => {
    const pose = poser(JEU_DEFINI);
    const avant = lireObjet(pose.run_json);
    inscrireJeuOr(pose.repertoire);
    const apres = lireObjet(pose.run_json);
    expect(memeGel(apres, avant)).toBe(true);
    expect(empreinteDuRun(apres)).not.toBe(empreinteDuRun(avant));
  });
});

describe("D89, pnpm kappa:jeu-or en ligne de commande", () => {
  it("run pilote complet : code 0, le kappa de chaque juge est imprimé", () => {
    const pose = poser(JEU_DEFINI);
    const resultat = executerOutil("kappa-jeu-or.ts", [pose.repertoire]);
    expect(resultat.sortie).toContain("kappa du jeu d'or inscrit");
    expect(resultat.sortie).toContain(`${JUGE_A} : kappa 1`);
    expect(resultat.sortie).toContain("paire de juges : kappa 0");
    expect(resultat.status).toBe(0);
  });

  it("sans répertoire : code 2, l'usage est donné", () => {
    const resultat = executerOutil("kappa-jeu-or.ts", []);
    expect(resultat.erreur).toContain("usage : pnpm kappa:jeu-or <repertoire_run>");
    expect(resultat.status).toBe(2);
  });
});
