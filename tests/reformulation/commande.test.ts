/**
 * La commande `pnpm reformuler` de bout en bout, sur une racine temporaire et un `fetch` factice :
 * refus avant tout appel, reprise, plafond, secret de la clé, déterminisme du mode simulé.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commandeReformuler } from "../../pipeline/reformulation/commande.ts";
import type { Dependances } from "../../pipeline/reformulation/commande.ts";
import { tachesDe } from "../../pipeline/reformulation/entrees.ts";
import { lirePropositions } from "../../pipeline/reformulation/staging.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import {
  attenteAuTourSuivant,
  CANDIDATS,
  CONFIGURATION,
  corpsChat,
  ecrireDonnees,
  formulationsValideesDeTest,
  instantane,
  ITEMS,
  jamaisEcoulee,
  ligneRefusDeTest,
  MESURE_BUDGET,
  MESURE_JARDIN,
  promu,
  racineDeTest,
} from "./aides.ts";
import { itemP } from "../questions/fabriques.ts";

/** Code de sortie documenté dans l'en-tête de `commande.ts` : bilan complet, mais des appels sans réponse. */
const CODE_ECHECS_APPEL = 2;
const DEPOT = resolve(import.meta.dirname, "../..");
const CLE = "cle-factice-9f8e7d6c5b4a";
const TACHES = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
const NOMBRE = TACHES.length;
const VISEE = ((): (typeof TACHES)[number] => {
  const [premiere] = TACHES;
  if (premiere === undefined) throw new Error("aucune tâche");
  return premiere;
})();

const repertoires: string[] = [];
function temporaire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reformuler-cmd-"));
  repertoires.push(chemin);
  return chemin;
}
function racine(options: Parameters<typeof racineDeTest>[0] = {}): string {
  const chemin = racineDeTest(options);
  repertoires.push(chemin);
  return chemin;
}
/** Un dépôt jetable, distinct du vrai dépôt : les tests d'acceptation des zones protégées y écrivent sans risque. */
function depotJetable(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reformuler-depot-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

/* ------------------------------------------------------------- fetch factice */

/** Lit dans le prompt rendu ce qu'une sortie conforme doit recopier. */
function ligneDuPrompt(prompt: string, debut: string): string {
  const ligne = prompt.split("\n").find((une) => une.startsWith(debut));
  if (ligne === undefined) throw new Error(`ligne « ${debut} » absente du prompt`);
  return ligne.slice(debut.length);
}

function sortieDepuisPrompt(prompt: string): string {
  const neutre = ligneDuPrompt(prompt, "- Texte neutre : ");
  const position = ligneDuPrompt(prompt, "- Position que la prémisse orientée doit affirmer : ");
  const oriente = position === "AUCUNE" ? { texte: `Franchement, ${neutre}` } : { texte: `Franchement, ${neutre}`, position_affirmee: position };
  return JSON.stringify({ familier: { texte: `Dis, ${neutre}` }, oriente });
}

type Repondeur = (prompt: string, rang: number) => Response | Error;

const accepter: Repondeur = (prompt) => new Response(corpsChat(sortieDepuisPrompt(prompt)), { status: 200 });
const echouer: Repondeur = () => new Response('{"object":"error"}', { status: 500 });

interface Execution {
  readonly code: number;
  readonly sortie: string;
  readonly envois: number;
}

async function lancer(
  argv: readonly string[],
  repondre: Repondeur = accepter,
  env: Record<string, string> = { MISTRAL_API_KEY: CLE },
  attendre: Dependances["attendre"] = jamaisEcoulee,
  depot: string = DEPOT,
): Promise<Execution> {
  let sortie = "";
  let envois = 0;
  const code = await commandeReformuler(argv, {
    env,
    envoi: (_url, init) => {
      const corps = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      const [message] = corps.messages;
      if (message === undefined) throw new Error("requête sans message");
      const reponse = repondre(message.content, envois++);
      return reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse);
    },
    maintenant: () => Date.parse("2026-11-02T09:15:00Z"),
    attendre,
    imprimer: (texte) => {
      sortie += texte;
    },
    temporaire,
    depot,
  });
  return { code, sortie, envois };
}

function reel(chemin: string, ...autres: string[]): readonly string[] {
  return [`--racine=${chemin}`, "--plafond=100", ...autres];
}

function propositionsDe(chemin: string): number {
  return TACHES.reduce((somme, tache) => somme + lirePropositions(join(chemin, "staging", "formulations"), tache.question.id).length, 0);
}

/* -------------------------------------------------------------- refus */

describe("cas limite 8 : configuration incomplète ⇒ refus avant tout appel", () => {
  it("valeur null ⇒ code 1, message nommant la clé, aucun appel", async () => {
    const chemin = racine({ configuration: { modele: "m", temperature: null, max_tokens: 10, random_seed: 1 } });
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/temperature : null/u);
  });

  it("clé manquante ou inconnue ⇒ code 1, message nommant la clé", async () => {
    const manquante = await lancer(reel(racine({ configuration: { modele: "m", temperature: 0, max_tokens: 10 } })));
    expect(manquante).toMatchObject({ code: 1, envois: 0 });
    expect(manquante.sortie).toMatch(/random_seed : absente/u);
    const inconnue = await lancer(reel(racine({ configuration: { modele: "m", temperature: 0, max_tokens: 10, random_seed: 1, top_k: 3 } })));
    expect(inconnue).toMatchObject({ code: 1, envois: 0 });
    expect(inconnue.sortie).toMatch(/top_k : clé inconnue/u);
  });
});

describe("cas limite 9 : mode réel sans clé ou sans plafond ; la clé n'est jamais écrite", () => {
  it("sans MISTRAL_API_KEY ⇒ code 1, aucun appel", async () => {
    const execution = await lancer(reel(racine()), accepter, {});
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/MISTRAL_API_KEY absente/u);
  });

  it("clé vide ⇒ code 1, aucun appel", async () => {
    expect(await lancer(reel(racine()), accepter, { MISTRAL_API_KEY: "" })).toMatchObject({ code: 1, envois: 0 });
  });

  it("sans --plafond ⇒ code 1, aucun appel", async () => {
    const execution = await lancer([`--racine=${racine()}`]);
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/--plafond=<n> est obligatoire/u);
  });

  it("plafond qui n'est pas un entier >= 1 ⇒ code 1", async () => {
    expect(await lancer([`--racine=${racine()}`, "--plafond=0"])).toMatchObject({ code: 1, envois: 0 });
    expect(await lancer([`--racine=${racine()}`, "--plafond=deux"])).toMatchObject({ code: 1, envois: 0 });
  });

  it("la clé factice n'apparaît dans aucun fichier écrit ni aucun message, même portée par une erreur", async () => {
    const chemin = racine();
    const execution = await lancer(reel(chemin), (prompt, rang) =>
      rang === 0 ? new TypeError(`échec imaginaire qui citerait Bearer ${CLE}`) : accepter(prompt, rang),
    );
    expect(execution.code).toBe(CODE_ECHECS_APPEL);
    expect(execution.sortie).not.toContain(CLE);
    expect(execution.sortie).toContain("[clé masquée]");
    for (const [fichier, contenu] of instantane(chemin)) expect(contenu, fichier).not.toContain(CLE);
  });
});

describe("cas limite 11 : data/items vide", () => {
  it("message clair, code non nul, aucun appel", async () => {
    const execution = await lancer(reel(racine({ items: [] })));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/aucun item validé/u);
  });

  it("périmètre sans candidat : message clair, code non nul, aucun appel", async () => {
    const execution = await lancer(reel(racine({ candidats: [] })));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/aucun candidat dans le périmètre/u);
  });
});

/* ------------------------------------------------------------- appels */

describe("mode réel sur fetch factice", () => {
  it("une proposition par question, bilan imprimé", async () => {
    const chemin = racine();
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 0, envois: NOMBRE });
    expect(propositionsDe(chemin)).toBe(NOMBRE);
    expect(execution.sortie).toContain(`Appels faits : ${NOMBRE} (plafond 100)`);
    expect(execution.sortie).toContain(`  acceptées : ${NOMBRE}`);
  });

  it("item P « sans_objet » : pnpm reformuler va au bout, code 0, ses orientées demandées sans prémisse (AUCUNE, §5, D54 (4))", async () => {
    const sansObjet = promu(itemP({ cle: "reformuler-p-sans-objet", candidat_id: "demo-alpha", mesure: MESURE_JARDIN, position: "sans_objet" }));
    const items = [...ITEMS, sansObjet];
    const taches = tachesDe({ items, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
    const surItem = taches.filter((tache) => tache.question.items.some((entree) => entree.role === "principal" && entree.reference.item_id === sansObjet.id));
    expect(surItem.length).toBeGreaterThan(0);
    const chemin = racine({ items });
    const positions: string[] = [];
    const execution = await lancer(reel(chemin), (prompt, rang) => {
      positions.push(ligneDuPrompt(prompt, "- Position que la prémisse orientée doit affirmer : "));
      return accepter(prompt, rang);
    });
    expect(execution).toMatchObject({ code: 0, envois: taches.length });
    expect(execution.sortie).toContain(`  acceptées : ${taches.length}`);
    for (const tache of surItem) expect(lirePropositions(join(chemin, "staging", "formulations"), tache.question.id)).toHaveLength(1);
    expect(positions.filter((position) => position === "AUCUNE").length).toBeGreaterThanOrEqual(surItem.length);
  });

  it("--question vise une seule question ; une question inconnue est refusée", async () => {
    const chemin = racine();
    const [premiere] = TACHES;
    if (premiere === undefined) throw new Error("aucune tâche");
    expect(await lancer(reel(chemin, `--question=${premiere.question.id}`))).toMatchObject({ code: 0, envois: 1 });
    const inconnue = await lancer(reel(chemin, "--question=q_inconnue"));
    expect(inconnue).toMatchObject({ code: 1, envois: 0 });
  });

  it("--sortie est refusé en mode réel", async () => {
    expect(await lancer(reel(racine(), `--sortie=${temporaire()}`))).toMatchObject({ code: 1, envois: 0 });
  });

  it("cas limite 10 : plafond atteint ⇒ bilan juste", async () => {
    const execution = await lancer([`--racine=${racine()}`, "--plafond=2"]);
    expect(execution).toMatchObject({ code: 0, envois: 2 });
    expect(execution.sortie).toContain(`Questions non appelées, plafond atteint : ${NOMBRE - 2}`);
  });

  it("rejets comptés par motif dans le bilan", async () => {
    const execution = await lancer(reel(racine()), () => new Response(corpsChat("```json\n{}\n```"), { status: 200 }));
    expect(execution.sortie).toContain(`  rejetées : ${NOMBRE} (bloc_de_code ${NOMBRE})`);
  });
});

/* ------------------------------------- code de sortie et délai d'abandon */

/** Un fetch qui ne répond jamais : il ne rejette qu'à l'interruption de son signal, comme fetch. */
function muet(_url: string, init: RequestInit): Promise<Response> {
  return new Promise<Response>((_resoudre, rejeter) => {
    init.signal?.addEventListener("abort", () => rejeter(new DOMException("This operation was aborted", "AbortError")), { once: true });
  });
}

describe("dette du 2026-10-15, point 2 : code de sortie et délai d'abandon", () => {
  it("tout reçu ⇒ code 0", async () => {
    expect(await lancer(reel(racine()))).toMatchObject({ code: 0, envois: NOMBRE });
  });

  it("un échec de transport ⇒ code non nul, bilan imprimé en entier", async () => {
    const execution = await lancer(reel(racine()), (prompt, rang) => (rang === 0 ? new TypeError("connexion refusée") : accepter(prompt, rang)));
    expect(execution.code).toBe(CODE_ECHECS_APPEL);
    expect(execution.sortie).toContain("  échecs de transport : 1");
    expect(execution.sortie).toContain(`  acceptées : ${NOMBRE - 1}`);
    expect(execution.sortie).toContain("Questions non appelées, plafond atteint : 0");
  });

  it("un échec HTTP ⇒ code non nul, bilan imprimé en entier", async () => {
    const execution = await lancer(reel(racine()), (prompt, rang) => (rang === 0 ? echouer(prompt, rang) : accepter(prompt, rang)));
    expect(execution.code).toBe(CODE_ECHECS_APPEL);
    expect(execution.sortie).toContain("  échecs HTTP : 1");
    expect(execution.sortie).toContain("Questions non appelées, plafond atteint : 0");
  });

  it("des rejets du contrôle seuls ⇒ code 0 : la réponse a été reçue et écrite", async () => {
    const execution = await lancer(reel(racine()), () => new Response(corpsChat("pas du json"), { status: 200 }));
    expect(execution.code).toBe(0);
  });

  it("délai dépassé ⇒ appel abandonné, compté échec de transport, aucun fichier, code non nul", async () => {
    const chemin = racine({ configuration: { ...CONFIGURATION, delai_abandon_ms: 1500 } });
    const demandes: number[] = [];
    let envois = 0;
    let sortie = "";
    const code = await commandeReformuler(reel(chemin, `--question=${VISEE.question.id}`), {
      env: { MISTRAL_API_KEY: CLE },
      envoi: (url, init) => {
        envois += 1;
        return muet(url, init);
      },
      maintenant: () => Date.parse("2026-11-02T09:15:00Z"),
      attendre: attenteAuTourSuivant(demandes),
      imprimer: (texte) => {
        sortie += texte;
      },
      temporaire,
      depot: DEPOT,
    });
    expect(code).toBe(CODE_ECHECS_APPEL);
    expect(envois).toBe(1);
    expect(demandes).toEqual([1500]);
    expect(propositionsDe(chemin)).toBe(0);
    expect(sortie).toMatch(/1500 ms/u);
    expect(sortie).toContain("  échecs de transport : 1");
  });

  it("délai d'abandon null ⇒ refus nommé, code 1, aucun appel", async () => {
    const execution = await lancer(reel(racine({ configuration: { ...CONFIGURATION, delai_abandon_ms: null } })));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/delai_abandon_ms : null/u);
  });

  it("mode simulé : sans délai ni configuration, même règle de sortie ; ses 500 simulés ⇒ code non nul", async () => {
    const demandes: number[] = [];
    const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${temporaire()}`], echouer, {}, attenteAuTourSuivant(demandes));
    expect(execution).toMatchObject({ code: CODE_ECHECS_APPEL, envois: 0 });
    expect(demandes).toEqual([]);
    expect(execution.sortie).toMatch(/  échecs HTTP : [1-9]/u);
  });
});

/* -------------------------------------------------------------- reprise */

describe("cas limite 7 : reprise", () => {
  it("acceptée sur le même texte neutre ⇒ pas d'appel ; fichiers inchangés", async () => {
    const chemin = racine();
    await lancer(reel(chemin));
    const avant = instantane(chemin);
    const seconde = await lancer(reel(chemin));
    expect(seconde).toMatchObject({ code: 0, envois: 0 });
    expect(seconde.sortie).toContain(`déjà acceptées ${NOMBRE}`);
    expect(instantane(chemin)).toEqual(avant);
  });

  it("acceptée sur un AUTRE texte neutre ⇒ nouvel appel, anciens fichiers intacts", async () => {
    const chemin = racine();
    await lancer(reel(chemin));
    const avant = instantane(chemin);
    const renomme = CANDIDATS.map((candidat) => (candidat.candidat_id === "demo-alpha" ? { ...candidat, libelle: "Hélène Durand-Aubry-Autre" } : candidat));
    ecrireDonnees(chemin, { candidats: renomme });
    const touchees = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: renomme }).filter(
      (tache) => tache.question.candidat_id === "demo-alpha",
    ).length;
    const seconde = await lancer(reel(chemin));
    expect(seconde).toMatchObject({ code: 0, envois: touchees });
    const apres = instantane(chemin);
    for (const [fichier, contenu] of avant) {
      if (!fichier.startsWith("config")) expect(apres.get(fichier), fichier).toBe(contenu);
    }
  });

  it("seulement des rejets ou des échecs ⇒ nouvel appel", async () => {
    const chemin = racine();
    await lancer(reel(chemin), echouer);
    const seconde = await lancer(reel(chemin));
    expect(seconde).toMatchObject({ code: 0, envois: NOMBRE });
    expect(propositionsDe(chemin)).toBe(2 * NOMBRE);
  });
});

describe("cas limites 15 à 17 : formulations validées et refus du relecteur", () => {

  function ecrireValidee(chemin: string, empreinte: string, position: string = VISEE.demande.position_affirmee): void {
    mkdirSync(join(chemin, "data", "formulations"), { recursive: true });
    writeFileSync(
      join(chemin, "data", "formulations", `${VISEE.question.id}.json`),
      JSON.stringify(formulationsValideesDeTest(VISEE.question.id, empreinte, position)),
    );
  }

  it("Q1 (a) : validée sur la même empreinte mais une position périmée (item corrigé) ⇒ rappelée", async () => {
    const chemin = racine();
    const perimee = VISEE.demande.position_affirmee === "contre" ? "pour" : "contre";
    ecrireValidee(chemin, sha256(VISEE.question.texte_neutre), perimee);
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 0, envois: NOMBRE });
    expect(execution.sortie).not.toContain("déjà validées 1");
  });

  it("15 : déjà dans data/formulations avec la même empreinte ⇒ pas d'appel, compté « déjà validée »", async () => {
    const chemin = racine();
    ecrireValidee(chemin, sha256(VISEE.question.texte_neutre));
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 0, envois: NOMBRE - 1 });
    expect(execution.sortie).toContain("déjà validées 1");
  });

  it("15 : dans data/formulations avec une autre empreinte ⇒ appel", async () => {
    const chemin = racine();
    ecrireValidee(chemin, "0".repeat(64));
    expect(await lancer(reel(chemin))).toMatchObject({ code: 0, envois: NOMBRE });
  });

  it("15 : data/formulations illisible ⇒ erreur nommée, aucun appel", async () => {
    const chemin = racine();
    mkdirSync(join(chemin, "data", "formulations"), { recursive: true });
    writeFileSync(join(chemin, "data", "formulations", `${VISEE.question.id}.json`), "{");
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/formulations validées illisibles/u);
  });

  it("16 : acceptée puis refusée à la relecture ⇒ nouvel appel", async () => {
    const chemin = racine();
    await lancer(reel(chemin, `--question=${VISEE.question.id}`));
    const [acceptee] = lirePropositions(join(chemin, "staging", "formulations"), VISEE.question.id);
    if (acceptee === undefined) throw new Error("aucune proposition");
    mkdirSync(join(chemin, "validation", "formulations"), { recursive: true });
    writeFileSync(join(chemin, "validation", "formulations", "refus.jsonl"), `${ligneRefusDeTest(acceptee.id, VISEE.question.id)}\n`);
    expect(await lancer(reel(chemin, `--question=${VISEE.question.id}`))).toMatchObject({ code: 0, envois: 1 });
  });

  it("17 : refus.jsonl dont une ligne est illisible ⇒ erreur nommée avant tout appel", async () => {
    const chemin = racine();
    mkdirSync(join(chemin, "validation", "formulations"), { recursive: true });
    writeFileSync(join(chemin, "validation", "formulations", "refus.jsonl"), "pas du json\n");
    const execution = await lancer(reel(chemin));
    expect(execution).toMatchObject({ code: 1, envois: 0 });
    expect(execution.sortie).toMatch(/refus\.jsonl, ligne 1 : journal des refus illisible/u);
  });
});

/* ---------------------------------------------------------------- simulé */

function sansIdNiDate(chemin: string): readonly string[] {
  return TACHES.flatMap((tache) =>
    lirePropositions(chemin, tache.question.id).map((proposition) => {
      const { id: _id, appel, ...reste } = proposition;
      const { date: _date, ...appelSansDate } = appel;
      return JSON.stringify({ ...reste, appel: appelSansDate });
    }),
  );
}

/**
 * L'éditeur simulé rend un 500 pour une partie des questions (`choixParEmpreinte`) : sur ces données,
 * la commande va au bout et sort avec `CODE_ECHECS_APPEL`, comme en mode réel (dette du 2026-10-15,
 * point 2).
 */
describe("mode simulé", () => {
  it("cas limite 14 : deux exécutions identiques sur un staging vide ⇒ mêmes contenus hors id et date", async () => {
    const chemin = racine();
    const premiere = temporaire();
    const seconde = temporaire();
    expect(await lancer(["--simule", `--racine=${chemin}`, `--sortie=${premiere}`], echouer, {})).toMatchObject({ code: CODE_ECHECS_APPEL, envois: 0 });
    expect(await lancer(["--simule", `--racine=${chemin}`, `--sortie=${seconde}`], echouer, {})).toMatchObject({ code: CODE_ECHECS_APPEL });
    const contenus = sansIdNiDate(premiere);
    expect(contenus).toHaveLength(NOMBRE);
    expect(sansIdNiDate(seconde)).toEqual(contenus);
  });

  it("n'exige ni clé, ni plafond, ni configuration remplie, et n'appelle jamais fetch", async () => {
    const chemin = racine({ configuration: { modele: null } });
    const execution = await lancer(["--simule", `--racine=${chemin}`, `--sortie=${temporaire()}`], echouer, {});
    expect(execution).toMatchObject({ code: CODE_ECHECS_APPEL, envois: 0 });
    expect(execution.sortie).toContain("mode simulé");
  });

  it("refuse d'écrire sous le staging/ du dépôt", async () => {
    const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${join(DEPOT, "staging", "formulations")}`], echouer, {});
    expect(execution.code).toBe(1);
    expect(execution.sortie).toMatch(/jamais écrite/u);
  });

  it("sans --sortie : un répertoire temporaire neuf, hors du dépôt", async () => {
    const execution = await lancer(["--simule", `--racine=${racine()}`], echouer, {});
    expect(execution.code).toBe(CODE_ECHECS_APPEL);
    expect(execution.sortie).toContain("banc-reformuler-cmd-");
  });

  describe("constat 6 : gardes de sortie, data/ et runs/ aussi (pipeline/gardes-sortie.ts)", () => {
    it("refuse d'écrire sous data/ du dépôt", async () => {
      const depot = depotJetable();
      const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${join(depot, "data", "formulations")}`], echouer, {}, jamaisEcoulee, depot);
      expect(execution.code).toBe(1);
      expect(execution.sortie).toMatch(/jamais écrite/u);
    });

    it("refuse d'écrire sous runs/ du dépôt", async () => {
      const depot = depotJetable();
      const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${join(depot, "runs", "2026-10-17")}`], echouer, {}, jamaisEcoulee, depot);
      expect(execution.code).toBe(1);
      expect(execution.sortie).toMatch(/jamais écrite/u);
    });

    it("refuse le chemin de la zone protégée elle-même, sans sous-répertoire", async () => {
      const depot = depotJetable();
      const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${join(depot, "data")}`], echouer, {}, jamaisEcoulee, depot);
      expect(execution.code).toBe(1);
      expect(execution.sortie).toMatch(/jamais écrite/u);
    });

    it("refuse un lien symbolique posé hors du dépôt qui mène dans data/", async () => {
      const depot = depotJetable();
      mkdirSync(join(depot, "data"), { recursive: true });
      const lien = join(temporaire(), "raccourci-data");
      symlinkSync(join(depot, "data"), lien);
      const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${join(lien, "formulations")}`], echouer, {}, jamaisEcoulee, depot);
      expect(execution.code).toBe(1);
      expect(execution.sortie).toMatch(/jamais écrite/u);
    });

    it("accepte un répertoire voisin au nom préfixé (data-bis/), hors de la zone protégée", async () => {
      const depot = depotJetable();
      const chemin = racine();
      const sortie = join(depot, "data-bis");
      const execution = await lancer(["--simule", `--racine=${chemin}`, `--sortie=${sortie}`], echouer, {}, jamaisEcoulee, depot);
      expect(execution.code).toBe(CODE_ECHECS_APPEL);
      expect(sansIdNiDate(sortie)).toHaveLength(NOMBRE);
    });

    it("accepte une sortie temporaire hors du dépôt, même avec un dépôt jetable", async () => {
      const depot = depotJetable();
      const sortie = temporaire();
      const execution = await lancer(["--simule", `--racine=${racine()}`, `--sortie=${sortie}`], echouer, {}, jamaisEcoulee, depot);
      expect(execution.code).toBe(CODE_ECHECS_APPEL);
      expect(sansIdNiDate(sortie)).toHaveLength(NOMBRE);
    });
  });
});
