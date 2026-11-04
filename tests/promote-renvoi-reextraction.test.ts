/**
 * `pnpm promote` nomme les sources renvoyées à la réextraction (§4, protocole 0.24, D59 (9)), sur la
 * simulation : deux « rejeter » sous le motif « texte extrait erroné » renvoient la source de l'item,
 * et, depuis le protocole 0.27 (conformité 2026-11-03 n° 1), deux « rejeter » dont un seul porte le
 * motif la renvoient aussi. Rien n'est écrit.
 */
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { EntreeDecision, Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, resceller, type Bac } from "./aides/bac.ts";
import { decision, itemP, mesure, source } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");

function poserItem(bac: Bac, suffixe: string, sha256: string): Item {
  const base = itemP();
  const item = itemP({
    id: `01JBANCESSA1000000000TEM${suffixe}`,
    candidat_id: `demo-${suffixe}`,
    mesure_id: `01JBANCESSA90000000MESVR${suffixe}`,
    assertion: { ...(base.assertion as NonNullable<Item["assertion"]>), source: source({ sha256 }) },
  });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.relireMesure(mesure({ id: item.mesure_id, version: 1 }));
  return item;
}

function rejet(annotateur_id: string, item: Item, lot_id: string, motif: boolean): EntreeDecision {
  const entree = decision({ annotateur_id, item, decision: "rejeter", lot_id });
  if (!motif) return entree;
  return resceller({ ...entree, motif_rejet: "texte_extrait_errone" }) as EntreeDecision;
}

function simuler(bac: Bac) {
  const resultat = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(RACINE, "outils/promote.ts"),
      `--staging=${join(bac.racine, "staging")}`,
      `--lots=${join(bac.racine, "validation/lots")}`,
      `--decisions=${join(bac.racine, "validation/decisions")}`,
      `--mesures=${join(bac.racine, "validation/mesures")}`,
      `--data=${join(bac.racine, "data/items")}`,
    ],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

describe("pnpm promote : renvoi à la réextraction", () => {
  const bac = creerBac();
  const renvoye = poserItem(bac, "91", "9".repeat(64));
  const discordant = poserItem(bac, "92", "8".repeat(64));
  bac.ecrireLot(lotDe("lot-009", [renvoye, discordant]));
  bac.journal("a1").ajouter("lot-009", rejet("a1", renvoye, "lot-009", true));
  bac.journal("a2").ajouter("lot-009", rejet("a2", renvoye, "lot-009", true));
  bac.journal("a1").ajouter("lot-009", rejet("a1", discordant, "lot-009", true));
  bac.journal("a2").ajouter("lot-009", rejet("a2", discordant, "lot-009", false));
  const resultat = simuler(bac);
  afterAll(() => bac.detruire());

  it("nomme la source renvoyée, son texte et l'item rejeté sous le motif", () => {
    expect(resultat.erreur).toBe("");
    expect(resultat.sortie).toMatch(new RegExp(`${"9".repeat(64)}\\s+texte ${"2".repeat(64)}.*items : ${renvoye.id}`));
  });

  it("renvoie aussi la source du rejet dont un seul « rejeter » porte le motif (§4, protocole 0.27)", () => {
    expect(resultat.sortie).toContain("Sources renvoyées à la réextraction (motif « texte extrait erroné ») : 2");
    expect(resultat.sortie).toMatch(new RegExp(`${"8".repeat(64)}\\s+texte ${"2".repeat(64)}.*items : ${discordant.id}`));
  });

  it("les deux items restent promus « rejeté » : le motif ne change pas le sort", () => {
    expect(resultat.sortie).toMatch(new RegExp(`${renvoye.id}\\s+rejete`));
    expect(resultat.sortie).toMatch(new RegExp(`${discordant.id}\\s+rejete`));
  });
});
