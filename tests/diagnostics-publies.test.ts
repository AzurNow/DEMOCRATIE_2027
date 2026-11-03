/**
 * Diagnostics de lot publiés (§4, §9 ; conformité 2026-09-24, n° 16 ; docs/DETTE.md 2026-09-19,
 * point 1).
 *
 * Le kappa de chaque lot est écrit dans `validation/diagnostics/<lot_id>/<instant>.json`, en ajout
 * seul, à partir de `diagnostiquerLot` et de lui seul. La sélection du kappa qui compte pour le §12
 * ne retient que le dernier maillon d'une chaîne de réannotation, et refuse de choisir sur un
 * diagnostic dont le lien de réannotation n'est plus celui des manifestes.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErreurSchema } from "../outils/schemas/valider.ts";
import { publierDiagnostics, type Chemins } from "../outils/diagnostics/publier.ts";
import {
  CalculsSimultanes,
  derniersCalculs,
  DiagnosticPerime,
  memeCalcul,
  kappasRetenusSection12,
  type DiagnosticPublie,
  type KappaPublie,
} from "../validation/domaine/diagnostic-publie.ts";
import type { CleGrille, Decision, Item, Lot } from "../validation/domaine/types.ts";
import { ajouterDiagnostic, DiagnosticDejaEcrit, lireDiagnostics } from "../validation/io/diagnostics-fichier.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemP } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const T1 = "2026-10-12T18:00:00+02:00";
const T2 = "2026-10-20T11:30:00+02:00";
const T3 = "2026-10-21T09:00:00+02:00";

const KAPPA_QUESTION: KappaPublie = { kappa: 0.8, accord_observe: 0.9, n: 50 };
const KAPPA_PAR_QUESTION: DiagnosticPublie["kappa_par_question"] = {
  citation_fidele: KAPPA_QUESTION,
  paraphrase_exacte: KAPPA_QUESTION,
  position_univoque: KAPPA_QUESTION,
  theme_correct: KAPPA_QUESTION,
  quantification_correcte: KAPPA_QUESTION,
};

let bac: Bac;
let chemins: Chemins;

beforeEach(() => {
  bac = creerBac();
  chemins = {
    staging: join(bac.racine, "staging"),
    // Protocole 0.10 (lot contestation-notification, V3) : le statut de contestation se lit sur
    // l'état effectif, `data/items/` l'emportant sur `staging/`. Absent ici : un data/ vide.
    data: join(bac.racine, "data/items"),
    lots: join(bac.racine, "validation/lots"),
    decisions: join(bac.racine, "validation/decisions"),
    diagnostics: join(bac.racine, "validation/diagnostics"),
  };
});

afterEach(() => {
  bac.detruire();
});

/* ------------------------------------------------------------------ aides */

function items(prefixe: string, nombre: number): Item[] {
  return Array.from({ length: nombre }, (_, rang) =>
    itemP({
      id: `01JBANCESSA100000000${prefixe}TEM${CROCKFORD[Math.floor(rang / 32)]}${CROCKFORD[rang % 32]}`,
      candidat_id: rang % 2 === 0 ? "demo-alpha" : "demo-beta",
    }),
  );
}

function ecrireItems(liste: readonly Item[]): void {
  for (const item of liste) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
  }
}

/** Les décisions de chaque annotateur, item par item, dans l'ordre du lot. */
function decider(lot: Lot, liste: readonly Item[], a1: readonly Decision[], a2: readonly Decision[]): void {
  liste.forEach((item, rang) => {
    for (const [annotateur_id, decisions] of [["a1", a1], ["a2", a2]] as const) {
      const choix = decisions[rang];
      if (choix === undefined) continue;
      bac.journal(annotateur_id).ajouter(
        lot.lot_id,
        decision({ annotateur_id, item, decision: choix, lot_id: lot.lot_id, lot_nature: lot.nature }),
      );
    }
  });
}

function repete(decisionUnique: Decision, fois: number): Decision[] {
  return Array.from({ length: fois }, () => decisionUnique);
}

function fichiers(lot_id: string): string[] {
  const repertoire = join(chemins.diagnostics, lot_id);
  return existsSync(repertoire) ? readdirSync(repertoire).sort() : [];
}

function brut(lot_id: string, nom: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(chemins.diagnostics, lot_id, nom), "utf8")) as Record<string, unknown>;
}

/** Lot réel de 50 items, désaccord sur 10 : kappa défini et sous 0,80. */
function lotReelEnDesaccord(): { lot: Lot; liste: Item[] } {
  const liste = items("0", 50);
  ecrireItems(liste);
  const lot = lotDe("lot-003", liste, "reel");
  bac.ecrireLot(lot);
  decider(lot, liste, [...repete("accepter", 30), ...repete("rejeter", 20)], [
    ...repete("accepter", 25),
    ...repete("rejeter", 5),
    ...repete("accepter", 5),
    ...repete("rejeter", 15),
  ]);
  return { lot, liste };
}

function reannotation(origine: Lot): Lot {
  return {
    ...origine,
    lot_id: "lot-003-r1",
    nature: "reannotation",
    graine_maitresse: "graine-lot-003-r1",
    date_creation: "2026-10-16T09:00:00+02:00",
    reannote: origine.lot_id,
    date_calibration: "2026-10-15",
  };
}

/* ------------------------------------------------------------------ tests */

describe("sélection du kappa du §12", () => {
  it("le kappa retenu d'un lot réannoté est celui du lot de réannotation", () => {
    const { lot, liste } = lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);

    const r1 = reannotation(lot);
    bac.ecrireLot(r1);
    decider(r1, liste, [...repete("accepter", 30), ...repete("rejeter", 20)], [
      ...repete("accepter", 30),
      ...repete("rejeter", 20),
    ]);
    const comptes = [...publierDiagnostics(chemins, T2)].sort((x, y) => x.lot_id.localeCompare(y.lot_id));
    expect(comptes).toEqual([
      { lot_id: "lot-003", issue: "ecrit" },
      { lot_id: "lot-003-r1", issue: "ecrit" },
    ]);

    const diagnostics = lireDiagnostics(chemins.diagnostics);
    const origines = diagnostics.filter((d) => d.lot_id === "lot-003");
    // Le lot d'origine reste publié, ses deux calculs aussi ; le second porte le lien.
    expect(origines.map((d) => d.supersede_par)).toEqual([null, "lot-003-r1"]);
    const kappaOrigine = origines[1]?.kappa;
    expect(kappaOrigine).toBeLessThan(0.8);
    expect(origines.map((d) => d.accord_suffisant)).toEqual([false, false]);

    const retenus = kappasRetenusSection12(diagnostics, lireLots(chemins.lots));
    expect(retenus.map((d) => d.lot_id)).toEqual(["lot-003-r1"]);
    expect(retenus[0]?.kappa).toBe(1);
    // J3 (§12, D65) lit l'accord du seul lot de réannotation, jamais celui du lot d'origine.
    expect(retenus[0]?.accord_suffisant).toBe(true);
    expect(retenus[0]?.reannote).toBe("lot-003");
    expect(retenus[0]?.date_calibration).toBe("2026-10-15");
  });

  it("un diagnostic écrit avant la réannotation ne peut plus être retenu : la sélection refuse de choisir", () => {
    const { lot } = lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);
    bac.ecrireLot(reannotation(lot));

    // Le seul calcul du lot d'origine dit « supersede_par: null », ce qui n'est plus vrai.
    expect(() => kappasRetenusSection12(lireDiagnostics(chemins.diagnostics), lireLots(chemins.lots))).toThrow(
      DiagnosticPerime,
    );
  });

  it("retient le calcul le plus récent d'un lot, et refuse deux calculs au même instant", () => {
    const base: DiagnosticPublie = {
      lot_id: "lot-009",
      nature: "reel",
      date_calcul: T1,
      kappa: 0.9,
      accord_observe: 0.95,
      n: 50,
      accord_suffisant: true,
      kappa_par_question: KAPPA_PAR_QUESTION,
      exclus_contestation: 0,
      taille_lot: 50,
      taille_attendue: 50,
      taille_conforme: true,
      reannote: null,
      date_calibration: null,
      supersede_par: null,
    };
    const lots = [lotDe("lot-009", items("9", 1), "reel")];
    const plusRecent = { ...base, date_calcul: T2, kappa: 0.85, n: 49, exclus_contestation: 1 };
    expect(kappasRetenusSection12([plusRecent, base], lots)).toEqual([plusRecent]);

    // §12 (0.10) : un lot d'entraînement est publié mais ne compte pas.
    const entrainement = { ...base, lot_id: "lot-010", nature: "entrainement" as const };
    const lotsAvecEntrainement = [...lots, lotDe("lot-010", items("10", 1), "entrainement")];
    expect(kappasRetenusSection12([base, entrainement], lotsAvecEntrainement)).toEqual([base]);

    // Même instant écrit avec un autre décalage : lequel compte n'est pas décidable.
    const simultane = { ...base, date_calcul: "2026-10-12T16:00:00Z", kappa: 0.5 };
    expect(() => kappasRetenusSection12([base, simultane], lots)).toThrow(CalculsSimultanes);
  });
});

describe("accord suffisant publié (§4, D65)", () => {
  it("marges 46/3/1, deux désaccords : kappa sous 0,80, accord observé 0,96, publié suffisant et retenu pour J3", () => {
    const liste = items("5", 50);
    ecrireItems(liste);
    const lot = lotDe("lot-005", liste, "reel");
    bac.ecrireLot(lot);
    // a1 : 46 retenus, 3 rejetés, 1 non évaluable ; a2 : idem, deux désaccords croisés.
    decider(lot, liste, [...repete("accepter", 46), ...repete("rejeter", 3), "non_evaluable"], [
      ...repete("accepter", 45),
      "rejeter",
      "accepter",
      ...repete("rejeter", 2),
      "non_evaluable",
    ]);
    publierDiagnostics(chemins, T1);
    const retenus = kappasRetenusSection12(lireDiagnostics(chemins.diagnostics), lireLots(chemins.lots));
    expect(retenus.map((d) => d.lot_id)).toEqual(["lot-005"]);
    expect(retenus[0]?.kappa).toBeCloseTo(274 / 374, 12);
    expect(retenus[0]?.accord_observe).toBe(0.96);
    expect(retenus[0]?.accord_suffisant).toBe(true);
  });
});

describe("contenu publié", () => {
  it("kappa indéfini publié absent avec son motif, l'accord observé publié quand même", () => {
    const liste = items("1", 50);
    ecrireItems(liste);
    const lot = lotDe("lot-004", liste, "reel");
    bac.ecrireLot(lot);
    decider(lot, liste, repete("accepter", 50), repete("accepter", 50));

    publierDiagnostics(chemins, T1);
    const [nom] = fichiers("lot-004");
    const publie = brut("lot-004", nom as string);
    expect("kappa" in publie).toBe(false);
    expect(publie["motif_indefini"]).toBe("accord_attendu_maximal");
    expect(publie["accord_observe"]).toBe(1);
    expect(publie["n"]).toBe(50);
  });

  it("le diagnostic publié porte le kappa par question, un kappa indéfini publié absent avec son motif", () => {
    const liste = items("4", 10);
    ecrireItems(liste);
    const lot = lotDe("lot-008", liste, "reel");
    bac.ecrireLot(lot);
    // Seule `position_univoque` diffère entre les deux annotateurs ; les quatre autres questions
    // sont toutes « oui » chez les deux : accord attendu maximal, kappa indéfini.
    const univoque = [true, true, false, false, true, true, false, false, true, false];
    const univoqueAutre = [true, false, false, true, true, false, false, true, true, false];
    liste.forEach((item, rang) => {
      for (const [annotateur_id, reponses] of [["a1", univoque], ["a2", univoqueAutre]] as const) {
        const reponses_grille = { ...GRILLE_TOUT_VRAI, position_univoque: reponses[rang] as boolean };
        bac.journal(annotateur_id).ajouter(
          lot.lot_id,
          decision({ annotateur_id, item, decision: "accepter", lot_id: lot.lot_id, reponses_grille }),
        );
      }
    });

    publierDiagnostics(chemins, T1);
    const [nom] = fichiers("lot-008");
    const publie = brut("lot-008", nom as string);
    const parQuestion = publie["kappa_par_question"] as Record<string, Record<string, unknown>>;

    const cles: readonly CleGrille[] = [
      "citation_fidele",
      "paraphrase_exacte",
      "position_univoque",
      "theme_correct",
      "quantification_correcte",
    ];
    expect(Object.keys(parQuestion).sort()).toEqual([...cles].sort());

    // Défini : 6 accords sur 10, cinq « oui » chez chacun, accord attendu 0,5 : kappa (0,6 - 0,5) / 0,5 = 0,2.
    const defini = parQuestion["position_univoque"] as Record<string, unknown>;
    expect(defini["kappa"]).toBeCloseTo(0.2, 10);
    expect("motif_indefini" in defini).toBe(false);
    expect(defini["accord_observe"]).toBeCloseTo(0.6, 10);
    expect(defini["n"]).toBe(10);

    // Indéfini : absent, jamais 0, avec son motif et l'accord observé.
    for (const cle of cles.filter((autre) => autre !== "position_univoque")) {
      const indefini = parQuestion[cle] as Record<string, unknown>;
      expect("kappa" in indefini, cle).toBe(false);
      expect(indefini["motif_indefini"], cle).toBe("accord_attendu_maximal");
      expect(indefini["accord_observe"], cle).toBe(1);
      expect(indefini["n"], cle).toBe(10);
    }
  });

  it("un lot sous l'effectif attendu est publié avec taille_conforme à faux, et ne compte pas pour le §12 (0.10)", () => {
    const liste = items("2", 4);
    ecrireItems(liste);
    const lot = lotDe("lot-005", liste, "reel");
    bac.ecrireLot(lot);
    decider(lot, liste, ["accepter", "rejeter", "accepter", "rejeter"], ["accepter", "rejeter", "rejeter", "rejeter"]);

    publierDiagnostics(chemins, T1);
    const [publie] = lireDiagnostics(chemins.diagnostics);
    expect(publie?.n).toBe(4);
    expect(publie?.taille_lot).toBe(4);
    expect(publie?.taille_attendue).toBe(50);
    expect(publie?.taille_conforme).toBe(false);
    const retenus = kappasRetenusSection12(lireDiagnostics(chemins.diagnostics), lireLots(chemins.lots));
    // §12 (0.10) : seuls les lots réels ou de réannotation de taille conforme comptent.
    expect(retenus).toEqual([]);
  });

  it("aucun fichier tant qu'un des deux annotateurs n'a pas fini : le kappa n'existe pas encore", () => {
    const liste = items("3", 3);
    ecrireItems(liste);
    const lot = lotDe("lot-006", liste, "reel");
    bac.ecrireLot(lot);
    decider(lot, liste, repete("accepter", 3), ["accepter", "accepter"]);

    expect(publierDiagnostics(chemins, T1)).toEqual([{ lot_id: "lot-006", issue: "en_attente" }]);
    expect(existsSync(chemins.diagnostics)).toBe(false);
  });

  it("le diagnostic ne contient ni identifiant d'item ni identité d'annotateur", () => {
    const { liste } = lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);
    const contenu = readFileSync(join(chemins.diagnostics, "lot-003", fichiers("lot-003")[0] as string), "utf8");
    for (const item of liste) expect(contenu).not.toContain(item.id);
    expect(contenu).not.toMatch(/"a1"|"a2"/);
  });
});

describe("ajout seul : deux calculs successifs du même lot", () => {
  it("un second calcul identique n'écrit rien", () => {
    lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);
    expect(publierDiagnostics(chemins, T2)).toEqual([{ lot_id: "lot-003", issue: "inchange" }]);
    expect(fichiers("lot-003")).toHaveLength(1);
  });

  it("un second calcul différent écrit un nouveau fichier daté, sans toucher au premier", () => {
    const { liste } = lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);
    const [premier] = fichiers("lot-003");
    const octetsAvant = readFileSync(join(chemins.diagnostics, "lot-003", premier as string));

    // Une contestation arrive : l'item sort du dénominateur au calcul suivant (§4, 0.8).
    bac.ecrireItem({
      ...(liste[0] as Item),
      statut_contestation: "contestee",
      contestations: [
        {
          id: "01JBANCESSA1C0NTESTAT10N01",
          date_reception: "2026-10-18T09:00:00+02:00",
          texte: "Texte de contestation fictif.",
          contestataire_type: "campagne",
          // Protocole 0.10, §4 : le masquage des coordonnées est publié, booléen exigé par le schéma.
          caviardage: false,
        },
      ],
    });
    expect(publierDiagnostics(chemins, T2)).toEqual([{ lot_id: "lot-003", issue: "ecrit" }]);

    const noms = fichiers("lot-003");
    expect(noms).toHaveLength(2);
    expect(readFileSync(join(chemins.diagnostics, "lot-003", premier as string))).toEqual(octetsAvant);
    const second = brut("lot-003", noms[1] as string);
    expect(second["n"]).toBe(49);
    expect(second["exclus_contestation"]).toBe(1);
    expect(second["date_calcul"]).toBe(T2);

    const retenus = kappasRetenusSection12(lireDiagnostics(chemins.diagnostics), lireLots(chemins.lots));
    expect(retenus.map((d) => [d.lot_id, d.date_calcul, d.n])).toEqual([["lot-003", T2, 49]]);
  });

  it("un calcul différent au même instant est refusé, et le fichier existant n'est pas réécrit", () => {
    lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);
    const [nom] = fichiers("lot-003");
    const chemin = join(chemins.diagnostics, "lot-003", nom as string);
    const avant = readFileSync(chemin, "utf8");
    const existant = lireDiagnostics(chemins.diagnostics)[0] as DiagnosticPublie;

    expect(() => ajouterDiagnostic(chemins.diagnostics, { ...existant, kappa: 0.5 })).toThrow(DiagnosticDejaEcrit);
    expect(readFileSync(chemin, "utf8")).toBe(avant);
  });

  it("un diagnostic non conforme à son schéma n'est jamais écrit", () => {
    const faux = {
      lot_id: "lot-007",
      nature: "reel",
      date_calcul: T3,
      kappa: 0,
      motif_indefini: "accord_attendu_maximal",
      accord_observe: 1,
      n: 50,
      accord_suffisant: true,
      kappa_par_question: KAPPA_PAR_QUESTION,
      exclus_contestation: 0,
      taille_lot: 50,
      taille_attendue: 50,
      taille_conforme: true,
      reannote: null,
      date_calibration: null,
      supersede_par: null,
    } as DiagnosticPublie;
    expect(() => ajouterDiagnostic(chemins.diagnostics, faux)).toThrow(ErreurSchema);
    expect(existsSync(join(chemins.diagnostics, "lot-007"))).toBe(false);
  });

  it("à la relecture, un fichier rangé sous un autre lot que le sien est refusé", () => {
    lotReelEnDesaccord();
    publierDiagnostics(chemins, T1);
    const [nom] = fichiers("lot-003");
    const chemin = join(chemins.diagnostics, "lot-003", nom as string);
    writeFileSync(chemin, JSON.stringify({ ...brut("lot-003", nom as string), lot_id: "lot-008" }), "utf8");
    expect(() => lireDiagnostics(chemins.diagnostics)).toThrow(/lot-008/);
  });
});

describe("pnpm diagnostics", () => {
  it("écrit les diagnostics et imprime les kappas retenus pour le §12", () => {
    lotReelEnDesaccord();
    const resultat = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(RACINE, "outils/diagnostics.ts"),
        `--staging=${chemins.staging}`,
        `--lots=${chemins.lots}`,
        `--decisions=${chemins.decisions}`,
        `--diagnostics=${chemins.diagnostics}`,
      ],
      { encoding: "utf8" },
    );
    expect(resultat.stderr).not.toMatch(/Error/);
    expect(resultat.status).toBe(0);
    expect(resultat.stdout).toContain("lot-003");
    expect(resultat.stdout).toMatch(/lot-003 \(reel\) : accord insuffisant, kappa 0\.583/);
    expect(fichiers("lot-003")).toHaveLength(1);
  });
});

describe("ordre canonique des diagnostics (indépendant de la locale)", () => {
  const base = (lot_id: string): DiagnosticPublie => ({
    lot_id,
    nature: "reel",
    date_calcul: T1,
    kappa: 0.8,
    accord_observe: 0.9,
    n: 50,
    accord_suffisant: true,
    kappa_par_question: KAPPA_PAR_QUESTION,
    exclus_contestation: 0,
    taille_lot: 50,
    taille_attendue: 50,
    taille_conforme: true,
    reannote: null,
    date_calibration: null,
    supersede_par: null,
  });

  it("accentué : « lot-f » précède « lot-é » (UTF-16), alors que localeCompare fr donne l'inverse", () => {
    expect("lot-é".localeCompare("lot-f", "fr")).toBeLessThan(0);
    expect(derniersCalculs([base("lot-é"), base("lot-f")]).map((d) => d.lot_id)).toEqual(["lot-f", "lot-é"]);
  });

  it("casse mixte : les majuscules précèdent les minuscules", () => {
    expect("a".localeCompare("B", "fr")).toBeLessThan(0);
    expect(derniersCalculs([base("lot-a"), base("lot-B")]).map((d) => d.lot_id)).toEqual(["lot-B", "lot-a"]);
  });

  it("identifiants égaux : un seul calcul retenu, le plus récent", () => {
    const recent = { ...base("lot-x"), date_calcul: T2 };
    expect(derniersCalculs([base("lot-x"), recent])).toEqual([recent]);
  });

  it("memeCalcul ignore l'instant et l'ordre des clés, et voit une différence de valeur", () => {
    const a = base("lot-x");
    const decale = { ...a, date_calcul: T3 };
    const melange = Object.fromEntries(Object.entries(decale).reverse()) as unknown as DiagnosticPublie;
    expect(memeCalcul(a, melange)).toBe(true);
    expect(memeCalcul(a, { ...a, n: 51 })).toBe(false);
  });
});
