/**
 * Réponse payée de reformulation, reçue mais non stockable (revue du 2026-10-17, constat 24 ;
 * D55 (5), « même règle pour la reformulation et l'extraction ») : les octets reçus sont gardés
 * tels quels avant toute interprétation ; un corps non UTF-8 ou une proposition hors schéma n'est
 * pas réparé, la proposition n'est pas écrite, l'événement est consigné, et la relance ne renvoie
 * pas la requête (pas de second paiement) : elle dit à l'opérateur quoi faire.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adaptateurMistral } from "../../pipeline/reformulation/editeur-mistral.ts";
import type { AdaptateurReformulation } from "../../pipeline/reformulation/editeur.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import { tachesDe } from "../../pipeline/reformulation/entrees.ts";
import { executer, trier } from "../../pipeline/reformulation/executer.ts";
import type { Bilan, ContexteExecution, EtatReprise } from "../../pipeline/reformulation/executer.ts";
import { chargerPromptReformulation } from "../../pipeline/reformulation/prompt.ts";
import { lirePropositions, recuesNonStockees, REPERTOIRE_OCTETS_RECUS, StagingFormulationsIllisible } from "../../pipeline/reformulation/staging.ts";
import {
  CANDIDATS,
  CONFIGURATION,
  corpsChat,
  ITEMS,
  MESURE_BUDGET,
  MESURE_JARDIN,
  reponse,
  sortieConforme,
  TransportFactice,
  jamaisEcoulee,
  type Reponse,
} from "./aides.ts";

const TACHES = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
const TEXTE_PROMPT = chargerPromptReformulation();
const INSTANT = Date.parse("2026-11-02T09:15:00Z");
const SANS_REPRISE: EtatReprise = { validee: () => null, refus: new Set() };

function tache(predicat: (tache: Tache) => boolean): Tache {
  const trouvee = TACHES.find(predicat);
  if (trouvee === undefined) throw new Error("tâche de test introuvable");
  return trouvee;
}

const NOMMEE = tache((t) => t.question.gabarit === "Q-NEG" && t.question.candidat_id === "demo-alpha");
const SUR_A = tache((t) => t.question.gabarit === "Q-DIR" && t.question.candidat_id === "demo-beta");

const NON_UTF8 = new Uint8Array([0x7b, 0xff, 0x7d]);

const repertoires: string[] = [];
function nouveauStaging(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reformuler-non-stockee-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

/** L'adaptateur Mistral, dont l'enveloppe se dit illisible sans raison : la proposition sort du schéma (`detail` vide). */
function adaptateurHorsSchema(): AdaptateurReformulation {
  const reel = adaptateurMistral(CONFIGURATION, "cle-factice");
  return { ...reel, texteDuModele: () => ({ lisible: false, raison: "" }) };
}

interface Passage {
  readonly bilan: Bilan;
  readonly transport: TransportFactice;
  readonly signalements: readonly string[];
}

async function passer(
  staging: string,
  taches: readonly Tache[],
  repondre: (rang: number) => Reponse,
  adaptateur: AdaptateurReformulation = adaptateurMistral(CONFIGURATION, "cle-factice"),
): Promise<Passage> {
  let rang = 0;
  const transport = new TransportFactice(() => repondre(rang++));
  const signalements: string[] = [];
  const contexte: ContexteExecution = {
    editeur: { adaptateur, transport },
    texte_prompt: TEXTE_PROMPT,
    perimetre: CANDIDATS,
    staging,
    plafond: null,
    maintenant: () => INSTANT,
    delai_abandon_ms: CONFIGURATION.delai_abandon_ms,
    attendre: jamaisEcoulee,
    signaler: (message) => signalements.push(message),
  };
  const bilan = await executer(trier(taches, staging, SANS_REPRISE), contexte);
  return { bilan, transport, signalements };
}

function octetsGardes(staging: string, question_id: string): readonly Uint8Array[] {
  const repertoire = join(staging, REPERTOIRE_OCTETS_RECUS, question_id);
  if (!existsSync(repertoire)) return [];
  return readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".octets"))
    .sort()
    .map((nom) => new Uint8Array(readFileSync(join(repertoire, nom))));
}

describe("corps non UTF-8 : octets gardés, rien d'autre écrit, relance sans nouvel appel", () => {
  it("le premier passage garde les octets tels quels, n'écrit aucune proposition et le signale", async () => {
    const staging = nouveauStaging();
    const premier = await passer(staging, [NOMMEE], () => reponse(200, NON_UTF8));
    expect(premier.transport.envois).toHaveLength(1);
    expect(octetsGardes(staging, NOMMEE.question.id)).toEqual([NON_UTF8]);
    expect(lirePropositions(staging, NOMMEE.question.id)).toEqual([]);
    expect(premier.bilan.recues_non_stockees).toBe(1);
    expect(premier.bilan.ecrits).toEqual([]);
    expect(premier.signalements.join("\n")).toMatch(/reçue et non stockée/);
    expect(premier.signalements.join("\n")).toMatch(/UTF-8/);
  });

  it("la relance ne renvoie pas la requête, compte la question en attente et dit quoi faire", async () => {
    const staging = nouveauStaging();
    await passer(staging, [NOMMEE], () => reponse(200, NON_UTF8));
    const relance = await passer(staging, [NOMMEE], () => reponse(200, corpsChat(sortieConforme(NOMMEE.demande))));
    expect(relance.transport.envois).toHaveLength(0);
    expect(relance.bilan.appels).toBe(0);
    expect(relance.bilan.en_attente_operateur).toBe(1);
    const message = relance.signalements.join("\n");
    expect(message).toMatch(new RegExp(NOMMEE.question.id));
    expect(message).toMatch(/opérateur/);
    expect(message).toMatch(/\.octets/);
    expect(lirePropositions(staging, NOMMEE.question.id)).toEqual([]);
  });

  it("la question suivante est appelée normalement dans le même passage", async () => {
    const staging = nouveauStaging();
    const passage = await passer(staging, [NOMMEE, SUR_A], (rang) =>
      rang === 0 ? reponse(200, NON_UTF8) : reponse(200, corpsChat(sortieConforme(SUR_A.demande))),
    );
    expect(passage.bilan.appels).toBe(2);
    expect(passage.bilan.recues_non_stockees).toBe(1);
    expect(passage.bilan.acceptees).toBe(1);
    expect(lirePropositions(staging, SUR_A.question.id)).toHaveLength(1);
  });
});

describe("proposition hors schéma : octets gardés, rien d'autre écrit, relance sans nouvel appel", () => {
  it("aucune proposition, octets identiques au corps reçu, relance sans appel", async () => {
    const staging = nouveauStaging();
    const corps = corpsChat(sortieConforme(NOMMEE.demande));
    const premier = await passer(staging, [NOMMEE], () => reponse(200, corps), adaptateurHorsSchema());
    expect(octetsGardes(staging, NOMMEE.question.id)).toEqual([new TextEncoder().encode(corps)]);
    expect(lirePropositions(staging, NOMMEE.question.id)).toEqual([]);
    expect(premier.bilan.recues_non_stockees).toBe(1);
    expect(premier.signalements.join("\n")).toMatch(/schéma/);
    const relance = await passer(staging, [NOMMEE], () => reponse(200, corps));
    expect(relance.transport.envois).toHaveLength(0);
    expect(relance.bilan.en_attente_operateur).toBe(1);
  });
});

describe("JSON invalide : le corps reste stockable tel quel, ses octets sont gardés aussi", () => {
  it("proposition rejetee corps_illisible écrite, octets gardés sous le même identifiant", async () => {
    const staging = nouveauStaging();
    const corps = "pas du JSON {";
    const passage = await passer(staging, [NOMMEE], () => reponse(200, corps));
    const [proposition] = lirePropositions(staging, NOMMEE.question.id);
    expect(proposition?.issue).toMatchObject({ statut: "rejetee", motif: "corps_illisible" });
    expect(octetsGardes(staging, NOMMEE.question.id)).toEqual([new TextEncoder().encode(corps)]);
    expect(existsSync(join(staging, REPERTOIRE_OCTETS_RECUS, NOMMEE.question.id, `${proposition?.id}.octets`))).toBe(true);
    expect(recuesNonStockees(staging, NOMMEE.question.id)).toEqual([]);
    expect(passage.bilan.recues_non_stockees).toBe(0);
  });
});

describe("arrêt après la garde des octets, avant la proposition", () => {
  it("des octets sans proposition du même identifiant bloquent la relance, sans nouvel appel", async () => {
    const staging = nouveauStaging();
    const repertoire = join(staging, REPERTOIRE_OCTETS_RECUS, NOMMEE.question.id);
    mkdirSync(repertoire, { recursive: true });
    writeFileSync(join(repertoire, "01JBXQ5V0000000000000000AA.octets"), "{}");
    const relance = await passer(staging, [NOMMEE], () => reponse(200, corpsChat(sortieConforme(NOMMEE.demande))));
    expect(relance.transport.envois).toHaveLength(0);
    expect(relance.bilan.en_attente_operateur).toBe(1);
  });

  it("un fichier étranger parmi les octets gardés est un refus nommé, jamais ignoré", () => {
    const staging = nouveauStaging();
    const repertoire = join(staging, REPERTOIRE_OCTETS_RECUS, NOMMEE.question.id);
    mkdirSync(repertoire, { recursive: true });
    writeFileSync(join(repertoire, "parasite.tmp"), "x");
    expect(() => recuesNonStockees(staging, NOMMEE.question.id)).toThrow(StagingFormulationsIllisible);
  });
});
