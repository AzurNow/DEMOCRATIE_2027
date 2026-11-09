/**
 * Revérification des items d'absence d'un run, la logique sans le disque (§4, protocole 0.24,
 * D59 (11) ; annexe F, case 2) : `validation/domaine/reverification-absence.ts`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FichesSourceAbsentes, lireFichesSource } from "../validation/io/fiches-source.ts";
import { valider } from "../outils/schemas/valider.ts";
import type { SourceCollectee } from "../validation/domaine/absence.ts";
import { verifierAjoutSeul } from "../validation/domaine/ajout-seul.ts";
import {
  ConfirmationRefusee,
  confirmationsNouvelles,
  EpinglagesDivergents,
  etatsDesItems,
  fichierApres,
  FichierReverificationDivergent,
  ItemDuTirageIntrouvable,
  itemAvecReverification,
  itemsAbsenceDuTirage,
  ReverificationHorsFichier,
  reverificationsAEcrire,
  type ConfirmationAbsence,
  type DemandeConfirmation,
  type EntreesEtat,
  type FichierReverification,
  type ReferenceItem,
} from "../validation/domaine/reverification-absence.ts";
import type { Item } from "../validation/domaine/types.ts";
import { itemA, itemP } from "./aides/fabriques.ts";

const RUN_ID = "W5ZT1TXQV92JTWYQPS5WCF9YAN";
const ITEM_A = itemA({ id: "01JBANCESSA1000000001TEM02", candidat_id: "demo-alpha" });
const ITEM_B = itemA({ id: "01JBANCESSA1000000001TEM05", candidat_id: "demo-beta" });
const ITEM_P = itemP({ id: "01JBANCESSA1000000001TEM01" });
const NOUVELLE = "5".repeat(64);
const ANCIENNE = "6".repeat(64);

function reference(item: Item): ReferenceItem {
  return { item_id: item.id, item_version: item.version, item_empreinte: item.empreinte };
}

function entree(...items: readonly Item[]) {
  return { items_au_gel: items.map((item) => ({ reference: reference(item) })) };
}

function table(...items: readonly Item[]): ReadonlyMap<string, Item> {
  return new Map(items.map((item) => [item.id, item]));
}

/** demo-beta a une source T1 collectée après la date d'examen de son corpus ; demo-alpha n'a rien de neuf. */
const SOURCES: readonly SourceCollectee[] = [
  { candidat_id: "demo-beta", tier: "T1", sha256: NOUVELLE, date_collecte: "2026-11-15T10:00:00+01:00" },
  { candidat_id: "demo-alpha", tier: "T1", sha256: ANCIENNE, date_collecte: "2026-09-01T10:00:00+02:00" },
  { candidat_id: "demo-alpha", tier: "T2", sha256: "7".repeat(64), date_collecte: "2026-11-20T10:00:00+01:00" },
];

function entrees(surcharges: Partial<EntreesEtat> = {}): EntreesEtat {
  const items = table(ITEM_A, ITEM_B);
  return { run_id: RUN_ID, references: [reference(ITEM_A), reference(ITEM_B)], items, sources: SOURCES, existant: null, ...surcharges };
}

function demande(surcharges: Partial<DemandeConfirmation> = {}): DemandeConfirmation {
  return { confirmer: new Set(), sans_nouvelle_source: false, annotateur: "a1", date: "2026-12-01T09:30:00+01:00", ...surcharges };
}

function confirmation(item: Item, nouvelles: readonly string[] = []): ConfirmationAbsence {
  return {
    date: "2026-12-01T09:30:00+01:00",
    resultat: "absence_confirmee",
    confirme_par: "a1",
    item_version: item.version,
    item_empreinte: item.empreinte,
    nouvelles_sources_t1: nouvelles,
  };
}

const TRACE = { run_id: RUN_ID, commit: "c".repeat(40) };

describe("items A du tirage", () => {
  it("garde les seuls items A, tout rôle, un par item, triés par identifiant", () => {
    const tirage = [entree(ITEM_P), entree(ITEM_B, ITEM_A), entree(ITEM_A)];
    expect(itemsAbsenceDuTirage(tirage, table(ITEM_P, ITEM_A, ITEM_B))).toEqual([reference(ITEM_A), reference(ITEM_B)]);
  });

  it("cas limite 1 : aucun item A au tirage, liste vide", () => {
    expect(itemsAbsenceDuTirage([entree(ITEM_P)], table(ITEM_P))).toEqual([]);
  });

  it("un item du tirage absent de data/items : refus nommé, jamais ignoré", () => {
    expect(() => itemsAbsenceDuTirage([entree(ITEM_A)], table())).toThrow(ItemDuTirageIntrouvable);
  });

  it("un item épinglé sur deux versions dans le même tirage : refus", () => {
    const autre = { items_au_gel: [{ reference: { ...reference(ITEM_A), item_version: 2 } }] };
    expect(() => itemsAbsenceDuTirage([entree(ITEM_A), autre], table(ITEM_A))).toThrow(EpinglagesDivergents);
  });
});

describe("état des items et confirmation", () => {
  it("cas limite 2 : items sans nouvelle source T1, confirmés d'un geste ; la source ancienne et la source T2 ne comptent pas", () => {
    const etats = etatsDesItems(entrees());
    expect(etats.map((etat) => [etat.reference.item_id, etat.etat])).toEqual([
      [ITEM_A.id, "a_confirmer"],
      [ITEM_B.id, "a_confirmer"],
    ]);
    const nouvelles = confirmationsNouvelles(etats, demande({ sans_nouvelle_source: true }));
    expect([...nouvelles.keys()]).toEqual([ITEM_A.id]);
    expect(nouvelles.get(ITEM_A.id)).toEqual(confirmation(ITEM_A));
  });

  it("cas limite 3 : un item avec une nouvelle source T1 n'est pas confirmé par le geste groupé, ni sans saisie", () => {
    const etats = etatsDesItems(entrees());
    expect(etats[1]).toMatchObject({ etat: "a_confirmer", nouvelles_sources: [{ sha256: NOUVELLE }] });
    expect(confirmationsNouvelles(etats, demande()).size).toBe(0);
    expect(confirmationsNouvelles(etats, demande({ sans_nouvelle_source: true })).has(ITEM_B.id)).toBe(false);
    const fichier = fichierApres(RUN_ID, etats, confirmationsNouvelles(etats, demande({ sans_nouvelle_source: true })));
    expect(fichier.items[1]).toEqual({ reference: reference(ITEM_B) });
  });

  it("cas limite 3 : nommé par l'annotateur, il est confirmé, et la confirmation publie la source examinée", () => {
    const etats = etatsDesItems(entrees());
    const nouvelles = confirmationsNouvelles(etats, demande({ confirmer: new Set([ITEM_B.id]) }));
    expect(nouvelles.get(ITEM_B.id)).toEqual(confirmation(ITEM_B, [NOUVELLE]));
  });

  it("un item nommé hors du tirage : toute la saisie est refusée", () => {
    const etats = etatsDesItems(entrees());
    expect(() => confirmationsNouvelles(etats, demande({ confirmer: new Set([ITEM_P.id]) }))).toThrow(ConfirmationRefusee);
  });

  it("cas limite 4 : un item déjà confirmé pour ce run n'en reçoit pas une seconde, même nommé", () => {
    const deja = itemAvecReverification(ITEM_A, confirmation(ITEM_A), TRACE);
    const existant: FichierReverification = { run_id: RUN_ID, items: [{ reference: reference(ITEM_A), confirmation: confirmation(ITEM_A) }, { reference: reference(ITEM_B) }] };
    const etats = etatsDesItems(entrees({ items: table(deja, ITEM_B), existant }));
    expect(etats[0]).toMatchObject({ etat: "confirme" });
    const nouvelles = confirmationsNouvelles(etats, demande({ confirmer: new Set([ITEM_A.id]), sans_nouvelle_source: true }));
    expect(nouvelles.size).toBe(0);
    expect(reverificationsAEcrire(etats, nouvelles).size).toBe(0);
    expect(fichierApres(RUN_ID, etats, nouvelles)).toEqual(existant);
    expect(() => itemAvecReverification(deja, confirmation(ITEM_A), TRACE)).toThrow(/déjà revérifié/);
  });

  it("cas limite 4 : confirmé dans le fichier mais pas encore dans l'item (écriture interrompue), l'item est complété depuis le fichier", () => {
    const existant: FichierReverification = { run_id: RUN_ID, items: [{ reference: reference(ITEM_A), confirmation: confirmation(ITEM_A) }, { reference: reference(ITEM_B) }] };
    const etats = etatsDesItems(entrees({ existant }));
    expect(etats[0]).toMatchObject({ etat: "a_completer" });
    expect(reverificationsAEcrire(etats, new Map()).get(ITEM_A.id)).toEqual(confirmation(ITEM_A));
  });

  it("une revérification de ce run dans l'item, absente du fichier : écrite hors de la commande, refus", () => {
    const deja = itemAvecReverification(ITEM_A, confirmation(ITEM_A), TRACE);
    expect(() => etatsDesItems(entrees({ items: table(deja, ITEM_B) }))).toThrow(ReverificationHorsFichier);
  });

  it("un fichier déjà écrit qui ne porte plus les items du tirage, ou un autre run : refus, jamais d'écrasement", () => {
    const autre: FichierReverification = { run_id: RUN_ID, items: [{ reference: reference(ITEM_A) }] };
    expect(() => etatsDesItems(entrees({ existant: autre }))).toThrow(FichierReverificationDivergent);
    const autreRun: FichierReverification = { run_id: "01JBANCESSA1000000000RXN99", items: [{ reference: reference(ITEM_A) }, { reference: reference(ITEM_B) }] };
    expect(() => etatsDesItems(entrees({ existant: autreRun }))).toThrow(FichierReverificationDivergent);
  });

  it("cas limite 5 : un item modifié depuis le gel (version courante différente de l'épinglée) n'est pas confirmable", () => {
    const modifie = { ...ITEM_A, version: 2 };
    const etats = etatsDesItems(entrees({ items: table(modifie, ITEM_B) }));
    expect(etats[0]).toMatchObject({ etat: "modifie_depuis_le_gel", version_courante: 2 });
    expect(() => confirmationsNouvelles(etats, demande({ confirmer: new Set([ITEM_A.id]) }))).toThrow(ConfirmationRefusee);
    expect(confirmationsNouvelles(etats, demande({ sans_nouvelle_source: true })).has(ITEM_A.id)).toBe(false);
  });

  it("cas limite 5 : un item modifié après sa confirmation garde la confirmation portée sur la version du tirage", () => {
    const confirme = itemAvecReverification(ITEM_A, confirmation(ITEM_A), TRACE);
    const modifie = { ...confirme, version: 2 };
    const existant: FichierReverification = { run_id: RUN_ID, items: [{ reference: reference(ITEM_A), confirmation: confirmation(ITEM_A) }, { reference: reference(ITEM_B) }] };
    const etats = etatsDesItems(entrees({ items: table(modifie, ITEM_B), existant }));
    expect(etats[0]).toMatchObject({ etat: "confirme", confirmation: { item_version: 1 } });
  });
});

describe("fiches des sources collectées", () => {
  it("répertoire absent : refus nommé, jamais lu comme « aucune nouvelle source »", () => {
    const racine = mkdtempSync(join(tmpdir(), "banc-fiches-"));
    try {
      expect(() => lireFichesSource(join(racine, "staging/sources/par-source"))).toThrow(FichesSourceAbsentes);
    } finally {
      rmSync(racine, { recursive: true, force: true });
    }
  });
});

describe("réécriture de l'item", () => {
  it("ajoute une revérification et une entrée d'historique, version et empreinte inchangées ; c'est un ajout seul", () => {
    const apres = itemAvecReverification(ITEM_A, confirmation(ITEM_A), TRACE);
    expect(apres.absence?.reverifications).toEqual([{ run_id: RUN_ID, date: "2026-12-01T09:30:00+01:00", resultat: "absence_confirmee", confirme_par: "a1" }]);
    expect(apres.historique).toHaveLength((ITEM_A.historique ?? []).length + 1);
    expect([apres.version, apres.empreinte]).toEqual([ITEM_A.version, ITEM_A.empreinte]);
    expect(() => verifierAjoutSeul(ITEM_A, apres, { corrections: false })).not.toThrow();
    expect(() => valider("item", apres, "item revérifié")).not.toThrow();
  });

  it("un item qui n'est pas A ne se revérifie pas", () => {
    expect(() => itemAvecReverification(ITEM_P, confirmation(ITEM_P), TRACE)).toThrow(/seul un item A/);
  });

  it("le fichier produit est conforme à son schéma", () => {
    const etats = etatsDesItems(entrees());
    const fichier = fichierApres(RUN_ID, etats, confirmationsNouvelles(etats, demande({ sans_nouvelle_source: true, confirmer: new Set([ITEM_B.id]) })));
    expect(() => valider("reverification-absence", fichier, "fichier produit")).not.toThrow();
  });
});
