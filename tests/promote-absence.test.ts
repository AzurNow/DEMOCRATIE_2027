/**
 * `pnpm promote` et la règle des items A (protocole 0.27, §4, D62 #233 (3) et D67) : un item A
 * dont une proposition de position du candidat sur le corpus examiné n'est pas rattachée à sa
 * mesure, ou sur la mesure duquel le candidat a un item T3 « à confirmer », n'est pas promu. Le
 * refus est nommé avec son motif, le code de sortie est non nul et rien n'est écrit dans `data/`.
 * La règle elle-même est testée dans `tests/absence-promotion.test.ts`.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Item, Source } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemA, itemP, mesure } from "./aides/fabriques.ts";

const MESURE_EXTRAITE = "01JBANCESSA90000000MESVRE8";
const CONFIRME = { couverture_theme_verifiee: true, corpus_complet: true, confirmation_absence: true };

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    `--data=${join(bac.racine, "data/items")}`,
    `--data-mesures=${join(bac.racine, "data/mesures")}`,
    `--notifications=${join(bac.racine, "validation/notifications")}`,
  ];
}

interface Scenario {
  /** Items de staging hors du lot : les propositions et les items T3 du candidat. */
  readonly autres: readonly Item[];
  /** Mesures relues en plus de celle de l'item A. */
  readonly relues: readonly string[];
}

interface Bilan {
  readonly bac: Bac;
  readonly status: number | null;
  readonly sortie: string;
  readonly erreur: string;
}

function promouvoir(scenario: Scenario): Bilan {
  const bac = creerBac();
  const item = itemA();
  bac.ecrireItem(item);
  for (const autre of scenario.autres) bac.ecrireItem(autre);
  bac.ecrireMesure(mesure());
  bac.relireMesure(mesure());
  for (const id of scenario.relues) {
    bac.ecrireMesure(mesure({ id }));
    bac.relireMesure(mesure({ id }));
  }
  bac.ecrireLot(lotDe("lot-071", [item]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter(
      "lot-071",
      decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-071", questions_specifiques: CONFIRME }),
    );
  }
  initialiserDepot(bac.racine);
  return { bac, ...executerOutil("promote.ts", [...chemins(bac), "--ecrire"]) };
}

function itemsEcrits(bac: Bac): readonly string[] {
  const repertoire = join(bac.racine, "data/items");
  return existsSync(repertoire) ? readdirSync(repertoire) : [];
}

/** Une source T3 hors du corpus examiné : un article de presse (`commun.schema.json`, tier selon le type). */
const SOURCE_T3: Source = {
  tier: "T3",
  url: "https://demo.invalid/article-rapporte",
  type_document: "article_presse",
  format: "html",
  sha256: "9".repeat(64),
  archive_url: "https://archive.invalid/article-rapporte",
  date_source: "2026-10-20",
  date_collecte: "2026-10-20T18:30:00+02:00",
  publication: "publique",
};

const PROPOSITION = itemP({ id: "01JBANCESSA1000000001TEM0P", mesure_id: MESURE_EXTRAITE });

describe("une proposition du candidat sur le corpus examiné, non rattachée à sa mesure", () => {
  const bilan = promouvoir({ autres: [PROPOSITION], relues: [] });
  afterAll(() => bilan.bac.detruire());

  it("code non nul, motif et proposition nommés, rien n'est écrit dans data/", () => {
    expect(bilan.status).toBe(1);
    expect(bilan.sortie).toContain(`${itemA().id}  [lot-071]  propositions_non_rattachees : ${PROPOSITION.id}`);
    expect(bilan.erreur).toMatch(/rien n'est écrit/);
    expect(itemsEcrits(bilan.bac)).toEqual([]);
    expect(existsSync(join(bilan.bac.racine, "data/mesures"))).toBe(false);
  });
});

describe("la même proposition, sa mesure relue par l'auteur", () => {
  const bilan = promouvoir({ autres: [PROPOSITION], relues: [MESURE_EXTRAITE] });
  afterAll(() => bilan.bac.detruire());

  it("l'item A est promu", () => {
    expect(bilan.status, bilan.erreur).toBe(0);
    expect(itemsEcrits(bilan.bac)).toEqual([`${itemA().id}.json`]);
  });
});

describe("un item T3 du candidat, à confirmer, sur la mesure de l'item A", () => {
  const t3 = itemP({
    id: "01JBANCESSA1000000001TEM0T",
    statut_validation: "a_confirmer",
    assertion: { ...(itemP().assertion as NonNullable<Item["assertion"]>), source: SOURCE_T3 },
  });
  const bilan = promouvoir({ autres: [t3], relues: [] });
  afterAll(() => bilan.bac.detruire());

  it("code non nul, motif nommé, rien n'est écrit dans data/", () => {
    expect(bilan.status).toBe(1);
    expect(bilan.sortie, bilan.erreur).toContain(`${itemA().id}  [lot-071]  item_t3_sur_la_mesure : ${t3.id}`);
    expect(itemsEcrits(bilan.bac)).toEqual([]);
  });
});
