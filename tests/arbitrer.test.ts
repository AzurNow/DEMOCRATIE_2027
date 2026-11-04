/**
 * `pnpm arbitrer` puis `pnpm promote`, dans un dépôt Git jetable (lot contestation-notification,
 * V2) : la file est recalculée depuis les lots et les journaux ; une décision inapplicable n'est
 * pas écrite ; la simulation n'écrit rien ; `--ecrire` ajoute au registre ; la promotion suivante
 * écrit l'item avec son bloc arbitrage, et une relance est sans effet ; une décision prise sur une
 * version dépassée laisse l'item en arbitrage, motif affiché.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { valider } from "../outils/schemas/valider.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { commiterTout, executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
  ];
}

function preparer(): { bac: Bac; item: Item; motivation: string } {
  const bac = creerBac();
  const item = itemP({ id: "01JBANCESSA1000000000TEM61", candidat_id: "demo-61" });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.relireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.ecrireLot(lotDe("lot-061", [item]));
  bac.journal("a1").ajouter("lot-061", decision({ annotateur_id: "a1", item, decision: "accepter", lot_id: "lot-061" }));
  bac.journal("a2").ajouter("lot-061", decision({ annotateur_id: "a2", item, decision: "rejeter", lot_id: "lot-061" }));
  const motivation = join(bac.racine, "motivation.txt");
  writeFileSync(motivation, "La citation figure dans la source archivée.\n", "utf8");
  initialiserDepot(bac.racine);
  return { bac, item, motivation };
}

const registre = (bac: Bac) => join(bac.racine, "validation/arbitrage/decisions.json");
const dansData = (bac: Bac, item: Item) => join(bac.racine, "data/items", `${item.id}.json`);

describe("pnpm arbitrer, du désaccord à la promotion", () => {
  const { bac, item, motivation } = preparer();
  const decisionValide = [`--item=${item.id}`, "--issue=verifie", "--retenu=original", "--arbitre=auteur", `--motivation-fichier=${motivation}`];

  const liste = executerOutil("arbitrer.ts", chemins(bac));
  const inexistant = executerOutil("arbitrer.ts", [...chemins(bac), ...decisionValide.slice(0, 2), "--retenu=correction:a9", "--arbitre=auteur", `--motivation-fichier=${motivation}`, "--ecrire"]);
  const simulation = executerOutil("arbitrer.ts", [...chemins(bac), ...decisionValide]);
  const registreApresSimulation = existsSync(registre(bac));
  const ecriture = executerOutil("arbitrer.ts", [...chemins(bac), ...decisionValide, "--ecrire"]);
  commiterTout(bac.racine, "arbitrage");
  const listeApres = executerOutil("arbitrer.ts", chemins(bac));
  const promotion = executerOutil("promote.ts", [...chemins(bac), `--data=${join(bac.racine, "data/items")}`, "--ecrire"]);
  const promu = existsSync(dansData(bac, item)) ? readFileSync(dansData(bac, item), "utf8") : "";
  commiterTout(bac.racine, "promotion");
  const relance = executerOutil("promote.ts", [...chemins(bac), `--data=${join(bac.racine, "data/items")}`, "--ecrire"]);
  afterAll(() => bac.detruire());

  it("liste l'item en arbitrage, recalculé depuis les journaux, avec son instance et son ancienneté", () => {
    expect(liste.status, liste.erreur).toBe(0);
    expect(liste.sortie).toMatch(/Items en arbitrage : 1/);
    expect(liste.sortie).toMatch(new RegExp(`${item.id}\\s+desaccord\\s+\\[lot-061\\]\\s+tranché par : auteur\\s+\\d+ jour`));
  });

  it("refuse un contenu retenu qu'aucun annotateur n'a proposé, sans rien écrire", () => {
    expect(inexistant.status).toBe(1);
    expect(inexistant.erreur).toMatch(/aucune décision de l'annotateur a9/);
  });

  it("simule par défaut : la décision est affichée, rien n'est écrit", () => {
    expect(simulation.status, simulation.erreur).toBe(0);
    expect(simulation.sortie).toMatch(/Simulation : rien n'a été écrit/);
    expect(registreApresSimulation).toBe(false);
  });

  it("--ecrire ajoute une décision conforme au registre, et imprime la commande Git", () => {
    expect(ecriture.status, ecriture.erreur).toBe(0);
    const entrees = JSON.parse(readFileSync(registre(bac), "utf8")) as unknown[];
    expect(entrees).toHaveLength(1);
    expect(() => valider("decision-arbitrage", entrees[0], "registre")).not.toThrow();
    expect(entrees[0]).toMatchObject({ item_id: item.id, motif: "desaccord", motivation: "La citation figure dans la source archivée." });
    expect(ecriture.sortie).toMatch(/git add validation\/arbitrage\/decisions\.json/);
    expect(listeApres.sortie).toMatch(/Items en arbitrage : 0/);
    expect(listeApres.sortie).toMatch(/promus par la prochaine exécution de pnpm promote : 1/);
  });

  it("pnpm promote écrit l'item vérifié avec son bloc arbitrage ; la relance est sans effet", () => {
    expect(promotion.status, promotion.erreur).toBe(0);
    const ecrit = JSON.parse(promu) as Item;
    expect(ecrit.statut_validation).toBe("verifie");
    expect(ecrit.arbitrage?.motif).toBe("desaccord");
    expect(relance.status, relance.erreur).toBe(0);
    expect(relance.sortie).toMatch(/Déjà dans data\/, non réécrits : 1/);
    expect(readFileSync(dansData(bac, item), "utf8")).toBe(promu);
  });
});

/**
 * Protocole 0.27, §4 (conformité 2026-11-03 n° 1) : « quand le rejet est tranché par l'arbitre, sa
 * décision porte le motif comme celle d'un annotateur ». Le motif est recopié dans le bloc arbitrage
 * de l'item promu, et `pnpm promote` renvoie la source à la réextraction.
 */
describe("rejet arbitré sous le motif « texte extrait erroné »", () => {
  const { bac, item, motivation } = preparer();
  const rejet = [`--item=${item.id}`, "--issue=rejete", "--arbitre=auteur", `--motivation-fichier=${motivation}`];
  const horsRejet = executerOutil("arbitrer.ts", [...chemins(bac), `--item=${item.id}`, "--issue=non_evaluable", "--arbitre=auteur", "--motif-rejet=texte_extrait_errone", `--motivation-fichier=${motivation}`, "--ecrire"]);
  const inconnu = executerOutil("arbitrer.ts", [...chemins(bac), ...rejet, "--motif-rejet=coquille", "--ecrire"]);
  const registreApresRefus = existsSync(registre(bac));
  const ecriture = executerOutil("arbitrer.ts", [...chemins(bac), ...rejet, "--motif-rejet=texte_extrait_errone", "--ecrire"]);
  commiterTout(bac.racine, "arbitrage");
  const promotion = executerOutil("promote.ts", [...chemins(bac), `--data=${join(bac.racine, "data/items")}`, "--ecrire"]);
  const promu = existsSync(dansData(bac, item)) ? readFileSync(dansData(bac, item), "utf8") : "";
  afterAll(() => bac.detruire());

  it("refuse le motif sur une autre issue que « rejete », et un motif hors énumération, sans rien écrire", () => {
    expect(horsRejet.status).toBe(1);
    expect(horsRejet.erreur).toMatch(/motif de rejet ne se porte que sur l'issue « rejete »/);
    expect(inconnu.status).toBe(1);
    expect(inconnu.erreur).toMatch(/--motif-rejet vaut « texte_extrait_errone »/);
    expect(registreApresRefus).toBe(false);
  });

  it("--ecrire inscrit le motif dans la décision, conforme au schéma", () => {
    expect(ecriture.status, ecriture.erreur).toBe(0);
    const entrees = JSON.parse(readFileSync(registre(bac), "utf8")) as unknown[];
    expect(entrees).toHaveLength(1);
    expect(() => valider("decision-arbitrage", entrees[0], "registre")).not.toThrow();
    expect(entrees[0]).toMatchObject({ issue: "rejete", motif_rejet: "texte_extrait_errone" });
  });

  it("pnpm promote écrit l'item rejeté avec le motif dans son bloc arbitrage, et renvoie sa source", () => {
    expect(promotion.status, promotion.erreur).toBe(0);
    const ecrit = JSON.parse(promu) as Item;
    expect(ecrit.statut_validation).toBe("rejete");
    expect(ecrit.arbitrage?.motif_rejet).toBe("texte_extrait_errone");
    expect(promotion.sortie).toContain("Sources renvoyées à la réextraction (motif « texte extrait erroné ») : 1");
    expect(promotion.sortie).toMatch(new RegExp(`items : ${item.id}`));
  });
});

describe("décision prise sur une version dépassée", () => {
  const { bac, item, motivation } = preparer();
  executerOutil("arbitrer.ts", [...chemins(bac), `--item=${item.id}`, "--issue=verifie", "--retenu=original", "--arbitre=auteur", `--motivation-fichier=${motivation}`, "--ecrire"]);
  // Le pipeline republie l'item en staging, version 2 : les annotateurs ont jugé la 1, l'arbitre aussi.
  bac.ecrireItem({ ...item, version: 2 });
  commiterTout(bac.racine, "réextraction");
  const promotion = executerOutil("promote.ts", [...chemins(bac), `--data=${join(bac.racine, "data/items")}`]);
  afterAll(() => bac.detruire());

  it("l'item reste en arbitrage, et le rapport de promote dit pourquoi", () => {
    expect(promotion.status, promotion.erreur).toBe(0);
    expect(promotion.sortie).toMatch(/Vers l'arbitrage : 1/);
    expect(promotion.sortie).toMatch(/inapplicable/);
    expect(promotion.sortie).toMatch(/dépassée/);
  });
});

describe("constat 20 (revue du 2026-10-17), 32 (revue du 2026-10-12) : un manifeste de lot au JSON illisible", () => {
  it("refuse par un message d'une ligne, sans pile, rien écrit (D55 (3) : lots-fichier.ts a désormais une frontière nommée, comme staging.ts depuis le constat 26)", () => {
    // Avant D55 (3), `lireLots` faisait `JSON.parse(...) as Lot` : un JSON illisible levait un
    // SyntaxError nu, une classe de bogue pour `outils/refus-attendu.ts`, remonté avec sa pile.
    // `jsonDe` lève désormais `JsonIllisible`, un refus nommé : `arbitrer.ts` l'affiche en une
    // ligne et sort au code 1, sans rien écrire, exactement comme les autres refus attendus.
    const { bac } = preparer();
    writeFileSync(join(bac.racine, "validation/lots", "lot-061.json"), "{ pas du json", "utf8");
    commiterTout(bac.racine, "manifeste de lot cassé");
    const resultat = executerOutil("arbitrer.ts", chemins(bac));
    expect(resultat.status).not.toBe(0);
    expect(resultat.erreur).toContain("JSON illisible");
    expect(resultat.erreur).not.toContain("SyntaxError");
    expect(resultat.erreur).not.toMatch(/\n\s+at /);
    expect(existsSync(registre(bac))).toBe(false);
    bac.detruire();
  });
});
