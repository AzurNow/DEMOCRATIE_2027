/**
 * `pnpm extraire` de bout en bout (PR 3 du lot extraction, décisions D52 et D53), sur une racine
 * temporaire, avec les éditeurs simulés ou un `fetch` factice. Cas limites 6 à 17 du brief, plus le
 * patch de Python différent entre `pnpm textes` et `pnpm extraction:entrees` (option A de D52 (4)).
 * Aucun réseau.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { erreurDeSchema, valider } from "../../outils/schemas/valider.ts";
import { CODE_PLAFOND_ATTEINT, CODE_SOURCES_NON_TRAITEES } from "../../pipeline/extraction/commande.ts";
import { transportSousDelai } from "../../pipeline/extraction/delai.ts";
import { MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL } from "../../pipeline/extraction/editeur-simule.ts";
import { cheminJournal, cheminReponse, type JournalExtraction, type ReponseGardee } from "../../pipeline/extraction/staging.ts";
import { ErreurReseau } from "../../pipeline/interrogation/editeur.ts";
import type { IssueAttente } from "../../pipeline/interrogation/horloge.ts";
import { chargerStaging } from "../../validation/io/staging.ts";
import { HTML, MODELE_A, MODELE_B, SHA_SOURCE } from "./aides.ts";
import {
  CLE,
  CLE_ANTHROPIC,
  CLE_MISTRAL,
  CLE_SOURCE,
  TEXTE,
  cheminsSous,
  compteurUlid,
  corpsAnthropic,
  corpsMistral,
  instantane,
  lancer,
  nettoyer,
  racineDeTest,
  repondreConforme,
  temporaire,
  type Repondeur,
} from "./aides-commande.ts";

afterEach(nettoyer);

function sha256(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

function reel(racine: string, ...autres: string[]): readonly string[] {
  return [`--racine=${racine}`, "--plafond=10", ...autres];
}

function simule(racine: string, sortie: string, ...autres: string[]): readonly string[] {
  return ["--simule", `--racine=${racine}`, `--sortie=${sortie}`, ...autres];
}

function journal(sortie: string): JournalExtraction {
  return JSON.parse(readFileSync(cheminJournal(sortie, CLE_SOURCE, SHA_SOURCE), "utf8")) as JournalExtraction;
}

function reponses(sortie: string): readonly ReponseGardee[] {
  return cheminsSous(sortie, "reponses-extraction/").map((chemin) => JSON.parse(readFileSync(join(sortie, chemin), "utf8")) as ReponseGardee);
}

const panne: (cible: "anthropic" | "mistral") => Repondeur = (cible) => (editeur) =>
  editeur === cible ? new ErreurReseau(`connexion refusée par ${editeur}`) : repondreConforme(editeur);

/* --------------------------------------------------------------- cas nominal */

describe("cas 6 : bout en bout conforme", () => {
  it("mode simulé : items et mesures déposés, conformes, relus par chargerStaging, journal en dernier", async () => {
    const racine = racineDeTest();
    const sortie = temporaire();
    const execution = await lancer(simule(racine, sortie));
    expect(execution.code).toBe(0);
    const staging = chargerStaging(sortie);
    expect(staging.items.size).toBe(1);
    expect(staging.mesures.size).toBe(1);
    const [item] = [...staging.items.values()];
    expect(item?.assertion?.extraction).toMatchObject({ accord: "accord", modeles: [MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL] });
    const lu = valider<JournalExtraction>("journal-extraction", journal(sortie), "journal");
    expect(lu.issue).toMatchObject({ statut: "extraite", items: [item?.id], rejets: [] });
    expect(lu.reponses.map((reponse) => reponse.modele)).toEqual([MODELE_SIMULE_ANTHROPIC, MODELE_SIMULE_MISTRAL]);
    expect(execution.sortie).toContain(`${CLE} : extraite, 1 item(s).`);
  });

  it("mode réel : Anthropic puis Mistral, l'ordre de la configuration, deux appels, items aux modèles épinglés", async () => {
    const racine = racineDeTest();
    const execution = await lancer(reel(racine));
    expect(execution.code).toBe(0);
    expect(execution.envois).toEqual(["anthropic", "mistral"]);
    const staging = chargerStaging(join(racine, "staging"));
    const [item] = [...staging.items.values()];
    expect(item?.assertion?.extraction).toMatchObject({ modeles: [MODELE_A, MODELE_B] });
    expect(journal(join(racine, "staging")).commit).toMatch(/^[0-9a-f]{40}$/u);
  });
});

/* ----------------------------------------------------------------- D53 (2) */

describe("cas 7 : une sortie illisible refuse la source", () => {
  for (const issue of ["http_500", "coupee", "bloc_de_code", "refus", "non_json"] as const) {
    it(`${issue} chez Anthropic ⇒ journal refusee, extraction_double_incomplete, aucun item, deux réponses gardées`, async () => {
      const racine = racineDeTest();
      const sortie = temporaire();
      const execution = await lancer(simule(racine, sortie), { issues: { anthropic: issue, mistral: "conforme" } });
      expect(execution.code).toBe(0);
      const lu = journal(sortie);
      expect(lu.issue.statut).toBe("refusee");
      expect(lu.issue.rejets.map((rejet) => rejet.portee)).toContain("source");
      expect(lu.issue.rejets.find((rejet) => rejet.portee === "source")?.motif).toBe("extraction_double_incomplete");
      expect(existsSync(join(sortie, "items"))).toBe(false);
      expect(existsSync(join(sortie, "mesures"))).toBe(false);
      expect(reponses(sortie)).toHaveLength(2);
    });
  }

  it("la raison réelle d'une lecture illisible est consignée à côté de la réponse", async () => {
    const racine = racineDeTest();
    const sortie = temporaire();
    await lancer(simule(racine, sortie), { issues: { anthropic: "conforme", mistral: "http_500" } });
    const [, mistral] = journal(sortie).reponses;
    expect(mistral).toMatchObject({ modele: MODELE_SIMULE_MISTRAL, statut_http: 500, lecture: { lisible: false } });
    expect(mistral?.lecture).toMatchObject({ raison: expect.stringContaining("HTTP 500") as unknown });
  });

  it("réponse HTTP 500 gardée ⇒ journal refusee validé, rejet lecture_illisible à la raison du journal, réponse gardée inchangée", async () => {
    const racine = racineDeTest();
    const sortie = temporaire();
    await lancer(simule(racine, sortie), { issues: { anthropic: "conforme", mistral: "http_500" } });
    const lu = valider<JournalExtraction>("journal-extraction", journal(sortie), "journal");
    const [, mistral] = lu.reponses;
    expect(mistral?.lecture.lisible).toBe(false);
    const raison = mistral?.lecture.lisible === false ? mistral.lecture.raison : null;
    expect(raison).toContain("HTTP 500");
    expect(lu.issue).toEqual({
      statut: "refusee",
      rejets: [
        { portee: "sortie", modele: MODELE_SIMULE_MISTRAL, motif: "lecture_illisible", detail: raison },
        expect.objectContaining({ portee: "source", motif: "extraction_double_incomplete" }) as unknown,
      ],
    });
    const corps = JSON.stringify({ object: "error", message: "Erreur interne simulée.", type: "internal_error", code: "simule_500" });
    const gardee = reponses(sortie).find((reponse) => reponse.modele === MODELE_SIMULE_MISTRAL);
    expect(gardee).toMatchObject({ statut_http: 500, brut: JSON.parse(corps) as unknown, brut_octets_sha256: sha256(corps) });
    expect(mistral?.brut_octets_sha256).toBe(sha256(corps));
  });

  it("schéma : lecture_illisible est un motif de portée sortie, jamais de portée item", async () => {
    const racine = racineDeTest();
    const sortie = temporaire();
    await lancer(simule(racine, sortie), { issues: { anthropic: "http_500", mistral: "conforme" } });
    const lu = journal(sortie);
    expect(lu.issue.rejets[0]).toMatchObject({ portee: "sortie", motif: "lecture_illisible" });
    expect(erreurDeSchema("journal-extraction", lu, "journal")).toBeNull();
    const [premier, ...suite] = lu.issue.rejets;
    const enItem = { ...lu, issue: { ...lu.issue, rejets: [{ ...premier, portee: "item", index: 0 }, ...suite] } };
    expect(erreurDeSchema("journal-extraction", enItem, "journal")).not.toBeNull();
  });

  it("mode réel : sortie coupée par max_tokens chez Mistral ⇒ source refusée", async () => {
    const racine = racineDeTest();
    const coupee: Repondeur = (editeur) =>
      editeur === "mistral" ? new Response(corpsMistral(sortieTronquee(), "length"), { status: 200 }) : repondreConforme(editeur);
    const execution = await lancer(reel(racine), { repondre: coupee });
    expect(execution.code).toBe(0);
    expect(journal(join(racine, "staging")).issue.statut).toBe("refusee");
  });
});

function sortieTronquee(): string {
  return '{"items": [{"type": "P"';
}

/* ------------------------------------------------------------------ reprise */

describe("cas 8 : échec de transport sur le second extracteur", () => {
  it("première réponse gardée, pas de journal ; la relance ne rappelle pas le premier", async () => {
    const racine = racineDeTest();
    const staging = join(racine, "staging");
    const premiere = await lancer(reel(racine), { repondre: panne("mistral") });
    expect(premiere.code).toBe(CODE_SOURCES_NON_TRAITEES);
    expect(premiere.envois).toEqual(["anthropic", "mistral"]);
    expect(reponses(staging).map((reponse) => reponse.modele)).toEqual([MODELE_A]);
    expect(existsSync(cheminJournal(staging, CLE_SOURCE, SHA_SOURCE))).toBe(false);
    expect(premiere.sortie).toContain("Source laissée à traiter.");

    const seconde = await lancer(reel(racine));
    expect(seconde.code).toBe(0);
    expect(seconde.envois).toEqual(["mistral"]);
    expect(seconde.sortie).toContain("réponses gardées réutilisées : 1");
    expect(journal(staging).issue.statut).toBe("extraite");
  });

  it("un délai dépassé est un échec de transport : rien n'est écrit pour l'appel abandonné", async () => {
    const racine = racineDeTest();
    const ecouleeTout = (_ms: number, _signal: AbortSignal): Promise<IssueAttente> => Promise.resolve("ecoulee");
    const enAttente: Repondeur = () => new Response(new ReadableStream(), { status: 200 });
    const execution = await lancer(reel(racine), { repondre: enAttente, attendre: ecouleeTout });
    expect(execution.code).toBe(CODE_SOURCES_NON_TRAITEES);
    expect(execution.sortie).toContain("au bout de 60000 ms");
    expect(reponses(join(racine, "staging"))).toEqual([]);
  });
});

describe("cas 9 : journal présent", () => {
  it("source sautée, zéro appel", async () => {
    const racine = racineDeTest();
    expect((await lancer(reel(racine))).code).toBe(0);
    const avant = instantane(join(racine, "staging"));
    const relance = await lancer(reel(racine));
    expect(relance.code).toBe(0);
    expect(relance.envois).toEqual([]);
    expect(relance.sortie).toContain(`${CLE} : journal présent, sautée.`);
    expect(instantane(join(racine, "staging"))).toEqual(avant);
  });

  it("une source refusée n'est pas relancée non plus", async () => {
    const racine = racineDeTest();
    const echec: Repondeur = (editeur) => (editeur === "anthropic" ? new Response("{}", { status: 500 }) : repondreConforme(editeur));
    await lancer(reel(racine), { repondre: echec });
    expect(journal(join(racine, "staging")).issue.statut).toBe("refusee");
    expect((await lancer(reel(racine))).envois).toEqual([]);
  });
});

describe("constat 3 : arrêt entre les items et le journal", () => {
  it("relance après le journal seul manquant : aucun item ni mesure dupliqué, mêmes identifiants, commande menée à terme", async () => {
    const racine = racineDeTest();
    const staging = join(racine, "staging");
    const ulid = compteurUlid();
    const premiere = await lancer(reel(racine), { nouvelUlid: ulid });
    expect(premiere.code).toBe(0);
    const itemsAvant = cheminsSous(staging, "items/");
    const mesuresAvant = cheminsSous(staging, "mesures/");
    expect(itemsAvant).toHaveLength(1);
    expect(mesuresAvant).toHaveLength(1);
    const avant = instantane(staging);

    // Simule un arrêt entre l'écriture des items et celle du journal : seul le journal manque,
    // comme si le processus avait été tué juste avant de l'écrire (constat 3).
    rmSync(cheminJournal(staging, CLE_SOURCE, SHA_SOURCE));

    // Le même compteur d'identifiants continue : sans la reprise, la relance tirerait de nouveaux
    // identifiants (comme `ulid()` en production) et déposerait un second item et une seconde mesure.
    const relance = await lancer(reel(racine), { nouvelUlid: ulid });
    expect(relance.code).toBe(0);
    expect(relance.envois).toEqual([]);
    expect(cheminsSous(staging, "items/")).toEqual(itemsAvant);
    expect(cheminsSous(staging, "mesures/")).toEqual(mesuresAvant);
    const apres = instantane(staging);
    expect(apres.get(itemsAvant[0] as string)).toBe(avant.get(itemsAvant[0] as string));
    expect(apres.get(mesuresAvant[0] as string)).toBe(avant.get(mesuresAvant[0] as string));
    expect(journal(staging).issue.statut).toBe("extraite");
    const staging_charge = chargerStaging(staging);
    expect(staging_charge.items.size).toBe(1);
    expect(staging_charge.mesures.size).toBe(1);
  });

  it("relance avec un compteur d'identifiants qui se réinitialise (ULID déterministes) : menée à terme, sans `DejaEcrit`", async () => {
    const racine = racineDeTest();
    const staging = join(racine, "staging");
    expect((await lancer(reel(racine))).code).toBe(0);
    rmSync(cheminJournal(staging, CLE_SOURCE, SHA_SOURCE));
    const relance = await lancer(reel(racine));
    expect(relance.code).toBe(0);
    expect(relance.sortie).not.toContain("DejaEcrit");
    expect(cheminsSous(staging, "items/")).toHaveLength(1);
  });
});

describe("cas 10 : plafond atteint au milieu d'une source", () => {
  it("arrêt, réponse déjà reçue gardée, pas de journal, code distinct", async () => {
    const racine = racineDeTest();
    const staging = join(racine, "staging");
    const execution = await lancer([`--racine=${racine}`, "--plafond=1"]);
    expect(execution.code).toBe(CODE_PLAFOND_ATTEINT);
    expect(execution.envois).toEqual(["anthropic"]);
    expect(reponses(staging).map((reponse) => reponse.modele)).toEqual([MODELE_A]);
    expect(existsSync(cheminJournal(staging, CLE_SOURCE, SHA_SOURCE))).toBe(false);
    expect(execution.sortie).toContain("Plafond atteint");
  });
});

/* -------------------------------------------------------------- incohérences */

async function incoherente(racine: string, attendu: RegExp): Promise<void> {
  const execution = await lancer(reel(racine));
  expect(execution.code).toBe(CODE_SOURCES_NON_TRAITEES);
  expect(execution.envois).toEqual([]);
  expect(execution.sortie).toMatch(attendu);
  expect(cheminsSous(join(racine, "staging"), "reponses-extraction/")).toEqual([]);
  expect(cheminsSous(join(racine, "staging"), "journal-extraction/")).toEqual([]);
  expect(cheminsSous(join(racine, "staging"), "items/")).toEqual([]);
}

describe("cas 11 : aucune ou plusieurs fiches de l'extracteur épinglé", () => {
  it("aucune fiche de l'épinglé ⇒ AucunTexteEpingle, rien d'écrit", async () => {
    await incoherente(racineDeTest({ epingle: { ...HTML, options: { regle: "blocs-2" } } }), /Aucune fiche d'extraction produite par l'extracteur épinglé/u);
  });

  it("deux fiches de l'épinglé ⇒ PlusieursTextesEpingles, rien d'écrit", async () => {
    await incoherente(racineDeTest({ fiches: [HTML, HTML] }), /2 fiches d'extraction produites par l'extracteur épinglé/u);
  });

  it("deux fiches dont une seule de l'épinglé ⇒ celle-là, et le bloc de son texte", async () => {
    const racine = racineDeTest({ fiches: [HTML, { ...HTML, version: "3.11.0" }] });
    const execution = await lancer(reel(racine));
    expect(execution.code).toBe(0);
    expect(journal(join(racine, "staging")).texte_sha256).toBe(sha256(TEXTE));
  });

  it("patch de Python différent entre pnpm textes et pnpm extraction:entrees ⇒ AucunTexteEpingle, jamais de repli", async () => {
    const racine = racineDeTest({ epingle: { ...HTML, version: "3.12.8" } });
    await incoherente(racine, /AucunTexteEpingle|Aucune fiche d'extraction produite par l'extracteur épinglé .*3\.12\.8/u);
  });
});

describe("constat 4 : épinglage périmé après une montée de version de l'extracteur de texte", () => {
  it("une fiche plus récente d'un autre épinglage existe ⇒ EpinglageExtracteurPerime, rien d'écrit", async () => {
    const racine = racineDeTest({
      fiches: [HTML, { ...HTML, version: "3.11.0" }],
      dates_extraction: ["2026-10-01T09:00:00+02:00", "2026-10-10T09:00:00+02:00"],
    });
    await incoherente(racine, /EpinglageExtracteurPerime|n'est plus celui du code|a changé depuis que cette/u);
  });

  it("l'épinglage de l'entrée est celui de la fiche la plus récente ⇒ toujours accepté", async () => {
    const racine = racineDeTest({
      fiches: [{ ...HTML, version: "3.11.0" }, HTML],
      dates_extraction: ["2026-10-01T09:00:00+02:00", "2026-10-10T09:00:00+02:00"],
      epingle: HTML,
    });
    const execution = await lancer(reel(racine));
    expect(execution.code).toBe(0);
    expect(journal(join(racine, "staging")).issue.statut).toBe("extraite");
  });

  it("deux fiches de même date d'extraction (aucune montée de version) ⇒ toujours accepté", async () => {
    const racine = racineDeTest({ fiches: [HTML, { ...HTML, version: "3.11.0" }] });
    const execution = await lancer(reel(racine));
    expect(execution.code).toBe(0);
  });
});

describe("cas 12 : texte canonique altéré", () => {
  it("SHA-256 qui ne correspond plus ⇒ erreur nommée, rien d'écrit", async () => {
    await incoherente(racineDeTest({ texte_ecrit: "Un texte retouché à la main." }), /Texte canonique altéré/u);
  });
});

describe("cas 13 : réponse gardée pour un autre prompt rendu", () => {
  it("n'est pas réutilisée : les deux extracteurs sont appelés", async () => {
    const racine = racineDeTest();
    const staging = join(racine, "staging");
    const ancienne: ReponseGardee = {
      cle_source: CLE_SOURCE,
      sha256_source: SHA_SOURCE,
      modele: MODELE_A,
      version_prompt: "prompts/extraction-1.0.0",
      prompt_sha256: "0".repeat(64),
      date: "2026-10-15T10:00:00+02:00",
      statut_http: 200,
      brut_octets_sha256: "1".repeat(64),
      brut: JSON.parse(corpsAnthropic(JSON.stringify({ items: [] }))) as Record<string, never>,
    };
    const chemin = cheminReponse(staging, ancienne);
    mkdirSync(join(chemin, ".."), { recursive: true });
    writeFileSync(chemin, JSON.stringify(ancienne));
    const execution = await lancer(reel(racine));
    expect(execution.envois).toEqual(["anthropic", "mistral"]);
    expect(execution.sortie).toContain("réponses gardées réutilisées : 0");
    expect(reponses(staging)).toHaveLength(3);
  });

  it("une réponse gardée dont le contenu contredit son nom arrête la commande", async () => {
    const racine = racineDeTest();
    const staging = join(racine, "staging");
    await lancer([`--racine=${racine}`, "--plafond=1"]);
    const [gardee] = cheminsSous(staging, "reponses-extraction/");
    if (gardee === undefined) throw new Error("aucune réponse gardée");
    const contenu = JSON.parse(readFileSync(join(staging, gardee), "utf8")) as ReponseGardee;
    writeFileSync(join(staging, gardee), JSON.stringify({ ...contenu, modele: "un-autre-modele" }));
    const execution = await lancer(reel(racine));
    expect(execution.code).toBe(1);
    expect(execution.sortie).toContain("porte modele « un-autre-modele »");
  });
});

/* -------------------------------------------------------- refus de partir */

describe("cas 14 : mode réel, refus avant tout appel", () => {
  it("config/extraction.json du dépôt, à remplir par l'auteur ⇒ refus nommé", async () => {
    const racine = racineDeTest();
    writeFileSync(join(racine, "config", "extraction.json"), readFileSync(join(import.meta.dirname, "../../config/extraction.json")));
    const execution = await lancer(reel(racine));
    expect(execution.code).toBe(1);
    expect(execution.envois).toEqual([]);
    expect(execution.sortie).toContain("extracteurs[0].modele : null, à remplir par l'auteur");
  });

  it("clé d'API absente ⇒ refus ; la clé présente n'apparaît dans aucun message", async () => {
    const racine = racineDeTest();
    const execution = await lancer(reel(racine), { env: { ANTHROPIC_API_KEY: CLE_ANTHROPIC } });
    expect(execution.code).toBe(1);
    expect(execution.envois).toEqual([]);
    expect(execution.sortie).toContain("MISTRAL_API_KEY absente de l'environnement");
    expect(execution.sortie).not.toContain(CLE_ANTHROPIC);
  });

  it("une erreur qui contiendrait une clé est imprimée masquée", async () => {
    const racine = racineDeTest();
    const bavard: Repondeur = (editeur) => new ErreurReseau(`échec avec ${editeur === "anthropic" ? CLE_ANTHROPIC : CLE_MISTRAL}`);
    const execution = await lancer(reel(racine), { repondre: bavard });
    expect(execution.sortie).not.toContain(CLE_ANTHROPIC);
    expect(execution.sortie).not.toContain(CLE_MISTRAL);
    expect(execution.sortie).toContain("[clé masquée]");
    expect(cheminsSous(join(racine, "staging"), "reponses-extraction/")).toEqual([]);
  });

  it("aucune clé n'est écrite dans un fichier", async () => {
    const racine = racineDeTest();
    await lancer(reel(racine));
    for (const contenu of instantane(join(racine, "staging")).values()) {
      expect(contenu).not.toContain(CLE_ANTHROPIC);
      expect(contenu).not.toContain(CLE_MISTRAL);
    }
  });

  it("--plafond absent, arbre sale, --sortie ou --source inconnue ⇒ refus avant tout appel", async () => {
    const racine = racineDeTest();
    const cas = [
      { argv: [`--racine=${racine}`], propre: true, attendu: "--plafond=<n> est obligatoire" },
      { argv: reel(racine), propre: false, attendu: "Arbre Git non propre hors de staging/" },
      { argv: reel(racine, `--sortie=${temporaire()}`), propre: true, attendu: "--sortie est réservé au mode simulé" },
      { argv: reel(racine, "--source=inconnue/0"), propre: true, attendu: "--source=inconnue/0 : aucune entrée" },
      { argv: reel(racine, "--plafond=0"), propre: true, attendu: "--plafond=0 : un entier >= 1" },
    ];
    for (const { argv, propre, attendu } of cas) {
      const execution = await lancer(argv, { propre });
      expect(execution.code).toBe(1);
      expect(execution.envois).toEqual([]);
      expect(execution.sortie).toContain(attendu);
    }
  });
});

/* ------------------------------------------------------------- mode simulé */

describe("cas 15 : mode simulé, rien sous le staging/ du dépôt", () => {
  it("sortie par défaut dans un répertoire temporaire ; le staging/ du dépôt reste identique", async () => {
    const racine = racineDeTest();
    const avant = instantane(join(racine, "staging"));
    const sortie = temporaire();
    const execution = await lancer(["--simule", `--racine=${racine}`], { depot: racine, temporaire: () => sortie });
    expect(execution.code).toBe(0);
    expect(instantane(join(racine, "staging"))).toEqual(avant);
    expect(journal(sortie).issue.statut).toBe("extraite");
    expect(execution.envois).toEqual([]);
  });

  it("--sortie sous le staging/ du dépôt ⇒ refus", async () => {
    const racine = racineDeTest();
    const execution = await lancer(simule(racine, join(racine, "staging", "essai")), { depot: racine });
    expect(execution.code).toBe(1);
    expect(execution.sortie).toContain("une sortie simulée n'y est jamais écrite");
  });
});

describe("constat 6 : gardes de sortie, data/ et runs/ aussi (pipeline/gardes-sortie.ts)", () => {
  it("--sortie sous data/ du dépôt ⇒ refus", async () => {
    const racine = racineDeTest();
    const execution = await lancer(simule(racine, join(racine, "data", "essai")), { depot: racine });
    expect(execution.code).toBe(1);
    expect(execution.sortie).toContain("une sortie simulée n'y est jamais écrite");
  });

  it("--sortie sous runs/ du dépôt ⇒ refus", async () => {
    const racine = racineDeTest();
    const execution = await lancer(simule(racine, join(racine, "runs", "2026-10-17")), { depot: racine });
    expect(execution.code).toBe(1);
    expect(execution.sortie).toContain("une sortie simulée n'y est jamais écrite");
  });

  it("--sortie égale à la zone protégée elle-même, sans sous-répertoire ⇒ refus", async () => {
    const racine = racineDeTest();
    const execution = await lancer(simule(racine, join(racine, "data")), { depot: racine });
    expect(execution.code).toBe(1);
    expect(execution.sortie).toContain("une sortie simulée n'y est jamais écrite");
  });

  it("un lien symbolique posé hors du dépôt qui mène dans data/ est refusé comme le chemin direct", async () => {
    const racine = racineDeTest();
    mkdirSync(join(racine, "data"), { recursive: true });
    const lien = join(temporaire(), "raccourci-data");
    symlinkSync(join(racine, "data"), lien);
    const execution = await lancer(simule(racine, join(lien, "essai")), { depot: racine });
    expect(execution.code).toBe(1);
    expect(execution.sortie).toContain("une sortie simulée n'y est jamais écrite");
  });

  it("un répertoire voisin au nom préfixé (data-bis/) est accepté", async () => {
    const racine = racineDeTest();
    const sortie = join(racine, "data-bis");
    const execution = await lancer(simule(racine, sortie), { depot: racine });
    expect(execution.code).toBe(0);
    expect(journal(sortie).issue.statut).toBe("extraite");
  });

  it("une sortie temporaire hors du dépôt est acceptée même avec --racine=<dépôt>", async () => {
    const racine = racineDeTest();
    const sortie = temporaire();
    const execution = await lancer(simule(racine, sortie), { depot: racine });
    expect(execution.code).toBe(0);
    expect(journal(sortie).issue.statut).toBe("extraite");
  });
});

describe("cas 16 : deux lancements simulés identiques", () => {
  it("mêmes entrées lues, même ordre, mêmes fichiers écrits", async () => {
    const racine = racineDeTest();
    const autre = join(racine, "staging", "entrees-extraction", "a".repeat(64));
    mkdirSync(autre, { recursive: true });
    writeFileSync(join(autre, `${SHA_SOURCE}.json`), readFileSync(join(racine, "staging", "entrees-extraction", CLE_SOURCE, `${SHA_SOURCE}.json`), "utf8").replace(CLE_SOURCE, "a".repeat(64)));
    const [premiere, seconde] = [temporaire(), temporaire()];
    const a = await lancer(simule(racine, premiere));
    const b = await lancer(simule(racine, seconde));
    expect(a.sortie.replace(premiere, "<sortie>")).toBe(b.sortie.replace(seconde, "<sortie>"));
    expect(a.sortie.indexOf(`${"a".repeat(64)}/`)).toBeLessThan(a.sortie.indexOf(`${CLE_SOURCE}/`));
    expect(instantane(premiere)).toEqual(instantane(seconde));
  });
});

describe("cas 17 : corps non JSON gardé en brut_texte", () => {
  it("octet pour octet, empreinte des octets reçus", async () => {
    const racine = racineDeTest();
    const corps = "<html><body>Passerelle indisponible — réessayez.</body></html>\r\n";
    const html: Repondeur = (editeur) => (editeur === "mistral" ? new Response(corps, { status: 502 }) : repondreConforme(editeur));
    await lancer(reel(racine), { repondre: html });
    const mistral = reponses(join(racine, "staging")).find((reponse) => reponse.modele === MODELE_B);
    expect(mistral).toMatchObject({ statut_http: 502, brut_texte: corps });
    expect(mistral?.brut_octets_sha256).toBe(sha256(corps));
  });
});

/* ------------------------------------------------------------------- délai */

describe("transportSousDelai", () => {
  it("la réponse arrivée avant la minuterie passe telle quelle ; un rejet du transport est relayé", async () => {
    const reponse = { statut: 200, corps: new Uint8Array([1, 2]) };
    const vite = transportSousDelai({ envoyer: () => Promise.resolve(reponse) }, 10, (_ms, signal) => new Promise((r) => signal.addEventListener("abort", () => r("annulee"))));
    expect(await vite.envoyer({ endpoint: "x", entetes: {}, corps: {} }, new AbortController().signal)).toBe(reponse);
    const casse = transportSousDelai({ envoyer: () => Promise.reject(new ErreurReseau("coupé")) }, 10, () => new Promise(() => undefined));
    await expect(casse.envoyer({ endpoint: "x", entetes: {}, corps: {} }, new AbortController().signal)).rejects.toThrow("coupé");
  });
});
