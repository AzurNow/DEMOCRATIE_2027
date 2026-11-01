/**
 * Exécution de la reformulation, adaptateur Mistral réel sur un transport factice : une proposition
 * par réponse HTTP reçue, conforme au schéma, corps stocké tel quel (règle 7), issue nommée.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurReseau } from "../../pipeline/interrogation/editeur.ts";
import { adaptateurMistral } from "../../pipeline/reformulation/editeur-mistral.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import { tachesDe } from "../../pipeline/reformulation/entrees.ts";
import { executer } from "../../pipeline/reformulation/executer.ts";
import type { Bilan, ContexteExecution } from "../../pipeline/reformulation/executer.ts";
import { chargerPromptReformulation, VERSION_PROMPT_REFORMULATION } from "../../pipeline/reformulation/prompt.ts";
import { lirePropositions, REPERTOIRE_OCTETS_RECUS } from "../../pipeline/reformulation/staging.ts";
import type { PropositionFormulation } from "../../pipeline/reformulation/staging.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import {
  CANDIDATS,
  CONFIGURATION,
  corpsChat,
  ITEMS,
  LIBELLE,
  MESURE_BUDGET,
  MESURE_JARDIN,
  reponse,
  sortieConforme,
  TransportFactice,
  TransportMuet,
  attenteAuTourSuivant,
  jamaisEcoulee,
  type Reponse,
} from "./aides.ts";

const TACHES = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
const TEXTE_PROMPT = chargerPromptReformulation();
const INSTANT = Date.parse("2026-11-02T09:15:00Z");

function tache(predicat: (tache: Tache) => boolean): Tache {
  const trouvee = TACHES.find(predicat);
  if (trouvee === undefined) throw new Error("tâche de test introuvable");
  return trouvee;
}

/** Q-NEG sur l'item P « contre » de demo-alpha. */
const NOMMEE = tache((t) => t.question.gabarit === "Q-NEG" && t.question.candidat_id === "demo-alpha");
/** Q-ATT de la mesure réelle « le budget » : aucun item principal. */
const ATTRIBUTION = tache((t) => t.question.gabarit === "Q-ATT" && t.question.grappe_id === MESURE_BUDGET.id);
/** Q-DIR sur l'item A de demo-beta : position AUCUNE. */
const SUR_A = tache((t) => t.question.gabarit === "Q-DIR" && t.question.candidat_id === "demo-beta");

const repertoires: string[] = [];
function staging(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reformuler-staging-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

interface Essai {
  readonly bilan: Bilan;
  readonly transport: TransportFactice;
  readonly propositions: readonly PropositionFormulation[];
  readonly signalements: readonly string[];
  readonly staging: string;
}

async function essayer(taches: readonly Tache[], repondre: (rang: number) => Reponse, plafond: number | null = null): Promise<Essai> {
  const repertoire = staging();
  let rang = 0;
  const transport = new TransportFactice(() => repondre(rang++));
  const signalements: string[] = [];
  const contexte: ContexteExecution = {
    editeur: { adaptateur: adaptateurMistral(CONFIGURATION, "cle-factice"), transport },
    texte_prompt: TEXTE_PROMPT,
    perimetre: CANDIDATS,
    staging: repertoire,
    plafond,
    maintenant: () => INSTANT,
    delai_abandon_ms: CONFIGURATION.delai_abandon_ms,
    attendre: jamaisEcoulee,
    signaler: (message) => signalements.push(message),
  };
  const bilan = await executer({ a_appeler: taches, deja_acceptees: 0, deja_validees: 0, en_attente_operateur: [] }, contexte);
  const propositions = taches.flatMap((une) => lirePropositions(repertoire, une.question.id));
  return { bilan, transport, propositions, signalements, staging: repertoire };
}

function seule(essai: Essai): PropositionFormulation {
  expect(essai.propositions).toHaveLength(1);
  const [proposition] = essai.propositions;
  if (proposition === undefined) throw new Error("aucune proposition");
  return proposition;
}

function octetsEnvoyes(essai: Essai): string {
  const [rendue] = essai.transport.rendues;
  if (rendue === undefined) throw new Error("aucune réponse rendue");
  return createHash("sha256").update(rendue.corps).digest("hex");
}

describe("cas limite 1 : réponse 200 acceptée", () => {
  it("fichier acceptee, conforme au schéma, brut identique au corps reçu", async () => {
    const corps = corpsChat(sortieConforme(NOMMEE.demande));
    const essai = await essayer([NOMMEE], () => reponse(200, corps));
    const proposition = seule(essai);
    expect(proposition.issue).toEqual({ statut: "acceptee", ...(JSON.parse(sortieConforme(NOMMEE.demande)) as object) });
    expect(proposition.appel).toMatchObject({ statut_http: 200, brut: JSON.parse(corps) as object });
    expect(proposition.appel.brut_octets_sha256).toBe(octetsEnvoyes(essai));
    expect(proposition.appel.brut_octets_sha256).toBe(createHash("sha256").update(corps, "utf8").digest("hex"));
    expect(essai.bilan).toMatchObject({ appels: 1, acceptees: 1, echecs_http: 0, echecs_transport: 0 });
  });

  it("le fichier porte son id pour nom et la question pour répertoire ; texte, empreinte, production", async () => {
    const essai = await essayer([NOMMEE], () => reponse(200, corpsChat(sortieConforme(NOMMEE.demande))));
    const proposition = seule(essai);
    expect(readdirSync(join(essai.staging, NOMMEE.question.id))).toEqual([`${proposition.id}.json`]);
    expect(proposition.texte_neutre).toBe(NOMMEE.question.texte_neutre);
    expect(proposition.empreinte_texte_neutre).toBe(sha256(NOMMEE.question.texte_neutre));
    expect(proposition.version_gabarits).toBe(NOMMEE.question.version_gabarits);
    expect(proposition.production).toEqual({ modele: CONFIGURATION.modele, version_prompt: VERSION_PROMPT_REFORMULATION });
    expect(proposition.appel.date).toBe("2026-11-02T10:15:00.000+01:00");
    expect(proposition.demande).toEqual({
      gabarit: "Q-NEG",
      type_item: "P",
      libelle_candidat: LIBELLE,
      formulation_mesure: "le budget",
      position_affirmee: "contre",
    });
  });
});

describe("cas limite 2 : réponse 200 dont le texte échoue au contrôle", () => {
  it("libellé recopié sans accent ⇒ rejetee libelle_candidat, corps conservé", async () => {
    const fautive = sortieConforme(NOMMEE.demande).replaceAll("Hélène", "Helene");
    const corps = corpsChat(fautive);
    const essai = await essayer([NOMMEE], () => reponse(200, corps));
    const proposition = seule(essai);
    expect(proposition.issue).toMatchObject({ statut: "rejetee", motif: "libelle_candidat" });
    expect(proposition.appel).toMatchObject({ brut: JSON.parse(corps) as object });
    expect(essai.bilan.rejetees).toEqual(new Map([["libelle_candidat", 1]]));
  });
});

describe("cas limite 3 : réponse 200 sans texte de modèle lisible", () => {
  it("sans choices ⇒ rejetee corps_illisible", async () => {
    const essai = await essayer([NOMMEE], () => reponse(200, JSON.stringify({ object: "chat.completion" })));
    expect(seule(essai).issue).toMatchObject({ statut: "rejetee", motif: "corps_illisible", detail: "corps.choices absent." });
  });

  it("content non textuel ⇒ rejetee corps_illisible", async () => {
    const essai = await essayer([NOMMEE], () => reponse(200, corpsChat([{ type: "text", text: "x" }])));
    expect(seule(essai).issue).toMatchObject({ statut: "rejetee", motif: "corps_illisible" });
  });

  it("corps 200 non JSON ⇒ rejetee corps_illisible, texte gardé dans brut_texte", async () => {
    const essai = await essayer([NOMMEE], () => reponse(200, "pas du JSON"));
    const proposition = seule(essai);
    expect(proposition.issue).toMatchObject({ statut: "rejetee", motif: "corps_illisible" });
    expect(proposition.appel).toMatchObject({ brut_texte: "pas du JSON" });
  });
});

describe("cas limite 4 : statut hors 2xx", () => {
  it("500 à corps JSON ⇒ echec_http, brut présent", async () => {
    const corps = JSON.stringify({ object: "error", message: "boom" });
    const essai = await essayer([NOMMEE], () => reponse(500, corps));
    const proposition = seule(essai);
    expect(proposition.issue).toEqual({ statut: "echec_http" });
    expect(proposition.appel).toMatchObject({ statut_http: 500, brut: { object: "error", message: "boom" } });
    expect(essai.bilan.echecs_http).toBe(1);
  });

  it("502 à corps HTML ⇒ echec_http, brut_texte exact", async () => {
    const corps = "<html><body>502 Bad Gateway</body></html>\n";
    const essai = await essayer([NOMMEE], () => reponse(502, corps));
    const proposition = seule(essai);
    expect(proposition.issue).toEqual({ statut: "echec_http" });
    expect(proposition.appel).toMatchObject({ statut_http: 502, brut_texte: corps });
    expect(proposition.appel.brut_octets_sha256).toBe(octetsEnvoyes(essai));
  });

  it("une réponse 2xx dont le contenu passerait le contrôle n'est pas contrôlée quand le statut est 4xx", async () => {
    const essai = await essayer([NOMMEE], () => reponse(429, corpsChat(sortieConforme(NOMMEE.demande))));
    expect(seule(essai).issue).toEqual({ statut: "echec_http" });
  });
});

describe("cas limite 5 : corps qui n'est pas de l'UTF-8 valide", () => {
  it("cause CorpsNonUtf8 consignée, aucune proposition : seuls les octets reçus et leur cause sont écrits (D55 (5))", async () => {
    const essai = await essayer([NOMMEE], () => reponse(200, new Uint8Array([0x7b, 0xff, 0x7d])));
    expect(readdirSync(essai.staging)).toEqual([REPERTOIRE_OCTETS_RECUS]);
    const gardes = join(essai.staging, REPERTOIRE_OCTETS_RECUS, NOMMEE.question.id);
    const noms = readdirSync(gardes).sort();
    expect(noms).toHaveLength(2);
    const cause = noms.find((nom) => nom.endsWith(".cause.txt"));
    if (cause === undefined) throw new Error("cause absente");
    expect(readFileSync(join(gardes, cause), "utf8")).toMatch(/^CorpsNonUtf8 : /);
    expect(essai.bilan.recues_non_stockees).toBe(1);
  });
});

describe("cas limite 6 : échec de transport", () => {
  it("aucun fichier, compté au bilan, signalé ; la question suivante est appelée", async () => {
    const essai = await essayer([NOMMEE, SUR_A], (rang) =>
      rang === 0 ? new ErreurReseau("connexion refusée") : reponse(200, corpsChat(sortieConforme(SUR_A.demande))),
    );
    expect(lirePropositions(essai.staging, NOMMEE.question.id)).toEqual([]);
    expect(essai.bilan).toMatchObject({ appels: 2, echecs_transport: 1, acceptees: 1 });
    expect(essai.signalements).toEqual([expect.stringContaining("connexion refusée")]);
  });
});

describe("dette du 2026-10-15, point 2 : délai d'abandon par appel", () => {
  function contexteAvec(
    transport: ContexteExecution["editeur"]["transport"],
    attendre: ContexteExecution["attendre"],
    delai_abandon_ms: number | null,
    signalements: string[],
  ): ContexteExecution {
    return {
      editeur: { adaptateur: adaptateurMistral(CONFIGURATION, "cle-factice"), transport },
      texte_prompt: TEXTE_PROMPT,
      perimetre: CANDIDATS,
      staging: staging(),
      plafond: null,
      maintenant: () => INSTANT,
      delai_abandon_ms,
      attendre,
      signaler: (message) => signalements.push(message),
    };
  }

  it("délai dépassé ⇒ envoi interrompu, compté échec de transport, signalé, aucun fichier écrit", async () => {
    const transport = new TransportMuet();
    const demandes: number[] = [];
    const signalements: string[] = [];
    const contexte = contexteAvec(transport, attenteAuTourSuivant(demandes), 1234, signalements);
    const bilan = await executer({ a_appeler: [NOMMEE], deja_acceptees: 0, deja_validees: 0, en_attente_operateur: [] }, contexte);
    expect(bilan).toMatchObject({ appels: 1, acceptees: 0, echecs_http: 0, echecs_transport: 1, ecrits: [] });
    expect(demandes).toEqual([1234]);
    expect(transport.interrompus).toBe(1);
    expect(readdirSync(contexte.staging)).toEqual([]);
    expect(signalements).toEqual([expect.stringMatching(new RegExp(`${NOMMEE.question.id}.*1234 ms.*Aucun fichier écrit`, "u"))]);
  });

  it("un appel abandonné n'arrête pas la commande : la question suivante est appelée et écrite", async () => {
    let rang = 0;
    const muet = new TransportMuet();
    const factice = new TransportFactice(() => reponse(200, corpsChat(sortieConforme(SUR_A.demande))));
    const transport: ContexteExecution["editeur"]["transport"] = {
      envoyer: (requete, signal) => (rang++ === 0 ? muet.envoyer(requete, signal) : factice.envoyer(requete)),
    };
    const contexte = contexteAvec(transport, attenteAuTourSuivant(), 1000, []);
    const bilan = await executer({ a_appeler: [NOMMEE, SUR_A], deja_acceptees: 0, deja_validees: 0, en_attente_operateur: [] }, contexte);
    expect(bilan).toMatchObject({ appels: 2, acceptees: 1, echecs_transport: 1 });
    expect(lirePropositions(contexte.staging, NOMMEE.question.id)).toEqual([]);
    expect(lirePropositions(contexte.staging, SUR_A.question.id)).toHaveLength(1);
  });

  it("réponse reçue avant le délai ⇒ écrite, et la minuterie est annulée", async () => {
    const signaux: AbortSignal[] = [];
    const attendre: ContexteExecution["attendre"] = (ms, signal) => {
      signaux.push(signal);
      return jamaisEcoulee(ms, signal);
    };
    const transport = new TransportFactice(() => reponse(200, corpsChat(sortieConforme(NOMMEE.demande))));
    const contexte = contexteAvec(transport, attendre, 1000, []);
    const bilan = await executer({ a_appeler: [NOMMEE], deja_acceptees: 0, deja_validees: 0, en_attente_operateur: [] }, contexte);
    expect(bilan).toMatchObject({ appels: 1, acceptees: 1, echecs_transport: 0 });
    expect(signaux).toHaveLength(1);
    expect(signaux[0]?.aborted).toBe(true);
  });

  it("sans délai (mode simulé seulement) ⇒ aucune minuterie posée", async () => {
    const demandes: number[] = [];
    const transport = new TransportFactice(() => reponse(200, corpsChat(sortieConforme(NOMMEE.demande))));
    const contexte = contexteAvec(transport, attenteAuTourSuivant(demandes), null, []);
    const bilan = await executer({ a_appeler: [NOMMEE], deja_acceptees: 0, deja_validees: 0, en_attente_operateur: [] }, contexte);
    expect(bilan).toMatchObject({ appels: 1, acceptees: 1 });
    expect(demandes).toEqual([]);
  });
});

describe("cas limite 10 : plafond atteint", () => {
  it("arrêt après le plafond, bilan juste, questions restantes non appelées", async () => {
    const taches = [NOMMEE, SUR_A, ATTRIBUTION];
    const essai = await essayer(taches, () => reponse(500, "{}"), 2);
    expect(essai.transport.envois).toHaveLength(2);
    expect(essai.bilan).toMatchObject({ appels: 2, echecs_http: 2, non_appelees_plafond: 1 });
    expect(lirePropositions(essai.staging, ATTRIBUTION.question.id)).toEqual([]);
  });

  it("un échec de transport compte dans le plafond", async () => {
    const essai = await essayer([NOMMEE, SUR_A], () => new ErreurReseau("coupé"), 1);
    expect(essai.bilan).toMatchObject({ appels: 1, echecs_transport: 1, non_appelees_plafond: 1 });
  });
});

describe("cas limite 12 : clé dupliquée dans la sortie du modèle", () => {
  it("la proposition est écrite rejetee, motif cle_dupliquee, corps conservé", async () => {
    const sortie = sortieConforme(NOMMEE.demande).replace('{"familier"', '{"familier": {"texte": "x"}, "familier"');
    const corps = corpsChat(sortie);
    const essai = await essayer([NOMMEE], () => reponse(200, corps));
    const proposition = seule(essai);
    expect(proposition.issue).toMatchObject({ statut: "rejetee", motif: "cle_dupliquee" });
    expect(proposition.appel).toMatchObject({ brut: JSON.parse(corps) as object });
  });
});

describe("cas limite 13 : demande stockée d'une Q-ATT et d'une question sans prémisse", () => {
  it("Q-ATT : libelle_candidat AUCUN, type_item AUCUN, position AUCUNE", async () => {
    const essai = await essayer([ATTRIBUTION], () => reponse(200, corpsChat(sortieConforme(ATTRIBUTION.demande))));
    const proposition = seule(essai);
    expect(proposition.demande).toMatchObject({ gabarit: "Q-ATT", type_item: "AUCUN", libelle_candidat: "AUCUN", position_affirmee: "AUCUNE" });
    expect(proposition.issue.statut).toBe("acceptee");
  });

  it("question sur un item A : position_affirmee AUCUNE, oriente sans position", async () => {
    const essai = await essayer([SUR_A], () => reponse(200, corpsChat(sortieConforme(SUR_A.demande))));
    const proposition = seule(essai);
    expect(proposition.demande).toMatchObject({ type_item: "A", position_affirmee: "AUCUNE" });
    expect(proposition.issue).toMatchObject({ statut: "acceptee", oriente: { texte: expect.any(String) as string } });
    expect(proposition.issue).not.toHaveProperty("oriente.position_affirmee");
  });

  it("le prompt envoyé porte AUCUN pour le libellé d'une Q-ATT", async () => {
    const essai = await essayer([ATTRIBUTION], () => reponse(500, "{}"));
    const [envoi] = essai.transport.envois;
    expect(JSON.stringify(envoi?.corps)).toContain("Nom du candidat, à recopier exactement : AUCUN");
  });
});
