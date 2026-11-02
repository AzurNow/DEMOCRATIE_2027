/**
 * `pnpm promote` applique le §4 « Contrat des artefacts » du protocole 0.25 (D60 (9b)) dans un dépôt
 * Git jetable : un item X rejeté par deux « rejeter » sous le motif « texte extrait erroné » renvoie
 * son texte ; Y, vérifié sur ce même texte et non publié, n'est pas promu, et `--ecrire` le renvoie
 * en attente en `staging/` (version + 1, journal intact) ; Z, publié sur ce texte, n'est pas touché
 * et est listé à contester par l'auteur ; W, sur un autre texte du même document, est promu.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { EntreeDecision, Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, resceller, type Bac } from "./aides/bac.ts";
import { commiterTout, executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure, source } from "./aides/fabriques.ts";

const TEXTE_FAUX = "2".repeat(64);
const AUTRE_TEXTE = "3".repeat(64);

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

function itemSur(suffixe: string, texte_sha256: string): Item {
  const base = itemP().assertion as NonNullable<Item["assertion"]>;
  return itemP({
    id: `01JBANCESSA1000000000TEM${suffixe}`,
    candidat_id: `demo-${suffixe.toLowerCase()}`,
    assertion: { ...base, source: source({ texte_sha256 }) },
  });
}

function juger(bac: Bac, lot_id: string, item: Item, choix: "accepter" | "rejeter", motif = false): void {
  for (const annotateur_id of ["a1", "a2"]) {
    const entree = decision({ annotateur_id, item, decision: choix, lot_id });
    const scellee = motif ? (resceller({ ...entree, motif_rejet: "texte_extrait_errone" }) as EntreeDecision) : entree;
    bac.journal(annotateur_id).ajouter(lot_id, scellee);
  }
}

function journaux(bac: Bac): string {
  const repertoire = join(bac.racine, "validation/decisions");
  return readdirSync(repertoire, { recursive: true })
    .map(String)
    .filter((nom) => nom.endsWith(".jsonl"))
    .sort()
    .map((nom) => readFileSync(join(repertoire, nom), "utf8"))
    .join("\n");
}

function lireJson(chemin: string): Item {
  return JSON.parse(readFileSync(chemin, "utf8")) as Item;
}

const Z = itemSur("Z1", TEXTE_FAUX);
const X = itemSur("X1", TEXTE_FAUX);
const Y = itemSur("Y1", TEXTE_FAUX);
const W = itemSur("W1", AUTRE_TEXTE);

/** Z publié par un premier lot ; puis X, Y, W jugés par un second, X rejeté sous le motif. */
function preparer(): Bac {
  const bac = creerBac();
  bac.ecrireMesure(mesure());
  bac.relireMesure(mesure());
  bac.ecrireItem(Z);
  bac.ecrireLot(lotDe("lot-001", [Z]));
  juger(bac, "lot-001", Z, "accepter");
  initialiserDepot(bac.racine);
  const premiere = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  if (premiere.status !== 0) throw new Error(`Première promotion en échec :\n${premiere.erreur}`);
  for (const item of [X, Y, W]) bac.ecrireItem(item);
  bac.ecrireLot(lotDe("lot-002", [X, Y, W]));
  juger(bac, "lot-002", X, "rejeter", true);
  juger(bac, "lot-002", Y, "accepter");
  juger(bac, "lot-002", W, "accepter");
  commiterTout(bac.racine, "lot-002 jugé");
  return bac;
}

describe("pnpm promote : texte extrait erroné, les autres items du même texte", () => {
  const bac = preparer();
  const zPublie = readFileSync(join(bac.racine, "data/items", `${Z.id}.json`), "utf8");
  const journauxAvant = journaux(bac);
  const simulation = executerOutil("promote.ts", chemins(bac));
  const ecriture = executerOutil("promote.ts", [...chemins(bac), "--ecrire"]);
  commiterTout(bac.racine, "promotion et retour en attente");
  const relance = executerOutil("promote.ts", chemins(bac));
  afterAll(() => bac.detruire());

  it("simulation : Y n'est pas à promouvoir, il est annoncé de retour en attente ; W l'est", () => {
    expect(simulation.erreur).toBe("");
    expect(simulation.status).toBe(0);
    const aPromouvoir = simulation.sortie.split("\nVers l'arbitrage")[0] as string;
    expect(aPromouvoir).toMatch(new RegExp(`${W.id}\\s+verifie`));
    expect(aPromouvoir).toMatch(new RegExp(`${X.id}\\s+rejete`));
    expect(aPromouvoir).not.toContain(Y.id);
    expect(simulation.sortie).toMatch(/De retour en attente \(texte extrait erroné\), réécrits dans staging\/ par --ecrire : 1/);
    expect(simulation.sortie).toMatch(new RegExp(`${Y.id}\\s+\\[lot-002\\]`));
  });

  it("simulation : Z, publié sur le même texte, est listé à contester par l'auteur", () => {
    expect(simulation.sortie).toMatch(/Publiés sur un texte extrait erroné, à contester par l'auteur.* : 1/);
    expect(simulation.sortie).toMatch(new RegExp(`${Z.id}\\s+verifie\\s+contestation aucune`));
  });

  it("--ecrire : Y est réécrit en staging/, en attente, version 2, empreinte et source inchangées ; il n'entre pas dans data/", () => {
    expect(ecriture.erreur).toBe("");
    expect(ecriture.status).toBe(0);
    const y = lireJson(join(bac.racine, "staging/items", `${Y.id}.json`));
    expect(y.statut_validation).toBe("en_attente");
    expect(y.version).toBe(2);
    expect(y.empreinte).toBe(Y.empreinte);
    expect(y.assertion?.source).toEqual(Y.assertion?.source);
    expect(y.historique?.at(-1)).toMatchObject({
      changement: `retour en attente, texte extrait erroné : document ${"1".repeat(64)} texte ${TEXTE_FAUX}`,
      version_resultante: 2,
    });
    expect(() => readFileSync(join(bac.racine, "data/items", `${Y.id}.json`))).toThrow();
    expect(ecriture.sortie).toContain("staging/items");
  });

  it("--ecrire : X (rejeté) et W (autre texte) sont promus ; Z publié est laissé tel quel", () => {
    expect(lireJson(join(bac.racine, "data/items", `${X.id}.json`)).statut_validation).toBe("rejete");
    expect(lireJson(join(bac.racine, "data/items", `${W.id}.json`)).statut_validation).toBe("verifie");
    expect(readFileSync(join(bac.racine, "data/items", `${Z.id}.json`), "utf8")).toBe(zPublie);
  });

  it("les décisions antérieures restent au journal, octet pour octet", () => {
    expect(journaux(bac)).toBe(journauxAvant);
  });

  it("relance : lot-002 ne juge plus Y, qui n'est pas renvoyé une seconde fois ; Z reste listé à contester", () => {
    expect(relance.status).toBe(0);
    expect(relance.sortie).toMatch(new RegExp(`Renvoyés en attente, que leur lot ne juge plus : 1\\n\\s+${Y.id}\\s+\\[lot-002\\]`));
    expect(relance.sortie).not.toMatch(/De retour en attente \(texte extrait erroné\)/);
    expect(relance.sortie).toMatch(new RegExp(`${Z.id}\\s+verifie\\s+contestation aucune`));
  });
});
