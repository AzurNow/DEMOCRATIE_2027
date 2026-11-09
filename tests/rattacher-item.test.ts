/**
 * `pnpm mesures --rattacher=<item> --a=<mesure> [--date=…] [--ecrire]` (décision D53 (1) du
 * 2026-10-16) : rattache un item de staging à une autre mesure existante, trace la décision dans le
 * registre publié en ajout seul `validation/mesures/rattachements.json`, et réécrit l'item en
 * staging sur la mesure cible. Un item déjà annoté est renvoyé en attente : le lot qui l'épinglait
 * ne le juge plus, ses décisions restent au journal. Mêmes garde-fous et mêmes refus que
 * `--renvoyer`. Rien n'est écrit dans `data/`.
 *
 * Cas limites 8 à 18 et 20 du brief ; la logique pure et l'accord avec le schéma (cas 19) sont dans
 * `tests/rattachements-item.test.ts`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appliquerRattachement } from "../outils/rattachement-mesure.ts";
import { empreinteContenuNotant } from "../validation/domaine/empreinte.ts";
import { entreeRattachement, rattacherItem } from "../validation/domaine/rattachements-item.ts";
import { lotJugeEncore } from "../validation/domaine/renvoi-mesure.ts";
import type { Item } from "../validation/domaine/types.ts";
import { cheminRattachements } from "../validation/io/rattachements-fichier.ts";
import { ItemStagingModifie } from "../validation/io/staging-renvoi.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { commiterTout, executerOutil, head, initialiserDepot } from "./aides/depot.ts";
import { decision, itemA, itemF, itemO, itemP, mesure } from "./aides/fabriques.ts";

const DATE = "2026-10-16";
/** La mesure cible, partagée : version 2 pour vérifier que l'item épingle la version courante. */
const MESURE_A = mesure({ id: "01JBANCESSA90000000MESVRE1", version: 2 });
/** La mesure proposée par l'extraction pour Y seul. */
const MESURE_B = mesure({ id: "01JBANCESSA90000000MESVRE2", libelle: "TVA à 5,5 % sur l'énergie" });
/** X cite déjà A. */
const X = itemP({ id: "01JBANCESSA1000000000TEMX1", candidat_id: "demo-alpha", mesure_id: MESURE_A.id, mesure_version: 2 });
/** Y, à rattacher de B à A. */
const Y = itemP({ id: "01JBANCESSA1000000000TEMY1", candidat_id: "demo-beta", mesure_id: MESURE_B.id, mesure_version: 1 });

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--data=${join(bac.racine, "data/items")}`,
  ];
}

function cheminsPromote(bac: Bac): readonly string[] {
  return [...chemins(bac), `--arbitrage=${join(bac.racine, "validation/arbitrage")}`, `--data-mesures=${join(bac.racine, "data/mesures")}`];
}

interface Preparation {
  /** Annotateurs de lot-001 qui ont jugé Y ; `null` : Y n'est dans aucun lot. */
  readonly jugeants?: readonly string[] | null;
  readonly y?: Item;
}

function preparer(preparation: Preparation = {}): Bac {
  const y = preparation.y ?? Y;
  const bac = creerBac();
  bac.ecrireItem(X);
  bac.ecrireItem(y);
  bac.ecrireMesure(MESURE_A);
  bac.ecrireMesure(MESURE_B);
  const jugeants = preparation.jugeants === undefined ? null : preparation.jugeants;
  if (jugeants !== null) {
    bac.ecrireLot(lotDe("lot-001", [y]));
    for (const annotateur_id of jugeants) bac.journal(annotateur_id).ajouter("lot-001", decision({ annotateur_id, item: y, decision: "accepter" }));
  }
  initialiserDepot(bac.racine);
  return bac;
}

function rattacher(bac: Bac, item_id: string, cible: string, ...extra: readonly string[]) {
  return executerOutil("mesures.ts", [...chemins(bac), `--rattacher=${item_id}`, `--a=${cible}`, `--date=${DATE}`, ...extra]);
}

function lireStaging(bac: Bac, id: string): string {
  return readFileSync(join(bac.racine, "staging/items", `${id}.json`), "utf8");
}

function registre(bac: Bac): string {
  return cheminRattachements(join(bac.racine, "validation/mesures"));
}

function journaux(bac: Bac): string {
  const repertoire = join(bac.racine, "validation/decisions");
  return readdirSync(repertoire, { recursive: true, withFileTypes: true })
    .filter((entree) => entree.isFile())
    .map((entree) => join(entree.parentPath, entree.name))
    .sort()
    .map((chemin) => `${chemin}\n${readFileSync(chemin, "utf8")}`)
    .join("\n");
}

function avecBac(preparation: Preparation, corps: (bac: Bac) => void): void {
  const bac = preparer(preparation);
  try {
    corps(bac);
  } finally {
    bac.detruire();
  }
}

/** Refus nommé, sans pile d'appels, et rien d'écrit : ni staging, ni registre. */
function attendreRefus(bac: Bac, resultat: ReturnType<typeof rattacher>, motif: RegExp): void {
  expect(resultat.status).not.toBe(0);
  expect(resultat.erreur).toMatch(motif);
  expect(resultat.erreur).not.toMatch(/\n\s+at /);
  expect(existsSync(registre(bac))).toBe(false);
}

describe("`pnpm mesures --rattacher` : refus", () => {
  it("cas 8 : item introuvable en staging ⇒ erreur nommée", () => {
    avecBac({}, (bac) => {
      attendreRefus(bac, rattacher(bac, "01JBANCESSA1000000000TEMZ9", MESURE_A.id, "--ecrire"), /Item 01JBANCESSA1000000000TEMZ9 introuvable/);
    });
  });

  it("cas 8 : mesure cible introuvable en staging/mesures ⇒ erreur nommée, Y inchangé", () => {
    avecBac({}, (bac) => {
      const avant = lireStaging(bac, Y.id);
      attendreRefus(bac, rattacher(bac, Y.id, "01JBANCESSA90000000MESVRE9", "--ecrire"), /Mesure 01JBANCESSA90000000MESVRE9 introuvable/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
    });
  });

  it("cas 8 (question ouverte) : une cible présente dans data/mesures mais absente de staging/mesures est refusée, jamais copiée", () => {
    avecBac({}, (bac) => {
      const publiee = mesure({ id: "01JBANCESSA90000000MESVRE8" });
      mkdirSync(join(bac.racine, "data/mesures"), { recursive: true });
      writeFileSync(join(bac.racine, "data/mesures", `${publiee.id}.json`), JSON.stringify(publiee), "utf8");
      commiterTout(bac.racine, "mesure publiée");
      attendreRefus(bac, rattacher(bac, Y.id, publiee.id, "--ecrire"), /Mesure 01JBANCESSA90000000MESVRE8 introuvable/);
      expect(existsSync(join(bac.racine, "staging/mesures", `${publiee.id}.json`))).toBe(false);
    });
  });

  it("cas 9 : la cible est la mesure actuelle de l'item ⇒ refus explicite, rien à faire", () => {
    avecBac({}, (bac) => {
      const avant = lireStaging(bac, Y.id);
      attendreRefus(bac, rattacher(bac, Y.id, MESURE_B.id, "--ecrire"), /deja_rattache[\s\S]*rien à faire/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
    });
  });

  it("cas 12 : Y dans un lot inachevé ⇒ refus nommé, ni registre ni staging écrits", () => {
    avecBac({ jugeants: ["a1"] }, (bac) => {
      const avant = lireStaging(bac, Y.id);
      attendreRefus(bac, rattacher(bac, Y.id, MESURE_A.id, "--ecrire"), /decisions_incompletes[\s\S]*lot-001/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
    });
  });

  it("cas 13 : Y publié dans data/items ⇒ refus nommé", () => {
    avecBac({}, (bac) => {
      mkdirSync(join(bac.racine, "data/items"), { recursive: true });
      writeFileSync(join(bac.racine, "data/items", `${Y.id}.json`), `${JSON.stringify(Y)}\n`, "utf8");
      commiterTout(bac.racine, "Y publié");
      const avant = lireStaging(bac, Y.id);
      attendreRefus(bac, rattacher(bac, Y.id, MESURE_A.id, "--ecrire"), /publie[\s\S]*pnpm contester/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
    });
  });

  it("cas 14 : Y non en attente ⇒ refus", () => {
    avecBac({ y: { ...Y, statut_validation: "rejete" } }, (bac) => {
      attendreRefus(bac, rattacher(bac, Y.id, MESURE_A.id, "--ecrire"), /pas_en_attente[\s\S]*rejete/);
    });
  });

  it("cas 15 : --ecrire sur un arbre Git sale ⇒ refus, rien d'écrit", () => {
    avecBac({}, (bac) => {
      writeFileSync(join(bac.racine, "trace.txt"), "modification non commitée\n");
      const avant = lireStaging(bac, Y.id);
      attendreRefus(bac, rattacher(bac, Y.id, MESURE_A.id, "--ecrire"), /Arbre Git non propre/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
    });
  });

  it("cas 16 : registre des rattachements corrompu ⇒ refus avant toute écriture, Y inchangé en staging", () => {
    avecBac({}, (bac) => {
      mkdirSync(join(bac.racine, "validation/mesures"), { recursive: true });
      writeFileSync(registre(bac), "[{ pas du json", "utf8");
      commiterTout(bac.racine, "registre corrompu");
      const avant = lireStaging(bac, Y.id);
      const resultat = rattacher(bac, Y.id, MESURE_A.id, "--ecrire");
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/Registre des rattachements d'item illisible/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
      expect(readFileSync(registre(bac), "utf8")).toBe("[{ pas du json");
    });
  });
});

/*
 * Protocole 0.17, §4 : « Un item F ne se rattache qu'à une mesure fictive, un item d'un autre type
 * qu'à une mesure qui ne l'est pas. »
 */
describe("`pnpm mesures --rattacher` : type de l'item et caractère fictif de la cible", () => {
  const FICTIVE = mesure({
    id: "01JBANCESSA90000000MESVRF1",
    libelle: "Prime aux marcheurs",
    formulation_canonique: "verser une prime annuelle aux personnes qui vont au travail à pied",
    fictive: true,
    origine_fictive: "Mesure de test inventée, sans rapport avec aucun candidat.",
    verification_fictivite: {
      date: "2026-10-15T11:00:00+02:00",
      corpus_verifies: ["demo-alpha", "demo-beta"],
      niveaux_balayes: ["T1", "T2", "items_T3"],
      operateur: "a2",
      resultat: "aucune_occurrence",
    },
  });
  /** Mesure fictive proposée par l'extraction pour l'item F seul. */
  const FICTIVE_PROPRE = { ...FICTIVE, id: "01JBANCESSA90000000MESVRF2", libelle: "Prime à la marche" };
  const F = itemF({ id: "01JBANCESSA1000000000TEMF1", candidat_id: "demo-beta", mesure_id: FICTIVE_PROPRE.id, mesure_version: 1 });
  const O = itemO({ id: "01JBANCESSA1000000000TEMC1", mesure_id: MESURE_B.id, mesure_version: 1 });

  /** Un dépôt avec les mesures A, B, les deux fictives, et l'item à rattacher ; hors lot. */
  function avecItem(item: Item, corps: (bac: Bac) => void): void {
    const bac = creerBac();
    try {
      bac.ecrireItem(item);
      for (const valeur of [MESURE_A, MESURE_B, FICTIVE, FICTIVE_PROPRE]) bac.ecrireMesure(valeur);
      initialiserDepot(bac.racine);
      corps(bac);
    } finally {
      bac.detruire();
    }
  }

  it("cas 11 : item F vers une mesure non fictive ⇒ refus type_incompatible, registre et staging inchangés", () => {
    avecItem(F, (bac) => {
      const avant = lireStaging(bac, F.id);
      attendreRefus(bac, rattacher(bac, F.id, MESURE_A.id, "--ecrire"), /type_incompatible[\s\S]*type F[\s\S]*non fictive/);
      expect(lireStaging(bac, F.id)).toBe(avant);
    });
  });

  it.each<readonly [string, Item]>([
    ["P", itemP({ id: "01JBANCESSA1000000000TEMP1", mesure_id: MESURE_B.id, mesure_version: 1 })],
    ["A", itemA({ id: "01JBANCESSA1000000000TEMA1", mesure_id: MESURE_B.id, mesure_version: 1 })],
    ["O", O],
  ])("cas 12 : item %s vers une mesure fictive ⇒ refus type_incompatible, registre et staging inchangés", (type, item) => {
    avecItem(item, (bac) => {
      const avant = lireStaging(bac, item.id);
      attendreRefus(bac, rattacher(bac, item.id, FICTIVE.id, "--ecrire"), new RegExp(`type_incompatible[\\s\\S]*type ${type}[\\s\\S]*fictive`));
      expect(lireStaging(bac, item.id)).toBe(avant);
    });
  });

  it("cas 13 : item F vers une mesure fictive ⇒ rattaché, entrée au registre", () => {
    avecItem(F, (bac) => {
      const resultat = rattacher(bac, F.id, FICTIVE.id, "--ecrire");
      expect(resultat.status, resultat.erreur).toBe(0);
      const f = JSON.parse(lireStaging(bac, F.id)) as Item;
      expect([f.type, f.mesure_id, f.mesure_version, f.version]).toEqual(["F", FICTIVE.id, 1, F.version + 1]);
      expect(JSON.parse(readFileSync(registre(bac), "utf8"))).toEqual([entreeRattachement(F, FICTIVE, DATE)]);
    });
  });
});

describe("cas 20 : modes incompatibles", () => {
  it.each([
    ["--relire et --rattacher", [`--relire=${MESURE_A.id}`, `--rattacher=${Y.id}`, `--a=${MESURE_A.id}`]],
    ["--relire et --mesure", [`--relire=${MESURE_A.id}`, `--mesure=${MESURE_A.id}`]],
    ["--relire et --renvoyer", [`--relire=${MESURE_A.id}`, `--renvoyer=${MESURE_A.id}`]],
    ["--rattacher et --mesure", [`--rattacher=${Y.id}`, `--a=${MESURE_A.id}`, `--mesure=${MESURE_A.id}`]],
    ["--rattacher et --renvoyer", [`--rattacher=${Y.id}`, `--a=${MESURE_A.id}`, `--renvoyer=${MESURE_A.id}`]],
    ["--a sans --rattacher", [`--a=${MESURE_A.id}`]],
  ])("%s ⇒ refus explicite, rien d'écrit", (_nom, arguments_) => {
    avecBac({}, (bac) => {
      const avant = lireStaging(bac, Y.id);
      const resultat = executerOutil("mesures.ts", [...chemins(bac), ...arguments_, "--ecrire"]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/incompatible|n'a de sens qu'avec/);
      expect(resultat.erreur).not.toMatch(/\n\s+at /);
      expect(lireStaging(bac, Y.id)).toBe(avant);
      expect(existsSync(registre(bac))).toBe(false);
      expect(existsSync(join(bac.racine, "validation/mesures/relectures.json"))).toBe(false);
    });
  });

  it("--rattacher sans --a ⇒ refus, la cible n'est jamais implicite", () => {
    avecBac({}, (bac) => {
      const resultat = executerOutil("mesures.ts", [...chemins(bac), `--rattacher=${Y.id}`, "--ecrire"]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/--a est obligatoire/);
      expect(existsSync(registre(bac))).toBe(false);
    });
  });
});

describe("`pnpm mesures --rattacher` : écriture", () => {
  it("cas 15 : simulation ⇒ rapporte avant et après, n'écrit rien", () => {
    avecBac({}, (bac) => {
      const avant = lireStaging(bac, Y.id);
      const resultat = rattacher(bac, Y.id, MESURE_A.id);
      expect(resultat.status, resultat.erreur).toBe(0);
      expect(resultat.sortie).toContain(`mesure avant : ${MESURE_B.id} version 1`);
      expect(resultat.sortie).toContain(`mesure après : ${MESURE_A.id} version 2`);
      expect(resultat.sortie).toContain(`version de l'item : 1 → 2`);
      expect(resultat.sortie).toMatch(/hors lot/);
      expect(resultat.sortie).toMatch(/Simulation/);
      expect(lireStaging(bac, Y.id)).toBe(avant);
      expect(existsSync(registre(bac))).toBe(false);
    });
  });

  it("cas 10 : Y en attente, dans aucun lot ⇒ réécrit sur la cible, historique avec HEAD, entrée au registre", () => {
    avecBac({}, (bac) => {
      const xAvant = lireStaging(bac, X.id);
      const resultat = rattacher(bac, Y.id, MESURE_A.id, "--ecrire");
      expect(resultat.status, resultat.erreur).toBe(0);

      const y = JSON.parse(lireStaging(bac, Y.id)) as Item;
      expect([y.mesure_id, y.mesure_version, y.version, y.statut_validation]).toEqual([MESURE_A.id, 2, Y.version + 1, "en_attente"]);
      expect(y.empreinte).toBe(empreinteContenuNotant(y));
      const derniere = (y.historique as readonly { commit: string; changement: string }[]).at(-1);
      expect(derniere?.commit).toBe(head(bac.racine));
      expect(derniere?.changement).toBe(`rattachement à une autre mesure : mesure ${MESURE_A.id} en version 2`);
      expect(JSON.parse(readFileSync(registre(bac), "utf8"))).toEqual([entreeRattachement(Y, MESURE_A, DATE)]);
      expect(lireStaging(bac, X.id)).toBe(xAvant);
      expect(resultat.sortie).toMatch(/git add staging\/items validation\/mesures\/rattachements\.json/);
      expect(existsSync(join(bac.racine, "data"))).toBe(false);
    });
  });

  it("cas 11 : Y dans un lot terminé ⇒ rattaché ; lot-001 ne le juge plus, ses décisions restent au journal", () => {
    avecBac({ jugeants: ["a1", "a2"] }, (bac) => {
      const journalAvant = journaux(bac);
      const resultat = rattacher(bac, Y.id, MESURE_A.id, "--ecrire");
      expect(resultat.status, resultat.erreur).toBe(0);
      expect(resultat.sortie).toMatch(/lot-001/);

      const y = JSON.parse(lireStaging(bac, Y.id)) as Item;
      expect(lotJugeEncore(y, { item_version: Y.version })).toBe(false);
      expect(journaux(bac)).toBe(journalAvant);

      commiterTout(bac.racine, "rattachement");
      const promotion = executerOutil("promote.ts", cheminsPromote(bac));
      expect(promotion.status, promotion.erreur).toBe(0);
      expect(promotion.sortie).toMatch(new RegExp(`Renvoyés en attente[^\\n]*: 1\\n  ${Y.id}  \\[lot-001\\]  jugé en version 1, en attente en version 2`));
      expect(promotion.sortie).toMatch(/À promouvoir : 0/);
    });
  });

  it("cas 18 : relancer le même rattachement ⇒ cas 9, rien de plus d'écrit", () => {
    avecBac({}, (bac) => {
      expect(rattacher(bac, Y.id, MESURE_A.id, "--ecrire").status).toBe(0);
      commiterTout(bac.racine, "rattachement");
      const yApres = lireStaging(bac, Y.id);
      const registreApres = readFileSync(registre(bac), "utf8");

      const relance = rattacher(bac, Y.id, MESURE_A.id, "--ecrire");
      expect(relance.status).not.toBe(0);
      expect(relance.erreur).toMatch(/deja_rattache/);
      expect(lireStaging(bac, Y.id)).toBe(yApres);
      expect(readFileSync(registre(bac), "utf8")).toBe(registreApres);
    });
  });

  it("cas 17 : deux items rattachés à la même cible ⇒ promote ne planifie qu'une mesure ; l'ancienne, plus citée, n'est pas promue", () => {
    avecBac({}, (bac) => {
      expect(rattacher(bac, Y.id, MESURE_A.id, "--ecrire").status).toBe(0);
      const y = JSON.parse(lireStaging(bac, Y.id)) as Item;
      bac.ecrireLot(lotDe("lot-002", [X, y]));
      for (const item of [X, y]) {
        for (const annotateur_id of ["a1", "a2"]) {
          bac.journal(annotateur_id).ajouter("lot-002", decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-002" }));
        }
      }
      bac.relireMesure(MESURE_A);
      commiterTout(bac.racine, "lot-002 jugé, mesure A relue");

      const promotion = executerOutil("promote.ts", [...cheminsPromote(bac), "--ecrire"]);
      expect(promotion.status, promotion.erreur).toBe(0);
      expect(promotion.sortie).toMatch(/Mesures à créer : 1\n/);
      expect(readdirSync(join(bac.racine, "data/mesures"))).toEqual([`${MESURE_A.id}.json`]);
      expect(readdirSync(join(bac.racine, "data/items")).sort()).toEqual([`${X.id}.json`, `${Y.id}.json`]);
      // La mesure proposée reste en staging, non supprimée.
      expect(existsSync(join(bac.racine, "staging/mesures", `${MESURE_B.id}.json`))).toBe(true);
    });
  });
});

describe("cas 16 : ordre des écritures, staging d'abord, registre ensuite", () => {
  it("si la réécriture de staging échoue (fichier changé depuis sa lecture), le registre n'a pas d'entrée orpheline", () => {
    const bac = creerBac();
    try {
      bac.ecrireItem(Y);
      bac.ecrireItem({ ...Y, version: Y.version + 5 });
      const trace = { commit: "c".repeat(40), horodatage: "2026-10-16T21:00:00+02:00", date: DATE };
      expect(() =>
        appliquerRattachement(
          { staging: join(bac.racine, "staging"), mesures: join(bac.racine, "validation/mesures") },
          Y,
          rattacherItem(Y, MESURE_A, trace),
          entreeRattachement(Y, MESURE_A, DATE),
        ),
      ).toThrow(ItemStagingModifie);
      expect(existsSync(registre(bac))).toBe(false);
    } finally {
      bac.detruire();
    }
  });
});
