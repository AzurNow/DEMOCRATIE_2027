/**
 * `pnpm contester` et `pnpm panel`, dans un dépôt Git jetable (protocole 0.10, §4 et annexe E ;
 * lot contestation-notification, V3), et l'état effectif qui en découle : un item promu puis
 * contesté l'est dans `data/`, et c'est là que le kappa, les lots, la promotion et l'écran
 * d'annotation lisent son statut.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contestationPermetLeTirage } from "../pipeline/questions/contestation.ts";
import { diagnostiquerLot } from "../validation/domaine/analyse-lot.ts";
import { sha256 } from "../validation/domaine/empreinte.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerItem } from "../validation/io/data-items.ts";
import { chargerItemsEffectifs } from "../validation/io/items-effectifs.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { chargerStaging } from "../validation/io/staging.ts";
import { ROUTES } from "../validation/serveur/routes.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { itemPromu } from "./aides/data.ts";
import { commiterTout, executerOutil, initialiserDepot } from "./aides/depot.ts";
import { decision, mesure, source } from "./aides/fabriques.ts";

const TEXTE_SOURCE = "Préambule. Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.";

interface Banc {
  readonly bac: Bac;
  readonly item: Item;
  readonly fichier: (nom: string, contenu: string) => string;
  readonly lire: () => Item;
}

function preparer(suffixe: string): Banc {
  const bac = creerBac();
  const texte_sha256 = sha256(TEXTE_SOURCE);
  bac.ecrireTexte(texte_sha256, TEXTE_SOURCE);
  const item = itemPromu({
    id: `01JBANCESSA1000000000TEM${suffixe}`,
    candidat_id: `demo-${suffixe}`,
    assertion: { ...itemPromu().assertion, source: source({ texte_sha256 }) } as NonNullable<Item["assertion"]>,
  });
  bac.ecrireItem({ ...item, statut_validation: "en_attente", validations: [] });
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  creerItem(join(bac.racine, "data/items"), item);
  initialiserDepot(bac.racine);
  return {
    bac,
    item,
    fichier: (nom, contenu) => {
      const chemin = join(bac.racine, nom);
      writeFileSync(chemin, contenu, "utf8");
      commiterTout(bac.racine, nom);
      return chemin;
    },
    lire: () => JSON.parse(readFileSync(join(bac.racine, "data/items", `${item.id}.json`), "utf8")) as Item,
  };
}

const racine = (banc: Banc) => [`--racine=${banc.bac.racine}`, `--data=${join(banc.bac.racine, "data/items")}`];

describe("pnpm contester", () => {
  const banc = preparer("71");
  const texte = banc.fichier("contestation.txt", "La source dit 5 %, pas 5,5 %.\n");
  const long = banc.fichier("long.txt", `${"a".repeat(1001)}\n`);
  const base = [...racine(banc), `--item=${banc.item.id}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=campagne"];
  const absent = executerOutil("contester.ts", [...racine(banc), "--item=01JBANCESSA1000000000TEM99", `--texte-fichier=${texte}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=campagne"]);
  const tropLong = executerOutil("contester.ts", [...base, `--texte-fichier=${long}`, "--ecrire"]);
  const apresTropLong = banc.lire();
  const simulation = executerOutil("contester.ts", [...base, `--texte-fichier=${texte}`]);
  const apresSimulation = banc.lire();
  const ecriture = executerOutil("contester.ts", [...base, `--texte-fichier=${texte}`, "--caviardage", "--ecrire"]);
  afterAll(() => banc.bac.detruire());

  it("un item absent de data/ ne se conteste pas", () => {
    expect(absent.status).toBe(1);
    expect(absent.erreur).toMatch(/Item absent de data/);
  });

  it("un texte de 1 001 caractères est refusé, rien n'est écrit", () => {
    expect(tropLong.status).toBe(1);
    expect(tropLong.erreur).toMatch(/1001 caractères/);
    expect(apresTropLong.statut_contestation).toBe("aucune");
  });

  it("simule par défaut", () => {
    expect(simulation.status, simulation.erreur).toBe(0);
    expect(apresSimulation.statut_contestation).toBe("aucune");
  });

  it("--ecrire place l'item en « contestee », texte tel quel (sans le saut de ligne du fichier), caviardage publié", () => {
    expect(ecriture.status, ecriture.erreur).toBe(0);
    const item = banc.lire();
    expect(item.statut_contestation).toBe("contestee");
    expect(item.contestations?.[0]).toMatchObject({ texte: "La source dit 5 %, pas 5,5 %.", caviardage: true, contestataire_type: "campagne" });
    expect(contestationPermetLeTirage(item)).toBe(false);
    expect(ecriture.sortie).toMatch(/Rien n'est commité/);
  });
});

describe("pnpm panel", () => {
  const banc = preparer("72");
  const texte = banc.fichier("contestation.txt", "La citation est incomplète.\n");
  executerOutil("contester.ts", [...racine(banc), `--item=${banc.item.id}`, `--texte-fichier=${texte}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=parti", "--ecrire"]);
  commiterTout(banc.bac.racine, "contestation");
  const contestation_id = (banc.lire().contestations?.[0] as { id: string }).id;
  const motivation = banc.fichier("motivation.txt", "La citation complète figure dans la source.\n");
  const dissidence = banc.fichier("dissidence.txt", "Un membre aurait maintenu.\n");
  const horsSource = banc.fichier(
    "hors-source.json",
    JSON.stringify([{ cible: "item", chemin: "/assertion/citation_verbatim", ancienne_valeur: banc.item.assertion?.citation_verbatim, nouvelle_valeur: "Une phrase absente." }]),
  );
  const complete = banc.fichier(
    "complete.json",
    JSON.stringify([
      {
        cible: "item",
        chemin: "/assertion/citation_verbatim",
        ancienne_valeur: banc.item.assertion?.citation_verbatim,
        nouvelle_valeur: "Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.",
      },
    ]),
  );
  const base = [
    ...racine(banc),
    `--staging=${join(banc.bac.racine, "staging")}`,
    `--item=${banc.item.id}`,
    `--contestation=${contestation_id}`,
    "--decision=correction",
    `--motivation-fichier=${motivation}`,
    `--dissidence-fichier=${dissidence}`,
    "--arbitre-seul",
  ];
  const perimee = executerOutil("panel.ts", [...base, "--version-jugee=2", `--corrections=${complete}`, "--ecrire"]);
  const refusVerbatim = executerOutil("panel.ts", [...base, "--version-jugee=1", `--corrections=${horsSource}`, "--ecrire"]);
  const ecriture = executerOutil("panel.ts", [...base, "--version-jugee=1", `--corrections=${complete}`, "--ecrire"]);
  afterAll(() => banc.bac.detruire());

  it("une version jugée périmée est refusée", () => {
    expect(perimee.status).toBe(1);
    expect(perimee.erreur).toMatch(/version 2/);
  });

  it("une citation corrigée hors source est refusée (test verbatim sur le texte canonique)", () => {
    expect(refusVerbatim.status).toBe(1);
    expect(refusVerbatim.erreur).toMatch(/citation_hors_source/);
  });

  it("--ecrire corrige, arbitre, publie motivation et dissidence, version + 1", () => {
    expect(ecriture.status, ecriture.erreur).toBe(0);
    const item = banc.lire();
    expect(item.statut_contestation).toBe("arbitree");
    expect(item.version).toBe(banc.item.version + 1);
    expect(item.assertion?.citation_verbatim).toBe("Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.");
    expect(item.contestations?.[0]).toMatchObject({
      decision_panel: { decision: "correction", motivation: "La citation complète figure dans la source.", opinions_dissidentes: ["Un membre aurait maintenu."], arbitre_seul: true },
    });
    expect(contestationPermetLeTirage(item)).toBe(true);
  });
});

describe("constat 20 (revue du 2026-10-17), 32 (revue du 2026-10-12) : un bogue remonte avec sa pile", () => {
  it("pnpm contester --sources avec un JSON illisible : SyntaxError non attrapée, pile imprimée, rien écrit", () => {
    const banc = preparer("74");
    const texte = banc.fichier("contestation.txt", "La source dit 5 %, pas 5,5 %.\n");
    const sourcesCassees = banc.fichier("sources.json", "{ pas du json");
    const avant = banc.lire();
    const resultat = executerOutil("contester.ts", [
      ...racine(banc),
      `--item=${banc.item.id}`,
      `--texte-fichier=${texte}`,
      "--recu-le=2026-10-01T09:00:00+02:00",
      "--type=campagne",
      `--sources=${sourcesCassees}`,
    ]);
    expect(resultat.status).not.toBe(0);
    expect(resultat.erreur).toContain("SyntaxError");
    expect(resultat.erreur).toMatch(/\n\s+at /);
    expect(banc.lire()).toEqual(avant);
  });

  it("pnpm panel --corrections avec un JSON illisible : SyntaxError non attrapée, pile imprimée, rien écrit", () => {
    const banc = preparer("75");
    const texte = banc.fichier("contestation.txt", "La citation est incomplète.\n");
    executerOutil("contester.ts", [...racine(banc), `--item=${banc.item.id}`, `--texte-fichier=${texte}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=parti", "--ecrire"]);
    commiterTout(banc.bac.racine, "contestation");
    const avant = banc.lire();
    const contestation_id = (avant.contestations?.[0] as { id: string }).id;
    const motivation = banc.fichier("motivation.txt", "La citation complète figure dans la source.\n");
    const correctionsCassees = banc.fichier("corrections.json", "[ pas du json");
    const resultat = executerOutil("panel.ts", [
      ...racine(banc),
      `--staging=${join(banc.bac.racine, "staging")}`,
      `--item=${banc.item.id}`,
      `--contestation=${contestation_id}`,
      "--decision=correction",
      `--motivation-fichier=${motivation}`,
      "--version-jugee=1",
      `--corrections=${correctionsCassees}`,
      "--ecrire",
    ]);
    expect(resultat.status).not.toBe(0);
    expect(resultat.erreur).toContain("SyntaxError");
    expect(resultat.erreur).toMatch(/\n\s+at /);
    expect(banc.lire()).toEqual(avant);
  });
});

describe("état effectif : un item contesté après sa promotion", () => {
  const banc = preparer("73");
  const { bac, item } = banc;
  bac.ecrireLot(lotDe("lot-073", [{ ...item, statut_validation: "en_attente" }]));
  for (const annotateur_id of ["a1", "a2"]) {
    bac.journal(annotateur_id).ajouter("lot-073", decision({ annotateur_id, item, decision: "accepter", lot_id: "lot-073" }));
  }
  commiterTout(bac.racine, "lot");
  const texte = banc.fichier("contestation.txt", "Contestée après promotion.\n");
  const avant = diagnostiquerLot({
    lot: lotDe("lot-073", [item]),
    items: chargerItemsEffectifs(chargerStaging(join(bac.racine, "staging")).items, join(bac.racine, "data/items")),
    etats: etatsDuLot(join(bac.racine, "validation/decisions"), lotDe("lot-073", [item])),
    taille_attendue: 1,
  });
  executerOutil("contester.ts", [...racine(banc), `--item=${item.id}`, `--texte-fichier=${texte}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=media", "--ecrire"]);
  commiterTout(bac.racine, "contestation");
  const apres = diagnostiquerLot({
    lot: lotDe("lot-073", [item]),
    items: chargerItemsEffectifs(chargerStaging(join(bac.racine, "staging")).items, join(bac.racine, "data/items")),
    etats: etatsDuLot(join(bac.racine, "validation/decisions"), lotDe("lot-073", [item])),
    taille_attendue: 1,
  });
  const promotion = executerOutil("promote.ts", [
    ...racine(banc),
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--arbitrage=${join(bac.racine, "validation/arbitrage")}`,
  ]);
  const route = ROUTES.find((candidate) => candidate.nom === "item");
  afterAll(() => bac.detruire());

  it("le kappa du lot sort l'item du dénominateur, lu dans data/ et non dans staging/", () => {
    expect(avant.exclus_contestation).toBe(0);
    expect(apres.exclus_contestation).toBe(1);
  });

  it("pnpm promote le rapporte « en attente, item contesté »", () => {
    expect(promotion.status, promotion.erreur).toBe(0);
    expect(promotion.sortie).toMatch(/item_conteste : 1/);
  });

  it("l'écran d'annotation le retire du lot", () => {
    if (route === undefined) throw new Error("route item absente");
    const reponse = route.gestionnaire(bac.contexte("a1"), ["lot-073", item.id], undefined);
    expect(reponse.statut).toBe(409);
  });
});
