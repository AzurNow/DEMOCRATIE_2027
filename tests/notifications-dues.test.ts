/**
 * File des notifications dues (protocole 0.10, §4 : « Tout ce qui est publié sur un item est
 * notifié, décisions du panel comprises » ; lot contestation-notification, V4) : exactement une
 * ligne par événement, écrite au même --ecrire que l'item ; aucune en simulation ; rejeté et non
 * évaluable compris ; ajout seul, identifiants uniques, ligne interrompue refusée.
 */

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Item } from "../validation/domaine/types.ts";
import { ajouterDues, cheminDues, FileNotificationsIllisible, lireDues, notificationDue } from "../validation/io/notifications-dues.ts";
import { creerBac, lotDe } from "./aides/bac.ts";
import { itemConteste, itemPromu } from "./aides/data.ts";
import { commiterTout, executerOutil, head, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

describe("file dues.jsonl", () => {
  const repertoire = mkdtempSync(join(tmpdir(), "banc-dues-"));
  afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

  it("date la notification par la dernière entrée d'historique de l'item écrit", () => {
    const item = itemConteste(itemPromu());
    const due = notificationDue(item, "contestation");
    const derniere = item.historique?.[item.historique.length - 1] as { date: string; commit: string };
    expect(due).toMatchObject({ item_id: item.id, candidat_id: item.candidat_id, evenement: "contestation", date: derniere.date, commit: derniere.commit });
  });

  it("ajoute en fin de file, refuse un identifiant déjà présent", () => {
    const due = notificationDue(itemPromu(), "creation");
    ajouterDues(repertoire, [due]);
    expect(lireDues(repertoire)).toEqual([due]);
    expect(() => ajouterDues(repertoire, [due])).toThrow(FileNotificationsIllisible);
    expect(lireDues(repertoire)).toHaveLength(1);
  });

  it("une ligne interrompue arrête la lecture", () => {
    appendFileSync(cheminDues(repertoire), '{"id":', "utf8");
    expect(() => lireDues(repertoire)).toThrow(/interrompue/);
  });
});

describe("une ligne due par événement, au même --ecrire", () => {
  const bac = creerBac();
  const verifie = itemP({ id: "01JBANCESSA1000000000TEM81", candidat_id: "demo-81" });
  const rejete = itemP({ id: "01JBANCESSA1000000000TEM82", candidat_id: "demo-82" });
  for (const item of [verifie, rejete]) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
    bac.relireMesure(mesure({ id: item.mesure_id, version: 1 }));
  }
  bac.ecrireLot(lotDe("lot-081", [verifie, rejete]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-081", decision({ annotateur_id, item: verifie, decision: "accepter", lot_id: "lot-081" }));
    bac.journal(annotateur_id).ajouter("lot-081", decision({ annotateur_id, item: rejete, decision: "rejeter", lot_id: "lot-081" }));
  }
  initialiserDepot(bac.racine);
  const notifications = join(bac.racine, "validation/notifications");
  const racine = [`--racine=${bac.racine}`, `--data=${join(bac.racine, "data/items")}`];
  const promote = [
    ...racine,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
  ];

  executerOutil("promote.ts", promote);
  const apresSimulation = lireDues(notifications);
  const commitPromotion = head(bac.racine);
  const promotion = executerOutil("promote.ts", [...promote, "--ecrire"]);
  const apresPromotion = lireDues(notifications);
  commiterTout(bac.racine, "promotion");

  writeFileSync(join(bac.racine, "contestation.txt"), "Contestation.\n", "utf8");
  writeFileSync(join(bac.racine, "motivation.txt"), "Motivation.\n", "utf8");
  commiterTout(bac.racine, "fichiers");
  const contestation = [...racine, `--item=${verifie.id}`, `--texte-fichier=${join(bac.racine, "contestation.txt")}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=campagne"];
  executerOutil("contester.ts", contestation);
  const apresSimulationContestation = lireDues(notifications);
  executerOutil("contester.ts", [...contestation, "--ecrire"]);
  const apresContestation = lireDues(notifications);
  commiterTout(bac.racine, "contestation");

  const publie = lireItem(join(bac.racine, "data/items", `${verifie.id}.json`));
  const contestation_id = (publie.contestations?.[0] as { id: string }).id;
  const panel = executerOutil("panel.ts", [
    ...racine,
    `--item=${verifie.id}`,
    `--contestation=${contestation_id}`,
    "--decision=maintien",
    "--version-jugee=1",
    `--motivation-fichier=${join(bac.racine, "motivation.txt")}`,
    "--arbitre-seul",
    "--ecrire",
  ]);
  const apresPanel = lireDues(notifications);
  afterAll(() => bac.detruire());

  it("la simulation n'écrit aucune ligne", () => {
    expect(apresSimulation).toEqual([]);
    expect(apresSimulationContestation).toHaveLength(2);
  });

  it("promote : une ligne « creation » par item écrit, rejeté compris, datée du commit inscrit dans l'item", () => {
    expect(promotion.status, promotion.erreur).toBe(0);
    expect(apresPromotion.map((due) => [due.item_id, due.evenement]).sort()).toEqual([
      [verifie.id, "creation"],
      [rejete.id, "creation"],
    ]);
    expect(apresPromotion.every((due) => due.commit === commitPromotion)).toBe(true);
    // Modifié ouvertement (lot mesures-validees, D38) : les mesures citées entrent dans data/mesures/ avec les items.
    expect(promotion.sortie).toMatch(/git add data\/items data\/mesures validation\/notifications\/dues\.jsonl/);
  });

  it("contester : exactement une ligne « contestation »", () => {
    expect(apresContestation.slice(2).map((due) => due.evenement)).toEqual(["contestation"]);
  });

  // D72 (12) : la notification d'une délibération sans majorité ne change rien à une décision.
  it("panel, décision à la majorité : exactement une ligne « decision_panel », comportement inchangé", () => {
    expect(panel.status, panel.erreur).toBe(0);
    expect(apresPanel.slice(3).map((due) => [due.item_id, due.evenement])).toEqual([[verifie.id, "decision_panel"]]);
  });
});

/**
 * Revue du 2026-10-12, constat 8 : chaque commande écrivait l'item dans `data/`, puis ajoutait sa
 * notification. Une file illisible entre les deux laissait un item publié sans notification, et la
 * relance ne la réparait pas (l'item était déjà dans `data/`, ou déjà dans son nouvel état). La file
 * est désormais lue et la notification préparée avant toute écriture dans `data/`.
 */
describe("une file des notifications illisible arrête la commande avant toute écriture dans data/", () => {
  const bac = creerBac();
  const item = itemP({ id: "01JBANCESSA1000000000TEM83", candidat_id: "demo-83" });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.relireMesure(mesure({ id: item.mesure_id, version: 1 }));
  bac.ecrireLot(lotDe("lot-083", [item]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-083", decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-083" }));
  }
  writeFileSync(join(bac.racine, "contestation.txt"), "Contestation.\n", "utf8");
  writeFileSync(join(bac.racine, "motivation.txt"), "Motivation.\n", "utf8");
  initialiserDepot(bac.racine);
  const notifications = join(bac.racine, "validation/notifications");
  const publie = join(bac.racine, "data/items", `${item.id}.json`);
  const racine = [`--racine=${bac.racine}`, `--data=${join(bac.racine, "data/items")}`];
  const promote = [
    ...racine,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
    "--ecrire",
  ];
  const contester = [...racine, `--item=${item.id}`, `--texte-fichier=${join(bac.racine, "contestation.txt")}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=campagne", "--ecrire"];

  /** Une dernière ligne interrompue, commitée : le garde-fou de l'arbre propre ne peut pas refuser à sa place. */
  function corrompre(): string {
    const valide = existsSync(cheminDues(notifications)) ? readFileSync(cheminDues(notifications), "utf8") : "";
    mkdirSync(notifications, { recursive: true });
    appendFileSync(cheminDues(notifications), '{"id":', "utf8");
    commiterTout(bac.racine, "file corrompue");
    return valide;
  }
  function restaurer(valide: string): void {
    writeFileSync(cheminDues(notifications), valide, "utf8");
    commiterTout(bac.racine, "file restaurée");
  }

  let valide = corrompre();
  const promotionRefusee = executerOutil("promote.ts", promote);
  const publieApresRefus = existsSync(publie);
  restaurer(valide);
  const promotion = executerOutil("promote.ts", promote);
  commiterTout(bac.racine, "promotion");

  const avantContestation = readFileSync(publie, "utf8");
  valide = corrompre();
  const contestationRefusee = executerOutil("contester.ts", contester);
  const apresContestationRefusee = readFileSync(publie, "utf8");
  restaurer(valide);
  const contestation = executerOutil("contester.ts", contester);
  commiterTout(bac.racine, "contestation");

  const avantPanel = readFileSync(publie, "utf8");
  const contestation_id = (lireItem(publie).contestations?.[0] as { id: string } | undefined)?.id ?? "contestation absente";
  corrompre();
  const panelRefuse = executerOutil("panel.ts", [
    ...racine,
    `--item=${item.id}`,
    `--contestation=${contestation_id}`,
    "--decision=maintien",
    "--version-jugee=1",
    `--motivation-fichier=${join(bac.racine, "motivation.txt")}`,
    "--arbitre-seul",
    "--ecrire",
  ]);
  const apresPanelRefuse = readFileSync(publie, "utf8");
  afterAll(() => bac.detruire());

  it("promote : refus nommé, aucun item créé ; la relance sur une file saine promeut", () => {
    expect(promotionRefusee.status).not.toBe(0);
    expect(promotionRefusee.erreur).toContain("File des notifications illisible");
    expect(publieApresRefus).toBe(false);
    expect(promotion.status, promotion.erreur).toBe(0);
    expect(existsSync(publie)).toBe(true);
  });

  it("contester : refus nommé, l'item publié est inchangé", () => {
    expect(contestationRefusee.status).not.toBe(0);
    expect(contestationRefusee.erreur).toContain("File des notifications illisible");
    expect(apresContestationRefusee).toBe(avantContestation);
    expect(contestation.status, contestation.erreur).toBe(0);
  });

  it("panel : refus nommé, l'item publié est inchangé", () => {
    expect(contestation_id).not.toBe("contestation absente");
    expect(panelRefuse.status).not.toBe(0);
    expect(panelRefuse.erreur).toContain("File des notifications illisible");
    expect(apresPanelRefuse).toBe(avantPanel);
  });
});

function lireItem(chemin: string): Item {
  return JSON.parse(readFileSync(chemin, "utf8")) as Item;
}
