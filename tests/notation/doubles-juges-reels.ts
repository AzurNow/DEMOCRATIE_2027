/**
 * Doubles de transport pour les juges réels (`pipeline/notation/appel-juge.ts`) : aucun test ne
 * touche le réseau. `interdireLeReseau` remplace `fetch` global par un espion qui échoue et espionne
 * l'ouverture de toute socket TCP ; après chaque test, il exige que ni l'un ni l'autre n'ait servi.
 * Le seul chemin d'envoi est l'`envoi` injecté dans `transportFetch`, qui rend des `Response`
 * construites en mémoire.
 */

import net from "node:net";
import { afterEach, beforeEach, expect, vi, type MockInstance } from "vitest";
import type { Horloge } from "../../pipeline/interrogation/horloge.ts";
import type { Envoi } from "../../pipeline/reformulation/transport-fetch.ts";

export const CLE_DE_TEST = "cle-de-test-ne-doit-jamais-sortir";
export const DELAI_ABANDON_MS = 60_000;

export interface GardeReseau {
  readonly fetch_global: () => MockInstance;
  readonly connexions: () => MockInstance;
}

/** À appeler au niveau d'un `describe` (ou du fichier) : la garde vaut pour chaque test. */
export function interdireLeReseau(): GardeReseau {
  let fetchGlobal: MockInstance | undefined;
  let connexions: MockInstance | undefined;
  beforeEach(() => {
    const espion = vi.fn(() => {
      throw new Error("fetch global appelé dans un test : aucun test ne doit toucher le réseau.");
    });
    vi.stubGlobal("fetch", espion);
    fetchGlobal = espion;
    connexions = vi.spyOn(net.Socket.prototype, "connect");
  });
  afterEach(() => {
    expect(fetchGlobal?.mock.calls.length, "fetch global appelé").toBe(0);
    expect(connexions?.mock.calls.length, "socket ouverte").toBe(0);
    connexions?.mockRestore();
    vi.unstubAllGlobals();
  });
  return {
    fetch_global: () => {
      if (fetchGlobal === undefined) throw new Error("garde réseau non posée");
      return fetchGlobal;
    },
    connexions: () => {
      if (connexions === undefined) throw new Error("garde réseau non posée");
      return connexions;
    },
  };
}

/** Une réponse doublée ; elle reçoit l'`init` de l'envoi (son signal d'abandon). */
export type ReponseDoublee = (init: RequestInit) => Promise<Response>;

export interface EnvoiEnregistre {
  readonly url: string;
  readonly entetes: Readonly<Record<string, string>>;
  readonly corps: Readonly<Record<string, unknown>>;
}

/** Un envoi doublé qui rend, dans l'ordre, les réponses fournies (la dernière se répète) et enregistre chaque envoi. */
export function envoiDouble(reponses: readonly ReponseDoublee[]): { readonly envoi: Envoi; readonly envois: EnvoiEnregistre[] } {
  const envois: EnvoiEnregistre[] = [];
  const envoi: Envoi = (url, init) => {
    envois.push({ url, entetes: init.headers as Record<string, string>, corps: JSON.parse(init.body as string) as Record<string, unknown> });
    const fabrique = reponses[Math.min(envois.length - 1, reponses.length - 1)];
    if (fabrique === undefined) throw new Error("aucune réponse doublée");
    return fabrique(init);
  };
  return { envoi, envois };
}

export function http(statut: number, corps: string | Uint8Array): ReponseDoublee {
  return () => Promise.resolve(new Response(corps, { status: statut }));
}

export function json(statut: number, valeur: unknown): ReponseDoublee {
  return http(statut, JSON.stringify(valeur));
}

/** Un envoi qui ne répond jamais : seul l'abandon (signal) le termine, en rejet. */
export function sansReponse(): ReponseDoublee {
  return (init) =>
    new Promise<Response>((_resoudre, rejeter) => {
      init.signal?.addEventListener("abort", () => rejeter(new DOMException("abandon", "AbortError")), { once: true });
    });
}

/** Une connexion refusée, telle que `fetch` la rejette. */
export function connexionRefusee(): ReponseDoublee {
  return () => Promise.reject(new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:443") }));
}

/** L'enveloppe 2xx de l'API Messages d'Anthropic. */
export function enveloppeAnthropic(texte: string, modele: string, surcharges: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return { id: "msg_test", type: "message", role: "assistant", model: modele, content: [{ type: "text", text: texte }], stop_reason: "end_turn", ...surcharges };
}

/** L'enveloppe 2xx de l'API de chat de Mistral. */
export function enveloppeMistral(texte: string, modele: string, surcharges: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return { id: "cmpl_test", object: "chat.completion", model: modele, choices: [{ index: 0, message: { role: "assistant", content: texte }, finish_reason: "stop" }], ...surcharges };
}

/**
 * L'attente injectée : la minuterie du délai d'abandon ne s'écoule pas (sauf `delai_ecoule`), elle
 * attend l'annulation ; une attente de reprise s'écoule tout de suite et est enregistrée.
 */
export function attenteDeTest(options: { readonly delai_ecoule: boolean } = { delai_ecoule: false }): { readonly attendre: Horloge["attendre"]; readonly reprises: number[] } {
  const reprises: number[] = [];
  const attendre: Horloge["attendre"] = (ms, signal) => {
    if (ms !== DELAI_ABANDON_MS) {
      reprises.push(ms);
      return Promise.resolve("ecoulee");
    }
    if (options.delai_ecoule) return Promise.resolve("ecoulee");
    return new Promise((resoudre) => {
      if (signal.aborted) resoudre("annulee");
      signal.addEventListener("abort", () => resoudre("annulee"), { once: true });
    });
  };
  return { attendre, reprises };
}
